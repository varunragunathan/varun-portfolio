# Chapter 15 — RAG Chat System

## What You'll Learn

This chapter covers the full retrieval-augmented generation (RAG) system built into the portfolio: what RAG is and why it was chosen over the alternatives, the end-to-end data flow from browser through vector search to streamed LLM response, the ingestion pipeline that populates the vector index, the Vectorize index configuration, the `POST /api/chat` route in all its detail, the SSE streaming protocol and the transform layer that bridges Workers AI's output format to the browser's event stream, the multi-turn conversation design backed by D1, the access tier system for controlling what content gets indexed, the frontend components (`useChat`, `ChatWidget`, `StreamingStatus`, the full `/chat` page), the model selection rationale, and the known limitations of the current implementation.

---

## 15.1 What RAG Is and Why

Retrieval-Augmented Generation is a pattern that adds a retrieval step in front of a language model. Instead of asking a model to answer from training data alone, you first look up the most relevant chunks of your own content and include them in the prompt. The model then generates a response grounded in that retrieved context.

**Why not a fine-tuned model?** Fine-tuning trains the model's weights on your data. This bakes the knowledge in at the parameter level. For a portfolio site whose documentation changes with each feature addition, fine-tuning has two fatal problems: it requires re-training whenever the content changes (expensive, slow), and it requires enough data to fine-tune at all — a corpus of 30 markdown chapters is far too small to train a large model without overfitting or degradation.

**Why not a large context window?** Modern models accept 128K tokens or more. You could concatenate the entire documentation into the prompt on every request. This has appeal in its simplicity: no retrieval step, no vector index. But it has practical costs. Latency increases linearly with context length. Cost increases proportionally (on paid APIs). And for a Worker running on Cloudflare's free tier, sending 100K tokens per query is not feasible — the Workers AI free tier charges per neuron token, and large contexts exhaust free quotas quickly.

RAG threads the needle: you retrieve only the most relevant 3–5 chunks (typically 400–800 tokens of actual text) and pass those to the model. The model has focused, relevant context, and the total prompt is small.

**The specific question this RAG answers:** "Tell me about the architecture of this site." The model, without any retrieval, would produce a generic answer about React SPAs. With retrieval, it reads the actual text from `docs/chapters/02-architecture.md`, cites the Cloudflare Workers setup, and quotes specific details. The difference is the difference between a plausible hallucination and a grounded answer.

---

## 15.2 System Overview

The full request lifecycle for a single chat turn:

```text
Browser
  │
  │  POST /api/chat
  │  { message: "How does number matching work?", conversationId: null }
  │  Cookie: session=<token>
  ▼
Cloudflare Worker (worker/index.js → worker/chat.js: postChat)
  │
  ├── getSession(env.AUTH_KV, request)        ← session check (KV lookup)
  ├── getOrCreateConversation(db, ...)         ← D1 write (first turn)
  ├── getConversationHistory(db, convId)       ← D1 read (last 10 turns)
  │
  ├── embedQuery(env.AI, message)
  │     └── env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [message] })
  │           Returns float[768]
  │
  ├── retrieveChunks(env.VECTORIZE, vector)
  │     └── env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' })
  │           Returns top-5 matching chunks with metadata.text, metadata.filePath
  │
  ├── buildSystemPrompt(chunks)
  │     └── Numbered context block: [1] (path) chunk text ...
  │
  ├── streamWorkersAI(env.AI, systemPrompt, messages)
  │     └── env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { stream: true })
  │           Returns a ReadableStream of SSE lines
  │
  ├── transformStream(workersStream, onFullText)
  │     └── Parses Workers AI SSE → emits { type: 'delta', text } events
  │         On stream end → onFullText(fullAssistantText) → D1 batch insert
  │
  └── Response: text/event-stream, X-Conversation-Id header
        │
        ▼
Browser (useChat hook)
  ├── Picks up X-Conversation-Id (first turn)
  ├── SSE reader loop: appends delta.text to assistant message
  └── On stream end: message bubble shows complete response
```

Every component in this diagram is either the Workers runtime, D1, KV, Vectorize, or Workers AI — all Cloudflare-native. No external API calls, no third-party services required for the core inference path.

---

## 15.3 The Ingestion Pipeline

Before any query can be answered, the documentation and source code must be embedded and stored in Vectorize. This is the job of `scripts/ingest-docs.js`.

### File Collection

The script defines three source directories:

```js
// scripts/ingest-docs.js lines 34-38
const SOURCES = [
  { dir: 'docs',   ext: ['.md'],  access: 'protected' },
  { dir: 'worker', ext: ['.js'],  access: 'protected' },
  { dir: 'src',    ext: ['.jsx', '.js'], access: 'protected' },
];
```

