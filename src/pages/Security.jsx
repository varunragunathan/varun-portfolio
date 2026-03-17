import React, { useState, useEffect, useRef } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';
import { ThemeToggle } from '../components/UI';
import { useResponsive } from '../hooks/useResponsive';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

function Section({ title, subtitle, children }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: F, fontWeight: 400, fontSize: 18, color: t.text1, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ fontFamily: F, fontSize: 14, color: t.text3, margin: '4px 0 0', lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ children, last, highlight }) {
  const { t } = useTheme();
  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: last ? 'none' : `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: highlight ? 'rgba(99,102,241,0.06)' : 'transparent',
    }}>
      {children}
    </div>
  );
}

function Badge({ children, color = '#6b7280' }) {
  return (
    <span style={{
      fontFamily: M, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
      color, background: `${color}18`, border: `1px solid ${color}30`,
      padding: '2px 8px', borderRadius: 99,
    }}>
      {children}
    </span>
  );
}

function DangerBtn({ children, onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: '6px 14px', borderRadius: 8,
        fontFamily: F, fontSize: 13, cursor: disabled || loading ? 'not-allowed' : 'pointer',
        background: 'rgba(239,68,68,0.08)', color: '#f87171',
        border: '1px solid rgba(239,68,68,0.2)',
        opacity: disabled || loading ? 0.5 : 1,
        transition: 'opacity 0.2s',
        whiteSpace: 'nowrap',
      }}
    >
      {loading ? '…' : children}
    </button>
  );
}

function GhostBtn({ children, onClick }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 8,
        fontFamily: F, fontSize: 13, cursor: 'pointer',
        background: 'transparent', color: t.text2,
        border: `1px solid ${t.border}`,
      }}
    >
      {children}
    </button>
  );
}

function RevealIP({ ip }) {
  const [revealed, setRevealed] = useState(false);
  if (!ip || ip === 'unknown') return <span>unknown IP</span>;
  if (revealed) return <span>{ip}</span>;
  return (
    <button
      onClick={() => setRevealed(true)}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        fontFamily: M, fontSize: 11, color: '#6366f1', textDecoration: 'underline',
        textDecorationStyle: 'dotted',
      }}
    >
      Reveal IP
    </button>
  );
}

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatRelative(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Sessions ──────────────────────────────────────────────────────
function Sessions() {
  const { t } = useTheme();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  async function load() {
    const res = await fetch('/api/auth/sessions', { credentials: 'include' });
    if (res.ok) setSessions(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function revoke(id) {
    setRevoking(id);
    await fetch(`/api/auth/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
    setRevoking(null);
  }

  async function revokeAll() {
    setRevoking('all');
    await fetch('/api/auth/sessions', { method: 'DELETE', credentials: 'include' });
    await load();
    setRevoking(null);
  }

  if (loading) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;

  return (
    <>
      {sessions.map((s, i) => (
        <Row key={s.id} last={i === sessions.length - 1} highlight={s.isCurrent}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>{s.deviceName || 'Unknown device'}</span>
              {s.isCurrent && <Badge color="#6366f1">Current</Badge>}
              {s.trusted && <Badge color="#22c55e">Trusted</Badge>}
            </div>
            <span style={{ fontFamily: M, fontSize: 11, color: t.text3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              Active {formatRelative(s.lastActiveAt)} · <RevealIP ip={s.ip} />
            </span>
          </div>
          {!s.isCurrent && (
            <DangerBtn onClick={() => revoke(s.id)} loading={revoking === s.id}>Revoke</DangerBtn>
          )}
        </Row>
      ))}
      {sessions.length > 1 && (
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${t.border}` }}>
          <DangerBtn onClick={revokeAll} loading={revoking === 'all'}>Revoke all other sessions</DangerBtn>
        </div>
      )}
    </>
  );
}

// ── Passkeys ──────────────────────────────────────────────────────
function Passkeys() {
  const { t } = useTheme();
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  async function load() {
    const res = await fetch('/api/auth/passkeys', { credentials: 'include' });
    if (res.ok) setPasskeys(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function revoke(id) {
    setRevoking(id);
    const res = await fetch(`/api/auth/passkeys/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Cannot delete passkey');
    }
    await load();
    setRevoking(null);
  }

  if (loading) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;
  if (!passkeys.length) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>No passkeys registered.</span></Row>;

  return (
    <>
      {passkeys.map((p, i) => (
        <Row key={p.id} last={i === passkeys.length - 1}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>{p.nickname || 'Passkey'}</span>
              {p.isSynced
                ? <Badge color="#6366f1">Synced</Badge>
                : <Badge color="#f59e0b">Device-bound</Badge>
              }
            </div>
            <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
              Added {formatDate(p.createdAt)}
              {p.lastUsedAt ? ` · Last used ${formatRelative(p.lastUsedAt)}` : ''}
            </span>
          </div>
          <DangerBtn onClick={() => revoke(p.id)} loading={revoking === p.id} disabled={passkeys.length <= 1}>
            Remove
          </DangerBtn>
        </Row>
      ))}
    </>
  );
}

// ── Recovery codes ────────────────────────────────────────────────
function RecoveryCodes() {
  const { t } = useTheme();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regen, setRegen] = useState(false);
  const [newCodes, setNewCodes] = useState(null);

  async function load() {
    const res = await fetch('/api/auth/recovery-codes/status', { credentials: 'include' });
    if (res.ok) setCodes(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function regenerate() {
    if (!confirm('Regenerating recovery codes will invalidate all existing codes. Continue?')) return;
    setRegen(true);
    const res = await fetch('/api/auth/recovery-codes/regenerate', { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (res.ok) {
      setNewCodes(data.recoveryCodes);
      await load();
    }
    setRegen(false);
  }

  const active = codes.filter(c => !c.used).length;
  const used = codes.filter(c => c.used).length;

  if (loading) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;

  return (
    <>
      <Row>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>Recovery codes</span>
            <Badge color={active > 3 ? '#22c55e' : active > 0 ? '#f59e0b' : '#ef4444'}>
              {active} of {codes.length} remaining
            </Badge>
          </div>
          <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
            {used} used · each code can only be used once
          </span>
        </div>
        <GhostBtn onClick={regenerate} loading={regen}>Regenerate</GhostBtn>
      </Row>

      {newCodes && (
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${t.border}` }}>
          <p style={{ fontFamily: F, fontSize: 13, color: '#f59e0b', marginBottom: 12 }}>
            Save these new codes — they won't be shown again.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#111', borderRadius: 10, padding: '14px 18px' }}>
            {newCodes.map((code, i) => (
              <span key={i} style={{ fontFamily: M, fontSize: 12, color: '#e5e5e5', letterSpacing: '0.08em' }}>
                <span style={{ color: '#4b5563', marginRight: 6, fontSize: 10 }}>{i + 1}.</span>
                {code}
              </span>
            ))}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(newCodes.join('\n'))}
            style={{ marginTop: 10, background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer', padding: 0 }}
          >
            Copy all
          </button>
        </div>
      )}
    </>
  );
}

// ── TOTP ──────────────────────────────────────────────────────────
function TotpSection() {
  const { t } = useTheme();
  // 'idle' | 'setup' | 'confirm' | 'disabling'
  const [stage,    setStage]    = useState('idle');
  const [enabled,  setEnabled]  = useState(null); // null = loading
  const [uri,      setUri]      = useState('');
  const [secret,   setSecret]   = useState('');
  const [code,     setCode]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    fetch('/api/auth/totp/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => setEnabled(!!(d?.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function startSetup() {
    setBusy(true); setError(null);
    try {
      const res  = await fetch('/api/auth/totp/setup', { method: 'POST', credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Setup failed');
      setUri(data.uri);
      setSecret(data.secret);
      setStage('setup');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function confirmCode(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res  = await fetch('/api/auth/totp/enable', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setEnabled(true);
      setStage('idle');
      setCode('');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setError(null); setBusy(true);
    try {
      // Step-up
      const optRes = await fetch('/api/auth/step-up/options', { method: 'POST', credentials: 'include' });
      const { options, error: optErr } = await optRes.json();
      if (!optRes.ok) throw new Error(optErr || 'Step-up failed');

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verRes  = await fetch('/api/auth/step-up/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) throw new Error(verData.error || 'Verification failed');

      const disRes  = await fetch('/api/auth/totp/disable', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: verData.stepUpToken }),
      });
      const disData = await disRes.json();
      if (!disRes.ok) throw new Error(disData.error || 'Failed to disable');
      setEnabled(false);
    } catch (e) {
      if (e.name !== 'NotAllowedError') setError(e.message);
    }
    finally { setBusy(false); }
  }

  if (enabled === null) {
    return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;
  }

  if (stage === 'setup') {
    return (
      <>
        <Row>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F, fontSize: 14, color: t.text1, marginBottom: 6 }}>
              Scan with your authenticator app
            </div>
            <div style={{ fontFamily: M, fontSize: 11, color: t.text3, marginBottom: 16 }}>
              Google Authenticator, Authy, 1Password, etc.
            </div>
            <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 10 }}>
              <QRCodeSVG value={uri} size={160} />
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>Manual entry: </span>
              <span style={{ fontFamily: M, fontSize: 11, color: t.text2, letterSpacing: '0.1em' }}>{secret}</span>
            </div>
          </div>
        </Row>
        <Row last>
          <form onSubmit={confirmCode} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <div style={{ fontFamily: F, fontSize: 13, color: t.text2 }}>
              Enter the 6-digit code from your app to confirm:
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                inputMode="numeric"
                style={{
                  width: 120, padding: '9px 14px', borderRadius: 8,
                  fontFamily: M, fontSize: 18, letterSpacing: '0.2em',
                  color: t.text1, background: t.surfaceAlt, border: `1px solid ${t.border}`,
                  outline: 'none', textAlign: 'center',
                }}
              />
              <button
                type="submit"
                disabled={code.length < 6 || busy}
                style={{
                  padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: F, fontSize: 13, fontWeight: 500,
                  background: code.length === 6 && !busy ? t.accentDim : 'transparent',
                  border: `1px solid ${code.length === 6 && !busy ? t.accentBorder : t.border}`,
                  color: code.length === 6 && !busy ? t.accent : t.text3,
                  transition: 'all 0.15s',
                }}
              >
                {busy ? 'Verifying…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => { setStage('idle'); setError(null); setCode(''); }}
                style={{ background: 'none', border: 'none', fontFamily: F, fontSize: 13, color: t.text3, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
            {error && <span style={{ fontFamily: M, fontSize: 11, color: '#ef4444' }}>{error}</span>}
          </form>
        </Row>
      </>
    );
  }

  return (
    <Row last>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>Authenticator app (TOTP)</span>
          <Badge color={enabled ? '#22c55e' : '#6b7280'}>{enabled ? 'Enabled' : 'Not set up'}</Badge>
        </div>
        <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
          {enabled
            ? 'Use your authenticator app as a backup sign-in method'
            : 'Add an authenticator app as a backup if your passkey is unavailable'}
        </span>
        {error && <div style={{ fontFamily: M, fontSize: 11, color: '#ef4444', marginTop: 6 }}>{error}</div>}
      </div>
      {enabled
        ? <DangerBtn onClick={disable} loading={busy}>Remove</DangerBtn>
        : <GhostBtn onClick={startSetup} loading={busy}>Set up</GhostBtn>
      }
    </Row>
  );
}

// ── Trusted devices ───────────────────────────────────────────────
function TrustedDevices() {
  const { t } = useTheme();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  async function load() {
    const res = await fetch('/api/auth/trusted-devices', { credentials: 'include' });
    if (res.ok) setDevices(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function revoke(id) {
    setRevoking(id);
    await fetch(`/api/auth/trusted-devices/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
    setRevoking(null);
  }

  if (loading) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;
  if (!devices.length) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>No trusted devices.</span></Row>;

  return (
    <>
      {devices.map((d, i) => (
        <Row key={d.id} last={i === devices.length - 1}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>{d.deviceName || 'Unknown device'}</span>
              <Badge color="#22c55e">Trusted</Badge>
            </div>
            <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
              Last used {formatRelative(d.lastUsedAt)} · Added {formatDate(d.createdAt)}
            </span>
          </div>
          <DangerBtn onClick={() => revoke(d.id)} loading={revoking === d.id}>Remove trust</DangerBtn>
        </Row>
      ))}
    </>
  );
}

// ── Security events ───────────────────────────────────────────────
const METHOD_LABELS = {
  'passkey':              'Passkey',
  'passkey+number_match': 'Passkey · Number match',
  'totp':                 'Authenticator app',
  'whatsapp':             'WhatsApp',
  'recovery_code':        'Recovery code',
};

const METHOD_COLORS = {
  'passkey':              '#6366f1',
  'passkey+number_match': '#f59e0b',
  'totp':                 '#818cf8',
  'whatsapp':             '#25d366',
  'recovery_code':        '#f87171',
};

const EVENT_LABELS = {
  login:                    'Signed in',
  logout:                   'Signed out',
  passkey_added:            'Passkey registered',
  passkey_removed:          'Passkey removed',
  new_device:               'New device sign-in',
  session_revoked:          'Session revoked',
  sessions_revoked_all:     'All other sessions revoked',
  recovery_code_used:       'Recovery code used',
  recovery_code_failed:     'Recovery code failed',
  account_recovery:         'Account recovered',
  account_frozen:           'Account frozen',
  recovery_codes_regenerated: 'Recovery codes regenerated',
  totp_enabled:  'Authenticator app enabled',
  totp_disabled: 'Authenticator app removed',
  totp_signin:   'Signed in with authenticator app',
  whatsapp_phone_added:   'WhatsApp backup added',
  whatsapp_phone_removed: 'WhatsApp backup removed',
  whatsapp_signin:        'Signed in via WhatsApp',
};

const EVENT_COLORS = {
  login: '#22c55e',
  passkey_added: '#6366f1',
  new_device: '#f59e0b',
  recovery_code_failed: '#ef4444',
  account_frozen: '#ef4444',
  account_recovery: '#f59e0b',
  whatsapp_phone_added: '#25d366',
  whatsapp_signin: '#25d366',
};

function SecurityEvents() {
  const { t } = useTheme();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/security-events?limit=20', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setEvents(data); setLoading(false); });
  }, []);

  if (loading) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;
  if (!events.length) return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>No events yet.</span></Row>;

  return (
    <>
      {events.map((ev, i) => {
        const meta = ev.metadata ? (typeof ev.metadata === 'string' ? JSON.parse(ev.metadata) : ev.metadata) : null;
        const method = ev.type === 'login' && meta?.method;
        return (
          <Row key={ev.id} last={i === events.length - 1}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: F, fontSize: 14, color: EVENT_COLORS[ev.type] || t.text1 }}>
                  {EVENT_LABELS[ev.type] || ev.type}
                </span>
                {method && (
                  <span style={{
                    fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                    padding: '2px 8px', borderRadius: 20,
                    background: `${METHOD_COLORS[method] ?? '#6366f1'}18`,
                    border: `1px solid ${METHOD_COLORS[method] ?? '#6366f1'}40`,
                    color: METHOD_COLORS[method] ?? '#818cf8',
                  }}>
                    {METHOD_LABELS[method] ?? method}
                  </span>
                )}
              </div>
              <span style={{ fontFamily: M, fontSize: 11, color: t.text3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {formatDate(ev.created_at)}
                {ev.ip && ev.ip !== 'unknown' && <><span>·</span><RevealIP ip={ev.ip} /></>}
              </span>
            </div>
          </Row>
        );
      })}
    </>
  );
}

// ── WhatsApp backup ───────────────────────────────────────────────
const WA_GREEN = '#25d366';

function WhatsAppSection() {
  const { t } = useTheme();
  // 'loading' | 'none' | 'adding' | 'confirming' | 'verified'
  const [stage,       setStage]       = useState('loading');
  const [maskedPhone, setMaskedPhone] = useState(null);
  const [phoneInput,  setPhoneInput]  = useState('');
  const [code,        setCode]        = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState(null);
  const [info,        setInfo]        = useState(null);

  useEffect(() => {
    fetch('/api/auth/whatsapp/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.verified) { setMaskedPhone(data.phoneNumber); setStage('verified'); }
        else setStage('none');
      })
      .catch(() => setStage('none'));
  }, []);

  async function handleSendOTP(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/auth/whatsapp/send-otp', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phoneInput }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Failed to send');
    setMaskedPhone(data.maskedPhone);
    setInfo(`Code sent to ${data.maskedPhone} via WhatsApp`);
    setStage('confirming');
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/auth/whatsapp/confirm', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Verification failed');
    setMaskedPhone(data.maskedPhone);
    setInfo(null);
    setStage('verified');
  }

  async function handleRemove() {
    setBusy(true); setError(null);
    const res = await fetch('/api/auth/whatsapp/phone', { method: 'DELETE', credentials: 'include' });
    setBusy(false);
    if (!res.ok) return setError('Failed to remove');
    setMaskedPhone(null);
    setPhoneInput(''); setCode('');
    setStage('none');
  }

  if (stage === 'loading') {
    return <Row last><span style={{ fontFamily: F, fontSize: 14, color: t.text3 }}>Loading…</span></Row>;
  }

  if (stage === 'verified') {
    return (
      <Row last>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>📱</span>
            <span style={{ fontFamily: F, fontSize: 14, color: t.text1 }}>{maskedPhone}</span>
            <Badge color={WA_GREEN}>Verified</Badge>
          </div>
          <div style={{ fontFamily: F, fontSize: 13, color: t.text3 }}>
            You can use WhatsApp OTP as a sign-in backup when your passkey is unavailable.
          </div>
          {error && <div style={{ fontFamily: F, fontSize: 13, color: '#f87171', marginTop: 8 }}>{error}</div>}
        </div>
        <DangerBtn onClick={handleRemove} loading={busy}>Remove</DangerBtn>
      </Row>
    );
  }

  if (stage === 'none') {
    return (
      <Row last>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F, fontSize: 14, color: t.text1, marginBottom: 4 }}>
            WhatsApp backup
          </div>
          <div style={{ fontFamily: F, fontSize: 13, color: t.text3, marginBottom: 14 }}>
            Add a phone number to receive OTPs via WhatsApp when your passkey fails.
          </div>
          <form onSubmit={handleSendOTP} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="tel"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value)}
              placeholder="+1 415 555 0100"
              required
              style={{
                flex: 1, minWidth: 160,
                padding: '9px 14px', borderRadius: 9,
                fontFamily: M, fontSize: 13, color: t.text1,
                background: t.surfaceAlt, border: `1px solid ${t.border}`,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={busy || !phoneInput.trim()}
              style={{
                padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
                fontFamily: F, fontSize: 13, fontWeight: 500,
                background: `rgba(37,211,102,0.12)`, color: WA_GREEN,
                border: `1px solid rgba(37,211,102,0.3)`,
                opacity: busy || !phoneInput.trim() ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
          {error && <div style={{ fontFamily: F, fontSize: 13, color: '#f87171', marginTop: 8 }}>{error}</div>}
        </div>
      </Row>
    );
  }

  // stage === 'confirming'
  return (
    <Row last>
      <div style={{ flex: 1, minWidth: 0 }}>
        {info && (
          <div style={{ fontFamily: F, fontSize: 13, color: WA_GREEN, marginBottom: 10 }}>
            ✓ {info}
          </div>
        )}
        <div style={{ fontFamily: F, fontSize: 14, color: t.text1, marginBottom: 12 }}>
          Enter the 6-digit code sent to you on WhatsApp:
        </div>
        <form onSubmit={handleConfirm} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            autoFocus
            required
            style={{
              width: 120, padding: '9px 14px', borderRadius: 9,
              fontFamily: M, fontSize: 18, letterSpacing: '0.2em',
              color: t.text1, background: t.surfaceAlt, border: `1px solid ${t.border}`,
              outline: 'none', textAlign: 'center',
            }}
          />
          <button
            type="submit"
            disabled={code.length < 6 || busy}
            style={{
              padding: '9px 18px', borderRadius: 9, cursor: 'pointer',
              fontFamily: F, fontSize: 13, fontWeight: 500,
              background: code.length === 6 && !busy ? `rgba(37,211,102,0.12)` : 'transparent',
              border: `1px solid ${code.length === 6 && !busy ? 'rgba(37,211,102,0.3)' : t.border}`,
              color: code.length === 6 && !busy ? WA_GREEN : t.text3,
              transition: 'all 0.15s',
            }}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => { setStage('none'); setError(null); setInfo(null); setCode(''); }}
            style={{
              padding: '9px 14px', borderRadius: 9, cursor: 'pointer',
              fontFamily: F, fontSize: 13,
              background: 'transparent', border: `1px solid ${t.border}`, color: t.text3,
            }}
          >
            Cancel
          </button>
        </form>
        <button
          type="button"
          onClick={handleSendOTP}
          disabled={busy}
          style={{
            marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: F, fontSize: 12, color: t.text3, padding: 0,
          }}
        >
          Resend code
        </button>
        {error && <div style={{ fontFamily: F, fontSize: 13, color: '#f87171', marginTop: 8 }}>{error}</div>}
      </div>
    </Row>
  );
}

// ── Security page ─────────────────────────────────────────────────
// ── Delete account ────────────────────────────────────────────────
function DeleteAccount({ onDeleted }) {
  const { t } = useTheme();
  // 'idle' | 'verifying' | 'confirm' | 'deleting'
  const [stage, setStage] = useState('idle');
  const [stepUpToken, setStepUpToken] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);

  async function startDelete() {
    setError(null);
    setStage('verifying');
    try {
      // Step 1 — get passkey challenge for step-up
      const optRes = await fetch('/api/auth/step-up/options', {
        method: 'POST', credentials: 'include',
      });
      const { options, error: optErr } = await optRes.json();
      if (!optRes.ok) { setError(optErr || 'Failed to start verification'); setStage('idle'); return; }

      // Step 2 — prompt passkey
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Step 3 — verify and get stepUpToken
      const verRes = await fetch('/api/auth/step-up/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) { setError(verData.error || 'Verification failed'); setStage('idle'); return; }

      setStepUpToken(verData.stepUpToken);
      setStage('confirm');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey prompt was dismissed.');
      } else {
        setError(err.message || 'Verification failed.');
      }
      setStage('idle');
    }
  }

  async function handleDelete() {
    setStage('deleting');
    const res = await fetch('/api/auth/account', {
      method: 'DELETE', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stepUpToken, email: email.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong');
      setStage('idle');
      return;
    }
    onDeleted();
  }

  function cancel() {
    setStage('idle');
    setEmail('');
    setError(null);
    setStepUpToken(null);
  }

  return (
    <>
      <div style={{
        marginTop: 48, padding: '24px', borderRadius: 14,
        border: '1px solid rgba(239,68,68,0.25)',
        background: 'rgba(239,68,68,0.04)',
      }}>
        <h2 style={{ fontFamily: F, fontWeight: 400, fontSize: 16, color: '#f87171', margin: '0 0 6px' }}>
          Delete account
        </h2>
        <p style={{ fontFamily: F, fontSize: 13, color: t.text3, margin: '0 0 16px', lineHeight: 1.6 }}>
          Permanently deletes your account, all passkeys, sessions, and recovery codes. This cannot be undone.
        </p>
        <button
          onClick={startDelete}
          disabled={stage === 'verifying'}
          style={{
            padding: '9px 18px', borderRadius: 9,
            fontFamily: F, fontSize: 14,
            cursor: stage === 'verifying' ? 'not-allowed' : 'pointer',
            background: 'rgba(239,68,68,0.08)', color: '#f87171',
            border: '1px solid rgba(239,68,68,0.25)',
            opacity: stage === 'verifying' ? 0.6 : 1,
          }}
        >
          {stage === 'verifying' ? 'Verifying…' : 'Delete account'}
        </button>
        {error && <p style={{ fontFamily: F, fontSize: 13, color: '#f87171', marginTop: 10 }}>{error}</p>}
      </div>

      {stage === 'confirm' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{
            background: t.cardBg, border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 20, padding: '32px 28px', maxWidth: 400, width: '100%',
          }}>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#22c55e', marginBottom: 14 }}>
              ✓ Identity verified
            </div>
            <h2 style={{ fontFamily: F, fontWeight: 400, fontSize: 20, color: '#f87171', margin: '0 0 10px' }}>
              Delete account
            </h2>
            <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.6, marginBottom: 24 }}>
              This will permanently delete your account and all associated data. Enter your email address to confirm.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '11px 14px', borderRadius: 10, marginBottom: 16,
                fontFamily: M, fontSize: 13, color: t.text1,
                background: '#1a1a1a', border: '1px solid rgba(239,68,68,0.3)',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={cancel}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10,
                  fontFamily: F, fontSize: 14, cursor: 'pointer',
                  background: 'transparent', color: t.text2, border: `1px solid ${t.border}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!email.trim()}
                style={{
                  flex: 1, padding: '11px', borderRadius: 10,
                  fontFamily: F, fontSize: 14, fontWeight: 500,
                  cursor: !email.trim() ? 'not-allowed' : 'pointer',
                  background: 'rgba(239,68,68,0.15)', color: '#f87171',
                  border: '1px solid rgba(239,68,68,0.3)',
                  opacity: !email.trim() ? 0.5 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Settings() {
  const { t } = useTheme();
  const { user, loading, enabled, setUser } = useAuth();
  const { isMobile } = useResponsive();
  const navigate    = useNavigate();
  const deletingRef = useRef(false);
  const [tab, setTab] = useState('security');

  useEffect(() => {
    if (!enabled) { navigate('/'); return; }
    // Suppress redirect during account deletion — onDeleted handles navigation.
    if (!loading && !user && !deletingRef.current) navigate('/auth');
  }, [user, loading, enabled]);

  if (loading || !user) return null;

  return (
    <main style={{ minHeight: '100vh', padding: isMobile ? '80px 16px 48px' : '96px 24px 60px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: M, fontSize: isMobile ? 12 : 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>
          Settings
        </div>
        <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: isMobile ? 26 : 32, color: t.text1, margin: '0 0 4px' }}>
          {user.nickname || 'Settings'}
        </h1>
        <p style={{ fontFamily: M, fontSize: isMobile ? 13 : 11, color: t.text3, margin: 0 }}>
          {user.maskedEmail}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', background: t.cardBg, borderRadius: 11, padding: 4,
        marginBottom: 32, border: `1px solid ${t.border}`,
        width: isMobile ? '100%' : 'fit-content',
      }}>
        {[{ id: 'security', label: 'Security' }, { id: 'account', label: 'Account' }].map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: isMobile ? 1 : undefined,
            padding: isMobile ? '12px 22px' : '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontFamily: F, fontSize: isMobile ? 16 : 13, fontWeight: 500,
            background: tab === id ? t.accentDim : 'transparent',
            color: tab === id ? t.accent : t.text2,
            transition: 'all 0.2s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Security tab ── */}
      {tab === 'security' && (
        <>
          <Section title="Active sessions" subtitle="Devices currently signed in to your account">
            <Sessions />
          </Section>

          <Section title="Passkeys" subtitle="Biometric credentials registered to your account">
            <Passkeys />
          </Section>

          <Section title="Recovery codes" subtitle="One-time codes for account recovery if you lose your passkey">
            <RecoveryCodes />
          </Section>

          <Section title="Two-factor authentication" subtitle="Backup sign-in method when your passkey is unavailable">
            <TotpSection />
          </Section>

          <Section title="WhatsApp backup" subtitle="Receive a one-time code via WhatsApp when your passkey is unavailable">
            <WhatsAppSection />
          </Section>

          <Section title="Trusted devices" subtitle="Browsers that skip the sign-in verification prompt">
            <TrustedDevices />
          </Section>

          <Section title="Recent activity" subtitle="Last 20 security events on your account">
            <SecurityEvents />
          </Section>

          <DeleteAccount onDeleted={() => {
            deletingRef.current = true;
            setUser(null);
            navigate('/');
          }} />
        </>
      )}

      {/* ── Account tab ── */}
      {tab === 'account' && (
        <>
          <Section title="Appearance" subtitle="Display and accessibility preferences">
            <Row last>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: F, fontSize: 14, color: t.text1, marginBottom: 2 }}>Theme</div>
                <div style={{ fontFamily: F, fontSize: 12, color: t.text3 }}>
                  Auto follows your system preference. Override with Light or Dark.
                </div>
              </div>
              <ThemeToggle />
            </Row>
          </Section>
        </>
      )}
    </main>
  );
}
