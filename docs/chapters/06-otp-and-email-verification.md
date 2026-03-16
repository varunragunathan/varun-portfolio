# Chapter 6 — OTP and Email Verification

## What You'll Learn

This chapter covers the one-time password system used to verify email ownership before passkey registration and as a second factor in full account recovery. It explains the rate limiting design, how codes are generated securely, the TTL strategy, and the anti-enumeration properties.

---

## 6.1 Why OTP Is Used

Passkeys prove device ownership — the user possesses a device with the right private key. But registering a passkey for the first time requires first proving that the user controls the email address they are claiming. Without this gate, anyone could register a passkey for `victim@gmail.com` and claim ownership of an account they don't have.

The OTP step fills this role. It is used in two places:

1. **New account registration:** Before the passkey registration ceremony begins, the user must prove they control the email address by entering a 6-digit code sent to that address.

2. **Full account recovery:** As the second factor (alongside a recovery code) before all existing passkeys and sessions are wiped and a new passkey is registered.

OTP is *not* used as an ongoing second factor for regular sign-in. Passkeys already provide strong proof of device possession. Adding OTP to every sign-in would make the system less convenient without adding meaningful security (it would reintroduce phishable codes as part of the normal flow).

---

## 6.2 Code Generation

```js
// worker/auth/otp.js lines 21-27
function generateOTP() {
  // Use crypto.getRandomValues for cryptographically secure randomness.
  // Never use Math.random() for security-sensitive codes.
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(array[0] % 1_000_000).padStart(6, '0');
}
```

This generates a 6-digit code in the range `000000`–`999999`. Using `crypto.getRandomValues` rather than `Math.random()` is essential for security codes. `Math.random()` is a deterministic PRNG; its output can be predicted if its seed is known. `crypto.getRandomValues` is backed by the operating system's CSPRNG.

The modulo operation (`% 1_000_000`) produces a uniform distribution across all 6-digit codes. The `padStart(6, '0')` ensures codes like `000042` are displayed correctly.

---

## 6.3 Storage and TTL

When an OTP is sent, two KV entries are created:

```js
// worker/auth/otp.js lines 47-51
await env.AUTH_KV.put(`otp:${email}`, JSON.stringify({ code: otp, used: false }), {
  expirationTtl: OTP_TTL, // 600 seconds = 10 minutes
});
await env.AUTH_KV.put(rateLimitKey, String(attempts + 1), { expirationTtl: OTP_TTL });
```

The `otp:{email}` key stores the code with a `used` flag. The `otp_rate:{email}` key stores the send count for rate limiting.

**Why store a `used` flag rather than just deleting the key?** The single-use property must be enforced atomically. If the code was simply deleted on first successful verify, a race condition could theoretically allow two concurrent requests with the same correct code to both succeed before either delete propagates. Marking as `used: true` and checking that flag at verify time prevents this.

After marking a code as used, the key is kept with a short TTL (60 seconds) rather than deleted immediately:

```js
// worker/auth/otp.js lines 88-93
await env.AUTH_KV.put(
  `otp:${email}`,
  JSON.stringify({ code: savedCode, used: true }),
  { expirationTtl: 60 } // keep briefly so the key exists, then auto-expire
);
```

This brief retention prevents a second attempt from receiving an "Invalid or expired code" error that looks identical to "code not found" — the `used: true` check gives a consistent error for truly invalid codes regardless of timing.

---

## 6.4 Verification Flow

```js
// worker/auth/otp.js lines 73-99
export async function verifyOTP(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, code } = body;
  if (!email || !code) return json({ error: 'Missing fields' }, 400);

  const raw = await env.AUTH_KV.get(`otp:${email}`);
  if (!raw) return json({ error: 'Invalid or expired code' }, 400);

  const { code: savedCode, used } = JSON.parse(raw);

  if (used || savedCode !== String(code).trim()) {
    return json({ error: 'Invalid or expired code' }, 400);
  }

  // Mark as used immediately...
  await env.AUTH_KV.put(`otp:${email}`, JSON.stringify({ code: savedCode, used: true }), { expirationTtl: 60 });

  // Grant a 5-minute window to complete passkey registration
  await env.AUTH_KV.put(`email_verified:${email}`, '1', { expirationTtl: 300 });

  return json({ ok: true });
}
```

On success, an `email_verified:{email}` key is written with a 5-minute TTL. The passkey registration endpoint checks for this key:

```js
// worker/auth/passkey.js lines 52-53
const verified = await env.AUTH_KV.get(`email_verified:${email}`);
if (!verified) return json({ error: 'Email not verified. Please complete OTP verification first.' }, 403);
```

