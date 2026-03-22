#!/usr/bin/env node
/**
 * lighthouse-ai-fix.js
 *
 * Reads a Lighthouse JSON report, calls Gemini Flash to generate targeted
 * performance fixes, applies them to source files, and writes a PR body.
 *
 * Outputs:
 *   GITHUB_OUTPUT: has_changes=true|false
 *   /tmp/pr-body.md: markdown PR description
 */

import fs from 'node:fs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LH_JSON_PATH   = './lh-report.json';

// Only these audit IDs map to actionable source-code changes
const ACTIONABLE = new Set([
  'render-blocking-resources',
  'unused-javascript',
  'unused-css-rules',
  'modern-image-formats',
  'uses-optimized-images',
  'uses-responsive-images',
  'uses-text-compression',
  'uses-rel-preconnect',
  'uses-rel-preload',
  'font-display',
  'largest-contentful-paint-element',
  'lcp-lazy-loaded',
  'prioritize-lcp-image',
  'total-blocking-time',
  'bootup-time',
  'dom-size',
  'critical-request-chains',
  'preload-fonts',
]);

// Which source files to include for each audit ID
const AUDIT_FILES = {
  'render-blocking-resources':      ['index.html'],
  'unused-javascript':              ['vite.config.js'],
  'largest-contentful-paint-element': ['src/pages/Home.jsx', 'index.html'],
  'lcp-lazy-loaded':                ['src/pages/Home.jsx'],
  'prioritize-lcp-image':           ['src/pages/Home.jsx', 'index.html'],
  'uses-rel-preconnect':            ['index.html'],
  'uses-rel-preload':               ['index.html'],
  'font-display':                   ['index.html', 'src/index.css'],
  'preload-fonts':                  ['index.html'],
  'modern-image-formats':           ['src/pages/Home.jsx'],
  'uses-optimized-images':          ['src/pages/Home.jsx'],
  'bootup-time':                    ['vite.config.js'],
  'total-blocking-time':            ['vite.config.js'],
};

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function formatAudit(audit) {
  const score = audit.score !== null ? `${Math.round(audit.score * 100)}/100` : 'n/a';
  let out = `### ${audit.title} (score: ${score})`;
  if (audit.displayValue) out += `\nMeasured: ${audit.displayValue}`;
  if (audit.description)  out += `\nWhat it checks: ${audit.description}`;
  if (audit.details?.items?.length) {
    out += `\nTop offenders:`;
    audit.details.items.slice(0, 5).forEach(item => {
      const label = item.url ?? item.node?.snippet ?? item.label ?? JSON.stringify(item).slice(0, 120);
      out += `\n  - ${String(label).trim()}`;
    });
  }
  return out;
}

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return JSON.parse(text);
}

