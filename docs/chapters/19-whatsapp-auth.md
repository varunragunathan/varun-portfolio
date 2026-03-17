# Chapter 19 — WhatsApp Backup Authentication

## What You'll Learn

This chapter documents the WhatsApp OTP backup authentication feature: what it is, how it integrates with Twilio's WhatsApp Sandbox, how the OTP flow works in both the security settings and the sign-in page, and the security properties of the design.

---

## 19.1 What This Feature Is

WhatsApp backup authentication allows a user to register a phone number and, when their passkey is unavailable, receive a 6-digit OTP via WhatsApp message and use it to sign in. Like TOTP (Chapter 16), this is a **backup sign-in method** — a parallel path that results in a pending session, then the standard trust-device flow.

The feature uses Twilio's WhatsApp Sandbox, which is free and requires no template approval from Meta. The tradeoff is that each user must perform a one-time opt-in by texting a keyword to Twilio's sandbox number (`+1 415 523 8886`) before they can receive messages.

**When to use this vs TOTP:** TOTP requires no external service but demands that the user has an authenticator app configured. WhatsApp backup requires a phone number and Twilio credentials but is more familiar to non-technical users who already use WhatsApp.

---

## 19.2 Twilio Integration

The only outbound call the feature makes is to Twilio's Messages API:

```js
// worker/auth/whatsapp.js
async function sendWhatsAppOTP(phone, code, env) {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken  = env.TWILIO_AUTH_TOKEN;
  const from       = env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

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
}
```

**Credentials:** `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are Cloudflare secrets — not in `wrangler.toml`, not in source control. They are set via `npx wrangler secret put` and are available as `env.TWILIO_ACCOUNT_SID` / `env.TWILIO_AUTH_TOKEN` in the Worker. The `TWILIO_WHATSAPP_FROM` number is a non-secret env var (it is the Twilio sandbox number, public information).

---

## 19.3 Phone Number Handling

Phone numbers are normalized before storage and transmission:

```js
// worker/auth/whatsapp.js
function normalizePhone(raw) {
  const n = (raw || '').replace(/[\s\-().]/g, '');
  if (!n.startsWith('+')) return null;
  if (!/^\+\d{7,15}$/.test(n)) return null;
  return n;
}
```

The function strips spaces, dashes, parentheses, and dots, then validates that the result starts with `+` and contains 7–15 digits (the E.164 format range). Numbers that do not pass are rejected with a 400 error. Normalized numbers are stored in D1 (`users.phone_number`).

For display, phone numbers are masked to prevent the full number from being shown in the UI:

```js
export function maskPhone(phone) {
  if (!phone || phone.length < 6) return '***';
  return phone.slice(0, 3) + '***' + phone.slice(-3);
}
```

`+14155238886` → `+14***886`. The first three characters (country code and first digit) and last three characters are shown, with the middle replaced by `***`.

---

## 19.4 OTP Generation and Rate Limiting

OTPs are 6-digit numeric codes:

```js
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
```

Rate limiting prevents OTP abuse:

```js
async function checkRate(kv, userId) {
  const key   = `wa_rate:${userId}`;
  const count = parseInt((await kv.get(key)) || '0', 10);
  if (count >= RATE_MAX) return false;  // RATE_MAX = 3
  await kv.put(key, String(count + 1), { expirationTtl: RATE_TTL });  // RATE_TTL = 600
  return true;
}
```

A maximum of 3 OTPs may be sent per 10-minute window per user. The counter is stored in KV and expires automatically. Exceeding the limit returns HTTP 429.

---

## 19.5 Phone Registration Flow (Settings)

The phone registration flow lives in the Security settings page under "WhatsApp backup":

**Step 1 — Enter phone number:**
- User enters their phone number in E.164 format (e.g., `+1 415 555 0100`)
- Frontend calls `POST /api/auth/whatsapp/send-otp` with `{ phoneNumber }`
- Server normalizes the number, rate-checks, generates an OTP, stores it in KV, and sends the WhatsApp message

```
KV key: wa_otp:{userId}
Value:  { code, phone, used: false }
TTL:    600s (10 minutes)
```

**Step 2 — Verify code:**
- User enters the 6-digit code received on WhatsApp
- Frontend calls `POST /api/auth/whatsapp/confirm` with `{ code }`
- Server reads the pending OTP from KV, verifies the code, marks it `used`, then saves the phone to D1:

```js
await env.varun_portfolio_auth
  .prepare('UPDATE users SET phone_number = ?, phone_verified = 1 WHERE id = ?')
  .bind(stored.phone, session.userId).run();
