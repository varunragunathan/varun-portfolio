// ── Cloudflare Worker entry point ────────────────────────────────
// Handles /api/auth/* routes when ENABLE_AUTH=true.
// Everything else falls through to static assets (the React build).

import { handleAuth } from './auth/router.js';

const ALLOWED_ORIGINS = ['https://varunr.dev', 'http://localhost:5173'];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname.startsWith('/api/auth/')) {
      // Feature flag — routes don't exist at all when auth is disabled
      if (env.ENABLE_AUTH !== 'true') {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }

      try {
        const response = await handleAuth(request, env, url);
        // Attach CORS headers to every auth response
        const headers = new Headers(response.headers);
        Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
        return new Response(response.body, { status: response.status, headers });
      } catch (err) {
        console.error('Auth error:', err);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // All non-auth requests → serve the React static build
    return env.ASSETS.fetch(request);
  },
};
