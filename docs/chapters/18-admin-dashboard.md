# Chapter 18 — Admin Dashboard

## What You'll Learn

This chapter documents the admin dashboard: who can access it, how access is verified, and what each of the six tabs does. It also covers the data queries behind the Metrics and Endpoints tabs, which aggregate D1 data across all users.

---

## 18.1 Access Control

The admin dashboard lives at `/admin` in the React SPA. The route itself is not protected at the network level — any URL is reachable by a browser. Instead, access is enforced by the backend: every admin API call returns 403 if the caller is not admin.

The frontend detects non-admin access during the initial load:

```js
// src/pages/Admin.jsx
useEffect(() => {
  if (!user) return;
  fetch('/api/admin/upgrade-requests', { credentials: 'include' })
    .then(r => {
      if (r.status === 403) navigate('/');  // redirect non-admins to home
      else setAuthChecked(true);
    })
    .catch(() => navigate('/'));
}, [user, navigate]);
```

A 403 from any admin endpoint causes an immediate redirect to `/`. The admin check itself uses dual-path authorization — see [Chapter 17, Section 17.2](./17-user-tiers.md) for how `isAdmin` works.

---

## 18.2 Tab Overview

The dashboard has six tabs:

| # | Tab | Purpose |
|---|-----|---------|
| 0 | Metrics | Platform-wide health snapshot: users, auth, chat, upgrade requests |
| 1 | Upgrade Requests | Review pending tier upgrade requests |
| 2 | Users | List all users, assign admin role |
| 3 | Models | Add, enable, or disable AI models |
| 4 | Personas | Edit the system prompt for each user role |
| 5 | Endpoints | API and page navigation request metrics |

---

## 18.3 Tab: Metrics

The Metrics tab calls `GET /api/admin/metrics`, which executes 16 D1 queries in a single batch and returns a snapshot. The batch design matters: D1 has per-request latency overhead, so bundling all queries into one `db.batch([...])` call reduces latency from O(16) round trips to O(1).

**Users section:**
- Total users
- New users today, this week, and the prior week (for week-over-week comparison)
- Breakdown by role (`user`, `pro`, `student`, `admin`)

**Auth adoption:**
- Passkey users (distinct users with at least one credential in `passkey_creds`)
- TOTP-enabled users
- Active sessions in the last 7 days (distinct users with a non-expired session touched this week)
- Sign-ins by method: passkey/OTP (`login`), TOTP (`totp_signin`), recovery code (`recovery_signin`)
- Failed auth attempts: failed recovery sign-in, failed recovery codes, account freezes

**Chat:**
- Total conversations and messages
- Messages today and this week
- Average messages per conversation

**Upgrade requests:**
- Counts by status: pending, approved, rejected
- Approval rate percentage
- Breakdown by tier (pro vs student)

**Recent events feed:**
The last 20 security events across all users, joined with user email, showing event type, timestamp, IP, and device name. This is the first place to look when something unusual happens.

---

## 18.4 Tab: Upgrade Requests

Lists all tier upgrade requests with filtering by status (all / pending / approved / rejected). Each row shows:
- User email
- Requested tier (pro / student) shown as a colored badge
- Request status badge
- Optional note from the user
- Timestamp

Pending requests have Approve and Reject buttons. Approving:
1. Calls `POST /api/admin/upgrade-requests/:id/approve`
2. Sets the request `status = 'approved'` and `reviewed_at = now`, `reviewed_by = adminEmail`
3. Updates `users.role` to the requested tier

Rejecting sets `status = 'rejected'` without changing the user's role.

---

## 18.5 Tab: Users

Lists all users (up to 200, ordered by creation date descending). Each row shows:
- Email (masked: `v***@gmail.com`)
- Role badge
- Account creation date

Users with `role = 'user'` have a "Make Admin" button. Clicking it triggers a step-up authentication flow — the admin must re-authenticate with their passkey before the promotion is applied. This prevents a stolen admin session from being used to silently promote accounts.

