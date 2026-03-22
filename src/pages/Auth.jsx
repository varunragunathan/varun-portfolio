import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';
import { useResponsive } from '../hooks/useResponsive';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ── Step indicators ───────────────────────────────────────────────
const REGISTER_STEPS = ['Email', 'Verify', 'Passkey'];
const SIGNIN_STEPS   = ['Email', 'Passkey'];
const RECOVER_STEPS  = ['Email', 'Code', 'OTP', 'Passkey'];

function Steps({ steps, current }) {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: isMobile ? 32 : 28, height: isMobile ? 32 : 28,
              borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: M, fontSize: isMobile ? 13 : 11,
              background: i < current ? t.accent : i === current ? t.accentDim : t.cardBg,
              color: i < current ? t.bg : i === current ? t.accent : t.text3,
              border: `1px solid ${i <= current ? t.accentBorder : t.border}`,
              transition: 'all 0.3s',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{ fontFamily: M, fontSize: isMobile ? 11 : 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: i === current ? t.accent : t.text3 }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < current ? t.accent : t.border, margin: '0 8px', marginBottom: 22, transition: 'background 0.3s' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Input({ label, ...props }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: M, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.text3, marginBottom: 7 }}>
        {label}
      </label>
      <input
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '13px 14px', borderRadius: 10,
          fontFamily: F, fontSize: 16, color: t.text1,
          background: t.cardBg, border: `1px solid ${t.border}`,
          outline: 'none', transition: 'border-color 0.2s',
        }}
        onFocus={e => (e.target.style.borderColor = '#6366f1')}
        onBlur={e => (e.target.style.borderColor = '')}
        {...props}
      />
    </div>
  );
}

function PrimaryBtn({ children, loading, disabled, ...props }) {
  const { t } = useTheme();
  return (
    <button
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '14px 12px', borderRadius: 11,
        fontFamily: F, fontSize: 16, fontWeight: 500, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
        opacity: disabled || loading ? 0.6 : 1, transition: 'opacity 0.2s',
      }}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

function Message({ text, type = 'error' }) {
  const { t } = useTheme();
  if (!text) return null;
  const isError = type === 'error';
  return (
    <div style={{
      marginTop: 14, padding: '10px 14px', borderRadius: 9,
      fontFamily: F, fontSize: 13, lineHeight: 1.5,
      color: isError ? '#f87171' : t.accentMuted,
      background: isError ? 'rgba(239,68,68,0.08)' : t.accentDim,
      border: `1px solid ${isError ? 'rgba(239,68,68,0.2)' : t.accentBorder}`,
    }}>
      {text}
    </div>
  );
}