async function main() {
  if (!fs.existsSync(LH_JSON_PATH)) {
    console.log('No Lighthouse JSON found — skipping');
    setOutput('has_changes', 'false');
    return;
  }

  const report   = JSON.parse(fs.readFileSync(LH_JSON_PATH, 'utf8'));
  const perfScore = Math.round((report.categories?.performance?.score ?? 0) * 100);
  console.log(`Performance score: ${perfScore}/100`);

  if (perfScore >= 95) {
    console.log('Score already ≥ 95 — nothing to do');
    setOutput('has_changes', 'false');
    return;
  }

  // Collect failing audits that have actionable fixes
  const failing = Object.entries(report.audits)
    .filter(([id, a]) => ACTIONABLE.has(id) && a.score !== null && a.score < 0.9)
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => a.score - b.score);

  if (failing.length === 0) {
    console.log('No actionable failing audits');
    setOutput('has_changes', 'false');
    return;
  }

  console.log('Failing audits:', failing.map(a => `${a.id}(${Math.round(a.score * 100)})`).join(', '));

  // Gather relevant source files
  const filePaths = new Set(['index.html', 'vite.config.js']);
  failing.forEach(a => (AUDIT_FILES[a.id] ?? []).forEach(f => filePaths.add(f)));

  const sourceFiles = {};
  filePaths.forEach(p => {
    const c = readFileSafe(p);
    if (c) sourceFiles[p] = c;
  });

  const prompt = `\
You are a web performance engineer. Fix the Lighthouse performance issues below for a React 18 SPA.

## Tech stack
- Vite 6, React 18, React Router v6, Framer Motion, Tailwind CSS
- Deployed on Cloudflare Workers edge (TTFB ~50ms globally)
- PWA with Workbox service worker
- Google Fonts loaded with async preload pattern

## Current performance score: ${perfScore}/100  (target: ≥95)

## Failing audits
${failing.map(formatAudit).join('\n\n')}

## Source files
${Object.entries(sourceFiles).map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``).join('\n\n')}

## Rules
- Only edit the files shown above
- Do NOT add npm dependencies
- Do NOT change component logic, routing, or functionality
- Do NOT touch test files, story files, or docs
- Each "search" value must appear exactly once in its file
- Prefer minimal, surgical changes over rewrites
- If an audit cannot be fixed through source changes alone, skip it

Respond with ONLY a JSON object — no markdown fences, no explanation:
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
}`;

  console.log('Calling Gemini Flash...');
  let result;
  try {
    result = await callGemini(prompt);
  } catch (err) {
    console.error('Gemini failed:', err.message);
    setOutput('has_changes', 'false');
    process.exit(1);
  }

  console.log(`Gemini returned ${result.fixes?.length ?? 0} fix(es)`);

  if (!result.fixes?.length) {
    console.log('No fixes proposed');
    setOutput('has_changes', 'false');
    return;
  }

  // Apply fixes
  const applied = [];
  const skipped = [];

  for (const fix of result.fixes) {
    const content = readFileSafe(fix.file);
    if (!content) {
      skipped.push({ ...fix, reason: 'file not found' });
      continue;
    }
    if (!content.includes(fix.search)) {
      console.warn(`⚠ Search string not found in ${fix.file}: "${fix.search.slice(0, 80)}"`);
      skipped.push({ ...fix, reason: 'search string not found in file' });
      continue;
    }
    // Guard against multiple matches — only safe to replace if unique
    const count = content.split(fix.search).length - 1;
    if (count > 1) {
      console.warn(`⚠ Search string appears ${count}× in ${fix.file} — skipping to avoid partial replacement`);
      skipped.push({ ...fix, reason: `search string appears ${count} times (must be unique)` });
      continue;
    }
    fs.writeFileSync(fix.file, content.replace(fix.search, fix.replace));
    console.log(`✓ ${fix.file}: ${fix.description}`);
    applied.push(fix);
  }

  if (applied.length === 0) {
    console.log('No fixes could be applied cleanly');
    setOutput('has_changes', 'false');
    return;
  }

  // Write PR body
  const sha = process.env.GITHUB_SHA ?? 'unknown';
  const prBody = `## Lighthouse AI Performance Fixes

**Lighthouse score:** \`${perfScore}/100\` → target \`95+\`
**Source commit:** \`${sha.slice(0, 7)}\`
**Model:** Gemini 2.0 Flash Lite

---

### Summary
${result.summary}

### Changes (${applied.length} applied)

${applied.map(f => `#### \`${f.file}\`
${f.description}
> Fixes audit: \`${f.audit}\``).join('\n\n')}

${skipped.length > 0 ? `### Skipped (${skipped.length})

${skipped.map(f => `- \`${f.file}\` — ${f.reason}`).join('\n')}` : ''}

---

### Review checklist
- [ ] Changes look correct and targeted
- [ ] No unintended functional changes
- [ ] CI passes on this branch
- [ ] Performance improvement confirmed after merge (next Lighthouse run)

---
🤖 Generated by the Lighthouse AI Fix workflow · [View report](https://varunragunathan.github.io/varun-portfolio/lighthouse/)`;

  fs.writeFileSync('/tmp/pr-body.md', prBody);
  setOutput('has_changes', 'true');
  console.log(`\n✓ Applied ${applied.length} fix(es). PR body written.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  setOutput('has_changes', 'false');
  process.exit(1);
});
