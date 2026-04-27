# Chapter 13 — Deployment

## What You'll Learn

This chapter covers everything needed to deploy this project: Cloudflare account setup, the `wrangler.toml` walkthrough, D1 schema application, KV and Durable Objects configuration, environment variables, local development, and the specific `new_sqlite_classes` configuration required for Durable Objects on the free plan.

---

## 13.1 Prerequisites

- A Cloudflare account (free tier is sufficient)
- Node.js 18+ installed locally
- `wrangler` CLI: `npm install -g wrangler` or use `npx wrangler`
- A Resend account and API key (for OTP email sending)

---

## 13.2 `wrangler.toml` — Line by Line

The file uses Cloudflare's named environment feature to keep development and production completely separate. The top-level config is the **development environment** (used by `wrangler dev`). The `[env.production]` section is the **production environment** (deployed via `--env production`).

```toml
name = "varun-portfolio-dev"
compatibility_date = "2025-09-27"
compatibility_flags = ["nodejs_compat"]
main = "worker/index.js"
```

- `name`: The default environment deploys to a Worker named `varun-portfolio-dev`. The production environment (below) overrides this to `varun-portfolio`, keeping the real worker name unchanged.
- `compatibility_date`: The Workers runtime behavior snapshot. Do not roll back — this can introduce breaking changes.
- `compatibility_flags = ["nodejs_compat"]`: Enables Node.js-compatible APIs needed by the `resend` npm package.

```toml
[vars]
ENABLE_AUTH = "true"
RP_ID = "localhost"
ORIGIN = "http://localhost:8787"
TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886"
```

These are **development defaults**. `wrangler dev` picks them up automatically — no `.dev.vars` overrides needed for these values. `RP_ID=localhost` allows WebAuthn to work in local dev without any extra config.

```toml
[[kv_namespaces]]
binding = "KV"
id = "..."
preview_id = ""   # fill in after: npx wrangler kv namespace create KV-dev
```

`wrangler dev` (local mode) uses an in-process KV simulation — neither `id` nor `preview_id` is touched. `preview_id` only matters for `wrangler dev --remote` (opt-in remote testing). When left empty, `wrangler dev --remote` falls back to the production `id` — so fill it in if you run remote dev sessions.

```toml
[env.production]
name = "varun-portfolio"

[env.production.vars]
ENABLE_AUTH = "true"
RP_ID = "varunr.dev"
ORIGIN = "https://varunr.dev"
TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886"
```

The production environment explicitly sets `name = "varun-portfolio"` to deploy to the same Worker as before (preventing Cloudflare from creating a new `varun-portfolio-production` Worker). All production bindings are fully declared in `[env.production.*]` sections below this block.

- `RP_ID`: The WebAuthn Relying Party ID. Must be the domain of the site. **Changing this after users have registered passkeys invalidates all existing passkeys.**
- `ORIGIN`: The expected origin for WebAuthn verification. Used in `expectedOrigin()` to validate passkey assertions.

```toml
[assets]
directory = "./dist"
```

Serves the Vite build output as static assets. The Worker falls through to this for all non-`/api/auth/*` requests.

```toml
[[d1_databases]]
binding = "varun_portfolio_auth"
database_name = "varun-portfolio-auth"
database_id = "<YOUR_D1_DATABASE_ID>"
```

- `binding`: How the D1 database is accessed in Worker code: `env.varun_portfolio_auth`.
- `database_name`: Human-readable name in the Cloudflare dashboard.
- `database_id`: The unique ID assigned by Cloudflare when the database is created.

```toml
[[kv_namespaces]]
binding = "KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

- `binding`: How KV is accessed: `env.KV`.
- `id`: The KV namespace ID assigned by Cloudflare.

```toml
[[durable_objects.bindings]]
name = "NUM_MATCH_DO"
class_name = "NumMatchDO"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["NumMatchDO"]
```

- `name`: How the DO is accessed: `env.NUM_MATCH_DO`.
- `class_name`: Must match the exported class name in the Worker.
- `new_sqlite_classes`: **Critical for free plan.** The free plan requires `new_sqlite_classes` instead of `new_classes`. Using `new_classes` on the free tier results in a deployment error.

---

## 13.3 Creating the D1 Database

```bash
# Create the database
npx wrangler d1 create varun-portfolio-auth

# Copy the database_id from the output and put it in wrangler.toml

# Apply the schema to production
npx wrangler d1 execute varun-portfolio-auth --remote --file=worker/schema.sql

