import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function PublicPage() {
  const { slug } = useParams();
  const [page,  setPage]  = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPage(null);
    setError(null);
    fetch(`/api/pages/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setPage(data.page))
      .catch(() => setError('Page not found.'));
  }, [slug]);

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
      srcDoc={page.content}
      sandbox="allow-scripts allow-same-origin allow-popups allow-top-navigation-by-user-activation"
      title={page.title}
      style={{ display: 'block', width: '100%', border: 'none', height: 'calc(100vh - 52px)' }}
    />
  );
}
