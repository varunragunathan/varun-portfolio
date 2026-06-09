// ── API Key storage + TTS proxy ───────────────────────────────────
// Keys are encrypted server-side with a per-user AES-256-GCM key
// derived from ENCRYPTION_SECRET (a Cloudflare Worker secret).
// The raw API key never appears in browser JS — only the Worker
// ever decrypts it, and only per-request to proxy upstream calls.

import { getSession } from './auth/session.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function guardAuth(request, env) {
  const session = await getSession(env.KV, request);
  if (!session?.userId) return json({ error: 'Unauthorized' }, 401);
  return session;
}

// ── Crypto helpers ────────────────────────────────────────────────

// Derive a per-user AES-256-GCM key from the master secret + userId.
// Each user gets a unique key; compromising one user's encrypted blob
// doesn't help decrypt any other user's data.
async function deriveUserKey(secret, userId) {
  const enc   = new TextEncoder();
  const raw   = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig   = await crypto.subtle.sign('HMAC', raw, enc.encode(userId));
  return crypto.subtle.importKey('raw', sig, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptBlob(aesKey, plaintext) {
  const iv         = crypto.getRandomValues(new Uint8Array(12));
  const encoded    = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  // Store as base64(iv + ciphertext)
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

async function decryptBlob(aesKey, blob) {
  const bytes      = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
  const iv         = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const plain      = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plain);
}

// ── D1 helpers ────────────────────────────────────────────────────

async function saveUserKey(env, userId, apiKey) {
  if (!env.ENCRYPTION_SECRET) throw new Error('ENCRYPTION_SECRET not configured');
  const aesKey = await deriveUserKey(env.ENCRYPTION_SECRET, userId);
  const blob   = await encryptBlob(aesKey, apiKey);
  const hint   = 'OpenAI •••• ' + apiKey.slice(-4);
  await env.varun_portfolio_auth.prepare(`
    INSERT INTO user_encrypted_keys (user_id, encrypted_blob, key_hint, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE
      SET encrypted_blob = excluded.encrypted_blob,
          key_hint       = excluded.key_hint,
          updated_at     = excluded.updated_at
  `).bind(userId, blob, hint).run();
}

async function loadUserKey(env, userId) {
  if (!env.ENCRYPTION_SECRET) return null;
  const row = await env.varun_portfolio_auth.prepare(
    'SELECT encrypted_blob FROM user_encrypted_keys WHERE user_id = ?'
  ).bind(userId).first();
  if (!row?.encrypted_blob) return null;
  const aesKey = await deriveUserKey(env.ENCRYPTION_SECRET, userId);
  return decryptBlob(aesKey, row.encrypted_blob);
}

async function deleteUserKey(env, userId) {
  await env.varun_portfolio_auth.prepare(
    'UPDATE user_encrypted_keys SET encrypted_blob = NULL, key_hint = NULL WHERE user_id = ?'
  ).bind(userId).run();
}

async function getKeyHint(env, userId) {
  const row = await env.varun_portfolio_auth.prepare(
    'SELECT key_hint FROM user_encrypted_keys WHERE user_id = ?'
  ).bind(userId).first();
  return row?.key_hint ?? null;
}

// ── Gemini key helpers ────────────────────────────────────────────

async function saveGeminiKey(env, userId, apiKey) {
  if (!env.ENCRYPTION_SECRET) throw new Error('ENCRYPTION_SECRET not configured');
  // Columns added by migration 007 — throw a clear message if not yet applied
  const colCheck = await env.varun_portfolio_auth
    .prepare("SELECT gemini_blob FROM user_encrypted_keys LIMIT 0").all()
    .catch(() => { throw new Error('Gemini key columns not yet migrated — run migration 007'); });
  void colCheck;
  const aesKey = await deriveUserKey(env.ENCRYPTION_SECRET, userId + ':gemini');
  const blob   = await encryptBlob(aesKey, apiKey);
  const hint   = 'Gemini •••• ' + apiKey.slice(-4);
  await env.varun_portfolio_auth.prepare(`
    INSERT INTO user_encrypted_keys (user_id, gemini_blob, gemini_hint, updated_at)
    VALUES (?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE
      SET gemini_blob = excluded.gemini_blob,
          gemini_hint = excluded.gemini_hint,
          updated_at  = excluded.updated_at
  `).bind(userId, blob, hint).run();
}

async function loadGeminiKey(env, userId) {
  if (!env.ENCRYPTION_SECRET) return null;
  try {
    const row = await env.varun_portfolio_auth.prepare(
      'SELECT gemini_blob FROM user_encrypted_keys WHERE user_id = ?'
    ).bind(userId).first();
    if (!row?.gemini_blob) return null;
    const aesKey = await deriveUserKey(env.ENCRYPTION_SECRET, userId + ':gemini');
    return decryptBlob(aesKey, row.gemini_blob);
  } catch { return null; }
}

async function deleteGeminiKey(env, userId) {
  try {
    await env.varun_portfolio_auth.prepare(
      'UPDATE user_encrypted_keys SET gemini_blob = NULL, gemini_hint = NULL WHERE user_id = ?'
    ).bind(userId).run();
  } catch { /* column not yet migrated — no-op */ }
}

async function getGeminiKeyHint(env, userId) {
  try {
    const row = await env.varun_portfolio_auth.prepare(
      'SELECT gemini_hint FROM user_encrypted_keys WHERE user_id = ?'
    ).bind(userId).first();
    return row?.gemini_hint ?? null;
  } catch { return null; }
}

// ── Route handlers ────────────────────────────────────────────────

// GET /api/user/key/status
export async function handleGetKeyStatus(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  const [hint, geminiHint] = await Promise.all([
    getKeyHint(env, session.userId),
    getGeminiKeyHint(env, session.userId),
  ]);
  return json({
    configured: hint !== null,
    hint,
    gemini: { configured: geminiHint !== null, hint: geminiHint },
  });
}

// POST /api/user/key   { key: "sk-..." }
export async function handleSaveKey(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  const { key } = await request.json().catch(() => ({}));
  if (!key || typeof key !== 'string' || !key.startsWith('sk-')) {
    return json({ error: 'Invalid key — must start with sk-' }, 400);
  }
  try {
    await saveUserKey(env, session.userId, key);
    const hint = await getKeyHint(env, session.userId);
    return json({ ok: true, hint });
  } catch (err) {
    console.error('Key save error:', err);
    return json({ error: 'Failed to save key' }, 500);
  }
}

// DELETE /api/user/key
export async function handleDeleteKey(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  await deleteUserKey(env, session.userId);
  return json({ ok: true });
}

// POST /api/user/key/gemini   { key: "AIza..." }
export async function handleSaveGeminiKey(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  const { key } = await request.json().catch(() => ({}));
  if (!key || typeof key !== 'string' || !key.startsWith('AIza')) {
    return json({ error: 'Invalid key — Gemini keys start with AIza' }, 400);
  }
  try {
    await saveGeminiKey(env, session.userId, key);
    const hint = await getGeminiKeyHint(env, session.userId);
    return json({ ok: true, hint });
  } catch (err) {
    console.error('Gemini key save error:', err);
    return json({ error: 'Failed to save key' }, 500);
  }
}

// DELETE /api/user/key/gemini
export async function handleDeleteGeminiKey(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  await deleteGeminiKey(env, session.userId);
  return json({ ok: true });
}

// GET /api/voice-samples/:voiceId
// First request: generates via OpenAI and caches in KV for 30 days.
// Subsequent requests: served from KV instantly (no API cost).
export async function handleVoiceSample(request, env, voiceId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const ALLOWED = ['nova','alloy','echo','onyx','shimmer','fable'];
  if (!ALLOWED.includes(voiceId)) return json({ error: 'Unknown voice' }, 400);

  const cacheKey = `voice_sample_v1_${voiceId}`;

  // Serve from KV if already generated
  const cached = await env.KV.get(cacheKey, 'arrayBuffer');
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000' },
    });
  }

  // Generate once using the requesting user's stored key
  const apiKey = await loadUserKey(env, session.userId);
  if (!apiKey) return json({ error: 'No API key configured — set one up to preview voices' }, 402);

  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:           'tts-1-hd',
      input:           "Hi, I'm Hooty. Ready to help you practice your interview skills today!",
      voice:           voiceId,
      response_format: 'mp3',
    }),
  });

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    return json({ error: msg }, upstream.status);
  }

  const audioBuffer = await upstream.arrayBuffer();

  // Cache for 30 days — same sample text, same voice = same audio forever
  await env.KV.put(cacheKey, audioBuffer, { expirationTtl: 60 * 60 * 24 * 30 });

  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=2592000' },
  });
}

