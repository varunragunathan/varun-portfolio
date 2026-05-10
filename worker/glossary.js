// ── Glossary API ──────────────────────────────────────────────────
// GET    /api/glossary          — list all terms for the signed-in user
// POST   /api/glossary          — create a term (client-supplied UUID id)
// PATCH  /api/glossary/:id      — update a term
// DELETE /api/glossary/:id      — delete a term
// POST   /api/glossary/sync     — bulk upsert terms created while offline

import { getSession } from './auth/session.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function rowToTerm(row) {
  return {
    id:            row.id,
    term:          row.term,
    definition:    row.definition,
    tags:          JSON.parse(row.tags || '[]'),
    searchQuery:   row.search_query,
    showOnProfile: row.show_on_profile === 1,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

export async function listGlossary(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { results } = await env.varun_portfolio_auth
    .prepare('SELECT * FROM glossary_terms WHERE user_id = ? ORDER BY created_at DESC')
    .bind(session.userId)
    .all();

  return json({ terms: results.map(rowToTerm) });
}

export async function createTerm(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const { id, term, definition = '', tags = [], searchQuery = '', showOnProfile = false, createdAt } = body;

  if (!id || !term?.trim()) return json({ error: 'id and term are required' }, 400);

  const now = Date.now();
  await env.varun_portfolio_auth
    .prepare(`
      INSERT INTO glossary_terms (id, user_id, term, definition, tags, search_query, show_on_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `)
    .bind(id, session.userId, term.trim(), definition, JSON.stringify(tags), searchQuery, showOnProfile ? 1 : 0, createdAt || now, now)
    .run();

  return json({ ok: true });
}

export async function updateTerm(request, env, id) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const now = Date.now();

  // Only update fields that were sent
  const fields = [];
  const values = [];

  if (body.term !== undefined)          { fields.push('term = ?');            values.push(body.term.trim()); }
  if (body.definition !== undefined)    { fields.push('definition = ?');      values.push(body.definition); }
  if (body.tags !== undefined)          { fields.push('tags = ?');            values.push(JSON.stringify(body.tags)); }
  if (body.searchQuery !== undefined)   { fields.push('search_query = ?');    values.push(body.searchQuery); }
  if (body.showOnProfile !== undefined) { fields.push('show_on_profile = ?'); values.push(body.showOnProfile ? 1 : 0); }

  if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);

  fields.push('updated_at = ?');
  values.push(now, id, session.userId);

  await env.varun_portfolio_auth
    .prepare(`UPDATE glossary_terms SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`)
    .bind(...values)
    .run();

  return json({ ok: true });
}

export async function deleteTerm(request, env, id) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await env.varun_portfolio_auth
    .prepare('DELETE FROM glossary_terms WHERE id = ? AND user_id = ?')
    .bind(id, session.userId)
    .run();

  return json({ ok: true });
}

// Bulk upsert: called on sign-in to push terms created while offline.
// Only inserts — never overwrites existing server terms.
export async function bulkSync(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const terms = Array.isArray(body.terms) ? body.terms : [];
  if (terms.length === 0) return json({ ok: true, synced: 0 });

  const now = Date.now();
  const stmt = env.varun_portfolio_auth.prepare(`
    INSERT INTO glossary_terms (id, user_id, term, definition, tags, search_query, show_on_profile, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `);

  // D1 batch for efficiency
  const batch = terms
    .filter(t => t.id && t.term?.trim())
    .map(t => stmt.bind(
      t.id,
      session.userId,
      t.term.trim(),
      t.definition || '',
      JSON.stringify(t.tags || []),
      t.searchQuery || '',
      t.showOnProfile ? 1 : 0,
      t.createdAt || now,
      now,
    ));

  if (batch.length > 0) await env.varun_portfolio_auth.batch(batch);

  return json({ ok: true, synced: batch.length });
}
