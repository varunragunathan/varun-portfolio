// ── Session management ────────────────────────────────────────────
// Sessions have two phases:
//   1. Pending (5 min KV TTL) — set after passkey verify, before trust prompt
//   2. Active  (24h or 30d)  — set after user answers the trust prompt
//
// The pending model means no usable session cookie is issued until
// the user has explicitly chosen their trust level and device name.

import { sha256Hex, inferDeviceName, getClientIP, maskEmail } from '../utils.js';
import { createSessionRecord, updateSessionLastActive, getSessionByTokenHash, logSecurityEvent, getUserById, updateUserNickname, createTrustedDevice } from '../db.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function sessionCookie(token, maxAge = 86400) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function deviceTrustCookie(token) {
  return `device_trust=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${365 * 86400}`;
}

function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

// ── Pending session ───────────────────────────────────────────────
// Stored in KV with a 5-minute TTL. Not usable as an auth token.
// The client receives the raw token and must exchange it via /sessions/finalise.

export async function createPendingSession(kv, { userId, email, recoveryCodes, method }) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await kv.put(
    `session_pending:${token}`,
    JSON.stringify({ userId, email, recoveryCodes: recoveryCodes || null, method: method || null }),
    { expirationTtl: 300 },
  );
  return token;
}

// ── Finalise session ──────────────────────────────────────────────
// POST /api/auth/sessions/finalise
// Exchanges a pending token for a real session + sets cookie.

export async function finaliseSession(request, env) {
  const body = await request.json().catch(() => ({}));
  const { token, trusted, deviceName, preTrusted, fingerprint } = body;
  if (!token) return json({ error: 'Missing token' }, 400);

  const raw = await env.AUTH_KV.get(`session_pending:${token}`);
  if (!raw) return json({ error: 'Session expired or invalid' }, 400);

  const { userId, email, method } = JSON.parse(raw);
  await env.AUTH_KV.delete(`session_pending:${token}`);

  const isTrusted = trusted === true;
  const TTL = isTrusted ? 30 * 86400 : 86400;
  const ua = request.headers.get('User-Agent') || '';
  const ip = getClientIP(request);
  const name = deviceName?.trim() || inferDeviceName(ua);
  const sessionId = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + TTL * 1000;

  // Write real session to KV (fast lookup) and D1 (metadata/security page).
  // KV is keyed by tokenHash (not raw token) so revocation can purge it using
  // only the hash stored in D1 — no need to ever store the raw token server-side.
  await env.AUTH_KV.put(`session:${tokenHash}`, JSON.stringify({ userId, email, sessionId }), { expirationTtl: TTL });
  await createSessionRecord(env.varun_portfolio_auth, {
    id: sessionId, userId, tokenHash, deviceName: name,
    userAgent: ua, ip, trusted: isTrusted, expiresAt,
  });

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId, type: 'login', ip, userAgent: ua, deviceName: name,
    metadata: method ? { method } : undefined,
  });

  // ── Device trust ──────────────────────────────────────────────────
  // Create a persistent device trust record so future sign-ins from this
  // browser/device skip the number matching prompt automatically.
  // preTrusted=true means the device was already trusted — existing record
  // was already updated in verifyAuth, so no new record is needed.
  const responseHeaders = new Headers({ 'Content-Type': 'application/json' });
  responseHeaders.append('Set-Cookie', sessionCookie(token, TTL));

  if (isTrusted && !preTrusted) {
    const trustToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const trustHash = await sha256Hex(trustToken);
    await createTrustedDevice(env.varun_portfolio_auth, {
      id: crypto.randomUUID(),
      userId,
      tokenHash: trustHash,
      deviceName: name,
      userAgent: ua,
      fingerprint: fingerprint || null,
    });
    responseHeaders.append('Set-Cookie', deviceTrustCookie(trustToken));
  }

  return new Response(JSON.stringify({ ok: true, user: { email } }), { status: 200, headers: responseHeaders });
}

// ── Active session helpers ────────────────────────────────────────

export async function getSession(kv, request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const raw = await kv.get(`session:${tokenHash}`);
  if (!raw) return null;
  return { token, ...JSON.parse(raw) };
}

// Touch last_active_at in D1 (fire-and-forget, called on /me)
export async function touchSession(db, token) {
  const tokenHash = await sha256Hex(token);
  const record = await getSessionByTokenHash(db, tokenHash);
  if (record) await updateSessionLastActive(db, record.id);
}

// GET /api/auth/me
export async function getMe(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ user: null });
  touchSession(env.varun_portfolio_auth, session.token).catch(() => {});

  const db = env.varun_portfolio_auth;
  const dbUser = await getUserById(db, session.userId);

  // Backfill nickname for accounts created before this column existed
  let nickname = dbUser?.nickname;
  if (!nickname) {
    const ADJS  = ['swift','bright','calm','bold','keen','warm','cool','sharp','quiet','brave'];
    const NOUNS = ['fox','owl','bear','wolf','hawk','deer','seal','hare','lynx','kite'];
    const rand = crypto.getRandomValues(new Uint8Array(3));
    nickname = `${ADJS[rand[0] % ADJS.length]}-${NOUNS[rand[1] % NOUNS.length]}-${rand[2] % 100}`;
    await updateUserNickname(db, session.userId, nickname);
  }

  const role = session.email && env.ADMIN_EMAIL && session.email === env.ADMIN_EMAIL
    ? 'admin'
    : (dbUser?.role ?? 'user');

  return json({
    user: {
      userId: session.userId,
      nickname,
      maskedEmail: maskEmail(session.email),
      role,
    },
  });
}

// POST /api/auth/logout
export async function logout(request, env) {
  const token = getTokenFromRequest(request);
  if (token) {
    const tokenHash = await sha256Hex(token);
    const raw = await env.AUTH_KV.get(`session:${tokenHash}`);
    if (raw) {
      const { userId } = JSON.parse(raw);
      await env.AUTH_KV.delete(`session:${tokenHash}`);
      const db = env.varun_portfolio_auth;
      await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
      await logSecurityEvent(db, { userId, type: 'logout',
        ip: getClientIP(request), userAgent: request.headers.get('User-Agent') || '' });
    }
  }
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
