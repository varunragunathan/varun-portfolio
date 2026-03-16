#!/usr/bin/env node
// ── Docs export ───────────────────────────────────────────────────
// Concatenates all chapters + glossary into a single markdown file.
//
// Usage:
//   node scripts/export-docs.js              # outputs to docs/export/book.md
//   node scripts/export-docs.js --out path   # custom output path

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const ROOT      = new URL('..', import.meta.url).pathname;
const DOCS      = join(ROOT, 'docs');
const OUT_DIR   = join(DOCS, 'export');

const argOut    = process.argv.indexOf('--out');
const OUT_FILE  = argOut !== -1 ? process.argv[argOut + 1] : join(OUT_DIR, 'book.md');

const CHAPTERS = [
  'chapters/01-introduction.md',
  'chapters/02-architecture.md',
  'chapters/03-database-schema.md',
  'chapters/04-authentication-overview.md',
  'chapters/05-passkeys-and-webauthn.md',
  'chapters/06-otp-and-email-verification.md',
  'chapters/07-session-management.md',
  'chapters/08-number-matching.md',
  'chapters/09-recovery-system.md',
  'chapters/10-step-up-authentication.md',
  'chapters/11-frontend-architecture.md',
  'chapters/12-security-analysis.md',
  'chapters/13-deployment.md',
  'chapters/14-what-could-be-done.md',
  'chapters/15-rag-system.md',
  'glossary/README.md',
];

const header = `# Passkeys, Edge Computing, and the Passwordless Portfolio
### A Book-Quality Technical Documentation for \`varun-portfolio\`

*Exported: ${new Date().toISOString().slice(0, 10)}*

---

`;

const divider = '\n\n---\n\n';

const parts = CHAPTERS.map(rel => {
  const path = join(DOCS, rel);
  const text = readFileSync(path, 'utf-8');
  return text.trim();
});

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, header + parts.join(divider) + '\n');

const lines = (header + parts.join(divider)).split('\n').length;
console.log(`Exported ${CHAPTERS.length} chapters → ${OUT_FILE}`);
console.log(`${lines.toLocaleString()} lines, ${(readFileSync(OUT_FILE).length / 1024).toFixed(0)} KB`);
