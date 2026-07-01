import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';

const M = "'IBM Plex Mono', monospace";
const S = "'Outfit', sans-serif";

const s = {
  page:     { padding: '72px 24px 80px', maxWidth: 900, margin: '0 auto', fontFamily: S },
  h1:       { fontFamily: S, fontSize: 24, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' },
  sub:      { fontFamily: M, fontSize: 11, color: 'var(--text-3)', margin: '0 0 24px' },
  back:     { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: M, fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 20 },
  grid3:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 },
  card:     { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' },
  label:    { fontFamily: M, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5 },
  big:      { fontFamily: S, fontSize: 28, fontWeight: 700, color: 'var(--text-1)' },
  bigGreen: { fontFamily: S, fontSize: 28, fontWeight: 700, color: 'var(--success-color)' },
  section:  { marginBottom: 28 },
  sh:       { fontFamily: S, fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 10px', paddingBottom: 8, borderBottom: '1px solid var(--border)' },
  table:    { width: '100%', borderCollapse: 'collapse', fontFamily: M, fontSize: 12 },
  th:       { textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' },
  td:       { padding: '7px 10px', color: 'var(--text-2)', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' },
  bar:      { height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  fill:     { height: '100%', background: 'var(--accent)', borderRadius: 999 },
  tabs:     { display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid var(--border)' },
  tab:      { fontFamily: M, fontSize: 12, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderBottom: '2px solid transparent', marginBottom: -1 },
  tabAct:   { fontFamily: M, fontSize: 12, padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', borderBottom: '2px solid var(--accent)', marginBottom: -1 },
  btn:      { fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-2)' },
  btnGreen: { fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid var(--accent-border)', background: 'var(--accent-dim)', cursor: 'pointer', color: 'var(--accent)' },
  btnRed:   { fontFamily: M, fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', cursor: 'pointer', color: 'var(--error-color)' },
  err:      { fontFamily: M, fontSize: 12, color: 'var(--error-color)' },
};

const INR_RATES = { INR: 1, USD: 94.7, CAD: 68.1, SGD: 73.1, AED: 25.7 };

function toInr(amount, currency) {
  return Math.round((amount || 0) * (INR_RATES[currency] || 1));
}

function fmtInr(n) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function StatCard({ label, value, valueStyle }) {
  return (
    <div style={s.card}>
      <div style={s.label}>{label}</div>
      <div style={valueStyle || s.big}>{value}</div>
    </div>
  );
}

// ── Timeline chart (same pattern as KamaleshAdmin) ─────────────────
function TimelineChart({ data }) {
  const [tip, setTip] = useState(null);
  if (!data.length) return <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No data for this period.</p>;

  const W = 700, H = 180, pL = 36, pR = 8, pT = 12, pB = 28;
  const cW = W - pL - pR, cH = H - pT - pB;
  const max  = Math.max(...data.map(d => d.count), 1);
  const bW   = cW / data.length;
  const step = Math.max(1, Math.ceil(data.length / 6));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ f, val: Math.round(max * f) }));
  const linePts = data.map((d, i) => `${pL + i * bW + bW / 2},${pT + cH - (d.count / max) * cH}`);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
      onMouseLeave={() => setTip(null)}>
      {yTicks.map(({ f, val }) => {
        const y = pT + cH * (1 - f);
        return (
          <g key={f}>
            <line x1={pL} y1={y} x2={pL + cW} y2={y} stroke="var(--border)" strokeWidth={0.5} />
            {val > 0 && <text x={pL - 4} y={y + 4} textAnchor="end" fill="var(--text-3)" fontSize={9} fontFamily={M}>{val}</text>}
          </g>
        );
      })}
      {data.map((d, i) => {
        const x = pL + i * bW;
        const bH = Math.max((d.count / max) * cH, d.count > 0 ? 2 : 0);
        const y  = pT + cH - bH;
        return (
          <rect key={d.date} x={x + bW * 0.12} y={y} width={bW * 0.76} height={bH}
            fill="var(--accent)" rx={2}
            opacity={tip === null ? 0.65 : tip.i === i ? 1 : 0.3}
            style={{ transition: 'opacity 0.1s', cursor: 'default' }}
            onMouseEnter={() => setTip({ i, d, mx: x + bW / 2 })} />
        );
      })}
      <polyline points={linePts.join(' ')} fill="none" stroke="var(--accent)"
        strokeWidth={1.5} strokeLinejoin="round" opacity={0.5} style={{ pointerEvents: 'none' }} />
      {data.map((d, i) => {
        if (i % step !== 0 && i !== data.length - 1) return null;
        return (
          <text key={d.date} x={pL + i * bW + bW / 2} y={H - 4}
            textAnchor="middle" fill="var(--text-3)" fontSize={9} fontFamily={M}>
            {d.date.slice(5)}
          </text>
        );
      })}
      {tip && (() => {
        const tx = Math.min(Math.max(tip.mx - 38, pL), W - 80);
        const ty = pT + cH - (tip.d.count / max) * cH - 34;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <rect x={tx} y={Math.max(2, ty)} width={76} height={24} rx={4}
              fill="var(--card-bg)" stroke="var(--accent-dim)" strokeWidth={1} />
            <text x={tx + 38} y={Math.max(2, ty) + 15} textAnchor="middle"
              fill="var(--text-1)" fontSize={10} fontFamily={M}>
              {tip.d.count} · {tip.d.date.slice(5)}
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Views tab ──────────────────────────────────────────────────────
function ViewsTab({ slug }) {
  const [days, setDays]       = useState(30);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/page-views?page=fundraiser:${slug}&days=${d}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [slug]);

  useEffect(() => { load(days); }, [days, load]);

  if (error) return <p style={s.err}>{error}</p>;

  const todayStr   = new Date().toISOString().slice(0, 10);
  const todayViews = data?.byDay.find(r => r.date === todayStr)?.count ?? 0;
  const periodSum  = data?.byDay.reduce((a, r) => a + r.count, 0) ?? 0;
  const maxCtry    = Math.max(...(data?.byCountry.map(r => r.count) ?? [1]), 1);

  return (
    <>
      <div style={s.grid3}>
        <StatCard label="Total views (all time)" value={data ? data.total.toLocaleString() : '…'} />
        <StatCard label="Today"                  value={loading ? '…' : todayViews} />
        <StatCard label={`Last ${days} days`}    value={loading ? '…' : periodSum} />
      </div>

      <div style={s.section}>
        <div style={{ ...s.sh, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Views per day</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {[7, 30, 90].map(p => (
              <button key={p} onClick={() => setDays(p)} style={days === p ? s.tabAct : { ...s.tab, padding: '4px 12px' }}>{p}D</button>
            ))}
            <button onClick={() => load(days)} style={{ ...s.btn, marginLeft: 6 }}>↻</button>
          </div>
        </div>
        {loading
          ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>Loading…</p>
          : <TimelineChart data={data?.byDay ?? []} />}
      </div>

      <div style={s.section}>
        <div style={s.sh}>Top countries</div>
        {!data || data.byCountry.length === 0
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
        <div style={s.sh}>Recent visits (last 50)</div>
        {!data || data.last50.length === 0
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

// ── Contributions tab ──────────────────────────────────────────────
function ContributionsTab({ slug }) {
  const [data,    setData]    = useState(null);
  const [filter,  setFilter]  = useState('all');
  const [busy,    setBusy]    = useState({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/fundraisers/${slug}/contributions?filter=${filter}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load contributions');
      setData(await res.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [slug, filter]);

  useEffect(() => { load(); }, [load]);

  async function verify(id, val) {
    setBusy(b => ({ ...b, [id]: true }));
    await fetch(`/api/admin/fundraisers/${slug}/contributions/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verified: val }),
    });
    setBusy(b => ({ ...b, [id]: false }));
    load();
  }

  async function remove(id) {
    if (!window.confirm('Delete this contribution?')) return;
    setBusy(b => ({ ...b, [id]: true }));
    await fetch(`/api/admin/fundraisers/${slug}/contributions/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  }

  if (loading) return <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>Loading…</p>;
  if (error)   return <p style={s.err}>{error}</p>;

  const { totals = {}, totalCount = 0, verifiedCount = 0 } = data;

  // INR equivalent totals
  const verifiedInr = Object.entries(totals).reduce((sum, [cur, t]) => sum + toInr(t.verified, cur), 0);
  const pendingInr  = Object.entries(totals).reduce((sum, [cur, t]) => sum + toInr(t.pending,  cur), 0);

  // per-currency breakdown rows
  const currencies = ['INR', 'USD', 'CAD', 'SGD', 'AED'].filter(c => totals[c]);

  return (
    <>
      {/* Total received */}
      <div style={{ ...s.card, marginBottom: 20, borderColor: 'var(--accent-dim)', background: 'var(--accent-ghost)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ ...s.label, color: 'var(--accent)' }}>Total Received (verified) · INR equivalent</div>
            <div style={{ fontFamily: S, fontSize: 36, fontWeight: 700, color: 'var(--accent)' }}>
              {fmtInr(verifiedInr)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.label}>Pending (if verified)</div>
            <div style={{ fontFamily: S, fontSize: 22, fontWeight: 600, color: 'var(--text-2)' }}>
              + {fmtInr(pendingInr)}
            </div>
          </div>
        </div>
      </div>

      {/* Per-currency cards */}
      {currencies.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          {currencies.map(c => (
            <StatCard key={c}
              label={`Verified ${c}`}
              value={c === 'INR' ? fmtInr(totals[c].verified) : `${c} ${(totals[c].verified || 0).toFixed(2)}`}
              valueStyle={s.bigGreen} />
          ))}
        </div>
      )}

      <p style={{ fontFamily: M, fontSize: 11, color: 'var(--text-3)', marginBottom: 20 }}>
        {verifiedCount} verified · {totalCount - verifiedCount} pending · {totalCount} total
      </p>

      {/* Filter + table */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'pending', 'verified'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={filter === f ? s.tabAct : s.tab}>{f}</button>
        ))}
        <button onClick={load} style={{ ...s.btn, marginLeft: 'auto' }}>refresh</button>
      </div>

      {data.contributions.length === 0
        ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No contributions yet.</p>
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
              {data.contributions.map(row => (
                <tr key={row.id} style={row.verified ? { background: 'rgba(52,211,153,0.04)' } : {}}>
                  <td style={s.td}>{formatDate(row.ts)}</td>
                  <td style={{ ...s.td, color: 'var(--text-1)', fontWeight: 500 }}>{row.name}</td>
                  <td style={{ ...s.td, color: row.verified ? 'var(--success-color)' : 'var(--text-1)', fontWeight: 600 }}>
                    {row.currency === 'INR' ? '₹' : row.currency + ' '}{row.amount.toFixed(2)}
                  </td>
                  <td style={s.td}>{row.sent ? '✓ yes' : 'no'}</td>
                  <td style={s.td}>{row.country || '—'}</td>
                  <td style={{ ...s.td, color: 'var(--text-3)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.note || '—'}
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {row.verified
                        ? <button disabled={busy[row.id]} style={s.btn}     onClick={() => verify(row.id, false)}>Unverify</button>
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
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function FundraiserSlugAdmin() {
  const { slug }  = useParams();
  const [tab, setTab] = useState('contributions');
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    fetch(`/api/fundraiser/${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMeta(d); })
      .catch(() => {});
  }, [slug]);

  const title = meta?.beneficiary ? `${meta.beneficiary} Fundraiser` : `${slug} Fundraiser`;

  return (
    <div style={s.page}>
      <Link to="/admin/fundraisers" style={s.back}>← fundraisers</Link>
      <h1 style={s.h1}>{title}</h1>
      <p style={s.sub}>
        varunr.dev/f/{slug}
        {meta?.goal_inr ? ` · Goal: ₹${Math.round(meta.goal_inr).toLocaleString('en-IN')}` : ''}
      </p>

      <div style={s.tabs}>
        <button style={tab === 'contributions' ? s.tabAct : s.tab} onClick={() => setTab('contributions')}>Contributions</button>
        <button style={tab === 'views'         ? s.tabAct : s.tab} onClick={() => setTab('views')}>Page Views</button>
      </div>

      {tab === 'contributions' && <ContributionsTab slug={slug} />}
      {tab === 'views'         && <ViewsTab slug={slug} />}
    </div>
  );
}
