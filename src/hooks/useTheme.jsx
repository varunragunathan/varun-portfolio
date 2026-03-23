import { createContext, useContext, useState, useEffect, useLayoutEffect } from 'react';

// useLayoutEffect causes a warning during SSR (it can't run in renderToString).
// This alias uses useEffect on the server (a no-op) and useLayoutEffect on the client.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const ThemeCtx = createContext();
export const useTheme = () => useContext(ThemeCtx);

export const themes = {
  dark: {
    bg: '#08080c', surface: '#11111a', surfaceAlt: '#161620',
    border: 'rgba(255,255,255,0.06)', borderHover: 'rgba(255,255,255,0.14)',
    accent: '#64ffda', accentMuted: '#3fbfa3',
    accentDim: 'rgba(100,255,218,0.10)', accentBorder: 'rgba(100,255,218,0.22)',
    accentGhost: 'rgba(100,255,218,0.04)',
    text1: '#e8e8f0', text2: '#a4a4bc', text3: '#7e7e98', textInverse: '#08080c',
    particle: '100,255,218',
    cardBg: '#11111a', cardHover: '#1c1c2a',
    focus: 'rgba(100,255,218,0.6)',
    tagBg: 'rgba(255,255,255,0.05)', tagBorder: 'rgba(255,255,255,0.08)',
    dotBorder: '#7e7e98', line: 'rgba(255,255,255,0.06)',
    errorColor: '#f87171', successColor: '#34d399', warningColor: '#fbbf24',
  },
  light: {
    bg: '#faf9f7', surface: '#ffffff', surfaceAlt: '#f3f2ee',
    border: 'rgba(0,0,0,0.09)', borderHover: 'rgba(0,0,0,0.16)',
    accent: '#0a6b55', accentMuted: '#1a7d66',
    accentDim: 'rgba(10,107,85,0.07)', accentBorder: 'rgba(10,107,85,0.22)',
    accentGhost: 'rgba(10,107,85,0.03)',
    text1: '#1a1a1a', text2: '#4a4a4a', text3: '#717171', textInverse: '#ffffff',
    particle: '10,107,85',
    cardBg: '#ffffff', cardHover: '#f6f5f2',
    focus: 'rgba(10,107,85,0.45)',
    tagBg: 'rgba(0,0,0,0.04)', tagBorder: 'rgba(0,0,0,0.09)',
    dotBorder: '#999999', line: 'rgba(0,0,0,0.07)',
    errorColor: '#b91c1c', successColor: '#15803d', warningColor: '#b45309',
  },
};

