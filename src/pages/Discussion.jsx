import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Discussion.css';

const PAGE_SIZE = 50;

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function NewTopicForm({ onCreated, onCancel }) {
  const [title,   setTitle]   = useState('');
  const [body,    setBody]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) { setError('Both fields required.'); return; }
    setLoading(true);
    setError('');
    const res  = await fetch('/api/discussion/topics', {
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
      {error && <p className="disc-new-form__error" role="alert">{error}</p>}
      <label htmlFor="disc-new-title" className="disc-sr-only">Topic title</label>
      <input
        id="disc-new-title"
        className="disc-new-form__input"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        maxLength={200}
      />
      <label htmlFor="disc-new-body" className="disc-sr-only">Topic body</label>
      <textarea
        id="disc-new-body"
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
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [topics,      setTopics]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [showForm,    setShowForm]    = useState(false);

  // SEO: page title + meta
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Discussion — varunr.dev';
    const metaDesc   = document.querySelector('meta[name="description"]');
    const ogTitle    = document.querySelector('meta[property="og:title"]');
    const ogDesc     = document.querySelector('meta[property="og:description"]');
    const ogUrl      = document.querySelector('meta[property="og:url"]');
    const prevDesc   = metaDesc?.getAttribute('content');
    const prevOgT    = ogTitle?.getAttribute('content');
    const prevOgD    = ogDesc?.getAttribute('content');
    if (metaDesc) metaDesc.setAttribute('content', 'Open discussion board on varunr.dev. Anyone can read; sign in to start a topic or leave a reply.');
    if (ogTitle)  ogTitle.setAttribute('content', 'Discussion — varunr.dev');
    if (ogDesc)   ogDesc.setAttribute('content', 'Open discussion board on varunr.dev. Anyone can read; sign in to participate.');
    if (ogUrl)    ogUrl.setAttribute('content', 'https://varunr.dev/discussion');
    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.setAttribute('content', prevDesc);
      if (ogTitle  && prevOgT)  ogTitle.setAttribute('content', prevOgT);
      if (ogDesc   && prevOgD)  ogDesc.setAttribute('content', prevOgD);
      if (ogUrl)                ogUrl.setAttribute('content', 'https://varunr.dev');
    };
  }, []);

  // Stable refs so the IntersectionObserver callback never goes stale
  const offsetRef     = useRef(0);
  const hasMoreRef    = useRef(false);
  const loadingRef    = useRef(false);
  const sentinelRef   = useRef(null);
  const limitRef      = useRef(PAGE_SIZE);

  const fetchPage = useCallback(async (offset, append) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (append) setLoadingMore(true); else setLoading(true);

    try {
      const res  = await fetch(
        `/api/discussion/topics?limit=${limitRef.current}&offset=${offset}`
      );
      const data = await res.json();
      const next = data.topics || [];

      if (append) setTopics(prev => [...prev, ...next]);
      else        setTopics(next);

      offsetRef.current  = offset + next.length;
      hasMoreRef.current = data.hasMore ?? false;
      setHasMore(data.hasMore ?? false);
    } finally {
      loadingRef.current = false;
      if (append) setLoadingMore(false); else setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    offsetRef.current = 0;
    fetchPage(0, false);
  }, [fetchPage]);

  // Infinite scroll — observe sentinel; reads live values from refs, no stale closure
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
          fetchPage(offsetRef.current, true);
        }
      },
      { rootMargin: '300px' } // start loading 300px before sentinel enters viewport
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage]); // fetchPage is stable (no deps), so this runs once

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
        <div className="disc-empty" role="status" aria-live="polite">Loading…</div>
      ) : topics.length === 0 ? (
        <div className="disc-empty">
          No topics yet.{user ? ' Be the first to start one.' : ' Sign in to start one.'}
        </div>
      ) : (
        <>
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

          {/* Sentinel — IntersectionObserver fires when this enters view */}
          <div ref={sentinelRef} className="disc-sentinel" />

          {loadingMore && <div className="disc-loading-more" role="status" aria-live="polite">Loading…</div>}
          {!hasMore && topics.length > 0 && (
            <p className="disc-list-end">You've reached the end.</p>
          )}
        </>
      )}

      {!user && (
        <p className="disc-auth-nudge">
          <Link to="/auth">Sign in</Link> to join the discussion.
        </p>
      )}
    </div>
  );
}
