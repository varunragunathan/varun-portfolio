import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../hooks/useTheme';
import { useResponsive } from '../hooks/useResponsive';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

const GITHUB_URL = 'https://github.com/varunragunathan/varun-portfolio';

// ── SEO content ──────────────────────────────────────────────────
const PAGE_TITLE  = 'Engineering · Varun Ragunathan — Staff Software Engineer';
const PAGE_DESC   = 'Staff Software Engineer with 11 years building at scale. WebAuthn auth from scratch, Cloudflare edge runtime, 3-layer accessibility pipeline. Architecture decisions and tradeoffs documented in a production portfolio.';

// ── Quick-glance stats ───────────────────────────────────────────
const STATS = [
  { value: '11', unit: 'years', label: 'shipping at scale' },
  { value: '135M+', unit: 'users', label: 'through identity systems I built' },
  { value: '0', unit: 'auth libraries', label: 'in this site\'s backend' },
];

// ── Capability grid ──────────────────────────────────────────────
const CAPABILITIES = [
  {
    category: 'Frontend',
    items: [
      'React 18 + lazy routes',
      'CSS custom properties (22 tokens)',
      'Color blind mode (3 palettes)',
      'Framer Motion animations',
      'PWA + service worker',
      'WCAG 2.0 AA compliant',
    ],
  },
  {
    category: 'Backend / Edge',
    items: [
      'Cloudflare Workers (zero cold start)',
      'D1 — SQLite at the edge',
      'KV — session + preference store',
      'WebAuthn / FIDO2 passkeys',
      'WebSocket (Durable Objects)',
      'Per-IP rate limiting',
    ],
  },
  {
    category: 'Quality / DevOps',
    items: [
      'GitHub Actions CI/CD',
      'Playwright (11 E2E tests)',
      'axe-core WCAG 2.0 scans',
      'Lighthouse CI post-deploy',
      'ESLint + jsx-a11y',
      'Pre-push gates (Husky)',
    ],
  },
];

// ── What's inside ────────────────────────────────────────────────
const INSIDE = [
  { tag: 'auth',          text: 'Auth from scratch — passkeys, TOTP, WhatsApp OTP, recovery codes, trusted devices, step-up auth' },
  { tag: 'edge',          text: 'Entire backend in one Cloudflare Worker — D1 + KV, no server, no ops layer' },
  { tag: 'a11y',          text: 'Three-layer accessibility pipeline — static lint, pre-push axe scan, post-deploy Lighthouse CI' },
  { tag: 'observability', text: 'Admin dashboard — endpoint metrics, sparklines, user management, all on D1 batch queries' },
  { tag: 'ci/cd',         text: 'Every push runs lint + 11 Playwright tests (including WCAG scans) before deploy' },
];

