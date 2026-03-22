// ── User preferences ──────────────────────────────────────────────
// GET  /api/auth/account/preferences  — return current prefs
// PATCH /api/auth/account/preferences — update one or both fields
//
// KV key: prefs:{userId}
// Schema: { colorBlindMode: 'none'|'deuteranopia'|'tritanopia', themePref: 'auto'|'light'|'dark' }

import { getSession } from './auth/session.js';

const VALID_CBM   = new Set(['none', 'deuteranopia', 'tritanopia']);
const VALID_THEME = new Set(['auto', 'light', 'dark']);
const DEFAULTS    = { colorBlindMode: 'none', themePref: 'auto' };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadPrefs(kv, userId) {
  const raw = await kv.get(`prefs:${userId}`, { cacheTtl: 300 });
  return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
}

export async function getPreferences(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const prefs = await loadPrefs(env.AUTH_KV, session.userId);
  return json({ prefs });
}

export async function updatePreferences(request, env) {
  const session = await getSession(env.AUTH_KV, request);
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const prefs = await loadPrefs(env.AUTH_KV, session.userId);

  if (body.colorBlindMode !== undefined) {
    if (!VALID_CBM.has(body.colorBlindMode))
      return json({ error: 'Invalid colorBlindMode' }, 400);
    prefs.colorBlindMode = body.colorBlindMode;
  }
  if (body.themePref !== undefined) {
    if (!VALID_THEME.has(body.themePref))
      return json({ error: 'Invalid themePref' }, 400);
    prefs.themePref = body.themePref;
  }

  await env.AUTH_KV.put(`prefs:${session.userId}`, JSON.stringify(prefs));
  return json({ ok: true, prefs });
}
