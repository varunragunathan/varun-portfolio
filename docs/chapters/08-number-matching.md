# Chapter 8 — Number Matching

## What You'll Learn

This chapter covers the number matching system: what it is, why it was designed the way it is, how the Durable Objects + WebSocket architecture works, the complete message protocol, the KV fallback for DO restarts, the token vocabulary (`tempToken`, `approvalToken`, `condToken`), and the frontend components that implement the user experience on both sides.

---

## 8.1 What Number Matching Is and Why

Number matching is a device approval mechanism that asks: "Did a trusted user actually initiate this sign-in, or is something malicious happening?"

The scenario it defends against: a new device (different User-Agent than any previously seen session) attempts to authenticate with a valid passkey. The passkey might be synced — the same credential now available on multiple devices. Or it might be a new device the user just set up. Or it might be an attacker who somehow obtained the user's passkey. The server cannot distinguish these cases from the authentication alone.

Number matching adds a human-in-the-loop check. It works like this:

1. The new device sees a two-digit number on screen (e.g., "47")
2. The user's trusted device (any already-signed-in, trusted browser) receives a notification: "A Mac is trying to sign in. Does it show the number 47?"
3. If the trusted device user taps Approve (and the numbers match), the sign-in proceeds
4. If they tap Deny, the sign-in is blocked

This is the same pattern used by enterprise MDM (Mobile Device Management) solutions and some identity providers for device enrollment. It provides a second factor that is resistant to credential theft: even if an attacker has the passkey, they cannot get through number matching without access to a trusted device.

**No SMS.** Unlike phone-based approval flows, this requires no phone number, no carrier, and no SMS. Approval happens over WebSocket to any trusted browser tab.

---

## 8.2 When Number Matching Triggers

Number matching triggers in `verifyAuth` when two conditions are both true:

```js
// worker/auth/passkey.js lines 261-264
const knownDevice = await isKnownDevice(db, userId, ua);
const hasKnownTrusted = await hasTrustedSessions(db, userId);

if (!knownDevice && hasKnownTrusted) {
  // ... trigger number matching
}
```

**`isKnownDevice`:** Returns true if there exists any active session for this user with the same User-Agent string. This is a heuristic — the same User-Agent on two different computers would incorrectly be treated as "known." But User-Agent strings are specific enough in practice to distinguish device classes, and this is a low-stakes heuristic for a personal portfolio.

**`hasTrustedSessions`:** Returns true if the user has at least one active, trusted session. If the user has no trusted sessions (e.g., all previous sessions were "Not now" / untrusted, or all sessions expired), number matching is skipped and the new device sign-in proceeds normally. This is necessary for the first sign-in after all sessions expire — the user would otherwise be permanently locked out.

---

## 8.3 The Original Polling Architecture and Its Problems

Before the Durable Objects implementation, number matching used polling. Trusted devices would periodically call a REST endpoint to check if a pending approval existed for their user.

This created scaling concerns: N trusted devices × 1 poll per 3 seconds = N * 20 requests per minute per user. For a user with 5 trusted devices, that's 100 requests per minute just to check for approvals. Most of those requests return "nothing pending." This is wasteful and adds unnecessary load.

The Durable Objects + WebSocket redesign eliminates polling entirely. The trusted device opens a persistent WebSocket connection to the user's DO. When a new device triggers number matching, the DO pushes the approval request immediately. No polling. Zero requests between events.

---

## 8.4 The Durable Objects + WebSocket Architecture

```text
                         ┌─────────────────────────────────────┐
                         │  NumMatchDO (per userId, singleton)  │
                         │                                     │
  Trusted device ←──── WebSocket ('trusted' client) ──────────│
  (browser, open tab)                                          │
                         │  this.clients: Map<WS, {type}>      │
  New device    ←──── WebSocket ('waiting' client) ───────────│
  (auth flow)                                                  │
                         │  this.pending: { approvalToken,     │
                         │                  code, userAgent }  │
                         └────────────────────┬────────────────┘
                                              │
              POST /broadcast (internal HTTP) │
                                              │
                         ┌────────────────────┴────────────────┐
                         │  Cloudflare Worker (verifyAuth)      │
                         │  - Sets KV entries                   │
                         │  - Calls stub.fetch('/broadcast')    │
                         └─────────────────────────────────────┘
```

