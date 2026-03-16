# Chapter 12 — Security Analysis

## What You'll Learn

This chapter is an honest, thorough analysis of the security model. It covers what is well-designed, what has known limitations, and what is missing for a production deployment. The goal is not to criticize the design but to document it accurately so future developers (and the author) understand the true security posture.

---

## 12.1 What Is Well-Designed

### No Passwords

The most significant security property of this system is the absence of passwords. There are no password hashes to crack, no password reuse to exploit, no phishing targets. WebAuthn passkeys are site-specific, cryptographically strong, and resistant to phishing by design.

### No Plaintext Tokens in the Database

Session tokens are never stored in plaintext. The D1 sessions table stores `token_hash` — the SHA-256 of the raw token. The raw token exists only in:
- The browser's cookie storage (client-side)
- KV, keyed by the hash (not the token itself)

A complete D1 database breach yields no usable session tokens.

Similarly, recovery codes are stored as PBKDF2-SHA256 hashes with per-code salts. A database breach yields hashed codes that resist brute-force for random-code entropy levels.

### Cookie Security

The session cookie has all three protective attributes:
- `HttpOnly` — not accessible to JavaScript, blocks XSS token theft
- `Secure` — only transmitted over HTTPS, blocks network interception
- `SameSite=Strict` — not sent on cross-site requests, blocks CSRF

### Anti-Enumeration

The system avoids leaking information about which email addresses are registered:
- OTP send always returns `{ ok: true }` regardless of whether the email is in D1
- Auth options for unknown emails return a structurally identical response with a fake challenge
- Recovery sign-in returns "Invalid recovery code" for both unknown email and wrong code

### Rate Limiting

Rate limits are in place for:
- OTP sends: 3 per email per 10 minutes
- Full recovery start: 3 per email per 10 minutes
- Backup recovery sign-in: 3 per email per 10 minutes

### Account Freezing

When all 8 recovery codes are exhausted through failed attempts, the account is frozen for 1 hour. This prevents iterative brute-force of recovery codes.

### Step-Up Authentication

Account deletion requires a fresh passkey gesture (with `userVerification: 'required'`) and email confirmation, even within an active session.

### KV Revocation Fix

The revocation bug (described in [Chapter 7](./07-session-management.md)) was identified and fixed. Session revocation now correctly purges both D1 and KV entries.

### Number Matching with Trusted Device Gate

Number matching can only be approved by sessions with `trusted = 1`. A session cookie obtained through a stolen, untrusted device cannot be used to approve new devices. This limits the blast radius of a compromised untrusted session.

---

## 12.2 Known Limitations

### KV Eventual Consistency

Cloudflare KV is eventually consistent. After a session is revoked (KV entry deleted), the deletion propagates globally within seconds. During that window, a revoked session cookie used at a distant edge location might still succeed.

**Risk level:** Low. The window is small (seconds), requires the attacker to be at a specific edge location, and the session has already been revoked so the next KV read will confirm revocation. In practice, an attacker exploiting this would need to know the exact moment of revocation and route their request through a specific edge node — an impractical attack for a personal portfolio.

**Production mitigation:** Use [Cloudflare Workers for Platforms](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/) with KV in "no-cache" mode, or use D1 for session validation (slower but strongly consistent). Alternatively, accept this limitation as inherent to KV-based session management.

### PBKDF2 Iteration Count (100 Iterations)

The `ITERATIONS = 100` constant in `worker/auth/crypto.js` is far below production recommendations. NIST SP 800-132 (2023) recommends ≥ 600,000 iterations for password hashing.

**Why it matters less here:** Recovery codes have 50 bits of entropy. Even at 100 iterations (fast hashing), an attacker can compute perhaps 10,000,000 hashes/second on modern hardware. To exhaustively search 2^50 ≈ 10^15 possible codes would take over 100 years. The low iteration count does not meaningfully weaken recovery code security.

**Why it matters if the threat model changes:** If the recovery code format were ever changed to allow shorter or user-chosen codes, 100 iterations would be catastrophically weak. The current design is secure *for random codes only*.

**Production recommendation:** Increase to at least 10,000 iterations once the Workers CPU budget allows (e.g., by upgrading to a paid Workers plan or using Workers with higher CPU limits, or by using async workers that can run longer operations).

### Synced Passkeys and Counter Rollback

The sign count check exempts counters of `0` (`if (newCounter > 0 && newCounter <= cred.sign_count)`). Synced passkeys often return 0 on every use. This means a cloned synced passkey cannot be detected by the counter check.

**Risk level for this use case:** Low. Cloning a synced passkey requires access to the platform's cloud service (iCloud, Google Account) — a significant attack, not a casual one.

**Production mitigation:** This is a fundamental limitation of the WebAuthn spec's treatment of synced credentials. There is no perfect solution. The system could be made more conservative (treat any 0 counter as anomalous), but this would block legitimate synced passkeys.

