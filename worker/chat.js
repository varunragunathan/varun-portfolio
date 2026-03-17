// ── RAG chat handler ─────────────────────────────────────────────
// Routes:
//   POST   /api/chat                        send message, get SSE stream
//   GET    /api/chat/conversations          list conversations
//   GET    /api/chat/conversations/:id      get messages in conversation
//   DELETE /api/chat/conversations/:id      delete conversation

import { getSession }                      from './auth/session.js';
import { checkRateLimit }                  from './rateLimit.js';
import { getUserRole, getApprovedModels }  from './userTier.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const CONTEXT_CHUNKS   = 5;    // top-K Vectorize results
const HISTORY_MESSAGES = 10;   // last N conversation turns to include
const DEFAULT_MODEL    = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Returns true when the caller's email matches the configured admin email.
function isAdminEmail(email, env) {
  return !!(email && env.ADMIN_EMAIL && email === env.ADMIN_EMAIL);
}

// ── Default personas per tier ────────────────────────────────────
const DEFAULT_PERSONAS = {
  user: `You are Varun's personal AI assistant on his portfolio site — friendly, warm, and enthusiastic.

Tone: Cheerful, approachable, professional. Think knowledgeable friend, not chatbot.
Be genuinely excited when talking about Varun's work, skills, and background.

What you help with:
- Questions about Varun: background, experience, skills, interests, projects
- Navigating the site and its features
- Resolving auth issues (passkey setup, OTP, recovery codes, login problems)
- General "what did Varun build and why" questions

What you never do:
- Reference source files, code snippets, or internal architecture
- Reveal sensitive implementation details
- Cite where information came from — answer naturally
- For deep technical rabbit holes: acknowledge it, offer to connect them with Varun directly

Style: Use "I" as Varun ("I built this because...", "I chose this approach...").
If asked about a project, lead with what's exciting. Keep answers concise and warm.
If you don't know, say so and suggest reaching out to Varun.`,

  pro: `You are Varun's personal AI assistant — knowledgeable, direct, technically fluent.

Tone: Confident and peer-to-peer. Less hand-holding, more engineering depth.
Still warm, but skip the softening — they're here for substance.

What you help with:
- Everything regular tier covers, plus:
- High-level architecture and design decisions
- Technology choices and tradeoffs ("why D1 over Postgres", "why passkeys over passwords")
- How different parts of the system fit together conceptually
- Varun's engineering philosophy and approach to building

What you never do:
- Cite raw file paths or specific line numbers
- Reveal security-sensitive internals
- Over-explain when a concise answer works

Style: Use "I" as Varun. Match the user's technical depth — if they go deep, go deep.
Be candid about tradeoffs ("I made a deliberate call here — here's why").
Use markdown and structure when it helps clarity.`,

  student: `You are Varun's personal AI assistant, in mentor mode — a senior engineer helping someone learn.

Tone: Patient, encouraging, precise sometimes quirky when it feels right. Think: Principal engineer doing a pairing session or code review.
Never condescending — assume the student can handle depth.

Who you're talking to:
Students and developers learning software engineering from real-world examples.
They may ask about Varun's work specifically, or general software engineering questions.
For general SE questions not in the context, use your own knowledge freely.

What you help with:
- Everything in pro tier, plus:
- Deep technical walkthroughs with source file references (you can cite files and show code when requested. Only when requested)
- "Why did you do it this way instead of X?" — always explain the why
- General software engineering concepts, patterns, architecture, debugging approaches
- How to think about a problem, not just the answer

Citing sources:
DO reference specific files when helpful (e.g. "see worker/auth/totp.js for how this works").
Quote short code snippets when they illustrate a point. Always explain, don't just paste.

Style: Use "I" as Varun. Think out loud ("the reason I did X instead of Y is...").
Encourage the question behind the question — if it's half-formed, help sharpen it.
Use markdown, code blocks, and structure liberally.`,

  admin: `You are Varun's personal AI — debug mode, full access, no filters.

Tone: Direct and precise. Zero fluff. Peer-to-peer between Varun and his own system.

What you help with:
- Everything across all tiers, no restrictions
- Deep dives into any file, function, or component with line-level detail
- Debugging, architectural review, implementation planning
- Honest assessment of what's good, what's technical debt, what could break
- Meta questions about the AI system itself

Style: No preamble — get to the point immediately.
Your name is Jerry and act like Jarvis from Iron Man. Reference files and line numbers directly.
If something looks like a bug or a bad pattern, call it out proactively.
Keep answers tight; expand only when depth is clearly needed.`,
};

