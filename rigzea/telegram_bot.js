/**
 * რიგზეა (Rigzea) Real Telegram Bot Service
 * Token: 8861565420:AAFhLSnnX8todrkJ5R5trg_EiG5MRSZfvPs
 * Username: @Rigzea_bot
 */

const fs = require('fs');
const path = require('path');

const TELEGRAM_BOT_TOKEN = '8861565420:AAFhLSnnX8todrkJ5R5trg_EiG5MRSZfvPs';
const SUPABASE_URL = 'https://pwasuamrqxyhhyqxfrjz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3YXN1YW1ycXh5aGh5cXhmcmp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MTk0NjgsImV4cCI6MjEwNjE5NTQ2OH0.f17SPN36R4k2uoUYgs1zWeiMVmMpcinaBkrBMFK8FC0';
const BASE_APP_URL = 'http://localhost:3000';

const LINKS_FILE = path.join(__dirname, 'telegram_links.json');

// Helper to load/save chat links
function loadChatLinks() {
  try {
    if (fs.existsSync(LINKS_FILE)) {
      return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error reading telegram links file:', e);
  }
  return {};
}

function saveChatLinks(links) {
  try {
    fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving telegram links file:', e);
  }
}

// Supabase RPC Helper
async function callRpc(functionName, params = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`RPC error [${res.status}] on ${functionName}:`, errText);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`Fetch error on RPC ${functionName}:`, e);
    return null;
  }
}

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
    ...extra
  });
}

