// Public listing page with Open Graph tags for link previews (WhatsApp, Facebook, Telegram, Viber).
// Routes (vercel.json): /p/<slug-or-id>/  and  /p/?id=<id>  →  /api/p?ref=...
// Returns rigzea/p/index.html with og:* tags and the listing JSON injected, so the
// page renders without a second request. Falls back to the plain page on any error.
import fs from 'node:fs';
import path from 'node:path';
import { publicConfig as config } from './_lib.js';

const ROOT = [path.join(process.cwd(), 'rigzea'), process.cwd()]
  .find(d => fs.existsSync(path.join(d, 'p', 'index.html'))) || path.join(process.cwd(), 'rigzea');
let cachedHtml = null;

function readHtml() {
  if (cachedHtml) return cachedHtml;
  cachedHtml = fs.readFileSync(path.join(ROOT, 'p', 'index.html'), 'utf8');
  return cachedHtml;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REF_RE = /^[A-Za-z0-9-]{3,80}$/;

async function fetchListing(ref) {
  const { url, key } = config();
  if (!url || !key) return { error: 'config' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_public_listing`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ref: ref }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { error: 'http_' + res.status };
    return { data: await res.json() };
  } catch (e) {
    return { error: String(e && e.name || e) };
  } finally {
    clearTimeout(timer);
  }
}

function money(n, cur) {
  const v = Number(n);
  if (!v) return '';
  const s = Math.round(v).toLocaleString('en-US');
  return cur === 'GEL' ? `${s} ₾` : `$${s}`;
}

function buildMeta(listing, pageUrl, whiteLabel) {
  const a = listing.apartment || {};
  const ag = listing.agency || {};
  const photos = (Array.isArray(a.photos) ? a.photos : [])
    .map((p, i) => (typeof p === 'string' ? { url: p, order: i } : p))
    .filter(p => p && p.url)
    .sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
  const isSale = a.transaction_type === 'sale';
  const salePrice = Number(a.sale_price || a.price || 0);
  const rentPrice = Number(a.monthly_rent || a.price || 0);
  const price = isSale ? money(salePrice, a.currency) : money(rentPrice, a.currency);
  const priceFacts = isSale
    ? (price && `${price} (იყიდება)`)
    : (price && `${price} / თვეში`);
  const facts = [
    priceFacts,
    a.rooms && `${a.rooms} ოთახი`,
    a.bathrooms && `${a.bathrooms} სვ. წერტილი`,
    a.area_sqm && `${Number(a.area_sqm)} მ²`,
    [a.district, a.city].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ');
  const desc = String(a.description || '').replace(/\s+/g, ' ').trim();
  const description = [facts, desc].filter(Boolean).join(' · ').slice(0, 280);
  const site = ag.name || (whiteLabel ? '' : 'Rigzea');
  const title = a.name || 'ბინა';
  const shareImg = photos[0]?.url || 'https://rigzea.com/img/og-preview.jpg';
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<link rel="canonical" href="${esc(pageUrl.split('?')[0])}" />`,
    site && `<meta property="og:site_name" content="${esc(site)}" />`,
    `<meta property="og:locale" content="ka_GE" />`,
    `<meta property="og:image" content="${esc(shareImg)}" />`,
    `<meta property="og:image:secure_url" content="${esc(shareImg)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(shareImg)}" />`,
  ].filter(Boolean).join('\n  ');
  return { tags, title: site ? `${title} · ${site}` : title };
}

export default async function handler(req, res) {
  let html;
  try { html = readHtml(); } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Listing page is missing');
  }

  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const ref = String(q.ref || q.id || q.p || q.apt || '').trim();
  const whiteLabel = q.wl === '1';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!REF_RE.test(ref)) {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.end(html);
  }

  const { data, error } = await fetchListing(ref);
  if (error || !data) {
    // Supabase unreachable: serve the plain page; it loads the listing in the browser.
    res.setHeader('Cache-Control', 'no-store');
    return res.end(html);
  }

  const found = data.success && data.apartment;
  const slug = found ? (data.apartment.slug || data.apartment.id) : ref;
  const pageUrl = `https://rigzea.com/p/${encodeURIComponent(slug)}/${whiteLabel ? '?wl=1' : ''}`;
  const boot = `<script>window.__RIGZEA_LISTING__=${JSON.stringify({ ref, data }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')};</script>`;

  let out = html;
  if (found) {
    const meta = buildMeta(data, pageUrl, whiteLabel);
    out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.title)}</title>\n  ${meta.tags}`);
  } else {
    res.statusCode = 404;
    out = out.replace(/<title>[\s\S]*?<\/title>/, '<title>განცხადება ვერ მოიძებნა</title>\n  <meta name="robots" content="noindex" />');
  }
  out = out.replace('</head>', `  ${boot}\n</head>`);
  res.setHeader('Cache-Control', found ? 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' : 'public, max-age=0, s-maxage=30');
  return res.end(out);
}

export { buildMeta };
