import { useState, useEffect, useRef } from 'react';

// Connects via WebSocket to /api/auth/num-match/subscribe while the user is
// authenticated with a trusted session. The server pushes approval requests
// instead of the client polling.
// Returns { approval, respond }.
export function useNumMatchApproval(user) {
  const [approval, setApproval] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!user || !user.trusted) {
      setApproval(null);
      return;
    }

    let ws;
    let reconnectTimer;
    let destroyed  = false;
    let delay      = 3_000;   // start at 3s, doubles on each failed connection
    const MAX_DELAY = 5 * 60_000; // cap at 5 minutes

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/api/auth/num-match/subscribe`);
      wsRef.current = ws;

      let openedCleanly = false;

      ws.addEventListener('open', () => {
        openedCleanly = true;
        delay = 3_000;  // reset backoff on successful connection
      });

      ws.addEventListener('message', event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'approval_request') {
            setApproval({
              approvalToken: msg.approvalToken,
              code:          msg.code,
              userAgent:     msg.userAgent,
              deviceNames:   msg.deviceNames ?? [],
              expiresAt:     msg.expires_at ?? (Date.now() + 120_000),
            });
          } else if (msg.type === 'resolved') {
            setApproval(prev => prev?.approvalToken === msg.approvalToken ? null : prev);
          } else if (msg.type === 'expired') {
            setApproval(null);
          }
        } catch { /* ignore */ }
      });

      ws.addEventListener('close', () => {
        if (!destroyed) {
          if (!openedCleanly) delay = Math.min(delay * 2, MAX_DELAY);
          reconnectTimer = setTimeout(connect, delay);
        }
      });

      ws.addEventListener('error', () => ws.close());
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [user]);

  function respond(approvalToken, action) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'respond', approvalToken, approved: action === 'approve' }));
    }
    setApproval(null);
  }

  return { approval, respond };
}