`collectFiles` walks each directory recursively, skipping known non-content directories:

```js
// scripts/ingest-docs.js lines 41-44
const SKIP = [
  'node_modules', 'dist', '.git', 'scripts',
  'logo-preview.html',
];
```

The `scripts/` directory itself is skipped — the ingest script indexing itself would create a feedback loop of meta-content that does not serve the chatbot's purpose.

### Access Tag Parsing

Every file's content passes through `parseAccess` before chunking:

```js
// scripts/ingest-docs.js lines 65-77
function parseAccess(content, defaultAccess) {
  const frontmatter = content.match(/^---\s*\naccess:\s*(\w+)\s*\n---/);
  const fileAccess  = frontmatter ? frontmatter[1] : defaultAccess;

  const stripped = content.replace(
    /<!--\s*access:\s*restricted\s*-->[\s\S]*?<!--\s*\/access\s*-->/gi,
    '',
  );

  return { text: stripped, access: fileAccess };
}
```

There are two levels of access control in the ingestion pipeline:

- **File-level:** A YAML frontmatter block `--- access: restricted ---` marks an entire file as restricted. The file is skipped entirely (`if (access === 'restricted') continue`).
- **Section-level:** HTML comment tags `<!-- access: restricted -->...<!-- /access -->` strip specific sections before chunking. The surrounding content is still indexed; only the tagged block is removed.

All content defaults to `'protected'` — meaning any signed-in user can query it. The `'public'` tier exists in the code but is not yet enforced at query time (the RAG route always requires a session).

### Chunking Strategy

The chunking logic differs for markdown and code files.

**Markdown chunking** (`chunkMarkdown`): splits on heading boundaries (`#`, `##`, `###`), then further splits sections that exceed `CHUNK_SIZE * 4` characters (≈ 1600 chars, ≈ 400 tokens):

```js
// scripts/ingest-docs.js lines 81-104
function chunkMarkdown(text, filePath) {
  const chunks = [];
  const sections = text.split(/(?=^#{1,3} )/m).filter(s => s.trim());

  for (const section of sections) {
    const heading = section.match(/^#{1,3} (.+)/m)?.[1] ?? '';
    const body    = section.trim();

    if (body.length <= CHUNK_SIZE * 4) {
      chunks.push({ text: body, heading, filePath });
      continue;
    }

    // Long section — split by character count with overlap
    let start = 0;
    while (start < body.length) {
      const end  = Math.min(start + CHUNK_SIZE * 4, body.length);
      chunks.push({ text: body.slice(start, end), heading, filePath });
      start += (CHUNK_SIZE - CHUNK_OVERLAP) * 4;
    }
  }
  return chunks;
}
```

The `CHUNK_OVERLAP = 80` tokens (≈ 320 characters) creates a sliding window. When a long section is split, the second chunk starts 80 tokens before the end of the first. This ensures that content straddling a split boundary is not lost — both chunks carry part of the surrounding context.

**Code chunking** (`chunkCode`): splits on blank lines between top-level declarations, accumulating blocks until the chunk would exceed `CHUNK_SIZE * 4` characters:

```js
// scripts/ingest-docs.js lines 106-122
function chunkCode(text, filePath) {
  const chunks = [];
  const blocks = text.split(/\n{2,}/);
  let current  = '';

  for (const block of blocks) {
    if ((current + block).length > CHUNK_SIZE * 4) {
      if (current.trim()) chunks.push({ text: current.trim(), heading: '', filePath });
      current = block;
    } else {
      current += '\n\n' + block;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), heading: '', filePath });
  return chunks;
}
```

Code does not have headings in the markdown sense, so heading is always `''` for code chunks. This slightly reduces retrieval quality for code files — the vector index cannot filter by section heading — but it keeps the chunking logic simple.

### Embedding and Upsert

The script calls the Workers AI REST API directly (not through `wrangler dev`) to generate embeddings:

```js
// scripts/ingest-docs.js lines 125-137
async function embed(texts) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text: texts }),
    },
  );
  const data = await res.json();
  if (!data.success) throw new Error(`Embed failed: ${JSON.stringify(data.errors)}`);
  return data.result.data; // float[][] — one vector per input text
}
```

The model is `@cf/baai/bge-base-en-v1.5`, which produces 768-dimensional float vectors. Batches of up to 25 chunks are sent per embed call (the limit imposed by the Workers AI API on text arrays).

Vectors are upserted using newline-delimited JSON (NDJSON), as required by the Vectorize v2 upsert endpoint:

