// In-browser stand-in for supabase-js used by the UI tests.
// Emulates the query builder subset the app uses, auth, storage, the RPCs and
// the key database triggers (task lifecycle, approval -> expense sync).
// State lives in localStorage so it survives page navigation.
(function () {
  const KEY = 'rigzea_mockdb';
  const load = () => JSON.parse(localStorage.getItem(KEY) || 'null') || (window.__MOCK_SEED ? structuredClone(window.__MOCK_SEED) : { tables: {}, users: [] });
  const save = (db) => localStorage.setItem(KEY, JSON.stringify(db));
  let db = load();
  save(db);
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const T = (name) => (db.tables[name] = db.tables[name] || []);
  const session = () => JSON.parse(localStorage.getItem('rigzea_mock_session') || 'null');
  const uid = () => session()?.user?.id || null;

  // Failure injection: localStorage.rigzea_mock_fail = JSON {"insert:tasks": 1, "rpc:x": 1, "select:*": 1}
  function shouldFail(key) {
    const f = JSON.parse(localStorage.getItem('rigzea_mock_fail') || '{}');
    const k = f[key] ? key : (f[key.split(':')[0] + ':*'] ? key.split(':')[0] + ':*' : null);
    if (!k) return false;
    f[k] -= 1;
    if (f[k] <= 0) delete f[k];
    localStorage.setItem('rigzea_mock_fail', JSON.stringify(f));
    return true;
  }
  const netErr = () => ({ data: null, error: { message: 'Failed to fetch', code: 'NETWORK' } });
  const delay = () => new Promise(r => setTimeout(r, Number(localStorage.getItem('rigzea_mock_delay') || 60)));

  function memberOf(org) { return T('organization_members').find(m => m.organization_id === org && m.user_id === uid()); }

  function taskTrigger(row, old) {
    row.updated_at = now();
    if (row.assigned_to && row.status === 'new') row.status = 'assigned';
    if (!row.assigned_to && row.status === 'assigned') row.status = 'new';
    if (old && row.status !== old.status) {
      const allowed = {
        new: ['assigned', 'in_progress', 'cancelled'],
        assigned: ['new', 'in_progress', 'blocked', 'cancelled', 'done'],
        in_progress: ['assigned', 'blocked', 'done', 'cancelled'],
        blocked: ['assigned', 'in_progress', 'cancelled', 'new'],
        done: ['in_progress', 'assigned'],
        cancelled: ['new', 'assigned'],
      }[old.status] || [];
      if (!allowed.includes(row.status)) return { message: `სტატუსის შეცვლა „${old.status}“ → „${row.status}“ დაუშვებელია` };
    }
    if (row.status === 'blocked' && !(row.blocked_reason || '').trim()) return { message: 'შეჩერებისთვის მიუთითეთ მიზეზი' };
    if (row.status !== 'blocked') row.blocked_reason = null;
    if (row.status === 'in_progress' && !row.started_at) row.started_at = now();
    row.completed_at = row.status === 'done' ? (row.completed_at || now()) : null;
    if (row.assigned_to && (!old || old.assigned_to !== row.assigned_to)) {
      row.assigned_at = now();
      const m = T('organization_members').find(x => x.id === row.assigned_to);
      if (m) T('notifications').push({ id: uuid(), organization_id: row.organization_id, user_id: m.user_id, title: 'ახალი დავალება: ' + row.title, message: '', type: 'assignment', link: '/staff/', is_read: false, created_at: now() });
    }
    return null;
  }

  function expenseTrigger(row, old) {
    if (old && row.status !== old.status) {
      const allowed = { proposed: ['approved', 'declined'], approved: ['incurred', 'paid', 'proposed'], declined: ['proposed'], incurred: ['paid', 'approved'], paid: ['incurred'] }[old.status] || [];
      if (!allowed.includes(row.status)) return { message: `ხარჯის სტატუსის შეცვლა „${old.status}“ → „${row.status}“ დაუშვებელია` };
    }
    row.status = row.status || 'incurred';
    if (row.status === 'approved' && !row.approved_at) row.approved_at = now();
    if (['incurred', 'paid'].includes(row.status) && !row.incurred_at) row.incurred_at = now();
    if (row.status === 'paid' && !row.paid_at) row.paid_at = now();
    if (row.status !== 'paid') row.paid_at = null;
    return null;
  }

  const DEFAULTS = {
    tasks: { status: 'new', priority: 'normal', type: 'other', checklist: [], photos: [] },
    expenses: { status: 'incurred', receipt_required: true, charge_to_owner: true },
    approvals: { status: 'pending', photos: [] },
    apartments: { status: 'active', commission_pct: 20, transaction_type: 'long_term', property_type: 'apartment', bathrooms: 1 },
    deals: { stage: 'enquiry', deal_type: 'rental', commission_type: 'percent', contact_type: 'buyer', currency: 'USD' },
    owners: { contact_type: 'owner' },
    reservations: { status: 'confirmed', source: 'airbnb' },
    notifications: { is_read: false },
    chat_messages: { body: '', attachments: [], reply_to: null, edited_at: null, deleted_at: null, deleted_by: null },
    monthly_reports: { status: 'draft' },
    invitations: { status: 'pending' },
  };

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.orders = []; this.lim = null; this.mode = null; this.ret = false; }
    select(cols, opts) { if (this.op !== 'select') this.ret = true; else { this.cols = cols || '*'; this.wantCount = !!(opts && opts.count); } return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p, o = {}) { this.op = 'upsert'; this.payload = p; this.ignoreDup = !!o.ignoreDuplicates; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push(r => r[c] === v); return this; }
    neq(c, v) { this.filters.push(r => r[c] !== v); return this; }
    in(c, v) { this.filters.push(r => v.includes(r[c])); return this; }
    gte(c, v) { this.filters.push(r => r[c] != null && r[c] >= v); return this; }
    lte(c, v) { this.filters.push(r => r[c] != null && r[c] <= v); return this; }
    lt(c, v) { this.filters.push(r => r[c] != null && r[c] < v); return this; }
    gt(c, v) { this.filters.push(r => r[c] != null && r[c] > v); return this; }
    is(c, v) { this.filters.push(r => (r[c] ?? null) === v); return this; }
    order(c, o = {}) { this.orders.push([c, o.ascending !== false]); return this; }
    limit(n) { this.lim = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(res, rej) { return this.exec().then(res, rej); }
    // Chat tables mirror supabase/patches/24_chat.sql: read and write only inside conversations the signed in member belongs to,
    // staff cannot chat, authors edit their own text, owners and admins can delete any message.
    chatExec() {
      const me = uid();
      const rows = T(this.table);
      const ROLES = ['owner', 'admin', 'manager', 'agent'];
      const eligible = (org) => { const m = memberOf(org); return !!m && ROLES.includes(m.role); };
      const mine = new Set(T('chat_channel_members').filter(m => m.user_id === me && eligible(m.organization_id)).map(m => m.channel_id));
      const channelOf = (r) => (this.table === 'chat_channels' ? r.id : r.channel_id);
      const visible = (r) => mine.has(channelOf(r));
      const fail = (message, code = '42501') => ({ data: null, error: { message, code } });
      const emit = (eventType, row, old = null) => window.dispatchEvent(new CustomEvent('mock-realtime', { detail: { table: this.table, eventType, new: row, old } }));
      let out = [];
      if (this.op === 'select') {
        out = rows.filter(r => visible(r) && this.filters.every(f => f(r)));
        for (const [c, asc] of this.orders.slice().reverse()) out.sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
        if (this.lim) out = out.slice(0, this.lim);
      } else if (this.op === 'insert' && this.table === 'chat_messages') {
        const p = structuredClone(this.payload);
        const ch = T('chat_channels').find(c => c.id === p.channel_id);
        if (p.sender_id !== me || !ch || !visible(p) || p.organization_id !== ch.organization_id) return fail('new row violates row-level security policy for table "chat_messages"');
        const body = String(p.body || '').trim();
        const att = p.attachments || [];
        if (!Array.isArray(att) || att.length > 5) return fail('at most 5 attachments', '22023');
        if (!body && !att.length) return fail('empty message', '22023');
        if (body.length > 4000) return fail('value too long', '22001');
        if (att.some(a => !String(a.path || '').startsWith(`${p.organization_id}/chat/${p.channel_id}/`))) return fail('attachment must be in this conversation folder', '22023');
        if (p.reply_to && !rows.some(r => r.id === p.reply_to && r.channel_id === p.channel_id)) return fail('reply must be in the same conversation', '22023');
        if (rows.filter(r => r.sender_id === me && Date.now() - new Date(r.created_at).getTime() < 60000).length >= 30) return fail('too many messages, wait a moment', '54000');
        const row = { id: uuid(), body: '', attachments: [], reply_to: null, edited_at: null, deleted_at: null, deleted_by: null, created_at: now(), ...p, body };
        rows.push(row); emit('INSERT', row); out = [row];
      } else if (this.op === 'insert' && this.table === 'chat_reactions') {
        const p = structuredClone(this.payload);
        const msg = T('chat_messages').find(m => m.id === p.message_id);
        if (p.user_id !== me || !msg || !visible(msg) || msg.deleted_at || p.channel_id !== msg.channel_id || p.organization_id !== msg.organization_id) return fail('new row violates row-level security policy for table "chat_reactions"');
        if (!['👍', '❤️', '😂', '🎉', '🙏', '👀'].includes(p.emoji)) return fail('invalid emoji', '23514');
        if (rows.some(r => r.message_id === p.message_id && r.user_id === me && r.emoji === p.emoji)) return fail('duplicate key value violates unique constraint', '23505');
        const row = { created_at: now(), ...p };
        rows.push(row); emit('INSERT', row); out = [row];
      } else if (this.op === 'update' && this.table === 'chat_messages') {
        const admin = (org) => { const m = memberOf(org); return !!m && ['owner', 'admin'].includes(m.role); };
        for (const r of rows.filter(r => visible(r) && this.filters.every(f => f(r)))) {
          if (r.sender_id !== me && !admin(r.organization_id)) continue; // the update policy hides these rows
          const old = structuredClone(r), patch = structuredClone(this.payload), next = { ...r, ...patch };
          if (['id', 'channel_id', 'organization_id', 'sender_id', 'created_at'].some(k => next[k] !== old[k]) || next.reply_to !== old.reply_to) return fail('this part of a message cannot change');
          if (old.deleted_at) return fail('a deleted message cannot change');
          if (next.deleted_at) { next.deleted_by = me; next.body = ''; next.attachments = []; }
          else {
            if (JSON.stringify(next.attachments) !== JSON.stringify(old.attachments) || next.deleted_by !== old.deleted_by) return fail('this part of a message cannot change');
            if (next.body !== old.body) {
              if (old.sender_id !== me) return fail('only the author edits a message');
              next.body = String(next.body).trim();
              if (!next.body && !(old.attachments || []).length) return fail('empty message', '22023');
              next.edited_at = now();
            }
          }
          Object.assign(r, next); emit('UPDATE', structuredClone(r), old); out.push(r);
        }
      } else if (this.op === 'delete' && this.table === 'chat_reactions') {
        const gone = rows.filter(r => r.user_id === me && visible(r) && this.filters.every(f => f(r)));
        db.tables[this.table] = rows.filter(r => !gone.includes(r));
        gone.forEach(r => emit('DELETE', null, structuredClone(r)));
        out = gone;
      } else {
        return fail(`permission denied for table ${this.table}`);
      }
      save(db);
      if (this.op !== 'select' && !this.ret) return { data: null, error: null };
      const data = structuredClone(out);
      if (this.mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      if (this.mode === 'maybe') return { data: data[0] || null, error: null };
      return { data, error: null, count: this.wantCount ? data.length : null };
    }
    async exec() {
      await delay();
      // Slow one table down: localStorage.rigzea_mock_slow = JSON {"tasks": 2500}
      const slow = JSON.parse(localStorage.getItem('rigzea_mock_slow') || '{}')[this.table];
      if (slow) await new Promise(r => setTimeout(r, slow));
      db = load();
      if (shouldFail(`${this.op}:${this.table}`)) return netErr();
      if (this.table.startsWith('chat_')) return this.chatExec();
      const rows = T(this.table);
      const match = rows.filter(r => this.filters.every(f => f(r)));
      let out;
      if (this.op === 'select') {
        out = match.slice();
        for (const [c, asc] of this.orders.slice().reverse()) out.sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
        if (this.lim) out = out.slice(0, this.lim);
        const join = /(\w+)\(\*\)/.exec(this.cols || '');
        if (join) out = out.map(r => ({ ...r, [join[1]]: T(join[1]).find(x => x.id === r[join[1].replace(/s$/, '') + '_id']) || null }));
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        out = [];
        for (const p of list) {
          const row = { id: uuid(), created_at: now(), ...(DEFAULTS[this.table] || {}), ...structuredClone(p) };
          if (rows.some(r => r.id === row.id)) {
            if (this.op === 'upsert' && this.ignoreDup) continue;
            if (this.op === 'upsert') { Object.assign(rows.find(r => r.id === row.id), row); out.push(row); continue; }
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          if (this.table === 'approvals' && !row.token) row.token = uuid().replace(/-/g, '');
          if (this.table === 'invitations') { row.token = row.token || uuid().replace(/-/g, ''); row.expires_at = row.expires_at || new Date(Date.now() + 14 * 864e5).toISOString(); row.send_count = 0; }
          const err = this.table === 'tasks' ? taskTrigger(row, null) : this.table === 'expenses' ? expenseTrigger(row, null) : null;
          if (err) return { data: null, error: err };
          rows.push(row); out.push(row);
        }
      } else if (this.op === 'update') {
        out = [];
        for (const r of match) {
          const old = structuredClone(r);
          const next = { ...r, ...structuredClone(this.payload) };
          const err = this.table === 'tasks' ? taskTrigger(next, old) : this.table === 'expenses' ? expenseTrigger(next, old) : null;
          if (err) return { data: null, error: err };
          Object.assign(r, next); out.push(r);
          if (this.table === 'approvals' && old.status !== r.status && ['approved', 'declined'].includes(r.status)) {
            T('expenses').filter(e => e.approval_id === r.id && e.status === 'proposed').forEach(e => { e.status = r.status; });
          }
        }
      } else if (this.op === 'delete') {
        db.tables[this.table] = rows.filter(r => !match.includes(r));
        out = match;
      }
      save(db);
      if (this.op !== 'select' && !this.ret) return { data: null, error: null };
      const data = structuredClone(out);
      if (this.mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
      if (this.mode === 'maybe') return { data: data[0] || null, error: null };
      return { data, error: null, count: this.wantCount ? match.length : null };
    }
  }

  const rpcs = {
    chat_open_direct({ p_org, p_other }) {
      const ROLES = ['owner', 'admin', 'manager', 'agent'];
      const meM = memberOf(p_org);
      if (!meM || !ROLES.includes(meM.role)) throw new Error('chat is not available for this account');
      const other = T('organization_members').find(m => m.organization_id === p_org && m.user_id === p_other);
      if (!p_other || p_other === uid()) throw new Error('pick another member');
      if (!other || !ROLES.includes(other.role)) throw new Error('that person cannot use chat');
      const key = [uid(), p_other].sort().join(':');
      let ch = T('chat_channels').find(c => c.organization_id === p_org && c.kind === 'direct' && c.dm_key === key);
      if (!ch) { ch = { id: uuid(), organization_id: p_org, kind: 'direct', dm_key: key, created_by: uid(), created_at: now() }; T('chat_channels').push(ch); }
      for (const u of [uid(), p_other]) if (!T('chat_channel_members').some(m => m.channel_id === ch.id && m.user_id === u)) T('chat_channel_members').push({ channel_id: ch.id, organization_id: p_org, user_id: u, last_read_at: now(), joined_at: now() });
      return ch.id;
    },
    chat_mark_read({ p_channel }) {
      const m = T('chat_channel_members').find(x => x.channel_id === p_channel && x.user_id === uid());
      if (m) m.last_read_at = now();
      return null;
    },
    chat_unread_counts({ p_org }) {
      return T('chat_channel_members').filter(cm => cm.user_id === uid() && cm.organization_id === p_org).map(cm => ({
        channel_id: cm.channel_id,
        unread: T('chat_messages').filter(m => m.channel_id === cm.channel_id && m.created_at > cm.last_read_at && m.sender_id !== cm.user_id && !m.deleted_at).length,
      })).filter(x => x.unread > 0);
    },
    // mirrors supabase/patches/23_profile_branding.sql: own row only, role untouched, Georgian first and last name
    update_my_profile({ p_org, p_name, p_avatar, p_clear_avatar }) {
      const me = T('organization_members').find(m => m.organization_id === p_org && m.user_id === uid());
      if (!me) throw new Error('not a member of this workspace');
      const name = String(p_name || '').replace(/\s+/g, ' ').trim();
      const ok = /^[ა-ჿ]{2,}(-[ა-ჿ]{2,})*( [ა-ჿ]{2,}(-[ა-ჿ]{2,})*)+$/.test(name);
      const exempt = (db.users.find(u => u.id === uid()) || {}).email === 'akhalaianika44@gmail.com';
      if (name && !ok && !exempt) throw new Error('name must be a first and last name in Georgian');
      if (name) me.display_name = name;
      if (p_clear_avatar) me.avatar_url = null; else if (p_avatar) me.avatar_url = p_avatar;
      return me;
    },
    create_user_organization(a) {
      const org = { id: uuid(), name: a.p_org_name, city: a.p_city, portfolio_size: a.p_portfolio_size, plan: 'trial', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_at: now() };
      T('organizations').push(org);
      const u = db.users.find(x => x.id === uid());
      T('organization_members').push({ id: uuid(), organization_id: org.id, user_id: uid(), role: 'owner', display_name: u?.name || 'მმართველი', created_at: now() });
      return org.id;
    },
    accept_my_invitations() { return 0; },
    // mirror supabase/patches/25_invites.sql
    get_invitation({ p_token }) {
      const i = T('invitations').find(x => x.token === p_token);
      if (!i || !/^[0-9a-f]{32}$/.test(String(p_token))) return null;
      const org = T('organizations').find(o => o.id === i.organization_id);
      const by = T('organization_members').find(m => m.user_id === i.invited_by && m.organization_id === i.organization_id);
      const state = i.status !== 'pending' ? i.status : (i.expires_at && i.expires_at <= now() ? 'expired' : 'pending');
      return { email: i.email, role: i.role, org_name: org?.name, inviter: by?.display_name || null, state };
    },
    accept_invitation({ p_token }) {
      if (!uid()) throw new Error('sign in first');
      const i = T('invitations').find(x => x.token === p_token);
      if (!i) throw new Error('invitation not found');
      const email = (db.users.find(u => u.id === uid()) || {}).email;
      if (String(i.email).toLowerCase() !== String(email).toLowerCase()) throw new Error('invitation is for another email');
      const member = T('organization_members').find(m => m.organization_id === i.organization_id && m.user_id === uid());
      if (i.status === 'accepted' && member) return { organization_id: i.organization_id, role: i.role, already: true };
      if (i.status !== 'pending') throw new Error('invitation is ' + i.status);
      if (i.expires_at && i.expires_at <= now()) throw new Error('invitation expired');
      if (!member) T('organization_members').push({ id: uuid(), organization_id: i.organization_id, user_id: uid(), role: i.role, display_name: (db.users.find(u => u.id === uid()) || {}).name || String(email).split('@')[0], created_at: now() });
      i.status = 'accepted';
      return { organization_id: i.organization_id, role: i.role, already: false };
    },
    invitation_email_data({ p_id }) {
      const i = T('invitations').find(x => x.id === p_id);
      const meM = i && memberOf(i.organization_id);
      if (!i || !meM || !['owner', 'admin'].includes(meM.role)) throw new Error('not allowed');
      if (i.status !== 'pending') throw new Error('invitation is not pending');
      if ((i.send_count || 0) >= 5) throw new Error('too many emails for this invitation');
      if (i.last_sent_at && Date.now() - new Date(i.last_sent_at).getTime() < 30000) throw new Error('wait a moment before sending again');
      i.send_count = (i.send_count || 0) + 1; i.last_sent_at = now();
      return { email: i.email, role: i.role, token: i.token, org_name: T('organizations').find(o => o.id === i.organization_id)?.name, inviter: meM.display_name, expires_at: i.expires_at };
    },
    is_platform_admin() { return T('platform_admins').some(x => x.user_id === uid() && !x.revoked_at); },
    list_platform_admins() {
      if (!rpcs.is_platform_admin()) throw { message: 'ამ მოქმედების უფლება არ გაქვს.', code: '42501' };
      return T('platform_admins').filter(x => !x.revoked_at).map(x => ({ user_id: x.user_id, email: db.users.find(u => u.id === x.user_id)?.email || '', granted_at: x.created_at || now(), granted_by_email: db.users.find(u => u.id === x.granted_by)?.email || null }));
    },
    grant_platform_admin(a) {
      if (!rpcs.is_platform_admin()) throw { message: 'ამ მოქმედების უფლება არ გაქვს.', code: '42501' };
      const u = db.users.find(x => x.email === a.p_email);
      if (!u) throw { message: 'ამ ელფოსტით მომხმარებელი ვერ მოიძებნა.' };
      const row = T('platform_admins').find(x => x.user_id === u.id);
      if (row) { row.revoked_at = null; row.granted_by = uid(); } else T('platform_admins').push({ user_id: u.id, granted_by: uid(), created_at: now(), revoked_at: null });
      return { user_id: u.id, email: u.email };
    },
    revoke_platform_admin(a) {
      if (!rpcs.is_platform_admin()) throw { message: 'ამ მოქმედების უფლება არ გაქვს.', code: '42501' };
      const u = db.users.find(x => x.email === a.p_email);
      const row = u && T('platform_admins').find(x => x.user_id === u.id && !x.revoked_at);
      if (!row) throw { message: 'ამ ელფოსტით პლატფორმის ადმინი ვერ მოიძებნა.' };
      if (T('platform_admins').filter(x => !x.revoked_at).length <= 1) throw { message: 'ბოლო ადმინის უფლების მოხსნა შეუძლებელია.' };
      row.revoked_at = now();
      return { user_id: u.id, email: u.email };
    },
    admin_list_orgs() {
      if (!rpcs.is_platform_admin()) throw { message: 'ამ მოქმედების უფლება არ გაქვს.' };
      return T('organizations').map(o => ({ id: o.id, name: o.name, city: o.city, plan: o.plan || 'trial', effective_plan: o.plan || 'trial', trial_ends_at: o.trial_ends_at || null, plan_expires_at: o.plan_expires_at || null, created_at: o.created_at, owner_email: 'owner@example.ge', apartments_count: T('apartments').filter(a => a.organization_id === o.id).length, members_count: T('organization_members').filter(m => m.organization_id === o.id).length }));
    },
    admin_set_org_plan(a) {
      if (!rpcs.is_platform_admin()) throw { message: 'ამ მოქმედების უფლება არ გაქვს.' };
      const o = T('organizations').find(x => x.id === a.p_org);
      o.plan = a.p_plan;
      const end = a.p_days == null ? null : new Date(Date.now() + a.p_days * 864e5).toISOString();
      if (a.p_plan === 'trial') o.trial_ends_at = new Date(Date.now() + (a.p_days ?? 14) * 864e5).toISOString();
      o.plan_expires_at = ['trial', 'starter'].includes(a.p_plan) ? null : end;
      return { id: o.id, plan: o.plan, trial_ends_at: o.trial_ends_at || null, plan_expires_at: o.plan_expires_at };
    },
    scan_alerts() { return 0; },
    create_telegram_link_code() { return { code: 'TESTC0DE'.replace('0', '2'), expires_at: new Date(Date.now() + 900e3).toISOString() }; },
    generate_statement(a) {
      const apt = T('apartments').find(x => x.id === a.p_apartment);
      const inMonth = (d) => (d || '').startsWith(a.p_month);
      const inc = T('income').filter(i => i.apartment_id === apt.id && inMonth(i.income_date));
      const exp = T('expenses').filter(e => e.apartment_id === apt.id && e.charge_to_owner !== false && ['approved', 'incurred', 'paid'].includes(e.status) && inMonth(e.expense_date));
      const ti = inc.reduce((s, x) => s + Number(x.amount), 0), te = exp.reduce((s, x) => s + Number(x.amount), 0);
      const comm = Math.round(ti * Number(apt.commission_pct || 0)) / 100;
      let rep = T('monthly_reports').find(r => r.apartment_id === apt.id && r.month_period === a.p_month);
      if (rep && rep.status !== 'draft') throw { message: 'ამ თვის ამონაწერი უკვე დასრულებულია' };
      const fields = { organization_id: apt.organization_id, apartment_id: apt.id, owner_id: apt.owner_id, month_period: a.p_month, total_income: ti, total_expenses: te, commission: comm, net_result: ti - te - comm, status: 'draft', snapshot_data: { apartment: apt.name, commission_pct: apt.commission_pct, income: inc.map(i => ({ date: i.income_date, source: i.source, amount: i.amount, description: i.description })), expenses: exp.map(e => ({ date: e.expense_date, category: e.category, amount: e.amount, description: e.description, status: e.status, receipt_url: e.receipt_url })) } };
      if (rep) Object.assign(rep, fields); else { rep = { id: uuid(), created_at: now(), ...fields }; T('monthly_reports').push(rep); }
      return rep.id;
    },
    staff_update_task(a) {
      const t = T('tasks').find(x => x.id === a.p_task);
      if (!t) throw { message: 'დავალება ვერ მოიძებნა' };
      const checklist = a.p_checklist ?? t.checklist;
      if (a.p_status === 'done' && (checklist || []).some(i => !i.done)) throw { message: 'დასასრულებლად მონიშნე ჩეკლისტის ყველა პუნქტი' };
      if (a.p_status === 'done' && t.type === 'cleaning' && !(t.photos || []).some(p => p.phase === 'after')) throw { message: 'დასასრულებლად ატვირთე მინიმუმ ერთი „შემდეგ“ ფოტო' };
      const old = structuredClone(t);
      const next = { ...t, status: a.p_status || t.status, checklist, notes: a.p_notes ?? t.notes, blocked_reason: a.p_status === 'blocked' ? a.p_blocked_reason : t.blocked_reason };
      const err = taskTrigger(next, old);
      if (err) throw err;
      Object.assign(t, next);
      return structuredClone(t);
    },
    staff_add_task_photo(a) {
      const t = T('tasks').find(x => x.id === a.p_task);
      t.photos = [...(t.photos || []), { url: a.p_url, phase: a.p_phase, at: now() }];
      return structuredClone(t);
    },
    staff_report_problem(a) {
      const t = T('tasks').find(x => x.id === a.p_task);
      const row = { id: uuid(), created_at: now(), organization_id: t.organization_id, apartment_id: t.apartment_id, title: a.p_title, description: a.p_description, type: 'maintenance', priority: a.p_urgent ? 'urgent' : 'normal', status: 'new', parent_task_id: t.id, checklist: [], photos: a.p_photo_url ? [{ url: a.p_photo_url, phase: 'problem' }] : [] };
      T('tasks').push(row);
      return row.id;
    },
    // Smart link (supabase/patches/01_smartlink.sql)
    get_public_listing(a) {
      const ref = String(a.p_ref || '').toLowerCase();
      const apt = T('apartments').find(x => x.id === ref || (x.slug && x.slug === ref));
      if (!apt || apt.is_archived || apt.status === 'archived') return { success: false, error: 'not_found' };
      const org = T('organizations').find(x => x.id === apt.organization_id) || {};
      const { door_code, wifi_name, wifi_password, access_instructions, parking_info, owner_id, tenant_name, tenant_phone, notes, commission_pct, ...pub } = apt;
      const displayPrice = apt.transaction_type === 'sale' ? (apt.sale_price ?? 0) : (apt.monthly_rent ?? 0);
      const priceSqm = apt.price_sqm ?? (apt.area_sqm > 0 && apt.sale_price > 0 ? Math.round((apt.sale_price / apt.area_sqm) * 100) / 100 : null);
      return {
        success: true,
        apartment: {
          ...pub,
          transaction_type: apt.transaction_type || 'long_term',
          property_type: apt.property_type || 'apartment',
          bathrooms: apt.bathrooms ?? 1,
          price: displayPrice,
          sale_price: apt.sale_price ?? null,
          price_sqm: priceSqm,
          photos: apt.photos || [],
          amenities: apt.amenities || [],
          agent_phone: apt.agent_phone || org.contact_phone
        },
        agency: {
          name: org.name,
          logo_url: org.logo_url || null,
          brand_color: org.brand_color || null,
          agent_name: apt.agent_name || null,
          phone: apt.agent_phone || org.contact_phone
        }
      };
    },
    get_public_showcase(a) { return rpcs.get_public_listing({ p_ref: a.p_apartment_id }); },
    track_link_event(a) {
      const ref = String(a.p_ref || '').toLowerCase();
      const apt = T('apartments').find(x => x.id === ref || (x.slug && x.slug === ref));
      if (!apt || !['view', 'whatsapp', 'call'].includes(a.p_kind)) return false;
      const ev = T('link_events');
      const win = a.p_kind === 'view' ? 30 * 60e3 : 2 * 60e3;
      if (a.p_visitor && ev.some(e => e.apartment_id === apt.id && e.visitor === a.p_visitor && e.kind === a.p_kind && Date.now() - new Date(e.created_at) < win)) return false;
      ev.push({ id: ev.length + 1, organization_id: apt.organization_id, apartment_id: apt.id, selection_id: a.p_selection_id || null, kind: a.p_kind, visitor: a.p_visitor || null, created_at: now() });
      return true;
    },
    // Same split as supabase/patches/18: the id link gets the public part, the token link everything.
    get_guest_guide(a) {
      const apt = T('apartments').find(x => x.id === a.p_apartment_id && x.status !== 'archived');
      if (!apt) return null;
      const { id, name, city, address, unit_number, checkin_time, checkout_time, parking_info } = apt;
      return { id, name, city, address, unit_number, checkin_time, checkout_time, parking_info, contact_phone: apt.agent_phone || null };
    },
    get_guest_guide_by_token(a) {
      const apt = String(a.p_token || '').length >= 24 && T('apartments').find(x => x.guide_token === a.p_token && x.status !== 'archived');
      if (!apt) return null;
      return { ...rpcs.get_guest_guide({ p_apartment_id: apt.id }), wifi_name: apt.wifi_name, wifi_password: apt.wifi_password, door_code: apt.door_code, access_instructions: apt.access_instructions };
    },
    get_link_stats(a) {
      const ev = T('link_events').filter(e => e.apartment_id === a.p_apartment_id);
      const views = ev.filter(e => e.kind === 'view');
      return { views: views.length, visitors: new Set(views.map(e => e.visitor)).size, whatsapp: ev.filter(e => e.kind === 'whatsapp').length, calls: ev.filter(e => e.kind === 'call').length, views_7d: views.filter(e => Date.now() - new Date(e.created_at) < 7 * 864e5).length, last_view_at: views.map(e => e.created_at).sort().pop() || null };
    },
    get_public_approval(a) {
      const ap = T('approvals').find(x => x.token === a.p_token);
      if (!ap) return { success: false, error: 'მოთხოვნა ვერ მოიძებნა ან ვადაგასულია' };
      const apt = T('apartments').find(x => x.id === ap.apartment_id) || {};
      const owner = T('owners').find(x => x.id === ap.owner_id) || {};
      const org = T('organizations').find(x => x.id === ap.organization_id) || {};
      return { success: true, approval: { id: ap.id, title: ap.title, amount: ap.amount, description: ap.description, status: ap.status, photos: ap.photos, created_at: ap.created_at, responded_at: ap.responded_at, response_note: ap.response_note }, apartment: { name: apt.name, address: apt.address, unit_number: apt.unit_number, city: apt.city }, owner: { name: owner.name }, organization: { name: org.name, contact_phone: org.contact_phone }, repair: { issue: null, contractor_name: null } };
    },
    get_public_selection(a) {
      const sel = T('selections').find(x => x.slug === a.p_slug && x.is_active !== false);
      if (!sel) return { success: false, error: 'not_found' };
      const org = T('organizations').find(x => x.id === sel.organization_id) || {};
      const apartments = (sel.apartment_ids || []).map(id => T('apartments').find(x => x.id === id && x.organization_id === sel.organization_id && x.status !== 'archived')).filter(Boolean)
        .map(x => ({
          id: x.id,
          slug: x.slug || null,
          title: x.name,
          transaction_type: x.transaction_type || 'long_term',
          price: x.transaction_type === 'sale' ? (x.sale_price ?? null) : (x.monthly_rent ?? null),
          sale_price: x.sale_price ?? null,
          monthly_rent: x.monthly_rent ?? null,
          currency: x.currency || 'USD',
          rooms: x.rooms ?? null,
          bedrooms: x.bedrooms ?? null,
          bathrooms: x.bathrooms ?? 1,
          area_sqm: x.area_sqm ?? null,
          floor: x.floor ?? null,
          total_floors: x.total_floors ?? null,
          district: x.district || null,
          city: x.city || null,
          pets_allowed: !!x.pets_allowed,
          photos: (x.photos || []).slice(0, 4),
          agent_phone: x.agent_phone || null
        }));
      if (!apartments.length) return { success: false, error: 'not_found' };
      return { success: true, selection: { client_name: sel.client_name, created_at: sel.created_at }, apartments, agency: { name: org.name, phone: org.contact_phone || null, logo_url: org.logo_url || null, brand_color: org.brand_color || null, fx_rate: org.fx_rate ?? 2.7 } };
    },
    respond_public_approval(a) {
      const ap = T('approvals').find(x => x.token === a.p_token);
      if (!ap) return { success: false, error: 'მოთხოვნა ვერ მოიძებნა' };
      if (ap.status !== 'pending') return { success: false, error: 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია' };
      ap.status = a.p_decision; ap.response_note = a.p_note; ap.responded_at = now();
      T('expenses').filter(e => e.approval_id === ap.id && e.status === 'proposed').forEach(e => { e.status = a.p_decision; });
      return { success: true, status: a.p_decision };
    },
  };

  const client = {
    from: (t) => new Query(t),
    async rpc(name, args = {}) {
      await delay();
      db = load();
      if (shouldFail('rpc:' + name)) return netErr();
      if (!rpcs[name]) return { data: null, error: { message: 'function ' + name + ' does not exist' } };
      try { const data = rpcs[name](args); save(db); return { data: structuredClone(data), error: null }; }
      catch (e) { return { data: null, error: { message: e.message || String(e) } }; }
    },
    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      async getUser() { return { data: { user: session()?.user || null }, error: null }; },
      async signInWithPassword({ email, password }) {
        await delay();
        const u = db.users.find(x => x.email === email && x.password === password);
        if (!u) return { data: {}, error: { message: 'Invalid login credentials' } };
        const s = { access_token: 'mock', user: { id: u.id, email: u.email, user_metadata: { full_name: u.name } } };
        localStorage.setItem('rigzea_mock_session', JSON.stringify(s));
        return { data: { user: s.user, session: s }, error: null };
      },
      async signUp({ email, password, options }) {
        const u = { id: uuid(), email, password, name: options?.data?.full_name };
        db.users.push(u); save(db);
        if (/^confirm/.test(email)) return { data: { user: { id: u.id, email }, session: null }, error: null }; // email confirmation required: the code step
        const s = { access_token: 'mock', user: { id: u.id, email, user_metadata: { full_name: u.name } } };
        localStorage.setItem('rigzea_mock_session', JSON.stringify(s));
        return { data: { user: s.user, session: s }, error: null };
      },
      async verifyOtp({ email, token }) {
        const u = db.users.find(x => x.email === email);
        if (!u || token !== '123456') return { data: null, error: { message: 'Token has expired or is invalid' } };
        const s = { access_token: 'mock', user: { id: u.id, email, user_metadata: { full_name: u.name } } };
        localStorage.setItem('rigzea_mock_session', JSON.stringify(s));
        return { data: { user: s.user, session: s }, error: null };
      },
      async resend() { return { data: {}, error: null }; },
      async signOut(opts) { window.__signOutScope = opts?.scope || 'local'; if (opts?.scope !== 'others') localStorage.removeItem('rigzea_mock_session'); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      async updateUser(a) { const u = db.users.find(x => x.id === uid()); if (!u) return { data: null, error: { message: 'Auth session missing' } }; if (a.password) u.password = a.password; if (a.data?.full_name) u.name = a.data.full_name; save(db); return { data: { user: u }, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    // Realtime stub: handlers registered with channel().on('postgres_changes', ...) hear the mock database's own writes (and anything a test dispatches as 'mock-realtime').
    channel(name) {
      const handlers = [];
      const listener = (e) => handlers.forEach(h => {
        const d = e.detail;
        if (h.filter.table && h.filter.table !== d.table) return;
        if (h.filter.event && h.filter.event !== '*' && h.filter.event !== d.eventType) return;
        const m = /^(\w+)=eq\.(.+)$/.exec(h.filter.filter || '');
        const row = d.new || d.old;
        if (m && String(row?.[m[1]]) !== m[2]) return;
        h.cb({ eventType: d.eventType, new: d.new || {}, old: d.old || {}, table: d.table });
      });
      window.addEventListener('mock-realtime', listener);
      const ch = { on(type, filter, cb) { handlers.push({ filter, cb }); return ch; }, subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; }, unsubscribe() { window.removeEventListener('mock-realtime', listener); return Promise.resolve('ok'); } };
      return ch;
    },
    removeChannel(ch) { return ch?.unsubscribe?.(); },
    storage: {
      from: () => ({
        async upload(path) { await delay(); if (shouldFail('upload:storage')) return netErr(); return { data: { path }, error: null }; },
        async createSignedUrl(path) { await delay(); return { data: { signedUrl: 'https://mock.storage.local/signed/' + path }, error: null }; },
        async createSignedUrls(paths) { await delay(); return { data: paths.map(path => ({ path, signedUrl: 'https://mock.storage.local/signed/' + path })), error: null }; },
        getPublicUrl(path) { return { data: { publicUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#cbd5e1"/><text x="10" y="50" font-size="10">' + path.split('/').pop() + '</text></svg>') } }; },
      }),
    },
  };

  window.supabase = { createClient: () => client };
})();
