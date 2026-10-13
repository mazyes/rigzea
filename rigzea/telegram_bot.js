/**
 * რიგზეა (Rigzea) Real Telegram Bot Service (Local Polling & Fallback Daemon)
 * Local development only. Secrets come from environment variables; not deployed (see .vercelignore).
 * Username: @Rigzeabot
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = 'https://cuioodytwyzykqlrjfej.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role: Telegram RPCs are no longer callable with the anon key
if (!TELEGRAM_BOT_TOKEN || !SUPABASE_ANON_KEY) { console.error('Set TELEGRAM_BOT_TOKEN and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const BASE_APP_URL = 'https://rigzea.com';

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
      return null;
    }
    return await res.json();
  } catch (e) {
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
    disable_web_page_preview: true,
    ...extra
  });
}

// Smart Georgian NLP Text Parser
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

// Main Update Dispatcher
async function handleUpdate(update) {
  if (!update.message || !update.message.text) return;

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userName = msg.from.first_name || 'მმართველი';

  // Check for UUID pattern in message (e.g. "95671f98-50fc-4d29-9a0c-b298639359d0" or "/link 95671f98...")
  const uuidMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  // ---------------------------------------------------------------------------
  // 1. COMMAND: Link Organization
  // ---------------------------------------------------------------------------
  if (uuidMatch) {
    const orgId = uuidMatch[0].toLowerCase();
    
    // Link chat RPC
    const linkRes = await callRpc('link_telegram_chat', {
      p_chat_id: chatId,
      p_org_id: orgId,
      p_user_name: userName
    });

    if (linkRes && linkRes.success) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით რიგზეას Telegram ასისტენტში, ${userName}!</b>\n\nთქვენი პროფილი წარმატებით დაუკავშირდა კომპანიას:\n🏢 <b>${linkRes.org_name}</b> (${linkRes.city || 'საქართველო'})\n\nახლა შეგიძლიათ პირდაპირ მომწეროთ ქართულად ნებისმიერი საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\n📌 <b>ბრძანებები:</b>\n/today — დღის საოპერაციო მდგომარეობა\n/apartments — ბინების სია\n/help — დახმარება`);
      return;
    }

    const orgs = await callRpc('get_telegram_org', { p_org_id: orgId });
    if (orgs && orgs.length > 0) {
      const org = orgs[0];
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით რიგზეას ასისტენტში, ${userName}!</b>\n\nთქვენი პროფილი დაკავშირებულია:\n🏢 <b>${org.name}</b> (${org.city || 'საქართველო'})\n\nშეგიძლიათ პირდაპირ მომწეროთ საქმე ქართულად!`);
      return;
    }

    await sendMessage(chatId, `❌ ორგანიზაცია ID-ით (<code>${orgId}</code>) ვერ მოიძებნა.\nგთხოვთ გადაამოწმოთ გასაღები რიგზეას პარამეტრებში.`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 2. CHECK LINKED ORG
  // ---------------------------------------------------------------------------
  const userOrg = await callRpc('get_linked_telegram_org', { p_chat_id: chatId });

  // ---------------------------------------------------------------------------
  // 3. COMMAND: /start
  // ---------------------------------------------------------------------------
  if (text.startsWith('/start')) {
    if (userOrg && userOrg.orgName) {
      await sendMessage(chatId, `🇬🇪 <b>მოგესალმებით, ${userName}!</b>\n\nთქვენი პროფილი დაკავშირებულია კომპანიასთან:\n🏢 <b>${userOrg.orgName}</b>\n\nუბრალოდ მომწერეთ ქართულად საქმე ან ხარჯი, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>`);
      return;
    }

    await sendMessage(chatId, `🇬🇪 <b>რიგზეას Telegram ასისტენტი</b>\n\nკომპანიის დასაკავშირებლად, გთხოვთ გადმოაგზავნოთ თქვენი კომპანიის გასაღები რიგზეას პარამეტრებიდან, მაგალითად:\n<code>95671f98-50fc-4d29-9a0c-b298639359d0</code>`);
    return;
  }

  // Ensure organization is linked
  if (!userOrg || !userOrg.orgId) {
    await sendMessage(chatId, `⚠️ <b>კომპანია ჯერ არ არის დაკავშირებული.</b>\n\nგთხოვთ გადმოაგზავნოთ თქვენი კომპანიის გასაღები (UUID) რიგზეას სისტემიდან:\n<code>/link თქვენი_გასაღები</code>`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 4. COMMAND: /apartments (List portfolio)
  // ---------------------------------------------------------------------------
  if (text === '/apartments') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    if (!apts || apts.length === 0) {
      await sendMessage(chatId, `🏢 თქვენს პორტფელში ბინები ჯერ არ არის დამატებული.\nდაამატეთ ბინა სისტემაში: ${BASE_APP_URL}/app/`);
      return;
    }

    let response = `🏢 <b>აქტიური ბინების სია (${apts.length}):</b>\n\n`;
    apts.forEach((a, idx) => {
      response += `${idx + 1}. <b>${a.name || a.title}</b>\n   📍 ${a.address || 'მისამართი'} (№${a.unit_number || '—'})\n`;
    });
    response += `\n<i>საქმის დასამატებლად უბრალოდ მომწერეთ, მაგ: „${apts[0].unit_number || apts[0].name}-ში კონდიციონერი გაფუჭდა, 150 ლარია“</i>`;

    await sendMessage(chatId, response);
    return;
  }

  // ---------------------------------------------------------------------------
  // 5. COMMAND: /today or /status (Daily Briefing)
  // ---------------------------------------------------------------------------
  if (text === '/today' || text === '/status') {
    const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });
    const aptCount = apts?.length || 0;

    let response = `📊 <b>დღის საოპერაციო მდგომარეობა — ${userOrg.orgName}</b>\n\n`;
    response += `• 🏢 <b>ბინების რაოდენობა:</b> ${aptCount}\n`;
    response += `• 🤖 <b>Telegram ასისტენტი:</b> აქტიურია\n\n`;
    response += `🔗 <a href="${BASE_APP_URL}/app/">სისტემაში გახსნა</a>`;

    await sendMessage(chatId, response);
    return;
  }

  // ---------------------------------------------------------------------------
  // 6. COMMAND: /help
  // ---------------------------------------------------------------------------
  if (text === '/help') {
    await sendMessage(chatId, `ℹ️ <b>როგორ გამოვიყენოთ რიგზეას ბოტი:</b>\n\nუბრალოდ მომწერეთ საქმე ჩვეულებრივი ქართული ტექსტით, მაგალითად:\n• <i>1204-ში კონდიციონერი გაფუჭდა, 170 ლარია</i>\n• <i>ბინა 7-ში ონკანი ჟონავს, 85 ლარი</i>\n• <i>ვაკე 18-ში დასუფთავება ხვალ 14:00-ზე</i>\n\nრიგზეა ავტომატურად:\n1. ამოიცნობს ბინას და თანხას\n2. შექმნის საქმეს ბაზაში\n3. მოამზადებს მესაკუთრისთვის 1-Click თანხმობის ბმულს`);
    return;
  }

  // ---------------------------------------------------------------------------
  // 7. NATURAL LANGUAGE MESSAGE PROCESSING (NLP EXTRACTION)
  // ---------------------------------------------------------------------------
  const apts = await callRpc('get_telegram_apartments', { p_org_id: userOrg.orgId });

  if (!apts || apts.length === 0) {
    await sendMessage(chatId, `⚠️ პორტფელში ბინები ჯერ არ მოიძებნა. გთხოვთ ჯერ დაამატოთ ბინა სისტემაში: ${BASE_APP_URL}/app/`);
    return;
  }

  const parsed = parseGeorgianTaskText(text, apts);

  if (!parsed.matchedApt) {
    let helpMsg = `⚠️ <b>ბინა ვერ ამოვიცანი ტექსტში.</b>\n\nგთხოვთ მიუთითოთ ბინის ნომერი ან სახელი, მაგალითად:\n• <i>${apts[0].unit_number || apts[0].name}-ში ${parsed.issueTitle}, ${parsed.amount > 0 ? parsed.amount + ' ლარი' : '150 ლარი'}</i>\n\n🏢 <b>თქვენი ბინები:</b>\n` + apts.slice(0, 5).map(a => `• ${a.name || a.title} (№${a.unit_number || '—'})`).join('\n');
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

// Long-polling loop
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

console.log(`🤖 Rigzea Telegram Bot started successfully for @Rigzeabot...`);
pollTelegram();
