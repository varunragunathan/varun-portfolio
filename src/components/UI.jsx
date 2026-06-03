import React from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../hooks/useTheme';
import { usePrefersReducedMotion } from '../hooks/useAnimations';
import './UI.css';

// Spring config reused across hover interactions
const HOVER_SPRING = { type: 'spring', stiffness: 320, damping: 22 };

/** Scroll-triggered fade-in using motion whileInView with spring physics */
export function Fade({ children, delay = 0, style = {} }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div style={style}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.45, delay: delay / 1000, ease: [0.25, 0.4, 0.45, 0.95] }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/** Section heading with label + title + optional subtitle */
export function SectionHeader({ label, title, subtitle }) {
  return (
    <Fade>
      <div className="section-header">
        {label && <div className="section-header__label">{label}</div>}
        <h2 className="section-header__title">{title}</h2>
        {subtitle && <p className="section-header__subtitle">{subtitle}</p>}
      </div>
    </Fade>
  );
}

/** Link-styled button with spring press/hover feedback */
export function Btn({ href, primary, children, external }) {
  return (
    <motion.a
      href={href}
      className={`btn${primary ? ' btn--primary' : ''}`}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={HOVER_SPRING}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </motion.a>
  );
}

// Icons for each theme mode
function SunIcon({ active }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--accent)' : 'var(--text-3)'}
      strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function MoonIcon({ active }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--accent)' : 'var(--text-3)'}
      strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function AutoIcon({ active }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--accent)' : 'var(--text-3)'}
      strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const MODES      = ['auto', 'light', 'dark'];
const MODE_ICONS = { auto: AutoIcon, light: SunIcon, dark: MoonIcon };
const MODE_LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

/** 3-segment theme control (auto / light / dark). */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div role="group" aria-label="Theme preference" className="theme-toggle">
      {MODES.map(m => {
        const Icon   = MODE_ICONS[m];
        const active = preference === m;
        return (
          <button
            key={m}
            onClick={() => setPreference(m)}
            aria-label={MODE_LABELS[m]}
            aria-pressed={active}
            className={`theme-toggle__btn${active ? ' theme-toggle__btn--active' : ''}`}
          >
            <Icon active={active} />
          </button>
        );
      })}
    </div>
  );
}

/** Skip to content link for keyboard users */
export function SkipLink() {
  return <a href="#main" className="skip-link">Skip to content</a>;
}
