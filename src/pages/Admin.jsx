// ── Admin dashboard ───────────────────────────────────────────────
// Three tabs: Upgrade Requests | Users | Models
// Redirects to / if user is not admin (detected via 403 on first fetch).

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { startAuthentication } from '@simplewebauthn/browser';
import VersionBadge from '../components/VersionBadge.jsx';
import './Admin.css';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ── Badge helpers ─────────────────────────────────────────────────
function StatusBadge({ status, t }) {
  const map = {
    pending:  { bg: 'rgba(245,166,35,0.15)',  color: '#f5a623', border: 'rgba(245,166,35,0.35)'  },
    approved: { bg: 'rgba(52,199,89,0.12)',   color: '#34c759', border: 'rgba(52,199,89,0.35)'   },
    rejected: { bg: 'rgba(255,59,48,0.12)',   color: '#ff3b30', border: 'rgba(255,59,48,0.35)'   },
  };
  const s = map[status] || { bg: t.surface, color: t.text3, border: t.border };
  return (
    <span style={{
      fontFamily: M, fontSize: 10, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {status}
    </span>
  );
}

function RoleBadge({ role, t }) {
  const map = {
    admin:   { bg: 'rgba(245,166,35,0.15)',  color: '#f5a623', border: 'rgba(245,166,35,0.35)'  },
    pro:     { bg: t.accentDim,              color: t.accent,  border: t.accentBorder            },
    student: { bg: 'rgba(52,199,89,0.10)',   color: '#34c759', border: 'rgba(52,199,89,0.35)'   },
    user:    { bg: t.surfaceAlt,             color: t.text3,   border: t.border                  },
  };
  const s = map[role] || map.user;
  return (
    <span style={{
      fontFamily: M, fontSize: 10, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {role}
    </span>
  );
}

function TierBadge({ tier, t }) {
  const isStudent = tier === 'student';
  return (
    <span style={{
      fontFamily: M, fontSize: 10, letterSpacing: '0.08em',
      padding: '2px 8px', borderRadius: 4,
      background: isStudent ? 'rgba(52,199,89,0.10)' : t.accentDim,
      color:      isStudent ? '#34c759'               : t.accent,
      border:     isStudent ? '1px solid rgba(52,199,89,0.35)' : `1px solid ${t.accentBorder}`,
    }}>
      {tier ?? 'pro'}
    </span>
  );
}

// ── Metrics helpers ───────────────────────────────────────────────

function StatCard({ label, value, sub, delta, deltaLabel, t, accent }) {
  const color = accent ?? t.accent;
  let deltaEl = null;
  if (delta !== undefined && delta !== null) {
    const isUp   = delta > 0;
    const isDown = delta < 0;
    deltaEl = (
      <span style={{
        fontFamily: M, fontSize: 10, letterSpacing: '0.05em',
        color: isUp ? '#34c759' : isDown ? '#ff3b30' : t.text3,
        marginLeft: 8,
      }}>
        {isUp ? '↑' : isDown ? '↓' : '='}{Math.abs(delta)}{deltaLabel ?? ''}
      </span>
    );
  }
  return (
    <div style={{
      padding: '18px 20px', borderRadius: 12,
      background: t.cardBg, border: `1px solid ${t.border}`,
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: F, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
          {value ?? '—'}
        </span>
        {deltaEl}
      </div>
      {sub && (
        <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>{sub}</div>
      )}
    </div>
  );
}

function MiniBar({ label, value, max, color, t }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: M, fontSize: 11, color: t.text2, width: 90, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: t.surfaceAlt, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontFamily: M, fontSize: 11, color: t.text1, width: 36, textAlign: 'right', flexShrink: 0 }}>{value}</div>
    </div>
  );
}

function PctRing({ pct, label, color, t }) {
  const r = 26, circ = 2 * Math.PI * r;
  const filled = circ * (pct / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={64} height={64} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={32} cy={32} r={r} fill="none" stroke={t.surfaceAlt} strokeWidth={5} />
        <circle
          cx={32} cy={32} r={r} fill="none"
          stroke={color} strokeWidth={5}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

const EVENT_LABELS = {
  login:                      'Sign in',
  totp_signin:                'TOTP sign in',
  recovery_signin:            'Recovery sign in',
  recovery_signin_failed:     'Recovery sign in failed',
  recovery_code_failed:       'Recovery code failed',
  recovery_code_used:         'Recovery code used',
  account_frozen:             'Account frozen',
  account_recovery:           'Account recovery',
  passkey_added:              'Passkey added',
  passkey_removed:            'Passkey removed',
  logout:                     'Logout',
  new_device:                 'New device',
  session_revoked:            'Session revoked',
  sessions_revoked_all:       'All sessions revoked',
  totp_enabled:               'TOTP enabled',
  totp_disabled:              'TOTP disabled',
  recovery_codes_regenerated: 'Recovery codes regenerated',
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function eventColor(type) {
  if (type === 'login' || type === 'totp_signin' || type === 'recovery_signin') return '#34c759';
  if (type?.includes('fail') || type === 'account_frozen') return '#ff3b30';
  if (type?.includes('removed') || type?.includes('revoked') || type === 'logout') return '#ff9500';
  return '#6366f1';
}

// ── Tab: Metrics ──────────────────────────────────────────────────
function MetricsTab({ t }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/metrics', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load metrics'); return r.json(); })
      .then(d  => { setData(d); setUpdatedAt(Date.now()); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <TabSpinner t={t} />;
  if (error)            return <TabError msg={error} t={t} />;
  if (!data)            return null;

  const { users, auth, chat, upgrades, recent_events: events } = data;

  // Derived
  const userWeekDelta   = users.this_week - users.prior_week;
  const passkeyPct      = users.total > 0 ? Math.round((auth.passkey_users / users.total) * 100) : 0;
  const totpPct         = users.total > 0 ? Math.round((auth.totp_users    / users.total) * 100) : 0;
  const signinTotal     = auth.signins_week;
  const tierOrder       = ['user', 'pro', 'student', 'admin'];
  const tierColors      = { admin: '#f5a623', pro: '#6366f1', student: '#34c759', user: '#888' };
  const maxTierCount    = Math.max(...tierOrder.map(r => users.by_role[r] ?? 0), 1);
  const signinMethods   = [
    { key: 'login',           label: 'Passkey / OTP' },
    { key: 'totp_signin',     label: 'TOTP' },
    { key: 'recovery_signin', label: 'Recovery' },
  ];
  const maxSignin = Math.max(...signinMethods.map(m => auth.signins_by_method[m.key] ?? 0), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', color: t.text3, textTransform: 'uppercase' }}>
          {updatedAt ? `Updated ${timeAgo(updatedAt)}` : ''}
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{
            fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
            padding: '5px 14px', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
            background: 'transparent', border: `1px solid ${t.border}`,
            color: loading ? t.text3 : t.text2, transition: 'all 0.15s',
          }}
        >
          {loading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* ── Row 1: Key numbers ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total Users"      value={users.total}         delta={userWeekDelta}    deltaLabel=" this wk"  t={t} accent={t.accent} />
        <StatCard label="Messages / Week"  value={chat.messages_week}  sub={`${chat.messages_today} today`}              t={t} accent="#6366f1"  />
        <StatCard label="Active This Week" value={auth.active_sessions_week} sub="unique users"                           t={t} accent="#34c759"  />
        <StatCard label="Pending Upgrades" value={upgrades.pending}    sub="awaiting review"                             t={t} accent={upgrades.pending > 0 ? '#f5a623' : t.text3} />
      </div>

      {/* ── Row 2: User growth + tier breakdown ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Growth card */}
        <div style={{ padding: '18px 20px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 16 }}>
            User Growth
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: F, fontSize: 22, fontWeight: 700, color: t.text1 }}>{users.this_week}</div>
              <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>this week</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: t.text3, fontSize: 18 }}>vs</div>
            <div>
              <div style={{ fontFamily: F, fontSize: 22, fontWeight: 700, color: t.text3 }}>{users.prior_week}</div>
              <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>prior week</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
              <span style={{
                fontFamily: M, fontSize: 13, fontWeight: 700,
                color: userWeekDelta > 0 ? '#34c759' : userWeekDelta < 0 ? '#ff3b30' : t.text3,
              }}>
                {userWeekDelta > 0 ? '+' : ''}{userWeekDelta}
              </span>
            </div>
          </div>
          <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
            {users.today} new today
          </div>
        </div>

        {/* Tier breakdown */}
        <div style={{ padding: '18px 20px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 16 }}>
            Users by Tier
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tierOrder.map(role => (
              <MiniBar
                key={role}
                label={role}
                value={users.by_role[role] ?? 0}
                max={maxTierCount}
                color={tierColors[role]}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 3: Auth health ───────────────────────────────── */}
      <div style={{ padding: '20px 24px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 20 }}>
          Auth Health
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 32, alignItems: 'center' }}>

          {/* Rings */}
          <PctRing pct={passkeyPct} label="passkey"  color="#6366f1" t={t} />
          <PctRing pct={totpPct}    label="totp"     color="#34c759" t={t} />

          {/* Sign-in methods */}
          <div>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
              Sign-ins this week — {signinTotal} total
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {signinMethods.map(m => (
                <MiniBar
                  key={m.key}
                  label={m.label}
                  value={auth.signins_by_method[m.key] ?? 0}
                  max={maxSignin}
                  color="#6366f1"
                  t={t}
                />
              ))}
              {auth.failed_attempts_week > 0 && (
                <div style={{ fontFamily: M, fontSize: 10, color: '#ff3b30', marginTop: 4 }}>
                  ⚠ {auth.failed_attempts_week} failed attempt{auth.failed_attempts_week !== 1 ? 's' : ''} this week
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: Chat stats ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Conversations"     value={chat.total_conversations} sub={`${chat.total_messages} total messages`} t={t} accent="#6366f1" />
        <StatCard label="Avg msgs / conv"   value={chat.avg_per_conv}         sub="all time"                                t={t} accent={t.accent} />
        <StatCard label="Messages Today"    value={chat.messages_today}       sub={`${chat.messages_week} this week`}       t={t} accent="#34c759" />
      </div>

      {/* ── Row 5: Upgrade funnel ────────────────────────────── */}
      <div style={{ padding: '20px 24px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 16 }}>
          Upgrade Funnel
        </div>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* Summary numbers */}
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { label: 'pending',  n: upgrades.pending,  color: '#f5a623' },
              { label: 'approved', n: upgrades.approved, color: '#34c759' },
              { label: 'rejected', n: upgrades.rejected, color: '#ff3b30' },
            ].map(({ label, n, color }) => (
              <div key={label}>
                <div style={{ fontFamily: F, fontSize: 24, fontWeight: 700, color }}>{n}</div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>{label}</div>
              </div>
            ))}
            {upgrades.approval_rate_pct !== null && (
              <div style={{ borderLeft: `1px solid ${t.border}`, paddingLeft: 24 }}>
                <div style={{ fontFamily: F, fontSize: 24, fontWeight: 700, color: '#34c759' }}>
                  {upgrades.approval_rate_pct}%
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>approval rate</div>
              </div>
            )}
          </div>

          {/* By tier */}
          {Object.keys(upgrades.by_tier).length > 0 && (
            <div style={{ borderLeft: `1px solid ${t.border}`, paddingLeft: 32 }}>
              <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                by tier
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(upgrades.by_tier).map(([tier, counts]) => (
                  <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontFamily: M, fontSize: 10, padding: '2px 8px', borderRadius: 4,
                      background: tier === 'student' ? 'rgba(52,199,89,0.1)' : t.accentDim,
                      color:      tier === 'student' ? '#34c759'              : t.accent,
                      border:     tier === 'student' ? '1px solid rgba(52,199,89,0.3)' : `1px solid ${t.accentBorder}`,
                    }}>{tier}</span>
                    <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
                      {counts.pending ?? 0}p · {counts.approved ?? 0}a · {counts.rejected ?? 0}r
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 6: Recent activity ───────────────────────────── */}
      <div style={{ padding: '20px 24px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 16 }}>
          Recent Activity
        </div>
        {events.length === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>no events yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 0',
                borderBottom: i < events.length - 1 ? `1px solid ${t.border}` : 'none',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: eventColor(ev.type),
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: M, fontSize: 11, color: t.text1 }}>
                    {EVENT_LABELS[ev.type] ?? ev.type}
                  </span>
                  {ev.email && (
                    <span style={{ fontFamily: M, fontSize: 11, color: t.text3, marginLeft: 8 }}>
                      {ev.email}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3, flexShrink: 0 }}>
                  {timeAgo(ev.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ── Tab: Upgrade Requests ─────────────────────────────────────────
function UpgradeRequestsTab({ t }) {
  const [requests, setRequests] = useState([]);
  const [filter,   setFilter]   = useState('all');
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/upgrade-requests', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load requests');
        return r.json();
      })
      .then(data => { setRequests(data.requests ?? data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const act = useCallback(async (id, action) => {
    // Optimistic update
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' } : r));
    try {
      const res = await fetch(`/api/admin/upgrade-requests/${id}/${action}`, {
        method: 'POST', credentials: 'include',
      });
      if (!res.ok) {
        // Revert on failure
        const data = await res.json().catch(() => ({}));
        console.error('Action failed:', data);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const filters  = ['all', 'pending', 'approved', 'rejected'];

  if (loading) return <TabSpinner t={t} />;
  if (error)   return <TabError msg={error} t={t} />;

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
            padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
            border: `1px solid ${filter === f ? t.accentBorder : t.border}`,
            background: filter === f ? t.accentDim : 'transparent',
            color: filter === f ? t.accent : t.text3,
            transition: 'all 0.15s',
          }}>
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontFamily: M, fontSize: 12, color: t.text3, textAlign: 'center', padding: '40px 0' }}>
          no requests
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(req => (
            <div key={req.id} style={{
              padding: '14px 18px', borderRadius: 10,
              background: t.cardBg, border: `1px solid ${t.border}`,
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: M, fontSize: 12, color: t.text1, marginBottom: 4 }}>
                  {req.email ?? '—'}
                </div>
                {req.note && (
                  <div style={{ fontFamily: F, fontSize: 12, color: t.text3, marginBottom: 4 }}>
                    "{req.note}"
                  </div>
                )}
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
                  {req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}
                </div>
              </div>
              <TierBadge tier={req.tier} t={t} />
              <StatusBadge status={req.status} t={t} />
              {req.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => act(req.id, 'approve')} style={{
                    fontFamily: M, fontSize: 11, padding: '4px 12px', borderRadius: 6,
                    cursor: 'pointer', border: '1px solid rgba(52,199,89,0.35)',
                    background: 'rgba(52,199,89,0.1)', color: '#34c759',
                  }}>
                    approve
                  </button>
                  <button onClick={() => act(req.id, 'reject')} style={{
                    fontFamily: M, fontSize: 11, padding: '4px 12px', borderRadius: 6,
                    cursor: 'pointer', border: '1px solid rgba(255,59,48,0.35)',
                    background: 'rgba(255,59,48,0.08)', color: '#ff3b30',
                  }}>
                    reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Users ────────────────────────────────────────────────────
function UsersTab({ t }) {
  const [users,      setUsers]      = useState([]);
  const [query,      setQuery]      = useState('');
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  // step-up state: { userId } while in-flight, null otherwise
  const [stepUp,     setStepUp]     = useState(null); // { userId, stage: 'verifying'|'saving'|'error', errorMsg? }

  useEffect(() => {
    fetch('/api/admin/users', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load users');
        return r.json();
      })
      .then(data => { setUsers(data.users ?? data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const makeProFromStudent = useCallback(async (userId) => {
    setStepUp({ userId, stage: 'verifying' });
    try {
      const optRes = await fetch('/api/auth/step-up/options', {
        method: 'POST', credentials: 'include',
      });
      const { options, error: optErr } = await optRes.json();
      if (!optRes.ok) throw new Error(optErr || 'Failed to start step-up');

      const authResponse = await startAuthentication({ optionsJSON: options });

      const verRes = await fetch('/api/auth/step-up/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) throw new Error(verData.error || 'Verification failed');

      setStepUp({ userId, stage: 'saving' });

      const res = await fetch(`/api/admin/users/${userId}/make-pro`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: verData.stepUpToken }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to promote to pro');
      }

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'pro' } : u));
      setStepUp(null);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setStepUp(null);
      } else {
        setStepUp({ userId, stage: 'error', errorMsg: err.message });
      }
    }
  }, []);

  const makeAdmin = useCallback(async (userId) => {
    setStepUp({ userId, stage: 'verifying' });
    try {
      // Step 1 — get passkey challenge
      const optRes = await fetch('/api/auth/step-up/options', {
        method: 'POST', credentials: 'include',
      });
      const { options, error: optErr } = await optRes.json();
      if (!optRes.ok) throw new Error(optErr || 'Failed to start step-up');

      // Step 2 — passkey prompt
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Step 3 — verify and get token
      const verRes = await fetch('/api/auth/step-up/verify', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authResponse }),
      });
      const verData = await verRes.json();
      if (!verRes.ok) throw new Error(verData.error || 'Verification failed');

      setStepUp({ userId, stage: 'saving' });

      // Step 4 — make admin
      const res = await fetch(`/api/admin/users/${userId}/make-admin`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepUpToken: verData.stepUpToken }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to grant admin');
      }

      // Optimistic update
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: 'admin' } : u));
      setStepUp(null);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setStepUp(null); // dismissed — no error shown
      } else {
        setStepUp({ userId, stage: 'error', errorMsg: err.message });
      }
    }
  }, []);

  const q = query.toLowerCase().trim();
  const filtered = q
    ? users.filter(u =>
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.role ?? '').toLowerCase().includes(q)
      )
    : users;

  if (loading) return <TabSpinner t={t} />;
  if (error)   return <TabError msg={error} t={t} />;

  return (
    <div>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="filter by email or role…"
        style={{
          width: '100%', boxSizing: 'border-box',
          marginBottom: 16, padding: '8px 14px',
          fontFamily: M, fontSize: 12, color: t.text1,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          borderRadius: 8, outline: 'none',
        }}
      />

      {filtered.length === 0 ? (
        <div style={{ fontFamily: M, fontSize: 12, color: t.text3, textAlign: 'center', padding: '40px 0' }}>
          no users
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: F, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                {['email', 'role', 'joined', ''].map((h, i) => (
                  <th key={i} style={{
                    textAlign: 'left', padding: '8px 12px',
                    fontFamily: M, fontSize: 10, letterSpacing: '0.1em',
                    color: t.text3, fontWeight: 400, textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const uid = u.id;
                const su  = stepUp?.userId === uid ? stepUp : null;
                return (
                  <tr key={uid} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ padding: '10px 12px', color: t.text1, fontFamily: M, fontSize: 12 }}>
                      {u.email ?? '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <RoleBadge role={u.role ?? 'user'} t={t} />
                    </td>
                    <td style={{ padding: '10px 12px', color: t.text3, fontFamily: M, fontSize: 11 }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {u.role !== 'admin' && (
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {u.role === 'student' && (
                            <button
                              onClick={() => makeProFromStudent(uid)}
                              disabled={!!stepUp}
                              style={{
                                fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                                padding: '3px 10px', borderRadius: 6, cursor: stepUp ? 'default' : 'pointer',
                                border: `1px solid ${t.accentBorder}`,
                                background: t.accentDim, color: t.accent,
                                opacity: stepUp && !su ? 0.4 : 1,
                                transition: 'opacity 0.15s',
                              }}
                            >
                              {su?.stage === 'verifying' ? 'verifying…' : su?.stage === 'saving' ? 'saving…' : 'make pro'}
                            </button>
                          )}
                          <button
                            onClick={() => makeAdmin(uid)}
                            disabled={!!stepUp}
                            style={{
                              fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                              padding: '3px 10px', borderRadius: 6, cursor: stepUp ? 'default' : 'pointer',
                              border: `1px solid rgba(245,166,35,0.4)`,
                              background: 'rgba(245,166,35,0.08)', color: '#f5a623',
                              opacity: stepUp && !su ? 0.4 : 1,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            {su?.stage === 'verifying' ? 'verifying…' : su?.stage === 'saving' ? 'saving…' : 'make admin'}
                          </button>
                          {su?.stage === 'error' && (
                            <div style={{ fontFamily: M, fontSize: 10, color: '#ff3b30', maxWidth: 180, textAlign: 'right' }}>
                              {su.errorMsg}
                              <button onClick={() => setStepUp(null)} style={{ marginLeft: 6, background: 'none', border: 'none', color: t.text3, cursor: 'pointer', fontSize: 10 }}>✕</button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────
function Toggle({ checked, onChange, t }) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? t.accent : t.border,
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        display: 'block',
      }} />
    </button>
  );
}

// ── Tab: Models ───────────────────────────────────────────────────
const MODEL_CATALOG = [
  {
    group: 'Cloudflare Workers AI', note: 'No API key needed',
    items: [
      { model_id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast' },
      { model_id: '@cf/meta/llama-3.1-8b-instruct',           label: 'Llama 3.1 8B' },
    ],
  },
  {
    group: 'OpenRouter · Free', note: 'Requires OPENROUTER_API_KEY secret',
    items: [
      { model_id: 'meta-llama/llama-3.3-70b-instruct:free',       label: 'Llama 3.3 70B',        provider: 'Meta' },
      { model_id: 'google/gemma-4-31b-it:free',                   label: 'Gemma 4 31B',           provider: 'Google' },
      { model_id: 'google/gemma-4-26b-a4b-it:free',               label: 'Gemma 4 26B A4B',       provider: 'Google' },
      { model_id: 'openai/gpt-oss-120b:free',                     label: 'GPT OSS 120B',          provider: 'OpenAI' },
      { model_id: 'openai/gpt-oss-20b:free',                      label: 'GPT OSS 20B',           provider: 'OpenAI' },
      { model_id: 'nvidia/nemotron-3-super-120b-a12b:free',        label: 'Nemotron 3 Super 120B', provider: 'NVIDIA' },
      { model_id: 'nvidia/nemotron-3-nano-30b-a3b:free',           label: 'Nemotron 3 Nano 30B',   provider: 'NVIDIA' },
      { model_id: 'nvidia/nemotron-nano-9b-v2:free',               label: 'Nemotron Nano 9B V2',   provider: 'NVIDIA' },
      { model_id: 'nousresearch/hermes-3-llama-3.1-405b:free',     label: 'Hermes 3 405B',         provider: 'Nous Research' },
      { model_id: 'qwen/qwen3-coder:free',                         label: 'Qwen3 Coder 480B',      provider: 'Alibaba' },
      { model_id: 'qwen/qwen3-next-80b-a3b-instruct:free',         label: 'Qwen3 Next 80B',        provider: 'Alibaba' },
    ],
  },
  {
    group: 'Paid',
    items: [
      { model_id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
      { model_id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   provider: 'Anthropic' },
    ],
  },
];

function ModelsTab({ t }) {
  const [dbModels, setDbModels] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [busy,     setBusy]     = useState({});  // model_id → true while saving
  const [form,     setForm]     = useState({ model_id: '', label: '', tier: 'pro' });
  const [adding,   setAdding]   = useState(false);
  const [addErr,   setAddErr]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/admin/models', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Failed'))
      .then(d => { setDbModels(d.models ?? []); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = useCallback(async (item) => {
    const db = dbModels.find(m => m.model_id === item.model_id);
    setBusy(b => ({ ...b, [item.model_id]: true }));
    try {
      if (!db) {
        // not in DB yet → add enabled
        await fetch('/api/admin/models', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_id: item.model_id, label: item.label, tier: 'pro' }),
        });
      } else {
        await fetch(`/api/admin/models/${encodeURIComponent(item.model_id)}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: db.enabled ? 0 : 1 }),
        });
      }
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(b => ({ ...b, [item.model_id]: false }));
    }
  }, [dbModels, load]);

  const addCustom = useCallback(async () => {
    if (!form.model_id.trim() || !form.label.trim()) { setAddErr('Both fields required'); return; }
    setAdding(true); setAddErr(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed'); }
      setForm({ model_id: '', label: '', tier: 'pro' });
      load();
    } catch (err) { setAddErr(err.message); }
    finally { setAdding(false); }
  }, [form, load]);

  if (loading) return <TabSpinner t={t} />;
  if (error)   return <TabError msg={error} t={t} />;

  // model IDs in DB for quick lookup
  const catalogIds = new Set(MODEL_CATALOG.flatMap(g => g.items.map(i => i.model_id)));
  const customModels = dbModels.filter(m => !catalogIds.has(m.model_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {MODEL_CATALOG.map(({ group, note, items }) => (
        <div key={group}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.text2 }}>
              {group}
            </span>
            {note && (
              <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>{note}</span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map(item => {
              const db = dbModels.find(m => m.model_id === item.model_id);
              const enabled = !!db?.enabled;
              const isBusy  = !!busy[item.model_id];
              return (
                <div key={item.model_id} style={{
                  padding: '10px 16px', borderRadius: 10,
                  background: t.cardBg, border: `1px solid ${enabled ? t.accentBorder : t.border}`,
                  display: 'flex', alignItems: 'center', gap: 14,
                  opacity: isBusy ? 0.6 : 1, transition: 'opacity 0.15s, border-color 0.15s',
                }}>
                  <Toggle checked={enabled} onChange={() => !isBusy && toggle(item)} t={t} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: F, fontSize: 13, fontWeight: 500, color: t.text1 }}>
                      {item.label}
                      {item.provider && (
                        <span style={{ fontFamily: M, fontSize: 10, color: t.text3, marginLeft: 8 }}>
                          {item.provider}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.model_id}
                    </div>
                  </div>
                  {db && (
                    <span style={{
                      fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                      padding: '2px 8px', borderRadius: 4,
                      background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
                    }}>
                      {db.tier ?? 'pro'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Custom models not in catalog */}
      {customModels.length > 0 && (
        <div>
          <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.text2, marginBottom: 10 }}>
            Custom
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customModels.map(m => (
              <div key={m.model_id} style={{
                padding: '10px 16px', borderRadius: 10,
                background: t.cardBg, border: `1px solid ${m.enabled ? t.accentBorder : t.border}`,
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <Toggle checked={!!m.enabled} onChange={() => toggle(m)} t={t} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F, fontSize: 13, fontWeight: 500, color: t.text1 }}>{m.label}</div>
                  <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>{m.model_id}</div>
                </div>
                <span style={{
                  fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                  padding: '2px 8px', borderRadius: 4,
                  background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
                }}>
                  {m.tier ?? 'pro'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add custom model */}
      <div style={{ padding: '16px 20px', borderRadius: 12, background: t.surfaceAlt, border: `1px solid ${t.border}` }}>
        <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.1em', color: t.text3, marginBottom: 12, textTransform: 'uppercase' }}>
          Add custom model
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={form.model_id} onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
            placeholder="model_id" style={{ flex: '1 1 160px', padding: '8px 12px', fontFamily: M, fontSize: 12, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, outline: 'none' }} />
          <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Display label" style={{ flex: '2 1 180px', padding: '8px 12px', fontFamily: F, fontSize: 13, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, outline: 'none' }} />
          <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
            style={{ flex: '0 1 90px', padding: '8px 10px', fontFamily: M, fontSize: 12, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, outline: 'none', cursor: 'pointer' }}>
            <option value="pro">pro</option>
            <option value="admin">admin</option>
          </select>
          <button onClick={addCustom} disabled={adding}
            style={{ padding: '8px 20px', borderRadius: 8, cursor: adding ? 'default' : 'pointer', fontFamily: M, fontSize: 12, background: adding ? 'transparent' : t.accentDim, border: `1px solid ${adding ? t.border : t.accentBorder}`, color: adding ? t.text3 : t.accent, transition: 'all 0.15s' }}>
            {adding ? '…' : 'add'}
          </button>
        </div>
        {addErr && <div style={{ fontFamily: M, fontSize: 11, color: '#ff3b30', marginTop: 8 }}>{addErr}</div>}
      </div>
    </div>
  );
}

// ── Tab: Personas ─────────────────────────────────────────────────
const PERSONA_LABELS = { user: 'Regular', pro: 'Pro', student: 'Student', admin: 'Admin' };
const PERSONA_ROLES  = ['user', 'pro', 'student', 'admin'];

function PersonasTab({ t }) {
  const [personas, setPersonas] = useState({ user: '', pro: '', student: '', admin: '' });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    fetch('/api/admin/personas', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setPersonas(p => ({ ...p, ...data })); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/personas', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personas),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Save failed');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [personas]);

  if (loading) return <TabSpinner t={t} />;

  return (
    <div>
      <div style={{ fontFamily: F, fontSize: 13, color: t.text3, marginBottom: 24, lineHeight: 1.6 }}>
        Each persona is the system prompt for that tier. Edits take effect immediately — no deploy needed.
        Leave a field blank to use the hardcoded default.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {PERSONA_ROLES.map(role => (
          <div key={role}>
            <label style={{
              fontFamily: M, fontSize: 11, letterSpacing: '0.1em',
              color: t.text3, textTransform: 'uppercase', display: 'block', marginBottom: 8,
            }}>
              {PERSONA_LABELS[role]}
            </label>
            <textarea
              value={personas[role] ?? ''}
              onChange={e => setPersonas(p => ({ ...p, [role]: e.target.value }))}
              rows={12}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: M, fontSize: 11, lineHeight: 1.7,
                color: t.text1, background: t.surfaceAlt,
                border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '12px 14px', outline: 'none', resize: 'vertical',
              }}
            />
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          fontFamily: M, fontSize: 11, color: '#ff3b30', marginTop: 16,
          padding: '8px 12px', borderRadius: 6,
          background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)',
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 20 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{
            fontFamily: M, fontSize: 12, letterSpacing: '0.06em',
            padding: '10px 28px', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
            background: saving ? 'transparent' : t.accentDim,
            border: `1px solid ${saving ? t.border : t.accentBorder}`,
            color: saving ? t.text3 : t.accent,
            transition: 'all 0.15s',
          }}
        >
          {saving ? 'saving…' : 'save all'}
        </button>
        {saved && (
          <span style={{ fontFamily: M, fontSize: 11, color: '#34c759' }}>saved ✓</span>
        )}
      </div>
    </div>
  );
}

// ── Shared tab loading/error states ──────────────────────────────
function TabSpinner({ t }) {
  return (
    <div style={{ fontFamily: M, fontSize: 11, color: t.text3, textAlign: 'center', padding: '48px 0', letterSpacing: '0.2em' }}>
      loading…
    </div>
  );
}
function TabError({ msg, t: _t }) {
  return (
    <div style={{ fontFamily: M, fontSize: 12, color: '#ff3b30', textAlign: 'center', padding: '40px 0' }}>
      {msg}
    </div>
  );
}

// ── Shared chart helpers ──────────────────────────────────────────

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

// SVG polyline chart — renders total (accent) and errors (red) lines.
// data: [{ bucket, total, errors }], buckets are epoch-ms timestamps
function LineChart({ data, t, height = 130, formatX }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: t.text3 }}>No data yet</span>
      </div>
    );
  }

  const W = 800, H = height;
  const padL = 36, padR = 8, padT = 8, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const maxTotal = Math.max(...data.map(d => d.total), 1);

  const xs = data.map((_, i) => padL + (i / (data.length - 1 || 1)) * plotW);
  const yT = d => padT + (1 - d.total / maxTotal) * plotH;
  const yE = d => padT + (1 - d.errors / maxTotal) * plotH;

  const pts  = data.map((d, i) => `${xs[i]},${yT(d)}`).join(' ');
  const epts = data.map((d, i) => `${xs[i]},${yE(d)}`).join(' ');

  // Y gridlines
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    y: padT + (1 - f) * plotH,
    label: fmt(Math.round(f * maxTotal)),
  }));

  // X labels — show up to 6 evenly spaced
  const step = Math.max(1, Math.ceil(data.length / 6));
  const xLabels = data
    .map((d, i) => ({ i, label: formatX ? formatX(d.bucket) : '' }))
    .filter(({ i }) => i % step === 0 || i === data.length - 1);

  const M = "'IBM Plex Mono', monospace";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      {/* Grid */}
      {yTicks.map(({ y, label }) => (
        <g key={y}>
          <line x1={padL} y1={y} x2={W - padR} y2={y} stroke={t.border} strokeWidth={0.5} />
          <text x={padL - 4} y={y + 3} textAnchor="end" fill={t.text3} fontFamily={M} fontSize={9}>{label}</text>
        </g>
      ))}
      {/* X labels */}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={xs[i]} y={H - 4} textAnchor="middle" fill={t.text3} fontFamily={M} fontSize={9}>{label}</text>
      ))}
      {/* Total line */}
      {data.length > 1 && <polyline points={pts} fill="none" stroke={t.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {data.length === 1 && <circle cx={xs[0]} cy={yT(data[0])} r={3} fill={t.accent} />}
      {/* Error line */}
      {data.length > 1 && <polyline points={epts} fill="none" stroke="#ff3b30" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 2" />}
      {data.length === 1 && <circle cx={xs[0]} cy={yE(data[0])} r={2} fill="#ff3b30" />}
      {/* Dots on total */}
      {data.map((d, i) => (
        <circle key={i} cx={xs[i]} cy={yT(d)} r={2.5} fill={t.accent} />
      ))}
    </svg>
  );
}

// Mini sparkline — adapts bar size to bucket count (7 daily vs 24 hourly)
function Sparkline({ sparkline, buckets, t }) {
  const vals = buckets.map(b => sparkline[b] ?? 0);
  const max  = Math.max(...vals, 1);
  const barW = buckets.length > 8 ? 3 : 8;
  const gap  = buckets.length > 8 ? 1 : 2;
  const W = buckets.length * (barW + gap) - gap;
  const H = 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block' }}>
      {vals.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * H));
        return (
          <rect
            key={i}
            x={i * (barW + gap)} y={H - h}
            width={barW} height={h}
            rx={1}
            fill={v > 0 ? t.accent : t.surfaceAlt}
            opacity={v > 0 ? 0.8 : 0.3}
          />
        );
      })}
    </svg>
  );
}

// One-line descriptions for each normalized endpoint path
const ENDPOINT_DESCRIPTIONS = {
  // Auth
  '/api/auth/me':                        'Returns the current session user and role',
  '/api/auth/register/begin':            'Starts passkey registration — returns WebAuthn options',
  '/api/auth/register/complete':         'Finishes passkey registration — stores credential in D1',
  '/api/auth/login/begin':               'Starts passkey authentication — returns WebAuthn challenge',
  '/api/auth/login/complete':            'Verifies assertion and creates a new session',
  '/api/auth/logout':                    'Destroys the current session cookie',
  '/api/auth/otp/send':                  'Sends a one-time code to the user\'s email via Resend',
  '/api/auth/otp/verify':                'Verifies the submitted OTP and upgrades session trust',
  '/api/auth/account/nickname':          'Updates the display nickname for the current user',
  '/api/auth/passkeys':                  'Lists all registered passkeys for the current user',
  '/api/auth/passkeys/:id':              'Revokes (deletes) a specific passkey by credential ID',
  '/api/auth/recovery/setup':            'Generates and stores 8 PBKDF2-hashed recovery codes',
  '/api/auth/recovery/verify':           'Validates a recovery code and establishes a recovery session',
  '/api/auth/recovery/reset':            'Resets passkeys using a verified recovery session',
  '/api/auth/step-up/begin':             'Initiates step-up re-authentication challenge',
  '/api/auth/step-up/complete':          'Completes step-up and elevates session trust level',
  '/api/auth/totp/setup':                'Generates a TOTP secret and QR URI for authenticator apps',
  '/api/auth/totp/verify':               'Verifies a TOTP code and activates 2FA for the account',
  '/api/auth/totp/disable':              'Disables TOTP after step-up verification',
  '/api/auth/totp/signin':               'Verifies TOTP during sign-in flow',
  '/api/auth/whatsapp/register':         'Registers a WhatsApp number for backup authentication',
  '/api/auth/whatsapp/send':             'Sends an OTP via Twilio WhatsApp',
  '/api/auth/whatsapp/verify':           'Verifies the WhatsApp OTP and signs the user in',
  // Number matching
  '/api/num-match/:id':                  'WebSocket endpoint — real-time device approval broker (Durable Object)',
  '/api/num-match/:id/push':             'Sends approval result from the approving device',
  // Chat / RAG
  '/api/chat':                           'Streams an AI response via SSE — RAG + llama-3.3-70b',
  '/api/chat/conversations':             'Lists all conversations for the current user',
  '/api/chat/conversations/:id':         'Fetches full message history for a conversation',
  '/api/chat/conversations/:id/title':   'Updates the auto-generated title of a conversation',
  // User
  '/api/user/upgrade-request':           'Submits or retrieves the user\'s tier upgrade request',
  '/api/feedback':                       'Stores anonymous feedback — no auth required',
  // Admin
  '/api/admin/metrics':                  'Returns aggregated site metrics for the Metrics tab',
  '/api/admin/endpoint-metrics':         'Returns per-endpoint request counts and error rates',
  '/api/admin/users':                    'Lists all registered users with roles and passkey counts',
  '/api/admin/users/:id/role':           'Updates the role of a specific user',
  '/api/admin/upgrade-requests':         'Lists all pending tier upgrade requests',
  '/api/admin/upgrade-requests/:id':     'Approves or denies a specific upgrade request',
  '/api/admin/models':                   'Lists allowed AI models per user tier',
  '/api/admin/models/:id':               'Adds or removes an allowed model entry',
  '/api/admin/personas':                 'Lists all AI persona configurations',
  '/api/admin/personas/:id':             'Creates, updates, or deletes an AI persona',
};

function MethodBadge({ method }) {
  const colors = {
    GET:    { bg: 'rgba(52,199,89,0.12)',  color: '#34c759', border: 'rgba(52,199,89,0.3)'  },
    POST:   { bg: 'rgba(99,102,241,0.12)', color: '#6366f1', border: 'rgba(99,102,241,0.3)' },
    DELETE: { bg: 'rgba(255,59,48,0.12)',  color: '#ff3b30', border: 'rgba(255,59,48,0.3)'  },
    PATCH:  { bg: 'rgba(245,166,35,0.12)', color: '#f5a623', border: 'rgba(245,166,35,0.3)' },
  };
  const s = colors[method] || { bg: 'rgba(128,128,128,0.12)', color: '#888', border: 'rgba(128,128,128,0.3)' };
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, letterSpacing: '0.08em',
      padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{method}</span>
  );
}

// ── Tab: Endpoints ────────────────────────────────────────────────
const ENDPOINT_GROUPS = [
  { key: 'auth',  label: 'Auth',  prefix: '/api/auth/',  color: '#6366f1' },
  { key: 'chat',  label: 'Chat',  prefix: '/api/chat',   color: '#34c759' },
  { key: 'admin', label: 'Admin', prefix: '/api/admin/', color: '#f5a623' },
  { key: 'user',  label: 'User',  prefix: '/api/user/',  color: '#ff9500' },
];

function EndpointsTab({ t }) {
  const M = "'IBM Plex Mono', monospace";
  const F = "'Outfit', sans-serif";

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [view,    setView]    = useState('24h'); // '24h' | '7d'

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/endpoint-metrics', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load endpoint metrics'); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <TabSpinner t={t} />;
  if (error)            return <TabError msg={error} t={t} />;
  if (!data)            return null;

  // ── Active period data ────────────────────────────────────────────
  const is24h           = view === '24h';
  const activeEndpoints = is24h ? (data.endpoints_24h ?? []) : (data.endpoints_7d ?? []);
  const activeTotal     = is24h ? data.total_24h : data.total_7d;
  const periodLabel     = is24h ? 'last 24 hours' : 'last 7 days';
  const trendLabel      = is24h ? '24h trend' : '7d trend';
  const chartData       = is24h ? data.hourly : data.daily;

  // Bucket sequences for sparklines
  const now     = data.generated_at;
  const d7Base  = Math.floor((now - 7 * 86_400_000) / 86_400_000) * 86_400_000;
  const h24Base = Math.floor((now - 86_400_000)      / 3_600_000)  * 3_600_000;
  const d7Buckets  = Array.from({ length: 7  }, (_, i) => d7Base  + i * 86_400_000);
  const h24Buckets = Array.from({ length: 24 }, (_, i) => h24Base + i * 3_600_000);
  const activeBuckets = is24h ? h24Buckets : d7Buckets;

  // Hour and day formatters for chart x-axis
  const fmtHour = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:00`; };
  const fmtDay  = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };

  // Aggregated group stats for active period
  const groups = ENDPOINT_GROUPS.map(g => {
    const rows   = activeEndpoints.filter(e => e.path.startsWith(g.prefix));
    const total  = rows.reduce((s, r) => s + r.total, 0);
    const errors = rows.reduce((s, r) => s + r.errors, 0);
    return { ...g, total, errors, endpoints: rows.length };
  });

  const errorsAll  = activeEndpoints.reduce((s, e) => s + e.errors, 0);
  const errRatePct = activeTotal > 0 ? Math.round((errorsAll / activeTotal) * 100) : 0;
  const topEndpoint = activeEndpoints[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Period selector — controls everything below */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase' }}>
          Showing: {periodLabel}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {['24h', '7d'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontFamily: M, fontSize: 10, letterSpacing: '0.08em',
                padding: '5px 14px', borderRadius: 6,
                background: view === v ? t.accent : 'none',
                color: view === v ? t.textInverse : t.text2,
                border: `1px solid ${view === v ? t.accent : t.border}`,
                cursor: 'pointer',
              }}
            >{v}</button>
          ))}
          <button
            onClick={load}
            title="Refresh"
            style={{
              fontFamily: M, fontSize: 10, padding: '5px 10px', borderRadius: 6,
              background: 'none', color: t.text3,
              border: `1px solid ${t.border}`, cursor: 'pointer', marginLeft: 4,
            }}
          >↺</button>
        </div>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <StatCard label="Total requests" value={fmt(activeTotal)} sub={periodLabel} t={t} />
        <StatCard label="Error rate" value={`${errRatePct}%`} sub={`${errorsAll} errors`} t={t} accent={errRatePct > 5 ? '#ff3b30' : '#34c759'} />
        <StatCard label="Unique endpoints" value={activeEndpoints.length} sub={periodLabel} t={t} />
        {topEndpoint && (
          <StatCard
            label="Top endpoint"
            value={fmt(topEndpoint.total)}
            sub={`${topEndpoint.method} ${topEndpoint.path}`}
            t={t}
          />
        )}
      </div>

      {/* Aggregate trend chart */}
      <div style={{ padding: '20px 20px 16px', borderRadius: 12, background: t.cardBg, border: `1px solid ${t.border}` }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 4 }}>
            All endpoints — request volume
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ fontFamily: M, fontSize: 10, color: t.accent }}>── total</span>
            <span style={{ fontFamily: M, fontSize: 10, color: '#ff3b30' }}>╌╌ errors</span>
          </div>
        </div>
        <LineChart
          data={chartData}
          t={t}
          height={130}
          formatX={is24h ? fmtHour : fmtDay}
        />
      </div>

      {/* Group breakdown */}
      <div>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
          By group — {periodLabel}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {groups.map(g => {
            const errPct = g.total > 0 ? Math.round((g.errors / g.total) * 100) : 0;
            return (
              <div
                key={g.key}
                style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: t.cardBg, border: `1px solid ${t.border}`,
                  borderLeft: `3px solid ${g.color}`,
                }}
              >
                <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: g.color, textTransform: 'uppercase', marginBottom: 8 }}>
                  {g.label}
                </div>
                <div style={{ fontFamily: F, fontSize: 24, fontWeight: 700, color: t.text1, lineHeight: 1, marginBottom: 4 }}>
                  {fmt(g.total)}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
                  {g.endpoints} endpoint{g.endpoints !== 1 ? 's' : ''} · {errPct}% errors
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-endpoint table */}
      <div>
        <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
          All endpoints — {periodLabel}
        </div>
        <div style={{ borderRadius: 12, border: `1px solid ${t.border}`, background: t.cardBg, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '72px 1fr 64px 64px 70px 80px',
            gap: 8, padding: '8px 16px', borderBottom: `1px solid ${t.border}`,
          }}>
            {['Method', 'Path', 'Total', 'Errors', trendLabel, 'Last seen'].map(h => (
              <div key={h} style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase' }}>
                {h}
              </div>
            ))}
          </div>

          {activeEndpoints.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', fontFamily: M, fontSize: 11, color: t.text3 }}>
              No requests logged yet — data appears after the first API call.
            </div>
          )}

          {activeEndpoints.map((ep, i) => {
            const errPct   = ep.total > 0 ? Math.round((ep.errors / ep.total) * 100) : 0;
            const errColor = errPct > 10 ? '#ff3b30' : errPct > 0 ? '#ff9500' : '#34c759';
            const group    = ENDPOINT_GROUPS.find(g => ep.path.startsWith(g.prefix));
            const desc     = ENDPOINT_DESCRIPTIONS[ep.path];
            return (
              <div
                key={`${ep.method}-${ep.path}`}
                style={{
                  display: 'grid', gridTemplateColumns: '72px 1fr 64px 64px 70px 80px',
                  gap: 8, padding: '10px 16px',
                  borderBottom: i < activeEndpoints.length - 1 ? `1px solid ${t.border}` : 'none',
                  alignItems: 'center',
                  borderLeft: group ? `3px solid ${group.color}` : `3px solid transparent`,
                }}
              >
                <div><MethodBadge method={ep.method} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontFamily: M, fontSize: 11, color: t.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ep.path}
                  </span>
                  {desc && (
                    <span
                      title={desc}
                      style={{
                        flexShrink: 0, width: 14, height: 14, borderRadius: '50%',
                        background: t.surface, border: `1px solid ${t.border}`,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: M, fontSize: 9, color: t.text3, cursor: 'default',
                        lineHeight: 1,
                      }}
                    >?</span>
                  )}
                </div>
                <div style={{ fontFamily: M, fontSize: 12, color: t.text1, fontWeight: 600 }}>
                  {fmt(ep.total)}
                </div>
                <div style={{ fontFamily: M, fontSize: 11, color: errColor }}>
                  {errPct}%
                </div>
                <div>
                  <Sparkline sparkline={ep.sparkline} buckets={activeBuckets} t={t} />
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
                  {timeAgo(ep.last_seen)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Tab: LLM Evals ────────────────────────────────────────────────
const EVAL_SCORE_KEYS   = ['accuracy', 'hallucination_risk', 'relevance', 'tone'];
const EVAL_SCORE_LABELS = { accuracy: 'Accuracy', hallucination_risk: 'No Halluc.', relevance: 'Relevance', tone: 'Tone' };
const EVAL_TREND_COLORS = { accuracy: '#64ffda', hallucination_risk: '#6366f1', relevance: '#f5a623', tone: '#34c759' };

function evalScoreColor(score) {
  if (score >= 4.5) return '#34c759';
  if (score >= 3.5) return '#34c759';
  if (score >= 2.5) return '#f5a623';
  if (score >= 1.5) return '#ff9500';
  return '#ff3b30';
}

function evalScoreBg(score) {
  if (score >= 4.5) return 'rgba(52,199,89,0.15)';
  if (score >= 3.5) return 'rgba(52,199,89,0.08)';
  if (score >= 2.5) return 'rgba(245,166,35,0.15)';
  if (score >= 1.5) return 'rgba(255,149,0,0.12)';
  return 'rgba(255,59,48,0.12)';
}

// Multi-line trend chart — one line per score dimension over all stored runs
function EvalTrendChart({ runs, t }) {
  if (runs.length < 2) return null;
  const W = 800, H = 150;
  const padL = 28, padR = 82, padT = 12, padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = runs.length;
  const xs = runs.map((_, i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW));
  const yScore = s => padT + (1 - (s - 1) / 4) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <g key={s}>
          <line x1={padL} y1={yScore(s)} x2={W - padR} y2={yScore(s)} stroke={t.border} strokeWidth={0.5} />
          <text x={padL - 4} y={yScore(s) + 3.5} textAnchor="end" fill={t.text3} fontFamily={M} fontSize={9}>{s}</text>
        </g>
      ))}
      {runs.map((run, i) => (
        <text key={i} x={xs[i]} y={H - 4} textAnchor="middle" fill={t.text3} fontFamily={M} fontSize={9}>{run.version}</text>
      ))}
      {EVAL_SCORE_KEYS.map((key, ki) => {
        const color = EVAL_TREND_COLORS[key];
        const pts = runs.map((r, i) => `${xs[i].toFixed(1)},${yScore(r.averages[key]).toFixed(1)}`).join(' ');
        return (
          <g key={key}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
            {runs.map((r, i) => <circle key={i} cx={xs[i]} cy={yScore(r.averages[key])} r={2.5} fill={color} />)}
            <g transform={`translate(${W - padR + 10},${padT + ki * 22})`}>
              <circle cx={4} cy={4} r={3} fill={color} />
              <text x={11} y={8} fill={t.text3} fontFamily={M} fontSize={8}>{EVAL_SCORE_LABELS[key]}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// Tiny inline sparkline per question — 4 lines, one per dimension
function EvalQuestionTrend({ questionId, allRuns }) {
  if (!allRuns || allRuns.length < 2) return null;
  const W = 80, H = 24;
  const pad = 2;
  const plotW = W - pad * 2, plotH = H - pad * 2;
  const n = allRuns.length;
  const xs = allRuns.map((_, i) => pad + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW));
  const yScore = s => pad + (1 - (s - 1) / 4) * plotH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block', flexShrink: 0 }} title="Score trend across runs">
      {EVAL_SCORE_KEYS.map(key => {
        const pts = allRuns.map((run, i) => {
          const r = run.results?.find(r => r.id === questionId);
          return r ? `${xs[i].toFixed(1)},${yScore(r.scores[key]).toFixed(1)}` : null;
        }).filter(Boolean).join(' ');
        return pts
          ? <polyline key={key} points={pts} fill="none" stroke={EVAL_TREND_COLORS[key]} strokeWidth={1} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
          : null;
      })}
    </svg>
  );
}

// Run history row — shown in the history list
function EvalRunHistoryRow({ run, isPrimary, isCompare, onSelectPrimary, onSelectCompare, t }) {
  const timeStr = new Date(run.runAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const snippet = run.systemPrompt.length > 55 ? run.systemPrompt.slice(0, 55) + '…' : run.systemPrompt;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '9px 14px', borderRadius: 8, marginBottom: 5,
      background: isPrimary ? t.accentDim : isCompare ? 'rgba(99,102,241,0.08)' : t.surfaceAlt,
      border: `1px solid ${isPrimary ? t.accentBorder : isCompare ? 'rgba(99,102,241,0.3)' : t.border}`,
    }}>
      <span style={{ fontFamily: M, fontSize: 11, fontWeight: 600, color: isPrimary ? t.accent : isCompare ? '#6366f1' : t.text3, minWidth: 26 }}>{run.version}</span>
      <span style={{ fontFamily: M, fontSize: 10, color: t.text3, minWidth: 110 }}>{timeStr}</span>
      <div style={{ display: 'flex', gap: 10, flex: 1 }}>
        {EVAL_SCORE_KEYS.map(key => (
          <span key={key} style={{ fontFamily: M, fontSize: 10, color: evalScoreColor(run.averages[key]) }}>
            {run.averages[key]}
          </span>
        ))}
      </div>
      <span style={{ fontFamily: M, fontSize: 9, color: t.text3, flex: 2, minWidth: 100 }}>{snippet}</span>
      <div style={{ display: 'flex', gap: 5 }}>
        <button onClick={onSelectPrimary} style={{
          fontFamily: M, fontSize: 9, letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 4,
          background: isPrimary ? t.accentDim : 'none', border: `1px solid ${isPrimary ? t.accentBorder : t.border}`,
          color: isPrimary ? t.accent : t.text3, cursor: 'pointer',
        }}>view</button>
        <button onClick={onSelectCompare} style={{
          fontFamily: M, fontSize: 9, letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 4,
          background: isCompare ? 'rgba(99,102,241,0.15)' : 'none',
          border: `1px solid ${isCompare ? 'rgba(99,102,241,0.4)' : t.border}`,
          color: isCompare ? '#6366f1' : t.text3, cursor: 'pointer',
        }}>cmp</button>
      </div>
    </div>
  );
}

function EvalScorePill({ label, score }) {
  const color = evalScoreColor(score);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '5px 10px', borderRadius: 6, minWidth: 68,
      background: evalScoreBg(score), border: `1px solid ${color}44`,
    }}>
      <span style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.06em', color: '#888', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>
        {score ?? '?'}
      </span>
    </div>
  );
}

function EvalCompareScorePill({ label, before, after }) {
  const color      = evalScoreColor(after);
  const delta      = (typeof after === 'number' && typeof before === 'number') ? after - before : null;
  const deltaColor = delta > 0 ? '#34c759' : delta < 0 ? '#ff3b30' : '#888';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      padding: '5px 10px', borderRadius: 6, minWidth: 76,
      background: evalScoreBg(after), border: `1px solid ${color}44`,
    }}>
      <span style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.06em', color: '#888', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontFamily: F, fontSize: 17, fontWeight: 700, color, lineHeight: 1 }}>{after ?? '?'}</span>
        {delta !== null && delta !== 0 && (
          <span style={{ fontFamily: M, fontSize: 10, color: deltaColor }}>{delta > 0 ? '+' : ''}{delta}</span>
        )}
      </div>
      <span style={{ fontFamily: M, fontSize: 9, color: '#666' }}>was {before ?? '?'}</span>
    </div>
  );
}

function EvalAvgCard({ label, score, t }) {
  const color = evalScoreColor(score ?? 0);
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12,
      background: t.cardBg, border: `1px solid ${t.border}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: F, fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 4 }}>
        {score !== null && score !== undefined ? score.toFixed(1) : '—'}
      </div>
      <div style={{ fontFamily: M, fontSize: 9, color: t.text3 }}>avg / 5.0</div>
    </div>
  );
}

function EvalCompareAvgCard({ label, before, after, t }) {
  const color      = evalScoreColor(after ?? 0);
  const delta      = (typeof after === 'number' && typeof before === 'number')
    ? Math.round((after - before) * 10) / 10
    : null;
  const deltaColor = delta > 0 ? '#34c759' : delta < 0 ? '#ff3b30' : t.text3;
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 12,
      background: t.cardBg, border: `1px solid ${t.border}`,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: F, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
          {after !== null && after !== undefined ? after.toFixed(1) : '—'}
        </span>
        {delta !== null && (
          <span style={{ fontFamily: M, fontSize: 13, color: deltaColor, fontWeight: 600 }}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
      <div style={{ fontFamily: M, fontSize: 9, color: t.text3 }}>
        baseline: {before !== null && before !== undefined ? before.toFixed(1) : '—'}
      </div>
    </div>
  );
}

function EvalResultCard({ result, compareResult, allRuns, t }) {
  const [expanded, setExpanded] = useState(false);
  const showCompare = !!compareResult;
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 10,
      background: t.cardBg, border: `1px solid ${t.border}`,
    }}>
      {/* Category + question + trend sparkline */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{
          fontFamily: M, fontSize: 10, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
          background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
        }}>
          {result.category}
        </span>
        <div style={{ fontFamily: F, fontSize: 13, color: t.text1, flex: 1, lineHeight: 1.4 }}>
          {result.question}
        </div>
        <EvalQuestionTrend questionId={result.id} allRuns={allRuns} />
      </div>

      {/* Score pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {EVAL_SCORE_KEYS.map(key =>
          showCompare ? (
            <EvalCompareScorePill
              key={key}
              label={EVAL_SCORE_LABELS[key]}
              before={result.scores[key]}
              after={compareResult.scores[key]}
            />
          ) : (
            <EvalScorePill key={key} label={EVAL_SCORE_LABELS[key]} score={result.scores[key]} />
          )
        )}
      </div>

      {/* Judge reasoning */}
      {!showCompare && result.scores.reasoning && (
        <div className="eval-reasoning">{result.scores.reasoning}</div>
      )}

      {/* Toggle response */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
          background: 'none', border: `1px solid ${t.border}`,
          cursor: 'pointer', color: t.text3, padding: '3px 10px', borderRadius: 4,
        }}
      >
        {expanded ? '▾ hide response' : '▸ show response'}
      </button>

      {expanded && !showCompare && (
        <div className="eval-response">{result.response}</div>
      )}

      {expanded && showCompare && (
        <div className="eval-compare-grid">
          <div>
            <div className="eval-compare-col-label">baseline</div>
            {result.scores.reasoning && (
              <div className="eval-compare-reasoning">{result.scores.reasoning}</div>
            )}
            <div className="eval-compare-response">{result.response}</div>
          </div>
          <div>
            <div className="eval-compare-col-label eval-compare-col-label--custom">custom prompt</div>
            {compareResult.scores.reasoning && (
              <div className="eval-compare-reasoning">{compareResult.scores.reasoning}</div>
            )}
            <div className="eval-compare-response eval-compare-response--custom">{compareResult.response}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EvalsTab({ t }) {
  const [runs,         setRuns]         = useState([]);
  const [loadingRuns,  setLoadingRuns]  = useState(true);
  const [primaryId,    setPrimaryId]    = useState(null);
  const [compareId,    setCompareId]    = useState(null);
  const [running,      setRunning]      = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [error,        setError]        = useState(null);

  const primary     = runs.find(r => r.version === primaryId) ?? null;
  const compare     = runs.find(r => r.version === compareId) ?? null;
  const showCompare = !!(primary && compare);

  // Load run history from server on mount
  useEffect(() => {
    fetch('/api/admin/evals/runs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { runs: [] })
      .then(({ runs: loaded }) => {
        setRuns(loaded);
        if (loaded.length) setPrimaryId(loaded[loaded.length - 1].version);
      })
      .catch(() => {})
      .finally(() => setLoadingRuns(false));
  }, []);

  const doRun = useCallback(async (promptOverride) => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/evals/run', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptOverride ? { systemPrompt: promptOverride } : {}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      const newRun = { version: data.version, runAt: data.runAt, systemPrompt: data.systemPrompt, averages: data.averages, results: data.results };
      setRuns(prev => [...prev, newRun]);
      setPrimaryId(data.version);
      setCompareId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    if (!confirm('Clear all eval run history? This cannot be undone.')) return;
    await fetch('/api/admin/evals/runs', { method: 'DELETE', credentials: 'include' });
    setRuns([]);
    setPrimaryId(null);
    setCompareId(null);
  }, []);

  if (loadingRuns) return <TabSpinner t={t} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Description + run button */}
      <div>
        <div style={{ fontFamily: F, fontSize: 13, color: t.text3, lineHeight: 1.6, marginBottom: 20 }}>
          Tests how well Claude (claude-sonnet-4-20250514) answers 10 financial questions across
          investing, markets, bonds, taxes, and more. Each response is scored by a second Claude
          call acting as judge across accuracy, hallucination risk, relevance, and tone (1–5).
          Every run is versioned and persisted server-side — select any two to compare.
        </div>
        <button
          onClick={() => doRun(null)}
          disabled={running}
          style={{
            fontFamily: M, fontSize: 12, letterSpacing: '0.06em',
            padding: '10px 24px', borderRadius: 8, cursor: running ? 'default' : 'pointer',
            background: running ? 'transparent' : t.accentDim,
            border: `1px solid ${running ? t.border : t.accentBorder}`,
            color: running ? t.text3 : t.accent,
            transition: 'all 0.15s',
          }}
        >
          {running ? '↻ running…' : '▶ new run'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          fontFamily: M, fontSize: 11, color: '#ff3b30',
          padding: '10px 14px', borderRadius: 6,
          background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)',
        }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {running && (
        <div style={{
          fontFamily: M, fontSize: 11, color: t.text3, letterSpacing: '0.12em',
          padding: '40px', textAlign: 'center',
          background: t.surfaceAlt, borderRadius: 12, border: `1px solid ${t.border}`,
        }}>
          running evals…&nbsp;&nbsp;<span style={{ fontSize: 10 }}>(~30s — evaluating 10 questions in parallel)</span>
        </div>
      )}

      {/* Score trend chart */}
      {runs.length >= 2 && !running && (
        <div>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 10 }}>
            score trend
          </div>
          <div style={{ background: t.surfaceAlt, borderRadius: 10, padding: '12px 8px', border: `1px solid ${t.border}` }}>
            <EvalTrendChart runs={runs} t={t} />
          </div>
        </div>
      )}

      {/* Run history */}
      {runs.length > 0 && !running && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase' }}>
              run history&nbsp;
              <span style={{ fontFamily: M, fontSize: 9, color: t.text3, letterSpacing: '0.06em' }}>
                — acc · halluc · rel · tone
              </span>
            </div>
            <button onClick={clearHistory} style={{
              fontFamily: M, fontSize: 9, padding: '2px 8px', borderRadius: 4,
              background: 'none', border: `1px solid ${t.border}`, color: t.text3, cursor: 'pointer',
            }}>clear</button>
          </div>
          {[...runs].reverse().map(run => (
            <EvalRunHistoryRow
              key={run.version}
              run={run}
              isPrimary={run.version === primaryId}
              isCompare={run.version === compareId}
              onSelectPrimary={() => { setPrimaryId(run.version); setCompareId(null); }}
              onSelectCompare={() => setCompareId(run.version === compareId ? null : run.version)}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Results for selected run(s) */}
      {primary && !running && (
        <>
          {/* Average score cards */}
          <div>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
              {showCompare ? `${compareId} vs ${primaryId} — average scores` : `${primaryId} — average scores`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 10 }}>
              {EVAL_SCORE_KEYS.map(key =>
                showCompare ? (
                  <EvalCompareAvgCard key={key} label={EVAL_SCORE_LABELS[key]} before={primary.averages[key]} after={compare.averages[key]} t={t} />
                ) : (
                  <EvalAvgCard key={key} label={EVAL_SCORE_LABELS[key]} score={primary.averages[key]} t={t} />
                )
              )}
            </div>
          </div>

          {/* Run metadata */}
          <div style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
            {showCompare
              ? `${primaryId}: ${new Date(primary.runAt).toLocaleString()} · ${compareId}: ${new Date(compare.runAt).toLocaleString()}`
              : `${primaryId} · ${new Date(primary.runAt).toLocaleString()} · "${primary.systemPrompt.slice(0, 70)}${primary.systemPrompt.length > 70 ? '…' : ''}"`
            }
          </div>

          {/* Per-question results */}
          <div>
            <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
              {showCompare ? `per-question — ${compareId} vs ${primaryId}` : 'per-question results'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {primary.results.map(result => (
                <EvalResultCard
                  key={result.id}
                  result={result}
                  compareResult={showCompare ? compare.results.find(r => r.id === result.id) : null}
                  allRuns={runs}
                  t={t}
                />
              ))}
            </div>
          </div>

          {/* Regression testing panel */}
          <div style={{ padding: '20px', borderRadius: 12, background: t.surfaceAlt, border: `1px solid ${t.border}` }}>
            <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.1em', color: t.text3, marginBottom: 12, textTransform: 'uppercase' }}>
              Run with Custom System Prompt
            </div>
            <div style={{ fontFamily: F, fontSize: 12, color: t.text3, marginBottom: 14, lineHeight: 1.5 }}>
              Paste an alternative system prompt to run a new versioned eval. The result will appear in history and you can compare any two runs.
            </div>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="You are a concise financial assistant. Answer in two sentences maximum…"
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: M, fontSize: 11, lineHeight: 1.7,
                color: t.text1, background: t.surface,
                border: `1px solid ${t.border}`, borderRadius: 8,
                padding: '10px 14px', outline: 'none', resize: 'vertical', marginBottom: 12,
              }}
            />
            <button
              onClick={() => doRun(customPrompt.trim())}
              disabled={running || !customPrompt.trim()}
              style={{
                fontFamily: M, fontSize: 12, letterSpacing: '0.06em',
                padding: '10px 24px', borderRadius: 8,
                cursor: running || !customPrompt.trim() ? 'default' : 'pointer',
                background: (running || !customPrompt.trim()) ? 'transparent' : 'rgba(99,102,241,0.1)',
                border: `1px solid ${(running || !customPrompt.trim()) ? t.border : 'rgba(99,102,241,0.4)'}`,
                color: (running || !customPrompt.trim()) ? t.text3 : '#6366f1',
                transition: 'all 0.15s',
              }}
            >
              {running ? '↻ running…' : '⟳ run with custom prompt'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Surveys ──────────────────────────────────────────────────
const SURVEY_MODELS = [
  // Cloudflare Workers AI (free, no key needed)
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B · Workers AI (free)' },
  { id: '@cf/meta/llama-3.1-8b-instruct',           label: 'Llama 3.1 8B · Workers AI (free)' },
  // OpenRouter free tier (requires OPENROUTER_API_KEY secret)
  { id: 'meta-llama/llama-3.3-70b-instruct:free',       label: 'Llama 3.3 70B · Meta / OpenRouter (free)' },
  { id: 'google/gemma-4-31b-it:free',                   label: 'Gemma 4 31B · Google / OpenRouter (free)' },
  { id: 'google/gemma-4-26b-a4b-it:free',               label: 'Gemma 4 26B · Google / OpenRouter (free)' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free',        label: 'Nemotron 3 Super 120B · NVIDIA / OpenRouter (free)' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',           label: 'Nemotron 3 Nano 30B · NVIDIA / OpenRouter (free)' },
  { id: 'nousresearch/hermes-3-llama-3.1-405b:free',     label: 'Hermes 3 405B · Nous / OpenRouter (free)' },
  { id: 'openai/gpt-oss-120b:free',                      label: 'GPT OSS 120B · OpenAI / OpenRouter (free)' },
  { id: 'qwen/qwen3-coder:free',                         label: 'Qwen3 Coder 480B · Alibaba / OpenRouter (free)' },
  // Paid
  { id: 'claude-sonnet-4-6',                             label: 'Claude Sonnet 4.6 (paid)' },
];

const AI_LITERACY_PROMPT = `You are Varun's Owl — a warm, curious, and slightly witty AI guide helping Varun understand how people think about AI.

Your goal: conduct a friendly, conversational survey about AI literacy. Keep each message SHORT (2–4 sentences max). Ask one thing at a time. No bullet points.

Cover these topics naturally across 5–8 exchanges:
1. Current relationship with AI tools (experience level)
2. Specific AI tools they use or have tried
3. Their biggest fears or concerns about AI
4. What they wish they understood better about AI
5. Whether they feel AI could help their work/life and how

IMPORTANT — after EVERY response (including the opening), you MUST append exactly this block on a new line with no text after your message:
---SURVEY_OPTS---{"inputType":"choice","options":["Option A","Option B","Option C"],"done":false}

Rules for the options block:
- For most turns: use "choice" with 2–4 relevant options that match what you just asked
- When asking something open-ended that can't be pre-answered: use "text" with options:null
- For the FINAL message only: set done:true and include a "resources" array: [{"title":"...","url":"...","description":"..."}]
- CRITICAL: Do NOT mention, list, or describe any resources or links inside your prose message — resources go ONLY inside the JSON block after the delimiter. Your final prose message should be a warm sign-off with no URLs or resource names.
- CRITICAL: Never include the delimiter string or any JSON in your visible message text. The delimiter line must appear immediately after your last sentence with nothing between them.
- Keep option labels short (3–6 words)

Start: Greet the user warmly as the owl, introduce yourself briefly, and ask about their current experience with AI tools. Give 3–4 choice options covering the spectrum from "never used" to "use it daily".`;

function SurveysTab({ t }) {
  const [surveys,      setSurveys]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [viewing,      setViewing]      = useState(null);   // { survey, sessions }
  const [transcript,   setTranscript]   = useState(null);   // { session, messages }

  // Create form state
  const [form, setForm] = useState({
    title: '', description: '', system_prompt: AI_LITERACY_PROMPT,
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', allow_retakes: true,
  });
  const [saving,    setSaving]    = useState(false);
  const [copiedId,   setCopiedId]   = useState(null);
  const [editingSlug, setEditingSlug] = useState(null); // { id, value }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/surveys', { credentials: 'include' });
      const data = await res.json();
      setSurveys(data.surveys ?? []);
    } catch { setError('Failed to load surveys'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSurvey = useCallback(async () => {
    if (!form.title.trim() || !form.system_prompt.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/admin/surveys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setForm({ title: '', description: '', system_prompt: AI_LITERACY_PROMPT, model: SURVEY_MODELS[0].id, allow_retakes: true });
      load();
    } finally { setSaving(false); }
  }, [form, load]);

  const toggleActive = useCallback(async (id, current) => {
    await fetch(`/api/admin/surveys/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    load();
  }, [load]);

  const saveSlug = useCallback(async (id, slug) => {
    await fetch(`/api/admin/surveys/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    setEditingSlug(null);
    load();
  }, [load]);

  const deleteSurvey = useCallback(async (id) => {
    if (!confirm('Delete this survey and all its responses?')) return;
    await fetch(`/api/admin/surveys/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }, [load]);

  const viewSessions = useCallback(async (survey) => {
    const res = await fetch(`/api/admin/surveys/${survey.id}/sessions`, { credentials: 'include' });
    const data = await res.json();
    setViewing({ survey, sessions: data.sessions ?? [] });
    setTranscript(null);
  }, []);

  const viewTranscript = useCallback(async (surveyId, sessionId) => {
    const res = await fetch(`/api/admin/surveys/${surveyId}/sessions/${sessionId}`, { credentials: 'include' });
    const data = await res.json();
    setTranscript(data);
  }, []);

  const cell = { fontFamily: M, fontSize: 12, color: t.text2, padding: '10px 12px', borderBottom: `1px solid ${t.border}` };
  const hcell = { ...cell, color: t.text3, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 };

  if (loading) return <TabSpinner t={t} />;
  if (error)   return <TabError msg={error} t={t} />;

  // ── Transcript view ───────────────────────────────────────────
  if (transcript) {
    return (
      <div>
        <button onClick={() => setTranscript(null)} style={{ fontFamily: M, fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
          ← Back to sessions
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {transcript.messages.map((m, i) => (
            <div key={i} style={{
              padding: '10px 14px', borderRadius: 10,
              background: m.role === 'owl' ? t.surfaceAlt : 'rgba(99,102,241,0.1)',
              border: `1px solid ${m.role === 'owl' ? t.border : 'rgba(99,102,241,0.3)'}`,
              alignSelf: m.role === 'owl' ? 'flex-start' : 'flex-end',
              maxWidth: '75%',
            }}>
              <div style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.1em', color: t.text3, marginBottom: 4, textTransform: 'uppercase' }}>{m.role}</div>
              <div style={{ fontFamily: F, fontSize: 13, color: t.text1, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Sessions list view ────────────────────────────────────────
  if (viewing) {
    return (
      <div>
        <button onClick={() => setViewing(null)} style={{ fontFamily: M, fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
          ← Back to surveys
        </button>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 600, color: t.text1, marginBottom: 4 }}>{viewing.survey.title}</div>
        <div style={{ fontFamily: M, fontSize: 11, color: t.text3, marginBottom: 20 }}>
          {viewing.sessions.length} response{viewing.sessions.length !== 1 ? 's' : ''}
        </div>
        {viewing.sessions.length === 0 ? (
          <div style={{ color: t.text3, fontFamily: M, fontSize: 12 }}>No responses yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Session', 'Started', 'Status', 'Messages', ''].map(h => (
                  <th key={h} style={hcell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viewing.sessions.map(s => (
                <tr key={s.id}>
                  <td style={cell}><span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>{s.id.slice(0, 8)}…</span></td>
                  <td style={cell}>{new Date(s.started_at).toLocaleString()}</td>
                  <td style={cell}>
                    <span style={{
                      fontFamily: M, fontSize: 10, padding: '2px 8px', borderRadius: 4,
                      background: s.completed_at ? 'rgba(52,199,89,0.12)' : t.surfaceAlt,
                      color: s.completed_at ? '#34c759' : t.text3,
                      border: `1px solid ${s.completed_at ? 'rgba(52,199,89,0.35)' : t.border}`,
                    }}>
                      {s.completed_at ? 'done' : 'in progress'}
                    </span>
                  </td>
                  <td style={cell}>{s.message_count}</td>
                  <td style={cell}>
                    <button onClick={() => viewTranscript(viewing.survey.id, s.id)} style={{ fontFamily: M, fontSize: 11, color: t.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
                      read →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Create form ───────────────────────────────────────────────
  if (showCreate) {
    const inp = (label, key, placeholder, multiline) => (
      <div style={{ marginBottom: 16 }}>
        <label htmlFor={`sf-${key}`} style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{label}</label>
        {multiline ? (
          <textarea
            id={`sf-${key}`}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            rows={multiline}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: M, fontSize: 11, lineHeight: 1.7, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', outline: 'none', resize: 'vertical' }}
          />
        ) : (
          <input
            id={`sf-${key}`}
            value={form[key]}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: F, fontSize: 13, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', outline: 'none' }}
          />
        )}
      </div>
    );

    return (
      <div>
        <button onClick={() => setShowCreate(false)} style={{ fontFamily: M, fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
          ← Cancel
        </button>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 600, color: t.text1, marginBottom: 24 }}>New survey</div>
        {inp('Title *', 'title', 'e.g. AI Literacy Check-in')}
        {inp('Description', 'description', 'Short description shown on the survey listing page')}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="sf-model" style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Model</label>
          <select
            id="sf-model"
            value={form.model}
            onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
            style={{ fontFamily: F, fontSize: 13, color: t.text1, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', width: '100%', outline: 'none' }}
          >
            {SURVEY_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="checkbox" id="retakes" checked={form.allow_retakes} onChange={e => setForm(f => ({ ...f, allow_retakes: e.target.checked }))} />
          <label htmlFor="retakes" style={{ fontFamily: F, fontSize: 13, color: t.text2, cursor: 'pointer' }}>Allow retakes</label>
        </div>

        {inp('System prompt *', 'system_prompt', 'Instructions for the owl…', 18)}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={createSurvey}
            disabled={saving || !form.title.trim() || !form.system_prompt.trim()}
            style={{ fontFamily: M, fontSize: 12, letterSpacing: '0.06em', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent }}
          >
            {saving ? 'Saving…' : 'Create survey'}
          </button>
        </div>
      </div>
    );
  }

  // ── Survey list ───────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>{surveys.length} survey{surveys.length !== 1 ? 's' : ''}</div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ fontFamily: M, fontSize: 12, letterSpacing: '0.06em', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: t.accentDim, border: `1px solid ${t.accentBorder}`, color: t.accent }}
        >
          + New survey
        </button>
      </div>

      {surveys.length === 0 ? (
        <div style={{ color: t.text3, fontFamily: M, fontSize: 12, padding: '40px 0', textAlign: 'center' }}>
          No surveys yet. Create one to get started.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Title', 'Model', 'Sessions', 'Completed', 'Status', ''].map(h => (
                <th key={h} style={hcell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {surveys.map(s => (
              <tr key={s.id}>
                <td style={cell}>
                  <div style={{ fontFamily: F, fontSize: 13, color: t.text1, fontWeight: 500 }}>{s.title}</div>
                  {s.description && <div style={{ fontFamily: F, fontSize: 11, color: t.text3, marginTop: 2 }}>{s.description.slice(0, 60)}{s.description.length > 60 ? '…' : ''}</div>}
                  {/* Slug inline editor */}
                  {editingSlug?.id === s.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                      <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>/s/</span>
                      <input
                        autoFocus
                        value={editingSlug.value}
                        onChange={e => setEditingSlug(es => ({ ...es, value: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveSlug(s.id, editingSlug.value);
                          if (e.key === 'Escape') setEditingSlug(null);
                        }}
                        style={{ fontFamily: M, fontSize: 10, color: t.text1, background: t.surface, border: `1px solid ${t.accentBorder}`, borderRadius: 4, padding: '2px 6px', outline: 'none', width: 140 }}
                      />
                      <button onClick={() => saveSlug(s.id, editingSlug.value)} style={{ fontFamily: M, fontSize: 10, color: t.accent, background: 'none', border: 'none', cursor: 'pointer' }}>save</button>
                      <button onClick={() => setEditingSlug(null)} style={{ fontFamily: M, fontSize: 10, color: t.text3, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 4 }}>
                      {s.slug ? (
                        <button onClick={() => setEditingSlug({ id: s.id, value: s.slug })} style={{ fontFamily: M, fontSize: 10, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          /s/{s.slug}
                        </button>
                      ) : (
                        <button onClick={() => setEditingSlug({ id: s.id, value: '' })} style={{ fontFamily: M, fontSize: 10, color: t.text3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          + set short URL
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td style={cell}>
                  <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>
                    {SURVEY_MODELS.find(m => m.id === s.model)?.label ?? s.model.split('/').pop()}
                  </span>
                </td>
                <td style={{ ...cell, textAlign: 'center' }}>{s.session_count ?? 0}</td>
                <td style={{ ...cell, textAlign: 'center' }}>{s.completed_count ?? 0}</td>
                <td style={cell}>
                  <span style={{
                    fontFamily: M, fontSize: 10, padding: '2px 8px', borderRadius: 4,
                    background: s.is_active ? 'rgba(52,199,89,0.12)' : t.surfaceAlt,
                    color: s.is_active ? '#34c759' : t.text3,
                    border: `1px solid ${s.is_active ? 'rgba(52,199,89,0.35)' : t.border}`,
                  }}>
                    {s.is_active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                  <button onClick={() => viewSessions(s)} style={{ fontFamily: M, fontSize: 11, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', marginRight: 10 }}>responses</button>
                  <button onClick={() => toggleActive(s.id, s.is_active)} style={{ fontFamily: M, fontSize: 11, color: t.text3, background: 'none', border: 'none', cursor: 'pointer', marginRight: 10 }}>
                    {s.is_active ? 'deactivate' : 'activate'}
                  </button>
                  <button onClick={() => {
                    const link = s.slug
                      ? `${window.location.origin}/s/${s.slug}`
                      : `${window.location.origin}/survey/${s.id}`;
                    navigator.clipboard.writeText(link);
                    setCopiedId(s.id);
                    setTimeout(() => setCopiedId(prev => prev === s.id ? null : prev), 2000);
                  }} style={{ fontFamily: M, fontSize: 11, color: copiedId === s.id ? '#34c759' : t.text3, background: 'none', border: 'none', cursor: 'pointer', marginRight: 10, transition: 'color 0.15s' }}>
                    {copiedId === s.id ? '✓ copied' : 'copy link'}
                  </button>
                  <button onClick={() => deleteSurvey(s.id)} style={{ fontFamily: M, fontSize: 11, color: '#ff3b30', background: 'none', border: 'none', cursor: 'pointer' }}>delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Admin page ────────────────────────────────────────────────────
const TABS = ['Metrics', 'Upgrade Requests', 'Users', 'Models', 'Personas', 'Endpoints', 'LLM Evals', 'Surveys'];

export default function Admin() {
  const { t }       = useTheme();
  const { user, loading } = useAuth();
  const navigate    = useNavigate();
  const [tab,       setTab]       = useState(0);
  const [authChecked, setAuthChecked] = useState(false);

  // Redirect if not signed in
  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  // Check admin access: attempt to fetch upgrade-requests; 403 = not admin
  useEffect(() => {
    if (!user) return;
    fetch('/api/admin/upgrade-requests', { credentials: 'include' })
      .then(r => {
        if (r.status === 403) navigate('/');
        else setAuthChecked(true);
      })
      .catch(() => navigate('/'));
  }, [user, navigate]);

  if (loading || !authChecked) {
    return (
      <div style={{
        minHeight: '100vh', marginTop: 53,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.bg,
      }}>
        <span style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.3em', color: t.text3 }}>
          loading…
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: t.bg, minHeight: '100vh', marginTop: 53, paddingBottom: 80 }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 0' }}>

        {/* Page title */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.2em', color: t.accentMuted, marginBottom: 8, textTransform: 'uppercase' }}>
            admin
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <h1 style={{ fontFamily: F, fontSize: 24, fontWeight: 600, color: t.text1, margin: 0 }}>
              Dashboard
            </h1>
            <VersionBadge fontSize={11} />
          </div>
        </div>

        {/* Tab nav */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: `1px solid ${t.border}`,
          marginBottom: 28,
        }}>
          {TABS.map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i)}
              style={{
                fontFamily: F, fontSize: 14, fontWeight: tab === i ? 600 : 400,
                color: tab === i ? t.text1 : t.text3,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 18px',
                borderBottom: tab === i ? `2px solid ${t.accent}` : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && <MetricsTab t={t} />}
        {tab === 1 && <UpgradeRequestsTab t={t} />}
        {tab === 2 && <UsersTab t={t} />}
        {tab === 3 && <ModelsTab t={t} />}
        {tab === 4 && <PersonasTab t={t} />}
        {tab === 5 && <EndpointsTab t={t} />}
        {tab === 6 && <EvalsTab t={t} />}
        {tab === 7 && <SurveysTab t={t} />}
      </div>
    </div>
  );
}
