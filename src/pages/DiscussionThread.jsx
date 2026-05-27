import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Discussion.css';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Build flat comment array into a tree
function buildTree(comments) {
  const map  = {};
  const roots = [];
  for (const c of comments) map[c.id] = { ...c, replies: [] };
  for (const c of comments) {
    if (c.parent_id && map[c.parent_id]) map[c.parent_id].replies.push(map[c.id]);
    else roots.push(map[c.id]);
  }
  return roots;
}

// ── Reply form ────────────────────────────────────────────────────
function ReplyForm({ topicId, parentId, onPosted, onCancel }) {
  const [body,    setBody]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/discussion/topics/${topicId}/comments`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body: body.trim(), parent_id: parentId || null }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Failed to post.'); return; }
    onPosted();
  };

  return (
    <form className="disc-reply-form" onSubmit={submit}>
      {error && <p className="disc-reply-form__error">{error}</p>}
      <textarea
        ref={ref}
        className="disc-reply-form__input"
        placeholder="Write a reply…"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={3}
      />
      <div className="disc-reply-form__actions">
        <button type="submit" className="disc-btn disc-btn--primary disc-btn--sm" disabled={loading || !body.trim()}>
          {loading ? 'Posting…' : 'Reply'}
        </button>
        <button type="button" className="disc-btn disc-btn--ghost disc-btn--sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Single comment + its children ────────────────────────────────
const MAX_INDENT = 5;

function Comment({ comment, topicId, userId, onRefresh, depth = 0 }) {
  const [replying,  setReplying]  = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const indent = Math.min(depth, MAX_INDENT);

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return;
    await fetch(`/api/discussion/comments/${comment.id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="disc-comment" style={{ '--indent': indent }}>
      {indent > 0 && <div className="disc-comment__thread-line" />}

      <div className="disc-comment__body-wrap">
        <div className="disc-comment__meta">
          <span className="disc-comment__author">{comment.author}</span>
          <span className="disc-comment__dot">·</span>
          <span className="disc-comment__date">{fmtDate(comment.created_at)}</span>
          {comment.replies?.length > 0 && (
            <button
              className="disc-comment__collapse"
              onClick={() => setCollapsed(c => !c)}
            >
              {collapsed ? `[+${comment.replies.length}]` : '[–]'}
            </button>
          )}
        </div>

        {comment.deleted ? (
          <p className="disc-comment__deleted">[deleted]</p>
        ) : (
          <p className="disc-comment__text">{comment.body}</p>
        )}

        {!comment.deleted && (
          <div className="disc-comment__actions">
            {userId && (
              <button className="disc-comment__action" onClick={() => setReplying(r => !r)}>
                {replying ? 'cancel' : 'reply'}
              </button>
            )}
            {userId === comment.author_id && (
              <button className="disc-comment__action disc-comment__action--delete" onClick={handleDelete}>
                delete
              </button>
            )}
          </div>
        )}

        {replying && (
          <ReplyForm
            topicId={topicId}
            parentId={comment.id}
            onPosted={() => { setReplying(false); onRefresh(); }}
            onCancel={() => setReplying(false)}
          />
        )}
      </div>

      {!collapsed && comment.replies?.length > 0 && (
        <div className="disc-comment__children">
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

// ── Thread page ───────────────────────────────────────────────────
export default function DiscussionThread() {
  const { id }   = useParams();
  const { user } = useAuth();

  const [topic,    setTopic]    = useState(null);
  const [tree,     setTree]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [replying, setReplying] = useState(false);
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
          <span>{fmtDate(topic.created_at)}</span>
        </div>
        <p className="disc-topic__body">{topic.body}</p>
      </article>

      <div className="disc-thread">
        <div className="disc-thread__header">
          <span className="disc-thread__count">
            {topic.comment_count} {topic.comment_count === 1 ? 'reply' : 'replies'}
          </span>
          {user && !replying && (
            <button className="disc-btn disc-btn--primary disc-btn--sm" onClick={() => setReplying(true)}>
              Add a comment
            </button>
          )}
        </div>

        {replying && (
          <ReplyForm
            topicId={id}
            parentId={null}
            onPosted={() => { setReplying(false); load(); }}
            onCancel={() => setReplying(false)}
          />
        )}

        {tree.length === 0 ? (
          <p className="disc-empty disc-empty--inline">
            No comments yet.{user ? '' : ' Sign in to be first.'}
          </p>
        ) : (
          <div className="disc-comments">
            {tree.map(c => (
              <Comment
                key={c.id}
                comment={c}
                topicId={id}
                userId={user?.id}
                onRefresh={load}
                depth={0}
              />
            ))}
          </div>
        )}

        {!user && (
          <p className="disc-auth-nudge">
            <Link to="/auth">Sign in</Link> to join the discussion.
          </p>
        )}
      </div>
    </div>
  );
}