```js
// scripts/ingest-docs.js lines 139-151
async function upsertVectors(vectors) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${INDEX_NAME}/upsert`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/x-ndjson' },
      body:    vectors.map(v => JSON.stringify(v)).join('\n'),
    },
  );
  ...
}
```

Each vector object has:
- `id`: a sanitized string of the form `docs_chapters_08_number_matching_md_12` (file path with non-alphanumeric chars replaced, plus chunk index)
- `values`: the float[768] embedding
- `metadata.text`: the chunk text, truncated to 1000 characters (Vectorize metadata cap)
- `metadata.filePath`: the relative path from the project root
- `metadata.heading`: the section heading (markdown only)
- `metadata.access`: the access tier string

The dry-run mode (default, no `--upsert` flag) prints a summary of chunk counts and the first five chunks for review. The actual embed-and-upsert pass requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the environment.

**Running the pipeline:**

```bash
yarn ingest             # dry run: shows chunk count, no API calls
yarn ingest:upsert      # embeds and upserts (needs CF credentials)
```

---

## 15.4 The Vectorize Index

The index is named `varun-portfolio-rag` and configured with 768 dimensions and cosine distance metric. It is declared in `wrangler.toml`:

```toml
# wrangler.toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "varun-portfolio-rag"
```

**768 dimensions** matches the output of `bge-base-en-v1.5`. The embedding model and the index dimension must agree — a 768-dim model cannot query a 1536-dim index and vice versa. The index was created with:

```bash
npx wrangler vectorize create varun-portfolio-rag --dimensions=768 --metric=cosine
```

**Cosine similarity** measures the angle between two vectors rather than their Euclidean distance. For text embeddings, cosine similarity is the standard metric because it is invariant to vector magnitude. Two chunks about "passkey authentication" will point in a similar direction in 768-dimensional space regardless of how long the chunks are. Euclidean distance would disadvantage longer chunks, which tend to produce higher-magnitude vectors.

**The `bge-base-en-v1.5` model** (BAAI General Embedding, base size, English, version 1.5) is a 109M-parameter bi-encoder model trained on large-scale text pairs to produce semantically meaningful dense vectors. It is the model most consistently available on Workers AI's free tier for embedding. The query vector and the corpus vectors are both produced by the same model, which is required — mixing embedding models is undefined behavior.

**Metadata filtering** is not used in the current implementation. The `returnMetadata: 'all'` option in `retrieveChunks` returns all stored metadata fields, but the query does not filter by `access` field. This means a query from a signed-in user could theoretically retrieve a chunk that should be restricted — but since the `restricted` tier content is stripped before indexing, this gap is currently moot. If restricted content were indexed in the future (for an admin-tier retrieval path), the Vectorize filter API would need to be used. This requires the filter property to be declared when the index is created, not added later. This is a known limitation discussed in Section 15.11.

---

## 15.5 The Chat Route

The route handler is `postChat` in `worker/chat.js`, called by `worker/index.js` when the request matches `POST /api/chat`.

### Session Check

```js
// worker/chat.js — postChat
const session = await getSession(env.AUTH_KV, request);
if (!session) return json({ error: 'Unauthorized' }, 401);
```

`getSession` reads the session cookie, hashes it with SHA-256, and looks up `session:{tokenHash}` in KV. If the KV entry does not exist (expired, revoked, or no cookie), the request is rejected with 401. The chat endpoint is fully gated — there is no public or anonymous access.

### Conversation Management

```js
// worker/chat.js — postChat
const body = await request.json().catch(() => ({}));
const { message, conversationId } = body;
if (!message?.trim()) return json({ error: 'message required' }, 400);

