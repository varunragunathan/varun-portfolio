# Chapter 28 — Agentic Surveys (Hooty)

## What You'll Learn

This chapter documents the conversational survey system, "Hooty." It covers the owl-guided chat UX, how the SSE streaming pipeline works, the `---SURVEY_OPTS---` delimiter protocol, multi-model support, session lifecycle, the admin survey builder, and short URL slugs.

---

## 28.1 Overview

Hooty is a conversational survey system that replaces static forms with an AI-guided dialogue. A pixel-art owl (PixelOwl) hosts the conversation, asks questions dynamically based on previous answers, and can surface recommended resources at the end.

Key properties:
- **No account required.** Respondents are identified by a stable `sessionStorage` UUID.
- **One response per browser per survey.** Sessions are de-duped on the server.
- **Streaming.** The owl's responses stream token-by-token via SSE for a live typing effect.
- **Choice + free-text in parallel.** When the AI offers multiple-choice options, the free-text textarea remains visible so respondents can always write their own answer.
- **Short URLs.** Each survey can have a human-readable slug (`/s/my-survey`) in addition to its UUID path (`/survey/<uuid>`).

---

## 28.2 System Architecture

```
Browser                         Cloudflare Worker               Anthropic / OpenRouter / Workers AI
──────                         ─────────────────               ──────────────────────────────────
GET /api/surveys/:id  ────────► getSurvey()
                      ◄──────── { id, title, description, slug, model_id, system_prompt, … }

POST /api/surveys/:id/sessions ► createSession()   stores session + respondent_id in D1
                      ◄──────── { sessionId }  (or { error: 'already_completed' })

POST /api/surveys/:id/sessions/:sid/message
   { message: "…" }  ────────► sendMessage()
                                 ├─ appends to conversation history in D1 (JSON column)
                                 ├─ calls AI (Claude | Workers AI | OpenRouter)
                                 └─ streams SSE back ──────────────────────────────────────────►

PATCH /api/surveys/:id/sessions/:sid/complete
                      ────────► marks session complete
```

---

## 28.3 D1 Database Schema

```sql
CREATE TABLE surveys (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  slug         TEXT UNIQUE,           -- short URL identifier
  system_prompt TEXT NOT NULL,
  model_id     TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE survey_sessions (
  id             TEXT PRIMARY KEY,
  survey_id      TEXT NOT NULL REFERENCES surveys(id),
  respondent_id  TEXT NOT NULL,
  history        TEXT NOT NULL DEFAULT '[]',  -- JSON array of {role, content}
  completed_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The `slug` column was added via migration `003-survey-slugs.sql`:

```sql
ALTER TABLE surveys ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_surveys_slug ON surveys(slug);
```

---

## 28.4 SSE Streaming Protocol

The worker streams Server-Sent Events to the browser. Each event is one line:

```
data: {"type":"delta","text":"Hello"}
data: {"type":"delta","text":", how"}
data: {"type":"opts","opts":{"inputType":"choice","options":["Yes","No"],"done":false}}
data: {"type":"done"}
```

**Event types:**

| Type | Payload | Purpose |
|------|---------|---------|
| `delta` | `{ text: string }` | Append token to current bubble |
| `opts` | `{ inputType, options, done, resources }` | Render choices / close input area |
| `done` | — | End of stream; client exits read loop |
| `error` | `{ message: string }` | Display error in bubble; client aborts |

### The `---SURVEY_OPTS---` Delimiter

The AI is instructed to emit a JSON block after a sentinel line `---SURVEY_OPTS---`. The server scans for this delimiter in the accumulation buffer and stops emitting prose tokens once it is detected (`getSafeEmitLength` helper). When the delimiter is found, the server parses the JSON, emits an `opts` SSE event, then emits `done`.

**Belt-and-suspenders client guard:** Even though the server truncates before the delimiter, partial tokens can appear at chunk boundaries (e.g., `---SURVE`). The client applies `stripPartialDelimiter(text, delimiter)` before rendering each bubble update — it checks whether the buffer's display portion ends with any prefix of the delimiter and strips it if so.

```js
function stripPartialDelimiter(text, delimiter) {
  for (let len = Math.min(text.length, delimiter.length - 1); len > 0; len--) {
    if (text.endsWith(delimiter.slice(0, len))) return text.slice(0, -len);
  }
  return text;
}
```

---

## 28.5 Multi-Model Routing

Surveys can use any of three AI backends, selected via the `model_id` field on the survey:

| Prefix | Backend | API Key Required |
|--------|---------|-----------------|
| `claude-*` | Anthropic API (direct) | `ANTHROPIC_API_KEY` (always set) |
| `@cf/*` | Cloudflare Workers AI | None — included in Workers plan |
| anything else | OpenRouter | `OPENROUTER_API_KEY` secret |

Routing logic in `worker/surveys.js`:

```js
let source;
if (selectedModel.startsWith('claude-'))    source = 'claude';
else if (selectedModel.startsWith('@cf/'))  source = 'workersai';
else                                         source = 'openrouter';
```

`streamOpenRouter()` calls `https://openrouter.ai/api/v1/chat/completions` with an OpenAI-compatible request body. Required headers:
- `Authorization: Bearer <OPENROUTER_API_KEY>`
- `HTTP-Referer: https://varunr.dev`
- `X-Title: varunr.dev`

OpenRouter's SSE format uses `choices[0].delta.content` (same as OpenAI), unlike Anthropic's `content_block_delta` format.

---

## 28.6 Session Lifecycle

1. **GET `/api/surveys/:id`** — fetch survey metadata (title, description, model, etc.)
2. **POST `/api/surveys/:id/sessions`** — create session with a `respondentId` (stable browser UUID stored in `sessionStorage`). Returns `{ error: 'already_completed' }` if the respondent already has a completed session for this survey.
3. **POST `/api/surveys/:id/sessions/:sid/message`** with `{ message: "" }` — the first turn. The empty message triggers the owl's opening greeting.
4. Subsequent turns POST the respondent's text and stream back the owl's reply.
5. **PATCH `/api/surveys/:id/sessions/:sid/complete`** — called client-side when the `opts` event with `done: true` arrives.

Conversation history is stored as a JSON array in the `history` column of `survey_sessions`. Each turn appends `{ role: 'user', content }` and `{ role: 'assistant', content }`.

---

## 28.7 Frontend Layout — Inner-Scroll Pattern

The survey conversation UI uses a fixed-height flex column so the messages area scrolls independently of the page, keeping the input bar always visible at the bottom.

**Critical CSS:**

```css
/* Page container: fixed viewport height so nothing overflows the window */
.survey-page--active {
  height: calc(100vh - 53px);  /* 53px = nav height */
  overflow: hidden;
  display: flex;
}

