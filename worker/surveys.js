// ── Survey API ────────────────────────────────────────────────────
// Public (no auth):
//   GET    /api/surveys                    — list active surveys
//   GET    /api/surveys/s/:slug           — get survey by short slug
//   GET    /api/surveys/:id               — get survey metadata
//   POST   /api/surveys/:id/sessions      — start a session
//   POST   /api/surveys/:id/sessions/:sid/message — send message, get SSE stream
//   PATCH  /api/surveys/:id/sessions/:sid/complete — mark done
//
// Admin only:
//   GET    /api/admin/surveys             — list all surveys
//   POST   /api/admin/surveys             — create survey
//   PATCH  /api/admin/surveys/:id        — update survey
//   DELETE /api/admin/surveys/:id        — delete survey
//   GET    /api/admin/surveys/:id/sessions — list sessions + completion status
//   GET    /api/admin/surveys/:id/sessions/:sid — full transcript

import { getSession }             from './auth/session.js';
import { requireAdmin as _requireAdmin } from './admin.js';

const SURVEY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// ── Delimiter used to separate prose from structured opts ────────
// Claude / Llama outputs the message text, then this line, then JSON.
const OPTS_DELIMITER = '---SURVEY_OPTS---';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sse(stream) {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

// ── Slug helpers ─────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/-$/, '');
}

async function ensureUniqueSlug(db, base, excludeId = null) {
  let candidate = base || 'survey';
  let suffix = 0;
  while (true) {
    const slug = suffix === 0 ? candidate : `${candidate}-${suffix}`;
    const existing = await db
      .prepare('SELECT id FROM surveys WHERE slug = ?')
      .bind(slug)
      .first();
    if (!existing || existing.id === excludeId) return slug;
    suffix++;
  }
}

// Returns a 403 Response if not admin, otherwise null (matches admin.js pattern).
async function guardAdmin(request, env) {
  const session = await getSession(env.KV, request);
  return _requireAdmin(session, env);
}

// ── Public: list active surveys ───────────────────────────────────
export async function listSurveys(request, env) {
  const { results } = await env.varun_portfolio_auth
    .prepare('SELECT id, title, description, allow_retakes, created_at FROM surveys WHERE is_active = 1 ORDER BY created_at DESC')
    .all();
  return json({ surveys: results });
}

// ── Public: get one survey (metadata only, no system_prompt) ──────
export async function getSurvey(request, env, id) {
  const row = await env.varun_portfolio_auth
    .prepare('SELECT id, title, description, allow_retakes, slug FROM surveys WHERE id = ? AND is_active = 1')
    .bind(id)
    .first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json(row);
}

// ── Public: get survey by short slug ─────────────────────────────
export async function getSurveyBySlug(request, env, slug) {
  const row = await env.varun_portfolio_auth
    .prepare('SELECT id, title, description, allow_retakes, slug FROM surveys WHERE slug = ? AND is_active = 1')
    .bind(slug)
    .first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json(row);
}

// ── Public: start a session ───────────────────────────────────────
export async function createSession(request, env, surveyId) {
  const survey = await env.varun_portfolio_auth
    .prepare('SELECT id, allow_retakes FROM surveys WHERE id = ? AND is_active = 1')
    .bind(surveyId)
    .first();
  if (!survey) return json({ error: 'Survey not found' }, 404);

  const body = await request.json().catch(() => ({}));
  const respondentId = body.respondentId ?? null;

  // Gate retakes when disabled
  if (!survey.allow_retakes && respondentId) {
    const existing = await env.varun_portfolio_auth
      .prepare('SELECT id FROM survey_sessions WHERE survey_id = ? AND respondent_id = ? AND completed_at IS NOT NULL')
      .bind(surveyId, respondentId)
      .first();
    if (existing) return json({ error: 'already_completed' }, 409);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.varun_portfolio_auth
    .prepare('INSERT INTO survey_sessions (id, survey_id, respondent_id, started_at) VALUES (?, ?, ?, ?)')
    .bind(id, surveyId, respondentId, now)
    .run();

  return json({ sessionId: id });
}

// ── Streaming helpers (same as chat.js pattern) ───────────────────
async function streamWorkersAI(ai, model, systemPrompt, messages) {
  return ai.run(model, { messages: [{ role: 'system', content: systemPrompt }, ...messages], stream: true, max_tokens: 600 });
}

async function streamClaude(apiKey, model, systemPrompt, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: 600, system: systemPrompt, messages, stream: true }),
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  return response.body;
}

async function streamOpenRouter(apiKey, model, systemPrompt, messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://varunr.dev',
      'X-Title': "Varun's Portfolio",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
    }),
  });
  if (!response.ok) throw new Error(`OpenRouter error ${response.status}`);
  return response.body;
}

