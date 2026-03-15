// ── Step-up authentication ─────────────────────────────────────────
// Proves the current session user is physically present before
// destructive actions (account deletion, passkey removal, etc.).
//
// Priority order for future expansion:
//   1. Passkey re-auth      ← implemented here
//   2. Trusted device approve (number matching)
//   3. TOTP
//   4. Backup security key
//
// All paths produce the same short-lived stepUpToken (2 min KV TTL).
// Consuming endpoints call consumeStepUpToken() to validate + delete it.

import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { getSession } from './session.js';
import { getPasskeyCredsByUserId, getPasskeyCredById, updateSignCount } from '../db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const STEP_UP_TTL = 120; // 2 minutes

// Validates and consumes a stepUpToken. Returns userId on success, null otherwise.
// Call this inside any endpoint that requires step-up.
export async function consumeStepUpToken(kv, token, expectedUserId) {
  if (!token) return false;
  const userId = await kv.get(`step_up:${token}`);
  if (!userId || userId !== expectedUserId) return false;
  await kv.delete(`step_up:${token}`);
  return true;
}

// POST /api/auth/step-up/options
// Requires active session. Returns passkey auth challenge for the current user.
export async function stepUpOptions(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const creds = await getPasskeyCredsByUserId(env.varun_portfolio_auth, session.userId);
  if (!creds.length) return json({ error: 'No passkeys registered' }, 400);

  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'required', // always require UV for step-up
    allowCredentials: creds.map(c => ({ id: c.id, type: 'public-key' })),
  });

  await env.AUTH_KV.put(
    `step_up_challenge:${session.userId}`,
    options.challenge,
    { expirationTtl: STEP_UP_TTL },
  );

  return json({ options });
}

// POST /api/auth/step-up/verify
// Verifies the passkey response, issues a short-lived stepUpToken.
export async function stepUpVerify(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const { authResponse } = body;
  if (!authResponse) return json({ error: 'Missing authResponse' }, 400);

  const challenge = await env.AUTH_KV.get(`step_up_challenge:${session.userId}`);
  if (!challenge) return json({ error: 'Challenge expired. Please try again.' }, 400);
  await env.AUTH_KV.delete(`step_up_challenge:${session.userId}`);

  const cred = await getPasskeyCredById(env.varun_portfolio_auth, authResponse.id);
  if (!cred || cred.user_id !== session.userId) return json({ error: 'Credential not found' }, 400);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RP_ID,
      credential: {
        id: cred.id,
        publicKey: isoBase64URL.toBuffer(cred.public_key),
        counter: cred.sign_count,
      },
    });
  } catch (e) {
    return json({ error: `Verification failed: ${e.message}` }, 400);
  }

  if (!verification.verified) return json({ error: 'Not verified' }, 400);

  await updateSignCount(env.varun_portfolio_auth, cred.id, verification.authenticationInfo.newCounter);

  const stepUpToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.AUTH_KV.put(`step_up:${stepUpToken}`, session.userId, { expirationTtl: STEP_UP_TTL });

  return json({ ok: true, stepUpToken });
}