There is one DO instance per `userId`, obtained by:
```js
const doId = env.NUM_MATCH_DO.idFromName(userId);
const stub = env.NUM_MATCH_DO.get(doId);
```

`idFromName(userId)` produces a deterministic DO ID from the user ID string. The same userId always resolves to the same DO instance, ensuring all WebSocket connections for a given user land on the same DO.

---

## 8.5 The `NumMatchDO` Class

```js
// worker/numMatchDO.js lines 22-31
export class NumMatchDO {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
    // Map<WebSocket, { type: 'trusted'|'waiting', approvalToken?: string }>
    this.clients = new Map();
    // Current pending approval (in-memory; backed by KV as source of truth)
    this.pending = null; // { approvalToken, code, userAgent }
    this.userId  = null;
  }
```

**`this.clients`:** An in-memory Map of all currently connected WebSockets. Each entry records whether the client is a `'trusted'` device (waiting to approve) or `'waiting'` device (the new device waiting for a result).

**`this.pending`:** The current pending approval, held in memory. This is lost if the DO restarts. KV is the fallback (see Section 8.7).

The DO's `fetch` handler routes incoming requests by method and path:

- `POST /broadcast` — internal call from the Worker when a new device triggers number matching
- WebSocket upgrade — connections from trusted or waiting devices

---

## 8.6 The Complete Message Protocol

**Worker → DO (internal HTTP):**
```text
POST /broadcast
Body: { approvalToken, code, userAgent, userId }
```
The DO stores the pending approval in memory and broadcasts an `approval_request` message to all connected trusted clients.

**DO → trusted device:**
```json
{ "type": "approval_request", "approvalToken": "...", "code": 47, "userAgent": "Mozilla/5.0..." }
```

**Trusted device → DO:**
```json
{ "type": "respond", "approvalToken": "...", "approved": true }
```

**DO → waiting device (after respond):**
```json
{ "type": "result", "approved": true, "pendingToken": "..." }
```
or
```json
{ "type": "result", "approved": false }
```

**DO → trusted devices (cleanup after respond):**
```json
{ "type": "resolved", "approvalToken": "..." }
```
This tells trusted device tabs to dismiss their approval modal.

---

## 8.7 The KV Fallback for DO Restarts

Durable Objects can be evicted from memory if idle. If the DO restarts between the time a number-match is initiated and the time a trusted device connects, the `this.pending` state is lost.

The KV entries written during `verifyAuth` serve as the fallback:

```js
// worker/auth/passkey.js lines 271-286
await env.AUTH_KV.put(
  `num_match:${approvalToken}`,
  JSON.stringify({ userId, email: user.email, code: displayCode, approved: false, denied: false }),
  { expirationTtl: TTL },
);
await env.AUTH_KV.put(
  `num_match_for_user:${userId}`,
  JSON.stringify({ approvalToken, code: displayCode, userAgent: ua }),
  { expirationTtl: TTL },
);
```

When a trusted device connects via WebSocket, the DO checks for in-memory state first, then falls back to KV:

```js
// worker/numMatchDO.js lines 71-85
let toSend = this.pending;
if (!toSend && this.userId) {
  // DO may have restarted; fall back to KV
  const raw = await this.env.AUTH_KV.get(`num_match_for_user:${this.userId}`);
  if (raw) {
    const { approvalToken: at, code, userAgent } = JSON.parse(raw);
    // Verify it hasn't already been resolved
    const still = await this.env.AUTH_KV.get(`num_match:${at}`);
    if (still) {
      toSend = { approvalToken: at, code, userAgent };
      this.pending = toSend;
    }
  }
}
if (toSend) {
  server.send(JSON.stringify({ type: 'approval_request', ...toSend }));
}
```

The double-check (`num_match:{approvalToken}` still exists) prevents sending a stale approval request that has already been resolved.

---

## 8.8 The Token Vocabulary

The number-matching flow uses three distinct tokens, which are easy to confuse:

