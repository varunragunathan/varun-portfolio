import { sendOTP, verifyOTP } from './otp.js';
import { getRegisterOptions, verifyRegistration, getAuthOptions, verifyAuth } from './passkey.js';
import { getMe, logout } from './session.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleAuth(request, env, url) {
  const path = url.pathname.replace('/api/auth', '');
  const method = request.method;

  if (method === 'POST' && path === '/otp/send')                    return sendOTP(request, env);
  if (method === 'POST' && path === '/otp/verify')                  return verifyOTP(request, env);
  if (method === 'POST' && path === '/passkey/register/options')    return getRegisterOptions(request, env);
  if (method === 'POST' && path === '/passkey/register/verify')     return verifyRegistration(request, env);
  if (method === 'POST' && path === '/passkey/auth/options')        return getAuthOptions(request, env);
  if (method === 'POST' && path === '/passkey/auth/verify')         return verifyAuth(request, env);
  if (method === 'GET'  && path === '/me')                          return getMe(request, env);
  if (method === 'POST' && path === '/logout')                      return logout(request, env);

  return json({ error: 'Not found' }, 404);
}
