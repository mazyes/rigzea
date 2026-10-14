/**
 * Shared helpers for the Telegram webhook and the reminder cron.
 * Files starting with "_" are not exposed as Vercel routes.
 * All secrets come from environment variables - nothing is hardcoded.
 */

import fs from 'node:fs';
import path from 'node:path';

export const BASE_APP_URL = process.env.APP_BASE_URL || 'https://rigzea.com';

export class ConfigError extends Error {}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new ConfigError(`Missing environment variable(s): ${missing.join(', ')}`);
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function telegramRequest(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    console.error(`Telegram API error on ${method}:`, e.message);
    return null;
  }
}

export function sendMessage(chatId, text, extra = {}) {
  return telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

// Supabase URL + anon key, the single source for every function. URL and key always come from the
// same place (both env vars, or both from the public rigzea/js/config.js), so a staging URL can never
// be paired with the production key. Empty values mean "not configured" and callers must say so.
let cachedPublic = null;
export function publicConfig() {
  if (cachedPublic) return cachedPublic;
  let url = process.env.SUPABASE_URL || '';
  let key = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    url = ''; key = '';
    const file = [path.join(process.cwd(), 'rigzea', 'js', 'config.js'), path.join(process.cwd(), 'js', 'config.js')].find(f => fs.existsSync(f));
    try {
      const src = fs.readFileSync(file, 'utf8');
      url = (src.match(/SUPABASE_URL:\s*['"]([^'"]+)['"]/) || [])[1] || '';
      key = (src.match(/SUPABASE_ANON_KEY:\s*['"]([^'"]+)['"]/) || [])[1] || '';
    } catch { /* missing file: the caller reports "not configured" */ }
  }
  cachedPublic = { url: url.replace(/\/$/, ''), key };
  return cachedPublic;
}
const supabaseUrl = () => publicConfig().url;

// Supabase RPC as the signed-in caller (their JWT, so RLS and role checks apply).
export async function callRpcAs(token, functionName, params = {}) {
  const { url, key } = publicConfig();
  try {
    const res = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return { ok: res.ok, status: res.status, data: res.ok ? await res.json().catch(() => null) : null };
  } catch (e) {
    console.error(`RPC ${functionName} error:`, e.message);
    return { ok: false, status: 0, data: null };
  }
}

// Supabase RPC with the service-role key (server only). Returns null on failure.
export async function callRpc(functionName, params = {}) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.error(`RPC ${functionName} failed: ${res.status}`);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    console.error(`RPC ${functionName} error:`, e.message);
    return null;
  }
}

export const fmtDate = (iso) => String(iso || '').split('-').reverse().join('.');

export function daysText(days) {
  if (days < 0) return `ვადა გასულია ${-days} დღის წინ`;
  if (days === 0) return 'იწურება დღეს';
  if (days === 1) return 'იწურება ხვალ';
  return `იწურება ${days} დღეში`;
}
