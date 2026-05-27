import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function PublicPage() {
  const { slug } = useParams();
  const [page,    setPage]    = useState(null);
  const [error,   setError]   = useState(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    fetch(`/api/pages/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setPage(data.page))
      .catch(() => setError('Page not found.'));
  }, [slug]);

  // Grow the iframe to match its content so the outer page scrolls (no double scrollbar)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !page) return;
    const resize = () => {
      const h = iframe.contentDocument?.documentElement?.scrollHeight;
      if (h) iframe.style.height = h + 'px';
    };
    iframe.addEventListener('load', resize);
    return () => iframe.removeEventListener('load', resize);
  }, [page]);

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 48 }}>🦉</div>
        <p style={{ fontSize: 15, opacity: 0.6 }}>This page doesn't exist or has been removed.</p>
        <Link to="/" style={{ fontSize: 13, opacity: 0.5, textDecoration: 'none' }}>← Go home</Link>
      </div>
    );
  }

  if (!page) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontSize: 13, opacity: 0.4, fontFamily: 'monospace' }}>loading…</div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={page.content}
      sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
      title={page.title}
      style={{ display: 'block', width: '100%', border: 'none', minHeight: '100vh' }}
    />
  );
}
