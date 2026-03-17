// ── Anonymous feedback submission ────────────────────────────────
// POST /api/feedback  { message, page? }
// No auth required.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function submitFeedbackHandler(request, env) {
  const body = await request.json().catch(() => ({}));
  const { message, page } = body;

  if (!message?.trim())                   return json({ error: 'Message required' }, 400);
  if (message.trim().length < 3)          return json({ error: 'Too short' }, 400);
  if (message.trim().length > 1000)       return json({ error: 'Max 1000 characters' }, 400);

  const db  = env.varun_portfolio_auth;
  const id  = crypto.randomUUID();
  const now = Date.now();
  const ua  = (request.headers.get('User-Agent') || '').slice(0, 300);

  await db
    .prepare('INSERT INTO feedback (id, message, page, user_agent, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, message.trim(), page?.slice(0, 200) ?? null, ua, now)
    .run();

  return json({ ok: true });
}
