# Varun Ragunathan — Portfolio

Staff Software Engineer with 11+ years building identity, authentication, and platform systems at scale (135M+ users, 100K–300K RPS at eBay). This portfolio is a working notebook for AI-native engineering: small, opinionated tools that demonstrate how I think about LLM systems in production.

## Thesis: Programming, not Prompting

Most LLM demos are prompt tricks. The systems here treat the model as a typed function call inside a real program — structured inputs, structured outputs, validators, retries, evals, and clear cost vs quality tradeoffs. Each project pushes that idea a little further.

Why it matters: at eBay I scaled AI adoption from 0 to 80% across the Identity org and cut feature cycle times by ~40%. The wins came from treating LLMs as composable engineering primitives, not magic prompt boxes. These projects extend that practice.

---

## Projects

| # | Project | Effort | Stack Signal | Status |
|---|---------|--------|--------------|--------|
| 1 | [Multi Provider Playground](#1-multi-provider-playground) | 1–2 days | Provider abstraction, streaming, async fan-out | 🔲 Planned |
| 2 | [Smart Router](#2-smart-router) | 2–3 days | Structured outputs, classification, cost vs quality tradeoffs | 🔲 Planned |
| 3 | [LLM Consensus Arena](#3-llm-consensus-arena) | 5–7 days | Multi-agent orchestration, convergence detection, transcript UI | 🔲 Planned |
| 4 | [Documentation Freshness Analyzer](#4-documentation-freshness-analyzer) | 3–4 days | LLM + tooling integration, git history reasoning | 🚧 Roadmap |

---

### 1. Multi Provider Playground

> One question. Every model. Side by side.

Ask a question and get answers from OpenAI, Anthropic, Gemini, and an open-source provider in parallel. Responses stream simultaneously. Each answer card shows model name, latency, and token count.

This is the shared infrastructure substrate that all other projects in this portfolio are built on top of.

**What it shows:** Provider abstraction, parallel async fan-out, streaming UI, response comparison ergonomics.

**Stack:** Node.js, TypeScript, React, Server-Sent Events.

**Design notes:**
- Single internal interface (`generate(model, messages, options)`) hides provider differences in streaming format, tool use shape, and error handling.
- All downstream projects depend on this layer — Smart Router and LLM Arena are modes on top of it, not separate repos.

[Live demo] · [Source]

---

### 2. Smart Router

> Ask one question. The router decides which model should answer it — and tells you why.

A lightweight classifier fires before the main query. It returns a structured decision: category, confidence score, recommended model, and a one-line rationale. The query then dispatches to the winning model. Low-confidence decisions fall back to a default.

**What it shows:** Structured outputs, cost vs quality tradeoff modeling, classification, provider abstraction, latency-aware design.

**Stack:** Node.js, TypeScript, multi-provider abstraction layer, React.

**Design notes:**
- Routing is itself a small LLM call returning a typed JSON schema: `{ category, confidence, recommended_model, rationale }`.
- Per-category latency and token cost are tracked so routing decisions can be re-tuned from real traces rather than assumption.
- Falls back to a configurable default model below a confidence threshold.

[Live demo] · [Source]

---

### 3. LLM Consensus Arena

> Two models debate a question — blind to each other being LLMs — while a moderator drives them toward a shared answer.

Each agent receives a system prompt framing the counterpart as a human domain expert. There is no leakage that the other party is a language model. A separate moderator model scores semantic agreement after each exchange using structured output and triggers a consensus call when a configurable threshold is met. The full conversation transcript is shown alongside a final synthesized answer card.

**What it shows:** Multi-agent orchestration, structured turn-taking, convergence detection, blind agent setup, transcript UI, evaluation thinking.

**Stack:** Node.js, TypeScript, React, streaming UI.

**Design notes:**
- Moderator decisions use JSON schema output so the control flow is deterministic, not vibes-based.
- The final answer is a moderator synthesis — not a vote, not the last message.
- Includes canned demo prompts so any visitor can run a full debate without setup.

[Live demo] · [Source]

---

### 4. Documentation Freshness Analyzer

> Points at a docs folder, flags what is stale, tells you why.

Cross-references file modification history against recent source code changes via git and uses an LLM to flag sections that reference APIs, flags, or behavior that has likely changed. Output is a prioritized list of stale sections with suggested update prompts.

**What it shows:** LLM and tooling integration, file system reasoning, CI thinking.

**Stack:** Node.js, TypeScript, git, React.

**Status:** Roadmap — planned after projects 1–3 are shipped.

---

## About

Staff Software Engineer at eBay (Identity and Access Management Platform). Looking for Staff IC roles where platform thinking and AI-native engineering both matter.

[varunr.dev](https://varunr.dev) · [github.com/varunragunathan](https://github.com/varunragunathan) · ragunathanvarun@gmail.com · Pleasanton, CA
