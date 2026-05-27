// ── Discussion metrics API ─────────────────────────────────────────
//   GET /api/admin/discussion/metrics  — monitoring KPIs
//   GET /api/admin/discussion/triage   — triage / moderation data
//
// Both endpoints require admin access.

import { getSession }   from './auth/session.js';
import { requireAdmin } from './admin.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function displayName(r) {
  return r.nickname || r.email?.split('@')[0] || 'unknown';
}

// GET /api/admin/discussion/metrics
export async function getDiscussionMetrics(request, env) {
  const session = await getSession(env.KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();

  const weekStartISO      = new Date(now - 7  * 86_400_000).toISOString();
  const priorWeekStartISO = new Date(now - 14 * 86_400_000).toISOString();
  const todayStartISO     = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [
    rTotalTopics,
    rTopicsWeek,
    rTopicsPriorWeek,
    rTopicsToday,
    rTotalComments,
    rCommentsWeek,
    rCommentsPriorWeek,
    rCommentsToday,
    rActiveParticipants,
    rReplyRate,
    rAvgComments,
    rTopicsTrend,
    rCommentsTrend,
    rTopTopics,
  ] = await db.batch([
    db.prepare('SELECT COUNT(*) as n FROM discussion_topics'),
    db.prepare('SELECT COUNT(*) as n FROM discussion_topics WHERE created_at >= ?').bind(weekStartISO),
    db.prepare('SELECT COUNT(*) as n FROM discussion_topics WHERE created_at >= ? AND created_at < ?').bind(priorWeekStartISO, weekStartISO),
    db.prepare('SELECT COUNT(*) as n FROM discussion_topics WHERE created_at >= ?').bind(todayStartISO),
    db.prepare('SELECT COUNT(*) as n FROM discussion_comments WHERE deleted = 0'),
    db.prepare('SELECT COUNT(*) as n FROM discussion_comments WHERE created_at >= ? AND deleted = 0').bind(weekStartISO),
    db.prepare('SELECT COUNT(*) as n FROM discussion_comments WHERE created_at >= ? AND created_at < ? AND deleted = 0').bind(priorWeekStartISO, weekStartISO),
    db.prepare('SELECT COUNT(*) as n FROM discussion_comments WHERE created_at >= ? AND deleted = 0').bind(todayStartISO),
    // Unique users who posted a topic or comment in the last 7 days
    db.prepare(`
      SELECT COUNT(DISTINCT author_id) as n FROM (
        SELECT author_id FROM discussion_topics WHERE created_at >= ?
        UNION ALL
        SELECT author_id FROM discussion_comments WHERE created_at >= ? AND deleted = 0
      )
    `).bind(weekStartISO, weekStartISO),
    // Topics with at least one reply vs total
    db.prepare(`
      SELECT
        COUNT(CASE WHEN comment_count > 0 THEN 1 END) as with_replies,
        COUNT(*) as total
      FROM discussion_topics
    `),
    db.prepare('SELECT AVG(comment_count) as avg FROM discussion_topics'),
    // Topics per calendar day for last 7 days
    db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as n
      FROM discussion_topics
      WHERE created_at >= ?
      GROUP BY day ORDER BY day
    `).bind(weekStartISO),
    // Comments per calendar day for last 7 days
    db.prepare(`
      SELECT DATE(created_at) as day, COUNT(*) as n
      FROM discussion_comments
      WHERE created_at >= ? AND deleted = 0
      GROUP BY day ORDER BY day
    `).bind(weekStartISO),
    // Top 5 most-replied topics all time
    db.prepare(`
      SELECT t.id, t.title, t.comment_count, t.created_at, u.nickname, u.email
      FROM discussion_topics t
      JOIN users u ON u.id = t.author_id
      ORDER BY t.comment_count DESC
      LIMIT 5
    `),
  ]);

  const topicsWeek      = rTopicsWeek.results[0]?.n      ?? 0;
  const topicsPriorWeek = rTopicsPriorWeek.results[0]?.n ?? 0;
  const commentsWeek    = rCommentsWeek.results[0]?.n    ?? 0;
  const commentsPriorWeek = rCommentsPriorWeek.results[0]?.n ?? 0;
  const withReplies     = rReplyRate.results[0]?.with_replies ?? 0;
  const totalForRate    = rReplyRate.results[0]?.total        ?? 0;

  return json({
    generated_at: now,
    topics: {
      total:      rTotalTopics.results[0]?.n ?? 0,
      this_week:  topicsWeek,
      prior_week: topicsPriorWeek,
      today:      rTopicsToday.results[0]?.n ?? 0,
    },
    comments: {
      total:      rTotalComments.results[0]?.n ?? 0,
      this_week:  commentsWeek,
      prior_week: commentsPriorWeek,
      today:      rCommentsToday.results[0]?.n ?? 0,
    },
    participants: {
      active_this_week: rActiveParticipants.results[0]?.n ?? 0,
    },
    engagement: {
      reply_rate_pct:         totalForRate > 0 ? Math.round((withReplies / totalForRate) * 100) : 0,
      avg_comments_per_topic: Math.round((rAvgComments.results[0]?.avg ?? 0) * 10) / 10,
    },
    trends: {
      topics_by_day:   rTopicsTrend.results   ?? [],
      comments_by_day: rCommentsTrend.results ?? [],
    },
    top_topics: (rTopTopics.results ?? []).map(r => ({
      id:            r.id,
      title:         r.title,
      comment_count: r.comment_count,
      created_at:    r.created_at,
      author:        displayName(r),
    })),
  });
}

// GET /api/admin/discussion/triage
export async function getDiscussionTriage(request, env) {
  const session = await getSession(env.KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const db  = env.varun_portfolio_auth;
  const now = Date.now();

  const weekStartISO = new Date(now - 7  * 86_400_000).toISOString();
  const dayAgoISO    = new Date(now - 24 * 3_600_000).toISOString();

  const [
    rOrphaned,
    rHotThreads,
    rDeletedCount,
    rRecentDeletions,
    rTopPosters,
  ] = await db.batch([
    // Topics with no replies that are more than 24 hours old
    db.prepare(`
      SELECT t.id, t.title, t.created_at, u.nickname, u.email
      FROM discussion_topics t
      JOIN users u ON u.id = t.author_id
      WHERE t.comment_count = 0 AND t.created_at < ?
      ORDER BY t.created_at DESC
      LIMIT 10
    `).bind(dayAgoISO),
    // Topics that received the most new comments this week
    db.prepare(`
      SELECT t.id, t.title, t.comment_count, COUNT(c.id) as new_this_week
      FROM discussion_topics t
      JOIN discussion_comments c ON c.topic_id = t.id
      WHERE c.created_at >= ? AND c.deleted = 0
      GROUP BY t.id, t.title, t.comment_count
      ORDER BY new_this_week DESC
      LIMIT 5
    `).bind(weekStartISO),
    // How many comments were soft-deleted this week
    db.prepare(`
      SELECT COUNT(*) as n FROM discussion_comments
      WHERE deleted = 1 AND updated_at >= ?
    `).bind(weekStartISO),
    // Recent soft-deletions with topic context (for moderation review)
    db.prepare(`
      SELECT c.id, c.topic_id, c.created_at, c.updated_at as deleted_at,
             t.title as topic_title, u.nickname, u.email
      FROM discussion_comments c
      JOIN discussion_topics t ON t.id = c.topic_id
      JOIN users u             ON u.id = c.author_id
      WHERE c.deleted = 1 AND c.updated_at >= ?
      ORDER BY c.updated_at DESC
      LIMIT 10
    `).bind(weekStartISO),
    // Most active community members this week (topics + comments)
    db.prepare(`
      SELECT u.nickname, u.email, COUNT(*) as posts
      FROM (
        SELECT author_id FROM discussion_topics WHERE created_at >= ?
        UNION ALL
        SELECT author_id FROM discussion_comments WHERE created_at >= ? AND deleted = 0
      ) a
      JOIN users u ON u.id = a.author_id
      GROUP BY a.author_id
      ORDER BY posts DESC
      LIMIT 5
    `).bind(weekStartISO, weekStartISO),
  ]);

  return json({
    generated_at: now,
    orphaned_topics: (rOrphaned.results ?? []).map(r => ({
      id:         r.id,
      title:      r.title,
      created_at: r.created_at,
      author:     displayName(r),
    })),
    hot_threads: (rHotThreads.results ?? []).map(r => ({
      id:            r.id,
      title:         r.title,
      comment_count: r.comment_count,
      new_this_week: r.new_this_week,
    })),
    deleted_comments: {
      count_this_week: rDeletedCount.results[0]?.n ?? 0,
      recent: (rRecentDeletions.results ?? []).map(r => ({
        id:          r.id,
        topic_id:    r.topic_id,
        topic_title: r.topic_title,
        deleted_at:  r.deleted_at,
        author:      displayName(r),
      })),
    },
    top_posters: (rTopPosters.results ?? []).map(r => ({
      name:  r.nickname || r.email?.split('@')[0] || 'unknown',
      posts: r.posts,
    })),
  });
}
