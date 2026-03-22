# Chapter 24 — Semantic Versioning in App Development

## What You'll Learn

This chapter covers what semantic versioning is, why it was designed for libraries, and how the same discipline applies meaningfully to deployed applications — even when there are no downstream consumers.

---

## 24.1 What Semantic Versioning Is

Semantic versioning (SemVer) defines version numbers in the format `MAJOR.MINOR.PATCH`:

| Segment | Incremented when |
|---|---|
| `MAJOR` | Breaking changes — something previously working stops working |
| `MINOR` | New functionality added in a backward-compatible way |
| `PATCH` | Backward-compatible bug fixes |

The canonical spec is at [semver.org](https://semver.org). It was designed primarily for **libraries and packages** where downstream consumers need to know whether upgrading will break their code.

This project is currently on `v0.2.x`, meaning it is in initial development — public API not yet stable.

---

## 24.2 Why It Still Makes Sense for Apps

The common objection: "My app has no consumers — who is semver for?"

The answer is that versioning is not just a contract with consumers. It is a **communication tool** with three audiences:

**1. Your future self**
A version bump in the git log immediately signals the nature of a change without reading the diff. `v0.2.44 → v0.2.45` (docs only) tells a different story than `v0.2.46 → v0.3.0` (new auth method).

**2. Debugging and rollback**
When a production issue is reported, "this started at v0.2.51" is a precise anchor. Combined with `git log`, you can identify the exact commit range to examine. Without version discipline, you're correlating timestamps with deploy logs.

**3. Users and stakeholders**
The version badge in the footer (`v0.2.54`) gives users a concrete reference when reporting bugs. "I saw this on v0.2.51" is unambiguous. "I saw this last Tuesday" is not.

---

## 24.3 How This Project Uses Versioning

Every commit that is pushed to `main` increments the version in `package.json`. The version is displayed in the site footer via the `VersionBadge` component.

**Increment rules used in practice:**

| Change type | Version bump | Examples |
|---|---|---|
| Bug fix | `PATCH` | Contrast fix, incorrect company name, broken model name |
| New feature | `MINOR` | Welcome tour, Lighthouse AI workflow, PWA update prompt |
| Docs only | `PATCH` | Chapter updates, gap documentation |
| Performance | `PATCH` | Lazy loading, chunk splitting |
| Breaking change to auth/data | `MAJOR` | Would invalidate existing passkeys or sessions |

**The `MAJOR` threshold for an app:**
Since there are no library consumers, a breaking change means something that affects **existing users' data or sessions** — changing `RP_ID` (invalidates all passkeys), dropping a D1 table column, or changing the session token format. Anything that would require users to re-register or lose access triggers `MAJOR`.

---

## 24.4 The `v0.x` Convention

This project intentionally stays at `v0.x` because:

- The public API (auth endpoints, session format) is not yet frozen
- Features are still being added at a pace that would make `v1.0` premature
- `v0.MINOR.PATCH` still provides all the communication benefits — you just signal that stability is not guaranteed

When to move to `v1.0`:
- Auth API is stable and will not change without a major version bump
- The core feature set is complete
- You are confident in backward compatibility going forward

---

## 24.5 Versioning as a Forcing Function

The requirement to bump the version before every push has a useful side effect: it forces a moment of classification. Before committing, you must decide:

> *Is this a fix, a feature, or something that breaks existing behavior?*

That decision shapes the commit message, the PR description, and how carefully you test before pushing. A `MAJOR` bump triggers more scrutiny than a `PATCH`. This is the real value of versioning discipline in app development — not the number itself, but the thinking it enforces at commit time.

---

## 24.6 Practical Conventions

**Always bump before pushing, never after.**
The version in the footer must match the deployed code. Bumping after a push creates a window where the live version is wrong.

**One bump per push, not per commit.**
If you make several commits locally before pushing, bump once for the entire changeset. The version represents the deployed state, not individual commits.

**Ask before bumping `MAJOR`.**
Because `MAJOR` signals a breaking change to users or data, it warrants a deliberate decision — not an automatic increment. For this project, the rule is: minor and patch are automatic; major requires explicit confirmation.

**Version in `package.json` is the source of truth.**
The `VersionBadge` component reads the version at build time from `package.json`. There is no separate version file, no env var, no runtime config. One source, one place to update.

---

## Key Takeaways

- Semantic versioning is not only for libraries — it provides commit-level communication, debugging anchors, and user-facing references for any deployed system.
- `MAJOR.MINOR.PATCH`: breaking changes / new features / fixes.
- The `v0.x` range signals active development with no stability guarantee. Move to `v1.0` when the core API is frozen.
- A `MAJOR` bump in an app means something that breaks existing user data or sessions — passkey RP_ID changes, schema drops, session format changes.
- The forced classification at commit time is the real benefit: it makes you think about what kind of change you are shipping.
