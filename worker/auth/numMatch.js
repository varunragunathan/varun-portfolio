// ── Number Matching ───────────────────────────────────────────────
// Flow:
//   1. verifyAuth detects new device → stores num_match:{approvalToken} and
//      num_match_pending:{tempToken} in KV, sends email with Approve/Deny links.
//   2. New device polls /num-match/status?t={tempToken} until approved/denied/expired.
//   3. Trusted device clicks email link → GET /num-match/approve?t={approvalToken}&action=approve|deny
//   4. On approval, server issues pendingToken and deletes both KV entries.

import { createPendingSession, getSession } from './session.js';
import { getUserById } from '../db.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

// GET /api/auth/num-match/approve?t={approvalToken}&action=approve|deny
// Called by the trusted device via email link.
export async function approveNumMatch(request, env) {
  const url = new URL(request.url);
  const approvalToken = url.searchParams.get('t');
  const action = url.searchParams.get('action');

  if (!approvalToken || !['approve', 'deny'].includes(action)) {
    return html(resultPage('Invalid link', false));
  }

  const raw = await env.AUTH_KV.get(`num_match:${approvalToken}`);
  if (!raw) {
    return html(resultPage('This link has expired or already been used.', false));
  }

  const data = JSON.parse(raw);

  if (action === 'deny') {
    await env.AUTH_KV.put(
      `num_match:${approvalToken}`,
      JSON.stringify({ ...data, denied: true }),
      { expirationTtl: 60 },
    );
    return html(resultPage('Sign-in denied. The new device will not be granted access.', false));
  }

  // Approved — mark in KV so the polling endpoint can pick it up
  await env.AUTH_KV.put(
    `num_match:${approvalToken}`,
    JSON.stringify({ ...data, approved: true }),
    { expirationTtl: 60 },
  );

  return html(resultPage('Sign-in approved! The new device can now complete sign-in.', true));
}

// GET /api/auth/num-match/status?t={tempToken}
// Polled by the new device. Returns { status: 'pending'|'approved'|'denied'|'expired' }
// On approval, issues a pendingToken so the client can proceed to finaliseSession.
export async function pollNumMatch(request, env) {
  const url = new URL(request.url);
  const tempToken = url.searchParams.get('t');
  if (!tempToken) return json({ error: 'Missing token' }, 400);

  const raw = await env.AUTH_KV.get(`num_match_pending:${tempToken}`);
  if (!raw) return json({ status: 'expired' });

  const { approvalToken, userId, email } = JSON.parse(raw);

  const approvalRaw = await env.AUTH_KV.get(`num_match:${approvalToken}`);
  if (!approvalRaw) return json({ status: 'expired' });

  const approval = JSON.parse(approvalRaw);

  if (approval.denied) {
    // Clean up both entries
    await env.AUTH_KV.delete(`num_match_pending:${tempToken}`);
    await env.AUTH_KV.delete(`num_match:${approvalToken}`);
    return json({ status: 'denied' });
  }

  if (!approval.approved) {
    return json({ status: 'pending' });
  }

  // Approved — clean up and issue pending session
  await env.AUTH_KV.delete(`num_match_pending:${tempToken}`);
  await env.AUTH_KV.delete(`num_match:${approvalToken}`);

  const pendingToken = await createPendingSession(env.AUTH_KV, { userId, email });
  return json({ status: 'approved', pendingToken });
}

// GET /api/auth/num-match/pending
// Called by trusted sessions to check if there's a pending approval for their user.
export async function getPendingApproval(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const raw = await env.AUTH_KV.get(`num_match_for_user:${session.userId}`);
  if (!raw) return json({ pending: false });

  const { approvalToken, code, userAgent } = JSON.parse(raw);

  // Verify the approval is still live
  const approvalRaw = await env.AUTH_KV.get(`num_match:${approvalToken}`);
  if (!approvalRaw) {
    await env.AUTH_KV.delete(`num_match_for_user:${session.userId}`);
    return json({ pending: false });
  }

  const approval = JSON.parse(approvalRaw);
  if (approval.approved || approval.denied) {
    return json({ pending: false });
  }

  return json({ pending: true, approvalToken, code, userAgent });
}

// POST /api/auth/num-match/respond  { approvalToken, action: 'approve'|'deny' }
// Called by the trusted session browser after user taps Approve or Deny.
export async function respondToApproval(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const { approvalToken, action } = body;
  if (!approvalToken || !['approve', 'deny'].includes(action)) {
    return json({ error: 'Invalid request' }, 400);
  }

  const raw = await env.AUTH_KV.get(`num_match:${approvalToken}`);
  if (!raw) return json({ error: 'Expired or not found' }, 404);

  const data = JSON.parse(raw);

  // Ensure this session's user owns the approval
  if (data.userId !== session.userId) return json({ error: 'Forbidden' }, 403);

  const approved = action === 'approve';
  await env.AUTH_KV.put(
    `num_match:${approvalToken}`,
    JSON.stringify({ ...data, approved, denied: !approved }),
    { expirationTtl: 60 },
  );

  // Clean up the user-level pointer
  await env.AUTH_KV.delete(`num_match_for_user:${session.userId}`);

  return json({ ok: true });
}

function resultPage(message, success) {
  const color = success ? '#22c55e' : '#ef4444';
  const icon = success ? '✓' : '✗';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sign-in ${success ? 'Approved' : 'Denied'} · varunr.dev</title>
  <style>
    body{font-family:'IBM Plex Mono',monospace;background:#0a0a0a;color:#e5e5e5;
         display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .card{max-width:400px;padding:48px 32px;text-align:center;}
    .icon{font-size:48px;color:${color};margin-bottom:16px;}
    h1{font-size:20px;font-weight:400;margin:0 0 12px;}
    p{font-size:14px;color:#9ca3af;margin:0;}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${success ? 'Approved' : 'Denied'}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
