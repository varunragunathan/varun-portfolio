# Chapter 9 — Recovery System

## What You'll Learn

This chapter covers the two distinct recovery flows: backup sign-in (use a recovery code to get a session without wiping your passkeys) and full account recovery (use a recovery code + email OTP to wipe all credentials and start fresh). It explains how recovery codes are generated, how they are hashed with PBKDF2, the 8-code system with position tracking, and the account freezing mechanism.

---

## 9.1 Two Flows, Two Purposes

A common mistake in auth system design is to have a single "recovery" concept that means both "get back into the account" and "reset the account." These are different operations with different risk profiles.

**Backup sign-in** (`POST /recovery/signin`): The user has their recovery code but their passkey is unavailable (new phone, passkey deleted, biometrics failing). They want to get a session so they can add a new passkey or review their settings. This should be as convenient as possible. It should *not* wipe any existing passkeys, because the user might just want a session to verify something and then use their existing passkey normally.

**Full account recovery** (`POST /recovery/start` → `POST /recovery/verify`): The user has completely lost access — all passkeys are gone, possibly across all devices. They need to wipe the slate and register a new passkey. This is irreversible (the old passkeys are deleted) and should require stronger proof — hence the two-factor requirement (recovery code + email OTP).

The two flows are separate endpoints, separate frontend UI paths (the `SignInFlow` has a "Use a recovery code" option; the full recovery is the "Recover" tab), and separate security event types (`recovery_signin` vs `account_recovery`).

---

## 9.2 Backup Sign-In Flow

```js
// worker/auth/recovery.js lines 126-172
export async function recoverySignIn(request, env) {
  const { email, recoveryCode } = await request.json().catch(() => ({}));
  if (!email || !recoveryCode) return json({ error: 'Missing fields' }, 400);

  // Rate limit by email (3 per 10 minutes)
  ...

  const user = await getUserByEmail(db, email);
  // Don't leak whether user exists — return same error as invalid code
  if (!user) return json({ error: 'Invalid recovery code.' }, 400);

  if (await isUserFrozen(db, user.id)) {
    return json({ error: 'Account is frozen. Please contact support.' }, 403);
  }

  const valid = await consumeRecoveryCode(db, user.id, recoveryCode);
  if (!valid) {
    await logSecurityEvent(db, { userId: user.id, type: 'recovery_signin_failed', ... });
    return json({ error: 'Invalid recovery code.' }, 400);
  }

  await logSecurityEvent(db, { userId: user.id, type: 'recovery_signin', ... });

  // Issue pending session — passkeys and existing sessions untouched
  const pendingToken = await createPendingSession(env.AUTH_KV, { userId: user.id, email });
  return json({ ok: true, pendingToken });
}
```

Anti-enumeration: When `getUserByEmail` returns null (no account with that email), the error is identical to "invalid recovery code." An attacker cannot distinguish "email not found" from "wrong code."

After backup sign-in, the user goes through the normal trust prompt. Their existing passkeys and sessions are untouched. The consumed code is marked used. The user should then add a new passkey or fix whatever prevented their existing one from working.

---

## 9.3 Full Account Recovery Flow

Full recovery is a four-step process:

**Step 1: `POST /recovery/start`**

The user provides email + recovery code. The server:
1. Checks the rate limit
2. Looks up the user
3. Validates and consumes the recovery code
4. Sends an OTP to the email address

This step is also the account-freezing checkpoint. If repeated attempts fail (all 8 codes exhausted through invalid guesses):

```js
// worker/auth/recovery.js lines 82-91
const remaining = await countActiveRecoveryCodes(db, user.id);
// Freeze account after too many bad recovery attempts (5 failures → 1h freeze)
if (remaining === 0) {
  await setUserFrozen(db, user.id, Date.now() + 3600_000);
  await logSecurityEvent(db, { userId: user.id, type: 'account_frozen', ... });
}
```

When all 8 codes are consumed (through some combination of legitimate use and failed guesses), the account is frozen for 1 hour and a `account_frozen` security event is logged.

**Step 2: `POST /recovery/verify`**

The user provides email + OTP (from the email sent in step 1). The server:
1. Validates the OTP
2. Deletes all existing passkeys and sessions (the nuclear wipe)
3. Logs an `account_recovery` security event
4. Issues a `recovery_gate` token (5-minute TTL in KV)

