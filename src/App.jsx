import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { SkipLink, ThemeToggle } from './components/UI';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Nav from './components/Nav';
import { useNumMatchApproval } from './hooks/useNumMatchApproval.jsx';
import NumMatchApprovalModal from './components/NumMatchApprovalModal.jsx';
import { usePrefersReducedMotion } from './hooks/useAnimations.js';
import pkg from '../package.json';

const Home = lazy(() => import('./pages/Home'));
const Auth = lazy(() => import('./pages/Auth'));
const Settings = lazy(() => import('./pages/Security'));

function Loading() {
  const { t } = useTheme();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: t.text3 }}>Loading</div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ── Version badge with slot-machine digit animation ───────────────
// Each digit spins through 0→9 then lands on its final value so even
// zero digits animate visibly. Staggered delay gives a cascade feel.
const LINE_H = 13; // px — matches 10px mono with natural leading
const M = "'IBM Plex Mono', monospace";

function DigitSlot({ digit, delay }) {
  const ref     = useRef(null);
  const reduced = usePrefersReducedMotion();

  // Column: full 0-9 spin, then 0..digit to land on target
  const digits = [
    ...Array.from({ length: 10 }, (_, i) => i),
    ...Array.from({ length: digit + 1 }, (_, i) => i),
  ];
  const finalY = -(10 + digit) * LINE_H;

  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.style.transform = `translateY(${finalY}px)`;
      return;
    }
    const timer = setTimeout(() => {
      if (!ref.current) return;
      let start = null;
      const duration = 800;
      function step(ts) {
        if (!start) start = ts;
        const p    = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 4); // quartic ease-out
        ref.current.style.transform = `translateY(${ease * finalY}px)`;
        if (p < 1) requestAnimationFrame(step);
        else ref.current.style.transform = `translateY(${finalY}px)`;
      }
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [digit, delay, reduced, finalY]);

  return (
    <span style={{ display: 'inline-block', height: LINE_H, overflow: 'hidden', verticalAlign: 'top' }}>
      <span ref={ref} style={{ display: 'flex', flexDirection: 'column' }}>
        {digits.map((d, i) => (
          <span key={i} style={{ display: 'block', height: LINE_H, lineHeight: `${LINE_H}px` }}>{d}</span>
        ))}
      </span>
    </span>
  );
}

function VersionBadge() {
  const { t } = useTheme();
  const chars  = `v${pkg.version}`.split('');

  return (
    <span style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.08em', color: t.text3, display: 'inline-flex', alignItems: 'flex-start' }}>
      {chars.map((char, i) => (
        /\d/.test(char)
          ? <DigitSlot key={i} digit={parseInt(char)} delay={300 + i * 90} />
          : <span key={i} style={{ lineHeight: `${LINE_H}px` }}>{char}</span>
      ))}
    </span>
  );
}

function Footer() {
  const { t } = useTheme();
  return (
    <footer style={{
      borderTop: `1px solid ${t.border}`,
      padding: '20px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      maxWidth: 920, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.1em', color: t.text3 }}>
          varunr.dev
        </span>
        <VersionBadge />
      </div>
      <ThemeToggle />
    </footer>
  );
}

function Shell() {
  const { t } = useTheme();
  const { user } = useAuth();
  const { approval, respond } = useNumMatchApproval(user);

  return (
    <div style={{ background: t.bg, minHeight: '100vh', transition: 'background 0.4s ease', display: 'flex', flexDirection: 'column' }}>
      <ScrollToTop />
      <SkipLink />
      <Nav />
      <div style={{ flex: 1 }}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route index element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/account/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </div>
      <Footer />
      {approval && <NumMatchApprovalModal approval={approval} onRespond={respond} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
