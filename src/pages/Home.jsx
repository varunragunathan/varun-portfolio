import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useTypewriter, useCounter } from '../hooks/useAnimations';
import { Fade, SectionHeader, Btn } from '../components/UI';
import ParticleField from '../components/ParticleField';
import { PERSONAL, STATS, PROJECTS, SKILLS, PRINCIPLES, TIMELINE, EDUCATION } from '../data/portfolio';
import FrozenChat from '../components/FrozenChat';
import { useState, useEffect } from 'react';
import WelcomeTour, { TOUR_KEY } from '../components/WelcomeTour';
import './Home.css';

// ─── Guest view (unauthenticated) ─────────────────────────────────
const GUEST_FEATURES = [
  { tag: 'timeline',  text: '11 years shipping at scale — including identity systems used by 135M+ people' },
  { tag: 'ai chat',   text: 'Ask the AI assistant anything about how this site was built' },
  { tag: 'passkeys',  text: 'Zero-password auth — your device is the credential' },
];

function GuestView() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 100); }, []);

  return (
    <div className={`guest-view${loaded ? ' guest-view--loaded' : ''}`}>
      <div className="guest-view__inner">

        {/* Identity */}
        <div className="guest-view__identity">
          <div className="guest-view__avatar-ring">
            <picture>
              <source srcSet="/varun.webp" type="image/webp" />
              <img
                src="/varun-320.jpg"
                alt="Varun Ragunathan"
                className="guest-view__avatar"
                width={80}
                height={80}
                fetchPriority="high"
              />
            </picture>
          </div>
          <h1 className="guest-view__name">Varun Ragunathan</h1>
          <p className="guest-view__title">Staff Software Engineer</p>
        </div>

        {/* Sign-in card */}
        <div className="guest-card">
          <div className="guest-card__gradient" aria-hidden="true" />
          <div className="guest-card__inner">
            <p className="guest-card__headline">This portfolio is the product.</p>
            <p className="guest-card__subtext">Explore the work, then ask the AI how it was built.</p>

            {/* Feature bullets */}
            <div className="guest-card__features">
              {GUEST_FEATURES.map(({ tag, text }) => (
                <div key={tag} className="guest-card__feature">
                  <span className="guest-card__feature-tag">{tag}</span>
                  <span className="guest-card__feature-text">{text}</span>
                </div>
              ))}
            </div>

            <Link to="/auth" className="guest-card__sign-in">Sign in →</Link>
            <p className="guest-card__passkey-note">No password · passkey required</p>
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
  const typed = useTypewriter([
    'identity systems',
    'auth platforms',
    'secure experiences',
    'the occasional hackweek prototype',
  ]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setTimeout(() => setLoaded(true), 120); }, []);

  return (
    <header id="hero" aria-label="Introduction" className="hero">
      <ParticleField />
      <div className="hero__gradient-accent" aria-hidden="true" />
      <div className="hero__gradient-fade" aria-hidden="true" />

      <div className={`hero__inner${loaded ? ' hero__inner--loaded' : ''}`}>
        <div className="hero__avatar-ring">
          <picture>
            <source srcSet="/varun.webp" type="image/webp" />
            <img
              src="/varun-320.jpg"
              alt="Varun Ragunathan"
              width={92}
              height={92}
              className="hero__avatar"
              fetchPriority="high"
            />
          </picture>
        </div>

        <div className="hero__eyebrow">{PERSONAL.title} · {PERSONAL.domain}</div>

        <h1 className="hero__headline">
          I build <span className="hero__typed">{typed}</span>
          <span className="hero__cursor" aria-hidden="true">|</span>
          <br />
          <span style={{ color: 'var(--text-2)' }}>that protect millions of users.</span>
        </h1>

        <p className="hero__subtext">
          11+ years building authentication platforms at eBay. Systems serving 135M+ users, $100M+ revenue impact. Currently exploring what's next.
        </p>

        <div className="hero__actions">
          <Btn href="#work" primary>View my work <span aria-hidden="true">→</span></Btn>
          <Btn href={`mailto:${PERSONAL.email}`}>Get in touch</Btn>
        </div>
      </div>
    </header>
  );
}

// ─── Stats ────────────────────────────────────────────────────────
function Stat({ value, suffix, label, delay }) {
  const [ref, count] = useCounter(value);
  return (
    <Fade delay={delay}>
      <div ref={ref} className="stat" role="group" aria-label={`${label}: ${value}${suffix}`}>
        <div className="stat__value">{count}<span className="stat__suffix">{suffix}</span></div>
        <div className="stat__label">{label}</div>
      </div>
    </Fade>
  );
}

function StatsBar() {
  return (
    <section id="stats" aria-label="Impact metrics" className="stats-bar">
      <div className="stats-bar__grid">
        {STATS.map((s, i) => <Stat key={s.label} {...s} delay={i * 80} />)}
      </div>
    </section>
  );
}

// ─── Projects ─────────────────────────────────────────────────────
function ProjectCard({ role, title, description, metrics, tags, delay }) {
  return (
    <Fade delay={delay}>
      <article
        className="project-card"
        aria-label={`Project: ${title}`}
      >
        <div className="project-card__accent-line" aria-hidden="true" />
        <div className="project-card__role">{role}</div>
        <h3 className="project-card__title">{title}</h3>
        <p className="project-card__description">{description}</p>
        <div className="project-card__metrics">
          {metrics.map((m, i) => <span key={i} className="project-card__metric">{m}</span>)}
        </div>
        <div className="project-card__tags">
          {tags.map((tg, i) => <span key={i} className="project-card__tag">{tg}</span>)}
        </div>
      </article>
    </Fade>
  );
}