```js
// worker/auth/recovery.js lines 192-211
// Wipe all existing passkeys and sessions — clean slate for re-registration
await deleteAllPasskeyCredsByUserId(db, user.id);
await deleteAllSessionsByUserId(db, user.id);

await logSecurityEvent(db, { userId: user.id, type: 'account_recovery', ... });

const recoveryToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
await env.AUTH_KV.put(
  `recovery_gate:${recoveryToken}`,
  JSON.stringify({ userId: user.id, email }),
  { expirationTtl: 300 },
);
return json({ ok: true, recoveryToken, email });
```

Note: The D1 session records are deleted, but their corresponding KV entries (`session:{tokenHash}`) are not explicitly deleted. This is a gap — existing sessions would remain valid in KV until their TTL expires. For a 30-day trusted session, this could mean up to 30 more days of valid session cookies after a full account recovery. A thorough implementation would iterate over all sessions, fetch their `token_hash`, and delete the KV entries. This is noted in [Chapter 12](./12-security-analysis.md).

**Step 3: Register new passkey**

The `recoveryToken` is passed to `POST /passkey/register/options`. The endpoint checks for it:

```js
// worker/auth/passkey.js lines 47-49
if (recoveryToken) {
  const gate = await env.AUTH_KV.get(`recovery_gate:${recoveryToken}`);
  if (!gate) return json({ error: 'Recovery session expired. Please start again.' }, 403);
}
```

This allows the registration to proceed without the normal OTP email verification gate (which has already been satisfied in a different form).

**Step 4: Finalise**

Same as normal registration: trust prompt → `/sessions/finalise` → active session. New recovery codes are generated and shown.

---

## 9.4 Recovery Code Generation

```js
// worker/auth/crypto.js lines 44-52
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 32 chars, no 0/1/I/O

export function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes).map(b => ALPHABET[b % 32]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}
```

Each code is 10 characters from a 32-character Base32-like alphabet with visually confusing characters removed:
- `0` and `O` removed (look similar)
- `1` and `I` removed (look similar)

This gives `log2(32^10)` = 50 bits of entropy per code. The code is displayed as `XXXXX-XXXXX` for readability.

Codes are generated using `crypto.getRandomValues` — the cryptographically secure random number generator. Each byte maps to one character via `b % 32`. Because the alphabet has exactly 32 characters, there is no modulo bias (each character has exactly a 1/32 chance per byte, since `256 / 32 = 8` and `256 % 32 = 0`).

---

## 9.5 PBKDF2 Hashing

Recovery codes are hashed before storage using PBKDF2-SHA256:

```js
// worker/auth/crypto.js lines 7-42
// POC: iterations set to 100 to stay within Cloudflare Workers CPU limits.
// Production recommendation: NIST SP 800-132 mandates ≥ 600,000 iterations
// of PBKDF2-SHA256 for password hashing (2023). For random recovery codes,
// 100,000 is sufficient; for user-chosen passwords, use the full 600,000.
const ITERATIONS = 100;

export async function hashRecoveryCode(code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveKey(code, salt);
  return { hash: bytesToHex(hash), salt: bytesToHex(salt) };
}

async function deriveKey(code, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code.toUpperCase().replace(/-/g, '')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}
```

**The iteration count tradeoff:** NIST SP 800-132 (2023) recommends at least 600,000 PBKDF2-SHA256 iterations for password hashing. The Workers free tier enforces a ~10ms CPU time limit per request. A single PBKDF2 operation at 100,000 iterations takes approximately 30–100ms in a Workers environment — already too slow. At 100 iterations, it takes under 1ms.

The critical question is: does this matter for random recovery codes? For user-chosen passwords, low iteration counts are dangerous because the password space is small — an attacker who breaches the database can brute-force 100-iteration hashes very quickly. But recovery codes have 50 bits of entropy. Even at 100 iterations (meaning an attacker can hash ~10,000,000 guesses per second on modern hardware), exhaustively searching a 50-bit space takes `2^50 / 10,000,000 ≈ 112 years`. For random codes, 100 iterations is adequate.

**The normalization step:** The code is normalized before hashing: `.toUpperCase().replace(/-/g, '')`. This means `ABCDE-FGHIJ`, `abcde-fghij`, and `ABCDEFGHIJ` all hash to the same value. Users who type their code in lowercase or without the hyphen will still be accepted.

**Per-code salt:** Each code has its own 16-byte random salt. If the database is breached, an attacker cannot use a single pre-computation to crack all 8 codes simultaneously — each requires an independent PBKDF2 computation.

