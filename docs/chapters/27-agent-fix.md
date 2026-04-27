# Chapter 27 — Agent Fix Workflow

## What You'll Learn

This chapter documents the automated bug-fixing pipeline. It covers how to file an issue that the agent can act on, how the file discovery algorithm works, the Gemini API call and safety guards, the test gate that prevents bad fixes from reaching a PR, and where each piece of code lives.

---

## 27.1 Overview

The agent fix workflow lets you label any GitHub issue `agent-fix` and have an AI agent attempt to write and test a fix automatically. If the fix passes the full CI suite, a PR is opened for your review. If it fails, the agent comments on the issue explaining what it tried and why it didn't work.

**Cost:** Free. Gemini 2.5 Flash free tier (15 req/min, 1M tokens/day). GitHub Actions free tier (2,000 min/month for private repos; unlimited for public).

```
Issue labeled 'agent-fix'
  └─► GitHub Actions triggers
        └─► scripts/agent-fix.js
              ├─ discovers relevant source files
              ├─ calls Gemini Flash → JSON fixes
              ├─ applies fixes with safety guards
              └─ sets has_changes=true / false
                    │
                    ├─ has_changes=true
                    │     └─► yarn lint
                    │           └─► yarn test:storybook
                    │                 └─► yarn test (Playwright)
                    │                       ├─ all pass → commit + push + gh pr create
                    │                       └─ any fail → push branch + comment why
                    │
                    └─ has_changes=false
                          └─► comment on issue with explanation
```

---

## 27.2 How to File an Effective Issue

The agent's fix quality depends directly on how much context the issue provides. The file discovery algorithm searches for symbol names and file paths mentioned in the issue text — the more specific, the better.

**Effective issue body:**

```
The `EvalTrendChart` component in `src/pages/Admin.jsx` does not render
when there is only one run in history. The condition `runs.length < 2`
returns null, but it should show a single data point.

Expected: chart renders with a single run
Actual: nothing renders
```

**Less effective:**

```
The eval chart doesn't show up sometimes
```

**Tips:**

- Name the exact component, function, or hook (e.g. `clearHistory`, `EvalTrendChart`)
- Include the file path if you know it (e.g. `worker/evals.js`)
- Paste the specific error message or stack trace
- Describe expected vs actual behaviour

---

## 27.3 File Discovery Algorithm

The script scores candidate files by how many signals from the issue point to them.

**Signal 1 — explicit file paths (weight: 10)**
Any text matching `*.js`, `*.jsx`, `*.css`, `*.toml` is treated as a potential path. The script checks that path, plus `src/`, `worker/`, `src/pages/`, and `src/components/` prefixes.

**Signal 2 — PascalCase names (weight: 1 per grep hit)**
Every `PascalCase` token longer than 3 characters (React component names, class names) is grepped across `src/` and `worker/`.

**Signal 3 — camelCase names (weight: 1 per grep hit)**
Every `camelCase` token longer than 5 characters (function names, variable names) is grepped, excluding common JS keywords.

Files are ranked by total score. The top 6 are passed to Gemini. Each file is truncated at 400 lines with a note if it exceeds that.

---

## 27.4 The Gemini Call

**Model:** `gemini-2.5-flash` (same as the Lighthouse AI fix workflow)
**Temperature:** 0.1 — low, to favour literal reproduction of existing code patterns
**Response format:** `application/json` — forces structured output

The prompt includes:
- Stack context (React 18, Cloudflare Workers, plain JS)
- The full issue title and body
- All discovered source files, wrapped in code fences
- Strict rules about whitespace fidelity and minimal changes

**Response schema:**

```json
{
  "pr_title": "fix: <description> (closes #N)",
  "summary": "one sentence",
  "explanation": "root cause and why this fix works",
  "fixes": [
    {
      "file": "src/pages/Admin.jsx",
      "description": "what this specific change does",
      "search": "exact verbatim text to find",
      "replace": "replacement text"
    }
  ]
}
```

---

## 27.5 Safety Guards

Before any fix is applied, two checks run — identical to the Lighthouse AI fix workflow:

**1. Search string must exist in the file**
If `fix.search` is not found in the current file content, the fix is skipped and logged as "search string not found in file". This prevents Gemini from applying a fix to code that has since changed.

**2. Search string must be unique**
If `fix.search` appears more than once, the fix is skipped to avoid accidentally changing the wrong occurrence.

Only fixes that pass both checks are written to disk. If zero fixes pass, the script sets `has_changes=false` and comments on the issue with what was attempted.

---

## 27.6 The Test Gate

The workflow runs the full CI suite against the patched files before opening a PR:

| Step | Command | What it checks |
|------|---------|----------------|
| Lint | `yarn lint` | ESLint rules, including React hooks and jsx-a11y |
| Component tests | `yarn test:storybook` | Vitest + Storybook — component rendering and logic |
| E2E tests | `yarn test` | Playwright smoke and axe accessibility tests (Vite dev server auto-started) |

If any step fails, no PR is opened. Instead, the failing branch is pushed under `agent-fix/issue-N` so you can inspect the diff and fix the remaining issue manually. The agent comments on the issue with which step failed.

---

## 27.7 The PR

If all tests pass, the workflow:

1. Deletes any stale `agent-fix/issue-N` branch from a previous attempt
2. Commits the changes with the Gemini-generated title as the commit message
3. Pushes the branch
4. Closes any stale PR for that branch
5. Opens a new PR with a structured body: summary, root cause, per-file change descriptions, a review checklist, and `Closes #N`
6. Posts the PR URL as a comment on the issue

The PR goes through the standard deploy CI on merge — it does not auto-deploy.

---

## 27.8 Re-triggering

Remove and re-add the `agent-fix` label to trigger a fresh attempt on the same issue. The workflow deletes the old branch and PR before creating new ones.

---

## 27.9 Required Secrets

| Secret | Where to get it | Already configured? |
|--------|----------------|---------------------|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key | ✅ Yes (used by Lighthouse AI fix) |
| `GITHUB_TOKEN` | Injected automatically by GitHub Actions | ✅ Yes |

No new secrets are needed if the Lighthouse AI fix workflow is already working.

---

## 27.10 Limitations

- **File discovery is heuristic.** If the issue doesn't name specific components or files, the agent may pick the wrong files and fail to fix anything.
- **Single-pass.** The agent makes one Gemini call and applies what it gets. It does not iterate or debug failing tests.
- **400-line file cap.** Files longer than 400 lines are truncated. This may cause Gemini to miss relevant code in large files like `Admin.jsx`. Naming the specific function or line range in the issue body helps.
- **No new file creation.** The script only edits files it discovered — it won't create new files even if the fix requires one.

---

## 27.11 File Reference

| File | Role |
|------|------|
| `scripts/agent-fix.js` | File discovery, Gemini call, safety-guarded fix application, artifact writing |
| `.github/workflows/agent-fix.yml` | Workflow: trigger, test gate, branch/PR creation, issue comment |
| `docs/chapters/27-agent-fix.md` | This chapter |

Related:
- [Chapter 24 — Lighthouse AI Fix](./24-lighthouse-ai-fix.md) — the workflow this is modelled on
- [Chapter 13 — Deployment](./13-deployment.md) — CI pipeline that runs on the generated PR
