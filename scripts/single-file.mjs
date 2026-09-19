// Packs the production build into one self-contained HTML file that opens by double-click,
// with no server, installer, or executable for Windows to block. Run after `vite build`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (href) => readFileSync(join(dist, href.replace(/^\.\//, '')), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  // Keep the closing-tag sequence out of the inline script.
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${code}</script>`;
});
html = html.replace(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
  (_, href) => `<style>${read(href)}</style>`,
);
const svg = readFileSync(join(dist, 'favicon.svg'));
html = html
  .replace('href="./favicon.svg"', `href="data:image/svg+xml;base64,${svg.toString('base64')}"`)
  .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, '')
  // Inline code needs an inline-script allowance; nothing is loaded from anywhere else.
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
if (/src="\.\/assets|href="\.\/assets/.test(html))
  throw new Error('Unexpected external asset left in the page.');
mkdirSync('release', { recursive: true });
writeFileSync(join('release', 'Hearth Studio.html'), html);
console.log(`release/Hearth Studio.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
