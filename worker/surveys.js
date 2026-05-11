// ── Survey API ────────────────────────────────────────────────────
// Public (no auth):
//   GET    /api/surveys                    — list active surveys
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

import { getSession } from './auth/session.js';

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

async function requireAdmin(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return null;
  const user = await env.varun_portfolio_auth
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.userId)
    .first();
  if (user?.role !== 'admin') return null;
  return session;
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
    .prepare('SELECT id, title, description, allow_retakes FROM surveys WHERE id = ? AND is_active = 1')
    .bind(id)
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

function buildSurveyStream(upstreamStream, source, onFullText) {
  let fullText = '';
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
            if (raw === '[DONE]') {
              const { prose, opts } = processText(fullText);
              await onFullText(prose);
              emit({ type: 'opts', opts: opts ?? { inputType: 'text', options: null, done: false } });
              emit({ type: 'done' });
              continue;
            }

            let event;
            try { event = JSON.parse(raw); } catch { continue; }

            let token = '';
            if (source === 'workersai' && event.response) {
              token = event.response;
            } else if (
              source === 'claude' &&
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta' &&
              event.delta?.text
            ) {
              token = event.delta.text;
            } else if (source === 'claude' && event.type === 'message_stop') {
              const { prose, opts } = processText(fullText);
              await onFullText(prose);
              emit({ type: 'opts', opts: opts ?? { inputType: 'text', options: null, done: false } });
              emit({ type: 'done' });
              continue;
            }

            if (token) {
              fullText += token;
              // Only stream tokens before the delimiter — hold the opts JSON back
              const delimIdx = fullText.indexOf(OPTS_DELIMITER);
              if (delimIdx === -1) {
                emit({ type: 'delta', text: token });
              }
              // Once we hit the delimiter, stop streaming prose — wait for done
            }
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
  const isClaudeModel = model.startsWith('claude');

  const onFullText = async (prose) => {
    const assistantMsgId = crypto.randomUUID();
    await env.varun_portfolio_auth
      .prepare('INSERT INTO survey_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(assistantMsgId, sessionId, 'owl', prose, Date.now())
      .run();
  };

  let upstreamStream;
  let source;
  if (isClaudeModel) {
    upstreamStream = await streamClaude(env.ANTHROPIC_API_KEY, model, survey.system_prompt, messages);
    source = 'claude';
  } else {
    upstreamStream = await streamWorkersAI(env.AI, model, survey.system_prompt, messages);
    source = 'workersai';
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
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

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
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const { title, description = '', system_prompt, model, allow_retakes = true } = body;
  if (!title?.trim() || !system_prompt?.trim()) return json({ error: 'title and system_prompt required' }, 400);

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.varun_portfolio_auth
    .prepare('INSERT INTO surveys (id, title, description, system_prompt, model, is_active, allow_retakes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)')
    .bind(id, title.trim(), description, system_prompt.trim(), model ?? SURVEY_MODEL, allow_retakes ? 1 : 0, now, now)
    .run();

  return json({ id });
}

// ── Admin: update a survey ────────────────────────────────────────
export async function adminUpdateSurvey(request, env, id) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const fields = [];
  const values = [];

  if (body.title !== undefined)         { fields.push('title = ?');         values.push(body.title.trim()); }
  if (body.description !== undefined)   { fields.push('description = ?');   values.push(body.description); }
  if (body.system_prompt !== undefined) { fields.push('system_prompt = ?'); values.push(body.system_prompt.trim()); }
  if (body.model !== undefined)         { fields.push('model = ?');         values.push(body.model); }
  if (body.is_active !== undefined)     { fields.push('is_active = ?');     values.push(body.is_active ? 1 : 0); }
  if (body.allow_retakes !== undefined) { fields.push('allow_retakes = ?'); values.push(body.allow_retakes ? 1 : 0); }

  if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);
  fields.push('updated_at = ?');
  values.push(Date.now(), id);

  await env.varun_portfolio_auth
    .prepare(`UPDATE surveys SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

// ── Admin: delete a survey ────────────────────────────────────────
export async function adminDeleteSurvey(request, env, id) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

  await env.varun_portfolio_auth.batch([
    env.varun_portfolio_auth.prepare('DELETE FROM survey_messages WHERE session_id IN (SELECT id FROM survey_sessions WHERE survey_id = ?)').bind(id),
    env.varun_portfolio_auth.prepare('DELETE FROM survey_sessions WHERE survey_id = ?').bind(id),
    env.varun_portfolio_auth.prepare('DELETE FROM surveys WHERE id = ?').bind(id),
  ]);

  return json({ ok: true });
}

// ── Admin: list sessions for a survey ────────────────────────────
export async function adminListSessions(request, env, surveyId) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

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
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: 'Forbidden' }, 403);

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
