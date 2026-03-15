import { useState, useEffect, useRef } from 'react';

const POLL_INTERVAL = 3000; // 3 seconds

// Polls /api/auth/num-match/pending while the user is authenticated.
// Returns { pending, approvalToken, code, userAgent, respond, dismiss }.
export function useNumMatchApproval(user) {
  const [approval, setApproval] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setApproval(null);
      return;
    }

    async function poll() {
      try {
        const res = await fetch('/api/auth/num-match/pending', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.pending) {
          setApproval(data);
        } else {
          // Clear if it resolved while modal was open
          setApproval(prev => (prev && !data.pending ? null : prev));
        }
      } catch {
        // Ignore network errors — keep polling
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [user]);

  async function respond(approvalToken, action) {
    await fetch('/api/auth/num-match/respond', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalToken, action }),
    });
    setApproval(null);
  }

  return { approval, respond };
}
