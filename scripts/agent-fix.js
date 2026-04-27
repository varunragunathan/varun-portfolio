#!/usr/bin/env node
/**
 * agent-fix.js
 *
 * Triggered by GitHub Actions when an issue is labeled 'agent-fix'.
 * Identifies relevant source files from the issue text, calls Gemini Flash
 * to generate targeted fixes, applies them with safety guards, and writes
 * artifacts for the workflow to commit and PR.
 *
 * Inputs (env vars):
 *   GEMINI_API_KEY  — Gemini API key (free tier)
 *   ISSUE_NUMBER    — GitHub issue number
 *   ISSUE_TITLE     — issue title
 *   ISSUE_BODY_FILE — path to a file containing the issue body
 *
 * Outputs:
 *   GITHUB_OUTPUT: has_changes=true|false, branch=agent-fix/issue-N
 *   /tmp/agent-fix-pr-body.md   — PR description markdown
 *   /tmp/agent-fix-title.txt    — PR title (single line)
 *   /tmp/agent-fix-comment.md   — comment to post on the issue
 */

import fs   from 'node:fs';
import { execSync } from 'node:child_process';

const GEMINI_API_KEY    = process.env.GEMINI_API_KEY;
const ISSUE_NUMBER      = process.env.ISSUE_NUMBER  ?? '0';
const ISSUE_TITLE       = process.env.ISSUE_TITLE   ?? '';
const ISSUE_BODY_FILE   = process.env.ISSUE_BODY_FILE ?? '';
const ISSUE_BODY        = ISSUE_BODY_FILE && fs.existsSync(ISSUE_BODY_FILE)
  ? fs.readFileSync(ISSUE_BODY_FILE, 'utf8')
  : (process.env.ISSUE_BODY ?? '');

const MAX_FILES      = 6;
const MAX_FILE_LINES = 400;
const BRANCH         = `agent-fix/issue-${ISSUE_NUMBER}`;

// ── Helpers ───────────────────────────────────────────────────────

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function readFileSafe(p) {
  try {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    if (lines.length > MAX_FILE_LINES) {
      return lines.slice(0, MAX_FILE_LINES).join('\n')
        + `\n// ... [truncated at ${MAX_FILE_LINES} lines — full file has ${lines.length} lines]`;
    }
    return content;
  } catch { return null; }
}

function writeComment(text) {
  fs.writeFileSync('/tmp/agent-fix-comment.md', text);
}

// ── File discovery ────────────────────────────────────────────────
// Scores candidate files by how many issue signals point to them.
// Signals: explicit path mentions (high weight) and symbol grep hits (low weight).

function findRelevantFiles(issueText) {
  const scores = new Map(); // filepath → relevance score

  const bump = (file, delta) => {
    if (fs.existsSync(file)) scores.set(file, (scores.get(file) ?? 0) + delta);
  };

  // 1. Explicit file paths mentioned in the issue (high weight)
  const pathRe = /[\w/-]+\.(jsx?|tsx?|css|toml)/g;
  for (const [match] of issueText.matchAll(pathRe)) {
    for (const candidate of [
      match,
      `src/${match}`,
      `worker/${match}`,
      `src/pages/${match}`,
      `src/components/${match}`,
    ]) bump(candidate, 10);
  }

  // 2. PascalCase component / class names
  const pascal = [...new Set([...issueText.matchAll(/\b([A-Z][a-zA-Z0-9]{3,})\b/g)].map(m => m[1]))];

  // 3. camelCase function / variable names (length > 5, excluding JS keywords)
  const SKIP = new Set(['function','return','const','import','export','default','async','await','typeof','instanceof']);
  const camel  = [...new Set([...issueText.matchAll(/\b([a-z][a-zA-Z0-9]{5,})\b/g)].map(m => m[1]))]
    .filter(n => !SKIP.has(n));

  // 4. Grep for each symbol in src/ and worker/
  for (const sym of [...pascal, ...camel]) {
    const safe = sym.replace(/[^a-zA-Z0-9_]/g, '');
    if (!safe) continue;
    try {
      const hits = execSync(
        `grep -rl "${safe}" src/ worker/ --include="*.js" --include="*.jsx" --include="*.css" 2>/dev/null || true`,
        { encoding: 'utf8', timeout: 5000 }
      ).trim().split('\n').filter(Boolean);
      for (const f of hits) scores.set(f, (scores.get(f) ?? 0) + 1);
    } catch { /* ignore */ }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_FILES)
    .map(([f]) => f);
}

// ── Gemini ────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
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

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set');
    setOutput('has_changes', 'false');
    writeComment('🤖 Agent fix failed: `GEMINI_API_KEY` is not configured on this repository.\n\nAsk the repo owner to add it under Settings → Secrets → Actions.');
    process.exit(1);
  }

  const issueText = `${ISSUE_TITLE}\n\n${ISSUE_BODY}`;
  console.log(`Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}`);

  // Discover files
  const filePaths = findRelevantFiles(issueText);
  console.log('Relevant files:', filePaths.length ? filePaths.join(', ') : 'none');

  if (filePaths.length === 0) {
    setOutput('has_changes', 'false');
    writeComment(`🤖 I couldn't identify relevant source files from this issue description.

**Tips for better results:**
- Name the component or function: e.g. "the \`EvalTrendChart\` component"
- Include a file path: e.g. "in \`worker/evals.js\`"
- Paste the exact error message or stack trace`);
    return;
  }

  // Read files
  const sourceFiles = {};
  for (const p of filePaths) {
    const c = readFileSafe(p);
    if (c) sourceFiles[p] = c;
  }

  const prompt = `\
You are an expert software engineer fixing a bug from a GitHub issue.

## Stack
- React 18 + Vite 6 frontend (JSX, CSS custom properties for theming)
- Cloudflare Workers backend — KV, D1 SQLite, Vectorize, Durable Objects
- Plain JavaScript throughout (no TypeScript)

## Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

${ISSUE_BODY}

## Source files
${Object.entries(sourceFiles).map(([p, c]) => `### ${p}\n\`\`\`\n${c}\n\`\`\``).join('\n\n')}

