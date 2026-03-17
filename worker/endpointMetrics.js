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

export async function getEndpointMetrics(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();
  const h24 = now - 86_400_000;
  const d7  = now - 7 * 86_400_000;

  const [rHourly, rDaily, rEndpoints, rSparklines, rTotal] = await db.batch([
    // Hourly buckets — last 24 h
    db.prepare(`
      SELECT
        (created_at / 3600000) * 3600000 AS bucket,
        COUNT(*) AS total,
        SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS errors
      FROM endpoint_logs
      WHERE created_at >= ?
      GROUP BY bucket ORDER BY bucket ASC
    `).bind(h24),

    // Daily buckets — last 7 d
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
  ]);

  // Attach sparklines to each endpoint
  const sparkMap = {};
  for (const row of (rSparklines.results ?? [])) {
    const key = `${row.method} ${row.path}`;
    if (!sparkMap[key]) sparkMap[key] = {};
    sparkMap[key][row.bucket] = row.total;
  }

  const endpoints = (rEndpoints.results ?? []).map(ep => ({
    ...ep,
    sparkline: sparkMap[`${ep.method} ${ep.path}`] ?? {},
  }));

  return json({
    generated_at: now,
    total_7d:     rTotal.results[0]?.n ?? 0,
    hourly:       rHourly.results ?? [],
    daily:        rDaily.results  ?? [],
    endpoints,
  });
}