---

## 9.6 The 8-Code System and Position Tracking

Eight codes are generated on registration and whenever codes are regenerated:

```js
// worker/db.js lines 215-235
export async function generateAndStoreRecoveryCodes(db, userId) {
  // Wipe existing codes first (handles re-generation case)
  await db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(userId).run();

  const generation = Date.now(); // use timestamp as generation ID
  const plainCodes = [];

  for (let i = 1; i <= 8; i++) {
    const code = generateRecoveryCode();
    const { hash, salt } = await hashRecoveryCode(code);
    await db
      .prepare('INSERT INTO recovery_codes (id, user_id, code_hash, code_salt, position, generation) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), userId, hash, salt, i, generation)
      .run();
    plainCodes.push(code);
  }

  return plainCodes; // returned once, never stored in plaintext
}
```

The `position` field (1–8) allows the security dashboard to show a status grid like:
```
1. ✓ used    2. ✓ used    3. available  4. available
5. available 6. available 7. available  8. available
```

This tells the user how many codes they've used without revealing which ones remain valid.

The `generation` field is a timestamp. When codes are regenerated, the old rows are deleted and new ones are inserted with a fresh generation timestamp. This ensures the status query always reflects the current generation.

**Code consumption** is done by iterating all unused codes for the user and checking each one:

```js
// worker/db.js lines 254-270
export async function consumeRecoveryCode(db, userId, plainCode) {
  const rows = await db
    .prepare('SELECT * FROM recovery_codes WHERE user_id = ? AND used = 0')
    .bind(userId)
    .all();

  for (const row of rows.results) {
    const valid = await verifyRecoveryCode(plainCode, row.code_hash, row.code_salt);
    if (valid) {
      await db
        .prepare('UPDATE recovery_codes SET used = 1, used_at = ? WHERE id = ?')
        .bind(Date.now(), row.id)
        .run();
      return true;
    }
  }
  return false;
}
```

This is a sequential scan over all unused codes (up to 8). Each `verifyRecoveryCode` call runs one PBKDF2 computation. At 100 iterations, this is fast enough. At production-level iterations, this would need optimization (e.g., store the position alongside the code in the request and only check that one).

---

## 9.7 Rate Limiting on Recovery

Both recovery flows have rate limits:

```js
// worker/auth/recovery.js lines 34-36
const RATE_WINDOW = 10 * 60; // 10 minutes
const RATE_LIMIT = 3;
```

The rate limit keys:
- Full recovery: `recovery_rate:{email}` — 3 attempts per 10 minutes
- Backup sign-in: `recovery_signin_rate:{email}` — 3 attempts per 10 minutes

These are email-scoped, not IP-scoped (same limitation as the OTP rate limit). An attacker with a list of emails can make 3 guesses per email per window.

---

## 9.8 Where This Could Fail

**Recovery code theft.** If a user stores their recovery codes in an insecure location (a note app, an email to themselves, a screenshot), and that location is compromised, an attacker has those codes. The backup sign-in flow (`/recovery/signin`) allows using a code without any additional verification. The full recovery flow adds OTP, but OTP protection is only as strong as the email account.

**Email-as-root-of-trust.** The full recovery flow's second factor is an OTP sent to the account email. If the email account is compromised, the second factor is also compromised. This is inherent to email-based recovery. A stronger alternative is TOTP (time-based one-time password from an authenticator app), which is noted as future work in [Chapter 14](./14-what-could-be-done.md).

**Sessions not KV-cleaned on full recovery.** As noted above, `deleteAllSessionsByUserId` removes D1 session records but does not clean up the corresponding KV entries. An attacker who has obtained session cookies before the recovery event would still have valid KV-backed sessions until their TTL expires. This is a gap for production use.

---

## Key Takeaways

- Two distinct recovery paths: backup sign-in (one code, no credential wipe) and full account recovery (one code + email OTP + complete credential reset).
- Recovery codes have 50 bits of entropy from a 32-character alphabet designed to avoid visually confusing characters.
- PBKDF2-SHA256 hashing with per-code salts protects codes at rest. The iteration count (100) is a deliberate tradeoff against Workers CPU limits, acceptable for random codes but not passwords.
- The account freeze mechanism (triggered when all 8 codes are exhausted) prevents brute-force recovery attacks.
- Full recovery does not clean up KV session entries — an improvement needed for production.
