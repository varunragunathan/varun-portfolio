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
  adminListSessions, adminGetSession, adminDeleteSession, adminUpdateSessionTags,
} from './surveys.js';
import { submitFeedbackHandler } from './feedback.js';
import {
  adminListPages, adminCreatePage, adminGetPage, adminUpdatePage, adminDeletePage,
  getPublicPage,
} from './pages.js';
import {
  createInterviewSession, sendInterviewMessage, endInterviewSession,
  listInterviewSessions, getInterviewSession, getInterviewAssessment,
} from './interview.js';
import {
  listTopics, createTopic, getTopic, addComment, deleteComment,
} from './discussion.js';
import {
  getDiscussionMetrics, getDiscussionTriage,
} from './discussionMetrics.js';
import {
  handleGetKeyStatus,
  handleSaveKey, handleDeleteKey,
  handleSaveGeminiKey, handleDeleteGeminiKey,
  handleProxyTTS, handleProxyTTSGemini,
  handleVoiceSample, handleGeminiVoiceSample,
} from './keys.js';
import { checkIpRateLimit } from './rateLimit.js';
import { getMetrics } from './metrics.js';
import { logEndpointRequest, getEndpointMetrics } from './endpointMetrics.js';
import { trackPageView, getPageViewStats } from './pageViews.js';
import {
  getFundraiser,
  listFundraisers, createFundraiser, updateFundraiser,
} from './fundraiserPages.js';
import {
  submitPledge, getPledgeStats,
  adminListPledges, adminUpdatePledge, adminDeletePledge,
  adminGetRates, adminSetRates,
  adminGetPin, adminSetPin,
} from './pledges.js';
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
      } else if (path === '/api/admin/page-views' && method === 'GET') {
        response = await getPageViewStats(request, env);
      } else if (path === '/api/admin/kamalesh/pledges' && method === 'GET') {
        response = await adminListPledges(request, env);
      } else if (path === '/api/admin/kamalesh/rates' && method === 'GET') {
        response = await adminGetRates(request, env);
      } else if (path === '/api/admin/kamalesh/rates' && method === 'PUT') {
        response = await adminSetRates(request, env);
      } else if (path === '/api/admin/kamalesh/pin' && method === 'GET') {
        response = await adminGetPin(request, env);
      } else if (path === '/api/admin/kamalesh/pin' && method === 'PUT') {
        response = await adminSetPin(request, env);
      } else if (path === '/api/admin/fundraisers' && method === 'GET') {
        response = await listFundraisers(request, env);
      } else if (path === '/api/admin/fundraisers' && method === 'POST') {
        response = await createFundraiser(request, env);
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
        const fundraiserMatch    = path.match(/^\/api\/admin\/fundraisers\/([^/]+)$/);
        const pledgeMatch        = path.match(/^\/api\/admin\/kamalesh\/pledges\/([^/]+)$/);
        const adminPageMatch     = path.match(/^\/api\/admin\/pages\/([^/]+)$/);
        const adminSurveyMatch   = path.match(/^\/api\/admin\/surveys\/([^/]+)$/);
        const adminSessionsMatch = path.match(/^\/api\/admin\/surveys\/([^/]+)\/sessions$/);
        const adminSessionMatch  = path.match(/^\/api\/admin\/surveys\/([^/]+)\/sessions\/([^/]+)$/);
        const adminSessionTagsMatch = path.match(/^\/api\/admin\/surveys\/([^/]+)\/sessions\/([^/]+)\/tags$/);

        if (fundraiserMatch && method === 'PUT') {
          response = await updateFundraiser(request, env, fundraiserMatch[1]);
        } else if (pledgeMatch && method === 'PATCH') {
          response = await adminUpdatePledge(request, env, pledgeMatch[1]);
        } else if (pledgeMatch && method === 'DELETE') {
          response = await adminDeletePledge(request, env, pledgeMatch[1]);
        } else if (adminPageMatch && method === 'GET') {
          response = await adminGetPage(request, env, adminPageMatch[1]);
        } else if (adminPageMatch && method === 'PATCH') {
          response = await adminUpdatePage(request, env, adminPageMatch[1]);
        } else if (adminPageMatch && method === 'DELETE') {
          response = await adminDeletePage(request, env, adminPageMatch[1]);
        } else if (adminSessionsMatch && method === 'GET') {
          response = await adminListSessions(request, env, adminSessionsMatch[1]);
        } else if (adminSessionTagsMatch && method === 'PATCH') {
          response = await adminUpdateSessionTags(request, env, adminSessionTagsMatch[1], adminSessionTagsMatch[2]);
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

  // ── /api/track/page ───────────────────────────────────────────
  if (url.pathname === '/api/track/page' && request.method === 'POST') {
    try {
      return withCors(await trackPageView(request, env), cors);
    } catch (err) {
      console.error('Track error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
    }
  }

  // ── /api/fundraiser/:slug (public) ───────────────────────────
  const publicFundraiserMatch = url.pathname.match(/^\/api\/fundraiser\/([^/]+)$/);
  if (publicFundraiserMatch && request.method === 'GET') {
    try {
      return withCors(await getFundraiser(publicFundraiserMatch[1], env), cors);
    } catch (err) {
      console.error('Fundraiser error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
    }
  }

  // ── /api/kamalesh (public pledge + stats) ─────────────────────
  if (url.pathname.startsWith('/api/kamalesh/')) {
    try {
      const path = url.pathname;
      let response;
      if (path === '/api/kamalesh/pledge' && request.method === 'POST') {
        response = await submitPledge(request, env);
      } else if (path === '/api/kamalesh/stats' && request.method === 'GET') {
        response = await getPledgeStats(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      return withCors(response, cors);
    } catch (err) {
      console.error('Pledge error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
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
      } else if (path === '/api/user/key/status' && method === 'GET') {
        response = await handleGetKeyStatus(request, env);
      } else if (path === '/api/user/key' && method === 'POST') {
        response = await handleSaveKey(request, env);
      } else if (path === '/api/user/key' && method === 'DELETE') {
        response = await handleDeleteKey(request, env);
      } else if (path === '/api/user/key/gemini' && method === 'POST') {
        response = await handleSaveGeminiKey(request, env);
      } else if (path === '/api/user/key/gemini' && method === 'DELETE') {
        response = await handleDeleteGeminiKey(request, env);
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

  // ── /api/proxy (Worker-side upstream proxies) ────────────────
  if (url.pathname.startsWith('/api/proxy/')) {
    try {
      const path = url.pathname;
      let response;
      const voiceSampleMatch       = path.match(/^\/api\/proxy\/voice-sample\/([a-z]+)$/);
      const geminiVoiceSampleMatch = path.match(/^\/api\/proxy\/voice-sample-gemini\/([A-Za-z]+)$/);
      if (path === '/api/proxy/tts' && request.method === 'POST') {
        response = await handleProxyTTS(request, env);
      } else if (path === '/api/proxy/tts/gemini' && request.method === 'POST') {
        response = await handleProxyTTSGemini(request, env);
      } else if (voiceSampleMatch && request.method === 'GET') {
        response = await handleVoiceSample(request, env, voiceSampleMatch[1]);
      } else if (geminiVoiceSampleMatch && request.method === 'GET') {
        response = await handleGeminiVoiceSample(request, env, geminiVoiceSampleMatch[1]);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      return withCors(response, cors);
    } catch (err) {
      console.error('Proxy error:', err);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }
  }

  // ── /api/admin/discussion (must come before /api/admin block) ──
  if (url.pathname.startsWith('/api/admin/discussion')) {
    try {
      const p = url.pathname;
      const m = request.method;
      let response;
      if (p === '/api/admin/discussion/metrics' && m === 'GET') {
        response = await getDiscussionMetrics(request, env);
      } else if (p === '/api/admin/discussion/triage' && m === 'GET') {
        response = await getDiscussionTriage(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }
      return withCors(response, cors);
    } catch (err) {
      console.error('Discussion metrics error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
    }
  }

  // ── /api/discussion ─────────────────────────────────────────
  if (url.pathname.startsWith('/api/discussion')) {
    try {
      const p  = url.pathname;
      const m  = request.method;
      const topicsPath  = /^\/api\/discussion\/topics$/.test(p);
      const topicMatch  = p.match(/^\/api\/discussion\/topics\/([^/]+)$/);
      const commentPath = p.match(/^\/api\/discussion\/topics\/([^/]+)\/comments$/);
      const deleteMatch = p.match(/^\/api\/discussion\/comments\/([^/]+)$/);

      let response;
      if      (topicsPath  && m === 'GET')    response = await listTopics(request, env);
      else if (topicsPath  && m === 'POST')   response = await createTopic(request, env);
      else if (topicMatch  && m === 'GET')    response = await getTopic(request, env, topicMatch[1]);
      else if (commentPath && m === 'POST')   response = await addComment(request, env, commentPath[1]);
      else if (deleteMatch && m === 'DELETE') response = await deleteComment(request, env, deleteMatch[1]);
      else response = new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });

      return withCors(response, cors);
    } catch (err) {
      console.error('Discussion error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      }), cors);
    }
  }

  // ── /api/interview ───────────────────────────────────────────
  if (url.pathname.startsWith('/api/interview')) {
    try {
      const path   = url.pathname;
      const method = request.method;
      const sessionMatch    = path.match(/^\/api\/interview\/sessions\/([^/]+)$/);
      const messageMatch    = path.match(/^\/api\/interview\/sessions\/([^/]+)\/message$/);
      const endMatch        = path.match(/^\/api\/interview\/sessions\/([^/]+)\/end$/);
      const assessmentMatch = path.match(/^\/api\/interview\/sessions\/([^/]+)\/assessment$/);

      let response;
      if (path === '/api/interview/sessions' && method === 'POST') {
        response = await createInterviewSession(request, env);
      } else if (path === '/api/interview/sessions' && method === 'GET') {
        response = await listInterviewSessions(request, env);
      } else if (messageMatch && method === 'POST') {
        response = await sendInterviewMessage(request, env, messageMatch[1]);
      } else if (endMatch && method === 'PATCH') {
        response = await endInterviewSession(request, env, endMatch[1]);
      } else if (assessmentMatch && method === 'GET') {
        response = await getInterviewAssessment(request, env, assessmentMatch[1]);
      } else if (sessionMatch && method === 'GET') {
        response = await getInterviewSession(request, env, sessionMatch[1]);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        });
      }

      if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response;
      return withCors(response, cors);
    } catch (err) {
      console.error('Interview error:', err);
      return withCors(new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...cors },
      }), cors);
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

        // /survey/:id has no literal file in dist/ — fetch index.html directly,
        // same as the /s/:slug handler above (avoids a doomed literal-path
        // lookup that's fragile on a cold Worker isolate).
        const asset = await env.ASSETS.fetch(new Request(new URL('/', url.origin)));
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

  // ── Dynamic OG tags for /f/:slug fundraiser pages ───────────
  const fSlugMatch = url.pathname.match(/^\/f\/([a-z0-9-]+)$/);
  if (fSlugMatch && request.method === 'GET') {
    try {
      const row = await env.varun_portfolio_auth
        .prepare('SELECT title, beneficiary, condition, image_url FROM fundraisers WHERE slug = ? AND active = 1')
        .bind(fSlugMatch[1])
        .first();
      if (row) {
        const title   = row.title;
        const desc    = `Help ${row.beneficiary} with ${row.condition} treatment. Contribute via Zelle, Interac, or bank transfer.`;
        const pageUrl = url.href;
        const imgUrl  = row.image_url ? `${url.origin}${row.image_url}` : null;
        const asset   = await env.ASSETS.fetch(new Request(new URL('/', url.origin)));
        let rw = new HTMLRewriter()
          .on('title', new TextReplacer(title))
          .on('meta[property="og:title"]',      { element: el => el.setAttribute('content', title) })
          .on('meta[property="og:description"]', { element: el => el.setAttribute('content', desc) })
          .on('meta[property="og:url"]',         { element: el => el.setAttribute('content', pageUrl) })
          .on('meta[name="description"]',        { element: el => el.setAttribute('content', desc) });
        if (imgUrl) {
          const img = escAttr(imgUrl);
          rw = rw.on('head', {
            element(el) {
              el.append(
                `<meta property="og:image" content="${img}" />` +
                `<meta name="twitter:card" content="summary_large_image" />` +
                `<meta name="twitter:title" content="${escAttr(title)}" />` +
                `<meta name="twitter:description" content="${escAttr(desc)}" />` +
                `<meta name="twitter:image" content="${img}" />`,
                { html: true },
              );
            },
          });
        }
        return rw.transform(asset);
      }
    } catch { /* fall through */ }
  }

  // ── Dynamic OG tags for /kamalesh fundraiser ─────────────────
  if (url.pathname === '/kamalesh' && request.method === 'GET') {
    try {
      const title   = 'Help Save Kamalesh P — Kidney Transplant Fundraiser';
      const desc    = 'A 25-year-old CEG engineer needs a kidney transplant. Rs. 4,15,789 still needed. Every contribution counts — donate via Zelle, Interac, or bank transfer.';
      const pageUrl = url.href;
      const imgUrl  = `${url.origin}/kamalesh-appeal.jpg`;
      const asset   = await env.ASSETS.fetch(new Request(new URL('/', url.origin)));
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
              `<meta property="og:image:width" content="1200" />` +
              `<meta property="og:image:height" content="1200" />` +
              `<meta name="twitter:card" content="summary_large_image" />` +
              `<meta name="twitter:title" content="${escAttr(title)}" />` +
              `<meta name="twitter:description" content="${escAttr(desc)}" />` +
              `<meta name="twitter:image" content="${imgUrl}" />`,
              { html: true },
            );
          },
        })
        .transform(asset);
    } catch { /* fall through */ }
  }

  // All non-API requests → serve the React static build
  // Inject security headers on HTML responses.
  // SPA routes (e.g. /interview, /kamalesh) have no matching file in dist/.
  // Fetch index.html directly for extensionless paths.
  // ASSETS.fetch() can throw on a cold Worker isolate — retry up to 3 times
  // before giving up so that direct deep-link visits don't land on a 503.
  const assetReq = url.pathname.includes('.')
    ? request
    : new Request(new URL('/', url.origin));

  let asset;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      asset = await env.ASSETS.fetch(assetReq);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) {
    console.error('ASSETS fetch failed after 3 attempts:', lastErr);
    return new Response('Service unavailable', { status: 503 });
  }
  const ct    = asset.headers.get('Content-Type') || '';
  if (!ct.includes('text/html')) return asset;

  const headers = new Headers(asset.headers);
  // connect-src 'self' enforces the proxy pattern at browser level —
  // the browser cannot call api.openai.com directly; all traffic goes
  // through our Worker which requires auth before touching any API key.
  headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  headers.set('X-Frame-Options',        'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');
  return new Response(asset.body, { status: asset.status, headers });
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
