/**
 * Public link statistics with an instant Telegram message: POST { ref, kind, visitor, selection }
 * from the listing page (/p/...). Counts the event exactly like the track_link_event RPC and
 * tells the linked Telegram chats that the link was opened or a contact button was pressed.
 * Dedup, rate limits and the hourly notification cap live in the database
 * (track_link_event_notify, supabase/patches/14_reminders_live.sql).
 * When the server is not configured it answers 503 and the page falls back to the plain RPC.
 */
import { BASE_APP_URL, requireEnv, esc, sendMessage, callRpc } from './_lib.js';

const TITLE = { view: '👀 ბმული გაიხსნა', whatsapp: '💬 WhatsApp-ის ღილაკს დააჭირეს', call: '📞 ზარის ღილაკს დააჭირეს' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  try {
    requireEnv('TELEGRAM_BOT_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY');
  } catch (e) {
    console.error(e.message);
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const ref = String(body.ref || '');
  if (!TITLE[body.kind] || !/^[A-Za-z0-9-]{3,100}$/.test(ref)) return res.status(400).json({ ok: false, error: 'input' });

  const out = await callRpc('track_link_event_notify', {
    p_ref: ref, p_kind: body.kind, p_visitor: String(body.visitor || '').slice(0, 64) || null,
    p_selection_id: UUID_RE.test(String(body.selection || '')) ? body.selection : null,
  });
  if (out === null) return res.status(502).json({ ok: false, error: 'rpc' });

  const n = out.notify;
  if (n && Array.isArray(n.chat_ids) && n.chat_ids.length) {
    const text = `${TITLE[n.kind]}\n<b>${esc(n.apartment_name)}</b>\n\n🔗 <a href="${esc(`${BASE_APP_URL}/app/apartments/?id=${n.apartment_id}`)}">გახსენი რიგზეაში</a>`;
    await Promise.all(n.chat_ids.map((id) => sendMessage(id, text)));
  }
  return res.status(200).json({ ok: true, counted: Boolean(out.counted) });
}
