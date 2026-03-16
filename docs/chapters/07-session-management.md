# Chapter 7 — Session Management

## What You'll Learn

This chapter covers the complete session lifecycle: how sessions are created in two phases, how they are stored in both KV and D1, how the session cookie is secured, how `getSession` works and where it is called, how revocation works (including a bug that was found and fixed), and the `touchSession` mechanism.

---

## 7.1 The Two-Phase Model in Depth

Session creation is always two steps:

**Step 1 — Pending:** After any successful authentication event (passkey verification, recovery-code sign-in, number-match approval), `createPendingSession` is called:

```js
// worker/auth/session.js lines 33-41
export async function createPendingSession(kv, { userId, email, recoveryCodes }) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await kv.put(
    `session_pending:${token}`,
    JSON.stringify({ userId, email, recoveryCodes: recoveryCodes || null }),
    { expirationTtl: 300 },
  );
  return token;
}
```

The token is 64 hex characters: two concatenated UUIDs with hyphens stripped. This produces 128 bits of entropy, more than sufficient. The pending session exists only in KV with a 5-minute TTL.

The raw `token` is returned in the JSON response body — *not* in a cookie. This is intentional. Cookies are sent on every request automatically. If a session cookie were issued before the trust prompt completed, the browser would be authenticated before the user had a chance to choose their trust level. The pending token is sent as JSON so the browser can hold it in JavaScript state until the trust decision is made.

**Step 2 — Finalise:** `POST /api/auth/sessions/finalise` with `{ token, trusted, deviceName }`:

```js
// worker/auth/session.js lines 47-83
export async function finaliseSession(request, env) {
  const body = await request.json().catch(() => ({}));
  const { token, trusted, deviceName } = body;
  if (!token) return json({ error: 'Missing token' }, 400);

  const raw = await env.AUTH_KV.get(`session_pending:${token}`);
  if (!raw) return json({ error: 'Session expired or invalid' }, 400);

  const { userId, email } = JSON.parse(raw);
  await env.AUTH_KV.delete(`session_pending:${token}`);

  const isTrusted = trusted === true;
  const TTL = isTrusted ? 30 * 86400 : 86400;
  const ua = request.headers.get('User-Agent') || '';
  const ip = getClientIP(request);
  const name = deviceName?.trim() || inferDeviceName(ua);
  const sessionId = crypto.randomUUID();
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + TTL * 1000;

  await env.AUTH_KV.put(
    `session:${tokenHash}`,
    JSON.stringify({ userId, email, sessionId }),
    { expirationTtl: TTL }
  );
  await createSessionRecord(env.varun_portfolio_auth, {
    id: sessionId, userId, tokenHash, deviceName: name,
    userAgent: ua, ip, trusted: isTrusted, expiresAt,
  });

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId, type: 'login', ip, userAgent: ua, deviceName: name,
  });

  return json({ ok: true, user: { email } }, 200, {
    'Set-Cookie': sessionCookie(token, TTL),
  });
}
```

The key design choices in this function:

1. The pending session is deleted immediately on read — single-use
2. `tokenHash = await sha256Hex(token)` — the KV entry is keyed by hash, not by raw token
3. The D1 session record stores `tokenHash` — so revocation can find and delete the KV entry
4. The `Set-Cookie` header contains the *raw token* — the browser stores this

---

## 7.2 The KV + D1 Dual-Write

Every active session exists in two places simultaneously:

```text
KV:  session:{SHA256(token)}  → { userId, email, sessionId }
D1:  sessions table row       → { id, user_id, token_hash, device_name, user_agent, ip, trusted, expires_at, ... }
```

**Why KV?** The per-request auth check (`getSession`) needs to be fast. KV reads are served from the nearest edge cache and take typically 1–5ms. A D1 query would take 10–50ms and would count against the CPU budget. On every authenticated page load, the browser hits `/api/auth/me`, which calls `getSession`. Multiplied across all active users and page loads, KV is the right choice.

**Why D1?** The security dashboard needs to list sessions, show device names, show last-active timestamps, and support individual revocation. None of this is possible with KV alone. D1 also provides the `token_hash → sessionId` mapping needed for revocation.

---

## 7.3 The `getSession` Function

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

This function is called from every protected handler. The flow:

1. Extract the `session=` cookie value from the `Cookie` header
2. Hash it with SHA-256
3. Look up `session:{hash}` in KV
4. If found, return the session data (with the raw token included for downstream use)

The raw token is returned as part of the session object because some downstream operations (like logout and revocation) need it to delete the correct KV key.

**Where it's called:**
- `getMe` (every authenticated page load)
- Every `account.js` handler: `listSessions`, `revokeSession`, `revokeOtherSessions`, `renameSession`, `listPasskeys`, `revokePasskey`, `renamePasskey`, `listSecurityEvents`, `recoveryCodesStatus`, `regenerateRecoveryCodes`, `updateNickname`, `deleteAccount`
- `numMatchSubscribe` (WebSocket endpoint for trusted devices)
- `stepUpOptions`, `stepUpVerify`

---

## 7.4 Cookie Security

The session cookie is set with:

```js
// worker/auth/session.js lines 19-21
export function sessionCookie(token, maxAge = 86400) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
```

**`HttpOnly`:** The cookie is not accessible via `document.cookie`. XSS attacks that inject JavaScript cannot read the session token.

**`Secure`:** The cookie is only sent over HTTPS. In local development over HTTP, this is not enforced by the browser — which is fine for localhost. In production (`https://varunr.dev`), the cookie is never sent over HTTP.

