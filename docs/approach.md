# How I Build and Maintain Production Applications

This is a direct account of how I approach software — from the first line of code to a system that's been running for years. It's written for anyone who wants to understand the thinking behind the work, not just the output.

---

## 1. Understand the problem before touching the stack

Before picking a framework, a database, or a deployment model, I need to know what I'm actually solving. Most over-engineered systems are the result of skipping this step. I spend time with the constraints: Who uses this? At what scale? What fails catastrophically vs. inconveniently? What can be added later vs. what's expensive to change?

The architecture should follow from the answers, not from what's popular that quarter.

---

## 2. Own the full stack, end to end

Production systems don't fail at language boundaries — they fail at the seams. I stay fluent across the full path: schema design, API contracts, client rendering, caching behavior, deployment pipeline, and monitoring. I don't hand off a "backend" and stop caring about latency. I don't write a "frontend" and stay ignorant of what the server is doing.

Knowing the whole system means I can reason about tradeoffs rather than guessing.

---

## 3. Performance is a feature, not a phase

I treat performance as a first-class requirement, not something to optimize after the fact. That means:

- Bundle size is tracked and budgeted at build time
- Rendering paths are designed with LCP and FCP in mind from the start
- Caches — CDN, edge KV, browser — are an intentional part of the architecture, not an afterthought
- Performance regressions are caught in CI before they reach users, not in a postmortem after

Every deploy runs Lighthouse. The scores are public. That accountability is intentional.

---

## 4. Security is structural, not bolted on

Security decisions made late are expensive. I build auth correctly the first time: WebAuthn passkeys over passwords, TOTP for privileged escalation, short-lived sessions with explicit revocation, trusted-device tracking. Not because these are trendy, but because they reflect how trust actually works in production systems at scale.

The rule: if an attacker gets the database, what do they have? The answer should be: not much.

---

## 5. Automate every quality gate

If a check can be automated, it should be. My CI pipeline runs lint, component tests, end-to-end smoke tests, accessibility checks, and Lighthouse audits on every push. No human is faster or more consistent than a check that runs in three minutes on every commit.

The discipline is in never making exceptions. One skip becomes a habit.

---

## 6. Document decisions, not just code

Code explains what the system does. Documentation explains why it works that way. I maintain a living engineering journal that covers architecture decisions, tradeoffs I explicitly chose not to take, and the reasoning behind major implementation choices.

This pays off in three situations: when someone joins the team, when I return to a system after six months, and when I need to make a change that touches something old. In all three cases, the decision log is worth more than the code comments.

---

## 7. Know your costs and limits

Every production system has resource constraints: database reads per second, memory limits, cold start latency, API rate limits. I learn these limits for whatever infrastructure I'm running on and design to stay well inside them — not to see how close I can get.

When we hit 50% of our KV read quota, I added `cacheTtl` to the three highest-frequency reads that day. Not when we hit 90%. The point is to know the number before it becomes a problem.

---

## 8. Design for failure

Systems fail. The question is how. I build with explicit fallbacks: error boundaries at every layer, graceful degradation when dependencies are unavailable, retry logic with backoff where appropriate. I distinguish between errors that should surface to users and errors that should be handled silently and monitored.

A system that fails loudly and informatively is better than one that fails silently and completely.

---

## 9. Deploy small, deploy often

Large deploys are risky. Every line of code that sits unreleased is inventory — it has cost but no value yet, and it accumulates risk. I prefer shipping small, verified changes frequently over batching up features into large releases.

Each commit should do one thing, explain why, and leave the system in a better state than it found it.

---

## 10. Measure before you optimize

Intuition about performance is often wrong. I measure first — real metrics, not guesses — and then act on what the data shows. This applies to perceived load time, database query duration, bundle parse cost, and cache hit rates. The optimization that matters is rarely the one that feels most satisfying.

When Lighthouse showed a performance regression from opacity animation behavior, the fix was three lines of CSS. The diagnosis was the hard part, and it required measurement.

---

## 11. Write for the next person

The next person who reads this code might be a teammate, a future hire, or me in eight months. I write commits with full context ("why" not "what"), keep naming consistent and self-describing, and leave the codebase in a state where the obvious move is also the correct one.

Good code doesn't need a lot of comments. It needs clear intent and predictable behavior.

---

## 12. Production is the source of truth

Staging environments diverge from production. Local environments diverge further. I run real checks against the production URL — Lighthouse runs against varunr.dev, not localhost. Smoke tests run against the built artifact. Migrations are tested against production-equivalent data.

This site has its own CI pipeline, Lighthouse history, transparency dashboard, and automated migration tooling — not because it's a large system, but because those habits should be default, not reserved for large systems.

---

## The short version

Build things that work correctly under realistic conditions. Automate the things that should be consistent. Measure the things that matter. Document the decisions, not just the code. And treat the infrastructure as part of the product — it's not plumbing, it's the system.
