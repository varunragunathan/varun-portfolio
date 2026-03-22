# Chapter 25 — Site Performance Metrics & Lighthouse

## What You'll Learn

This chapter covers why performance measurement belongs in every engineer's workflow, what Lighthouse actually measures and why those metrics were chosen, how this project integrates Lighthouse into CI with an AI-powered fix loop, and — critically — where Lighthouse ends and real performance work begins.

---

## 25.1 Why Performance Is an Engineering Concern, Not a QA Concern

Performance is often treated as something you optimize at the end, when users complain. That framing is wrong in two ways.

**First, it's late.** Performance regressions are far easier to prevent than to fix. A 50 KB JavaScript addition that causes a 200 ms TBT increase is easy to catch at merge time and very hard to track down six months later when the bundle has grown incrementally across 40 PRs.

**Second, it's the wrong owner.** QA can report that a page feels slow. Only an engineer can determine whether the cause is render-blocking CSS, oversized JavaScript, layout shifts from lazy-loaded content, or third-party scripts. Performance is a code-level discipline.

The practical consequences are real:

- **Conversion**: Google found a 0.1s improvement in mobile site speed improved retail conversions by 8.4% and travel site conversions by 10.4%.
- **SEO**: Core Web Vitals (a subset of what Lighthouse measures) are a confirmed Google ranking signal. A poor LCP score is a ranking penalty.
- **Trust**: A layout-shifting page or a button that takes 600 ms to respond feels broken. Users don't distinguish between "slow" and "buggy."
- **Access**: Performance is an accessibility concern. A 4G user on a mid-range device experiences your JavaScript bundle as a hard block. What loads in 1.2s on a MacBook Pro may take 5s on a Moto G4 with network throttling.

The argument for treating performance as a first-class engineering concern is the same argument for treating security the same way: by the time you notice the problem, the damage is already in production.

---

## 25.2 What Lighthouse Measures

Lighthouse is an open-source automated auditing tool built into Chrome DevTools and available as a CLI. It audits five categories:

| Category | What it checks |
|---|---|
| **Performance** | How fast the page loads and becomes interactive |
| **Accessibility** | WCAG compliance — keyboard nav, ARIA, color contrast |
| **Best Practices** | HTTPS, modern APIs, no console errors, no deprecated features |
| **SEO** | Meta tags, robots, link structure, mobile usability |
| **PWA** | Installability, offline capability, manifest validity |

This project targets 100 on Accessibility, Best Practices, and SEO — and monitors Performance continuously in CI. PWA is verified separately via browser install prompts.

### The five performance metrics

Lighthouse's Performance score is a weighted composite of five metrics, each measuring a distinct aspect of the user experience:

| Metric | Weight | What it measures |
|---|---|---|
| **LCP** — Largest Contentful Paint | 25% | When the largest visible element (text, image) renders. Proxy for "when does the page look done." |
| **TBT** — Total Blocking Time | 30% | Sum of all main-thread blocking beyond 50 ms between FCP and TTI. Proxy for "how janky is interaction." |
| **CLS** — Cumulative Layout Shift | 15% | Unexpected layout movement during load. A score > 0.1 means elements are jumping. |
| **FCP** — First Contentful Paint | 10% | When any content appears. Proxy for "how fast does the page start." |
| **SI** — Speed Index | 10% | How quickly content is visually populated. Rewards progressive rendering. |

The 30% weight on TBT reflects the industry shift from raw load time toward interactivity. A page that renders in 1s but blocks clicks for 3s is worse than a page that renders in 2s and responds immediately.

### Scoring curves

Each metric score is not linear — it uses a log-normal curve. The difference between a 90 and 95 LCP score represents a smaller absolute time improvement than the difference between 50 and 60. This means:

- Getting from 0 to 50 is usually straightforward (low-hanging fruit — remove unused CSS, fix CLS, add code splitting).
- Getting from 50 to 80 requires understanding the dependency graph and render order.
- Getting from 80 to 95+ requires attention to the last-mile details: chunk sizing, preload hinting, font loading strategy, service worker behavior.

---

## 25.3 How This Project Uses Lighthouse

### The CI pipeline

Every push to `main` triggers a three-stage automated pipeline:

```
push to main
  └─► Deploy (build + Cloudflare Workers deploy)
        └─► Lighthouse (audit live URL, publish report)
              └─► Lighthouse AI Fix (if score < 95, call Gemini, open PR)
```

Each stage triggers only when the previous one succeeds. This ensures Lighthouse always runs against the actually deployed code — not a local build or a staging environment that might differ.

### What the Lighthouse workflow produces

After each run, two artifacts are created:

1. **A GitHub Actions artifact** — the raw Lighthouse JSON + HTML report, retained for 30 days. The AI fix workflow downloads this to read failing audits.
2. **A GitHub Pages entry** — the HTML report published at `varunragunathan.github.io/varun-portfolio/lighthouse/{date}-{sha}.html` with a chronological index.

This creates a permanent, commit-linked audit trail: given a production bug report, you can identify which deploy introduced a regression and pull the exact Lighthouse report for that SHA.

### The AI fix loop

When the performance score drops below 95, the `lighthouse-ai-fix.yml` workflow:

