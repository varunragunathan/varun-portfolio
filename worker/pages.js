// ── Pages handler ─────────────────────────────────────────────────
// Admin CRUD for HTML pages + public serving at /p/:slug.
//
// Admin routes (require admin session):
//   GET    /api/admin/pages          list all pages (metadata only)
//   POST   /api/admin/pages          create page
//   GET    /api/admin/pages/:id      get page (full content)
//   PATCH  /api/admin/pages/:id      update page
//   DELETE /api/admin/pages/:id      delete page
//
// Public:
//   GET /p/:slug   → serve raw HTML (no React wrapper)

import { getSession } from './auth/session.js';
import { isAdmin }    from './admin.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});

async function guardAdmin(request, env) {
  const session = await getSession(env.KV, request);
  if (!(await isAdmin(session, env))) return json({ error: 'Forbidden' }, 403);
  return null;
}

function toSlug(s) {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/admin/pages
export async function adminListPages(request, env) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;
  const rows = await env.varun_portfolio_auth
    .prepare('SELECT id, slug, title, folder, created_at, updated_at FROM pages ORDER BY folder ASC, title ASC')
    .all();
  return json({ pages: rows.results });
}

// POST /api/admin/pages
export async function adminCreatePage(request, env) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;
  const { title, slug, folder, content } = await request.json().catch(() => ({}));
  if (!title?.trim())   return json({ error: 'title is required' }, 400);
  if (!content?.trim()) return json({ error: 'content is required' }, 400);
  const finalSlug = slug?.trim() ? toSlug(slug) : toSlug(title);
  if (!finalSlug)       return json({ error: 'invalid slug' }, 400);
  const now = Date.now();
  const id  = crypto.randomUUID();
  try {
    await env.varun_portfolio_auth
      .prepare('INSERT INTO pages (id, slug, title, folder, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, finalSlug, title.trim(), folder?.trim() || null, content, now, now)
      .run();
    return json({ page: { id, slug: finalSlug, title: title.trim(), folder: folder?.trim() || null, created_at: now, updated_at: now } });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Slug already taken' }, 409);
    throw e;
  }
}

// GET /api/admin/pages/:id
export async function adminGetPage(request, env, id) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;
  const row = await env.varun_portfolio_auth
    .prepare('SELECT * FROM pages WHERE id = ?')
    .bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json({ page: row });
}

// PATCH /api/admin/pages/:id
export async function adminUpdatePage(request, env, id) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;
  const body = await request.json().catch(() => ({}));
  const sets = [];
  const vals = [];
  if (body.title   !== undefined) { sets.push('title = ?');   vals.push(body.title.trim()); }
  if (body.slug    !== undefined) { sets.push('slug = ?');    vals.push(toSlug(body.slug)); }
  if (body.folder  !== undefined) { sets.push('folder = ?');  vals.push(body.folder?.trim() || null); }
  if (body.content !== undefined) { sets.push('content = ?'); vals.push(body.content); }
  if (sets.length === 0) return json({ error: 'Nothing to update' }, 400);
  sets.push('updated_at = ?');
  vals.push(Date.now(), id);
  try {
    await env.varun_portfolio_auth
      .prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...vals).run();
    const row = await env.varun_portfolio_auth
      .prepare('SELECT id, slug, title, folder, created_at, updated_at FROM pages WHERE id = ?')
      .bind(id).first();
    return json({ page: row });
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return json({ error: 'Slug already taken' }, 409);
    throw e;
  }
}

// DELETE /api/admin/pages/:id
export async function adminDeletePage(request, env, id) {
  const guard = await guardAdmin(request, env);
  if (guard) return guard;
  const row = await env.varun_portfolio_auth
    .prepare('SELECT id FROM pages WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  await env.varun_portfolio_auth.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// Public API: return page JSON (no auth) — used by the React /p/:slug route
export async function getPublicPage(request, env, slug) {
  const row = await env.varun_portfolio_auth
    .prepare('SELECT title, content FROM pages WHERE slug = ?')
    .bind(slug).first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json({ page: row });
}