// Returns the safe emit length: how much of `text` can be sent without risking
// a partial delimiter appearing at the end.
function getSafeEmitLength(text, delimiter) {
  for (let len = Math.min(text.length, delimiter.length - 1); len > 0; len--) {
    if (text.endsWith(delimiter.slice(0, len))) return text.length - len;
  }
  return text.length;
}

function buildSurveyStream(upstreamStream, source, onFullText) {
  let fullText = '';
  let emittedLen = 0; // how many chars of fullText have been sent as delta events
  const decoder = new TextDecoder();
  let buffer = '';

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamStream.getReader();
      const enc = new TextEncoder();

      function emit(obj) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      // Split text at the delimiter: stream prose, hold back opts JSON
      function processText(text) {
        const delimIdx = text.indexOf(OPTS_DELIMITER);
        if (delimIdx === -1) return { prose: text, opts: null };
        const prose = text.slice(0, delimIdx).trimEnd();
        const optsRaw = text.slice(delimIdx + OPTS_DELIMITER.length).trim();
        let opts = null;
        try { opts = JSON.parse(optsRaw); } catch { /* malformed — treat as no opts */ }
        return { prose, opts };
      }

      function handleToken(token) {
        fullText += token;
        const delimIdx = fullText.indexOf(OPTS_DELIMITER);
        if (delimIdx !== -1) {
          // Delimiter found — flush any prose before it that hasn't been emitted yet
          if (emittedLen < delimIdx) {
            emit({ type: 'delta', text: fullText.slice(emittedLen, delimIdx) });
            emittedLen = delimIdx;
          }
          return;
        }
        // No delimiter yet — emit up to the point that can't be a partial delimiter prefix
        const safeLen = getSafeEmitLength(fullText, OPTS_DELIMITER);
        if (safeLen > emittedLen) {
          emit({ type: 'delta', text: fullText.slice(emittedLen, safeLen) });
          emittedLen = safeLen;
        }
      }

      async function handleDone() {
        const { prose, opts } = processText(fullText);
        await onFullText(prose);
        emit({ type: 'opts', opts: opts ?? { inputType: 'text', options: null, done: false } });
        emit({ type: 'done' });
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') { await handleDone(); continue; }

            let event;
            try { event = JSON.parse(raw); } catch { continue; }

            let token = '';
            if (source === 'workersai' && event.response) {
              token = event.response;
            } else if (source === 'openrouter') {
              token = event.choices?.[0]?.delta?.content ?? '';
            } else if (
              source === 'claude' &&
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              event.delta?.text
            ) {
              token = event.delta.text;
            } else if (source === 'claude' && event.type === 'message_stop') {
              await handleDone();
              continue;
            }

            if (token) handleToken(token);
          }
        }
      } catch (err) {
        emit({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });
}