// Smart NLP Message Parser for Georgian text
function parseGeorgianTaskText(rawText, apartments = []) {
  const text = rawText.trim();

  // 1. Extract amount (e.g., "170 ლარი", "170ლ", "₾170", "170 gel", "170")
  let amount = 0;
  const amountMatch = text.match(/(?:₾\s*(\d+(?:\.\d+)?))|(?:(\d+(?:\.\d+)?)\s*(?:ლარი|ლ|₾|gel|GEL))/i) || text.match(/\b(\d+)\s*(?:ლარი|ლ|₾)?\b/);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1] || amountMatch[2] || amountMatch[0]);
  }

  // 2. Match Apartment from Portfolio
  let matchedApt = null;
  for (const apt of apartments) {
    const unit = apt.unit_number || apt.name.match(/\d+/)?.[0];
    if (unit && new RegExp(`\\b${unit}(?:-ში|ში)?\\b`, 'i').test(text)) {
      matchedApt = apt;
      break;
    }
    if (text.toLowerCase().includes(apt.name.toLowerCase())) {
      matchedApt = apt;
      break;
    }
  }

  // 3. Extract Issue Title Cleanly
  let issueTitle = text;
  issueTitle = issueTitle.replace(/(?:₾\s*\d+(?:\.\d+)?)|(?:\d+(?:\.\d+)?\s*(?:ლარი|ლ|₾|gel|GEL))/gi, '');
  if (matchedApt) {
    const unit = matchedApt.unit_number || matchedApt.name.match(/\d+/)?.[0];
    if (unit) {
      issueTitle = issueTitle.replace(new RegExp(`\\b${unit}(?:-ში|ში)?\\b`, 'gi'), '');
    }
    issueTitle = issueTitle.replace(new RegExp(matchedApt.name, 'gi'), '');
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

// Main Update Dispatcher
async function handleUpdate(update) {
  if (!update.message || !update.message.text) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userName = msg.from.first_name || 'მმართველი';

  const chatLinks = loadChatLinks();
  let userOrg = chatLinks[chatId];

  // Check for UUID pattern in message (e.g. "95671f98-50fc-4d29-9a0c-b298639359d0" or "/link 95671f98...")
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  // ---------------------------------------------------------------------------
  // 1. COMMAND: Link Organization (UUID sent directly, with /link or with /start)
  // ---------------------------------------------------------------------------
  if (uuidMatch) {
    const orgId = uuidMatch[0].toLowerCase();
    const orgs = await callRpc('get_telegram_org', { p_org_id: orgId });

    if (orgs && orgs.length > 0) {
      const org = orgs[0];
      chatLinks[chatId] = {
        orgId: org.id,
        orgName: org.name,
        city: org.city || 'საქართველო',
        linkedAt: new Date().toISOString()
      };
      saveChatLinks(chatLinks);

      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით რიგზეას Telegram ასისტენტში, ${userName}!</b>\n\nთქვენი პროფილი წარმატებით დაუკავშირდა კომპანიას:\n🏢 <b>${org.name}</b> (${org.city || 'საქართველო'})\n\nახლა შეგიძლიათ პირდაპირ მომწეროთ ქართულად ნებისმიერი საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\n📌 <b>ბრძანებები:</b>\n/today — დღის საოპერაციო მდგომარეობა\n/apartments — ბინების სია\n/help — დახმარება`);
      return;
    } else {
      await sendMessage(chatId, `❌ ორგანიზაცია ID-ით (<code>${orgId}</code>) ვერ მოიძებნა.\nგთხოვთ გადაამოწმოთ გასაღები რიგზეას პარამეტრებში.`);
      return;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. COMMAND: /start
  // ---------------------------------------------------------------------------
  if (text.startsWith('/start')) {
    if (userOrg) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით, ${userName}!</b>\n\nთქვენი პროფილი დაკავშირებულია კომპანიასთან:\n🏢 <b>${userOrg.orgName}</b>\n\nუბრალოდ მომწერეთ ქართულად საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>`);
      return;
    }

    await sendMessage(chatId, `🇬🇪 <b>რიგზეას Telegram ასისტენტი</b>\n\nკომპანიის დასაკავშირებლად, გთხოვთ გადმოაგზავნოთ თქვენი კომპანიის გასაღები რიგზეას პარამეტრებიდან, მაგალითად:\n<code>95671f98-50fc-4d29-9a0c-b298639359d0</code>`);
    return;
  }

  // Ensure organization is linked
  if (!userOrg) {
    await sendMessage(chatId, `⚠️ <b>კომპანია ჯერ არ არის დაკავშირებული.</b>\n\nგთხოვთ გადმოაგზავნოთ თქვენი კომპანიის გასაღები (UUID) რიგზეას სისტემიდან:\n<code>/link თქვენი_გასაღები</code>`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 3. COMMAND: /apartments (List portfolio)
  // ---------------------------------------------------------------------------
  if (text === '/apartments') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    if (!apts || apts.length === 0) {
      await sendMessage(chatId, '🏢 თქვენს პორტფელში ბინები ჯერ არ არის დამატებული.\nდაამატეთ ბინა სისტემაში: http://localhost:3000/app/');
      return;
    }

    let response = `🏢 <b>აქტიური ბინების სია (${apts.length}):</b>\n\n`;
    apts.forEach((a, idx) => {
      response += `${idx + 1}. <b>${a.name}</b>\n   📍 ${a.address || 'მისამართი'} (№${a.unit_number || '—'})\n`;
    });
    response += `\n<i>საქმის დასამატებლად უბრალოდ მომწერეთ, მაგ: „${apts[0].unit_number || apts[0].name}-ში კონდიციონერი გაფუჭდა, 150 ლარია“</i>`;

    await sendMessage(chatId, response);
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. COMMAND: /today or /status (Daily Briefing)
  // ---------------------------------------------------------------------------
  if (text === '/today' || text === '/status') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    const aptCount = apts?.length || 0;

    let response = `📊 <b>დღის საოპერაციო მდგომარეობა — ${userOrg.orgName}</b>\n\n`;
    response += `• 🏢 <b>ბინების რაოდენობა:</b> ${aptCount}\n`;
    response += `• 🤖 <b>Telegram ასისტენტი:</b> აქტიურია\n\n`;
    response += `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში გახსნა ↗</a>`;

    await sendMessage(chatId, response);
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. COMMAND: /help
  // ---------------------------------------------------------------------------
  if (text === '/help') {
    await sendMessage(chatId, `ℹ️ <b>როგორ გამოვიყენოთ რიგზეას ბოტი:</b>\n\nუბრალოდ მომწერეთ საქმე ჩვეულებრივი ქართული ტექსტით, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\nრიგზეა ავტომატურად:\n1. ამოიცნობს ბინას და თანხას\n2. შექმნის საქმეს ბაზაში\n3. მოამზადებს მესაკუთრისთვის 1-Click თანხმობის ბმულს`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. NATURAL LANGUAGE MESSAGE PROCESSING (NLP EXTRACTION)
  // ---------------------------------------------------------------------------
  const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });

  if (!apts || apts.length === 0) {
    await sendMessage(chatId, '⚠️ პორტფელში ბინები ჯერ არ მოიძებნა. გთხოვთ ჯერ დაამატოთ ბინა სისტემაში: http://localhost:3000/app/');
    return;
  }

  const parsed = parseGeorgianTaskText(text, apts);

  if (!parsed.matchedApt) {
    let helpMsg = `⚠️ <b>ბინა ვერ ამოვიცანი ტექსტში.</b>\n\nგთხოვთ მიუთითოთ ბინის ნომერი ან სახელი, მაგალითად:\n• <i>${apts[0].unit_number || apts[0].name}-ში ${parsed.issueTitle}, ${parsed.amount > 0 ? parsed.amount + ' ლარი' : '150 ლარი'}</i>\n\n🏢 <b>თქვენი ბინები:</b>\n` + apts.slice(0, 5).map(a => `• ${a.name} (№${a.unit_number || '—'})`).join('\n');
    await sendMessage(chatId, helpMsg);
    return;
  }

  const apt = parsed.matchedApt;

  // Create Task and Approval atomically via Postgres RPC
  const createdRecord = await callRpc('telegram_create_task_record', {
    p_org_id: userOrg.orgId,
    p_apt_id: apt.id,
    p_title: parsed.issueTitle,
    p_description: `Telegram შეტყობინება (${userName}): „${parsed.rawText}“`,
    p_cost: parsed.amount,
    p_source: 'Telegram'
  });

  // Send response
  let confirmation = `✅ <b>საქმე შეიქმნა და შენახულია ბაზაში!</b>\n\n` +
    `🏢 <b>ბინა:</b> ${apt.name} (${apt.address || ''})\n` +
    `🛠 <b>საკითხი:</b> ${parsed.issueTitle}\n`;

  if (parsed.amount > 0 && createdRecord && createdRecord.token) {
    const approvalUrl = `${BASE_APP_URL}/app/index.html#approve?token=${createdRecord.token}`;
    confirmation += `💰 <b>თანხა:</b> ₾${parsed.amount}\n` +
      `📋 <b>სტატუსი:</b> თანხმობის მოლოდინში\n\n` +
      `🔗 <b>მესაკუთრის 1-Click თანხმობის ბმული:</b>\n` +
      `${approvalUrl}\n\n` +
      `<i>(გადაუგზავნეთ ეს ბმული მესაკუთრეს დასადასტურებლად)</i>`;
  } else {
    confirmation += `📋 <b>სტატუსი:</b> ახალი\n` +
      `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში ნახვა ↗</a>`;
  }

  await sendMessage(chatId, confirmation);
}

// Long-polling loop with automatic backoff
let lastUpdateId = 0;
async function pollTelegram() {
  while (true) {
    try {
      const res = await telegramRequest('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 20
      });

      if (res && res.ok && Array.isArray(res.result)) {
        for (const update of res.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          try {
            await handleUpdate(update);
          } catch (updateErr) {
            console.error('Error handling telegram update:', updateErr);
          }
        }
      }
    } catch (pollErr) {
      console.error('Telegram polling error:', pollErr);
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

console.log(`🤖 Rigzea Telegram Bot started successfully for @Rigzea_bot...`);
pollTelegram();
