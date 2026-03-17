// ── Account / Security page API ───────────────────────────────────
// All routes require an active session.

import { getSession, sessionCookie } from './session.js';
import { consumeStepUpToken } from './stepUp.js';
import {
  getSessionsByUserId,
  deleteSessionById,
  deleteAllSessionsByUserIdExcept,
  updateSessionDeviceName,
  getPasskeyCredsByUserId,
  deletePasskeyCred,
  updatePasskeyNickname,
  getSecurityEvents,
  getRecoveryCodeStatus,
  generateAndStoreRecoveryCodes,
  logSecurityEvent,
  deleteUser,
  updateUserNickname,
  getUserById,
  listTrustedDevicesByUserId,
  deleteTrustedDevice,
} from '../db.js';
import { sha256Hex as sha256 } from '../utils.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function requireSession(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return { error: json({ error: 'Unauthorized' }, 401) };
  return { session };
}

// GET /api/auth/sessions
export async function listSessions(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;
  const sessions = await getSessionsByUserId(db, session.userId);

  // Mark which one is current by comparing token hash
  const currentHash = await sha256(session.token);
  const result = sessions.map(s => ({
    id: s.id,
    deviceName: s.device_name,
    ip: s.ip,
    lastActiveAt: s.last_active_at,
    createdAt: s.created_at,
    trusted: !!s.trusted,
    isCurrent: s.token_hash === currentHash,
  }));

  return json(result);
}

