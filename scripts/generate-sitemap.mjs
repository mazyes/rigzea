import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'rigzea');
const routes = [
  '/', '/features/', '/pricing/', '/faq/',
  '/legal/cookies/', '/legal/privacy/', '/legal/refund/', '/legal/terms/',
];
const urls = routes.map(route => {
  const file = join(site, route === '/' ? 'index.html' : route.slice(1) + 'index.html');
  const html = readFileSync(file, 'utf8');
  if (/name="robots"\s+content="[^"]*noindex/i.test(html)) return null;
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1];
  if (canonical !== `https://rigzea.com${route}`) {
    throw new Error(`${route}: expected canonical https://rigzea.com${route}, got ${canonical || 'none'}`);
  }
  return canonical;
}).filter(Boolean);

if (new Set(urls).size !== urls.length) throw new Error('Duplicate canonical URL in sitemap routes');
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n') + '\n' +
  `</urlset>\n`;
writeFileSync(join(site, 'sitemap.xml'), xml);
console.log(`sitemap.xml: ${urls.length} canonical URLs`);
