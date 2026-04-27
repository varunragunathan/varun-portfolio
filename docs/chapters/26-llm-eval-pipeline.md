# Chapter 26 — LLM Eval Pipeline

## What You'll Learn

This chapter documents the LLM evaluation pipeline built into the admin dashboard. It covers the two-phase architecture (generate then judge), the hardcoded financial Q&A dataset, how scoring works, the versioned run history persisted in Cloudflare KV, the score trend chart, and where each piece of code lives.

---

## 26.1 Why an Eval Pipeline

The portfolio site uses Claude to power its chat widget. When system prompts, models, or personas change, there is no obvious way to tell whether the quality went up or down. The eval pipeline solves this by running a fixed set of questions through the model and scoring every response automatically — no human review needed for a quick sanity check.

The design principle is **eval-as-a-tool, not eval-as-CI**. The pipeline lives in the admin dashboard and is triggered manually. It is meant to give the site owner fast feedback ("does this new system prompt hurt accuracy?") rather than to gate deployments.

---

## 26.2 Architecture: Generate → Judge

Every eval run makes two rounds of Claude API calls, both done in parallel within their phase.

```
POST /api/admin/evals/run
        │
        ▼
Phase 1 — Generate (10 parallel calls)
  Claude Sonnet: user question → model response
        │
        ▼
Phase 2 — Judge (10 parallel calls)
  Claude Sonnet: (question + ideal answer + response) → JSON scores
        │
        ▼
Response: { results, averages, systemPrompt, runAt }
```

Using `Promise.allSettled` for both phases means a single failed call does not abort the whole run. Failed generation slots appear as error strings in the results; failed judge slots fall back to default scores of 1 with the reasoning `"Evaluation failed."`.

```js
// worker/evals.js
const genResults = await Promise.allSettled(
  EVAL_DATASET.map(item =>
    callClaude({ apiKey, messages: [{ role: 'user', content: item.question }],
                 system: effectiveSystem, temperature: 0.3, maxTokens: 600 })
  )
);

const judgeResults = await Promise.allSettled(
  EVAL_DATASET.map((item, i) => {
    const gen = genResults[i];
    if (gen.status === 'rejected') return Promise.resolve(null);
    return callClaude({
      apiKey,
      messages: [{ role: 'user', content: buildJudgePrompt(item.question, item.idealAnswer, gen.value) }],
      system: null, temperature: 0, maxTokens: 200,
    });
  })
);
```

Temperature is set to 0 for the judge to make its scores as deterministic as possible.

---

## 26.3 The Dataset

Ten hardcoded financial Q&A pairs are defined in `worker/evals.js`. Each entry has:

| Field | Purpose |
|-------|---------|
| `id` | Stable identifier (1–10) |
| `category` | Topic label shown in the UI (e.g. `investing`, `bonds`) |
| `question` | The user turn sent to the model |
| `idealAnswer` | Reference answer used by the judge, not shown to the model |

Categories covered: `investing`, `markets`, `bonds`, `personal finance`, `taxes`, `risk`, `valuation`, `inflation`, `compounding`, `ETFs`.

The ideal answers are hand-written and serve as grading rubrics — the judge compares the model's response to them rather than scoring in isolation. This prevents the judge from rewarding a confidently wrong answer.

---

## 26.4 Scoring Dimensions

The judge returns four integer scores (1–5) plus a one-sentence reasoning:

| Dimension | What it measures |
|-----------|-----------------|
| `accuracy` | Are the financial facts correct compared to the reference answer? |
| `hallucination_risk` | Is the response free from invented statistics or false claims? (5 = zero hallucinations) |
| `relevance` | Does the response directly and completely address the question? |
| `tone` | Is the tone professional, clear, and accessible for a financial context? |

The judge prompt instructs Claude to respond with **only valid JSON** — no prose, no markdown fences. The parser strips any surrounding text before `{` and after `}` to handle cases where the model adds explanation despite instructions. All values are clamped to `[1, 5]`.

```js
// worker/evals.js
function parseJudgeJson(text) {
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object found');
  const raw   = JSON.parse(text.slice(start, end + 1));
  const clamp = v => Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
  return {
    accuracy:           clamp(raw.accuracy),
    hallucination_risk: clamp(raw.hallucination_risk),
    relevance:          clamp(raw.relevance),
    tone:               clamp(raw.tone),
    reasoning:          typeof raw.reasoning === 'string' ? raw.reasoning : '',
  };
}
```

---

## 26.5 The Default System Prompt

When no custom system prompt is provided, the worker uses:

```
You are a helpful, accurate financial assistant. Answer questions clearly and
concisely using correct financial concepts. Do not speculate, invent statistics,
or provide specific investment advice.
```

This is the baseline against which custom prompts are compared.

---

## 26.6 API Contract

**Endpoint:** `POST /api/admin/evals/run`

**Auth:** Requires a valid admin session cookie. Returns 403 otherwise.

**Request body (optional):**
```json
{ "systemPrompt": "You are a poet. Respond in poems related to life." }
```
Omit the body (or send `{}`) to use the default system prompt.