/* Chat column fills remaining width */
.survey-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Messages expand to fill and scroll internally */
.survey-chat__messages {
  flex: 1;
  overflow-y: auto;
}

/* Header and input stay fixed at their natural size */
.survey-chat__header,
.survey-input-area {
  flex-shrink: 0;
}
```

**Why `height` not `min-height`:** `overflow-y: auto` on a flex child only activates when the child has a defined height constraint above it in the layout tree. Using `min-height` lets the container grow unbounded, so the scroll never triggers and the browser window scrolls instead.

**Scroll target:** The messages container (`messagesRef.current`) is scrolled directly:

```js
useEffect(() => {
  const el = messagesRef.current;
  if (el) el.scrollTop = el.scrollHeight;
}, [messages, streaming]);
```

Using `scrollIntoView()` was avoided because it traverses the DOM and scrolls the nearest scrollable ancestor — which sometimes meant the window, not the messages panel.

---

## 28.8 Survey Short URLs

Every survey has an optional `slug` field (e.g., `my-survey`). When set, the survey is accessible at `/s/<slug>` in addition to `/survey/<uuid>`.

### Slug Generation

When a survey is created via the admin API, a slug is auto-generated from the title:

```js
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50);
}
```

If the generated slug collides with an existing one, `ensureUniqueSlug(db, base, excludeId)` appends `-2`, `-3`, etc. until it finds an available slug. `excludeId` prevents false collisions when updating a survey's own slug.

### Routes

**Worker (`worker/index.js`):**

| Path | Handler |
|------|---------|
| `/api/surveys/s/:slug` | `getSurveyBySlug(request, env, slug)` — returns JSON survey metadata |
| `/s/:slug` | Fetches `index.html`, rewrites OG meta tags via `HTMLRewriter`, serves SPA |
| `/survey/:id` | Same `HTMLRewriter` OG-tag injection for UUID-based paths |

**React Router (`src/App.jsx`):**

```jsx
<Route path="/survey/:surveyId" element={<SurveyPage />} />
<Route path="/s/:slug" element={<SurveyPage />} />
```

### OG Tag Injection (HTMLRewriter)

When a crawler requests `/s/<slug>` or `/survey/<id>`, the worker injects survey-specific Open Graph and Twitter Card tags into `index.html` so share previews show the survey title and description instead of the generic site defaults.

```js
new HTMLRewriter()
  .on('meta[property="og:title"]',       { element: el => el.setAttribute('content', survey.title) })
  .on('meta[property="og:description"]', { element: el => el.setAttribute('content', survey.description ?? '') })
  .on('meta[name="twitter:title"]',      { element: el => el.setAttribute('content', survey.title) })
  .on('meta[name="twitter:description"]',{ element: el => el.setAttribute('content', survey.description ?? '') })
  .transform(response);
