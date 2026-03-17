// ── Cloudflare Worker entry point ────────────────────────────────
// Handles /api/auth/*, /api/chat/*, /api/admin/*, /api/user/* routes.
// Everything else falls through to static assets (the React build).

import { handleAuth }                     from './auth/router.js';
import { postChat, listConversations, getConversation, deleteConversation, listChatModels } from './chat.js';
import {
  listUpgradeRequests,
  approveUpgrade,
  rejectUpgrade,
  listAdminUsers,
  listAdminModels,
  addAdminModel,
  toggleAdminModel,
  makeAdminUser,
  getPersonas,
  updatePersonas,
} from './admin.js';
import { submitUpgradeRequest, getUpgradeRequest } from './userTier.js';
import { getMetrics } from './metrics.js';
import { logEndpointRequest, getEndpointMetrics } from './endpointMetrics.js';
export { NumMatchDO } from './numMatchDO.js';

const ALLOWED_ORIGINS = ['https://varunr.dev', 'http://localhost:5173'];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

// ── Inner handler (no logging) ────────────────────────────────────
async function handleRequest(request, env) {
  const url    = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const cors   = corsHeaders(origin);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // ── /api/chat ─────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/chat')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      let response;

      const convMatch = path.match(/^\/api\/chat\/conversations\/([^/]+)$/);
      if (convMatch) {
        const id = convMatch[1];
        if (method === 'GET')         response = await getConversation(request, env, id);
        else if (method === 'DELETE') response = await deleteConversation(request, env, id);
        else response = new Response('Method Not Allowed', { status: 405 });
      } else if (path === '/api/chat/conversations') {
        if (method === 'GET') response = await listConversations(request, env);
        else response = new Response('Method Not Allowed', { status: 405 });
      } else if (path === '/api/chat/models') {
        if (method === 'GET') response = await listChatModels(request, env);
        else response = new Response('Method Not Allowed', { status: 405 });
      } else if (path === '/api/chat') {
        if (method === 'POST') response = await postChat(request, env);
        else response = new Response('Method Not Allowed', { status: 405 });
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // SSE responses must pass through unmodified (no header wrapping)
      if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response;
      return withCors(response, cors);
    } catch (err) {
      console.error('Chat error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // ── /api/admin ────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/admin/')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      let response;

      const makeAdminMatch   = path.match(/^\/api\/admin\/users\/([^/]+)\/make-admin$/);
      const modelToggleMatch = path.match(/^\/api\/admin\/models\/([^/]+)$/);
      const approveMatch     = path.match(/^\/api\/admin\/upgrade-requests\/([^/]+)\/approve$/);
      const rejectMatch      = path.match(/^\/api\/admin\/upgrade-requests\/([^/]+)\/reject$/);

      if (makeAdminMatch && method === 'POST') {
        response = await makeAdminUser(request, env, makeAdminMatch[1]);
      } else if (approveMatch && method === 'POST') {
        response = await approveUpgrade(request, env, approveMatch[1]);
      } else if (rejectMatch && method === 'POST') {
        response = await rejectUpgrade(request, env, rejectMatch[1]);
      } else if (modelToggleMatch && method === 'PATCH') {
        response = await toggleAdminModel(request, env, modelToggleMatch[1]);
      } else if (path === '/api/admin/upgrade-requests' && method === 'GET') {
        response = await listUpgradeRequests(request, env);
      } else if (path === '/api/admin/users' && method === 'GET') {
        response = await listAdminUsers(request, env);
      } else if (path === '/api/admin/models' && method === 'GET') {
        response = await listAdminModels(request, env);
      } else if (path === '/api/admin/models' && method === 'POST') {
        response = await addAdminModel(request, env);
      } else if (path === '/api/admin/metrics' && method === 'GET') {
        response = await getMetrics(request, env);
      } else if (path === '/api/admin/endpoint-metrics' && method === 'GET') {
        response = await getEndpointMetrics(request, env);
      } else if (path === '/api/admin/personas' && method === 'GET') {
        response = await getPersonas(request, env);
      } else if (path === '/api/admin/personas' && method === 'PUT') {
        response = await updatePersonas(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return withCors(response, cors);
    } catch (err) {
      console.error('Admin error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // ── /api/user ─────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/user/')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      let response;

      if (path === '/api/user/upgrade-request' && method === 'POST') {
        response = await submitUpgradeRequest(request, env);
      } else if (path === '/api/user/upgrade-request' && method === 'GET') {
        response = await getUpgradeRequest(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return withCors(response, cors);
    } catch (err) {
      console.error('User tier error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // ── /api/auth ─────────────────────────────────────────────────
  if (url.pathname.startsWith('/api/auth/')) {
    if (env.ENABLE_AUTH !== 'true') {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    try {
      const response = await handleAuth(request, env, url);
      if (response.status === 101) return response;
      return withCors(response, cors);
    } catch (err) {
      console.error('Auth error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // All non-API requests → serve the React static build
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env);

    // Log all API requests asynchronously — skip OPTIONS, streaming, WebSocket,
    // and the endpoint-metrics endpoint itself to avoid self-referential noise.
    const url = new URL(request.url);
    if (
      request.method !== 'OPTIONS' &&
      url.pathname.startsWith('/api/') &&
      response.status !== 101 &&
      !response.headers.get('Content-Type')?.startsWith('text/event-stream') &&
      url.pathname !== '/api/admin/endpoint-metrics'
    ) {
      ctx.waitUntil(logEndpointRequest(env.varun_portfolio_auth, request, response));
    }

    return response;
  },
};