// ── Trust device modal ────────────────────────────────────────────
function TrustDeviceModal({ onFinish }) {
  const { t } = useTheme();
  const [deviceName, setDeviceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function choose(trusted) {
    setBusy(true); setError(null);
    try {
      await onFinish({ trusted, deviceName: deviceName.trim() || undefined });
    } catch (e) {
      setError(e.message || 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
    }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 20, padding: '32px 28px', maxWidth: 400, width: '100%' }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 16 }}>
          This device
        </div>
        <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 22, color: t.text1, margin: '0 0 10px' }}>
          Trust this device?
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 24 }}>
          Trusted devices stay signed in for 30 days. Untrusted devices sign out after 24 hours. You can always revoke access from your security page.
        </p>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="trust-device-name" style={{ display: 'block', fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.text3, marginBottom: 7 }}>
            Device name (optional)
          </label>
          <input
            id="trust-device-name"
            placeholder="My MacBook, iPhone, etc."
            value={deviceName}
            onChange={e => setDeviceName(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px', borderRadius: 10,
              fontFamily: F, fontSize: 14, color: t.text1,
              background: '#1a1a1a', border: `1px solid ${t.border}`,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => choose(false)}
            disabled={busy}
            style={{
              flex: 1, padding: '11px', borderRadius: 10,
              fontFamily: F, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.border}`, opacity: busy ? 0.5 : 1,
            }}
          >
            Not now
          </button>
          <button
            onClick={() => choose(true)}
            disabled={busy}
            style={{
              flex: 1, padding: '11px', borderRadius: 10,
              fontFamily: F, fontSize: 14, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer',
              background: t.accentDim, color: t.accent,
              border: `1px solid ${t.accentBorder}`, opacity: busy ? 0.5 : 1,
            }}
          >
            {busy ? 'Signing in…' : 'Trust this device'}
          </button>
        </div>

        {error && <Message text={error} />}
      </div>
    </div>
  );
}

// ── Recovery codes modal ───────────────────────────────────────────
function RecoveryCodesModal({ codes, onDone }) {
  const { t } = useTheme();
  const [copied, setCopied] = useState(false);

  function copyAll() {
    navigator.clipboard.writeText(codes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 24,
      overflowY: 'auto',
    }}>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 20, padding: '32px 28px', maxWidth: 440, width: '100%' }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 14 }}>
          Save these now
        </div>
        <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 22, color: t.text1, margin: '0 0 10px' }}>
          Recovery codes
        </h2>
        <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 24 }}>
          These 8 codes let you recover your account if you lose your passkey. Each code can be used once. Store them somewhere safe — they won't be shown again.
        </p>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20,
          background: '#111', borderRadius: 12, padding: '16px 20px',
          border: '1px solid #2a2a2a',
        }}>
          {codes.map((code, i) => (
            <span key={i} style={{ fontFamily: M, fontSize: 13, color: '#e5e5e5', letterSpacing: '0.1em' }}>
              <span style={{ color: '#4b5563', marginRight: 8, fontSize: 10 }}>{i + 1}.</span>
              {code}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={copyAll}
            style={{
              flex: 1, padding: '11px', borderRadius: 10,
              fontFamily: F, fontSize: 14, cursor: 'pointer',
              background: 'transparent', color: copied ? '#22c55e' : t.text2,
              border: `1px solid ${copied ? '#22c55e' : t.border}`,
              transition: 'all 0.2s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy all'}
          </button>
          <button
            onClick={onDone}
            style={{
              flex: 1, padding: '11px', borderRadius: 10,
              fontFamily: F, fontSize: 14, fontWeight: 500, cursor: 'pointer',
              background: t.accentDim, color: t.accent,
              border: `1px solid ${t.accentBorder}`,
            }}
          >
            I've saved them →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Number match screen ───────────────────────────────────────────
function NumberMatchScreen({ code, tempToken, onApproved, onDenied }) {
  const { t } = useTheme();
  const [status, setStatus] = useState('pending'); // pending | approved | denied | expired

  useEffect(() => {
    let ws;
    let reconnectTimer;
    let done = false;

    function connect() {
      if (done) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/api/auth/num-match/wait?token=${tempToken}`);

      ws.addEventListener('message', event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'result') {
            done = true;
            if (msg.approved) {
              setStatus('approved');
              onApproved(msg.pendingToken);
            } else {
              setStatus('denied');
              onDenied();
            }
          }
        } catch { /* ignore */ }
      });

      ws.addEventListener('close', () => {
        if (!done) {
          // 5s grace — server may have briefly restarted
          reconnectTimer = setTimeout(connect, 5000);
        }
      });

      ws.addEventListener('error', () => ws.close());
    }

    connect();

    return () => {
      done = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onApproved/onDenied are stable props; re-connecting on callback identity change would break auth
  }, [tempToken]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 20 }}>
        New device detected
      </div>

      <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 28 }}>
        Your other signed-in devices will show an approval prompt. Make sure the number matches what you see there.
      </p>

      <div style={{
        fontSize: 72, fontWeight: 200, letterSpacing: '0.3em',
        color: '#ffffff', fontFamily: M,
        marginBottom: 28,
      }}>
        {code}
      </div>

      {status === 'pending' && (
        <p style={{ fontFamily: F, fontSize: 13, color: t.text3, lineHeight: 1.5 }}>
          Waiting for approval from a trusted device…
          <br />
          <span style={{ fontSize: 11 }}>Open varunr.dev on a trusted device to approve.</span>
        </p>
      )}
      {status === 'denied' && (
        <Message text="Sign-in was denied. If this wasn't you, your account is safe." />
      )}
      {status === 'expired' && (
        <Message text="Approval window expired. Please try signing in again." />
      )}
    </div>
  );
}

