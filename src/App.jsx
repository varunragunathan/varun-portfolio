import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { SkipLink } from './components/UI';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Nav from './components/Nav';
import { useNumMatchApproval } from './hooks/useNumMatchApproval.jsx';
import NumMatchApprovalModal from './components/NumMatchApprovalModal.jsx';

const Home = lazy(() => import('./pages/Home'));
const Auth = lazy(() => import('./pages/Auth'));
const Security = lazy(() => import('./pages/Security'));

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
  const { user } = useAuth();
  const { approval, respond } = useNumMatchApproval(user);

  return (
    <div style={{ background: t.bg, minHeight: '100vh', transition: 'background 0.4s ease' }}>
      <SkipLink />
      <Nav />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/account/security" element={<Security />} />
        </Routes>
      </Suspense>
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
