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
account_id = "6207c412bd8462c5dac014004d8abdf4"
compatibility_date = "2025-09-27"
compatibility_flags = ["nodejs_compat"]
main = "worker/index.js"
```

- `name`: The Worker's name in the Cloudflare dashboard. Also used as the default route prefix.
- `account_id`: Your Cloudflare account ID (find in the dashboard sidebar).
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
database_id = "329e850c-713c-49fa-93bc-671ef8ced36d"
```

- `binding`: How the D1 database is accessed in Worker code: `env.varun_portfolio_auth`.
- `database_name`: Human-readable name in the Cloudflare dashboard.
- `database_id`: The unique ID assigned by Cloudflare when the database is created.

```toml
[[kv_namespaces]]
binding = "AUTH_KV"
id = "050acce2056d4c2883fea6f6f3b32ee2"
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

The schema file is `worker/schema.sql`. It uses `CREATE TABLE IF NOT EXISTS` throughout, so re-running it is safe.

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
- `RP_ID` — WebAuthn RP ID
- `ORIGIN` — WebAuthn expected origin

**Secrets (NOT in `wrangler.toml`, configured via dashboard or CLI):**
```bash
npx wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted
```

Secrets are stored encrypted by Cloudflare and available to the Worker as `env.RESEND_API_KEY`. They are never visible in the dashboard or in the Workers source.

**Do not commit secrets.** The `wrangler.toml` in this repository contains only public vars. The `RESEND_API_KEY` is a secret and must be set separately.

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

No GitHub Actions workflow exists in this repository. Deployment is currently manual:

```bash
npm run build && npx wrangler deploy
```

A basic CI/CD pipeline would:
1. On push to `main`: run `npm run build && wrangler deploy`
2. Require `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub secrets
3. Optionally: run `wrangler d1 execute` to apply any schema migrations

Example minimal workflow:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## Key Takeaways

- `new_sqlite_classes` (not `new_classes`) is required for Durable Objects on the Cloudflare free plan.
- `RP_ID` and `ORIGIN` are critical — changing them after users register passkeys invalidates all existing credentials.
- `RESEND_API_KEY` is a secret, set with `wrangler secret put`, never in `wrangler.toml`.
- Local dev requires `.dev.vars` to override `RP_ID=localhost` and `ORIGIN=http://localhost:8787`.
- Deployment is two steps: `npm run build` (Vite) then `wrangler deploy` (uploads Worker + assets).
