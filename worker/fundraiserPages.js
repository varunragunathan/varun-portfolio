// ── Generic fundraiser page CRUD ──────────────────────────────────
// GET  /api/fundraiser/:slug            — public
// POST /api/fundraiser/:slug/pledge     — public, log a contribution
// GET  /api/admin/fundraisers           — admin: list all
// POST /api/admin/fundraisers           — admin: create
// PUT  /api/admin/fundraisers/:slug     — admin: update

import { requireAdmin }      from './admin.js';
import { getSession }        from './auth/session.js';
import { checkIpRateLimit }  from './rateLimit.js';

const DB = env => env.varun_portfolio_auth;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const MUTABLE_FIELDS = [
  'title', 'beneficiary', 'age', 'condition', 'story',
  'goal_inr', 'raised_inr', 'image_url', 'surgery_date', 'active',
  'payment_zelle_email', 'payment_zelle_name', 'payment_zelle_phone',
  'payment_interac_email', 'payment_interac_name',
  'payment_bank_ac', 'payment_bank_ifsc', 'payment_bank_name',
  'payment_upi', 'memo',
];

const VALID_CURRENCIES = ['INR', 'USD', 'CAD', 'SGD', 'AED'];

// POST /api/fundraiser/:slug/pledge — public
export async function submitContribution(request, env, slug) {
  const ip    = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limit = await checkIpRateLimit(env.KV, ip, `fc:${slug}`, 5, 3_600_000);
  if (!limit.allowed) return json({ error: 'Too many submissions. Try again later.' }, 429);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const { name, amount, currency = 'INR', sent = false, note } = body;
  if (!name?.trim())                          return json({ error: 'Name is required.' }, 400);
  if (!amount || isNaN(amount) || amount <= 0) return json({ error: 'Valid amount is required.' }, 400);
  if (!VALID_CURRENCIES.includes(currency))   return json({ error: 'Invalid currency.' }, 400);

  const country = request.headers.get('CF-IPCountry') || null;
  await DB(env)
    .prepare('INSERT INTO fundraiser_contributions (slug, name, amount, currency, sent, note, ts, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(slug, name.trim(), Number(amount), currency, sent ? 1 : 0, note?.trim() || null, Math.floor(Date.now() / 1000), country)
    .run();
  return json({ ok: true });
}

export async function getFundraiser(slug, env) {
  const row = await DB(env)
    .prepare('SELECT * FROM fundraisers WHERE slug = ? AND active = 1')
    .bind(slug)
    .first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json(row);
}

export async function listFundraisers(request, env) {
  const session = await getSession(env.KV, request);
  const denied = await requireAdmin(session, env);
  if (denied) return denied;
  const { results } = await DB(env)
    .prepare('SELECT * FROM fundraisers ORDER BY created_at DESC')
    .all();
  return json(results ?? []);
}

export async function createFundraiser(request, env) {
  const session = await getSession(env.KV, request);
  const denied = await requireAdmin(session, env);
  if (denied) return denied;
  const body = await request.json();
  if (!body.slug || !body.title || !body.beneficiary || !body.condition) {
    return json({ error: 'slug, title, beneficiary, and condition are required' }, 400);
  }
  const sets    = MUTABLE_FIELDS.filter(f => body[f] !== undefined);
  const cols    = ['slug', ...sets].join(', ');
  const placeholders = ['?', ...sets.map(() => '?')].join(', ');
  const params  = [body.slug, ...sets.map(f => body[f])];
  try {
    await DB(env)
      .prepare(`INSERT INTO fundraisers (${cols}) VALUES (${placeholders})`)
      .bind(...params)
      .run();
    return json({ ok: true, slug: body.slug }, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Slug already exists' }, 409);
    throw e;
  }
}

export async function updateFundraiser(request, env, slug) {
  const session = await getSession(env.KV, request);
  const denied = await requireAdmin(session, env);
  if (denied) return denied;
  const body = await request.json();
  const sets = MUTABLE_FIELDS.filter(f => f in body);
  if (!sets.length) return json({ error: 'Nothing to update' }, 400);
  const setClause = [...sets.map(f => `${f} = ?`), 'updated_at = ?'].join(', ');
  const params    = [...sets.map(f => body[f]), Math.floor(Date.now() / 1000), slug];
  const result    = await DB(env)
    .prepare(`UPDATE fundraisers SET ${setClause} WHERE slug = ?`)
    .bind(...params)
    .run();
  if (result.meta?.changes === 0) return json({ error: 'Not found' }, 404);
  return json({ ok: true });
}
