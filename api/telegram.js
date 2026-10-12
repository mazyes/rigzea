/**
 * რიგზეა (Rigzea) - Vercel Serverless Telegram Webhook Handler
 * Bot: @Rigzea_bot
 */

// Set in the environment (Vercel project settings, or the shell for local polling). Never hardcode it.
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = 'https://cuioodytwyzykqlrjfej.supabase.co';
// Server-only key. The bot's database functions no longer accept the public anon key.
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Optional: set the same value as the webhook's secret_token so only Telegram can call this endpoint.
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BASE_APP_URL = 'https://rigzea-website.vercel.app';

// Telegram API Helper
async function telegramRequest(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    console.error(`Telegram API error on ${method}:`, e);
    return null;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return await telegramRequest('sendMessage', {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra
  });
}

// Supabase RPC Helper
async function callRpc(functionName, params = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Supabase REST Helper
async function queryRest(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, options);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// Georgian NLP Parser
function parseGeorgianTaskText(rawText, apartments = []) {
  const text = rawText.trim();

  // 1. Amount
  let amount = 0;
  const amountMatch = text.match(/(?:₾\s*(\d+(?:\.\d+)?))|(?:(\d+(?:\.\d+)?)\s*(?:ლარი|ლ|₾|gel|GEL))/i) || text.match(/\b(\d+)\s*(?:ლარი|ლ|₾)?\b/);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1] || amountMatch[2] || amountMatch[0]);
  }

  // 2. Match Apartment
  let matchedApt = null;
  for (const apt of apartments) {
    const name = apt.name || apt.title || '';
    const unit = apt.unit_number || name.match(/\d+/)?.[0];
    if (unit && new RegExp(`\\b${unit}(?:-ში|ში)?\\b`, 'i').test(text)) {
      matchedApt = apt;
      break;
    }
    if (name && text.toLowerCase().includes(name.toLowerCase())) {
      matchedApt = apt;
      break;
    }
  }

  // 3. Extract Issue Title Cleanly
  let issueTitle = text;
  issueTitle = issueTitle.replace(/(?:₾\s*\d+(?:\.\d+)?)|(?:\d+(?:\.\d+)?\s*(?:ლარი|ლ|₾|gel|GEL))/gi, '');
  if (matchedApt) {
    const name = matchedApt.name || matchedApt.title || '';
    const unit = matchedApt.unit_number || name.match(/\d+/)?.[0];
    if (unit) {
      issueTitle = issueTitle.replace(new RegExp(`\\b${unit}(?:-ში|ში)?\\b`, 'gi'), '');
    }
    if (name) {
      issueTitle = issueTitle.replace(new RegExp(name, 'gi'), '');
    }
  }
  issueTitle = issueTitle.replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
  if (!issueTitle) issueTitle = 'სარემონტო / საოპერაციო სამუშაო';

  return {
    matchedApt,
    amount,
    issueTitle: issueTitle.charAt(0).toUpperCase() + issueTitle.slice(1),
    rawText: text
  };
}

