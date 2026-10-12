/**
 * Records an open or a contact tap on a public listing page and, when one is due,
 * tells the agent on Telegram. The page never waits on this and never sees an error from it.
 */

const SUPABASE_URL = 'https://cuioodytwyzykqlrjfej.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Link-preview fetchers and crawlers are not clients. Most never run the page's script, this catches the ones that do.
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|viber|headless|lighthouse|monitor|curl|wget|python|axios|node-fetch/i;

const KIND_LABEL = { view: '👀 ბმული გაიხსნა', whatsapp: '💬 WhatsApp-ით დაკავშირება', call: '📞 ზარის ღილაკზე დაჭერა' };

const escapeHtml = (v) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function fetchWithTimeout(url, options, ms = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

// One retry, then give up: the in-app notification written by the database is the reliable copy.
async function sendTelegram(chatId, text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return false; // blocked bot, bad chat: retrying will not help
    } catch (err) { /* timeout or network: try once more */ }
  }
  return false;
}

function messageFor(notify, appUrl) {
  const when = new Intl.DateTimeFormat('ka-GE', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date());
  // A link can be forwarded, so this names the link it came from, not the person who opened it.
  const source = notify.recipient ? `„${escapeHtml(notify.recipient)}“-სთვის გაგზავნილი ბმული` : 'ბინის საერთო ბმული';
  return `<b>${KIND_LABEL[notify.kind] || KIND_LABEL.view}</b>\n\n🏠 ${escapeHtml(notify.apartment_name)}\n🔗 ${source}\n🕒 ${when}\n\n<a href="${appUrl}/app/#/apartments/${notify.apartment_id}">ბინის გახსნა რიგზეაში</a>`;
}

export default async function handler(req, res) {
  // Always the same empty answer, so nothing about a listing can be learned from this endpoint.
  const done = () => res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_SERVICE_KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY is not set'); return done(); }
  if (BOT_UA.test(req.headers['user-agent'] || '')) return done();

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return done(); } }
  if (!body || typeof body !== 'object') return done();
  const ref = String(body.ref || '').slice(0, 100);
  const kind = String(body.kind || '');
  const visitor = String(body.visitor || '').toLowerCase();
  const recipient = body.recipient ? String(body.recipient).toLowerCase().slice(0, 24) : null;
  if (!ref || !['view', 'whatsapp', 'call'].includes(kind) || !/^[a-z0-9-]{8,64}$/.test(visitor)) return done();

  try {
    const rpc = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/record_link_event`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ref: ref, p_kind: kind, p_visitor: visitor, p_recipient: recipient }),
    }, 5000);
    if (!rpc.ok) { console.error('record_link_event failed', rpc.status); return done(); }
    const result = await rpc.json();

    const notify = result && result.notify;
    if (notify && TELEGRAM_BOT_TOKEN && Array.isArray(notify.chat_ids) && notify.chat_ids.length) {
      const text = messageFor(notify, `https://${req.headers.host}`);
      await Promise.all(notify.chat_ids.slice(0, 10).map(id => sendTelegram(id, text)));
    }
  } catch (err) {
    console.error('track failed', err);
  }
  return done();
}