const db = env.varun_portfolio_auth;
const conversation = await getOrCreateConversation(db, session.userId, conversationId ?? null, message);
```

`getOrCreateConversation` covers two cases:

**Continuing an existing conversation** — if `conversationId` is provided, it queries D1 to verify ownership (`WHERE id = ? AND user_id = ?`) and returns the row. The `AND user_id = ?` clause is the authorization check: a user cannot retrieve another user's conversation by guessing its UUID.

**Starting a new conversation** — if no `conversationId` is provided (or the ID does not belong to this user), a new row is inserted. The title is derived from the first 60 characters of the first message, with whitespace collapsed:

```js
// worker/chat.js lines — getOrCreateConversation
const title = firstMessage.slice(0, 60).replace(/\s+/g, ' ').trim();
const id     = crypto.randomUUID();
const now    = Date.now();
await db
  .prepare('INSERT INTO conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  .bind(id, userId, title, now, now)
  .run();
```

This is a reasonable title heuristic. "How does number matching work?" becomes a conversation titled "How does number matching work?" The user sees this in the sidebar on the `/chat` page.

### Conversation History

```js
// worker/chat.js — getConversationHistory
const result = await db
  .prepare(`SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ${HISTORY_MESSAGES}`)
  .bind(conversationId)
  .all();
return result.results.reverse();
```

`HISTORY_MESSAGES = 10` means the last 10 turns are fetched. The query uses `ORDER BY created_at DESC LIMIT 10` then reverses in JavaScript to produce chronological order. This is a minor inefficiency (fetch newest first, then flip) but avoids a subquery or CTE and is correct.

Limiting to 10 turns is a deliberate tradeoff against prompt length. Each turn adds roughly 200–500 tokens of context. Ten turns adds 2,000–5,000 tokens, which stays well within the model's context window while keeping inference latency reasonable on Workers AI.

### Embedding the Query

```js
// worker/chat.js — embedQuery
async function embedQuery(ai, text) {
  const result = await ai.run('@cf/baai/bge-base-en-v1.5', { text: [text] });
  return result.data[0];
}
```

Unlike the ingestion script (which uses the REST API with a Bearer token), the Worker uses the `env.AI` binding to call Workers AI. The binding is declared in `wrangler.toml`:

```toml
[ai]
binding = "AI"
```

`ai.run` is the Workers AI binding's method. The model is the same `bge-base-en-v1.5` used during ingestion — consistency here is non-negotiable. The input is an array of one string; the result is `data[0]`, the single float[768] vector.

### Retrieving Chunks

```js
// worker/chat.js — retrieveChunks
async function retrieveChunks(vectorize, vector) {
  const results = await vectorize.query(vector, {
    topK: CONTEXT_CHUNKS,
    returnMetadata: 'all',
  });
  return results.matches ?? [];
}
```

`CONTEXT_CHUNKS = 5`. Vectorize returns the 5 nearest neighbors by cosine similarity. Each match includes the stored metadata object (`metadata.text`, `metadata.filePath`, `metadata.heading`, `metadata.access`) and the similarity score.

`topK: 5` is a judgment call between retrieval recall and prompt length. Too few chunks and the model may not have enough context for complex questions. Too many and the prompt grows large, the model is distracted by irrelevant chunks, and latency increases. Five is a common default in RAG systems and works well for this corpus size.

### Building the System Prompt

```js
// worker/chat.js — buildSystemPrompt
function buildSystemPrompt(chunks) {
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.metadata?.filePath ?? 'unknown'}) ${c.metadata?.text ?? ''}`)
    .join('\n\n');

  return `You are a knowledgeable assistant for Varun's engineering portfolio site.
Answer questions about the site's architecture, auth system, features, and code.
Base your answers on the context below. If the context doesn't cover the question,
say so honestly — do not hallucinate details.

<context>
${context}
</context>

Be concise. Use markdown for code samples. Cite the source file when helpful.`;
}
```

Chunks are formatted as numbered, file-attributed context entries: `[1] (docs/chapters/08-number-matching.md) ## 8.1 What Number Matching Is ...`. The numbering allows the model to cite specific sources in its response. The `<context>` XML-style tag is a common LLM prompt convention that provides a clear delimiter between instructions and retrieved content.

The instruction "say so honestly — do not hallucinate details" is not magic, but it does reduce hallucination frequency. Large models are more prone to fabrication when the prompt implicitly rewards confident answers. Explicitly granting permission to say "I don't know" shifts the prior.

### Streaming Workers AI

```js
// worker/chat.js — streamWorkersAI
async function streamWorkersAI(ai, systemPrompt, messages) {
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];
  const stream = await ai.run(MODEL, { messages: aiMessages, stream: true, max_tokens: 1024 });
  return stream;
}
```

The model is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. `stream: true` instructs Workers AI to return a `ReadableStream` instead of waiting for the full response. `max_tokens: 1024` caps the response length. Without this cap, a long answer could exhaust the free-tier quota for the response in a single query.

`messages` is the concatenation of conversation history (role/content pairs from D1) plus the new user message — the standard chat completion format used by OpenAI-compatible APIs and adopted here by llama's instruct format.

---

## 15.6 SSE Streaming Protocol

Server-Sent Events (SSE) is a browser standard for one-directional server-to-client streaming over HTTP. The `Content-Type: text/event-stream` header instructs the browser to treat the response body as an event stream. Each event is a line beginning with `data: ` followed by the event payload, terminated by a blank line (`\n\n`).

**Workers AI's SSE format** (what `streamWorkersAI` returns) emits lines like:

```text
data: {"response":"The"}
data: {"response":" auth"}
data: {"response":" system"}
data: [DONE]
```