// ── System prompt ────────────────────────────────────────────────
async function buildSystemPrompt(kv, role, chunks) {
  const tierKey = ['admin', 'pro', 'student'].includes(role) ? role : 'user';

  // KV-stored persona takes priority; fall back to hardcoded default
  const persona = (await kv.get(`persona:${tierKey}`).catch(() => null))
    ?? DEFAULT_PERSONAS[tierKey];

  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.metadata?.filePath ?? 'unknown'}) ${c.metadata?.text ?? ''}`)
    .join('\n\n');

  return `${persona}\n\n<context>\n${context}\n</context>`;
}

// ── Embed via Workers AI ─────────────────────────────────────────
async function embedQuery(ai, text) {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
  return result.data[0]; // float[]
}

// ── Query Vectorize ──────────────────────────────────────────────
async function retrieveChunks(vectorize, vector) {
  const results = await vectorize.query(vector, {
    topK: CONTEXT_CHUNKS,
    returnMetadata: 'all',
  });
  return results.matches ?? [];
}

// ── Workers AI streaming call ─────────────────────────────────────
async function streamWorkersAI(ai, model, systemPrompt, messages) {
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];
  // stream: true returns a ReadableStream of SSE bytes
  return ai.run(model, { messages: aiMessages, stream: true, max_tokens: 1024 });
}

// ── Anthropic (Claude) streaming call ────────────────────────────
// Returns a ReadableStream of SSE bytes from the Anthropic API.
async function streamClaude(apiKey, model, systemPrompt, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            apiKey,
      'anthropic-version':    '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  return response.body; // ReadableStream of SSE bytes
}

// ── Unified SSE transform ─────────────────────────────────────────
// Transforms either a Workers AI or Anthropic SSE stream into our
// client format:
//   data: {"type":"delta","text":"..."}
//   data: {"type":"done"}
//
// Workers AI format:   data: {"response":"token"} … data: [DONE]
// Anthropic format:    data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
//                      data: {"type":"message_stop"}
//
// `source` — 'workersai' | 'claude'
function transformStream(upstreamStream, source, onFullText) {
  let fullText = '';
  const decoder = new TextDecoder();
  let buffer    = '';

  return new ReadableStream({
    async start(controller) {
      const reader = upstreamStream.getReader();
      const enc    = new TextEncoder();

      function emit(obj) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete trailing line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();

            // ── Workers AI terminal sentinel ──────────────────────
            if (raw === '[DONE]') {
              await onFullText(fullText);
              emit({ type: 'done' });
              continue;
            }

            let event;
            try { event = JSON.parse(raw); } catch { continue; }

            if (source === 'workersai') {
              // Workers AI: { response: "token" }
              if (event.response) {
                fullText += event.response;
                emit({ type: 'delta', text: event.response });
              }
            } else {
              // Anthropic: various event types
              if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta?.text
              ) {
                fullText += event.delta.text;
                emit({ type: 'delta', text: event.delta.text });
              } else if (event.type === 'message_stop') {
                await onFullText(fullText);
                emit({ type: 'done' });
              }
              // Ignore ping, message_start, content_block_start, etc.
            }
          }
        }

        // Flush any remaining buffer content
        if (buffer.trim()) {
          const raw = buffer.startsWith('data: ') ? buffer.slice(6).trim() : buffer.trim();
          if (raw && raw !== '[DONE]') {
            try {
              const event = JSON.parse(raw);
              if (source === 'workersai' && event.response) {
                fullText += event.response;
                emit({ type: 'delta', text: event.response });
              } else if (
                source === 'claude' &&
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                event.delta?.text
              ) {
                fullText += event.delta.text;
                emit({ type: 'delta', text: event.delta.text });
              }
            } catch { /* ignore malformed trailing data */ }
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

// ── D1 helpers ───────────────────────────────────────────────────

async function getOrCreateConversation(db, userId, conversationId, firstMessage) {
  if (conversationId) {
    const existing = await db
      .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
      .bind(conversationId, userId)
      .first();
    if (existing) return existing;
  }

  const title = firstMessage.slice(0, 60).replace(/\s+/g, ' ').trim();
  const id    = crypto.randomUUID();
  const now   = Date.now();
  await db
    .prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, title, now, now)
    .run();
  return { id, user_id: userId, title, created_at: now, updated_at: now };
}

async function getConversationHistory(db, conversationId) {
  const result = await db
    .prepare(
      `SELECT role, content FROM chat_messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC LIMIT ${HISTORY_MESSAGES}`
    )
    .bind(conversationId)
    .all();
  return result.results.reverse();
}

async function saveMessages(db, conversationId, userContent, assistantContent) {
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), conversationId, 'user', userContent, now),
    db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), conversationId, 'assistant', assistantContent, now + 1),
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .bind(now, conversationId),
  ]);
}

// ── Route handlers ───────────────────────────────────────────────

// POST /api/chat
export async function postChat(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;

  // Determine role (admin email shortcut avoids a D1 round-trip)
  const role = isAdminEmail(session.email, env)
    ? 'admin'
    : await getUserRole(db, session.userId);

  // Rate limit check
  const rl = await checkRateLimit(env.AUTH_KV, session.userId, role);
  if (!rl.allowed) {
    return json(
      { error: 'Rate limit exceeded', retryAfter: rl.retryAfter, reason: rl.reason },
      429
    );
  }

  const body = await request.json().catch(() => ({}));
  const { message, conversationId, model: requestedModel } = body;

  if (!message?.trim()) return json({ error: 'message required' }, 400);
  if (message.trim().length > 2000) {
    return json({ error: 'Message too long (max 2000 chars)' }, 400);
  }

  // ── Model selection ───────────────────────────────────────────
  let selectedModel = DEFAULT_MODEL;
  let modelSource   = 'workersai'; // 'workersai' | 'claude'

  if (requestedModel && (role === 'pro' || role === 'student' || role === 'admin')) {
    // Validate against enabled models in DB
    const approvedModels = await getApprovedModels(db);
    const match = approvedModels.find(m => m.model_id === requestedModel);
    if (!match) {
      return json({ error: 'Model not available' }, 400);
    }
    selectedModel = requestedModel;
    modelSource   = selectedModel.startsWith('claude-') ? 'claude' : 'workersai';
  } else if (requestedModel) {
    // Non-pro users requesting a model: silently ignore, use default
    selectedModel = DEFAULT_MODEL;
    modelSource   = 'workersai';
  }

  // ── Claude coming soon ────────────────────────────────────────
  if (modelSource === 'claude') {
    const msg = 'Claude integration is coming soon. In the meantime, try Llama 3.3 70B — it\'s fast and free.';
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'delta', text: msg })}\n\n`));
        c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        c.close();
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-User-Role': role },
    });
  }

  const conversation = await getOrCreateConversation(db, session.userId, conversationId ?? null, message);
  const history      = await getConversationHistory(db, conversation.id);

  // Embed + retrieve context
  const vector = await embedQuery(env.AI, message);
  const chunks  = await retrieveChunks(env.VECTORIZE, vector);
  const systemPrompt = await buildSystemPrompt(env.AUTH_KV, role, chunks);

  // Build messages array (history + current user turn)
  const aiMessages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  // When the full response is assembled, persist to D1
  async function onFullText(assistantText) {
    await saveMessages(db, conversation.id, message, assistantText);
  }

  let upstreamStream;
  if (modelSource === 'claude') {
    upstreamStream = await streamClaude(env.ANTHROPIC_API_KEY, selectedModel, systemPrompt, aiMessages);
  } else {
    upstreamStream = await streamWorkersAI(env.AI, selectedModel, systemPrompt, aiMessages);
  }

  const clientStream = transformStream(upstreamStream, modelSource, onFullText);

  return new Response(clientStream, {
    headers: {
      'Content-Type':        'text/event-stream',
      'Cache-Control':       'no-cache',
      'X-Conversation-Id':   conversation.id,
      'X-User-Role':         role,
    },
  });
}