// ── Public: send a message in a session (streaming) ───────────────
export async function sendMessage(request, env, surveyId, sessionId) {
  const survey = await env.varun_portfolio_auth
    .prepare('SELECT * FROM surveys WHERE id = ?')
    .bind(surveyId)
    .first();
  if (!survey) return json({ error: 'Survey not found' }, 404);

  const session = await env.varun_portfolio_auth
    .prepare('SELECT * FROM survey_sessions WHERE id = ? AND survey_id = ?')
    .bind(sessionId, surveyId)
    .first();
  if (!session) return json({ error: 'Session not found' }, 404);

  const body = await request.json().catch(() => ({}));
  const userText = (body.message ?? '').trim();

  const now = Date.now();
  const userMsgId = crypto.randomUUID();

  // Persist user message
  await env.varun_portfolio_auth
    .prepare('INSERT INTO survey_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userMsgId, sessionId, 'user', userText, now)
    .run();

  // Load history
  const { results: history } = await env.varun_portfolio_auth
    .prepare('SELECT role, content FROM survey_messages WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId)
    .all();

  const messages = history.map(r => ({ role: r.role === 'owl' ? 'assistant' : 'user', content: r.content }));

  const model = survey.model ?? SURVEY_MODEL;

  const onFullText = async (prose) => {
    const assistantMsgId = crypto.randomUUID();
    await env.varun_portfolio_auth
      .prepare('INSERT INTO survey_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(assistantMsgId, sessionId, 'owl', prose, Date.now())
      .run();
  };

  let upstreamStream;
  let source;
  try {
    if (model.startsWith('claude')) {
      source = 'claude';
      upstreamStream = await streamClaude(env.ANTHROPIC_API_KEY, model, survey.system_prompt, messages);
    } else if (model.startsWith('@cf/')) {
      source = 'workersai';
      upstreamStream = await streamWorkersAI(env.AI, model, survey.system_prompt, messages);
    } else {
      source = 'openrouter';
      upstreamStream = await streamOpenRouter(env.OPENROUTER_API_KEY, model, survey.system_prompt, messages);
    }
  } catch (err) {
    const enc = new TextEncoder();
    const errStream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'error', message: `Model error: ${err.message}` })}\n\n`));
        c.close();
      },
    });
    return sse(errStream);
  }

  return sse(buildSurveyStream(upstreamStream, source, onFullText));
}

// ── Public: complete a session ────────────────────────────────────
export async function completeSession(request, env, surveyId, sessionId) {
  await env.varun_portfolio_auth
    .prepare('UPDATE survey_sessions SET completed_at = ? WHERE id = ? AND survey_id = ?')
    .bind(Date.now(), sessionId, surveyId)
    .run();
  return json({ ok: true });
}

// ── Admin: list all surveys ───────────────────────────────────────
export async function adminListSurveys(request, env) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  const { results } = await env.varun_portfolio_auth
    .prepare(`
      SELECT s.*, COUNT(ss.id) AS session_count,
             SUM(CASE WHEN ss.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS completed_count
      FROM surveys s
      LEFT JOIN survey_sessions ss ON ss.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `)
    .all();
  return json({ surveys: results });
}

// ── Admin: create a survey ────────────────────────────────────────
export async function adminCreateSurvey(request, env) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const { title, description = '', system_prompt, model, allow_retakes = true, slug: rawSlug } = body;
  if (!title?.trim() || !system_prompt?.trim()) return json({ error: 'title and system_prompt required' }, 400);

  const db   = env.varun_portfolio_auth;
  const id   = crypto.randomUUID();
  const now  = Date.now();
  const base = rawSlug?.trim() ? slugify(rawSlug.trim()) : slugify(title.trim());
  const slug = await ensureUniqueSlug(db, base);

  await db
    .prepare('INSERT INTO surveys (id, title, description, system_prompt, model, is_active, allow_retakes, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)')
    .bind(id, title.trim(), description, system_prompt.trim(), model ?? SURVEY_MODEL, allow_retakes ? 1 : 0, slug, now, now)
    .run();

  return json({ id, slug });
}

// ── Admin: update a survey ────────────────────────────────────────
export async function adminUpdateSurvey(request, env, id) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const db = env.varun_portfolio_auth;
  const fields = [];
  const values = [];

  if (body.title !== undefined)         { fields.push('title = ?');         values.push(body.title.trim()); }
  if (body.description !== undefined)   { fields.push('description = ?');   values.push(body.description); }
  if (body.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(body.system_prompt.trim()); }
  if (body.model !== undefined)         { fields.push('model = ?');         values.push(body.model); }
  if (body.is_active !== undefined)     { fields.push('is_active = ?');     values.push(body.is_active ? 1 : 0); }
  if (body.allow_retakes !== undefined) { fields.push('allow_retakes = ?'); values.push(body.allow_retakes ? 1 : 0); }
  if (body.slug !== undefined) {
    const newSlug = await ensureUniqueSlug(db, slugify(body.slug.trim()), id);
    fields.push('slug = ?');
    values.push(newSlug);
  }

  if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);
  fields.push('updated_at = ?');
  values.push(Date.now(), id);

  await db
    .prepare(`UPDATE surveys SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

// ── Admin: delete a survey ────────────────────────────────────────
export async function adminDeleteSurvey(request, env, id) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  await env.varun_portfolio_auth.batch([
    env.varun_portfolio_auth.prepare('DELETE FROM survey_messages WHERE session_id IN (SELECT id FROM survey_sessions WHERE survey_id = ?)').bind(id),
    env.varun_portfolio_auth.prepare('DELETE FROM survey_sessions WHERE survey_id = ?').bind(id),
    env.varun_portfolio_auth.prepare('DELETE FROM surveys WHERE id = ?').bind(id),
  ]);

  return json({ ok: true });
}

// ── Admin: list sessions for a survey ────────────────────────────
export async function adminListSessions(request, env, surveyId) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  const { results } = await env.varun_portfolio_auth
    .prepare(`
      SELECT ss.id, ss.respondent_id, ss.started_at, ss.completed_at,
             COUNT(sm.id) AS message_count
      FROM survey_sessions ss
      LEFT JOIN survey_messages sm ON sm.session_id = ss.id
      WHERE ss.survey_id = ?
      GROUP BY ss.id
      ORDER BY ss.started_at DESC
    `)
    .bind(surveyId)
    .all();

  return json({ sessions: results });
}

// ── Admin: get full session transcript ────────────────────────────
export async function adminGetSession(request, env, surveyId, sessionId) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;

  const session = await env.varun_portfolio_auth
    .prepare('SELECT * FROM survey_sessions WHERE id = ? AND survey_id = ?')
    .bind(sessionId, surveyId)
    .first();
  if (!session) return json({ error: 'Not found' }, 404);

  const { results: messages } = await env.varun_portfolio_auth
    .prepare('SELECT role, content, created_at FROM survey_messages WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId)
    .all();

  return json({ session, messages });
}
