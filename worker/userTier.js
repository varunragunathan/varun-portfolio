// ── User tier / upgrade-request handlers ─────────────────────────
//
// Exports:
//   getUserRole(db, userId)           — 'user' | 'pro' | 'admin'
//   submitUpgradeRequest(request, env)
//   getUpgradeRequest(request, env)
//   getApprovedModels(db)

import { getSession } from './auth/session.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Role lookup ───────────────────────────────────────────────────

export async function getUserRole(db, userId) {
  const row = await db
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(userId)
    .first();
  return row?.role ?? 'user';
}

// ── Approved models ───────────────────────────────────────────────

export async function getApprovedModels(db) {
  const result = await db
    .prepare('SELECT * FROM allowed_models WHERE enabled = 1')
    .all();
  return result.results;
}

// ── Upgrade request routes ────────────────────────────────────────

// POST /api/user/upgrade-request
// Body: { note? }
export async function submitUpgradeRequest(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db   = env.varun_portfolio_auth;
  const body = await request.json().catch(() => ({}));
  const note = body.note ?? null;
  const tier = ['pro', 'student'].includes(body.tier) ? body.tier : 'pro';

  // Check if user already has the requested tier or higher
  const role = await getUserRole(db, session.userId);
  if (role === tier || role === 'admin') {
    return json({ error: `Already ${tier}` }, 400);
  }

  // Check for existing pending or approved request for this tier
  const existing = await db
    .prepare(
      "SELECT id, status FROM upgrade_requests WHERE user_id = ? AND tier = ? AND status IN ('pending', 'approved') LIMIT 1"
    )
    .bind(session.userId, tier)
    .first();

  if (existing) {
    return json({ error: 'Upgrade request already exists', status: existing.status }, 409);
  }

  const id  = crypto.randomUUID();
  const now = Date.now();

  await db
    .prepare(
      'INSERT INTO upgrade_requests (id, user_id, status, note, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, session.userId, 'pending', note, tier, now)
    .run();

  return json({ ok: true, id });
}

// GET /api/user/upgrade-request
export async function getUpgradeRequest(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;

  const row = await db
    .prepare(
      'SELECT * FROM upgrade_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .bind(session.userId)
    .first();

  return json({ request: row ?? null });
}
