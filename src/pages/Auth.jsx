import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  startRegistration,
  startAuthentication,
} from '@simplewebauthn/browser';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ── Step indicators ───────────────────────────────────────────────
const REGISTER_STEPS = ['Email', 'Verify', 'Passkey'];
const SIGNIN_STEPS   = ['Email', 'Passkey'];

function Steps({ steps, current }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: M, fontSize: 11,
              background: i < current ? t.accent : i === current ? t.accentDim : t.cardBg,
              color: i < current ? t.bg : i === current ? t.accent : t.text3,
              border: `1px solid ${i <= current ? t.accentBorder : t.border}`,
              transition: 'all 0.3s',
            }}>
              {i < current ? '✓' : i + 1}
            </div>
            <span style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: i === current ? t.accent : t.text3 }}>
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

// ── Shared input ──────────────────────────────────────────────────
function Input({ label, ...props }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.text3, marginBottom: 7 }}>
        {label}
      </label>
      <input
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '11px 14px', borderRadius: 10,
          fontFamily: F, fontSize: 15, color: t.text1,
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

// ── Primary button ────────────────────────────────────────────────
function PrimaryBtn({ children, loading, disabled, ...props }) {
  const { t } = useTheme();
  return (
    <button
      disabled={disabled || loading}
      style={{
        width: '100%', padding: '12px', borderRadius: 11,
        fontFamily: F, fontSize: 15, fontWeight: 500, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
        opacity: disabled || loading ? 0.6 : 1, transition: 'opacity 0.2s',
      }}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

// ── Error / info message ──────────────────────────────────────────
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

// ── Register flow ─────────────────────────────────────────────────
function RegisterFlow({ onSuccess }) {
  const [step, setStep] = useState(0);   // 0=email, 1=otp, 2=passkey
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msgType, setMsgType] = useState('error');

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
      // Step 1: get registration options from server
      const optRes = await fetch('/api/auth/passkey/register/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const { options, userId: uid, error } = await optRes.json();
      if (!optRes.ok) return setError(error || 'Failed to start registration');
      setUserId(uid);

      // Step 2: prompt the browser/device for biometric/PIN
      const registrationResponse = await startRegistration({ optionsJSON: options });

      // Step 3: send the signed credential to server for verification
      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, userId: uid, registrationResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) return setError(verData.error || 'Registration failed');

      onSuccess();
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

  return (
    <div>
      <Steps steps={REGISTER_STEPS} current={step} />

      {step === 0 && (
        <form onSubmit={handleSendOTP}>
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          <PrimaryBtn loading={busy} type="submit">Send verification code →</PrimaryBtn>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={handleVerifyOTP}>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', marginBottom: 20, lineHeight: 1.6 }}>
            Enter the 6-digit code sent to <strong style={{ color: '#e5e5e5' }}>{email}</strong>
          </p>
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
function SignInFlow({ onSuccess }) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/passkey/auth/options', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const { options, userId: uid } = await res.json();
      if (!res.ok) return setError('Something went wrong. Please try again.');

      setUserId(uid);
      setStep(1);

      // Immediately trigger passkey prompt after email step
      await promptPasskey(uid, options);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function promptPasskey(uid, options) {
    setBusy(true); setError(null);
    try {
      const authResponse = await startAuthentication({ optionsJSON: options });

      const res = await fetch('/api/auth/passkey/auth/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: uid, authResponse }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Authentication failed');

      onSuccess();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was dismissed. Please try again.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Steps steps={SIGNIN_STEPS} current={step} />

      {step === 0 && (
        <form onSubmit={handleEmailSubmit}>
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" />
          <PrimaryBtn loading={busy} type="submit">Continue →</PrimaryBtn>
        </form>
      )}

      {step === 1 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔑</div>
          <p style={{ fontFamily: F, fontSize: 14, color: '#9ca3af', lineHeight: 1.6, marginBottom: 20 }}>
            Use your passkey for <strong style={{ color: '#e5e5e5' }}>{email}</strong>
          </p>
          <PrimaryBtn loading={busy} onClick={() => promptPasskey(userId, null)}>
            Try passkey again
          </PrimaryBtn>
          <button type="button" onClick={() => { setStep(0); setError(null); }}
            style={{ width: '100%', marginTop: 10, padding: '10px', background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: '#6b7280', cursor: 'pointer' }}>
            ← Different email
          </button>
        </div>
      )}

      {error && <Message text={error} type="error" />}
    </div>
  );
}

// ── Auth page ─────────────────────────────────────────────────────
export default function Auth() {
  const { t } = useTheme();
  const { user, setUser, loading, enabled } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('signin'); // 'signin' | 'register'

  // If auth is disabled or already signed in, redirect home
  useEffect(() => {
    if (!enabled) { navigate('/'); return; }
    if (!loading && user) navigate('/');
  }, [user, loading, enabled]);

  function onSuccess() {
    // Refresh user state from /me, then go home
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(({ user }) => { setUser(user || null); navigate('/'); });
  }

  if (loading || user) return null;

  const tabs = [
    { id: 'signin',   label: 'Sign in' },
    { id: 'register', label: 'Register' },
  ];

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 40px' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>
            varunr.dev
          </div>
          <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 28, color: t.text1, marginBottom: 8 }}>
            {tab === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p style={{ fontFamily: F, fontSize: 14, color: t.text2 }}>
            Passwordless. Secured by your device.
          </p>
        </div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', background: t.cardBg, borderRadius: 11, padding: 4, marginBottom: 32, border: `1px solid ${t.border}` }}>
          {tabs.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '9px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: F, fontSize: 14, fontWeight: 500,
              background: tab === id ? t.accentDim : 'transparent',
              color: tab === id ? t.accent : t.text2,
              transition: 'all 0.2s',
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Card */}
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 16, padding: '28px 28px 24px' }}>
          {tab === 'signin'
            ? <SignInFlow key="signin" onSuccess={onSuccess} />
            : <RegisterFlow key="register" onSuccess={onSuccess} />
          }
        </div>

        <p style={{ textAlign: 'center', fontFamily: M, fontSize: 10, color: t.text3, marginTop: 24, letterSpacing: '0.1em' }}>
          No passwords. Your device is your key.
        </p>
      </div>
    </main>
  );
}
