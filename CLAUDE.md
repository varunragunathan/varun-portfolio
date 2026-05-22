# CLAUDE.md — Developer guide for Claude Code

## Workflow rules (always follow these)

- **Never run `git push`** — the repo has an automated push hook. Commit only.
- **Semantic versioning on every change** — bump `package.json` version before committing:
  - `patch` (0.2.x) for bug fixes and small improvements
  - `minor` (0.x.0) for new features
  - `major` (x.0.0) for breaking changes
- **Atomic commits** — one logical change per commit, never bundle unrelated work.
- **Lint before every commit** — `yarn lint` must exit 0 errors (warnings are pre-existing and OK).

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router 6, Vite 6 |
| Styling | CSS custom properties per component — no CSS-in-JS |
| Backend | Cloudflare Worker (`worker/index.js`) |
| Database | Cloudflare D1 via `env.DB` (SQLite) |
| KV | Cloudflare KV via `env.KV` (sessions, preferences) |
| Static assets | `env.ASSETS` (Cloudflare Pages binding) |
| Auth | WebAuthn passkeys — `@simplewebauthn/browser` + `@simplewebauthn/server` |
| AI | Anthropic API (Claude Haiku for interview, Claude for chat/RAG) |
| TTS | OpenAI TTS-1 via Worker proxy (optional, user-provided key) |

---

## Key architecture patterns

### Worker auth guard
Every authenticated route in the worker follows this exact pattern:
```js
import { getSession } from './auth/session.js';

async function guardAuth(request, env) {
  const session = await getSession(env.KV, request);
  if (!session?.userId) return json({ error: 'Unauthorized' }, 401);
  return session;
}

export async function myHandler(request, env) {
  const session = await guardAuth(request, env);
  if (session instanceof Response) return session; // 401 early return
  // session.userId is now safe to use
}
```

### Adding a new Worker route
1. Create handler(s) in a new `worker/feature.js` file (define local `json()` helper there)
2. Import handlers in `worker/index.js`
3. Add route matching inside the appropriate `if (url.pathname.startsWith('/api/...'))` block
4. All responses must go through `withCors(response, cors)`

### CSP headers
All HTML responses get CSP headers injected at the bottom of `handleRequest()` in `worker/index.js`. `connect-src 'self'` is intentional — it enforces the Worker proxy pattern at the browser level. **Do not add third-party domains to connect-src without considering the security implications.**

### CSS theming
All colours must use CSS custom properties from `index.css`. Never use hardcoded hex colours in component CSS. Key variables:
- `--text-1`, `--text-2`, `--text-3` — text hierarchy
- `--card-bg`, `--card-hover` — card surfaces
- `--border`, `--border-hover` — borders
- `--accent`, `--accent-dim`, `--accent-ghost` — accent/indigo
- `--surface-alt` — secondary surface

### D1 migrations
Schema files live in `worker/migrations/NNN-name.sql`. To apply to production:
```bash
npx wrangler d1 execute varun-portfolio-auth --remote --env production --file=worker/migrations/NNN-name.sql
```

---

## Features overview

### Voice Interview (`/interview`)
- Users choose a theme + duration → Hooty (PixelOwl avatar) conducts a voice interview
- **STT**: browser `SpeechRecognition` (Chrome/Edge only)
- **TTS** (priority order):
  1. OpenAI TTS-1 via `/api/proxy/tts` (if user has stored an API key) — real audio stream → real FFT waveform visualization
  2. Browser `SpeechSynthesis` fallback — word-boundary `iv-voice-pulse` events drive the waveform animation
- **Waveform**: `SpeechWaveform.jsx` canvas component — speaking mode (indigo/violet) and listening mode (emerald/teal, real mic FFT)
- **Session cost** tracked in D1 `interview_sessions` table (Haiku pricing)
- Hook: `src/hooks/useVoiceInterview.js`

### API key storage (`worker/keys.js`)
- User can store an OpenAI API key via Settings → Account → API Keys
- Key is encrypted with AES-256-GCM before hitting D1
- Per-user key derived via `HMAC-SHA256(ENCRYPTION_SECRET, userId)` — server secret is a Cloudflare Worker secret
- Worker decrypts per-request to proxy TTS calls — the raw key never appears in browser JS
- Routes: `GET/POST/DELETE /api/user/key`, `POST /api/proxy/tts`

### Survey system (`/s/:slug`)
- Short-link surveys with SSE streaming answers
- OG preview rewriting via `HTMLRewriter` — lazy (streaming), so errors surface after try/catch. See `TextReplacer` class in `worker/index.js` for the pattern (property names must not shadow prototype method names).

### RAG chat
- Embedded docs in Cloudflare Vectorize, queried on each chat turn
- Models selectable per conversation

---

## Environment / secrets

| Secret | Purpose | How to set |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API for interview + chat | `wrangler secret put ANTHROPIC_API_KEY` |
| `ENCRYPTION_SECRET` | Master key for user API key encryption | `wrangler secret put ENCRYPTION_SECRET` (use `openssl rand -hex 32`) |
| `ADMIN_EMAIL` | Grants admin role to this email | `wrangler secret put ADMIN_EMAIL` |
| `RESEND_API_KEY` | Email delivery | `wrangler secret put RESEND_API_KEY` |

---

## Common commands

```bash
yarn dev          # Frontend only (Vite, :5173)
yarn wd           # Full stack (build + wrangler dev)
yarn lint         # ESLint — must be 0 errors before committing
yarn deploy       # Build + deploy to Cloudflare production
yarn db:migrate   # Apply latest migration to production D1
yarn test         # Playwright E2E
yarn storybook    # Component dev on :6006
```

---

## Gotchas

- **PixelOwl beak animation**: `state === 'talking'` alternates between `'talking'` and `'idle'` frames every 150-200ms via `useEffect` + async loop. The CSS animation class is derived from `state`, not `key`.
- **SpeechRecognition restart loop**: controlled by `gotResultRef` + `manualStopRef` in `useVoiceInterview`. Don't simplify `onend` without understanding both flags.
- **HTMLRewriter is lazy**: transformations run during streaming, not when `.transform()` is called. Fatal errors in handlers produce Cloudflare error 1101 that appears after the try/catch. The `TextReplacer` class had a bug where `this.text = text` overwrote the prototype `text(chunk)` method — fixed to `this._text`.
- **AudioContext autoplay**: must call `audioCtx.resume()` after creation when not in a direct user-gesture synchronous call chain.
- **CSP + Vite**: `script-src 'self'` works with Vite's production output (all scripts are external files). Don't add `'unsafe-inline'` for scripts — it defeats the purpose.
