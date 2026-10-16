// Stamps the app's script and stylesheet URLs with a hash of their contents (?v=1a2b3c4d), so
// browsers can keep them cached for a year (see the immutable rule in vercel.json) and still get
// a changed file at once. Vercel runs this as the build command; it is safe to run any time.
//   node scripts/stamp-assets.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'rigzea');
const pages = ['app/index.html'];
const ref = /(src|href)="(\/(?:app|js)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g;

for (const page of pages) {
  const file = join(site, page);
  const html = readFileSync(file, 'utf8');
  const out = html.replace(ref, (_, attr, path) => {
    const hash = createHash('sha256').update(readFileSync(join(site, path))).digest('hex').slice(0, 8);
    return `${attr}="${path}?v=${hash}"`;
  });
  if (out !== html) writeFileSync(file, out);
  console.log(`${page}: ${out === html ? 'up to date' : 'stamped'}`);
}
