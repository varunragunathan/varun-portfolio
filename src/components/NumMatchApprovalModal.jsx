import React, { useState } from 'react';
import { useTheme } from '../hooks/useTheme';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

export default function NumMatchApprovalModal({ approval, onRespond }) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);

  async function handle(action) {
    setBusy(true);
    await onRespond(approval.approvalToken, action);
    setBusy(false);
  }

  // Infer a simple device label from the user agent
  function deviceLabel(ua = '') {
    if (/iPhone/.test(ua))    return 'iPhone';
    if (/iPad/.test(ua))      return 'iPad';
    if (/Android/.test(ua))   return 'Android device';
    if (/Macintosh/.test(ua)) return 'Mac';
    if (/Windows/.test(ua))   return 'Windows PC';
    if (/Linux/.test(ua))     return 'Linux device';
    return 'unknown device';
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: t.cardBg, border: `1px solid ${t.border}`,
        borderRadius: 20, padding: '36px 32px', maxWidth: 380, width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 16 }}>
          New sign-in attempt
        </div>
        <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 22, color: t.text1, margin: '0 0 8px' }}>
          Approve this sign-in?
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 28 }}>
          A <strong style={{ color: t.text1, fontWeight: 400 }}>{deviceLabel(approval.userAgent)}</strong> is trying to sign in. Confirm the number below matches what you see on that device.
        </p>

        {/* Number */}
        <div style={{
          textAlign: 'center', marginBottom: 32,
          background: '#111', borderRadius: 14, padding: '24px 0',
          border: '1px solid #1f1f1f',
        }}>
          <div style={{ fontFamily: M, fontSize: 64, fontWeight: 200, letterSpacing: '0.3em', color: '#ffffff', lineHeight: 1 }}>
            {approval.code}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => handle('deny')}
            disabled={busy}
            style={{
              flex: 1, padding: '13px', borderRadius: 11,
              fontFamily: F, fontSize: 15, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              background: 'rgba(239,68,68,0.08)', color: '#f87171',
              border: '1px solid rgba(239,68,68,0.25)',
              opacity: busy ? 0.5 : 1, transition: 'opacity 0.2s',
            }}
          >
            Deny
          </button>
          <button
            onClick={() => handle('approve')}
            disabled={busy}
            style={{
              flex: 1, padding: '13px', borderRadius: 11,
              fontFamily: F, fontSize: 15, fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              background: 'rgba(34,197,94,0.12)', color: '#22c55e',
              border: '1px solid rgba(34,197,94,0.25)',
              opacity: busy ? 0.5 : 1, transition: 'opacity 0.2s',
            }}
          >
            {busy ? 'Please wait…' : 'Approve'}
          </button>
        </div>

        <p style={{ fontFamily: M, fontSize: 10, color: t.text3, textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
          If the number doesn't match or you didn't initiate this, tap Deny immediately.
        </p>
      </div>
    </div>
  );
}
