import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import PixelOwl from './PixelOwl';
import { useTheme } from '../hooks/useTheme';
import './WelcomeTour.css';

export const TOUR_KEY = 'hasSeenWelcomeTour';

const STEPS = [
  {
    owlState: 'done',
    eyebrow: null,
    title: "That wasn't a demo",
    body: "You just registered a real WebAuthn credential. No password, no SMS, no magic link — a cryptographic key pair, your device as the authenticator, a server-side challenge-response. That's production auth, built from scratch.",
  },
  {
    owlState: 'streaming',
    eyebrow: 'Feature 1 of 4',
    title: 'Ask how any of this was built',
    body: "I'm backed by a RAG pipeline trained on 25+ chapters of real engineering docs — actual architecture decisions, tradeoffs, and code. Ask why Cloudflare Workers, how the D1 schema works, or what made WebAuthn the right call. I know.",
  },
  {
    owlState: 'thinking',
    eyebrow: 'Feature 2 of 4',
    title: 'Every decision is documented',
    body: '25 chapters: auth flows, the AI pipeline, edge deployment, database design, Lighthouse CI that auto-files performance PRs. Not a portfolio summary — an engineering journal. The same docs power this chat.',
  },
  {
    owlState: 'idle',
    eyebrow: 'Feature 3 of 4',
    title: 'Identity at scale, for real',
    body: 'Auth platforms built from zero. Identity systems serving 135M+ users. A decade of shipping in production, not demos. The timeline and case studies have the specifics.',
  },
  {
    owlState: 'idle',
    eyebrow: 'Feature 4 of 4',
    title: 'Case studies go all the way',
    body: 'Each project covers the full arc: the problem, the system design, the decisions, and outcomes with real numbers. Not a summary of what I did — the engineering depth is the point.',
  },
  {
    owlState: 'done',
    eyebrow: null,
    title: 'Pick a thread and pull',
    body: "Chat to dig into any part of this. Go to Settings to manage your passkeys, add a new device, or review active sessions. Everything here is the real thing.",
  },
];

const variants = {
  enter: (dir) => ({ x: dir > 0 ? 32 : -32, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir) => ({ x: dir > 0 ? -32 : 32, opacity: 0 }),
};

export default function WelcomeTour({ onDone }) {
  const { t } = useTheme();
  const [step, setStep]         = useState(0);
  const [direction, setDirection] = useState(1);
  const cardRef = useRef(null);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast  = step === STEPS.length - 1;

  const dismiss = useCallback(() => {
    localStorage.setItem(TOUR_KEY, '1');
    onDone();
  }, [onDone]);

  const next = useCallback(() => {
    if (isLast) { dismiss(); return; }
    setDirection(1);
    setStep(s => s + 1);
  }, [isLast, dismiss]);

  const back = useCallback(() => {
    if (isFirst) return;
    setDirection(-1);
    setStep(s => s - 1);
  }, [isFirst]);

  // Keyboard: ESC = skip, arrow keys = navigate
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')      dismiss();
      if (e.key === 'ArrowRight')  next();
      if (e.key === 'ArrowLeft')   back();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss, next, back]);

  // Focus card on mount for keyboard nav
  useEffect(() => { cardRef.current?.focus(); }, []);

  return (
    <div
      className="wt-backdrop"
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) dismiss(); }}
    >
      <motion.div
        ref={cardRef}
        className="wt-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome tour — step ${step + 1} of ${STEPS.length}`}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.22 }}
        style={{
          background: t.surface,
          border: `1px solid ${t.border}`,
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(100,255,218,0.04)',
        }}
      >
        {/* ── Top bar ── */}
        <div className="wt-topbar">
          <span className="wt-label" style={{ color: t.accent }}>Quick tour</span>
          <button
            className="wt-skip"
            onClick={dismiss}
            aria-label="Skip tour"
            style={{ color: t.text2 }}
          >
            skip
          </button>
        </div>

        {/* ── Owl + content ── */}
        <div className="wt-body">
          <div className="wt-owl">
            <PixelOwl size={6} state={current.owlState} />
          </div>

          <div className="wt-content">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {current.eyebrow && (
                  <div className="wt-eyebrow" style={{ color: t.accent }}>
                    {current.eyebrow}
                  </div>
                )}
                <h2 className="wt-title" style={{ color: t.text1 }}>
                  {current.title}
                </h2>
                <p className="wt-body-text" style={{ color: t.text2 }}>
                  {current.body}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Step dots ── */}
        <div className="wt-dots" role="tablist" aria-label="Tour progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              role="tab"
              aria-label={`Step ${i + 1}`}
              aria-selected={i === step}
              className="wt-dot"
              style={{
                width: i === step ? 20 : 6,
                background: i === step ? t.accent : t.border,
              }}
            />
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="wt-footer">
          {!isFirst ? (
            <button
              className="wt-btn-back"
              onClick={back}
              style={{
                border: `1px solid ${t.border}`,
                color: t.text2,
              }}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <button
            className="wt-btn-next"
            onClick={next}
            style={{ background: t.accent, color: t.textInverse }}
          >
            {isLast ? 'Get started' : 'Next →'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
