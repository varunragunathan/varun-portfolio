// ── Anonymous feedback widget ──────────────────────────────────────
// Exports:
//   FeedbackForm   — inline textarea + send button (used in footer)
//   FeedbackModal  — overlay modal (used for shake trigger)
//   useShake       — devicemotion shake detection hook

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

async function postFeedback(message, page) {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message.trim(), page }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to submit');
  }
}

// ── Shared form ────────────────────────────────────────────────────
export function FeedbackForm({ onDone, autoFocus = false }) {
  const { t } = useTheme();
  const [text, setText]   = useState('');
  const [phase, setPhase] = useState('idle'); // idle | sending | done | error
  const [errMsg, setErr]  = useState('');

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!text.trim() || phase === 'sending') return;
    setPhase('sending');
    try {
      await postFeedback(text, window.location.pathname);
      setText('');
      setPhase('done');
      setTimeout(() => { setPhase('idle'); onDone?.(); }, 2200);
    } catch (err) {
      setErr(err.message);
      setPhase('error');
      setTimeout(() => setPhase('idle'), 3000);
    }
  }

  if (phase === 'done') {
    return (
      <div style={{ padding: '14px 0', textAlign: 'center' }}>
        <div style={{ fontFamily: M, fontSize: 12, color: '#34c759', letterSpacing: '0.06em' }}>
          ✓ sent · thank you
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
        placeholder="What's on your mind? (anonymous)"
        rows={3}
        maxLength={1000}
        autoFocus={autoFocus}
        style={{
          width: '100%', boxSizing: 'border-box', display: 'block',
          resize: 'none', background: t.surfaceAlt, border: `1px solid ${t.border}`,
          borderRadius: 10, padding: '11px 14px', marginBottom: 8,
          fontFamily: F, fontSize: 13, color: t.text1, outline: 'none', lineHeight: 1.5,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {phase === 'error'
          ? <span style={{ fontFamily: M, fontSize: 10, color: '#ff3b30' }}>{errMsg}</span>
          : <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.03em' }}>⌘↵ or Ctrl↵ to send</span>
        }
        <button
          type="submit"
          disabled={!text.trim() || phase === 'sending'}
          style={{
            flexShrink: 0, padding: '8px 20px', borderRadius: 10,
            fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
            cursor: text.trim() && phase !== 'sending' ? 'pointer' : 'default',
            background: text.trim() ? t.accentDim : 'transparent',
            border: `1px solid ${text.trim() ? t.accentBorder : t.border}`,
            color: text.trim() ? t.accent : t.text3,
            transition: 'all 0.2s',
          }}
        >
          {phase === 'sending' ? '…' : 'Send →'}
        </button>
      </div>
    </form>
  );
}

// ── Shake / floating modal ─────────────────────────────────────────
export function FeedbackModal({ onClose }) {
  const { t } = useTheme();

  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: t.cardBg, border: `1px solid ${t.border}`,
          borderRadius: 20, padding: '28px 28px 24px',
          maxWidth: 380, width: '100%',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 6 }}>
              feedback
            </div>
            <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 22, color: t.text1, margin: 0 }}>
              Leave a thought
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, fontSize: 22, lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <FeedbackForm onDone={onClose} autoFocus />

        <p style={{ fontFamily: M, fontSize: 10, color: t.text3, margin: '14px 0 0', textAlign: 'center', lineHeight: 1.6, letterSpacing: '0.03em' }}>
          anonymous · nothing is stored about you
        </p>
      </div>
    </div>
  );
}

// ── Shake hook ─────────────────────────────────────────────────────
// Returns { shakeState, requestPermission }
// shakeState: 'unsupported' | 'needs-permission' | 'active'
export function useShake(onShake) {
  const cbRef = useRef(onShake);
  useEffect(() => { cbRef.current = onShake; });

  const [shakeState, setShakeState] = useState(() => {
    if (typeof window === 'undefined' || !window.DeviceMotionEvent) return 'unsupported';
    if (typeof DeviceMotionEvent.requestPermission === 'function') return 'needs-permission';
    return 'active';
  });

  // Non-iOS: auto-attach listener immediately
  useEffect(() => {
    if (shakeState !== 'active') return;

    let lastTime = 0;
    const lastAcc = { x: 0, y: 0, z: 0 };

    function handler(e) {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const { x = 0, y = 0, z = 0 } = acc;
      const delta = Math.abs(x - lastAcc.x) + Math.abs(y - lastAcc.y) + Math.abs(z - lastAcc.z);
      lastAcc.x = x; lastAcc.y = y; lastAcc.z = z;

      const now = Date.now();
      if (delta > 28 && now - lastTime > 2000) {
        lastTime = now;
        cbRef.current?.();
      }
    }

    window.addEventListener('devicemotion', handler, { passive: true });
    return () => window.removeEventListener('devicemotion', handler);
  }, [shakeState]);

  // iOS 13+: must be called from a user gesture tap
  const requestPermission = useCallback(async () => {
    if (typeof DeviceMotionEvent?.requestPermission !== 'function') return;
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result === 'granted') setShakeState('active');
    } catch {}
  }, []);

  return { shakeState, requestPermission };
}
