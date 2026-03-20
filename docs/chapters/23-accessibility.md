# Chapter 23 — Accessibility

## What You'll Learn

This chapter covers the three-layer accessibility system: static analysis at development time with ESLint and `jsx-a11y`, runtime WCAG scanning on every pre-push run with `axe-core/playwright`, and post-deploy performance and accessibility trend tracking with Lighthouse CI. It explains why each layer is positioned where it is, what each one catches, and what was found and fixed during the initial setup.

---

## 23.1 Why Three Layers

A single accessibility check at one point in the pipeline catches one class of problem. The issues compound: a static linter catches structural anti-patterns (missing labels, wrong roles, autoFocus misuse) before the code ever runs; a runtime scanner catches contrast failures and focus-order problems that only appear when the DOM is live; a post-deploy scanner catches real-world regressions against the production URL, with trend data to detect gradual degradation.

| Layer | Tool | When it runs | What it catches |
|---|---|---|---|
| 1 | `eslint-plugin-jsx-a11y` | `yarn lint` (dev time) | Missing labels, wrong ARIA roles, autoFocus misuse, static element interactions, non-interactive tabIndex |
| 2 | `@axe-core/playwright` | `yarn test` (pre-push hook) | WCAG 2.0 AA violations in the live DOM: contrast, keyboard traps, landmark structure |
| 3 | Lighthouse CI | GitHub Actions post-deploy | Performance, accessibility, best practices, SEO scores against production URL; trend history in-repo |

---

## 23.2 Layer 1 — ESLint with jsx-a11y

### Setup

ESLint is configured in `eslint.config.js` (flat config format, required for ESLint v9+ and compatible with `"type": "module"` in `package.json`):

```js
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // React 17+ new JSX transform — no need to import React for JSX
      'no-unused-vars': ['error', { varsIgnorePattern: '^React$', argsIgnorePattern: '^_' }],
      // react-hooks v7 new rule — too aggressive for timer/async patterns; downgrade to warn
      'react-hooks/set-state-in-effect': 'warn',
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
];
```

Run it:

```bash
yarn lint
```

### Key configuration decisions

**`varsIgnorePattern: '^React$'`** — In React 17+ the new JSX transform (`@vitejs/plugin-react`) means `import React from 'react'` is not needed for JSX syntax. Components still import React in some files for legacy reasons. Without this pattern, ESLint reports `React is defined but never used` across every file that hasn't been cleaned up yet.

**`react-hooks/set-state-in-effect: 'warn'`** — React-hooks plugin v7 introduced this rule, which fires when `setState` is called from an `async` callback or `setTimeout` inside a `useEffect`. This is a common and accepted pattern for data-fetching effects and animation loops (see `useAnimations.js`). Downgraded to `warn` so it's visible without blocking development.

**`react-hooks` plugin required for inline disable comments** — `Chat.jsx` contains a `// eslint-disable-line react-hooks/exhaustive-deps` comment. ESLint validates that referenced rules exist even when they are being disabled. Without the plugin loaded, ESLint itself errors on the unknown rule reference.

### What jsx-a11y enforces

The `jsx-a11y/recommended` ruleset covers the most common structural mistakes:

| Rule | What it prevents |
|---|---|
| `jsx-a11y/no-autofocus` | `autoFocus` prop — moves focus unexpectedly for screen reader users |
| `jsx-a11y/click-events-have-key-events` | `onClick` on non-interactive elements without a keyboard equivalent |
| `jsx-a11y/no-static-element-interactions` | Event handlers on `div`, `span` etc. without a `role` |
| `jsx-a11y/label-has-associated-control` | `<label>` not associated with its input via `htmlFor` or nesting |
| `jsx-a11y/no-noninteractive-tabindex` | `tabIndex` on elements that are not interactive (no action to perform) |

### Known pre-existing violations

When the linter was introduced in v0.2.27, 38 errors were surfaced in pages that had not yet been migrated to the CSS-custom-property approach (`Auth.jsx`, `Security.jsx`, `Admin.jsx`, `Chat.jsx`, `FeedbackWidget.jsx`, `UpgradeModal.jsx`). These files use inline styles and have accumulated patterns the linter now flags. They are the authoritative backlog for future accessibility work.

To see the current violation list:

```bash
yarn lint 2>&1 | grep "error\|warning"
```

---

## 23.3 Layer 2 — axe-core/playwright

### Setup

`@axe-core/playwright` is imported in `tests/e2e/smoke.spec.js`:

```js
import AxeBuilder from '@axe-core/playwright';
```

Two tests scan the home and auth pages on every pre-push run:

