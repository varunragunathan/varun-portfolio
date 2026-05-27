import React, { useState, useEffect } from 'react';
import './NumMatchApprovalModal.css';

const TIMEOUT_SECS = 120;

function fmtCountdown(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function deviceLabel(ua = '') {
  if (/iPhone/.test(ua))    return 'iPhone';
  if (/iPad/.test(ua))      return 'iPad';
  if (/Android/.test(ua))   return 'Android device';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua))   return 'Windows PC';
  if (/Linux/.test(ua))     return 'Linux device';
  return 'unknown device';
}

export default function NumMatchApprovalModal({ approval, onRespond }) {
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(
    () => Math.max(0, Math.round((approval.expiresAt - Date.now()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((approval.expiresAt - Date.now()) / 1000)));
    };
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [approval.expiresAt]);

  async function handle(action) {
    setBusy(true);
    await onRespond(approval.approvalToken, action);
    setBusy(false);
  }

  const pct      = (secondsLeft / TIMEOUT_SECS) * 100;
  const urgent   = secondsLeft <= 30 && secondsLeft > 10;
  const critical = secondsLeft <= 10;
  const expired  = secondsLeft === 0;

  const barClass = [
    'num-match-modal__timer-bar',
    urgent   ? 'num-match-modal__timer-bar--warn'     : '',
    critical ? 'num-match-modal__timer-bar--critical' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="num-match-modal" role="dialog" aria-modal="true" aria-label="Sign-in approval">
      <div className="num-match-modal__panel">

        {/* Progress bar */}
        <div className="num-match-modal__timer-track">
          <div className={barClass} style={{ width: `${pct}%` }} />
        </div>

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

        {/* Code + countdown ring */}
        <div className="num-match-modal__code-display">
          <div className="num-match-modal__code">{approval.code}</div>
          <div className={[
            'num-match-modal__countdown',
            urgent   ? 'num-match-modal__countdown--warn'     : '',
            critical ? 'num-match-modal__countdown--critical' : '',
            expired  ? 'num-match-modal__countdown--expired'  : '',
          ].filter(Boolean).join(' ')}>
            {expired ? 'Expired' : fmtCountdown(secondsLeft)}
          </div>
        </div>

        {/* Actions */}
        <div className="num-match-modal__actions">
          <button
            className="num-match-modal__deny"
            onClick={() => handle('deny')}
            disabled={busy || expired}
          >
            Deny
          </button>
          <button
            className="num-match-modal__approve"
            onClick={() => handle('approve')}
            disabled={busy || expired}
          >
            {busy ? 'Please wait…' : expired ? 'Expired' : 'Approve'}
          </button>
        </div>

        <p className="num-match-modal__hint">
          If the number doesn't match or you didn't initiate this, tap Deny immediately.
        </p>
      </div>
    </div>
  );
}
