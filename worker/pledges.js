// ── Kamalesh fundraiser pledge handlers ───────────────────────────
// POST   /api/kamalesh/pledge            — public, submit a pledge
// GET    /api/kamalesh/stats             — public, verified totals for progress bar
// GET    /api/admin/kamalesh/pledges     — admin, full list
// PATCH  /api/admin/kamalesh/pledges/:id — admin, verify/unverify
// DELETE /api/admin/kamalesh/pledges/:id — admin, delete

import { getSession } from './auth/session.js';
import { requireAdmin } from './admin.js';
import { checkIpRateLimit } from './rateLimit.js';

// Default INR conversion rates — updated June 24 2026
// Can be overridden per-deploy via KV key 'kf:rates'
const DEFAULT_RATES = { usd: 94.7, cad: 68.1, sgd: 73.1, aed: 25.7 };
const RATES_KV_KEY  = 'kf:rates';

async function getRates(kv) {
  try {
    const stored = await kv.get(RATES_KV_KEY, 'json');
    if (stored) return { ...DEFAULT_RATES, ...stored };
  } catch { /* fall through to defaults */ }
  return DEFAULT_RATES;
}

const DB = env => env.varun_portfolio_auth;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// POST /api/kamalesh/pledge
export async function submitPledge(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkIpRateLimit(env.KV, ip, 'pledge', 5, 3_600_000);
  if (!limit.allowed) {
    return json({ error: 'Too many submissions. Try again later.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const { name, amount, currency, sent, note } = body;

  if (!name || typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100) {
    return json({ error: 'Name is required (max 100 chars).' }, 400);
  }
  if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 100000) {
    return json({ error: 'Amount must be a positive number.' }, 400);
  }
  if (!['USD', 'CAD', 'INR', 'SGD', 'AED'].includes(currency)) {
    return json({ error: 'Currency must be USD, CAD, INR, SGD, or AED.' }, 400);
  }

  const ts      = Math.floor(Date.now() / 1000);
  const country = request.headers.get('CF-IPCountry') || null;
  const cleanNote = note && typeof note === 'string' ? note.trim().slice(0, 300) : null;

  await DB(env)
    .prepare('INSERT INTO pledges (name, amount, currency, sent, note, ts, country) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(name.trim(), amount, currency, sent ? 1 : 0, cleanNote, ts, country)
    .run();

  return json({ ok: true });
}

// GET /api/kamalesh/stats
// Returns verified pledge totals for the public progress bar.
export async function getPledgeStats(request, env) {
  const db = DB(env);

  const [totals, count] = await Promise.all([
    db.prepare(`
      SELECT currency, SUM(amount) AS total
      FROM pledges
      WHERE verified = 1
      GROUP BY currency
    `).all(),
    db.prepare('SELECT COUNT(*) AS n FROM pledges WHERE verified = 1').first(),
  ]);

  const byC = {};
  for (const row of (totals.results ?? [])) byC[row.currency] = row.total;

  const usd    = byC['USD'] ?? 0;
  const cad    = byC['CAD'] ?? 0;
  const inr    = byC['INR'] ?? 0;
  const sgd    = byC['SGD'] ?? 0;
  const aed    = byC['AED'] ?? 0;
  const rates  = await getRates(env.KV);
  const inrEq  = Math.round(
    usd * rates.usd + cad * rates.cad + sgd * rates.sgd + aed * rates.aed
  ) + inr;

  return json({ usd, cad, inr, sgd, aed, inrEq, rates, count: count?.n ?? 0 });
}

// GET /api/admin/kamalesh/pledges
export async function adminListPledges(request, env) {
  const session = await getSession(env.KV, request);
  const denied  = await requireAdmin(session, env);
  if (denied) return denied;

  const url    = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all'; // all | pending | verified

  let query = 'SELECT * FROM pledges';
  if (filter === 'pending')  query += ' WHERE verified = 0';
  if (filter === 'verified') query += ' WHERE verified = 1';
  query += ' ORDER BY ts DESC';

  const rows = await DB(env).prepare(query).all();

  // Also return totals
  const totals = await DB(env).prepare(`
    SELECT
      SUM(CASE WHEN verified = 1 AND currency = 'USD' THEN amount ELSE 0 END) AS verified_usd,
      SUM(CASE WHEN verified = 1 AND currency = 'CAD' THEN amount ELSE 0 END) AS verified_cad,
      SUM(CASE WHEN verified = 1 AND currency = 'INR' THEN amount ELSE 0 END) AS verified_inr,
      SUM(CASE WHEN verified = 1 AND currency = 'SGD' THEN amount ELSE 0 END) AS verified_sgd,
      SUM(CASE WHEN verified = 1 AND currency = 'AED' THEN amount ELSE 0 END) AS verified_aed,
      SUM(CASE WHEN verified = 0 AND currency = 'USD' THEN amount ELSE 0 END) AS pending_usd,
      SUM(CASE WHEN verified = 0 AND currency = 'CAD' THEN amount ELSE 0 END) AS pending_cad,
      SUM(CASE WHEN verified = 0 AND currency = 'INR' THEN amount ELSE 0 END) AS pending_inr,
      SUM(CASE WHEN verified = 0 AND currency = 'SGD' THEN amount ELSE 0 END) AS pending_sgd,
      SUM(CASE WHEN verified = 0 AND currency = 'AED' THEN amount ELSE 0 END) AS pending_aed,
      COUNT(*) AS total_count,
      SUM(verified) AS verified_count
    FROM pledges
  `).first();

  return json({ pledges: rows.results ?? [], totals });
}

// PATCH /api/admin/kamalesh/pledges/:id
// Body: { verified: boolean }
export async function adminUpdatePledge(request, env, id) {
  const session = await getSession(env.KV, request);
  const denied  = await requireAdmin(session, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  await DB(env)
    .prepare('UPDATE pledges SET verified = ? WHERE id = ?')
    .bind(body.verified ? 1 : 0, id)
    .run();

  return json({ ok: true });
}

// DELETE /api/admin/kamalesh/pledges/:id
export async function adminDeletePledge(request, env, id) {
  const session = await getSession(env.KV, request);
  const denied  = await requireAdmin(session, env);
  if (denied) return denied;

  await DB(env).prepare('DELETE FROM pledges WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// GET /api/admin/kamalesh/rates
export async function adminGetRates(request, env) {
  const session = await getSession(env.KV, request);
  const denied  = await requireAdmin(session, env);
  if (denied) return denied;

  const rates = await getRates(env.KV);
  return json({ rates, defaults: DEFAULT_RATES });
}

// PUT /api/admin/kamalesh/rates
export async function adminSetRates(request, env) {
  const session = await getSession(env.KV, request);
  const denied  = await requireAdmin(session, env);
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const rates = {};
  for (const key of ['usd', 'cad', 'sgd', 'aed']) {
    const v = parseFloat(body[key]);
    if (!v || v <= 0 || v > 1000) return json({ error: `Invalid rate for ${key.toUpperCase()}` }, 400);
    rates[key] = Math.round(v * 100) / 100;
  }

  await env.KV.put(RATES_KV_KEY, JSON.stringify(rates));
  return json({ ok: true, rates });
}
