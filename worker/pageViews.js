// ── Page view tracking ────────────────────────────────────────────
// POST /api/track/page  — public, no auth
// GET  /api/admin/page-views?page=kamalesh  — admin only

import { getSession } from './auth/session.js';
import { requireAdmin, isAdmin } from './admin.js';

const PIN_KV_KEY = 'kf:pin';

async function requireKamaleshAccess(request, env) {
  const session = await getSession(env.KV, request);
  if (await isAdmin(session, env)) return null;
  const pin = await env.KV.get(PIN_KV_KEY);
  if (pin && request.headers.get('X-KF-Pin') === pin) return null;
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
}

const DB = env => env.varun_portfolio_auth;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/track/page
// Body: { page: string }
// Records country (from CF header) and referrer origin. Fire-and-forget safe.
export async function trackPageView(request, env) {
  let page;
  try {
    ({ page } = await request.json());
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (!page || typeof page !== 'string' || page.length > 80) {
    return json({ error: 'Invalid page' }, 400);
  }

  const ts      = Math.floor(Date.now() / 1000);
  const country = request.headers.get('CF-IPCountry') || null;
  const refRaw  = request.headers.get('Referer') || request.headers.get('Referrer') || null;
  let referrer  = null;
  if (refRaw) {
    try { referrer = new URL(refRaw).origin; } catch { /* ignore malformed */ }
  }

  await DB(env)
    .prepare('INSERT INTO page_views (page, ts, country, referrer) VALUES (?, ?, ?, ?)')
    .bind(page, ts, country, referrer)
    .run();

  return json({ ok: true });
}

// GET /api/admin/page-views?page=kamalesh
// Returns: { total, byDay: [{date, count}], byCountry: [{country, count}], last50 }
export async function getPageViewStats(request, env) {
  const denied = await requireKamaleshAccess(request, env);
  if (denied) return denied;

  const url  = new URL(request.url);
  const page = url.searchParams.get('page') || 'kamalesh';

  const db = DB(env);

  const [totalRow, byDay, byCountry, last50] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM page_views WHERE page = ?').bind(page).first(),

    db.prepare(`
      SELECT date(ts, 'unixepoch') AS date, COUNT(*) AS count
      FROM page_views
      WHERE page = ? AND ts >= strftime('%s', 'now', '-30 days')
      GROUP BY date
      ORDER BY date ASC
    `).bind(page).all(),

    db.prepare(`
      SELECT COALESCE(country, 'Unknown') AS country, COUNT(*) AS count
      FROM page_views
      WHERE page = ?
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `).bind(page).all(),

    db.prepare(`
      SELECT ts, country, referrer
      FROM page_views
      WHERE page = ?
      ORDER BY ts DESC
      LIMIT 50
    `).bind(page).all(),
  ]);

  return json({
    page,
    total:     totalRow?.total ?? 0,
    byDay:     byDay.results     ?? [],
    byCountry: byCountry.results ?? [],
    last50:    last50.results    ?? [],
  });
}
