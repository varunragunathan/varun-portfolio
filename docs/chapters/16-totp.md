# Chapter 16 — TOTP (Time-Based One-Time Passwords)

## What You'll Learn

This chapter documents the TOTP implementation: how the secret is generated and encrypted at rest, how the HOTP/TOTP algorithm is implemented from scratch in the Workers runtime, the setup and disable flows, and how TOTP fits into the sign-in page as a backup method alongside passkeys.

---

## 16.1 What TOTP Is

TOTP (Time-Based One-Time Password, RFC 6238) generates a 6-digit code that changes every 30 seconds. The code is derived from a shared secret (stored on both the server and the authenticator app) and the current Unix time divided into 30-second windows. Because the secret is stored in the user's authenticator app (Google Authenticator, Authy, 1Password, etc.) rather than tied to a specific device, TOTP survives device replacement. If a user loses their phone, they can re-install their authenticator app from a backup and retain TOTP access.

In this system, TOTP is a **backup sign-in method** — an alternative path when a passkey is not available on the current device. It is not a second factor stacked on top of a passkey; it is a parallel primary path with the same result: a pending session, then the trust prompt, then an active session.

---

## 16.2 The TOTP Secret: Zero-Dependency Implementation

The Workers runtime does not have access to Node.js's `crypto` module and runs under a tight CPU budget. Rather than bundle an npm TOTP library, the implementation uses the Web Crypto API directly.

**Secret generation:**

```js
// worker/auth/totp.js
const secretBytes = crypto.getRandomValues(new Uint8Array(20));
const secret      = base32Encode(secretBytes);
```

20 bytes (160 bits) of cryptographically random entropy is encoded in base32. Base32 is the standard encoding for TOTP secrets because it avoids characters that look similar (`0` vs `O`, `1` vs `l`) and is what authenticator apps expect in the `otpauth://` URI.

**The HOTP function:**

TOTP is built on top of HOTP (HMAC-based OTP, RFC 4226). HOTP generates a code from a secret and a counter. TOTP sets the counter to `floor(unix_time / 30)`.

```js
// worker/auth/totp.js
async function hotp(secret, counter) {
  const keyBytes = base32Decode(secret);
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, BigInt(counter), false); // big-endian 8-byte counter

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = sig[19] & 0xf;
  const code   = ((sig[offset] & 0x7f) << 24)
               | (sig[offset + 1] << 16)
               | (sig[offset + 2] << 8)
               |  sig[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
```

This is a direct implementation of the HOTP dynamic truncation algorithm from RFC 4226, §5.4. The last byte of the HMAC determines the offset; 4 bytes starting at that offset are masked and taken modulo 10^6 to produce the 6-digit code.

**Verification with clock-skew tolerance:**

```js
// worker/auth/totp.js
export async function verifyTotp(secret, inputCode) {
  const t = Math.floor(Date.now() / 1000 / 30);
  for (const step of [t - 1, t, t + 1]) {
    if (await hotp(secret, step) === String(inputCode).trim()) return true;
  }
  return false;
}
```

A ±1 step window (±30 seconds) is the standard tolerance. This handles clock skew between the authenticator device and the server without meaningfully widening the attack surface.

---

## 16.3 Secret Encryption at Rest

The TOTP secret is a long-lived value — it must survive account sign-outs and only changes if the user disables and re-enables TOTP. If the D1 database were exfiltrated, an attacker with the plaintext secret could generate valid codes for any user indefinitely.

To protect against this, secrets are encrypted before storage using **AES-256-GCM** and a server-side key:

```js
// worker/auth/totp.js
async function deriveKey(keyStr) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keyStr));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptTotpSecret(plaintext, keyStr) {
  const key = await deriveKey(keyStr);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)
  );
  return `${toB64url(iv)}.${toB64url(new Uint8Array(enc))}`;
}
```

The encryption key is derived from `env.TOTP_ENCRYPTION_KEY`, a secret stored via `npx wrangler secret put TOTP_ENCRYPTION_KEY`. The stored value in D1 is `{iv_base64url}.{ciphertext_base64url}`. A fresh random IV is generated for every encryption operation, so two encryptions of the same secret produce different stored values. AES-GCM includes an authentication tag, so any tampering with the ciphertext is detected on decryption.

**If `TOTP_ENCRYPTION_KEY` is not set**, the setup and sign-in routes return HTTP 503 (`TOTP not configured`). This prevents accidental plaintext storage if the secret is not deployed.

---

## 16.4 The Setup Flow

TOTP enrollment is a two-step process that ensures the user has successfully configured their authenticator app before the secret is committed to the database.

**Step 1 — Generate and display (`POST /api/auth/totp/setup`)**