1. Downloads the Lighthouse JSON artifact from the triggering run
2. Extracts all failing audits that map to actionable source-code changes
3. Reads the relevant source files (e.g., `vite.config.js` for `unused-javascript`, `index.html` for `render-blocking-resources`)
4. Sends the audit details + file contents to Gemini 2.5 Flash with a structured prompt
5. Applies the returned search/replace fixes with two safety guards: the search string must exist and must be unique
6. Opens a PR if any fix was successfully applied

The PR is always reviewed before merge — the AI proposes, the engineer decides.

See [Chapter 13 §13.11](./13-deployment.md#1311-lighthouse-ai-fix-workflow) for the full implementation details.

### What Lighthouse has caught in practice

Some regressions identified and fixed through this pipeline:

- **CLS 0.529 → ~0**: `Home` was lazy-loaded, causing a Suspense flash that shifted the footer by 500+ px. The auth loading state also returned `null`, collapsing content height. Fixed by reverting to lazy loading with a height-reserving placeholder.
- **Unused JavaScript (24 KB)**: `framer-motion` was loading on the guest path via `PixelOwl.jsx`. Replaced with equivalent CSS keyframe animations. Deferred `WelcomeTour` (which still uses framer-motion) to only load for authenticated users.
- **Bootup time regression**: Making `Home` eager-loaded added ~600 ms to initial JS execution. Identified from the TBT jump (810 ms) and reverted.
- **Render-blocking CSS**: The main CSS file was flagged as blocking initial paint. Accepted as expected for a CSS-first architecture with no SSR; the tradeoff is documented.

---

## 25.4 What Lighthouse Does Not Measure

This is the more important section. Lighthouse is a **lab tool** — it runs a synthetic test in a controlled environment. Real users are not in a controlled environment.

### Lab vs. field data

Lighthouse produces lab data: one run, one device profile, simulated network conditions. Field data — what real users actually experience — comes from the Chrome User Experience Report (CrUX), Google Search Console, or RUM (Real User Monitoring) tools. The two frequently disagree, because:

- Real users are on real networks with real congestion patterns
- Real users have warm DNS caches, pre-established TCP connections, and browser caches
- Real users run in parallel with background processes, push notifications, and other tabs
- Real users interact with service workers that cache assets (PWA repeat visits are dramatically faster than cold runs)

A Lighthouse score of 90 does not mean 90% of your users have a good experience. It means you passed a synthetic benchmark.

### The authenticated gap

This project's CI pipeline runs Lighthouse against the unauthenticated guest view. The signed-in home page — which includes the particle field, full timeline, ChatWidget, and WelcomeTour — is never measured automatically. Passkey authentication cannot be scripted in a headless runner (biometric gestures required), so this gap is structural, not an oversight.

The authenticated view is measurable manually via Chrome DevTools → Lighthouse with an active session.

### What Lighthouse cannot see

| Blind spot | What it misses |
|---|---|
| **Long user sessions** | Memory leaks, frame rate degradation after 30 minutes of use |
| **User journeys** | The cost of navigating Home → Auth → Settings → back is not in a single page score |
| **API latency** | Time spent waiting for `/api/chat` or `/api/auth/verify` responses |
| **Worker execution time** | D1 query cost, KV read latency, Vectorize search time |
| **Edge location variance** | Cloudflare edge nodes differ; a run from US-East differs from Asia-Pacific |
| **Repeat visits** | The PWA service worker cache makes repeat visits dramatically faster; Lighthouse only tests cold loads |
| **Real device CPU** | Lighthouse simulates a 4x CPU slowdown; actual low-end devices behave differently |

### The right mental model

Lighthouse answers one specific question: *Is this page's cold-load experience acceptable under a defined synthetic scenario?*

That is a useful, automatable question. It catches regressions early. It provides a shared language for discussing performance with non-engineers (a score is concrete in a way "felt slow" is not). And the scoring system forces classification — if CLS goes from 0.05 to 0.3, something specific changed, and you can find it.

But a 95 Lighthouse score is a floor, not a ceiling. The full picture requires:

- **RUM data** — real latency percentiles from real sessions (p50, p75, p95)
- **API tracing** — where Worker execution time is going (D1, KV, AI inference)
- **Error rates** — JavaScript exceptions in production, not just in dev
- **Conversion funnels** — where users drop off and whether performance correlates
- **Core Web Vitals from Search Console** — field data from Chrome users, not synthetic runs

This project tracks Lighthouse as a regression gate. The next level is instrumenting real user timing and correlating it with the AI chat usage patterns.

---

## Key Takeaways

- Performance is an engineering discipline, not a QA concern. Regressions are cheapest to catch at merge time.
- Lighthouse's five metrics (LCP, TBT, CLS, FCP, SI) each measure a distinct aspect of the user experience. TBT (30% weight) reflects the industry's shift from load time to interactivity.
- This project runs Lighthouse automatically after every deploy, publishes a SHA-linked report archive, and uses Gemini to propose source-code fixes when the score drops below 95.
- Lighthouse is a lab tool. It catches regressions and provides a shared language for performance, but it does not represent real user experience.
- The authenticated home page, API latency, repeat visit performance, and real-device behavior are all outside what CI Lighthouse can see.
- A high Lighthouse score is a necessary condition for good performance. It is not a sufficient one.
