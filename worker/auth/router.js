import { sendOTP, verifyOTP } from './otp.js';
import { getRegisterOptions, verifyRegistration, getAuthOptions, verifyAuth } from './passkey.js';
import { getMe, logout, finaliseSession } from './session.js';
import { numMatchSubscribe, numMatchWait } from './numMatch.js';
import { stepUpOptions, stepUpVerify } from './stepUp.js';
import { recoveryStart, recoveryVerify, recoverySignIn } from './recovery.js';
import { totpStatus, totpSetup, totpEnable, totpDisable, totpSignin } from './totp.js';
import {
  listSessions, revokeSession, revokeOtherSessions, renameSession,
  listPasskeys, revokePasskey, renamePasskey,
  listSecurityEvents,
  recoveryCodesStatus, regenerateRecoveryCodes,
  deleteAccount,
  updateNickname,
} from './account.js';
import {
  getWhatsAppStatus, sendVerifyOTP, confirmPhone, removePhone,
  sendSigninOTP, verifySigninOTP,
} from './whatsapp.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleAuth(request, env, url) {
  const path = url.pathname.replace('/api/auth', '');
  const method = request.method;

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

  // ── Account deletion ────────────────────────────────────────────
  if (method === 'DELETE' && path === '/account')                   return deleteAccount(request, env);

  // ── Account recovery ────────────────────────────────────────────
  if (method === 'POST' && path === '/recovery/start')              return recoveryStart(request, env);
  if (method === 'POST' && path === '/recovery/verify')             return recoveryVerify(request, env);
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