const GEMINI_ALLOWED_VOICES = ['Kore','Puck','Charon','Zephyr','Aoede','Leda','Orus','Fenrir'];
const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

// POST /api/proxy/tts/gemini   { text, voice? }
export async function handleProxyTTSGemini(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const { text, voice = 'Kore' } = await request.json().catch(() => ({}));
  if (!text || typeof text !== 'string') return json({ error: 'text is required' }, 400);

  const apiKey = await loadGeminiKey(env, session.userId);
  if (!apiKey) return json({ error: 'No Gemini API key configured' }, 402);

  const safeVoice = GEMINI_ALLOWED_VOICES.includes(voice) ? voice : 'Kore';

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } },
          },
        },
      }),
    }
  );

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    return json({ error: `Gemini TTS: ${msg}` }, upstream.status);
  }

  const data = await upstream.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) return json({ error: 'No audio in Gemini response' }, 500);

  const bytes = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
  return new Response(bytes.buffer, {
    headers: {
      'Content-Type':  part.mimeType || 'audio/wav',
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/proxy/voice-sample-gemini/:voiceId
// KV-cached sample clips so the UI can preview each voice without a per-click API call.
export async function handleGeminiVoiceSample(request, env, voiceId) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  if (!GEMINI_ALLOWED_VOICES.includes(voiceId)) return json({ error: 'Unknown voice' }, 400);

  const cacheKey = `gemini_voice_sample_v1_${voiceId}`;
  const cached = await env.KV.get(cacheKey, 'arrayBuffer');
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=2592000' },
    });
  }

  const apiKey = await loadGeminiKey(env, session.userId);
  if (!apiKey) return json({ error: 'No Gemini API key configured — add one to preview voices' }, 402);

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Hi, I'm Hooty. Ready to help you practice your interview skills today!" }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
          },
        },
      }),
    }
  );

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    return json({ error: msg }, upstream.status);
  }

  const data = await upstream.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) return json({ error: 'No audio in Gemini response' }, 500);

  const bytes = Uint8Array.from(atob(part.data), c => c.charCodeAt(0));
  await env.KV.put(cacheKey, bytes.buffer, { expirationTtl: 60 * 60 * 24 * 30 });

  return new Response(bytes.buffer, {
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=2592000' },
  });
}

// POST /api/proxy/tts   { text, voice? }
// Worker decrypts the stored key, calls OpenAI TTS, streams audio back.
// The raw API key never leaves the Worker process.
export async function handleProxyTTS(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;

  const { text, voice = 'fable' } = await request.json().catch(() => ({}));
  if (!text || typeof text !== 'string') {
    return json({ error: 'text is required' }, 400);
  }

  const apiKey = await loadUserKey(env, session.userId);
  if (!apiKey) return json({ error: 'No API key configured' }, 402);

  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:           'tts-1-hd',
      input:           text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!upstream.ok) {
    const msg = await upstream.text().catch(() => upstream.statusText);
    return json({ error: msg }, upstream.status);
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type':  'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
