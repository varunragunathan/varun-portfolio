// ── Upgrade to Pro modal ──────────────────────────────────────────
// Props: { onClose, onSuccess }

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import './UpgradeModal.css';

const TIER_CONFIG = {
  pro: {
    label:    'Upgrade to Pro',
    subtitle: 'Pro users get higher rate limits and access to additional AI models.',
    benefits: [
      'Higher message rate limits',
      'Access to additional AI models',
      'Priority response processing',
    ],
  },
  student: {
    label:    'Request Student Access',
    subtitle: 'Student access unlocks mentor-mode AI, source-level code walkthroughs, and pro-tier rate limits.',
    benefits: [
      'Mentor-mode AI with source references',
      'Pro-tier rate limits (30/hr, 200/day)',
      'Deep code walkthroughs on request',
    ],
  },
};

export default function UpgradeModal({ onClose, onSuccess, tier = 'pro' }) {
  const { setUser }  = useAuth();
  const config       = TIER_CONFIG[tier] ?? TIER_CONFIG.pro;
  const [note,    setNote]    = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/upgrade-request', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note.trim(), tier }),
      });

      if (res.status === 409) { setError('You already have a pending or approved request.'); setLoading(false); return; }
      if (res.status === 400) { setError(`You already have ${tier} access.`); setLoading(false); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Something went wrong');
      }

      const data = await res.json().catch(() => ({}));
      setUser(u => u ? { ...u, upgradeRequest: { status: 'pending', id: data.id, created_at: Date.now() } } : u);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [note, onSuccess, tier, setUser]);

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="upgrade-modal__backdrop" onClick={onClose} />

      <div className="upgrade-modal__panel" role="dialog" aria-modal="true">
        <button onClick={onClose} aria-label="Close" className="upgrade-modal__close">×</button>

        {success ? (
          <div className="upgrade-modal__success">
            <div className="upgrade-modal__success-icon">✓</div>
            <div className="upgrade-modal__success-title">Request submitted</div>
            <div className="upgrade-modal__success-body">The admin will review it shortly.</div>
            <button onClick={onClose} className="upgrade-modal__success-close">done</button>
          </div>
        ) : (
          <>
            <div className="upgrade-modal__header">
              <div className="upgrade-modal__tier-label">{tier} access</div>
              <h2 className="upgrade-modal__title">{config.label}</h2>
              <p className="upgrade-modal__subtitle">{config.subtitle}</p>
            </div>

            <ul className="upgrade-modal__benefits">
              {config.benefits.map(b => (
                <li key={b} className="upgrade-modal__benefit">
                  <span className="upgrade-modal__benefit-check">✓</span>
                  <span className="upgrade-modal__benefit-text">{b}</span>
                </li>
              ))}
            </ul>

            <div className="upgrade-modal__note">
              <label htmlFor="upgrade-note" className="upgrade-modal__note-label">
                Why do you want pro access? (optional)
              </label>
              <textarea
                id="upgrade-note"
                className="upgrade-modal__note-textarea"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Tell us a bit about your use case…"
              />
            </div>

            {error && <div className="upgrade-modal__error">{error}</div>}

            <button
              onClick={submit}
              disabled={loading}
              className={`upgrade-modal__submit${loading ? ' upgrade-modal__submit--idle' : ' upgrade-modal__submit--active'}`}
            >
              {loading ? 'Submitting…' : config.label}
            </button>
          </>
        )}
      </div>
    </>
  );
}
