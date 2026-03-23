import { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { useResponsive } from '../hooks/useResponsive';
import lighthouseHistoryStatic from '../../lighthouse/history.json';

const PAGES_BASE     = 'https://varunragunathan.github.io/varun-portfolio';
const LH_REPORTS_URL = `${PAGES_BASE}/lighthouse/`;
const LH_HISTORY_URL = 'https://raw.githubusercontent.com/varunragunathan/varun-portfolio/main/lighthouse/history.json';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

const scoreColor = (n) => n >= 90 ? '#34d399' : n >= 70 ? '#fbbf24' : '#f87171';

function ScorePill({ value, label }) {
  const { t } = useTheme();
  return (
    <div style={{ textAlign: 'center', minWidth: 70 }}>
      <div style={{ fontFamily: M, fontSize: 20, fontWeight: 600, color: scoreColor(value) }}>{value}</div>
      <div style={{ fontFamily: F, fontSize: 11, color: t.text3, marginTop: 2 }}>{label}</div>
    </div>
  );
}

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

function Row({ children, last }) {
  const { t } = useTheme();
  return (
    <div style={{
      padding: '16px 20px',
      borderBottom: last ? 'none' : `1px solid ${t.border}`,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      {children}
    </div>
  );
}

export default function Transparency() {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  const [history, setHistory] = useState(lighthouseHistoryStatic);

  useEffect(() => {
    fetch(LH_HISTORY_URL)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data) && data.length > 0) setHistory(data); })
      .catch(() => {});
  }, []);

  const recent = [...history].reverse().slice(0, 10);
  const latest = recent[0];

  return (
    <main style={{ minHeight: '100vh', padding: isMobile ? '80px 16px 48px' : '96px 24px 60px', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontFamily: M, fontSize: isMobile ? 12 : 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>
          varunr.dev
        </div>
        <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: isMobile ? 26 : 32, color: t.text1, margin: '0 0 8px' }}>
          Transparency
        </h1>
        <p style={{ fontFamily: F, fontSize: isMobile ? 14 : 13, color: t.text3, margin: 0, lineHeight: 1.6 }}>
          Lighthouse scores captured automatically after every production deploy. No cherry-picking — every run is recorded.
        </p>
      </div>

      <Section title="Site quality scores" subtitle="Performance, accessibility, best practices, and SEO — scored after each deploy">
        {latest && (
          <Row>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: F, fontSize: 13, color: t.text2, marginBottom: 12 }}>
                Latest — <span style={{ fontFamily: M, color: t.text3 }}>
                  {latest.date}{latest.time ? ` ${latest.time} UTC` : ''} · {latest.sha}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <ScorePill value={latest.performance}   label="Performance" />
                <ScorePill value={latest.accessibility} label="Accessibility" />
                <ScorePill value={latest.bestPractices} label="Best practices" />
                <ScorePill value={latest.seo}           label="SEO" />
              </div>
            </div>
          </Row>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: M, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.border}` }}>
                {['Date', 'Time (UTC)', 'SHA', 'Perf', 'A11y', 'BP', 'SEO'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', color: t.text3, fontWeight: 400, textAlign: ['Date', 'Time (UTC)', 'SHA'].includes(h) ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((row, i) => (
                <tr key={i} style={{ borderBottom: i < recent.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                  <td style={{ padding: '8px 16px', color: t.text2 }}>{row.date}</td>
                  <td style={{ padding: '8px 16px', color: t.text3 }}>{row.time ?? '—'}</td>
                  <td style={{ padding: '8px 16px', color: t.text3 }}>{row.sha}</td>
                  {[row.performance, row.accessibility, row.bestPractices, row.seo].map((v, j) => (
                    <td key={j} style={{ padding: '8px 16px', textAlign: 'center', color: scoreColor(v), fontWeight: 500 }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Full reports" subtitle="Detailed HTML reports from each Lighthouse run">
        <Row last>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: F, fontSize: 14, color: t.text1, marginBottom: 2 }}>Lighthouse report archive</div>
            <div style={{ fontFamily: F, fontSize: 12, color: t.text3 }}>
              Full Lighthouse HTML reports published after each deploy, hosted on GitHub Pages.
            </div>
          </div>
          <a
            href={LH_REPORTS_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px', borderRadius: 8, border: `1px solid ${t.accentBorder}`,
              fontFamily: F, fontSize: 13, color: t.accent, textDecoration: 'none',
              background: t.accentGhost, whiteSpace: 'nowrap',
            }}
          >
            View reports →
          </a>
        </Row>
      </Section>
    </main>
  );
}