Each `data:` line contains a JSON object with a `response` field holding the next token (or small group of tokens). The stream ends with `data: [DONE]`.

**This project's SSE format** (what the browser receives) is different:

```text
data: {"type":"delta","text":"The"}
data: {"type":"delta","text":" auth"}
data: {"type":"delta","text":" system"}
data: {"type":"done"}
```

The `transformStream` function bridges these two formats:

```js
// worker/chat.js — transformStream
function transformStream(workersStream, onFullText) {
  let fullText = '';
  const decoder = new TextDecoder();
  let buffer    = '';

  return new ReadableStream({
    async start(controller) {
      const reader = workersStream.getReader();
      const enc    = new TextEncoder();

      function emit(obj) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') {
              await onFullText(fullText);
              emit({ type: 'done' });
              continue;
            }
            let event;
            try { event = JSON.parse(raw); } catch { continue; }

            if (event.response) {
              fullText += event.response;
              emit({ type: 'delta', text: event.response });
            }
          }
        }
      } catch (err) {
        emit({ type: 'error', message: err.message });
      } finally {
        controller.close();
      }
    },
  });
}
```

Several details are worth noting:

**The buffer accumulation pattern** (`buffer += decoder.decode(value, { stream: true }); lines = buffer.split('\n'); buffer = lines.pop()`) handles the case where a `data:` line is split across multiple `read()` calls. The last element of `split('\n')` is kept as a partial line and prepended to the next chunk. This is the standard streaming line-by-line parsing idiom and the same pattern used in `useChat.jsx` on the client side.

**`onFullText(fullText)`** is an async callback called when `[DONE]` is received. At this point, the full assistant response has been accumulated in `fullText`, and it is safe to write it to D1. This is the hook point for persistence. The callback is defined in `postChat` and calls `saveMessages`.

**Error emission:** If the `ReadableStream` read loop throws, an `{ type: 'error', message }` event is emitted before closing the controller. The client's `useChat` hook handles this event type by throwing an error that clears the placeholder message.

**The SSE response headers** in `postChat` include `X-Conversation-Id`, which carries the conversation UUID (whether newly created or pre-existing). The client hook reads this header on the first turn to track the conversation for subsequent messages.

```js
// worker/chat.js — postChat return
return new Response(clientStream, {
  headers: {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Conversation-Id': conversation.id,
  },
});
```

**SSE responses bypass CORS header injection** in `worker/index.js`:

```js
// worker/index.js lines 58-59
if (response.headers.get('Content-Type')?.startsWith('text/event-stream')) return response;
```

This is necessary because adding CORS headers to the response object after the fact requires constructing a new `Response`, which would consume the body stream. SSE responses must be passed through with their original body intact.

---

## 15.7 Multi-Turn Conversation Design

Conversations are stored in two D1 tables, `conversations` and `chat_messages`, added to `worker/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
```

**`conversations.title`** is derived from the first 60 characters of the first message. This happens in `getOrCreateConversation` at first-turn time. The title is not updated on subsequent turns — the first message is the most descriptive label for what the conversation is about.

**`conversations.updated_at`** is updated on every `saveMessages` call (via the batch statement `UPDATE conversations SET updated_at = ? WHERE id = ?`). The conversation list is sorted by `updated_at DESC`, so active conversations float to the top of the sidebar.

**The `saveMessages` function** uses a D1 batch to write user message, assistant message, and conversation timestamp in one round-trip:

```js
// worker/chat.js — saveMessages
async function saveMessages(db, conversationId, userContent, assistantContent) {
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), conversationId, 'user', userContent, now),
    db.prepare('INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), conversationId, 'assistant', assistantContent, now + 1),
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .bind(now, conversationId),
  ]);
}
```

The assistant message receives `created_at: now + 1` (one millisecond after the user message) to guarantee the `ORDER BY created_at ASC` sort used by `getConversation` places them in the correct order. Without this offset, two messages with the same millisecond timestamp could sort non-deterministically.

**The 50-conversation limit** appears in the `listConversations` query:

```js
// worker/chat.js — listConversations
const result = await env.varun_portfolio_auth
  .prepare('SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50')
  .bind(session.userId)
  .all();
```

The limit prevents unbounded storage growth. There is no automatic pruning — conversations beyond 50 still exist in D1, they simply do not appear in the list. A future improvement would add a "load more" pagination mechanism or prune old conversations automatically.

**Conversation deletion** removes messages first, then the conversation row:

```js
// worker/chat.js — deleteConversation
await db.batch([
  db.prepare('DELETE FROM chat_messages WHERE conversation_id = ?').bind(id),
  db.prepare('DELETE FROM conversations WHERE id = ?').bind(id),
]);
```

