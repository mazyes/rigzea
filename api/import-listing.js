// Smart import: POST { url } → normalized listing fields for the "new property" form.
// Reads one public listing page from MyHome.ge, SS.ge or Place.ge on behalf of a signed-in user.
// No paid services: a single fetch and local parsing (api/_import-parse.js).
const fs = require('fs');
const path = require('path');
const { hostOf, parseListing } = require('./_import-parse.js');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 3 * 1024 * 1024;
let cachedCfg = null;

// Supabase URL + anon key: env vars first, otherwise the public values in rigzea/js/config.js.
function config() {
  if (cachedCfg) return cachedCfg;
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    for (const root of [path.join(__dirname, '..', 'rigzea'), path.join(process.cwd(), 'rigzea')]) {
      try {
        const src = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
        url = url || (src.match(/SUPABASE_URL:\s*['"]([^'"]+)['"]/) || [])[1] || '';
        key = key || (src.match(/SUPABASE_ANON_KEY:\s*['"]([^'"]+)['"]/) || [])[1] || '';
        break;
      } catch { /* try the next location */ }
    }
  }
  cachedCfg = { url: url.replace(/\/$/, ''), key };
  return cachedCfg;
}

// Only signed-in users may import, so the route cannot be used as an open page fetcher.
async function isSignedIn(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const { url, key } = config();
  if (!token || !url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch { return false; }
}

async function fetchPage(url, site) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'ka,en;q=0.8', Accept: 'text/html,application/xhtml+xml' } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        // Redirects are followed only while they stay on the same site.
        const next = hostOf(new URL(res.headers.get('location'), current).toString());
        if (!next || next.site !== site) return { status: 502 };
        current = next.url;
        continue;
      }
      if (!res.ok) return { status: res.status };
      const buf = Buffer.from(await res.arrayBuffer());
      return { status: 200, html: buf.subarray(0, MAX_BYTES).toString('utf8') };
    }
    return { status: 502 };
  } finally { clearTimeout(timer); }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  if (!(await isSignedIn(req))) return res.status(401).json({ ok: false, error: 'auth', message: 'იმპორტისთვის საჭიროა ანგარიშში შესვლა.' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const target = hostOf(body.url);
  if (!target) return res.status(400).json({ ok: false, error: 'url', message: 'ჩასვი განცხადების ბმული MyHome.ge-დან, SS.ge-დან ან Place.ge-დან.' });

  try {
    const page = await fetchPage(target.url, target.site);
    if (page.status !== 200) {
      const blocked = [401, 403, 429, 503].includes(page.status);
      return res.status(502).json({ ok: false, error: blocked ? 'blocked' : 'fetch', message: blocked ? 'საიტმა ავტომატური წაკითხვა დაბლოკა. შეავსე ველები ხელით ან სცადე მოგვიანებით.' : 'განცხადება ვერ გაიხსნა. შეამოწმე ბმული.' });
    }
    const listing = parseListing(target.site, page.html);
    if (!listing) return res.status(422).json({ ok: false, error: 'parse', message: 'ამ გვერდზე განცხადების მონაცემები ვერ ვიპოვეთ. ჩასვი კონკრეტული განცხადების ბმული.' });
    return res.status(200).json({ ok: true, listing });
  } catch (err) {
    console.error('import-listing:', err && err.message);
    return res.status(502).json({ ok: false, error: 'fetch', message: 'განცხადება ვერ წავიკითხეთ. სცადე ხელახლა ან შეავსე ველები ხელით.' });
  }
};
