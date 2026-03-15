// ── Session management ────────────────────────────────────────────
// Sessions live in KV with a 24h TTL.
// The session token is a random 64-byte hex string stored in an
// httpOnly cookie — never accessible to client-side JS.

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function sessionCookie(token, maxAge = 86400) {
  return `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? match[1] : null;
}

export async function createSession(kv, { userId, email }) {
  // Two UUIDs concatenated = 72 chars = 256 bits of randomness
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await kv.put(`session:${token}`, JSON.stringify({ userId, email }), { expirationTtl: 86400 });
  return token;
}

export async function getSession(kv, request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const raw = await kv.get(`session:${token}`);
  if (!raw) return null;
  return { token, ...JSON.parse(raw) };
}

// GET /api/auth/me — returns current user from session cookie
export async function getMe(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ user: null });
  return json({ user: { email: session.email, userId: session.userId } });
}

// POST /api/auth/logout — deletes session, clears cookie
export async function logout(request, env) {
  const token = getTokenFromRequest(request);
  if (token) await env.AUTH_KV.delete(`session:${token}`);
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}

export { sessionCookie };
