// Rigzea public demo: in-browser stand-in for supabase-js.
// The real app (/app/*.js) and the public pages (/p/, /p/s/, /approve/, /guide/)
// run unchanged on top of it. Data lives in this browser's localStorage only:
// nothing is sent to a server. Derived from tests/mock-supabase.js.
(function () {
  'use strict';
  const KEY = 'rigzea_demo_db';
  const SESSION_KEY = 'rigzea_demo_session';
  const VERSION = 4;
  const MAX_AGE = 12 * 3600e3; // reseed so relative dates (renewals, trial) stay fresh

  const notify = (message) => { try { window.dispatchEvent(new CustomEvent('rigzea-demo', { detail: message })); } catch { /* old browser */ } };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  let quotaWarned = false;
  const write = (db) => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch {
      if (!quotaWarned) { quotaWarned = true; notify('დემოს მეხსიერება გაივსო. დააჭირე „განულებას“, რომ სანიმუშო მონაცემები თავიდან ჩაიტვირთოს.'); }
    }
  };
  const fresh = () => {
    const seed = window.__RIGZEA_DEMO_SEED ? window.__RIGZEA_DEMO_SEED() : { tables: {}, users: [] };
    seed.meta = { version: VERSION, seededAt: Date.now() };
    return seed;
  };
  const load = () => {
    const db = read();
    if (!db || db.meta?.version !== VERSION || Date.now() - (db.meta?.seededAt || 0) > MAX_AGE) { const f = fresh(); write(f); return f; }
    return db;
  };
  let db = load();

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const now = () => new Date().toISOString();
  const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
  const T = (name) => (db.tables[name] = db.tables[name] || []);
  const isPublicPage = () => window.__RIGZEA_DEMO_PUBLIC === true;
  const demoUser = () => (db.users || [])[0] || { id: 'demo-user', email: 'demo@rigzea.ge', name: 'სადემონსტრაციო აგენტი' };
  const session = () => {
    if (isPublicPage()) return null; // clients opening a link are visitors, not the team
    const u = demoUser();
    return { access_token: 'demo', user: { id: u.id, email: u.email, user_metadata: { full_name: u.name } } };
  };
  const uid = () => session()?.user?.id || null;
  const delay = () => new Promise(r => setTimeout(r, 40));

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
      if (!allowed.includes(row.status)) return { message: 'ამ სტატუსზე პირდაპირ გადასვლა დაუშვებელია.' };
    }
    if (row.status === 'blocked' && !(row.blocked_reason || '').trim()) return { message: 'შეჩერებისთვის მიუთითეთ მიზეზი' };
    if (row.status !== 'blocked') row.blocked_reason = null;
    if (row.status === 'in_progress' && !row.started_at) row.started_at = now();
    row.completed_at = row.status === 'done' ? (row.completed_at || now()) : null;
    if (row.assigned_to && (!old || old.assigned_to !== row.assigned_to)) row.assigned_at = now();
    return null;
  }

  function expenseTrigger(row, old) {
    if (old && row.status !== old.status) {
      const allowed = { proposed: ['approved', 'declined'], approved: ['incurred', 'paid', 'proposed'], declined: ['proposed'], incurred: ['paid', 'approved'], paid: ['incurred'] }[old.status] || [];
      if (!allowed.includes(row.status)) return { message: 'ხარჯის ამ სტატუსზე პირდაპირ გადასვლა დაუშვებელია.' };
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
    apartments: { status: 'active', commission_pct: 20, photos: [], amenities: [] },
    reservations: { status: 'confirmed', source: 'airbnb' },
    notifications: { is_read: false },
    monthly_reports: { status: 'draft' },
    invitations: { status: 'pending' },
    selections: { is_active: true },
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
      const rows = T(this.table);
      const match = rows.filter(r => this.filters.every(f => f(r)));
      let out;
      if (this.op === 'select') {
        out = match.slice();
        for (const [c, asc] of this.orders.slice().reverse()) out.sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : (a[c] ?? '') < (b[c] ?? '') ? -1 : 0) * (asc ? 1 : -1));
        if (this.lim) out = out.slice(0, this.lim);
      } else if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        out = [];
        for (const p of list) {
          const row = { id: uuid(), created_at: now(), ...(DEFAULTS[this.table] || {}), ...clone(p) };
          const existing = rows.find(r => r.id === row.id);
          if (existing) {
            if (this.op === 'upsert') { Object.assign(existing, row); out.push(row); continue; }
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          if (this.table === 'apartments' && row.slug && rows.some(r => r.slug === row.slug)) return { data: null, error: { message: 'duplicate key value violates unique constraint "apartments_slug_key"', code: '23505' } };
          if (this.table === 'approvals' && !row.token) row.token = uuid().replace(/-/g, '');
          const err = this.table === 'tasks' ? taskTrigger(row, null) : this.table === 'expenses' ? expenseTrigger(row, null) : null;
          if (err) return { data: null, error: err };
          rows.push(row); out.push(row);
        }
        if (this.table === 'invitations') notify('სადემონსტრაციო რეჟიმი: მოწვევა სიაში დაემატა, მაგრამ წერილი არ გაიგზავნა.');
      } else if (this.op === 'update') {
        out = [];
        for (const r of match) {
          const old = clone(r);
          const next = { ...r, ...clone(this.payload) };
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
      write(db);
      if (this.op !== 'select' && !this.ret) return { data: null, error: null };
      const data = clone(out);
      if (this.mode === 'single') return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'ჩანაწერი ვერ მოიძებნა.', code: 'PGRST116' } };
      if (this.mode === 'maybe') return { data: data[0] || null, error: null };
      return { data, error: null };
    }
  }

  const findApt = (ref) => { const r = String(ref || '').toLowerCase(); return T('apartments').find(x => x.id === r || (x.slug && x.slug === r)); };

  const rpcs = {
    accept_my_invitations() { return 0; },
    is_platform_admin() { return false; },
    scan_alerts() { return 0; },
    create_user_organization() { throw { message: 'სადემონსტრაციო რეჟიმში ახალი სამუშაო სივრცე არ იქმნება.' }; },
    create_telegram_link_code() {
      const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), x => a[x % a.length]).join('');
      notify('სადემონსტრაციო რეჟიმი: კოდი სანიმუშოა, ბოტთან კავშირი არ მყარდება.');
      return { code, expires_at: new Date(Date.now() + 900e3).toISOString() };
    },
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
      const old = clone(t);
      const next = { ...t, status: a.p_status || t.status, checklist, notes: a.p_notes ?? t.notes, blocked_reason: a.p_status === 'blocked' ? a.p_blocked_reason : t.blocked_reason };
      const err = taskTrigger(next, old);
      if (err) throw err;
      Object.assign(t, next);
      return clone(t);
    },
    staff_add_task_photo(a) {
      const t = T('tasks').find(x => x.id === a.p_task);
      t.photos = [...(t.photos || []), { url: a.p_url, phase: a.p_phase, at: now() }];
      return clone(t);
    },
    staff_report_problem(a) {
      const t = T('tasks').find(x => x.id === a.p_task);
      const row = { id: uuid(), created_at: now(), organization_id: t.organization_id, apartment_id: t.apartment_id, title: a.p_title, description: a.p_description, type: 'maintenance', priority: a.p_urgent ? 'urgent' : 'normal', status: 'new', parent_task_id: t.id, checklist: [], photos: [] };
      T('tasks').push(row);
      return row.id;
    },
    // Smart link (supabase/patches/01_smartlink.sql)
    get_public_listing(a) {
      const apt = findApt(a.p_ref);
      if (!apt || apt.is_archived || apt.status === 'archived') return { success: false, error: 'not_found' };
      const org = T('organizations').find(x => x.id === apt.organization_id) || {};
      const { door_code, wifi_name, wifi_password, access_instructions, parking_info, owner_id, tenant_name, tenant_phone, notes, commission_pct, ...pub } = apt;
      return { success: true, apartment: { ...pub, photos: apt.photos || [], amenities: apt.amenities || [], agent_phone: apt.agent_phone || org.contact_phone }, agency: { name: org.agent_display_name || org.name, logo_url: org.logo_url || null, brand_color: org.brand_color || null, agent_name: apt.agent_name || null, phone: apt.agent_phone || org.contact_phone } };
    },
    get_public_showcase(a) { return rpcs.get_public_listing({ p_ref: a.p_apartment_id }); },
    track_link_event(a) {
      const apt = findApt(a.p_ref);
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
    respond_public_approval(a) {
      const ap = T('approvals').find(x => x.token === a.p_token);
      if (!ap) return { success: false, error: 'მოთხოვნა ვერ მოიძებნა' };
      if (ap.status !== 'pending') return { success: false, error: 'ამ მოთხოვნაზე პასუხი უკვე გაცემულია' };
      ap.status = a.p_decision; ap.response_note = a.p_note; ap.responded_at = now();
      T('expenses').filter(e => e.approval_id === ap.id && e.status === 'proposed').forEach(e => { e.status = a.p_decision; });
      return { success: true, status: a.p_decision };
    },
    get_public_selection(a) {
      const sel = T('selections').find(x => x.slug === a.p_slug && x.is_active !== false);
      if (!sel) return { success: false, error: 'not_found' };
      const org = T('organizations').find(x => x.id === sel.organization_id) || {};
      const apartments = (sel.apartment_ids || []).map(id => T('apartments').find(x => x.id === id && x.organization_id === sel.organization_id && x.status !== 'archived')).filter(Boolean)
        .map(x => ({ id: x.id, slug: x.slug || null, title: x.name, price: x.monthly_rent ?? null, currency: x.currency || 'USD', rooms: x.rooms ?? null, bedrooms: x.bedrooms ?? null, area_sqm: x.area_sqm ?? null, floor: x.floor ?? null, total_floors: x.total_floors ?? null, district: x.district || null, city: x.city || null, pets_allowed: !!x.pets_allowed, photos: (x.photos || []).slice(0, 4), agent_phone: x.agent_phone || null }));
      if (!apartments.length) return { success: false, error: 'not_found' };
      return { success: true, selection: { client_name: sel.client_name, created_at: sel.created_at }, apartments, agency: { name: org.agent_display_name || org.name, phone: org.contact_phone || null, logo_url: org.logo_url || null, brand_color: org.brand_color || null, fx_rate: org.fx_rate ?? 2.7 } };
    },
  };

  const client = {
    from: (t) => new Query(t),
    async rpc(name, args = {}) {
      await delay();
      db = load();
      if (!rpcs[name]) return { data: null, error: { message: 'სადემონსტრაციო რეჟიმი: ეს მოქმედება სერვერს საჭიროებს და დემოში არ სრულდება.' } };
      try { const data = rpcs[name](args); write(db); return { data: clone(data ?? null), error: null }; }
      catch (e) { return { data: null, error: { message: e.message || String(e) } }; }
    },
    auth: {
      async getSession() { return { data: { session: session() }, error: null }; },
      async getUser() { return { data: { user: session()?.user || null }, error: null }; },
      async signInWithPassword() { return { data: { session: session(), user: session()?.user }, error: null }; },
      async signUp() { return { data: { session: session(), user: session()?.user }, error: null }; },
      async signOut() { return { error: null }; },
      async resetPasswordForEmail() { return { data: {}, error: null }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    },
    storage: {
      from: () => ({
        async upload(path) { await delay(); return { data: { path }, error: null }; },
        getPublicUrl(path) { return { data: { publicUrl: (window.__RIGZEA_DEMO_FILES && window.__RIGZEA_DEMO_FILES[path]) || '' } }; },
      }),
    },
  };

  window.RigzeaDemoDB = {
    reset() { try { localStorage.removeItem(KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } db = load(); },
  };
  window.supabase = { createClient: () => client };
})();
