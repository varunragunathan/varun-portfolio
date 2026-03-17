// ── Account Recovery ──────────────────────────────────────────────
// Flow:
//   1. POST /recovery/start   — user provides email + recovery code
//                               → sends OTP to email (rate limited)
//   2. POST /recovery/verify  — user provides email + OTP + recovery code
//                               → marks recovery_gate in KV (5 min)
//                               → client can now call /passkey/register/options with recoveryToken
//
// After re-registration:
//   - All old passkeys are deleted (passkey.js verifyRegistration handles this for recovery flow)
//   - All old sessions are invalidated
//   - New recovery codes are generated

import {
  getUserByEmail,
  consumeRecoveryCode,
  deleteAllPasskeyCredsByUserId,
  deleteAllSessionsByUserId,
  countActiveRecoveryCodes,
  isUserFrozen,
  setUserFrozen,
  logSecurityEvent,
} from '../db.js';
import { createPendingSession } from './session.js';
import { decryptTotpSecret, verifyTotp } from './totp.js';
import { getClientIP } from '../utils.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const RATE_WINDOW = 10 * 60; // 10 minutes
const RATE_LIMIT = 3;

// POST /api/auth/recovery/start
// Validates recovery code, then triggers an OTP to the email address.
export async function recoveryStart(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, recoveryCode } = body;
  if (!email || !recoveryCode) return json({ error: 'Missing fields' }, 400);

  const db = env.varun_portfolio_auth;
  const ip = getClientIP(request);

  // Rate limit by IP + email
  const rateLimitKey = `recovery_rate:${email}`;
  const rateLimitRaw = await env.AUTH_KV.get(rateLimitKey);
  const rateData = rateLimitRaw ? JSON.parse(rateLimitRaw) : { count: 0, first: Date.now() };

  if (rateData.count >= RATE_LIMIT) {
    return json({ error: 'Too many recovery attempts. Please wait 10 minutes.' }, 429);
  }

  await env.AUTH_KV.put(
    rateLimitKey,
    JSON.stringify({ count: rateData.count + 1, first: rateData.first }),
    { expirationTtl: RATE_WINDOW },
  );

  const user = await getUserByEmail(db, email);

  // Don't leak whether user exists — always respond the same way
  if (!user) {
    // Pretend we sent an OTP
    return json({ ok: true });
  }

  if (await isUserFrozen(db, user.id)) {
    return json({ error: 'Account is frozen. Please contact support.' }, 403);
  }

  const activeCount = await countActiveRecoveryCodes(db, user.id);
  if (activeCount === 0) {
    return json({ error: 'No active recovery codes. Please contact support.' }, 400);
  }

  const valid = await consumeRecoveryCode(db, user.id, recoveryCode);
  if (!valid) {
    await logSecurityEvent(db, { userId: user.id, type: 'recovery_code_failed', ip,
      userAgent: request.headers.get('User-Agent') || '' });

    const remaining = await countActiveRecoveryCodes(db, user.id);
    // Freeze account after too many bad recovery attempts (5 failures → 1h freeze)
    if (remaining === 0) {
      await setUserFrozen(db, user.id, Date.now() + 3600_000);
      await logSecurityEvent(db, { userId: user.id, type: 'account_frozen', ip,
        userAgent: request.headers.get('User-Agent') || '' });
    }
    return json({ error: 'Invalid recovery code.' }, 400);
  }

  await logSecurityEvent(db, { userId: user.id, type: 'recovery_code_used', ip,
    userAgent: request.headers.get('User-Agent') || '' });

  // Check if user has TOTP available as an alternative second factor
  let hasTOTP = false;
  if (user.totp_enabled && user.totp_secret && env.TOTP_ENCRYPTION_KEY) {
    hasTOTP = true;
    await env.AUTH_KV.put(
      `recovery_totp_pending:${email}`,
      JSON.stringify({ userId: user.id }),
      { expirationTtl: 600 },
    );
  }

  // Send OTP via Resend (second factor of 2-of-2 recovery — always sent as fallback)
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  await env.AUTH_KV.put(`recovery_otp:${email}`, otp, { expirationTtl: 600 });

  const { Resend } = await import('resend');
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Varun <noreply@varunr.dev>',
    to: email,
    subject: `Your account recovery code — ${otp}`,
    html: `
      <div style="font-family:'IBM Plex Mono',monospace;max-width:440px;margin:0 auto;padding:48px 24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#6b7280;margin-bottom:24px;">varunr.dev · Account Recovery</div>
        <p style="font-size:14px;color:#9ca3af;margin-bottom:8px;">Your recovery code has been verified. Enter this OTP to continue:</p>
        <div style="font-size:48px;font-weight:300;letter-spacing:0.3em;color:#ffffff;margin:16px 0;">${otp}</div>
        <p style="font-size:12px;color:#4b5563;margin-top:24px;">This code expires in 10 minutes. If you did not request account recovery, your recovery code was just consumed — contact support immediately.</p>
      </div>
    `,
  });

  return json({ ok: true, hasTOTP });
}

