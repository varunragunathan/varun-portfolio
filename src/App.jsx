import React, { Suspense, lazy, useEffect, useState, useCallback, Component } from 'react';
import { BrowserRouter, Routes, Route, useLocation, matchPath } from 'react-router-dom';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { SkipLink, ThemeToggle } from './components/UI';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Nav from './components/Nav';
import ChatWidget from './components/ChatWidget.jsx';
import VersionBadge from './components/VersionBadge.jsx';
import { useNumMatchApproval } from './hooks/useNumMatchApproval.jsx';
import NumMatchApprovalModal from './components/NumMatchApprovalModal.jsx';
import { FeedbackForm, FeedbackModal, useShake } from './components/FeedbackWidget.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';

// ── Error boundary ────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    const mono = "'IBM Plex Mono', monospace";
    const sans = "'Outfit', sans-serif";
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', padding: '40px 24px', gap: 20,
      }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.2em', color: '#ff3b30', textTransform: 'uppercase' }}>
          something went wrong
        </div>
        <div style={{ fontFamily: sans, fontSize: 15, color: '#e5e5e5', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </div>
        <button
          onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
          style={{
            fontFamily: mono, fontSize: 11, letterSpacing: '0.08em',
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid #333', color: '#999',
            marginTop: 8,
          }}
        >
          go home
        </button>
      </div>
    );
  }
}

const Home        = lazy(() => import('./pages/Home'));
const Auth        = lazy(() => import('./pages/Auth'));
const Settings    = lazy(() => import('./pages/Security'));
const ChatPage    = lazy(() => import('./pages/Chat'));
const AdminPage   = lazy(() => import('./pages/Admin'));

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

const M = "'IBM Plex Mono', monospace";

function Footer({ onShakeEnable, shakeState }) {
  const { t } = useTheme();
  return (
    <footer style={{ borderTop: `1px solid ${t.border}` }}>
      {/* Feedback section */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 24px 24px' }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontFamily: M, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 6 }}>
            feedback
          </div>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 400, color: t.text1, margin: '0 0 4px' }}>
            Got a thought? Leave it here.
          </p>
          <p style={{ fontFamily: "'Outfit', sans-serif", fontSize: 13, color: t.text3, margin: '0 0 16px', lineHeight: 1.5 }}>
            Completely anonymous — no account, no tracking.
          </p>
          <FeedbackForm />
          {shakeState !== 'unsupported' && (
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.03em' }}>
                📳 On mobile?
              </span>
              {shakeState === 'needs-permission' ? (
                <button
                  onClick={onShakeEnable}
                  style={{
                    background: 'none', border: `1px solid ${t.border}`, borderRadius: 6,
                    padding: '3px 10px', cursor: 'pointer',
                    fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.04em',
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = t.accent; e.currentTarget.style.borderColor = t.accentBorder; }}
                  onMouseLeave={e => { e.currentTarget.style.color = t.text3; e.currentTarget.style.borderColor = t.border; }}
                >
                  tap to enable shake
                </button>
              ) : (
                <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.03em' }}>
                  shake your phone to open feedback
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        borderTop: `1px solid ${t.border}`,
        padding: '16px 24px',
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
      </div>
    </footer>
  );
}

function Shell() {
  const { t } = useTheme();
  const { user } = useAuth();
  const { approval, respond } = useNumMatchApproval(user);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleShake = useCallback(() => setFeedbackOpen(true), []);
  const { shakeState, requestPermission } = useShake(handleShake);
  const { pathname } = useLocation();
  const hideFooter = !!matchPath('/chat', pathname);

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
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </div>
      {!hideFooter && <Footer shakeState={shakeState} onShakeEnable={requestPermission} />}
      {user && <ChatWidget />}
      {approval && <NumMatchApprovalModal approval={approval} onRespond={respond} />}
      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
      <UpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
