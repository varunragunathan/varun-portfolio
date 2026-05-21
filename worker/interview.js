// ── Interview API ─────────────────────────────────────────────────
// Auth-gated: all endpoints require a valid session.
//
//   POST   /api/interview/sessions                 — create session, get opening message
//   POST   /api/interview/sessions/:id/message     — user turn → SSE stream
//   PATCH  /api/interview/sessions/:id/end         — finish session, store cost
//   GET    /api/interview/sessions                 — list user's past sessions
//   GET    /api/interview/sessions/:id             — full transcript

import { getSession } from './auth/session.js';

const INTERVIEW_MODEL = 'claude-haiku-4-5-20251001';

// Haiku pricing (per million tokens)
const PRICE_INPUT  = 0.80;
const PRICE_OUTPUT = 4.00;

export const THEMES = {
  'frontend':      'Frontend Engineering',
  'backend':       'Backend & Systems Engineering',
  'system-design': 'System Design',
  'behavioral':    'Behavioral & Leadership',
  'dsa':           'Data Structures & Algorithms',
  'fullstack':     'Full Stack Engineering',
  'product':       'Product Management',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sse(stream) {
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

function uid() {
  return crypto.randomUUID();
}

function systemPrompt(theme) {
  const label = THEMES[theme] || theme;
  return `You are Hooty, a warm but rigorous interviewer conducting a ${label} interview over the phone.

RULES — follow strictly:
- Ask ONE focused question per turn, never multiple questions
- Keep every response to 2–4 short spoken sentences — this is voice, not text
- After the candidate answers, give a brief natural reaction (one sentence), then ask the next question
- Adapt difficulty based on the quality of their answer
- Use plain conversational speech only — no markdown, bullets, headers, lists, or code blocks
- Do not mention being an AI or break the interviewer persona
- If the candidate asks you to repeat, simply restate the last question
- Progress naturally through different aspects of the theme over the conversation

OPENING: Introduce yourself as Hooty in one warm sentence, say the interview topic, and ask your first question.`;
}

async function guardAuth(request, env) {
  const session = await getSession(env.KV, request);
  if (!session?.userId) return json({ error: 'Unauthorized' }, 401);
  return session;
}

// ── Create session + stream opening message ───────────────────────
export async function createInterviewSession(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const body = await request.json().catch(() => ({}));
  const theme    = THEMES[body.theme] ? body.theme : 'frontend';
  const duration = Math.min(Math.max(Number(body.duration) || 1800, 300), 3600);

  const id = uid();
  const now = Math.floor(Date.now() / 1000);

  await env.varun_portfolio_auth
    .prepare('INSERT INTO interview_sessions (id, user_id, theme, duration_target, model, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, session.userId, theme, duration, INTERVIEW_MODEL, now)
    .run();

  // Stream the opening from Claude
  const upstream = await callClaude(env.ANTHROPIC_API_KEY, systemPrompt(theme), []);
  const msgId = uid();

  return sse(transformStream(upstream, async (fullText, usage) => {
    const ts = Math.floor(Date.now() / 1000);
    await env.varun_portfolio_auth
      .prepare('INSERT INTO interview_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(msgId, id, 'assistant', fullText, ts)
      .run();
    await accumulateUsage(env, id, usage);
    // Prepend session id so the client knows it
  }, { sessionId: id }));
}

// ── User turn → stream AI response ───────────────────────────────
export async function sendInterviewMessage(request, env, sessionId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const row = await env.varun_portfolio_auth
    .prepare('SELECT user_id, theme, ended_at FROM interview_sessions WHERE id = ?')
    .bind(sessionId).first();

  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== session.userId) return json({ error: 'Forbidden' }, 403);
  if (row.ended_at) return json({ error: 'Session already ended' }, 400);

  const body = await request.json().catch(() => ({}));
  const userContent = String(body.content || '').trim().slice(0, 4000);
  if (!userContent) return json({ error: 'Empty message' }, 400);

  // Save user message
  const userMsgId = uid();
  const ts = Math.floor(Date.now() / 1000);
  await env.varun_portfolio_auth
    .prepare('INSERT INTO interview_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userMsgId, sessionId, 'user', userContent, ts)
    .run();

  // Load full history for context
  const { results } = await env.varun_portfolio_auth
    .prepare('SELECT role, content FROM interview_messages WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId).all();

  const messages = results.map(r => ({ role: r.role, content: r.content }));
  const upstream = await callClaude(env.ANTHROPIC_API_KEY, systemPrompt(row.theme), messages);
  const asstMsgId = uid();

  return sse(transformStream(upstream, async (fullText, usage) => {
    const now = Math.floor(Date.now() / 1000);
    await env.varun_portfolio_auth
      .prepare('INSERT INTO interview_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(asstMsgId, sessionId, 'assistant', fullText, now)
      .run();
    await accumulateUsage(env, sessionId, usage);
  }));
}

// ── End session ───────────────────────────────────────────────────
export async function endInterviewSession(request, env, sessionId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const row = await env.varun_portfolio_auth
    .prepare('SELECT user_id FROM interview_sessions WHERE id = ?')
    .bind(sessionId).first();

  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== session.userId) return json({ error: 'Forbidden' }, 403);

  const body = await request.json().catch(() => ({}));
  const durationActual = Number(body.duration_actual) || null;
  const now = Math.floor(Date.now() / 1000);

  await env.varun_portfolio_auth
    .prepare('UPDATE interview_sessions SET ended_at = ?, duration_actual = ? WHERE id = ?')
    .bind(now, durationActual, sessionId)
    .run();

  // Return final session with cost
  const final = await env.varun_portfolio_auth
    .prepare('SELECT id, theme, duration_target, duration_actual, model, input_tokens, output_tokens, cost_usd, created_at, ended_at FROM interview_sessions WHERE id = ?')
    .bind(sessionId).first();

  return json({ session: final });
}

// ── List user sessions ────────────────────────────────────────────
export async function listInterviewSessions(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const { results } = await env.varun_portfolio_auth
    .prepare('SELECT id, theme, duration_target, duration_actual, model, input_tokens, output_tokens, cost_usd, created_at, ended_at FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .bind(session.userId).all();

  return json({ sessions: results });
}

// ── Get single session with transcript ───────────────────────────
export async function getInterviewSession(request, env, sessionId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const row = await env.varun_portfolio_auth
    .prepare('SELECT id, user_id, theme, duration_target, duration_actual, model, input_tokens, output_tokens, cost_usd, created_at, ended_at FROM interview_sessions WHERE id = ?')
    .bind(sessionId).first();

  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== session.userId) return json({ error: 'Forbidden' }, 403);

  const { results: messages } = await env.varun_portfolio_auth
    .prepare('SELECT role, content, created_at FROM interview_messages WHERE session_id = ? ORDER BY created_at ASC')
    .bind(sessionId).all();

  return json({ session: row, messages });
}

// ── Anthropic streaming call ──────────────────────────────────────
async function callClaude(apiKey, system, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      INTERVIEW_MODEL,
      max_tokens: 512,
      system,
      messages:   messages.length ? messages : [{ role: 'user', content: 'Begin.' }],
      stream:     true,
    }),
  });
  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Anthropic ${response.status}: ${err}`);
  }
  return response.body;
}

// ── SSE transform: upstream Anthropic → client delta stream ──────
function transformStream(upstream, onDone, meta = {}) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let fullText = '';
  const usage = { input_tokens: 0, output_tokens: 0 };

  return new ReadableStream({
    async start(controller) {
      // Emit session metadata on first chunk (for createSession)
      if (meta.sessionId) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'session', id: meta.sessionId })}\n\n`
        ));
      }

      const reader = upstream.getReader();
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
            if (raw === '[DONE]') continue;
            let ev;
            try { ev = JSON.parse(raw); } catch { continue; }

            if (ev.type === 'message_start' && ev.message?.usage) {
              usage.input_tokens = ev.message.usage.input_tokens ?? 0;
            } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              fullText += ev.delta.text;
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: ev.delta.text })}\n\n`
              ));
            } else if (ev.type === 'message_delta' && ev.usage) {
              usage.output_tokens = ev.usage.output_tokens ?? 0;
            } else if (ev.type === 'message_stop') {
              await onDone(fullText, usage);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}

// ── Accumulate token usage + cost after each turn ────────────────
async function accumulateUsage(env, sessionId, usage) {
  const costDelta = (usage.input_tokens / 1_000_000) * PRICE_INPUT
                 + (usage.output_tokens / 1_000_000) * PRICE_OUTPUT;
  await env.varun_portfolio_auth
    .prepare(`UPDATE interview_sessions
              SET input_tokens  = input_tokens  + ?,
                  output_tokens = output_tokens + ?,
                  cost_usd      = cost_usd      + ?
              WHERE id = ?`)
    .bind(usage.input_tokens, usage.output_tokens, costDelta, sessionId)
    .run();
}
