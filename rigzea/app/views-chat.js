// Internal chat: a company-wide channel and direct messages between owners, admins, managers and agents.
// Every permission is enforced by supabase/patches/24_chat.sql; this file draws the conversations and talks to those tables.
// Speed: the conversation list and the open conversation are patched in place (never redrawn whole), messages appear at
// once (optimistic) and realtime events from app.js update everything else.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast } = R;
  const { S } = App;

  const ROLES = ['owner', 'admin', 'manager', 'agent'];
  const EMOJI = ['👍', '❤️', '😂', '🎉', '🙏', '👀'];
  const PICKER = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😍','🥰','😘','😎','🤔','😢','😭','😡','🥳','👍','👎','👏','🙌','🙏','❤️','🧡','💛','💚','💙','💜','🖤','💯','🔥','✨','🎉','👀','💪','🤝','✅','❌','🏠','🏡','🔑','📍','📷','📎','💬','👋','☀️'];
  const EMOJI_ICON = '<svg class="chat-emoji-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9.5" stroke="currentColor" stroke-width="2"/>'
    + '<line x1="8.5" y1="8.5" x2="8.5" y2="11.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<line x1="15.5" y1="8.5" x2="15.5" y2="11.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    + '<path d="M7.5 14.5c1.2 2.8 7.8 2.8 9 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>';
  const PAGE = 50;
  const MAX_FILES = 5, MAX_BYTES = 10 * 1024 * 1024;
  const FILE_OK = /^(image\/(png|jpe?g|webp|gif)|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel)|text\/plain)$/;

  // state survives leaving and coming back to the page, so it opens instantly and refreshes behind the scenes
  const st = { org: null, channels: [], members: [], msgs: new Map(), reacts: new Map(), hasMore: new Map(), unread: new Map(), active: null, ready: false, loading: null, openedAt: new Map() };
  const draft = { text: '', files: [], replyTo: null, editing: null };
  const urlCache = new Map(); // storage path -> { url, until }
  const reacting = new Set();
  const me = () => S.user.id;
  const canChat = () => ROLES.includes(S.member?.role);

  const person = (uid) => {
    const m = (S.data?.members || []).find(x => x.user_id === uid);
    return { name: m?.display_name || 'უსახელო', avatar: m?.avatar_url || null, role: m?.role || null };
  };
  const avatar = (uid, cls = '') => {
    const p = person(uid);
    return `<span class="avatar avatar-sm ${cls}">${p.avatar ? `<img src="${esc(p.avatar)}" alt="" />` : esc(p.name.trim().charAt(0).toUpperCase())}</span>`;
  };
  const chanOf = (id) => st.channels.find(c => c.id === id);
  const otherOf = (ch) => {
    const fromMembers = st.members.filter(m => m.channel_id === ch.id && m.user_id !== me()).map(m => m.user_id)[0];
    if (fromMembers) return fromMembers;
    if (ch.kind === 'direct' && ch.dm_key) {
      const parts = ch.dm_key.split(':');
      return parts.find(u => u !== me()) || null;
    }
    return null;
  };
  const titleOf = (ch) => (ch.kind === 'company' ? 'კომპანიის ჩატი' : person(otherOf(ch)).name);
  const msgsOf = (id) => st.msgs.get(id) || [];
  const lastOf = (id) => { const l = msgsOf(id); return l[l.length - 1] || null; };
  const sortedChannels = () => st.channels.slice().sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'company' ? -1 : 1;
    return String(lastOf(b.id)?.created_at || b.created_at).localeCompare(String(lastOf(a.id)?.created_at || a.created_at));
  });
  // the labels are translated, what a person wrote (data-keep) is left exactly as written
  const keep = (text, n = 70) => `<span data-keep>${esc(String(text).replace(/\s+/g, ' ').slice(0, n))}</span>`;
  const preview = (m) => !m ? esc('ჯერ შეტყობინება არ არის') : m.deleted_at ? esc('შეტყობინება წაშლილია') : `${m.sender_id === me() ? '<em>შენ:</em> ' : ''}${m.body ? keep(m.body) : (m.attachments?.length ? esc('📎 ფაილი') : '')}`;
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('ka-GE', { hour: '2-digit', minute: '2-digit' });
  const dayKey = (ts) => new Date(ts).toDateString();
  const dayLabel = (ts) => {
    const d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return 'დღეს';
    t.setDate(t.getDate() - 1);
    return d.toDateString() === t.toDateString() ? 'გუშინ' : R.date(ts);
  };
  const listTime = (ts) => { if (!ts) return ''; const d = new Date(ts); return d.toDateString() === new Date().toDateString() ? fmtTime(ts) : R.date(ts); };

  // text -> safe html: escaped, links made clickable, line breaks kept
  const linkify = (text) => esc(text).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, (u) => {
    const raw = u.replace(/&amp;/g, '&');
    const safe = R.safeUrl(raw);
    return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${u}</a>` : u;
  });

  // ---- data -------------------------------------------------------------------------------------------------------
  async function load() {
    const org = S.org.id;
    if (st.org !== org) { Object.assign(st, { org, channels: [], members: [], ready: false, active: null }); st.msgs.clear(); st.reacts.clear(); st.hasMore.clear(); st.unread.clear(); }
    const [channels, members, recent, unread] = await Promise.all([
      q(sb.from('chat_channels').select('*').eq('organization_id', org)),
      q(sb.from('chat_channel_members').select('*').eq('organization_id', org)),
      q(sb.from('chat_messages').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(150)),
      sb.rpc('chat_unread_counts', { p_org: org }).then(r => r.data || [], () => []),
    ]);
    st.channels = channels; st.members = members;
    const fresh = new Map();
    recent.slice().reverse().forEach(m => { if (!fresh.has(m.channel_id)) fresh.set(m.channel_id, []); fresh.get(m.channel_id).push(m); });
    for (const ch of channels) {
      const have = msgsOf(ch.id), got = fresh.get(ch.id) || [];
      // keep older pages already loaded, replace the recent window with the server's version
      const oldest = got[0]?.created_at;
      st.msgs.set(ch.id, got.length ? [...have.filter(m => !m._pending && !m._failed && m.created_at < oldest), ...got, ...have.filter(m => m._pending || m._failed)] : have);
      if (!st.hasMore.has(ch.id)) st.hasMore.set(ch.id, true); // the global recent window cannot tell whether a channel has older messages
    }
    st.unread = new Map(unread.map(u => [u.channel_id, Number(u.unread)]));
    st.ready = true;
    publishUnread();
  }
  const publishUnread = () => App.setChatUnread?.([...st.unread.values()].reduce((a, b) => a + b, 0));

  async function loadReactions(ids) {
    const need = ids.filter(id => !st.reacts.has(id));
    if (!need.length) return;
    const rows = await q(sb.from('chat_reactions').select('*').in('message_id', need));
    need.forEach(id => st.reacts.set(id, []));
    rows.forEach(r => st.reacts.get(r.message_id)?.push(r));
  }

  async function loadOlder(channelId) {
    const list = msgsOf(channelId);
    if (!list.length || !st.hasMore.get(channelId)) return;
    const before = list[0].created_at;
    const rows = await q(sb.from('chat_messages').select('*').eq('channel_id', channelId).lt('created_at', before).order('created_at', { ascending: false }).limit(PAGE));
    st.hasMore.set(channelId, rows.length >= PAGE);
    st.msgs.set(channelId, [...rows.reverse(), ...list]);
    await loadReactions(rows.map(m => m.id));
  }

  let readTimer = 0;
  function markRead(channelId) {
    if (!st.unread.get(channelId)) return;
    st.unread.delete(channelId); publishUnread(); drawList();
    clearTimeout(readTimer);
    readTimer = setTimeout(() => sb.rpc('chat_mark_read', { p_channel: channelId }), 250);
  }

  // ---- storage ----------------------------------------------------------------------------------------------------
  async function signPaths(paths) {
    const now = Date.now();
    const todo = [...new Set(paths)].filter(p => !(urlCache.get(p)?.until > now));
    if (todo.length) {
      const { data } = await sb.storage.from('rigzea-private').createSignedUrls(todo, 3600).catch(() => ({ data: [] }));
      (data || []).forEach(x => { if (x.signedUrl) urlCache.set(x.path, { url: x.signedUrl, until: now + 50 * 60e3 }); });
    }
  }
  async function hydrateFiles(root) {
    const els = $$('[data-att-path]', root).filter(el => !el.dataset.ready);
    if (!els.length) return;
    await signPaths(els.map(el => el.dataset.attPath));
    els.forEach(el => {
      const u = urlCache.get(el.dataset.attPath)?.url;
      if (!u) return;
      el.dataset.ready = '1';
      if (el.tagName === 'IMG') el.src = u; else el.href = u;
    });
  }
  async function uploadFiles(channelId, files) {
    const out = [];
    for (const f of files) {
      const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      const path = `${st.org}/chat/${channelId}/${R.uuid()}.${ext}`;
      await q(sb.storage.from('rigzea-private').upload(path, f, { cacheControl: '3600', upsert: false }));
      out.push({ path, name: f.name.slice(0, 120), type: f.type, size: f.size });
    }
    return out;
  }

  // ---- drawing: conversation list -----------------------------------------------------------------------------------
  function drawList() {
    const box = $('#chat-list');
    if (!box) return;
    const term = ($('#chat-find')?.value || '').trim().toLowerCase();
    const items = sortedChannels().filter(c => !term || titleOf(c).toLowerCase().includes(term));
    box.innerHTML = items.map(c => {
      const last = lastOf(c.id), n = st.unread.get(c.id) || 0;
      const av = c.kind === 'company' ? `<span class="avatar chat-av-company">${icon('team', 18)}</span>` : avatar(otherOf(c), 'avatar-lg');
      return `<a class="chat-item ${st.active === c.id ? 'is-active' : ''} ${n ? 'is-unread' : ''}" href="#/chat/${c.id}" data-ch="${c.id}">${av}
        <span class="chat-item-main"><span class="chat-item-top"><strong>${esc(titleOf(c))}</strong><time>${esc(listTime(last?.created_at))}</time></span>
        <span class="chat-item-sub"><span class="chat-prev">${preview(last)}</span>${n ? `<span class="count">${n > 99 ? '99+' : n}</span>` : ''}</span></span></a>`;
    }).join('') || '<p class="empty-inline">საუბარი ვერ მოიძებნა.</p>';
  }

  // ---- drawing: messages ------------------------------------------------------------------------------------------
  const reactionsHtml = (m) => {
    const rs = st.reacts.get(m.id) || [];
    if (!rs.length) return '';
    const by = new Map();
    rs.forEach(r => { const e = by.get(r.emoji) || { n: 0, mine: false }; e.n++; if (r.user_id === me()) e.mine = true; by.set(r.emoji, e); });
    return `<div class="msg-reacts">${[...by].map(([e, v]) => `<button type="button" class="msg-react ${v.mine ? 'is-mine' : ''}" data-react="${e}" data-id="${m.id}" aria-pressed="${v.mine}">${e}<span>${v.n}</span></button>`).join('')}</div>`;
  };
  const attachmentsHtml = (m) => (m.attachments || []).map(a => /^image\//.test(a.type)
    ? (a._url // still being sent: show the local file
      ? `<span class="msg-img"><img src="${esc(a._url)}" alt="${esc(a.name)}" /></span>`
      : `<a class="msg-img" data-lightbox data-att-path="${esc(a.path)}" data-name="${esc(a.name)}" href="#"><img data-att-path="${esc(a.path)}" alt="${esc(a.name)}" loading="lazy" /></a>`)
    : `<a class="msg-file" data-att-path="${esc(a.path)}" target="_blank" rel="noopener noreferrer" download="${esc(a.name)}">${icon('file', 18)}<span><strong>${esc(a.name)}</strong><small>${Math.max(1, Math.round((a.size || 0) / 1024))} KB</small></span></a>`).join('');
  const quoteHtml = (m) => {
    if (!m.reply_to) return '';
    const src = msgsOf(m.channel_id).find(x => x.id === m.reply_to);
    return `<button type="button" class="msg-quote" data-jump="${m.reply_to}"><b>${esc(src ? person(src.sender_id).name : '')}</b><span>${!src ? esc('ძველი შეტყობინება') : src.deleted_at ? esc('შეტყობინება წაშლილია') : src.body ? keep(src.body, 80) : esc('📎 ფაილი')}</span></button>`;
  };
  function msgHtml(m, prev, ch) {
    const own = m.sender_id === me();
    const first = !prev || prev.sender_id !== m.sender_id || dayKey(prev.created_at) !== dayKey(m.created_at) || new Date(m.created_at) - new Date(prev.created_at) > 5 * 60e3;
    const dm = ch.kind === 'direct';
    let seen = '';
    if (own && dm && !m._pending && !m._failed) {
      const other = otherOf(ch), cm = st.members.find(x => x.channel_id === ch.id && x.user_id === other);
      const last = [...msgsOf(ch.id)].reverse().find(x => x.sender_id === me() && !x.deleted_at);
      if (last?.id === m.id && cm && cm.last_read_at >= m.created_at) seen = '<span class="msg-seen">ნანახია</span>';
    }
    if (m.deleted_at) {
      return `<div class="msg ${own ? 'is-own' : ''} ${first ? 'is-first' : ''}" data-id="${m.id}"><div class="msg-gutter"></div><div class="msg-col"><div class="msg-bubble is-deleted">${icon('close', 13)} შეტყობინება წაშლილია</div></div></div>`;
    }
    return `<div class="msg ${own ? 'is-own' : ''} ${first ? 'is-first' : ''} ${m._pending ? 'is-pending' : ''} ${m._failed ? 'is-failed' : ''}" data-id="${m.id}">
      <div class="msg-gutter">${first && !own ? avatar(m.sender_id) : ''}</div>
      <div class="msg-col">
        ${first && !own && !dm ? `<span class="msg-name">${esc(person(m.sender_id).name)}</span>` : ''}
        <div class="msg-bubble">${quoteHtml(m)}${attachmentsHtml(m)}${m.body ? `<p class="msg-text" data-keep>${linkify(m.body)}</p>` : ''}<span class="msg-meta">${m.edited_at ? 'შეცვლილია · ' : ''}${esc(fmtTime(m.created_at))}</span></div>
        ${reactionsHtml(m)}${seen}
        ${m._failed ? `<span class="msg-fail">ვერ გაიგზავნა <button type="button" class="link-btn" data-retry="${m.id}">ხელახლა</button> · <button type="button" class="link-btn" data-discard="${m.id}">წაშლა</button></span>` : ''}
      </div>
      ${m._pending || m._failed ? '' : `<button type="button" class="msg-more" data-more="${m.id}" aria-label="მეტი" aria-haspopup="menu">${icon('more', 16)}</button>`}
    </div>`;
  }
  function messagesHtml(ch) {
    const list = msgsOf(ch.id);
    const openedAt = st.openedAt.get(ch.id);
    let html = '', prev = null, dividerDone = false;
    for (const m of list) {
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) html += `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`;
      if (!dividerDone && openedAt && m.created_at > openedAt && m.sender_id !== me()) { html += '<div class="chat-new"><span>ახალი შეტყობინებები</span></div>'; dividerDone = true; }
      html += msgHtml(m, prev, ch);
      prev = m;
    }
    return html;
  }

  function drawHead(ch) {
    const head = $('#chat-head');
    if (!head) return;
    if (!ch) { head.innerHTML = ''; return; }
    const otherId = otherOf(ch);
    const otherRole = otherId ? person(otherId).role : null;
    const sub = ch.kind === 'company' ? `${st.members.filter(m => m.channel_id === ch.id).length} წევრი` : esc(L_role(otherRole) || '');
    head.innerHTML = `<a class="icon-btn chat-back" href="#/chat" aria-label="უკან">${icon('back', 18)}</a>
      ${ch.kind === 'company' ? `<span class="avatar chat-av-company">${icon('team', 18)}</span>` : avatar(otherId, 'avatar-lg')}
      <div class="chat-head-text"><strong>${esc(titleOf(ch))}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
  }
  const L_role = (r) => R.L?.role?.[r] || '';

  let stick = true;
  const scroller = () => $('#chat-msgs');
  const toBottom = (smooth = false) => { const s = scroller(); if (s) s.scrollTo({ top: s.scrollHeight, behavior: smooth && !R.calm() ? 'smooth' : 'auto' }); };
  const nearBottom = () => { const s = scroller(); return !s || s.scrollHeight - s.scrollTop - s.clientHeight < 90; };

  function drawConversation({ keepScroll = false, prepended = false } = {}) {
    const ch = chanOf(st.active);
    const root = $('#chat-root');
    if (!root) return;
    root.dataset.pane = ch ? 'conv' : 'list';
    drawHead(ch);
    const box = $('#chat-msgs'), comp = $('#chat-composer');
    if (!ch) { box.innerHTML = '<div class="chat-empty">' + icon('chat', 34) + '<p>აირჩიე საუბარი</p></div>'; comp.hidden = true; return; }
    comp.hidden = false;
    const wasNearBottom = nearBottom(), prevTop = box.scrollTop, prevH = box.scrollHeight;
    const more = st.hasMore.get(ch.id) ? `<button type="button" class="chat-older" id="chat-older">უფრო ძველი შეტყობინებები</button>` : '';
    box.innerHTML = `${more}${messagesHtml(ch)}`;
    if (keepScroll && (!wasNearBottom || prepended)) box.scrollTop = prevTop + (box.scrollHeight - prevH);
    else toBottom();
    hydrateFiles(box);
    drawDraft();
  }

  // a single new message is appended (and animated) without redrawing the rest
  function appendMessage(m) {
    const ch = chanOf(m.channel_id);
    const box = scroller();
    if (!ch || !box || st.active !== ch.id) return false;
    const follow = nearBottom();
    const list = msgsOf(ch.id), i = list.findIndex(x => x.id === m.id);
    const prev = list[i - 1] || null;
    if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) box.insertAdjacentHTML('beforeend', `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`);
    box.insertAdjacentHTML('beforeend', msgHtml(m, prev, ch));
    const el = box.lastElementChild;
    el.classList.add('msg-in');
    hydrateFiles(el);
    if (follow || m.sender_id === me()) toBottom();
    else $('#chat-jump')?.classList.add('is-on');
    return follow;
  }
  function patchMessage(m) {
    const ch = chanOf(m.channel_id);
    const el = scroller()?.querySelector(`[data-id="${m.id}"]`);
    if (!ch || !el) return;
    const list = msgsOf(ch.id), prev = list[list.findIndex(x => x.id === m.id) - 1] || null;
    const tmp = document.createElement('div');
    tmp.innerHTML = msgHtml(m, prev, ch);
    const box = scroller(), above = el.getBoundingClientRect().top < box.getBoundingClientRect().top;
    const height = box.scrollHeight;
    el.replaceWith(tmp.firstElementChild);
    if (above) box.scrollTop += box.scrollHeight - height;
    hydrateFiles(scroller());
  }

  // composer
  function drawDraft() {
    const bar = $('#chat-ctx'), files = $('#chat-files'), input = $('#chat-input'), send = $('#chat-send');
    if (!input) return;
    const quoteSrc = draft.replyTo && msgsOf(st.active).find(x => x.id === draft.replyTo);
    const editSrc = draft.editing && msgsOf(st.active).find(x => x.id === draft.editing);
    bar.hidden = !(quoteSrc || editSrc);
    bar.innerHTML = quoteSrc ? `${icon('reply', 15)}<span><b>${esc(person(quoteSrc.sender_id).name)}</b>${quoteSrc.body ? keep(quoteSrc.body, 90) : esc('📎 ფაილი')}</span><button type="button" class="icon-btn" data-cancel-ctx aria-label="გაუქმება">${icon('close', 15)}</button>`
      : editSrc ? `${icon('edit', 15)}<span><b>შეტყობინების შეცვლა</b>${keep(editSrc.body, 90)}</span><button type="button" class="icon-btn" data-cancel-ctx aria-label="გაუქმება">${icon('close', 15)}</button>` : '';
    files.hidden = !draft.files.length;
    files.innerHTML = draft.files.map((f, i) => `<span class="chat-chip">${/^image\//.test(f.type) ? `<img src="${esc(f._url)}" alt="" />` : icon('file', 16)}<em>${esc(f.name)}</em><button type="button" data-drop-file="${i}" aria-label="წაშლა">${icon('close', 12)}</button></span>`).join('');
    if (input.value !== draft.text) input.value = draft.text;
    autosize(input);
    send.disabled = !(draft.text.trim() || draft.files.length);
  }
  const autosize = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; };

  // ---- actions ----------------------------------------------------------------------------------------------------
  async function sendMessage() {
    const ch = chanOf(st.active);
    if (!ch) return;
    const text = draft.text.trim();
    if (draft.editing) {
      const id = draft.editing, msg = msgsOf(ch.id).find(x => x.id === id);
      if (!msg || !text) return;
      draft.editing = null; draft.text = '';
      const old = { body: msg.body, edited_at: msg.edited_at };
      Object.assign(msg, { body: text, edited_at: new Date().toISOString() });
      patchMessage(msg); drawDraft(); drawList();
      const { error } = await sb.from('chat_messages').update({ body: text }).eq('id', id);
      if (error) { Object.assign(msg, old); patchMessage(msg); toast(R.friendlyError(error), { type: 'error' }); }
      return;
    }
    if (!text && !draft.files.length) return;
    const files = draft.files.slice();
    const msg = { id: R.uuid(), channel_id: ch.id, organization_id: S.org.id, sender_id: me(), body: text, reply_to: draft.replyTo || null, attachments: files.map(f => ({ path: '', name: f.name, type: f.type, size: f.size, _url: f._url })), created_at: new Date().toISOString(), edited_at: null, deleted_at: null, _pending: true, _files: files };
    draft.text = ''; draft.files = []; draft.replyTo = null;
    st.msgs.set(ch.id, [...msgsOf(ch.id), msg]);
    appendMessage(msg); drawDraft(); drawList();
    await deliver(msg);
  }
  async function deliver(msg) {
    try {
      let attachments = msg.attachments;
      if (msg._files?.length) attachments = await uploadFiles(msg.channel_id, msg._files);
      const row = { id: msg.id, channel_id: msg.channel_id, organization_id: msg.organization_id, sender_id: msg.sender_id, body: msg.body, reply_to: msg.reply_to, attachments };
      const { data, error } = await sb.from('chat_messages').insert(row).select().single();
      if (error) throw error;
      const keep = { _pending: false, _failed: false };
      Object.assign(msg, data, keep); delete msg._files; delete msg._pending; delete msg._failed;
      patchMessage(msg); drawList();
    } catch (err) {
      console.error(err);
      msg._pending = false; msg._failed = true; msg._error = R.friendlyError(err);
      patchMessage(msg);
      toast(msg._error, { type: 'error' });
    }
  }
  async function retry(id) {
    const msg = msgsOf(st.active).find(x => x.id === id);
    if (!msg || msg._pending || !msg._failed) return;
    msg._failed = false; msg._pending = true; patchMessage(msg);
    await deliver(msg);
  }
  function discard(id) {
    st.msgs.set(st.active, msgsOf(st.active).filter(x => x.id !== id));
    scroller()?.querySelector(`[data-id="${id}"]`)?.remove();
    drawList();
  }
  async function deleteMessage(id) {
    const msg = msgsOf(st.active).find(x => x.id === id);
    if (!msg) return;
    if (!await R.confirm({ title: 'შეტყობინების წაშლა', message: 'შეტყობინება ყველასთვის წაიშლება.', confirmLabel: 'წაშლა', danger: true })) return;
    const old = { ...msg };
    Object.assign(msg, { deleted_at: new Date().toISOString(), body: '', attachments: [] });
    patchMessage(msg); drawList();
    const { error } = await sb.from('chat_messages').update({ deleted_at: msg.deleted_at }).eq('id', id);
    if (error) { Object.assign(msg, old); patchMessage(msg); drawList(); toast(R.friendlyError(error), { type: 'error' }); }
  }
  async function toggleReaction(id, emoji) {
    const key = id + ':' + emoji;
    if (reacting.has(key)) return;
    const msg = msgsOf(st.active).find(x => x.id === id);
    if (!msg || msg.deleted_at) return;
    reacting.add(key);
    const list = st.reacts.get(id) || (st.reacts.set(id, []), st.reacts.get(id));
    const mine = list.findIndex(r => r.user_id === me() && r.emoji === emoji);
    const row = { message_id: id, channel_id: msg.channel_id, organization_id: msg.organization_id, user_id: me(), emoji };
    if (mine >= 0) list.splice(mine, 1); else list.push({ ...row, created_at: new Date().toISOString() });
    patchMessage(msg);
    let error;
    try {
      ({ error } = mine >= 0
        ? await sb.from('chat_reactions').delete().eq('message_id', id).eq('user_id', me()).eq('emoji', emoji)
        : await sb.from('chat_reactions').insert(row));
    } catch (e) { error = e; }
    reacting.delete(key);
    if (error && error.code !== '23505') {
      if (mine >= 0) list.splice(mine, 0, row);
      else { const i = list.findIndex(r => r.user_id === me() && r.emoji === emoji); if (i >= 0) list.splice(i, 1); }
      patchMessage(msg);
      toast(R.friendlyError(error), { type: 'error' });
    }
  }

  // message menu: reply, react, edit, copy, delete (shown according to who the person is; the database decides too)
  function openMenu(id, anchor) {
    closeMenu(true);
    const msg = msgsOf(st.active).find(x => x.id === id);
    if (!msg || msg.deleted_at) return;
    const own = msg.sender_id === me(), admin = ['owner', 'admin'].includes(S.member?.role);
    const el = document.createElement('div');
    el.className = 'popover chat-menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = `<div class="chat-menu-emoji">${EMOJI.map(e => `<button type="button" data-m-react="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
      <button type="button" role="menuitem" data-m="reply">${icon('reply', 16)} პასუხი</button>
      ${msg.body ? `<button type="button" role="menuitem" data-m="copy">${icon('copy', 16)} კოპირება</button>` : ''}
      ${own && msg.body ? `<button type="button" role="menuitem" data-m="edit">${icon('edit', 16)} შეცვლა</button>` : ''}
      ${own || admin ? `<button type="button" role="menuitem" class="is-danger" data-m="delete">${icon('trash', 16)} წაშლა</button>` : ''}`;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const view = window.visualViewport;
    const left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
    const right = left + (view?.width || innerWidth), bottom = top + (view?.height || innerHeight);
    el.style.left = Math.max(left + 8, Math.min(right - w - 8, r.right - w)) + 'px';
    el.style.top = (r.bottom + h + 8 > bottom ? Math.max(top + 8, r.top - h - 4) : r.bottom + 4) + 'px';
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      closeMenu();
      if (b.dataset.mReact) toggleReaction(id, b.dataset.mReact);
      else if (b.dataset.m === 'reply') { draft.replyTo = id; draft.editing = null; drawDraft(); $('#chat-input')?.focus(); }
      else if (b.dataset.m === 'edit') { draft.editing = id; draft.replyTo = null; draft.text = msg.body; drawDraft(); $('#chat-input')?.focus(); }
      else if (b.dataset.m === 'copy') R.copyText(msg.body, 'დაკოპირდა');
      else if (b.dataset.m === 'delete') deleteMessage(id);
    });
    setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc_); }, 0);
  }
  const outside = (e) => { if (!e.target.closest('.chat-menu')) closeMenu(); };
  const esc_ = (e) => { if (e.key === 'Escape') closeMenu(); };
  function closeMenu(now = false) {
    document.querySelectorAll('.chat-menu').forEach(el => { el.classList.remove('is-open'); if (now) el.remove(); else setTimeout(() => el.remove(), 160); });
    document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc_);
  }

  async function newChat() {
    const seen = new Set();
    const people = (S.data?.members || [])
      .filter(m => m.user_id && m.user_id !== me() && ROLES.includes(m.role) && !seen.has(m.user_id) && seen.add(m.user_id))
      .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    const dlg = R.dialog({
      title: 'ახალი შეტყობინება', sheet: true,
      body: `<div class="ios-list"><div class="ios-group">${people.map(m => `<button type="button" class="ios-row" data-person="${m.user_id}">${avatar(m.user_id)}<span class="ios-label"><strong>${esc(m.display_name || 'უსახელო')}</strong><small class="muted">${esc(L_role(m.role))}</small></span>${icon('chevronRight', 16)}</button>`).join('') || '<p class="empty-inline">სხვა წევრი ჯერ არ არის.</p>'}</div></div>`,
      onOpen: (form, d) => $$('[data-person]', form).forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const { data, error } = await sb.rpc('chat_open_direct', { p_org: S.org.id, p_other: b.dataset.person });
        if (error) { b.disabled = false; toast(R.friendlyError(error), { type: 'error' }); return; }
        d.close();
        await load();
        drawList();
        App.go('#/chat/' + data);
      })),
    });
    return dlg;
  }

  // ---- realtime (events arrive from app.js as 'rigzea-chat') ---------------------------------------------------------
  function onRealtime(e) {
    const d = e.detail;
    if (!st.ready) return;
    if (d.table === 'chat_messages') {
      const m = d.new;
      if (d.eventType === 'INSERT') {
        if (!chanOf(m.channel_id)) { load().then(drawList); return; }
        const list = msgsOf(m.channel_id);
        if (list.some(x => x.id === m.id)) return; // our own message, already shown
        st.msgs.set(m.channel_id, [...list, m]);
        const viewing = st.active === m.channel_id && document.visibilityState === 'visible' && !!$('#chat-root');
        if (viewing) { const followed = appendMessage(m); if (m.sender_id !== me() && followed) { sb.rpc('chat_mark_read', { p_channel: m.channel_id }); } else if (m.sender_id !== me()) st.unread.set(m.channel_id, (st.unread.get(m.channel_id) || 0) + 1); }
        else if (m.sender_id !== me()) st.unread.set(m.channel_id, (st.unread.get(m.channel_id) || 0) + 1);
        publishUnread(); drawList();
      } else if (d.eventType === 'UPDATE') {
        const list = msgsOf(m.channel_id), cur = list.find(x => x.id === m.id);
        if (cur) { Object.assign(cur, m); patchMessage(cur); drawList(); }
      }
    } else if (d.table === 'chat_reactions') {
      const r = d.eventType === 'DELETE' ? d.old : d.new;
      if (!r) return;
      const list = st.reacts.get(r.message_id);
      if (!list) return;
      if (d.eventType === 'INSERT') { if (!list.some(x => x.user_id === r.user_id && x.emoji === r.emoji)) list.push(r); }
      else { const i = list.findIndex(x => x.user_id === r.user_id && x.emoji === r.emoji); if (i >= 0) list.splice(i, 1); }
      const msg = [...st.msgs.values()].flat().find(x => x.id === r.message_id);
      if (msg) patchMessage(msg);
    } else if (d.table === 'chat_channel_members') {
      const cm = d.new;
      if (!cm?.channel_id) return;
      const i = st.members.findIndex(x => x.channel_id === cm.channel_id && x.user_id === cm.user_id);
      if (i >= 0) st.members[i] = { ...st.members[i], ...cm }; else st.members.push(cm);
      if (!chanOf(cm.channel_id)) { load().then(drawList); }
      if (cm.user_id !== me() && st.active === cm.channel_id) { const last = [...msgsOf(cm.channel_id)].reverse().find(x => x.sender_id === me() && !x.deleted_at); if (last) patchMessage(last); } // the "seen" mark moves
    }
  }
  window.addEventListener('rigzea-chat', onRealtime);
  window.addEventListener('rigzea-refresh', () => { if ($('#chat-root')) load().then(() => { drawList(); drawConversation({ keepScroll: true }); }).catch(err => toast(R.friendlyError(err), { type: 'error' })); });

  // ---- the page -----------------------------------------------------------------------------------------------------
  async function openChannel(id) {
    st.active = id || null;
    if (id) st.openedAt.set(id, st.members.find(m => m.channel_id === id && m.user_id === me())?.last_read_at || null);
    drawList(); drawConversation();
    if (!id) return;
    const ch = chanOf(id);
    if (!ch) return;
    // load the newest page if only a thin slice is in memory, and the reactions for what is shown
    if (msgsOf(id).length < PAGE && st.hasMore.get(id) !== false) {
      const rows = await q(sb.from('chat_messages').select('*').eq('channel_id', id).order('created_at', { ascending: false }).limit(PAGE));
      st.hasMore.set(id, rows.length >= PAGE);
      const have = new Map(msgsOf(id).map(m => [m.id, m]));
      rows.forEach(m => have.set(m.id, m));
      st.msgs.set(id, [...have.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    }
    try { await loadReactions(msgsOf(id).map(m => m.id)); }
    catch (err) { toast(R.friendlyError(err), { type: 'error' }); }
    if (st.active === id) { drawConversation({ keepScroll: true }); markRead(id); }
  }

  function build() {
    $('#view').innerHTML = `<div class="chat" id="chat-root" data-org="${S.org.id}" data-pane="list">
      <aside class="chat-side card">
        <div class="chat-side-head"><h1>ჩატი</h1><button type="button" class="icon-btn" id="chat-new" aria-label="ახალი შეტყობინება" title="ახალი შეტყობინება">${icon('edit', 18)}</button></div>
        <label class="chat-search">${icon('search', 16)}<input id="chat-find" type="search" placeholder="ძებნა" autocomplete="off" aria-label="საუბრის ძებნა" /></label>
        <nav id="chat-list" class="chat-list" aria-label="საუბრები"><div class="skeleton"><i></i><i></i><i></i></div></nav>
      </aside>
      <section class="chat-main card" aria-label="საუბარი">
        <header class="chat-head" id="chat-head"></header>
        <div class="chat-msgs" id="chat-msgs" role="log" aria-live="polite"><div class="skeleton"><i></i><i></i><i></i></div></div>
        <button type="button" class="chat-jump" id="chat-jump" aria-label="ბოლო შეტყობინება">${icon('chevronDown', 18)}</button>
        <form class="chat-composer" id="chat-composer" hidden>
          <div class="chat-ctx" id="chat-ctx" hidden></div>
          <div class="chat-files" id="chat-files" hidden></div>
          <div class="chat-row">
            <button type="button" class="icon-btn" id="chat-attach" aria-label="ფაილის მიმაგრება" title="ფაილის მიმაგრება">${icon('paperclip', 20)}</button>
            <input type="file" id="chat-file" hidden multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
            <textarea id="chat-input" rows="1" maxlength="4000" placeholder="დაწერე შეტყობინება" aria-label="შეტყობინება"></textarea>
            <button type="button" class="icon-btn chat-emoji-toggle" id="chat-emoji-toggle" aria-label="ემოჯი" aria-expanded="false" aria-controls="chat-emoji">${EMOJI_ICON}</button>
            <button type="submit" class="chat-send" id="chat-send" aria-label="გაგზავნა" disabled>${icon('send', 18)}</button>
          </div>
          <div class="chat-emoji-picker" id="chat-emoji" hidden role="group" aria-label="ემოჯი">${PICKER.map(e => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
        </form>
      </section>
    </div>`;
    bind();
  }

  // On desktop the chat fills what is left of the window under the page header (a plan banner may sit above it).
  function fit() {
    const root = $('#chat-root');
    if (!root) return;
    if (innerWidth > 900) {
      root.style.height = Math.max(460, innerHeight - (root.getBoundingClientRect().top + window.scrollY) - 20) + 'px';
      root.style.removeProperty('--chat-visible-top');
      root.style.removeProperty('--chat-visible-height');
      return;
    }
    root.style.height = '';
    const view = window.visualViewport;
    const top = document.querySelector('.shell .topbar')?.getBoundingClientRect().bottom || 0;
    const visibleTop = Math.max(top, view?.offsetTop || 0);
    root.style.setProperty('--chat-visible-top', visibleTop + 'px');
    root.style.setProperty('--chat-visible-height', Math.max(0, (view?.height || innerHeight) + (view?.offsetTop || 0) - visibleTop) + 'px');
  }
  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('scroll', fit);

  function bind() {
    const root = $('#chat-root');
    fit();
    $('#chat-new').onclick = newChat;
    $('#chat-head').addEventListener('click', (e) => { if (e.target.closest('.chat-back')) { e.preventDefault(); App.go('#/chat'); } });
    $('#chat-find').addEventListener('input', drawList);
    $('#chat-list').addEventListener('click', (e) => {
      if (e.target.closest('[data-chat-retry]')) { st.ready = false; App.views.chat({ id: st.active }); return; }
      const a = e.target.closest('[data-ch]');
      if (!a) return;
      e.preventDefault();
      App.go('#/chat/' + a.dataset.ch);
    });
    const box = $('#chat-msgs');
    box.addEventListener('scroll', () => {
      stick = nearBottom();
      $('#chat-jump')?.classList.toggle('is-on', !stick);
      if (stick && st.unread.get(st.active)) markRead(st.active);
    }, { passive: true });
    $('#chat-jump').onclick = () => toBottom(true);
    box.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-chat-retry]')) { st.ready = false; App.views.chat({ id: st.active }); return; }
      if (t.closest('#chat-older')) { const btn = t.closest('#chat-older'); btn.disabled = true; try { await loadOlder(st.active); drawConversation({ keepScroll: true, prepended: true }); } catch (err) { btn.disabled = false; toast(R.friendlyError(err), { type: 'error' }); } return; }
      const more = t.closest('[data-more]');
      if (more) { openMenu(more.dataset.more, more); return; }
      const react = t.closest('[data-react]');
      if (react) { toggleReaction(react.dataset.id, react.dataset.react); return; }
      const jump = t.closest('[data-jump]');
      if (jump) { const el = box.querySelector(`[data-id="${jump.dataset.jump}"]`); if (el) { el.scrollIntoView({ block: 'center', behavior: R.calm() ? 'auto' : 'smooth' }); el.classList.add('msg-flash'); setTimeout(() => el.classList.remove('msg-flash'), 1200); } return; }
      const r = t.closest('[data-retry]'); if (r) { retry(r.dataset.retry); return; }
      const dsc = t.closest('[data-discard]'); if (dsc) { discard(dsc.dataset.discard); return; }
      const lb = t.closest('[data-lightbox]');
      if (lb) { e.preventDefault(); await signPaths([lb.dataset.attPath]); const u = urlCache.get(lb.dataset.attPath)?.url; if (u) R.dialog({ title: lb.dataset.name || 'სურათი', wide: true, body: `<img class="chat-lightbox" src="${esc(u)}" alt="" />` }); }
    });
    box.addEventListener('contextmenu', (e) => { const m = e.target.closest('.msg'); const b = m?.querySelector('[data-more]'); if (b) { e.preventDefault(); openMenu(m.dataset.id, b); } });
    const input = $('#chat-input');
    input.addEventListener('input', () => { draft.text = input.value; autosize(input); $('#chat-send').disabled = !(draft.text.trim() || draft.files.length); if (stick) toBottom(); });
    $('#chat-emoji-toggle').onclick = () => {
      const picker = $('#chat-emoji'), toggle = $('#chat-emoji-toggle');
      picker.hidden = !picker.hidden;
      toggle.setAttribute('aria-expanded', String(!picker.hidden));
      if (!picker.hidden) input.blur();
      if (stick) toBottom();
    };
    $('#chat-emoji').onclick = (e) => {
      const emoji = e.target.closest('[data-emoji]')?.dataset.emoji;
      if (!emoji) return;
      const start = input.selectionStart, end = input.selectionEnd;
      input.setRangeText(emoji, start, end, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && innerWidth > 900) { e.preventDefault(); if (!$('#chat-send').disabled) sendMessage(); }
      if (e.key === 'Escape' && (draft.replyTo || draft.editing)) { if (draft.editing) draft.text = ''; draft.replyTo = null; draft.editing = null; drawDraft(); }
    });
    $('#chat-composer').addEventListener('submit', (e) => { e.preventDefault(); if (!$('#chat-send').disabled) sendMessage(); });
    $('#chat-composer').addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel-ctx]')) { if (draft.editing) draft.text = ''; draft.replyTo = null; draft.editing = null; drawDraft(); }
      const drop = e.target.closest('[data-drop-file]');
      if (drop) { const [f] = draft.files.splice(Number(drop.dataset.dropFile), 1); if (f?._url) URL.revokeObjectURL(f._url); drawDraft(); }
    });
    $('#chat-attach').onclick = () => $('#chat-file').click();
    $('#chat-file').addEventListener('change', (e) => {
      for (const f of [...e.target.files]) {
        if (draft.files.length >= MAX_FILES) { toast(`მაქსიმუმ ${MAX_FILES} ფაილი.`, { type: 'error' }); break; }
        if (f.size > MAX_BYTES) { toast(`${f.name}: ფაილი 10 მბ-ზე დიდია.`, { type: 'error' }); continue; }
        if (!FILE_OK.test(f.type)) { toast(`${f.name}: ამ ტიპის ფაილი არ ეგზავნება.`, { type: 'error' }); continue; }
        f._url = /^image\//.test(f.type) ? URL.createObjectURL(f) : '';
        draft.files.push(f);
      }
      e.target.value = '';
      drawDraft();
    });
    root.addEventListener('paste', (e) => {
      const imgs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type));
      if (!imgs.length) return;
      e.preventDefault();
      const dt = new DataTransfer(); imgs.forEach(f => dt.items.add(f));
      $('#chat-file').files = dt.files; $('#chat-file').dispatchEvent(new Event('change'));
    });
  }

  App.chatReady = () => st.ready;
  // Called shortly after the app opens, so the first visit to Chat already has its conversations in memory.
  App.chatWarm = () => { if (canChat() && !st.ready) load().catch(() => {}); };
  App.views.chat = (r) => {
    if (!canChat()) { $('#view').innerHTML = '<div class="card"><div class="empty-inline">ჩატი ხელმისაწვდომია მფლობელის, ადმინისტრატორის, მენეჯერისა და აგენტისთვის.</div></div>'; return; }
    const fast = $('#chat-root')?.isConnected && $('#chat-root').dataset.org === S.org.id;
    if (!fast) {
      build();
      if (st.ready && st.org === S.org.id) { drawList(); }
    }
    const want = r.id || null;
    const start = async () => {
      if (!st.ready || st.org !== S.org.id) { await load(); }
      let id = want;
      if (!id && innerWidth > 900) id = (st.channels.find(c => c.kind === 'company') || st.channels[0])?.id || null; // desktop opens the company chat
      if (id && !chanOf(id)) id = null;
      if (!fast || st.active !== id) await openChannel(id); else { drawList(); }
      if (!id) drawConversation();
    };
    if (fast && st.active === want && st.ready) return;
    start().catch(err => {
      console.error(err);
      const html = '<div class="error-state"><p>ჩატი ვერ ჩაიტვირთა.</p><button type="button" data-chat-retry>ხელახლა ცდა</button></div>';
      if ($('#chat-list')) $('#chat-list').innerHTML = html;
      if ($('#chat-msgs')) $('#chat-msgs').innerHTML = html;
    });
  };
})();
