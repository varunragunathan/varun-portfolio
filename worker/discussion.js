// ── Discussion board API ──────────────────────────────────────────
//   GET    /api/discussion/topics              — list topics (public)
//   POST   /api/discussion/topics              — create topic (auth)
//   GET    /api/discussion/topics/:id          — topic + comments (public)
//   POST   /api/discussion/topics/:id/comments — add comment/reply (auth)
//   DELETE /api/discussion/comments/:id        — soft-delete own comment (auth)

import { getSession } from './auth/session.js';
import { checkUserRateLimit, checkIpRateLimit, DISCUSSION_LIMITS } from './rateLimit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function guardAuth(request, env) {
  const session = await getSession(env.KV, request);
  if (!session?.userId) return json({ error: 'Unauthorized' }, 401);
  return session;
}

function displayName(row) {
  return row.nickname || row.email.split('@')[0];
}

function discRole(session, env) {
  return (env.ADMIN_EMAIL && session.email === env.ADMIN_EMAIL) ? 'admin' : 'user';
}

function tooManyRequests(rl) {
  return new Response(
    JSON.stringify({ error: `Rate limit exceeded: ${rl.reason}. Try again in ${rl.retryAfter}s.` }),
    { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(rl.retryAfter) } }
  );
}

// GET /api/discussion/topics?limit=N&offset=N
export async function listTopics(request, env) {
  const ip = request.headers.get('CF-Connecting-IP');
  const rl = await checkIpRateLimit(env.KV, ip, 'disc:list', 60, 60_000);
  if (!rl.allowed) return tooManyRequests(rl);

  const url    = new URL(request.url);
  const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')  || '30')));
  const offset = Math.max(0,              parseInt(url.searchParams.get('offset') || '0'));

  // Fetch one extra to determine whether more pages exist
  const rows = await env.varun_portfolio_auth.prepare(`
    SELECT t.id, t.title, t.created_at, t.comment_count, t.pinned,
           u.nickname, u.email
    FROM   discussion_topics t
    JOIN   users u ON u.id = t.author_id
    ORDER  BY t.pinned DESC, t.created_at DESC
    LIMIT  ? OFFSET ?
  `).bind(limit + 1, offset).all();

  const hasMore = rows.results.length > limit;
  const topics  = rows.results.slice(0, limit).map(r => ({
    id:            r.id,
    title:         r.title,
    created_at:    r.created_at,
    comment_count: r.comment_count,
    pinned:        !!r.pinned,
    author:        displayName(r),
  }));

  return json({ topics, hasMore });
}

// POST /api/discussion/topics  { title, body }
export async function createTopic(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const rl = await checkUserRateLimit(env.KV, session.userId, discRole(session, env), 'disc:topic', DISCUSSION_LIMITS.topic);
  if (!rl.allowed) return tooManyRequests(rl);

  const { title, body } = await request.json().catch(() => ({}));
  if (!title?.trim())         return json({ error: 'Title required' }, 400);
  if (!body?.trim())          return json({ error: 'Body required' }, 400);
  if (title.trim().length > 200) return json({ error: 'Title too long (max 200 chars)' }, 400);

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.varun_portfolio_auth.prepare(`
    INSERT INTO discussion_topics (id, title, body, author_id, created_at, updated_at, comment_count, pinned)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0)
  `).bind(id, title.trim(), body.trim(), session.userId, now, now).run();

  return json({ id }, 201);
}

// GET /api/discussion/topics/:id
export async function getTopic(request, env, topicId) {
  const ip = request.headers.get('CF-Connecting-IP');
  const rl = await checkIpRateLimit(env.KV, ip, 'disc:thread', 120, 60_000);
  if (!rl.allowed) return tooManyRequests(rl);

  const topic = await env.varun_portfolio_auth.prepare(`
    SELECT t.id, t.title, t.body, t.created_at, t.comment_count, t.pinned,
           u.nickname, u.email
    FROM   discussion_topics t
    JOIN   users u ON u.id = t.author_id
    WHERE  t.id = ?
  `).bind(topicId).first();

  if (!topic) return json({ error: 'Not found' }, 404);

  const rows = await env.varun_portfolio_auth.prepare(`
    SELECT c.id, c.parent_id, c.depth, c.body, c.created_at, c.deleted, c.author_id,
           u.nickname, u.email
    FROM   discussion_comments c
    JOIN   users u ON u.id = c.author_id
    WHERE  c.topic_id = ?
    ORDER  BY c.created_at ASC
  `).bind(topicId).all();

  return json({
    topic: {
      id:            topic.id,
      title:         topic.title,
      body:          topic.body,
      created_at:    topic.created_at,
      comment_count: topic.comment_count,
      pinned:        !!topic.pinned,
      author:        displayName(topic),
    },
    comments: rows.results.map(c => ({
      id:        c.id,
      parent_id: c.parent_id,
      depth:     c.depth,
      body:      c.deleted ? null : c.body,
      deleted:   !!c.deleted,
      created_at: c.created_at,
      author_id: c.author_id,
      author:    c.deleted ? '[deleted]' : displayName(c),
    })),
  });
}

// POST /api/discussion/topics/:id/comments  { body, parent_id? }
export async function addComment(request, env, topicId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const rl = await checkUserRateLimit(env.KV, session.userId, discRole(session, env), 'disc:comment', DISCUSSION_LIMITS.comment);
  if (!rl.allowed) return tooManyRequests(rl);

  const { body, parent_id } = await request.json().catch(() => ({}));
  if (!body?.trim()) return json({ error: 'Body required' }, 400);

  const topic = await env.varun_portfolio_auth.prepare('SELECT id FROM discussion_topics WHERE id = ?')
    .bind(topicId).first();
  if (!topic) return json({ error: 'Topic not found' }, 404);

  let depth = 0;
  if (parent_id) {
    const parent = await env.varun_portfolio_auth.prepare(
      'SELECT depth FROM discussion_comments WHERE id = ? AND topic_id = ?'
    ).bind(parent_id, topicId).first();
    if (!parent) return json({ error: 'Parent comment not found' }, 404);
    depth = parent.depth + 1;
  }

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.varun_portfolio_auth.batch([
    env.varun_portfolio_auth.prepare(
      'INSERT INTO discussion_comments (id, topic_id, parent_id, depth, author_id, body, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)'
    ).bind(id, topicId, parent_id || null, depth, session.userId, body.trim(), now, now),
    env.varun_portfolio_auth.prepare(
      'UPDATE discussion_topics SET comment_count = comment_count + 1, updated_at = ? WHERE id = ?'
    ).bind(now, topicId),
  ]);

  return json({ id }, 201);
}

// DELETE /api/discussion/comments/:id
export async function deleteComment(request, env, commentId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const rl = await checkUserRateLimit(env.KV, session.userId, discRole(session, env), 'disc:delete', DISCUSSION_LIMITS.delete);
  if (!rl.allowed) return tooManyRequests(rl);

  const comment = await env.varun_portfolio_auth.prepare(
    'SELECT author_id FROM discussion_comments WHERE id = ? AND deleted = 0'
  ).bind(commentId).first();
  if (!comment)                          return json({ error: 'Not found' }, 404);
  if (comment.author_id !== session.userId) return json({ error: 'Forbidden' }, 403);

  await env.varun_portfolio_auth.prepare(
    "UPDATE discussion_comments SET deleted = 1, body = '', updated_at = ? WHERE id = ?"
  ).bind(new Date().toISOString(), commentId).run();

  return json({ ok: true });
}