// ── Finalise session helper ───────────────────────────────────────
async function finaliseSession(pendingToken, trusted, deviceName, preTrusted = false) {
  const res = await fetch('/api/auth/sessions/finalise', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pendingToken, trusted, deviceName, preTrusted }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Session finalisation failed');
  }
  return res.json();
}

// ── Register flow ─────────────────────────────────────────────────
function RegisterFlow({ onSuccess }) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgType, setMsgType] = useState('error');

  // Post-passkey state
  const [pendingToken, setPendingToken] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [showTrust, setShowTrust] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  function setError(text) { setMsg(text); setMsgType('error'); }
  function setInfo(text)  { setMsg(text); setMsgType('info'); }

  async function handleSendOTP(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Failed to send code');
      setInfo(`Code sent to ${email}`);
      setStep(1);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Invalid code');
      setMsg(null);
      setStep(2);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeyRegister() {
    setBusy(true); setMsg(null);
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const { options, userId: uid, error } = await optRes.json();
      if (!optRes.ok) return setError(error || 'Failed to start registration');

      const registrationResponse = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId: uid, registrationResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) return setError(verData.error || 'Registration failed');

      // Store pending state and show trust modal
      setPendingToken(verData.pendingToken);
      setRecoveryCodes(verData.recoveryCodes);
      setShowTrust(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was dismissed. Please try again.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTrustChoice({ trusted, deviceName }) {
    await finaliseSession(pendingToken, trusted, deviceName);
    setShowTrust(false);
    // Show recovery codes before redirecting
    if (recoveryCodes?.length) {
      setShowRecoveryCodes(true);
    } else {
      onSuccess();
    }
  }

  if (showTrust) {
    return <TrustDeviceModal onFinish={handleTrustChoice} />;
  }
  if (showRecoveryCodes) {
    return <RecoveryCodesModal codes={recoveryCodes} onDone={onSuccess} />;
  }

  return (
    <div>
      <Steps steps={REGISTER_STEPS} current={step} />

      {step === 0 && (
        <form onSubmit={handleSendOTP}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          <PrimaryBtn loading={busy} type="submit">Send verification code →</PrimaryBtn>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={handleVerifyOTP}>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', marginBottom: 20, lineHeight: 1.6 }}>
            Enter the 6-digit code sent to <strong style={{ color: '#e5e5e5' }}>{email}</strong>
          </p>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input label="Verification code" type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} required autoFocus placeholder="000000" />
          <PrimaryBtn loading={busy} type="submit">Verify code →</PrimaryBtn>
          <button type="button" onClick={() => { setStep(0); setMsg(null); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
            ← Change email
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <p style={{ fontFamily: F, fontSize: 15, color: '#9ca3af', lineHeight: 1.6 }}>
              Your device will prompt you to register a passkey using Face ID, Touch ID, or your device PIN.
            </p>
          </div>
          <PrimaryBtn loading={busy} onClick={handlePasskeyRegister}>Register passkey →</PrimaryBtn>
        </div>
      )}

      <Message text={msg} type={msgType} />
    </div>
  );
}

// ── Sign-in flow ──────────────────────────────────────────────────
// Backup method priority (strongest → weakest):
//   1. Passkey          — always attempted first; conditional mediation arms autofill
//   2. TOTP             — future (not yet implemented)
//   3. Recovery code    — single-use backup code, sign-in without wiping passkeys
// Full account recovery (wipes passkeys) lives in the separate "Recover" tab.
function SignInFlow({ onSuccess }) {
  const { t } = useTheme();
  // view: 'email' | 'passkey' | 'recovery' | 'totp' | 'whatsapp'
  const [view, setView]               = useState('email');
  const [email, setEmail]             = useState('');
  const [userId, setUserId]           = useState('');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState(null);
  const [passkeyFailed, setPasskeyFailed]       = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);
  const [totpCode, setTotpCode]                 = useState('');
  const [hasWhatsApp, setHasWhatsApp]           = useState(false);

  // Recovery code sign-in
  const [recoveryCode, setRecoveryCode] = useState('');

  // WhatsApp sign-in
  const [waCode,        setWaCode]        = useState('');
  const [waMaskedPhone, setWaMaskedPhone] = useState(null);
  const [waSent,        setWaSent]        = useState(false);

  // Number matching state
  const [numMatchCode, setNumMatchCode] = useState(null);
  const [numMatchTemp, setNumMatchTemp] = useState(null);

  // Trust modal state
  const [pendingToken, setPendingToken] = useState(null);
  const [showTrust, setShowTrust]       = useState(false);

  // Prevents conditional mediation from completing after user starts normal flow
  const condActiveRef = useRef(true);

  // ── Conditional mediation (passkey autofill) ──────────────────────
  // Arms the browser's passkey autofill UI the moment the page loads.
  // The email input's autoComplete="username webauthn" makes passkeys appear
  // in the browser's autocomplete dropdown without the user clicking anything.
  useEffect(() => {
    condActiveRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/passkey/auth/options', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: '' }),
        });
        if (!res.ok || !condActiveRef.current) return;
        const { options, condToken } = await res.json();
        if (!condActiveRef.current) return;

        // useBrowserAutofill=true → mediation:'conditional', never shows a modal —
        // resolves only when the user picks a passkey from the autofill dropdown.
        const authResponse = await startAuthentication({ optionsJSON: options, useBrowserAutofill: true });
        if (!condActiveRef.current) return;
        condActiveRef.current = false;

        await submitAuthResponse(authResponse, null, condToken);
      } catch { /* user ignored autofill or browser doesn't support conditional UI */ }
    })();
    return () => { condActiveRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- conditional UI passkey must run once; adding submitAuthResponse would restart the autofill listener
  }, []);

  // ── Shared verify + handle result ────────────────────────────────
  async function submitAuthResponse(authResponse, resolvedUid, condToken) {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/passkey/auth/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resolvedUid ?? null, authResponse, ...(condToken && { condToken }) }),
      });
      const data = await res.json();
      if (!res.ok) { setPasskeyFailed(true); setError(data.error || 'Authentication failed'); return; }

      if (data.pendingNumberMatch) {
        setNumMatchCode(data.code);
        setNumMatchTemp(data.tempToken);
      } else if (data.preTrusted) {
        // Device already trusted — skip the modal and auto-finalise
        await finaliseSession(data.pendingToken, true, data.trustedDeviceName, true);
        onSuccess();
      } else {
        setPendingToken(data.pendingToken);
        setShowTrust(true);
      }
    } catch {
      setPasskeyFailed(true);
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  // Detect passkey support on mount
  useEffect(() => {
    if (typeof PublicKeyCredential === 'undefined' ||
        !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      setPasskeySupported(false);
      return;
    }
    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(ok => setPasskeySupported(ok))
      .catch(() => setPasskeySupported(false));
  }, []);

  async function handleTotpSignin(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res  = await fetch('/api/auth/totp/signin', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code'); return; }
      setPendingToken(data.pendingToken);
      setShowTrust(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function goToEmail() { setView('email'); setError(null); setPasskeyFailed(false); }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    condActiveRef.current = false; // cancel conditional mediation
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/passkey/auth/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return setError('Something went wrong. Please try again.');
      setUserId(data.userId);
      setHasWhatsApp(!!data.hasWhatsApp);
      setView('passkey');
      setPasskeyFailed(false);
      await promptPasskey(data.userId, data.options);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function promptPasskey(uid, existingOptions) {
    setBusy(true); setError(null); setPasskeyFailed(false);
    try {
      let opts = existingOptions;
      let resolvedUid = uid;

      // Re-fetch fresh challenge on retry (old challenge already consumed)
      if (!opts) {
        const res = await fetch('/api/auth/passkey/auth/options', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to get options'); setPasskeyFailed(true); setBusy(false); return; }
        opts = data.options;
        resolvedUid = data.userId;
        setUserId(resolvedUid);
      }

      const authResponse = await startAuthentication({ optionsJSON: opts });
      await submitAuthResponse(authResponse, resolvedUid, null);
    } catch (err) {
      setPasskeyFailed(true);
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt dismissed.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
      setBusy(false);
    }
  }

  async function handleRecoverySignIn(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/recovery/signin', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, recoveryCode }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Invalid recovery code');
      setPendingToken(data.pendingToken);
      setShowTrust(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendWhatsApp() {
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/whatsapp/signin/send', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to send'); setBusy(false); return; }
      setWaMaskedPhone(data.maskedPhone);
      setWaSent(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyWhatsApp(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/whatsapp/signin/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: waCode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code'); return; }
      setPendingToken(data.pendingToken);
      setShowTrust(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTrustChoice({ trusted, deviceName }) {
    await finaliseSession(pendingToken, trusted, deviceName);
    onSuccess();
  }

  if (showTrust) return <TrustDeviceModal onFinish={handleTrustChoice} />;

  if (numMatchCode) {
    return (
      <NumberMatchScreen
        code={numMatchCode}
        tempToken={numMatchTemp}
        onApproved={(pt) => { setNumMatchCode(null); setNumMatchTemp(null); setPendingToken(pt); setShowTrust(true); }}
        onDenied={() => { setNumMatchCode(null); setNumMatchTemp(null); setView('passkey'); setPasskeyFailed(true); setError('Sign-in was denied from your trusted device.'); }}
      />
    );
  }

  const stepIndex = view === 'email' ? 0 : 1;

  return (
    <div>
      <Steps steps={SIGNIN_STEPS} current={stepIndex} />

      {view === 'email' && (
        <form onSubmit={handleEmailSubmit}>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" autoComplete="username webauthn" />
          <PrimaryBtn loading={busy} type="submit">Continue →</PrimaryBtn>
          {error && <Message text={error} type="error" />}
        </form>
      )}

      {view === 'passkey' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔑</div>
            <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6 }}>
              Use your passkey for <strong style={{ color: t.text1 }}>{email}</strong>
            </p>
          </div>

          <PrimaryBtn loading={busy} onClick={() => promptPasskey(userId, null)}>
            {passkeyFailed ? 'Try passkey again' : 'Use passkey'}
          </PrimaryBtn>

          {error && <Message text={error} type="error" />}

          {/* Backup methods — shown after first passkey failure or if passkeys unsupported */}
          {(passkeyFailed || !passkeySupported) && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: t.border }} />
                <span style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3, whiteSpace: 'nowrap' }}>
                  TRY ANOTHER WAY
                </span>
                <div style={{ flex: 1, height: 1, background: t.border }} />
              </div>

              {/* Recovery code — available now */}
              <button
                onClick={() => { setView('recovery'); setError(null); setRecoveryCode(''); }}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 10,
                  background: 'none', border: `1px solid ${t.border}`,
                  fontFamily: F, fontSize: 13, color: t.text2, cursor: 'pointer',
                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = t.accentBorder)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
              >
                <span style={{ fontSize: 16 }}>🔒</span>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>Use a recovery code</div>
                  <div style={{ fontSize: 11, color: t.text3 }}>Single-use backup code from your saved list</div>
                </div>
              </button>

              {/* TOTP */}
              <button
                onClick={() => { setView('totp'); setError(null); setTotpCode(''); }}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 10, marginTop: 8,
                  background: 'none', border: `1px solid ${t.border}`,
                  fontFamily: F, fontSize: 13, color: t.text2, cursor: 'pointer',
                  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = t.accentBorder)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = t.border)}
              >
                <span style={{ fontSize: 16 }}>🔐</span>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>Use authenticator app</div>
                  <div style={{ fontSize: 11, color: t.text3 }}>6-digit code from your authenticator app</div>
                </div>
              </button>

              {/* WhatsApp — only shown if user has a registered phone */}
              {hasWhatsApp && (
                <button
                  onClick={() => { setView('whatsapp'); setError(null); setWaCode(''); setWaSent(false); handleSendWhatsApp(); }}
                  style={{
                    width: '100%', padding: '11px 14px', borderRadius: 10, marginTop: 8,
                    background: 'none', border: '1px solid rgba(37,211,102,0.3)',
                    fontFamily: F, fontSize: 13, color: t.text2, cursor: 'pointer',
                    textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,0.6)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(37,211,102,0.3)')}
                >
                  <span style={{ fontSize: 16 }}>💬</span>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 2, color: '#25d366' }}>Use WhatsApp</div>
                    <div style={{ fontSize: 11, color: t.text3 }}>OTP sent to your registered WhatsApp number</div>
                  </div>
                </button>
              )}
            </div>
          )}

          <button type="button" onClick={goToEmail}
            style={{ width: '100%', marginTop: 16, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer' }}>
            ← Different email
          </button>
        </div>
      )}

      {view === 'totp' && (
        <form onSubmit={handleTotpSignin}>
          <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 20 }}>
            Enter the 6-digit code from your authenticator app for{' '}
            <strong style={{ color: t.text1 }}>{email}</strong>.
          </p>
          {/* eslint-disable jsx-a11y/no-autofocus */}
          <Input
            label="Authenticator code"
            type="text"
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            required autoFocus
            placeholder="000000"
            inputMode="numeric"
            spellCheck={false}
          />
          {/* eslint-enable jsx-a11y/no-autofocus */}
          <PrimaryBtn loading={busy} type="submit">Sign in →</PrimaryBtn>
          {error && <Message text={error} type="error" />}
          <button type="button" onClick={() => { setView('passkey'); setError(null); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer' }}>
            ← Back to passkey
          </button>
        </form>
      )}

      {view === 'recovery' && (
        <form onSubmit={handleRecoverySignIn}>
          <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 20 }}>
            Enter a recovery code for <strong style={{ color: t.text1 }}>{email}</strong>. Each code can only be used once.
          </p>
          {/* eslint-disable jsx-a11y/no-autofocus */}
          <Input
            label="Recovery code"
            type="text"
            value={recoveryCode}
            onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
            required autoFocus
            placeholder="XXXXX-XXXXX"
            spellCheck={false}
          />
          {/* eslint-enable jsx-a11y/no-autofocus */}
          <PrimaryBtn loading={busy} type="submit">Sign in with recovery code →</PrimaryBtn>
          {error && <Message text={error} type="error" />}
          <button type="button" onClick={() => { setView('passkey'); setError(null); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer' }}>
            ← Back to passkey
          </button>
        </form>
      )}

      {view === 'whatsapp' && (
        <div>
          {!waSent ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
              <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6 }}>
                Sending a code to your WhatsApp…
              </p>
              {error && <Message text={error} type="error" />}
            </div>
          ) : (
            <form onSubmit={handleVerifyWhatsApp}>
              <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 20 }}>
                Enter the 6-digit code sent to{' '}
                <strong style={{ color: '#25d366' }}>{waMaskedPhone}</strong> via WhatsApp.
              </p>
              {/* eslint-disable jsx-a11y/no-autofocus */}
              <Input
                label="WhatsApp code"
                type="text"
                value={waCode}
                onChange={e => setWaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required autoFocus
                placeholder="000000"
                inputMode="numeric"
                spellCheck={false}
              />
              {/* eslint-enable jsx-a11y/no-autofocus */}
              <PrimaryBtn loading={busy} type="submit">Sign in →</PrimaryBtn>
              {error && <Message text={error} type="error" />}
              <button type="button" onClick={() => { setWaSent(false); handleSendWhatsApp(); }}
                style={{ width: '100%', marginTop: 8, padding: '8px', background: 'none', border: 'none', fontFamily: F, fontSize: 12, color: t.text3, cursor: 'pointer' }}>
                Resend code
              </button>
            </form>
          )}
          <button type="button" onClick={() => { setView('passkey'); setError(null); setWaSent(false); setWaCode(''); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer' }}>
            ← Back to passkey
          </button>
        </div>
      )}
    </div>
  );
}

