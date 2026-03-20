// ── FrozenChat ─────────────────────────────────────────────────────
// Simulates the AI assistant for unauthenticated guests.
// Cycles through DEMOS: shows the user question, then types out the
// assistant answer character-by-character (like real streaming), pauses,
// then cross-fades to the next pair.

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import PixelOwl from './PixelOwl';
import './FrozenChat.css';

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

const CHAR_SPEED_MS  = 16;
const PAUSE_AFTER_MS = 3200;
const Q_DELAY_MS     = 600;

const DOT_COLORS = ['#ff5f57', '#febc2e', '#28c840'];

export default function FrozenChat({ showCta = true }) {
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
    <div className="frozen-chat">
      {/* Header bar */}
      <div className="frozen-chat__header">
        <div className="frozen-chat__header-dots">
          {DOT_COLORS.map(c => (
            <div key={c} className="frozen-chat__header-dot" style={{ background: c }} />
          ))}
        </div>
        <span className="frozen-chat__header-label">AI assistant · demo</span>
        <div className="frozen-chat__indicators">
          {DEMOS.map((_, i) => (
            <div
              key={i}
              className={`frozen-chat__indicator${i === idx ? ' frozen-chat__indicator--active' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className={`frozen-chat__messages${visible ? '' : ' frozen-chat__messages--hidden'}`}>
        {/* User bubble */}
        <div className="frozen-chat__user-bubble">
          <div className="frozen-chat__user-message">{demo.q}</div>
        </div>

        {/* Assistant bubble */}
        {phase !== 'show-q' && (
          <div className="frozen-chat__assistant-row">
            <div className="frozen-chat__owl">
              <PixelOwl size={2} state={phase === 'typing-a' ? 'streaming' : 'done'} />
            </div>
            <div className="frozen-chat__assistant-message">
              {typedA}
              {phase === 'typing-a' && <span className="frozen-chat__cursor" />}
            </div>
          </div>
        )}
      </div>

      {/* Frosted CTA */}
      {showCta && (
        <div className="frozen-chat__cta">
          <span className="frozen-chat__cta-text">Sign in to ask your own questions</span>
          <Link to="/auth" className="frozen-chat__cta-link">Sign in →</Link>
        </div>
      )}
    </div>
  );
}