### No CSRF Token (Relying on SameSite=Strict)

The system uses `SameSite=Strict` cookies rather than CSRF tokens. `SameSite=Strict` is widely supported (all modern browsers) and is the recommended approach for protecting cookie-based auth from CSRF.

**The gap:** `SameSite=Strict` protection depends on browser enforcement. Older browsers (pre-2020) may not honor it. If the target audience includes users on legacy browsers, an explicit CSRF token would be a safer belt-and-suspenders approach.

**For this use case:** The site targets modern users (it uses passkeys, which require modern browsers). `SameSite=Strict` is adequate.

### Recovery OTP Uses `Math.random()`

In `worker/auth/recovery.js` line 98:
```js
const otp = String(Math.floor(100000 + Math.random() * 900000));
```

This should be `crypto.getRandomValues`. The Workers runtime seeds `Math.random()` per isolate, so predictability is somewhat limited, but this is not a CSPRNG and should not be used for security codes.

**Risk:** An attacker who can observe the isolate's other `Math.random()` outputs (unlikely but theoretically possible) could predict the OTP.

### Recovery Full Flow Does Not Clean Up KV Sessions

`deleteAllSessionsByUserId` removes D1 session rows but does not delete the corresponding KV `session:{tokenHash}` entries. After a full account recovery (which calls this function), existing session cookies remain valid in KV until their TTL expires.

**Risk:** An attacker who has a valid session cookie can continue using it for up to 30 days after the account recovery completes. The victim would see no active sessions in the dashboard (D1 is empty) but their account is still accessible via the attacker's cookie.

**Fix required for production:** Before `deleteAllSessionsByUserId`, fetch all active sessions, collect their `token_hash` values, and delete the corresponding KV entries.

### Email as Root of Trust for Full Recovery

The full account recovery flow's second factor is an OTP sent to the email address. If the email account is compromised, the attacker can complete the full recovery flow — wipe the victim's passkeys and register their own.

**This is inherent to email-based recovery.** There is no technically perfect solution without a hardware second factor (which adds friction). The design acknowledges this and provides the account-freeze mechanism as a deterrent.

**Mitigation:** The full recovery is two-factor (recovery code + OTP), not just OTP. The attacker needs *both* the recovery code (which should be stored offline) and the email (which they control). Getting only one is not sufficient.

### Rate Limits Are Email-Scoped, Not IP-Scoped

All rate limits (OTP, recovery start, recovery sign-in) are scoped to the email address, not the client IP. An attacker with a list of email addresses can make 3 attempts per address per 10 minutes without being blocked.

**Production mitigation:** Add IP-based rate limiting as an outer layer. Cloudflare itself provides IP rate limiting at the network level (Cloudflare Rate Limiting product), which doesn't require Worker code changes.

---

## 12.3 What's Missing for Production

### No TOTP

Time-based one-time passwords (TOTP, the "Google Authenticator" codes) are listed as a planned feature. TOTP would provide a fallback that is independent of email — if both the passkey and email access are lost (but the user saved TOTP setup), they could still authenticate. See [Chapter 14](./14-what-could-be-done.md).

### No Audit Log Export

Security events are stored in D1 and shown in the dashboard (last 20). There is no export mechanism. A compliance-focused deployment would need CSV/JSON export of the full event log.

### No Admin Tools

There are no admin endpoints. A frozen account requires database access to unfreeze. A compromised account cannot be remotely killed except through the public revoke-sessions UI. A production deployment needs admin tools (or at the minimum, manual D1 queries to handle edge cases).

### No Geographic Anomaly Detection

Sign-in from a new country is not flagged. A production auth system would log the geolocation of sign-ins (available from Cloudflare's `CF-IPCountry` header) and alert users when sign-ins occur from unusual locations.

### No Device Attestation Verification

The WebAuthn registration response includes attestation data — a cryptographic certificate from the authenticator manufacturer proving the device is a legitimate authenticator. This implementation uses `@simplewebauthn/server`'s defaults, which accept any attestation format including `none`. A high-security deployment would reject unattested credentials or require specific attestation levels.

### Session Hijacking Detection

There is no mechanism to detect if a session cookie has been stolen and used from a different IP or User-Agent. The `ip` and `user_agent` are logged at session creation but not compared on subsequent requests.

---

## Key Takeaways

- The security model is strong where it counts: no passwords, no plaintext tokens, good cookie flags, anti-enumeration, step-up for destructive actions.
- Known limitations are real but acceptable for the stated use case (personal portfolio with low-risk threat model). They are documented here for transparency.
- Two gaps require fixing before production use at higher risk levels: the recovery flow's failure to clean KV session entries, and the recovery OTP using `Math.random()`.
- Email as a recovery root of trust is inherent and acknowledged. The two-factor design (code + OTP) mitigates but does not eliminate this risk.
- The PBKDF2 iteration count (100) is the most visually alarming limitation but is the least practically dangerous, given the random-code entropy.
