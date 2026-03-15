// ── OTP send + verify ─────────────────────────────────────────────
// Flow: user enters email → 6-digit OTP sent via Resend →
//       user enters OTP → email marked verified for 5 min →
//       passkey registration can proceed.
//
// Security properties:
//   - Codes are single-use (marked used immediately on first verify)
//   - 10 min TTL, self-destructs from KV automatically
//   - Rate-limited to 3 sends per email per 10 min window
//   - Identical response for registered and unregistered emails (prevents enumeration)

import { Resend } from 'resend';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function generateOTP() {
  // Use crypto.getRandomValues for cryptographically secure randomness.
  // Never use Math.random() for security-sensitive codes.
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1_000_000).padStart(6, '0');
}

// POST /api/auth/otp/send
export async function sendOTP(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  // Rate limit: max 3 OTP requests per email per 10 minutes
  const rateLimitKey = `otp_rate:${email}`;
  const attempts = parseInt((await env.AUTH_KV.get(rateLimitKey)) || '0');
  if (attempts >= 3) {
    return json({ error: 'Too many attempts. Please wait 10 minutes.' }, 429);
  }

  const otp = generateOTP();
  const OTP_TTL = 600; // 10 minutes

  await env.AUTH_KV.put(`otp:${email}`, JSON.stringify({ code: otp, used: false }), {
    expirationTtl: OTP_TTL,
  });
  await env.AUTH_KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: OTP_TTL });

  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Varun <noreply@varunr.dev>',
    to: email,
    subject: `${otp} is your sign-in code`,
    html: `
      <div style="font-family:'IBM Plex Mono',monospace;max-width:420px;margin:0 auto;padding:48px 24px;background:#0a0a0a;color:#e5e5e5;border-radius:12px;">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#6b7280;margin-bottom:32px;">varunr.dev</div>
        <p style="font-size:14px;color:#9ca3af;margin-bottom:16px;">Your one-time sign-in code:</p>
        <div style="font-size:40px;font-weight:300;letter-spacing:0.3em;color:#ffffff;margin:24px 0;">${otp}</div>
        <p style="font-size:12px;color:#4b5563;margin-top:32px;">Expires in 10 minutes. Do not share this code with anyone.</p>
      </div>
    `,
  });

  // Always return the same response regardless of whether the email exists in our DB.
  // This prevents an attacker from discovering which emails are registered.
  return json({ ok: true });
}

// POST /api/auth/otp/verify
export async function verifyOTP(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, code } = body;
  if (!email || !code) return json({ error: 'Missing fields' }, 400);

  const raw = await env.AUTH_KV.get(`otp:${email}`);
  if (!raw) return json({ error: 'Invalid or expired code' }, 400);

  const { code: savedCode, used } = JSON.parse(raw);

  // Reject if already used or code doesn't match
  if (used || savedCode !== String(code).trim()) {
    return json({ error: 'Invalid or expired code' }, 400);
  }

  // Mark as used immediately — a second attempt with the same code will fail
  await env.AUTH_KV.put(
    `otp:${email}`,
    JSON.stringify({ code: savedCode, used: true }),
    { expirationTtl: 60 } // keep briefly so the key exists, then auto-expire
  );

  // Grant a 5-minute window to complete passkey registration
  await env.AUTH_KV.put(`email_verified:${email}`, '1', { expirationTtl: 300 });

  return json({ ok: true });
}