| Token | Created | Stored in | Purpose |
|-------|---------|-----------|---------|
| `approvalToken` | `verifyAuth` in Worker | `num_match:{approvalToken}` in KV, passed via WebSocket | Identifies this specific approval request. Used by trusted device to approve/deny. |
| `tempToken` | `verifyAuth` in Worker | `num_match_pending:{tempToken}` in KV | Given to the new device. Used to authorize the `/num-match/wait` WebSocket connection. |
| `condToken` | `getAuthOptions` in Worker | `cond_challenge:{condToken}` in KV | Used only for conditional mediation — a stand-in for userId when the challenge must be stored before the user is known. |

The `tempToken` is the new device's credential for accessing the waiting WebSocket. It proves to the Worker that this WebSocket connection is legitimate before it is forwarded to the DO.

The `approvalToken` is the approval request identifier. It links the KV approval state, the DO's in-memory pending state, and the WebSocket messages on both sides.

These are distinct because they serve different security functions: `tempToken` authenticates the new device; `approvalToken` identifies the approval request; `condToken` is for conditional mediation only.

---

## 8.9 The Broadcast Flow End-to-End

```text
1. New device calls /passkey/auth/verify
   Worker (verifyAuth):
   - isKnownDevice = false, hasTrustedSessions = true
   - Generates: code=47, approvalToken=UUID-A, tempToken=TOKEN-B
   - KV: num_match:UUID-A = { userId, email, code: 47 }
   - KV: num_match_pending:TOKEN-B = { code: 47, approvalToken: UUID-A, userId }
   - KV: num_match_for_user:{userId} = { approvalToken: UUID-A, code: 47, userAgent }
   - HTTP POST to DO: { approvalToken: UUID-A, code: 47, userAgent, userId }
   - Response to new device: { pendingNumberMatch: true, code: 47, tempToken: TOKEN-B }

2. DO receives POST /broadcast
   - Stores this.pending = { approvalToken: UUID-A, code: 47, userAgent }
   - Broadcasts to all connected 'trusted' clients:
     { type: 'approval_request', approvalToken: UUID-A, code: 47, userAgent }

3. Trusted device receives 'approval_request' via WebSocket
   - Frontend sets approval state
   - NumMatchApprovalModal renders with code: 47

4. New device connects to /num-match/wait?token=TOKEN-B
   Worker (numMatchWait):
   - Validates TOKEN-B in KV, extracts approvalToken and userId
   - Forwards WebSocket upgrade to DO with type=waiting, approvalToken=UUID-A

5. User on trusted device taps Approve
   Frontend sends to DO: { type: 'respond', approvalToken: UUID-A, approved: true }

6. DO.handleResponse(UUID-A, true):
   - Reads num_match:UUID-A from KV, gets { userId, email }
   - Deletes num_match:UUID-A from KV
   - Deletes num_match_for_user:{userId} from KV
   - Calls createPendingSession(kv, { userId, email })
   - Sends to waiting client: { type: 'result', approved: true, pendingToken: PENDING-C }
   - Sends to all trusted clients: { type: 'resolved', approvalToken: UUID-A }
   - Clears this.pending

7. New device receives 'result' { approved: true, pendingToken: PENDING-C }
   Frontend: setShowTrust(true) — shows TrustDeviceModal with pendingToken

8. User on new device completes trust prompt → finaliseSession(PENDING-C, trusted, name)
   → Active session issued
```

---

## 8.10 The Frontend

**On the trusted device — `useNumMatchApproval` hook:**

```js
// src/hooks/useNumMatchApproval.jsx lines 7-68
export function useNumMatchApproval(user) {
  const [approval, setApproval] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!user) { setApproval(null); return; }
    // connect WebSocket on mount; reconnect on close
    function connect() {
      ws = new WebSocket(`${protocol}//${host}/api/auth/num-match/subscribe`);
      ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'approval_request') {
          setApproval({ approvalToken: msg.approvalToken, code: msg.code, userAgent: msg.userAgent });
        } else if (msg.type === 'resolved') {
          setApproval(prev => prev?.approvalToken === msg.approvalToken ? null : prev);
        }
      });
      ws.addEventListener('close', () => {
        reconnectTimer = setTimeout(connect, 3000);
      });
    }
    connect();
  }, [user]);