D1 does not enforce `ON DELETE CASCADE` without an explicit `PRAGMA foreign_keys = ON` per connection. The batch delete handles referential integrity manually, the same pattern used in `deleteUser` for the auth tables.

---

## 15.8 Access Tiers

The ingestion pipeline defines three tiers:

| Tier | Behavior | Current use |
|------|----------|-------------|
| `public` | Queryable by unauthenticated users (future) | Not yet enforced at query time |
| `protected` | Any signed-in user can query (default) | All current content |
| `restricted` | Stripped before indexing | Available for future sensitive content |

**File-level restriction** uses YAML frontmatter:
```yaml
---
access: restricted
---
```
Files with this frontmatter are logged as `skip (restricted): path/to/file` and excluded entirely from chunking.

**Section-level restriction** uses HTML comment tags:
```html
<!-- access: restricted -->
This content will never be indexed.
<!-- /access -->
```
The regex strips these blocks before the remaining content is chunked. The surrounding content (the paragraph before and after the block) is still indexed normally.

**The current limitation:** The `access` field is stored in Vectorize metadata but is not filtered at query time. `retrieveChunks` uses `returnMetadata: 'all'` to return all chunks regardless of their access tier. Since all currently indexed content is `protected` (no `restricted` content passes the ingestion filter), this is not a practical gap. But it means the system is not architecturally ready to mix access tiers — querying would need to add a Vectorize filter expression like `{ access: { $eq: 'protected' } }`, and that filter field must have been declared at index creation time. See Section 15.11.

---

## 15.9 Frontend

### `useChat` Hook

`src/hooks/useChat.jsx` manages all conversation state for a single chat instance.

```js
// src/hooks/useChat.jsx lines 10-16
export function useChat(initialConversationId = null) {
  const [messages,       setMessages]       = useState([]);
  const [streaming,      setStreaming]       = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [error,          setError]          = useState(null);
  const abortRef = useRef(null);
  ...
}
```

**Optimistic updates:** The `send` function appends the user message to local state immediately, before the fetch resolves. It also appends a placeholder assistant message with `content: ''` before the first SSE delta arrives. This makes the UI feel responsive — the user message appears instantly, and the streaming indicator shows without waiting for the network round-trip.

```js
// src/hooks/useChat.jsx lines 23-29
const userMsg = { role: 'user', content: text, id: crypto.randomUUID() };
setMessages(prev => [...prev, userMsg]);

const assistantId = crypto.randomUUID();
setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId }]);
setStreaming(true);
```

**SSE parsing in the client** uses the same buffer-accumulation pattern as the server-side `transformStream`:

```js
// src/hooks/useChat.jsx lines 53-78
const reader  = res.body.getReader();
const decoder = new TextDecoder();
let buffer    = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    let event;
    try { event = JSON.parse(line.slice(6)); } catch { continue; }

    if (event.type === 'delta') {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content + event.text } : m
      ));
    } else if (event.type === 'error') {
      throw new Error(event.message);
    }
  }
}
```

Each `delta` event appends `event.text` to the assistant placeholder message by ID. This produces the character-by-character streaming effect visible in the UI.

**Conversation ID handoff:** After the fetch resolves (headers are available before the body stream starts), the hook reads `X-Conversation-Id`:

```js
// src/hooks/useChat.jsx lines 49-50
const convId = res.headers.get('X-Conversation-Id');
if (convId && !conversationId) setConversationId(convId);
```

On the first turn, `conversationId` is null and the header carries the newly created UUID. On subsequent turns, `conversationId` is already set and the header is ignored. This UUID is sent in the body of subsequent requests so the server can find the existing conversation.

**Abort:** The hook uses `AbortController` to cancel in-flight requests. The `abort()` function is exposed and called by `reset()`. When the user clicks "new" in `ChatWidget`, `reset()` aborts any ongoing stream, clears messages, and resets the conversation ID.

**Loading an existing conversation** (`loadConversation`): fetches from `/api/chat/conversations/{id}` and populates the messages array. Called by the `/chat` page when the user clicks a conversation in the sidebar.

### `ChatWidget` Component

`src/components/ChatWidget.jsx` is the floating chat button and slide-up panel that appears on all pages for signed-in users.

The FAB (Floating Action Button) is a 48×48px circular button positioned `fixed` at `bottom: 24, right: 24`:

```js
// src/components/ChatWidget.jsx lines 235-264
<button style={{
  position:     'fixed',
  bottom:       24,
  right:        24,
  width:        48,
  height:       48,
  borderRadius: '50%',
  ...
}}
```

