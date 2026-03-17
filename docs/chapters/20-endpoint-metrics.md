# Chapter 20 — Endpoint Metrics and Request Logging

## What You'll Learn

This chapter documents how every request to the Worker is logged asynchronously to D1, how paths are normalized before storage, and how the metrics query aggregates this data into trend charts and per-endpoint breakdowns for the admin dashboard's Endpoints tab.

---

## 20.1 Why Log Requests at the Edge

Traditional server-side request logging writes to a log file or a centralized logging service. A Cloudflare Worker has neither — logs are emitted to Workers Logpush (a separate product) or to `console.log` (visible in the dashboard during development). For structured, queryable request history, D1 is the right tool.

The endpoint metrics system serves two purposes:
1. **Observability:** Which endpoints are being called, and how often? What is the error rate on each route?
2. **Traffic patterns:** Are there spikes? Which pages do users visit? When is the site most active?

---

## 20.2 The `endpoint_logs` Table

```sql
CREATE TABLE IF NOT EXISTS endpoint_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  status     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_endpoint_logs_created_at ON endpoint_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_endpoint_logs_path       ON endpoint_logs(path, method);
```

| Column | Purpose |
|--------|---------|
| `id` | Auto-increment integer primary key. Faster than UUID for high-insert tables. |
| `method` | HTTP method: `GET`, `POST`, `DELETE`, `PATCH`. |
| `path` | Normalized path — IDs replaced with `:id`. |
| `status` | HTTP response status code. |
| `created_at` | Unix timestamp in milliseconds. |

**Why no `user_id`?** Adding user_id would require reading the session cookie on every request — an async KV lookup — just for logging. This would add latency to every request on the hot path. Aggregate metrics (volume, error rate, trends) do not require per-user attribution. The security events table already provides user-attributed event logging for auth actions.

**Why `INTEGER PRIMARY KEY AUTOINCREMENT` instead of UUID?** This table is written on every request and read only for admin analytics. Auto-increment integers are faster to insert and smaller to store than UUIDs, which matters for a high-volume log table.

---

## 20.3 Path Normalization

Without normalization, every conversation ID would appear as a separate endpoint:
- `/api/chat/conversations/abc123def456` — conversation 1
- `/api/chat/conversations/xyz789abc012` — conversation 2

These are the same endpoint (`GET /api/chat/conversations/:id`) with different resource IDs. Normalization groups them:

```js
// worker/endpointMetrics.js
function normalizePath(pathname) {
  return pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
}
```

Two replacement passes:
1. **UUID format** (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) — catches standard UUID v4 IDs
2. **Long alphanumeric** (20+ characters) — catches base64url-encoded IDs (passkey credential IDs, session IDs) that are not UUID-formatted

The result: `/api/chat/conversations/abc123def456` becomes `/api/chat/conversations/:id`. The metrics table sees one endpoint, not thousands.

---

## 20.4 Async Logging Middleware

The logging runs after the response is ready and uses `ctx.waitUntil` to prevent it from blocking the response:

```js
// worker/index.js
export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env);

    const url    = new URL(request.url);
    const isApi  = url.pathname.startsWith('/api/');
    const isPage = !isApi &&
                   request.method === 'GET' &&
                   !/\.[a-z0-9]+$/i.test(url.pathname);

    if (
      request.method !== 'OPTIONS' &&
      response.status !== 101 &&
      url.pathname !== '/api/admin/endpoint-metrics' &&
      (isApi || isPage)
    ) {
      ctx.waitUntil(logEndpointRequest(env.varun_portfolio_auth, request, response));
    }

    return response;
  },
};
```

**What is logged:**
- All `/api/*` requests (excluding OPTIONS, WebSocket upgrades, and the endpoint-metrics endpoint itself)
- All SPA page navigations: `GET` requests with no file extension in the path (e.g., `/`, `/chat`, `/admin`, `/security`)

**What is excluded:**
- `OPTIONS` requests (CORS preflight — not meaningful traffic)
- WebSocket upgrades (`101 Switching Protocols` — the number-matching Durable Object connection)
- Static assets: `.js`, `.css`, `.png`, `.webmanifest` — filtered by the "no file extension" check
- The `/api/admin/endpoint-metrics` endpoint itself — logging it would create a recursive feedback loop

**`ctx.waitUntil` semantics:** Cloudflare Workers normally terminate after the response is returned. `ctx.waitUntil(promise)` extends the Worker's lifetime until the promise resolves. The response is sent to the client immediately; the D1 write completes asynchronously. This means logging adds zero latency to any request.