```

This hook runs in `App.jsx` for any authenticated user. It holds the WebSocket open for the life of the session. When an `approval_request` arrives, the `approval` state is set, which renders `NumMatchApprovalModal` in the app shell.

The hook auto-reconnects after 3 seconds on disconnect. This handles:
- Tab going to background (some browsers close WebSockets on backgrounded tabs)
- DO restart (connection drops; reconnect picks up the KV fallback)
- Network hiccup

**On the new device — `NumberMatchScreen` component:**

```js
// src/pages/Auth.jsx lines 263-311
function NumberMatchScreen({ code, tempToken, onApproved, onDenied }) {
  useEffect(() => {
    function connect() {
      ws = new WebSocket(`${protocol}//${host}/api/auth/num-match/wait?token=${tempToken}`);
      ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'result') {
          done = true;
          if (msg.approved) {
            setStatus('approved');
            onApproved(msg.pendingToken);
          } else {
            setStatus('denied');
            onDenied();
          }
        }
      });
      ws.addEventListener('close', () => {
        if (!done) reconnectTimer = setTimeout(connect, 5000);
      });
    }
    connect();
  }, [tempToken]);
```

The new device reconnects on disconnect with a 5-second delay (slightly longer than the trusted device's 3s, to avoid thundering herd during a DO restart). The `done` flag prevents multiple reconnects after a final result is received.

---

## 8.11 Where This Could Fail

**DO cold start latency.** If the user's DO instance is not running when `verifyAuth` fires the broadcast, the HTTP call to `/broadcast` creates the DO and runs the broadcast. But if no trusted devices are connected yet, the broadcast sends to zero clients. The trusted device will pick up the pending approval from KV when it connects. This works, but the latency between "new device signs in" and "trusted device sees the approval" depends on the trusted device being open and connected.

**Multiple trusted devices.** If the user has 3 trusted device sessions open, all 3 will see the approval modal. The first one to respond resolves the approval; the others receive `resolved` and dismiss their modal. This is correct behavior, but a user might be confused by seeing three modals disappear.

**Reconnection race.** If the new device's WebSocket disconnects just after the approval result is sent, the 5-second reconnect timer fires. When it reconnects, it sends the `tempToken` again. The Worker's `numMatchWait` handler looks up `num_match_pending:{tempToken}` in KV. By this point the approval has been resolved and `num_match_pending:{tempToken}` may or may not have been deleted (it has its own 5-minute TTL and is not explicitly deleted on resolution). If it still exists, the new device reconnects to the DO as a `waiting` client. The DO will not resend the result because `this.pending` is `null`. The waiting client just sits open indefinitely until the 5-minute TTL expires. This is a minor resource leak in an edge case.

**The `num_match_pending:{tempToken}` key is not deleted on resolution.** The DO's `handleResponse` deletes `num_match:{approvalToken}` and `num_match_for_user:{userId}` but not `num_match_pending:{tempToken}`. This means a reconnecting new device can rejoin as a waiting client even after the result was delivered. It will not receive the result a second time, but it will hold an open (now-useless) WebSocket connection until the 5-minute TTL causes the KV entry to expire. This is not a security issue, only a cosmetic resource usage issue.

---

## Key Takeaways

- Number matching provides a human-in-the-loop second factor for new-device sign-ins, using a two-digit code verified on a trusted device.
- The architecture moved from polling (N requests/sec) to WebSocket push (zero requests between events) using Durable Objects.
- One DO instance per user, addressed by userId, acts as a WebSocket pub/sub broker.
- KV provides a fallback for DO restarts: trusted devices can recover pending approvals from KV on reconnect.
- Three tokens serve three distinct roles: `approvalToken` (the request), `tempToken` (new device's WebSocket credential), `condToken` (conditional mediation only).
- The `useNumMatchApproval` hook runs for all authenticated users and keeps a WebSocket open for the lifetime of the session, with 3-second auto-reconnect.
