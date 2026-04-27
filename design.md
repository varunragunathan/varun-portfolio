# High-Level Design & Trade-Offs

This document provides a brief overview of the system architecture and key engineering trade-offs. For an exhaustive breakdown, refer to the full documentation in the [`docs/chapters/`](./docs/chapters/) directory, specifically [Chapter 2 — Architecture](./docs/chapters/02-architecture.md).

## System Architecture

The project is a unified full-stack application running entirely on Cloudflare's global edge network, composed of:

- **Frontend:** A React 18 Single Page Application (SPA) built with Vite, utilizing React Router. It is served directly by the Cloudflare Worker via the ASSETS binding.
- **Backend:** A single Cloudflare Worker that handles both static asset serving and dynamic API routes (`/api/auth/*` and `/api/chat/*`).

### Data & Storage Layers

The system leverages Cloudflare's serverless primitives, carefully chosen for specific data lifecycles:
- **D1 (SQLite):** Persistent, relational, queryable data (Users, Passkeys, Sessions, Security Events).
- **KV Store:** Ephemeral, globally-distributed, fast-read data with TTLs (OTP codes, WebAuthn challenges, active session lookups).
- **Durable Objects (DO):** Stateful, single-instance execution. Used primarily for real-time WebSocket coordination in the number-matching system for new-device approval.
- **Vectorize & Workers AI:** Enables the Retrieval-Augmented Generation (RAG) chat system via vector similarity search and edge-based LLM inference.

*(Detailed in [Chapter 3 — Database Schema](./docs/chapters/03-database-schema.md) and [Chapter 8 — Number Matching](./docs/chapters/08-number-matching.md))*

## Key Trade-Offs

1. **Monolithic Edge Worker vs. Microservices**
   - **Decision:** Bundling the API, authentication, RAG chat, and static file serving into a single Cloudflare Worker.
   - **Trade-Off:** Eliminates network boundaries and results in $0 infrastructure overhead, but requires strict adherence to Worker bundle size and execution limits, alongside disciplined routing logic.

2. **KV Eventual Consistency vs. Strict Consistency**
   - **Decision:** Using KV for active session tokens and challenge states instead of strictly consistent D1.
   - **Trade-Off:** KV offers sub-millisecond reads from edge caches globally, which is critical for latency-sensitive auth checks on every request. The trade-off is a theoretical window of eventual consistency across edge nodes globally.

3. **PBKDF2 Iteration Limits vs. CPU Budgets**
   - **Decision:** Using 100 iterations for PBKDF2 hashing instead of the production-recommended 100,000+.
   - **Trade-Off:** Cloudflare Workers' free tier enforces a strict 10ms CPU limit per request. Standard iterations exceed this budget. This is an acceptable security compromise because passwords are not supported—this hash only protects high-entropy, randomly generated recovery codes.
   *(Analyzed further in [Chapter 12 — Security Analysis](./docs/chapters/12-security-analysis.md))*

4. **Passwordless-First Security Model**
   - **Decision:** Zero support for passwords anywhere in the codebase.
   - **Trade-Off:** Enforces a modern, phishing-resistant security posture using WebAuthn (Passkeys) as primary credentials. It introduces complexity by necessitating robust fallbacks (Recovery codes, TOTP, WhatsApp OTP) rather than degrading to familiar but insecure passwords.
   *(Covered in [Chapter 4 — Authentication Overview](./docs/chapters/04-authentication-overview.md))*

---
**Explore further:** Start with [Chapter 1 — Introduction](./docs/chapters/01-introduction.md) for the full context, or dive straight into [Chapter 2 — Architecture](./docs/chapters/02-architecture.md) for deep technical implementation details.
