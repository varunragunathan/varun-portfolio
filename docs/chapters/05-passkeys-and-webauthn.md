# Chapter 5 — Passkeys and WebAuthn

## What You'll Learn

This is the deepest technical chapter. It covers the WebAuthn specification, what passkeys are and how they differ from hardware keys, the full registration and authentication ceremonies, conditional mediation and how it arms the browser autofill, sign count / replay attack protection, and every place this implementation could fail. It references real code from `worker/auth/passkey.js` throughout.

---

## 5.1 What WebAuthn Is

[WebAuthn](../glossary/README.md#webauthn) (Web Authentication) is a W3C standard that defines how web applications can authenticate users using asymmetric cryptography performed on the user's device. The specification was published in 2019 and became a candidate recommendation in 2021. As of 2024, it is supported by all major browsers.

The core idea: instead of the server storing a secret (a password hash) and the user proving they know that secret, the user's device generates a public/private key pair. The server stores only the public key. To authenticate, the device signs a server-issued challenge with the private key. The server verifies the signature. The private key never leaves the device.

This is not MFA bolted onto passwords. It is a replacement for the password-based model entirely.

The W3C specification: https://www.w3.org/TR/webauthn-3/

The FIDO2 overview: https://fidoalliance.org/fido2/

---

## 5.2 What a Passkey Is

[Passkey](../glossary/README.md#passkey) is the consumer-friendly name for a WebAuthn credential that is designed to be convenient and portable, specifically one that is backed up to a cloud service. "Passkey" is a marketing term popularized by Apple, Google, and Microsoft; the underlying technology is WebAuthn.

The distinction that matters for this implementation:

**Synced passkeys** are backed up to a cloud service (iCloud Keychain, Google Password Manager, 1Password, etc.) and are available on any device signed into the same account. An iPhone user who registers a passkey on their phone can sign in with that same passkey on their iPad and Mac, because the passkey syncs through iCloud.

**Device-bound passkeys (hardware security keys)** are tied to a specific hardware device (e.g., a YubiKey). The private key cannot be exported. The passkey is available only on the physical device.

The implementation detects the difference at registration time:

```js
// worker/auth/passkey.js lines 109-111
const transports = registrationResponse.response?.transports || [];
const authenticatorType = credential.type || 'platform';
const isSynced = authenticatorType === 'cross-platform' || transports.includes('hybrid');
```

This distinction matters primarily for the sign count (Section 5.7 below). It is stored in the `passkey_creds.is_synced` column and displayed as a "Synced" or "Device-bound" badge in the security settings UI.

---

## 5.3 The Registration Ceremony

Registration is a two-round-trip process.

**Round 1: Get options**

The browser calls `POST /api/auth/passkey/register/options` with the user's email. The server:

1. Verifies the email has been OTP-verified (checks `email_verified:{email}` in KV, or accepts a `recoveryToken` for the recovery path)
2. Retrieves or creates the user record
3. Fetches any existing credentials to build the `excludeCredentials` list
4. Calls `generateRegistrationOptions()` from `@simplewebauthn/server`

```js
// worker/auth/passkey.js lines 64-78
const options = await generateRegistrationOptions({
  rpName: 'varunr.dev',
  rpID: env.RP_ID,
  userID: new TextEncoder().encode(user.id),
  userName: email,
  userDisplayName: email,
  excludeCredentials: existingCreds.map(c => ({ id: c.id, type: 'public-key' })),
  authenticatorSelection: {
    residentKey: 'preferred',
    userVerification: 'preferred',
  },
});
```

The server stores the challenge in KV:
```text
key: reg_challenge:{userId}
TTL: 60 seconds
```

And returns `{ options, userId }` to the browser.

**`excludeCredentials`:** This list tells the authenticator "don't let the user register any of these credentials again." If the user registers their iPhone passkey and then tries to register it again, the browser will silently skip it (or tell the user it's already registered, depending on the browser). This prevents duplicate credentials in the database.

**`residentKey: 'preferred'`:** This requests a [discoverable credential](../glossary/README.md#discoverable-credential) — a passkey stored on the device in a slot that allows the browser to find it without the server having to specify `allowCredentials`. This is what makes conditional mediation work: the browser can find the passkey for this `rpID` without being told which credential ID to use.

**`userVerification: 'preferred'`:** Requests that the authenticator verify the user (biometrics, PIN) but does not make it mandatory. On devices that support it (which is essentially all modern devices), this results in a Touch ID / Face ID / PIN prompt.

**Round 2: Verify registration**

The browser calls `startRegistration({ optionsJSON: options })` from `@simplewebauthn/browser`. This function handles the browser API call (`navigator.credentials.create()`), formats the response, and returns it. The browser calls `POST /api/auth/passkey/register/verify` with the response.

The server:

1. Retrieves the challenge from KV and immediately deletes it (single-use)
2. Calls `verifyRegistrationResponse()` from `@simplewebauthn/server`

```js
// worker/auth/passkey.js lines 92-100
verification = await verifyRegistrationResponse({
  response: registrationResponse,
  expectedChallenge: challenge,
  expectedOrigin: expectedOrigin(request, env),
  expectedRPID: env.RP_ID,
});
```

3. If verified, saves the credential to D1
4. Generates 8 recovery codes, stores hashed versions in D1
5. Creates a pending session
6. Returns `{ ok, pendingToken, recoveryCodes, isSynced, authenticatorType }`

The `recoveryCodes` are the plaintext versions of the just-generated codes. This is the *only* time these codes are available in plaintext — they are shown to the user in the `RecoveryCodesModal` and never stored in plaintext again.

---

## 5.4 The Authentication Ceremony

Authentication is also two-round-trip.

**Round 1: Get options**

`POST /api/auth/passkey/auth/options` with the user's email.

For conditional mediation (empty email), the server generates options with an empty `allowCredentials` list:

```js
// worker/auth/passkey.js lines 165-174
if (!email) {
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'preferred',
    allowCredentials: [],
  });
  const condToken = crypto.randomUUID();
  await env.AUTH_KV.put(`cond_challenge:${condToken}`, options.challenge, { expirationTtl: 120 });
  return json({ options, userId: null, condToken });
}
```

An empty `allowCredentials` list means "any credential for this RP ID" — the browser knows which passkeys are stored for `varunr.dev` and will show them.

For the email-first flow, the server returns options with `allowCredentials` populated:

```js
// worker/auth/passkey.js lines 192-199
const options = await generateAuthenticationOptions({
  rpID: env.RP_ID,
  userVerification: 'preferred',
  allowCredentials: creds.map(c => ({ id: c.id, type: 'public-key' })),
});
await env.AUTH_KV.put(`auth_challenge:${user.id}`, options.challenge, { expirationTtl: 60 });
```

**Anti-enumeration:** For an unknown email, the server returns a fake set of auth options with a real-looking challenge but no `allowCredentials`. The response is structurally identical to a valid response. An attacker probing for valid email addresses gets no signal from the response format.

**Round 2: Verify**

`POST /api/auth/passkey/auth/verify` with `{ userId, authResponse }` (email flow) or `{ authResponse, condToken }` (conditional mediation flow).

For conditional mediation, the server must discover which user authenticated:

```js
// worker/auth/passkey.js lines 211-219
if (condToken) {
  challenge = await env.AUTH_KV.get(`cond_challenge:${condToken}`);
  if (!challenge) return json({ error: 'Challenge expired. Please try again.' }, 400);
  await env.AUTH_KV.delete(`cond_challenge:${condToken}`);
  // Derive userId from the credential that was used
  const credRow = await db.prepare('SELECT user_id FROM passkey_creds WHERE id = ?').bind(authResponse.id).first();
  if (!credRow) return json({ error: 'Credential not found' }, 400);
  userId = credRow.user_id;
}
```

The credential ID embedded in the `authResponse` uniquely identifies which credential was used. The server looks up that credential ID in D1 to find the owner.

After deriving the `userId`, verification proceeds identically to the email-first flow:

```js
// worker/auth/passkey.js lines 232-246
verification = await verifyAuthenticationResponse({
  response: authResponse,
  expectedChallenge: challenge,
  expectedOrigin: expectedOrigin(request, env),
  expectedRPID: env.RP_ID,
  credential: {
    id: cred.id,
    publicKey: isoBase64URL.toBuffer(cred.public_key),
    counter: cred.sign_count,
  },
});
```

---

## 5.5 Conditional Mediation Deep Dive

[Conditional mediation](../glossary/README.md#conditional-mediation) is the feature that makes passkeys appear in the browser's normal autocomplete dropdown — the same dropdown that shows saved passwords or email addresses — without requiring the user to click a dedicated "Use passkey" button.

The mechanism works as follows:

**On the server side:** The server generates authentication options with an empty `allowCredentials` list. This is the signal to the browser: "show any passkey you have for this RP ID." The challenge is stored in KV under a `condToken` UUID (not a `userId`, because we don't know who will authenticate):

```js
const condToken = crypto.randomUUID();
await env.AUTH_KV.put(`cond_challenge:${condToken}`, options.challenge, { expirationTtl: 120 });
return json({ options, userId: null, condToken });
```

**On the browser side:** The `SignInFlow` component arms conditional mediation when it mounts:

```js
// src/pages/Auth.jsx lines 550-573
useEffect(() => {
  condActiveRef.current = true;
  (async () => {
    try {
      const res = await fetch('/api/auth/passkey/auth/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' }),
      });
      if (!res.ok || !condActiveRef.current) return;
      const { options, condToken } = await res.json();
      if (!condActiveRef.current) return;

      const authResponse = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
      ...
      await submitAuthResponse(authResponse, null, condToken);
    } catch { /* user ignored autofill or browser doesn't support conditional UI */ }
  })();
  return () => { condActiveRef.current = false; };
}, []);
```

`useBrowserAutofill: true` is the key. In `@simplewebauthn/browser`, this flag calls `navigator.credentials.get()` with `mediation: 'conditional'`. This does not show a modal. Instead, it "arms" the browser — the browser will present the passkey as an option in any `<input>` element on the page that has `autocomplete="username webauthn"`. The user can then tap the passkey suggestion in the autocomplete dropdown to complete sign-in.

The email input has this attribute:
```jsx
// src/pages/Auth.jsx line 706
<Input label="Email address" ... autoComplete="username webauthn" />
```

**The `condActiveRef` pattern:** The `condActiveRef` ref is `true` when conditional mediation is armed and `false` when it should be cancelled. When the user submits the email form manually (pressing "Continue →"), the first thing that happens is:

```js
// src/pages/Auth.jsx line 606
condActiveRef.current = false; // cancel conditional mediation
```

This prevents a race condition where both the conditional mediation path and the manual email-submit path complete at the same time. Without this guard, a user who types their email and presses Continue *and* happens to tap a passkey from the autofill dropdown in the same moment would experience two competing authentication flows.

---

## 5.6 The `rpID` and `expectedOrigin` Problem

Every WebAuthn operation binds the credential to a [Relying Party](../glossary/README.md#relying-party) (RP). The RP is identified by two values:

- **`rpID`:** A domain name string. Set in `wrangler.toml` as `RP_ID = "varunr.dev"`. Must be the effective domain or a registrable domain suffix of the origin.
- **`expectedOrigin`:** The full origin URL (scheme + host + port). A passkey registered at `https://varunr.dev` cannot be used to authenticate at `https://evil.com`, because the origin won't match.

In production, `expectedOrigin` is always `https://varunr.dev`. But in local development, `wrangler dev` binds to a random port (e.g., `http://localhost:8787`). If `expectedOrigin` is hardcoded to the production URL, local authentication fails with an origin mismatch error.

The fix:

```js
// worker/auth/passkey.js lines 31-37
function expectedOrigin(request, env) {
  const reqOrigin = request.headers.get('Origin') || '';
  if (reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1')) {
    return reqOrigin;
  }
  return env.ORIGIN;
}
```

For localhost requests, the server trusts the `Origin` header from the request. For production, it always uses the configured `env.ORIGIN` (never the client-supplied Origin header). This avoids both the localhost dev problem and the security risk of trusting the client's declared origin in production.

---

## 5.7 Sign Count and Replay Attack Protection

Every WebAuthn credential includes a counter (`sign_count`) that increments each time the credential is used. The server stores the last-seen counter value. On each authentication, it compares:

```js
// worker/auth/passkey.js lines 249-253
const newCounter = verification.authenticationInfo.newCounter;
if (newCounter > 0 && newCounter <= cred.sign_count) {
  return json({ error: 'Authenticator anomaly detected. Contact support.' }, 403);
}
await updateSignCount(db, cred.id, newCounter);
```

**The intended use:** If an attacker clones a hardware security key and uses the clone, the clone's counter will be behind the real key's counter. The next authentication with the real key will have a counter lower than the stored value, which triggers the anomaly check.

**The `newCounter > 0` guard:** Synced passkeys often return `sign_count = 0` on every use. The spec explicitly permits this for passkeys that cannot guarantee counter monotonicity (synced credentials backed up to cloud storage). Treating `0` as an anomaly would block all synced passkeys. The guard `newCounter > 0` means "only enforce counter monotonicity if the authenticator is actually using the counter."

This is a deliberate, documented tradeoff. Synced passkeys are the most common passkey type in 2024–2025 (iPhone, Android, 1Password). Blocking them would make the system effectively unusable for most users.

---

## 5.8 The `@simplewebauthn` Libraries

Rather than implementing WebAuthn from scratch, this project uses:

- `@simplewebauthn/server` — server-side: generates options, verifies responses, handles all the CBOR/COSE parsing, signature verification, and spec-compliance details.
- `@simplewebauthn/browser` — client-side: wraps `navigator.credentials.create()` and `navigator.credentials.get()`, handles encoding/decoding, and provides `useBrowserAutofill` for conditional mediation.

Both are at version `^13.3.0`. The library handles many subtle spec requirements that are easy to get wrong — things like checking the `rpIDHash` in the authenticator data, verifying the signature flags, ensuring the origin matches, and base64url-encoding the challenge correctly.

The server calls used:
- `generateRegistrationOptions()` — produces the options object for passkey creation
- `verifyRegistrationResponse()` — validates the authenticator's registration response, extracts the public key and credential ID
- `generateAuthenticationOptions()` — produces the options object for passkey authentication
- `verifyAuthenticationResponse()` — validates the assertion, checks the signature, returns the new counter

The helper `isoBase64URL` from `@simplewebauthn/server/helpers` is used to convert between binary buffers and base64url strings:
- `isoBase64URL.fromBuffer(credential.publicKey)` — on registration, converts the raw public key bytes to a string for D1 storage
- `isoBase64URL.toBuffer(cred.public_key)` — on authentication, converts the stored string back to a buffer for verification

---

## 5.9 Where This Could Fail

**Origin mismatch on production after domain change.** If `varunr.dev` is ever moved to a different domain, all existing passkeys become unusable. Passkeys are bound to the `rpID` at registration time. There is no migration path — users would need to re-register. The full recovery flow exists partly for this reason.

**Counter rollback on synced passkeys.** The `newCounter > 0` guard means cloned synced passkeys are not detected. This is a spec-acknowledged limitation. For this use case (a personal portfolio), the risk is low.

**KV challenge expiration.** If the user is very slow at the authenticator prompt (>60s for auth options, >60s for registration options, >120s for conditional mediation), the challenge in KV expires and verification fails. The error message "Challenge expired. Please try again." handles this gracefully, but a user on a slow network who gets a biometric prompt slow to respond may encounter it.

**Browser that does not support conditional mediation.** The `catch {}` at the end of the conditional mediation `useEffect` silently absorbs the error. The user just doesn't see passkeys in the autofill dropdown, but the manual email flow still works.

**Multiple passkeys for the same device.** `excludeCredentials` prevents duplicate registration of the exact same credential, but a user could register multiple passkeys from different devices or apps, which is correct behavior. The UI does not cap the number of passkeys per user.

---

## Key Takeaways

- WebAuthn uses asymmetric cryptography: the server stores public keys, the device keeps private keys. Nothing to phish.
- Registration is a two-round-trip ceremony: get options (server generates challenge) → verify response (server verifies authenticator's assertion).
- Conditional mediation arms the browser autofill without showing a modal. It requires `autocomplete="username webauthn"` on the input and `useBrowserAutofill: true` on the client call.
- The `condToken` design solves the problem of not knowing the userId at the start of conditional mediation.
- The `expectedOrigin` function uses the request's Origin header in localhost dev but always uses the configured env var in production.
- The `newCounter > 0` guard makes the sign count check compatible with synced passkeys, at the cost of not detecting clones of synced passkeys.
