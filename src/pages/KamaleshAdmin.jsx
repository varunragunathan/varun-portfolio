import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const M = "'IBM Plex Mono', monospace";
const S = "'Outfit', sans-serif";

const s = {
  page:    { padding: '72px 24px 80px', maxWidth: 860, margin: '0 auto', fontFamily: S },
  h1:      { fontFamily: S, fontSize: 24, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' },
  sub:     { fontFamily: M, fontSize: 11, color: 'var(--text-3)', margin: '0 0 24px' },
  grid3:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 },
  grid4:   { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 },
  card:    { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' },
  label:   { fontFamily: M, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5 },
  big:     { fontFamily: S, fontSize: 28, fontWeight: 700, color: 'var(--text-1)' },
  bigGreen:{ fontFamily: S, fontSize: 28, fontWeight: 700, color: 'var(--success-color)' },
  section: { marginBottom: 28 },
  sh:      { fontFamily: S, fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 10px', paddingBottom: 8, borderBottom: '1px solid var(--border)' },
  table:   { width: '100%', borderCollapse: 'collapse', fontFamily: M, fontSize: 12 },
  th:      { textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' },
  td:      { padding: '7px 10px', color: 'var(--text-2)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  bar:     { height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  fill:    { height: '100%', background: 'var(--accent)', borderRadius: 999 },
  back:    { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: M, fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 20 },
  tabs:    { display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid var(--border)' },
  tab:     { fontFamily: M, fontSize: 12, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabAct:  { fontFamily: M, fontSize: 12, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', borderBottom: '2px solid var(--accent)', marginBottom: -1 },
  btn:     { fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-2)' },
  btnGreen:{ fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', cursor: 'pointer', color: 'var(--accent)' },
  btnRed:  { fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', cursor: 'pointer', color: 'var(--error-color)' },
};

function StatCard({ label, value, valueStyle }) {
  return (
    <div style={s.card}>
      <div style={s.label}>{label}</div>
      <div style={valueStyle || s.big}>{value}</div>
    </div>
  );
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

// ── Views tab ─────────────────────────────────────────────────────
function ViewsTab({ data, onRefresh }) {
  const maxDay  = Math.max(...(data.byDay.map(r => r.count)), 1);
  const maxCtry = Math.max(...(data.byCountry.map(r => r.count)), 1);
  const todayStr   = new Date().toISOString().slice(0, 10);
  const todayViews = data.byDay.find(r => r.date === todayStr)?.count ?? 0;
  const last7      = data.byDay.slice(-7).reduce((a, r) => a + r.count, 0);

  return (
    <>
      <div style={s.grid3}>
        <StatCard label="Total views"  value={data.total.toLocaleString()} />
        <StatCard label="Today"        value={todayViews} />
        <StatCard label="Last 7 days"  value={last7} />
      </div>

      <div style={s.section}>
        <div style={s.sh}>Views per day — last 30 days</div>
        {data.byDay.length === 0
          ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No data yet.</p>
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Views</th>
                <th style={{ ...s.th, width: '40%' }}>Bar</th>
              </tr></thead>
              <tbody>
                {[...data.byDay].reverse().map(row => (
                  <tr key={row.date}>
                    <td style={s.td}>{row.date}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: 'var(--text-1)' }}>{row.count}</td>
                    <td style={s.td}><div style={s.bar}><div style={{ ...s.fill, width: `${(row.count / maxDay) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div style={s.section}>
        <div style={s.sh}>Top countries</div>
        {data.byCountry.length === 0
          ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No data yet.</p>
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Country</th>
                <th style={s.th}>Views</th>
                <th style={{ ...s.th, width: '40%' }}>Share</th>
              </tr></thead>
              <tbody>
                {data.byCountry.map(row => (
                  <tr key={row.country}>
                    <td style={s.td}>{row.country}</td>
                    <td style={{ ...s.td, fontWeight: 600, color: 'var(--text-1)' }}>{row.count}</td>
                    <td style={s.td}><div style={s.bar}><div style={{ ...s.fill, width: `${(row.count / maxCtry) * 100}%` }} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div style={s.section}>
        <div style={{ ...s.sh, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Recent visits (last 50)</span>
          <button onClick={onRefresh} style={{ ...s.btn, borderColor: 'transparent' }}>refresh</button>
        </div>
        {data.last50.length === 0
          ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No visits yet.</p>
          : (
            <table style={s.table}>
              <thead><tr>
                <th style={s.th}>Time</th>
                <th style={s.th}>Country</th>
                <th style={s.th}>Referrer</th>
              </tr></thead>
              <tbody>
                {data.last50.map((row, i) => (
                  <tr key={i}>
                    <td style={s.td}>{formatDate(row.ts)}</td>
                    <td style={s.td}>{row.country || '—'}</td>
                    <td style={{ ...s.td, color: 'var(--text-3)' }}>{row.referrer || 'direct'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </>
  );
}

const DEFAULT_RATES = { usd: 84.7, cad: 68.1, sgd: 73.1, aed: 25.7 };

// ── Rates editor ──────────────────────────────────────────────────
function RatesEditor({ onRatesChange }) {
  const [rates,   setRates]   = useState(null);
  const [draft,   setDraft]   = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  useEffect(() => {
    fetch('/api/admin/kamalesh/rates', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setRates(d.rates); setDraft(d.rates); }
      })
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true); setMsg('');
    try {
      const res = await fetch('/api/admin/kamalesh/rates', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || 'Failed to save'); return; }
      setRates(d.rates); setDraft(d.rates);
      setMsg('Saved ✓');
      onRatesChange(d.rates);
    } catch { setMsg('Network error'); }
    finally { setSaving(false); }
  }

  function reset() {
    setDraft({ ...DEFAULT_RATES });
    setMsg('');
  }

  if (!draft) return null;

  const fields = [
    { key: 'usd', label: 'USD → INR', prefix: '$' },
    { key: 'cad', label: 'CAD → INR', prefix: 'C$' },
    { key: 'sgd', label: 'SGD → INR', prefix: 'S$' },
    { key: 'aed', label: 'AED → INR', prefix: 'د.إ' },
  ];

  const changed = JSON.stringify(draft) !== JSON.stringify(rates);

  return (
    <div style={{ ...s.card, marginTop: 28 }}>
      <div style={{ ...s.sh, marginBottom: 14 }}>Exchange Rates (1 unit → INR)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {fields.map(({ key, label, prefix }) => (
          <div key={key}>
            <div style={{ ...s.label, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>{prefix}1 =</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={draft[key]}
                onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                style={{
                  fontFamily: M, fontSize: 13, width: 80,
                  background: 'var(--surface-alt)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '4px 8px', color: 'var(--text-1)',
                }}
              />
              <span style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>₹</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={save} disabled={saving || !changed} style={s.btnGreen}>
          {saving ? 'Saving…' : 'Save rates'}
        </button>
        <button onClick={reset} style={s.btn}>Reset to defaults</button>
        {msg && <span style={{ fontFamily: M, fontSize: 11, color: msg.includes('✓') ? 'var(--success-color)' : 'var(--error-color)' }}>{msg}</span>}
      </div>
    </div>
  );
}

// ── Pledges tab ───────────────────────────────────────────────────
function PledgesTab() {
  const [data,    setData]    = useState(null);
  const [filter,  setFilter]  = useState('all');
  const [busy,    setBusy]    = useState({});
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveRates, setLiveRates] = useState(DEFAULT_RATES);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/kamalesh/pledges?filter=${filter}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load pledges');
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function verify(id, val) {
    setBusy(b => ({ ...b, [id]: true }));
    await fetch(`/api/admin/kamalesh/pledges/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: val }),
    });
    setBusy(b => ({ ...b, [id]: false }));
    load();
  }

  async function remove(id) {
    if (!window.confirm('Delete this pledge?')) return;
    setBusy(b => ({ ...b, [id]: true }));
    await fetch(`/api/admin/kamalesh/pledges/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  if (loading) return <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>Loading…</p>;
  if (error)   return <p style={{ fontFamily: M, fontSize: 12, color: 'var(--error-color)' }}>{error}</p>;

  const t = data.totals;
  const r = liveRates;

  const verifiedInrEq = Math.round(
    (t?.verified_usd ?? 0) * r.usd +
    (t?.verified_cad ?? 0) * r.cad +
    (t?.verified_inr ?? 0) +
    (t?.verified_sgd ?? 0) * r.sgd +
    (t?.verified_aed ?? 0) * r.aed
  );
  const pendingInrEq = Math.round(
    (t?.pending_usd ?? 0) * r.usd +
    (t?.pending_cad ?? 0) * r.cad +
    (t?.pending_inr ?? 0) +
    (t?.pending_sgd ?? 0) * r.sgd +
    (t?.pending_aed ?? 0) * r.aed
  );

  const breakdownParts = [
    t?.verified_usd > 0 && `$${(t.verified_usd).toFixed(2)} × ${r.usd}`,
    t?.verified_cad > 0 && `C$${(t.verified_cad).toFixed(2)} × ${r.cad}`,
    t?.verified_sgd > 0 && `S$${(t.verified_sgd).toFixed(2)} × ${r.sgd}`,
    t?.verified_aed > 0 && `د.إ${(t.verified_aed).toFixed(2)} × ${r.aed}`,
    t?.verified_inr > 0 && `₹${Math.round(t.verified_inr).toLocaleString()} direct`,
  ].filter(Boolean);

  return (
    <>
      {/* Total received — INR equivalent */}
      <div style={{ ...s.card, marginBottom: 20, borderColor: 'var(--accent-dim)', background: 'var(--accent-ghost)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ ...s.label, color: 'var(--accent)' }}>Total Received (verified) · INR equivalent</div>
            <div style={{ fontFamily: S, fontSize: 36, fontWeight: 700, color: 'var(--accent)' }}>
              ₹{verifiedInrEq.toLocaleString('en-IN')}
            </div>
            {breakdownParts.length > 0 && (
              <div style={{ fontFamily: M, fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                {breakdownParts.join(' + ')}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ ...s.label }}>Pending (if verified)</div>
            <div style={{ fontFamily: S, fontSize: 22, fontWeight: 600, color: 'var(--text-2)' }}>
              + ₹{pendingInrEq.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      </div>

      {/* Per-currency breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <StatCard label="Verified USD"  value={`$${(t?.verified_usd ?? 0).toFixed(2)}`}  valueStyle={s.bigGreen} />
        <StatCard label="Verified CAD"  value={`C$${(t?.verified_cad ?? 0).toFixed(2)}`} valueStyle={s.bigGreen} />
        <StatCard label="Verified INR"  value={`₹${Math.round(t?.verified_inr ?? 0).toLocaleString()}`} valueStyle={s.bigGreen} />
        <StatCard label="Verified SGD"  value={`S$${(t?.verified_sgd ?? 0).toFixed(2)}`} valueStyle={s.bigGreen} />
        <StatCard label="Verified AED"  value={`د.إ${(t?.verified_aed ?? 0).toFixed(2)}`} valueStyle={s.bigGreen} />
        <StatCard label="Pending USD"   value={`$${(t?.pending_usd ?? 0).toFixed(2)}`} />
        <StatCard label="Pending CAD"   value={`C$${(t?.pending_cad ?? 0).toFixed(2)}`} />
        <StatCard label="Pending INR"   value={`₹${Math.round(t?.pending_inr ?? 0).toLocaleString()}`} />
        <StatCard label="Pending SGD"   value={`S$${(t?.pending_sgd ?? 0).toFixed(2)}`} />
        <StatCard label="Pending AED"   value={`د.إ${(t?.pending_aed ?? 0).toFixed(2)}`} />
      </div>
      <p style={{ fontFamily: M, fontSize: 11, color: 'var(--text-3)', marginBottom: 20, marginTop: -20 }}>
        {t?.verified_count ?? 0} verified · {(t?.total_count ?? 0) - (t?.verified_count ?? 0)} pending · {t?.total_count ?? 0} total
      </p>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'pending', 'verified'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={filter === f ? s.tabAct : s.tab}>
            {f}
          </button>
        ))}
        <button onClick={load} style={{ ...s.btn, marginLeft: 'auto' }}>refresh</button>
      </div>

      {data.pledges.length === 0
        ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No pledges yet.</p>
        : (
          <table style={s.table}>
            <thead><tr>
              <th style={s.th}>Time</th>
              <th style={s.th}>Name</th>
              <th style={s.th}>Amount</th>
              <th style={s.th}>Sent?</th>
              <th style={s.th}>Country</th>
              <th style={s.th}>Note</th>
              <th style={s.th}>Actions</th>
            </tr></thead>
            <tbody>
              {data.pledges.map(row => (
                <tr key={row.id} style={row.verified ? { background: 'rgba(52,211,153,0.04)' } : {}}>
                  <td style={s.td}>{formatDate(row.ts)}</td>
                  <td style={{ ...s.td, color: 'var(--text-1)', fontWeight: 500 }}>{row.name}</td>
                  <td style={{ ...s.td, color: row.verified ? 'var(--success-color)' : 'var(--text-1)', fontWeight: 600 }}>
                    {row.currency === 'USD' ? '$' : 'C$'}{row.amount.toFixed(2)}
                  </td>
                  <td style={s.td}>{row.sent ? '✓ yes' : 'no'}</td>
                  <td style={s.td}>{row.country || '—'}</td>
                  <td style={{ ...s.td, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.note || '—'}
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {row.verified
                        ? <button disabled={busy[row.id]} style={s.btn} onClick={() => verify(row.id, false)}>Unverify</button>
                        : <button disabled={busy[row.id]} style={s.btnGreen} onClick={() => verify(row.id, true)}>Verify ✓</button>
                      }
                      <button disabled={busy[row.id]} style={s.btnRed} onClick={() => remove(row.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

      <RatesEditor onRatesChange={setLiveRates} />
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function KamaleshAdmin() {
  const navigate  = useNavigate();
  const [tab,     setTab]     = useState('pledges');
  const [views,   setViews]   = useState(null);
  const [vError,  setVError]  = useState(null);
  const [vLoad,   setVLoad]   = useState(false);

  const loadViews = useCallback(async () => {
    setVLoad(true);
    try {
      const res = await fetch('/api/admin/page-views?page=kamalesh', { credentials: 'include' });
      if (res.status === 403) { navigate('/'); return; }
      if (!res.ok) throw new Error('Failed to load');
      setViews(await res.json());
    } catch (e) { setVError(e.message); }
    finally { setVLoad(false); }
  }, [navigate]);

  useEffect(() => {
    if (tab === 'views' && !views) loadViews();
  }, [tab, views, loadViews]);

  return (
    <div style={s.page}>
      <Link to="/admin" style={s.back}>← admin</Link>
      <h1 style={s.h1}>Kamalesh Fundraiser</h1>
      <p style={s.sub}>varunr.dev/kamalesh · donations &amp; analytics</p>

      <div style={s.tabs}>
        <button style={tab === 'pledges' ? s.tabAct : s.tab} onClick={() => setTab('pledges')}>Pledges</button>
        <button style={tab === 'views'   ? s.tabAct : s.tab} onClick={() => setTab('views')}>Page Views</button>
      </div>

      {tab === 'pledges' && <PledgesTab />}

      {tab === 'views' && (
        vLoad  ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>Loading…</p> :
        vError ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--error-color)' }}>{vError}</p> :
        views  ? <ViewsTab data={views} onRefresh={loadViews} /> :
        null
      )}
    </div>
  );
}
