// ── Admin route handlers ──────────────────────────────────────────
// All routes require the caller to be the configured admin email.
//
// Exports:
//   isAdmin(session, env)
//   requireAdmin(session, env)
//   listUpgradeRequests(request, env)
//   approveUpgrade(request, env, id)
//   rejectUpgrade(request, env, id)
//   listAdminUsers(request, env)
//   listAdminModels(request, env)
//   addAdminModel(request, env)
//   toggleAdminModel(request, env, id)

import { getSession }          from './auth/session.js';
import { consumeStepUpToken } from './auth/stepUp.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Auth helpers ──────────────────────────────────────────────────

// Checks both the ADMIN_EMAIL env var and the D1 role='admin' column.
export async function isAdmin(session, env) {
  if (!session) return false;
  if (env.ADMIN_EMAIL && session.email === env.ADMIN_EMAIL) return true;
  const user = await env.varun_portfolio_auth
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.userId)
    .first();
  return user?.role === 'admin';
}

// Returns a 403 Response if the caller is not admin, otherwise null.
export async function requireAdmin(session, env) {
  if (!(await isAdmin(session, env))) {
    return json({ error: 'Forbidden' }, 403);
  }
  return null;
}

// ── Upgrade requests ──────────────────────────────────────────────

// GET /api/admin/upgrade-requests[?status=pending]
export async function listUpgradeRequests(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status'); // e.g. 'pending' or null for all

  let query;
  let result;
  if (statusFilter) {
    query = `
      SELECT ur.id, ur.user_id, ur.status, ur.note, ur.created_at,
             ur.reviewed_at, ur.reviewed_by, u.email
        FROM upgrade_requests ur
        JOIN users u ON u.id = ur.user_id
       WHERE ur.status = ?
       ORDER BY ur.created_at DESC
    `;
    result = await db.prepare(query).bind(statusFilter).all();
  } else {
    query = `
      SELECT ur.id, ur.user_id, ur.status, ur.note, ur.created_at,
             ur.reviewed_at, ur.reviewed_by, u.email
        FROM upgrade_requests ur
        JOIN users u ON u.id = ur.user_id
       ORDER BY ur.created_at DESC
    `;
    result = await db.prepare(query).all();
  }

  return json({ requests: result.results });
}

// POST /api/admin/upgrade-requests/:id/approve
export async function approveUpgrade(request, env, id) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();

  const existing = await db
    .prepare('SELECT * FROM upgrade_requests WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return json({ error: 'Not found' }, 404);

  await db.batch([
    db.prepare(
      'UPDATE upgrade_requests SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?'
    ).bind('approved', now, session.email, id),
    db.prepare('UPDATE users SET role = ? WHERE id = ?').bind('pro', existing.user_id),
  ]);

  return json({ ok: true });
}

// POST /api/admin/upgrade-requests/:id/reject
export async function rejectUpgrade(request, env, id) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();

  const existing = await db
    .prepare('SELECT id FROM upgrade_requests WHERE id = ?')
    .bind(id)
    .first();
  if (!existing) return json({ error: 'Not found' }, 404);

  await db
    .prepare(
      'UPDATE upgrade_requests SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?'
    )
    .bind('rejected', now, session.email, id)
    .run();

  return json({ ok: true });
}

// ── Users ─────────────────────────────────────────────────────────

// GET /api/admin/users
export async function listAdminUsers(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db = env.varun_portfolio_auth;
  const result = await db
    .prepare(
      'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 200'
    )
    .all();

  return json({ users: result.results });
}

// ── Models ────────────────────────────────────────────────────────

// GET /api/admin/models
export async function listAdminModels(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db = env.varun_portfolio_auth;
  const result = await db
    .prepare('SELECT * FROM allowed_models ORDER BY added_at DESC')
    .all();

  return json({ models: result.results });
}

// POST /api/admin/models
// Body: { model_id, label, tier }
export async function addAdminModel(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const body = await request.json().catch(() => ({}));
  const { model_id, label, tier } = body;

  if (!model_id?.trim() || !label?.trim()) {
    return json({ error: 'model_id and label are required' }, 400);
  }

  const db      = env.varun_portfolio_auth;
  const id      = crypto.randomUUID();
  const now     = Date.now();
  const tierVal = tier ?? 'pro';

  try {
    await db
      .prepare(
        'INSERT INTO allowed_models (id, model_id, label, tier, enabled, added_at) VALUES (?, ?, ?, ?, 1, ?)'
      )
      .bind(id, model_id.trim(), label.trim(), tierVal, now)
      .run();
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return json({ error: 'Model already exists' }, 409);
    }
    throw err;
  }

  return json({ ok: true, id });
}

// POST /api/admin/users/:id/make-admin
// Body: { stepUpToken }  — step-up verification required
export async function makeAdminUser(request, env, userId) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const { stepUpToken } = await request.json().catch(() => ({}));
  const valid = await consumeStepUpToken(env.AUTH_KV, stepUpToken, session.userId);
  if (!valid) return json({ error: 'Step-up verification required' }, 403);

  const db     = env.varun_portfolio_auth;
  const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(userId).first();
  if (!target) return json({ error: 'User not found' }, 404);
  if (target.role === 'admin') return json({ ok: true });

  await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind('admin', userId).run();
  return json({ ok: true });
}

// PATCH /api/admin/models/:id  — flip enabled 0↔1
export async function toggleAdminModel(request, env, id) {
  const session = await getSession(env.AUTH_KV, request);
  const guard = await requireAdmin(session, env);
  if (guard) return guard;

  const db = env.varun_portfolio_auth;
  const existing = await db
    .prepare('SELECT id, enabled FROM allowed_models WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) return json({ error: 'Not found' }, 404);

  const newEnabled = existing.enabled ? 0 : 1;
  await db
    .prepare('UPDATE allowed_models SET enabled = ? WHERE id = ?')
    .bind(newEnabled, id)
    .run();

  return json({ ok: true, enabled: newEnabled });
}
