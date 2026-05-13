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
  makeProUser,
  getPersonas,
  updatePersonas,
  getRateLimits,
  updateRateLimits,
  resetRateLimits,
} from './admin.js';
import { runEvals, getEvalRuns, deleteEvalRuns } from './evals.js';
import { submitUpgradeRequest, getUpgradeRequest } from './userTier.js';
import { listGlossary, createTerm, updateTerm, deleteTerm, bulkSync } from './glossary.js';
import {
  listSurveys, getSurvey, getSurveyBySlug, createSession, sendMessage, completeSession,
  adminListSurveys, adminCreateSurvey, adminUpdateSurvey, adminDeleteSurvey,
  adminListSessions, adminGetSession, adminDeleteSession,
} from './surveys.js';
import { submitFeedbackHandler } from './feedback.js';
import {
  adminListPages, adminCreatePage, adminGetPage, adminUpdatePage, adminDeletePage,
  getPublicPage,
} from './pages.js';
import { checkIpRateLimit } from './rateLimit.js';
import { getMetrics } from './metrics.js';
import { logEndpointRequest, getEndpointMetrics } from './endpointMetrics.js';
export { NumMatchDO } from './numMatchDO.js';

const ALLOWED_ORIGINS = ['https://varunr.dev', 'http://localhost:5173'];

