// ── Upgrade to Pro modal ──────────────────────────────────────────
// Props: { onClose, onSuccess }

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

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
  const { t }        = useTheme();
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

      if (res.status === 409) {
        setError('You already have a pending or approved request.');
        setLoading(false);
        return;
      }
      if (res.status === 400) {
        setError(`You already have ${tier} access.`);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Something went wrong');
      }

      const data = await res.json().catch(() => ({}));
      // Update auth context so the "under review" badge shows immediately
      setUser(u => u ? { ...u, upgradeRequest: { status: 'pending', id: data.id, created_at: Date.now() } } : u);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [note, onSuccess]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', zIndex: 2001,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(480px, calc(100vw - 40px))',
        background: t.surface,
        border: `1px solid ${t.border}`,
        borderRadius: 16,
        padding: '32px 28px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.text3, fontSize: 20, lineHeight: 1,
            padding: '2px 6px',
          }}
        >
          ×
        </button>

        {success ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✓</div>
            <div style={{ fontFamily: F, fontSize: 16, fontWeight: 600, color: t.text1, marginBottom: 10 }}>
              Request submitted
            </div>
            <div style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6 }}>
              The admin will review it shortly.
            </div>
            <button
              onClick={onClose}
              style={{
                marginTop: 24,
                fontFamily: M, fontSize: 12, letterSpacing: '0.06em',
                padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent,
              }}
            >
              done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.2em', color: t.accentMuted, marginBottom: 8, textTransform: 'uppercase' }}>
                {tier} access
              </div>
              <h2 style={{ fontFamily: F, fontSize: 20, fontWeight: 700, color: t.text1, margin: '0 0 8px' }}>
                {config.label}
              </h2>
              <p style={{ fontFamily: F, fontSize: 14, color: t.text2, margin: 0, lineHeight: 1.6 }}>
                {config.subtitle}
              </p>
            </div>

            {/* Benefits */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {config.benefits.map(b => (
                <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: t.accent, fontFamily: M, fontSize: 14 }}>✓</span>
                  <span style={{ fontFamily: F, fontSize: 14, color: t.text2 }}>{b}</span>
                </li>
              ))}
            </ul>

            {/* Note textarea */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.08em', color: t.text3, display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                Why do you want pro access? (optional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder="Tell us a bit about your use case…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  resize: 'vertical', minHeight: 80,
                  fontFamily: F, fontSize: 13, color: t.text1,
                  background: t.surfaceAlt, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: '10px 12px', outline: 'none',
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                fontFamily: M, fontSize: 11, color: '#ff3b30',
                padding: '8px 12px', borderRadius: 6, marginBottom: 16,
                background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)',
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={submit}
              disabled={loading}
              style={{
                width: '100%', padding: '12px', borderRadius: 10,
                fontFamily: F, fontSize: 15, fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                background: loading ? 'transparent' : t.accentDim,
                border: `1px solid ${loading ? t.border : t.accentBorder}`,
                color: loading ? t.text3 : t.accent,
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Submitting…' : config.label}
            </button>
          </>
        )}
      </div>
    </>
  );
}