// ── Architecture cards ───────────────────────────────────────────
const CARDS = [
  {
    id: 'auth',
    label: 'Auth from scratch',
    hook: 'WebAuthn passkeys, TOTP, WhatsApp OTP — no Auth0, no Clerk, no Firebase.',
    points: [
      {
        heading: 'WebAuthn / FIDO2 passkeys',
        body: 'Hardware-bound credentials — the private key never leaves the device. Registration and authentication implemented against the WebAuthn spec using @simplewebauthn. Zero password surface, phishing-resistant by design.',
      },
      {
        heading: 'Backup factors',
        body: 'TOTP (RFC 6238) and WhatsApp OTP as fallback methods when a passkey is unavailable. Both are enforced as second factors, not replacements for the primary credential.',
      },
      {
        heading: 'Two-phase session model',
        body: 'After credential verification, a pending session (5-min KV TTL) is issued. The user explicitly chooses a trust level — 24h or 30-day session. Active sessions are stored as SHA-256 hashes, never raw tokens.',
      },
      {
        heading: 'Number matching for trusted devices',
        body: 'Trusted devices can approve new sign-ins in real time via WebSocket (Cloudflare Durable Object). The approving device sees a 3-digit code; the new device waits for confirmation. No push notification service needed.',
      },
      {
        heading: 'Rate limiting and recovery',
        body: 'Per-IP rate limiting on all auth endpoints with configurable windows stored in KV. 10 one-time recovery codes stored as bcrypt hashes. Step-up authentication gates sensitive operations.',
      },
      {
        heading: 'Why no library',
        body: 'Writing auth from scratch makes the trust model explicit — every session lifecycle decision is deliberate, not inherited behavior. The entire auth surface is auditable in one codebase with no third-party dependency risk.',
      },
    ],
  },
  {
    id: 'edge',
    label: 'Edge runtime',
    hook: 'The entire backend fits in one Cloudflare Worker. Zero cold start. No server to manage.',
    points: [
      {
        heading: 'Cloudflare Workers',
        body: 'Runs at the nearest PoP globally, ~0ms cold start. The fetch handler is the server — no Express, no Node.js runtime, no process management.',
      },
      {
        heading: 'D1 — SQLite at the edge',
        body: 'Structured data for sessions, passkeys, users, chat history, endpoint logs. Batch queries reduce round trips — the admin metrics endpoint runs 8 queries in a single db.batch() call.',
      },
      {
        heading: 'KV — fast key-value store',
        body: 'Session tokens, user preferences, rate limit counters, OTP challenges. TTL-based expiry handles session cleanup without a cron job.',
      },
      {
        heading: 'One deploy command',
        body: '`wrangler deploy` bundles the Vite build and the Worker into one artifact. No separate frontend/backend deploy pipelines, no load balancer, no VPC configuration.',
      },
      {
        heading: 'Tradeoffs accepted',
        body: 'No filesystem access, CPU time limits per request, 1MB script budget, no long-running processes outside Durable Objects. All constraints were evaluated — the app fits comfortably within them and gains global distribution in exchange.',
      },
    ],
  },
  {
    id: 'a11y',
    label: 'Accessibility pipeline',
    hook: 'Three automated checks run before any code reaches production.',
    points: [
      {
        heading: 'Layer 1 — ESLint + jsx-a11y (dev time)',
        body: 'Catches structural issues in JSX source before the code runs — missing labels, wrong ARIA roles, non-interactive tabIndex, autoFocus misuse. Runs on every `yarn lint` call.',
      },
      {
        heading: 'Layer 2 — axe-core/playwright (pre-push gate)',
        body: 'Scans the live DOM for WCAG 2.0 AA violations — contrast ratios, focus order, landmark structure. Runs as part of the pre-push Playwright suite. Only critical/serious violations block the push.',
      },
      {
        heading: 'Layer 3 — Lighthouse CI (post-deploy)',
        body: 'Runs Lighthouse against the production URL after every deploy. Scores for performance, accessibility, best practices, and SEO are appended to a history file and visible in Settings → Transparency.',
      },
      {
        heading: 'Real violations caught and fixed',
        body: 'Nav logo contrast failed WCAG AA in light mode (4.07:1, needed 4.5:1) — fixed with a data-theme override to 5.75:1. A ProjectCard had tabIndex={0} with no keyboard action — removed. Missing <main> landmark caught by Lighthouse — fixed.',
      },
      {
        heading: 'Color blind mode',
        body: 'Deuteranopia and tritanopia palettes applied via a second CSS custom property pass in ThemeProvider. All components using var(--accent) or var(--error-color) update automatically — no per-component changes needed.',
      },
    ],
  },
  {
    id: 'theme',
    label: 'Theme system',
    hook: '22 CSS custom property tokens. 3 color blind palettes. Zero component changes needed.',
    points: [
      {
        heading: 'CSS custom properties as the bridge',
        body: 'ThemeProvider writes all 22 tokens to document.documentElement via useLayoutEffect on every theme change. Component CSS files use var(--token) throughout — theme switches are instant with no re-render overhead.',
      },
      {
        heading: 'Two-pass layout effect',
        body: 'Pass 1 sets base theme tokens. Pass 2 applies color blind overrides on top — accent, error, success colors. Two separate effects with separate dependency arrays means color blind changes don\'t re-apply the full base theme unnecessarily.',
      },
      {
        heading: 'Color blind palettes',
        body: 'Deuteranopia: cyan accent → blue (#5ba4f5 dark / #1d4ed8 light), red errors → orange. Tritanopia: cyan accent → orange (#f97316 dark / #ea580c light), green success → purple. Each palette is a partial override — only tokens that change are listed.',
      },
      {
        heading: 'Cross-device preference sync',
        body: 'Theme and color blind mode are stored in Cloudflare KV under prefs:{userId}. On login, the server value overwrites the localStorage cache. Changes PATCH the server immediately — one preference, reflected on every device.',
      },
    ],
  },
  {
    id: 'observability',
    label: 'Admin observability',
    hook: 'A production dashboard showing request volume, error rates, and trends — endpoint by endpoint.',
    points: [
      {
        heading: 'Endpoint metrics',
        body: 'Every API request and page navigation is logged to D1 via ctx.waitUntil — fire-and-forget, no latency impact. Path normalization replaces UUIDs with :id so similar routes group correctly.',
      },
      {
        heading: 'Batch query architecture',
        body: 'The metrics API runs 8 D1 queries in a single db.batch() call — hourly buckets, daily buckets, per-endpoint summaries, sparklines data, and grand totals for both 24h and 7d windows. One network round trip.',
      },
      {
        heading: 'Sparklines without a charting library',
        body: 'Each endpoint row has an inline SVG sparkline — hourly bars for the 24h view, daily bars for 7d. Bar width and gap adapt to bucket count. Built directly in JSX, no chart library dependency.',
      },
      {
        heading: '24h / 7d toggle',
        body: 'One control at the top of the tab switches all stats simultaneously — stat cards, trend chart, per-endpoint table, sparklines. State is derived from a single `view` variable, not duplicated.',
      },
    ],
  },
  {
    id: 'cicd',
    label: 'CI/CD chain',
    hook: 'Commit to Lighthouse score in under 3 minutes. Fully automated, no manual steps.',
    points: [
      {
        heading: 'Pre-push gate',
        body: 'Husky runs ESLint and 11 Playwright tests before any push is accepted. Tests include two axe WCAG 2.0 AA scans — home and auth pages. A failing test blocks the push.',
      },
      {
        heading: 'Deploy workflow',
        body: 'GitHub Actions: Vite build → wrangler deploy to Cloudflare Workers. The static build and Worker script are bundled together. D1 migrations are versioned as SQL files and applied separately.',
      },
      {
        heading: 'Post-deploy Lighthouse',
        body: 'A separate workflow triggers after Deploy completes. Lighthouse CLI runs against the production URL, extracts four scores, and appends them to a history file committed to the main branch.',
      },
      {
        heading: 'Loop prevention',
        body: 'The Lighthouse commit would trigger a new deploy, which would trigger a new Lighthouse run. Two guards break the loop: paths-ignore: [\'lighthouse/**\'] in deploy.yml, and [skip ci] in the Lighthouse commit message.',
      },
    ],
  },
];