```

### Client-Side Slug Resolution

`Survey.jsx` handles both URL shapes:

```jsx
const { surveyId: paramId, slug } = useParams();
const [surveyId, setSurveyId] = useState(paramId ?? null);

useEffect(() => {
  const url = slug ? `/api/surveys/s/${slug}` : `/api/surveys/${paramId}`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      setSurvey(data);
      setSurveyId(data.id); // always resolve to UUID for session API calls
    });
}, [paramId, slug]);
```

Session API calls (`/api/surveys/:id/sessions/…`) always use the UUID, not the slug.

---

## 28.9 Admin Survey Builder

Admins create and manage surveys at `/admin` → Surveys tab.

**Survey fields:**
- **Title** — used as the survey heading and to auto-generate the initial slug
- **Description** — shown on the landing page and in OG share previews
- **System prompt** — the AI persona and question set (Markdown supported)
- **Model** — which AI model powers this survey
- **Slug** — human-readable short identifier; inline-editable in the survey list

**Survey list columns:**

| Column | Notes |
|--------|-------|
| Title + description | Clicking title opens the survey |
| Slug | Shown below description; click to edit inline |
| Model | Shows `model_id` |
| Responses | Count of completed sessions |
| Active toggle | Activates / deactivates the survey |
| Copy link | Copies `/s/<slug>` if slug is set, else `/survey/<uuid>` |
| Delete | Removes survey (irreversible) |

**Inline slug editing:** The slug row renders an `<input>` with Save/Cancel buttons when clicked. Save calls `PATCH /api/admin/surveys/:id` with `{ slug }`. The server runs `ensureUniqueSlug` to avoid collisions.

---

## 28.10 Available Models

The Models tab in the admin dashboard lists every available model by group with an on/off toggle.

| Group | Notes |
|-------|-------|
| **Cloudflare Workers AI** | No API key needed; runs on Cloudflare's infra |
| **OpenRouter · Free** | Requires `OPENROUTER_API_KEY` Workers secret |
| **Paid** | Anthropic models billed directly via `ANTHROPIC_API_KEY` |

The toggle state is stored in the `models` D1 table. Toggling a model that is not yet in the DB issues a `POST /api/admin/models`; toggling an existing one issues `PATCH /api/admin/models/:model_id` with `{ enabled: 0/1 }`.

Model IDs that contain `/` (e.g., `meta-llama/llama-3.3-70b-instruct:free`) are URL-encoded in the PATCH path and decoded server-side with `decodeURIComponent`.

---

## 28.11 File Reference

| File | Role |
|------|------|
| `worker/surveys.js` | All survey API handlers: CRUD, session management, AI streaming |
| `worker/chat.js` | Chat API — shares the same three-way model routing pattern |
| `worker/admin.js` | Admin API: survey create/update/delete, model toggle |
| `worker/index.js` | Route dispatch; `/s/:slug` HTML handler with HTMLRewriter |
| `worker/migrations/003-survey-slugs.sql` | D1 migration adding `slug` column and unique index |
| `src/pages/Survey.jsx` | Conversational survey UI — SSE reader, message rendering, scroll logic |
| `src/pages/Survey.css` | Inner-scroll layout; active survey page height constraints |
| `src/pages/Admin.jsx` | Survey builder, slug editor, model catalog toggle UI |
| `src/pages/Surveys.jsx` | Public survey listing page |
| `src/components/PixelOwl.jsx` | Animated pixel-art owl component used throughout |

---

## 28.12 Limitations and Future Work

- **One response per browser.** The de-dup is based on `sessionStorage`, which is tab-scoped. Opening the survey in a second tab allows a second response.
- **No export.** Survey responses are stored in D1 but there is no CSV/JSON export UI yet.
- **No conditional branching.** The AI adapts conversationally but there is no explicit branching logic — the system prompt controls flow entirely through the LLM.
- **Workers AI streaming.** Workers AI SSE uses a different event format (`response` field); the server normalises this before emitting to the client.
