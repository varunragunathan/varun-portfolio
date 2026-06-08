import { useState, useEffect } from 'react';

// Polls /api/auth/num-match/pending every 5 seconds for trusted sessions.
// This replaces the previous persistent WebSocket to the Durable Object,
// which was keeping DO instances alive 24/7 and burning free-tier duration.
// The DO is now only activated during active approval events (max 2 min each).
export function useNumMatchApproval(user) {
  const [approval, setApproval] = useState(null);

  useEffect(() => {
    if (!user?.trusted) {
      setApproval(null);
      return;
    }

    let stopped = false;

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch('/api/auth/num-match/pending', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.pending) {
            setApproval(prev => {
              // Don't reset the modal if it's already showing the same approval
              if (prev?.approvalToken === data.approvalToken) return prev;
              return {
                approvalToken: data.approvalToken,
                code:          data.code,
                userAgent:     data.userAgent,
                deviceNames:   data.deviceNames ?? [],
                expiresAt:     Date.now() + 120_000,
              };
            });
          } else {
            setApproval(null);
          }
        }
      } catch { /* network error — retry on next tick */ }
      if (!stopped) setTimeout(poll, 5_000);
    }

    poll();
    return () => { stopped = true; };
  }, [user]);

  async function respond(approvalToken, action) {
    setApproval(null);
    try {
      await fetch('/api/auth/num-match/respond', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:        JSON.stringify({ approvalToken, approved: action === 'approve' }),
      });
    } catch { /* best-effort */ }
  }

  return { approval, respond };
}
