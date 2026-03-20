import React, { Suspense, lazy, useEffect, useState, useCallback, Component } from 'react';
import { BrowserRouter, Routes, Route, useLocation, matchPath } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { SkipLink, ThemeToggle } from './components/UI';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Nav from './components/Nav';
import ChatWidget from './components/ChatWidget.jsx';
import VersionBadge from './components/VersionBadge.jsx';
import { useNumMatchApproval } from './hooks/useNumMatchApproval.jsx';
import NumMatchApprovalModal from './components/NumMatchApprovalModal.jsx';
import { FeedbackForm, FeedbackModal, useShake } from './components/FeedbackWidget.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import './App.css';

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
    return (
      <div className="error-boundary">
        <div className="error-boundary__code">something went wrong</div>
        <div className="error-boundary__message">
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </div>
        <button
          className="error-boundary__reset"
          onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
        >
          go home
        </button>
      </div>
    );
  }
}

const Home      = lazy(() => import('./pages/Home'));
const Auth      = lazy(() => import('./pages/Auth'));
const Settings  = lazy(() => import('./pages/Security'));
const ChatPage  = lazy(() => import('./pages/Chat'));
const AdminPage = lazy(() => import('./pages/Admin'));

function Loading() {
  return (
    <div className="loading">
      <div className="loading__text">Loading</div>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Footer({ onShakeEnable, shakeState }) {
  return (
    <footer id="footer">
      {/* Feedback section */}
      <div className="footer__feedback">
        <div className="footer__feedback-inner">
          <div className="footer__label">feedback</div>
          <p className="footer__title">Got a thought? Leave it here.</p>
          <p className="footer__subtitle">Completely anonymous — no account, no tracking.</p>
          <FeedbackForm />
          {shakeState !== 'unsupported' && (
            <div className="footer__shake-hint">
              <span className="footer__shake-label">📳 On mobile?</span>
              {shakeState === 'needs-permission' ? (
                <button className="footer__shake-btn" onClick={onShakeEnable}>
                  tap to enable shake
                </button>
              ) : (
                <span className="footer__shake-active">shake your phone to open feedback</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer__bottom">
        <div className="footer__bottom-left">
          <span className="footer__domain">varunr.dev</span>
          <VersionBadge />
        </div>
        <ThemeToggle />
      </div>
    </footer>
  );
}

function Shell() {
  const { user } = useAuth();
  const { approval, respond } = useNumMatchApproval(user);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleShake = useCallback(() => setFeedbackOpen(true), []);
  const { shakeState, requestPermission } = useShake(handleShake);
  const { pathname } = useLocation();
  const hideFooter = !!matchPath('/chat', pathname);

  return (
    <div className="shell">
      <ScrollToTop />
      <SkipLink />
      <Nav />
      <div id="main" className="shell__content">
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
