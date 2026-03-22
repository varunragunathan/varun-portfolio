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
| Testing | Playwright (E2E), Storybook + Vitest (components), axe-core (accessibility) |
| CI/CD | GitHub Actions — deploy, Lighthouse audit, Gemini AI fix PRs |
| Component dev | Storybook 10 with a11y and vitest addons |
| Performance monitoring | Lighthouse CI → artifact → Gemini-powered AI fix workflow |

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
docs/                 # 24 chapters of full technical documentation
scripts/              # Doc ingestion, export, and Lighthouse AI fix utilities
tests/                # Playwright E2E smoke suite + accessibility checks
.storybook/           # Storybook config
.github/workflows/    # Deploy, Lighthouse CI, Lighthouse AI fix
```

---

## Local dev

```bash
yarn install
yarn dev              # Vite dev server — frontend only
yarn wd               # Build + Wrangler dev — full stack with Worker locally
```

## Testing

Three layers, all run on pre-push:

```bash
yarn test             # Playwright E2E smoke suite (11 tests — nav, footer, a11y, routing)
yarn test:ui          # Playwright UI mode (interactive)
yarn test:storybook   # Vitest + Storybook — 26 component story tests
yarn storybook        # Launch Storybook dev server on :6006
yarn lint             # ESLint across src/
```

**What's covered:**
- Smoke tests verify core pages render, nav + footer are present, version badge is correct, no error boundaries triggered
- Axe-core accessibility checks on home and auth pages (zero critical violations enforced)
- Storybook stories + vitest for UI components — covers all PixelOwl states, WelcomeTour steps, back navigation, full walkthrough

## CI/CD

Three GitHub Actions workflows chained in sequence after every push to `main`:

```
Deploy → Lighthouse → Lighthouse AI Fix
```

1. **Deploy** — builds and deploys to Cloudflare Workers
2. **Lighthouse** — runs a full audit against the live URL, uploads the JSON + HTML report as a workflow artifact, publishes the HTML to GitHub Pages
3. **Lighthouse AI Fix** — downloads the artifact, reads the performance score, and if it's below 95 calls Gemini 2.5 Flash to generate targeted code fixes and opens a PR automatically

## Deploy

```bash
yarn deploy          # Build + deploy Worker + assets to Cloudflare
yarn db:migrate      # Run schema migrations on D1 (remote)
yarn ingest          # Re-embed docs into Vectorize
yarn ingest:upsert   # Upsert docs (update existing embeddings)
yarn export:docs     # Export docs to a flat format
```

---

## Roadmap

- [x] Phase 1: Landing page + PWA + deploy
- [x] Phase 2: Passkey auth + session management
- [x] Phase 3: RAG AI assistant
- [x] Phase 4: Metrics pipeline
- [x] Phase 5: Playwright E2E + CI/CD
- [x] Phase 6: Storybook + component tests + accessibility enforcement
- [x] Phase 7: Lighthouse CI + Gemini-powered AI fix workflow
- [ ] Phase 8: Math visualizations + interactive demos

---

## Docs

24 chapters of full technical write-ups in [`docs/chapters/`](./docs/chapters/) — covering the full auth system (passkeys, OTP, number matching, step-up auth, recovery), session management, the RAG pipeline, the admin dashboard, endpoint metrics, accessibility, CI/CD pipeline, database migrations, and semantic versioning.

Or just [ask the AI](https://varunr.dev).

---

**Varun Ragunathan** — Staff Software Engineer
[varunr.dev](https://varunr.dev) · [LinkedIn](https://www.linkedin.com/in/varun-ragunathan) · [Email](mailto:ragunathanvarun@gmail.com)