```js
function getCritical(violations) {
  return violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
}

test('home page has no critical a11y violations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const critical = getCritical(results.violations);
  if (results.violations.length > critical.length) {
    console.log('Non-critical violations (not blocking):', results.violations
      .filter(v => v.impact !== 'critical' && v.impact !== 'serious')
      .map(v => `[${v.impact}] ${v.id}: ${v.description}`));
  }
  expect(critical).toEqual([]);
});
```

The tests run against the local Vite dev server (`http://localhost:5173`) with `VITE_ENABLE_AUTH=false`, so they see the fully authenticated view of the home page without needing real credentials.

### Severity filter rationale

axe categorises violations by `impact`: `critical`, `serious`, `moderate`, `minor`. The gate blocks only on `critical` and `serious`. `moderate` and `minor` violations are logged to the test output as informational — visible to the developer, but not blocking a push. This avoids the situation where a cosmetic minor issue blocks a fix to an unrelated bug.

WCAG 2.0 AA (`wcag2a` + `wcag2aa` tags) is the target. This is the level required by most accessibility laws and corporate standards.

### What axe catches that ESLint cannot

ESLint analyses JSX source code — it never sees the rendered DOM. axe runs against the live browser:

- **Colour contrast** — computed contrast of rendered text against its actual computed background colour (including opacity, layering, and blending).
- **Focus order** — keyboard tab order matches the visual reading order.
- **ARIA in context** — `aria-labelledby` pointing at IDs that actually exist in the rendered DOM.
- **Dynamic content** — elements that appear after JS runs, not present in source.

### Violation found and fixed during setup

**`.nav__logo-tld` colour contrast failure** — `Nav.css` hardcoded `.dev` to `#6366f1` (indigo). On the dark background (`#08080c`) the contrast ratio is 4.8:1, passing WCAG AA. On the light theme background (`#faf9f7`) the ratio drops to 4.07:1, failing the 4.5:1 minimum.

The fix: a `[data-theme="light"]` override in `Nav.css`:

```css
.nav__logo-tld { color: #6366f1; }
[data-theme="light"] .nav__logo-tld { color: #4338ca; }
```

`#4338ca` (indigo-700) achieves 5.75:1 on `#faf9f7`. The dark theme value is unchanged.

This was caught because Playwright defaults to the system `prefers-color-scheme`. On a macOS machine in light mode, the site initialises in light theme (no stored preference in a fresh Playwright browser context), triggering the contrast failure.

### Another fix: non-interactive tabIndex

`ProjectCard` in `Home.jsx` had `tabIndex={0}` on an `<article>` element with no `onClick` handler. Making an element focusable without providing any keyboard-operable action is an anti-pattern — keyboard users must tab through more elements to reach interactive controls. The `tabIndex` was removed:

```jsx
// before
<article className="project-card" tabIndex={0} aria-label={`Project: ${title}`}>

// after
<article className="project-card" aria-label={`Project: ${title}`}>
```

`<article>` is a semantic landmark and is accessible to screen readers without being in the tab order.

---

## 23.4 Layer 3 — Lighthouse CI

### Workflow

`.github/workflows/lighthouse.yml` runs after every successful deploy:

```yaml
on:
  workflow_run:
    workflows: [Deploy]
    types: [completed]
    branches: [main]

jobs:
  lighthouse:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

The `workflow_run` trigger fires after the `Deploy` workflow (defined in `deploy.yml`) completes. The job only proceeds if the deploy succeeded — no point scoring a broken deployment.

### What it does

1. **Runs `@lhci/cli`** against `https://varunr.dev` — one run per deploy.
2. **Uploads the full HTML report** as a GitHub Actions artifact (30-day retention) under the name `lighthouse-report-{run_id}`.
3. **Appends a score summary** to `lighthouse/history.json` in the main branch.

### Score history format

Each deploy adds one entry:

```json
{
  "date": "2026-03-20",
  "sha": "320e367",
  "performance": 98,
  "accessibility": 100,
  "bestPractices": 100,
  "seo": 90
}
```

The file grows over time as an append-only log:

```json
[
  { "date": "2026-03-20", "sha": "320e367", ... },
  { "date": "2026-03-21", "sha": "abc1234", ... }
]
```

### Preventing deploy loops

`lighthouse/history.json` is committed to the main branch by the Lighthouse workflow bot. Without a guard, this commit would trigger the `Deploy` workflow, which would trigger another Lighthouse run, which would commit again — an infinite loop.

Two safeguards prevent this:

