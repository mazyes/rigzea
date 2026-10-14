/**
 * რიგზეა (Rigzea) - Vercel Serverless Telegram Webhook Handler
 * Bot: @Rigzeabot
 */

import { timingSafeEqual } from 'node:crypto';
import { BASE_APP_URL, requireEnv, esc, sendMessage, callRpc, fmtDate, daysText } from './_lib.js';

const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "ლ" alone must not start a word: "7 ლამპა" is not 7 lari.
const MONEY_RE = /(?:₾\s*(\d+(?:\.\d+)?))|(?:(\d+(?:\.\d+)?)\s*(?:ლარი|ლ(?![ა-ჰ])|₾|gel\b))/i;

// Georgian NLP Parser
function parseGeorgianTaskText(rawText, apartments = []) {
  const text = rawText.trim();

  // 1. Amount
  let amount = 0;
  // A number only counts as money next to a currency word. Without this, "1204-ში" or "18-ში" (the
  // apartment number) became the amount and the bot sent the owner an approval link for it.
  const amountMatch = text.match(MONEY_RE);
  if (amountMatch) {
    amount = parseFloat(amountMatch[1] || amountMatch[2] || amountMatch[0]);
  }

  // 2. Match Apartment
  let matchedApt = null;
  for (const apt of apartments) {
    const name = apt.name || apt.title || '';
    const unit = apt.unit_number || name.match(/\d+/)?.[0];
    if (unit && new RegExp(`\\b${escapeRegExp(unit)}(?:-ში|ში)?\\b`, 'i').test(text)) {
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
  issueTitle = issueTitle.replace(new RegExp(MONEY_RE.source, 'gi'), '');
  if (matchedApt) {
    const name = matchedApt.name || matchedApt.title || '';
    const unit = matchedApt.unit_number || name.match(/\d+/)?.[0];
    if (unit) {
      issueTitle = issueTitle.replace(new RegExp(`\\b${escapeRegExp(unit)}(?:-ში|ში)?\\b`, 'gi'), '');
    }
    if (name) {
      issueTitle = issueTitle.replace(new RegExp(escapeRegExp(name), 'gi'), '');
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

  const safeName = esc(userName);

  // 1. Link a company with a one-time code: "/start CODE" or "/link CODE"
  const codeMatch = text.match(/^\/(?:start|link)(?:@\w+)?\s+([A-Za-z0-9]{6,12})\s*$/);
  if (codeMatch) {
    const linkRes = await callRpc('consume_telegram_link_code', { p_code: codeMatch[1], p_chat_id: chatId, p_user_name: userName });
    if (linkRes && linkRes.success) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით რიგზეას ასისტენტში, ${safeName}!</b>\n\nთქვენი Telegram წარმატებით დაუკავშირდა:\n🏢 <b>${esc(linkRes.org_name)}</b> (${esc(linkRes.city || 'საქართველო')})\n\nხელშეკრულებების ვადისა და ვადაგადაცილებული საქმეების შეხსენებებს აქ მიიღებთ. ასევე შეგიძლიათ პირდაპირ მომწეროთ ქართულად ნებისმიერი საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\n📌 <b>ბრძანებები:</b>\n/today: დღის საოპერაციო მდგომარეობა\n/apartments: ბინების სია\n/renewals: იწურება ხელშეკრულებები\n/help: დახმარება`);
    } else {
      await sendMessage(chatId, `❌ კოდი არასწორია ან მისი ვადა გაუვიდა.\nკოდი მოქმედებს 15 წუთის განმავლობაში და მხოლოდ ერთხელ. რიგზეაში შექმენით ახალი კოდი და გამომიგზავნეთ ხელახლა.`);
    }
    return;
  }

  // Old raw-UUID linking is disabled: the id is not a secret.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) {
    await sendMessage(chatId, `⚠️ კომპანიის გასაღებით დაკავშირება აღარ მუშაობს უსაფრთხოების მიზეზით.\nრიგზეაში დააჭირეთ „Telegram-ის დაკავშირებას“ და გამომიგზავნეთ ერთჯერადი კოდი: <code>/start კოდი</code>`);
    return;
  }

  // 2. Check Linked Org
  let userOrg = await callRpc('get_linked_telegram_org', { p_chat_id: chatId });

  // 3. /start Command
  if (text.startsWith('/start')) {
    if (userOrg && userOrg.orgName) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით, ${safeName}!</b>\n\nთქვენი პროფილი დაკავშირებულია კომპანიასთან:\n🏢 <b>${esc(userOrg.orgName)}</b>\n\nუბრალოდ მომწერეთ ქართულად საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>`);
      return;
    }

    await sendMessage(chatId, `🇬🇪 <b>რიგზეას Telegram ასისტენტი</b>\n\nკომპანიის დასაკავშირებლად გახსენით რიგზეას მთავარი გვერდი („დღეს“), დააჭირეთ ღილაკს „Telegram-ის დაკავშირება“ და გამომიგზავნეთ მიღებული კოდი:\n<code>/start კოდი</code>`);
    return;
  }

  // 4. Require Linked Org for further actions
  if (!userOrg || !userOrg.orgId) {
    await sendMessage(chatId, `⚠️ <b>კომპანია ჯერ არ არის დაკავშირებული.</b>\n\nრიგზეაში დააჭირეთ ღილაკს „Telegram-ის დაკავშირება“ და გამომიგზავნეთ მიღებული კოდი:\n<code>/start კოდი</code>`);
    return;
  }

  // In group chats Telegram sends commands as "/today@Rigzeabot".
  const cmd = text.startsWith('/') ? text.split(/\s/)[0].replace(/@\w+$/, '').toLowerCase() : '';

  // 5. /apartments Command
  if (cmd === '/apartments') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    if (!apts || apts.length === 0) {
      await sendMessage(chatId, `🏢 თქვენს პორტფელში ბინები ჯერ არ არის დამატებული.\nდაამატეთ ბინა სისტემაში: ${BASE_APP_URL}/app/`);
      return;
    }

    let response = `🏢 <b>აქტიური ბინების სია (${apts.length}):</b>\n\n`;
    apts.forEach((a, idx) => {
      response += `${idx + 1}. <b>${esc(a.name || a.title || '')}</b>\n   📍 ${esc(a.address || 'მისამართი')} (№${esc(a.unit_number || '–')})\n`;
    });
    const sampleUnit = apts[0]?.unit_number || apts[0]?.name || '';
    response += `\n<i>საქმის დასამატებლად უბრალოდ მომწერეთ, მაგ: „${esc(sampleUnit)}-ში კონდიციონერი გაფუჭდა, 150 ლარია“</i>`;

    await sendMessage(chatId, response);
    return;
  }

  // 6. /today or /status Command
  if (cmd === '/today' || cmd === '/status') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    const aptCount = apts?.length || 0;

    let response = `📊 <b>დღის საოპერაციო მდგომარეობა: ${esc(userOrg.orgName)}</b>\n\n`;
    response += `• 🏢 <b>ბინების რაოდენობა:</b> ${aptCount}\n`;
    response += `• 🤖 <b>Telegram ასისტენტი:</b> აქტიურია (Serverless 24/7)\n\n`;
    response += `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში გახსნა</a>`;

    await sendMessage(chatId, response);
    return;
  }

  // 6b. /renewals Command
  if (cmd === '/renewals') {
    const list = await callRpc('get_telegram_renewals', { p_org_id: userOrg.orgId, p_days: 30 });
    if (!list || list.length === 0) {
      await sendMessage(chatId, `📅 მომდევნო 30 დღეში ვადამიწურებადი ხელშეკრულება არ არის.`);
      return;
    }
    let response = `📅 <b>ხელშეკრულებები, რომლებიც 30 დღეში იწურება (${list.length}):</b>\n\n`;
    list.slice(0, 40).forEach((r) => {
      response += `${r.days_left <= 3 ? '🔴' : '🟡'} <b>${esc(r.name)}</b>${r.tenant_name ? ` · ${esc(r.tenant_name)}` : ''}\n   ${fmtDate(r.lease_end)}, ${daysText(r.days_left)}\n`;
    });
    response += `\n🔗 <a href="${BASE_APP_URL}/app/">გაგრძელება სისტემაში</a>`;
    await sendMessage(chatId, response);
    return;
  }

  // 7. /help Command
  if (cmd === '/help') {
    await sendMessage(chatId, `ℹ️ <b>როგორ გამოვიყენოთ რიგზეას ბოტი:</b>\n\nუბრალოდ მომწერეთ საქმე ჩვეულებრივი ქართული ტექსტით, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\nბრძანებები: /today, /apartments, /renewals\n\nრიგზეა ავტომატურად:\n1. ამოიცნობს ბინას და თანხას\n2. შექმნის საქმეს ბაზაში\n3. მოამზადებს მესაკუთრისთვის 1-Click თანხმობის ბმულს`);
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
    const sampleUnit = apts[0]?.unit_number || apts[0]?.name || '';
    let helpMsg = `⚠️ <b>ბინა ვერ ამოვიცანი ტექსტში.</b>\n\nგთხოვთ მიუთითოთ ბინის ნომერი ან სახელი, მაგალითად:\n• <i>${esc(sampleUnit)}-ში ${esc(parsed.issueTitle)}, ${parsed.amount > 0 ? parsed.amount + ' ლარი' : '150 ლარი'}</i>\n\n🏢 <b>თქვენი ბინები:</b>\n` + apts.slice(0, 5).map(a => `• ${esc(a.name || a.title || '')} (№${esc(a.unit_number || '–')})`).join('\n');
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

  if (!createdRecord) {
    await sendMessage(chatId, `❌ <b>საქმე ვერ შეინახა.</b> სცადეთ ცოტა ხანში ან დაამატეთ სისტემაში: ${BASE_APP_URL}/app/`);
    return;
  }

  // Response text
  let confirmation = `✅ <b>საქმე შეიქმნა და შენახულია ბაზაში!</b>\n\n` +
    `🏢 <b>ბინა:</b> ${esc(apt.name || apt.title)} (${esc(apt.address || '')})\n` +
    `🛠 <b>საკითხი:</b> ${esc(parsed.issueTitle)}\n`;

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
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, message: 'Rigzea Telegram Webhook is active' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    requireEnv('TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY');
  } catch (e) {
    console.error(e.message);
    return res.status(500).json({ ok: false, error: 'Server is not configured' });
  }

  // Telegram sends the secret we passed to setWebhook(secret_token) in this header.
  const given = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    const update = req.body;
    if (update) {
      await handleUpdate(update);
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(200).json({ ok: false });
  }
}
