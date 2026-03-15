import { createContext, useContext, useState, useEffect } from 'react';

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
  },
};

function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// preference: 'auto' | 'light' | 'dark'
// resolved:   'light' | 'dark'
export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(() => {
    if (typeof window === 'undefined') return 'auto';
    return localStorage.getItem('theme-pref') || 'auto';
  });

  const [systemTheme, setSystemTheme] = useState(getSystemTheme);

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

  const resolved = preference === 'auto' ? systemTheme : preference;

  return (
    <ThemeCtx.Provider value={{
      t: themes[resolved],
      mode: resolved,
      preference,
      setPreference,
    }}>
      {children}
    </ThemeCtx.Provider>
  );
}
