// Rigzea manager workspace: session, data loading, routing, shell and shared lookups.
// Views live in views-*.js and register themselves on App.views.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L } = R;

  // Lists that are capped in the query. The cap can be raised from the UI ("load more"), and
  // whenever the server holds more rows than we fetched the app says so instead of quietly
  // dropping them (see renderDataNotice). Activity, notifications and monthly reports are
  // intentionally capped as feeds and are not listed here.
  const PAGED = {
    deals:       { label: 'გარიგებები', page: 500 },
    approvals:   { label: 'დადასტურებები', page: 300 },
    expenses:    { label: 'ხარჯები', page: 500 },
    income:      { label: 'შემოსავალი', page: 500 },
    closedTasks: { label: 'დასრულებული საქმეები', page: 300 },
  };

  const S = {
    user: null,
    orgs: [],          // [{ ...organization, member }]
    org: null,
    member: null,
    data: null,        // loaded org data, see loadData()
    limits: Object.fromEntries(Object.entries(PAGED).map(([k, v]) => [k, v.page])),
    totals: {},        // { kind: { total, shown } } only when the server held more rows than fetched
    loading: false,
    loadError: null,
    stale: false,      // true while saved data from the last visit is shown and fresh data loads
    platformAdmin: false,
    seatInvites: 0,    // pending non-staff invitations, kept by the team view
  };

  const MANAGER_ROLES = ['owner', 'admin', 'manager'];
  const isManager = () => MANAGER_ROLES.includes(S.member?.role);
  const isAdmin = () => ['owner', 'admin'].includes(S.member?.role);
  // Agents work with the shared inventory and their own deals; finances and team settings are closed to them.
  const isAgent = () => S.member?.role === 'agent';
  const AGENT_CLOSED = ['finance', 'team', 'settings'];

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  function showScreen(id) {
    ['boot', 'auth', 'onboarding', 'shell'].forEach(s => { $('#' + s).hidden = s !== id; });
  }

  function hydrateIcons(root = document) {
    $$('[data-icon]', root).forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.icon, el.classList.contains('brand-mark') ? 16 : 18); });
  }

  function bootError(err) {
    showScreen('boot');
    $('#boot').innerHTML = `<div class="error-state" style="align-items:center;text-align:center">
      <p>${esc(R.friendlyError(err))}</p>
      <button class="btn btn-primary" type="button" id="btn-boot-retry">${icon('refresh', 16)} ხელახლა ცდა</button></div>`;
    $('#btn-boot-retry').onclick = () => { $('#boot').textContent = 'იტვირთება…'; boot(); };
  }

  // A password-reset link signs the user in and must then ask for the new password.
  // js/config.js notes the link type before the auth client clears it from the address.
  let recovery = !!window.RIGZEA_RECOVERY || /[#&?]type=recovery\b/.test(location.hash + location.search);
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') dataCache.clear(); // also when signed out from another tab
    if (event !== 'PASSWORD_RECOVERY') return;
    recovery = true;
    showAuth('newpass');
  });

  let prefetch = null; // { org, data: Promise } started by boot()

  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      S.user = session?.user || null;
      recovery = recovery || !!window.RIGZEA_RECOVERY;
      if (!S.user) {
        dataCache.clear(); // signed out some other way (staff app, expired session): drop saved data
        if (recovery) { recovery = false; window.RIGZEA_RECOVERY = false; showAuth('reset'); toast('აღდგენის ბმული ვადაგასულია ან უკვე გამოყენებულია. მოითხოვე ახალი.', { type: 'error', timeout: 9000 }); return; }
        const wantsSignin = /[#&?]signin\b/i.test(location.hash + location.search);
        return showAuth(wantsSignin ? 'signin' : 'signup');
      }
      if (recovery) return showAuth('newpass');
      const handed = await dataCache.takeHandoff();
      if (handed) {
        S.orgs = handed.handoff.orgs;
        S.org = S.orgs.find(o => o.id === handed.org) || null;
        S.member = S.org?.member || null;
        if (S.org && S.member.role !== 'staff') {
          S.platformAdmin = handed.handoff.platformAdmin;
          S.limits = handed.handoff.limits || S.limits;
          S.data = handed.data;
          S.totals = handed.totals || {};
          indexData();
          return enterShell({ handed: true });
        }
      }
      // These do not depend on each other, so they run together instead of one after another.
      // The last used organization's data starts loading now too; enterShell drops it if a
      // different organization ends up selected.
      const adminCheck = sb.rpc('is_platform_admin').then(r => r.data === true, () => false);
      const savedOrg = localStorage.getItem('rigzea_selected_org_id');
      prefetch = savedOrg ? { org: savedOrg, data: fetchData(savedOrg) } : null;
      prefetch?.data.catch(() => {}); // a failure is reported by loadData, not here
      // Joins any organizations this email was invited to (no-op otherwise).
      await sb.rpc('accept_my_invitations').then(() => {}, () => {});
      await loadOrgs();
      S.platformAdmin = await adminCheck;
      if (!S.orgs.length) return showScreen('onboarding');
      if (S.member.role === 'staff') { location.replace('/staff/'); return; }
      enterShell();
    } catch (err) {
      console.error(err);
      bootError(err);
    }
  }

  async function loadOrgs() {
    const members = await q(sb.from('organization_members').select('*').eq('user_id', S.user.id));
    const orgIds = members.map(m => m.organization_id);
    const orgs = orgIds.length ? await q(sb.from('organizations').select('*').in('id', orgIds)) : [];
    S.orgs = orgs.map(o => ({ ...o, member: members.find(m => m.organization_id === o.id) })).sort((a, b) => a.name.localeCompare(b.name));
    const saved = localStorage.getItem('rigzea_selected_org_id');
    const pick = S.orgs.find(o => o.id === saved) || S.orgs[0] || null;
    S.org = pick;
    S.member = pick?.member || null;
    if (pick) localStorage.setItem('rigzea_selected_org_id', pick.id);
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Auth forms
  // ---------------------------------------------------------------------------
  let currentAuthView = 'signup';

  function showAuth(view) {
    currentAuthView = view;
    showScreen('auth');
    ['signin', 'signup', 'reset', 'newpass'].forEach(v => {
      const f = $('#form-' + v);
      if (f) f.hidden = v !== view;
    });
    const tabs = $('#auth-tabs');
    const oauthStack = $('#auth-oauth-stack');
    const divider = $('#auth-divider');
    const isAuthMain = ['signin', 'signup'].includes(view);
    if (tabs) {
      tabs.hidden = !isAuthMain;
      const tabSignup = $('#tab-auth-signup');
      const tabSignin = $('#tab-auth-signin');
      if (tabSignup) tabSignup.classList.toggle('active', view === 'signup');
      if (tabSignin) tabSignin.classList.toggle('active', view === 'signin');
    }
    if (oauthStack) {
      oauthStack.hidden = !isAuthMain;
      const gLabel = $('#oauth-google-label');
      if (gLabel) gLabel.textContent = view === 'signup' ? 'Google-ით რეგისტრაცია' : 'Google-ით შესვლა';
    }
    if (divider) divider.hidden = !isAuthMain;
    $('#form-' + view)?.querySelector('input')?.focus();
  }

  function bindForm(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const errBox = form.querySelector('.form-error');
      errBox.hidden = true;
      const invalid = $$('input, select, textarea', form).find(el => !el.checkValidity());
      if (invalid) { errBox.textContent = invalid.dataset.error || 'შეავსე სავალდებულო ველები.'; errBox.hidden = false; invalid.focus(); return; }
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.classList.add('is-busy');
      try { await handler(Object.fromEntries(new FormData(form).entries()), form); }
      catch (err) { console.error(err); errBox.textContent = authError(err); errBox.hidden = false; }
      finally { btn.dataset.busy = ''; btn.disabled = false; btn.classList.remove('is-busy'); }
    });
  }

  function authError(err) {
    const m = String(err?.message || '');
    if (/Invalid login/i.test(m)) return 'ელფოსტა ან პაროლი არასწორია.';
    if (/already registered/i.test(m)) return 'ეს ელფოსტა უკვე რეგისტრირებულია. სცადე შესვლა.';
    if (/Email not confirmed/i.test(m)) return 'ელფოსტა ჯერ არ არის დადასტურებული. შეამოწმე შემოსული წერილები.';
    if (/different from the old/i.test(m)) return 'ახალი პაროლი ძველისგან უნდა განსხვავდებოდეს.';
    if (/weak|at least \d+ characters/i.test(m)) return 'პაროლი ძალიან სუსტია. გამოიყენე მინიმუმ 8 სიმბოლო.';
    return R.friendlyError(err);
  }

  bindForm($('#form-signin'), async (v) => {
    const { error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
    if (error) throw error;
    $('#form-signin').reset();
    await boot();
  });

  bindForm($('#form-signup'), async (v) => {
    const { data, error } = await sb.auth.signUp({
      email: v.email.trim(),
      password: v.password,
      options: {
        data: {
          full_name: v.name.trim(),
          terms_accepted_at: new Date().toISOString(),
          policies_accepted_version: '2026-10-16'
        },
        emailRedirectTo: location.origin + '/app/'
      }
    });
    if (error) throw error;
    if (!data.session) {
      showAuth('signin');
      toast('ანგარიში შეიქმნა. დაადასტურე ელფოსტა წერილიდან და შემდეგ შედი.', { type: 'success', timeout: 9000 });
      return;
    }
    await boot();
  });

  bindForm($('#form-reset'), async (v) => {
    const { error } = await sb.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: location.origin + '/app/' });
    if (error) throw error;
    showAuth('signin');
    toast('აღდგენის ბმული გაიგზავნა ელფოსტაზე.', { type: 'success' });
  });

  bindForm($('#form-newpass'), async (v) => {
    if (v.password !== v.password2) throw new Error('პაროლები ერთმანეთს არ ემთხვევა.');
    const { error } = await sb.auth.updateUser({ password: v.password });
    if (error) throw error;
    recovery = false; window.RIGZEA_RECOVERY = false;
    history.replaceState(null, '', '/app/');
    toast('პაროლი შეიცვალა.', { type: 'success' });
    await boot();
  });

  $$('[data-auth]').forEach(b => b.addEventListener('click', () => showAuth(b.dataset.auth)));

  $('#signup-agree')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      const lbl = $('#signup-consent-label') || e.target.closest('label');
      if (lbl) lbl.classList.remove('is-invalid');
      const errBox = $('#form-signup .form-error');
      if (errBox) errBox.hidden = true;
    }
  });

  $$('[data-oauth]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const provider = btn.dataset.oauth;
      if (provider === 'google' && currentAuthView === 'signup') {
        const agree = $('#signup-agree');
        if (agree && !agree.checked) {
          const errBox = $('#form-signup .form-error');
          if (errBox) {
            errBox.textContent = 'რეგისტრაციისთვის ჯერ მონიშნე თანხმობა მომსახურების წესებსა და თანხის დაბრუნების (24 სთ) პოლიტიკაზე.';
            errBox.hidden = false;
          }
          const lbl = $('#signup-consent-label') || agree.closest('label');
          if (lbl) lbl.classList.add('is-invalid');
          agree.focus();
          return;
        }
      }
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1';
      btn.disabled = true;
      btn.classList.add('is-busy');
      try {
        const { error } = await sb.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: location.origin + '/app/'
          }
        });
        if (error) throw error;
      } catch (err) {
        console.error('OAuth error:', err);
        toast(`ავტორიზაციის შეცდომა: ${R.friendlyError(err)}`, { type: 'error', timeout: 8000 });
        btn.dataset.busy = '';
        btn.disabled = false;
        btn.classList.remove('is-busy');
      }
    });
  });

  bindForm($('#form-org'), async (v) => {
    const orgId = await q(sb.rpc('create_user_organization', { p_org_name: v.name.trim(), p_city: v.city, p_portfolio_size: v.size }));
    localStorage.setItem('rigzea_selected_org_id', orgId);
    await loadOrgs();
    enterShell();
  });

  async function signOut() {
    await sb.auth.signOut();
    localStorage.removeItem('rigzea_selected_org_id');
    await dataCache.clear();
    location.href = '/signin/'; // clean redirect to standalone signin page
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="signout"]')) signOut(); });

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const OPEN_TASK_STATUSES = ['new', 'assigned', 'in_progress', 'blocked'];
  // Runs a capped query and remembers how many rows the server actually held, so the UI can
  // say "500 of 1200" instead of pretending the rest do not exist.
  async function take(totals, kind, builder) {
    const r = await builder;
    const rows = r.data || [];
    if (!r.error && typeof r.count === 'number') totals[kind] = { total: r.count, shown: rows.length };
    return rows;
  }

  // Fetches everything the workspace shows for one organization. Throws on failure.
  async function fetchData(org) {
    const totals = {};
    const area = route().name;
    const needs = new Set(area === 'today'
      ? ['closedTasks', 'approvals', 'expenses', 'income', 'reservations', 'events', 'repairs', 'deals', 'statements']
      : area === 'tasks'
        ? ['closedTasks', 'approvals', 'expenses', 'repairs', 'deals']
        : area === 'apartments' || area === 'owners'
          ? ['approvals', 'expenses', 'deals', 'repairs']
          : area === 'deals'
            ? ['approvals', 'deals', 'reservations']
            : area === 'finance'
              ? ['expenses', 'income', 'statements']
              : new Set());
    const optional = (name, factory) => needs.has(name) ? factory() : Promise.resolve([]);
    const since = new Date(); since.setDate(since.getDate() - 120);
    const sinceIso = R.isoDate(since);
    const [apartments, owners, openTasks, closedTasks, approvals, expenses, income, reservations, events, members, notifications, statements, repairs, deals] = await Promise.all([
      q(sb.from('apartments').select('*').eq('organization_id', org).order('name')),
      q(sb.from('owners').select('*').eq('organization_id', org).order('name')),
      // Every open task, plus the most recent closed ones for history.
      q(sb.from('tasks').select('*').eq('organization_id', org).in('status', OPEN_TASK_STATUSES).order('due_date', { ascending: true })),
      optional('closedTasks', () => take(totals, 'closedTasks', sb.from('tasks').select('*', { count: 'exact' }).eq('organization_id', org).in('status', ['done', 'cancelled']).order('due_date', { ascending: false }).limit(S.limits.closedTasks))),
      optional('approvals', () => take(totals, 'approvals', sb.from('approvals').select('*', { count: 'exact' }).eq('organization_id', org).order('created_at', { ascending: false }).limit(S.limits.approvals))),
      optional('expenses', () => take(totals, 'expenses', sb.from('expenses').select('*', { count: 'exact' }).eq('organization_id', org).order('expense_date', { ascending: false }).limit(S.limits.expenses))),
      optional('income', () => take(totals, 'income', sb.from('income').select('*', { count: 'exact' }).eq('organization_id', org).order('income_date', { ascending: false }).limit(S.limits.income))),
      // Reservations need the operations RLS migration; treat a failure as "no data" rather than breaking the app.
      optional('reservations', () => sb.from('reservations').select('*').eq('organization_id', org).gte('check_out', sinceIso).order('check_in').then(r => r.data || [], () => [])),
      optional('events', () => q(sb.from('activity_events').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(100))),
      q(sb.from('organization_members').select('*').eq('organization_id', org)),
      q(sb.from('notifications').select('*').eq('organization_id', org).eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(40)),
      optional('statements', () => q(sb.from('monthly_reports').select('*').eq('organization_id', org).order('month_period', { ascending: false }).limit(24))),
      optional('repairs', () => q(sb.from('repairs').select('*').eq('organization_id', org)).catch(() => [])),
      optional('deals', () => take(totals, 'deals', sb.from('deals').select('*', { count: 'exact' }).eq('organization_id', org).order('created_at', { ascending: false }).limit(S.limits.deals)).catch(() => [])),
    ]);
    const tasks = [...openTasks, ...closedTasks].sort((a, b) => String(a.due_date || '~').localeCompare(String(b.due_date || '~')));
    return { totals, data: { apartments, owners, tasks, approvals, expenses, income, reservations, events, members, notifications, statements, repairs, deals: deals || [] } };
  }

  // Loads the selected organization's data into S. `pending` is a fetchData() already in flight.
  async function loadData(pending) {
    const org = S.org.id;
    S.loading = true;
    S.loadError = null;
    try {
      const { data, totals } = await (pending || fetchData(org));
      if (S.org?.id !== org) return; // switched organization while this was loading
      S.data = data;
      S.totals = totals;
      indexData();
      dataCache.save(org);
    } catch (err) {
      console.error(err);
      if (S.org?.id === org) S.loadError = err;
    } finally {
      S.loading = false;
    }
  }

  // The last loaded data of each organization, kept in this browser so the next visit can show
  // it at once while fresh data loads. Cleared on sign out. Any failure just means no saved copy.
  const dataCache = (() => {
    const VERSION = 1, MAX_AGE = 14 * 864e5, STORE = 'org-data';
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('rigzea-cache', 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
    const tx = (mode, fn) => db().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = t.onabort = () => reject(t.error);
    }));
    const key = org => `${S.user.id}:${org}`;
    return {
      async read(org) {
        try {
          const v = await tx('readonly', st => st.get(key(org)));
          return v && v.v === VERSION && Date.now() - v.at < MAX_AGE ? v : null;
        } catch { return null; }
      },
      // Written after the screen has been drawn, so serializing the data never delays it.
      save(org) {
        const data = S.data, totals = S.totals;
        setTimeout(() => tx('readwrite', st => st.put({ v: VERSION, at: Date.now(), data, totals }, key(org))).catch(() => {}), 0);
      },
      clear: () => tx('readwrite', st => st.clear()).catch(() => {}),
      // Moving to another area loads a new page. The data in memory (including this page's own
      // edits) is saved first and marked for this tab, so the next page shows it as current
      // instead of fetching everything again, the same as the old single-page app did.
      async handoff(org) {
        const at = Date.now();
        try {
          await tx('readwrite', st => st.put({ v: VERSION, at, data: S.data, totals: S.totals,
            handoff: { orgs: S.orgs, platformAdmin: S.platformAdmin, limits: S.limits } }, key(org)));
          sessionStorage.setItem('rigzea_handoff', JSON.stringify({ user: S.user.id, org, at }));
        } catch { /* the next page just loads normally */ }
      },
      // Used once: a reload of that page fetches fresh data as usual.
      async takeHandoff() {
        let h = null;
        try { h = JSON.parse(sessionStorage.getItem('rigzea_handoff') || 'null'); sessionStorage.removeItem('rigzea_handoff'); } catch { return null; }
        if (!h || h.user !== S.user.id || Date.now() - h.at > 60e3) return null;
        const v = await this.read(h.org);
        return v && v.at === h.at && v.handoff ? { org: h.org, ...v } : null;
      },
    };
  })();

  // While saved data is on screen, the page can be read but not changed: edits made against an
  // old copy could be overwritten when the fresh data arrives a moment later.
  function setStale(on) {
    S.stale = on;
    const view = $('#view');
    view.inert = on;
    view.classList.toggle('is-stale', on);
    view.setAttribute('aria-busy', String(on));
  }

  const idx = { apt: new Map(), owner: new Map(), member: new Map(), task: new Map(), deal: new Map() };
  function indexData() {
    const d = S.data;
    idx.apt = new Map(d.apartments.map(a => [a.id, a]));
    idx.owner = new Map(d.owners.map(o => [o.id, o]));
    idx.member = new Map(d.members.map(m => [m.id, m]));
    idx.task = new Map(d.tasks.map(t => [t.id, t]));
    idx.deal = new Map((d.deals || []).map(x => [x.id, x]));
  }

  // Replace or insert a row locally after a confirmed write, then re-render.
  function upsertLocal(table, row) {
    const list = S.data[table];
    const i = list.findIndex(r => r.id === row.id);
    if (i >= 0) list[i] = row; else list.unshift(row);
    indexData();
  }

  async function refresh({ quiet = false } = {}) {
    if (!quiet) renderLoading();
    await loadData();
    renderShell();
    render();
    // Shown once per failed refresh, not on every later render.
    if (S.loadError && S.data) toast('ბოლო განახლება ვერ მოხერხდა. ნაჩვენებია წინა მონაცემები.', { type: 'error', action: { label: 'განახლება', fn: () => refresh({ quiet: true }) } });
  }

  async function logEvent(apartmentId, type, title, description = null, metadata = {}) {
    // Activity log is best-effort: a failure here must not undo the confirmed action.
    const { data } = await sb.from('activity_events').insert({
      organization_id: S.org.id, apartment_id: apartmentId || null, actor_id: S.user.id,
      actor_name: S.member?.display_name || S.user.email, event_type: type, title, description, metadata,
    }).select().single();
    if (data) S.data.events.unshift(data);
  }

  // ---------------------------------------------------------------------------
  // Lookups shared by views
  // ---------------------------------------------------------------------------
  const H = {
    apt: (id) => idx.apt.get(id),
    aptName: (id) => idx.apt.get(id)?.name || 'ბინა წაშლილია',
    owner: (id) => idx.owner.get(id),
    member: (id) => idx.member.get(id),
    memberName: (id) => idx.member.get(id)?.display_name || 'უსახელო წევრი',
    deal: (id) => idx.deal?.get(id),
    task: (id) => idx.task.get(id),
    // Contact with the same phone number (duplicates and the unreliable-client warning).
    contactByPhone: (phone, exceptId = null) => { const k = R.phoneKey(phone); return k ? S.data.owners.find(o => o.id !== exceptId && R.phoneKey(o.phone) === k) : undefined; },
    flagTag: (o) => (o?.is_flagged ? `<span class="badge badge-danger" title="${esc(o.flag_note || '')}">არასანდო</span>` : ''),
    isOpen: (t) => !['done', 'cancelled'].includes(t.status),
    isOverdue: (t) => H.isOpen(t) && t.due_date && new Date(t.due_date) < new Date(),
    approvalLink: (a) => `${location.origin}/approve/?token=${encodeURIComponent(a.token)}`,
    // Time a task is "about": cleaning window start, else due time
    taskTime: (t) => t.scheduled_start || t.due_date,
    resTs: (date, time) => { const d = R.toDate(date); if (!d) return null; const [h, m] = String(time || '12:00').split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d; },
    staffMembers: () => S.data.members.slice().sort((a, b) => (a.role === 'staff' ? 0 : 1) - (b.role === 'staff' ? 0 : 1) || (a.display_name || '').localeCompare(b.display_name || '')),
    dueText: (t) => {
      if (!t.due_date) return '<span class="muted">ვადა არ არის</span>';
      if (H.isOverdue(t)) return `<span class="t-danger">${esc(R.dateTime(t.due_date))}</span>`;
      return esc(R.dateTime(t.due_date));
    },
    assigneeText: (t) => t.assigned_to ? esc(H.memberName(t.assigned_to)) : '<span class="t-warn">არ არის დანიშნული</span>',
  };

  // ---------------------------------------------------------------------------
  // Routing. Each area is its own page, /app/<area>/ (pages are built by scripts/stamp-assets.mjs),
  // and an item inside it is ?id=<id>[&sub=<tab>]: #/apartments/42/photos is /app/apartments/?id=42&sub=photos.
  // Code still writes links as #/area/id/sub?x=1; toUrl() turns them into page addresses and every
  // such link in the page is rewritten as it appears. Moving within a page (filters, tabs, the task
  // drawer) updates the address without a reload; moving to another area loads that page.
  // The offline demo (/demo/) is a single page and keeps #/ addresses.
  // ---------------------------------------------------------------------------
  const views = {};
  // Route chunks are loaded only when their area is opened. This keeps the shell and first
  // dashboard render small on slower machines while preserving the existing global view API.
  const VIEW_CHUNKS = {
    today: '/app/views-ops.js', tasks: '/app/views-ops.js',
    apartments: '/app/views-portfolio.js', owners: '/app/views-portfolio.js',
    deals: '/app/views-deals.js', finance: '/app/views-finance.js',
    team: '/app/views-admin.js', settings: '/app/views-admin.js',
  };
  const viewLoads = new Map();
  function ensureChunk(src, name = 'გვერდი') {
    if (viewLoads.has(src)) return viewLoads.get(src);
    const promise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`ვერ ჩაიტვირთა გვერდის კოდი: ${name}`));
      document.head.appendChild(s);
    });
    viewLoads.set(src, promise);
    return promise;
  }
  function ensureViewLoaded(name) { return ensureChunk(VIEW_CHUNKS[name] || VIEW_CHUNKS.today, name); }
  const PAGE_ROUTES = location.pathname.startsWith('/app/');
  const AREAS = ['today', 'tasks', 'apartments', 'owners', 'deals', 'finance', 'team', 'settings'];
  const areaPath = (name) => `/app/${name === 'today' ? '' : name + '/'}`;
  function toUrl(hash) {
    if (!PAGE_ROUTES) return '#' + String(hash).replace(/^#/, '');
    const [path, query] = String(hash).replace(/^#/, '').split('?');
    const [name, id, sub] = path.split('/').filter(Boolean);
    const out = new URLSearchParams();
    if (id) out.set('id', id);
    if (sub) out.set('sub', sub);
    new URLSearchParams(query || '').forEach((v, k) => out.append(k, v));
    const qs = out.toString();
    return areaPath(AREAS.includes(name) ? name : 'today') + (qs ? '?' + qs : '');
  }
  function parseUrl(u = location) {
    if (!PAGE_ROUTES) {
      const [path, query] = (u.hash.replace(/^#/, '') || '/today').split('?');
      const parts = path.split('/').filter(Boolean);
      return { parts, name: parts[0] || 'today', id: parts[1] || null, sub: parts[2] || null, params: new URLSearchParams(query || '') };
    }
    const m = /^\/app\/([a-z]+)\//.exec(u.pathname);
    const name = m && AREAS.includes(m[1]) ? m[1] : 'today';
    const params = new URLSearchParams(u.search);
    const id = params.get('id'), sub = params.get('sub');
    params.delete('id'); params.delete('sub');
    return { parts: [name, id, sub].filter(Boolean), name, id, sub, params };
  }
  const route = () => parseUrl();
  // Accepts #/area/... or a page address. Same page: new address, no reload. Other area: loads it,
  // handing over the data already in memory so it opens without fetching again (see dataCache).
  async function go(target, { replace = false } = {}) {
    if (!PAGE_ROUTES) {
      const hash = toUrl(target);
      if (location.hash === hash) render(); else if (replace) { history.replaceState(null, '', hash); onRoute(); } else location.hash = hash;
      return;
    }
    const next = new URL(String(target).startsWith('#') ? toUrl(target) : target, location.origin);
    if (next.pathname === location.pathname) {
      const url = next.pathname + next.search;
      if (url !== location.pathname + location.search) history[replace ? 'replaceState' : 'pushState'](null, '', url);
      onRoute();
      return;
    }
    if (S.data && S.org) await dataCache.handoff(S.org.id);
    location[replace ? 'replace' : 'assign'](next.pathname + next.search);
  }
  // Keeps the current page and adds/removes ?task=
  function taskHref(id) { const r = route(); return toUrl(`#/${r.parts.join('/')}?task=${id}`); }
  function closeTaskOverlay() { const r = route(); r.params.delete('task'); const qs = r.params.toString(); go(`#/${r.parts.join('/')}${qs ? '?' + qs : ''}`); }

  function onRoute() {
    const r = route();
    if (r.name !== lastViewName) window.scrollTo(0, 0);
    lastViewName = r.name;
    render();
  }
  window.addEventListener('popstate', onRoute);
  // An old #/ address typed or pasted into an open page changes only the hash, so no page loads.
  window.addEventListener('hashchange', () => { if (!PAGE_ROUTES) onRoute(); else if (!legacyRedirect()) onRoute(); });

  // Rewrites #/... links to page addresses wherever they appear (views, dialogs, drawers), so
  // opening in a new tab or copying a link gives the real address.
  function rewriteLinks(root) {
    if (!PAGE_ROUTES || root.nodeType !== 1) return;
    if (root.matches('a[href^="#/"]')) root.setAttribute('href', toUrl(root.getAttribute('href')));
    root.querySelectorAll('a[href^="#/"]').forEach(a => a.setAttribute('href', toUrl(a.getAttribute('href'))));
  }
  new MutationObserver(list => list.forEach(m => {
    if (m.type === 'attributes') rewriteLinks(m.target);
    else m.addedNodes.forEach(rewriteLinks);
  })).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  // Plain clicks on app links go through go(), so same-page moves skip the reload.
  document.addEventListener('click', (e) => {
    if (!PAGE_ROUTES || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('#/') && !(href.startsWith('/app/') && /^\/app\/(?:[a-z]+\/)?(?:\?|$)/.test(href))) return;
    e.preventDefault();
    go(href);
  });

  // Old addresses keep working: /app/#/owners (bookmarks, Telegram, e-mails) and /app/?view=finance.
  // Returns true when the browser is being sent to another page.
  function legacyRedirect() {
    if (!PAGE_ROUTES) return false;
    let target = null;
    if (location.hash.startsWith('#/')) target = toUrl(location.hash);
    else {
      const v = new URLSearchParams(location.search).get('view');
      if (v) target = toUrl('#/' + ({ dashboard: 'today', reports: 'finance' }[v] || v));
    }
    if (!target) return false;
    if (new URL(target, location.origin).pathname === location.pathname) { history.replaceState(null, '', target); return false; }
    location.replace(target);
    return true;
  }

  // Simplified clean navigation: 5 core daily workflows + 1 management group.
  const NAV = [
    { items: [
      { id: 'today', label: 'მთავარი', icon: 'today', href: '#/today' },
      { id: 'apartments', label: 'ბინები', icon: 'building', href: '#/apartments' },
      { id: 'deals', label: 'გარიგებები', icon: 'wallet', href: '#/deals' },
      { id: 'contacts', label: 'კონტაქტები', icon: 'user', href: '#/owners' },
      { id: 'tasks', label: 'საქმეები', icon: 'tasks', href: '#/tasks' },
    ] },
    { id: 'manage', label: 'მართვა', items: [
      { id: 'finance', label: 'ფინანსები', icon: 'wallet', href: '#/finance' },
      { id: 'team', label: 'გუნდი', icon: 'team', href: '#/team' },
      { id: 'settings', label: 'პარამეტრები', icon: 'settings', href: '#/settings' },
    ] },
  ];
  const navGroups = () => (isAgent() ? NAV.filter(g => g.id !== 'manage') : NAV);
  const sectionOf = (itemId) => NAV.find(g => g.items.some(i => i.id === itemId));
  const aptSection = (a) => (a?.transaction_type === 'sale' ? 'sale' : 'rent');
  const contactSection = (o) => o?.contact_type || 'owner';

  // The nav item the current route belongs to.
  function navKey(r = route()) {
    if (r.name === 'apartments') return 'apartments';
    if (r.name === 'owners') return 'contacts';
    if (r.name === 'deals') return 'deals';
    if (r.name === 'tasks') return 'tasks';
    if (r.name === 'today') return 'today';
    return r.name;
  }

  function navCounts() {
    if (!S.data) return {};
    const overdue = S.data.tasks.filter(H.isOverdue).length;
    const pending = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending').length;
    const open = (S.data.deals || []).filter(d => !['closed', 'lost'].includes(d.stage)).length;
    return {
      tasks: overdue ? { n: overdue, danger: true, label: `${overdue} ვადაგადაცილებული` } : null,
      contacts: pending ? { n: pending, label: `${pending} თანხმობა პასუხს ელოდება` } : null,
      deals: open ? { n: open, label: `${open} აქტიური გარიგება` } : null,
    };
  }

  function navLinks(group, key, counts, cls = 'nav-item') {
    const countHtml = (c) => c ? `<span class="count ${c.danger ? 'count-danger' : ''}" title="${esc(c.label)}">${c.n}</span>` : '';
    return group.items.map(n => `<a class="${cls}" href="${n.href}" ${key === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${countHtml(counts[n.id])}</a>`).join('');
  }

  // Tab labels show only when every tab fits; otherwise the tabs become icons. Measured rather
  // than set by breakpoints because the organization name, counts and language change the width.
  function fitTopbarTabs() {
    const bar = $('.topbar'), nav = $('#topbar-nav');
    if (!bar || !nav) return;
    bar.classList.remove('tabs-compact');
    if (nav.scrollWidth > nav.clientWidth + 1) bar.classList.add('tabs-compact');
  }
  let fitQueued = false;
  window.addEventListener('resize', () => {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fitTopbarTabs(); });
  });

  function renderShell() {
    const key = S.data ? navKey() : route().name;
    const counts = navCounts();
    const topNav = $('#topbar-nav');
    if (topNav) {
      const topItems = [
        { id: 'today', label: 'მთავარი', icon: 'today', href: '#/today' },
        { id: 'apartments', label: 'ბინები', icon: 'building', href: '#/apartments' },
        { id: 'deals', label: 'გარიგებები', icon: 'wallet', href: '#/deals', count: counts.deals },
        { id: 'contacts', label: 'კონტაქტები', icon: 'user', href: '#/owners', count: counts.contacts },
        { id: 'tasks', label: 'საქმეები', icon: 'tasks', href: '#/tasks', count: counts.tasks },
        { id: 'finance', label: 'ფინანსები', icon: 'wallet', href: '#/finance' },
      ];
      topNav.innerHTML = topItems.map(item => {
        const active = key === item.id;
        const c = item.count;
        const badge = c ? `<span class="topbar-tab-count ${c.danger ? 'count-danger' : ''}" title="${esc(c.label)}">${c.n}</span>` : '';
        return `<a class="topbar-tab ${active ? 'is-active' : ''}" href="${item.href}" ${active ? 'aria-current="page"' : ''} title="${esc(item.label)}">${icon(item.icon, 15)}<span>${item.label}</span>${badge}</a>`;
      }).join('');
      fitTopbarTabs();
    }
    $('#rail').innerHTML = navGroups().map(g => `${g.label ? `<div class="nav-group">${g.label}</div>` : ''}${navLinks(g, key, counts)}`).join('')
      + `<div class="rail-foot">${S.data ? `${S.data.apartments.filter(a => a.status !== 'archived').length} ბინა · ${S.data.owners.length} კონტაქტი · ${S.data.members.length} წევრი` : ''}</div>`;

    // Phone: 4 primary workflows + More menu sheet.
    const tab = (href, ic, label, active, count) => `<a href="${href}" ${active ? 'aria-current="page"' : ''}>${icon(ic, 20)}<span>${label}</span>${count ? `<span class="count ${count.danger ? 'count-danger' : ''}">${count.n}</span>` : ''}</a>`;
    const inMore = ['tasks', 'finance', 'team', 'settings'].includes(key);
    $('#bottom-nav').innerHTML = tab('#/today', 'today', 'მთავარი', key === 'today')
      + tab('#/apartments', 'building', 'ბინები', key === 'apartments')
      + tab('#/deals', 'wallet', 'გარიგებები', key === 'deals', counts.deals)
      + tab('#/owners', 'user', 'კონტაქტები', key === 'contacts', counts.contacts)
      + `<button type="button" id="btn-more" ${inMore ? 'aria-current="page"' : ''}>${icon('menu', 20)}<span>მენიუ</span>${counts.tasks ? `<span class="count count-danger">${counts.tasks.n}</span>` : ''}</button>`;
    $('#btn-more').onclick = openMoreSheet;

    // Phone: quick filter bar right above the content for list views
    const bar = $('#section-bar');
    const r = route();
    let subLinks = null;
    if (r.name === 'apartments' && !r.id) {
      const curType = r.params.get('type') || '';
      subLinks = [
        { href: '#/apartments', label: 'ყველა', active: !curType },
        { href: '#/apartments?type=rent', label: 'ქირავდება', active: curType === 'rent' },
        { href: '#/apartments?type=sale', label: 'იყიდება', active: curType === 'sale' },
      ];
    } else if (r.name === 'deals' && !['commissions', 'selections', 'documents'].includes(r.id)) {
      const curType = r.params.get('type') || '';
      subLinks = [
        { href: '#/deals', label: 'ყველა', active: !curType },
        { href: '#/deals?type=rental', label: 'გაქირავება', active: curType === 'rental' },
        { href: '#/deals?type=sale', label: 'გაყიდვა', active: curType === 'sale' },
      ];
    } else if (r.name === 'owners' && !r.id) {
      const curType = r.params.get('type') || '';
      subLinks = [
        { href: '#/owners', label: 'ყველა', active: !curType },
        { href: '#/owners?type=owner', label: 'მეპატრონეები', active: curType === 'owner' },
        { href: '#/owners?type=buyer', label: 'მყიდველები', active: curType === 'buyer' },
        { href: '#/owners?type=renter', label: 'მდგმურები', active: curType === 'renter' },
        { href: '#/owners?type=seller', label: 'გამყიდველები', active: curType === 'seller' },
      ];
    }
    if (bar) {
      bar.hidden = !subLinks;
      if (subLinks) {
        bar.innerHTML = subLinks.map(l => `<a class="section-tab" href="${l.href}" ${l.active ? 'aria-current="page"' : ''}>${l.label}</a>`).join('');
      }
    }

    // Organization switcher
    const sw = $('#org-switch');
    if (S.orgs.length > 1) {
      sw.innerHTML = `<label class="sr-only" for="org-select">სამუშაო სივრცე</label><select id="org-select">${S.orgs.map(o => `<option value="${o.id}" ${o.id === S.org.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
      $('#org-select').onchange = (e) => switchOrg(e.target.value);
    } else {
      sw.innerHTML = `<span class="org-static" title="სამუშაო სივრცე">${esc(S.org.name)}</span>`;
    }

    renderPlanBanner();
    renderDataNotice();

    const name = S.member?.display_name || S.user.email;
    $('#user-name').textContent = name;
    $('#user-role').textContent = L.role[S.member?.role] || '';
    $('#user-avatar').textContent = (name || '·').trim().charAt(0).toUpperCase();

    const unread = S.data ? S.data.notifications.filter(n => !n.is_read).length : 0;
    $('#btn-notif').innerHTML = icon('bell') + (unread ? `<span class="dot">${unread > 9 ? '9+' : unread}</span>` : '');
    $('#btn-notif').setAttribute('aria-label', unread ? `შეტყობინებები, ${unread} წაუკითხავი` : 'შეტყობინებები');
  }

  async function switchOrg(id) {
    const o = S.orgs.find(x => x.id === id);
    if (!o) return;
    S.org = o; S.member = o.member;
    localStorage.setItem('rigzea_selected_org_id', id);
    if (o.member.role === 'staff') { location.href = '/staff/'; return; }
    if (PAGE_ROUTES && location.pathname !== '/app/') { location.assign('/app/'); return; }
    // Drop the previous workspace's data first so nothing renders it under the new name.
    S.data = null;
    S.loadError = null;
    history.replaceState(null, '', toUrl('#/today'));
    await refresh();
    if (!S.data) return;
    toast(`გადაერთე: ${o.name}`);
  }

  function openMoreSheet() {
    const key = navKey();
    const counts = navCounts();
    R.dialog({
      title: 'მენიუ',
      body: `<nav class="menu-list" style="padding:0">${navGroups().map(g => `${g.label ? `<div class="nav-group">${g.label}</div>` : ''}${navLinks(g, key, counts, '')}`).join('')}
        <button type="button" data-action="signout">${icon('logout')} გამოსვლა</button></nav>`,
      onOpen: (form, dlg) => $$('a', form).forEach(a => a.addEventListener('click', () => dlg.close())),
    });
  }

  function renderLoading() {
    $('#view').innerHTML = `<div class="card"><div class="skeleton" aria-label="იტვირთება"><i></i><i></i><i></i><i></i><i></i></div></div>`;
  }

  function render() {
    if (!S.data) {
      if (S.loadError) {
        $('#view').innerHTML = `<div class="card"><div class="error-state"><p>მონაცემები ვერ ჩაიტვირთა. ${esc(R.friendlyError(S.loadError))}</p><button class="btn btn-primary" type="button" id="btn-load-retry">${icon('refresh', 16)} ხელახლა ცდა</button></div></div>`;
        $('#btn-load-retry').onclick = () => refresh();
      } else renderLoading();
      return;
    }
    const r = route();
    if (isAgent() && AGENT_CLOSED.includes(r.name)) { go('#/today', { replace: true }); return; }
    renderShell();
    const view = views[r.name];
    if (!view) {
      renderLoading();
      ensureViewLoaded(r.name).then(() => {
        if (route().name === r.name) render();
      }).catch(err => {
        console.error(err);
        $('#view').innerHTML = `<div class="card"><div class="error-state"><p>გვერდის კოდი ვერ ჩაიტვირთა.</p></div></div>`;
      });
      return;
    }
    try {
      view(r);
    } catch (err) {
      console.error(err);
      $('#view').innerHTML = `<div class="card"><div class="error-state"><p>გვერდის ჩვენება ვერ მოხერხდა: ${esc(err.message)}</p><a class="btn btn-secondary" href="#/today">მთავარზე დაბრუნება</a></div></div>`;
    }
    // Task overlay on top of any page
    const taskId = r.params.get('task');
    if (taskId) App.openTaskDrawer(taskId); else App.closeTaskDrawer?.(true);
  }

  let lastViewName = null;

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  function notifTarget(link) {
    if (!link) return null;
    const m = /view=([a-z]+)/.exec(link);
    if (m) return '#/' + ({ dashboard: 'today', reports: 'finance' }[m[1]] || m[1]);
    if (link.startsWith('/app/#')) return link.slice(5);
    if (link.startsWith('/app/')) return link;
    return null;
  }

  function renderNotifPanel() {
    const list = S.data?.notifications || [];
    $('#notif-panel').innerHTML = `<div class="popover-head"><strong>შეტყობინებები</strong>${list.some(n => !n.is_read) ? '<button type="button" class="link-btn small" id="btn-read-all">ყველა წაკითხულია</button>' : ''}</div>
      <div style="max-height:min(420px,70vh);overflow-y:auto">${list.length ? list.map(n => `
        <button type="button" class="notif ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
          <strong>${esc(n.title)}</strong>${n.message ? `<span>${esc(n.message)}</span>` : ''}<time>${esc(R.relative(n.created_at))}</time>
        </button>`).join('') : '<div class="empty-inline">ახალი შეტყობინება არ არის. აქ გამოჩნდება დანიშვნები, ვადაგადაცილებები და მფლობელის პასუხები.</div>'}</div>`;
    $('#btn-read-all')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
      await q(sb.from('notifications').update({ is_read: true }).eq('user_id', S.user.id).eq('organization_id', S.org.id).eq('is_read', false));
      S.data.notifications.forEach(n => { n.is_read = true; });
      renderShell(); renderNotifPanel();
    }));
    $$('.notif', $('#notif-panel')).forEach(b => b.addEventListener('click', async () => {
      const n = list.find(x => x.id === b.dataset.id);
      togglePopover('notif', false);
      if (!n.is_read) { n.is_read = true; renderShell(); sb.from('notifications').update({ is_read: true }).eq('id', n.id).then(() => {}); }
      const target = notifTarget(n.link);
      if (target) go(target);
    }));
  }

  function togglePopover(which, force) {
    const panel = $('#' + which + '-panel');
    const btn = $('#btn-' + which);
    const open = force ?? panel.hidden;
    ['notif', 'user'].forEach(w => { if (w !== which) { $('#' + w + '-panel').hidden = true; $('#btn-' + w).setAttribute('aria-expanded', 'false'); } });
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    if (open && which === 'notif') renderNotifPanel();
    if (open && which === 'user') renderUserPanel();
  }

  function renderUserPanel() {
    const theme = localStorage.getItem('rigzea_theme') || 'system';
    $('#user-panel').innerHTML = `<div class="popover-head"><div><strong>${esc(S.member?.display_name || '')}</strong><div class="small muted">${esc(S.user.email)}</div></div></div>
      <div class="menu-list">
        <label class="field" style="padding:4px 10px 8px"><span class="field-label">თემა</span>
          <select id="theme-select" class="input"><option value="system">სისტემის მიხედვით</option><option value="light">ღია</option><option value="dark">მუქი</option></select></label>
        <button type="button" class="menu-lang" data-lang-toggle>${window.RLang?.lang === 'en' ? 'ქართული' : 'English'}</button>
        <button type="button" data-action="signout">${icon('logout')} გამოსვლა</button>
      </div>`;
    $('#theme-select').value = theme;
    $('#theme-select').onchange = (e) => { localStorage.setItem('rigzea_theme', e.target.value); R.applyTheme(e.target.value); };
  }

  const syncThemeBtn = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    const b = $('#btn-theme');
    if (!b) return; // the demo shell has no theme button
    b.innerHTML = icon(dark ? 'sun' : 'moon');
    b.setAttribute('aria-label', dark ? 'ღია თემა' : 'მუქი თემა');
  };
  $('#btn-theme')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rigzea_theme', next);
    R.applyTheme(next);
    syncThemeBtn();
  });
  syncThemeBtn();
  $('#btn-notif').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('notif'); });
  $('#btn-user').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('user'); });
  document.addEventListener('click', (e) => {
    ['notif', 'user'].forEach(w => { const p = $('#' + w + '-panel'); if (!p.hidden && !p.contains(e.target)) togglePopover(w, false); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ['notif', 'user'].forEach(w => { if (!$('#' + w + '-panel').hidden) { togglePopover(w, false); $('#btn-' + w).focus(); } });
  });

  // ---------------------------------------------------------------------------
  // Global search
  // ---------------------------------------------------------------------------
  function openSearch() {
    if (!S.data || document.querySelector('dialog[open]')) return;
    R.dialog({
      title: 'ძებნა',
      body: `<div class="search-input"><span>${icon('search', 16)}</span><input class="input" id="search-q" type="search" placeholder="ბინა, მისამართი, საქმე, მფლობელი…" autocomplete="off" aria-label="საძიებო სიტყვა" /></div><div id="search-results" class="rows" style="margin-top:10px"></div>`,
      onOpen: (form, dlg) => {
        const input = $('#search-q', form);
        const out = $('#search-results', form);
        const draw = () => {
          const s = input.value.trim().toLowerCase();
          if (s.length < 2) { out.innerHTML = '<p class="empty-inline">ჩაწერე მინიმუმ 2 სიმბოლო.</p>'; return; }
          const has = (...v) => v.some(x => String(x || '').toLowerCase().includes(s));
          const res = [
            ...S.data.apartments.filter(a => has(a.name, a.unit_number, a.address, a.city, H.owner(a.owner_id)?.name)).slice(0, 6).map(a => ({ href: `#/apartments/${a.id}`, icon: 'building', title: a.name, sub: [a.address, a.city].filter(Boolean).join(', ') })),
            ...S.data.tasks.filter(t => has(t.title, t.description, H.aptName(t.apartment_id))).slice(0, 6).map(t => ({ href: taskHref(t.id), icon: 'tasks', title: t.title, sub: `${H.aptName(t.apartment_id)} · ${L.taskStatus[t.status]}` })),
            ...S.data.owners.filter(o => has(o.name, o.phone, o.email)).slice(0, 4).map(o => ({ href: `#/owners/${o.id}`, icon: 'owner', title: o.name, sub: (o.is_flagged ? 'არასანდო კლიენტი · ' : '') + (o.phone || o.email || '') })),
          ];
          out.innerHTML = res.length ? res.map(x => `<a class="row" style="--cols:24px minmax(0,1fr)" href="${x.href}">${icon(x.icon)}<span class="cell-main"><strong>${esc(x.title)}</strong><span>${esc(x.sub)}</span></span></a>`).join('') : '<p class="empty-inline">ვერაფერი მოიძებნა.</p>';
          $$('a', out).forEach(a => a.addEventListener('click', () => dlg.close()));
        };
        input.addEventListener('input', draw);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('a', out)?.click(); } });
        draw();
      },
    });
  }
  $('#btn-search')?.addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !$('#shell').hidden) { e.preventDefault(); openSearch(); }
  });

  const qaWrap = $('#quick-add-wrap');
  const qaBtn = $('#btn-new-task');
  const qaPanel = $('#quick-add-panel');
  const qtWrap = $('#quick-tools-wrap');
  const qtBtn = $('#btn-tools');
  const qtPanel = $('#tools-panel');

  if (qtBtn && qtPanel) {
    qtBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !qtPanel.hidden;
      qtPanel.hidden = open;
      qtBtn.setAttribute('aria-expanded', String(!open));
      if (qaPanel) { qaPanel.hidden = true; qaBtn?.setAttribute('aria-expanded', 'false'); }
    });
    qtPanel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      qtPanel.hidden = true;
      qtBtn.setAttribute('aria-expanded', 'false');
      const tool = b.dataset.tool;
      if (tool === 'calculator') App.openCommissionCalculator();
      else if (tool === 'matchmaker') {
        if (typeof App.openMatchmakerModal === 'function') App.openMatchmakerModal();
        else App.openMatchmaker();
      }
      else if (tool === 'social-post') App.openSocialPostGenerator();
      else if (tool === 'templates') {
        if (typeof App.openDocChooser === 'function') App.openDocChooser();
        else go('#/settings');
      }
    });
    document.addEventListener('click', (e) => {
      if (qtWrap && !qtWrap.contains(e.target)) {
        qtPanel.hidden = true;
        qtBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && qtPanel && !qtPanel.hidden) {
        qtPanel.hidden = true;
        qtBtn.setAttribute('aria-expanded', 'false');
        qtBtn.focus();
      }
    });
  }

  if (qaBtn && qaPanel) {
    qaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !qaPanel.hidden;
      qaPanel.hidden = open;
      qaBtn.setAttribute('aria-expanded', String(!open));
      if (qtPanel) { qtPanel.hidden = true; qtBtn?.setAttribute('aria-expanded', 'false'); }
    });
    qaPanel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-qa]');
      if (!b) return;
      qaPanel.hidden = true;
      qaBtn.setAttribute('aria-expanded', 'false');
      const action = b.dataset.qa;
      if (action === 'apartment') App.openApartmentForm();
      else if (action === 'deal') App.openDealForm();
      else if (action === 'viewing') App.openTaskForm({ type: 'viewing' });
      else if (action === 'task') App.openTaskForm({ apartmentId: route().name === 'apartments' ? route().id : null });
    });
    document.addEventListener('click', (e) => {
      if (qaWrap && !qaWrap.contains(e.target)) {
        qaPanel.hidden = true;
        qaBtn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && qaPanel && !qaPanel.hidden) {
        qaPanel.hidden = true;
        qaBtn.setAttribute('aria-expanded', 'false');
        qaBtn.focus();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Enter workspace
  // ---------------------------------------------------------------------------
  async function enterShell({ handed = false } = {}) {
    showScreen('shell');
    // Created here so the app and demo pages share it without markup changes.
    if (!$('#section-bar')) $('#view').insertAdjacentHTML('beforebegin', '<nav class="section-bar" id="section-bar" hidden></nav>');
    hydrateIcons();
    lastViewName = route().name;
    if (handed) { // data came over from the previous page, see dataCache.handoff
      render();
      checkPaymentReturn();
      return;
    }
    S.data = null;
    renderShell();
    const org = S.org.id;
    const pending = prefetch?.org === org ? prefetch.data : null;
    prefetch = null;
    const load = loadData(pending);
    const saved = await dataCache.read(org);
    if (saved && !S.data && S.org.id === org) {
      S.data = saved.data;
      S.totals = saved.totals || {};
      indexData();
      setStale(true);
      render();
    } else if (!S.data) renderLoading();
    await load;
    setStale(false);
    render();
    if (S.loadError && saved) toast('ბოლო განახლება ვერ მოხერხდა. ნაჩვენებია წინა მონაცემები.', { type: 'error', action: { label: 'განახლება', fn: () => refresh({ quiet: true }) } });
    checkPaymentReturn();
    // Generate overdue alerts for this org (deduplicated server-side); best-effort.
    if (isManager()) sb.rpc('scan_alerts', { p_org: S.org.id }).then(() => {}, () => {});
  }

  async function checkPaymentReturn() {
    const p = new URLSearchParams(location.search);
    if (p.get('payment') === 'success') {
      const isSimulated = p.get('simulated') === 'true';
      ['payment', 'simulated', 'plan', 'payment_id'].forEach(k => p.delete(k));
      window.history.replaceState({}, document.title, location.pathname + (p.toString() ? '?' + p : ''));
      if (isSimulated) {
        toast('სატესტო გადახდა წარმატებით შესრულდა! (KISA რეჟიმი)', { type: 'success', timeout: 6000 });
      } else {
        toast('გადახდა მიღებულია! პაკეტი გააქტიურდა 30 დღით.', { type: 'success', timeout: 6000 });
      }
      await refresh({ quiet: false });
    }
  }

  // ---------------------------------------------------------------------------
  // Plans, trial and feature gates (mirrors plan_limit and plan_has_feature in supabase/patches/10 and 11)
  // ---------------------------------------------------------------------------
  const CONTACT = { phone: '+995599548575', wa: '995599548575' };
  // Plan limits, feature lists and copy live in one place: js/plans.js, loaded before this file.
  // The database mirrors the limits in plan_limit() and plan_has_feature(); see that file's header.
  const { ALL_FEATURES, PLANS, PLAN_ORDER, FEATURE_LABEL } = window.RIGZEA_PLANS;

  // Test switch, off in production: when true every trial workspace counts as an ended trial, so limits
  // apply at once and the upgrade dialog opens on gated actions. Client-side only (the database still
  // counts the trial). Enable with window.RIGZEA_FORCE_NO_TRIAL = true (tests do).
  const FORCE_NO_TRIAL = window.RIGZEA_FORCE_NO_TRIAL ?? false;
  if (FORCE_NO_TRIAL) {
    const sub = document.querySelector('#form-signup .page-sub');
    if (sub) sub.innerHTML = '<strong>აირჩიე პაკეტი რეგისტრაციის შემდეგ</strong> · დამწყები: 9.99 ₾ / 30 დღე.';
  }

  function planState() {
    const o = S.org || {};
    const key = PLANS[o.plan] ? o.plan : 'trial';
    let eff = key, daysLeft = null, lapsed = false, trialEnded = false;
    const end = key === 'trial' ? o.trial_ends_at : key === 'starter' ? null : o.plan_expires_at;
    if (end) {
      const ms = new Date(end) - Date.now();
      daysLeft = Math.max(0, Math.ceil(ms / 864e5));
      // An ended trial or paid plan falls back to the free plan; nothing is deleted.
      if (ms < 0) { eff = 'starter'; if (key === 'trial') trialEnded = true; else lapsed = true; }
    }
    if (key === 'trial' && FORCE_NO_TRIAL) { eff = 'starter'; trialEnded = true; daysLeft = 0; }
    return { key, eff, plan: PLANS[eff], daysLeft, end, lapsed, trialEnded, trial: key === 'trial' && !trialEnded, noTrial: key === 'trial' && FORCE_NO_TRIAL };
  }
  const isActiveApt = (a) => a.status !== 'archived' && !a.is_archived;
  const activeApartments = () => (S.data?.apartments || []).filter(isActiveApt).length;
  // Active properties above the plan limit: they stay in the workspace, but their public links are paused.
  // The oldest ones keep their links (same order as apartment_within_plan in the database).
  function pausedApartmentIds() {
    const cap = planState().plan.apartments;
    if (cap === null) return new Set();
    const active = (S.data?.apartments || []).filter(isActiveApt)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));
    return new Set(active.slice(cap).map(a => a.id));
  }
  const seatsUsed = () => (S.data?.members || []).filter(m => m.role !== 'staff').length + (S.seatInvites || 0);
  const can = (feature) => planState().plan.features.includes(feature);
  const minPlanFor = (pred) => PLAN_ORDER.find(id => pred(PLANS[id])) || 'agency';

  function waLink(plan) {
    const text = plan ? `გამარჯობა! მინდა რიგზეას „${plan.name}“ პაკეტის გააქტიურება. სამუშაო სივრცე: ${S.org?.name || ''}.` : 'გამარჯობა! მინდა რიგზეას პაკეტის არჩევა.';
    return `https://wa.me/${CONTACT.wa}?text=${encodeURIComponent(text)}`;
  }

  function planCardsHtml(recId, currentId) {
    return `<div class="plan-grid">${PLAN_ORDER.map(id => {
      const p = PLANS[id];
      const cur = id === currentId, rec = id === recId && !cur;
      const isAgency = id === 'agency';
      return `<div class="plan-card ${isAgency ? 'plan-card-agency' : ''} ${rec ? 'is-rec' : ''} ${cur ? 'is-current' : ''}">
        <div class="plan-card-main">
          ${isAgency ? '<span class="plan-tag plan-tag-unlimited"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-4px;margin-right:6px"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>სრულიად ულიმიტო პაკეტი</span>' : rec ? '<span class="plan-tag">შენთვის შესაფერისი</span>' : cur ? '<span class="plan-tag plan-tag-cur">შენი პაკეტი</span>' : ''}
          <h3>${esc(p.name)}</h3>
          ${p.desc ? `<p class="plan-desc" style="font-size:12px;color:var(--muted);margin:4px 0 0">${esc(p.desc)}</p>` : ''}
          <div class="plan-price">${p.price ? `${p.price} ₾<small> / 30 დღე</small>` : '0 ₾<small> / უფასო</small>'}</div>
        </div>
        <ul>${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        ${cur ? '' : p.price ? `<div class="plan-card-actions">
          <button type="button" class="btn ${rec || isAgency ? 'btn-primary' : 'btn-secondary'} btn-sm" data-kisa-checkout="${id}">${icon('card', 16)} ბარათით გადახდა</button>
          <a class="plan-wa" href="${esc(waLink(p))}" target="_blank" rel="noopener">${icon('whatsapp', 13)} WhatsApp-ით შეკვეთა</a>
        </div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }

  const KISA_DONATE_URL = 'https://www.kisa.ge/donate/k45gb9yawv';
  const KISA_STREAM_ID = '6ad1f68d02e62c8c663fc77b';

  function openKisaCheckoutModal(planId) {
    if (!S.org) return;
    const p = PLANS[planId];
    if (!p) return;

    const code = `RZ-${Math.floor(1000 + Math.random() * 9000)}`;
    let ws = null;
    let isDone = false;
    const root = () => document.querySelector('dialog[open] .kisa');

    const dlg = R.dialog({
      title: `პაკეტი: ${p.name}`,
      subtitle: `${p.price} ₾ / 30 დღე`,
      body: `
        <div class="kisa" data-state="wait">
          <div class="kisa-view kisa-pay-view">
            <div class="kisa-code">
              <span class="kisa-code-label">შენი გადახდის კოდი</span>
              <div class="kisa-code-row">
                <strong id="kisa-code-val" aria-label="გადახდის კოდი">${esc(code)}</strong>
                <button type="button" class="kisa-copy" id="btn-copy-kisa-code">${icon('copy', 16)}<span>კოპირება</span></button>
              </div>
              <span class="kisa-code-hint">დააკოპირეთ და ჩაწერეთ Kisa-ს კომენტარში (Message). მხოლოდ ეს კოდი.</span>
            </div>
            <a href="${KISA_DONATE_URL}" target="_blank" rel="noopener" class="kisa-pay" id="btn-open-kisa">
              <span class="kisa-pay-main">${icon('card', 18)} Kisa-ზე გადახდა: ${p.price} ₾</span>
              <span class="kisa-badges" aria-label="Apple Pay, Google Pay, Visa, Mastercard">
                <i>Apple Pay</i><i>Google Pay</i><i>Visa</i><i>Mastercard</i>
              </span>
            </a>
            <div class="kisa-live" role="status" aria-live="polite">
              <span class="kisa-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></span>
              <span id="kisa-status-msg">სისტემა რეალურ დროში ელოდება თქვენს გადახდას...</span>
            </div>
          </div>
          <div class="kisa-view kisa-done-view" hidden>
            <svg class="kisa-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l8 8 14-16"/></svg>
            <h3>გადახდა მიღებულია!</h3>
            <p>პაკეტი „${esc(p.name)}“ გააქტიურდა 30 დღით.</p>
            <button type="button" class="btn btn-primary" data-close>დახურვა</button>
          </div>
        </div>`,
    });

    const copyBtn = document.getElementById('btn-copy-kisa-code');
    copyBtn?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); } catch { /* the code stays selectable */ }
      copyBtn.classList.add('is-copied');
      copyBtn.querySelector('span').textContent = 'დაკოპირდა';
      setTimeout(() => { copyBtn.classList.remove('is-copied'); copyBtn.querySelector('span').textContent = 'კოპირება'; }, 2000);
    });

    const setStatus = (html, state) => {
      const msg = document.getElementById('kisa-status-msg');
      if (msg) msg.innerHTML = html;
      if (state && root()) root().dataset.state = state;
    };
    const closeSocket = () => { if (ws) { try { ws.close(); } catch { /* already closed */ } ws = null; } };
    dlg.then(closeSocket); // the dialog promise resolves when it closes

    async function handlePaymentSuccess(donation) {
      if (isDone) return;
      isDone = true;
      setStatus('გადახდა დაფიქსირდა, პაკეტი აქტიურდება...', 'busy');

      try {
        const { data: { session } } = await sb.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('ავტორიზაციის შეცდომა');

        const res = await fetch('/api/kisa-stream-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ orgId: S.org.id, plan: planId, code, donation }),
        });
        const result = await res.json().catch(() => ({}));

        if (!res.ok || !result.ok) {
          throw new Error(result.message || 'გააქტიურება ვერ მოხერხდა.');
        }

        closeSocket();
        const r = root();
        if (r) {
          r.dataset.state = 'done';
          r.querySelector('.kisa-pay-view').hidden = true;
          r.querySelector('.kisa-done-view').hidden = false;
        }
        await refresh({ quiet: false });
      } catch (err) {
        console.error('kisa payment activation error', err);
        setStatus(`შეცდომა: ${esc(err.message)}. თუ გადაიხადე, მოგვწერე WhatsApp-ში კოდით ${esc(code)}.`, 'error');
        isDone = false;
      }
    }

    // Connect to KISA Real-Time Socket
    try {
      ws = new WebSocket('wss://www.kisa.ge/socket.io/?EIO=4&transport=websocket');
      ws.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        if (event.data.startsWith('0{')) {
          ws.send('40'); // Socket.IO handshake
        } else if (event.data.startsWith('42[')) {
          try {
            const parsed = JSON.parse(event.data.slice(2));
            const evtType = parsed[0];
            const data = parsed[1];
            if ((evtType === 'donation' || evtType === 'donation-fake') && data) {
              const msg = String(data.message || '').toUpperCase();
              const donationValidation = String(data.validation || '');
              const amount = Number(data.amount || 0);

              if (donationValidation === KISA_STREAM_ID && msg.includes(code) && amount >= p.price) {
                handlePaymentSuccess(data);
              }
            }
          } catch (e) {
            console.error('kisa ws parse error', e);
          }
        }
      };

      ws.onerror = (e) => console.warn('KISA socket error:', e);
      ws.onclose = () => {
        if (!isDone && root()) setStatus('კავშირი შეწყდა. გადახდის შემდეგ დაელოდე რამდენიმე წამს ან მოგვწერე WhatsApp-ში.', 'idle');
      };
    } catch (e) {
      console.warn('Could not connect to KISA socket:', e);
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kisa-checkout]');
    if (btn) {
      e.preventDefault();
      openKisaCheckoutModal(btn.dataset.kisaCheckout);
    }
  });

  // reason: { kind: 'apartments'|'seats'|'feature'|'info', feature?, count? }
  function openUpgrade(reason = { kind: 'info' }) {
    const st = planState();
    let title = 'აირჩიე შენი პაკეტი', text = 'გადადი უფრო დიდ პაკეტზე და გახსენი მეტი შესაძლებლობა.', rec = 'pro';
    if (reason.kind === 'apartments') {
      const n = reason.count ?? activeApartments();
      title = 'ობიექტების ლიმიტი ამოიწურა';
      text = `${st.plan.name} პაკეტში მაქსიმუმ ${st.plan.apartments} აქტიური ობიექტია, ახლა გაქვს ${n}. გადადი პაკეტზე, რომელიც მეტს იტევს.`;
      rec = minPlanFor(p => p.apartments === null || p.apartments > n);
    } else if (reason.kind === 'seats') {
      title = 'გუნდის ლიმიტი ამოიწურა';
      text = `${st.plan.name} პაკეტში ${st.plan.seats} სამუშაო ადგილია. თანამშრომლის (staff) მოწვევა ლიმიტში არ ითვლება.`;
      rec = minPlanFor(p => p.seats === null || p.seats > seatsUsed());
    } else if (reason.kind === 'feature') {
      rec = minPlanFor(p => p.features.includes(reason.feature));
      title = 'ეს ფუნქცია სხვა პაკეტშია';
      text = `„${FEATURE_LABEL[reason.feature] || reason.feature}“ ხელმისაწვდომია პაკეტიდან „${PLANS[rec].name}“.`;
    }
    return R.dialog({
      title, subtitle: text, wide: true,
      body: `${planCardsHtml(rec, st.trial || st.noTrial ? null : st.eff)}
        <p class="plan-contact">გააქტიურება ავტომატურია ბარათით (KISA), ან მოგვწერე WhatsApp-ში / დარეკე <a href="tel:${CONTACT.phone}">${CONTACT.phone}</a> და დაგეხმარებით.</p>
        <div class="plan-cta"><a class="btn btn-secondary" href="${esc(waLink(PLANS[rec]))}" target="_blank" rel="noopener">${icon('whatsapp', 16)} მოგვწერე WhatsApp-ში</a><button type="button" class="btn btn-ghost" data-close>მოგვიანებით</button></div>`,
    });
  }

  // True when another apartment fits the plan; otherwise opens the upgrade dialog and returns false.
  function guardLimit(kind, add = 1) {
    if (!S.data || !S.org) return true;
    const st = planState();
    if (kind === 'apartments' || kind === 'seats') {
      const cap = st.plan[kind];
      const used = kind === 'apartments' ? activeApartments() : seatsUsed();
      if (cap === null || used + add <= cap) return true;
      openUpgrade({ kind, count: used });
      return false;
    }
    return true;
  }
  // Feature gate with dialog: if (!App.guardFeature('export')) return;
  function guardFeature(feature) {
    if (can(feature)) return true;
    openUpgrade({ kind: 'feature', feature });
    return false;
  }

  function renderPlanBanner() {
    let el = $('#plan-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'plan-banner';
      $('.layout').before(el);
    }
    const st = planState();
    let tone = null, msg = '', cta = 'პაკეტის არჩევა';
    const paused = pausedApartmentIds().size;
    const pausedMsg = paused ? ` ${st.plan.apartments} ყველაზე ძველი ობიექტის ბმული მუშაობს, დანარჩენი ${paused} შეჩერებულია, სანამ პაკეტს არ აირჩევ.` : '';
    if (st.noTrial) { tone = 'warn'; msg = `საცდელი პერიოდი გამორთულია. აირჩიე პაკეტი, რომ გააგრძელო: ახლა ${st.plan.apartments} ობიექტამდე გაქვს ხელმისაწვდომი.${pausedMsg}`; }
    else if (st.trialEnded) { tone = 'warn'; msg = `საცდელი პერიოდი დასრულდა და ანგარიში უფასო პაკეტზე გადავიდა. შენი მონაცემები ადგილზეა.${pausedMsg}`; }
    else if (st.lapsed) { tone = 'warn'; msg = `„${PLANS[st.key].name}“ პაკეტის ვადა ამოიწურა და ანგარიში უფასო პაკეტზე გადავიდა. შენი მონაცემები ადგილზეა.${pausedMsg}`; cta = 'განახლება'; }
    else if (st.trial) {
      tone = st.daysLeft !== null && st.daysLeft <= 3 ? 'warn' : 'info';
      msg = st.daysLeft === null ? 'საცდელი პერიოდი: ყველა ფუნქცია ღიაა.' : `საცდელი პერიოდი: დარჩენილია ${st.daysLeft} დღე. ყველა ფუნქცია ღიაა.`;
    } else if (st.daysLeft !== null && st.daysLeft <= 7) { tone = 'warn'; msg = `„${st.plan.name}“ პაკეტი მთავრდება ${st.daysLeft} დღეში.`; cta = 'განახლება'; }
    else if (paused) { tone = 'warn'; msg = `აქტიური ობიექტი პაკეტის ლიმიტს აღემატება.${pausedMsg}`; }
    if (!tone) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.className = `plan-banner plan-banner-${tone}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${esc(msg)}</span><button type="button" class="btn btn-sm btn-secondary" id="btn-plan-banner">${cta}</button>`;
    $('#btn-plan-banner').onclick = () => openUpgrade(paused ? { kind: 'apartments' } : { kind: 'info' });
  }

  // Raise a capped list's limit and reload. Called from the notice below.
  async function loadMore(kind) {
    const paged = PAGED[kind];
    if (!paged) return;
    S.limits[kind] = S.limits[kind] + paged.page;
    await refresh({ quiet: true });
  }

  // Says when a list was cut short, with a button to pull in the rest. Without it those rows
  // simply vanish from the UI with no explanation.
  function renderDataNotice() {
    let el = $('#data-notice');
    if (!el) { el = document.createElement('div'); el.id = 'data-notice'; $('.layout').before(el); }
    const full = Object.keys(PAGED).filter(k => S.data && S.totals[k] && S.totals[k].total > S.totals[k].shown);
    if (!full.length) { el.hidden = true; el.innerHTML = ''; return; }
    const parts = full.map(k => `${PAGED[k].label} ${S.totals[k].shown}/${S.totals[k].total}`).join(', ');
    el.hidden = false;
    el.className = 'data-notice';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="data-notice-text">${esc(`ნაჩვენებია ბოლო ჩანაწერები: ${parts}. დანარჩენი ჯერ არ ჩანს.`)}</span>`
      + full.map(k => `<button type="button" class="btn btn-sm btn-secondary" data-load-more="${k}">კიდევ ჩატვირთვა: ${esc(PAGED[k].label)}</button>`).join('');
    $$('#data-notice [data-load-more]').forEach(b => { b.onclick = () => loadMore(b.dataset.loadMore); });
  }

  // ---------------------------------------------------------------------------
  // Broker Quick Tools (Topbar / Direct Access)
  // ---------------------------------------------------------------------------
  function openCommissionCalculator() {
    R.dialog({
      title: 'საკომისიოს კალკულატორი',
      subtitle: 'გარიგების, სააგენტოსა და აგენტის წილის სწრაფი გაანგარიშება',
      wide: true,
      body: `
        <div class="calc-dialog-grid">
          <div class="calc-inputs">
            <label class="field"><span class="field-label">გარიგების ტიპი</span>
              <select id="qc-deal-type">
                <option value="sale" selected>იყიდება (გაყიდვა)</option>
                <option value="rent">ქირავდება (გაქირავება)</option>
              </select>
            </label>
            <div class="calc-fields-row">
              <label class="field" style="flex:2"><span class="field-label">ობიექტის ფასი</span>
                <input type="number" id="qc-price" value="100000" min="0" step="1000" />
              </label>
              <label class="field" style="flex:1"><span class="field-label">ვალუტა</span>
                <select id="qc-currency">
                  <option value="$" selected>$ (აშშ დოლარი)</option>
                  <option value="₾">₾ (ლარი)</option>
                  <option value="€">€ (ევრო)</option>
                </select>
              </label>
            </div>
            <div class="calc-fields-row">
              <label class="field"><span class="field-label" id="qc-comm-label">საკომისიო (%)</span>
                <input type="number" id="qc-comm-pct" value="3" min="0" max="100" step="0.5" />
              </label>
              <label class="field"><span class="field-label">აგენტის წილი (%)</span>
                <input type="number" id="qc-agent-split" value="50" min="0" max="100" step="5" />
              </label>
            </div>
            <label class="field"><span class="field-label">საგადასახადო რეჟიმი</span>
              <select id="qc-tax-mode">
                <option value="1" selected>1% (მცირე ბიზნესი)</option>
                <option value="20">20% (საშემოსავლო გადასახადი)</option>
                <option value="0">0% (გადასახადის გარეშე)</option>
              </select>
            </label>
            <label class="calc-cobroker-toggle">
              <input type="checkbox" id="qc-has-cobroker" />
              <span>თანაბროკერი (Co-Broking 50/50 გაყოფა)</span>
            </label>
          </div>

          <div class="calc-results-card">
            <div>
              <div class="calc-results-title">გაანგარიშების შედეგი</div>
              <div class="calc-rows">
                <div class="calc-row">
                  <span class="muted">მთლიანი საკომისიო:</span>
                  <strong id="qc-out-gross">$3 000</strong>
                </div>
                <div class="calc-row" id="qc-cobroker-row" style="display:none">
                  <span class="muted">პარტნიორი აგენტის წილი (50%):</span>
                  <span id="qc-out-cobroker">$1 500</span>
                </div>
                <div class="calc-row">
                  <span class="muted">სააგენტოს წილი:</span>
                  <span id="qc-out-agency">$1 500</span>
                </div>
                <div class="calc-row">
                  <span class="muted">აგენტის დარიცხული წილი:</span>
                  <span id="qc-out-agent-gross">$1 500</span>
                </div>
                <div class="calc-row calc-tax-row">
                  <span class="muted">გადასახადი:</span>
                  <span id="qc-out-tax">-$15 (1%)</span>
                </div>
              </div>
            </div>

            <div class="calc-net-box">
              <div class="calc-net-label">სუფთა თანხა ხელზე (Net):</div>
              <div id="qc-out-net" class="calc-net-val">$1 485</div>
              <button type="button" class="btn btn-outline btn-sm" id="qc-btn-copy" style="width:100%;margin-top:12px">
                ${icon('copy', 14)} <span>გაანგარიშების კოპირება</span>
              </button>
            </div>
          </div>
        </div>
      `,
      onOpen: (form) => {
        const typeEl = $('#qc-deal-type', form);
        const priceEl = $('#qc-price', form);
        const curEl = $('#qc-currency', form);
        const commEl = $('#qc-comm-pct', form);
        const splitEl = $('#qc-agent-split', form);
        const taxEl = $('#qc-tax-mode', form);
        const cbEl = $('#qc-has-cobroker', form);

        const outGross = $('#qc-out-gross', form);
        const outCb = $('#qc-out-cobroker', form);
        const cbRow = $('#qc-cobroker-row', form);
        const outAgency = $('#qc-out-agency', form);
        const outAgentGross = $('#qc-out-agent-gross', form);
        const outTax = $('#qc-out-tax', form);
        const outNet = $('#qc-out-net', form);
        const copyBtn = $('#qc-btn-copy', form);

        const fmt = (num, c) => `${c} ${Math.round(num).toLocaleString('en-US').replace(/,/g, ' ')}`;

        const calc = () => {
          const cur = curEl.value;
          const price = Math.max(0, Number(priceEl.value) || 0);
          const commPct = Math.max(0, Number(commEl.value) || 0);
          const splitPct = Math.max(0, Math.min(100, Number(splitEl.value) || 50));
          const taxPct = Number(taxEl.value) || 0;
          const hasCb = cbEl.checked;

          const gross = (price * commPct) / 100;
          const agencyPool = hasCb ? gross / 2 : gross;
          const cbAmount = hasCb ? gross / 2 : 0;
          const agentGross = (agencyPool * splitPct) / 100;
          const agencyAmount = agencyPool - agentGross;
          const taxAmount = (agentGross * taxPct) / 100;
          const net = agentGross - taxAmount;

          cbRow.style.display = hasCb ? 'flex' : 'none';
          outGross.textContent = fmt(gross, cur);
          outCb.textContent = fmt(cbAmount, cur);
          outAgency.textContent = fmt(agencyAmount, cur);
          outAgentGross.textContent = fmt(agentGross, cur);
          outTax.textContent = taxAmount > 0 ? `-${fmt(taxAmount, cur)} (${taxPct}%)` : `0 (${taxPct}%)`;
          outNet.textContent = fmt(net, cur);
        };

        typeEl.addEventListener('change', () => {
          if (typeEl.value === 'rent') {
            if (Number(priceEl.value) > 10000) priceEl.value = '1500';
            commEl.value = '100';
            $('#qc-comm-label', form).textContent = 'საკომისიო (% 1 თვის)';
          } else {
            if (Number(priceEl.value) < 10000) priceEl.value = '100000';
            commEl.value = '3';
            $('#qc-comm-label', form).textContent = 'საკომისიო (%)';
          }
          calc();
        });

        [priceEl, curEl, commEl, splitEl, taxEl].forEach(el => el.addEventListener('input', calc));
        cbEl.addEventListener('change', calc);

        copyBtn.addEventListener('click', () => {
          const isSale = typeEl.value === 'sale';
          const cur = curEl.value;
          const price = Math.max(0, Number(priceEl.value) || 0);
          const commPct = Number(commEl.value) || 0;
          const splitPct = Number(splitEl.value) || 50;
          const taxPct = Number(taxEl.value) || 0;
          const text = [
            'რიგზეა: საკომისიოს გაანგარიშება',
            `გარიგება: ${isSale ? 'გაყიდვა' : 'გაქირავება'}`,
            `ობიექტის ფასი: ${fmt(price, cur)}`,
            `საკომისიო (${commPct}%): ${outGross.textContent}`,
            cbEl.checked ? `თანაბროკერი (50%): ${outCb.textContent}` : null,
            `სააგენტოს წილი: ${outAgency.textContent}`,
            `აგენტის დარიცხვა (${splitPct}%): ${outAgentGross.textContent}`,
            taxPct > 0 ? `გადასახადი (${taxPct}%): ${outTax.textContent}` : null,
            `ხელზე სუფთა (Net): ${outNet.textContent}`
          ].filter(Boolean).join('\n');
          R.copyText(text, 'გაანგარიშება დაკოპირდა.');
        });

        calc();
      }
    });
  }

  function openMatchmaker() {
    if (!S.data) return;
    const apts = (S.data.apartments || []).filter(a => a.status !== 'archived');
    R.dialog({
      title: 'კლიენტის სელექცია (Matchmaker)',
      subtitle: 'მოთხოვნის მიხედვით ბინების სწრაფი შერჩევა ბაზიდან',
      wide: true,
      body: `
        <div class="matchmaker-wrap">
          <div class="form-grid" style="margin-bottom:14px">
            <label class="field"><span class="field-label">გარიგების ტიპი</span>
              <select id="mm-type">
                <option value="">ყველა ტიპი</option>
                <option value="sale">იყიდება</option>
                <option value="rent">ქირავდება</option>
              </select>
            </label>
            <label class="field"><span class="field-label">მაქსიმალური ბიუჯეტი</span>
              <input type="number" id="mm-budget" placeholder="მაგ. 120000 ან 1500" min="0" step="500" />
            </label>
            <label class="field"><span class="field-label">ოთახები</span>
              <select id="mm-rooms">
                <option value="">ნებისმიერი</option>
                <option value="1">1 ოთახიანი</option>
                <option value="2">2 ოთახიანი</option>
                <option value="3">3 ოთახიანი</option>
                <option value="4">4+ ოთახიანი</option>
              </select>
            </label>
            <label class="field"><span class="field-label">უბანი ან ქუჩა</span>
              <input type="text" id="mm-search" placeholder="ვაკე, საბურთალო, ჭავჭავაძე…" />
            </label>
          </div>
          <div class="matchmaker-header" style="display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid var(--line)">
            <strong id="mm-count" style="font-size:13px;color:var(--ink-2)">შერჩეულია 0 ობიექტი</strong>
          </div>
          <div id="mm-results" class="rows" style="max-height:360px;overflow-y:auto;margin-top:10px"></div>
        </div>
      `,
      onOpen: (form, dlg) => {
        const typeEl = $('#mm-type', form);
        const budgetEl = $('#mm-budget', form);
        const roomsEl = $('#mm-rooms', form);
        const searchEl = $('#mm-search', form);
        const countEl = $('#mm-count', form);
        const resultsEl = $('#mm-results', form);

        const draw = () => {
          const type = typeEl.value;
          const maxBudget = Number(budgetEl.value) || 0;
          const rooms = roomsEl.value;
          const q = searchEl.value.trim().toLowerCase();

          const matches = apts.filter(a => {
            if (type && a.transaction_type !== type) return false;
            const price = Number(a.transaction_type === 'sale' ? a.sale_price : a.monthly_rent) || 0;
            if (maxBudget > 0 && price > maxBudget) return false;
            if (rooms) {
              const r = Number(a.rooms) || 0;
              if (rooms === '4' ? r < 4 : r !== Number(rooms)) return false;
            }
            if (q) {
              const text = [a.name, a.address, a.district, a.city].filter(Boolean).join(' ').toLowerCase();
              if (!text.includes(q)) return false;
            }
            return true;
          });

          countEl.textContent = `ნაპოვნია ${matches.length} შესაფერისი ობიექტი`;

          if (!matches.length) {
            resultsEl.innerHTML = '<p class="empty-inline" style="padding:20px;text-align:center">მითითებული პარამეტრებით ბინა ვერ მოიძებნა.</p>';
            return;
          }

          resultsEl.innerHTML = matches.map(a => {
            const isSale = a.transaction_type === 'sale';
            const price = Number(isSale ? a.sale_price : a.monthly_rent) || 0;
            const cur = a.currency || '$';
            const priceStr = price ? `${cur} ${price.toLocaleString('en-US')}${isSale ? '' : ' / თვე'}` : 'ფასი შეთანხმებით';
            const loc = [a.district, a.address].filter(Boolean).join(', ') || a.city || 'თბილისი';
            const roomsStr = a.rooms ? `${a.rooms} ოთახი` : '';
            const areaStr = a.area_sqm ? `${a.area_sqm} მ²` : '';
            const meta = [loc, roomsStr, areaStr].filter(Boolean).join(' · ');

            return `
              <div class="row mm-item-row" style="--cols:1fr auto;gap:12px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)">
                <div class="cell-main">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span class="badge ${isSale ? 'badge-ok' : 'badge-info'}" style="font-size:11px">${isSale ? 'იყიდება' : 'ქირავდება'}</span>
                    <strong>${esc(a.name)}</strong>
                  </div>
                  <div style="font-size:12.5px;color:var(--muted);margin-top:2px">${esc(meta)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <strong style="color:var(--brand);font-size:14px;white-space:nowrap">${esc(priceStr)}</strong>
                  <a href="#/apartments/${a.id}" class="btn btn-ghost btn-sm mm-link-btn" title="ბინის გვერდი">${icon('external', 14)}</a>
                </div>
              </div>
            `;
          }).join('');

          $$('.mm-link-btn', resultsEl).forEach(btn => {
            btn.addEventListener('click', () => dlg.close());
          });
        };

        [typeEl, budgetEl, roomsEl, searchEl].forEach(el => el.addEventListener('input', draw));
        draw();
      }
    });
  }

  function openSocialPostGenerator() {
    if (!S.data) return;
    const apts = (S.data.apartments || []).filter(a => a.status !== 'archived');
    if (!apts.length) {
      toast('ჯერ დაამატე ბინა, რათა მისთვის პოსტის ტექსტი დაგენერირდეს.', { type: 'warn' });
      return;
    }
    R.dialog({
      title: 'სოციალური პოსტის გენერატორი',
      subtitle: 'Facebook და Instagram პოსტის ტექსტი და ჰეშთეგები',
      wide: true,
      body: `
        <div class="post-gen-wrap">
          <label class="field" style="margin-bottom:14px"><span class="field-label">აირჩიე ობიექტი</span>
            <select id="pg-apt-select">
              ${apts.map(a => `<option value="${a.id}">${esc(a.name)}${a.district ? ' (' + esc(a.district) + ')' : ''}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span class="field-label">მზა პოსტის ტექსტი (შეგიძლია ჩაასწორო)</span>
            <textarea id="pg-output" rows="10" class="input" style="font-family:inherit;line-height:1.6;padding:12px"></textarea>
          </label>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
            <button type="button" class="btn btn-primary" id="pg-btn-copy">${icon('copy', 16)} <span>ტექსტის კოპირება</span></button>
          </div>
        </div>
      `,
      onOpen: (form) => {
        const select = $('#pg-apt-select', form);
        const output = $('#pg-output', form);
        const copyBtn = $('#pg-btn-copy', form);

        const generate = () => {
          const apt = H.apt(select.value);
          if (!apt) return;
          const isSale = apt.transaction_type === 'sale';
          const price = Number(isSale ? apt.sale_price : apt.monthly_rent) || 0;
          const cur = apt.currency || '$';
          const priceStr = price ? `${cur} ${price.toLocaleString('en-US')}${isSale ? '' : ' თვეში'}` : 'ფასი შეთანხმებით';
          const agentName = S.member?.display_name || S.org?.name || 'აგენტი';
          const phone = S.member?.phone || S.org?.contact_phone || '';

          const lines = [
            `${isSale ? 'იყიდება' : 'ქირავდება'} ${apt.rooms ? apt.rooms + '-ოთახიანი ' : ''}ბინა ${apt.district ? apt.district + '-ში' : ''}:`,
            '',
            `მისამართი: ${[apt.city, apt.district, apt.address].filter(Boolean).join(', ')}`,
            apt.area_sqm ? `ფართობი: ${apt.area_sqm} მ²` : null,
            apt.floor ? `სართული: ${apt.floor}${apt.total_floors ? '/' + apt.total_floors : ''}` : null,
            apt.rooms ? `ოთახების რაოდენობა: ${apt.rooms}` : null,
            apt.bedrooms ? `საძინებელი: ${apt.bedrooms}` : null,
            `ფასი: ${priceStr}`,
            '',
            apt.description ? `დამატებითი დეტალები:\n${apt.description.trim()}\n` : null,
            'დაგვიკავშირდით დეტალებისთვის:',
            phone ? `ტელ: ${phone}` : null,
            agentName ? `საკონტაქტო პირი: ${agentName}` : null,
            '',
            '#უძრავიქონება #თბილისი #ბინა #იყიდება #ქირავდება #realestate #tbilisi #rigzea'
          ].filter(x => x !== null);

          output.value = lines.join('\n');
        };

        select.addEventListener('change', generate);
        copyBtn.addEventListener('click', () => {
          R.copyText(output.value, 'პოსტის ტექსტი დაკოპირდა.');
        });
        generate();
      }
    });
  }

  window.App = { S, H, views, aptSection, contactSection, isManager, isAdmin, isAgent, refresh, render, renderShell, go, route, toUrl, taskHref, closeTaskOverlay, upsertLocal, logEvent, loadMore,
    openCommissionCalculator, openMatchmaker, openSocialPostGenerator,
    openDocChooser: (...args) => ensureChunk('/app/views-docs.js', 'დოკუმენტები').then(() => window.App.openDocChooser?.(...args)),
    openPresentation: (...args) => ensureViewLoaded('apartments').then(() => window.App.openPresentation?.(...args)),
    PLANS, PLAN_ORDER, FEATURE_LABEL, CONTACT, planState, can, guardLimit, guardFeature, openUpgrade, planCardsHtml, waLink, activeApartments, pausedApartmentIds, seatsUsed, openKisaCheckoutModal, startKisaCheckout: openKisaCheckoutModal };

  document.addEventListener('DOMContentLoaded', () => {
    if (legacyRedirect()) return;
    rewriteLinks(document.body);
    hydrateIcons();
    boot();
  });
})();