## Rules
- Only edit files shown above
- Make the minimal change that fixes the reported bug — do not refactor or clean up surrounding code
- Do NOT add npm dependencies
- Do NOT touch test files (*.test.js, *.stories.jsx) or docs
- Each "search" value must appear exactly once in its file
- The "search" string must be copied character-for-character from the source shown above, including exact whitespace and indentation — do not reformat or re-indent it; choose a shorter unique anchor if unsure
- If the bug cannot be fixed with the files provided, return an empty fixes array and explain in the explanation field

Respond with ONLY a JSON object, no markdown fences:
{
  "pr_title": "fix: <concise description> (closes #${ISSUE_NUMBER})",
  "summary": "one sentence: what was wrong and what changed",
  "explanation": "2-3 sentences on the root cause and why this fix works",
  "fixes": [
    {
      "file": "path/to/file",
      "description": "what this specific change does",
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
    console.error('Gemini error:', err.message);
    setOutput('has_changes', 'false');
    writeComment(`🤖 Agent fix failed — Gemini API error: \`${err.message}\``);
    process.exit(1);
  }

  console.log(`Gemini proposed ${result.fixes?.length ?? 0} fix(es)`);
  console.log('Summary:', result.summary);

  if (!result.fixes?.length) {
    setOutput('has_changes', 'false');
    writeComment(`🤖 I analysed the issue but couldn't determine a code fix from the files available.

**Assessment:** ${result.explanation ?? result.summary ?? 'No explanation provided.'}

This may require additional context. Try adding exact file paths or the specific function name to the issue body.`);
    return;
  }

  // Apply fixes with safety guards
  const applied = [];
  const skipped = [];

  for (const fix of result.fixes) {
    const content = readFileSafe(fix.file);
    if (!content) {
      skipped.push({ ...fix, reason: 'file not found' });
      continue;
    }
    if (!content.includes(fix.search)) {
      console.warn(`⚠ Search string not found in ${fix.file}: "${String(fix.search).slice(0, 80)}"`);
      skipped.push({ ...fix, reason: 'search string not found in file' });
      continue;
    }
    const occurrences = content.split(fix.search).length - 1;
    if (occurrences > 1) {
      console.warn(`⚠ Search string appears ${occurrences}× in ${fix.file} — skipping`);
      skipped.push({ ...fix, reason: `search string appears ${occurrences} times (must be unique)` });
      continue;
    }
    fs.writeFileSync(fix.file, content.replace(fix.search, fix.replace));
    console.log(`✓ ${fix.file}: ${fix.description}`);
    applied.push(fix);
  }

  if (applied.length === 0) {
    setOutput('has_changes', 'false');
    writeComment(`🤖 Gemini proposed ${result.fixes.length} fix(es) but none could be applied safely — the search strings didn't match the current file contents exactly.

**What was attempted:**
${result.fixes.map(f => `- \`${f.file}\`: ${f.description}`).join('\n')}

This usually means the code changed since the issue was filed. Try adding an exact code snippet from the file to the issue body.`);
    return;
  }

  // Write PR artifacts
  const prTitle = (result.pr_title ?? `fix: agent fix for issue #${ISSUE_NUMBER}`).slice(0, 120);

  const prBody = `## Agent Fix — Issue #${ISSUE_NUMBER}

> ${result.summary}

**Root cause:** ${result.explanation ?? ''}

---

### Changes applied (${applied.length})

${applied.map(f => `#### \`${f.file}\`\n${f.description}`).join('\n\n')}

${skipped.length ? `### Skipped (${skipped.length})\n${skipped.map(f => `- \`${f.file}\` — ${f.reason}`).join('\n')}` : ''}

---

### Review checklist
- [ ] Fix matches the issue description
- [ ] No unintended side effects in adjacent code
- [ ] CI passed (lint + component tests + e2e)

Closes #${ISSUE_NUMBER}

---
🤖 Generated by the [Agent Fix workflow](/.github/workflows/agent-fix.yml) · powered by Gemini 2.5 Flash (free tier)`;

  fs.writeFileSync('/tmp/agent-fix-pr-body.md', prBody);
  fs.writeFileSync('/tmp/agent-fix-title.txt', prTitle);
  writeComment(`🤖 Applied ${applied.length} fix(es) — opening a PR now. CI will run on the branch before you merge.

**What I changed:** ${result.summary}`);

  setOutput('has_changes', 'true');
  setOutput('branch', BRANCH);
  console.log(`\n✓ ${applied.length} fix(es) applied. Branch: ${BRANCH}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  setOutput('has_changes', 'false');
  writeComment(`🤖 Agent fix crashed unexpectedly: \`${err.message}\``);
  process.exit(1);
});
