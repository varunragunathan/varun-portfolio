# varunr.dev — Engineering Portfolio

Staff Software Engineer portfolio showcasing identity & authentication systems architecture at scale.

## Quick Start

```bash
npm install
npm run dev
```

## Architecture

- **React 18** + **Vite** — zero-SSR SPA with code splitting
- **Tailwind CSS** — utility-first, zero runtime
- **Framer Motion** — layout animations (lazy-loaded chunk)
- **PWA** — offline-capable via vite-plugin-pwa + Workbox
- **Cloudflare Pages** — edge CDN, auto-deploy from GitHub

Full architecture document: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Stack Decisions

| Choice | Why |
|--------|-----|
| React over Marko | Proves framework agnosticism (Marko expertise is proven at eBay) |
| Vite over Next.js | No SSR needed — simpler tool for the job |
| Cloudflare over AWS | Zero cold starts, integrated edge stack, best free tier |
| Custom auth (Phase 2) | Demonstrates domain expertise, not API integration |

## Deploy

Connected to Cloudflare Pages. Push to `main` auto-deploys.

```bash
npm run build   # outputs to dist/
```

## Roadmap

- [x] Phase 1: Landing page + PWA + deploy
- [ ] Phase 2: Passkey + TOTP auth demo
- [ ] Phase 3: RAG AI chatbot
- [ ] Phase 4: Math visualizations + games
- [ ] Phase 5: Metrics pipeline
- [ ] Phase 6: Playwright E2E + CI/CD

## Author

**Varun Ragunathan** — Staff Software Engineer  
[LinkedIn](https://www.linkedin.com/in/varun-ragunathan) · [Email](mailto:ragunathanvarun@gmail.com)
