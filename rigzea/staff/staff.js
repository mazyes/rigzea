// Staff "My jobs": only tasks assigned to the signed-in member, with the
// apartment access details needed for them. All writes go through staff_* RPCs.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L } = R;
  const S = { user: null, members: [], tasks: [], apts: new Map(), orgNames: new Map(), error: null, loaded: false };
  const view = $('#staff-view');
  const OPEN = ['assigned', 'in_progress', 'blocked'];

  $$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon, 20); });

  async function load() {
    S.error = null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { location.replace('/app/'); return; }
      S.user = session.user;
      await sb.rpc('accept_my_invitations').then(() => {}, () => {});
      S.members = await q(sb.from('organization_members').select('*').eq('user_id', S.user.id));
      const memberIds = S.members.map(m => m.id);
      if (!memberIds.length) { S.tasks = []; S.loaded = true; return; }
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const tasks = await q(sb.from('tasks').select('*').in('assigned_to', memberIds).order('due_date', { ascending: true }));
      S.tasks = tasks.filter(t => OPEN.includes(t.status) || (t.status === 'done' && t.completed_at && new Date(t.completed_at) >= since));
      const aptIds = [...new Set(S.tasks.map(t => t.apartment_id).filter(Boolean))];
      const apts = aptIds.length ? await q(sb.from('apartments').select('*').in('id', aptIds)) : [];
      S.apts = new Map(apts.map(a => [a.id, a]));
      const orgs = await q(sb.from('organizations').select('id,name').in('id', S.members.map(m => m.organization_id)));
      S.orgNames = new Map(orgs.map(o => [o.id, o.name]));
      S.loaded = true;
    } catch (err) {
      console.error(err);
      S.error = err;
    }
  }

  const aptName = (t) => S.apts.get(t.apartment_id)?.name || 'ბინა';
  const when = (t) => t.scheduled_start && t.due_date ? `${R.dayLabel(t.scheduled_start)}, ${R.time(t.scheduled_start)}–${R.time(t.due_date)}` : t.due_date ? `${R.dateTime(t.due_date)}-მდე` : 'ვადა არ არის';
  const isOverdue = (t) => OPEN.includes(t.status) && t.due_date && new Date(t.due_date) < new Date();

  function render() {
    const id = location.hash.replace(/^#\/?/, '').split('/')[1];
    $('#btn-back').hidden = !id;
    $('#action-bar').innerHTML = '';
    if (S.error) {
      view.innerHTML = `<div class="error-state"><p>სამუშაოები ვერ ჩაიტვირთა. ${esc(R.friendlyError(S.error))}</p><button type="button" class="btn btn-primary btn-lg" id="retry">${icon('refresh', 16)} ხელახლა ცდა</button></div>`;
      $('#retry').onclick = refresh;
      return;
    }
    if (!S.loaded) { view.innerHTML = '<div class="skeleton"><i></i><i></i><i></i></div>'; return; }
    if (id) return renderJob(id);
    renderList();
  }

  function renderList() {
    $('#staff-title').textContent = 'ჩემი სამუშაოები';
    const manager = S.members.some(m => m.role !== 'staff');
    const open = S.tasks.filter(t => OPEN.includes(t.status));
    const todayIso = R.isoDate();
    const dayOf = (t) => R.isoDate(new Date(t.scheduled_start || t.due_date || Date.now()));
    const groups = [
      ['ვადაგადაცილებული', open.filter(isOverdue)],
      ['დღეს', open.filter(t => !isOverdue(t) && dayOf(t) <= todayIso)],
      ['მომავალი', open.filter(t => !isOverdue(t) && dayOf(t) > todayIso)],
      ['დღეს დასრულებული', S.tasks.filter(t => t.status === 'done')],
    ];
    view.innerHTML = `${manager ? `<p class="notice" style="margin-top:12px">${icon('building', 16)}<span>მენეჯერის ხედი: <a href="/app/">სამუშაო სივრცე</a></span></p>` : ''}
      ${open.length || S.tasks.length ? groups.filter(([, l]) => l.length).map(([title, list]) => `<h2 class="group-title">${title} · ${list.length}</h2>${list.map(t => `
        <a class="job" href="#/job/${t.id}">
          <div class="job-head"><span class="job-time ${isOverdue(t) ? 't-danger' : ''}">${esc(when(t))}</span>${R.taskBadge(t.status)}</div>
          <div class="job-apt">${esc(aptName(t))}</div>
          <div class="job-meta">${esc(L.taskType[t.type] || '')} · ${esc(t.title)}${(t.checklist || []).length ? ` · ჩეკლისტი ${(t.checklist || []).filter(i => i.done).length}/${t.checklist.length}` : ''}</div>
          ${S.members.length > 1 ? `<div class="job-meta">${esc(S.orgNames.get(t.organization_id) || '')}</div>` : ''}
        </a>`).join('')}`).join('')
      : `<div class="empty" style="margin-top:24px">${icon('check', 28)}<h3>დანიშნული სამუშაო არ გაქვს</h3><p>როცა მენეჯერი საქმეს დაგინიშნავს, აქ გამოჩნდება მისამართთან, დაშვებასა და ჩეკლისტთან ერთად.</p></div>`}`;
  }

  function renderJob(id) {
    const t = S.tasks.find(x => x.id === id);
    if (!t) { view.innerHTML = `<div class="empty"><h3>სამუშაო ვერ მოიძებნა</h3><p>შესაძლოა სხვაზე გადაინიშნა ან გაუქმდა.</p><a class="btn btn-secondary" href="#">ჩემი სამუშაოები</a></div>`; return; }
    const a = S.apts.get(t.apartment_id) || {};
    const checklist = t.checklist || [];
    const photos = t.photos || [];
    const before = photos.filter(p => p.phase === 'before').length;
    const after = photos.filter(p => p.phase === 'after').length;
    $('#staff-title').textContent = a.name || 'სამუშაო';
    const address = [a.address, a.unit_number && 'ბინა ' + a.unit_number, a.city].filter(Boolean).join(', ');
    view.innerHTML = `
      <section style="padding:14px 2px">
        <div class="job-head"><span class="job-time ${isOverdue(t) ? 't-danger' : ''}">${esc(when(t))}</span>${R.taskBadge(t.status)}</div>
        <h2 style="font-size:18px;margin-top:4px">${esc(t.title)}</h2>
        <p class="job-meta">${esc(L.taskType[t.type] || '')}${t.priority === 'urgent' ? ' · <strong class="t-danger">სასწრაფო</strong>' : ''}</p>
        ${t.status === 'blocked' ? `<p class="notice notice-danger" style="margin-top:8px">${icon('alert', 16)}<span>შეჩერებულია: ${esc(t.blocked_reason || '')}</span></p>` : ''}
      </section>
      <section class="card" style="margin-bottom:12px"><div class="card-head"><h2>${icon('mapPin', 16)} მისამართი</h2>${address ? `<a class="btn btn-secondary btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}">რუკა</a>` : ''}</div>
        <div class="card-body"><p style="font-size:15px">${esc(address || 'მისამართი არ არის მითითებული')}</p></div></section>
      <section class="card access" style="margin-bottom:12px"><div class="card-head"><h2>${icon('key', 16)} დაშვება</h2></div><div class="card-body">
        ${a.door_code || a.wifi_name || a.parking_info || a.access_instructions ? `<dl class="kv">
          ${a.door_code ? `<dt>კარის კოდი</dt><dd class="secret strong">${esc(a.door_code)}</dd>` : ''}
          ${a.wifi_name ? `<dt>Wi-Fi</dt><dd>${esc(a.wifi_name)}${a.wifi_password ? ` · <span class="secret">${esc(a.wifi_password)}</span>` : ''}</dd>` : ''}
          ${a.parking_info ? `<dt>პარკინგი</dt><dd>${esc(a.parking_info)}</dd>` : ''}
          ${a.access_instructions ? `<dt>ინსტრუქცია</dt><dd style="white-space:pre-wrap">${esc(a.access_instructions)}</dd>` : ''}</dl>` : '<p class="muted">დაშვების ინსტრუქცია არ არის მითითებული. საჭიროების შემთხვევაში დაუკავშირდი მენეჯერს.</p>'}
      </div></section>
      ${t.description ? `<section class="card" style="margin-bottom:12px"><div class="card-head"><h2>დავალება</h2></div><div class="card-body"><p style="white-space:pre-wrap">${esc(t.description)}</p></div></section>` : ''}
      <section class="card" style="margin-bottom:12px"><div class="card-head"><h2>ჩეკლისტი</h2><span class="count">${checklist.filter(i => i.done).length}/${checklist.length}</span></div><div class="card-body" style="padding-top:4px;padding-bottom:4px">
        ${checklist.length ? `<ul class="checklist">${checklist.map((i, n) => `<li><label><input type="checkbox" data-check="${n}" ${i.done ? 'checked' : ''} ${t.status === 'done' ? 'disabled' : ''}/><span>${esc(i.label)}</span></label></li>`).join('')}</ul>` : '<p class="muted" style="padding:8px 0">ჩეკლისტი არ არის.</p>'}
      </div></section>
      <section class="card" style="margin-bottom:12px"><div class="card-head"><h2>${icon('camera', 16)} ფოტოები</h2><span class="small muted">მანამდე ${before} · შემდეგ ${after}</span></div><div class="card-body form-stack">
        ${t.status !== 'done' ? `<div class="upload-row">
          <label class="btn btn-secondary">${icon('camera', 16)} მანამდე<input type="file" accept="image/*" capture="environment" data-phase="before" hidden /></label>
          <label class="btn btn-secondary">${icon('camera', 16)} შემდეგ<input type="file" accept="image/*" capture="environment" data-phase="after" hidden /></label></div>` : ''}
        ${photos.length ? `<div class="photos">${photos.map(p => `<a class="photo" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="" loading="lazy" /><span>${{ before: 'მანამდე', after: 'შემდეგ', problem: 'პრობლემა' }[p.phase] || ''}</span></a>`).join('')}</div>` : `<p class="muted small">${t.type === 'cleaning' ? 'დასრულებისთვის საჭიროა მინიმუმ ერთი „შემდეგ“ ფოტო.' : 'ფოტო არ არის ატვირთული.'}</p>`}
      </div></section>
      <section class="card" style="margin-bottom:12px"><div class="card-head"><h2>შენიშვნა</h2></div><div class="card-body">
        <form id="notes" class="form-stack" style="gap:8px"><textarea class="input" name="notes" rows="3" aria-label="შენიშვნა" placeholder="მაგ.: პირსახოცი აკლდა, ნათურა გამოსაცვლელია">${esc(t.notes || '')}</textarea><button type="submit" class="btn btn-secondary">შენიშვნის შენახვა</button></form>
      </div></section>
      ${t.status !== 'done' ? `<button type="button" class="btn btn-danger-outline btn-block btn-lg" id="problem" style="margin-bottom:12px">${icon('alert', 16)} პრობლემის შეტყობინება</button>` : ''}`;

    const bar = $('#action-bar');
    if (t.status === 'assigned') bar.innerHTML = `<div class="action-bar"><button type="button" class="btn btn-primary" data-move="in_progress">სამუშაოს დაწყება</button></div>`;
    else if (t.status === 'in_progress') bar.innerHTML = `<div class="action-bar"><button type="button" class="btn btn-secondary" data-move="blocked">შეჩერება</button><button type="button" class="btn btn-primary" data-move="done">დასრულება</button></div>`;
    else if (t.status === 'blocked') bar.innerHTML = `<div class="action-bar"><button type="button" class="btn btn-primary" data-move="in_progress">გაგრძელება</button></div>`;

    $$('[data-check]').forEach(cb => cb.addEventListener('change', () => {
      const next = checklist.map((i, n) => n === Number(cb.dataset.check) ? { ...i, done: cb.checked } : i);
      cb.disabled = true;
      run(null, () => save(t, { p_checklist: next })).then(r => { if (!r) { cb.checked = !cb.checked; cb.disabled = false; } });
    }));
    $$('input[data-phase]').forEach(inp => inp.addEventListener('change', () => {
      const file = inp.files[0];
      if (!file) return;
      const label = inp.closest('label');
      run(label, async () => {
        const url = await R.uploadFile(t.organization_id, `tasks/${t.id}`, file);
        const row = await q(sb.rpc('staff_add_task_photo', { p_task: t.id, p_url: url, p_phase: inp.dataset.phase }));
        replace(row);
        render();
      }, { success: 'ფოტო აიტვირთა' });
    }));
    $('#notes').onsubmit = (e) => { e.preventDefault(); run(e.target.querySelector('button'), () => save(t, { p_notes: e.target.notes.value }), { success: 'შენიშვნა შენახულია' }); };
    $('#problem')?.addEventListener('click', () => reportProblem(t));
    $$('[data-move]', bar).forEach(b => b.addEventListener('click', async () => {
      const status = b.dataset.move;
      const args = { p_status: status };
      if (status === 'blocked') {
        const reason = await R.ask({ title: 'სამუშაოს შეჩერება', label: 'რატომ ვერ აგრძელებ?', placeholder: 'მაგ.: სტუმარი ჯერ არ გასულა', submitLabel: 'შეჩერება' });
        if (!reason) return;
        args.p_blocked_reason = reason;
      }
      if (status === 'done') {
        const missing = checklist.filter(i => !i.done).length;
        if (missing) { toast(`დასასრულებლად მონიშნე ჩეკლისტის ყველა პუნქტი (დარჩა ${missing}).`, { type: 'error' }); return; }
        if (t.type === 'cleaning' && !after) { toast('დასასრულებლად ატვირთე მინიმუმ ერთი „შემდეგ“ ფოტო.', { type: 'error' }); return; }
      }
      run(b, async () => {
        await save(t, args);
        if (status === 'done') location.hash = '';
      }, { success: { in_progress: 'სამუშაო დაიწყო', done: 'სამუშაო დასრულდა — მადლობა!', blocked: 'სამუშაო შეჩერდა, მენეჯერი შეტყობინებას მიიღებს' }[status] });
    }));
  }

  function replace(row) { const i = S.tasks.findIndex(x => x.id === row.id); if (i >= 0) S.tasks[i] = row; }
  async function save(t, args) {
    const row = await q(sb.rpc('staff_update_task', { p_task: t.id, ...args }));
    replace(row);
    render();
    return row;
  }

  function reportProblem(t) {
    return R.dialog({
      title: 'პრობლემის შეტყობინება', subtitle: aptName(t), submitLabel: 'გაგზავნა',
      body: `<div class="form-stack">
        <label class="field"><span class="field-label">რა მოხდა?</span><input name="title" required maxlength="120" placeholder="მაგ.: ონკანი ჟონავს" data-error="მოკლედ აღწერე პრობლემა." /></label>
        <label class="field"><span class="field-label">დეტალები</span><textarea name="description" rows="3"></textarea></label>
        <label class="field"><span class="field-label">ფოტო</span><input type="file" name="photo" accept="image/*" capture="environment" /></label>
        <label class="check"><input type="checkbox" name="urgent" /><span>სასწრაფოა — სტუმარი ვერ იცხოვრებს ან ზიანი იზრდება</span></label></div>`,
      onSubmit: async (form, v) => {
        if (!form.dataset.url && form.photo.files[0]) form.dataset.url = await R.uploadFile(t.organization_id, `tasks/${t.id}`, form.photo.files[0]);
        await q(sb.rpc('staff_report_problem', { p_task: t.id, p_title: v.title.trim(), p_description: v.description.trim() || null, p_photo_url: form.dataset.url || null, p_urgent: Boolean(v.urgent) }));
        toast('პრობლემა გაეგზავნა მენეჯერს', { type: 'success' });
      },
    });
  }

  async function refresh() {
    S.loaded = false;
    render();
    await load();
    render();
  }

  $('#btn-back').onclick = () => { location.hash = ''; };
  $('#btn-refresh').onclick = (e) => run(e.currentTarget, refresh);
  $('#btn-menu').onclick = () => R.dialog({
    title: S.members[0]?.display_name || S.user?.email || 'ანგარიში',
    subtitle: S.user?.email,
    body: `<div class="menu-list" style="padding:0">${S.members.some(m => m.role !== 'staff') ? `<a href="/app/">${icon('building')} მენეჯერის ხედი</a>` : ''}<button type="button" id="signout">${icon('logout')} გამოსვლა</button></div>`,
    onOpen: (form) => { $('#signout', form).onclick = async () => { await sb.auth.signOut(); location.href = '/app/'; }; },
  });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });
  refresh();
})();
