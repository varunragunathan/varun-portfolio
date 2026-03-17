import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';
import { useTypewriter, useCounter } from '../hooks/useAnimations';
import { Fade, SectionHeader, Btn } from '../components/UI';
import ParticleField from '../components/ParticleField';
import { PERSONAL, STATS, PROJECTS, SKILLS, PRINCIPLES, TIMELINE, EDUCATION } from '../data/portfolio';
import FrozenChat from '../components/FrozenChat';
import { useState, useEffect } from 'react';
import { useResponsive } from '../hooks/useResponsive';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ─── Guest view (unauthenticated) ─────────────────────────────────
const GUEST_FEATURES = [
  { tag: 'timeline',  text: '11 years shipping at scale — including identity systems used by 135M+ people' },
  { tag: 'ai chat',   text: 'Ask the AI assistant anything about how this site was built' },
  { tag: 'passkeys',  text: 'Zero-password auth — your device is the credential' },
];

function GuestView() {
  const { t } = useTheme();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 'max(96px, 12vh) 24px 60px',
      opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(20px)',
      transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Identity */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 14px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentDim})`, padding: 2 }}>
            <img src="/varun.png" alt="Varun Ragunathan" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          </div>
          <h1 style={{ fontFamily: F, fontWeight: 400, fontSize: 20, color: t.text1, margin: '0 0 4px' }}>
            Varun Ragunathan
          </h1>
          <p style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accentMuted, margin: 0 }}>
            Staff Software Engineer
          </p>
        </div>

        {/* Sign-in card */}
        <div style={{
          background: t.cardBg, border: `1px solid ${t.border}`,
          borderRadius: 18, padding: '24px 24px 20px',
          position: 'relative', overflow: 'hidden', marginBottom: 10,
        }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${t.accentGhost} 0%, transparent 70%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{ fontFamily: F, fontWeight: 500, fontSize: 16, color: t.text1, margin: '0 0 4px' }}>
              This portfolio is the product.
            </p>
            <p style={{ fontFamily: F, fontSize: 13, color: t.text3, margin: '0 0 18px', lineHeight: 1.6 }}>
              Explore the work, then ask the AI how it was built.
            </p>

            {/* Feature bullets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
              {GUEST_FEATURES.map(({ tag, text }) => (
                <div key={tag} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: M, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: t.accentMuted, background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                    borderRadius: 4, padding: '2px 6px', flexShrink: 0, marginTop: 1,
                  }}>
                    {tag}
                  </span>
                  <span style={{ fontFamily: F, fontSize: 13, color: t.text2, lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>

            <Link
              to="/auth"
              style={{
                display: 'block', padding: '11px', borderRadius: 10, textAlign: 'center',
                fontFamily: F, fontSize: 14, fontWeight: 500, textDecoration: 'none',
                background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
              }}
            >
              Sign in →
            </Link>
            <p style={{ fontFamily: M, fontSize: 10, color: t.text3, textAlign: 'center', margin: '9px 0 0', letterSpacing: '0.04em' }}>
              No password · passkey required
            </p>
          </div>
        </div>

        {/* Live demo chat */}
        <FrozenChat />

      </div>
    </div>
  );
}

// ─── Hero (authenticated) ──────────────────────────────────────────
function Hero() {
  const { t } = useTheme();
  const typed = useTypewriter([
    'identity systems',
    'auth platforms',
    'secure experiences',
    'the occasional hackweek prototype',
  ]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 120); }, []);

  return (
    <header aria-label="Introduction" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 'max(96px, 12vh)', paddingBottom: 40 }}>
      <ParticleField />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 58% 38%, ${t.accentGhost} 0%, transparent 60%)`, pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: `linear-gradient(to top, ${t.bg}, transparent)`, pointerEvents: 'none' }} />

      <div style={{
        position: 'relative', zIndex: 1, maxWidth: 760, padding: '0 24px', textAlign: 'center',
        opacity: loaded ? 1 : 0, transform: loaded ? 'translateY(0)' : 'translateY(26px)',
        transition: 'opacity 0.85s cubic-bezier(0.22,1,0.36,1), transform 0.85s cubic-bezier(0.22,1,0.36,1)',
      }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', margin: '0 auto 18px', background: `linear-gradient(135deg, ${t.accent}, ${t.accentDim})`, padding: 2 }}>
          <img
            src="/varun.png"
            alt="Varun Ragunathan"
            width={92}
            height={92}
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        <div style={{ fontFamily: M, fontSize: 12, fontWeight: 400, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 16 }}>
          {PERSONAL.title} · {PERSONAL.domain}
        </div>

        <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 'clamp(28px, 5.5vw, 50px)', letterSpacing: '-0.02em', lineHeight: 1.12, color: t.text1 }}>
          I build <span style={{ color: t.accent }}>{typed}</span>
          <span aria-hidden="true" style={{ color: t.accent }}>|</span>
          <br />
          <span style={{ color: t.text2 }}>that protect millions of users.</span>
        </h1>

        <p style={{ fontFamily: F, fontSize: 16, fontWeight: 400, color: t.text2, marginTop: 20, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
          11+ years building authentication platforms at eBay. Systems serving 135M+ users, $100M+ revenue impact. Currently exploring what's next.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
          <Btn href="#work" primary>View my work <span aria-hidden="true">→</span></Btn>
          <Btn href={`mailto:${PERSONAL.email}`}>Get in touch</Btn>
        </div>
      </div>
    </header>
  );
}

