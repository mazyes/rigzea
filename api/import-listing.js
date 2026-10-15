// Smart import: POST { url } → normalized listing fields for the "new property" form.
// Reads one public listing page from MyHome.ge, SS.ge or Place.ge on behalf of a signed-in user.
// No paid services: a single fetch and local parsing (api/_import-parse.js).
import { publicConfig as config } from './_lib.js';
import { hostOf, parseListing } from './_import-parse.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_BYTES = 3 * 1024 * 1024;
// Stay inside the default function time limit, so a slow site gets our message instead of a gateway error.
const FETCH_TIMEOUT_MS = 8000;

const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

// Only signed-in users may import, so the route cannot be used as an open page fetcher.
async function isSignedIn(req) {
  const token = bearer(req);
  const { url, key } = config();
  if (!token) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch { return false; }
}

// Link import is a paid feature: the database says whether the caller's own workspace includes it.
async function planAllowsImport(req, org) {
  const { url, key } = config();
  if (!/^[0-9a-f-]{36}$/i.test(String(org || ''))) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/my_org_has_feature`, { method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${bearer(req)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_org: org, p_feature: 'import' }) });
    return res.ok && (await res.json()) === true;
  } catch { return false; }
}

// Per-user import budget: 10 an hour. Counted in the database so it holds across serverless
// instances (supabase/patches/20_import_rate_limit.sql). Fails open: if the helper is not
// deployed yet the import still works, so the cap never becomes an outage.
const IMPORT_LIMIT_PER_HOUR = 10;
async function withinImportBudget(req, org) {
  const { url, key } = config();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/register_import`, { method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${bearer(req)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_org: org, p_limit: IMPORT_LIMIT_PER_HOUR }) });
    if (!res.ok) { console.error('import-listing: register_import', res.status); return true; }
    return (await res.json()) === true;
  } catch (err) { console.error('import-listing: register_import', err && err.message); return true; }
}

async function fetchPage(url, site) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
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
      const chunks = [];
      let total = 0;
      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.byteLength;
          if (total >= MAX_BYTES) {
            try { ctrl.abort(); } catch {}
            break;
          }
        }
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        chunks.push(buf);
      }
      const combined = Buffer.concat(chunks.map(c => Buffer.from(c)));
      return { status: 200, html: combined.subarray(0, MAX_BYTES).toString('utf8') };
    }
    return { status: 502 };
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  // A server problem must not look like an expired session to the user.
  if (!config().url || !config().key) return res.status(503).json({ ok: false, error: 'not_configured', message: 'სერვისი დროებით მიუწვდომელია. შეავსე ველები ხელით.' });
  if (!(await isSignedIn(req))) return res.status(401).json({ ok: false, error: 'auth', message: 'სესია ამოიწურა. შედი ანგარიშში თავიდან და სცადე ხელახლა.' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  if (!/^[0-9a-f-]{36}$/i.test(String(body.org || ''))) return res.status(400).json({ ok: false, error: 'org', message: 'სამუშაო სივრცე ვერ განისაზღვრა. განაახლე გვერდი და სცადე ხელახლა.' });
  if (!(await planAllowsImport(req, body.org))) return res.status(403).json({ ok: false, error: 'plan', message: 'ბმულით შევსება შენს პაკეტში არ შედის. ხელმისაწვდომია „პრო აგენტი“ პაკეტიდან.' });
  if (String(body.url || '').length > 600) return res.status(400).json({ ok: false, error: 'url', message: 'ბმული ძალიან გრძელია. ჩასვი განცხადების პირდაპირი ბმული.' });
  const target = hostOf(body.url);
  if (!target) return res.status(400).json({ ok: false, error: 'url', message: 'ჩასვი განცხადების ბმული MyHome.ge-დან, SS.ge-დან ან Place.ge-დან.' });
  // Charged only for a real read, after the URL is known to be one of the three sites.
  if (!(await withinImportBudget(req, body.org))) return res.status(429).json({ ok: false, error: 'rate_limit', message: 'საათში მაქსიმუმ 10 განცხადების ჩატვირთვა შეიძლება. სცადე ცოტა ხანში ან შეავსე ველები ხელით.' });

  try {
    const page = await fetchPage(target.url, target.site);
    if (page.status !== 200) {
      const blocked = [401, 403, 429, 503].includes(page.status);
      const gone = [404, 410].includes(page.status);
      return res.status(502).json({ ok: false, error: blocked ? 'blocked' : gone ? 'gone' : 'fetch', source_status: page.status,
        message: blocked ? 'საიტმა ავტომატური წაკითხვა დაბლოკა. შეავსე ველები ხელით ან სცადე მოგვიანებით.'
          : gone ? 'განცხადება ვერ მოიძებნა: შესაძლოა წაშლილია ან ბმული არასრულია.'
          : 'განცხადების საიტი ახლა არ პასუხობს. სცადე ცოტა ხანში ან შეავსე ველები ხელით.' });
    }
    const listing = parseListing(target.site, page.html);
    if (!listing) return res.status(422).json({ ok: false, error: 'parse', message: 'ამ გვერდზე განცხადების მონაცემები ვერ ვიპოვეთ. ჩასვი კონკრეტული განცხადების ბმული.' });
    return res.status(200).json({ ok: true, listing });
  } catch (err) {
    const timedOut = err && err.name === 'AbortError';
    console.error('import-listing:', err && err.message);
    return res.status(502).json({ ok: false, error: timedOut ? 'timeout' : 'fetch',
      message: timedOut ? 'განცხადების საიტი ძალიან ნელა პასუხობს. სცადე ხელახლა ან შეავსე ველები ხელით.' : 'განცხადება ვერ წავიკითხეთ. სცადე ხელახლა ან შეავსე ველები ხელით.' });
  }
};