**SSE responses:** `POST /api/chat` returns a `text/event-stream` response (streaming). The response object's `.status` property is synchronously readable even on a streaming response without consuming the body. So chat requests are logged correctly — the log entry captures the 200 status and the normalized path immediately, before the stream body begins flowing.

---

## 20.5 The Metrics Query

`GET /api/admin/endpoint-metrics` runs 5 D1 queries in a single batch:

**1. Hourly buckets (last 24h):**

```sql
SELECT
  (created_at / 3600000) * 3600000 AS bucket,
  COUNT(*) AS total,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
FROM endpoint_logs
WHERE created_at >= ?
GROUP BY bucket ORDER BY bucket ASC
```

`(created_at / 3600000) * 3600000` is integer division that truncates to the start of the hour. Every row in the same clock hour gets the same `bucket` value. This is SQLite's way of implementing time-series bucketing without date functions.

**2. Daily buckets (last 7 days):** Same pattern with `86400000` (milliseconds per day).

**3. Per-endpoint summary (last 7 days):**

```sql
SELECT
  method, path,
  COUNT(*) AS total,
  SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors,
  SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS server_errors,
  MAX(created_at) AS last_seen
FROM endpoint_logs
WHERE created_at >= ?
GROUP BY method, path
ORDER BY total DESC
```

**4. Per-endpoint daily sparklines:** The same daily-bucket query as (2) but grouped additionally by `method, path`. The frontend uses this to render the 7-bar sparkline for each row in the endpoints table.

**5. Grand total:** A simple count for the "Total requests" stat card.

---

## 20.6 The Frontend Rendering

The Endpoints tab renders three sections:

**Stat cards:** Total requests (last 7d), error rate percentage, unique endpoint count, and the top endpoint by volume.

**Aggregate trend chart:** A custom SVG line chart drawn with `<polyline>` elements. No charting library is used. Two series: total requests (accent color, solid) and errors (red, dashed). The chart accepts 24h (hourly) or 7d (daily) data via a toggle that switches between the two datasets already in memory.

The chart scales dynamically — the Y-axis maximum is the peak value in the visible dataset, and the X-axis spans the full time range with up to 6 evenly-spaced labels.

**Per-endpoint table:** One row per distinct `(method, path)` pair. The left border is color-coded by endpoint group:

| Group | Color | Prefix match |
|-------|-------|-------------|
| Auth | Purple (#6366f1) | `/api/auth/` |
| Chat | Green (#34c759) | `/api/chat` |
| Admin | Amber (#f5a623) | `/api/admin/` |
| User | Orange (#ff9500) | `/api/user/` |

Page navigations (like `GET /` and `GET /chat`) have no group match and get a transparent border.

The sparkline for each row is a 7-bar mini SVG bar chart using the daily bucket data for that specific endpoint. Bar height is normalized relative to the peak day for that endpoint (not the global peak), so low-volume endpoints still have visible bars.

---

## 20.7 Storage Growth

`endpoint_logs` grows with traffic. Rough estimates for a personal portfolio:

| Traffic | Daily inserts | 30-day row count | Approx. D1 size |
|---------|--------------|-----------------|----------------|
| 10 visitors/day, ~20 requests each | ~200 | ~6,000 | ~0.3 MB |
| 100 visitors/day, ~20 requests each | ~2,000 | ~60,000 | ~3 MB |

D1's free tier allows 5 GB of storage. Automatic pruning (e.g., `DELETE FROM endpoint_logs WHERE created_at < ?` for data older than 90 days) would be appropriate if traffic grows significantly. The current implementation does not prune automatically — this is a known gap for a portfolio site with modest traffic.

The `idx_endpoint_logs_created_at` index makes the time-windowed queries (`WHERE created_at >= ?`) efficient even as the table grows. The `idx_endpoint_logs_path` index supports the `GROUP BY method, path` queries.

---

## Key Takeaways

- Every API request and SPA page navigation is logged asynchronously via `ctx.waitUntil` — zero latency added to any response.
- Path normalization replaces UUID and base64url IDs with `:id` so similar routes are counted together rather than as thousands of unique paths.
- The metrics query uses integer division on `created_at` to produce time-series buckets without date functions — a SQLite-idiomatic pattern.
- The frontend trend chart is custom SVG with no library dependency, rendering two series (total and errors) with a 24h/7d toggle.
- D1 storage grows with traffic but stays well within free-tier limits for personal portfolio traffic. Manual pruning may be needed at scale.
