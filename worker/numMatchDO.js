// ── NumMatchDO ─────────────────────────────────────────────────────
// Durable Object that acts as a per-user WebSocket broker for number
// matching. One DO instance per userId.
//
// Client types:
//   'trusted'  — an authenticated trusted session waiting to approve/deny
//   'waiting'  — the new device waiting for an approval result
//
// Message protocol (client → DO):
//   { type: 'respond', approvalToken, approved: bool }  — trusted device responds
//
// Message protocol (DO → client):
//   { type: 'approval_request', approvalToken, code, userAgent } → trusted devices
//   { type: 'result', approved, pendingToken? }                  → waiting device
//   { type: 'resolved', approvalToken }                          → trusted devices (cleanup)
//
// Internal HTTP (worker → DO):
//   POST /broadcast  { approvalToken, code, userAgent, userId }  — new approval arrived

import { createPendingSession } from './auth/session.js';

export class NumMatchDO {
  constructor(state, env) {
    this.state = state;
    this.env   = env;
    // Map<WebSocket, { type: 'trusted'|'waiting', approvalToken?: string }>
    this.clients = new Map();
    // Current pending approval (in-memory; backed by KV as source of truth)
    this.pending = null; // { approvalToken, code, userAgent }
    this.userId  = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // Capture userId from any incoming URL (worker always sets it)
    const uid = url.searchParams.get('userId');
    if (uid) this.userId = uid;

    // ── Internal: worker broadcasts new approval to connected trusted clients ──
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const { approvalToken, code, userAgent, userId, deviceNames } = await request.json();
      if (userId) this.userId = userId;
      this.pending = { approvalToken, code, userAgent, deviceNames };

      const msg = JSON.stringify({ type: 'approval_request', approvalToken, code, userAgent, deviceNames });
      for (const [ws, info] of this.clients) {
        if (info.type === 'trusted') {
          try { ws.send(msg); } catch {}
        }
      }
      return new Response('ok');
    }

    // ── WebSocket upgrade ──────────────────────────────────────────
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const type          = url.searchParams.get('type');
    const approvalToken = url.searchParams.get('approvalToken');

    server.accept();

    if (type === 'trusted') {
      this.clients.set(server, { type: 'trusted' });

      // Send any pending approval immediately — covers the case where the
      // approval arrived before this trusted device connected (or DO restarted)
      let toSend = this.pending;
      if (!toSend && this.userId) {
        // DO may have restarted; fall back to KV
        const raw = await this.env.AUTH_KV.get(`num_match_for_user:${this.userId}`);
        if (raw) {
          const { approvalToken: at, code, userAgent, deviceNames } = JSON.parse(raw);
          // Verify it hasn't already been resolved
          const still = await this.env.AUTH_KV.get(`num_match:${at}`);
          if (still) {
            toSend = { approvalToken: at, code, userAgent, deviceNames };
            this.pending = toSend;
          }
        }
      }
      if (toSend) {
        server.send(JSON.stringify({ type: 'approval_request', ...toSend }));
      }

      server.addEventListener('message', async event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'respond') {
            await this.handleResponse(msg.approvalToken, msg.approved);
          }
        } catch {}
      });

    } else if (type === 'waiting') {
      this.clients.set(server, { type: 'waiting', approvalToken });
    }

    server.addEventListener('close', () => this.clients.delete(server));
    server.addEventListener('error', () => this.clients.delete(server));

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleResponse(approvalToken, approved) {
    const raw = await this.env.AUTH_KV.get(`num_match:${approvalToken}`);
    if (!raw) return; // already handled or expired

    const { userId, email } = JSON.parse(raw);

    // Clean up KV
    await this.env.AUTH_KV.delete(`num_match:${approvalToken}`);
    await this.env.AUTH_KV.delete(`num_match_for_user:${userId}`);

    let pendingToken = null;
    if (approved) {
      pendingToken = await createPendingSession(this.env.AUTH_KV, { userId, email, method: 'passkey+number_match' });
    }

    this.pending = null;

    // Notify the waiting device
    const resultMsg = JSON.stringify({ type: 'result', approved, pendingToken });
    for (const [ws, info] of this.clients) {
      if (info.type === 'waiting' && info.approvalToken === approvalToken) {
        try { ws.send(resultMsg); } catch {}
      }
    }

    // Notify trusted devices so they can dismiss the modal
    const resolvedMsg = JSON.stringify({ type: 'resolved', approvalToken });
    for (const [ws, info] of this.clients) {
      if (info.type === 'trusted') {
        try { ws.send(resolvedMsg); } catch {}
      }
    }
  }
}