// Main Telegram Update Handler
async function handleUpdate(update) {
  if (!update || !update.message || !update.message.text) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userName = msg.from.first_name || 'მმართველი';

  // 1. Linking: a one-time code created in the app (Settings > Telegram), sent as "/start CODE" or on its own.
  const codeMatch = text.match(/^(?:\/start\s+)?([A-Fa-f0-9]{10})$/);
  if (codeMatch) {
    const linkRes = await callRpc('redeem_telegram_link_code', { p_code: codeMatch[1], p_chat_id: chatId, p_user_name: userName });
    if (linkRes && linkRes.success) {
      await sendMessage(chatId, `✅ <b>Telegram დაკავშირებულია, ${userName}!</b>\n\nკომპანია: <b>${linkRes.org_name}</b>\n\nაქ მიიღებთ შეტყობინებას, როცა კლიენტი თქვენს ბმულს გახსნის.\n\n📌 <b>ბრძანებები:</b>\n/today: დღის მდგომარეობა\n/apartments: ბინების სია\n/help: დახმარება`);
    } else {
      await sendMessage(chatId, `❌ კოდი არასწორია ან ვადა გაუვიდა.\n\nგახსენით რიგზეა, გადადით „პარამეტრები“ > „Telegram“ და შექმენით ახალი კოდი. კოდი 15 წუთი მოქმედებს.`);
    }
    return;
  }

  // 2. Check Linked Org
  let userOrg = await callRpc('get_linked_telegram_org', { p_chat_id: chatId });

  // 3. /start Command
  if (text.startsWith('/start')) {
    if (userOrg && userOrg.orgName) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით, ${userName}!</b>\n\nთქვენი პროფილი დაკავშირებულია კომპანიასთან:\n🏢 <b>${userOrg.orgName}</b>\n\nუბრალოდ მომწერეთ ქართულად საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>`);
      return;
    }

    await sendMessage(chatId, `🇬🇪 <b>რიგზეას Telegram ასისტენტი</b>\n\nკომპანიის დასაკავშირებლად გახსენით რიგზეა, გადადით „პარამეტრები“ > „Telegram“ და დააჭირეთ „დაკავშირებას“.`);
    return;
  }

  // 4. Require Linked Org for further actions
  if (!userOrg || !userOrg.orgId) {
    await sendMessage(chatId, `⚠️ <b>კომპანია ჯერ არ არის დაკავშირებული.</b>\n\nგახსენით რიგზეა, გადადით „პარამეტრები“ > „Telegram“ და დააჭირეთ „დაკავშირებას“.`);
    return;
  }

  // 5. /apartments Command
  if (text === '/apartments') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    if (!apts || apts.length === 0) {
      await sendMessage(chatId, `🏢 თქვენს პორტფელში ბინები ჯერ არ არის დამატებული.\nდაამატეთ ბინა სისტემაში: ${BASE_APP_URL}/app/`);
      return;
    }

    let response = `🏢 <b>აქტიური ბინების სია (${apts.length}):</b>\n\n`;
    apts.forEach((a, idx) => {
      response += `${idx + 1}. <b>${a.name || a.title}</b>\n   📍 ${a.address || 'მისამართი'} (№${a.unit_number || '-'})\n`;
    });
    response += `\n<i>საქმის დასამატებლად უბრალოდ მომწერეთ, მაგ: „${apts[0].unit_number || apts[0].name}-ში კონდიციონერი გაფუჭდა, 150 ლარია“</i>`;

    await sendMessage(chatId, response);
    return;
  }

  // 6. /today or /status Command
  if (text === '/today' || text === '/status') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    const aptCount = apts?.length || 0;

    let response = `📊 <b>დღის საოპერაციო მდგომარეობა: ${userOrg.orgName}</b>\n\n`;
    response += `• 🏢 <b>ბინების რაოდენობა:</b> ${aptCount}\n`;
    response += `• 🤖 <b>Telegram ასისტენტი:</b> აქტიურია (Serverless 24/7)\n\n`;
    response += `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში გახსნა</a>`;

    await sendMessage(chatId, response);
    return;
  }

  // 7. /help Command
  if (text === '/help') {
    await sendMessage(chatId, `ℹ️ <b>როგორ გამოვიყენოთ რიგზეას ბოტი:</b>\n\nუბრალოდ მომწერეთ საქმე ჩვეულებრივი ქართული ტექსტით, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\nრიგზეა ავტომატურად:\n1. ამოიცნობს ბინას და თანხას\n2. შექმნის საქმეს ბაზაში\n3. მოამზადებს მესაკუთრისთვის 1-Click თანხმობის ბმულს`);
    return;
  }

  // 8. Natural Language Message Parsing
  const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });

  if (!apts || apts.length === 0) {
    await sendMessage(chatId, `⚠️ პორტფელში ბინები ჯერ არ მოიძებნა. გთხოვთ ჯერ დაამატოთ ბინა სისტემაში: ${BASE_APP_URL}/app/`);
    return;
  }

  const parsed = parseGeorgianTaskText(text, apts);

  if (!parsed.matchedApt) {
    let helpMsg = `⚠️ <b>ბინა ვერ ამოვიცანი ტექსტში.</b>\n\nგთხოვთ მიუთითოთ ბინის ნომერი ან სახელი, მაგალითად:\n• <i>${apts[0].unit_number || apts[0].name}-ში ${parsed.issueTitle}, ${parsed.amount > 0 ? parsed.amount + ' ლარი' : '150 ლარი'}</i>\n\n🏢 <b>თქვენი ბინები:</b>\n` + apts.slice(0, 5).map(a => `• ${a.name || a.title} (№${a.unit_number || '-'})`).join('\n');
    await sendMessage(chatId, helpMsg);
    return;
  }

  const apt = parsed.matchedApt;

  // Create Task & Approval atomically via Postgres RPC
  const createdRecord = await callRpc('telegram_create_task_record', {
    p_org_id: userOrg.orgId,
    p_apt_id: apt.id,
    p_title: parsed.issueTitle,
    p_description: `Telegram შეტყობინება (${userName}): „${parsed.rawText}“`,
    p_cost: parsed.amount,
    p_source: 'Telegram'
  });

  // Response text
  let confirmation = `✅ <b>საქმე შეიქმნა და შენახულია ბაზაში!</b>\n\n` +
    `🏢 <b>ბინა:</b> ${apt.name || apt.title} (${apt.address || ''})\n` +
    `🛠 <b>საკითხი:</b> ${parsed.issueTitle}\n`;

  if (parsed.amount > 0 && createdRecord && createdRecord.token) {
    const approvalUrl = `${BASE_APP_URL}/approve/?token=${createdRecord.token}`;
    confirmation += `💰 <b>თანხა:</b> ₾${parsed.amount}\n` +
      `📋 <b>სტატუსი:</b> თანხმობის მოლოდინში\n\n` +
      `🔗 <b>მესაკუთრის 1-Click თანხმობის ბმული:</b>\n` +
      `${approvalUrl}\n\n` +
      `<i>(გადაუგზავნეთ ეს ბმული მესაკუთრეს დასადასტურებლად)</i>`;
  } else {
    confirmation += `📋 <b>სტატუსი:</b> ახალი\n` +
      `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში ნახვა</a>`;
  }

  await sendMessage(chatId, confirmation);
}

// Vercel Serverless Function Handler
export default async function handler(req, res) {
  if (!TELEGRAM_BOT_TOKEN || !SUPABASE_SERVICE_KEY) {
    console.error('TELEGRAM_BOT_TOKEN or SUPABASE_SERVICE_ROLE_KEY is not set');
    return res.status(500).json({ ok: false, error: 'bot is not configured' });
  }
  if (WEBHOOK_SECRET && req.method === 'POST' && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Rigzea Telegram Webhook is active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;
    if (update) {
      await handleUpdate(update);
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ ok: false, error: error.message });
  }
}

// Shared with scripts/telegram_bot.mjs, the local long-polling runner.
export { handleUpdate, telegramRequest };
