import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getOrCreateUser, getUserById,
  getPasskeyCredsByUserId, getPasskeyCredById,
  savePasskeyCred, updateSignCount,
  hasTrustedSessions, isKnownDevice,
  generateAndStoreRecoveryCodes,
  isUserFrozen,
  logSecurityEvent,
} from '../db.js';
import { createPendingSession } from './session.js';
import { generateDisplayCode } from './crypto.js';
import { getClientIP } from '../utils.js';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// In local dev the wrangler port can vary, so derive expectedOrigin from
// the request's Origin header for localhost. In production, always use
// the configured ORIGIN env var (authoritative, never trust the client).
function expectedOrigin(request, env) {
  const reqOrigin = request.headers.get('Origin') || '';
  if (reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1')) {
    return reqOrigin;
  }
  return env.ORIGIN;
}

// ── Registration ──────────────────────────────────────────────────

export async function getRegisterOptions(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, recoveryToken } = body;
  if (!email) return json({ error: 'Missing email' }, 400);

  // Accept either email_verified (normal registration) or recovery_gate (recovery flow)
  if (recoveryToken) {
    const gate = await env.AUTH_KV.get(`recovery_gate:${recoveryToken}`);
    if (!gate) return json({ error: 'Recovery session expired. Please start again.' }, 403);
  } else {
    const verified = await env.AUTH_KV.get(`email_verified:${email}`);
    if (!verified) return json({ error: 'Email not verified. Please complete OTP verification first.' }, 403);
  }

  const db = env.varun_portfolio_auth;
  const user = await getOrCreateUser(db, email);

  if (await isUserFrozen(db, user.id)) {
    return json({ error: 'Account is frozen. Please contact support.' }, 403);
  }

  const existingCreds = await getPasskeyCredsByUserId(db, user.id);

  const options = await generateRegistrationOptions({
    rpName: 'varunr.dev',
    rpID: env.RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: email,
    userDisplayName: email,
    excludeCredentials: existingCreds.map(c => ({ id: c.id, type: 'public-key' })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await env.AUTH_KV.put(`reg_challenge:${user.id}`, options.challenge, { expirationTtl: 60 });
  return json({ options, userId: user.id });
}

export async function verifyRegistration(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, userId, registrationResponse, recoveryToken } = body;
  if (!email || !userId || !registrationResponse) return json({ error: 'Missing fields' }, 400);

  const challenge = await env.AUTH_KV.get(`reg_challenge:${userId}`);
  if (!challenge) return json({ error: 'Registration challenge expired. Please try again.' }, 400);
  await env.AUTH_KV.delete(`reg_challenge:${userId}`);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(request, env),
      expectedRPID: env.RP_ID,
    });
  } catch (e) {
    return json({ error: `Registration failed: ${e.message}` }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return json({ error: 'Verification failed' }, 400);
  }

  const { credential } = verification.registrationInfo;

  // Detect synced vs device-bound
  const transports = registrationResponse.response?.transports || [];
  const authenticatorType = credential.type || 'platform';
  const isSynced = authenticatorType === 'cross-platform' || transports.includes('hybrid');

  try {
    await savePasskeyCred(env.varun_portfolio_auth, {
      id: credential.id,
      userId,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      signCount: credential.counter,
      authenticatorType,
      isSynced,
      transport: JSON.stringify(transports),
    });
  } catch (e) {
    console.error('savePasskeyCred failed:', e.message);
    return json({ error: `Failed to save credential: ${e.message}` }, 500);
  }

  // Clean up verification gates
  await env.AUTH_KV.delete(`email_verified:${email}`);
  if (recoveryToken) await env.AUTH_KV.delete(`recovery_gate:${recoveryToken}`);

  // Generate recovery codes (8 codes, shown once to user)
  const recoveryCodes = await generateAndStoreRecoveryCodes(env.varun_portfolio_auth, userId);

  await logSecurityEvent(env.varun_portfolio_auth, {
    userId, type: 'passkey_added',
    ip: getClientIP(request),
    userAgent: request.headers.get('User-Agent') || '',
    metadata: { authenticatorType, isSynced },
  });

  // Issue a pending session — user must complete trust prompt before cookie is set
  const pendingToken = await createPendingSession(env.AUTH_KV, { userId, email });

  return json({
    ok: true,
    pendingToken,
    recoveryCodes,        // shown once in RecoveryCodesModal
    isSynced,
    authenticatorType,
  });
}

// ── Authentication ────────────────────────────────────────────────

