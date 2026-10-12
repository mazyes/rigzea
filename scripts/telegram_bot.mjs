// Local long-polling runner for @Rigzea_bot. Uses the same handler as the Vercel webhook (api/telegram.js).
// Run:  TELEGRAM_BOT_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/telegram_bot.mjs
// Do not run it while a webhook is set for the bot: Telegram delivers updates to one or the other.
import { handleUpdate, telegramRequest } from '../api/telegram.js';

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set TELEGRAM_BOT_TOKEN and SUPABASE_SERVICE_ROLE_KEY before running this script.');
  process.exit(1);
}

let lastUpdateId = 0;
console.log('Rigzea Telegram bot: polling for updates');
for (;;) {
  try {
    const res = await telegramRequest('getUpdates', { offset: lastUpdateId + 1, timeout: 20 });
    for (const update of (res && res.ok && Array.isArray(res.result)) ? res.result : []) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      try { await handleUpdate(update); } catch (err) { console.error('Update failed:', err); }
    }
  } catch (err) {
    console.error('Polling error:', err);
    await new Promise(r => setTimeout(r, 4000));
  }
}
