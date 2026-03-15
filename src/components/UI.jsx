import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { useFadeIn } from '../hooks/useAnimations';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

/** Scroll-triggered fade-in wrapper */
export function Fade({ children, delay = 0, style = {} }) {
  const [ref, visible, reduced] = useFadeIn();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(18px)',
      transition: reduced ? 'none' : `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Section heading with label + title + optional subtitle */
export function SectionHeader({ label, title, subtitle }) {
  const { t } = useTheme();
  return (
    <Fade>
      <div style={{ marginBottom: 44 }}>
        {label && (
          <div style={{ fontFamily: M, fontSize: 11, fontWeight: 400, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 8 }}>
            {label}
          </div>
        )}
        <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 'clamp(24px, 4vw, 40px)', letterSpacing: '-0.01em', lineHeight: 1.15, color: t.text1 }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ fontFamily: F, fontSize: 16, fontWeight: 400, color: t.text2, marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
            {subtitle}
          </p>
        )}
      </div>
    </Fade>
  );
}

/** Link-styled button */
export function Btn({ href, primary, children, external }) {
  const { t } = useTheme();
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '11px 22px', borderRadius: 11,
    fontFamily: F, fontSize: 14, fontWeight: 500,
    textDecoration: 'none', transition: 'all 0.3s', cursor: 'pointer',
  };
  const style = primary
    ? { ...base, background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}` }
    : { ...base, color: t.text2, border: `1px solid ${t.border}` };

  return (
    <a href={href} style={style}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

/** Theme toggle button */
export function ThemeToggle() {
  const { t, mode, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      style={{
        position: 'fixed', top: 18, right: 18, zIndex: 100,
        width: 38, height: 38, borderRadius: 10,
        background: t.surface, border: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.3s',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.text2} strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
        {mode === 'dark'
          ? <><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></>
          : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />}
      </svg>
    </button>
  );
}

/** Skip to content link for keyboard users */
export function SkipLink() {
  const { t } = useTheme();
  return (
    <a
      href="#main"
      style={{
        position: 'absolute', left: -9999, top: 'auto',
        width: 1, height: 1, overflow: 'hidden', zIndex: 9999,
        padding: '12px 24px', background: t.accent, color: t.textInverse,
        fontFamily: F, fontSize: 14, borderRadius: 8, textDecoration: 'none',
      }}
      onFocus={(e) => Object.assign(e.target.style, { left: '16px', top: '16px', width: 'auto', height: 'auto' })}
      onBlur={(e) => Object.assign(e.target.style, { left: '-9999px', width: '1px', height: '1px' })}
    >
      Skip to content
    </a>
  );
}