**`paths-ignore` in `deploy.yml`:**
```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'docs/**'
      - 'lighthouse/**'   # ← score commits are ignored
      - '**.md'
      - '.husky/**'
```

**`[skip ci]` in the commit message:**
```bash
git commit -m "chore: lighthouse scores [skip ci]"
```

`[skip ci]` is honoured by GitHub Actions as a secondary stop — any workflow that would otherwise trigger on the push is skipped. `paths-ignore` is the primary guard; `[skip ci]` is belt-and-suspenders.

### Score extraction

The Lighthouse CLI saves full Lighthouse Result (LHR) JSON files to `.lighthouseci/lhr-*.json`. Score extraction is a Node inline script:

```js
const r = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const c = r.categories;
const entry = {
  date: new Date().toISOString().split('T')[0],
  sha: commitSha.slice(0, 7),
  performance:   Math.round(c.performance.score * 100),
  accessibility: Math.round(c.accessibility.score * 100),
  bestPractices: Math.round(c['best-practices'].score * 100),
  seo:           Math.round(c.seo.score * 100),
};
```

Scores are `0–1` floats in the LHR; multiplied by 100 and rounded for readability.

---

## 23.5 Running the Layers

| Goal | Command |
|---|---|
| Check for static a11y issues in JSX | `yarn lint` |
| Run the full axe scan + all smoke tests | `yarn test` |
| View test results in the Playwright UI | `yarn test:ui` |
| View Lighthouse score history | `cat lighthouse/history.json` |
| Download a Lighthouse HTML report | GitHub Actions → Lighthouse workflow → Artifacts |

---

## 23.6 CSS Custom Properties and Colour Contrast

The move from inline `style={{}}` to CSS custom properties (covered in Chapter 11) makes colour contrast management significantly easier. All theme tokens — including foreground and background colours — are written to `document.documentElement` as CSS variables on every theme change:

```js
useLayoutEffect(() => {
  const root  = document.documentElement;
  const theme = themes[resolved];
  root.setAttribute('data-theme', resolved);
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--text-1', theme.text1);
  // ...all tokens
}, [resolved]);
```

CSS files use `var(--token)` throughout. The light/dark contrast values are defined once in `src/index.css` and verified there, rather than scattered across dozens of component inline-style objects. axe sees the fully computed values in the browser and flags any token combination that falls below 4.5:1.

---

## 23.7 Semantic Landmarks

HTML landmark elements and ARIA roles are used throughout the app to give screen readers a navigable document structure:

| Landmark | ID / role | Component |
|---|---|---|
| `<nav>` | `id="nav"` | `Nav.jsx` |
| `<main>` | `id="main"` | `App.jsx` |
| `<footer>` | `id="footer"` | `App.jsx` |
| `<header>` | `id="hero"` | `Home.jsx` — Hero section |
| `<section>` | `id="work"` | `Home.jsx` — Projects |
| `<section>` | `id="stats"` | `Home.jsx` — Impact metrics |
| `<section>` | `id="skills"` | `Home.jsx` — Skills |
| `<section>` | `id="philosophy"` | `Home.jsx` — Philosophy |
| `<section>` | `id="timeline"` | `Home.jsx` — Career timeline |
| `<section>` | `id="education"` | `Home.jsx` — Education |
| `<section>` | `id="contact"` | `Home.jsx` — CTA |

All `<section>` elements have an `aria-label` attribute. This is required because unnamed landmark regions are reported as unlabelled by screen readers, providing no navigational context.

`<div role="list">` and `<div role="listitem">` are used on the timeline where the visual structure is a list but `<ul>/<li>` would conflict with the layout requirements.

---

## 23.8 Known Gaps and Future Work

| Area | Status | Notes |
|---|---|---|
| Auth / Security / Admin / Chat pages | 38 ESLint errors (static) | Not yet migrated to CSS custom properties. Issues are `autoFocus`, click handlers on divs, missing label associations. Surfaced by the linter — fix as each page is migrated. |
| Playwright axe scan coverage | Home + Auth only | Chat page (`/chat`) requires auth — cannot be scanned without credentials in the pre-push environment. Lighthouse (Layer 3) covers `/chat` post-deploy. |
| Dark mode axe scan | Not yet | Playwright runs in light mode (system preference). A follow-up could force `prefers-color-scheme: dark` in the Playwright config to scan both themes. |
| Keyboard focus trap in modals | Not validated by axe | The number-matching approval modal and TOTP setup modal should be audited manually for correct focus trapping. |
| `SkipLink` component | Present in the UI | `<SkipLink>` is in `UI.jsx` and links to `#main`. Not yet validated that all screen reader / keyboard combinations correctly surface it. |
