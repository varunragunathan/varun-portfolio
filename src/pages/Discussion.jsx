import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Discussion.css';

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function NewTopicForm({ onCreated, onCancel }) {
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('Both fields required.'); return; }
    setLoading(true);
    setError('');
    const res = await fetch('/api/discussion/topics', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title: title.trim(), body: body.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Failed to post.'); return; }
    onCreated(data.id);
  };

  return (
    <form className="disc-new-form" onSubmit={submit}>
      <h2 className="disc-new-form__title">Start a topic</h2>
      {error && <p className="disc-new-form__error">{error}</p>}
      <input
        className="disc-new-form__input"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        maxLength={200}
      />
      <textarea
        className="disc-new-form__body"
        placeholder="What's on your mind?"
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={6}
      />
      <div className="disc-new-form__actions">
        <button type="submit" className="disc-btn disc-btn--primary" disabled={loading}>
          {loading ? 'Posting…' : 'Post'}
        </button>
        <button type="button" className="disc-btn disc-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DiscussionPage() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [topics,    setTopics]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/discussion/topics');
    const data = await res.json();
    setTopics(data.topics || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreated = (id) => navigate(`/discussion/${id}`);

  return (
    <div className="disc-page">
      <div className="disc-header">
        <div>
          <h1 className="disc-header__title">Discussion</h1>
          <p className="disc-header__sub">Start a topic or join the conversation.</p>
        </div>
        {user && !showForm && (
          <button className="disc-btn disc-btn--primary" onClick={() => setShowForm(true)}>
            + New topic
          </button>
        )}
      </div>

      {showForm && (
        <NewTopicForm
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="disc-empty">Loading…</div>
      ) : topics.length === 0 ? (
        <div className="disc-empty">
          No topics yet.{user ? ' Be the first to start one.' : ' Sign in to start one.'}
        </div>
      ) : (
        <ul className="disc-topic-list">
          {topics.map(t => (
            <li key={t.id}>
              <Link to={`/discussion/${t.id}`} className="disc-topic-card">
                {t.pinned && <span className="disc-topic-card__pin">Pinned</span>}
                <span className="disc-topic-card__title">{t.title}</span>
                <span className="disc-topic-card__meta">
                  {t.author} · {fmtDate(t.created_at)}
                  {t.comment_count > 0 && (
                    <span className="disc-topic-card__count">
                      {t.comment_count} {t.comment_count === 1 ? 'reply' : 'replies'}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!user && (
        <p className="disc-auth-nudge">
          <Link to="/auth">Sign in</Link> to join the discussion.
        </p>
      )}
    </div>
  );
}
