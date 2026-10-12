// Rigzea manager workspace: session, data loading, routing, shell and shared lookups.
// Views live in views-*.js and register themselves on App.views.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L } = R;

  const S = {
    user: null,
    orgs: [],          // [{ ...organization, member }]
    org: null,
    member: null,
    data: null,        // loaded org data, see loadData()
    loading: false,
    loadError: null,
  };

  const MANAGER_ROLES = ['owner', 'admin', 'manager'];
  const isManager = () => MANAGER_ROLES.includes(S.member?.role);
  const isAdmin = () => ['owner', 'admin'].includes(S.member?.role);

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

  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      S.user = session?.user || null;
      if (!S.user) return showAuth('signin');
      // Joins any organizations this email was invited to (no-op otherwise).
      await sb.rpc('accept_my_invitations').then(() => {}, () => {});
      await loadOrgs();
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
  // Auth forms
  // ---------------------------------------------------------------------------
  function showAuth(view) {
    showScreen('auth');
    ['signin', 'signup', 'reset'].forEach(v => { $('#form-' + v).hidden = v !== view; });
    $('#form-' + view).querySelector('input')?.focus();
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
    return R.friendlyError(err);
  }

  bindForm($('#form-signin'), async (v) => {
    const { error } = await sb.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
    if (error) throw error;
    $('#form-signin').reset();
    await boot();
  });

  bindForm($('#form-signup'), async (v) => {
    const { data, error } = await sb.auth.signUp({ email: v.email.trim(), password: v.password, options: { data: { full_name: v.name.trim() }, emailRedirectTo: location.origin + '/app/' } });
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

  $$('[data-auth]').forEach(b => b.addEventListener('click', () => showAuth(b.dataset.auth)));

  bindForm($('#form-org'), async (v) => {
    const orgId = await q(sb.rpc('create_user_organization', { p_org_name: v.name.trim(), p_city: v.city, p_portfolio_size: v.size }));
    localStorage.setItem('rigzea_selected_org_id', orgId);
    await loadOrgs();
    enterShell();
  });

  async function signOut() {
    await sb.auth.signOut();
    localStorage.removeItem('rigzea_selected_org_id');
    location.href = '/app/';
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-action="signout"]')) signOut(); });

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  async function loadData() {
    const org = S.org.id;
    S.loading = true;
    S.loadError = null;
    const since = new Date(); since.setDate(since.getDate() - 120);
    const sinceIso = R.isoDate(since);
    try {
      const [apartments, owners, tasks, approvals, expenses, income, reservations, events, members, notifications, statements, repairs, deals, linkEvents, shareLinks] = await Promise.all([
        q(sb.from('apartments').select('*').eq('organization_id', org).order('name')),
        q(sb.from('owners').select('*').eq('organization_id', org).order('name')),
        q(sb.from('tasks').select('*').eq('organization_id', org).order('due_date', { ascending: true })),
        q(sb.from('approvals').select('*').eq('organization_id', org).order('created_at', { ascending: false })),
        q(sb.from('expenses').select('*').eq('organization_id', org).order('expense_date', { ascending: false })),
        q(sb.from('income').select('*').eq('organization_id', org).order('income_date', { ascending: false })),
        // Reservations need the operations RLS migration; treat a failure as "no data" rather than breaking the app.
        sb.from('reservations').select('*').eq('organization_id', org).gte('check_out', sinceIso).order('check_in').then(r => r.data || [], () => []),
        q(sb.from('activity_events').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(200)),
        q(sb.from('organization_members').select('*').eq('organization_id', org)),
        q(sb.from('notifications').select('*').eq('organization_id', org).eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(40)),
        q(sb.from('monthly_reports').select('*').eq('organization_id', org).order('month_period', { ascending: false })),
        q(sb.from('repairs').select('*').eq('organization_id', org)).catch(() => []),
        sb.from('deals').select('*').eq('organization_id', org).order('created_at', { ascending: false }).then(r => r.data || [], () => []),
        // Sharing tables arrive with the link-tracking migration; until then they read as empty.
        sb.from('link_events').select('*').eq('organization_id', org).gte('created_at', new Date(Date.now() - 30 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(2000).then(r => r.data || [], () => []),
        sb.from('share_links').select('*').eq('organization_id', org).order('created_at', { ascending: false }).then(r => r.data || [], () => []),
      ]);
      S.data = { apartments, owners, tasks, approvals, expenses, income, reservations, events, members, notifications, statements, repairs, deals: deals || [], linkEvents: linkEvents || [], shareLinks: shareLinks || [] };
      indexData();
    } catch (err) {
      console.error(err);
      S.loadError = err;
    } finally {
      S.loading = false;
    }
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
  // Routing: #/path[?task=id]
  // ---------------------------------------------------------------------------
  const views = {};
  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/today';
    const [path, query] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { parts, name: parts[0] || 'today', id: parts[1] || null, sub: parts[2] || null, params: new URLSearchParams(query || '') };
  }
  const route = () => parseHash();
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  // Keeps the current page and adds/removes ?task=
  function taskHref(id) { const r = parseHash(); return `#/${r.parts.join('/') || 'today'}?task=${id}`; }
  function closeTaskOverlay() { const r = parseHash(); r.params.delete('task'); const qs = r.params.toString(); location.hash = `#/${r.parts.join('/') || 'today'}${qs ? '?' + qs : ''}`; }

  // Legacy links from notifications: /app/?view=finance
  function legacyRedirect() {
    const v = new URLSearchParams(location.search).get('view');
    if (v) { history.replaceState(null, '', '/app/#/' + ({ dashboard: 'today', reports: 'finance' }[v] || v)); }
  }

  const NAV = [
    { id: 'apartments', label: 'ბინები და ბმულები', icon: 'building', group: 'გაყიდვები & გარიგებები' },
    { id: 'deals', label: 'გარიგებები & CRM', icon: 'owner' },
    { id: 'today', label: 'აქტივობა & მთავარი', icon: 'today' },
    // Everything below is day-to-day management, kept out of the way of the sharing flow.
    { id: 'tasks', label: 'საქმეები & დალაგება', icon: 'tasks', group: 'საოპერაციო მართვა' },
    { id: 'owners', label: 'მფლობელები & თანხმობები', icon: 'owner' },
    { id: 'finance', label: 'ფინანსები & ხარჯები', icon: 'wallet' },
    { id: 'team', label: 'გუნდი & წვდომები', icon: 'team' },
    { id: 'settings', label: 'პარამეტრები & Telegram', icon: 'settings' },
  ];
  const MOBILE_NAV = ['apartments', 'deals', 'today', 'finance'];

  function navCounts() {
    if (!S.data) return {};
    const overdue = S.data.tasks.filter(H.isOverdue).length;
    const pending = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending').length;
    const activeDeals = (S.data.deals || []).filter(d => !['closed', 'lost'].includes(d.stage)).length;
    return {
      tasks: overdue ? { n: overdue, danger: true, label: `${overdue} ვადაგადაცილებული` } : null,
      owners: pending ? { n: pending, label: `${pending} პასუხს ელოდება` } : null,
      deals: activeDeals ? { n: activeDeals, label: `${activeDeals} აქტიური გარიგება` } : null
    };
  }

  function renderShell() {
    const r = route();
    const counts = navCounts();
    const countHtml = (c) => c ? `<span class="count ${c.danger ? 'count-danger' : ''}" title="${esc(c.label)}">${c.n}</span>` : '';
    $('#rail').innerHTML = NAV.map(n => `${n.group ? `<div class="nav-group">${n.group}</div>` : ''}<a class="nav-item" href="#/${n.id}" ${r.name === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${countHtml(counts[n.id])}</a>`).join('')
      + `<div class="rail-foot">${S.data ? `${S.data.apartments.filter(a => a.status !== 'archived').length} ბინა · ${S.data.owners.length} მფლობელი · ${S.data.members.length} წევრი` : ''}</div>`;

    const mobile = MOBILE_NAV;
    const moreActive = !mobile.includes(r.name);
    $('#bottom-nav').innerHTML = mobile.map(id => { const n = NAV.find(x => x.id === id); return `<a href="#/${id}" ${r.name === id ? 'aria-current="page"' : ''}>${icon(n.icon, 20)}<span>${n.label}</span>${countHtml(counts[id])}</a>`; }).join('')
      + `<button type="button" id="btn-more" ${moreActive ? 'aria-current="page"' : ''}>${icon('menu', 20)}<span>მეტი</span>${countHtml(counts.owners)}</button>`;
    $('#btn-more').onclick = openMoreSheet;

    // Organization switcher
    const sw = $('#org-switch');
    if (S.orgs.length > 1) {
      sw.innerHTML = `<label class="sr-only" for="org-select">სამუშაო სივრცე</label><select id="org-select">${S.orgs.map(o => `<option value="${o.id}" ${o.id === S.org.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
      $('#org-select').onchange = (e) => switchOrg(e.target.value);
    } else {
      sw.innerHTML = `<span class="org-static" title="სამუშაო სივრცე">${esc(S.org.name)}</span>`;
    }

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
    location.hash = '#/today';
    await refresh();
    toast(`გადაერთე: ${o.name}`);
  }

  function openMoreSheet() {
    const r = route();
    R.dialog({
      title: 'მენიუ',
      body: `<nav class="menu-list" style="padding:0">${NAV.filter(n => !MOBILE_NAV.includes(n.id)).map(n => `<a href="#/${n.id}" data-close ${r.name === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)} ${n.label}</a>`).join('')}
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
    renderShell();
    const view = views[r.name] || views.today;
    try {
      view(r);
    } catch (err) {
      console.error(err);
      $('#view').innerHTML = `<div class="card"><div class="error-state"><p>გვერდის ჩვენება ვერ მოხერხდა: ${esc(err.message)}</p><a class="btn btn-secondary" href="#/today">მთავარზე დაბრუნება</a></div></div>`;
    }
    if (S.loadError) toast('ბოლო განახლება ვერ მოხერხდა. ნაჩვენებია წინა მონაცემები.', { type: 'error', action: { label: 'განახლება', fn: () => refresh({ quiet: true }) } });
    // Task overlay on top of any page
    const taskId = r.params.get('task');
    if (taskId) App.openTaskDrawer(taskId); else App.closeTaskDrawer?.(true);
  }

  window.addEventListener('hashchange', () => {
    const r = route();
    if (r.name !== lastViewName) window.scrollTo(0, 0);
    lastViewName = r.name;
    render();
  });
  let lastViewName = null;

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------
  function notifTarget(link) {
    if (!link) return null;
    const m = /view=([a-z]+)/.exec(link);
    if (m) return '#/' + ({ dashboard: 'today', reports: 'finance' }[m[1]] || m[1]);
    if (link.startsWith('/app/#')) return link.slice(5);
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
        <button type="button" data-action="signout">${icon('logout')} გამოსვლა</button>
      </div>`;
    $('#theme-select').value = theme;
    $('#theme-select').onchange = (e) => { localStorage.setItem('rigzea_theme', e.target.value); R.applyTheme(e.target.value); };
  }

  $('#btn-notif').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('notif'); });
  $('#btn-user').addEventListener('click', (e) => { e.stopPropagation(); togglePopover('user'); });
  document.addEventListener('click', (e) => {
    ['notif', 'user'].forEach(w => { const p = $('#' + w + '-panel'); if (!p.hidden && !p.contains(e.target)) togglePopover(w, false); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ['notif', 'user'].forEach(w => { if (!$('#' + w + '-panel').hidden) { togglePopover(w, false); $('#btn-' + w).focus(); } });
  });

  // ---------------------------------------------------------------------------
  // Global search: KokonutUI / 21st.dev Command Palette (Cmd+K / Ctrl+K / /)
  // ---------------------------------------------------------------------------
  function openSearch() {
    if (!S.data || document.querySelector('dialog[open]')) return;
    R.dialog({
      title: 'ბრძანებების პალიტრა (Command Palette)',
      body: `
        <div class="search-input cmd-search-bar">
          <span>${icon('search', 16)}</span>
          <input class="input" id="search-q" type="search" placeholder="ჩაწერე ბინა, გარიგება, საქმე, მფლობელი ან ბრძანება…" autocomplete="off" aria-label="საძიებო სიტყვა" />
          <kbd class="cmd-shortcut-hint">ESC</kbd>
        </div>
        <div class="cmd-quick-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px">
          <button type="button" class="chip-btn" data-nav="#/tasks" style="font-size:11.5px;padding:3px 10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer">⚡ საქმეები</button>
          <button type="button" class="chip-btn" data-nav="#/apartments" style="font-size:11.5px;padding:3px 10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer">🏢 ბინები</button>
          <button type="button" class="chip-btn" data-nav="#/deals" style="font-size:11.5px;padding:3px 10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer">💼 კლიენტები</button>
          <button type="button" class="chip-btn" data-nav="#/finance" style="font-size:11.5px;padding:3px 10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer">💰 ფინანსები</button>
          <button type="button" class="chip-btn" data-nav="#/owners" style="font-size:11.5px;padding:3px 10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);cursor:pointer">👥 მფლობელები</button>
        </div>
        <div id="search-results" class="rows cmd-results-list"></div>
      `,
      onOpen: (form, dlg) => {
        const input = $('#search-q', form);
        const out = $('#search-results', form);
        $$('.chip-btn', form).forEach(chip => {
          chip.addEventListener('click', () => {
            dlg.close();
            go(chip.dataset.nav);
          });
        });

        const draw = () => {
          const s = input.value.trim().toLowerCase();
          if (s.length < 1) {
            // Show recommended quick suggestions
            const rec = [
              { href: `#/apartments`, icon: 'building', title: 'ყველა ბინის დათვალიერება', sub: `${S.data.apartments.length} აქტიური ობიექტი`, badge: 'ნავიგაცია' },
              { href: `#/deals`, icon: 'wallet', title: 'გარიგებების Pipeline', sub: 'მიმდინარე და დახურული საკომისიოები', badge: 'გაყიდვები' },
              { href: `#/tasks`, icon: 'tasks', title: 'საქმეების სია', sub: `${S.data.tasks.filter(H.isOpen).length} ღია დავალება`, badge: 'ოპერაციები' },
            ];
            out.innerHTML = rec.map(x => `<a class="row cmd-item" style="--cols:24px minmax(0,1fr) auto" href="${x.href}">${icon(x.icon)}<span class="cell-main"><strong>${esc(x.title)}</strong><span>${esc(x.sub)}</span></span><span class="badge" style="font-size:10px">${x.badge}</span></a>`).join('');
            $$('a', out).forEach(a => a.addEventListener('click', () => dlg.close()));
            return;
          }

          const has = (...v) => v.some(x => String(x || '').toLowerCase().includes(s));
          const res = [
            ...S.data.apartments.filter(a => has(a.name, a.unit_number, a.address, a.city, H.owner(a.owner_id)?.name)).slice(0, 6).map(a => ({ href: `#/apartments/${a.id}`, icon: 'building', title: a.name, sub: [a.address, a.city].filter(Boolean).join(', '), tag: 'ბინა' })),
            ...(S.data.deals || []).filter(d => has(d.title, d.contact_name, H.aptName(d.apartment_id))).slice(0, 4).map(d => ({ href: `#/deals`, icon: 'wallet', title: d.title || 'გარიგება', sub: `${H.aptName(d.apartment_id)} · ${d.contact_name || ''}`, tag: 'გარიგება' })),
            ...S.data.tasks.filter(t => has(t.title, t.description, H.aptName(t.apartment_id))).slice(0, 6).map(t => ({ href: taskHref(t.id), icon: 'tasks', title: t.title, sub: `${H.aptName(t.apartment_id)} · ${L.taskStatus[t.status]}`, tag: 'საქმე' })),
            ...S.data.owners.filter(o => has(o.name, o.phone, o.email)).slice(0, 4).map(o => ({ href: `#/owners/${o.id}`, icon: 'owner', title: o.name, sub: o.phone || o.email || '', tag: 'მფლობელი' })),
          ];

          out.innerHTML = res.length ? res.map(x => `<a class="row cmd-item" style="--cols:24px minmax(0,1fr) auto" href="${x.href}">${icon(x.icon)}<span class="cell-main"><strong>${esc(x.title)}</strong><span>${esc(x.sub)}</span></span><span class="badge" style="font-size:10.5px">${x.tag}</span></a>`).join('') : '<p class="empty-inline">ვერაფერი მოიძებნა.</p>';
          $$('a', out).forEach(a => a.addEventListener('click', () => dlg.close()));
        };

        input.addEventListener('input', draw);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = $('a.cmd-item', out);
            if (first) { dlg.close(); first.click(); }
          }
        });
        draw();
      },
    });
  }
  $('#btn-search').addEventListener('click', openSearch);
  document.addEventListener('keydown', (e) => {
    const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
    const isSlash = e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((isCmdK || isSlash) && !$('#shell').hidden) {
      e.preventDefault();
      openSearch();
    }
  });

  $('#btn-new-task').addEventListener('click', () => App.openTaskForm({ apartmentId: route().name === 'apartments' ? route().id : null }));

  // ---------------------------------------------------------------------------
  // Enter workspace
  // ---------------------------------------------------------------------------
  async function enterShell() {
    showScreen('shell');
    hydrateIcons();
    lastViewName = route().name;
    S.data = null;
    renderShell();
    renderLoading();
    await loadData();
    render();
    // Generate overdue alerts for this org (deduplicated server-side); best-effort.
    if (isManager()) sb.rpc('scan_alerts', { p_org: S.org.id }).then(() => {}, () => {});
  }

  window.App = { S, H, views, isManager, isAdmin, refresh, render, renderShell, go, route, taskHref, closeTaskOverlay, upsertLocal, logEvent };

  document.addEventListener('DOMContentLoaded', () => {
    hydrateIcons();
    legacyRedirect();
    boot();
  });


  /* ==========================================================================
     KOKONUT UI: APP PARTICLES & HOLD-TO-CONFIRM
     ========================================================================== */

  function triggerAppParticleBurst(x, y, count = 24) {
    const colors = ['#0a5c44', '#10b981', '#00f59b', '#ffd700', '#34d399'];
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'app-burst-particle';
      const size = Math.random() * 6 + 3;
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.backgroundColor = color;
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.boxShadow = '0 0 ' + size + 'px ' + color;
      document.body.appendChild(p);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 90 + 35;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const duration = Math.random() * 500 + 400;
      const start = performance.now();

      function step(now) {
        const elapsed = now - start;
        const progress = elapsed / duration;
        if (progress >= 1) {
          if (p.parentNode) p.parentNode.removeChild(p);
          return;
        }
        const curX = x + vx * progress;
        const curY = y + vy * progress + (progress * progress * 60);
        p.style.transform = 'translate(' + (curX - x) + 'px, ' + (curY - y) + 'px) scale(' + (1 - progress * 0.6) + ')';
        p.style.opacity = 1 - progress;
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
  }

  // Bind particles to action buttons in app
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-new-task, .btn-primary, [data-action="complete-task"]');
    if (btn) {
      const r = btn.getBoundingClientRect();
      triggerAppParticleBurst(e.clientX || (r.left + r.width / 2), e.clientY || (r.top + r.height / 2), 22);
    }
  });

  // Hold-to-confirm implementation for safe operations
  function initHoldButtons() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn-hold, [data-hold]');
      if (!btn) return;

      const duration = parseInt(btn.dataset.holdDuration || '1000', 10);
      let ring = btn.querySelector('.hold-ring-fill');
      let bar = btn.querySelector('.hold-progress-bar');

      if (!ring && !bar) {
        bar = document.createElement('div');
        bar.className = 'hold-progress-bar';
        btn.appendChild(bar);
      }

      btn.classList.add('is-holding');
      const start = performance.now();
      let animId = null;

      function onHoldProgress(now) {
        const elapsed = now - start;
        const pct = Math.min(100, (elapsed / duration) * 100);
        if (bar) bar.style.width = pct + '%';
        if (ring) ring.style.strokeDashoffset = (56.5 * (1 - pct / 100)) + '';

        if (pct >= 100) {
          btn.classList.remove('is-holding');
          if (bar) bar.style.width = '0%';
          const r = btn.getBoundingClientRect();
          triggerAppParticleBurst(r.left + r.width / 2, r.top + r.height / 2, 32);
          if (typeof navigator.vibrate === 'function') navigator.vibrate([40, 30, 40]);
          btn.dispatchEvent(new CustomEvent('hold-complete', { bubbles: true }));
          return;
        }
        animId = requestAnimationFrame(onHoldProgress);
      }

      animId = requestAnimationFrame(onHoldProgress);

      function cancelHold() {
        btn.classList.remove('is-holding');
        if (animId) cancelAnimationFrame(animId);
        if (bar) bar.style.width = '0%';
        if (ring) ring.style.strokeDashoffset = '56.5';
        window.removeEventListener('pointerup', cancelHold);
        window.removeEventListener('pointercancel', cancelHold);
      }

      window.addEventListener('pointerup', cancelHold, { once: true });
      window.addEventListener('pointercancel', cancelHold, { once: true });
    });
  }

  initHoldButtons();

})();
