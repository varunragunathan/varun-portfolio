# Chapter 4 — Authentication Overview

## What You'll Learn

This chapter explains the authentication philosophy behind the system, enumerates every available authentication and recovery method, and describes the two-phase session model and device trust levels. It provides the conceptual map that makes the detailed chapters (5–10) easier to follow.

---

## 4.1 The Passwordless-First Philosophy

The system has no password field. There is no `password_hash` column in the database, no "forgot password" link, no email-and-password login form. This is a deliberate architectural choice, not a shortcut.

Passwords fail for several compounding reasons. Users reuse them across sites, so a breach anywhere affects accounts everywhere. Phishing attacks trick users into typing their password into a fake login page. Credential stuffing attacks replay breached credentials at scale. Even well-implemented password hashing provides only a speed bump — a breached password database can be cracked offline.

Passkeys eliminate these failure modes. A passkey is an asymmetric key pair where the private key never leaves the device. There is nothing to phish (the server receives a cryptographic assertion, not a secret), nothing to stuff (each credential is site-specific), and nothing to hash (the server stores only a public key). The user authenticates with biometrics or a device PIN, which never leave the device.

The choice to go passwordless-first rather than passwordless-optional matters. "Optional" passwordless often means passwords remain the default and passkeys are treated as a second factor. Here, passkeys are the only factor. The system's security model is grounded in the passkey, not propped up by a password as a fallback.

---

## 4.2 Authentication Methods

### Primary: Passkey

