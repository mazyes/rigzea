// Builds the app's pages. Vercel runs this as the build command; it is safe to run any time.
//   node scripts/stamp-assets.mjs
// 1. Stamps script and stylesheet URLs in app/index.html with a hash of their contents
//    (?v=1a2b3c4d), so browsers keep them cached for a year (the immutable rule in vercel.json)
//    and still get a changed file at once.
// 2. Writes one page per app area (app/owners/index.html, ...) from app/index.html, which is the
//    only one to edit. They differ only in the title; routing is in app/app.js.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'rigzea');
const ref = /(src|href)="(\/(?:app|js)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g;
const AREAS = {
  tasks: 'საქმეები', apartments: 'ბინები', owners: 'კონტაქტები', deals: 'გარიგებები',
  finance: 'ფინანსები', team: 'გუნდი', settings: 'პარამეტრები', chat: 'ჩატი',
};
const GENERATED = '<!-- Generated from app/index.html by scripts/stamp-assets.mjs: edit that file, not this one. -->';

function write(rel, content) {
  const file = join(site, rel);
  let old = null;
  try { old = readFileSync(file, 'utf8'); } catch { /* new page */ }
  if (old === content) return console.log(`${rel}: up to date`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`${rel}: ${old === null ? 'created' : 'updated'}`);
}

const template = readFileSync(join(site, 'app/index.html'), 'utf8').replace(ref, (_, attr, path) => {
  const hash = createHash('sha256').update(readFileSync(join(site, path))).digest('hex').slice(0, 8);
  return `${attr}="${path}?v=${hash}"`;
});
// Route chunks are injected by app.js, so keep their cache-busting versions available there.
const chunkVersions = Object.fromEntries(['/app/views-ops.js', '/app/views-portfolio.js', '/app/views-deals.js', '/app/views-docs.js', '/app/views-finance.js', '/app/views-admin.js', '/app/views-chat.js']
  .map(path => [path, createHash('sha256').update(readFileSync(join(site, path))).digest('hex').slice(0, 8)]));
// app/index.html is both the input and the output, so drop the tag a previous run added
// instead of appending another one on every build.
const stamped = template.replace(/<script>window\.__RIGZEA_ASSET_VERSIONS=.*?<\/script>/g, '').replace('</head>', `<script>window.__RIGZEA_ASSET_VERSIONS=${JSON.stringify(chunkVersions)};</script></head>`);
if (!/<title>[^<]*<\/title>/.test(stamped)) throw new Error('app/index.html needs a <title>');
write('app/index.html', stamped);

for (const [area, label] of Object.entries(AREAS)) {
  const page = stamped
    .replace(/<title>[^<]*<\/title>/, `<title>Rigzea: ${label}</title>`)
    .replace('<!doctype html>', `<!doctype html>\n${GENERATED}`);
  write(`app/${area}/index.html`, page);
}
