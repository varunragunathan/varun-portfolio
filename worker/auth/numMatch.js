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

  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  // Only trusted sessions can approve sign-ins
  const db = env.varun_portfolio_auth;
  const sessionRecord = await db
    .prepare('SELECT trusted FROM sessions WHERE user_id = ? AND trusted = 1 AND expires_at > ? LIMIT 1')
    .bind(session.userId, Date.now())
    .first();
  if (!sessionRecord) return json({ error: 'Requires a trusted session' }, 403);

  const doId  = env.NUM_MATCH_DO.idFromName(session.userId);
  const stub  = env.NUM_MATCH_DO.get(doId);
  const url   = new URL(request.url);
  url.searchParams.set('type', 'trusted');
  url.searchParams.set('userId', session.userId);
  return stub.fetch(new Request(url.toString(), request));
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

  const raw = await env.AUTH_KV.get(`num_match_pending:${tempToken}`);
  if (!raw) return json({ error: 'Invalid or expired token' }, 400);

  const { approvalToken, userId } = JSON.parse(raw);

  const doId = env.NUM_MATCH_DO.idFromName(userId);
  const stub = env.NUM_MATCH_DO.get(doId);
  url.searchParams.set('type', 'waiting');
  url.searchParams.set('approvalToken', approvalToken);
  url.searchParams.set('userId', userId);
  return stub.fetch(new Request(url.toString(), request));
}