A [passkey](../glossary/README.md#passkey) is a WebAuthn credential stored on the user's device or synced through a platform service (iCloud Keychain, Google Password Manager). During sign-in, the server issues a [challenge](../glossary/README.md#challenge), the authenticator signs it with the private key, and the server verifies the signature against the stored public key. The user never types a secret.

There are two sign-in paths using passkeys:

1. **Email-first:** User types their email, presses Continue. The server returns authentication options for that user's registered credentials. The browser prompts the user to use one of those credentials.

2. **Conditional mediation:** When the sign-in page loads, the browser is armed with a challenge with an empty `allowCredentials` list and `useBrowserAutofill: true`. The browser makes passkeys for this site available in the standard autocomplete dropdown of the email field (the one that normally shows saved emails). The user can tap a passkey from the dropdown without typing their email. See [Chapter 5](./05-passkeys-and-webauthn.md) for the detailed mechanics.

### Backup: Recovery-Code Sign-In

If the passkey is unavailable (the device was replaced, the authenticator was factory-reset, the user switched from iPhone to Android), the user can sign in with a recovery code. This consumes one code but does not revoke existing passkeys or sessions. It is a temporary bridge back into the account.

The recovery-code sign-in flow is: email + recovery code → pending session → trust prompt. The same pending session / trust model as passkey sign-in applies.

### Nuclear Option: Full Account Recovery

If the user has lost access to all devices with registered passkeys *and* needs to change their passkeys (not just get a session), they use the full recovery flow. This requires:

1. A valid (unused) recovery code
2. OTP verification to the account email address

The two-factor requirement means that possession of recovery codes alone is not sufficient to wipe and re-register credentials — the attacker would also need access to the email inbox. After both factors are verified, all existing passkeys and all active sessions are deleted, and the user registers a fresh passkey. New recovery codes are generated.

See [Chapter 9](./09-recovery-system.md) for the full implementation details.

---

## 4.3 The Two-Phase Session Model

Sessions in this system are created in two phases. Understanding why is key to understanding the session code.

### Phase 1: Pending Session

After a successful passkey authentication (or recovery-code sign-in), the server does *not* immediately issue a session cookie. Instead it creates a pending session in KV:

```text
key:   session_pending:{token}
value: { userId, email, recoveryCodes (if any) }
TTL:   300 seconds (5 minutes)
```

The raw `token` is returned to the browser in the JSON response body. The browser receives it but does not yet have a session cookie.

**Why not issue the cookie immediately?** Because the trust prompt needs to happen first. The user must choose whether this device is trusted (30-day session) or untrusted (24-hour session), and optionally name the device. The pending token is the bridge that carries the session across this UI interaction without prematurely committing to a trust level.

The pending session is single-use: once consumed by `/sessions/finalise`, it is deleted from KV. If the user abandons the trust prompt, the pending token expires after 5 minutes and nothing is created.

### Phase 2: Active Session (Finalise)

When the user submits the trust prompt, the browser calls `POST /api/auth/sessions/finalise` with the pending token, trust choice, and optional device name. This endpoint:

1. Reads and deletes the pending KV entry
2. Computes `tokenHash = SHA256(token)`
3. Writes `session:{tokenHash}` to KV with a TTL of 86400s (24h) or 2592000s (30d)
4. Writes a full session record to D1 (with `tokenHash`, `device_name`, `user_agent`, `ip`, `trusted`, `expires_at`)
5. Returns the session cookie: `Set-Cookie: session={token}; HttpOnly; Secure; SameSite=Strict; Max-Age={TTL}`

From this point forward, every request to a protected endpoint goes through `getSession()`:

```js
// worker/auth/session.js lines 87-94
export async function getSession(kv, request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const raw = await kv.get(`session:${tokenHash}`);
  if (!raw) return null;
  return { token, ...JSON.parse(raw) };
}
```

The cookie value (raw token) is hashed before any lookup. The KV store is never queried with a plaintext token.

---

## 4.4 Trust Levels

The trust system has two levels:

| Level | Cookie TTL | Session TTL | `trusted` flag in DB |
|-------|------------|-------------|----------------------|
| Trusted | 30 days | 30 days | `1` |
| Untrusted | 24 hours | 24 hours | `0` |

The trust level is set by the user at the trust prompt, which appears immediately after every sign-in (passkey and recovery-code alike). The prompt reads: "Trusted devices stay signed in for 30 days. Untrusted devices sign out after 24 hours."

**Trust and number matching interact.** When a user authenticates from an unknown device (a user-agent not seen before in their sessions), and they have at least one trusted session elsewhere, the server triggers the number-matching flow before creating any session. The new device must be approved by a trusted device before it can proceed to the trust prompt. Only trusted sessions (`trusted = 1`) can approve new devices.

This creates a useful security property: an attacker who steals a session cookie from an untrusted device cannot approve additional new devices (they can't connect to `/num-match/subscribe`), because the stolen session is not trusted. Only pre-approved trusted sessions can grant trust to new devices.

---

## 4.5 How the Auth Pieces Connect

```text
New user registration:
  OTP verify email
    └─ Passkey registration
         └─ Create pending session (+ recovery codes)
              └─ Trust prompt
                   └─ Finalise → active session

Returning user (known device):
  Passkey auth
    └─ Create pending session
         └─ Trust prompt
              └─ Finalise → active session

Returning user (new device, has trusted sessions):
  Passkey auth
    └─ Number matching (WebSocket, DO broker)
         └─ Trusted device approves
              └─ Create pending session
                   └─ Trust prompt
                        └─ Finalise → active session

Sign-in with recovery code:
  Recovery code + email
    └─ Create pending session (one code consumed)
         └─ Trust prompt
              └─ Finalise → active session

Full account recovery (lost all passkeys):
  Recovery code + OTP
    └─ Wipe passkeys + sessions
         └─ Issue recovery gate token
              └─ Passkey registration
                   └─ Create pending session (+ new recovery codes)
                        └─ Trust prompt
                             └─ Finalise → active session

Account deletion:
  Step-up auth (passkey re-authentication)
    └─ Issue stepUpToken (2 min)
         └─ Email confirmation
              └─ Delete all user data + revoke session
```

Every path through the system ends at the same trust prompt / finalise sequence. This consistency is intentional — the trust decision is not optional and cannot be bypassed.

---

## Key Takeaways

- No passwords exist anywhere in this system. The security model rests entirely on passkeys and recovery codes.
- Sessions are two-phase: a pending token is issued after authentication, and only converted to an active session cookie after the user makes the trust decision.
- Trusted sessions (30d) can approve new devices. Untrusted sessions (24h) cannot.
- Every authentication path — passkey, recovery code, conditional mediation — goes through the same pending session and trust prompt.
- Full account recovery requires two factors (recovery code + email OTP) to prevent recovery-code theft from being sufficient alone.