The server generates a random 20-byte secret, stores it in KV under `totp_pending:{userId}` with a 10-minute TTL, and returns both the raw base32 secret and the `otpauth://` URI:

```js
// worker/auth/totp.js
function buildOtpUri(secret, email) {
  const issuer  = 'varunr.dev';
  const account = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${account}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
```

The frontend uses `qrcode.react` to render the URI as a QR code, which the user scans with their authenticator app. The raw secret is also displayed as a text string for manual entry.

**Step 2 — Verify first code (`POST /api/auth/totp/enable`)**

The user types the code their app shows. The server:
1. Reads the pending secret from KV
2. Calls `verifyTotp(secret, code)` to confirm the app is properly configured
3. Encrypts the secret with `env.TOTP_ENCRYPTION_KEY`
4. Writes the encrypted value to `users.totp_secret` and sets `totp_enabled = 1`
5. Deletes the KV pending entry
6. Logs a `totp_enabled` security event

The two-step design ensures a misconfigured authenticator app is caught before the secret is persisted. If the user scans the QR incorrectly or their app has clock skew beyond ±30 seconds, the enable call fails and they can restart setup.

---

## 16.5 The Disable Flow

Disabling TOTP requires a step-up authentication — the same passkey re-authentication used before account deletion. This prevents an attacker who hijacks an active session from silently removing the user's backup method:

```js
// worker/auth/totp.js — POST /api/auth/totp/disable
const { stepUpToken } = await request.json().catch(() => ({}));
const valid = await consumeStepUpToken(env.AUTH_KV, stepUpToken, session.userId);
if (!valid) return json({ error: 'Step-up verification required' }, 403);

await env.varun_portfolio_auth
  .prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?')
  .bind(session.userId)
  .run();
```

The `stepUpToken` is a short-lived (2-minute) KV token issued after a successful passkey re-authentication. See [Chapter 10](./10-step-up-authentication.md) for the step-up mechanism.

---

## 16.6 TOTP Sign-In

TOTP sign-in (`POST /api/auth/totp/signin`) is an unauthenticated route — it does not require an existing session. It accepts `{ email, code }` and follows the same security posture as other sign-in paths:

```js
// worker/auth/totp.js
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
```

**Anti-enumeration:** The same `deny()` response is returned whether the email does not exist, TOTP is not enrolled, or the code is wrong. An attacker probing the endpoint cannot distinguish between "this email has no account" and "this email exists but TOTP is not enabled."

**Result:** A `pendingToken` is returned, which the frontend exchanges through the trust-device modal into a full session (the same flow as passkey sign-in). See [Chapter 7](./07-session-management.md) for the pending→active session transition.

---

## 16.7 KV Keys Added by TOTP

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `totp_pending:{userId}` | Base32 secret string | 600s (10 min) | Pending TOTP secret awaiting first-code confirmation |

The active TOTP secret does not use KV — it is stored encrypted in D1 (`users.totp_secret`). KV is only used for the pending setup window.

---

## 16.8 Security Properties

**What is protected:**
- The TOTP secret is never stored in plaintext in D1. AES-256-GCM with a Wrangler secret key means a D1 exfiltration does not yield usable TOTP secrets.
- Disabling TOTP requires step-up authentication, preventing session hijacking from silently removing backup access.
- The sign-in path uses anti-enumeration to avoid leaking account existence.

**Known limitations:**
- There is no rate limiting on `POST /api/auth/totp/signin`. An attacker who knows a valid email and that TOTP is enabled could attempt many codes per 30-second window. Adding a KV-based rate limit (3 attempts per window per email) would close this.
- TOTP does not provide replay protection within the 90-second validity window. A code captured in transit could be reused within that window. For the threat model of a personal portfolio site, this is acceptable.
- The `TOTP_ENCRYPTION_KEY` is a Wrangler secret, not a Hardware Security Module (HSM). A compromise of Cloudflare's secret storage would expose the key and thus all secrets. This is a standard tradeoff for serverless deployments.

---

## Key Takeaways

- TOTP is implemented from scratch using Web Crypto API (HMAC-SHA-1), with no npm dependencies, to stay within the Workers CPU budget.
- Secrets are encrypted with AES-256-GCM before storage in D1. A D1 breach does not yield usable TOTP secrets.
- Setup is a two-step flow: generate secret in KV → user scans QR → verify first code → encrypt and save to D1. This ensures the authenticator app is correctly configured before committing.
- Disabling requires step-up authentication to prevent silent removal by a hijacked session.
- TOTP sign-in results in a pending session, then the standard trust-device → active session flow — identical to passkey sign-in.
