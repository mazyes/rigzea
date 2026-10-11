// Today screen, task list, task detail drawer and task form.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money } = R;
  const { S, H } = App;

  // Allowed task transitions (mirrors the tasks_lifecycle trigger in the database).
  const NEXT = {
    new: ['assigned', 'in_progress', 'cancelled'],
    assigned: ['new', 'in_progress', 'blocked', 'cancelled', 'done'],
    in_progress: ['assigned', 'blocked', 'done', 'cancelled'],
    blocked: ['assigned', 'in_progress', 'cancelled', 'new'],
    done: ['in_progress', 'assigned'],
    cancelled: ['new', 'assigned'],
  };
  const canMove = (from, to) => (NEXT[from] || []).includes(to);
  const VERB = { in_progress: 'დაიწყო', done: 'დასრულდა', blocked: 'შეჩერდა', cancelled: 'გაუქმდა', new: 'აღდგა', assigned: 'დაინიშნა' };

  const CHECKLISTS = {
    cleaning: ['თეთრეულისა და პირსახოცების შეცვლა', 'სააბაზანოსა და ტუალეტის დასუფთავება', 'სამზარეულოსა და ჭურჭლის დასუფთავება', 'იატაკის დასუფთავება', 'ნაგვის გატანა', 'სახარჯი მასალის შევსება (საპონი, ქაღალდი, ყავა)', 'დაზიანებების შემოწმება'],
    inspection: ['ავეჯისა და ტექნიკის მდგომარეობა', 'მრიცხველების ჩვენებები', 'გასაღებების რაოდენობა', 'დაზიანებების ფოტოები'],
  };

  // ===========================================================================
  // Shared task actions
  // ===========================================================================
  async function updateTask(task, patch, { event, undo } = {}) {
    const prev = { ...task };
    const row = await q(sb.from('tasks').update(patch).eq('id', task.id).select().single());
    App.upsertLocal('tasks', row);
    if (event) App.logEvent(row.apartment_id, event.type, event.title, event.description || null, { task_id: row.id });
    App.render();
    if (undo) {
      toast(undo, {
        type: 'success',
        action: patch.status && canMove(row.status, prev.status) && prev.status !== 'blocked'
          ? { label: 'დაბრუნება', fn: () => run(null, () => updateTask(row, { status: prev.status }, { event: { type: 'task_status_changed', title: `სტატუსი დაბრუნდა: ${row.title}` } })) }
          : null,
      });
    }
    return row;
  }

  async function changeStatus(task, status, btn) {
    let extra = {};
    if (status === 'blocked') {
      const reason = await R.ask({ title: 'საქმის შეჩერება', label: 'რატომ ჩერდება საქმე?', placeholder: 'მაგ.: ველოდებით ნაწილს ან მფლობელის თანხმობას', submitLabel: 'შეჩერება' });
      if (!reason) return;
      extra.blocked_reason = reason;
    }
    if (status === 'cancelled') {
      const reason = await R.ask({ title: 'საქმის გაუქმება', label: 'გაუქმების მიზეზი', placeholder: 'მაგ.: სტუმარმა ჯავშანი გააუქმა', submitLabel: 'გაუქმება', danger: true });
      if (!reason) return;
      extra.notes = [task.notes, `გაუქმდა: ${reason}`].filter(Boolean).join('\n');
      return run(btn, () => updateTask(task, { status, ...extra }, { event: { type: 'task_cancelled', title: `გაუქმდა: ${task.title}`, description: reason }, undo: 'საქმე გაუქმდა' }));
    }
    if (status === 'done' && (task.checklist || []).some(i => !i.done)) {
      const ok = await R.confirm({ title: 'ჩეკლისტი დაუსრულებელია', message: `${(task.checklist || []).filter(i => !i.done).length} პუნქტი მონიშნული არ არის. მაინც დასრულდეს საქმე?`, confirmLabel: 'მაინც დასრულება' });
      if (!ok) return;
    }
    if (status === 'assigned' && !task.assigned_to) return openAssign(task);
    return run(btn, () => updateTask(task, { status, ...extra }, {
      event: { type: 'task_' + status, title: `${VERB[status]}: ${task.title}`, description: extra.blocked_reason },
      undo: `${L.taskStatus[status]}: ${task.title}`,
    }));
  }

  function openAssign(task) {
    const options = H.staffMembers().map(m => `<option value="${m.id}" ${m.id === task.assigned_to ? 'selected' : ''}>${esc(m.display_name || 'უსახელო')} · ${esc(L.role[m.role])} · ${openCount(m.id)} აქტიური</option>`).join('');
    return R.dialog({
      title: 'საქმის დანიშვნა',
      subtitle: `${task.title} · ${H.aptName(task.apartment_id)}`,
      submitLabel: 'დანიშვნა',
      body: `<label class="field"><span class="field-label">შემსრულებელი</span><select name="assigned_to" required data-error="აირჩიე შემსრულებელი."><option value="">აირჩიე…</option>${options}</select>
        <span class="field-hint">შემსრულებელი შეტყობინებას მიიღებს და საქმე გამოჩნდება მის „ჩემს სამუშაოებში“.</span></label>`,
      onSubmit: async (_f, v) => {
        await updateTask(task, { assigned_to: v.assigned_to }, { event: { type: 'task_assigned', title: `დაინიშნა: ${task.title}`, description: H.memberName(v.assigned_to) } });
        toast(`დაინიშნა: ${H.memberName(v.assigned_to)}`, { type: 'success' });
      },
    });
  }
  const openCount = (memberId) => S.data.tasks.filter(t => t.assigned_to === memberId && H.isOpen(t)).length;

  // Primary next step for a task, used in lists
  function nextAction(t) {
    switch (t.status) {
      case 'new': return { label: 'დანიშვნა', run: (b) => openAssign(t) };
      case 'assigned': return { label: 'დაწყება', run: (b) => changeStatus(t, 'in_progress', b) };
      case 'in_progress': return { label: 'დასრულება', run: (b) => changeStatus(t, 'done', b) };
      case 'blocked': return { label: 'გაგრძელება', run: (b) => changeStatus(t, 'in_progress', b) };
      default: return null;
    }
  }

  function bindNextActions(root) {
    $$('[data-next]', root).forEach(b => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = H.task(b.dataset.next);
      nextAction(t)?.run(b);
    }));
  }

  function taskRow(t, { showApt = true, compact = false } = {}) {
    const na = nextAction(t);
    const pr = t.priority === 'urgent' ? R.badge('სასწრაფო', 'danger') : t.priority === 'low' ? '<span class="muted small">დაბალი</span>' : '<span class="muted small">ჩვეულებრივი</span>';
    return `<a class="row" href="${App.taskHref(t.id)}" style="--cols:var(--task-cols)">
      <span class="cell-main"><strong>${esc(t.title)}</strong><span>${esc(L.taskType[t.type] || t.type)}${t.status === 'blocked' && t.blocked_reason ? ' · ' + esc(t.blocked_reason) : ''}</span></span>
      ${showApt ? `<span class="cell-meta" data-label="ბინა">${esc(H.aptName(t.apartment_id))}</span>` : ''}
      <span class="cell-meta" data-label="ვადა">${H.dueText(t)}</span>
      ${compact ? '' : `<span class="cell-meta cell-hide-m">${pr}</span>`}
      <span class="cell-meta" data-label="შემსრულებელი">${H.assigneeText(t)}</span>
      <span class="cell-status">${R.taskBadge(t.status)}</span>
      <span class="cell-actions">${na ? `<button type="button" class="btn btn-secondary btn-sm" data-next="${t.id}">${na.label}</button>` : ''}</span>
    </a>`;
  }
  const TASK_COLS_APT = 'minmax(0,2fr) minmax(0,1.3fr) 128px 100px minmax(0,1fr) 120px 110px';
  // Without the apartment column the list is embedded in a narrower card, so priority is dropped too.
  const TASK_COLS = 'minmax(0,1.6fr) 120px minmax(0,1fr) 120px auto';
  const taskHead = (showApt = true) => `<div class="rows-head" style="--cols:${showApt ? TASK_COLS_APT : TASK_COLS}"><span>საქმე</span>${showApt ? '<span>ბინა</span>' : ''}<span>ვადა</span>${showApt ? '<span>პრიორიტეტი</span>' : ''}<span>შემსრულებელი</span><span>სტატუსი</span><span></span></div>`;
  const taskRows = (list, showApt = true) => `<div class="rows" style="--task-cols:${showApt ? TASK_COLS_APT : TASK_COLS}">${taskHead(showApt)}${list.map(t => taskRow(t, { showApt, compact: !showApt })).join('')}</div>`;

  // ===========================================================================
  // TODAY
  // ===========================================================================
  let todayFilter = 'all';
  let scheduleDay = 0; // 0 today, 1 tomorrow

  function turnoverFor(res) {
    // Previous reservation in the same apartment that ends on/just before this check-in
    const prev = S.data.reservations.filter(r => r.status !== 'cancelled' && r.apartment_id === res.apartment_id && r.id !== res.id && r.check_out <= res.check_in)
      .sort((a, b) => b.check_out.localeCompare(a.check_out))[0];
    const inTs = H.resTs(res.check_in, res.check_in_time);
    const windowStart = prev ? H.resTs(prev.check_out, prev.check_out_time) : new Date(inTs.getTime() - 36 * 3600e3);
    const cleaning = S.data.tasks.find(t => t.type === 'cleaning' && t.status !== 'cancelled' && t.apartment_id === res.apartment_id &&
      ((prev && t.reservation_id === prev.id) || (() => { const tt = new Date(H.taskTime(t) || 0); return tt >= new Date(windowStart.getTime() - 12 * 3600e3) && tt <= inTs; })()));
    return { prev, cleaning, inTs, needsTurnover: Boolean(prev) && (inTs - H.resTs(prev.check_out, prev.check_out_time)) < 4 * 86400e3 };
  }

  function attentionItems() {
    const now = Date.now();
    const items = [];
    const open = S.data.tasks.filter(H.isOpen);
    const seen = new Set();
    const add = (it) => { items.push(it); if (it.taskId) seen.add(it.taskId); };

    open.filter(H.isOverdue).forEach(t => add({
      sev: 'danger', tags: ['urgent', tagOf(t)], taskId: t.id, title: t.title, sub: `${H.aptName(t.apartment_id)} · ${t.assigned_to ? H.memberName(t.assigned_to) : 'არ არის დანიშნული'}`,
      why: `ვადა გადაცილებულია ${R.span(t.due_date, 'instr')}`, href: App.taskHref(t.id), action: t.assigned_to ? null : 'assign',
    }));
    open.filter(t => !seen.has(t.id) && t.priority === 'urgent' && ['repair', 'maintenance'].includes(t.type)).forEach(t => add({
      sev: 'danger', tags: ['urgent', 'repair'], taskId: t.id, title: t.title, sub: H.aptName(t.apartment_id),
      why: t.assigned_to ? `სასწრაფო რემონტი · ${L.taskStatus[t.status]}` : 'სასწრაფო რემონტი ჯერ არ არის დანიშნული', href: App.taskHref(t.id), action: t.assigned_to ? null : 'assign',
    }));
    // Check-ins in the next 24h whose turnover cleaning isn't ready
    S.data.reservations.filter(r => r.status !== 'cancelled').forEach(r => {
      const tv = turnoverFor(r);
      const left = tv.inTs - now;
      if (left < 0 || left > 24 * 3600e3 || !tv.needsTurnover) return;
      const leftText = R.span(tv.inTs);
      let why = null;
      if (!tv.cleaning) why = `Check-in-მდე ${leftText} დარჩა — დასუფთავება არ არის დაგეგმილი`;
      else if (tv.cleaning.status !== 'done' && !tv.cleaning.assigned_to) why = `Check-in-მდე ${leftText} დარჩა — დასუფთავება ჯერ არ არის დანიშნული`;
      else if (tv.cleaning.status !== 'done' && left < 6 * 3600e3) why = `Check-in-მდე ${leftText} დარჩა — დასუფთავება არ დასრულებულა`;
      if (!why) return;
      add({ sev: 'danger', tags: ['urgent', 'today', 'cleaning'], taskId: tv.cleaning?.id, title: `Check-in: ${r.guest_name}`, sub: `${H.aptName(r.apartment_id)} · ${R.time(tv.inTs)}`, why,
        href: tv.cleaning ? App.taskHref(tv.cleaning.id) : `#/apartments/${r.apartment_id}`, action: tv.cleaning ? (tv.cleaning.assigned_to ? null : 'assign') : { plan: r.id } });
    });
    // Owner decisions blocking work
    S.data.approvals.filter(a => R.approvalStatus(a) === 'pending').forEach(a => {
      const linked = a.task_id && H.task(a.task_id);
      if (!linked && !(Date.now() - new Date(a.created_at) > 24 * 3600e3)) return;
      add({ sev: 'warn', tags: ['owner', 'repair'], taskId: linked?.id, title: a.title || a.description || 'ხარჯის თანხმობა', sub: `${H.aptName(a.apartment_id)} · ${money(a.amount)}`,
        why: `მფლობელი ${R.elapsed(a.created_at)} არ პასუხობს`, href: linked ? App.taskHref(linked.id) : '#/owners', action: { share: a.id } });
    });
    open.filter(t => !seen.has(t.id) && t.status === 'blocked' && !S.data.approvals.some(a => a.task_id === t.id && a.status === 'pending')).forEach(t => add({
      sev: 'warn', tags: [tagOf(t)], taskId: t.id, title: t.title, sub: H.aptName(t.apartment_id), why: `შეჩერებულია: ${t.blocked_reason || 'მიზეზი არ არის მითითებული'}`, href: App.taskHref(t.id),
    }));
    open.filter(t => !seen.has(t.id) && !t.assigned_to && t.due_date && new Date(t.due_date) - now < 24 * 3600e3).forEach(t => add({
      sev: 'warn', tags: ['unassigned', tagOf(t)], taskId: t.id, title: t.title, sub: H.aptName(t.apartment_id), why: `საქმე ჯერ არ არის დანიშნული · ვადა ${R.relative(t.due_date)}`, href: App.taskHref(t.id), action: 'assign',
    }));
    return items;
  }
  const tagOf = (t) => t.type === 'cleaning' ? 'cleaning' : ['repair', 'maintenance'].includes(t.type) ? 'repair' : 'other';

  function scheduleItems(offset) {
    const day = new Date(); day.setDate(day.getDate() + offset);
    const dayIso = R.isoDate(day);
    const items = [];
    S.data.reservations.filter(r => r.status !== 'cancelled').forEach(r => {
      if (r.check_out === dayIso) items.push({ ts: H.resTs(r.check_out, r.check_out_time), kind: 'Check-out', icon: 'logout', apt: r.apartment_id, who: r.guest_name, status: R.badge('გასვლა', 'neutral'), href: `#/apartments/${r.apartment_id}` });
      if (r.check_in === dayIso) {
        const tv = turnoverFor(r);
        const ready = !tv.needsTurnover || tv.cleaning?.status === 'done';
        items.push({ ts: H.resTs(r.check_in, r.check_in_time), kind: 'Check-in', icon: 'login', apt: r.apartment_id, who: `${r.guest_name} · ${L.source[r.source] || r.source}`, status: ready ? R.badge('ბინა მზადაა', 'ok') : R.badge('ბინა არ არის მზად', 'warn'), href: `#/apartments/${r.apartment_id}` });
      }
    });
    S.data.tasks.filter(t => t.status !== 'cancelled').forEach(t => {
      const ts = R.toDate(H.taskTime(t));
      if (!ts || R.isoDate(ts) !== dayIso) return;
      const kind = t.type === 'cleaning' && t.scheduled_start && t.due_date ? `დასუფთავება ${R.time(t.scheduled_start)}–${R.time(t.due_date)}` : (L.taskType[t.type] || 'საქმე');
      items.push({ ts, kind, icon: t.type === 'cleaning' ? 'sparkle' : ['repair', 'maintenance'].includes(t.type) ? 'wrench' : 'tasks', apt: t.apartment_id, title: t.title, who: t.assigned_to ? H.memberName(t.assigned_to) : null, status: R.taskBadge(t.status), href: App.taskHref(t.id), tag: tagOf(t), unassigned: !t.assigned_to });
    });
    return items.sort((a, b) => a.ts - b.ts);
  }

  function financeSnapshot() {
    const mk = R.monthKey();
    const inMonth = (d) => (d || '').startsWith(mk);
    const income = S.data.income.filter(i => inMonth(i.income_date)).reduce((s, i) => s + Number(i.amount), 0);
    const exp = S.data.expenses;
    const sum = (list) => list.reduce((s, e) => s + Number(e.amount), 0);
    const recorded = exp.filter(e => ['incurred', 'paid'].includes(e.status) && inMonth(e.expense_date));
    const unpaid = exp.filter(e => e.status === 'incurred');
    const pending = exp.filter(e => ['proposed', 'approved'].includes(e.status));
    const missing = exp.filter(e => ['incurred', 'paid'].includes(e.status) && e.receipt_required !== false && !e.receipt_url);
    return { income, recorded: sum(recorded), unpaid: sum(unpaid), unpaidN: unpaid.length, pending: sum(pending), pendingN: pending.length, missing };
  }

  function setupSteps() {
    const d = S.data;
    return [
      { done: true, title: 'სამუშაო სივრცე შეიქმნა', desc: S.org.name },
      { done: d.apartments.length > 0, title: 'დაამატე ბინები', desc: 'სათითაოდ ან Excel/CSV ფაილით', action: `<button class="btn btn-secondary btn-sm" data-setup="apartment">ბინის დამატება</button> <a class="btn btn-ghost btn-sm" href="#/settings/import">იმპორტი</a>` },
      { done: d.owners.length > 0, title: 'დაამატე მფლობელები', desc: 'თანხმობებისა და ამონაწერებისთვის', action: `<button class="btn btn-secondary btn-sm" data-setup="owner">მფლობელის დამატება</button>` },
      { done: d.members.length > 1, title: 'მოიწვიე გუნდი', desc: 'დამლაგებლები და ტექნიკოსები თავიანთ სამუშაოებს ტელეფონიდან ნახავენ', action: `<a class="btn btn-secondary btn-sm" href="#/team">მოწვევა</a>` },
      { done: d.tasks.length > 0, title: 'შექმენი პირველი საქმე', desc: 'მაგ.: დასუფთავება შემდეგი სტუმრის წინ', action: `<button class="btn btn-secondary btn-sm" data-setup="task">საქმის შექმნა</button>` },
    ];
  }

  App.views.today = () => {
    const now = new Date();
    const att = attentionItems();
    const open = S.data.tasks.filter(H.isOpen);
    const todayIso = R.isoDate();
    const pendingApprovals = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const counts = {
      urgent: open.filter(t => t.priority === 'urgent' || H.isOverdue(t)).length,
      today: open.filter(t => R.isoDate(new Date(H.taskTime(t) || 0)) === todayIso).length,
      unassigned: open.filter(t => !t.assigned_to).length,
      cleaning: open.filter(t => t.type === 'cleaning').length,
      repair: open.filter(t => ['repair', 'maintenance'].includes(t.type)).length,
      owner: pendingApprovals.length,
    };
    const FILTERS = [['all', 'ყველა'], ['urgent', 'სასწრაფო'], ['today', 'დღეს'], ['unassigned', 'დაუნიშნავი'], ['cleaning', 'დასუფთავება'], ['repair', 'რემონტი'], ['owner', 'მფლობელს ელოდება']];
    const fin = financeSnapshot();
    const steps = setupSteps();
    const showSetup = steps.some(s => !s.done) && localStorage.getItem('rigzea_setup_hidden_' + S.org.id) !== '1';

    let focus = '';
    if (todayFilter !== 'all') {
      if (todayFilter === 'owner') {
        focus = `<section class="card"><div class="card-head"><h2>მფლობელს ელოდება <span class="count">${pendingApprovals.length}</span></h2></div>${approvalsList(pendingApprovals) || emptyInline('ღია თანხმობის მოთხოვნა არ არის.')}</section>`;
      } else {
        const pick = {
          urgent: (t) => t.priority === 'urgent' || H.isOverdue(t), today: (t) => R.isoDate(new Date(H.taskTime(t) || 0)) === todayIso,
          unassigned: (t) => !t.assigned_to, cleaning: (t) => t.type === 'cleaning', repair: (t) => ['repair', 'maintenance'].includes(t.type),
        }[todayFilter];
        const list = open.filter(pick);
        focus = `<section class="card"><div class="card-head"><h2>${FILTERS.find(f => f[0] === todayFilter)[1]} <span class="count">${list.length}</span></h2><a class="link-btn small" href="#/tasks">ყველა საქმე</a></div>
          ${list.length ? taskRows(list) : emptyInline('ამ ფილტრით აქტიური საქმე არ არის.')}</section>`;
      }
    }

    const sched = scheduleItems(scheduleDay);
    const tomorrowCount = scheduleItems(1).length;

    $('#view').innerHTML = `
      <div class="page-head">
        <div><h1>დღეს</h1><p class="page-sub">${R.WEEKDAYS[now.getDay()]}, ${now.getDate()} ${R.MONTHS[now.getMonth()]}</p></div>
      </div>
      <div class="chips" role="group" aria-label="ფილტრი">${FILTERS.map(([id, label]) => `<button type="button" class="chip" data-filter="${id}" aria-pressed="${todayFilter === id}">${label}${id !== 'all' ? ` <span class="count">${counts[id]}</span>` : ''}</button>`).join('')}</div>
      <div class="cols">
        <div class="stack">
          ${showSetup ? `<section class="card"><div class="card-head"><h2>პირველი ნაბიჯები</h2><button type="button" class="link-btn small" id="btn-hide-setup">დამალვა</button></div>
            <ol class="setup">${steps.map(s => `<li class="${s.done ? 'done' : ''}"><div><div class="step-title">${esc(s.title)}</div><div class="step-desc">${esc(s.desc)}</div></div><div>${s.done ? '' : s.action || ''}</div></li>`).join('')}</ol></section>` : ''}
          ${focus || `
          <section class="card ${att.some(a => a.sev === 'danger') ? 'card-alert' : ''}">
            <div class="card-head"><h2>${icon('alert', 16)} სასწრაფო და ვადაგადაცილებული <span class="count ${att.some(a => a.sev === 'danger') ? 'count-danger' : ''}">${att.length}</span></h2></div>
            ${att.length ? `<div>${att.map(alertRow).join('')}</div>` : emptyInline('სასწრაფო საკითხი არ არის. ვადაგადაცილებული, დაუნიშნავი და მფლობელის პასუხის მომლოდინე საქმეები აქ გამოჩნდება.')}
          </section>
          <section class="card">
            <div class="card-head"><h2>${scheduleDay ? 'ხვალის' : 'დღის'} განრიგი <span class="count">${sched.length}</span></h2>
              <div class="seg" role="group" aria-label="დღე"><label><input type="radio" name="sday" value="0" ${scheduleDay === 0 ? 'checked' : ''}><span>დღეს</span></label><label><input type="radio" name="sday" value="1" ${scheduleDay === 1 ? 'checked' : ''}><span>ხვალ · ${tomorrowCount}</span></label></div>
            </div>
            ${sched.length ? sched.map(s => `<a class="sched-row" href="${s.href}">
                <span class="sched-time">${R.time(s.ts)}</span>
                <span class="kind">${icon(s.icon, 15)} ${esc(s.kind)}</span>
                <span class="cell-main sched-apt"><strong>${esc(H.aptName(s.apt))}</strong>${s.title ? `<span>${esc(s.title)}</span>` : ''}</span>
                <span class="sched-who">${s.who ? esc(s.who) : '<span class="t-warn">არ არის დანიშნული</span>'}</span>
                <span class="sched-status">${s.status}</span></a>`).join('')
              : emptyInline(scheduleDay ? 'ხვალისთვის არაფერია დაგეგმილი.' : 'დღეს გასვლა, შესვლა ან დაგეგმილი საქმე არ არის.')}
            ${S.data.reservations.length === 0 ? `<div class="card-foot">Check-in და check-out დროები ჯავშნებიდან ჩნდება. ჯავშანი დაამატე ბინის გვერდიდან.</div>` : ''}
          </section>`}
        </div>
        <div class="stack">
          <section class="card">
            <div class="card-head"><h2>მფლობელის გადაწყვეტილებები <span class="count">${pendingApprovals.length}</span></h2><a class="link-btn small" href="#/owners">ყველა</a></div>
            ${pendingApprovals.length ? approvalsList(pendingApprovals.slice(0, 5), true) : emptyInline('პასუხის მომლოდინე მოთხოვნა არ არის.')}
          </section>
          <section class="card">
            <div class="card-head"><h2>${R.MONTHS[now.getMonth()]} · ფინანსები</h2><a class="link-btn small" href="#/finance">დეტალურად</a></div>
            <div class="stats">
              <div class="stat"><span class="stat-label">შემოსავალი</span><span class="stat-value">${money(fin.income)}</span></div>
              <div class="stat"><span class="stat-label">გაწეული ხარჯი</span><span class="stat-value">${money(fin.recorded)}</span></div>
              <div class="stat"><span class="stat-label">გადასახდელი</span><span class="stat-value ${fin.unpaid ? 't-warn' : ''}">${money(fin.unpaid)}</span><span class="stat-note">${fin.unpaidN} ხარჯი</span></div>
              <div class="stat"><span class="stat-label">წმინდა</span><span class="stat-value">${money(fin.income - fin.recorded)}</span></div>
            </div>
            <p class="calc">წმინდა = შემოსავალი <b>${money(fin.income)}</b> − გაწეული ხარჯი <b>${money(fin.recorded)}</b>. ${fin.pendingN ? `შეთავაზებული და დადასტურებული, ჯერ გაუწეველი ხარჯი (${money(fin.pending)}) არ შედის.` : ''}
            ${fin.missing.length ? `<br><a class="link-btn" href="#/finance?status=missing">ქვითარი აკლია ${fin.missing.length} ხარჯს (${money(fin.missing.reduce((s, e) => s + Number(e.amount), 0))})</a>` : ''}</p>
          </section>
          <section class="card">
            <div class="card-head"><h2>ბოლო აქტივობა</h2></div>
            ${activityList(S.data.events.slice(0, 8))}
          </section>
        </div>
      </div>`;

    $$('[data-filter]').forEach(b => b.addEventListener('click', () => { todayFilter = b.dataset.filter; App.render(); }));
    $$('input[name=sday]').forEach(i => i.addEventListener('change', () => { scheduleDay = Number(i.value); App.render(); }));
    $('#btn-hide-setup')?.addEventListener('click', () => { localStorage.setItem('rigzea_setup_hidden_' + S.org.id, '1'); App.render(); });
    bindSetup($('#view'));
    bindAlertActions($('#view'), att);
    bindApprovalShare($('#view'));
    bindNextActions($('#view'));
  };

  function bindSetup(root) {
    $$('[data-setup]', root).forEach(b => b.addEventListener('click', () => {
      ({ task: () => openTaskForm(), apartment: () => App.openApartmentForm(), owner: () => App.openOwnerForm() })[b.dataset.setup]();
    }));
  }

  function alertRow(a, i) {
    let btn = '';
    if (a.action === 'assign') btn = `<button type="button" class="btn btn-secondary btn-sm" data-alert="${i}">დანიშვნა</button>`;
    else if (a.action?.share) btn = `<button type="button" class="btn btn-secondary btn-sm" data-share="${a.action.share}">${navigator.share ? 'გაზიარება' : 'ბმულის კოპირება'}</button>`;
    else if (a.action?.plan) btn = `<button type="button" class="btn btn-secondary btn-sm" data-alert="${i}">დასუფთავების დაგეგმვა</button>`;
    else btn = `<a class="btn btn-ghost btn-sm" href="${a.href}">გახსნა</a>`;
    return `<div class="alert-row sev-${a.sev}">
      <a class="what" href="${a.href}" style="text-decoration:none;color:inherit"><strong>${esc(a.title)}</strong><span>${esc(a.sub)}</span><span class="why ${a.sev === 'danger' ? 't-danger' : 't-warn'}">${esc(a.why)}</span></a>
      ${btn}</div>`;
  }

  function bindAlertActions(root, items) {
    $$('[data-alert]', root).forEach(b => b.addEventListener('click', () => {
      const a = items[Number(b.dataset.alert)];
      if (a.action === 'assign') openAssign(H.task(a.taskId));
      else if (a.action?.plan) planTurnover(S.data.reservations.find(r => r.id === a.action.plan));
    }));
  }

  function approvalsList(list, compact = false) {
    if (!list.length) return '';
    return `<div class="rows">${list.map(a => `
      <div class="row" style="--cols:minmax(0,1fr) auto">
        <span class="cell-main wrap"><strong>${esc(a.title || a.description || 'ხარჯის თანხმობა')} · ${money(a.amount)}</strong>
          <span>${esc(H.aptName(a.apartment_id))} · ${esc(H.owner(a.owner_id)?.name || 'მფლობელი არ არის მითითებული')}</span>
          <span class="${Date.now() - new Date(a.created_at) > 24 * 3600e3 ? 't-danger' : 't-warn'} small">მფლობელი ${esc(R.elapsed(a.created_at))} არ პასუხობს</span></span>
        <span class="cell-actions" style="grid-column:auto"><button type="button" class="btn btn-secondary btn-sm" data-share="${a.id}">${navigator.share ? 'გაზიარება' : 'ბმულის კოპირება'}</button></span>
      </div>`).join('')}</div>`;
  }

  function bindApprovalShare(root) {
    $$('[data-share]', root).forEach(b => b.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const a = S.data.approvals.find(x => x.id === b.dataset.share);
      App.shareApproval(a);
    }));
  }

  App.shareApproval = async (a) => {
    const link = H.approvalLink(a);
    const text = `${H.aptName(a.apartment_id)}: ${a.title || a.description} — ${money(a.amount)}. გთხოვთ, დაადასტუროთ ან უარყოთ:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'ხარჯის თანხმობა', text, url: link }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    R.copyText(link, 'თანხმობის ბმული დაკოპირდა — გაუგზავნე მფლობელს');
  };

  function activityList(events) {
    if (!events.length) return emptyInline('აქტივობა ჯერ არ არის. აქ გამოჩნდება, ვინ რა გააკეთა და რომელ ბინაში.');
    return `<ul class="timeline">${events.map(e => `<li><strong>${esc(e.title)}</strong><time title="${esc(R.dateTime(e.created_at))}">${esc(R.relative(e.created_at))}</time>
      <span class="meta">${esc(e.actor_name || 'სისტემა')}${e.apartment_id ? ' · ' + esc(H.aptName(e.apartment_id)) : ''}${e.description ? ' · ' + esc(e.description) : ''}</span></li>`).join('')}</ul>`;
  }
  const emptyInline = (text) => `<p class="empty-inline">${esc(text)}</p>`;

  // ===========================================================================
  // TASKS LIST
  // ===========================================================================
  const tf = { status: 'active', q: '', type: '', assignee: '', apt: '', overdue: false };
  const STATUS_TABS = [['active', 'აქტიური'], ['new', 'ახალი'], ['assigned', 'დანიშნული'], ['in_progress', 'პროცესშია'], ['blocked', 'შეჩერებული'], ['done', 'დასრულებული'], ['cancelled', 'გაუქმებული'], ['all', 'ყველა']];

  App.views.tasks = (r) => {
    if (r.params.get('assignee')) tf.assignee = r.params.get('assignee');
    const all = S.data.tasks;
    const matchStatus = (t, s) => s === 'all' ? true : s === 'active' ? H.isOpen(t) : t.status === s;
    const base = all.filter(t => (!tf.type || (tf.type === 'repair' ? ['repair', 'maintenance'].includes(t.type) : t.type === tf.type))
      && (!tf.assignee || (tf.assignee === 'none' ? !t.assigned_to : t.assigned_to === tf.assignee))
      && (!tf.apt || t.apartment_id === tf.apt)
      && (!tf.overdue || H.isOverdue(t))
      && (!tf.q || [t.title, t.description, H.aptName(t.apartment_id)].some(v => String(v || '').toLowerCase().includes(tf.q.toLowerCase()))));
    const list = base.filter(t => matchStatus(t, tf.status)).sort((a, b) => {
      const o = (t) => (H.isOverdue(t) ? 0 : 1);
      return o(a) - o(b) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
    });
    const filtersOn = tf.q || tf.type || tf.assignee || tf.apt || tf.overdue;

    $('#view').innerHTML = `
      <div class="page-head"><div><h1>საქმეები</h1><p class="page-sub">${all.filter(H.isOpen).length} აქტიური · ${all.filter(H.isOverdue).length} ვადაგადაცილებული</p></div>
      </div>
      <div class="tabs" role="tablist">${STATUS_TABS.map(([id, label]) => `<button type="button" role="tab" class="tab" data-status="${id}" aria-selected="${tf.status === id}">${label} <span class="count">${base.filter(t => matchStatus(t, id)).length}</span></button>`).join('')}</div>
      <div class="toolbar">
        <div class="search-input grow">${icon('search', 16)}<input class="input" type="search" id="tf-q" placeholder="საქმე ან ბინა…" value="${esc(tf.q)}" aria-label="საქმის ძებნა" /></div>
        <select class="input" id="tf-type" aria-label="ტიპი"><option value="">ყველა ტიპი</option><option value="cleaning">დასუფთავება</option><option value="repair">რემონტი და ტექმომსახურება</option><option value="inspection">ინსპექცია</option><option value="other">სხვა</option></select>
        <select class="input" id="tf-assignee" aria-label="შემსრულებელი"><option value="">ყველა შემსრულებელი</option><option value="none">დაუნიშნავი</option>${H.staffMembers().map(m => `<option value="${m.id}">${esc(m.display_name || 'უსახელო')}</option>`).join('')}</select>
        <select class="input" id="tf-apt" aria-label="ბინა"><option value="">ყველა ბინა</option>${S.data.apartments.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="tf-overdue" ${tf.overdue ? 'checked' : ''}/> <span>მხოლოდ ვადაგადაცილებული</span></label>
        ${filtersOn ? '<button type="button" class="btn btn-ghost btn-sm" id="tf-clear">ფილტრის გასუფთავება</button>' : ''}
      </div>
      <section class="card">${list.length ? taskRows(list) : `<div class="empty">${icon('tasks', 28)}<h3>${filtersOn || tf.status !== 'active' ? 'ამ ფილტრით საქმე ვერ მოიძებნა' : 'აქტიური საქმე არ არის'}</h3>
        <p>${filtersOn ? 'შეცვალე ან გაასუფთავე ფილტრი.' : 'საქმე არის ნებისმიერი სამუშაო ბინაში: დასუფთავება, რემონტი, ინსპექცია. შექმენი და დაუნიშნე გუნდის წევრს.'}</p>
        ${filtersOn ? '' : '<button class="btn btn-primary" type="button" data-setup="task">საქმის შექმნა</button>'}</div>`}</section>`;

    $('#tf-type').value = tf.type; $('#tf-assignee').value = tf.assignee; $('#tf-apt').value = tf.apt;
    $$('[data-status]').forEach(b => b.addEventListener('click', () => { tf.status = b.dataset.status; App.render(); }));
    let t;
    $('#tf-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { tf.q = e.target.value; App.render(); $('#tf-q').focus(); $('#tf-q').setSelectionRange(tf.q.length, tf.q.length); }, 200); });
    $('#tf-type').onchange = (e) => { tf.type = e.target.value; App.render(); };
    $('#tf-assignee').onchange = (e) => { tf.assignee = e.target.value; App.render(); };
    $('#tf-apt').onchange = (e) => { tf.apt = e.target.value; App.render(); };
    $('#tf-overdue').onchange = (e) => { tf.overdue = e.target.checked; App.render(); };
    $('#tf-clear')?.addEventListener('click', () => { Object.assign(tf, { q: '', type: '', assignee: '', apt: '', overdue: false }); App.render(); });
    bindSetup($('#view'));
    bindNextActions($('#view'));
  };

  // ===========================================================================
  // TASK DRAWER
  // ===========================================================================
  let drawerEl = null;
  let drawerTaskId = null;
  let returnFocus = null;

  App.closeTaskDrawer = (fromRouter) => {
    if (!drawerEl) return;
    drawerEl.remove(); drawerEl = null; drawerTaskId = null;
    document.body.style.overflow = '';
    returnFocus?.focus?.();
    if (!fromRouter) App.closeTaskOverlay();
  };

  App.openTaskDrawer = (id) => {
    const t = H.task(id);
    if (!t) { App.closeTaskDrawer(true); toast('საქმე ვერ მოიძებნა — შესაძლოა წაშლილია ან სხვა სამუშაო სივრცეს ეკუთვნის.', { type: 'error' }); App.closeTaskOverlay(); return; }
    if (!drawerEl) {
      returnFocus = document.activeElement;
      drawerEl = document.createElement('div');
      drawerEl.innerHTML = `<div class="drawer-backdrop"></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"></aside>`;
      document.body.appendChild(drawerEl);
      document.body.style.overflow = 'hidden';
      $('.drawer-backdrop', drawerEl).onclick = () => App.closeTaskDrawer();
      drawerEl.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open]')) App.closeTaskDrawer(); });
    }
    const keepScroll = drawerTaskId === id ? $('.drawer-body', drawerEl)?.scrollTop : 0;
    drawerTaskId = id;
    renderDrawer(t);
    if (keepScroll) $('.drawer-body', drawerEl).scrollTop = keepScroll;
    else $('[data-close-drawer]', drawerEl).focus();
  };

  function renderDrawer(t) {
    const apt = H.apt(t.apartment_id);
    const approvals = S.data.approvals.filter(a => a.task_id === t.id);
    const expenses = S.data.expenses.filter(e => e.task_id === t.id);
    const repairs = S.data.repairs.filter(r => r.task_id === t.id && Number(r.estimate_amount) > 0);
    const history = S.data.events.filter(e => e.metadata?.task_id === t.id || (e.apartment_id === t.apartment_id && String(e.title || '').endsWith(t.title)));
    const checklist = t.checklist || [];
    const photos = t.photos || [];
    const res = t.reservation_id && S.data.reservations.find(r => r.id === t.reservation_id);
    const isRepair = ['repair', 'maintenance'].includes(t.type);
    const actions = [];
    if (t.status === 'new') actions.push(['assign', 'დანიშვნა', 'primary'], ['in_progress', 'დაწყება', 'secondary']);
    if (t.status === 'assigned') actions.push(['in_progress', 'დაწყება', 'primary'], ['blocked', 'შეჩერება', 'secondary']);
    if (t.status === 'in_progress') actions.push(['done', 'დასრულება', 'primary'], ['blocked', 'შეჩერება', 'secondary']);
    if (t.status === 'blocked') actions.push(['in_progress', 'გაგრძელება', 'primary']);
    if (t.status === 'done') actions.push(['in_progress', 'ხელახლა გახსნა', 'secondary']);
    if (t.status === 'cancelled') actions.push([t.assigned_to ? 'assigned' : 'new', 'აღდგენა', 'secondary']);
    if (H.isOpen(t)) actions.push(['cancelled', 'გაუქმება', 'ghost']);

    $('.drawer', drawerEl).innerHTML = `
      <header class="drawer-head">
        <div style="flex:1;min-width:0">
          <div class="small muted">${esc(L.taskType[t.type] || t.type)} · <a href="#/apartments/${t.apartment_id}">${esc(H.aptName(t.apartment_id))}</a></div>
          <h2 id="drawer-title">${esc(t.title)}</h2>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${R.taskBadge(t.status)}${t.priority === 'urgent' ? R.badge('სასწრაფო', 'danger') : ''}${H.isOverdue(t) ? R.badge('ვადაგადაცილებული', 'danger') : ''}</div>
        </div>
        <button type="button" class="icon-btn" data-edit aria-label="რედაქტირება" title="რედაქტირება">${icon('file')}</button>
        <button type="button" class="icon-btn" data-close-drawer aria-label="დახურვა">${icon('close')}</button>
      </header>
      <div class="drawer-body">
        ${t.status === 'blocked' ? `<div class="notice notice-danger">${icon('alert', 16)}<div><strong>შეჩერებულია:</strong> ${esc(t.blocked_reason || '')}</div></div>` : ''}
        <dl class="kv">
          <dt>შემსრულებელი</dt><dd><select class="input" id="d-assignee" aria-label="შემსრულებელი" style="max-width:280px"><option value="">არ არის დანიშნული</option>${H.staffMembers().map(m => `<option value="${m.id}" ${m.id === t.assigned_to ? 'selected' : ''}>${esc(m.display_name || 'უსახელო')}</option>`).join('')}</select></dd>
          <dt>ვადა</dt><dd>${H.dueText(t)}${t.due_date ? ` <span class="muted small">(${esc(R.relative(t.due_date))})</span>` : ''}</dd>
          ${t.scheduled_start ? `<dt>დაწყება</dt><dd>${esc(R.dateTime(t.scheduled_start))}</dd>` : ''}
          <dt>პრიორიტეტი</dt><dd>${esc(L.priority[t.priority] || t.priority)}</dd>
          ${res ? `<dt>ჯავშანი</dt><dd>${esc(res.guest_name)} · გასვლა ${esc(R.date(res.check_out))}</dd>` : ''}
          <dt>შექმნილია</dt><dd>${esc(R.dateTime(t.created_at))}</dd>
          ${t.completed_at ? `<dt>დასრულდა</dt><dd>${esc(R.dateTime(t.completed_at))}</dd>` : ''}
        </dl>
        ${t.description ? `<div><div class="section-title">აღწერა</div><p style="white-space:pre-wrap">${esc(t.description)}</p></div>` : ''}
        <div>
          <div class="section-title"><span>ჩეკლისტი ${checklist.length ? `· ${checklist.filter(i => i.done).length}/${checklist.length}` : ''}</span></div>
          ${checklist.length ? `<ul class="checklist">${checklist.map((i, n) => `<li><label><input type="checkbox" data-check="${n}" ${i.done ? 'checked' : ''}/><span>${esc(i.label)}</span></label></li>`).join('')}</ul>` : '<p class="muted small">ჩეკლისტი არ არის.</p>'}
          <form class="toolbar" id="d-add-check" style="margin:8px 0 0"><input class="input grow" name="label" placeholder="ახალი პუნქტი" aria-label="ჩეკლისტის ახალი პუნქტი" required /><button class="btn btn-secondary btn-sm" type="submit">დამატება</button></form>
        </div>
        <div>
          <div class="section-title"><span>ფოტოები</span><label class="btn btn-secondary btn-sm" style="cursor:pointer">${icon('camera', 15)} ატვირთვა<input type="file" accept="image/*" id="d-photo" hidden /></label></div>
          ${photos.length ? `<div class="photos">${photos.map(p => `<a class="photo" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(phaseLabel(p.phase))}" loading="lazy" /><span>${esc(phaseLabel(p.phase))}</span></a>`).join('')}</div>` : '<p class="muted small">ფოტო ჯერ არ არის. დამლაგებელი „მანამდე“ და „შემდეგ“ ფოტოებს ტელეფონიდან ატვირთავს.</p>'}
        </div>
        ${isRepair || approvals.length || expenses.length ? `<div>
          <div class="section-title"><span>ხარჯი და თანხმობა</span>
            <span>${isRepair && !approvals.some(a => a.status === 'pending') ? `<button type="button" class="btn btn-secondary btn-sm" data-request>თანხმობის მოთხოვნა</button>` : ''} <button type="button" class="btn btn-ghost btn-sm" data-expense>ხარჯის ჩაწერა</button></span></div>
          ${repairs.map(r => `<p class="small">შეფასება: <strong>${money(r.estimate_amount)}</strong> <span class="muted">(ინფორმაციისთვის, ხარჯად არ ითვლება)</span></p>`).join('')}
          ${approvals.map(a => `<div class="row" style="--cols:minmax(0,1fr) auto;padding-left:0;padding-right:0"><span class="cell-main"><strong>თანხმობა · ${money(a.amount)}</strong><span>${esc(a.title || a.description || '')} · ${esc(R.dateTime(a.created_at))}${R.approvalStatus(a) === 'pending' ? ` · მფლობელი ${esc(R.elapsed(a.created_at))} არ პასუხობს` : a.response_note ? ' · „' + esc(a.response_note) + '“' : ''}</span></span>
            <span style="display:flex;gap:6px;align-items:center">${R.approvalBadge(a)}${R.approvalStatus(a) === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" data-share="${a.id}">${navigator.share ? 'გაზიარება' : 'ბმული'}</button>` : ''}</span></div>`).join('')}
          ${expenses.map(e => `<div class="row" style="--cols:minmax(0,1fr) auto;padding-left:0;padding-right:0"><span class="cell-main"><strong>ხარჯი · ${money(e.amount)}</strong><span>${esc(L.expenseCategory[e.category] || e.category)} · ${esc(R.date(e.expense_date))}${e.receipt_url ? ` · <a href="${esc(e.receipt_url)}" target="_blank" rel="noopener">ქვითარი</a>` : ['incurred', 'paid'].includes(e.status) ? ' · <span class="t-warn">ქვითარი აკლია</span>' : ''}</span></span>${R.expenseBadge(e.status)}</div>`).join('')}
          ${!repairs.length && !approvals.length && !expenses.length ? '<p class="muted small">ხარჯი ჯერ არ არის ჩაწერილი.</p>' : ''}
        </div>` : ''}
        <div>
          <div class="section-title">შენიშვნები</div>
          <form id="d-notes" class="form-stack" style="gap:8px"><textarea class="input" name="notes" rows="3" aria-label="შენიშვნები" placeholder="შიდა შენიშვნა გუნდისთვის">${esc(t.notes || '')}</textarea>
          <div><button class="btn btn-secondary btn-sm" type="submit">შენიშვნის შენახვა</button></div></form>
        </div>
        <div>
          <div class="section-title">ისტორია</div>
          ${history.length ? `<ul class="timeline" style="margin:0 -16px">${history.slice(0, 15).map(e => `<li><strong>${esc(e.title)}</strong><time>${esc(R.dateTime(e.created_at))}</time><span class="meta">${esc(e.actor_name || 'სისტემა')}${e.description ? ' · ' + esc(e.description) : ''}</span></li>`).join('')}</ul>` : '<p class="muted small">ისტორია ჯერ არ არის.</p>'}
        </div>
      </div>
      <footer class="drawer-foot">${actions.map(([s, label, kind]) => `<button type="button" class="btn btn-${kind}" data-move="${s}">${label}</button>`).join('')}</footer>`;

    const root = drawerEl;
    $('[data-close-drawer]', root).onclick = () => App.closeTaskDrawer();
    $('[data-edit]', root).onclick = () => openTaskForm({ task: t });
    $$('[data-move]', root).forEach(b => b.addEventListener('click', () => b.dataset.move === 'assign' ? openAssign(t) : changeStatus(t, b.dataset.move, b)));
    $('#d-assignee', root).onchange = (e) => {
      const sel = e.target;
      const val = sel.value || null;
      run(null, () => updateTask(t, { assigned_to: val }, { event: { type: 'task_assigned', title: val ? `დაინიშნა: ${t.title}` : `დანიშვნა მოიხსნა: ${t.title}`, description: val ? H.memberName(val) : null }, undo: val ? `დაინიშნა: ${H.memberName(val)}` : 'დანიშვნა მოიხსნა' }))
        .then(r => { if (!r) sel.value = t.assigned_to || ''; });
    };
    $$('[data-check]', root).forEach(cb => cb.addEventListener('change', () => {
      const next = checklist.map((i, n) => n === Number(cb.dataset.check) ? { ...i, done: cb.checked } : i);
      cb.disabled = true;
      run(null, () => updateTask(t, { checklist: next })).then(r => { if (!r) { cb.checked = !cb.checked; cb.disabled = false; } });
    }));
    $('#d-add-check', root).onsubmit = (e) => {
      e.preventDefault();
      const label = e.target.label.value.trim();
      if (!label) return;
      run(e.target.querySelector('button'), () => updateTask(t, { checklist: [...checklist, { label, done: false }] }));
    };
    $('#d-notes', root).onsubmit = (e) => { e.preventDefault(); run(e.target.querySelector('button'), () => updateTask(t, { notes: e.target.notes.value }), { success: 'შენიშვნა შენახულია' }); };
    $('#d-photo', root).onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const phase = await R.dialog({ title: 'ფოტოს ტიპი', submitLabel: 'ატვირთვა', body: `<div class="seg"><label><input type="radio" name="phase" value="before" checked><span>მანამდე</span></label><label><input type="radio" name="phase" value="after"><span>შემდეგ</span></label><label><input type="radio" name="phase" value="problem"><span>პრობლემა</span></label></div>`, onSubmit: async (_f, v) => v.phase });
      if (!phase) return;
      await run(null, async () => {
        const url = await R.uploadFile(S.org.id, `tasks/${t.id}`, file);
        await updateTask(t, { photos: [...photos, { url, phase, at: new Date().toISOString() }] });
      }, { success: 'ფოტო აიტვირთა' });
    };
    $('[data-request]', root)?.addEventListener('click', () => App.openApprovalForm({ apartmentId: t.apartment_id, task: t }));
    $('[data-expense]', root)?.addEventListener('click', () => App.openExpenseForm({ apartmentId: t.apartment_id, task: t }));
    bindApprovalShare(root);
  }
  const phaseLabel = (p) => ({ before: 'მანამდე', after: 'შემდეგ', problem: 'პრობლემა' }[p] || 'ფოტო');

  // ===========================================================================
  // TASK FORM
  // ===========================================================================
  // Searchable apartment picker bound to a hidden input
  App.picker = (form, name, items, value) => {
    const wrap = $(`[data-picker="${name}"]`, form);
    const hidden = $(`input[name="${name}"]`, form);
    const input = $('input[type=text]', wrap);
    const list = $('.picker-list', wrap);
    let active = -1;
    const set = (item) => { hidden.value = item?.id || ''; input.value = item?.label || ''; list.hidden = true; hidden.dispatchEvent(new Event('change')); };
    const draw = () => {
      const s = input.value.trim().toLowerCase();
      const res = items.filter(i => !s || (i.label + ' ' + (i.sub || '')).toLowerCase().includes(s)).slice(0, 30);
      active = res.length ? 0 : -1;
      list.innerHTML = res.length ? res.map((i, n) => `<li role="option" data-id="${i.id}" aria-selected="${n === active}">${esc(i.label)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</li>`).join('') : '<li aria-disabled="true">ვერ მოიძებნა</li>';
      list.hidden = false;
      $$('li[data-id]', list).forEach(li => li.addEventListener('mousedown', (e) => { e.preventDefault(); set(items.find(i => i.id === li.dataset.id)); }));
    };
    input.addEventListener('focus', draw);
    input.addEventListener('input', () => { hidden.value = ''; draw(); });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; if (!hidden.value) { const exact = items.find(i => i.label.toLowerCase() === input.value.trim().toLowerCase()); if (exact) set(exact); } }, 120));
    input.addEventListener('keydown', (e) => {
      const lis = $$('li[data-id]', list);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) draw(); active = Math.max(0, Math.min(lis.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); lis.forEach((li, n) => li.setAttribute('aria-selected', String(n === active))); lis[active]?.scrollIntoView({ block: 'nearest' }); }
      if (e.key === 'Enter' && !list.hidden && lis[active]) { e.preventDefault(); set(items.find(i => i.id === lis[active].dataset.id)); }
      if (e.key === 'Escape' && !list.hidden) { e.stopPropagation(); e.preventDefault(); list.hidden = true; }
    });
    if (value) set(items.find(i => i.id === value));
  };
  App.pickerHtml = (name, label, placeholder = 'მოძებნე ბინა…') => `<div class="field"><span class="field-label">${label}</span><div class="picker" data-picker="${name}">
      <input type="text" class="input" placeholder="${placeholder}" autocomplete="off" role="combobox" aria-label="${label}" required data-error="აირჩიე ბინა სიიდან." />
      <ul class="picker-list" role="listbox" hidden></ul></div><input type="hidden" name="${name}" /></div>`;
  App.aptItems = () => S.data.apartments.filter(a => a.status !== 'archived').map(a => ({ id: a.id, label: a.name, sub: [a.address, a.city, H.owner(a.owner_id)?.name].filter(Boolean).join(' · ') }));

  const splitDT = (iso) => { const d = R.toDate(iso); return d ? [R.isoDate(d), R.time(d)] : ['', '']; };
  const joinDT = (d, t) => d ? new Date(`${d}T${t || '12:00'}`).toISOString() : null;

  // Inserts a row with a client-generated id. A duplicate-key error means a
  // previous attempt already saved it (e.g. response lost), so we reuse that row.
  App.insertOnce = async (table, row) => {
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (!error) return data;
    if (error.code === '23505') return q(sb.from(table).select('*').eq('id', row.id).single());
    throw error;
  };

  function openTaskForm({ task = null, apartmentId = null, type = null, prefill = {} } = {}) {
    if (!S.data.apartments.length) {
      return R.dialog({ title: 'ჯერ დაამატე ბინა', body: '<p class="dlg-text">საქმე ყოველთვის კონკრეტულ ბინას ეკუთვნის. დაამატე პირველი ბინა და შემდეგ შექმენი საქმე.</p>', submitLabel: 'ბინის დამატება', onSubmit: async () => { setTimeout(() => App.openApartmentForm(), 0); } });
    }
    const edit = Boolean(task);
    const t = task || { type: type || prefill.type || 'cleaning', priority: 'normal', apartment_id: apartmentId, ...prefill };
    const ids = { task: task?.id || R.uuid(), approval: R.uuid(), expense: R.uuid(), repair: R.uuid() };
    const [dueD, dueT] = splitDT(t.due_date);
    const [startD, startT] = splitDT(t.scheduled_start);
    const today = R.isoDate();
    const types = [['cleaning', 'დასუფთავება'], ['repair', 'რემონტი'], ['maintenance', 'ტექმომსახურება'], ['inspection', 'ინსპექცია'], ['other', 'სხვა']];

    R.dialog({
      title: edit ? 'საქმის რედაქტირება' : 'ახალი საქმე',
      wide: true,
      submitLabel: edit ? 'ცვლილებების შენახვა' : 'საქმის შექმნა',
      body: `<div class="form-stack">
        <div class="field"><span class="field-label">ტიპი</span><div class="seg" role="radiogroup" aria-label="ტიპი">${types.map(([v, l]) => `<label><input type="radio" name="type" value="${v}" ${t.type === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
        <div class="form-grid">
          ${App.pickerHtml('apartment_id', 'ბინა')}
          <label class="field"><span class="field-label">დასახელება</span><input name="title" required maxlength="140" value="${esc(t.title || '')}" data-error="ჩაწერე საქმის დასახელება." placeholder="მაგ.: დასუფთავება სტუმრების შემდეგ" /></label>
          <div class="field span-2" data-show="cleaning"><span class="field-label">დასუფთავების ფანჯარა</span>
            <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
              <input class="input" type="date" name="start_date" value="${startD || dueD || today}" aria-label="თარიღი" />
              <input class="input" type="time" name="start_time" value="${startT || '12:00'}" aria-label="დაწყება" />
              <input class="input" type="time" name="end_time" value="${dueT || '15:00'}" aria-label="დასრულება (ვადა)" />
            </div><span class="field-hint">გასვლიდან (check-out) შემდეგი სტუმრის შესვლამდე (check-in). დასრულების დრო = ვადა.</span></div>
          <div class="field" data-hide="cleaning"><span class="field-label">ვადა</span>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px"><input class="input" type="date" name="due_date" value="${dueD || today}" aria-label="ვადის თარიღი" /><input class="input" type="time" name="due_time" value="${dueT || '18:00'}" aria-label="ვადის დრო" /></div></div>
          <label class="field"><span class="field-label">შემსრულებელი</span><select name="assigned_to"><option value="">ჯერ არ დანიშნო</option>${H.staffMembers().map(m => `<option value="${m.id}" ${m.id === t.assigned_to ? 'selected' : ''}>${esc(m.display_name || 'უსახელო')} · ${openCount(m.id)} აქტიური</option>`).join('')}</select></label>
          <div class="field"><span class="field-label">პრიორიტეტი</span><div class="seg">${[['low', 'დაბალი'], ['normal', 'ჩვეულებრივი'], ['urgent', 'სასწრაფო']].map(([v, l]) => `<label><input type="radio" name="priority" value="${v}" ${t.priority === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></div>
          <label class="field span-2"><span class="field-label">აღწერა <span class="muted">(არასავალდებულო)</span></span><textarea name="description" rows="2" placeholder="რა უნდა გაკეთდეს, სად არის გასაღები, რას მიაქციოს ყურადღება">${esc(t.description || '')}</textarea></label>
          <label class="field span-2" ${edit && (t.checklist || []).length ? '' : 'data-show="cleaning inspection"'}><span class="field-label">ჩეკლისტი <span class="muted">(თითო პუნქტი ცალკე ხაზზე)</span></span><textarea name="checklist" rows="4">${esc((t.checklist || []).map(i => i.label).join('\n'))}</textarea></label>
        </div>
        ${edit ? '' : `<div class="form-section" data-show="repair maintenance">
          <div class="form-section-title">ხარჯი</div>
          <div class="choice-list">
            <label class="choice"><input type="radio" name="cost_mode" value="none" checked><span><strong>ხარჯი ჯერ უცნობია</strong><small>თანხას მოგვიანებით დაამატებ საქმის გვერდიდან.</small></span></label>
            <label class="choice"><input type="radio" name="cost_mode" value="estimate"><span><strong>მხოლოდ შეფასება</strong><small>ინფორმაციისთვის. ხარჯად არ ჩაითვლება და მფლობელს არ ეგზავნება.</small></span></label>
            <label class="choice"><input type="radio" name="cost_mode" value="approval"><span><strong>მფლობელის თანხმობის მოთხოვნა</strong><small>შეიქმნება „შეთავაზებული“ ხარჯი და ბმული მფლობელისთვის. ხარჯად ჩაითვლება მხოლოდ დადასტურების შემდეგ.</small></span></label>
            <label class="choice"><input type="radio" name="cost_mode" value="expense"><span><strong>უკვე გაწეული ხარჯი</strong><small>თანხა უკვე დაიხარჯა — ჩაიწერება „გაწეულ“ ხარჯად.</small></span></label>
          </div>
          <div class="form-grid" data-cost hidden>
            <label class="field"><span class="field-label">თანხა (₾)</span><input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" data-error="ჩაწერე თანხა." /></label>
            <label class="field" data-cost-receipt hidden><span class="field-label">ქვითარი <span class="muted">(არასავალდებულო)</span></span><input type="file" name="receipt" accept="image/*,application/pdf" /></label>
            <p class="field-hint span-2" data-owner-note></p>
          </div>
          <label class="field"><span class="field-label">ფოტო პრობლემის <span class="muted">(არასავალდებულო)</span></span><input type="file" name="photo" accept="image/*" /></label>
        </div>`}
      </div>`,
      onOpen: (form) => {
        App.picker(form, 'apartment_id', App.aptItems(), t.apartment_id);
        const titleInput = form.title;
        let titleTouched = Boolean(t.title);
        titleInput.addEventListener('input', () => { titleTouched = true; });
        const sync = () => {
          const type = form.type.value;
          $$('[data-show]', form).forEach(el => { el.hidden = !el.dataset.show.split(' ').includes(type); });
          $$('[data-hide]', form).forEach(el => { el.hidden = el.dataset.hide.split(' ').includes(type); });
          if (!edit && !titleTouched) titleInput.value = { cleaning: 'დასუფთავება', inspection: 'ინსპექცია' }[type] || '';
          const cl = form.checklist;
          if (!edit && (!cl.value.trim() || cl.dataset.auto === '1')) { cl.value = (CHECKLISTS[type] || []).join('\n'); cl.dataset.auto = '1'; }
          syncCost();
        };
        const syncCost = () => {
          if (edit) return;
          const mode = form.cost_mode.value;
          const box = $('[data-cost]', form);
          const shown = $('[data-show="repair maintenance"]', form).hidden === false && mode !== 'none';
          box.hidden = !shown;
          form.amount.required = shown;
          $('[data-cost-receipt]', form).hidden = mode !== 'expense';
          const apt = H.apt(form.apartment_id.value);
          const owner = apt && H.owner(apt.owner_id);
          const note = $('[data-owner-note]', form);
          note.textContent = mode === 'approval' ? (owner ? `თანხმობის ბმული გაეგზავნება: ${owner.name}${owner.phone ? ' (' + owner.phone + ')' : ''}.` : 'ამ ბინას მფლობელი არ ჰყავს მითითებული — თანხმობის მოთხოვნამდე მიუთითე მფლობელი ბინის გვერდზე.') : '';
          note.className = 'field-hint span-2' + (mode === 'approval' && !owner ? ' t-danger' : '');
        };
        form.checklist.addEventListener('input', () => { form.checklist.dataset.auto = ''; });
        $$('input[name=type]', form).forEach(i => i.addEventListener('change', sync));
        if (!edit) $$('input[name=cost_mode]', form).forEach(i => i.addEventListener('change', syncCost));
        form.apartment_id.addEventListener('change', syncCost);
        if (!edit && !t.checklist) form.checklist.dataset.auto = '1';
        sync();
      },
      onSubmit: async (form, v) => {
        const apt = H.apt(v.apartment_id);
        if (!apt) throw new Error('აირჩიე ბინა სიიდან.');
        const cleaning = v.type === 'cleaning';
        const due = cleaning ? joinDT(v.start_date, v.end_time) : joinDT(v.due_date, v.due_time);
        const start = cleaning ? joinDT(v.start_date, v.start_time) : null;
        if (cleaning && start && due && new Date(due) <= new Date(start)) throw new Error('დასრულების დრო დაწყებაზე გვიან უნდა იყოს.');
        const checklistLines = v.checklist.split('\n').map(s => s.trim()).filter(Boolean);
        const oldChecklist = task?.checklist || [];
        const checklist = checklistLines.map(label => ({ label, done: Boolean(oldChecklist.find(i => i.label === label)?.done) }));
        const mode = v.cost_mode || 'none';
        const amount = Number(v.amount || 0);
        if (mode === 'approval' && !apt.owner_id) throw new Error('ამ ბინას მფლობელი არ ჰყავს — თანხმობის მოთხოვნა შეუძლებელია.');
        if (mode !== 'none' && !(amount > 0)) throw new Error('ჩაწერე თანხა.');

        const fields = {
          apartment_id: apt.id, title: v.title.trim(), type: v.type, priority: v.priority || 'normal',
          assigned_to: v.assigned_to || null, due_date: due, scheduled_start: start, description: v.description.trim() || null, checklist,
        };

        if (edit) {
          const row = await q(sb.from('tasks').update(fields).eq('id', task.id).select().single());
          App.upsertLocal('tasks', row);
          App.logEvent(row.apartment_id, 'task_updated', `განახლდა: ${row.title}`, null, { task_id: row.id });
          App.render();
          toast('ცვლილებები შენახულია', { type: 'success' });
          return;
        }

        // Upload files first so a failure leaves nothing half-saved.
        if (!form.dataset.photoUrl && form.photo?.files[0]) form.dataset.photoUrl = await R.uploadFile(S.org.id, `tasks/${ids.task}`, form.photo.files[0]);
        if (mode === 'expense' && !form.dataset.receiptUrl && form.receipt?.files[0]) form.dataset.receiptUrl = await R.uploadFile(S.org.id, `receipts/${apt.id}`, form.receipt.files[0]);
        const photoUrl = form.dataset.photoUrl || null;

        const row = await App.insertOnce('tasks', {
          id: ids.task, organization_id: S.org.id, created_by: S.user.id, reservation_id: prefill.reservation_id || null,
          photos: photoUrl ? [{ url: photoUrl, phase: 'problem', at: new Date().toISOString() }] : [], ...fields,
        });
        App.upsertLocal('tasks', row);
        if (!form.dataset.logged) { App.logEvent(apt.id, 'task_created', `ახალი საქმე: ${row.title}`, row.assigned_to ? `დაინიშნა: ${H.memberName(row.assigned_to)}` : null, { task_id: row.id }); form.dataset.logged = '1'; }

        try {
          if (mode === 'estimate') {
            const rep = await App.insertOnce('repairs', { id: ids.repair, organization_id: S.org.id, apartment_id: apt.id, task_id: row.id, issue: row.title, estimate_amount: amount, status: 'estimated', requires_owner_approval: false, approval_status: 'not_requested' });
            S.data.repairs.push(rep);
          } else if (mode === 'approval') {
            await App.createApproval({ id: ids.approval, expenseId: ids.expense, apt, task: row, title: row.title, description: row.description, amount, category: v.type === 'repair' ? 'repair' : 'maintenance', photoUrl });
          } else if (mode === 'expense') {
            const exp = await App.insertOnce('expenses', { id: ids.expense, organization_id: S.org.id, apartment_id: apt.id, task_id: row.id, category: v.type === 'repair' ? 'repair' : 'maintenance', amount, description: row.title, expense_date: R.isoDate(), status: 'incurred', receipt_url: form.dataset.receiptUrl || null, created_by: S.user.id });
            App.upsertLocal('expenses', exp);
          }
        } catch (err) {
          App.render();
          throw new Error(`საქმე შეიქმნა, მაგრამ ხარჯი ვერ შეინახა (${R.friendlyError(err)}). დააჭირე „საქმის შექმნა“-ს ხელახლა — საქმე მეორედ არ შეიქმნება.`);
        }
        App.render();
        toast(`საქმე შეიქმნა: ${row.title}${row.assigned_to ? ' · დაინიშნა ' + H.memberName(row.assigned_to) : ''}`, { type: 'success', action: { label: 'გახსნა', fn: () => App.go(App.taskHref(row.id)) } });
      },
    });
  }
  App.openTaskForm = openTaskForm;
  App.setTaskFilter = (patch) => Object.assign(tf, patch);
  App.openAssign = openAssign;
  App.taskRows = taskRows;
  App.activityList = activityList;
  App.approvalsList = approvalsList;
  App.bindApprovalShare = bindApprovalShare;
  App.bindNextActions = bindNextActions;
  App.turnoverFor = turnoverFor;
  App.emptyInline = emptyInline;

  // Turnover: plan a cleaning between a check-out and the next check-in.
  function planTurnover(res) {
    const tv = turnoverFor(res);
    const start = tv.prev ? H.resTs(tv.prev.check_out, tv.prev.check_out_time) : new Date(tv.inTs.getTime() - 4 * 3600e3);
    openTaskForm({ apartmentId: res.apartment_id, type: 'cleaning', prefill: { type: 'cleaning', title: `დასუფთავება · ${res.guest_name}-ის შესვლამდე`, scheduled_start: start.toISOString(), due_date: tv.inTs.toISOString(), reservation_id: tv.prev?.id || null } });
  }
  App.planTurnover = planTurnover;
  App.planCleaningAfter = (res) => {
    const out = H.resTs(res.check_out, res.check_out_time);
    const next = S.data.reservations.filter(r => r.status !== 'cancelled' && r.apartment_id === res.apartment_id && r.check_in >= res.check_out && r.id !== res.id).sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
    const apt = H.apt(res.apartment_id);
    const end = next ? H.resTs(next.check_in, next.check_in_time) : new Date(out.getTime() + (apt?.cleaning_minutes || 180) * 60000);
    openTaskForm({ apartmentId: res.apartment_id, type: 'cleaning', prefill: { type: 'cleaning', title: `დასუფთავება · ${res.guest_name}-ის გასვლის შემდეგ`, scheduled_start: out.toISOString(), due_date: end.toISOString(), reservation_id: res.id } });
  };
})();
