// ── TOTP (RFC 6238) ───────────────────────────────────────────────
// Routes:
//   GET  /api/auth/totp/status    — is TOTP enrolled?
//   POST /api/auth/totp/setup     — generate secret, store pending in KV
//   POST /api/auth/totp/enable    — verify first code, save encrypted secret
//   POST /api/auth/totp/disable   — step-up required, removes TOTP
//   POST /api/auth/totp/signin    — sign in with email + TOTP code

import { getSession }        from './session.js';
import { consumeStepUpToken } from './stepUp.js';
import { createPendingSession } from './session.js';
import { getUserByEmail, logSecurityEvent } from '../db.js';
import { getClientIP } from '../utils.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Base32 ────────────────────────────────────────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_CHARS[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_CHARS[(val << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const s = str.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out = [];
  for (const c of s) {
    const idx = B32_CHARS.indexOf(c);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ── Base64url helpers ─────────────────────────────────────────────
function toB64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── AES-256-GCM encrypt / decrypt ─────────────────────────────────
async function deriveKey(keyStr) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptTotpSecret(plaintext, keyStr) {
  const key = await deriveKey(keyStr);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${toB64url(iv)}.${toB64url(new Uint8Array(enc))}`;
}

async function decryptTotpSecret(stored, keyStr) {
  const [ivB64, encB64] = stored.split('.');
  const key = await deriveKey(keyStr);
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64url(ivB64) },
    key,
    fromB64url(encB64),
  );
  return new TextDecoder().decode(dec);
}

// ── HOTP / TOTP ───────────────────────────────────────────────────
async function hotp(secret, counter) {
  const keyBytes = base32Decode(secret);
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(counter), false); // big-endian

  const key  = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig  = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = sig[19] & 0xf;
  const code   = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

export async function verifyTotp(secret, inputCode) {
  const t = Math.floor(Date.now() / 1000 / 30);
  for (const step of [t - 1, t, t + 1]) {
    if (await hotp(secret, step) === String(inputCode).trim()) return true;
  }
  return false;
}

// ── otpauth URI ───────────────────────────────────────────────────
function buildOtpUri(secret, email) {
  const issuer  = 'varunr.dev';
  const account = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${account}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Routes ────────────────────────────────────────────────────────

// GET /api/auth/totp/status
export async function totpStatus(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const row = await env.varun_portfolio_auth
    .prepare('SELECT totp_enabled FROM users WHERE id = ?')
    .bind(session.userId)
    .first();

  return json({ enabled: !!(row?.totp_enabled) });
}

// POST /api/auth/totp/setup
// Generates a secret, stores it pending in KV (10 min), returns URI for QR.
export async function totpSetup(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  // Generate 20-byte random secret
  const secretBytes = crypto.getRandomValues(new Uint8Array(20));
  const secret      = base32Encode(secretBytes);

  await env.AUTH_KV.put(
    `totp_pending:${session.userId}`,
    secret,
    { expirationTtl: 600 },
  );

  const row = await env.varun_portfolio_auth
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(session.userId)
    .first();

  return json({ secret, uri: buildOtpUri(secret, row?.email ?? '') });
}

// POST /api/auth/totp/enable
// Body: { code }  — verifies first TOTP code, encrypts + saves secret.
export async function totpEnable(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  if (!env.TOTP_ENCRYPTION_KEY) return json({ error: 'TOTP not configured' }, 503);

  const { code } = await request.json().catch(() => ({}));
  if (!code) return json({ error: 'code required' }, 400);

  const secret = await env.AUTH_KV.get(`totp_pending:${session.userId}`);
  if (!secret) return json({ error: 'Setup session expired. Please start over.' }, 400);

  const valid = await verifyTotp(secret, code);
  if (!valid) return json({ error: 'Incorrect code' }, 400);

  const encrypted = await encryptTotpSecret(secret, env.TOTP_ENCRYPTION_KEY);

  await env.varun_portfolio_auth
    .prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?')
    .bind(encrypted, session.userId)
    .run();

  await env.AUTH_KV.delete(`totp_pending:${session.userId}`);

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId: session.userId, type: 'totp_enabled',
    ip: getClientIP(request), userAgent: request.headers.get('User-Agent') || '',
  });

  return json({ ok: true });
}

// POST /api/auth/totp/disable
// Body: { stepUpToken }
export async function totpDisable(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { stepUpToken } = await request.json().catch(() => ({}));
  const valid = await consumeStepUpToken(env.AUTH_KV, stepUpToken, session.userId);
  if (!valid) return json({ error: 'Step-up verification required' }, 403);

  await env.varun_portfolio_auth
    .prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?')
    .bind(session.userId)
    .run();

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId: session.userId, type: 'totp_disabled',
    ip: getClientIP(request), userAgent: request.headers.get('User-Agent') || '',
  });

  return json({ ok: true });
}

// POST /api/auth/totp/signin
// Body: { email, code }
export async function totpSignin(request, env) {
  if (!env.TOTP_ENCRYPTION_KEY) return json({ error: 'TOTP not configured' }, 503);

  const { email, code } = await request.json().catch(() => ({}));
  if (!email || !code) return json({ error: 'email and code required' }, 400);

  const db   = env.varun_portfolio_auth;
  const user = await getUserByEmail(db, email);

  // Generic error — don't reveal whether email exists or TOTP is enrolled
  const deny = () => json({ error: 'Invalid code' }, 400);

  if (!user?.totp_enabled || !user?.totp_secret) return deny();

  let secret;
  try {
    secret = await decryptTotpSecret(user.totp_secret, env.TOTP_ENCRYPTION_KEY);
  } catch {
    return deny();
  }

  const valid = await verifyTotp(secret, code);
  if (!valid) return deny();

  const pendingToken = await createPendingSession(env.AUTH_KV, {
    userId: user.id,
    email:  user.email,
  });

  await logSecurityEvent(db, {
    userId: user.id, type: 'totp_signin',
    ip: getClientIP(request), userAgent: request.headers.get('User-Agent') || '',
  });

  return json({ ok: true, pendingToken });
}
