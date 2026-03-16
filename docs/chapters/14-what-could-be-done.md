# Chapter 14 — What Could Be Done

## What You'll Learn

This chapter describes future improvements with technical rationale for each. It covers security enhancements, UX improvements, infrastructure maturity, and testing infrastructure. Nothing here is speculative — each item is grounded in a specific gap identified in the current codebase.

---

## 14.1 TOTP as a Second Backup Method

**The gap:** The sign-in page already shows a greyed-out "Use authenticator app (TOTP) — Coming soon" button. Recovery relies on either a passkey or a recovery code + email OTP. If a user has no passkeys, no recovery codes, and their email is compromised, the account is unrecoverable.

**The design:** [TOTP](../glossary/README.md#totp) (Time-Based One-Time Password, RFC 6238) would let users register an authenticator app (Google Authenticator, Authy, 1Password TOTP) as a backup method. TOTP is device-independent (the secret is stored in the app, which can be backed up) and email-independent.

**The tradeoff:** TOTP introduces a new secret to store (the TOTP seed) and a new surface to attack. The seed must be protected in the database with strong encryption. TOTP also has a UX cost — users must set it up and remember to use it.

**Implementation notes:**
- Store the TOTP secret encrypted at rest in D1
- Use a library like `otplib` for generation/validation
- Implement a 30-second window tolerance for clock skew
- Store backup codes alongside TOTP (standard practice)

---

## 14.2 Backup Security Key

**The gap:** The step-up system's comment (`worker/auth/stepUp.js` lines 6–12) lists "Backup security key" as priority 4. A hardware security key (YubiKey, Titan Key) as a registered passkey is already supported — but there is no explicit UI to designate one as a "backup" separate from the primary passkey.

**The design:** The system already supports multiple passkeys per user. The improvement would be:
- Explicit UX to add a passkey and designate it "backup"
- The backup passkey would not be subject to number-matching (it would not trigger the new-device flow if used on an unknown User-Agent, since hardware keys are intentionally moved between devices)

**Implementation note:** This primarily requires UX changes and a new passkey property (`backup: boolean` in the DB), not new cryptographic machinery.

---

## 14.3 Magic Links

**The idea:** Allow sign-in via a time-limited link sent to the email address. The user clicks the link → automatically signed in.

**Why it's useful:** For users who want passwordless but don't yet have a passkey set up on the current device. Magic links can bootstrap passkey registration on a new device.

**Why it's not a priority here:** The recovery code sign-in already covers "sign in without a passkey." Magic links add email as a primary authentication path, which reintroduces the email-as-root-of-trust problem more prominently.

**If implemented:**
- Magic link tokens should be 128 bits of entropy (same as session tokens)
- TTL of 15 minutes
- Single-use (delete from KV on first use)
- Tokens should be scoped to the requester's IP and User-Agent to resist forwarding

---

## 14.4 Admin Dashboard

**The gap:** Account management requires direct database access. If an account is frozen (all recovery codes exhausted), there is no UI to unfreeze it. If a user needs their account wiped for a legitimate support reason, there is no endpoint for it.

**The design:** A separate admin area, protected by a Cloudflare Access policy (not the application's own auth), with endpoints to:
- List users
- View any user's security events
- Freeze / unfreeze accounts
- Force-revoke all sessions for a user
- Delete a user account

**Security note:** Admin endpoints must be separate from the application auth system. Using Cloudflare Access (IP allowlist + email authentication) to gate admin routes is the appropriate pattern.

---

## 14.5 IP-Based Rate Limiting

**The gap:** All rate limits are email-scoped. An attacker can send OTPs or attempt recovery for any email at 3 per 10 minutes.

**The design:** Add an outer layer of IP-based rate limiting. Cloudflare's built-in rate limiting product can enforce rules at the network level without Worker code changes. For Worker-level rate limiting, use:

```js
const ip = request.headers.get('CF-Connecting-IP');
const ipRateKey = `ip_rate:${ip}`;
```

This would complement the email-based limits.

---

## 14.6 Geographic Session Anomaly Detection

**The gap:** Sign-ins from a new country are not flagged. A user in California who suddenly has a sign-in from Russia is not alerted.

**The design:**
- Log `cf.country` (from `request.cf.country`, available in Cloudflare Workers) for each session
- On new sign-in, compare to the user's recent countries
- If the country is new, send an email notification and optionally require additional confirmation

**Implementation note:** Cloudflare Workers always have access to `request.cf` which includes `country`, `colo` (datacenter), and `city`. This data is available without any external geolocation service.

---

## 14.7 WebAuthn Device Attestation Verification

**The gap:** The current implementation uses `@simplewebauthn/server` with default settings, which accept any attestation format including `none` (no attestation). This means any credential claiming to be a WebAuthn credential is accepted, including potential software emulators.

**The design:** For higher-security deployments, verify attestation:
- Accept only `packed` or `tpm` attestation formats
- Verify the attestation certificate chain against the FIDO Metadata Service (MDS)
- Reject credentials with `none` attestation

**Tradeoff:** Many legitimate passkeys (including Apple and Google's platform authenticators) use `indirect` or `none` attestation. Requiring attestation verification would block these users. Only appropriate for enterprise or government use cases.

---

## 14.8 Passkey Management UX Improvements

Several UX improvements for the passkeys section of the Settings page:

**Name on registration:** Currently passkeys are registered without a nickname and display as "Passkey" until renamed. Prompting for a name immediately after registration ("What device is this?") would improve dashboard clarity.

**Last-used freshness indicator:** The "Last used Xd ago" display could include a freshness color (green for recent, amber for months ago, red for never used — possibly a security concern).

**Passkey type icon:** Show a platform icon (Apple logo for iOS, Android logo, etc.) based on the `transport` field or the `authenticator_type`.

**Cross-device registration link:** A button that generates a QR code / passkey link for the user to scan on a second device and register a passkey there. This uses WebAuthn's `hybrid` transport.

---

## 14.9 Fix the KV Session Cleanup on Full Account Recovery

**The specific gap:** `deleteAllSessionsByUserId` removes D1 session rows but not the corresponding KV `session:{tokenHash}` entries. This leaves revoked sessions valid in KV until TTL expiry.

**The fix:** Before deleting D1 session records, collect all `token_hash` values and delete the KV entries:

```js
// In db.js (illustrative fix):
export async function deleteAllSessionsByUserId(db, kv, userId) {
  const sessions = await db
    .prepare('SELECT token_hash FROM sessions WHERE user_id = ?')
    .bind(userId)
    .all();
  await Promise.all(
    sessions.results.map(s => kv.delete(`session:${s.token_hash}`))
  );
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}
```

This requires passing `kv` to `deleteAllSessionsByUserId`, which is a minor API change.

---

## 14.10 Full Test Suite

**The gap:** There is no test coverage. This is a POC/portfolio project — tests were not the priority. But for learning purposes and for any production-scale deployment, a test suite would be valuable.

**Tools:**
- `vitest` — the natural choice for Vite projects (uses the same config)
- `@cloudflare/vitest-pool-workers` — runs tests inside the actual Workers runtime, using real D1 bindings and real KV behavior
- `@simplewebauthn/server` mocking — the library is testable with mock authenticator responses

**Test categories:**
- Unit tests for `worker/auth/crypto.js` (hash/verify round-trips)
- Unit tests for `worker/utils.js` (sha256Hex, inferDeviceName, maskEmail)
- Integration tests for auth flows using mock authenticators
- Session lifecycle tests (create pending → finalise → revoke)
- Recovery flow tests (8-code system, freeze mechanism)

**Example unit test:**
```js
import { describe, it, expect } from 'vitest';
import { generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode } from '../worker/auth/crypto';

describe('recovery codes', () => {
  it('round-trips correctly', async () => {
    const code = generateRecoveryCode();
    const { hash, salt } = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code, hash, salt)).toBe(true);
    expect(await verifyRecoveryCode('WRONG-CODE', hash, salt)).toBe(false);
  });

  it('normalizes case and hyphens', async () => {
    const code = generateRecoveryCode();
    const { hash, salt } = await hashRecoveryCode(code);
    expect(await verifyRecoveryCode(code.toLowerCase(), hash, salt)).toBe(true);
    expect(await verifyRecoveryCode(code.replace('-', ''), hash, salt)).toBe(true);
  });
});
```

---

## 14.11 Fix the Recovery OTP `Math.random()` Usage

**The gap:** `worker/auth/recovery.js` line 98 generates the recovery OTP using `Math.random()` instead of `crypto.getRandomValues`.

**The fix:**

```js
// Replace:
const otp = String(Math.floor(100000 + Math.random() * 900000));

// With:
const arr = new Uint32Array(1);
crypto.getRandomValues(arr);
const otp = String(100000 + (arr[0] % 900000));
```

This is a one-line fix that brings the recovery OTP in line with the regular OTP generation in `worker/auth/otp.js`.

---

## Key Takeaways

- TOTP and backup security key would round out the recovery options and reduce email dependency.
- IP-based rate limiting is a straightforward layer to add on top of the existing email-based limits.
- Two quick code fixes have real security value: KV cleanup on full recovery, and `Math.random()` → `crypto.getRandomValues` for the recovery OTP.
- A test suite using `@cloudflare/vitest-pool-workers` would make the auth logic verifiable and catch regressions on future changes.
- Geographic anomaly detection is available for free using `request.cf.country` — no external service needed.