export async function getAuthOptions(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email } = body;
  if (email === undefined) return json({ error: 'Missing email' }, 400);

  const db = env.varun_portfolio_auth;

  // Empty email = conditional mediation (browser autofill passkey flow).
  // Challenge is keyed by a short-lived condToken since we have no userId yet.
  if (!email) {
    const options = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      userVerification: 'preferred',
      allowCredentials: [],
    });
    const condToken = crypto.randomUUID();
    await env.AUTH_KV.put(`cond_challenge:${condToken}`, options.challenge, { expirationTtl: 120 });
    return json({ options, userId: null, condToken });
  }

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

  // Anti-enumeration: return identical-looking response for unknown emails
  if (!user) {
    const fakeOptions = await generateAuthenticationOptions({
      rpID: env.RP_ID,
      userVerification: 'preferred',
    });
    return json({ options: fakeOptions, userId: null });
  }

  if (await isUserFrozen(db, user.id)) {
    return json({ error: 'Account is frozen. Please contact support.' }, 403);
  }

  const creds = await getPasskeyCredsByUserId(db, user.id);
  const options = await generateAuthenticationOptions({
    rpID: env.RP_ID,
    userVerification: 'preferred',
    allowCredentials: creds.map(c => ({ id: c.id, type: 'public-key' })),
  });

  await env.AUTH_KV.put(`auth_challenge:${user.id}`, options.challenge, { expirationTtl: 60 });
  return json({ options, userId: user.id, hasWhatsApp: user.phone_verified === 1 });
}

export async function verifyAuth(request, env) {
  const body = await request.json().catch(() => ({}));
  const { userId: bodyUserId, authResponse, condToken } = body;
  if (!authResponse) return json({ error: 'Missing fields' }, 400);

  const db = env.varun_portfolio_auth;
  let userId = bodyUserId;
  let challenge;

  if (condToken) {
    // Conditional mediation path — challenge keyed by condToken, userId unknown upfront
    challenge = await env.AUTH_KV.get(`cond_challenge:${condToken}`);
    if (!challenge) return json({ error: 'Challenge expired. Please try again.' }, 400);
    await env.AUTH_KV.delete(`cond_challenge:${condToken}`);
    // Derive userId from the credential that was used
    const credRow = await db.prepare('SELECT user_id FROM passkey_creds WHERE id = ?').bind(authResponse.id).first();
    if (!credRow) return json({ error: 'Credential not found' }, 400);
    userId = credRow.user_id;
  } else {
    if (!userId) return json({ error: 'Missing fields' }, 400);
    challenge = await env.AUTH_KV.get(`auth_challenge:${userId}`);
    if (!challenge) return json({ error: 'Challenge expired. Please try again.' }, 400);
    await env.AUTH_KV.delete(`auth_challenge:${userId}`);
  }

  const cred = await getPasskeyCredById(db, authResponse.id);
  if (!cred || cred.user_id !== userId) return json({ error: 'Credential not found' }, 400);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: authResponse,
      expectedChallenge: challenge,
      expectedOrigin: expectedOrigin(request, env),
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
  if (newCounter > 0 && newCounter <= cred.sign_count) {
    return json({ error: 'Authenticator anomaly detected. Contact support.' }, 403);
  }

  await updateSignCount(db, cred.id, newCounter);

  const user = await getUserById(db, userId);
  const ua = request.headers.get('User-Agent') || '';
  const ip = getClientIP(request);

  // ── Number matching: detect new device ───────────────────────────
  const knownDevice = await isKnownDevice(db, userId, ua);
  const hasKnownTrusted = await hasTrustedSessions(db, userId);

  if (!knownDevice && hasKnownTrusted) {
    // New device detected — require number matching approval from a trusted session
    const displayCode = generateDisplayCode();
    const approvalToken = crypto.randomUUID();
    const tempToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const TTL = 300;

    await env.AUTH_KV.put(
      `num_match:${approvalToken}`,
      JSON.stringify({ userId, email: user.email, code: displayCode, approved: false, denied: false }),
      { expirationTtl: TTL },
    );
    await env.AUTH_KV.put(
      `num_match_pending:${tempToken}`,
      JSON.stringify({ code: displayCode, approvalToken, userId, email: user.email }),
      { expirationTtl: TTL },
    );
    // Allows any trusted session for this user to discover the pending approval
    await env.AUTH_KV.put(
      `num_match_for_user:${userId}`,
      JSON.stringify({ approvalToken, code: displayCode, userAgent: ua }),
      { expirationTtl: TTL },
    );

    await logSecurityEvent(db, { userId, type: 'new_device', ip, userAgent: ua });

    // Push approval request to any trusted devices already connected via WebSocket.
    // Fire-and-forget — if the DO isn't running yet, trusted devices will receive
    // the pending approval from KV when they next connect.
    try {
      const doId = env.NUM_MATCH_DO.idFromName(userId);
      const stub = env.NUM_MATCH_DO.get(doId);
      await stub.fetch(new Request('http://do-internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalToken, code: displayCode, userAgent: ua, userId }),
      }));
    } catch { /* non-fatal: KV is the source of truth */ }

    return json({ pendingNumberMatch: true, code: displayCode, tempToken });
  }

  // Known device — issue pending session for trust prompt
  const pendingToken = await createPendingSession(env.AUTH_KV, { userId, email: user.email, method: 'passkey' });
  return json({ ok: true, pendingToken });
}
