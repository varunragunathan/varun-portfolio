import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { ThemeToggle, SkipLink } from './components/UI';

const Home = lazy(() => import('./pages/Home'));

function Loading() {
  const { t } = useTheme();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.bg }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: '0.3em', textTransform: 'uppercase', color: t.text3 }}>Loading</div>
    </div>
  );
}

function Shell() {
  const { t } = useTheme();
  return (
    <div style={{ background: t.bg, minHeight: '100vh', transition: 'background 0.4s ease' }}>
      <SkipLink />
      <ThemeToggle />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Home />} />
          {/* Phase 2+: add routes here */}
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </ThemeProvider>
  );
}
