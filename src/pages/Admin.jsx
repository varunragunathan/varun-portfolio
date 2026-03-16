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
    admin: { bg: 'rgba(245,166,35,0.15)', color: '#f5a623', border: 'rgba(245,166,35,0.35)' },
    pro:   { bg: t.accentDim,             color: t.accent,  border: t.accentBorder          },
    user:  { bg: t.surfaceAlt,            color: t.text3,   border: t.border                },
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
                  {req.masked_email ?? req.maskedEmail ?? '—'}
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
const TABS = ['Upgrade Requests', 'Users', 'Models'];

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
        {tab === 0 && <UpgradeRequestsTab t={t} />}
        {tab === 1 && <UsersTab t={t} />}
        {tab === 2 && <ModelsTab t={t} />}
      </div>
    </div>
  );
}
