import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Discussion.css';

// ── Helpers ────────────────────────────────────────────────────────

function buildTree(comments) {
  const map = {};
  const roots = [];
  for (const c of comments) map[c.id] = { ...c, replies: [] };
  for (const c of comments) {
    if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(map[c.id]);
    else roots.push(map[c.id]);
  }
  return roots;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f97316', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
];

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name) {
  const parts = name.split(/[-_\s]/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// ── Avatar ─────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }) {
  return (
    <div
      className="disc-avatar"
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

// ── Inline reply textarea (appears inside a comment card) ──────────

function InlineReplyForm({ topicId, parentId, onPosted, onCancel }) {
  const [body,    setBody]    = useState('');
  const [posting, setPosting] = useState(false);
  const [error,   setError]   = useState('');
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const post = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    const res  = await fetch(`/api/discussion/topics/${topicId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body: body.trim(), parent_id: parentId || null }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) { setError(data.error || 'Failed to post.'); return; }
    onPosted();
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
  };

  return (
    <div className="disc-inline-reply">
      {error && <p className="disc-inline-reply__error">{error}</p>}
      <textarea
        ref={ref}
        className="disc-inline-reply__input"
        placeholder="Write a reply…"
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={onKey}
        rows={3}
      />
      <div className="disc-inline-reply__actions">
        <button
          className="disc-btn disc-btn--primary disc-btn--sm"
          disabled={posting || !body.trim()}
          onClick={post}
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
        <button className="disc-btn disc-btn--ghost disc-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Single comment — recursive, every reply can have replies ───────

const MAX_VISUAL_INDENT = 4;

function Comment({ comment, topicId, userId, onRefresh, depth = 0 }) {
  const [replying,  setReplying]  = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return;
    await fetch(`/api/discussion/comments/${comment.id}`, { method: 'DELETE' });
    onRefresh();
  };

  const hasReplies = comment.replies?.length > 0;
  const replyCount = comment.replies?.length ?? 0;

  return (
    <div className="disc-comment-wrap">
      <div className="disc-comment-card">
        <div className="disc-comment-card__header">
          <Avatar name={comment.author} size={36} />
          <div className="disc-comment-card__name-row">
            <span className="disc-comment-card__author">{comment.author}</span>
            <span className="disc-comment-card__time">{timeAgo(comment.created_at)}</span>
          </div>
        </div>

        {comment.deleted
          ? <p className="disc-comment-card__deleted">[deleted]</p>
          : <p className="disc-comment-card__text">{comment.body}</p>
        }

        {!comment.deleted && (
          <div className="disc-comment-card__actions">
            {userId && (
              <button
                className="disc-comment-card__action"
                onClick={() => setReplying(r => !r)}
              >
                {replying ? 'Cancel' : 'Reply'}
              </button>
            )}
            {userId === comment.author_id && (
              <button
                className="disc-comment-card__action disc-comment-card__action--delete"
                onClick={handleDelete}
              >
                Delete
              </button>
            )}
            {hasReplies && (
              <button
                className="disc-comment-card__action disc-comment-card__action--collapse"
                onClick={() => setCollapsed(c => !c)}
              >
                {collapsed
                  ? `Show ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
                  : 'Hide replies'}
              </button>
            )}
          </div>
        )}

        {replying && (
          <InlineReplyForm
            topicId={topicId}
            parentId={comment.id}
            onPosted={() => { setReplying(false); onRefresh(); }}
            onCancel={() => setReplying(false)}
          />
        )}
      </div>

      {/* Nested replies — visually indented, but recursion is unlimited */}
      {!collapsed && hasReplies && (
        <div className={`disc-comment-replies${depth >= MAX_VISUAL_INDENT ? ' disc-comment-replies--flat' : ''}`}>
          {comment.replies.map(r => (
            <Comment
              key={r.id}
              comment={r}
              topicId={topicId}
              userId={userId}
              onRefresh={onRefresh}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Top-level comment composer ─────────────────────────────────────

function AddCommentForm({ topicId, onPosted }) {
  const [body,    setBody]    = useState('');
  const [posting, setPosting] = useState(false);
  const [error,   setError]   = useState('');

  const post = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError('');
    const res  = await fetch(`/api/discussion/topics/${topicId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body: body.trim(), parent_id: null }),
    });
    const data = await res.json();
    setPosting(false);
    if (!res.ok) { setError(data.error || 'Failed to post.'); return; }
    setBody('');
    onPosted();
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
  };

  return (
    <div className="disc-add-comment">
      <p className="disc-add-comment__label">Add a comment</p>
      {error && <p className="disc-inline-reply__error">{error}</p>}
      <div className="disc-add-comment__row">
        <textarea
          className="disc-add-comment__input"
          placeholder="Write a comment…"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={onKey}
          rows={2}
        />
        <button
          className="disc-add-comment__post"
          disabled={posting || !body.trim()}
          onClick={post}
        >
          {posting ? '…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ── Thread page ────────────────────────────────────────────────────

export default function DiscussionThread() {
  const { id }   = useParams();
  const { user } = useAuth();

  const [topic,    setTopic]    = useState(null);
  const [tree,     setTree]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const res  = await fetch(`/api/discussion/topics/${id}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    const data = await res.json();
    setTopic(data.topic);
    setTree(buildTree(data.comments || []));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading)  return <div className="disc-page disc-empty">Loading…</div>;
  if (notFound) return (
    <div className="disc-page disc-empty">
      Topic not found. <Link to="/discussion">Back to discussion</Link>
    </div>
  );

  return (
    <div className="disc-page">
      <Link to="/discussion" className="disc-back">← Discussion</Link>

      <article className="disc-topic">
        <h1 className="disc-topic__title">{topic.title}</h1>
        <div className="disc-topic__meta">
          <span>{topic.author}</span>
          <span className="disc-comment__dot">·</span>
          <span>{timeAgo(topic.created_at)}</span>
        </div>
        <p className="disc-topic__body">{topic.body}</p>
      </article>

      <div className="disc-thread">
        <div className="disc-thread__header">
          <span className="disc-thread__count">
            {topic.comment_count} {topic.comment_count === 1 ? 'reply' : 'replies'}
          </span>
        </div>

        {user
          ? <AddCommentForm topicId={id} onPosted={load} />
          : (
            <p className="disc-auth-nudge" style={{ marginBottom: 20, textAlign: 'left' }}>
              <Link to="/auth">Sign in</Link> to join the discussion.
            </p>
          )
        }

        {tree.length === 0 ? (
          <p className="disc-empty disc-empty--inline">No comments yet. Be the first!</p>
        ) : (
          <div className="disc-comments">
            {tree.map(c => (
              <Comment
                key={c.id}
                comment={c}
                topicId={id}
                userId={user?.userId}
                onRefresh={load}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
