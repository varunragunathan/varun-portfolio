// ── LLM Eval Pipeline ─────────────────────────────────────────────
// POST /api/admin/evals/run
//
// Runs 10 hardcoded financial Q&A pairs through claude-sonnet-4-20250514,
// then scores each response on accuracy, hallucination_risk, relevance,
// and tone (1–5) using a second Claude call as judge.
//
// Optional body: { systemPrompt: string }  — omit to use the default.
// Requires env.ANTHROPIC_API_KEY (wrangler secret put ANTHROPIC_API_KEY).

import { getSession }    from './auth/session.js';
import { requireAdmin } from './admin.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Hardcoded test dataset ────────────────────────────────────────
const EVAL_DATASET = [
  {
    id: 1, category: 'investing',
    question: 'What is dollar-cost averaging and how does it reduce investment risk?',
    idealAnswer: 'Dollar-cost averaging (DCA) involves investing a fixed amount at regular intervals regardless of price. It reduces risk by buying more shares when prices are low and fewer when high, smoothing the average purchase cost and reducing the impact of volatility on any single entry point.',
  },
  {
    id: 2, category: 'markets',
    question: 'What is the difference between a bull market and a bear market?',
    idealAnswer: 'A bull market is a period of rising prices (typically 20%+ from recent lows), associated with economic growth and optimism. A bear market is a 20%+ decline from recent highs, associated with economic slowdown and pessimism.',
  },
  {
    id: 3, category: 'bonds',
    question: 'Why do bond prices fall when interest rates rise?',
    idealAnswer: 'Bond prices and interest rates are inversely related. When rates rise, newly issued bonds offer higher yields, making existing lower-yield bonds less attractive — their price drops to bring their effective yield in line with the market. Longer-duration bonds are more sensitive to rate changes.',
  },
  {
    id: 4, category: 'personal finance',
    question: 'What is the 50/30/20 budgeting rule?',
    idealAnswer: 'The 50/30/20 rule allocates after-tax income into three buckets: 50% for needs (rent, utilities, groceries), 30% for wants (entertainment, dining, hobbies), and 20% for savings and debt repayment. It is a simple framework for balancing current spending with long-term financial health.',
  },
  {
    id: 5, category: 'taxes',
    question: 'What is the key difference between a traditional IRA and a Roth IRA?',
    idealAnswer: 'A traditional IRA uses pre-tax contributions — you get an immediate tax deduction but pay income tax on withdrawals in retirement. A Roth IRA uses after-tax contributions — no upfront deduction, but qualified withdrawals are tax-free. The optimal choice depends on whether your tax rate will be higher now or in retirement.',
  },
  {
    id: 6, category: 'risk',
    question: 'What does portfolio diversification mean and why does it matter?',
    idealAnswer: 'Diversification spreads investments across different asset classes, sectors, and geographies so that losses in one area can be offset by gains in another. It reduces unsystematic risk (specific to individual assets) while leaving systematic market-wide risk unchanged.',
  },
  {
    id: 7, category: 'valuation',
    question: 'What does the price-to-earnings (P/E) ratio tell an investor?',
    idealAnswer: 'The P/E ratio compares a stock\'s price to its earnings per share, showing how much investors pay per dollar of earnings. A high P/E often indicates high growth expectations or potential overvaluation; a low P/E may signal undervaluation or slow growth. It should always be compared against industry peers and historical averages.',
  },
  {
    id: 8, category: 'inflation',
    question: 'How does inflation erode the purchasing power of savings?',
    idealAnswer: 'Inflation means each unit of currency buys fewer goods over time. If savings earn 1% but inflation runs at 3%, the real return is -2% — your money loses purchasing power each year. This is why holding all savings in low-yield accounts during high inflation is harmful and investing in assets that outpace inflation (equities, real assets) matters.',
  },
  {
    id: 9, category: 'compounding',
    question: 'Explain compound interest and why starting early matters so much.',
    idealAnswer: 'Compound interest means earning returns on both the original principal and all previously accumulated interest. The growth is exponential: $1,000 at 8% becomes $1,080 after year 1, then $1,166.40 after year 2. Each year the base grows, so starting early gives dramatically more compounding periods and produces far greater wealth than starting later with the same total contributions.',
  },
  {
    id: 10, category: 'ETFs',
    question: 'What are the main differences between ETFs and mutual funds?',
    idealAnswer: 'ETFs trade on exchanges throughout the day like stocks, typically carry lower expense ratios, and are tax-efficient through their in-kind creation/redemption mechanism. Mutual funds price once daily at NAV, may carry higher fees and minimum investments, and can trigger taxable capital gain distributions. Both offer diversification, but ETFs generally suit cost-conscious investors who want flexibility.',
  },
];

const DEFAULT_SYSTEM = 'You are a helpful, accurate financial assistant. Answer questions clearly and concisely using correct financial concepts. Do not speculate, invent statistics, or provide specific investment advice.';

