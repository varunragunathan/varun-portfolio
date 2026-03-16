# Chapter 10 — Step-Up Authentication

## What You'll Learn

This chapter covers step-up authentication: what it is, when it is required, how the `stepUpToken` mechanism works, and the complete flow for account deletion. It also describes the broader extensibility of the step-up design.

---

## 10.1 What Step-Up Authentication Is

Step-up authentication is the requirement to re-prove identity before performing a destructive or sensitive action, even within an already-authenticated session.

The problem it solves: a user might leave their browser open on a public computer (a hotel lobby, a shared office). Their session cookie is valid. If someone sits down and navigates to the settings page, should they be able to delete the account? Ideally no — the session being valid proves the device was trusted at some point, not that the person currently at the keyboard is the account owner.

By requiring a fresh passkey gesture (Touch ID, Face ID, PIN) immediately before account deletion, the system ensures the account owner is physically present at the moment of the destructive action.

---

## 10.2 When Step-Up Is Required

Currently, step-up is required for one operation: **account deletion** (`DELETE /account`).

The code comments note planned expansion:

```js
// worker/auth/stepUp.js lines 6-12
// Priority order for future expansion:
//   1. Passkey re-auth      ← implemented here
//   2. Trusted device approve (number matching)
//   3. TOTP
//   4. Backup security key
```

Other candidates for future step-up gates:
- Recovery code regeneration (currently protected only by active session)
- Passkey removal (currently protected only by active session)
- Email address change (not yet implemented)

---

## 10.3 How the `stepUpToken` Works

The step-up flow has two endpoints:

**`POST /step-up/options`** — Get a passkey challenge:

```js
// worker/auth/stepUp.js lines 43-63
export async function stepUpOptions(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const creds = await getPasskeyCredsByUserId(env.varun_portfolio_auth, session.userId);
  if (!creds.length) return json({ error: 'No passkeys registered' }, 400);

  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'required', // always require UV for step-up
    allowCredentials: creds.map(c => ({ id: c.id, type: 'public-key' })),
  });

  await env.AUTH_KV.put(
    `step_up_challenge:${session.userId}`,
    options.challenge,
    { expirationTtl: STEP_UP_TTL }, // 120 seconds
  );

  return json({ options });
}
```

Note `userVerification: 'required'` (not `'preferred'`). For step-up, user verification is mandatory. The authenticator must perform biometric or PIN verification. A passkey that skips user verification (some hardware security keys in low-security mode) would be rejected.

**`POST /step-up/verify`** — Verify the passkey response, issue a `stepUpToken`:

```js
// worker/auth/stepUp.js lines 66-110
export async function stepUpVerify(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  // ... verify the passkey response ...
  if (!verification.verified) return json({ error: 'Not verified' }, 400);

  await updateSignCount(env.varun_portfolio_auth, cred.id, verification.authenticationInfo.newCounter);

  const stepUpToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.AUTH_KV.put(`step_up:${stepUpToken}`, session.userId, { expirationTtl: STEP_UP_TTL });

  return json({ ok: true, stepUpToken });
}
```

The `step_up:{stepUpToken}` KV entry stores the `userId` as its value. This binding is critical: when the consuming endpoint calls `consumeStepUpToken`, it verifies that the token's userId matches the current session's userId:

```js
// worker/auth/stepUp.js lines 33-39
export async function consumeStepUpToken(kv, token, expectedUserId) {
  if (!token) return false;
  const userId = await kv.get(`step_up:${token}`);
  if (!userId || userId !== expectedUserId) return false;
  await kv.delete(`step_up:${token}`);
  return true;
}
```

This prevents a token issued to user A from being used to delete user B's account.

---

## 10.4 The Account Deletion Flow

The complete flow from the user's perspective:

1. User clicks "Delete account" on the settings page
2. The `DeleteAccount` component calls `startDelete()`
3. `startDelete` calls `POST /step-up/options` → receives passkey challenge
4. `startAuthentication({ optionsJSON: options })` shows the passkey prompt
5. User completes biometric verification
6. `POST /step-up/verify` → server verifies response → returns `{ stepUpToken }`
7. The component saves `stepUpToken` and advances to the confirmation stage
8. The confirmation modal shows: "Enter your email address to confirm"
9. User types their email and clicks "Delete permanently"
10. `POST /account` with `{ stepUpToken, email }` is called
11. Server calls `consumeStepUpToken` — if valid, proceeds to deletion
12. Server verifies email matches the account
13. Server deletes KV session entry, then all D1 records
14. Server clears the session cookie with `Max-Age=0`
15. Frontend sets `user = null` and redirects to `/`

The email confirmation step (step 8–9) serves as a second confirmation factor on top of the passkey re-auth. It makes it harder to accidentally delete the account (the user must type their email, not just click through) and provides a server-side check:

```js
// worker/auth/account.js lines 246-249
const user = await getUserById(db, session.userId);
if (!user || !body.email || body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
  return json({ error: 'Email address does not match your account.' }, 403);
}
```

---

## 10.5 The 2-Minute TTL Design

Both the step-up challenge and the step-up token have a 2-minute TTL:

```js
const STEP_UP_TTL = 120; // 2 minutes
```

This is intentionally short. Step-up tokens are single-use and short-lived to limit the window in which a stolen token could be used. The sequence — get options → get passkey prompt → verify → present token — should complete within seconds. Two minutes is generous.

The step-up challenge (stored in KV as `step_up_challenge:{userId}`) is also 2 minutes. If the user dismisses the passkey prompt and tries again, the old challenge will have expired, and they must request fresh options.

---

## 10.6 Where This Could Fail

**Step-up token replay.** Once issued, the `stepUpToken` is valid for 2 minutes. `consumeStepUpToken` deletes it on use, so it cannot be replayed. However, if the user gets a `stepUpToken` and then pauses for more than 2 minutes before submitting the delete form, the token expires and they receive "Step-up authentication required or expired. Please verify your passkey again."

**No step-up for recovery code regeneration.** The `regenerateRecoveryCodes` endpoint requires only an active session, not step-up. A code comment acknowledges this: "Requires re-authentication check via passkey — for now we require active session only. Future: add step-up auth here." This means anyone with a valid session cookie (e.g., someone who has borrowed an authenticated browser) can regenerate recovery codes, invalidating the owner's existing codes without requiring a fresh biometric.

**No rate limit on step-up attempts.** `stepUpOptions` and `stepUpVerify` are called in rapid succession during the passkey prompt. There is no rate limit on how many times step-up can be attempted. In theory, an attacker with a valid session could try to enumerate step-up challenges (though challenges are tied to `session.userId` in KV, not guessable).

---

## Key Takeaways

- Step-up authentication requires a fresh passkey gesture immediately before destructive actions, even within a valid session.
- The `stepUpToken` is a short-lived (2-minute), single-use KV entry bound to a specific `userId`.
- `consumeStepUpToken` validates and deletes the token atomically — replay is not possible.
- Account deletion requires step-up (passkey re-auth) + email confirmation, preventing both accidental and unauthorized deletion.
- Step-up is designed for extensibility: the token pattern works regardless of what authentication method produces it.
