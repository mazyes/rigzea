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
    monthly_reports: { status: 'draft' },
    invitations: { status: 'pending' },
  };

  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.orders = []; this.lim = null; this.mode = null; this.ret = false; }
    select(cols) { if (this.op !== 'select') this.ret = true; else this.cols = cols || '*'; return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
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
    async exec() {
      await delay();
      db = load();
      if (shouldFail(`${this.op}:${this.table}`)) return netErr();
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
            if (this.op === 'upsert') { Object.assign(rows.find(r => r.id === row.id), row); out.push(row); continue; }
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          if (this.table === 'approvals' && !row.token) row.token = uuid().replace(/-/g, '');
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
      return { data, error: null };
    }
  }

  const rpcs = {
    create_user_organization(a) {
      const org = { id: uuid(), name: a.p_org_name, city: a.p_city, portfolio_size: a.p_portfolio_size, plan: 'trial', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString(), created_at: now() };
      T('organizations').push(org);
      const u = db.users.find(x => x.id === uid());
      T('organization_members').push({ id: uuid(), organization_id: org.id, user_id: uid(), role: 'owner', display_name: u?.name || 'მმართველი', created_at: now() });
      return org.id;
    },
    accept_my_invitations() { return 0; },
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
        const s = { access_token: 'mock', user: { id: u.id, email, user_metadata: { full_name: u.name } } };
        localStorage.setItem('rigzea_mock_session', JSON.stringify(s));
        return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { localStorage.removeItem('rigzea_mock_session'); return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: {
      from: () => ({
        async upload(path) { await delay(); if (shouldFail('upload:storage')) return netErr(); return { data: { path }, error: null }; },
        getPublicUrl(path) { return { data: { publicUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="#cbd5e1"/><text x="10" y="50" font-size="10">' + path.split('/').pop() + '</text></svg>') } }; },
      }),
    },
  };

  window.supabase = { createClient: () => client };
})();