```

**Verified state:**
- The settings UI shows the masked phone number and a Remove button
- `DELETE /api/auth/whatsapp/phone` clears `phone_number` and sets `phone_verified = 0`

Both adding and removing a phone number are logged as security events (`whatsapp_phone_added`, `whatsapp_phone_removed`).

---

## 19.6 Sign-In Flow (Backup Path)

When a user tries to sign in and their passkey fails or is unavailable, the sign-in page offers a "Try another way" section. If the user has a verified WhatsApp phone number, a WhatsApp option appears:

**Backend detection:** `POST /api/auth/passkey/auth/options` returns `hasWhatsApp: true` when `user.phone_verified === 1`. The frontend stores this flag and shows the button.

**Step 1 — Send OTP (`POST /api/auth/whatsapp/signin/send`):**
- Unlike the settings flow, this endpoint is **unauthenticated** (no session required — the user is trying to sign in)
- Takes `{ userId }` (returned by the earlier passkey options call)
- Looks up the user, verifies a phone number is registered, rate-checks, generates an OTP, stores it in KV, and sends the WhatsApp message

```
KV key: wa_signin:{userId}
Value:  { code, phone: user.phone_number, email: user.email, used: false }
TTL:    600s (10 minutes)
```

**Anti-enumeration:** If the userId does not exist or has no verified phone, the error is vague: `"WhatsApp backup not available for this account"`. This does not confirm or deny whether the user has WhatsApp set up, preventing account enumeration.

**Step 2 — Verify OTP (`POST /api/auth/whatsapp/signin/verify`):**
- Takes `{ userId, code }`
- Verifies the code against `wa_signin:{userId}` in KV
- Marks the KV entry `used: true` (single-use, 60-second TTL after use)
- Creates a pending session with `createPendingSession`
- Logs a `whatsapp_signin` security event

```js
const pendingToken = await createPendingSession(env.AUTH_KV, {
  userId,
  email: stored.email,
});
return json({ ok: true, pendingToken });
```

The `pendingToken` is returned to the frontend, which exchanges it through the trust-device modal into a full session — identical to passkey and TOTP sign-in.

---

## 19.7 KV Keys Added by WhatsApp Auth

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `wa_otp:{userId}` | `{ code, phone, used }` JSON | 600s | Pending phone verification OTP (settings) |
| `wa_signin:{userId}` | `{ code, phone, email, used }` JSON | 600s | Pending sign-in OTP |
| `wa_rate:{userId}` | Count string (`"1"`, `"2"`, `"3"`) | 600s | OTP send rate limit (max 3 per 10 min) |

The `used` flag on each OTP entry prevents replay: once verified, the entry is overwritten with `{ ...stored, used: true }` and a 60-second TTL. Subsequent verification attempts with the same code return "Invalid or expired code."

---

## 19.8 Twilio Sandbox Opt-In

The Twilio WhatsApp Sandbox requires each recipient to opt in before they can receive messages. Users must send a one-time message from their WhatsApp account to `+1 415 523 8886` with the keyword shown in the Twilio Console (under Messaging → Try it out → Send a WhatsApp message).

This is a limitation of the free sandbox tier. The Twilio production WhatsApp API does not require opt-in and supports template-approved messages, but requires business verification and per-message costs. For a proof-of-concept portfolio project, the sandbox is appropriate.

---

## 19.9 Security Properties

**What is protected:**
- Phone numbers are stored in D1 as plaintext but are only used for outbound messaging. The number is masked in the UI (`+14***886`).
- OTPs are single-use. The KV entry is marked `used: true` immediately on successful verification, preventing replay within the TTL window.
- The sign-in path uses anti-enumeration — the error response does not reveal whether the userId has WhatsApp set up.
- Rate limiting (3 OTPs per 10 minutes) limits abuse even if an attacker knows a valid userId.
- Twilio credentials are Wrangler secrets, not in source control.

**Known limitations:**
- The OTP is generated with `Math.random()` rather than `crypto.getRandomValues`. For a 6-digit numeric code used in a rate-limited, single-use context, this is acceptable but not ideal. See [Chapter 14, Section 14.11](./14-what-could-be-done.md) for the fix.
- The Twilio sandbox requires user opt-in, making it unsuitable for a seamless production experience without upgrading to a paid Twilio account.
- WhatsApp OTP delivery depends on Twilio's infrastructure. An outage there blocks this sign-in path. Users should have at least one other backup (TOTP or recovery codes).

---

## Key Takeaways

- WhatsApp backup auth uses Twilio's WhatsApp Sandbox to send 6-digit OTPs to a user's registered phone number.
- Credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) are Wrangler secrets — never in `wrangler.toml` or source control.
- The settings flow has two steps: send OTP to new number → verify code → save to D1. The sign-in flow is unauthenticated and takes `userId` instead of a session.
- OTPs are single-use (marked `used: true` in KV on verification), rate-limited to 3 per 10 minutes, and expire after 10 minutes.
- The result of successful sign-in is a `pendingToken`, entering the same pending→trust→active session flow as all other sign-in methods.