This creates a time-bounded gate: the user has 5 minutes to complete the passkey registration ceremony after verifying their email. The key is deleted after successful registration.

---

## 6.5 Rate Limiting Design

The rate limit is 3 OTP sends per email per 10 minutes:

```js
// worker/auth/otp.js lines 37-42
const rateLimitKey = `otp_rate:${email}`;
const attempts = parseInt((await env.AUTH_KV.get(rateLimitKey)) || '0');
if (attempts >= 3) {
  return json({ error: 'Too many attempts. Please wait 10 minutes.' }, 429);
}
```

The rate limit window is the same as the OTP TTL (600 seconds). This means the rate limit naturally resets when the OTP window expires — no separate cleanup is needed.

**Limitations of this rate limit design:**

This is email-scoped, not IP-scoped. An attacker who has a list of email addresses can bombard each one with exactly 3 OTP requests before the rate limit kicks in. An IP-based rate limit would be more robust. The current design is acceptable for a low-traffic portfolio site but is called out in [Chapter 12](./12-security-analysis.md).

The rate limit also does not distinguish between "send attempts" and "verify attempts." A user who requests 3 codes and fails to verify any of them is locked out for 10 minutes, which is a mild but real UX inconvenience. A separate verify-attempts counter (e.g., max 5 wrong codes before throttling) would be a production improvement.

---

## 6.6 Anti-Enumeration

A consistent goal throughout the auth system is to not reveal whether an email address is registered. The OTP send endpoint always responds `{ ok: true }`:

```js
// worker/auth/otp.js lines 68-69
// Always return the same response regardless of whether the email exists in our DB.
// This prevents an attacker from discovering which emails are registered.
return json({ ok: true });
```

This means an attacker cannot use the `/otp/send` endpoint to probe which email addresses have accounts. The email is always "sent" from the client's perspective.

The email is actually sent in all cases (even for unregistered emails, the Resend API call happens). For unregistered addresses, the email delivery may fail silently — but the response to the caller is identical.

In practice this is slightly asymmetric: if the email is sent only for registered users, an attacker who gets the email is confirming an account exists. But preventing that revelation requires additional logic that adds cost (sending to non-existent addresses). The current design chooses simplicity.

---

## 6.7 The Email Template

The OTP email is sent via [Resend](https://resend.com), a developer-focused email API:

```js
// worker/auth/otp.js lines 52-66
const resend = new Resend(env.RESEND_API_KEY);
await resend.emails.send({
  from: 'Varun <noreply@varunr.dev>',
  to: email,
  subject: `${otp} is your sign-in code`,
  html: `
    <div style="font-family:'IBM Plex Mono',monospace;...">
      <div>${otp}</div>
      <p>Expires in 10 minutes. Do not share this code with anyone.</p>
    </div>
  `,
});
```

The `RESEND_API_KEY` is an environment secret configured in the Cloudflare Workers dashboard (not in `wrangler.toml`). It is not committed to source control.

---

## 6.8 Where This Could Fail or Be Abused

**OTP in recovery flow uses `Math.random()`:** The recovery OTP in `worker/auth/recovery.js` line 98 uses `Math.floor(100000 + Math.random() * 900000)` instead of `crypto.getRandomValues`. This is a quality issue — `Math.random()` is not a CSPRNG. For recovery codes specifically, predictability would allow an attacker who can observe timing or other side-channels to predict the OTP. In the Workers runtime, `Math.random()` is seeded per isolate, which somewhat limits predictability, but this should be `crypto.getRandomValues` for production use.

**Email deliverability.** If Resend's API is unavailable or the sending domain (`varunr.dev`) is on a spam list, OTP delivery fails silently. The `sendOTP` call is not wrapped in a retry mechanism. A failed send results in the user not receiving their code, with no indication to the server that this happened.

**Resend API key rotation.** The `RESEND_API_KEY` is a single long-lived API key. If compromised, an attacker could send emails on behalf of the domain. A production deployment should rotate this key periodically and use Resend's IP allowlisting feature.

---

## Key Takeaways

- OTP proves email ownership before passkey registration and as a second factor in full account recovery.
- Codes are generated with `crypto.getRandomValues` — never `Math.random()` — for cryptographic security.
- Codes are single-use: marked as `used: true` on first verify, preventing replay attacks even in concurrent request scenarios.
- The `email_verified:{email}` KV gate has a 5-minute TTL; the passkey registration must complete within this window.
- Rate limiting is email-scoped (3 sends per 10 minutes), which is adequate for this use case but would need IP-based hardening for a larger deployment.
- The recovery OTP in `recovery.js` uses `Math.random()` rather than `crypto.getRandomValues` — a noted improvement for production.
