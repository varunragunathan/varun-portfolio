// ── Discussion monitoring + triage dashboard ───────────────────────
// Route: /admin/discussion
// Two tabs: Monitoring (KPIs, trends, top topics) | Triage (hot threads,
// orphaned topics, deleted comments, top contributors).

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth }  from '../hooks/useAuth';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

const TABS = ['Monitoring', 'Triage'];

// ── Shared helpers ─────────────────────────────────────────────────

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function delta(curr, prev) {
  const d = curr - prev;
  if (d === 0) return null;
  return { n: d, up: d > 0 };
}

// ── Primitive components ───────────────────────────────────────────

function Card({ children, t, style }) {
  return (
    <div style={{
      background: t.cardBg, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '18px 20px', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children, t }) {
  return (
    <div style={{
      fontFamily: M, fontSize: 10, letterSpacing: '0.12em',
      color: t.text3, textTransform: 'uppercase', marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, d, t, accent }) {
  const color = accent ?? t.accent;
  const dEl = d
    ? <span style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.05em', marginLeft: 8, color: d.up ? '#34c759' : '#ff3b30' }}>
        {d.up ? '↑' : '↓'}{Math.abs(d.n)} vs prev wk
      </span>
    : null;
  return (
    <Card t={t}>
      <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: F, fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value ?? '—'}</span>
        {dEl}
      </div>
      {sub && <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 6 }}>{sub}</div>}
    </Card>
  );
}

function MiniBar({ label, value, max, color, t }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontFamily: M, fontSize: 11, color: t.text2, width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: t.surfaceAlt, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontFamily: M, fontSize: 11, color: t.text1, width: 28, textAlign: 'right', flexShrink: 0 }}>{value}</div>
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
        <circle cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${filled} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: F, fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{pct}%</div>
        <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

// ── Activity bar chart (SVG) ───────────────────────────────────────
// Renders two series (topics, comments) for the last 7 calendar days.

