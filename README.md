# varunr.dev

Personal portfolio and engineering showcase. The site itself is the product — built to demonstrate the same kind of systems I've spent 11 years shipping professionally.

> **The best way to explore this codebase is at [varunr.dev](https://varunr.dev).**
> Sign in with a passkey and ask the AI assistant anything — architecture decisions, how auth works, how the RAG pipeline was built, why certain tradeoffs were made. It has full context over the source and docs.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router 6, Vite 6, PWA |
| Styling | CSS custom properties + per-component CSS files, Tailwind (base layer only) |
| Backend | Cloudflare Workers (TypeScript) |
| Database | Cloudflare D1 (SQLite at the edge) |
| AI / RAG | Cloudflare AI (embeddings) + Vectorize + llama-3.3-70b |
| Auth | WebAuthn passkeys via SimpleWebAuthn — zero passwords |
| Email | Resend |
| Testing | Playwright (E2E smoke suite, runs on pre-push hook) |

## Stack decisions

| Choice | Why |
|---|---|
| React over Marko | Proves framework agnosticism — Marko expertise is already proven at eBay |
| Vite over Next.js | No SSR needed — simpler tool for the job |
| Cloudflare over AWS | Zero cold starts, integrated edge stack, best free tier |
| Custom auth | Demonstrates domain expertise, not API integration |
| CSS custom properties | Theme tokens live in JS (`useTheme`) and sync to `:root` — component CSS files use `var(--accent)` etc. and react to dark/light mode with no runtime overhead |

---

## Project structure

```
src/
├── components/       # UI components — each has a co-located .css file
├── pages/            # Route-level page components
├── hooks/            # Custom hooks (useAuth, useTheme, useChat, …)
├── data/             # Static portfolio content
worker/               # Cloudflare Worker — API routes, auth, RAG, D1
docs/                 # Full technical documentation
scripts/              # Doc ingestion and export utilities
```

---

## Local dev

```bash
yarn install
yarn dev          # Vite dev server — frontend only
yarn wd           # Build + Wrangler dev — full stack with Worker locally
yarn test         # Playwright E2E smoke suite
yarn test:ui      # Playwright UI mode
```

## Deploy

```bash
yarn deploy          # Build + deploy Worker + assets to Cloudflare
yarn db:migrate      # Run schema migrations on D1 (remote)
yarn ingest          # Re-embed docs into Vectorize
```

---

## Roadmap

- [x] Phase 1: Landing page + PWA + deploy
- [x] Phase 2: Passkey auth + session management
- [x] Phase 3: RAG AI assistant
- [x] Phase 4: Metrics pipeline
- [x] Phase 5: Playwright E2E + CI/CD
- [ ] Phase 6: Math visualizations + interactive demos

---

## Docs

Full technical write-ups in [`docs/chapters/`](./docs/chapters/) — covering the auth system, passkey flow, session management, RAG pipeline, and security analysis.

Or just [ask the AI](https://varunr.dev).

---

**Varun Ragunathan** — Staff Software Engineer
[varunr.dev](https://varunr.dev) · [LinkedIn](https://www.linkedin.com/in/varun-ragunathan) · [Email](mailto:ragunathanvarun@gmail.com)
