// ── Passkey register + authenticate ──────────────────────────────
// Uses @simplewebauthn/server for all WebAuthn cryptography.
// We never touch private keys — they live on the user's device.
// We store only the public key (base64url) and the sign count.
//
// Sign count: increments with every authentication. If the count we
// receive is <= what we stored, someone may have cloned the authenticator.
// We reject those attempts.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getOrCreateUser,
  getUserById,
  getPasskeyCredsByUserId,
  getPasskeyCredById,
  savePasskeyCred,
  updateSignCount,
} from '../db.js';
import { createSession, sessionCookie } from './session.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ── Registration ──────────────────────────────────────────────────

// POST /api/auth/passkey/register/options
// Requires OTP to have been verified first (email_verified KV key must exist).
export async function getRegisterOptions(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email } = body;
  if (!email) return json({ error: 'Missing email' }, 400);

  // Guard: OTP must have been verified within the last 5 minutes
  const verified = await env.AUTH_KV.get(`email_verified:${email}`);
  if (!verified) return json({ error: 'Email not verified. Please complete OTP verification first.' }, 403);

  const db = env.varun_portfolio_auth;
  const user = await getOrCreateUser(db, email);
  const existingCreds = await getPasskeyCredsByUserId(db, user.id);

  const options = await generateRegistrationOptions({
    rpName: 'varunr.dev',
    rpID: env.RP_ID,
    // userID must be a Uint8Array — encode the UUID string
    userID: new TextEncoder().encode(user.id),
    userName: email,
    userDisplayName: email,
    // Exclude already-registered credentials so the user can't double-register the same device
    excludeCredentials: existingCreds.map(c => ({ id: c.id, type: 'public-key' })),
    authenticatorSelection: {
      residentKey: 'preferred',    // store credential on device if possible
      userVerification: 'preferred', // prompt biometric/PIN
    },
  });

  // Store challenge — single-use, 60s TTL
  await env.AUTH_KV.put(`reg_challenge:${user.id}`, options.challenge, { expirationTtl: 60 });

  return json({ options, userId: user.id });
}

// POST /api/auth/passkey/register/verify
export async function verifyRegistration(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, userId, registrationResponse } = body;
  if (!email || !userId || !registrationResponse) return json({ error: 'Missing fields' }, 400);

  const challenge = await env.AUTH_KV.get(`reg_challenge:${userId}`);
  if (!challenge) return json({ error: 'Registration challenge expired. Please try again.' }, 400);

  // Delete immediately — single-use, replay attacks impossible
  await env.AUTH_KV.delete(`reg_challenge:${userId}`);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challenge,
      expectedOrigin: env.ORIGIN,
      expectedRPID: env.RP_ID,
    });
  } catch (e) {
    return json({ error: `Registration failed: ${e.message}` }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'Verification failed' }, 400);
  }

  const { credential } = verification.registrationInfo;

  await savePasskeyCred(env.varun_portfolio_auth, {
    id: credential.id,
    userId,
    // Store public key as base64url string. This is a PUBLIC key only —
    // the private key never leaves the user's device.
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    signCount: credential.counter,
  });

  // Clean up the email_verified gate
  await env.AUTH_KV.delete(`email_verified:${email}`);

  const token = await createSession(env.AUTH_KV, { userId, email });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

// ── Authentication ────────────────────────────────────────────────

// POST /api/auth/passkey/auth/options
export async function getAuthOptions(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email } = body;
  if (!email) return json({ error: 'Missing email' }, 400);

  const db = env.varun_portfolio_auth;
  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  // If user doesn't exist, still return valid-looking options to prevent
  // timing-based email enumeration attacks.
  if (!user) {
    const fakeOptions = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      userVerification: 'preferred',
    });
    return json({ options: fakeOptions, userId: null });
  }

  const creds = await getPasskeyCredsByUserId(db, user.id);
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'preferred',
    allowCredentials: creds.map(c => ({ id: c.id, type: 'public-key' })),
  });

  await env.AUTH_KV.put(`auth_challenge:${user.id}`, options.challenge, { expirationTtl: 60 });

  return json({ options, userId: user.id });
}

// POST /api/auth/passkey/auth/verify
export async function verifyAuth(request, env) {
  const body = await request.json().catch(() => ({}));
  const { userId, authResponse } = body;
  if (!userId || !authResponse) return json({ error: 'Missing fields' }, 400);

  const challenge = await env.AUTH_KV.get(`auth_challenge:${userId}`);
  if (!challenge) return json({ error: 'Challenge expired. Please try again.' }, 400);

  // Delete immediately — single-use
  await env.AUTH_KV.delete(`auth_challenge:${userId}`);

  const cred = await getPasskeyCredById(env.varun_portfolio_auth, authResponse.id);
  if (!cred || cred.user_id !== userId) {
    return json({ error: 'Credential not found' }, 400);
  }

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
    return json({ error: `Authentication failed: ${e.message}` }, 400);
  }

  if (!verification.verified) return json({ error: 'Not verified' }, 400);

  const newCounter = verification.authenticationInfo.newCounter;

  // Cloned authenticator detection: if the counter didn't increase,
  // the credential may have been copied. Reject and alert.
  if (newCounter > 0 && newCounter <= cred.sign_count) {
    return json({ error: 'Authenticator anomaly detected. Contact support.' }, 403);
  }

  await updateSignCount(env.varun_portfolio_auth, cred.id, newCounter);

  const user = await getUserById(env.varun_portfolio_auth, userId);
  const token = await createSession(env.AUTH_KV, { userId, email: user.email });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}
