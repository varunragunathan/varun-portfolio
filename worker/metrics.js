// ── Admin metrics ─────────────────────────────────────────────────
// GET /api/admin/metrics
//
// Returns a snapshot of platform health metrics computable from D1.
// All time windows are relative to the moment of the request.

import { getSession }   from './auth/session.js';
import { requireAdmin } from './admin.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SIGNIN_TYPES  = ['login', 'totp_signin', 'recovery_signin'];
const FAILURE_TYPES = ['recovery_signin_failed', 'recovery_code_failed', 'account_frozen'];

export async function getMetrics(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();

  const todayStart     = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
  const weekStart      = now - 7  * 86_400_000;
  const priorWeekStart = now - 14 * 86_400_000;

  // ── Batch all D1 queries ─────────────────────────────────────────
  const [
    rTotalUsers,
    rNewToday,
    rNewThisWeek,
    rNewPriorWeek,
    rByRole,
    rPasskeyUsers,
    rTotpUsers,
    rActiveSessions,
    rTotalConv,
    rTotalMsg,
    rMsgWeek,
    rMsgToday,
    rAvgPerConv,
    rUpgrades,
    rEventTypesWeek,
    rRecentEvents,
  ] = await db.batch([
    // Users
    db.prepare('SELECT COUNT(*) as n FROM users'),
    db.prepare('SELECT COUNT(*) as n FROM users WHERE created_at >= ?').bind(todayStart),
    db.prepare('SELECT COUNT(*) as n FROM users WHERE created_at >= ?').bind(weekStart),
    db.prepare('SELECT COUNT(*) as n FROM users WHERE created_at >= ? AND created_at < ?').bind(priorWeekStart, weekStart),
    db.prepare('SELECT role, COUNT(*) as n FROM users GROUP BY role ORDER BY n DESC'),

    // Auth adoption
    db.prepare('SELECT COUNT(DISTINCT user_id) as n FROM passkey_creds'),
    db.prepare('SELECT COUNT(*) as n FROM users WHERE totp_enabled = 1'),
    db.prepare('SELECT COUNT(DISTINCT user_id) as n FROM sessions WHERE expires_at > ? AND last_active_at >= ?').bind(now, weekStart),

    // Chat
    db.prepare('SELECT COUNT(*) as n FROM conversations'),
    db.prepare('SELECT COUNT(*) as n FROM chat_messages'),
    db.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE created_at >= ?').bind(weekStart),
    db.prepare('SELECT COUNT(*) as n FROM chat_messages WHERE created_at >= ?').bind(todayStart),
    db.prepare('SELECT AVG(c) as n FROM (SELECT COUNT(*) as c FROM chat_messages GROUP BY conversation_id)'),

    // Upgrades
    db.prepare('SELECT status, tier, COUNT(*) as n FROM upgrade_requests GROUP BY status, tier'),

    // Security events — type breakdown for the week
    db.prepare('SELECT type, COUNT(*) as n FROM security_events WHERE created_at >= ? GROUP BY type ORDER BY n DESC').bind(weekStart),

    // Recent events feed
    db.prepare(`
      SELECT se.type, se.created_at, se.ip, se.device_name, u.email
        FROM security_events se
        JOIN users u ON u.id = se.user_id
       ORDER BY se.created_at DESC
       LIMIT 20
    `),
  ]);

  // ── Shape users ──────────────────────────────────────────────────
  const totalUsers   = rTotalUsers.results[0]?.n   ?? 0;
  const newToday     = rNewToday.results[0]?.n      ?? 0;
  const newThisWeek  = rNewThisWeek.results[0]?.n   ?? 0;
  const newPriorWeek = rNewPriorWeek.results[0]?.n  ?? 0;
  const byRole       = Object.fromEntries(
    (rByRole.results ?? []).map(r => [r.role ?? 'user', r.n])
  );

  // ── Shape auth ───────────────────────────────────────────────────
  const passkeyUsers    = rPasskeyUsers.results[0]?.n  ?? 0;
  const totpUsers       = rTotpUsers.results[0]?.n     ?? 0;
  const activeSessionsW = rActiveSessions.results[0]?.n ?? 0;

  const eventMap = Object.fromEntries(
    (rEventTypesWeek.results ?? []).map(r => [r.type, r.n])
  );
  const signinsByMethod   = Object.fromEntries(SIGNIN_TYPES.map(t => [t, eventMap[t] ?? 0]));
  const signinsWeek       = SIGNIN_TYPES.reduce((s, t) => s + (eventMap[t] ?? 0), 0);
  const failedAttemptsW   = FAILURE_TYPES.reduce((s, t) => s + (eventMap[t] ?? 0), 0);

  // ── Shape chat ───────────────────────────────────────────────────
  const totalConv    = rTotalConv.results[0]?.n   ?? 0;
  const totalMsg     = rTotalMsg.results[0]?.n    ?? 0;
  const msgWeek      = rMsgWeek.results[0]?.n     ?? 0;
  const msgToday     = rMsgToday.results[0]?.n    ?? 0;
  const avgPerConv   = Math.round((rAvgPerConv.results[0]?.n ?? 0) * 10) / 10;

  // ── Shape upgrades ───────────────────────────────────────────────
  const upgradeRows = rUpgrades.results ?? [];
  const upgradeTotals = { pending: 0, approved: 0, rejected: 0 };
  const upgradeByTier = {};
  for (const row of upgradeRows) {
    const tier   = row.tier ?? 'pro';
    const status = row.status;
    upgradeTotals[status] = (upgradeTotals[status] ?? 0) + row.n;
    if (!upgradeByTier[tier]) upgradeByTier[tier] = { pending: 0, approved: 0, rejected: 0 };
    upgradeByTier[tier][status] = (upgradeByTier[tier][status] ?? 0) + row.n;
  }
  const totalDecided    = upgradeTotals.approved + upgradeTotals.rejected;
  const approvalRatePct = totalDecided > 0
    ? Math.round((upgradeTotals.approved / totalDecided) * 100)
    : null;

  return json({
    generated_at: now,
    users: {
      total:       totalUsers,
      today:       newToday,
      this_week:   newThisWeek,
      prior_week:  newPriorWeek,
      by_role:     byRole,
    },
    auth: {
      passkey_users:        passkeyUsers,
      totp_users:           totpUsers,
      active_sessions_week: activeSessionsW,
      signins_week:         signinsWeek,
      signins_by_method:    signinsByMethod,
      failed_attempts_week: failedAttemptsW,
    },
    chat: {
      total_conversations: totalConv,
      total_messages:      totalMsg,
      messages_week:       msgWeek,
      messages_today:      msgToday,
      avg_per_conv:        avgPerConv,
    },
    upgrades: {
      pending:          upgradeTotals.pending,
      approved:         upgradeTotals.approved,
      rejected:         upgradeTotals.rejected,
      approval_rate_pct: approvalRatePct,
      by_tier:          upgradeByTier,
    },
    recent_events: rRecentEvents.results ?? [],
  });
}
