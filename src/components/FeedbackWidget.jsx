// ── Anonymous feedback widget ──────────────────────────────────────
// Exports:
//   FeedbackForm   — inline textarea + send button (used in footer)
//   FeedbackModal  — overlay modal (used for shake trigger)
//   useShake       — devicemotion shake detection hook

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './FeedbackWidget.css';

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
      <div className="feedback-form__done">
        <div className="feedback-form__done-text">✓ sent · thank you</div>
      </div>
    );
  }

  const active = text.trim() && phase !== 'sending';

  return (
    <form onSubmit={handleSubmit}>
      <textarea
        className="feedback-form__textarea"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(); }}
        placeholder="What's on your mind? (anonymous)"
        rows={3}
        maxLength={1000}
        autoFocus={autoFocus}
      />
      <div className="feedback-form__footer">
        {phase === 'error'
          ? <span className="feedback-form__hint feedback-form__hint--error">{errMsg}</span>
          : <span className="feedback-form__hint">⌘↵ or Ctrl↵ to send</span>
        }
        <button
          type="submit"
          disabled={!active}
          className={`feedback-form__submit${active ? ' feedback-form__submit--active' : ' feedback-form__submit--idle'}`}
        >
          {phase === 'sending' ? '…' : 'Send →'}
        </button>
      </div>
    </form>
  );
}

// ── Shake / floating modal ─────────────────────────────────────────
export function FeedbackModal({ onClose }) {
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="feedback-modal" onClick={onClose}>
      <div className="feedback-modal__panel" onClick={e => e.stopPropagation()}>
        <div className="feedback-modal__header">
          <div>
            <div className="feedback-modal__label">feedback</div>
            <h2 className="feedback-modal__title">Leave a thought</h2>
          </div>
          <button onClick={onClose} className="feedback-modal__close">×</button>
        </div>

        <FeedbackForm onDone={onClose} autoFocus />

        <p className="feedback-modal__footer">
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
