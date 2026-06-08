// ── NumMatchDO ─────────────────────────────────────────────────────
// Durable Object that acts as a per-user WebSocket broker for number
// matching. One DO instance per userId.
//
// Lifetime: a 2-minute alarm is set when an approval broadcast arrives.
// The alarm fires an 'expired' event to all clients, then the DO shuts down.
// The DO also shuts down quickly when the last client disconnects and no
// approval is pending.
//
// Client types:
//   'trusted'  — an authenticated trusted session waiting to approve/deny
//   'waiting'  — the new device waiting for an approval result
//
// Message protocol (client → DO):
//   { type: 'respond', approvalToken, approved: bool }  — trusted device responds
//
// Message protocol (DO → client):
//   { type: 'approval_request', approvalToken, code, userAgent, deviceNames, expires_at }
//   { type: 'result', approved, pendingToken? }
//   { type: 'resolved', approvalToken }
//   { type: 'expired' }
//
// Internal HTTP (worker → DO):
//   POST /broadcast  { approvalToken, code, userAgent, userId }

import { createPendingSession } from './auth/session.js';

const TIMEOUT_MS = 2 * 60_000; // 2 minutes

export class NumMatchDO {
  constructor(state, env) {
    this.state   = state;
    this.env     = env;
    this.clients = new Map(); // Map<WebSocket, { type, approvalToken? }>
    this.pending  = null;     // { approvalToken, code, userAgent, deviceNames, expiresAt }
    this.userId   = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const uid = url.searchParams.get('userId');
    if (uid) this.userId = uid;

    // ── Internal: trusted device responds via HTTP (no WebSocket needed) ─
    if (request.method === 'POST' && url.pathname.endsWith('/respond')) {
      const { approvalToken, approved } = await request.json();
      await this.handleResponse(approvalToken, approved);
      return new Response('ok');
    }

    // ── Internal: worker broadcasts new approval ──────────────────
    if (request.method === 'POST' && url.pathname.endsWith('/broadcast')) {
      const { approvalToken, code, userAgent, userId, deviceNames } = await request.json();
      if (userId) this.userId = userId;

      const expiresAt = Date.now() + TIMEOUT_MS;
      this.pending = { approvalToken, code, userAgent, deviceNames, expiresAt };

      // Set alarm — DO will expire at this time even if clients stay connected
      await this.state.storage.setAlarm(expiresAt);

      const msg = JSON.stringify({
        type: 'approval_request', approvalToken, code, userAgent, deviceNames,
        expires_at: expiresAt,
      });
      for (const [ws, info] of this.clients) {
        if (info.type === 'trusted') try { ws.send(msg); } catch {}
      }
      return new Response('ok');
    }

    // ── WebSocket upgrade ─────────────────────────────────────────
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    const type          = url.searchParams.get('type');
    const approvalToken = url.searchParams.get('approvalToken');

    server.accept();

    if (type === 'trusted') {
      this.clients.set(server, { type: 'trusted' });

      // Send any pending approval immediately (covers DO restart / late connect)
      try {
        let toSend = this.pending;
        if (!toSend && this.userId) {
          const raw = await this.env.KV.get(`num_match_for_user:${this.userId}`);
          if (raw) {
            const { approvalToken: at, code, userAgent, deviceNames } = JSON.parse(raw);
            const still = await this.env.KV.get(`num_match:${at}`);
            if (still) {
              const alarm = await this.state.storage.getAlarm();
              const expiresAt = alarm ?? (Date.now() + TIMEOUT_MS);
              toSend = { approvalToken: at, code, userAgent, deviceNames, expiresAt };
              this.pending = toSend;
            }
          }
        }
        if (toSend) {
          server.send(JSON.stringify({
            type: 'approval_request', ...toSend,
            expires_at: toSend.expiresAt,
          }));
        }
      } catch { /* non-fatal — client will re-read from KV via pending endpoint */ }

      server.addEventListener('message', async event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'respond') await this.handleResponse(msg.approvalToken, msg.approved);
        } catch {}
      });

    } else if (type === 'waiting') {
      this.clients.set(server, { type: 'waiting', approvalToken });
      // Check if the result was already processed (trusted device responded before we connected)
      try {
        const resultRaw = await this.env.KV.get(`num_match_result:${approvalToken}`);
        if (resultRaw) {
          const result = JSON.parse(resultRaw);
          server.send(JSON.stringify({ type: 'result', approved: result.approved, pendingToken: result.pendingToken ?? null }));
          this.clients.delete(server);
          server.close(1000, 'Done');
        }
      } catch {}
    }

    server.addEventListener('close', () => {
      this.clients.delete(server);
      this.maybeScheduleCleanup();
    });
    server.addEventListener('error', () => {
      this.clients.delete(server);
      this.maybeScheduleCleanup();
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // If no clients remain and nothing is pending, shut down in 5s
  maybeScheduleCleanup() {
    if (this.clients.size === 0 && !this.pending) {
      this.state.storage.setAlarm(Date.now() + 5_000);
    }
  }

  async handleResponse(approvalToken, approved) {
    const raw = await this.env.KV.get(`num_match:${approvalToken}`);
    if (!raw) return;

    const { userId, email } = JSON.parse(raw);
    await this.env.KV.delete(`num_match:${approvalToken}`);
    await this.env.KV.delete(`num_match_for_user:${userId}`);

    let pendingToken = null;
    if (approved) {
      pendingToken = await createPendingSession(this.env.KV, { userId, email, method: 'passkey+number_match' });
    }
    this.pending = null;

    // Cache result briefly so a new device that connects after the response still gets it
    await this.env.KV.put(
      `num_match_result:${approvalToken}`,
      JSON.stringify({ approved, pendingToken }),
      { expirationTtl: 60 },
    ).catch(() => {});

    const resultMsg   = JSON.stringify({ type: 'result', approved, pendingToken });
    const resolvedMsg = JSON.stringify({ type: 'resolved', approvalToken });

    for (const [ws, info] of this.clients) {
      if (info.type === 'waiting' && info.approvalToken === approvalToken) {
        try { ws.send(resultMsg); } catch {}
      }
      if (info.type === 'trusted') {
        try { ws.send(resolvedMsg); } catch {}
      }
    }

    // Short alarm — give clients a moment to receive the result, then clean up
    await this.state.storage.setAlarm(Date.now() + 30_000);
  }

  // Fires when the approval window expires or the cleanup timer fires
  async alarm() {
    if (this.pending) {
      // Approval window expired — notify all clients
      const msg = JSON.stringify({ type: 'expired' });
      for (const [ws] of this.clients) {
        try { ws.send(msg); } catch {}
        try { ws.close(1001, 'Expired'); } catch {}
      }
      this.clients.clear();
      this.pending = null;
      // Clean up KV if the token is still there
      if (this.userId) {
        const raw = await this.env.KV.get(`num_match_for_user:${this.userId}`).catch(() => null);
        if (raw) {
          const { approvalToken } = JSON.parse(raw);
          await this.env.KV.delete(`num_match:${approvalToken}`).catch(() => {});
          await this.env.KV.delete(`num_match_for_user:${this.userId}`).catch(() => {});
        }
      }
    } else {
      // Post-resolution cleanup or idle shutdown
      for (const [ws] of this.clients) try { ws.close(1000, 'Done'); } catch {}
      this.clients.clear();
    }
  }
}