**`SameSite=Strict`:** The cookie is only sent when the request originates from the same site. Cross-site requests (e.g., from a form on `evil.com` that POSTs to `varunr.dev`) do not include the cookie. This provides [CSRF](../glossary/README.md#cors) protection without a CSRF token.

**`Path=/`:** The cookie is sent for all paths on the domain.

**`Max-Age={TTL}`:** The browser sets the cookie expiration to TTL seconds from now. For trusted sessions (30 days), this is 2,592,000 seconds. For untrusted, 86,400 seconds.

To expire/clear the session cookie on logout, `sessionCookie` is called with an empty token and `maxAge=0`:
```js
return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
```

---

## 7.5 The Revocation Bug: Root Cause and Fix

**The bug:** In an early version of the code, `revokeSession` deleted the session from D1 but did not delete the corresponding KV entry. This meant a revoked session's cookie continued to work until the KV TTL expired — up to 30 days for a trusted session.

**Root cause:** The revocation endpoint (`DELETE /sessions/:id`) accepted a session ID (from D1) as its input parameter. But the KV entry was keyed by `session:{tokenHash}`. The session ID is not the token hash. To delete the KV entry, you need the token hash, which means you first need to look up the session in D1 by its ID.

**The fix:**

```js
// worker/auth/account.js lines 66-76
export async function revokeSession(request, env, sessionId) {
  const { session, error } = await requireSession(request, env);
  if (error) return error;

  const db = env.varun_portfolio_auth;

  // Fetch token_hash before deleting so we can also purge the KV entry.
  // Without this, the revoked session cookie stays valid until KV TTL expires.
  const record = await db
    .prepare('SELECT token_hash FROM sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, session.userId)
    .first();
  if (record) {
    await env.AUTH_KV.delete(`session:${record.token_hash}`);
  }

  await deleteSessionById(db, sessionId, session.userId);
  ...
}
```

The fix adds a SELECT before the DELETE to retrieve `token_hash`, then uses that to delete the KV entry before removing the D1 record.

The same fix applies to `revokeOtherSessions`:

```js
// worker/auth/account.js lines 100-106
// Purge KV entries for all sessions being revoked before deleting from D1
const others = await db
  .prepare('SELECT token_hash FROM sessions WHERE user_id = ? AND id != ?')
  .bind(session.userId, currentSession.id)
  .all();
await Promise.all((others.results ?? []).map(r => env.AUTH_KV.delete(`session:${r.token_hash}`)));
await deleteAllSessionsByUserIdExcept(db, session.userId, currentSession.id);
```

**The lesson:** In any system that stores the same logical entity in two stores, deletion must be coordinated across both stores. The "source of truth" for session identity is D1. The "fast path" is KV. Any operation that invalidates a session must update both.

---

## 7.6 The `touchSession` Mechanism

On every `/api/auth/me` call, the session's `last_active_at` timestamp in D1 is updated:

```js
// worker/auth/session.js lines 97-101
export async function touchSession(db, token) {
  const tokenHash = await sha256Hex(token);
  const record = await getSessionByTokenHash(db, tokenHash);
  if (record) await updateSessionLastActive(db, record.id);
}
```

This is called fire-and-forget from `getMe`:

```js
// worker/auth/session.js line 107
touchSession(env.varun_portfolio_auth, session.token).catch(() => {});
```

The `.catch(() => {})` means failure to update the timestamp does not fail the `/me` response. This is intentional: `last_active_at` is cosmetic information for the security dashboard. If D1 is momentarily unavailable, the user should still be able to load their portfolio content. The timestamp accuracy is best-effort.

---

## 7.7 The Trust Prompt UX

After every successful authentication, the user sees a modal:

> **Trust this device?**
> Trusted devices stay signed in for 30 days. Untrusted devices sign out after 24 hours. You can always revoke access from your security page.
>
> Device name (optional): [My MacBook, iPhone, etc.]
>
> [Not now]  [Trust this device]

The device name defaults to a human-readable label inferred from the User-Agent:

```js
// worker/utils.js lines 20-28
export function inferDeviceName(ua = '') {
  if (/iPhone/.test(ua))       return 'iPhone';
  if (/iPad/.test(ua))         return 'iPad';
  if (/Android/.test(ua))      return 'Android Device';
  if (/Macintosh/.test(ua))    return 'Mac';
  if (/Windows/.test(ua))      return 'Windows PC';
  if (/Linux/.test(ua))        return 'Linux Device';
  return 'Unknown Device';
}
```

The user can override this with a custom name. Device naming is purely cosmetic and has no security implications — it helps users identify which sessions to revoke ("Mac at work" vs "Mac at home").

---

## 7.8 Where This Could Fail

**KV eventual consistency window.** After revocation, the KV delete propagates to all edge nodes within a few seconds, but not instantaneously. In theory, a revoked session cookie used at a distant edge location within this window would still authenticate. The practical risk is low — the window is seconds, not minutes, and the attacker would need to be simultaneously at a distant edge location during the exact propagation window.

**D1 consistency during `touchSession`.** The `touchSession` write is best-effort. If it fails silently (due to D1 unavailability), `last_active_at` becomes stale. This is cosmetic, not a security issue.

**Cookie theft.** `HttpOnly` and `Secure` prevent most theft vectors, but if an attacker gains physical access to a device, they can read cookie files from disk. The response to this is the "revoke all sessions" feature in the security dashboard.

---

## Key Takeaways

- Sessions are two-phase: pending (KV-only, 5 min, not a valid auth token) → active (KV + D1, 24h or 30d, with session cookie).
- The session cookie contains the raw token. KV and D1 store only the hash. Database compromise does not yield usable sessions.
- Revocation must delete from both KV (using the token hash) and D1 (using the session ID). Forgetting KV leaves a revoked cookie working.
- `SameSite=Strict` provides CSRF protection without a CSRF token.
- `touchSession` updates `last_active_at` fire-and-forget; failures are non-fatal.