// GET /api/chat/conversations
export async function listConversations(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const result = await env.varun_portfolio_auth
    .prepare(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
    )
    .bind(session.userId)
    .all();

  return json({ conversations: result.results });
}

// GET /api/chat/conversations/:id
export async function getConversation(request, env, id) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;
  const conv = await db
    .prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?')
    .bind(id, session.userId)
    .first();
  if (!conv) return json({ error: 'Not found' }, 404);

  const msgs = await db
    .prepare('SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .bind(id)
    .all();

  return json({ conversation: conv, messages: msgs.results });
}

// DELETE /api/chat/conversations/:id
export async function deleteConversation(request, env, id) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;
  const conv = await db
    .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
    .bind(id, session.userId)
    .first();
  if (!conv) return json({ error: 'Not found' }, 404);

  await db.batch([
    db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').bind(id),
    db.prepare('DELETE FROM conversations WHERE id = ?').bind(id),
  ]);

  return json({ ok: true });
}

// GET /api/chat/models — returns enabled models for pro/admin users
export async function listChatModels(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db   = env.varun_portfolio_auth;
  const role = isAdminEmail(session.email, env)
    ? 'admin'
    : await getUserRole(db, session.userId);

  if (role !== 'pro' && role !== 'student' && role !== 'admin') {
    return json({ models: [] }); // regular users get empty list (no picker shown)
  }

  const models = await getApprovedModels(db);
  return json({ models });
}
