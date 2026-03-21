// ── Endpoint metrics ───────────────────────────────────────────────
// Middleware: logEndpointRequest() — fire-and-forget, called via ctx.waitUntil
// Query:      getEndpointMetrics() — admin-only, GET /api/admin/endpoint-metrics
//
// Table: endpoint_logs (id, method, path, status, created_at)
//   path is normalized — IDs replaced with :id so similar routes group together

import { getSession }   from './auth/session.js';
import { requireAdmin } from './admin.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Replace UUID-like and long opaque segments with :id
function normalizePath(pathname) {
  return pathname
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{20,}/g, '/:id');
}

export async function logEndpointRequest(db, request, response) {
  try {
    const url    = new URL(request.url);
    const path   = normalizePath(url.pathname);
    const method = request.method;
    const status = response.status;
    await db.prepare(
      'INSERT INTO endpoint_logs (method, path, status, created_at) VALUES (?, ?, ?, ?)'
    ).bind(method, path, status, Date.now()).run();
  } catch (e) {
    console.error('logEndpoint error:', e);
  }
}

function buildSparkMap(rows) {
  const map = {};
  for (const row of (rows ?? [])) {
    const key = `${row.method} ${row.path}`;
    if (!map[key]) map[key] = {};
    map[key][row.bucket] = row.total;
  }
  return map;
}

function attachSparklines(endpointRows, sparkMap) {
  return (endpointRows ?? []).map(ep => ({
    ...ep,
    sparkline: sparkMap[`${ep.method} ${ep.path}`] ?? {},
  }));
}

export async function getEndpointMetrics(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();
  const h24 = now - 86_400_000;
  const d7  = now - 7 * 86_400_000;

  const [
    rHourly, rDaily,
    rEndpoints7d, rSparklines7d, rTotal7d,
    rEndpoints24h, rSparklines24h, rTotal24h,
  ] = await db.batch([
    // Hourly buckets — last 24 h (for trend chart)
    db.prepare(`
      SELECT
        (created_at / 3600000) * 3600000 AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
      FROM endpoint_logs
      WHERE created_at >= ?
      GROUP BY bucket ORDER BY bucket ASC
    `).bind(h24),

    // Daily buckets — last 7 d (for trend chart)
    db.prepare(`
      SELECT
        (created_at / 86400000) * 86400000 AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
      FROM endpoint_logs
      WHERE created_at >= ?
      GROUP BY bucket ORDER BY bucket ASC
    `).bind(d7),

    // Per-endpoint summary — last 7 d
    db.prepare(`
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
    `).bind(d7),

    // Daily sparklines per endpoint — last 7 d
    db.prepare(`
      SELECT
        method, path,
        (created_at / 86400000) * 86400000 AS bucket,
        COUNT(*) AS total
      FROM endpoint_logs
      WHERE created_at >= ?
      GROUP BY method, path, bucket
      ORDER BY method, path, bucket ASC
    `).bind(d7),

    // Grand total — last 7 d
    db.prepare('SELECT COUNT(*) AS n FROM endpoint_logs WHERE created_at >= ?').bind(d7),

    // Per-endpoint summary — last 24 h
    db.prepare(`
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
    `).bind(h24),

    // Hourly sparklines per endpoint — last 24 h
    db.prepare(`
      SELECT
        method, path,
        (created_at / 3600000) * 3600000 AS bucket,
        COUNT(*) AS total
      FROM endpoint_logs
      WHERE created_at >= ?
      GROUP BY method, path, bucket
      ORDER BY method, path, bucket ASC
    `).bind(h24),

    // Grand total — last 24 h
    db.prepare('SELECT COUNT(*) AS n FROM endpoint_logs WHERE created_at >= ?').bind(h24),
  ]);

  return json({
    generated_at:  now,
    hourly:        rHourly.results        ?? [],
    daily:         rDaily.results         ?? [],
    total_7d:      rTotal7d.results[0]?.n  ?? 0,
    endpoints_7d:  attachSparklines(rEndpoints7d.results,  buildSparkMap(rSparklines7d.results)),
    total_24h:     rTotal24h.results[0]?.n ?? 0,
    endpoints_24h: attachSparklines(rEndpoints24h.results, buildSparkMap(rSparklines24h.results)),
  });
}