// Color overrides applied on top of the base theme for each color blind mode.
// Only the tokens that differ from the base theme are listed.
const CB_OVERRIDES = {
  deuteranopia: {
    dark: {
      accent: '#5ba4f5', accentMuted: '#4a8fd4',
      accentDim: 'rgba(91,164,245,0.10)', accentBorder: 'rgba(91,164,245,0.22)',
      accentGhost: 'rgba(91,164,245,0.04)',
      particle: '91,164,245',
      focus: 'rgba(91,164,245,0.6)',
      errorColor: '#ff8c00', successColor: '#5ba4f5',
    },
    light: {
      accent: '#1d4ed8', accentMuted: '#2563eb',
      accentDim: 'rgba(29,78,216,0.07)', accentBorder: 'rgba(29,78,216,0.22)',
      accentGhost: 'rgba(29,78,216,0.03)',
      particle: '29,78,216',
      focus: 'rgba(29,78,216,0.45)',
      errorColor: '#c84b00', successColor: '#1d4ed8',
    },
  },
  tritanopia: {
    dark: {
      accent: '#f97316', accentMuted: '#ea580c',
      accentDim: 'rgba(249,115,22,0.10)', accentBorder: 'rgba(249,115,22,0.22)',
      accentGhost: 'rgba(249,115,22,0.04)',
      particle: '249,115,22',
      focus: 'rgba(249,115,22,0.6)',
      successColor: '#a78bfa',
    },
    light: {
      accent: '#ea580c', accentMuted: '#c2410c',
      accentDim: 'rgba(234,88,12,0.07)', accentBorder: 'rgba(234,88,12,0.22)',
      accentGhost: 'rgba(234,88,12,0.03)',
      particle: '234,88,12',
      focus: 'rgba(234,88,12,0.45)',
      successColor: '#7c3aed',
    },
  },
};

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// preference:      'auto' | 'light' | 'dark'
// resolved:        'light' | 'dark'
// colorBlindMode:  'none' | 'deuteranopia' | 'tritanopia'
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    if (typeof window === 'undefined') return 'auto';
    return localStorage.getItem('theme-pref') || 'auto';
  });

  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

  const [colorBlindMode, setColorBlindMode] = useState(() => {
    if (typeof window === 'undefined') return 'none';
    return localStorage.getItem('color-blind-mode') || 'none';
  });

  // Track OS preference changes (only matters when preference === 'auto')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = e => setSystemTheme(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('theme-pref', preference);
  }, [preference]);

  useEffect(() => {
    localStorage.setItem('color-blind-mode', colorBlindMode);
  }, [colorBlindMode]);

  const resolved = preference === 'auto' ? systemTheme : preference;

  // Pass 1: sync all base theme tokens to CSS custom properties
  useIsomorphicLayoutEffect(() => {
    const root  = document.documentElement;
    const theme = themes[resolved];
    root.setAttribute('data-theme', resolved);
    root.style.setProperty('--bg',            theme.bg);
    root.style.setProperty('--surface',       theme.surface);
    root.style.setProperty('--surface-alt',   theme.surfaceAlt);
    root.style.setProperty('--border',        theme.border);
    root.style.setProperty('--border-hover',  theme.borderHover);
    root.style.setProperty('--text-1',        theme.text1);
    root.style.setProperty('--text-2',        theme.text2);
    root.style.setProperty('--text-3',        theme.text3);
    root.style.setProperty('--text-inverse',  theme.textInverse);
    root.style.setProperty('--card-bg',       theme.cardBg);
    root.style.setProperty('--card-hover',    theme.cardHover);
    root.style.setProperty('--tag-bg',        theme.tagBg);
    root.style.setProperty('--tag-border',    theme.tagBorder);
    root.style.setProperty('--dot-border',    theme.dotBorder);
    root.style.setProperty('--line',          theme.line);
  }, [resolved]);

  // Pass 2: sync accent + semantic color tokens — overridden by color blind mode
  useIsomorphicLayoutEffect(() => {
    const root  = document.documentElement;
    const base  = themes[resolved];
    const ovr   = colorBlindMode !== 'none' ? (CB_OVERRIDES[colorBlindMode]?.[resolved] ?? {}) : {};
    const t     = { ...base, ...ovr };

    root.style.setProperty('--accent',        t.accent);
    root.style.setProperty('--accent-muted',  t.accentMuted);
    root.style.setProperty('--accent-dim',    t.accentDim);
    root.style.setProperty('--accent-border', t.accentBorder);
    root.style.setProperty('--accent-ghost',  t.accentGhost);
    root.style.setProperty('--particle',      t.particle);
    root.style.setProperty('--focus',         t.focus);
    root.style.setProperty('--error-color',   t.errorColor);
    root.style.setProperty('--success-color', t.successColor);
    root.style.setProperty('--warning-color', t.warningColor);
  }, [resolved, colorBlindMode]);

  // Derive the effective theme object (with CB overrides merged) for JS consumers
  const effectiveTheme = colorBlindMode !== 'none'
    ? { ...themes[resolved], ...(CB_OVERRIDES[colorBlindMode]?.[resolved] ?? {}) }
    : themes[resolved];

  return (
    <ThemeCtx.Provider value={{
      t: effectiveTheme,
      mode: resolved,
      preference,
      setPreference,
      colorBlindMode,
      setColorBlindMode,
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}
