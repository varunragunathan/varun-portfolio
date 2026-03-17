// ── FrozenChat ─────────────────────────────────────────────────────
// Simulates the AI assistant for unauthenticated guests.
// Cycles through DEMOS: shows the user question, then types out the
// assistant answer character-by-character (like real streaming), pauses,
// then cross-fades to the next pair.

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import PixelOwl from './PixelOwl';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

const DEMOS = [
  {
    q: 'How does passkey auth work here?',
    a: 'At registration, a key pair and a lock are created. You keep the private key — sealed inside your device behind Face ID or a fingerprint. We get the public key. Next time you sign in, we send the lock. Your device unlocks it with your private key, then we confirm it fits using ours. No password ever exists to steal.',
  },
  {
    q: "What's the RAG pipeline?",
    a: 'Docs are chunked and embedded via Cloudflare AI, then stored in Vectorize. At query time your question is embedded, top chunks are cosine-matched, and injected into llama-3.3-70b as context.',
  },
  {
    q: 'How are sessions managed?',
    a: 'Auth is two-phase: a pending token is created after passkey verification, then finalised into a 7-day HttpOnly session cookie. Trusted devices skip number-matching on return visits.',
  }
];

const CHAR_SPEED_MS = 16;   // ms per character while typing
const PAUSE_AFTER_MS = 3200; // ms to show complete answer before cycling
const Q_DELAY_MS = 600;      // ms before typing starts after question appears

export default function FrozenChat({ showCta = true }) {
  const { t } = useTheme();
  const [idx, setIdx]       = useState(0);
  const [typedA, setTypedA] = useState('');
  const [phase, setPhase]   = useState('show-q'); // show-q | typing-a | done
  const [visible, setVisible] = useState(true);
  const idxTimerRef  = useRef(null);
  const doneTimerRef = useRef(null);

  const demo = DEMOS[idx];

  // Reset and start typing when idx changes
  useEffect(() => {
    setTypedA('');
    setPhase('show-q');
    setVisible(true);
    idxTimerRef.current = setTimeout(() => setPhase('typing-a'), Q_DELAY_MS);
    return () => clearTimeout(idxTimerRef.current);
  }, [idx]);

  // Character-by-character typing
  useEffect(() => {
    if (phase !== 'typing-a') return;
    const full = demo.a;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTypedA(full.slice(0, i));
      if (i >= full.length) { clearInterval(id); setPhase('done'); }
    }, CHAR_SPEED_MS);
    return () => clearInterval(id);
  }, [phase, demo.a]);

  // Pause then cycle to next demo
  useEffect(() => {
    if (phase !== 'done') return;
    doneTimerRef.current = setTimeout(() => {
      setVisible(false);
      doneTimerRef.current = setTimeout(() => {
        setIdx(i => (i + 1) % DEMOS.length);
      }, 350);
    }, PAUSE_AFTER_MS);
    return () => clearTimeout(doneTimerRef.current);
  }, [phase]);

  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.border}`,
      borderRadius: 14, overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {['#ff5f57','#febc2e','#28c840'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
          ))}
        </div>
        <span style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.text3, flex: 1, textAlign: 'center' }}>
          AI assistant · demo
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {DEMOS.map((_, i) => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: i === idx ? t.accent : t.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        padding: '14px 14px',
        minHeight: 160,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.35s ease',
        position: 'relative',
      }}>
        {/* User bubble */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <div style={{
            maxWidth: '82%', padding: '9px 13px',
            borderRadius: '14px 14px 4px 14px',
            background: t.accentDim, border: `1px solid ${t.accentBorder}`,
            fontFamily: F, fontSize: 13, color: t.text1, lineHeight: 1.5,
          }}>
            {demo.q}
          </div>
        </div>

        {/* Assistant bubble */}
        {phase !== 'show-q' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <PixelOwl size={2} state={phase === 'typing-a' ? 'streaming' : 'done'} />
            </div>
            <div style={{
              padding: '9px 13px', borderRadius: '14px 14px 14px 4px',
              background: t.surface, border: `1px solid ${t.border}`,
              fontFamily: F, fontSize: 13, color: t.text2, lineHeight: 1.6,
              minHeight: 38,
            }}>
              {typedA}
              {phase === 'typing-a' && (
                <span style={{
                  display: 'inline-block', width: 2, height: '1em',
                  background: t.accent, marginLeft: 2, verticalAlign: 'text-bottom',
                  animation: 'fc-blink 0.7s step-end infinite',
                }} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Frosted CTA */}
      {showCta && (
        <div style={{
          borderTop: `1px solid ${t.border}`,
          padding: '12px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.03em' }}>
            Sign in to ask your own questions
          </span>
          <Link
            to="/auth"
            style={{
              flexShrink: 0, textDecoration: 'none',
              fontFamily: M, fontSize: 10, letterSpacing: '0.07em',
              color: t.accent, background: t.accentDim, border: `1px solid ${t.accentBorder}`,
              borderRadius: 8, padding: '5px 12px',
            }}
          >
            Sign in →
          </Link>
        </div>
      )}

      <style>{`
        @keyframes fc-blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
