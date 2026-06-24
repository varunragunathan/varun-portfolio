// ── Number Matching — WebSocket broker ────────────────────────────
// Replaced polling architecture with Durable Objects + WebSocket.
//
// Two WebSocket endpoints:
//   GET /num-match/subscribe  — trusted device subscribes for approval requests
//   GET /num-match/wait       — new device waits for approval result
//
// The NumMatchDO Durable Object handles all coordination. The worker
// only validates identity before forwarding the WebSocket upgrade to the DO.

import { getSession } from './session.js';
import { sha256Hex } from '../utils.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/auth/num-match/subscribe
// Trusted sessions connect here. Worker verifies the session is both
// valid and trusted before forwarding to the DO.
export async function numMatchSubscribe(request, env) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket upgrade required' }, 426);
  }

  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  // Verify this specific session is trusted — use token_hash (same as /me)
  // so the check matches exactly what the UI read when deciding to connect.
  const db = env.varun_portfolio_auth;
  const tokenHash = await sha256Hex(session.token);
  const sessionRecord = await db
    .prepare('SELECT trusted FROM sessions WHERE token_hash = ? AND trusted = 1 LIMIT 1')
    .bind(tokenHash)
    .first();
  if (!sessionRecord) return json({ error: 'Requires a trusted session' }, 403);

  const doId  = env.NUM_MATCH_DO.idFromName(session.userId);
  const stub  = env.NUM_MATCH_DO.get(doId);
  const url   = new URL(request.url);
  url.searchParams.set('type', 'trusted');
  url.searchParams.set('userId', session.userId);
  return stub.fetch(new Request(url.toString(), request));
}

// GET /api/auth/num-match/pending
// Trusted sessions poll this instead of holding a persistent WebSocket.
// Reads directly from KV — no DO activation, no duration charge.
export async function numMatchPending(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;
  const tokenHash = await sha256Hex(session.token);
  const sessionRecord = await db
    .prepare('SELECT trusted FROM sessions WHERE token_hash = ? AND trusted = 1 LIMIT 1')
    .bind(tokenHash).first();
  if (!sessionRecord) return json({ pending: false });

  // cacheTtl: 5 matches the poll interval — idle polls (no pending approval)
  // are served from edge cache rather than generating a fresh KV read each time.
  const raw = await env.KV.get(`num_match_for_user:${session.userId}`, { cacheTtl: 5 });
  if (!raw) return json({ pending: false });

  const { approvalToken, code, userAgent, deviceNames } = JSON.parse(raw);

  // Verify token is still live (not already processed)
  const still = await env.KV.get(`num_match:${approvalToken}`);
  if (!still) {
    await env.KV.delete(`num_match_for_user:${session.userId}`).catch(() => {});
    return json({ pending: false });
  }

  return json({ pending: true, approvalToken, code, userAgent, deviceNames });
}

// POST /api/auth/num-match/respond   { approvalToken, approved }
// Trusted sessions respond here. Delegates to the DO via HTTP so the
// waiting new device's WebSocket gets notified. No persistent connection needed.
export async function numMatchRespond(request, env) {
  const session = await getSession(env.KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const db = env.varun_portfolio_auth;
  const tokenHash = await sha256Hex(session.token);
  const sessionRecord = await db
    .prepare('SELECT trusted FROM sessions WHERE token_hash = ? AND trusted = 1 LIMIT 1')
    .bind(tokenHash).first();
  if (!sessionRecord) return json({ error: 'Requires a trusted session' }, 403);

  const { approvalToken, approved } = await request.json().catch(() => ({}));
  if (!approvalToken) return json({ error: 'Missing approvalToken' }, 400);

  const raw = await env.KV.get(`num_match:${approvalToken}`);
  if (!raw) return json({ error: 'Approval not found or already processed' }, 404);

  const { userId } = JSON.parse(raw);
  const doId = env.NUM_MATCH_DO.idFromName(userId);
  const stub = env.NUM_MATCH_DO.get(doId);
  await stub.fetch(new Request('http://do-internal/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalToken, approved }),
  }));

  return json({ ok: true });
}

// GET /api/auth/num-match/wait?token={tempToken}
// New device connects here after verifyAuth returns pendingNumberMatch.
// Worker validates the tempToken from KV before forwarding to the DO.
export async function numMatchWait(request, env) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket upgrade required' }, 426);
  }

  const url       = new URL(request.url);
  const tempToken = url.searchParams.get('token');
  if (!tempToken) return json({ error: 'Missing token' }, 400);

  const raw = await env.KV.get(`num_match_pending:${tempToken}`);
  if (!raw) return json({ error: 'Invalid or expired token' }, 400);

  const { approvalToken, userId } = JSON.parse(raw);

  const doId = env.NUM_MATCH_DO.idFromName(userId);
  const stub = env.NUM_MATCH_DO.get(doId);
  url.searchParams.set('type', 'waiting');
  url.searchParams.set('approvalToken', approvalToken);
  url.searchParams.set('userId', userId);
  return stub.fetch(new Request(url.toString(), request));
}
