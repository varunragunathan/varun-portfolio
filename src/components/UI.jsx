import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { useFadeIn } from '../hooks/useAnimations';
import './UI.css';

/** Scroll-triggered fade-in wrapper */
export function Fade({ children, delay = 0, style = {} }) {
  const [ref, visible, reduced] = useFadeIn();
  return (
    <div
      ref={ref}
      className={`fade${visible ? ' fade--visible' : ''}${reduced ? ' fade--reduced' : ''}`}
      style={{ '--fade-delay': `${delay}ms`, ...style }}
    >
      {children}
    </div>
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

/** Link-styled button */
export function Btn({ href, primary, children, external }) {
  return (
    <a
      href={href}
      className={`btn${primary ? ' btn--primary' : ''}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
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