// ── Sub-components ───────────────────────────────────────────────

function StatCard({ value, unit, label, isMobile }) {
  const { t } = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: isMobile ? '100%' : 180,
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: isMobile ? '16px 18px' : '18px 20px',
    }}>
      <div style={{ fontFamily: M, fontSize: isMobile ? 26 : 28, fontWeight: 500, color: t.accent, lineHeight: 1 }}>
        {value}
        <span style={{ fontSize: 13, color: t.accentMuted, marginLeft: 6 }}>{unit}</span>
      </div>
      <div style={{ fontFamily: F, fontSize: 13, color: t.text2, marginTop: 6, lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

function CapabilityColumn({ category, items, isMobile }) {
  const { t } = useTheme();
  return (
    <div style={{
      flex: 1, minWidth: isMobile ? '100%' : 200,
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <h2 style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accentMuted, margin: '0 0 14px' }}>
        {category}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: t.accent, flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontFamily: F, fontSize: 13, color: t.text1, lineHeight: 1.4 }}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpandCard({ card, index, isOpen, onToggle, isMobile }) {
  const { t } = useTheme();
  return (
    <div style={{
      border: `1px solid ${isOpen ? t.accentBorder : t.border}`,
      borderRadius: 14, marginBottom: 10, overflow: 'hidden',
      transition: 'border-color 0.2s',
      background: isOpen ? t.accentGhost : 'transparent',
    }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: isMobile ? 12 : 18,
          padding: isMobile ? '16px' : '18px 22px',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontFamily: M, fontSize: 11, color: t.text3, paddingTop: 3,
          minWidth: 22, flexShrink: 0,
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontFamily: F, fontWeight: 500, fontSize: isMobile ? 15 : 16,
            color: isOpen ? t.accent : t.text1, margin: '0 0 4px',
            transition: 'color 0.2s',
          }}>
            {card.label}
          </h2>
          <p style={{ fontFamily: F, fontSize: isMobile ? 13 : 14, color: t.text2, lineHeight: 1.5, margin: 0 }}>
            {card.hook}
          </p>
        </div>
        <span style={{
          fontFamily: M, fontSize: 20, color: isOpen ? t.accent : t.text3,
          flexShrink: 0, paddingTop: 1, transition: 'color 0.2s, transform 0.2s',
          display: 'inline-block',
          transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
        }}>
          +
        </span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              borderTop: `1px solid ${t.border}`,
              padding: isMobile ? '18px 16px 18px 50px' : '22px 22px 22px 62px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              {card.points.map((point, i) => (
                <div key={i}>
                  <h3 style={{ fontFamily: F, fontWeight: 500, fontSize: 14, color: t.text1, margin: '0 0 4px' }}>
                    {point.heading}
                  </h3>
                  <p style={{ fontFamily: F, fontSize: 14, color: t.text2, lineHeight: 1.65, margin: 0 }}>
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function Engineering() {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  const [openCard, setOpenCard] = useState(null);

  // Update page title and meta for SEO / LinkedIn sharing
  useEffect(() => {
    const prevTitle = document.title;
    document.title = PAGE_TITLE;

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc  = metaDesc?.getAttribute('content');
    if (metaDesc) metaDesc.setAttribute('content', PAGE_DESC);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const prevOgTitle = ogTitle?.getAttribute('content');
    if (ogTitle) ogTitle.setAttribute('content', PAGE_TITLE);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    const prevOgDesc = ogDesc?.getAttribute('content');
    if (ogDesc) ogDesc.setAttribute('content', PAGE_DESC);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', 'https://varunr.dev/engineering');

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.setAttribute('content', prevDesc);
      if (ogTitle && prevOgTitle) ogTitle.setAttribute('content', prevOgTitle);
      if (ogDesc && prevOgDesc) ogDesc.setAttribute('content', prevOgDesc);
      if (ogUrl) ogUrl.setAttribute('content', 'https://varunr.dev');
    };
  }, []);

  const toggle = (id) => setOpenCard(prev => prev === id ? null : id);

  return (
    <main
      id="main"
      style={{
        minHeight: '100vh',
        padding: isMobile ? '80px 16px 64px' : '96px 24px 80px',
        maxWidth: 780,
        margin: '0 auto',
      }}
    >
      {/* ── Label ── */}
      <div style={{
        fontFamily: M, fontSize: 10, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: t.accentMuted, marginBottom: 14,
      }}>
        Engineering
      </div>

      {/* ── Headline ── */}
      <h1 style={{
        fontFamily: F, fontWeight: 300, fontSize: isMobile ? 30 : 42,
        color: t.text1, margin: '0 0 16px', lineHeight: 1.1,
      }}>
        This site is the product.
      </h1>
      <p style={{
        fontFamily: F, fontSize: isMobile ? 15 : 18, color: t.text2,
        margin: '0 0 40px', lineHeight: 1.6, maxWidth: 560,
      }}>
        Staff Software Engineer with 11 years building at scale.
        Every pattern, library choice, and architectural tradeoff here is intentional and documented.
      </p>

      {/* ── Stats ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 48, flexWrap: 'wrap' }}>
        {STATS.map(s => (
          <StatCard key={s.value} {...s} isMobile={isMobile} />
        ))}
      </div>

      {/* ── Capability grid ── */}
      <section aria-labelledby="capabilities-heading" style={{ marginBottom: 52 }}>
        <h2 id="capabilities-heading" style={{
          fontFamily: M, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: t.text3, margin: '0 0 16px',
        }}>
          Capabilities
        </h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {CAPABILITIES.map(col => (
            <CapabilityColumn key={col.category} {...col} isMobile={isMobile} />
          ))}
        </div>
      </section>

      {/* ── What's inside this site ── */}
      <section aria-labelledby="inside-heading" style={{ marginBottom: 52 }}>
        <h2 id="inside-heading" style={{
          fontFamily: M, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: t.text3, margin: '0 0 6px',
        }}>
          What's in this site
        </h2>
        <p style={{ fontFamily: F, fontSize: isMobile ? 13 : 14, color: t.text2, margin: '0 0 18px', lineHeight: 1.5 }}>
          This site is a full production system. Here's what's running inside it.
        </p>
        <div style={{
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: 14, padding: isMobile ? '16px' : '20px 24px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          {INSIDE.map(({ tag, text }) => (
            <div key={tag} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                fontFamily: M, fontSize: 10, color: t.accent,
                background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                flexShrink: 0, marginTop: 2, letterSpacing: '0.05em',
              }}>
                {tag}
              </span>
              <span style={{ fontFamily: F, fontSize: isMobile ? 13 : 14, color: t.text1, lineHeight: 1.5 }}>
                {text}
              </span>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <Link
            to="/"
            style={{
              padding: '9px 20px', borderRadius: 8,
              fontFamily: F, fontSize: 14, fontWeight: 500,
              background: t.accentDim, color: t.accent,
              border: `1px solid ${t.accentBorder}`, textDecoration: 'none',
            }}
          >
            Explore the site
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '9px 20px', borderRadius: 8,
              fontFamily: F, fontSize: 14,
              background: 'transparent', color: t.text2,
              border: `1px solid ${t.border}`, textDecoration: 'none',
            }}
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* ── Architecture deep-dives ── */}
      <section aria-labelledby="arch-heading">
        <h2 id="arch-heading" style={{
          fontFamily: M, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          color: t.text3, margin: '0 0 6px',
        }}>
          Architecture decisions
        </h2>
        <p style={{ fontFamily: F, fontSize: isMobile ? 13 : 14, color: t.text2, margin: '0 0 20px', lineHeight: 1.5 }}>
          Six decisions that shaped how this site is built — what was chosen, what was rejected, and why.
          Click any card to read the detail.
        </p>
        <div>
          {CARDS.map((card, i) => (
            <ExpandCard
              key={card.id}
              card={card}
              index={i}
              isOpen={openCard === card.id}
              onToggle={() => toggle(card.id)}
              isMobile={isMobile}
            />
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <div style={{
        marginTop: 52, paddingTop: 24,
        borderTop: `1px solid ${t.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
          varunr.dev · staff software engineer
        </span>
        <Link
          to="/auth"
          style={{ fontFamily: F, fontSize: 13, color: t.accentMuted, textDecoration: 'none' }}
        >
          Sign in to explore →
        </Link>
      </div>
    </main>
  );
}
