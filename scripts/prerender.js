// Injects SSR-rendered HTML into dist/index.html after vite build.
// Run after: vite build && vite build --ssr src/entry-server.jsx --outDir dist-server
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir   = path.join(__dirname, '../dist');
const serverEntry = path.join(__dirname, '../dist-server/entry-server.js');

const { render } = await import(serverEntry);

const template = readFileSync(path.join(distDir, 'index.html'), 'utf-8');
const appHtml  = await render('/');
const result   = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

writeFileSync(path.join(distDir, 'index.html'), result);
console.log(`Pre-render complete: injected ${appHtml.length} chars into dist/index.html`);