// ── Anthropic API helper ──────────────────────────────────────────
async function callClaude({ apiKey, messages, system, temperature = 0.3, maxTokens = 600 }) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    temperature,
    messages,
  };
  if (system) body.system = system;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

// ── Judge prompt ──────────────────────────────────────────────────
function buildJudgePrompt(question, idealAnswer, response) {
  return `You are an expert financial educator evaluating a language model's answer.

Question: ${question}

Reference answer: ${idealAnswer}

Model response: ${response}

Score each dimension from 1 (worst) to 5 (best):
- accuracy: Are the financial facts correct compared to the reference?
- hallucination_risk: Is the response free from invented statistics, false claims, or fabricated details? (5 = zero hallucinations)
- relevance: Does the response directly and completely address the question?
- tone: Is the tone professional, clear, and accessible for a financial context?

Respond with ONLY valid JSON, no other text:
{"accuracy":<1-5>,"hallucination_risk":<1-5>,"relevance":<1-5>,"tone":<1-5>,"reasoning":"<one sentence>"}`;
}

function parseJudgeJson(text) {
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object found');
  const raw   = JSON.parse(text.slice(start, end + 1));
  const clamp = v => Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
  return {
    accuracy:          clamp(raw.accuracy),
    hallucination_risk: clamp(raw.hallucination_risk),
    relevance:         clamp(raw.relevance),
    tone:              clamp(raw.tone),
    reasoning:         typeof raw.reasoning === 'string' ? raw.reasoning : '',
  };
}

// ── POST /api/admin/evals/run ─────────────────────────────────────
export async function runEvals(request, env) {
  const session = await getSession(env.KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not configured on the worker. Run: wrangler secret put ANTHROPIC_API_KEY' }, 500);
  }

  let customSystem = null;
  try {
    const body = await request.json();
    if (typeof body?.systemPrompt === 'string' && body.systemPrompt.trim()) {
      customSystem = body.systemPrompt.trim();
    }
  } catch { /* no body or non-JSON — use default */ }

  const effectiveSystem = customSystem ?? DEFAULT_SYSTEM;
  const apiKey = env.ANTHROPIC_API_KEY;

  // Phase 1 — generate all responses in parallel
  const genResults = await Promise.allSettled(
    EVAL_DATASET.map(item =>
      callClaude({
        apiKey,
        messages: [{ role: 'user', content: item.question }],
        system: effectiveSystem,
        temperature: 0.3,
        maxTokens: 600,
      })
    )
  );

  // Phase 2 — judge all responses in parallel
  const judgeResults = await Promise.allSettled(
    EVAL_DATASET.map((item, i) => {
      const gen = genResults[i];
      if (gen.status === 'rejected') return Promise.resolve(null);
      return callClaude({
        apiKey,
        messages: [{ role: 'user', content: buildJudgePrompt(item.question, item.idealAnswer, gen.value) }],
        system: null,
        temperature: 0,
        maxTokens: 200,
      });
    })
  );

  // Assemble results
  const results = EVAL_DATASET.map((item, i) => {
    const gen   = genResults[i];
    const judge = judgeResults[i];

    const response = gen.status === 'fulfilled'
      ? gen.value
      : `[Generation error: ${gen.reason?.message ?? 'unknown'}]`;

    let scores = { accuracy: 1, hallucination_risk: 1, relevance: 1, tone: 1, reasoning: 'Evaluation failed.' };
    if (judge.status === 'fulfilled' && judge.value) {
      try { scores = parseJudgeJson(judge.value); } catch { /* keep defaults */ }
    }

    return { id: item.id, category: item.category, question: item.question, response, scores };
  });

  // Compute per-dimension averages
  const avg = key => {
    const vals = results.map(r => r.scores[key]).filter(v => typeof v === 'number' && v >= 1);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  const averages = {
    accuracy:           avg('accuracy'),
    hallucination_risk: avg('hallucination_risk'),
    relevance:          avg('relevance'),
    tone:               avg('tone'),
  };

  // Persist run to KV
  const stored  = await env.KV.get('eval:runs');
  const allRuns = stored ? JSON.parse(stored) : [];
  const version = `v${allRuns.length + 1}`;
  const runAt   = Date.now();
  allRuns.push({ version, runAt, systemPrompt: effectiveSystem, averages, results });
  await env.KV.put('eval:runs', JSON.stringify(allRuns.slice(-50)));

  return json({ version, results, systemPrompt: effectiveSystem, averages, runAt });
}

// ── GET /api/admin/evals/runs ─────────────────────────────────────
export async function getEvalRuns(request, env) {
  const session = await getSession(env.KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  const stored = await env.KV.get('eval:runs');
  return json({ runs: stored ? JSON.parse(stored) : [] });
}

// ── DELETE /api/admin/evals/runs ──────────────────────────────────
export async function deleteEvalRuns(request, env) {
  const session = await getSession(env.KV, request);
  const guard   = await requireAdmin(session, env);
  if (guard) return guard;

  await env.KV.delete('eval:runs');
  return json({ ok: true });
}
