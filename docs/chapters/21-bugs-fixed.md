# Chapter 21 — Bugs Fixed

A log of production bugs discovered and resolved. Each entry has a one-liner summary and a link to the detailed description of the root cause and fix.

---

## Bug Index

| # | Severity | Area | Summary | Fixed in |
|---|----------|------|---------|----------|
| [BUG-001](#bug-001-infinite-websocket-reconnect-for-non-trusted-sessions) | High | Auth / WebSocket | Non-trusted sessions hammered `/api/auth/num-match/subscribe` with a 3-second reconnect loop — 100% error rate | v0.2.20 |
| [BUG-002](#bug-002-frozenchat-freezes-after-second-demo) | Medium | Frontend | `FrozenChat` animation froze permanently after the second Q&A pair due to a shared timer ref being cancelled by the wrong effect | v0.2.20 |
| [BUG-003](#bug-003-frozenchat-height-expansion-during-typewriter-animation) | Low | Frontend / UX | The chat demo window expanded vertically as longer answers were typed out, causing layout jank | v0.2.20 |

---

## BUG-001 — Infinite WebSocket Reconnect for Non-Trusted Sessions

**Severity:** High
**Area:** Auth, WebSocket, Endpoint Metrics
**Fixed in:** v0.2.20 (commit `bce1aae`)

### Symptom

`GET /api/auth/num-match/subscribe` showed 405 total calls with a 100% error rate over 7 days in the endpoint metrics dashboard. The errors had been happening silently in a loop.

### Root Cause

`useNumMatchApproval(user)` ran for **every authenticated user**, regardless of whether their session was trusted. The endpoint requires a trusted session (`trusted = 1` in the sessions table) and returns 403 for non-trusted sessions. When the WebSocket upgrade is rejected with 403, the browser fires the `close` event. The hook's `close` handler scheduled a reconnect in 3 seconds unconditionally:

```js
ws.addEventListener('close', () => {
  if (!destroyed) reconnectTimer = setTimeout(connect, 3000);
});
```

This created a tight loop: connect → 403 → close → wait 3s → connect → 403 → ... indefinitely for every non-trusted authenticated session. Each failed attempt registered as an error in endpoint metrics.

### Fix

Two changes:

1. **`GET /api/auth/me`** now queries the `sessions` table and returns `trusted: boolean` in the user object:

```js
// worker/auth/session.js
const tokenHash = await sha256Hex(session.token);
const sessionRecord = await db
  .prepare('SELECT trusted FROM sessions WHERE token_hash = ? LIMIT 1')
  .bind(tokenHash)
  .first();
const trusted = sessionRecord?.trusted === 1;

return json({ user: { ..., trusted } });
```

2. **`useNumMatchApproval`** bails out early if the session is not trusted:

```js
if (!user || !user.trusted) { setApproval(null); return; }
```

Non-trusted sessions never open the WebSocket. The endpoint now only sees connections from sessions that will pass the server-side trust check.

---

## BUG-002 — FrozenChat Freezes After Second Demo

**Severity:** Medium
**Area:** Frontend, Animation
**Fixed in:** v0.2.20 (commit `9bce345`)

### Symptom

The animated `FrozenChat` typewriter demo on the Home page and Chat gate would complete the first Q&A pair correctly, show the second question, then freeze — the typing animation never started for the second (and subsequent) pairs.

### Root Cause

Two `useEffect` hooks shared a single `timerRef`:

- The **`idx` effect** (runs when the demo index changes): sets `timerRef.current` to a 600ms timeout that transitions phase to `'typing-a'`.
- The **`done` effect** (runs when phase reaches `'done'`): sets `timerRef.current` to a 3200ms timeout that fades and advances the index.

The race:

1. The `done` effect fires, sets a 3200ms outer timeout.
2. That timeout fires, sets `visible = false` and a 350ms inner timeout.
3. The inner timeout fires, calls `setIdx(i + 1)`.
4. `idx` changes → `idx` effect fires: sets `timerRef.current` to the new 600ms timer, then sets `phase = 'show-q'`.
5. **`phase` changing to `'show-q'` triggers the `done` effect's cleanup** (because `phase` is in its dependency array).
6. The cleanup calls `clearTimeout(timerRef.current)` — which cancels the 600ms timer that was just set by the `idx` effect.
7. The typing never starts. The demo is frozen.

### Fix

Split the shared ref into two independent refs — one for each effect's timeouts:

```js
const idxTimerRef  = useRef(null);  // used by the idx effect
const doneTimerRef = useRef(null);  // used by the done effect
```

Each effect's cleanup only cancels its own timer. The two effects are now fully independent.

---

## BUG-003 — FrozenChat Height Expansion During Typewriter Animation

**Severity:** Low
**Area:** Frontend / UX
**Fixed in:** v0.2.20 (commit `38a2480`)

### Symptom

As the typewriter animation typed out the passkey explanation (the longest demo answer, ~310 characters), the chat demo card grew taller with each character added, causing the page layout below it to shift repeatedly during the animation.

### Root Cause

The messages container used `minHeight: 160`, which allows the container to grow beyond 160px. The passkey answer, when fully typed at 13px/1.6 line-height in an 82%-width bubble, wraps to ~7 lines and requires approximately 230px of height. As characters were added, the container expanded incrementally.

### Fix

Replace `minHeight: 160` with `height: 240, overflow: 'hidden'`. The container is now a fixed height large enough to accommodate the tallest demo answer. Shorter answers leave whitespace at the bottom, which is not visible due to the card's overall layout. No content is clipped because 240px comfortably fits all demo answers.

---

## Key Takeaways

- Non-reconnecting on non-retryable errors (like 403) is important for WebSocket clients. Always gate connections on the trust/auth state before opening.
- Shared `useRef` values across multiple `useEffect` cleanup functions are a subtle bug vector — effects with different dependency arrays will cancel each other's timers unpredictably.
- Animation containers that use `minHeight` will grow during content injection. Use a fixed `height` with `overflow: hidden` when the maximum content size is known.
