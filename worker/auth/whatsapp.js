// ── Twilio WhatsApp backup auth ───────────────────────────────────
// Adds a verified phone number to an account (settings only).
// When passkey fails at sign-in, user can receive a WhatsApp OTP
// on their registered phone and exchange it for a pending session.
//
// Uses Twilio WhatsApp Sandbox — free, no template approval needed.
// One-time opt-in: user texts "join <keyword>" to +14155238886 once.
//
// OTPs stored in KV (10-min TTL, single-use):
//   wa_otp:{userId}    — phone verification during settings setup
//   wa_signin:{userId} — sign-in backup OTP
//   wa_rate:{userId}   — rate-limit counter (max 3 / 10 min)

import { getSession, createPendingSession } from './session.js';
import { logSecurityEvent } from '../db.js';
import { getClientIP } from '../utils.js';

const OTP_TTL  = 600; // 10 minutes
const RATE_TTL = 600;
const RATE_MAX = 3;

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

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-3);
}

function normalizePhone(raw) {
  const n = (raw || '').replace(/[\s\-().]/g, '');
  if (!n.startsWith('+')) return null;
  if (!/^\+\d{7,15}$/.test(n)) return null;
  return n;
}

async function checkRate(kv, userId) {
  const key = `wa_rate:${userId}`;
  const count = parseInt((await kv.get(key)) || '0', 10);
  if (count >= RATE_MAX) return false;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_TTL });
  return true;
}

// ── Twilio WhatsApp API ───────────────────────────────────────────
async function sendWhatsAppOTP(phone, code, env) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken  = env.TWILIO_AUTH_TOKEN;
  const from       = env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  const body = new URLSearchParams({
    From: from,
    To:   `whatsapp:${phone}`,
    Body: `Your varunr.dev verification code is ${code}. Valid for 10 minutes. Do not share this code.`,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Twilio error ${res.status}`);
  }

  return res.json();
}

// ── Settings: status ─────────────────────────────────────────────
// GET /api/auth/whatsapp/status
export async function getWhatsAppStatus(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const user = await env.varun_portfolio_auth
    .prepare('SELECT phone_number, phone_verified FROM users WHERE id = ?')
    .bind(session.userId).first();

  return json({
    phoneNumber: user?.phone_number ? maskPhone(user.phone_number) : null,
    verified: user?.phone_verified === 1,
  });
}

// ── Settings: send OTP to new phone ─────────────────────────────
// POST /api/auth/whatsapp/send-otp  { phoneNumber }
export async function sendVerifyOTP(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const { phoneNumber } = await request.json().catch(() => ({}));
  const phone = normalizePhone(phoneNumber || '');
  if (!phone) {
    return json({ error: 'Invalid number. Include country code, e.g. +1 415 555 0100' }, 400);
  }

  if (!(await checkRate(env.AUTH_KV, session.userId))) {
    return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);
  }

  const code = generateOTP();
  await env.AUTH_KV.put(
    `wa_otp:${session.userId}`,
    JSON.stringify({ code, phone, used: false }),
    { expirationTtl: OTP_TTL }
  );

  try {
    await sendWhatsAppOTP(phone, code, env);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  return json({ ok: true, maskedPhone: maskPhone(phone) });
}

// ── Settings: confirm OTP → save phone ──────────────────────────
// POST /api/auth/whatsapp/confirm  { code }
export async function confirmPhone(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const { code } = await request.json().catch(() => ({}));
  if (!code) return json({ error: 'Missing code' }, 400);

  const raw = await env.AUTH_KV.get(`wa_otp:${session.userId}`);
  if (!raw) return json({ error: 'Code expired. Request a new one.' }, 400);

  const stored = JSON.parse(raw);
  if (stored.used || stored.code !== String(code).trim()) {
    return json({ error: 'Invalid or expired code' }, 400);
  }

  await env.AUTH_KV.put(
    `wa_otp:${session.userId}`,
    JSON.stringify({ ...stored, used: true }),
    { expirationTtl: 60 }
  );

  await env.varun_portfolio_auth
    .prepare('UPDATE users SET phone_number = ?, phone_verified = 1 WHERE id = ?')
    .bind(stored.phone, session.userId).run();

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId: session.userId,
    type: 'whatsapp_phone_added',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
    metadata: { maskedPhone: maskPhone(stored.phone) },
  });

  return json({ ok: true, maskedPhone: maskPhone(stored.phone) });
}

// ── Settings: remove phone ───────────────────────────────────────
// DELETE /api/auth/whatsapp/phone
export async function removePhone(request, env) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  await env.varun_portfolio_auth
    .prepare('UPDATE users SET phone_number = NULL, phone_verified = 0 WHERE id = ?')
    .bind(session.userId).run();

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId: session.userId,
    type: 'whatsapp_phone_removed',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
  });

  return json({ ok: true });
}

// ── Sign-in backup: send OTP (public — unauthenticated) ──────────
// POST /api/auth/whatsapp/signin/send  { userId }
export async function sendSigninOTP(request, env) {
  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return json({ error: 'Missing userId' }, 400);

  const user = await env.varun_portfolio_auth
    .prepare('SELECT id, email, phone_number, phone_verified FROM users WHERE id = ?')
    .bind(userId).first();

  if (!user || !user.phone_number || !user.phone_verified) {
    // Vague error to avoid enumeration
    return json({ error: 'WhatsApp backup not available for this account' }, 400);
  }

  if (!(await checkRate(env.AUTH_KV, userId))) {
    return json({ error: 'Too many attempts. Try again in 10 minutes.' }, 429);
  }

  const code = generateOTP();
  await env.AUTH_KV.put(
    `wa_signin:${userId}`,
    JSON.stringify({ code, phone: user.phone_number, email: user.email, used: false }),
    { expirationTtl: OTP_TTL }
  );

  try {
    await sendWhatsAppOTP(user.phone_number, code, env);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  return json({ ok: true, maskedPhone: maskPhone(user.phone_number) });
}

// ── Sign-in backup: verify OTP → pendingToken ────────────────────
// POST /api/auth/whatsapp/signin/verify  { userId, code }
export async function verifySigninOTP(request, env) {
  const { userId, code } = await request.json().catch(() => ({}));
  if (!userId || !code) return json({ error: 'Missing fields' }, 400);

  const raw = await env.AUTH_KV.get(`wa_signin:${userId}`);
  if (!raw) return json({ error: 'Code expired. Request a new one.' }, 400);

  const stored = JSON.parse(raw);
  if (stored.used || stored.code !== String(code).trim()) {
    return json({ error: 'Invalid or expired code' }, 400);
  }

  // Single-use: mark used immediately
  await env.AUTH_KV.put(
    `wa_signin:${userId}`,
    JSON.stringify({ ...stored, used: true }),
    { expirationTtl: 60 }
  );

  const pendingToken = await createPendingSession(env.AUTH_KV, {
    userId,
    email: stored.email,
    method: 'whatsapp',
  });

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId,
    type: 'whatsapp_signin',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
  });

  return json({ ok: true, pendingToken });
}
