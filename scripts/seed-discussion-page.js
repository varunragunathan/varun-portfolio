#!/usr/bin/env node
/**
 * Seeds the discussion engineering write-up into the D1 `pages` table
 * so it's accessible at /p/discussion-engineering.
 *
 * Usage:
 *   node scripts/seed-discussion-page.js [--remote]
 *
 * Without --remote: seeds local wrangler dev DB
 * With    --remote: seeds production D1
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(__dir, 'pages', 'discussion-engineering.html');
const html = readFileSync(htmlPath, 'utf-8');

const slug  = 'discussion-engineering';
const title = 'Building a Threaded Discussion Board — Engineering Deep Dive';
const nowMs = Date.now();

// Escape single quotes for SQL string literal
const escaped = html.replace(/'/g, "''");
const titleEsc = title.replace(/'/g, "''");

const sql = `
INSERT INTO pages (slug, title, content, created_at, updated_at)
VALUES ('${slug}', '${titleEsc}', '${escaped}', ${nowMs}, ${nowMs})
ON CONFLICT(slug) DO UPDATE SET
  title      = excluded.title,
  content    = excluded.content,
  updated_at = excluded.updated_at;
`.trim();

// Write SQL to a temp file — wrangler execute requires a file path
import { writeFileSync, unlinkSync } from 'fs';
const tmpPath = resolve(__dir, '_seed_tmp.sql');
writeFileSync(tmpPath, sql, 'utf-8');

const remote = process.argv.includes('--remote');
const remoteFlag = remote ? '--remote --env production' : '';

console.log(`Seeding page slug="${slug}" (${remote ? 'PRODUCTION' : 'local'})...`);
console.log(`HTML size: ${(html.length / 1024).toFixed(1)} KB`);

try {
  execSync(
    `npx wrangler d1 execute varun-portfolio-auth ${remoteFlag} --file=${tmpPath}`,
    { stdio: 'inherit' }
  );
  console.log(`\nDone. Page available at /p/${slug}`);
} finally {
  unlinkSync(tmpPath);
}
