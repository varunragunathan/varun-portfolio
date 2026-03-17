# Passkeys, Edge Computing, and the Passwordless Portfolio

### A Book-Quality Technical Documentation for `varun-portfolio`

---

This documentation covers every layer of a personal portfolio site that doubles as a working demonstration of modern, passwordless authentication. The site is built on a React [SPA](./glossary/README.md#spa), served by a [Cloudflare Worker](./glossary/README.md#workers-runtime), persisted across [D1](./glossary/README.md#d1-sqlite) and [KV](./glossary/README.md#kv-store), and coordinated in real time through [Durable Objects](./glossary/README.md#durable-object). Authentication is [WebAuthn](./glossary/README.md#webauthn) passkeys-first, with number-matching device approval, backup recovery codes, and step-up re-authentication.

The documentation is written for a competent developer who may not yet know WebAuthn or Cloudflare Workers. Every design decision is explained, every tradeoff is named, and known limitations are documented honestly.

---

## Table of Contents

### Chapters

| # | Title | What it covers |
|---|-------|----------------|
| [01](./chapters/01-introduction.md) | Introduction | What this project is, who it's for, feature overview |
| [02](./chapters/02-architecture.md) | Architecture | System diagram, Cloudflare layers, request lifecycle, CORS |
| [03](./chapters/03-database-schema.md) | Database Schema | Every table, every column, D1 vs KV split, key naming |
| [04](./chapters/04-authentication-overview.md) | Authentication Overview | Passwordless philosophy, auth methods, session model, trust levels |
| [05](./chapters/05-passkeys-and-webauthn.md) | Passkeys and WebAuthn | WebAuthn ceremonies, conditional mediation, sign count, simplewebauthn |
| [06](./chapters/06-otp-and-email-verification.md) | OTP and Email Verification | Rate limiting, code generation, TTL strategy |
| [07](./chapters/07-session-management.md) | Session Management | Two-phase sessions, KV+D1 design, revocation bug, cookie security |
| [08](./chapters/08-number-matching.md) | Number Matching | Durable Objects WebSocket broker, polling-to-push redesign |
| [09](./chapters/09-recovery-system.md) | Recovery System | Backup sign-in vs full recovery, PBKDF2 hashing, 8-code system |
| [10](./chapters/10-step-up-authentication.md) | Step-Up Authentication | Re-authentication before destructive actions |
| [11](./chapters/11-frontend-architecture.md) | Frontend Architecture | React, Vite, PWA, theme system, auth flows, Nav animation |
| [12](./chapters/12-security-analysis.md) | Security Analysis | Strengths, known limitations, production gaps |
| [13](./chapters/13-deployment.md) | Deployment | wrangler.toml walkthrough, D1/KV/DO setup, local dev |
| [14](./chapters/14-what-could-be-done.md) | What Could Be Done | Future work with rationale |
| [15](./chapters/15-rag-system.md) | RAG Chat System | Ingestion pipeline, Vectorize, streaming chat, multi-turn conversations, frontend |
| [16](./chapters/16-totp.md) | TOTP | Zero-dependency RFC 6238 implementation, AES-256-GCM secret encryption, setup/disable/sign-in flows |
| [17](./chapters/17-user-tiers.md) | User Tiers | Four roles, upgrade request flow, allowed_models table, chat rate limiting, personas |
| [18](./chapters/18-admin-dashboard.md) | Admin Dashboard | Six tabs: Metrics, Upgrade Requests, Users, Models, Personas, Endpoints |
| [19](./chapters/19-whatsapp-auth.md) | WhatsApp Backup Auth | Twilio integration, OTP flow, phone registration, sign-in path |
| [20](./chapters/20-endpoint-metrics.md) | Endpoint Metrics | Async request logging, path normalization, time-series queries, SVG trend chart |
| [21](./chapters/21-bugs-fixed.md) | Bugs Fixed | Production bugs discovered, root cause analysis, and fixes |

### Glossary

[Master Glossary](./glossary/README.md) — Alphabetical reference for every technical term in the book.

**Quick-jump glossary entries:**

[Assertion](./glossary/README.md#assertion) ·
[bge-base-en-v1.5](./glossary/README.md#bge-base-en-v15) ·
[Attestation](./glossary/README.md#attestation) ·
[Authenticator](./glossary/README.md#authenticator) ·
[Binding](./glossary/README.md#binding) ·
[Browser Autofill UI](./glossary/README.md#browser-autofill-ui) ·
[CBOR](./glossary/README.md#cbor) ·
[Challenge](./glossary/README.md#challenge) ·
[Chunking](./glossary/README.md#chunking-text) ·
[Compatibility Date](./glossary/README.md#compatibility-date) ·
[Conditional Mediation](./glossary/README.md#conditional-mediation) ·
[Cookie](./glossary/README.md#cookie) ·
[Cosine Similarity](./glossary/README.md#cosine-similarity) ·
[CORS](./glossary/README.md#cors) ·
[COSE](./glossary/README.md#cose) ·
[Counter](./glossary/README.md#counter) ·
[Credential ID](./glossary/README.md#credential-id) ·
[Cross-Platform Authenticator](./glossary/README.md#cross-platform-authenticator) ·
[D1 (SQLite)](./glossary/README.md#d1-sqlite) ·
[Damped Oscillation](./glossary/README.md#damped-oscillation) ·
[Discoverable Credential](./glossary/README.md#discoverable-credential) ·
[Durable Object](./glossary/README.md#durable-object) ·
[Edge Computing](./glossary/README.md#edge-computing) ·
[Embedding](./glossary/README.md#embedding-vector) ·
[Golden Ratio](./glossary/README.md#golden-ratio) ·
[Hash](./glossary/README.md#hash) ·
[HOTP](./glossary/README.md#hotp) ·
[HttpOnly](./glossary/README.md#httponly) ·
[Identicon](./glossary/README.md#identicon) ·
[isoBase64URL](./glossary/README.md#isobase64url) ·
[JWT](./glossary/README.md#jwt) ·
[KV Store](./glossary/README.md#kv-store) ·
[Manifest](./glossary/README.md#manifest) ·
[Miniflare](./glossary/README.md#miniflare) ·
[Number Matching](./glossary/README.md#number-matching) ·
[OTP](./glossary/README.md#otp) ·
[Passkey](./glossary/README.md#passkey) ·
[PBKDF2](./glossary/README.md#pbkdf2) ·
[Platform Authenticator](./glossary/README.md#platform-authenticator) ·
[Preflight](./glossary/README.md#preflight) ·
[Public Key Credential](./glossary/README.md#public-key-credential) ·
[Pub/Sub](./glossary/README.md#pubsub) ·
[PWA](./glossary/README.md#pwa) ·
[rAF](./glossary/README.md#raf) ·
[RAG](./glossary/README.md#rag-retrieval-augmented-generation) ·
[Rate Limiting](./glossary/README.md#rate-limiting) ·
[React](./glossary/README.md#react) ·
[Relying Party](./glossary/README.md#relying-party) ·
[Resident Key](./glossary/README.md#resident-key) ·
[RPID](./glossary/README.md#rpid) ·
[Salt](./glossary/README.md#salt) ·
[SameSite](./glossary/README.md#samesite) ·
[Secure Flag](./glossary/README.md#secure-flag) ·
[Server-Sent Events](./glossary/README.md#server-sent-events-sse) ·
[Service Worker](./glossary/README.md#service-worker) ·
[Session Token](./glossary/README.md#session-token) ·
[SHA-256](./glossary/README.md#sha-256) ·
[Sign Count](./glossary/README.md#sign-count) ·
[SPA](./glossary/README.md#spa) ·
[Step-up Authentication](./glossary/README.md#step-up-authentication) ·
[Token Hash](./glossary/README.md#token-hash) ·
[TOTP](./glossary/README.md#totp) ·
[TTL](./glossary/README.md#ttl) ·
[User Verification](./glossary/README.md#user-verification) ·
[Vectorize](./glossary/README.md#vectorize) ·
[Vite](./glossary/README.md#vite) ·
[WCAG](./glossary/README.md#wcag) ·
[WebAuthn](./glossary/README.md#webauthn) ·
[WebSocket](./glossary/README.md#websocket) ·
[Workers AI](./glossary/README.md#workers-ai) ·
[Workers Runtime](./glossary/README.md#workers-runtime) ·
[Workbox](./glossary/README.md#workbox) ·
[Wrangler](./glossary/README.md#wrangler)

---

## How to Read This Book

Each chapter is self-contained but references others freely. If you are new to WebAuthn, read chapters 04 and 05 first. If you want to understand the infrastructure, start at chapters 02 and 13. If you are primarily a frontend engineer, chapter 11 and the glossary will be your home base.

Code snippets are copied verbatim from the real codebase with file paths cited. No pseudocode. No invented examples.

---

*Project source: `/Users/varun/Documents/GitHub/varun-portfolio`*
*Documentation generated: March 2026*
