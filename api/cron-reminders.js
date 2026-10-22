/**
 * Daily reminder job (Vercel Cron, 05:00 UTC = 09:00 Asia/Tbilisi).
 * 1. scan_lease_renewals() creates in-app notifications (30 / 14 / 3 days before lease_end).
 * 2. Unsent renewal / overdue notifications are delivered to linked Telegram chats and marked sent.
 * Vercel calls this with "Authorization: Bearer $CRON_SECRET".
 */
import { timingSafeEqual } from 'node:crypto';
import { BASE_APP_URL, requireEnv, esc, sendMessage, callRpc } from './_lib.js';

function authorized(req) {
  const given = String(req.headers.authorization || '');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Authenticate before anything else, so callers without the secret learn nothing about the config.
  if (!process.env.CRON_SECRET || !authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  try {
    requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  } catch (e) {
    console.error(e.message);
    return res.status(500).json({ ok: false, error: 'Server is not configured' });
  }

  const flagged = await callRpc('scan_lease_renewals', {});
  if (flagged === null) return res.status(502).json({ ok: false, error: 'scan_lease_renewals failed (is supabase/patches/03_renewals.sql applied?)' });
  await callRpc('scan_alerts', {}); // also create overdue-task notifications

  // In-app notifications above work without Telegram; delivery is skipped when the bot isn't configured.
  if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(200).json({ ok: true, renewals_flagged: flagged, telegram: 'not configured' });

  const pending = (await callRpc('pending_telegram_notifications', { p_limit: 200 })) || [];
  let sent = 0, failed = 0;
  const deliver = async (n) => {
    const icon = n.type === 'renewal' ? '📅' : '⏰';
    const link = n.link && n.link.startsWith('/') ? `${BASE_APP_URL}${n.link}` : `${BASE_APP_URL}/app/`;
    const text = `${icon} <b>${esc(n.title)}</b>\n${esc(n.message || '')}\n\n🔗 <a href="${esc(link)}">გახსენი რიგზეაში</a>`;
    const r = await sendMessage(n.chat_id, text);
    if (r && r.ok) {
      sent++;
      await callRpc('mark_telegram_sent', { p_ids: n.ids });
    } else if (r && r.error_code === 403) {
      // The user blocked the bot or left the chat: stop retrying this one.
      await callRpc('mark_telegram_sent', { p_ids: n.ids });
      failed++;
    } else {
      failed++; // transient failure: stays unsent, retried on the next run
    }
  };
  // Small parallel batches stay under Telegram's rate limit and finish well within maxDuration.
  for (let i = 0; i < pending.length; i += 10) await Promise.all(pending.slice(i, i + 10).map(deliver));
  await callRpc('close_stale_telegram_notifications', {});

  return res.status(200).json({ ok: true, renewals_flagged: flagged, telegram_sent: sent, telegram_failed: failed });
}