```js
// worker/admin.js — makeAdminUser
const { stepUpToken } = await request.json().catch(() => ({}));
const valid = await consumeStepUpToken(env.AUTH_KV, stepUpToken, session.userId);
if (!valid) return json({ error: 'Step-up required' }, 403);

await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind('admin', userId).run();
```

Step-up tokens are 2-minute single-use KV entries. See [Chapter 10](./10-step-up-authentication.md).

---

## 18.6 Tab: Models

Displays all rows from the `allowed_models` table. Each model shows:
- Model ID (the technical identifier, e.g., `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- Label (human-readable, shown in the chat model picker)
- Tier requirement
- Enabled toggle

The enabled toggle calls `PATCH /api/admin/models/:id` and immediately flips the model's availability without any deployment. This is useful for disabling a model that is behaving unexpectedly or enabling a new Claude model as soon as its API key is configured.

Adding a new model calls `POST /api/admin/models` with `{ modelId, label, tier }`. The model becomes available to users with the specified tier immediately.

---

## 18.7 Tab: Personas

Shows a text area for each of the four roles: `user`, `pro`, `student`, `admin`. Each text area contains the current system prompt stored in KV under `persona:{role}`.

Saving calls `PUT /api/admin/personas` with the updated prompts. The handler writes each non-empty value to KV with no TTL (permanent):

```js
// worker/admin.js — updatePersonas
for (const role of ['user', 'pro', 'student', 'admin']) {
  if (body[role]?.systemPrompt !== undefined) {
    await env.AUTH_KV.put(`persona:${role}`, JSON.stringify({ systemPrompt: body[role].systemPrompt }));
  }
}
```

Changes take effect immediately for all subsequent chat requests. There is no cache to invalidate — the chat handler reads from KV on every request.

---

## 18.8 Tab: Endpoints

The Endpoints tab is the operational observability layer. It calls `GET /api/admin/endpoint-metrics` and presents request volume data collected since the logging middleware was deployed (v0.2.9).

**Data collection:** Every incoming request to the Worker is logged to `endpoint_logs` in D1, asynchronously via `ctx.waitUntil` so logging never adds latency to the response. Paths are normalized before storage — UUID-like segments are replaced with `:id` so that `/api/chat/conversations/abc123` and `/api/chat/conversations/xyz789` are counted together as `/api/chat/conversations/:id`. Page navigations (SPA routes like `/`, `/chat`, `/admin`) are also logged; static assets (`.js`, `.css`, `.png`) are excluded.

**Aggregate trend chart:** A custom SVG line chart with two series (total requests and errors) over either the last 24 hours (hourly buckets) or the last 7 days (daily buckets). The toggle is a client-side filter — both datasets are fetched on load.

**Group breakdown cards:** Four cards grouping endpoints by prefix:

| Card | Prefix |
|------|--------|
| Auth | `/api/auth/` |
| Chat | `/api/chat` |
| Admin | `/api/admin/` |
| User | `/api/user/` |

Each card shows total requests, unique endpoint count, and error percentage for the last 7 days.

**Per-endpoint table:** Every distinct `(method, path)` combination seen in the last 7 days, sorted by total volume. Columns: method badge (color-coded), normalized path, total, error percentage, 7-day sparkline (one bar per day), last-seen time. The left border is color-coded by group (purple for auth, green for chat, amber for admin, orange for user).

**The `endpoint_logs` table:**

```sql
CREATE TABLE IF NOT EXISTS endpoint_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,  -- normalized: UUIDs → :id
  status     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

See [Chapter 20](./20-endpoint-metrics.md) for the full logging middleware documentation.

---

## Key Takeaways

- Access is enforced backend-first: all admin endpoints return 403 for non-admins. The frontend detects this and redirects to home.
- The Metrics tab uses a single `db.batch([])` call for all 16 queries — one round trip instead of 16.
- Model availability is managed dynamically in D1 — no code changes needed to add or toggle models.
- Personas are stored in KV with no TTL; changes take effect for the next chat request.
- The Endpoints tab provides request volume observability over the last 7 days, with normalized path grouping and per-endpoint sparklines.
- Promoting a user to admin requires step-up authentication to prevent session-hijacking escalation.