function ProjectsSection() {
  const featured = PROJECTS.filter(p => p.featured);
  const rest     = PROJECTS.filter(p => !p.featured);

  return (
    <section id="work" aria-label="Selected projects" className="projects-section">
      <SectionHeader label="Selected work" title="Systems I've architected" subtitle="Each project is a story about tradeoffs, scale, and engineering that compounds." />
      <div className="projects-grid">
        {featured.map((p, i) => <ProjectCard key={p.title} {...p} delay={i * 80} />)}
        <div className="projects-grid--two-col">
          {rest.slice(0, 2).map((p, i) => <ProjectCard key={p.title} {...p} delay={(i + 1) * 80} />)}
        </div>
        <div className="projects-grid--three-col">
          {rest.slice(2).map((p, i) => <ProjectCard key={p.title} {...p} delay={(i + 3) * 80} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Skills ───────────────────────────────────────────────────────
function SkillsSection() {
  return (
    <section id="skills" aria-label="Technical expertise" className="skills-section">
      <div className="skills-section__inner">
        <SectionHeader label="Expertise" title="What I bring to the table" />
        <div className="skills-section__grid">
          {SKILLS.map((sg, i) => (
            <Fade key={sg.group} delay={i * 80}>
              <div className="skill-group" role="group" aria-label={`${sg.group} skills`}>
                <div className="skill-group__label">{sg.group}</div>
                <div className="skill-group__items">
                  {sg.items.map(s => <span key={s} className="skill-tag">{s}</span>)}
                </div>
              </div>
            </Fade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Philosophy ───────────────────────────────────────────────────
function PhilosophySection() {
  return (
    <section id="philosophy" aria-label="Engineering philosophy">
      <div className="philosophy-section__inner">
        <SectionHeader label="Philosophy" title="How I think about engineering" subtitle="At Staff level, the job isn't writing code — it's making the decisions that shape what gets built, how, and why." />
        <div className="philosophy-section__grid">
          {PRINCIPLES.map((p, i) => (
            <Fade key={p.title} delay={i * 80}>
              <div className="principle-card">
                <div className="principle-card__icon" aria-hidden="true">{p.icon}</div>
                <h4 className="principle-card__title">{p.title}</h4>
                <p className="principle-card__body">{p.body}</p>
              </div>
            </Fade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────
function TimelineSection() {
  return (
    <section id="timeline" aria-label="Career timeline" className="timeline-section">
      <div className="timeline-section__inner">
        <SectionHeader label="Journey" title="11 years of compounding depth" />
        <div className="timeline-list" role="list">
          {TIMELINE.map((e, i, arr) => (
            <Fade key={e.period} delay={i * 100}>
              <div role="listitem" className={`timeline-item${i < arr.length - 1 ? ' timeline-item--spaced' : ''}`}>
                {i < arr.length - 1 && <div className="timeline-item__line" aria-hidden="true" />}
                <div className="timeline-item__dot" aria-hidden="true" />
                <div className="timeline-item__period">{e.period}</div>
                <div className="timeline-item__title">{e.title}</div>
                <div className="timeline-item__company">{e.company}</div>
                <p className="timeline-item__note">{e.note}</p>
              </div>
            </Fade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Education ────────────────────────────────────────────────────
function EducationSection() {
  return (
    <section id="education" aria-label="Education">
      <div className="education-section__inner">
        <SectionHeader label="Education" title="The foundations" />
        <div className="education-section__grid">
          {EDUCATION.map((e, i) => (
            <Fade key={e.degree} delay={i * 80}>
              <div className="education-card">
                <div className="education-card__degree">{e.degree}</div>
                <div className="education-card__school">{e.school}</div>
              </div>
            </Fade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section id="contact" aria-label="Contact">
      <div className="cta-section__inner">
        <Fade>
          <div className="cta-card">
            <div className="cta-card__gradient" aria-hidden="true" />
            <div className="cta-card__content">
              <div className="cta-card__eyebrow">Let's connect</div>
              <h2 className="cta-card__headline">Looking for a Staff+ engineer who ships?</h2>
              <p className="cta-card__body">
                I'm exploring opportunities where identity, architecture, and impact intersect.
              </p>
              <div className="cta-card__actions">
                <Btn href={`mailto:${PERSONAL.email}`} primary>Email me <span aria-hidden="true">→</span></Btn>
                <Btn href={PERSONAL.linkedin} external>LinkedIn</Btn>
                <Btn href={PERSONAL.github} external>GitHub</Btn>
              </div>
            </div>
          </div>
        </Fade>
      </div>
    </section>
  );
}

// ─── Home footer ───────────────────────────────────────────────────
function HomeFooter() {
  return (
    <footer className="home-footer">
      <div className="home-footer__brand">
        <span className="home-footer__icon" aria-hidden="true">&lt;/&gt;</span>
        <span className="home-footer__tagline">Built with React · Deployed on Cloudflare · $0 infra</span>
      </div>
      <span className="home-footer__copyright">© 2026 {PERSONAL.name}</span>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────
export default function Home() {
  const { user, loading, enabled } = useAuth();
  const authenticated = !enabled || (!loading && !!user);
  const showGuest     = enabled && !loading && !user;

  const [showTour, setShowTour] = useState(false);

  // Show tour once for newly authenticated users
  useEffect(() => {
    if (enabled && !loading && user && !localStorage.getItem(TOUR_KEY)) {
      setShowTour(true);
    }
  }, [enabled, loading, user]);

  // Don't render during auth check — prevents Hero→GuestView layout flash.
  // Background colour is already correct via CSS vars set before React loads.
  if (enabled && loading) return null;

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
          <HomeFooter />
        </>
      )}
      {showTour && <WelcomeTour onDone={() => setShowTour(false)} />}
    </>
  );
}