// ── Recovery flow ─────────────────────────────────────────────────
function RecoverFlow({ onSuccess }) {
  const [step, setStep] = useState(0); // 0=email, 1=recoveryCode, 2=otp, 3=passkey
  const [email, setEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [otp, setOtp] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [otpMethod, setOtpMethod] = useState('email'); // 'email' | 'totp'
  const [hasTOTP, setHasTOTP] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgType, setMsgType] = useState('error');

  // Post-passkey
  const [pendingToken, setPendingToken] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [showTrust, setShowTrust] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);

  function setError(text) { setMsg(text); setMsgType('error'); }
  function setInfo(text)  { setMsg(text); setMsgType('info'); }

  async function handleStart(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/recovery/start', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, recoveryCode }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Recovery failed');
      if (data.hasTOTP) {
        setHasTOTP(true);
        setOtpMethod('totp'); // default to TOTP when available
        setMsg(null);
      } else {
        setInfo('If that code was valid, a verification email has been sent.');
      }
      setStep(2);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOTP(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/recovery/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Invalid code');
      setRecoveryToken(data.recoveryToken);
      setMsg(null);
      setStep(3);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyTOTP(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/auth/recovery/verify-totp', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, totpCode }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Invalid code');
      setRecoveryToken(data.recoveryToken);
      setMsg(null);
      setStep(3);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeyRegister() {
    setBusy(true); setMsg(null);
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, recoveryToken }),
      });
      const { options, userId: uid, error } = await optRes.json();
      if (!optRes.ok) return setError(error || 'Failed to start registration');

      const registrationResponse = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId: uid, registrationResponse, recoveryToken }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) return setError(verData.error || 'Registration failed');

      setPendingToken(verData.pendingToken);
      setRecoveryCodes(verData.recoveryCodes);
      setShowTrust(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was dismissed. Please try again.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTrustChoice({ trusted, deviceName }) {
    await finaliseSession(pendingToken, trusted, deviceName);
    setShowTrust(false);
    if (recoveryCodes?.length) {
      setShowRecoveryCodes(true);
    } else {
      onSuccess();
    }
  }

  if (showTrust) return <TrustDeviceModal onFinish={handleTrustChoice} />;
  if (showRecoveryCodes) return <RecoveryCodesModal codes={recoveryCodes} onDone={onSuccess} />;

  return (
    <div>
      <Steps steps={RECOVER_STEPS} current={step} />

      {step === 0 && (
        <form onSubmit={e => { e.preventDefault(); setStep(1); }}>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 20 }}>
            Enter your email address to begin account recovery.
          </p>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          <PrimaryBtn type="submit">Continue →</PrimaryBtn>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={handleStart}>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 20 }}>
            Enter one of your unused recovery codes for <strong style={{ color: '#e5e5e5' }}>{email}</strong>.
          </p>
          {/* eslint-disable jsx-a11y/no-autofocus */}
          <Input
            label="Recovery code"
            type="text"
            value={recoveryCode}
            onChange={e => setRecoveryCode(e.target.value.toUpperCase())}
            required autoFocus
            placeholder="XXXXX-XXXXX"
            spellCheck={false}
          />
          {/* eslint-enable jsx-a11y/no-autofocus */}
          <PrimaryBtn loading={busy} type="submit">Verify recovery code →</PrimaryBtn>
          <button type="button" onClick={() => { setStep(0); setMsg(null); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
            ← Change email
          </button>
        </form>
      )}

      {step === 2 && (
        <div>
          {hasTOTP && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {['totp', 'email'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setOtpMethod(m); setMsg(null); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
                    background: otpMethod === m ? 'rgba(99,102,241,0.15)' : 'transparent',
                    border: `1px solid ${otpMethod === m ? 'rgba(99,102,241,0.5)' : '#374151'}`,
                    color: otpMethod === m ? '#818cf8' : '#6b7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'totp' ? '🔐 Authenticator app' : '📧 Email code'}
                </button>
              ))}
            </div>
          )}
          {otpMethod === 'totp' ? (
            <form onSubmit={handleVerifyTOTP}>
              <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', marginBottom: 20, lineHeight: 1.6 }}>
                Enter the 6-digit code from your authenticator app.
              </p>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <Input label="Authenticator code" type="text" inputMode="numeric" value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6} required autoFocus placeholder="000000" />
              <PrimaryBtn loading={busy} type="submit">Verify code →</PrimaryBtn>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP}>
              <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', marginBottom: 20, lineHeight: 1.6 }}>
                Enter the 6-digit code sent to <strong style={{ color: '#e5e5e5' }}>{email}</strong>. This is the second factor of your recovery.
              </p>
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <Input label="Email verification code" type="text" inputMode="numeric" value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} required autoFocus placeholder="000000" />
              <PrimaryBtn loading={busy} type="submit">Verify code →</PrimaryBtn>
            </form>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <p style={{ fontFamily: F, fontSize: 15, color: '#9ca3af', lineHeight: 1.6 }}>
              Identity verified. Register a new passkey to regain access. Your old passkeys and sessions have been revoked.
            </p>
          </div>
          <PrimaryBtn loading={busy} onClick={handlePasskeyRegister}>Register new passkey →</PrimaryBtn>
        </div>
      )}

      <Message text={msg} type={msgType} />
    </div>
  );
}

