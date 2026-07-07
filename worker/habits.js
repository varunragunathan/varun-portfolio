// ── Habit tracker ─────────────────────────────────────────────────
// GET    /api/habits                  — list active habits + 28-day log
// POST   /api/habits                  — create habit
// PUT    /api/habits/:id              — rename / update emoji / sort
// DELETE /api/habits/:id              — archive (soft delete)
// POST   /api/habits/:id/toggle       — toggle completion for a date

import { getSession } from './auth/session.js';

const DB = env => env.varun_portfolio_auth;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function auth(request, env) {
  const session = await getSession(env.KV, request);
  if (!session?.userId) return { error: json({ error: 'Unauthorized' }, 401) };
  return { userId: session.userId };
}

// GET /api/habits — habits + last 28 days of completions
export async function listHabits(request, env) {
  const { userId, error } = await auth(request, env);
  if (error) return error;

  const db = DB(env);
  const { results: habits } = await db
    .prepare('SELECT * FROM habits WHERE user_id = ? AND active = 1 ORDER BY sort_order, id')
    .bind(userId)
    .all();

  // Fetch completions for last 28 days for this user
  const { results: completions } = await db
    .prepare(`SELECT habit_id, date FROM habit_completions
              WHERE user_id = ? AND date >= date('now', '-27 days')
              ORDER BY date DESC`)
    .bind(userId)
    .all();

  return json({ habits: habits ?? [], completions: completions ?? [] });
}

// POST /api/habits
export async function createHabit(request, env) {
  const { userId, error } = await auth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const name  = body.name?.trim();
  const emoji = body.emoji?.trim() || '✅';
  if (!name) return json({ error: 'Name is required' }, 400);
  if (name.length > 80) return json({ error: 'Name too long' }, 400);

  // sort_order = max + 1
  const existing = await DB(env)
    .prepare('SELECT COUNT(*) AS cnt FROM habits WHERE user_id = ? AND active = 1')
    .bind(userId)
    .first();
  const order = (existing?.cnt ?? 0);

  const result = await DB(env)
    .prepare('INSERT INTO habits (user_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)')
    .bind(userId, name, emoji, order)
    .run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

// PUT /api/habits/:id
export async function updateHabit(request, env, id) {
  const { userId, error } = await auth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const fields = [];
  const params = [];
  if (body.name  !== undefined) { fields.push('name = ?');       params.push(body.name.trim()); }
  if (body.emoji !== undefined) { fields.push('emoji = ?');      params.push(body.emoji.trim()); }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(Number(body.sort_order)); }
  if (!fields.length) return json({ error: 'Nothing to update' }, 400);

  params.push(userId, Number(id));
  await DB(env)
    .prepare(`UPDATE habits SET ${fields.join(', ')} WHERE user_id = ? AND id = ?`)
    .bind(...params)
    .run();

  return json({ ok: true });
}

// DELETE /api/habits/:id — soft archive
export async function deleteHabit(request, env, id) {
  const { userId, error } = await auth(request, env);
  if (error) return error;

  await DB(env)
    .prepare('UPDATE habits SET active = 0 WHERE id = ? AND user_id = ?')
    .bind(Number(id), userId)
    .run();

  return json({ ok: true });
}

// POST /api/habits/:id/toggle  { date: "YYYY-MM-DD" }
export async function toggleHabit(request, env, id) {
  const { userId, error } = await auth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }

  const date = body.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Invalid date' }, 400);

  // Verify the habit belongs to this user
  const habit = await DB(env)
    .prepare('SELECT id FROM habits WHERE id = ? AND user_id = ? AND active = 1')
    .bind(Number(id), userId)
    .first();
  if (!habit) return json({ error: 'Not found' }, 404);

  // Check if already completed
  const existing = await DB(env)
    .prepare('SELECT id FROM habit_completions WHERE habit_id = ? AND date = ?')
    .bind(Number(id), date)
    .first();

  if (existing) {
    await DB(env)
      .prepare('DELETE FROM habit_completions WHERE habit_id = ? AND date = ?')
      .bind(Number(id), date)
      .run();
    return json({ done: false });
  } else {
    await DB(env)
      .prepare('INSERT INTO habit_completions (habit_id, user_id, date) VALUES (?, ?, ?)')
      .bind(Number(id), userId, date)
      .run();
    return json({ done: true });
  }
}