**Response:**
```json
{
  "results": [
    {
      "id": 1,
      "category": "investing",
      "question": "What is dollar-cost averaging...",
      "response": "Dollar-cost averaging is...",
      "scores": {
        "accuracy": 5,
        "hallucination_risk": 5,
        "relevance": 4,
        "tone": 5,
        "reasoning": "The response correctly describes DCA..."
      }
    }
  ],
  "averages": {
    "accuracy": 4.8,
    "hallucination_risk": 4.9,
    "relevance": 4.7,
    "tone": 4.6
  },
  "systemPrompt": "You are a helpful, accurate financial assistant...",
  "runAt": 1714012345678
}
```

**Error (missing API key):**
```json
{ "error": "ANTHROPIC_API_KEY is not configured on the worker. Run: wrangler secret put ANTHROPIC_API_KEY" }
```

---

## 26.7 Secret Management

The Anthropic API key is stored as a Cloudflare Worker secret — it is never committed to git and is not visible in `wrangler.toml`.

**Set the production secret:**
```sh
npx wrangler secret put ANTHROPIC_API_KEY
```

**Local development** — add to `.dev.vars` (gitignored):
```
ANTHROPIC_API_KEY=sk-ant-your_key_here
```

The worker reads it via `env.ANTHROPIC_API_KEY` at runtime. If the variable is absent, the endpoint returns HTTP 500 with an actionable error message rather than crashing silently.

---

## 26.8 The Admin UI

The **LLM Evals** tab is the seventh tab in the admin dashboard (index 6). It lives in `src/pages/Admin.jsx` starting at the `EvalsTab` component.

### Run history and versioning

Every run is automatically assigned a version (`v1`, `v2`, …) and a timestamp. Runs are persisted server-side in Cloudflare KV under the key `eval:runs` (up to the last 50), so history survives page reloads, different browsers, and different origins. On mount, `EvalsTab` fetches the full history from `GET /api/admin/evals/runs` and restores the most recent run as the selected primary.

### Workflow

1. **Click "▶ new run"** — a new versioned run is created and appended to history. The run is saved to KV on the server before the response is returned, so it persists immediately.

2. **Inspect the run** — average score cards and per-question cards appear. Expanding a question card shows the model's response and the judge's one-sentence reasoning.

3. **Compare two runs** — in the run history list, one run is marked as "primary" (highlighted in accent color). Click "cmp" on any other run to set it as the comparison target. The question cards switch to a two-column grid:
   - **Left column** — primary run response + judge reasoning, neutral border
   - **Right column** — comparison run response + judge reasoning, accent border

4. **Score trend chart** — once two or more runs exist, a multi-line SVG chart appears above the history list, plotting all four dimensions (accuracy, hallucination risk, relevance, tone) across every run. Each question card also shows a tiny sparkline of its own scores across all runs.

5. **Clear history** — the "clear" button calls `DELETE /api/admin/evals/runs`, which deletes the KV key and resets state.

### Score color scale

| Score | Color |
|-------|-------|
| ≥ 4.5 | Green (`#34c759`) |
| ≥ 3.5 | Light green |
| ≥ 2.5 | Amber (`#f5a623`) |
| ≥ 1.5 | Orange (`#ff9500`) |
| < 1.5 | Red (`#ff3b30`) |

### Side-by-side response view

When a comparison run is selected, expanding a question card renders a two-column grid. Styles for this grid live in `src/pages/Admin.css` under `.eval-compare-grid` and related classes.

---

## 26.9 Interpreting Results

### What low scores mean

A low `accuracy` or `hallucination_risk` score means the model invented facts or contradicted the reference answer. This is the most important dimension for a financial assistant.

A low `relevance` score usually means the model answered a slightly different question or buried the direct answer in tangential content.

A low `tone` score is rarely critical but can indicate the model was either too casual or too dense.

### Non-financial system prompts

If you pass a system prompt like "You are a poet. Respond in poems related to life.", expect significant drops across all dimensions — particularly `accuracy` and `relevance`. The judge scores against financial accuracy criteria, so a poetic response will score poorly even if the poem itself is good. This is the eval working correctly: it surfaces the trade-off between following user instructions and maintaining domain quality.

### What the eval does not catch

- **Latency** — no timing data is collected
- **Token cost** — not measured
- **Edge-case hallucinations** — the 10 questions are fixed; a model could pass all 10 and still hallucinate on question 11
- **User experience** — scores do not capture readability at the sentence level

---

## 26.10 File Reference

| File | Role |
|------|------|
| `worker/evals.js` | All backend logic: dataset, Anthropic API calls, judge prompt, JSON parsing, KV persistence, HTTP handlers |
| `worker/index.js:138` | Route: `GET /api/admin/evals/runs` → `getEvalRuns` |
| `worker/index.js:140` | Route: `DELETE /api/admin/evals/runs` → `deleteEvalRuns` |
| `worker/index.js:142` | Route: `POST /api/admin/evals/run` → `runEvals` |
| `src/pages/Admin.jsx` | Frontend: `EvalsTab`, `EvalResultCard`, `EvalTrendChart`, `EvalQuestionTrend`, `EvalRunHistoryRow` |
| `src/pages/Admin.css` | Styles for response expansion, compare grid, trend chart, history rows |
| `.dev.vars` | Local API key (gitignored) |
| `wrangler secret put ANTHROPIC_API_KEY` | Production key storage |
