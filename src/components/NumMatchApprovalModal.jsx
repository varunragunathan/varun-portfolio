import React, { useState } from 'react';
import './NumMatchApprovalModal.css';

export default function NumMatchApprovalModal({ approval, onRespond }) {
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
    <div className="num-match-modal" role="dialog" aria-modal="true" aria-label="Sign-in approval">
      <div className="num-match-modal__panel">
        {/* Header */}
        <div className="num-match-modal__type-label">New sign-in attempt</div>
        <h2 className="num-match-modal__title">Approve this sign-in?</h2>
        <p className="num-match-modal__description" style={{ marginBottom: approval.deviceNames?.length ? 16 : 28 }}>
          A <strong style={{ color: 'var(--text-1)', fontWeight: 400 }}>{deviceLabel(approval.userAgent)}</strong> is trying to sign in. Confirm the number below matches what you see on that device.
        </p>

        {approval.deviceNames?.length > 0 && (
          <div className="num-match-modal__devices">
            <div className="num-match-modal__devices-label">check one of your trusted devices</div>
            <div className="num-match-modal__device-tags">
              {approval.deviceNames.map(name => (
                <span key={name} className="num-match-modal__device-tag">{name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Number */}
        <div className="num-match-modal__code-display">
          <div className="num-match-modal__code">{approval.code}</div>
        </div>

        {/* Actions */}
        <div className="num-match-modal__actions">
          <button
            className="num-match-modal__deny"
            onClick={() => handle('deny')}
            disabled={busy}
          >
            Deny
          </button>
          <button
            className="num-match-modal__approve"
            onClick={() => handle('approve')}
            disabled={busy}
          >
            {busy ? 'Please wait…' : 'Approve'}
          </button>
        </div>

        <p className="num-match-modal__hint">
          If the number doesn't match or you didn't initiate this, tap Deny immediately.
        </p>
      </div>
    </div>
  );
}
