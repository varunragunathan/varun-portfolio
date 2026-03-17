import { sendOTP, verifyOTP } from './otp.js';
import { getRegisterOptions, verifyRegistration, getAuthOptions, verifyAuth } from './passkey.js';
import { getMe, logout, finaliseSession } from './session.js';
import { numMatchSubscribe, numMatchWait } from './numMatch.js';
import { stepUpOptions, stepUpVerify } from './stepUp.js';
import { recoveryStart, recoveryVerify, recoveryVerifyTOTP, recoverySignIn } from './recovery.js';
import { totpStatus, totpSetup, totpEnable, totpDisable, totpSignin } from './totp.js';
import {
  listSessions, revokeSession, revokeOtherSessions, renameSession,
  listPasskeys, revokePasskey, renamePasskey,
  listSecurityEvents,
  recoveryCodesStatus, regenerateRecoveryCodes,
  deleteAccount,
  updateNickname,
  listTrustedDevicesHandler, revokeTrustedDeviceHandler,
} from './account.js';
import {
  getWhatsAppStatus, sendVerifyOTP, confirmPhone, removePhone,
  sendSigninOTP, verifySigninOTP,
} from './whatsapp.js';
import { checkIpRateLimit } from '../rateLimit.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tooManyRequests(retryAfter) {
  return new Response(JSON.stringify({ error: 'Too many requests', retryAfter }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  });
}

export async function handleAuth(request, env, url) {
  const path   = url.pathname.replace('/api/auth', '');
  const method = request.method;
  const ip     = request.headers.get('CF-Connecting-IP');

  // ── Broad IP limit: 30 req / 10 min across all auth endpoints ───
  const broad = await checkIpRateLimit(env.AUTH_KV, ip, 'auth', 30, 10 * 60_000);
  if (!broad.allowed) return tooManyRequests(broad.retryAfter);

  // ── Tight IP limit: 5 req / 10 min for OTP and recovery send ────
  const isSensitive = (method === 'POST' && (
    path === '/otp/send' ||
    path === '/recovery/start' ||
    path === '/whatsapp/signin/send'
  ));
  if (isSensitive) {
    const tight = await checkIpRateLimit(env.AUTH_KV, ip, 'otp', 5, 10 * 60_000);
    if (!tight.allowed) return tooManyRequests(tight.retryAfter);
  }

  // ── OTP ─────────────────────────────────────────────────────────
  if (method === 'POST' && path === '/otp/send')                    return sendOTP(request, env);
  if (method === 'POST' && path === '/otp/verify')                  return verifyOTP(request, env);

  // ── Passkey ─────────────────────────────────────────────────────
  if (method === 'POST' && path === '/passkey/register/options')    return getRegisterOptions(request, env);
  if (method === 'POST' && path === '/passkey/register/verify')     return verifyRegistration(request, env);
  if (method === 'POST' && path === '/passkey/auth/options')        return getAuthOptions(request, env);
  if (method === 'POST' && path === '/passkey/auth/verify')         return verifyAuth(request, env);

  // ── Session ─────────────────────────────────────────────────────
  if (method === 'GET'  && path === '/me')                          return getMe(request, env);
  if (method === 'POST' && path === '/logout')                      return logout(request, env);
  if (method === 'POST' && path === '/sessions/finalise')           return finaliseSession(request, env);

  // ── Sessions management ─────────────────────────────────────────
  if (method === 'GET'    && path === '/sessions')                  return listSessions(request, env);
  if (method === 'DELETE' && path === '/sessions')                  return revokeOtherSessions(request, env);

  // /sessions/:id
  const sessionMatch = path.match(/^\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const id = sessionMatch[1];
    if (method === 'DELETE') return revokeSession(request, env, id);
    if (method === 'PATCH')  return renameSession(request, env, id);
  }

  // ── Passkey management ──────────────────────────────────────────
  if (method === 'GET' && path === '/passkeys')                     return listPasskeys(request, env);

  // /passkeys/:id
  const passkeyMatch = path.match(/^\/passkeys\/([^/]+)$/);
  if (passkeyMatch) {
    const id = passkeyMatch[1];
    if (method === 'DELETE') return revokePasskey(request, env, id);
    if (method === 'PATCH')  return renamePasskey(request, env, id);
  }

  // ── Security events ─────────────────────────────────────────────
  if (method === 'GET' && path === '/security-events')              return listSecurityEvents(request, env);

  // ── Recovery codes ──────────────────────────────────────────────
  if (method === 'GET'  && path === '/recovery-codes/status')       return recoveryCodesStatus(request, env);
  if (method === 'POST' && path === '/recovery-codes/regenerate')   return regenerateRecoveryCodes(request, env);

  // ── Number matching (WebSocket) ─────────────────────────────────
  // GET (WS upgrade) — trusted session subscribes for approval requests
  if (method === 'GET'  && path === '/num-match/subscribe')         return numMatchSubscribe(request, env);
  // GET (WS upgrade) — new device waits for approval result
  if (method === 'GET'  && path === '/num-match/wait')              return numMatchWait(request, env);

  // ── Profile ─────────────────────────────────────────────────────
  if (method === 'PATCH' && path === '/account/nickname')           return updateNickname(request, env);

  // ── Step-up authentication ──────────────────────────────────────
  if (method === 'POST' && path === '/step-up/options')             return stepUpOptions(request, env);
  if (method === 'POST' && path === '/step-up/verify')              return stepUpVerify(request, env);

  // ── Trusted devices ─────────────────────────────────────────────
  if (method === 'GET' && path === '/trusted-devices')              return listTrustedDevicesHandler(request, env);
  const trustedDeviceMatch = path.match(/^\/trusted-devices\/([^/]+)$/);
  if (trustedDeviceMatch && method === 'DELETE')                    return revokeTrustedDeviceHandler(request, env, trustedDeviceMatch[1]);

  // ── Account deletion ────────────────────────────────────────────
  if (method === 'DELETE' && path === '/account')                   return deleteAccount(request, env);

  // ── Account recovery ────────────────────────────────────────────
  if (method === 'POST' && path === '/recovery/start')              return recoveryStart(request, env);
  if (method === 'POST' && path === '/recovery/verify')             return recoveryVerify(request, env);
  if (method === 'POST' && path === '/recovery/verify-totp')        return recoveryVerifyTOTP(request, env);
  if (method === 'POST' && path === '/recovery/signin')             return recoverySignIn(request, env);

  // ── TOTP ─────────────────────────────────────────────────────────
  if (method === 'GET'  && path === '/totp/status')                 return totpStatus(request, env);
  if (method === 'POST' && path === '/totp/setup')                  return totpSetup(request, env);
  if (method === 'POST' && path === '/totp/enable')                 return totpEnable(request, env);
  if (method === 'POST' && path === '/totp/disable')                return totpDisable(request, env);
  if (method === 'POST' && path === '/totp/signin')                 return totpSignin(request, env);

  // ── WhatsApp backup auth ─────────────────────────────────────────
  if (method === 'GET'    && path === '/whatsapp/status')           return getWhatsAppStatus(request, env);
  if (method === 'POST'   && path === '/whatsapp/send-otp')         return sendVerifyOTP(request, env);
  if (method === 'POST'   && path === '/whatsapp/confirm')          return confirmPhone(request, env);
  if (method === 'DELETE' && path === '/whatsapp/phone')            return removePhone(request, env);
  if (method === 'POST'   && path === '/whatsapp/signin/send')      return sendSigninOTP(request, env);
  if (method === 'POST'   && path === '/whatsapp/signin/verify')    return verifySigninOTP(request, env);

  return json({ error: 'Not found' }, 404);
}
