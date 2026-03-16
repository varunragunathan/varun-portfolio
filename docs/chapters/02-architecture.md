# Chapter 2 — Architecture

## What You'll Learn

This chapter describes the full system architecture: every layer, every service, and how they connect. You will understand why Cloudflare Workers was chosen over a traditional server, how static assets and dynamic API routes coexist in the same deployment, how CORS works here and why it must, and what happens from the moment a browser sends a request until a response arrives.

---

## 2.1 The High-Level Picture

The system has two fundamental pieces: a React [SPA](../glossary/README.md#spa) (the frontend) and a Cloudflare Worker (the backend). They are deployed together as a single Cloudflare project, but they serve completely different concerns.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                              Browser                                     │
│  React SPA (HTML + JS bundle from dist/)                                 │
│  ┌──────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │  Static pages    │  │  Auth flows          │  │  Chat UI            │  │
│  │  Home, Settings  │  │  fetch('/api/auth/*')│  │  fetch('/api/chat') │  │
│  └──────────────────┘  └─────────────────────┘  └─────────────────────┘  │
└──────────────┬──────────────────────┬───────────────────────┬────────────┘
               │ Static assets        │ /api/auth/*           │ /api/chat*
               ▼                      ▼                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge (Worker)                              │
│  worker/index.js                                                         │
│  ┌───────────────────┐  ┌──────────────────────┐  ┌────────────────────┐ │
│  │  ASSETS binding   │  │  handleAuth() router  │  │  chat.js router    │ │
│  │  Serves static    │  │  worker/auth/router.js│  │  postChat          │ │
│  │  build (React     │  │                       │  │  listConversations │ │
│  │  bundle, SW,      │  │  OTP · Passkey        │  │  getConversation   │ │
│  │  manifest)        │  │  Session · NumMatch   │  │  deleteConversation│ │
│  └───────────────────┘  │  StepUp · Recovery    │  └────────┬───────────┘ │
│                         │  Account              │           │             │
│                         └──────────┬────────────┘           │             │
└────────────────────────────────────┼────────────────────────┼────────────┘
                                     │                        │
       ┌──────────────┬──────────────┤              ┌─────────┴────────────┐
       ▼              ▼              ▼              ▼                      ▼
┌────────────┐ ┌────────────┐ ┌──────────────┐ ┌──────────────┐  ┌──────────────┐
│ D1 (SQLite)│ │ KV (AUTH_KV│ │Durable Objects│ │  Vectorize   │  │ Workers AI   │
│ Persistent │ │ Ephemeral, │ │NUM_MATCH_DO  │ │varun-portfolio│  │ env.AI       │
│ structured │ │ fast:      │ │One/userId    │ │-rag index    │  │ bge-base-en  │
│ data:      │ │ OTP codes  │ │WebSocket     │ │768-dim cosine│  │ (embeddings) │
│ users      │ │ challenges │ │broker for    │ │vector store  │  │ llama-3.3-70b│
│ passkeys   │ │ sessions   │ │number match  │ │for RAG chat  │  │ (generation) │
│ sessions   │ │ num_match  │ └──────────────┘ └──────────────┘  └──────────────┘
│ recovery   │ │ step_up    │
│ security   │ └────────────┘
│ events     │
│ conversations│
│ chat_messages│
└────────────┘
```

---

## 2.2 Why Cloudflare Workers

Cloudflare Workers is a [V8](https://v8.dev)-isolate-based serverless runtime that runs code at Cloudflare's 300+ edge locations worldwide. The pitch for a personal project is compelling:

**Cost.** The free tier provides 100,000 requests per day, 10ms CPU per request, and unlimited KV reads. D1 and Durable Objects have free tiers too. For a portfolio site with modest traffic, the monthly cost is zero.

**No server management.** There are no instances to provision, no operating system to patch, no load balancers to configure. Deployment is `wrangler deploy`.

**Proximity to users.** A Worker handles a request at the edge location nearest to the user, typically adding less than 50ms of latency versus a centralized server that might be on the other side of a continent.

**Durable Objects.** This is the feature that makes the number-matching system possible. A Durable Object is a stateful singleton that can hold an open WebSocket connection, run JavaScript, and coordinate across multiple clients. The alternative — running a traditional WebSocket server — would require a persistent process, which does not fit the serverless model. DOs solve this without requiring a traditional server. (See [Chapter 8](./08-number-matching.md) for the full discussion.)

The tradeoffs are real. Workers have strict CPU limits (10ms per invocation on free tier, 50ms on paid). The PBKDF2 iteration count in `worker/auth/crypto.js` is set to 100 instead of a production-appropriate 100,000+ specifically because of this limit. The Workers runtime is also not Node.js — it exposes the W3C `crypto.subtle` API but not Node's `crypto` module.

---

## 2.3 The Three Storage Layers

The system uses three storage primitives for different purposes. Choosing the wrong one for a given use case would create either a correctness problem (using KV for things that need SQL queries) or a performance problem (using D1 for things that need sub-millisecond lookup).

### D1 — Cloudflare's SQLite

[D1](../glossary/README.md#d1-sqlite) is Cloudflare's managed SQLite database. It supports standard SQL, foreign key constraints (though this schema does not use CASCADE), prepared statements, and transactions. It is persistent, consistent (within a single statement), and slower than KV for point lookups.

**What lives in D1:** Everything that is permanent and queryable. Users, passkey credentials, sessions (for the security dashboard), recovery codes, and security events. D1 is the source of truth for anything you would want to query, list, join, or audit.

The D1 binding in this project is named `varun_portfolio_auth` (the name used in the Worker) and maps to the `varun-portfolio-auth` database in Cloudflare (from `wrangler.toml` line 17–19).

### KV — Cloudflare Workers KV

[KV](../glossary/README.md#kv-store) is a globally-distributed, eventually-consistent key-value store. Reads are fast (served from the nearest edge cache). Writes propagate to the global network within 60 seconds in the worst case. KV supports TTL (automatic key expiration), which makes it ideal for tokens and codes that should expire.

**What lives in KV:** Everything ephemeral with a TTL. OTP codes, WebAuthn challenges, pending sessions, active session tokens (for fast auth lookup), number-match state, step-up tokens, and rate limit counters. The KV binding is named `AUTH_KV`.

The key naming conventions are described in detail in [Chapter 3](./03-database-schema.md).

**The critical point about KV and eventual consistency:** KV reads after a write are not guaranteed to reflect the write immediately at a different edge node. In practice the window is seconds, not minutes. But it means there is a theoretical window in which a revoked session token might still pass the KV lookup at a distant edge. This is analyzed in [Chapter 12](./12-security-analysis.md).

### Durable Objects

[Durable Objects](../glossary/README.md#durable-object) are stateful Workers that guarantee single-instance execution. A DO has in-memory state, can hold open WebSocket connections, and has its own storage (SQLite-based in newer configurations). DOs are addressed by name or by ID.

**What uses DOs:** The number-matching system. Each user gets one DO instance, keyed by `userId`, that acts as a WebSocket pub/sub broker. When a new device attempts sign-in, the Worker sends a broadcast request to the user's DO. The DO pushes an approval request message to all trusted devices connected via WebSocket. When a trusted device approves or denies, the DO sends the result back to the waiting new device.

The DO class is `NumMatchDO` in `worker/numMatchDO.js`, exported through `worker/index.js`, and bound as `NUM_MATCH_DO` in `wrangler.toml`.

---

## 2.4 The ASSETS Binding and Static + Dynamic Coexistence

The Vite build produces a `dist/` directory containing the React bundle, HTML, icons, the web app manifest, and the service worker. This directory is registered as an asset binding in `wrangler.toml`:

```toml
# wrangler.toml lines 12-13
[assets]
directory = "./dist"
```

The Worker then serves this static build for every request that does not match `/api/auth/*`:

```js
// worker/index.js lines 59-61
// All non-auth requests → serve the React static build
return env.ASSETS.fetch(request);
```

This design means the Worker is both the API server and the static file server. There is no separate CDN configuration, no separate origin server. One Worker, one deployment, one `wrangler deploy` command serves everything.

The routing logic is simple and explicit:

```js
// worker/index.js lines 32-61
if (url.pathname.startsWith('/api/auth/')) {
  if (env.ENABLE_AUTH !== 'true') {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, ... });
  }
  // ... handle auth, attach CORS headers
}
// Everything else falls through to ASSETS
return env.ASSETS.fetch(request);
```

The `ENABLE_AUTH` flag is a safety valve. When set to `"false"`, the entire auth subsystem is invisible — routes return 404 as if they don't exist. This allows deploying the portfolio content without auth if needed.

---

## 2.5 The `/api/chat` Route Block

The RAG chat system (see [Chapter 15](./15-rag-system.md)) adds a second routing block to `worker/index.js`, evaluated before the `/api/auth/` block:

```js
// worker/index.js lines 33-71
if (url.pathname.startsWith('/api/chat')) {
  try {
    const path   = url.pathname;
    const method = request.method;
    let response;

    const convMatch = path.match(/^\/api\/chat\/conversations\/([^/]+)$/);
    if (convMatch) {
      const id = convMatch[1];
      if (method === 'GET')         response = await getConversation(request, env, id);
      else if (method === 'DELETE') response = await deleteConversation(request, env, id);
      else response = new Response('Method Not Allowed', { status: 405 });
    } else if (path === '/api/chat/conversations') {
      if (method === 'GET') response = await listConversations(request, env);
      else response = new Response('Method Not Allowed', { status: 405 });
    } else if (path === '/api/chat') {
      if (method === 'POST') response = await postChat(request, env);
      else response = new Response('Method Not Allowed', { status: 405 });
    } else { ... }

    // SSE responses must pass through unmodified
    if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response;

    // All other chat responses get CORS headers attached
    const headers = new Headers(response.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  } catch (err) { ... }
}
```

The routes are:

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| `POST` | `/api/chat` | `postChat` | Send message, receive SSE stream |
| `GET` | `/api/chat/conversations` | `listConversations` | List user's conversations (max 50) |
| `GET` | `/api/chat/conversations/:id` | `getConversation` | Get messages for a conversation |
| `DELETE` | `/api/chat/conversations/:id` | `deleteConversation` | Delete conversation and its messages |

Unlike `/api/auth/*`, the chat routes have no `ENABLE_AUTH` feature flag. They are always present. They do require an active session (each handler calls `getSession` as its first operation), so unauthenticated requests receive a 401 before any chat logic runs.

The SSE pass-through rule (`if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response`) prevents the CORS-header-attachment code from consuming the `postChat` response body. Constructing a `new Response(response.body, ...)` with a streaming body would create a new stream backed by the original — this is generally safe, but `transformStream` already sets the `ReadableStream` in motion before `postChat` returns. Passing it through directly is simpler and avoids any risk of inadvertently buffering the stream.

---

## 2.6 CORS Handling and Why It Matters

[CORS](../glossary/README.md#cors) (Cross-Origin Resource Sharing) is the browser mechanism that controls whether JavaScript running on one origin can read responses from a different origin. Without the right CORS headers, the React app's `fetch('/api/auth/...')` calls would be blocked by the browser.

In this project, CORS is handled at the top of `worker/index.js`:

```js
// worker/index.js lines 8-19
const ALLOWED_ORIGINS = ['https://varunr.dev', 'http://localhost:5173'];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}
```

**Why `Access-Control-Allow-Credentials: true`?** Session cookies need this. When a request is made with `credentials: 'include'` (as all auth fetch calls are), the browser will not send or accept cookies unless the server explicitly permits it. Without this header, the session cookie set by `/sessions/finalise` would never be sent on subsequent requests.

**Why `Vary: Origin`?** Without this, a caching proxy could serve a response that was originally issued with `Access-Control-Allow-Origin: https://varunr.dev` to a request coming from `http://localhost:5173`. The `Vary: Origin` header tells caches that this response's cacheability depends on the Origin request header.

**CORS preflight (OPTIONS) handling:** Browsers send an OPTIONS request before any non-simple cross-origin request (e.g., POST with JSON body). The Worker intercepts this immediately:

```js
// worker/index.js lines 27-30
if (request.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: cors });
}
```

**WebSocket 101 responses:** When a WebSocket upgrade succeeds, the response has status 101 and carries a `webSocket` property. Wrapping this in a `new Response(...)` would lose that property and break the WebSocket. The Worker explicitly passes these through:

```js
// worker/index.js lines 43-45
if (response.status === 101) return response;
```

---

## 2.7 Request Lifecycle

A complete request lifecycle for a passkey authentication attempt:

```text
1. Browser: fetch('POST /api/auth/passkey/auth/options', {credentials:'include'})
   - Includes Cookie: session=... if one exists
   - Includes Origin: https://varunr.dev

2. Cloudflare edge receives request at nearest PoP
   - Routes to the Worker for varunr.dev

3. Worker (worker/index.js):
   - Parses URL, extracts Origin
   - Computes CORS headers
   - Checks ENABLE_AUTH flag
   - Calls handleAuth(request, env, url)

4. Router (worker/auth/router.js):
   - Matches 'POST' + '/passkey/auth/options'
   - Calls getAuthOptions(request, env)

5. getAuthOptions (worker/auth/passkey.js):
   - Reads email from request body
   - Queries D1: SELECT * FROM users WHERE email = ?
   - If user found: fetches passkey creds from D1
   - Calls generateAuthenticationOptions() from @simplewebauthn/server
   - Stores challenge in KV: auth_challenge:{userId} (60s TTL)
   - Returns JSON: { options, userId }

6. Worker attaches CORS headers to response

7. Browser receives { options, userId }
   - Calls startAuthentication({ optionsJSON: options })
   - Browser shows passkey picker / TouchID / FaceID prompt
   - User authenticates; browser returns authResponse

8. Browser: fetch('POST /api/auth/passkey/auth/verify', ...)
   - Sends { userId, authResponse }

9. Worker → getAuthOptions → verifyAuth (worker/auth/passkey.js):
   - Reads challenge from KV, deletes it
   - Fetches credential from D1
   - Calls verifyAuthenticationResponse() from @simplewebauthn/server
   - Checks sign count
   - Checks if device is known (D1 query by user_agent)
   - If new device + trusted sessions exist: create number match KV entries,
     broadcast to DO, return { pendingNumberMatch: true, code, tempToken }
   - If known device: createPendingSession (KV), return { ok, pendingToken }

10. Browser:
    - If pendingNumberMatch: show NumberMatchScreen component, open WebSocket
    - If pendingToken: show TrustDeviceModal

11. User completes trust prompt → finaliseSession():
    - POST /api/auth/sessions/finalise { token, trusted, deviceName }
    - Worker creates KV entry: session:{tokenHash} (24h or 30d TTL)
    - Worker creates D1 record in sessions table
    - Worker sets Set-Cookie: session=<token>; HttpOnly; Secure; SameSite=Strict

12. Browser stores cookie; all subsequent requests include it automatically
```

---

## 2.8 The Compatibility Date and nodejs_compat Flag

The `wrangler.toml` specifies:

```toml
compatibility_date = "2025-09-27"
compatibility_flags = ["nodejs_compat"]
```

The [compatibility date](../glossary/README.md#compatibility-date) is a contract with Cloudflare. Breaking changes to the Workers runtime are gated behind a date; Workers with an older date see the older behavior. Setting it to a recent date opts into all improvements up to that point.

The `nodejs_compat` flag enables a set of Node.js-compatible APIs in the Workers runtime — things like `Buffer`, certain stream APIs, and `process.env`-style access. The project uses this primarily for the `resend` npm package (the email-sending library), which has internal Node.js dependencies that would otherwise fail at the Workers runtime boundary.

---

## Key Takeaways

- The system has five storage/compute layers: D1 for persistent structured data, KV for ephemeral keyed data with TTLs, Durable Objects for real-time WebSocket coordination, Vectorize for vector similarity search, and Workers AI for embeddings and LLM inference.
- The entire backend — API, static file serving, and RAG chat — runs as a single Cloudflare Worker with no separate server.
- CORS headers must include `Allow-Credentials: true` for session cookies to work; `Vary: Origin` prevents incorrect caching.
- SSE streaming responses must bypass CORS header attachment in the same way that WebSocket 101 responses must bypass wrapping — consuming the body to attach headers would break the stream.
- The `compatibility_date` and `nodejs_compat` flag are not boilerplate — they have real behavioral implications.
- The chat routing block (`/api/chat*`) evaluates before the auth block and has no `ENABLE_AUTH` flag. All chat routes require an active session regardless.
