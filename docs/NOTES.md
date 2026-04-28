# Miscellaneous Notes & Ops Log

Running log of one-off fixes, dashboard actions, and operational decisions that don't belong in a chapter.

---

## 2026-04-27 — Disabled Cloudflare Workers Builds GitHub integration

**Symptom:** Every push to `main` showed "Some checks were not successful — Workers Builds: varun-portfolio" in GitHub, even though the Deploy workflow succeeded.

**Root cause:** Two deployment systems were running in parallel:
- **GitHub Actions** (`deploy.yml`) — runs `wrangler deploy --env production` ✅
- **Cloudflare Workers Builds** (GitHub App) — runs its own `wrangler deploy` with no `--env` flag, which deploys the dev environment config (RP_ID=localhost) to the production worker ❌

**Fix:** Disabled the Cloudflare GitHub integration.
> Cloudflare Dashboard → Workers & Pages → varun-portfolio → Settings → Builds & Deployments → Disconnect

GitHub Actions is the sole deployment path going forward.
