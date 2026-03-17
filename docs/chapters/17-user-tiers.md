# Chapter 17 — User Tiers and Upgrade Requests

## What You'll Learn

This chapter documents the role-based tier system: the four roles (`user`, `pro`, `student`, `admin`), how upgrade requests flow from submission to approval, how the `allowed_models` table gates access to AI models, how chat rate limiting is differentiated by tier, and how chat personas are customized per role.

---

## 17.1 The Four Roles

Every user has a `role` column in the `users` table, defaulting to `'user'`. The four roles and their intent:

| Role | Chat access | Models | Who has it |
|------|------------|--------|------------|
| `user` | 5 messages / 10 min, 20 / day | Default models only | Everyone by default |
| `pro` | 30 messages / hour, 200 / day | All enabled models | Users who requested and were approved |
| `student` | Same as pro | Same as pro | Students (separate approval track) |
| `admin` | Unlimited | All enabled models | Manually assigned via admin dashboard |

`pro` and `student` have identical rate limits and model access. The distinction exists for tracking purposes — knowing whether a user is a paying professional versus a student who was granted access is useful for future pricing or access decisions.

---

## 17.2 Admin Check: Dual-Path Authorization

Admin status is checked in two ways, combined by `isAdmin`:

```js
// worker/admin.js
export async function isAdmin(session, env) {
  if (!session) return false;
  if (env.ADMIN_EMAIL && session.email === env.ADMIN_EMAIL) return true;
  const user = await env.varun_portfolio_auth
    .prepare('SELECT role FROM users WHERE id = ?')
    .bind(session.userId)
    .first();
  return user?.role === 'admin';
}
```

**`ADMIN_EMAIL` env var:** The email in `wrangler.toml`'s `[vars]` section. This is the bootstrap admin — it has admin access before any D1 record has `role = 'admin'`. Useful for the initial setup where there is no way to promote the first user.

**D1 `role = 'admin'`:** Other users can be promoted to admin via `POST /api/admin/users/:id/make-admin` (which requires a step-up authentication from an existing admin). This allows multiple admins without modifying `wrangler.toml`.

---

## 17.3 Upgrade Requests

Users who want `pro` or `student` access submit a request from their settings page.

**Submission (`POST /api/user/upgrade-request`):**

The user provides an optional note explaining why they want access. A row is inserted into `upgrade_requests` with `status = 'pending'`. A user can only have one pending request at a time — submitting again while pending returns the existing request.

**Admin review:**

- `GET /api/admin/upgrade-requests` — lists all requests, joinable with user email
- `POST /api/admin/upgrade-requests/:id/approve` — sets `status = 'approved'`, updates `users.role` to the requested tier
- `POST /api/admin/upgrade-requests/:id/reject` — sets `status = 'rejected'`

