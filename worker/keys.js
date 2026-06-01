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
  if (!row) return null;
  const aesKey = await deriveUserKey(env.ENCRYPTION_SECRET, userId);
  return decryptBlob(aesKey, row.encrypted_blob);
}

async function deleteUserKey(env, userId) {
  await env.varun_portfolio_auth.prepare(
    'DELETE FROM user_encrypted_keys WHERE user_id = ?'
  ).bind(userId).run();
}

async function getKeyHint(env, userId) {
  const row = await env.varun_portfolio_auth.prepare(
    'SELECT key_hint FROM user_encrypted_keys WHERE user_id = ?'
  ).bind(userId).first();
  return row?.key_hint ?? null;
}

// ── Route handlers ────────────────────────────────────────────────

// GET /api/user/key/status
export async function handleGetKeyStatus(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session;
  const hint = await getKeyHint(env, session.userId);
  return json({ configured: hint !== null, hint });
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