// DELETE /api/auth/sessions/:id
export async function revokeSession(request, env, sessionId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;

  // Fetch token_hash before deleting so we can also purge the KV entry.
  // Without this, the revoked session cookie stays valid until KV TTL expires.
  const record = await db
    .prepare('SELECT token_hash FROM sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, session.userId)
    .first();
  if (record) {
    await env.AUTH_KV.delete(`session:${record.token_hash}`);
  }

  await deleteSessionById(db, sessionId, session.userId);

  await logSecurityEvent(db, {
    userId: session.userId, type: 'session_revoked',
    ip: null, userAgent: null,
    metadata: { revokedSessionId: sessionId },
  });

  return json({ ok: true });
}

// DELETE /api/auth/sessions  (revoke all except current)
export async function revokeOtherSessions(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;
  const currentSession = await (async () => {
    const hash = await sha256(session.token);
    return db.prepare('SELECT id FROM sessions WHERE token_hash = ?').bind(hash).first();
  })();

  if (currentSession) {
    // Purge KV entries for all sessions being revoked before deleting from D1
    const others = await db
      .prepare('SELECT token_hash FROM sessions WHERE user_id = ? AND id != ?')
      .bind(session.userId, currentSession.id)
      .all();
    await Promise.all((others.results ?? []).map(r => env.AUTH_KV.delete(`session:${r.token_hash}`)));
    await deleteAllSessionsByUserIdExcept(db, session.userId, currentSession.id);
  }

  await logSecurityEvent(db, {
    userId: session.userId, type: 'sessions_revoked_all',
    ip: null, userAgent: null,
  });

  return json({ ok: true });
}

// PATCH /api/auth/sessions/:id  { deviceName }
export async function renameSession(request, env, sessionId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { deviceName } = body;
  if (!deviceName?.trim()) return json({ error: 'Missing deviceName' }, 400);

  await updateSessionDeviceName(env.varun_portfolio_auth, sessionId, session.userId, deviceName.trim());
  return json({ ok: true });
}

// GET /api/auth/passkeys
export async function listPasskeys(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const creds = await getPasskeyCredsByUserId(env.varun_portfolio_auth, session.userId);
  return json(creds.map(c => ({
    id: c.id,
    nickname: c.nickname,
    authenticatorType: c.authenticator_type,
    isSynced: !!c.is_synced,
    createdAt: c.created_at,
    lastUsedAt: c.last_used_at,
  })));
}

// DELETE /api/auth/passkeys/:id
export async function revokePasskey(request, env, credId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;
  // Guard: don't let user delete their last passkey
  const creds = await getPasskeyCredsByUserId(db, session.userId);
  if (creds.length <= 1) {
    return json({ error: 'Cannot delete your only passkey. Add another passkey first.' }, 400);
  }

  await deletePasskeyCred(db, credId, session.userId);
  await logSecurityEvent(db, {
    userId: session.userId, type: 'passkey_removed',
    ip: null, userAgent: null,
    metadata: { credId },
  });

  return json({ ok: true });
}

// PATCH /api/auth/passkeys/:id  { nickname }
export async function renamePasskey(request, env, credId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { nickname } = body;
  if (!nickname?.trim()) return json({ error: 'Missing nickname' }, 400);

  await updatePasskeyNickname(env.varun_portfolio_auth, credId, session.userId, nickname.trim());
  return json({ ok: true });
}

// GET /api/auth/security-events
export async function listSecurityEvents(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
  const events = await getSecurityEvents(env.varun_portfolio_auth, session.userId, limit);
  return json(events);
}

// GET /api/auth/recovery-codes/status
export async function recoveryCodesStatus(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const codes = await getRecoveryCodeStatus(env.varun_portfolio_auth, session.userId);
  return json(codes);
}

// POST /api/auth/recovery-codes/regenerate
// Requires re-authentication check via passkey — for now we require active session only.
// Future: add step-up auth here.
export async function regenerateRecoveryCodes(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;
  const recoveryCodes = await generateAndStoreRecoveryCodes(db, session.userId);

  await logSecurityEvent(db, {
    userId: session.userId, type: 'recovery_codes_regenerated',
    ip: null, userAgent: null,
  });

  return json({ ok: true, recoveryCodes });
}

// PATCH /api/auth/account/nickname  { nickname }
export async function updateNickname(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const nickname = body.nickname?.trim();
  if (!nickname) return json({ error: 'Missing nickname' }, 400);
  if (nickname.length < 2 || nickname.length > 32) return json({ error: 'Nickname must be 2–32 characters' }, 400);
  if (!/^[\w\-. ]+$/.test(nickname)) return json({ error: 'Only letters, numbers, spaces, hyphens, and dots allowed' }, 400);

  await updateUserNickname(env.varun_portfolio_auth, session.userId, nickname);
  return json({ ok: true, nickname });
}

// GET /api/auth/trusted-devices
export async function listTrustedDevicesHandler(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;
  const devices = await listTrustedDevicesByUserId(env.varun_portfolio_auth, session.userId);
  return json(devices.map(d => ({
    id: d.id,
    deviceName: d.device_name,
    userAgent: d.user_agent,
    createdAt: d.created_at,
    lastUsedAt: d.last_used_at,
  })));
}

// DELETE /api/auth/trusted-devices/:id
export async function revokeTrustedDeviceHandler(request, env, deviceId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;
  await deleteTrustedDevice(env.varun_portfolio_auth, deviceId, session.userId);
  return json({ ok: true });
}

// DELETE /api/auth/account  { stepUpToken, email }
export async function deleteAccount(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const body = await request.json().catch(() => ({}));

  const valid = await consumeStepUpToken(env.AUTH_KV, body.stepUpToken, session.userId);
  if (!valid) return json({ error: 'Step-up authentication required or expired. Please verify your passkey again.' }, 403);

  const db = env.varun_portfolio_auth;

  // Verify the submitted email matches the account — server-side check, never trust client
  const user = await getUserById(db, session.userId);
  if (!user || !body.email || body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    return json({ error: 'Email address does not match your account.' }, 403);
  }

  // Delete everything — KV session first, then all D1 records
  const currentHash = await sha256(session.token);
  await env.AUTH_KV.delete(`session:${currentHash}`);
  await deleteUser(db, session.userId);

  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