Both approve and reject set `reviewed_at` (current timestamp) and `reviewed_by` (admin's email, from their session).

**The `tier` column:** Requests carry a `tier` field (`'pro'` or `'student'`). This defaults to `'pro'` for backward compatibility with requests made before the student tier was added. The approval handler promotes the user to whichever tier the request specifies.

---

## 17.4 The `allowed_models` Table

Rather than hardcoding which AI models are available, models are managed dynamically in D1:

```sql
CREATE TABLE IF NOT EXISTS allowed_models (
  id       TEXT PRIMARY KEY,
  model_id TEXT NOT NULL UNIQUE,
  label    TEXT NOT NULL,
  tier     TEXT NOT NULL DEFAULT 'pro',
  enabled  INTEGER NOT NULL DEFAULT 1,
  added_at INTEGER NOT NULL
);
```

| Column | Purpose |
|--------|---------|
| `model_id` | The actual model identifier passed to Workers AI or the Anthropic API (e.g., `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, `claude-sonnet-4-6`). |
| `label` | Human-readable name shown in the model picker (e.g., `Llama 3.3 70B Fast`). |
| `tier` | Minimum role required to use this model (`'pro'` means `pro`, `student`, and `admin`). |
| `enabled` | Toggle. `0` means the model is hidden from all users and not selectable even by admins. |
| `added_at` | Unix timestamp. |

**Default models (seeded in `schema.sql`):**

```sql
INSERT OR IGNORE INTO allowed_models (id, model_id, label, tier, enabled, added_at) VALUES
  ('model-llama-70b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'Llama 3.3 70B Fast', 'pro', 1, 0),
  ('model-llama-8b',  '@cf/meta/llama-3.1-8b-instruct',           'Llama 3.1 8B',        'pro', 1, 0),
  ('model-claude',    'claude-sonnet-4-6',                         'Claude Sonnet 4.6',   'pro', 0, 0);
```

Claude Sonnet is seeded but disabled (`enabled = 0`) by default, because it requires an API key that may not be configured.

Admin endpoints for model management:
- `GET /api/admin/models` — list all models
- `POST /api/admin/models` — add a new model
- `PATCH /api/admin/models/:id` — toggle `enabled`

---

## 17.5 Chat Rate Limiting by Tier

Rate limiting is implemented in `worker/rateLimit.js` using KV as the counter store:

```js
// worker/rateLimit.js
const LIMITS = {
  user:    { windowMs: 10 * 60_000,  windowCount: 5,  day: 20  },
  pro:     { windowMs: 3_600_000,    windowCount: 30, day: 200 },
  student: { windowMs: 3_600_000,    windowCount: 30, day: 200 },
  admin:   null,  // unlimited
};
```

**Two KV counters per user:**

1. **Short-window counter** — resets on each new 10-minute (user) or 1-hour (pro/student) window
2. **Daily counter** — resets at UTC midnight

```js
const wKey = `rate:chat:${userId}:w:${winWindow}`;
const dKey = `rate:chat:${userId}:d:${dayWindow}`;
```

`winWindow` is `floor(now / windowMs)` — an integer that uniquely identifies the current window. When the window advances, the key changes and a new counter starts at 0. Old keys expire via TTL (700s for user short window, 7200s for pro/student short window, 90000s for daily).

**Why KV counters instead of D1?** Rate limiting is on the hot path of every chat message. A KV read is a single key lookup with sub-millisecond latency. A D1 query would add 10–50ms of database latency to every message, plus connection overhead. The tradeoff is that KV's eventual consistency means a user under heavy parallel load could occasionally exceed the limit by one or two messages. For a personal portfolio, this is acceptable.

**The rate limit response:**

```js
return { allowed: false, retryAfter, reason: `30 messages per hour` };
```

The `retryAfter` field (seconds until the next window opens) is passed through to the client, which can display a countdown.

---

## 17.6 Chat Personas by Role

Each role has a system prompt ("persona") that shapes how the AI responds to users in that role. Personas are stored in KV under `persona:{role}` with no TTL (permanent):

| KV Key | Role |
|--------|------|
| `persona:user` | Default users |
| `persona:pro` | Pro-tier users |
| `persona:student` | Student-tier users |
| `persona:admin` | Admins |

Admin endpoints:
- `GET /api/admin/personas` — returns `{ user, pro, student, admin }` objects with `systemPrompt` fields
- `PUT /api/admin/personas` — updates one or more persona system prompts

The chat handler (`worker/chat.js`) reads the persona for the authenticated user's role before constructing the AI request. This allows admins to tune the assistant's tone and scope per audience — for example, giving pro users a more technical system prompt while keeping the default user persona conversational.

**Default personas:** If no persona is set in KV for a role, the chat handler falls back to a built-in default system prompt defined in `worker/chat.js`.

---

## 17.7 User-Facing Upgrade Flow

From the user's perspective, the upgrade request flow is:

1. User navigates to Settings → (upgrade section)
2. User selects tier (`pro` or `student`) and optionally writes a note
3. `POST /api/user/upgrade-request` is called — pending request is created
4. User sees a "Request pending" state with the current status
5. Admin reviews in Admin Dashboard → Upgrade Requests tab
6. On approval, user's role is immediately updated in D1
7. Next time the user sends a chat message, the new rate limits and model access apply

`GET /api/user/upgrade-request` lets the frontend poll the current request status so the UI can transition from "pending" to "approved" or "rejected" without requiring a page reload.

---

## Key Takeaways

- Four roles: `user` (default), `pro`, `student`, and `admin`. Pro and student have identical rate limits; the distinction is for tracking purposes.
- Admin check is dual-path: `ADMIN_EMAIL` env var (bootstrap admin) or `role = 'admin'` in D1 (promoted users).
- Upgrade requests flow through `upgrade_requests` table: pending → approved/rejected, with `tier` tracking which tier was requested.
- Models are managed in D1's `allowed_models` table, allowing admins to add, enable, or disable AI models without code changes.
- Rate limiting uses two KV counters per user (short window + daily), keyed by time-window integers that naturally expire as time advances.
- Chat personas are stored in KV under `persona:{role}` and allow per-role system prompt customization from the admin dashboard.
