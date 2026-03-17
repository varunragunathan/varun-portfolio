// ── Admin dashboard ───────────────────────────────────────────────
// Three tabs: Upgrade Requests | Users | Models
// Redirects to / if user is not admin (detected via 403 on first fetch).

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { startAuthentication } from '@simplewebauthn/browser';

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
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
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
function ModelsTab({ t }) {
  const [models,  setModels]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [form,    setForm]    = useState({ model_id: '', label: '', tier: 'pro' });
  const [adding,  setAdding]  = useState(false);
  const [addErr,  setAddErr]  = useState(null);

  useEffect(() => {
    fetch('/api/admin/models', { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load models');
        return r.json();
      })
      .then(data => { setModels(data.models ?? data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  const toggleModel = useCallback(async (model) => {
    const nextEnabled = model.enabled ? 0 : 1;
    setModels(prev => prev.map(m => m.model_id === model.model_id ? { ...m, enabled: nextEnabled } : m));
    try {
      await fetch(`/api/admin/models/${model.model_id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
    } catch (err) {
      console.error(err);
      // revert
      setModels(prev => prev.map(m => m.model_id === model.model_id ? { ...m, enabled: model.enabled } : m));
    }
  }, []);

  const addModel = useCallback(async () => {
    if (!form.model_id.trim() || !form.label.trim()) {
      setAddErr('model_id and label are required');
      return;
    }
    setAdding(true);
    setAddErr(null);
    try {
      const res = await fetch('/api/admin/models', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed to add model');
      }
      const created = await res.json();
      setModels(prev => [...prev, created.model ?? created]);
      setForm({ model_id: '', label: '', tier: 'pro' });
    } catch (err) {
      setAddErr(err.message);
    } finally {
      setAdding(false);
    }
  }, [form]);

  if (loading) return <TabSpinner t={t} />;
  if (error)   return <TabError msg={error} t={t} />;

  return (
    <div>
      {models.length === 0 ? (
        <div style={{ fontFamily: M, fontSize: 12, color: t.text3, textAlign: 'center', padding: '40px 0' }}>
          no models configured
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 }}>
          {models.map(model => (
            <div key={model.model_id} style={{
              padding: '12px 18px', borderRadius: 10,
              background: t.cardBg, border: `1px solid ${t.border}`,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <Toggle checked={!!model.enabled} onChange={() => toggleModel(model)} t={t} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: M, fontSize: 12, color: t.text1 }}>
                  {model.model_id}
                </div>
                <div style={{ fontFamily: F, fontSize: 12, color: t.text3, marginTop: 2 }}>
                  {model.label}
                </div>
              </div>
              <span style={{
                fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                padding: '2px 8px', borderRadius: 4,
                background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
              }}>
                {model.tier ?? 'pro'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add model form */}
      <div style={{
        padding: '20px', borderRadius: 12,
        background: t.surfaceAlt, border: `1px solid ${t.border}`,
      }}>
        <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.1em', color: t.text3, marginBottom: 14, textTransform: 'uppercase' }}>
          Add Model
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={form.model_id}
            onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
            placeholder="model_id"
            style={{
              flex: '1 1 160px', padding: '8px 12px',
              fontFamily: M, fontSize: 12, color: t.text1,
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: 8, outline: 'none',
            }}
          />
          <input
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Display label"
            style={{
              flex: '2 1 200px', padding: '8px 12px',
              fontFamily: F, fontSize: 13, color: t.text1,
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: 8, outline: 'none',
            }}
          />
          <select
            value={form.tier}
            onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
            style={{
              flex: '0 1 90px', padding: '8px 10px',
              fontFamily: M, fontSize: 12, color: t.text1,
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: 8, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="pro">pro</option>
            <option value="admin">admin</option>
          </select>
          <button
            onClick={addModel}
            disabled={adding}
            style={{
              padding: '8px 20px', borderRadius: 8, cursor: adding ? 'default' : 'pointer',
              fontFamily: M, fontSize: 12,
              background: adding ? 'transparent' : t.accentDim,
              border: `1px solid ${adding ? t.border : t.accentBorder}`,
              color: adding ? t.text3 : t.accent,
              transition: 'all 0.15s',
            }}
          >
            {adding ? '…' : 'add'}
          </button>
        </div>
        {addErr && (
          <div style={{ fontFamily: M, fontSize: 11, color: '#ff3b30', marginTop: 10 }}>
            {addErr}
          </div>
        )}
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
function TabError({ msg, t }) {
  return (
    <div style={{ fontFamily: M, fontSize: 12, color: '#ff3b30', textAlign: 'center', padding: '40px 0' }}>
      {msg}
    </div>
  );
}

// ── Admin page ────────────────────────────────────────────────────
const TABS = ['Metrics', 'Upgrade Requests', 'Users', 'Models', 'Personas'];

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
          <h1 style={{ fontFamily: F, fontSize: 24, fontWeight: 600, color: t.text1, margin: 0 }}>
            Dashboard
          </h1>
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
      </div>
    </div>
  );
}