// ── Auth page ─────────────────────────────────────────────────────
export default function Auth() {
  const { t } = useTheme();
  const { user, setUser, loading, enabled } = useAuth();
  const { isMobile } = useResponsive();
  const navigate = useNavigate();
  const [tab, setTab] = useState('signin');

  useEffect(() => {
    if (!enabled) { navigate('/'); return; }
    if (!loading && user) navigate('/');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate is stable (react-router guarantee)
  }, [user, loading, enabled]);

  function onSuccess() {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(({ user }) => { setUser(user ?? null); navigate('/'); });
  }

  if (loading || user) return null;

  const tabs = [
    { id: 'signin',   label: 'Sign in' },
    { id: 'register', label: 'Register' },
    { id: 'recover',  label: 'Recover' },
  ];

  const titles = {
    signin:   'Welcome back',
    register: 'Create account',
    recover:  'Recover account',
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '72px 16px 32px' : '80px 24px 40px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: M, fontSize: isMobile ? 13 : 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>
            varunr.dev
          </div>
          <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: isMobile ? 26 : 28, color: t.text1, marginBottom: 8 }}>
            {titles[tab]}
          </h1>
          <p style={{ fontFamily: F, fontSize: isMobile ? 16 : 14, color: t.text2, lineHeight: 1.6 }}>
            {tab === 'recover'
              ? 'Restore access using your recovery code.'
              : 'Unlock the full portfolio and AI assistant. No password required.'}
          </p>
        </div>

        <div style={{ display: 'flex', background: t.cardBg, borderRadius: 11, padding: 4, marginBottom: 32, border: `1px solid ${t.border}` }}>
          {tabs.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: isMobile ? '12px 9px' : '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: F, fontSize: isMobile ? 16 : 13, fontWeight: 500,
              background: tab === id ? t.accentDim : 'transparent',
              color: tab === id ? t.accent : t.text2,
              transition: 'all 0.2s',
            }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 16, padding: isMobile ? '24px 16px 20px' : '28px 28px 24px' }}>
          {tab === 'signin'   && <SignInFlow   key="signin"   onSuccess={onSuccess} />}
          {tab === 'register' && <RegisterFlow key="register" onSuccess={onSuccess} />}
          {tab === 'recover'  && <RecoverFlow  key="recover"  onSuccess={onSuccess} />}
        </div>

        <p style={{ textAlign: 'center', fontFamily: M, fontSize: isMobile ? 12 : 10, color: t.text3, marginTop: 24, letterSpacing: '0.1em' }}>
          No passwords. Your device is your key.
        </p>
      </div>
    </main>
  );
}