When open, the FAB switches from a chat icon SVG to a `×` close glyph. The panel renders above and to the left of the FAB at `bottom: 80, right: 24`. The panel is `min(420px, calc(100vw - 48px))` wide and `min(560px, calc(100vh - 120px))` tall — responsive to narrow screens.

The input textarea auto-resizes using an `onInput` handler:

```js
// src/components/ChatWidget.jsx lines 197-200
onInput={e => {
  e.target.style.height = 'auto';
  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
}}
```

Setting `height: auto` first forces the browser to recalculate `scrollHeight` correctly. The height is then clamped to 120px maximum (about 5 lines), after which the textarea scrolls internally. This is the standard CSS auto-resize pattern.

`Enter` sends the message; `Shift+Enter` inserts a newline. The panel has a "full view" link that navigates to `/chat` and closes the widget.

### `StreamingStatus` Component

`src/components/StreamingStatus.jsx` shows while the assistant message is empty (waiting for the first token):

```js
// src/components/StreamingStatus.jsx lines 7-22
const MESSAGES = [
  'vectorizing your query…',
  'cosine similarity intensifies…',
  'retrieving chunks from the void…',
  'bribing the embeddings…',
  'warming up attention heads…',
  'doing math you don\'t want to know about…',
  'running inference at the edge…',
  'asking llama-70b nicely…',
  'whispering to the transformer…',
  'computing dot products at light speed…',
  'hallucination filters engaged…',
  'context window loading…',
  'tokens incoming…',
  'gradient descent complete, probably…',
];
```

The component cycles through all 14 messages every 1,800ms using `setInterval`. The initial index is randomized so different streaming sessions start at different messages. A pulsing dot (CSS `@keyframes rag-pulse`) accompanies the text — it scales between 1.0 and 0.7 and fades between opacity 1.0 and 0.3 on a 1-second cycle.

The component disappears as soon as `event.type === 'delta'` is received — the parent replaces `<StreamingStatus>` with a `<MessageBubble>` the moment `message.content` becomes non-empty.

### `Chat` Page (`/chat`)

`src/pages/Chat.jsx` is the full-screen chat interface. It redirects to `/auth` if the user is not signed in.

The layout is two columns:

**Sidebar (260px, `borderRight`):** Shows up to 50 conversations sorted by `updated_at DESC`. Each item has a title truncated with `text-overflow: ellipsis`. On hover or when active, a `×` delete button appears. "New conversation" button resets the right panel.

**Chat area (flex 1):** Uses its own `useChat()` instance, keyed by `activeConvId` via `<ChatArea key={activeConvId ?? 'new'} />`. The React `key` prop forces a new component instance (and thus a new `useChat` state) when the user switches conversations. This is simpler than imperatively resetting state.