// Escape characters that would break an HTML attribute value
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// HTMLRewriter handler that replaces all text inside an element (e.g. <title>)
class TextReplacer {
  constructor(text) { this._text = text; this._first = true; }
  text(chunk) {
    if (this._first) { chunk.replace(this._text); this._first = false; }
    else chunk.remove();
  }
}

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
      const makeProMatch     = path.match(/^\/api\/admin\/users\/([^/]+)\/make-pro$/);
      const modelToggleMatch = path.match(/^\/api\/admin\/models\/(.+)$/);
      const approveMatch     = path.match(/^\/api\/admin\/upgrade-requests\/([^/]+)\/approve$/);
      const rejectMatch      = path.match(/^\/api\/admin\/upgrade-requests\/([^/]+)\/reject$/);

      if (makeAdminMatch && method === 'POST') {
        response = await makeAdminUser(request, env, makeAdminMatch[1]);
      } else if (makeProMatch && method === 'POST') {
        response = await makeProUser(request, env, makeProMatch[1]);
      } else if (approveMatch && method === 'POST') {
        response = await approveUpgrade(request, env, approveMatch[1]);
      } else if (rejectMatch && method === 'POST') {
        response = await rejectUpgrade(request, env, rejectMatch[1]);
      } else if (modelToggleMatch && method === 'PATCH') {
        response = await toggleAdminModel(request, env, decodeURIComponent(modelToggleMatch[1]));
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
      } else if (path === '/api/admin/rate-limits' && method === 'GET') {
        response = await getRateLimits(request, env);
      } else if (path === '/api/admin/rate-limits' && method === 'PUT') {
        response = await updateRateLimits(request, env);
      } else if (path === '/api/admin/rate-limits' && method === 'DELETE') {
        response = await resetRateLimits(request, env);
      } else if (path === '/api/admin/pages' && method === 'GET') {
        response = await adminListPages(request, env);
      } else if (path === '/api/admin/pages' && method === 'POST') {
        response = await adminCreatePage(request, env);
      } else if (path === '/api/admin/evals/runs' && method === 'GET') {
        response = await getEvalRuns(request, env);
      } else if (path === '/api/admin/evals/runs' && method === 'DELETE') {
        response = await deleteEvalRuns(request, env);
      } else if (path === '/api/admin/evals/run' && method === 'POST') {
        response = await runEvals(request, env);
      }

      // ── Pattern-matched admin routes (pages + surveys) ────────
      else {
        const adminPageMatch     = path.match(/^\/api\/admin\/pages\/([^/]+)$/);
        const adminSurveyMatch   = path.match(/^\/api\/admin\/surveys\/([^/]+)$/);
        const adminSessionsMatch = path.match(/^\/api\/admin\/surveys\/([^/]+)\/sessions$/);
        const adminSessionMatch  = path.match(/^\/api\/admin\/surveys\/([^/]+)\/sessions\/([^/]+)$/);

        if (adminPageMatch && method === 'GET') {
          response = await adminGetPage(request, env, adminPageMatch[1]);
        } else if (adminPageMatch && method === 'PATCH') {
          response = await adminUpdatePage(request, env, adminPageMatch[1]);
        } else if (adminPageMatch && method === 'DELETE') {
          response = await adminDeletePage(request, env, adminPageMatch[1]);
        } else if (adminSessionsMatch && method === 'GET') {
          response = await adminListSessions(request, env, adminSessionsMatch[1]);
        } else if (adminSessionMatch && method === 'GET') {
          response = await adminGetSession(request, env, adminSessionMatch[1], adminSessionMatch[2]);
        } else if (adminSessionMatch && method === 'DELETE') {
          response = await adminDeleteSession(request, env, adminSessionMatch[1], adminSessionMatch[2]);
        } else if (path === '/api/admin/surveys' && method === 'GET') {
          response = await adminListSurveys(request, env);
        } else if (path === '/api/admin/surveys' && method === 'POST') {
          response = await adminCreateSurvey(request, env);
        } else if (adminSurveyMatch && method === 'PATCH') {
          response = await adminUpdateSurvey(request, env, adminSurveyMatch[1]);
        } else if (adminSurveyMatch && method === 'DELETE') {
          response = await adminDeleteSurvey(request, env, adminSurveyMatch[1]);
        } else {
          response = new Response(JSON.stringify({ error: 'Not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
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

  // ── /api/feedback ─────────────────────────────────────────────
  if (url.pathname === '/api/feedback' && request.method === 'POST') {
    try {
      const ip = request.headers.get('CF-Connecting-IP');
      const fbLimit = await checkIpRateLimit(env.KV, ip, 'feedback', 5, 3_600_000);
      if (!fbLimit.allowed) {
        return withCors(new Response(JSON.stringify({ error: 'Too many requests', retryAfter: fbLimit.retryAfter }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': String(fbLimit.retryAfter) },
        }), cors);
      }
      return withCors(await submitFeedbackHandler(request, env), cors);
    } catch (err) {
      console.error('Feedback error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors },
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

  // ── /api/pages (public) ──────────────────────────────────────
  const publicPageApiMatch = url.pathname.match(/^\/api\/pages\/([^/]+)$/);
  if (publicPageApiMatch && request.method === 'GET') {
    try {
      const response = await getPublicPage(request, env, publicPageApiMatch[1]);
      return withCors(response, cors);
    } catch (err) {
      console.error('Public page error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
    }
  }

  // ── /api/surveys (public) ────────────────────────────────────
  if (url.pathname.startsWith('/api/surveys')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      let response;

      const sessionMatch    = path.match(/^\/api\/surveys\/([^/]+)\/sessions$/);
      const messageMatch      = path.match(/^\/api\/surveys\/([^/]+)\/sessions\/([^/]+)\/message$/);
      const completeMatch     = path.match(/^\/api\/surveys\/([^/]+)\/sessions\/([^/]+)\/complete$/);
      const surveyBySlugMatch = path.match(/^\/api\/surveys\/s\/([^/]+)$/);
      const surveyByIdMatch   = path.match(/^\/api\/surveys\/([^/]+)$/);

      if (path === '/api/surveys' && method === 'GET') {
        response = await listSurveys(request, env);
      } else if (surveyBySlugMatch && method === 'GET') {
        response = await getSurveyBySlug(request, env, surveyBySlugMatch[1]);
      } else if (surveyByIdMatch && method === 'GET') {
        response = await getSurvey(request, env, surveyByIdMatch[1]);
      } else if (sessionMatch && method === 'POST') {
        response = await createSession(request, env, sessionMatch[1]);
      } else if (messageMatch && method === 'POST') {
        response = await sendMessage(request, env, messageMatch[1], messageMatch[2]);
      } else if (completeMatch && method === 'PATCH') {
        response = await completeSession(request, env, completeMatch[1], completeMatch[2]);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // SSE responses pass through unmodified
      if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response;
      return withCors(response, cors);
    } catch (err) {
      console.error('Survey error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // ── /api/glossary ─────────────────────────────────────────────
  if (url.pathname.startsWith('/api/glossary')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      let response;

      const termMatch = path.match(/^\/api\/glossary\/([^/]+)$/);

      if (path === '/api/glossary/sync' && method === 'POST') {
        response = await bulkSync(request, env);
      } else if (path === '/api/glossary' && method === 'GET') {
        response = await listGlossary(request, env);
      } else if (path === '/api/glossary' && method === 'POST') {
        response = await createTerm(request, env);
      } else if (termMatch && method === 'PATCH') {
        response = await updateTerm(request, env, termMatch[1]);
      } else if (termMatch && method === 'DELETE') {
        response = await deleteTerm(request, env, termMatch[1]);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return withCors(response, cors);
    } catch (err) {
      console.error('Glossary error:', err);
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

  // ── Dynamic OG tags for short survey URLs /s/:slug ───────────
  const shortSurveyMatch = url.pathname.match(/^\/s\/([^/]+)$/);
  if (shortSurveyMatch && request.method === 'GET') {
    try {
      const survey = await env.varun_portfolio_auth
        .prepare('SELECT id, title, description FROM surveys WHERE slug = ? AND is_active = 1')
        .bind(shortSurveyMatch[1])
        .first();
      if (survey) {
        const title   = `${survey.title} — Hooty wants to chat 🦉`;
        const desc    = survey.description?.trim() ||
          'A friendly 3-minute chat with Hooty the owl. No right answers — just curious questions.';
        const pageUrl = url.href;
        const imgUrl  = `${url.origin}/owl-og.svg`;
        const asset   = await env.ASSETS.fetch(new Request(new URL('/', url.origin)));
        return new HTMLRewriter()
          .on('title', new TextReplacer(title))
          .on('meta[property="og:title"]',      { element: el => el.setAttribute('content', title) })
          .on('meta[property="og:description"]', { element: el => el.setAttribute('content', desc) })
          .on('meta[property="og:url"]',         { element: el => el.setAttribute('content', pageUrl) })
          .on('meta[name="description"]',        { element: el => el.setAttribute('content', desc) })
          .on('head', {
            element(el) {
              el.append(
                `<meta property="og:image" content="${imgUrl}" />` +
                `<meta property="og:image:width" content="300" />` +
                `<meta property="og:image:height" content="300" />` +
                `<meta name="twitter:card" content="summary" />` +
                `<meta name="twitter:title" content="${escAttr(title)}" />` +
                `<meta name="twitter:description" content="${escAttr(desc)}" />` +
                `<meta name="twitter:image" content="${imgUrl}" />`,
                { html: true },
              );
            },
          })
          .transform(asset);
      }
    } catch { /* fall through to SPA */ }
  }

  // ── Dynamic OG tags for survey pages ─────────────────────────
  const surveyPageMatch = url.pathname.match(/^\/survey\/([^/]+)$/);
  if (surveyPageMatch && request.method === 'GET') {
    try {
      const survey = await env.varun_portfolio_auth
        .prepare('SELECT title, description FROM surveys WHERE id = ? AND is_active = 1')
        .bind(surveyPageMatch[1])
        .first();

      if (survey) {
        const title   = `${survey.title} — Hooty wants to chat 🦉`;
        const desc    = survey.description?.trim() ||
          'A friendly 3-minute chat with Hooty the owl. No right answers — just curious questions.';
        const pageUrl = url.href;
        const imgUrl  = `${url.origin}/icon-512.png`;

        const asset = await env.ASSETS.fetch(request);
        return new HTMLRewriter()
          .on('title', new TextReplacer(title))
          .on('meta[property="og:title"]',       { element: el => el.setAttribute('content', title) })
          .on('meta[property="og:description"]',  { element: el => el.setAttribute('content', desc) })
          .on('meta[property="og:url"]',          { element: el => el.setAttribute('content', pageUrl) })
          .on('meta[name="description"]',         { element: el => el.setAttribute('content', desc) })
          .on('head', {
            element(el) {
              el.append(
                `<meta property="og:image" content="${imgUrl}" />` +
                `<meta name="twitter:card" content="summary" />` +
                `<meta name="twitter:title" content="${escAttr(title)}" />` +
                `<meta name="twitter:description" content="${escAttr(desc)}" />` +
                `<meta name="twitter:image" content="${imgUrl}" />`,
                { html: true },
              );
            },
          })
          .transform(asset);
      }
    } catch { /* fall through */ }
  }

  // All non-API requests → serve the React static build
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const response = await handleRequest(request, env);

    // Log requests asynchronously. Rules:
    //  - Skip OPTIONS and WebSocket upgrades (101)
    //  - Skip the endpoint-metrics endpoint itself (self-referential noise)
    //  - For non-API paths: only log page navigations — i.e. GET requests with
    //    no file extension in the last segment (filters out .js/.css/.png chunks)
    const url = new URL(request.url);
    const isApi  = url.pathname.startsWith('/api/');
    const isPage = !isApi &&
                   request.method === 'GET' &&
                   !/\.[a-z0-9]+$/i.test(url.pathname); // no file extension → SPA route
    if (
      request.method !== 'OPTIONS' &&
      response.status !== 101 &&
      url.pathname !== '/api/admin/endpoint-metrics' &&
      (isApi || isPage)
    ) {
      ctx.waitUntil(logEndpointRequest(env.varun_portfolio_auth, request, response));
    }

    return response;
  },
};
