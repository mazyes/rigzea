// Apartments, apartment detail, reservations, owners and approvals.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money } = R;
  const { S, H } = App;

  // ===========================================================================
  // APARTMENTS LIST
  // ===========================================================================
  const af = { q: '', status: 'current', city: '' };

  function nextReservation(aptId) {
    const today = R.isoDate();
    return S.data.reservations.filter(r => r.status !== 'cancelled' && r.apartment_id === aptId && r.check_out >= today).sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
  }

  App.views.apartments = (r) => {
    if (r.id) return renderApartment(r.id);
    const apts = S.data.apartments;
    const cities = [...new Set(apts.map(a => a.city).filter(Boolean))];
    const s = af.q.trim().toLowerCase();
    const base = apts.filter(a => (!af.city || a.city === af.city) && (!s || [a.name, a.unit_number, a.address, a.city, H.owner(a.owner_id)?.name].some(v => String(v || '').toLowerCase().includes(s))));
    const inStatus = (a, st) => st === 'current' ? a.status !== 'archived' : a.status === st;
    const list = base.filter(a => inStatus(a, af.status));
    const STATUS = [['current', 'ყველა მიმდინარე'], ['active', 'აქტიური'], ['maintenance', 'რემონტზე'], ['vacant', 'არააქტიური'], ['archived', 'დაარქივებული']];
    const cols = 'minmax(0,2fr) minmax(0,1.3fr) 110px 140px 150px 110px 150px';

    $('#view').innerHTML = `
      <div class="page-head"><div><h1>ბინები</h1><p class="page-sub">${apts.filter(a => a.status !== 'archived').length} ბინა მართვაში</p></div>
        <div class="page-actions"><a class="btn btn-secondary" href="#/settings/import">${icon('upload', 16)} იმპორტი</a><button type="button" class="btn btn-primary" id="btn-apt-new">${icon('plus', 16)} ბინის დამატება</button></div></div>
      <div class="chips" role="group" aria-label="სტატუსი">${STATUS.map(([id, label]) => `<button type="button" class="chip" data-st="${id}" aria-pressed="${af.status === id}">${label} <span class="count">${base.filter(a => inStatus(a, id)).length}</span></button>`).join('')}</div>
      <div class="toolbar">
        <div class="search-input grow">${icon('search', 16)}<input class="input" type="search" id="af-q" value="${esc(af.q)}" placeholder="სახელი, ნომერი, მისამართი, მფლობელი, ქალაქი" aria-label="ბინის ძებნა" /></div>
        ${cities.length > 1 ? `<select class="input" id="af-city" aria-label="ქალაქი"><option value="">ყველა ქალაქი</option>${cities.map(c => `<option ${af.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      </div>
      <section class="card">${list.length ? `<div class="rows">
        <div class="rows-head" style="--cols:${cols}"><span>ბინა</span><span>მფლობელი</span><span>აქტიური საქმე</span><span>შემდეგი ჯავშანი</span><span>ყურადღება</span><span>სტატუსი</span><span></span></div>
        ${list.map(a => {
          const open = S.data.tasks.filter(t => t.apartment_id === a.id && H.isOpen(t));
          const overdue = open.filter(H.isOverdue).length;
          const pend = S.data.approvals.filter(x => x.apartment_id === a.id && R.approvalStatus(x) === 'pending').length;
          const next = nextReservation(a.id);
          const flags = [overdue && `<span class="t-danger">${overdue} ვადაგადაც.</span>`, pend && `<span class="t-warn">${pend} თანხმობა</span>`].filter(Boolean).join(' · ');
          return `<a class="row" href="#/apartments/${a.id}" style="--cols:${cols}">
            <span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc([a.address, a.city].filter(Boolean).join(', '))}</span></span>
            <span class="cell-meta" data-label="მფლობელი">${esc(H.owner(a.owner_id)?.name || '—')}</span>
            <span class="cell-meta" data-label="საქმე">${open.length}</span>
            <span class="cell-meta" data-label="ჯავშანი">${next ? (next.check_in <= R.isoDate() ? `გასვლა ${esc(R.dayLabel(next.check_out))}` : `შესვლა ${esc(R.dayLabel(next.check_in))}`) : '—'}</span>
            <span class="cell-meta">${flags}</span>
            <span class="cell-status">${R.badge(L.aptStatus[a.status] || a.status, L.aptStatusTone[a.status])}</span>
            <span class="cell-actions"><button type="button" class="btn btn-ghost btn-sm" data-new-task="${a.id}">+ საქმე</button><button type="button" class="btn btn-ghost btn-sm" data-new-exp="${a.id}">+ ხარჯი</button></span>
          </a>`;
        }).join('')}</div>` : `<div class="empty">${icon('building', 28)}<h3>${apts.length ? 'ბინა ვერ მოიძებნა' : 'ბინა ჯერ არ არის დამატებული'}</h3>
          <p>${apts.length ? 'შეცვალე ძებნა ან სტატუსის ფილტრი.' : 'დაამატე ბინა სახელით და მისამართით, მაგ.: „Orbi City · 1204“. ბევრი ბინა გაქვს? გამოიყენე Excel/CSV იმპორტი.'}</p>
          ${apts.length ? '' : '<button class="btn btn-primary" type="button" id="btn-apt-empty">ბინის დამატება</button>'}</div>`}</section>`;

    let timer;
    $('#af-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { af.q = e.target.value; App.render(); const i = $('#af-q'); i.focus(); i.setSelectionRange(af.q.length, af.q.length); }, 200); });
    $('#af-city')?.addEventListener('change', (e) => { af.city = e.target.value; App.render(); });
    $$('[data-st]').forEach(b => b.addEventListener('click', () => { af.status = b.dataset.st; App.render(); }));
    $('#btn-apt-new').onclick = () => openApartmentForm();
    $('#btn-apt-empty')?.addEventListener('click', () => openApartmentForm());
    $$('[data-new-task]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); App.openTaskForm({ apartmentId: b.dataset.newTask }); }));
    $$('[data-new-exp]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); App.openExpenseForm({ apartmentId: b.dataset.newExp }); }));
  };

  // ===========================================================================
  // APARTMENT DETAIL
  // ===========================================================================
  const aptPeriod = {};
  const PERIODS = [['month', 'მიმდინარე თვე'], ['last', 'წინა თვე'], ['3m', 'ბოლო 3 თვე'], ['year', 'მიმდინარე წელი']];
  function periodRange(p) {
    const n = new Date();
    if (p === 'last') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)];
    if (p === '3m') return [new Date(n.getFullYear(), n.getMonth() - 2, 1), n];
    if (p === 'year') return [new Date(n.getFullYear(), 0, 1), n];
    return [new Date(n.getFullYear(), n.getMonth(), 1), n];
  }

  function renderApartment(id) {
    const a = H.apt(id);
    if (!a) {
      $('#view').innerHTML = `<div class="card"><div class="empty">${icon('building', 28)}<h3>ბინა ვერ მოიძებნა</h3><p>შესაძლოა წაშლილია ან სხვა სამუშაო სივრცეს ეკუთვნის.</p><a class="btn btn-secondary" href="#/apartments">ბინების სია</a></div></div>`;
      return;
    }
    const owner = H.owner(a.owner_id);
    const tasks = S.data.tasks.filter(t => t.apartment_id === id);
    const open = tasks.filter(H.isOpen);
    const approvals = S.data.approvals.filter(x => x.apartment_id === id);
    const today = R.isoDate();
    const res = S.data.reservations.filter(r => r.apartment_id === id && r.status !== 'cancelled');
    const upcoming = res.filter(r => r.check_out >= today).sort((x, y) => x.check_in.localeCompare(y.check_in));
    const current = upcoming.find(r => r.check_in <= today);
    const nextIn = upcoming.find(r => r.check_in >= today && r !== current);
    const nextTask = open.filter(t => H.taskTime(t)).sort((x, y) => String(H.taskTime(x)).localeCompare(String(H.taskTime(y))))[0];
    const period = aptPeriod[id] || 'month';
    const [from, to] = periodRange(period);
    const fromIso = R.isoDate(from), toIso = R.isoDate(to);
    const inP = (d) => d && d >= fromIso && d <= toIso;
    const inc = S.data.income.filter(i => i.apartment_id === id && inP(i.income_date));
    const exp = S.data.expenses.filter(e => e.apartment_id === id && inP(e.expense_date));
    const sum = (l) => l.reduce((s, x) => s + Number(x.amount), 0);
    const counted = exp.filter(e => ['incurred', 'paid'].includes(e.status));
    const pendingExp = exp.filter(e => ['proposed', 'approved'].includes(e.status));
    const events = S.data.events.filter(e => e.apartment_id === id);
    const photos = tasks.flatMap(t => (t.photos || []).map(p => ({ ...p, task: t })));
    const archived = a.status === 'archived';

    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="crumbs"><a href="#/apartments">ბინები</a> ›</div>
          <h1>${esc(a.name)}</h1><p class="page-sub">${esc([a.address, a.unit_number && 'ბინა ' + a.unit_number, a.city].filter(Boolean).join(', '))} · ${R.badge(L.aptStatus[a.status] || a.status, L.aptStatusTone[a.status])}</p></div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" id="a-task">${icon('plus', 16)} საქმე</button>
          <button type="button" class="btn btn-secondary" id="a-exp">+ ხარჯი</button>
          <button type="button" class="btn btn-secondary" id="a-res">+ ჯავშანი</button>
          <button type="button" class="btn btn-ghost" id="a-edit">რედაქტირება</button>
        </div>
      </div>
      ${archived ? `<div class="notice notice-warn" style="margin-bottom:16px">${icon('alert', 16)}<div>ბინა დაარქივებულია და აქტიურ სიებში არ ჩანს. <button class="link-btn" id="a-restore">აღდგენა</button></div></div>` : ''}
      <div class="cols">
        <div class="stack">
          <section class="card"><div class="stats">
            <div class="stat"><span class="stat-label">ახლა</span><span class="stat-value" style="font-size:15px">${current ? esc(current.guest_name) : 'თავისუფალია'}</span><span class="stat-note">${current ? `გასვლა ${esc(R.dayLabel(current.check_out))}, ${esc(String(current.check_out_time || '').slice(0, 5))}` : ''}</span></div>
            <div class="stat"><span class="stat-label">შემდეგი შესვლა</span><span class="stat-value" style="font-size:15px">${nextIn ? esc(R.dayLabel(nextIn.check_in)) + ', ' + esc(String(nextIn.check_in_time || '').slice(0, 5)) : '—'}</span><span class="stat-note">${nextIn ? esc(nextIn.guest_name) : ''}</span></div>
            <div class="stat"><span class="stat-label">შემდეგი საქმე</span><span class="stat-value" style="font-size:15px">${nextTask ? esc(R.dateTime(H.taskTime(nextTask))) : '—'}</span><span class="stat-note">${nextTask ? esc(nextTask.title) : ''}</span></div>
          </div></section>

          <section class="card"><div class="card-head"><h2>აქტიური საქმეები <span class="count">${open.length}</span></h2><a class="link-btn small" href="#/tasks" id="a-all-tasks">ყველა საქმე (${tasks.length})</a></div>
            ${open.length ? App.taskRows(open, false) : App.emptyInline('აქტიური საქმე არ არის.')}</section>

          <section class="card"><div class="card-head"><h2>ფინანსები</h2>
              <select class="input" id="a-period" aria-label="პერიოდი" style="width:auto;min-height:32px">${PERIODS.map(([v, l]) => `<option value="${v}" ${period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="stats">
              <div class="stat"><span class="stat-label">შემოსავალი</span><span class="stat-value">${money(sum(inc))}</span></div>
              <div class="stat"><span class="stat-label">გაწეული ხარჯი</span><span class="stat-value">${money(sum(counted))}</span></div>
              <div class="stat"><span class="stat-label">მოლოდინში</span><span class="stat-value">${money(sum(pendingExp))}</span><span class="stat-note">შეთავაზებული/დადასტურებული</span></div>
            </div>
            ${inc.length || exp.length ? `<div class="rows">${[...inc.map(i => ({ d: i.income_date, html: `<span class="cell-main"><strong>${esc(i.description || i.source || 'შემოსავალი')}</strong><span>${esc(R.date(i.income_date))} · ${esc(i.source || '')}</span></span><span class="cell-right num t-ok">+${money(i.amount)}</span>` })),
              ...exp.map(e => ({ d: e.expense_date, html: `<span class="cell-main"><strong>${esc(e.description || L.expenseCategory[e.category])}</strong><span>${esc(R.date(e.expense_date))} · ${esc(L.expenseCategory[e.category] || e.category)}${e.receipt_url ? ` · <a href="${esc(e.receipt_url)}" target="_blank" rel="noopener">ქვითარი</a>` : ['incurred', 'paid'].includes(e.status) && e.receipt_required !== false ? ' · <span class="t-warn">ქვითარი აკლია</span>' : ''}</span></span><span class="cell-right" style="display:flex;gap:8px;align-items:center">${R.expenseBadge(e.status)}<span class="num">−${money(e.amount)}</span></span>` }))]
              .sort((x, y) => String(y.d).localeCompare(String(x.d))).map(x => `<div class="row" style="--cols:minmax(0,1fr) auto">${x.html}</div>`).join('')}</div>` : App.emptyInline('ამ პერიოდში ჩანაწერი არ არის.')}
          </section>

          ${photos.length ? `<section class="card"><div class="card-head"><h2>ფოტოები</h2></div><div class="card-body"><div class="photos">${photos.slice(-12).reverse().map(p => `<a class="photo" href="${R.esc(App.taskHref(p.task.id))}" title="${esc(p.task.title)}"><img src="${esc(p.url)}" alt="${esc(p.task.title)}" loading="lazy" /><span>${esc({ before: 'მანამდე', after: 'შემდეგ', problem: 'პრობლემა' }[p.phase] || '')}</span></a>`).join('')}</div></div></section>` : ''}

          <section class="card"><div class="card-head"><h2>ისტორია</h2></div>${App.activityList(events.slice(0, 15))}</section>
        </div>

        <div class="stack">
          <section class="card"><div class="card-head"><h2>მფლობელი</h2>${owner ? `<a class="link-btn small" href="#/owners/${owner.id}">პროფილი</a>` : ''}</div>
            <div class="card-body">${owner ? `<dl class="kv"><dt>სახელი</dt><dd>${esc(owner.name)}</dd>
              <dt>ტელეფონი</dt><dd>${owner.phone ? `<a href="tel:${esc(owner.phone)}">${esc(owner.phone)}</a>` : '—'}</dd>
              <dt>ელფოსტა</dt><dd>${owner.email ? `<a href="mailto:${esc(owner.email)}">${esc(owner.email)}</a>` : '—'}</dd>
              <dt>საკომისიო</dt><dd>${Number(a.commission_pct || 0)}%</dd></dl>`
              : '<p class="muted">მფლობელი არ არის მითითებული. თანხმობებისა და ამონაწერებისთვის მიუთითე მფლობელი.</p><button class="btn btn-secondary btn-sm" style="margin-top:8px" id="a-set-owner">მფლობელის მითითება</button>'}</div></section>

          <section class="card"><div class="card-head"><h2>თანხმობები</h2>${owner ? '<button type="button" class="btn btn-ghost btn-sm" id="a-approval">+ მოთხოვნა</button>' : ''}</div>
            ${approvals.length ? `<div class="rows">${approvals.slice(0, 6).map(x => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(x.title || x.description || 'ხარჯი')} · ${money(x.amount)}</strong><span>${esc(R.date(x.created_at))}${R.approvalStatus(x) === 'pending' ? ` · ${esc(R.elapsed(x.created_at))} ელოდება` : ''}</span></span>${R.approvalBadge(x)}</div>`).join('')}</div>` : App.emptyInline('თანხმობის მოთხოვნა ჯერ არ ყოფილა.')}</section>

          <section class="card"><div class="card-head"><h2>ჯავშნები</h2><button type="button" class="btn btn-ghost btn-sm" id="a-res2">+ ჯავშანი</button></div>
            ${upcoming.length ? `<div class="rows">${upcoming.slice(0, 8).map(rv => {
              const outTs = H.resTs(rv.check_out, rv.check_out_time);
              const hasClean = S.data.tasks.some(t => t.type === 'cleaning' && t.status !== 'cancelled' && (t.reservation_id === rv.id ||
                (t.apartment_id === rv.apartment_id && !t.reservation_id && Math.abs(new Date(H.taskTime(t) || 0) - outTs) < 24 * 3600e3)));
              const conflict = res.some(o => o.id !== rv.id && o.check_in < rv.check_out && rv.check_in < o.check_out);
              return `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(rv.guest_name)} · ${esc(L.source[rv.source] || rv.source)}</strong>
                <span>${esc(R.date(rv.check_in))} → ${esc(R.date(rv.check_out))}${Number(rv.expected_income) ? ' · ' + money(rv.expected_income) : ''}</span>
                ${conflict ? '<span class="t-danger small">კონფლიქტი: თარიღები სხვა ჯავშანს ემთხვევა</span>' : ''}</span>
                <span>${hasClean ? R.badge('დასუფთავება დაგეგმილია', 'ok') : `<button type="button" class="btn btn-secondary btn-sm" data-clean="${rv.id}">დასუფთავების დაგეგმვა</button>`}</span></div>`;
            }).join('')}</div>` : App.emptyInline('მომავალი ჯავშანი არ არის. დაამატე ჯავშანი — სისტემა შემოგთავაზებს დასუფთავებას გასვლის შემდეგ.')}</section>

          <section class="card"><div class="card-head"><h2>${icon('key', 16)} დაშვება</h2>${hasAccess(a) ? '<button type="button" class="btn btn-ghost btn-sm" id="a-reveal" aria-expanded="false">ჩვენება</button>' : ''}</div>
            <div class="card-body">${hasAccess(a) ? `<div id="a-access" hidden><dl class="kv">
                ${a.door_code ? `<dt>კარის კოდი</dt><dd class="secret">${esc(a.door_code)}</dd>` : ''}
                ${a.wifi_name ? `<dt>Wi-Fi</dt><dd>${esc(a.wifi_name)}</dd>` : ''}
                ${a.wifi_password ? `<dt>Wi-Fi პაროლი</dt><dd class="secret">${esc(a.wifi_password)}</dd>` : ''}
                ${a.parking_info ? `<dt>პარკინგი</dt><dd>${esc(a.parking_info)}</dd>` : ''}
                ${a.access_instructions ? `<dt>ინსტრუქცია</dt><dd style="white-space:pre-wrap">${esc(a.access_instructions)}</dd>` : ''}</dl></div>
                <p class="muted small" id="a-access-note">დაშვების მონაცემები დამალულია. ჩანს მენეჯერებისთვის და იმ თანამშრომლისთვის, ვისაც ამ ბინაში აქტიური საქმე აქვს.</p>`
              : '<p class="muted small">კარის კოდი, Wi-Fi და ინსტრუქცია არ არის შევსებული. დაამატე „რედაქტირებიდან“ — დამლაგებელი მათ საქმესთან ერთად ნახავს.</p>'}</div></section>
          ${!archived && App.isAdmin() ? `<button type="button" class="btn btn-danger-outline" id="a-archive">ბინის დაარქივება</button>` : ''}
        </div>
      </div>`;

    $('#a-task').onclick = () => App.openTaskForm({ apartmentId: id });
    $('#a-exp').onclick = () => App.openExpenseForm({ apartmentId: id });
    $('#a-res').onclick = $('#a-res2').onclick = () => openReservationForm({ apartmentId: id });
    $('#a-edit').onclick = () => openApartmentForm(a);
    $('#a-set-owner')?.addEventListener('click', () => openApartmentForm(a));
    $('#a-approval')?.addEventListener('click', () => App.openApprovalForm({ apartmentId: id }));
    $('#a-period').onchange = (e) => { aptPeriod[id] = e.target.value; App.render(); };
    $('#a-all-tasks').onclick = (e) => { e.preventDefault(); App.setTaskFilter({ apt: id, status: 'all' }); App.go('#/tasks'); };
    $('#a-reveal')?.addEventListener('click', (e) => {
      const box = $('#a-access'); box.hidden = !box.hidden;
      e.target.textContent = box.hidden ? 'ჩვენება' : 'დამალვა';
      e.target.setAttribute('aria-expanded', String(!box.hidden));
      $('#a-access-note').hidden = !box.hidden;
    });
    $$('[data-clean]').forEach(b => b.addEventListener('click', () => App.planCleaningAfter(S.data.reservations.find(x => x.id === b.dataset.clean))));
    $('#a-archive')?.addEventListener('click', async (e) => {
      const ok = await R.confirm({ title: 'ბინის დაარქივება', message: `${a.name} გაქრება აქტიური სიებიდან. ისტორია და ფინანსები შენარჩუნდება და ბინის აღდგენა ნებისმიერ დროს შეიძლება.`, confirmLabel: 'დაარქივება', danger: true });
      if (ok) setAptStatus(a, 'archived', e.target);
    });
    $('#a-restore')?.addEventListener('click', (e) => setAptStatus(a, 'active', e.target));
    App.bindNextActions($('#view'));
  }

  const hasAccess = (a) => a.door_code || a.wifi_name || a.wifi_password || a.parking_info || a.access_instructions;

  function setAptStatus(a, status, btn) {
    return run(btn, async () => {
      const row = await q(sb.from('apartments').update({ status, is_archived: status === 'archived' }).eq('id', a.id).select().single());
      App.upsertLocal('apartments', row);
      App.logEvent(a.id, status === 'archived' ? 'apartment_archived' : 'apartment_restored', status === 'archived' ? 'ბინა დაარქივდა' : 'ბინა აღდგა');
      App.render();
      toast(status === 'archived' ? 'ბინა დაარქივდა' : 'ბინა აღდგა', { type: 'success', action: status === 'archived' ? { label: 'დაბრუნება', fn: () => setAptStatus(row, 'active') } : null });
    });
  }

  // ===========================================================================
  // APARTMENT FORM
  // ===========================================================================
  function openApartmentForm(a = null) {
    const edit = Boolean(a);
    const v = a || { status: 'active', city: S.org.city || 'ბათუმი', commission_pct: 20, checkin_time: '14:00', checkout_time: '12:00' };
    const id = a?.id || R.uuid();
    return R.dialog({
      title: edit ? 'ბინის რედაქტირება' : 'ახალი ბინა', wide: true, submitLabel: edit ? 'შენახვა' : 'ბინის დამატება',
      body: `<div class="form-grid">
        <label class="field"><span class="field-label">სახელი</span><input name="name" required maxlength="120" value="${esc(v.name || '')}" placeholder="მაგ.: Orbi City · 1204" data-error="ჩაწერე ბინის სახელი." /></label>
        <label class="field"><span class="field-label">ბინის ნომერი</span><input name="unit_number" value="${esc(v.unit_number || '')}" placeholder="1204" /></label>
        <label class="field"><span class="field-label">მისამართი</span><input name="address" required value="${esc(v.address || '')}" placeholder="ქუჩა და ნომერი" data-error="ჩაწერე მისამართი." /></label>
        <label class="field"><span class="field-label">ქალაქი</span><input name="city" value="${esc(v.city || '')}" list="city-list" /><datalist id="city-list"><option>თბილისი</option><option>ბათუმი</option><option>ქუთაისი</option><option>გუდაური</option><option>ბაკურიანი</option></datalist></label>
        <label class="field"><span class="field-label">მფლობელი</span><select name="owner_id"><option value="">არ არის მითითებული</option>${S.data.owners.map(o => `<option value="${o.id}" ${o.id === v.owner_id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">სტატუსი</span><select name="status">${['active', 'maintenance', 'vacant'].map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${L.aptStatus[s]}</option>`).join('')}${edit && v.status === 'archived' ? '<option value="archived" selected>დაარქივებული</option>' : ''}</select></label>
        <label class="field"><span class="field-label">მართვის საკომისიო (%)</span><input type="number" name="commission_pct" min="0" max="100" step="0.5" value="${esc(v.commission_pct ?? 20)}" /><span class="field-hint">გამოიყენება მფლობელის ამონაწერში.</span></label>
        <div class="form-grid" style="gap:8px"><label class="field"><span class="field-label">Check-in</span><input type="time" name="checkin_time" value="${esc(String(v.checkin_time || '14:00').slice(0, 5))}" /></label><label class="field"><span class="field-label">Check-out</span><input type="time" name="checkout_time" value="${esc(String(v.checkout_time || '12:00').slice(0, 5))}" /></label></div>
        <div class="form-section span-2"><div class="form-section-title">დაშვება <span class="muted small">— ჩანს მხოლოდ მენეჯერებისთვის და იმ თანამშრომლისთვის, ვისაც ამ ბინაში აქტიური საქმე აქვს</span></div>
          <div class="form-grid">
            <label class="field"><span class="field-label">კარის კოდი</span><input name="door_code" value="${esc(v.door_code || '')}" autocomplete="off" /></label>
            <label class="field"><span class="field-label">პარკინგი</span><input name="parking_info" value="${esc(v.parking_info || '')}" /></label>
            <label class="field"><span class="field-label">Wi-Fi ქსელი</span><input name="wifi_name" value="${esc(v.wifi_name || '')}" autocomplete="off" /></label>
            <label class="field"><span class="field-label">Wi-Fi პაროლი</span><input name="wifi_password" value="${esc(v.wifi_password || '')}" autocomplete="off" /></label>
            <label class="field span-2"><span class="field-label">ინსტრუქცია დამლაგებლისა და ტექნიკოსისთვის</span><textarea name="access_instructions" rows="2" placeholder="მაგ.: გასაღები რეცეფციაზე, სახელით">${esc(v.access_instructions || '')}</textarea></label>
          </div></div>
        <label class="field span-2"><span class="field-label">შიდა შენიშვნა</span><textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
      </div>`,
      onSubmit: async (_f, f) => {
        const payload = {
          name: f.name.trim(), unit_number: f.unit_number.trim() || null, address: f.address.trim(), city: f.city.trim() || null,
          owner_id: f.owner_id || null, status: f.status, is_archived: f.status === 'archived', commission_pct: Number(f.commission_pct || 0),
          checkin_time: f.checkin_time || null, checkout_time: f.checkout_time || null,
          door_code: f.door_code.trim() || null, parking_info: f.parking_info.trim() || null, wifi_name: f.wifi_name.trim() || null,
          wifi_password: f.wifi_password.trim() || null, access_instructions: f.access_instructions.trim() || null, notes: f.notes.trim() || null,
        };
        const row = edit
          ? await q(sb.from('apartments').update(payload).eq('id', a.id).select().single())
          : await App.insertOnce('apartments', { id, organization_id: S.org.id, ...payload });
        App.upsertLocal('apartments', row);
        App.logEvent(row.id, edit ? 'apartment_updated' : 'apartment_created', edit ? 'ბინის მონაცემები განახლდა' : 'ბინა დაემატა', row.name);
        toast(edit ? 'ბინა განახლდა' : `ბინა დაემატა: ${row.name}`, { type: 'success' });
        if (edit) App.render(); else App.go(`#/apartments/${row.id}`);
      },
    });
  }
  App.openApartmentForm = openApartmentForm;

  // ===========================================================================
  // RESERVATION FORM
  // ===========================================================================
  function openReservationForm({ apartmentId }) {
    const a = H.apt(apartmentId);
    const id = R.uuid();
    return R.dialog({
      title: 'ახალი ჯავშანი', subtitle: a.name, submitLabel: 'ჯავშნის დამატება',
      body: `<div class="form-grid">
        <label class="field"><span class="field-label">სტუმარი</span><input name="guest_name" required data-error="ჩაწერე სტუმრის სახელი." /></label>
        <label class="field"><span class="field-label">წყარო</span><select name="source">${Object.entries(L.source).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">შესვლა</span><div style="display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:6px"><input class="input" type="date" name="check_in" required data-error="მიუთითე შესვლის თარიღი." /><input class="input" type="time" name="check_in_time" value="${esc(String(a.checkin_time || '14:00').slice(0, 5))}" aria-label="შესვლის დრო" /></div></label>
        <label class="field"><span class="field-label">გასვლა</span><div style="display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:6px"><input class="input" type="date" name="check_out" required data-error="მიუთითე გასვლის თარიღი." /><input class="input" type="time" name="check_out_time" value="${esc(String(a.checkout_time || '12:00').slice(0, 5))}" aria-label="გასვლის დრო" /></div></label>
        <label class="field"><span class="field-label">მოსალოდნელი შემოსავალი (₾)</span><input type="number" name="expected_income" min="0" step="0.01" inputmode="decimal" /><span class="field-hint">შემოსავლად ჩაიწერება მხოლოდ მაშინ, როცა „ფინანსებში“ აღრიცხავ.</span></label>
        <label class="field"><span class="field-label">სტუმრის ტელეფონი</span><input name="guest_phone" type="tel" /></label>
        <label class="field span-2"><span class="field-label">შენიშვნა</span><textarea name="notes" rows="2"></textarea></label>
        <p class="span-2" data-conflict hidden></p>
      </div>`,
      onOpen: (form) => {
        const check = () => {
          const box = $('[data-conflict]', form);
          const ci = form.check_in.value, co = form.check_out.value;
          const hit = ci && co && S.data.reservations.find(r => r.apartment_id === apartmentId && r.status !== 'cancelled' && r.check_in < co && ci < r.check_out);
          box.hidden = !hit;
          if (hit) { box.className = 'span-2 notice notice-warn'; box.textContent = `კონფლიქტი: ${hit.guest_name} (${R.date(hit.check_in)} → ${R.date(hit.check_out)}). შეამოწმე თარიღები.`; }
        };
        form.check_in.addEventListener('change', () => { if (!form.check_out.value) { const d = R.toDate(form.check_in.value); d.setDate(d.getDate() + 1); form.check_out.value = R.isoDate(d); } check(); });
        form.check_out.addEventListener('change', check);
      },
      onSubmit: async (form, v) => {
        if (v.check_out <= v.check_in) throw new Error('გასვლა შესვლაზე გვიან უნდა იყოს.');
        const conflict = S.data.reservations.find(r => r.apartment_id === apartmentId && r.status !== 'cancelled' && r.check_in < v.check_out && v.check_in < r.check_out);
        if (conflict && form.dataset.conflictOk !== '1') { form.dataset.conflictOk = '1'; throw new Error('თარიღები სხვა ჯავშანს ემთხვევა. თუ მაინც გინდა შენახვა, დააჭირე ღილაკს ხელახლა.'); }
        const row = await App.insertOnce('reservations', {
          id, organization_id: S.org.id, apartment_id: apartmentId, guest_name: v.guest_name.trim(), source: v.source,
          check_in: v.check_in, check_out: v.check_out, check_in_time: v.check_in_time || null, check_out_time: v.check_out_time || null,
          expected_income: Number(v.expected_income || 0), guest_phone: v.guest_phone.trim() || null, notes: v.notes.trim() || null, created_by: S.user.id,
        }).catch(err => { throw /row-level security|permission/i.test(err.message) ? new Error('ჯავშნების შენახვა ჯერ არ არის ჩართული ბაზაში (საჭიროა operations RLS მიგრაცია).') : err; });
        S.data.reservations.push(row);
        App.logEvent(apartmentId, 'reservation_created', `ჯავშანი: ${row.guest_name}`, `${R.date(row.check_in)} → ${R.date(row.check_out)}`);
        App.render();
        toast('ჯავშანი დაემატა', { type: 'success', action: { label: 'დასუფთავების დაგეგმვა', fn: () => App.planCleaningAfter(row) } });
      },
    });
  }

  // ===========================================================================
  // OWNERS & APPROVALS
  // ===========================================================================
  let ownersTab = null;
  let apprFilter = 'pending';

  App.views.owners = (r) => {
    if (r.id) return renderOwner(r.id);
    const pending = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending');
    const tab = ownersTab || (pending.length ? 'approvals' : 'owners');
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>მფლობელები</h1><p class="page-sub">${S.data.owners.length} მფლობელი · ${pending.length} თანხმობა ელოდება პასუხს</p></div>
        <div class="page-actions"><button type="button" class="btn btn-secondary" id="o-appr">თანხმობის მოთხოვნა</button><button type="button" class="btn btn-primary" id="o-new">${icon('plus', 16)} მფლობელის დამატება</button></div></div>
      <div class="tabs" role="tablist"><button type="button" role="tab" class="tab" data-tab="approvals" aria-selected="${tab === 'approvals'}">თანხმობები <span class="count">${pending.length}</span></button><button type="button" role="tab" class="tab" data-tab="owners" aria-selected="${tab === 'owners'}">მფლობელები <span class="count">${S.data.owners.length}</span></button></div>
      <div id="o-body"></div>`;
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { ownersTab = b.dataset.tab; App.render(); }));
    $('#o-new').onclick = () => openOwnerForm();
    $('#o-appr').onclick = () => App.openApprovalForm({});
    if (tab === 'approvals') renderApprovals($('#o-body')); else renderOwnersList($('#o-body'));
  };

  function renderApprovals(root) {
    const all = S.data.approvals;
    const F = [['pending', 'ელოდება პასუხს'], ['approved', 'დადასტურებული'], ['declined', 'უარყოფილი'], ['expired', 'ვადაგასული'], ['all', 'ყველა']];
    const list = all.filter(a => apprFilter === 'all' || R.approvalStatus(a) === apprFilter).sort((a, b) => apprFilter === 'pending' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
    const cols = 'minmax(0,1.6fr) minmax(0,1.2fr) 100px 110px 130px 140px 150px';
    root.innerHTML = `<div class="chips">${F.map(([id, l]) => `<button type="button" class="chip" data-af="${id}" aria-pressed="${apprFilter === id}">${l} <span class="count">${all.filter(a => id === 'all' || R.approvalStatus(a) === id).length}</span></button>`).join('')}</div>
      <section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>საკითხი</span><span>ბინა · მფლობელი</span><span>თანხა</span><span>მოთხოვნილია</span><span>ელოდება</span><span>სტატუსი</span><span></span></div>
      ${list.map(a => {
        const st = R.approvalStatus(a);
        const exp = S.data.expenses.find(e => e.approval_id === a.id);
        let action = '';
        if (st === 'pending') action = `<button type="button" class="btn btn-secondary btn-sm" data-share="${a.id}">${navigator.share ? 'გაზიარება' : 'ბმულის კოპირება'}</button>`;
        else if (st === 'approved' && exp && exp.status === 'approved') action = `<a class="btn btn-ghost btn-sm" href="#/finance?status=approved">ხარჯის აღრიცხვა</a>`;
        return `<div class="row ${a.task_id ? 'clickable' : ''}" style="--cols:${cols}" ${a.task_id ? `data-go="${App.taskHref(a.task_id)}"` : ''}>
          <span class="cell-main"><strong>${esc(a.title || a.description || 'ხარჯი')}</strong><span>${esc(a.description && a.title ? a.description : '')}</span></span>
          <span class="cell-meta">${esc(H.aptName(a.apartment_id))} · ${esc(H.owner(a.owner_id)?.name || '—')}</span>
          <span class="cell-meta num strong">${money(a.amount)}</span>
          <span class="cell-meta" data-label="მოთხოვნილია">${esc(R.date(a.created_at))}</span>
          <span class="cell-meta">${st === 'pending' ? `<span class="${Date.now() - new Date(a.created_at) > 24 * 3600e3 ? 't-danger' : 't-warn'}">${esc(R.elapsed(a.created_at))} ელოდება</span>` : a.responded_at ? `პასუხი ${esc(R.date(a.responded_at))}` : ''}</span>
          <span class="cell-status">${R.approvalBadge(a)}${exp && st === 'approved' ? `<div class="small muted">${exp.status === 'approved' ? 'ჯერ არ არის გაწეული' : L.expense[exp.status]}</div>` : ''}</span>
          <span class="cell-actions">${action}${st === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" data-cancel-appr="${a.id}">გაუქმება</button>` : ''}</span>
        </div>`;
      }).join('')}</div>` : `<div class="empty">${icon('owner', 28)}<h3>${apprFilter === 'pending' ? 'პასუხის მომლოდინე მოთხოვნა არ არის' : 'ჩანაწერი არ არის'}</h3><p>თანხმობის მოთხოვნით მფლობელი ტელეფონიდან ერთი ბმულით დაადასტურებს ან უარყოფს ხარჯს — მაგ.: „ონკანის გამოცვლა, ₾180“.</p><button class="btn btn-primary" type="button" id="o-appr-empty">თანხმობის მოთხოვნა</button></div>`}</section>`;
    $$('[data-af]', root).forEach(b => b.addEventListener('click', () => { apprFilter = b.dataset.af; App.render(); }));
    $$('[data-go]', root).forEach(rw => rw.addEventListener('click', (e) => { if (!e.target.closest('button,a')) App.go(rw.dataset.go); }));
    $('#o-appr-empty')?.addEventListener('click', () => App.openApprovalForm({}));
    App.bindApprovalShare(root);
    $$('[data-cancel-appr]', root).forEach(b => b.addEventListener('click', async () => {
      const a = S.data.approvals.find(x => x.id === b.dataset.cancelAppr);
      const ok = await R.confirm({ title: 'მოთხოვნის გაუქმება', message: `„${a.title || a.description}“ (${money(a.amount)}) — მფლობელის ბმული აღარ იმუშავებს.`, confirmLabel: 'გაუქმება', danger: true });
      if (!ok) return;
      run(b, async () => {
        const row = await q(sb.from('approvals').update({ status: 'cancelled' }).eq('id', a.id).select().single());
        App.upsertLocal('approvals', row);
        const exp = S.data.expenses.find(e => e.approval_id === a.id && e.status === 'proposed');
        if (exp) App.upsertLocal('expenses', await q(sb.from('expenses').update({ status: 'declined' }).eq('id', exp.id).select().single()));
        App.logEvent(a.apartment_id, 'approval_cancelled', `თანხმობის მოთხოვნა გაუქმდა: ${a.title || a.description}`);
        App.render();
      }, { success: 'მოთხოვნა გაუქმდა' });
    }));
  }

  function renderOwnersList(root) {
    const list = S.data.owners;
    const cols = 'minmax(0,1.5fr) minmax(0,1.3fr) minmax(0,1.5fr) 120px';
    root.innerHTML = `<section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>მფლობელი</span><span>კონტაქტი</span><span>ბინები</span><span>თანხმობა</span></div>
      ${list.map(o => {
        const apts = S.data.apartments.filter(a => a.owner_id === o.id && a.status !== 'archived');
        const pend = S.data.approvals.filter(a => a.owner_id === o.id && R.approvalStatus(a) === 'pending').length;
        return `<a class="row" href="#/owners/${o.id}" style="--cols:${cols}"><span class="cell-main"><strong>${esc(o.name)}</strong><span>${o.user_id ? 'პორტალთან დაკავშირებული' : ''}</span></span>
          <span class="cell-meta">${esc([o.phone, o.email].filter(Boolean).join(' · ') || '—')}</span>
          <span class="cell-meta" data-label="ბინები">${apts.length ? esc(apts.map(a => a.name).join(', ')) : '—'}</span>
          <span class="cell-status">${pend ? R.badge(`${pend} ელოდება`, 'warn') : ''}</span></a>`;
      }).join('')}</div>` : `<div class="empty">${icon('owner', 28)}<h3>მფლობელი ჯერ არ არის დამატებული</h3><p>მფლობელს უგზავნი ხარჯის თანხმობებს და თვიურ ამონაწერებს. საკმარისია სახელი და ტელეფონი.</p><button class="btn btn-primary" type="button" id="o-new-empty">მფლობელის დამატება</button></div>`}</section>`;
    $('#o-new-empty')?.addEventListener('click', () => openOwnerForm());
  }

  function renderOwner(id) {
    const o = H.owner(id);
    if (!o) { $('#view').innerHTML = `<div class="card"><div class="empty"><h3>მფლობელი ვერ მოიძებნა</h3><a class="btn btn-secondary" href="#/owners">მფლობელების სია</a></div></div>`; return; }
    const apts = S.data.apartments.filter(a => a.owner_id === id);
    const approvals = S.data.approvals.filter(a => a.owner_id === id);
    const statements = S.data.statements.filter(s => apts.some(a => a.id === s.apartment_id));
    $('#view').innerHTML = `
      <div class="page-head"><div><div class="crumbs"><a href="#/owners">მფლობელები</a> ›</div><h1>${esc(o.name)}</h1><p class="page-sub">${apts.length} ბინა</p></div>
        <div class="page-actions"><button type="button" class="btn btn-secondary" id="ow-appr">თანხმობის მოთხოვნა</button><button type="button" class="btn btn-ghost" id="ow-edit">რედაქტირება</button></div></div>
      <div class="cols"><div class="stack">
        <section class="card"><div class="card-head"><h2>ბინები</h2></div>${apts.length ? `<div class="rows">${apts.map(a => `<a class="row" href="#/apartments/${a.id}" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc(a.address || '')}</span></span>${R.badge(L.aptStatus[a.status], L.aptStatusTone[a.status])}</a>`).join('')}</div>` : App.emptyInline('ბინა არ არის მიბმული. მიუთითე მფლობელი ბინის რედაქტირებისას.')}</section>
        <section class="card"><div class="card-head"><h2>თანხმობები</h2></div>${approvals.length ? `<div class="rows">${approvals.map(a => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(a.title || a.description || 'ხარჯი')} · ${money(a.amount)}</strong><span>${esc(H.aptName(a.apartment_id))} · ${esc(R.date(a.created_at))}${a.response_note ? ' · „' + esc(a.response_note) + '“' : ''}</span></span>${R.approvalBadge(a)}</div>`).join('')}</div>` : App.emptyInline('თანხმობის მოთხოვნა ჯერ არ ყოფილა.')}</section>
        <section class="card"><div class="card-head"><h2>ამონაწერები</h2></div>${statements.length ? `<div class="rows">${statements.map(s => `<a class="row" href="#/finance/statement/${s.id}" style="--cols:minmax(0,1fr) auto auto"><span class="cell-main"><strong>${esc(H.aptName(s.apartment_id))} · ${esc(monthLabel(s.month_period))}</strong><span>წმინდა ${money(s.net_result)}</span></span>${R.badge(L.statement[s.status], L.statementTone[s.status])}</a>`).join('')}</div>` : App.emptyInline('ამონაწერი ჯერ არ მომზადებულა. მოამზადე „ფინანსებში“.')}</section>
      </div><div class="stack">
        <section class="card"><div class="card-head"><h2>კონტაქტი</h2></div><div class="card-body"><dl class="kv">
          <dt>ტელეფონი</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : '—'}</dd>
          <dt>ელფოსტა</dt><dd>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '—'}</dd>
          <dt>ანგარიში</dt><dd>${esc(o.payout_account || '—')}</dd>
          ${o.notes ? `<dt>შენიშვნა</dt><dd style="white-space:pre-wrap">${esc(o.notes)}</dd>` : ''}</dl></div></section>
      </div></div>`;
    $('#ow-edit').onclick = () => openOwnerForm(o);
    $('#ow-appr').onclick = () => App.openApprovalForm({ apartmentId: apts[0]?.id });
  }
  const monthLabel = (mk) => { const [y, m] = String(mk).split('-').map(Number); return `${R.MONTHS[m - 1]} ${y}`; };
  App.monthLabel = monthLabel;

  function openOwnerForm(o = null) {
    const edit = Boolean(o);
    const id = o?.id || R.uuid();
    return R.dialog({
      title: edit ? 'მფლობელის რედაქტირება' : 'ახალი მფლობელი', submitLabel: edit ? 'შენახვა' : 'მფლობელის დამატება',
      body: `<div class="form-grid">
        <label class="field span-2"><span class="field-label">სახელი და გვარი</span><input name="name" required value="${esc(o?.name || '')}" data-error="ჩაწერე სახელი." /></label>
        <label class="field"><span class="field-label">ტელეფონი</span><input name="phone" type="tel" value="${esc(o?.phone || '')}" placeholder="+995 5XX XX XX XX" /></label>
        <label class="field"><span class="field-label">ელფოსტა</span><input name="email" type="email" value="${esc(o?.email || '')}" data-error="ელფოსტის ფორმატი არასწორია." /></label>
        <label class="field span-2"><span class="field-label">საბანკო ანგარიში ანაზღაურებისთვის</span><input name="payout_account" value="${esc(o?.payout_account || '')}" placeholder="GE00TB0000000000000000" /></label>
        <label class="field span-2"><span class="field-label">შენიშვნა</span><textarea name="notes" rows="2">${esc(o?.notes || '')}</textarea></label>
      </div>`,
      onSubmit: async (_f, v) => {
        const payload = { name: v.name.trim(), phone: v.phone.trim() || null, email: v.email.trim() || null, payout_account: v.payout_account.trim() || null, notes: v.notes.trim() || null };
        const row = edit ? await q(sb.from('owners').update(payload).eq('id', o.id).select().single()) : await App.insertOnce('owners', { id, organization_id: S.org.id, ...payload });
        App.upsertLocal('owners', row);
        App.render();
        toast(edit ? 'მფლობელი განახლდა' : `მფლობელი დაემატა: ${row.name}`, { type: 'success' });
      },
    });
  }
  App.openOwnerForm = openOwnerForm;

  // ===========================================================================
  // APPROVAL REQUEST
  // ===========================================================================
  // Creates the approval and its "proposed" expense. Both use stable ids so a retry never duplicates.
  App.createApproval = async ({ id, expenseId, apt, task = null, title, description, amount, category, photoUrl }) => {
    const appr = await App.insertOnce('approvals', {
      id, organization_id: S.org.id, apartment_id: apt.id, owner_id: apt.owner_id, task_id: task?.id || null,
      title, description: [title, description].filter(Boolean).join('\n'), amount, photos: photoUrl ? [photoUrl] : [],
    });
    App.upsertLocal('approvals', appr);
    const exp = await App.insertOnce('expenses', {
      id: expenseId, organization_id: S.org.id, apartment_id: apt.id, task_id: task?.id || null, approval_id: appr.id,
      category, amount, description: title, expense_date: R.isoDate(), status: 'proposed', created_by: S.user.id,
    });
    App.upsertLocal('expenses', exp);
    App.logEvent(apt.id, 'approval_requested', `თანხმობის მოთხოვნა: ${title}`, money(amount), { task_id: task?.id, approval_id: appr.id });
    if (task && task.status !== 'blocked' && ['assigned', 'in_progress'].includes(task.status)) {
      const t = await q(sb.from('tasks').update({ status: 'blocked', blocked_reason: 'მფლობელის თანხმობას ველოდებით' }).eq('id', task.id).select().single()).catch(() => null);
      if (t) App.upsertLocal('tasks', t);
    }
    toast(`თანხმობის მოთხოვნა შეიქმნა · ${money(amount)}`, { type: 'success', action: { label: navigator.share ? 'გაზიარება' : 'ბმულის კოპირება', fn: () => App.shareApproval(appr) } });
    return appr;
  };

  App.openApprovalForm = ({ apartmentId = null, task = null }) => {
    const ids = { approval: R.uuid(), expense: R.uuid() };
    return R.dialog({
      title: 'მფლობელის თანხმობის მოთხოვნა', submitLabel: 'მოთხოვნის შექმნა',
      subtitle: 'მფლობელი მიიღებს ბმულს და ტელეფონიდან დაადასტურებს ან უარყოფს. ხარჯი დადასტურებამდე „შეთავაზებულად“ დარჩება.',
      body: `<div class="form-stack">
        ${App.pickerHtml('apartment_id', 'ბინა')}
        <p class="field-hint" data-owner></p>
        <label class="field"><span class="field-label">რა საჭიროებს თანხმობას</span><input name="title" required maxlength="140" value="${esc(task?.title || '')}" placeholder="მაგ.: კონდიციონერის კომპრესორის გამოცვლა" data-error="აღწერე საკითხი." /></label>
        <label class="field"><span class="field-label">თანხა (₾)</span><input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" data-error="ჩაწერე თანხა." /></label>
        <label class="field"><span class="field-label">განმარტება მფლობელისთვის</span><textarea name="description" rows="3" placeholder="რა მოხდა, რატომ არის საჭირო, ვინ შეასრულებს">${esc(task?.description || '')}</textarea><span class="field-hint">ეს ტექსტი გამოჩნდება მფლობელის გვერდზე. ნუ ჩაწერ კარის კოდს ან შიდა შენიშვნებს.</span></label>
        <label class="field"><span class="field-label">კატეგორია</span><select name="category">${['repair', 'maintenance', 'supplies', 'cleaning', 'other'].map(c => `<option value="${c}">${L.expenseCategory[c]}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">ფოტო <span class="muted">(არასავალდებულო)</span></span><input type="file" name="photo" accept="image/*" /></label>
      </div>`,
      onOpen: (form) => {
        App.picker(form, 'apartment_id', App.aptItems(), apartmentId);
        const sync = () => {
          const apt = H.apt(form.apartment_id.value);
          const owner = apt && H.owner(apt.owner_id);
          const p = $('[data-owner]', form);
          p.textContent = !apt ? '' : owner ? `მფლობელი: ${owner.name}${owner.phone ? ' · ' + owner.phone : ''}` : 'ამ ბინას მფლობელი არ ჰყავს მითითებული — ჯერ მიუთითე მფლობელი ბინის რედაქტირებით.';
          p.className = 'field-hint' + (apt && !owner ? ' t-danger' : '');
        };
        form.apartment_id.addEventListener('change', sync);
        sync();
      },
      onSubmit: async (form, v) => {
        const apt = H.apt(v.apartment_id);
        if (!apt) throw new Error('აირჩიე ბინა სიიდან.');
        if (!apt.owner_id) throw new Error('ამ ბინას მფლობელი არ ჰყავს მითითებული.');
        if (!form.dataset.photoUrl && form.photo.files[0]) form.dataset.photoUrl = await R.uploadFile(S.org.id, `approvals/${ids.approval}`, form.photo.files[0]);
        await App.createApproval({ id: ids.approval, expenseId: ids.expense, apt, task, title: v.title.trim(), description: v.description.trim(), amount: Number(v.amount), category: v.category, photoUrl: form.dataset.photoUrl || null });
        App.render();
      },
    });
  };
})();