# Apply the schema for local dev
npx wrangler d1 execute varun-portfolio-auth --local --file=worker/schema.sql
```

The schema file is `worker/schema.sql`. It uses `CREATE TABLE IF NOT EXISTS` throughout, so re-running it is safe **on a fresh database only**. To apply schema changes to an existing production database, use the migration files in `worker/migrations/`. See [Chapter 22 — Database Migrations](./22-database-migrations.md) for the full migration history and instructions.

---

## 13.4 Creating the KV Namespace

```bash
# Create the production namespace
npx wrangler kv namespace create KV
# → copy the id into [[env.production.kv_namespaces]] id = "..."

# Create the dev namespace (for wrangler dev --remote isolation)
npx wrangler kv namespace create KV-dev
# → copy the id into [[kv_namespaces]] preview_id = "..."
```

`wrangler dev` (local mode, the default) uses an in-process simulation — no cloud namespace is accessed. The `preview_id` only matters if you explicitly run `wrangler dev --remote`.

---

## 13.5 Durable Objects — The `new_sqlite_classes` Requirement

This was a real deployment issue. When deploying a Worker with a Durable Object class for the first time, Cloudflare requires a migration. There are two migration types:

- `new_classes = ["NumMatchDO"]` — uses the older, non-SQLite-backed DO storage
- `new_sqlite_classes = ["NumMatchDO"]` — uses SQLite-backed DO storage (recommended for new DOs)

On the Cloudflare free tier (as of late 2024), `new_classes` produces a deployment error because the account does not have access to the required DO infrastructure. The fix is to use `new_sqlite_classes`.

The `NumMatchDO` implementation does not actually use DO SQLite storage — it uses in-memory state and KV as a fallback. But the migration type `new_sqlite_classes` still works correctly; it just uses a different underlying storage engine for the DO instance metadata.

If you see an error like:
```
Error: Creating Durable Objects with `new_classes` is not supported on your plan.
```
Switch to `new_sqlite_classes` in the `[[migrations]]` section.

---

## 13.6 Environment Variables and Secrets

**Public vars** are committed in `wrangler.toml` — separate blocks for dev and production. No action needed for these; they are already set correctly.

**Secrets** are per-environment. All production secrets must be set with `--env production`:

```bash
npx wrangler secret put ADMIN_EMAIL          --env production
npx wrangler secret put RESEND_API_KEY       --env production
npx wrangler secret put TOTP_ENCRYPTION_KEY  --env production
npx wrangler secret put TWILIO_ACCOUNT_SID   --env production
npx wrangler secret put TWILIO_AUTH_TOKEN    --env production
npx wrangler secret put ANTHROPIC_API_KEY    --env production
```

Secrets are stored encrypted by Cloudflare, scoped to their environment, and injected as `env.*`. They are never visible in the dashboard, `wrangler.toml`, or the repository.

For **local development**, copy `.dev.vars.example` to `.dev.vars` and fill in values. Dev secrets (ADMIN_EMAIL, API keys) are read from `.dev.vars` by `wrangler dev`. `.dev.vars` is gitignored. Unlike before, you do not need to set `RP_ID` or `ORIGIN` in `.dev.vars` — they are already `localhost`/`http://localhost:8787` in the default `[vars]` block.

---

## 13.7 Building and Deploying

```bash
# Install dependencies
yarn install

# Local dev (build + wrangler dev)
yarn wd

# Deploy to production
yarn deploy
# equivalent to: yarn build && npx wrangler deploy --env production
```

`yarn build` runs Vite and outputs the React bundle to `dist/`. `wrangler deploy --env production` uploads both the Worker code (`worker/`) and the static assets (`dist/`) under the `[env.production]` configuration — the production KV namespace, production vars, and production D1 binding.

**Never run `npx wrangler deploy` without `--env production` on this project** — it would deploy the dev-configured worker (RP_ID=localhost) to the `varun-portfolio-dev` worker name, not to production.

---

## 13.8 Local Development

```bash
yarn wd
# equivalent to: yarn build && npx wrangler dev
```

`wrangler dev` (local mode) starts a fully isolated local Worker:
- Binds to `http://localhost:8787`
- Uses a local D1 database at `.wrangler/state/v3/d1/` — production D1 is never touched
- Uses in-process KV simulation at `.wrangler/state/v3/kv/` — production KV is never touched
- Simulates Durable Objects locally

**RP_ID and ORIGIN are already correct for local dev.** The default `[vars]` in `wrangler.toml` sets `RP_ID=localhost` and `ORIGIN=http://localhost:8787`. No `.dev.vars` override is needed for these.

**`.dev.vars` is only for secrets.** Copy `.dev.vars.example` → `.dev.vars` and fill in your actual keys (ADMIN_EMAIL, RESEND_API_KEY, etc.). These are picked up automatically by `wrangler dev`.

