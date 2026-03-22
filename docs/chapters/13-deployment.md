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

```toml
name = "varun-portfolio"
compatibility_date = "2025-09-27"
compatibility_flags = ["nodejs_compat"]
main = "worker/index.js"
```

- `name`: The Worker's name in the Cloudflare dashboard. Also used as the default route prefix.
- `account_id`: Not required — wrangler infers it from your auth token. You may add it explicitly if you manage multiple Cloudflare accounts: `account_id = "<YOUR_CLOUDFLARE_ACCOUNT_ID>"`.
- `compatibility_date`: The Workers runtime behavior snapshot. Set this to a recent date when creating a new project to get all current features. Do not roll it back — this can introduce breaking changes.
- `compatibility_flags = ["nodejs_compat"]`: Enables Node.js-compatible APIs needed by the `resend` npm package.
- `main = "worker/index.js"`: The Worker entry point.

```toml
[vars]
ENABLE_AUTH = "true"
RP_ID = "varunr.dev"
ORIGIN = "https://varunr.dev"
```

- `ENABLE_AUTH`: Feature flag. Set to `"false"` to disable all auth routes (returns 404). Safe for deploying the portfolio without auth functionality.
- `RP_ID`: The WebAuthn Relying Party ID. Must be the domain of the site. Must match the domain set during passkey registration. **Changing this after users have registered passkeys invalidates all existing passkeys.**
- `ORIGIN`: The expected origin for WebAuthn verification. Must be `https://{your-domain}` in production. Used in `expectedOrigin()` to validate passkey assertions.

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
binding = "AUTH_KV"
id = "<YOUR_KV_NAMESPACE_ID>"
```

- `binding`: How KV is accessed: `env.AUTH_KV`.
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
# Create the KV namespace
npx wrangler kv namespace create AUTH_KV

# Copy the id from the output and put it in wrangler.toml
```

For local dev, `wrangler dev` automatically creates a local KV store. You don't need to create a separate namespace for development.

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

**Public vars (in `wrangler.toml`):**
- `ENABLE_AUTH` — feature flag
- `RP_ID` — WebAuthn RP ID (your domain)
- `ORIGIN` — WebAuthn expected origin (your domain)
- `TWILIO_WHATSAPP_FROM` — WhatsApp sandbox from-number (not a secret)

**Secrets (set once via CLI, never committed):**
```bash
wrangler secret put ADMIN_EMAIL          # admin account email
wrangler secret put RESEND_API_KEY       # from resend.com
wrangler secret put TOTP_ENCRYPTION_KEY  # openssl rand -hex 32
wrangler secret put TWILIO_ACCOUNT_SID   # from console.twilio.com
wrangler secret put TWILIO_AUTH_TOKEN    # from console.twilio.com
```

Secrets are stored encrypted by Cloudflare and injected into the Worker as `env.*`. They are never visible in the dashboard, in `wrangler.toml`, or in the repository.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in real values. `.dev.vars` is gitignored.

---

## 13.7 Building and Deploying

```bash
# Install dependencies
npm install

# Build the React frontend
npm run build

# Build + deploy to Cloudflare
npx wrangler deploy
```

`npm run build` runs Vite and outputs the React bundle to `dist/`. `wrangler deploy` then uploads both the Worker code (`worker/`) and the static assets (`dist/`) to Cloudflare.

The `package.json` includes a convenience script:
```json
"wd": "npm run build && npx wrangler dev"
```
This builds and starts the local dev server in one command.

---

## 13.8 Local Development

Local dev uses `wrangler dev`:

```bash
npm run wd
# or: npm run build && npx wrangler dev
```

`wrangler dev` starts a local Worker that:
- Binds to a local port (typically `http://localhost:8787`)
- Uses a local D1 database (`.wrangler/state/v3/d1/`)
- Uses local KV (`.wrangler/state/v3/kv/`)
- Simulates Durable Objects locally

**The local origin problem and fix:**

When running locally, the Worker serves at `http://localhost:8787` (or a different port — wrangler dev picks an available port). The Vite dev server runs at `http://localhost:5173`. These are different origins.

For WebAuthn, the `expectedOrigin` must match the origin in the authenticator data. The fix in `worker/auth/passkey.js`:

```js
function expectedOrigin(request, env) {
  const reqOrigin = request.headers.get('Origin') || '';
  if (reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1')) {
    return reqOrigin;
  }
  return env.ORIGIN;
}
```

In local dev, the origin is taken from the request's `Origin` header. This works regardless of which port wrangler dev chose.

**The RP_ID in local dev:**

WebAuthn's `rpID` must match the effective domain. `varunr.dev` cannot be used locally (the browser won't match it). For local development, you need to either:

1. Use `localhost` as the `rpID` — requires overriding the env var locally
2. Use a `.dev.vars` file (the local equivalent of `wrangler.toml` vars for local dev):

```
# .dev.vars (not committed, gitignored)
RP_ID=localhost
ORIGIN=http://localhost:8787
RESEND_API_KEY=re_your_key_here
```

Then run `wrangler dev` — it will read `.dev.vars` for local environment variables.

**Note:** `.dev.vars` is not committed to the repository. Add it to `.gitignore`.

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

Triggers on push to `main`. Runs `npm run build && wrangler deploy`. Requires two GitHub secrets:

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

**4. Calls Gemini 2.0 Flash Lite** (`generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent`) with `responseMimeType: 'application/json'` to get structured output:

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

- `new_sqlite_classes` (not `new_classes`) is required for Durable Objects on the Cloudflare free plan.
- `RP_ID` and `ORIGIN` are critical — changing them after users register passkeys invalidates all existing credentials.
- Five secrets must be set via `wrangler secret put` before the Worker will function: `ADMIN_EMAIL`, `RESEND_API_KEY`, `TOTP_ENCRYPTION_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
- `account_id` is optional in `wrangler.toml` — wrangler infers it from your auth token.
- Local dev requires `.dev.vars` (copy from `.dev.vars.example`) to override `RP_ID=localhost` and `ORIGIN=http://localhost:8787`.
- Deployment is two steps: `npm run build` (Vite) then `wrangler deploy` (uploads Worker + assets).
- Three GitHub Actions chain together: Deploy → Lighthouse → Lighthouse AI Fix. Each triggers only when the previous one succeeds.
- `LIGHTHOUSE_PUSH_TOKEN` (GitHub PAT, `repo` scope) is required for the Lighthouse bot to push commits. `GEMINI_API_KEY` (from aistudio.google.com) is required for the AI fix workflow.
