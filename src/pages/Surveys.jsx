// ── /surveys — public survey listing ─────────────────────────────

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Fade } from '../components/UI';
import PixelOwl from '../components/PixelOwl';

export default function Surveys() {
  const [surveys, setSurveys] = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch('/api/surveys')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setSurveys(d.surveys ?? []))
      .catch(() => setError('Could not load surveys.'));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', marginTop: 53 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>
        <Fade>
          <div style={{ marginBottom: 40, textAlign: 'center' }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10, letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'var(--accent)',
              opacity: 0.8, marginBottom: 12,
            }}>
              surveys
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 12px' }}>
              Conversations, not forms
            </h1>
            <p style={{ fontSize: 15, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
              Each survey is guided by the owl — answer at your own pace, no account needed.
            </p>
          </div>
        </Fade>

        {error && (
          <p style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>{error}</p>
        )}

        {!surveys && !error && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <PixelOwl size={6} state="snore" />
          </div>
        )}

        {surveys?.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 15 }}>
            No active surveys right now — check back soon.
          </div>
        )}

        {surveys && surveys.length > 0 && (
          <Fade>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {surveys.map(s => (
                <Link
                  key={s.id}
                  to={`/survey/${s.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <div style={{
                    padding: '22px 24px',
                    borderRadius: 14,
                    border: '1px solid var(--border, rgba(128,128,128,0.15))',
                    background: 'var(--surface-alt)',
                    transition: 'border-color 0.15s, background 0.15s',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.background = 'var(--hover-bg)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border, rgba(128,128,128,0.15))';
                    e.currentTarget.style.background = 'var(--surface-alt)';
                  }}
                  >
                    <div style={{ fontSize: 32 }}>🦉</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
                        {s.title}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
                          {s.description}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontSize: 18, color: 'var(--accent)',
                      flexShrink: 0,
                    }}>→</div>
                  </div>
                </Link>
              ))}
            </div>
          </Fade>
        )}
      </div>
    </div>
  );
}