**The markdown-lite renderer** (`renderContent` function) handles three formats:
- Fenced code blocks (` ``` ` delimiters): rendered as `<pre><code>` with a bordered, dark background
- Inline code (backtick-quoted): rendered as `<code>` with a monospace font
- Bold (`**text**`): rendered as `<strong>`

Everything else is plain text. There is no heading rendering, no list rendering, no link rendering. This is intentional — the context window for LLM responses is expected to be code and prose explanations, not complex document structure. A full markdown library (like `react-markdown`) would handle more cases but add bundle weight. The inline renderer is 30 lines and covers 95% of what the model outputs.

---

## 15.10 The Model Choice

The model is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

**70b vs 8b:** The 8-billion-parameter variant (`@cf/meta/llama-3.2-11b-vision-instruct` is the closest available) produces noticeably worse instruction-following and code explanation than the 70B variant. For a technical portfolio where the questions are about authentication code, passkey ceremonies, and architectural tradeoffs, the quality difference is material. The 70B model explains `transformStream` clearly; the 8B model sometimes truncates or misattributes.

**fp8-fast vs other quantizations:** `fp8-fast` is a quantized variant using 8-bit floating-point weights instead of 16-bit. This halves the memory footprint and increases throughput at a very small perplexity cost. Cloudflare makes `fp8-fast` available on the free tier because it can run more inference requests per GPU compared to the full-precision model. The "fast" suffix specifically indicates an optimization for time-to-first-token, which matters for streaming perception.

**Why not Claude?** Anthropic's Claude models (Claude Sonnet, Claude Haiku) are consistently higher quality for technical explanation and code synthesis. Claude is more likely to be honest about what it does not know, less likely to confuse architectural terms, and better at long-form structured responses. The reason it is not used here is cost. Workers AI's free tier provides inference at no charge. The Anthropic API charges per token with no free inference tier. For a personal portfolio on a $0/month budget, Workers AI is the only viable option. Section 14.X discusses upgrading when the project matures beyond the free tier.

**The `max_tokens: 1024` cap:** LLaMA 3.3 70B can produce much longer responses, but the free tier's per-request quota limits how many tokens can be generated. 1024 output tokens ≈ 750 words, which is enough for a thorough explanation of most single topics. Responses that require more than this (e.g., "walk me through the entire auth system") will be truncated. This is acknowledged by the model in most cases ("I'll cover the key points" etc.) but can sometimes result in abrupt endings.

---

## 15.11 Known Limitations and Future Improvements

**Vectorize metadata filtering is not configured.** The `access` field is stored on each vector, but the Vectorize index was created without a declared filter field. Adding a filter after creation requires re-creating the index and re-ingesting all content. If the access tier system is ever enforced at query time (restricting which chunks a given user can receive), this will require an index rebuild. For now, because all indexed content is `protected` (restricted content is stripped at ingest time), this gap has no user-visible effect.

**No rate limiting on the chat endpoint.** The `POST /api/chat` route has session-gating but no per-user rate limit. A signed-in user can send messages in a tight loop and exhaust the Workers AI free-tier quota for the day. A simple counter in KV (e.g., `chat_rate:{userId}:{date}` with a 24-hour TTL) would cap requests per user per day. This is the same pattern used by the OTP rate limiter.

**1024 token output cap.** Long answers are truncated. This is a free-tier constraint, not an architectural one. Raising `max_tokens` to 4096 would produce longer answers at higher quota cost. On the Workers AI paid tier, this would cost roughly $0.00022 per 1000 tokens at current pricing.

**LLaMA vs Claude quality gap.** LLaMA 3.3 70B is excellent for a free-tier model but has real limitations on technical explanation quality compared to frontier models. Code explanations are generally accurate; architectural analysis is sometimes shallow; security tradeoff discussions occasionally miss nuance. Chapter 14 discusses the path to Claude API integration.

**The conversation history window is fixed at 10 turns.** A user in a long conversation loses context from early turns. A more sophisticated approach would use a summarization step: periodically summarize early turns into a single compressed message, preserving the semantic content without burning the full turn budget. This is a common production RAG pattern but adds complexity.

**Metadata text is truncated to 1000 characters.** The Vectorize metadata size cap means that long chunks have their stored text truncated. The embedding is computed on the full text, so retrieval quality is not affected. But when the chunk's `metadata.text` is used in the system prompt, truncated chunks provide less context to the model. The workaround is to embed the full text but fetch the full content from D1 or a KV cache by chunk ID at query time. This is not currently implemented.

**The ingestion script must be re-run manually after any documentation change.** There is no automated re-ingestion on deploy. A GitHub Actions workflow that runs `yarn ingest:upsert` after a successful deploy would keep the index current. The `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets would need to be added to the GitHub repository.

**The `num_match_pending:{tempToken}` cleanup gap from Chapter 8 applies analogously.** `chat_messages` rows accumulate indefinitely. A conversation that the user deletes removes its messages, but there is no time-based pruning for old conversations the user forgets to delete. A D1 periodic cleanup (via a Cloudflare Cron Trigger) could prune conversations older than, say, 90 days.

---

## Key Takeaways

- RAG retrieves relevant content chunks before asking the model, avoiding the cost of fine-tuning and the latency/quota cost of large context windows.
- The ingestion pipeline (`scripts/ingest-docs.js`) reads three source trees, strips restricted sections, chunks by heading (markdown) or blank-line boundary (code), embeds with `bge-base-en-v1.5`, and upserts to Vectorize in batches of 25.
- At query time: embed the question → cosine search top-5 chunks → build numbered system prompt → stream llama-3.3-70b-fp8-fast → transform Workers AI SSE to client SSE → persist to D1 on stream end.
- Multi-turn conversations are stored in D1 (`conversations` + `chat_messages`). History is limited to the last 10 turns per request to control prompt size.
- The `transformStream` function bridges Workers AI's `{ response: "token" }` SSE format to the client's `{ type: "delta", text: "token" }` format, accumulating the full response to write to D1 when `[DONE]` is received.
- `useChat` manages optimistic UI, SSE parsing, abort, and conversation ID handoff from the `X-Conversation-Id` response header.
- The model choice (llama-3.3-70b-fp8-fast) is driven by the free-tier constraint. Claude would produce higher-quality responses but requires a paid API.
- Known gaps: no metadata filtering at query time, no rate limiting on the chat endpoint, 1024-token output cap, manual re-ingestion required after content changes.