function ActivityChart({ topicsByDay, commentsByDay, t, nowMs }) {
  // Fill every day of the last 7 days (ISO date strings)
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowMs - i * 86_400_000);
    days.push(d.toISOString().slice(0, 10));
  }

  const topicsMap   = Object.fromEntries((topicsByDay   ?? []).map(r => [r.day, r.n]));
  const commentsMap = Object.fromEntries((commentsByDay ?? []).map(r => [r.day, r.n]));

  const topicsData   = days.map(d => topicsMap[d]   ?? 0);
  const commentsData = days.map(d => commentsMap[d] ?? 0);
  const maxVal       = Math.max(...topicsData, ...commentsData, 1);

  const W = 600, H = 100, PAD = 6;
  const slotW = W / days.length;
  const barW  = slotW * 0.3;
  const gap   = barW * 0.4;

  const barH = (v) => Math.max(2, ((v / maxVal) * (H - PAD)));
  const x    = (i, offset) => i * slotW + slotW / 2 - barW - gap / 2 + offset;

  const shortDay = (iso) => {
    const [,, d] = iso.split('-');
    const dow = new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
    return `${dow} ${parseInt(d)}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#6366f1' }} />
          <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>Topics</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: '#34c759' }} />
          <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>Comments</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" style={{ overflow: 'visible' }}>
        {days.map((day, i) => {
          const th = barH(topicsData[i]);
          const ch = barH(commentsData[i]);
          return (
            <g key={day}>
              {/* Topics bar */}
              <rect
                x={x(i, 0)} y={H - th}
                width={barW} height={th}
                rx={2} fill="#6366f1" fillOpacity={0.85}
              />
              {/* Comments bar */}
              <rect
                x={x(i, barW + gap)} y={H - ch}
                width={barW} height={ch}
                rx={2} fill="#34c759" fillOpacity={0.85}
              />
              {/* Day label */}
              <text
                x={i * slotW + slotW / 2} y={H + 16}
                textAnchor="middle"
                fontSize={9} fill={t.text3} fontFamily={M}
              >
                {shortDay(day)}
              </text>
            </g>
          );
        })}
        {/* Zero baseline */}
        <line x1={0} y1={H} x2={W} y2={H} stroke={t.border} strokeWidth={1} />
      </svg>
    </div>
  );
}

// ── Spinner / error helpers ────────────────────────────────────────

function Spinner({ t }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: M, fontSize: 11, color: t.text3, letterSpacing: '0.2em' }}>
      loading…
    </div>
  );
}

function TabError({ msg }) {
  return (
    <div style={{ padding: '32px 0', fontFamily: M, fontSize: 12, color: '#ff3b30' }}>
      {msg}
    </div>
  );
}

// ── Monitoring tab ─────────────────────────────────────────────────

function MonitoringTab({ t }) {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/discussion/metrics', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load metrics'); return r.json(); })
      .then(d  => { setData(d); setUpdatedAt(Date.now()); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner t={t} />;
  if (error)            return <TabError msg={error} />;
  if (!data)            return null;

  const { topics, comments, participants, engagement, trends, top_topics } = data;
  const topicDelta   = delta(topics.this_week, topics.prior_week);
  const commentDelta = delta(comments.this_week, comments.prior_week);
  const maxReplies   = Math.max(...(top_topics ?? []).map(t => t.comment_count), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.12em', color: t.text3 }}>
          {updatedAt ? `Updated ${timeAgo(updatedAt)}` : ''}
        </span>
        <button
          onClick={load} disabled={loading}
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

      {/* ── Row 1: Topic KPIs ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label="Total Topics"      value={topics.total}      t={t} accent={t.accent} />
        <StatCard label="Topics This Week"  value={topics.this_week}  d={topicDelta}   t={t} accent="#6366f1" />
        <StatCard label="Topics Today"      value={topics.today}      sub="since midnight"     t={t} accent="#6366f1" />
      </div>

      {/* ── Row 2: Comment KPIs ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label="Total Comments"    value={comments.total}     t={t} accent={t.accent} />
        <StatCard label="Comments This Week" value={comments.this_week} d={commentDelta}  t={t} accent="#34c759" />
        <StatCard label="Comments Today"    value={comments.today}     sub="since midnight"    t={t} accent="#34c759" />
      </div>

      {/* ── Row 3: Engagement KPIs ─────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <StatCard label="Active Users / Week"    value={participants.active_this_week}    sub="posted topic or comment"      t={t} accent="#ec4899" />
        <StatCard label="Avg Comments / Topic"   value={engagement.avg_comments_per_topic} sub="all time"                   t={t} accent={t.accent} />
      </div>

      {/* ── Row 4: Reply rate ring ─────────────────────────────── */}
      <Card t={t}>
        <SectionLabel t={t}>Engagement Quality</SectionLabel>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
          <PctRing pct={engagement.reply_rate_pct} label="reply rate" color="#6366f1" t={t} />
          <div>
            <div style={{ fontFamily: M, fontSize: 11, color: t.text3, marginBottom: 6 }}>
              {engagement.reply_rate_pct}% of topics received at least one reply
            </div>
            <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
              {topics.total - Math.round(topics.total * engagement.reply_rate_pct / 100)} topics still have 0 comments
            </div>
          </div>
        </div>
      </Card>

      {/* ── Row 5: Activity chart ──────────────────────────────── */}
      <Card t={t}>
        <SectionLabel t={t}>Activity — Last 7 Days</SectionLabel>
        <ActivityChart
          topicsByDay={trends.topics_by_day}
          commentsByDay={trends.comments_by_day}
          nowMs={data.generated_at}
          t={t}
        />
      </Card>

      {/* ── Row 6: Top topics ─────────────────────────────────── */}
      <Card t={t}>
        <SectionLabel t={t}>Top Topics by Replies</SectionLabel>
        {top_topics.length === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>No topics yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {top_topics.map(topic => (
              <div key={topic.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <Link
                    to={`/discussion/${topic.id}`}
                    style={{ fontFamily: F, fontSize: 14, color: t.text1, textDecoration: 'none', flex: 1, lineHeight: 1.4 }}
                  >
                    {topic.title}
                  </Link>
                  <span style={{ fontFamily: M, fontSize: 11, color: t.accent, flexShrink: 0 }}>
                    {topic.comment_count} {topic.comment_count === 1 ? 'reply' : 'replies'}
                  </span>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <MiniBar label={topic.author} value={topic.comment_count} max={maxReplies} color="#6366f1" t={t} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Triage tab ─────────────────────────────────────────────────────

function Row({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>;
}

function TriageTab({ t }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/admin/discussion/triage', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to load triage'); return r.json(); })
      .then(d  => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Spinner t={t} />;
  if (error)            return <TabError msg={error} />;
  if (!data)            return null;

  const { hot_threads, orphaned_topics, deleted_comments, top_posters } = data;
  const maxPosts = Math.max(...(top_posters ?? []).map(p => p.posts), 1);

  const TH = ({ children }) => (
    <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3, textTransform: 'uppercase' }}>
      {children}
    </div>
  );

  return (
    <Row>

      {/* Hot threads */}
      <Card t={t}>
        <SectionLabel t={t}>Hot Threads — Most New Comments This Week</SectionLabel>
        {hot_threads.length === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>No activity this week.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Topic', 'Total Replies', 'New This Week'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 0 10px' }}><TH>{h}</TH></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hot_threads.map(ht => (
                <tr key={ht.id} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: '10px 0', paddingRight: 16 }}>
                    <Link
                      to={`/discussion/${ht.id}`}
                      style={{ fontFamily: F, fontSize: 13, color: t.text1, textDecoration: 'none' }}
                    >
                      {ht.title}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 0', paddingRight: 16, fontFamily: M, fontSize: 12, color: t.text2 }}>
                    {ht.comment_count}
                  </td>
                  <td style={{ padding: '10px 0', fontFamily: M, fontSize: 12, color: '#34c759', fontWeight: 700 }}>
                    +{ht.new_this_week}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Orphaned topics */}
      <Card t={t}>
        <SectionLabel t={t}>
          Orphaned Topics — No Replies After 24h ({orphaned_topics.length})
        </SectionLabel>
        {orphaned_topics.length === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: '#34c759' }}>✓ All topics have at least one reply.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orphaned_topics.map(ot => (
              <div key={ot.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
                <div>
                  <Link
                    to={`/discussion/${ot.id}`}
                    style={{ fontFamily: F, fontSize: 13, color: t.text1, textDecoration: 'none', display: 'block', marginBottom: 2 }}
                  >
                    {ot.title}
                  </Link>
                  <span style={{ fontFamily: M, fontSize: 10, color: t.text3 }}>by {ot.author}</span>
                </div>
                <span style={{ fontFamily: M, fontSize: 10, color: '#f5a623', flexShrink: 0, marginLeft: 16 }}>
                  {fmtDate(ot.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Deleted comments */}
      <Card t={t}>
        <SectionLabel t={t}>
          Deleted Comments This Week — {deleted_comments.count_this_week}
        </SectionLabel>
        {deleted_comments.count_this_week === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: '#34c759' }}>✓ No deletions this week.</div>
        ) : deleted_comments.recent.length === 0 ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {deleted_comments.recent.map(dc => (
              <div key={dc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${t.border}` }}>
                <div>
                  <span style={{ fontFamily: M, fontSize: 12, color: '#ff3b30' }}>{dc.author}</span>
                  <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}> deleted comment in </span>
                  <Link
                    to={`/discussion/${dc.topic_id}`}
                    style={{ fontFamily: M, fontSize: 11, color: t.text2, textDecoration: 'none' }}
                  >
                    {dc.topic_title}
                  </Link>
                </div>
                <span style={{ fontFamily: M, fontSize: 10, color: t.text3, flexShrink: 0, marginLeft: 16 }}>
                  {fmtDate(dc.deleted_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Top contributors */}
      <Card t={t}>
        <SectionLabel t={t}>Top Contributors This Week</SectionLabel>
        {top_posters.length === 0 ? (
          <div style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>No activity this week.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top_posters.map(p => (
              <MiniBar key={p.name} label={p.name} value={p.posts} max={maxPosts} color="#6366f1" t={t} />
            ))}
          </div>
        )}
      </Card>
    </Row>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function DiscussionAdmin() {
  const { t }             = useTheme();
  const { user, loading } = useAuth();
  const navigate          = useNavigate();
  const [tab, setTab]     = useState(0);
  const [authChecked, setAuthChecked] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/admin/discussion/metrics', { credentials: 'include' })
      .then(r => { if (r.status === 403) navigate('/'); else setAuthChecked(true); })
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

        {/* Breadcrumb */}
        <div style={{ marginBottom: 24 }}>
          <Link
            to="/admin"
            style={{ fontFamily: M, fontSize: 11, color: t.text3, textDecoration: 'none', letterSpacing: '0.1em' }}
          >
            ← Admin
          </Link>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.2em', color: t.accentMuted, marginBottom: 8, textTransform: 'uppercase' }}>
            admin · discussion
          </div>
          <h1 style={{ fontFamily: F, fontSize: 24, fontWeight: 600, color: t.text1, margin: 0 }}>
            Discussion Dashboard
          </h1>
        </div>

        {/* Tab nav */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}`, marginBottom: 28 }}>
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

        {tab === 0 && <MonitoringTab t={t} />}
        {tab === 1 && <TriageTab     t={t} />}
      </div>
    </div>
  );
}