// ─── Stats ────────────────────────────────────────────────────────
function Stat({ value, suffix, label, delay }) {
  const { t } = useTheme();
  const [ref, count] = useCounter(value);
  return (
    <Fade delay={delay}>
      <div ref={ref} style={{ textAlign: 'center', padding: '22px 8px' }} role="group" aria-label={`${label}: ${value}${suffix}`}>
        <div style={{ fontFamily: F, fontWeight: 300, fontSize: 'clamp(24px, 3.5vw, 36px)', color: t.text1 }}>
          {count}<span style={{ color: t.accent }}>{suffix}</span>
        </div>
        <div style={{ fontFamily: M, fontSize: 10, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.text3, marginTop: 4 }}>{label}</div>
      </div>
    </Fade>
  );
}

function StatsBar() {
  const { t } = useTheme();
  return (
    <section aria-label="Impact metrics" style={{ borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {STATS.map((s, i) => <Stat key={s.label} {...s} delay={i * 80} />)}
      </div>
    </section>
  );
}

// ─── Projects ─────────────────────────────────────────────────────
function ProjectCard({ role, title, description, metrics, tags, featured, delay }) {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  const [hover, setHover] = useState(false);
  return (
    <Fade delay={delay}>
      <article
        tabIndex={0}
        aria-label={`Project: ${title}`}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)} onBlur={() => setHover(false)}
        style={{
          background: hover ? t.cardHover : t.cardBg,
          border: `1px solid ${hover ? t.borderHover : t.border}`,
          borderRadius: 16, padding: '22px 22px 18px',
          transition: 'all 0.35s', position: 'relative', overflow: 'hidden',
        }}
      >
        <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${hover ? t.accentBorder : 'transparent'}, transparent)`, transition: 'all 0.4s' }} />
        <div style={{ fontFamily: M, fontSize: 10, fontWeight: 400, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 5 }}>{role}</div>
        <h3 style={{ fontFamily: F, fontSize: 17, fontWeight: 500, color: t.text1, marginBottom: 7, lineHeight: 1.3 }}>{title}</h3>
        <p style={{ fontFamily: F, fontSize: isMobile ? 18 : 14, fontWeight: 400, color: t.text2, lineHeight: 1.6, marginBottom: 12 }}>{description}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          {metrics.map((m, i) => <span key={i} style={{ fontFamily: M, fontSize: 11, color: t.accentMuted }}>{m}</span>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {tags.map((tg, i) => <span key={i} style={{ fontFamily: M, fontSize: 10, padding: '3px 9px', borderRadius: 6, background: t.tagBg, border: `1px solid ${t.tagBorder}`, color: t.text3 }}>{tg}</span>)}
        </div>
      </article>
    </Fade>
  );
}

function ProjectsSection() {
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px' };
  const featured = PROJECTS.filter(p => p.featured);
  const rest = PROJECTS.filter(p => !p.featured);

  return (
    <section id="work" aria-label="Selected projects" style={sec}>
      <SectionHeader label="Selected work" title="Systems I've architected" subtitle="Each project is a story about tradeoffs, scale, and engineering that compounds." />
      <div style={{ display: 'grid', gap: 14 }}>
        {featured.map((p, i) => <ProjectCard key={p.title} {...p} delay={i * 80} />)}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {rest.slice(0, 2).map((p, i) => <ProjectCard key={p.title} {...p} delay={(i + 1) * 80} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {rest.slice(2).map((p, i) => <ProjectCard key={p.title} {...p} delay={(i + 3) * 80} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Skills ───────────────────────────────────────────────────────
function SkillsSection() {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px', background: t.surfaceAlt };
  return (
    <section aria-label="Technical expertise" style={sec}>
      <SectionHeader label="Expertise" title="What I bring to the table" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 28 }}>
        {SKILLS.map((sg, i) => (
          <Fade key={sg.group} delay={i * 80}>
            <div role="group" aria-label={`${sg.group} skills`}>
              <div style={{ fontFamily: M, fontSize: 10, fontWeight: 400, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.text3, marginBottom: 10 }}>{sg.group}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {sg.items.map(s => (
                  <span key={s} style={{ fontFamily: F, fontSize: isMobile ? 16 : 13, fontWeight: 400, padding: '6px 13px', borderRadius: 10, background: t.cardBg, border: `1px solid ${t.border}`, color: t.text1 }}>{s}</span>
                ))}
              </div>
            </div>
          </Fade>
        ))}
      </div>
    </section>
  );
}

// ─── Philosophy ───────────────────────────────────────────────────
function PhilosophySection() {
  const { t } = useTheme();
  const { isMobile } = useResponsive();
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px' };
  return (
    <section aria-label="Engineering philosophy" style={sec}>
      <SectionHeader label="Philosophy" title="How I think about engineering" subtitle="At Staff level, the job isn't writing code — it's making the decisions that shape what gets built, how, and why." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {PRINCIPLES.map((p, i) => (
          <Fade key={p.title} delay={i * 80}>
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 16, padding: '22px 22px 18px' }}>
              <div aria-hidden="true" style={{ fontSize: 20, marginBottom: 10, color: t.text3 }}>{p.icon}</div>
              <h4 style={{ fontFamily: F, fontSize: 15, fontWeight: 500, color: t.text1, marginBottom: 5, lineHeight: 1.35 }}>{p.title}</h4>
              <p style={{ fontFamily: F, fontSize: isMobile ? 18 : 13, fontWeight: 400, color: t.text2, lineHeight: 1.6 }}>{p.body}</p>
            </div>
          </Fade>
        ))}
      </div>
    </section>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────
function TimelineSection() {
  const { t } = useTheme();
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px', background: t.surfaceAlt };
  return (
    <section aria-label="Career timeline" style={sec}>
      <SectionHeader label="Journey" title="11 years of compounding depth" />
      <div style={{ maxWidth: 580 }} role="list">
        {TIMELINE.map((e, i, arr) => (
          <Fade key={e.period} delay={i * 100}>
            <div role="listitem" style={{ position: 'relative', paddingLeft: 26, paddingBottom: i < arr.length - 1 ? 34 : 0 }}>
              {i < arr.length - 1 && <div aria-hidden="true" style={{ position: 'absolute', left: 4, top: 14, bottom: 0, width: 1, background: t.line }} />}
              <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, width: 9, height: 9, borderRadius: '50%', border: `2px solid ${t.dotBorder}`, background: t.bg, transition: 'background 0.3s' }} />
              <div style={{ fontFamily: M, fontSize: 10, fontWeight: 400, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.text3, marginBottom: 2 }}>{e.period}</div>
              <div style={{ fontFamily: F, fontSize: 16, fontWeight: 500, color: t.text1, lineHeight: 1.35 }}>{e.title}</div>
              <div style={{ fontFamily: F, fontSize: 13, fontWeight: 400, color: t.accentMuted, marginBottom: 3 }}>{e.company}</div>
              <p style={{ fontFamily: F, fontSize: 13, fontWeight: 400, color: t.text2, lineHeight: 1.6 }}>{e.note}</p>
            </div>
          </Fade>
        ))}
      </div>
    </section>
  );
}

// ─── Education ────────────────────────────────────────────────────
function EducationSection() {
  const { t } = useTheme();
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px' };
  return (
    <section aria-label="Education" style={sec}>
      <SectionHeader label="Education" title="The foundations" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {EDUCATION.map((e, i) => (
          <Fade key={e.degree} delay={i * 80}>
            <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 16, padding: 22 }}>
              <div style={{ fontFamily: F, fontSize: 15, fontWeight: 500, color: t.text1 }}>{e.degree}</div>
              <div style={{ fontFamily: F, fontSize: 13, fontWeight: 400, color: t.accentMuted, marginTop: 3 }}>{e.school}</div>
            </div>
          </Fade>
        ))}
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────
function CTASection() {
  const { t } = useTheme();
  const sec = { maxWidth: 920, margin: '0 auto', padding: '80px 24px' };
  return (
    <section aria-label="Contact" style={sec}>
      <Fade>
        <div style={{ background: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 20, padding: '50px 26px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at center, ${t.accentGhost} 0%, transparent 60%)`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontFamily: M, fontSize: 11, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>Let's connect</div>
            <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 'clamp(20px, 3.5vw, 28px)', color: t.text1, marginBottom: 8, lineHeight: 1.2 }}>
              Looking for a Staff+ engineer who ships?
            </h2>
            <p style={{ fontFamily: F, fontSize: 15, fontWeight: 400, color: t.text2, maxWidth: 420, margin: '0 auto 26px', lineHeight: 1.6 }}>
              I'm exploring opportunities where identity, architecture, and impact intersect.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Btn href={`mailto:${PERSONAL.email}`} primary>Email me <span aria-hidden="true">→</span></Btn>
              <Btn href={PERSONAL.linkedin} external>LinkedIn</Btn>
              <Btn href={PERSONAL.github} external>GitHub</Btn>
            </div>
          </div>
        </div>
      </Fade>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────
function Footer() {
  const { t } = useTheme();
  return (
    <footer style={{ borderTop: `1px solid ${t.border}`, padding: '26px 24px', maxWidth: 920, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden="true" style={{ fontFamily: M, fontSize: 12, color: t.accentMuted }}>&lt;/&gt;</span>
        <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>Built with React · Deployed on Cloudflare · $0 infra</span>
      </div>
      <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>© 2026 {PERSONAL.name}</span>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export default function Home() {
  const { user, loading, enabled } = useAuth();
  // Show full content if auth is disabled or user is signed in.
  // While loading, render nothing extra (avoids flash of guest → full).
  const authenticated = !enabled || (!loading && !!user);
  const showGuest = enabled && !loading && !user;

  return (
    <>
      {showGuest ? <GuestView /> : (
        <>
          <Hero />
          {authenticated && (
            <>
              <StatsBar />
              <ProjectsSection />
              <SkillsSection />
              <PhilosophySection />
              <TimelineSection />
              <EducationSection />
              <CTASection />
            </>
          )}
          <Footer />
        </>
      )}
    </>
  );
}