// POST /api/auth/recovery/signin
// Backup sign-in: verifies a recovery code and issues a pending session directly.
// Unlike /recovery/start+verify (full account recovery), this does NOT wipe
// existing passkeys or sessions — it's a backup sign-in for when the passkey
// is unavailable (e.g. new device, passkey deleted, hardware changed).
// The consumed code is marked used; remaining codes stay intact.
export async function recoverySignIn(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, recoveryCode } = body;
  if (!email || !recoveryCode) return json({ error: 'Missing fields' }, 400);

  const db = env.varun_portfolio_auth;
  const ip = getClientIP(request);

  // Rate limit by email
  const rateLimitKey = `recovery_signin_rate:${email}`;
  const rateLimitRaw = await env.AUTH_KV.get(rateLimitKey);
  const rateData = rateLimitRaw ? JSON.parse(rateLimitRaw) : { count: 0 };
  if (rateData.count >= RATE_LIMIT) {
    return json({ error: 'Too many attempts. Please wait 10 minutes.' }, 429);
  }
  await env.AUTH_KV.put(
    rateLimitKey,
    JSON.stringify({ count: rateData.count + 1 }),
    { expirationTtl: RATE_WINDOW },
  );

  const user = await getUserByEmail(db, email);
  // Don't leak whether user exists — return same error as invalid code
  if (!user) return json({ error: 'Invalid recovery code.' }, 400);

  if (await isUserFrozen(db, user.id)) {
    return json({ error: 'Account is frozen. Please contact support.' }, 403);
  }

  const valid = await consumeRecoveryCode(db, user.id, recoveryCode);
  if (!valid) {
    await logSecurityEvent(db, {
      userId: user.id, type: 'recovery_signin_failed',
      ip, userAgent: request.headers.get('User-Agent') || '',
    });
    return json({ error: 'Invalid recovery code.' }, 400);
  }

  await logSecurityEvent(db, {
    userId: user.id, type: 'recovery_signin',
    ip, userAgent: request.headers.get('User-Agent') || '',
  });

  // Issue pending session — passkeys and existing sessions untouched
  const pendingToken = await createPendingSession(env.AUTH_KV, { userId: user.id, email });
  return json({ ok: true, pendingToken });
}

// POST /api/auth/recovery/verify-totp
// Alternative second factor for account recovery: verifies the user's TOTP code
// instead of the email OTP. Only available if the user had TOTP enabled.
// Issues the same recovery_gate token as /recovery/verify.
export async function recoveryVerifyTOTP(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, totpCode } = body;
  if (!email || !totpCode) return json({ error: 'Missing fields' }, 400);

  const pendingRaw = await env.AUTH_KV.get(`recovery_totp_pending:${email}`);
  if (!pendingRaw) return json({ error: 'No recovery in progress or session expired.' }, 400);

  const { userId } = JSON.parse(pendingRaw);

  const db = env.varun_portfolio_auth;
  const user = await db
    .prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?')
    .bind(userId)
    .first();

  if (!user?.totp_enabled || !user?.totp_secret) return json({ error: 'Invalid code.' }, 400);
  if (!env.TOTP_ENCRYPTION_KEY) return json({ error: 'TOTP not configured.' }, 503);

  let secret;
  try {
    secret = await decryptTotpSecret(user.totp_secret, env.TOTP_ENCRYPTION_KEY);
  } catch {
    return json({ error: 'Invalid code.' }, 400);
  }

  if (!await verifyTotp(secret, totpCode)) return json({ error: 'Invalid code.' }, 400);

  await env.AUTH_KV.delete(`recovery_totp_pending:${email}`);

  await deleteAllPasskeyCredsByUserId(db, userId);
  await deleteAllSessionsByUserId(db, userId);

  await logSecurityEvent(db, {
    userId, type: 'account_recovery',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
  });

  const recoveryToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.AUTH_KV.put(
    `recovery_gate:${recoveryToken}`,
    JSON.stringify({ userId, email }),
    { expirationTtl: 300 },
  );

  return json({ ok: true, recoveryToken, email });
}

// POST /api/auth/recovery/verify
// Verifies the OTP sent in /recovery/start, then issues a recovery_gate token.
// Client uses recoveryToken in /passkey/register/options to re-register.
export async function recoveryVerify(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, otp } = body;
  if (!email || !otp) return json({ error: 'Missing fields' }, 400);

  const stored = await env.AUTH_KV.get(`recovery_otp:${email}`);
  if (!stored || stored !== String(otp)) {
    return json({ error: 'Invalid or expired OTP.' }, 400);
  }
  await env.AUTH_KV.delete(`recovery_otp:${email}`);

  const db = env.varun_portfolio_auth;
  const user = await getUserByEmail(db, email);
  if (!user) return json({ error: 'User not found.' }, 404);

  // Wipe all existing passkeys and sessions — clean slate for re-registration
  await deleteAllPasskeyCredsByUserId(db, user.id);
  await deleteAllSessionsByUserId(db, user.id);

  await logSecurityEvent(db, {
    userId: user.id, type: 'account_recovery',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
  });

  // Issue a recovery gate token (used as recoveryToken in register options)
  const recoveryToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.AUTH_KV.put(
    `recovery_gate:${recoveryToken}`,
    JSON.stringify({ userId: user.id, email }),
    { expirationTtl: 300 },
  );

  return json({ ok: true, recoveryToken, email });
}