**The origin flexibility fix** in `worker/auth/passkey.js`:

```js
function expectedOrigin(request, env) {
  const reqOrigin = request.headers.get('Origin') || '';
  if (reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1')) {
    return reqOrigin;
  }
  return env.ORIGIN;
}
```

In local dev, the origin is taken from the request's `Origin` header rather than `env.ORIGIN`. This works regardless of which port the browser is on.

---

## 13.9 Custom Domain Setup

To deploy at `varunr.dev`:

1. Add `varunr.dev` to Cloudflare (as a zone)
2. In the Cloudflare dashboard, go to Workers & Pages → your Worker → Settings → Triggers
3. Add a custom domain: `varunr.dev`
4. Cloudflare automatically provisions an SSL certificate and routes traffic to the Worker

The Worker handles both the root domain and all subpaths. The `RP_ID = "varunr.dev"` in `wrangler.toml` must match the domain.

---

## 13.10 GitHub Actions / CI-CD

The repository uses three automated GitHub Actions workflows that chain together after every push to `main`:

```
push to main
  └─► Deploy (.github/workflows/deploy.yml)
        └─► Lighthouse (.github/workflows/lighthouse.yml)
              └─► Lighthouse AI Fix (.github/workflows/lighthouse-ai-fix.yml)
```

### Deploy workflow

Triggers on push to `main`. Runs `yarn build && npx wrangler deploy --env production`. Requires two GitHub secrets:

```
CLOUDFLARE_API_TOKEN   — from Cloudflare dashboard → My Profile → API Tokens
CLOUDFLARE_ACCOUNT_ID  — from Cloudflare dashboard → right sidebar
```

### Lighthouse workflow (`.github/workflows/lighthouse.yml`)

Triggers when Deploy completes successfully. Runs Lighthouse against `https://varunr.dev` and:

1. Uploads both the HTML and JSON report as a GitHub Actions artifact (`lighthouse-report-{run_id}`)
2. Publishes the HTML report to the `gh-pages` branch at `/lighthouse/{date}-{sha}.html`
3. Regenerates the report index at `/lighthouse/index.html`, sorted chronologically using `lighthouse/history.json`
4. Appends the four category scores (performance, accessibility, best-practices, seo) to `lighthouse/history.json` and commits it to `main`

Requires `LIGHTHOUSE_PUSH_TOKEN` secret (a GitHub PAT with `repo` scope) to push commits from the bot. Falls back to `GITHUB_TOKEN` if not set, but the fallback cannot trigger downstream workflows.

### Known gap: authenticated home page is not measured

The Lighthouse workflow runs without a session cookie — it always hits the unauthenticated `GuestView`. The signed-in home page (ParticleField, timeline, WelcomeTour, ChatWidget) is never measured in CI.

Automated authenticated Lighthouse is not feasible with passkey auth — passkeys require a biometric gesture that cannot be scripted in a headless runner.

**To measure authenticated performance manually:**
1. Sign in to `varunr.dev` in Chrome
2. Open DevTools → Lighthouse tab
3. Set Mode: Navigation, Device: Desktop (or Mobile)
4. Run — this captures the full signed-in home page including all authenticated components

Signed-in repeat visits benefit from PWA asset caching, so real-world performance for returning users is naturally better than a cold Lighthouse run would suggest.

---

## 13.11 Lighthouse AI Fix Workflow

**File:** `.github/workflows/lighthouse-ai-fix.yml`
**Script:** `scripts/lighthouse-ai-fix.js`

This workflow runs automatically after every Lighthouse run. If the performance score drops below 95, it calls Google Gemini Flash to generate targeted source-code fixes and opens a PR for review.

### Trigger and flow

```
Lighthouse workflow completes
  └─► Read lighthouse/history.json — get latest performance score
        ├─ score ≥ 95: exit (nothing to do)
        └─ score < 95:
              └─► Check if a fix PR already exists for this sha
                    ├─ PR exists: exit (skip duplicate)
                    └─ PR missing:
                          └─► Download Lighthouse JSON artifact
                                └─► node scripts/lighthouse-ai-fix.js
                                      └─► if has_changes=true: create branch + open PR
```

### `scripts/lighthouse-ai-fix.js` — how it works

**1. Reads the Lighthouse JSON report** (`lh-report.json`) and extracts all failing audits (score < 0.9) that are in the `ACTIONABLE` set:

```js
const ACTIONABLE = new Set([
  'render-blocking-resources', 'unused-javascript', 'unused-css-rules',
  'modern-image-formats', 'uses-optimized-images', 'uses-responsive-images',
  'uses-text-compression', 'uses-rel-preconnect', 'uses-rel-preload',
  'font-display', 'largest-contentful-paint-element', 'lcp-lazy-loaded',
  'prioritize-lcp-image', 'total-blocking-time', 'bootup-time',
  'dom-size', 'critical-request-chains', 'preload-fonts',
]);
```

Only audits in this set map to actionable source-code changes. Runtime-only issues (server response time, third-party scripts) are excluded.

**2. Selects relevant source files** per audit ID:

```js
const AUDIT_FILES = {
  'render-blocking-resources':        ['index.html'],
  'unused-javascript':                ['vite.config.js'],
  'largest-contentful-paint-element': ['src/pages/Home.jsx', 'index.html'],
  'lcp-lazy-loaded':                  ['src/pages/Home.jsx'],
  'uses-rel-preconnect':              ['index.html'],
  'font-display':                     ['index.html', 'src/index.css'],
  // ...
};
```

**3. Builds a structured prompt** with the tech stack, failing audit details (title, score, measured value, top offenders), and the full content of each relevant source file.

**4. Calls Gemini 2.5 Flash** (`generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`) with `responseMimeType: 'application/json'` to get structured output:

```json
{
  "summary": "one-line summary of all changes",
  "fixes": [
    {
      "audit": "audit-id",
      "file": "path/to/file",
      "description": "what this change does and expected impact",
      "search": "exact verbatim text to find",
      "replace": "replacement text"
    }
  ]
}
```

**5. Applies fixes** with two safety guards:
- The `search` string must exist in the file (otherwise skipped)
- The `search` string must be unique (otherwise skipped, to avoid partial replacements)

**6. Writes a PR body** to `/tmp/pr-body.md` with the score, applied changes, skipped changes, and a review checklist.

**7. Sets `has_changes=true`** in `GITHUB_OUTPUT` if at least one fix was applied. The workflow step then creates a branch (`lighthouse/ai-fix-{sha}`) and opens a PR.

### Required GitHub secrets

| Secret | Where to get it | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | aistudio.google.com → Get API key → Create API key | Gemini Flash API calls |
| `LIGHTHOUSE_PUSH_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens → `repo` scope | Allows bot to push branches and open PRs |

**To add a secret:** GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

### Getting the Gemini API key

1. Go to **aistudio.google.com**
2. Click **"Get API key"** in the left sidebar
3. Click **"Create API key"** and select a project
4. Copy the key — this is all that's needed (no service account or IAM roles required)

The free tier provides 15 requests/minute and 1M tokens/day — more than sufficient for this workflow.

### Reviewing AI-generated PRs

The workflow opens a PR titled `perf: AI performance fixes — Lighthouse {score}/100 → target 95+`. The PR body includes:

- The Gemini-generated summary
- Each changed file with a description of what changed and which audit it fixes
- Any fixes that were skipped and why (search string not found, not unique, etc.)
- A review checklist

**Always review the diff before merging.** The AI constrains itself to the files shown in the prompt (`index.html`, `vite.config.js`, `src/pages/Home.jsx`, `src/index.css`) and is instructed not to change component logic, routing, or functionality — but human review is the final gate.

### Duplicate PR guard

The workflow checks whether a PR already exists for the current commit SHA (branch name `lighthouse/ai-fix-{sha}`). If a PR is already open, the workflow exits early — preventing duplicate PRs on re-runs.

---

## Key Takeaways

- **Two environments, one file.** The default `wrangler.toml` config is dev (safe localhost values). `[env.production]` holds all production config. Deploy with `--env production`; develop without it.
- **Never `wrangler deploy` without `--env production`** — it would push dev config (RP_ID=localhost) to the wrong worker name.
- **Secrets are per-environment.** Always use `npx wrangler secret put KEY --env production` for production secrets. Dev secrets go in `.dev.vars`.
- **Local dev never touches production data.** `wrangler dev` uses in-process KV and local SQLite — no cloud resources are accessed.
- `new_sqlite_classes` (not `new_classes`) is required for Durable Objects on the Cloudflare free plan.
- `RP_ID` and `ORIGIN` are critical — changing them after users register passkeys invalidates all existing credentials.
- `account_id` is optional in `wrangler.toml` — wrangler infers it from your auth token.
- Three GitHub Actions chain together: Deploy → Lighthouse → Lighthouse AI Fix. Each triggers only when the previous one succeeds.
- `LIGHTHOUSE_PUSH_TOKEN` (GitHub PAT, `repo` scope) is required for the Lighthouse bot to push commits. `GEMINI_API_KEY` (from aistudio.google.com) is required for the AI fix workflow.
