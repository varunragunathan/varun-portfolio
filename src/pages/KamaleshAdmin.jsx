import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const M = "'IBM Plex Mono', monospace";
const S = "'Outfit', sans-serif";

const s = {
  page:    { padding: '72px 24px 80px', maxWidth: 820, margin: '0 auto', fontFamily: S },
  h1:      { fontFamily: S, fontSize: 24, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' },
  sub:     { fontFamily: M, fontSize: 11, color: 'var(--text-3)', margin: '0 0 32px' },
  grid:    { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 },
  card:    { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' },
  label:   { fontFamily: M, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 },
  big:     { fontFamily: S, fontSize: 32, fontWeight: 700, color: 'var(--text-1)' },
  section: { marginBottom: 28 },
  sh:      { fontFamily: S, fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 10px', paddingBottom: 8, borderBottom: '1px solid var(--border)' },
  table:   { width: '100%', borderCollapse: 'collapse', fontFamily: M, fontSize: 12 },
  th:      { textAlign: 'left', padding: '6px 10px', color: 'var(--text-3)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' },
  td:      { padding: '7px 10px', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' },
  bar:     { height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  fill:    { height: '100%', background: 'var(--accent)', borderRadius: 999 },
  back:    { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: M, fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 20 },
};

function StatCard({ label, value }) {
  return (
    <div style={s.card}>
      <div style={s.label}>{label}</div>
      <div style={s.big}>{value}</div>
    </div>
  );
}

function formatDate(ts) {
  return new Date(ts * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

export default function KamaleshAdmin() {
  const navigate  = useNavigate();
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/page-views?page=kamalesh', { credentials: 'include' });
      if (res.status === 403) { navigate('/'); return; }
      if (!res.ok) throw new Error('Failed to load');
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ ...s.page, color: 'var(--text-3)' }}>Loading…</div>;
  if (error)   return <div style={{ ...s.page, color: 'var(--error-color)' }}>Error: {error}</div>;

  const maxDay  = Math.max(...(data.byDay.map(r => r.count)), 1);
  const maxCtry = Math.max(...(data.byCountry.map(r => r.count)), 1);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayViews = data.byDay.find(r => r.date === todayStr)?.count ?? 0;
  const last7 = data.byDay.slice(-7).reduce((a, r) => a + r.count, 0);

  return (
    <div style={s.page}>
      <Link to="/admin" style={s.back}>← admin</Link>

      <h1 style={s.h1}>Kamalesh Fundraiser — Views</h1>
      <p style={s.sub}>varunr.dev/kamalesh · page view analytics</p>

      {/* Summary cards */}
      <div style={s.grid}>
        <StatCard label="Total views"   value={data.total.toLocaleString()} />
        <StatCard label="Today"         value={todayViews} />
        <StatCard label="Last 7 days"   value={last7} />
      </div>

      {/* Views by day */}
      <div style={s.section}>
        <div style={s.sh}>Views per day — last 30 days</div>
        {data.byDay.length === 0 ? (
          <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No data yet.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Date</th>
                <th style={s.th}>Views</th>
                <th style={{ ...s.th, width: '40%' }}>Bar</th>
              </tr>
            </thead>
            <tbody>
              {[...data.byDay].reverse().map(row => (
                <tr key={row.date}>
                  <td style={s.td}>{row.date}</td>
                  <td style={{ ...s.td, fontWeight: 600, color: 'var(--text-1)' }}>{row.count}</td>
                  <td style={s.td}>
                    <div style={s.bar}>
                      <div style={{ ...s.fill, width: `${(row.count / maxDay) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* By country */}
      <div style={s.section}>
        <div style={s.sh}>Top countries</div>
        {data.byCountry.length === 0 ? (
          <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No data yet.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Country</th>
                <th style={s.th}>Views</th>
                <th style={{ ...s.th, width: '40%' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {data.byCountry.map(row => (
                <tr key={row.country}>
                  <td style={s.td}>{row.country}</td>
                  <td style={{ ...s.td, fontWeight: 600, color: 'var(--text-1)' }}>{row.count}</td>
                  <td style={s.td}>
                    <div style={s.bar}>
                      <div style={{ ...s.fill, width: `${(row.count / maxCtry) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent visits */}
      <div style={s.section}>
        <div style={{ ...s.sh, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Recent visits (last 50)</span>
          <button
            onClick={load}
            style={{ fontFamily: M, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            refresh
          </button>
        </div>
        {data.last50.length === 0 ? (
          <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No visits yet.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Time</th>
                <th style={s.th}>Country</th>
                <th style={s.th}>Referrer</th>
              </tr>
            </thead>
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
    </div>
  );
}
