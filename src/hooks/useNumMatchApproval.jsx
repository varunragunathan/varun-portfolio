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
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/api/auth/num-match/subscribe`);
      wsRef.current = ws;

      ws.addEventListener('message', event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'approval_request') {
            setApproval({ approvalToken: msg.approvalToken, code: msg.code, userAgent: msg.userAgent, deviceNames: msg.deviceNames ?? [] });
          } else if (msg.type === 'resolved') {
            setApproval(prev => prev?.approvalToken === msg.approvalToken ? null : prev);
          }
        } catch {}
      });

      ws.addEventListener('close', () => {
        if (!destroyed) {
          // Reconnect after 3s — server may have restarted
          reconnectTimer = setTimeout(connect, 3000);
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
