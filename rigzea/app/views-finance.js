// Finances: expense workflow (proposed → approved → incurred → paid), income,
// per-apartment payout and monthly owner statements.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money } = R;
  const { S, H } = App;

  const ff = { month: R.monthKey(), apt: '', tab: 'expenses', status: 'all' };
  const sum = (l) => l.reduce((s, x) => s + Number(x.amount || 0), 0);
  const COUNTED = ['approved', 'incurred', 'paid']; // what statements charge to the owner
  const missingReceipt = (e) => ['incurred', 'paid'].includes(e.status) && e.receipt_required !== false && !e.receipt_url;

  App.views.finance = (r) => {
    if (r.id === 'statement' && r.sub) return renderStatement(r.sub);
    const st = r.params.get('status');
    if (st) { ff.status = st; ff.tab = 'expenses'; ff.month = ''; history.replaceState(null, '', '#/finance'); }

    const inScope = (d, aptId) => (!ff.month || String(d || '').startsWith(ff.month)) && (!ff.apt || aptId === ff.apt);
    const exp = S.data.expenses.filter(e => inScope(e.expense_date, e.apartment_id));
    const inc = S.data.income.filter(i => inScope(i.income_date, i.apartment_id));
    const by = (s) => exp.filter(e => e.status === s);
    const totals = {
      income: sum(inc), proposed: sum(by('proposed')), approved: sum(by('approved')), incurred: sum(by('incurred')), paid: sum(by('paid')),
    };
    const recorded = totals.incurred + totals.paid;
    const months = [...new Set([R.monthKey(), ...S.data.expenses.map(e => String(e.expense_date || '').slice(0, 7)), ...S.data.income.map(i => String(i.income_date || '').slice(0, 7))].filter(Boolean))].sort().reverse();

    $('#view').innerHTML = `
      <div class="page-head"><div><h1>ფინანსები</h1><p class="page-sub">ყველა თანხა ლარშია. შეთავაზებული ხარჯი გაწეულ ხარჯად არ ითვლება, სანამ არ დადასტურდება და არ დაიხარჯება.</p></div>
        <div class="page-actions"><button type="button" class="btn btn-secondary" id="f-inc">+ შემოსავალი</button><button type="button" class="btn btn-primary" id="f-exp">${icon('plus', 16)} ხარჯი</button></div></div>
      <div class="toolbar">
        <select class="input" id="f-month" aria-label="თვე"><option value="">ყველა პერიოდი</option>${months.map(m => `<option value="${m}" ${ff.month === m ? 'selected' : ''}>${esc(App.monthLabel(m))}</option>`).join('')}</select>
        <select class="input" id="f-apt" aria-label="ბინა"><option value="">ყველა ბინა</option>${S.data.apartments.map(a => `<option value="${a.id}" ${ff.apt === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      </div>
      <section class="card" style="margin-bottom:16px">
        <div class="stats">
          <div class="stat"><span class="stat-label">შემოსავალი</span><span class="stat-value t-ok">${money(totals.income)}</span><span class="stat-note">${inc.length} ჩანაწერი</span></div>
          <div class="stat"><span class="stat-label">შეთავაზებული</span><span class="stat-value">${money(totals.proposed)}</span><span class="stat-note">მფლობელის პასუხს ელოდება</span></div>
          <div class="stat"><span class="stat-label">დადასტურებული</span><span class="stat-value">${money(totals.approved)}</span><span class="stat-note">ჯერ არ არის გაწეული</span></div>
          <div class="stat"><span class="stat-label">გაწეული, გადასახდელი</span><span class="stat-value ${totals.incurred ? 't-warn' : ''}">${money(totals.incurred)}</span></div>
          <div class="stat"><span class="stat-label">გადახდილი</span><span class="stat-value">${money(totals.paid)}</span></div>
          <div class="stat"><span class="stat-label">წმინდა</span><span class="stat-value">${money(totals.income - recorded)}</span></div>
        </div>
        <p class="calc">წმინდა = შემოსავალი <b>${money(totals.income)}</b> − გაწეული <b>${money(totals.incurred)}</b> − გადახდილი <b>${money(totals.paid)}</b> = <b>${money(totals.income - recorded)}</b>. შეთავაზებული და დადასტურებული, ჯერ გაუწეველი ხარჯები აქ არ აკლდება.</p>
      </section>
      <div class="tabs" role="tablist">${[['expenses', 'ხარჯები', exp.length], ['income', 'შემოსავალი', inc.length], ['payout', 'ბინების მიხედვით', null], ['statements', 'ამონაწერები', S.data.statements.length]].map(([id, l, n]) => `<button type="button" role="tab" class="tab" data-tab="${id}" aria-selected="${ff.tab === id}">${l}${n !== null ? ` <span class="count">${n}</span>` : ''}</button>`).join('')}</div>
      <div id="f-body"></div>`;

    $('#f-month').onchange = (e) => { ff.month = e.target.value; App.render(); };
    $('#f-apt').onchange = (e) => { ff.apt = e.target.value; App.render(); };
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { ff.tab = b.dataset.tab; App.render(); }));
    $('#f-exp').onclick = () => openExpenseForm({ apartmentId: ff.apt || null });
    $('#f-inc').onclick = () => openIncomeForm({ apartmentId: ff.apt || null });
    const body = $('#f-body');
    ({ expenses: () => renderExpenses(body, exp), income: () => renderIncome(body, inc), payout: () => renderPayout(body, exp, inc), statements: () => renderStatements(body) })[ff.tab]();
  };

  // ---------------------------------------------------------------- expenses
  function expenseAction(e) {
    if (e.status === 'proposed') return e.approval_id ? `<span class="small muted">მფლობელს ელოდება</span>` : `<button type="button" class="btn btn-secondary btn-sm" data-x="approve" data-id="${e.id}">დადასტურება</button>`;
    if (e.status === 'approved') return `<button type="button" class="btn btn-secondary btn-sm" data-x="incur" data-id="${e.id}">გაწეულად მონიშვნა</button>`;
    if (e.status === 'incurred') return `${missingReceipt(e) ? `<button type="button" class="btn btn-ghost btn-sm" data-x="receipt" data-id="${e.id}">ქვითარი</button>` : ''}<button type="button" class="btn btn-secondary btn-sm" data-x="pay" data-id="${e.id}">გადახდილად მონიშვნა</button>`;
    if (e.status === 'paid' && missingReceipt(e)) return `<button type="button" class="btn btn-secondary btn-sm" data-x="receipt" data-id="${e.id}">ქვითრის ატვირთვა</button>`;
    return '';
  }

  function renderExpenses(root, exp) {
    const F = [['all', 'ყველა'], ['proposed', 'შეთავაზებული'], ['approved', 'დადასტურებული'], ['incurred', 'გაწეული'], ['paid', 'გადახდილი'], ['declined', 'უარყოფილი'], ['missing', 'ქვითარი აკლია']];
    const match = (e, s) => s === 'all' ? true : s === 'missing' ? missingReceipt(e) : e.status === s;
    const list = exp.filter(e => match(e, ff.status));
    const cols = '90px minmax(0,1.6fr) minmax(0,1.2fr) 110px 130px 110px 210px';
    root.innerHTML = `<div class="chips">${F.map(([id, l]) => `<button type="button" class="chip" data-fs="${id}" aria-pressed="${ff.status === id}">${l} <span class="count">${exp.filter(e => match(e, id)).length}</span></button>`).join('')}</div>
      <section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>თარიღი</span><span>ხარჯი</span><span>ბინა</span><span class="cell-right">თანხა</span><span>სტატუსი</span><span>ქვითარი</span><span></span></div>
        ${list.map(e => `<div class="row" style="--cols:${cols}">
          <span class="cell-meta cell-hide-m">${esc(R.date(e.expense_date))}</span>
          <span class="cell-main"><strong>${esc(e.description || L.expenseCategory[e.category])}</strong><span>${esc(L.expenseCategory[e.category] || e.category)}${e.vendor ? ' · ' + esc(e.vendor) : ''}${e.charge_to_owner === false ? ' · კომპანიის ხარჯი' : ''}</span></span>
          <span class="cell-meta">${esc(H.aptName(e.apartment_id))} <span class="muted m-only">· ${esc(R.date(e.expense_date))}</span></span>
          <span class="cell-right num strong">${money(e.amount)}</span>
          <span class="cell-status">${R.expenseBadge(e.status)}</span>
          <span class="cell-meta">${e.receipt_url ? `<a href="${esc(e.receipt_url)}" target="_blank" rel="noopener">${icon('file', 14)} ნახვა</a>` : missingReceipt(e) ? '<span class="t-warn">აკლია</span>' : '<span class="muted">—</span>'}</span>
          <span class="cell-actions">${expenseAction(e)}</span>
        </div>`).join('')}
        <div class="row" style="--cols:minmax(0,1fr) auto"><span class="muted">ჯამი · ${list.length} ჩანაწერი</span><span class="num strong">${money(sum(list))}</span></div>
      </div>` : `<div class="empty">${icon('wallet', 28)}<h3>ხარჯი ვერ მოიძებნა</h3><p>ჩაწერე ხარჯი ქვითრით — მაგ.: „დასუფთავება, ₾80“. თუ ხარჯს მფლობელის თანხმობა სჭირდება, აირჩიე „თანხმობის მოთხოვნა“.</p><button type="button" class="btn btn-primary" id="f-exp-empty">ხარჯის ჩაწერა</button></div>`}</section>`;
    $$('[data-fs]', root).forEach(b => b.addEventListener('click', () => { ff.status = b.dataset.fs; App.render(); }));
    $('#f-exp-empty')?.addEventListener('click', () => openExpenseForm({ apartmentId: ff.apt || null }));
    $$('[data-x]', root).forEach(b => b.addEventListener('click', () => {
      const e = S.data.expenses.find(x => x.id === b.dataset.id);
      ({ approve: () => moveExpense(e, 'approved', b), incur: () => openIncur(e), pay: () => payExpense(e, b), receipt: () => openReceipt(e) })[b.dataset.x]();
    }));
  }

  async function saveExpense(e, patch, title) {
    const row = await q(sb.from('expenses').update(patch).eq('id', e.id).select().single());
    App.upsertLocal('expenses', row);
    App.logEvent(row.apartment_id, 'expense_' + (patch.status || 'updated'), title, `${row.description || ''} · ${money(row.amount)}`, { expense_id: row.id, task_id: row.task_id });
    App.render();
    return row;
  }

  function moveExpense(e, status, btn) {
    return run(btn, () => saveExpense(e, { status }, `ხარჯი: ${L.expense[status]}`), { success: `ხარჯი: ${L.expense[status]}` });
  }

  async function payExpense(e, btn) {
    const ok = await R.confirm({ title: 'გადახდილად მონიშვნა', message: `${e.description || 'ხარჯი'} · ${money(e.amount)} — დაადასტურე, რომ თანხა გადახდილია.${missingReceipt(e) ? ' ქვითარი ჯერ არ არის ატვირთული.' : ''}`, confirmLabel: 'გადახდილია' });
    if (!ok) return;
    run(btn, async () => {
      const row = await saveExpense(e, { status: 'paid' }, 'ხარჯი გადახდილია');
      toast('ხარჯი გადახდილად მოინიშნა', { type: 'success', action: { label: 'დაბრუნება', fn: () => run(null, () => saveExpense(row, { status: 'incurred' }, 'გადახდა გაუქმდა')) } });
    });
  }

  function openIncur(e) {
    return R.dialog({
      title: 'გაწეულად მონიშვნა', subtitle: `${e.description || ''} · ${money(e.amount)}`, submitLabel: 'შენახვა',
      body: `<div class="form-stack">
        <label class="field"><span class="field-label">ფაქტობრივი თანხა (₾)</span><input type="number" name="amount" required min="0.01" step="0.01" value="${esc(e.amount)}" /></label>
        <label class="field"><span class="field-label">თარიღი</span><input type="date" name="date" required value="${R.isoDate()}" /></label>
        <label class="field"><span class="field-label">ქვითარი</span><input type="file" name="receipt" accept="image/*,application/pdf" /><span class="field-hint">ქვითრის გარეშეც შეინახება, მაგრამ „ქვითარი აკლია“ სიაში გამოჩნდება.</span></label>
        <label class="check"><input type="checkbox" name="paid" /> <span>უკვე გადახდილია</span></label>
      </div>`,
      onSubmit: async (form, v) => {
        if (!form.dataset.url && form.receipt.files[0]) form.dataset.url = await R.uploadFile(S.org.id, `receipts/${e.apartment_id}`, form.receipt.files[0]);
        await saveExpense(e, { status: v.paid ? 'paid' : 'incurred', amount: Number(v.amount), expense_date: v.date, receipt_url: form.dataset.url || e.receipt_url || null }, v.paid ? 'ხარჯი გადახდილია' : 'ხარჯი გაწეულია');
        toast(v.paid ? 'ხარჯი გადახდილად მოინიშნა' : 'ხარჯი გაწეულად მოინიშნა', { type: 'success' });
      },
    });
  }

  function openReceipt(e) {
    return R.dialog({
      title: 'ქვითრის ატვირთვა', subtitle: `${e.description || ''} · ${money(e.amount)}`, submitLabel: 'ატვირთვა',
      body: `<label class="field"><span class="field-label">ფაილი (ფოტო ან PDF, მაქს. 10 მბ)</span><input type="file" name="receipt" required accept="image/*,application/pdf" data-error="აირჩიე ფაილი." /></label>`,
      onSubmit: async (form) => {
        if (!form.dataset.url) form.dataset.url = await R.uploadFile(S.org.id, `receipts/${e.apartment_id}`, form.receipt.files[0]);
        await saveExpense(e, { receipt_url: form.dataset.url }, 'ქვითარი აიტვირთა');
        toast('ქვითარი აიტვირთა', { type: 'success' });
      },
    });
  }

  // ---------------------------------------------------------------- expense form
  function openExpenseForm({ apartmentId = null, task = null } = {}) {
    if (!S.data.apartments.length) return R.confirm({ title: 'ჯერ დაამატე ბინა', message: 'ხარჯი ყოველთვის კონკრეტულ ბინას ეკუთვნის.', confirmLabel: 'ბინის დამატება' }).then(ok => ok && App.openApartmentForm());
    const ids = { expense: R.uuid(), approval: R.uuid() };
    return R.dialog({
      title: 'ხარჯის ჩაწერა', subtitle: task ? task.title : '', submitLabel: 'ხარჯის შენახვა', wide: true,
      body: `<div class="form-grid">
        ${App.pickerHtml('apartment_id', 'ბინა')}
        <label class="field"><span class="field-label">თანხა (₾)</span><input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" data-error="ჩაწერე თანხა." /></label>
        <label class="field"><span class="field-label">აღწერა</span><input name="description" required maxlength="140" value="${esc(task?.title || '')}" placeholder="მაგ.: გენერალური დასუფთავება" data-error="აღწერე ხარჯი." /></label>
        <label class="field"><span class="field-label">კატეგორია</span><select name="category">${Object.entries(L.expenseCategory).map(([k, l]) => `<option value="${k}" ${task && ['repair', 'maintenance', 'cleaning'].includes(task.type) && task.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">თარიღი</span><input type="date" name="expense_date" required value="${R.isoDate()}" /></label>
        <label class="field"><span class="field-label">მომწოდებელი / შემსრულებელი</span><input name="vendor" placeholder="არასავალდებულო" /></label>
        <div class="field span-2"><span class="field-label">სტატუსი</span><div class="choice-list">
          <label class="choice"><input type="radio" name="status" value="paid" checked><span><strong>გადახდილია</strong><small>თანხა უკვე გადაიხადე.</small></span></label>
          <label class="choice"><input type="radio" name="status" value="incurred"><span><strong>გაწეულია, გადასახდელია</strong><small>სამუშაო შესრულდა, ანგარიშსწორება მოგვიანებით.</small></span></label>
          <label class="choice"><input type="radio" name="status" value="proposed"><span><strong>საჭიროებს მფლობელის თანხმობას</strong><small>შეიქმნება „შეთავაზებული“ ხარჯი და თანხმობის ბმული. ხარჯად ჩაითვლება მხოლოდ დადასტურების შემდეგ.</small></span></label>
        </div></div>
        <label class="field" data-receipt><span class="field-label">ქვითარი</span><input type="file" name="receipt" accept="image/*,application/pdf" /><span class="field-hint">ფოტო ან PDF. ქვითრის გარეშე ხარჯი „ქვითარი აკლია“ სიაში გამოჩნდება.</span></label>
        <label class="check span-2"><input type="checkbox" name="charge_to_owner" checked /> <span>ეკისრება მფლობელს (შედის ამონაწერში)</span></label>
        <p class="field-hint span-2" data-owner></p>
      </div>`,
      onOpen: (form) => {
        App.picker(form, 'apartment_id', App.aptItems(), apartmentId || task?.apartment_id);
        const sync = () => {
          const st = form.status.value;
          $('[data-receipt]', form).hidden = st === 'proposed';
          const apt = H.apt(form.apartment_id.value);
          const p = $('[data-owner]', form);
          p.textContent = st === 'proposed' ? (apt && apt.owner_id ? `თანხმობის ბმული მომზადდება მფლობელისთვის: ${H.owner(apt.owner_id).name}.` : 'თანხმობისთვის ბინას მფლობელი უნდა ჰყავდეს მითითებული.') : '';
          p.className = 'field-hint span-2' + (st === 'proposed' && apt && !apt.owner_id ? ' t-danger' : '');
        };
        $$('input[name=status]', form).forEach(i => i.addEventListener('change', sync));
        form.apartment_id.addEventListener('change', sync);
        sync();
      },
      onSubmit: async (form, v) => {
        const apt = H.apt(v.apartment_id);
        if (!apt) throw new Error('აირჩიე ბინა სიიდან.');
        const amount = Number(v.amount);
        if (v.status === 'proposed') {
          if (!apt.owner_id) throw new Error('ამ ბინას მფლობელი არ ჰყავს — თანხმობის მოთხოვნა შეუძლებელია.');
          await App.createApproval({ id: ids.approval, expenseId: ids.expense, apt, task, title: v.description.trim(), description: '', amount, category: v.category });
          App.render();
          return;
        }
        if (!form.dataset.url && form.receipt.files[0]) form.dataset.url = await R.uploadFile(S.org.id, `receipts/${apt.id}`, form.receipt.files[0]);
        const row = await App.insertOnce('expenses', {
          id: ids.expense, organization_id: S.org.id, apartment_id: apt.id, task_id: task?.id || null, category: v.category, amount,
          description: v.description.trim(), vendor: v.vendor.trim() || null, expense_date: v.expense_date, status: v.status,
          receipt_url: form.dataset.url || null, charge_to_owner: Boolean(v.charge_to_owner), created_by: S.user.id,
        });
        App.upsertLocal('expenses', row);
        App.logEvent(apt.id, 'expense_created', `ხარჯი: ${row.description}`, money(row.amount), { expense_id: row.id, task_id: row.task_id });
        App.render();
        toast(`ხარჯი შენახულია · ${money(row.amount)}${row.receipt_url ? '' : ' · ქვითარი აკლია'}`, { type: 'success' });
      },
    });
  }
  App.openExpenseForm = openExpenseForm;

  // ---------------------------------------------------------------- income
  function renderIncome(root, inc) {
    const today = R.isoDate();
    const unrecorded = S.data.reservations.filter(r => r.status !== 'cancelled' && r.check_out <= today && Number(r.expected_income) > 0 && !S.data.income.some(i => i.reservation_id === r.id) && (!ff.apt || r.apartment_id === ff.apt));
    const cols = '90px minmax(0,1.6fr) minmax(0,1.2fr) 120px 120px';
    root.innerHTML = `
      ${unrecorded.length ? `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>დასრულებული ჯავშნები, შემოსავალი ჯერ არ არის აღრიცხული <span class="count">${unrecorded.length}</span></h2></div>
        <div class="rows">${unrecorded.map(r => `<div class="row" style="--cols:minmax(0,1fr) auto auto"><span class="cell-main"><strong>${esc(r.guest_name)} · ${esc(L.source[r.source] || r.source)}</strong><span>${esc(H.aptName(r.apartment_id))} · ${esc(R.date(r.check_in))} → ${esc(R.date(r.check_out))}</span></span><span class="num strong">${money(r.expected_income)}</span><button type="button" class="btn btn-secondary btn-sm" data-rec="${r.id}">აღრიცხვა</button></div>`).join('')}</div></section>` : ''}
      <section class="card">${inc.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>თარიღი</span><span>აღწერა</span><span>ბინა</span><span>წყარო</span><span class="cell-right">თანხა</span></div>
        ${inc.map(i => `<div class="row" style="--cols:${cols}"><span class="cell-meta cell-hide-m">${esc(R.date(i.income_date))}</span><span class="cell-main"><strong>${esc(i.description || 'შემოსავალი')}</strong><span>${esc(R.date(i.income_date))}</span></span><span class="cell-meta">${esc(H.aptName(i.apartment_id))}</span><span class="cell-meta">${esc(i.source || '—')}</span><span class="cell-right num strong t-ok">${money(i.amount)}</span></div>`).join('')}
        <div class="row" style="--cols:minmax(0,1fr) auto"><span class="muted">ჯამი · ${inc.length} ჩანაწერი</span><span class="num strong">${money(sum(inc))}</span></div></div>`
      : `<div class="empty">${icon('wallet', 28)}<h3>შემოსავალი ვერ მოიძებნა</h3><p>ჩაწერე ჯავშნიდან მიღებული თანხა — მაგ.: „Airbnb, 4 ღამე, ₾1 450“.</p><button type="button" class="btn btn-primary" id="f-inc-empty">შემოსავლის ჩაწერა</button></div>`}</section>`;
    $('#f-inc-empty')?.addEventListener('click', () => openIncomeForm({ apartmentId: ff.apt || null }));
    $$('[data-rec]', root).forEach(b => b.addEventListener('click', () => {
      const r = S.data.reservations.find(x => x.id === b.dataset.rec);
      openIncomeForm({ apartmentId: r.apartment_id, reservation: r });
    }));
  }

  function openIncomeForm({ apartmentId = null, reservation = null } = {}) {
    const id = R.uuid();
    return R.dialog({
      title: 'შემოსავლის ჩაწერა', submitLabel: 'შენახვა',
      body: `<div class="form-grid">
        ${App.pickerHtml('apartment_id', 'ბინა')}
        <label class="field"><span class="field-label">თანხა (₾)</span><input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" value="${esc(reservation?.expected_income || '')}" data-error="ჩაწერე თანხა." /></label>
        <label class="field"><span class="field-label">თარიღი</span><input type="date" name="income_date" required value="${esc(reservation?.check_out || R.isoDate())}" /></label>
        <label class="field"><span class="field-label">წყარო</span><select name="source">${['Airbnb', 'Booking', 'პირდაპირი', 'სხვა'].map(s => `<option ${reservation && (L.source[reservation.source] || '').startsWith(s) ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field span-2"><span class="field-label">აღწერა</span><input name="description" value="${esc(reservation ? `${reservation.guest_name} · ${R.date(reservation.check_in)}–${R.date(reservation.check_out)}` : '')}" placeholder="მაგ.: ჯავშანი · 4 ღამე" /></label>
      </div>`,
      onOpen: (form) => App.picker(form, 'apartment_id', App.aptItems(), apartmentId),
      onSubmit: async (_f, v) => {
        if (!H.apt(v.apartment_id)) throw new Error('აირჩიე ბინა სიიდან.');
        const row = await App.insertOnce('income', { id, organization_id: S.org.id, apartment_id: v.apartment_id, amount: Number(v.amount), income_date: v.income_date, source: v.source, description: v.description.trim() || null, reservation_id: reservation?.id || null });
        App.upsertLocal('income', row);
        App.logEvent(row.apartment_id, 'income_created', `შემოსავალი: ${money(row.amount)}`, row.description);
        App.render();
        toast(`შემოსავალი შენახულია · ${money(row.amount)}`, { type: 'success' });
      },
    });
  }
  App.openIncomeForm = openIncomeForm;

  // ---------------------------------------------------------------- payout per apartment
  function renderPayout(root, exp, inc) {
    const apts = S.data.apartments.filter(a => (!ff.apt || a.id === ff.apt) && (a.status !== 'archived' || inc.some(i => i.apartment_id === a.id) || exp.some(e => e.apartment_id === a.id)));
    const rows = apts.map(a => {
      const i = sum(inc.filter(x => x.apartment_id === a.id));
      const e = sum(exp.filter(x => x.apartment_id === a.id && x.charge_to_owner !== false && COUNTED.includes(x.status)));
      const pct = Number(a.commission_pct || 0);
      const c = Math.round(i * pct) / 100;
      return { a, i, e, pct, c, net: i - e - c };
    });
    const T = rows.reduce((t, r) => ({ i: t.i + r.i, e: t.e + r.e, c: t.c + r.c, net: t.net + r.net }), { i: 0, e: 0, c: 0, net: 0 });
    const cols = 'minmax(0,1.6fr) 120px 120px 140px 130px';
    root.innerHTML = `<section class="card">${rows.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>ბინა · მფლობელი</span><span class="cell-right">შემოსავალი</span><span class="cell-right">ხარჯი</span><span class="cell-right">საკომისიო</span><span class="cell-right">მფლობელს</span></div>
      ${rows.map(r => `<a class="row" href="#/apartments/${r.a.id}" style="--cols:${cols}"><span class="cell-main"><strong>${esc(r.a.name)}</strong><span>${esc(H.owner(r.a.owner_id)?.name || 'მფლობელი არ არის')}</span></span>
        <span class="cell-meta cell-right num" data-label="შემოსავალი">${money(r.i)}</span><span class="cell-meta cell-right num" data-label="ხარჯი">−${money(r.e)}</span>
        <span class="cell-meta cell-right num" data-label="საკომისიო">−${money(r.c)} <span class="muted">(${r.pct}%)</span></span><span class="cell-right num strong">${money(r.net)}</span></a>`).join('')}
      <div class="row" style="--cols:${cols}"><span class="strong">ჯამი</span><span class="cell-meta cell-right num">${money(T.i)}</span><span class="cell-meta cell-right num">−${money(T.e)}</span><span class="cell-meta cell-right num">−${money(T.c)}</span><span class="cell-right num strong">${money(T.net)}</span></div></div>
      <p class="calc">მფლობელს = შემოსავალი − მფლობელზე დაკისრებული ხარჯი (დადასტურებული, გაწეული და გადახდილი) − მართვის საკომისიო (% შემოსავლიდან). იგივე წესით ითვლება ამონაწერი. შეთავაზებული ხარჯი არ აკლდება.</p>`
      : App.emptyInline('ბინა არ არის.')}</section>`;
  }

  // ---------------------------------------------------------------- statements
  function renderStatements(root) {
    const list = S.data.statements.filter(s => (!ff.apt || s.apartment_id === ff.apt) && (!ff.month || s.month_period === ff.month));
    const cols = 'minmax(0,1.6fr) 140px 120px 120px 130px';
    root.innerHTML = `<div class="toolbar"><button type="button" class="btn btn-primary btn-sm" id="st-new">ამონაწერის მომზადება</button><span class="small muted">ამონაწერი ითვლის თვის შემოსავალს, მფლობელზე დაკისრებულ ხარჯს და საკომისიოს. დასრულებისას მფლობელი შეტყობინებას მიიღებს.</span></div>
      <section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>ბინა</span><span>თვე</span><span class="cell-right">შემოსავალი</span><span class="cell-right">მფლობელს</span><span>სტატუსი</span></div>
        ${list.map(s => `<a class="row" href="#/finance/statement/${s.id}" style="--cols:${cols}"><span class="cell-main"><strong>${esc(H.aptName(s.apartment_id))}</strong><span>${esc(H.owner(s.owner_id)?.name || '')}</span></span><span class="cell-meta">${esc(App.monthLabel(s.month_period))}</span><span class="cell-meta cell-right num">${money(s.total_income)}</span><span class="cell-right num strong">${money(s.net_result)}</span><span class="cell-status">${R.badge(L.statement[s.status], L.statementTone[s.status])}</span></a>`).join('')}</div>`
      : `<div class="empty">${icon('file', 28)}<h3>ამონაწერი ჯერ არ არის</h3><p>მოამზადე თვიური ამონაწერი ბინისთვის — სისტემა თავად დაითვლის შემოსავალს, ხარჯს, საკომისიოს და მფლობელის წმინდა ანაზღაურებას.</p></div>`}</section>`;
    $('#st-new').onclick = () => R.dialog({
      title: 'ამონაწერის მომზადება', submitLabel: 'მომზადება',
      body: `<div class="form-stack">${App.pickerHtml('apartment_id', 'ბინა')}<label class="field"><span class="field-label">თვე</span><input type="month" name="month" required value="${ff.month || prevMonth()}" /></label></div>`,
      onOpen: (form) => App.picker(form, 'apartment_id', App.aptItems(), ff.apt || null),
      onSubmit: async (_f, v) => {
        if (!H.apt(v.apartment_id)) throw new Error('აირჩიე ბინა სიიდან.');
        const id = await q(sb.rpc('generate_statement', { p_apartment: v.apartment_id, p_month: v.month }));
        const row = await q(sb.from('monthly_reports').select('*').eq('id', id).single());
        App.upsertLocal('statements', row);
        App.go(`#/finance/statement/${id}`);
      },
    });
  }
  const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return R.monthKey(d); };

  function renderStatement(id) {
    const s = S.data.statements.find(x => x.id === id);
    if (!s) { $('#view').innerHTML = `<div class="card"><div class="empty"><h3>ამონაწერი ვერ მოიძებნა</h3><a class="btn btn-secondary" href="#/finance">ფინანსები</a></div></div>`; return; }
    const snap = s.snapshot_data || {};
    const apt = H.apt(s.apartment_id);
    const owner = H.owner(s.owner_id);
    const incomeLines = snap.income || [];
    const expenseLines = snap.expenses || [];
    $('#view').innerHTML = `
      <div class="page-head"><div><div class="crumbs"><a href="#/finance">ფინანსები</a> ›</div><h1>ამონაწერი · ${esc(App.monthLabel(s.month_period))}</h1><p class="page-sub">${esc(apt?.name || snap.apartment || '')} · ${R.badge(L.statement[s.status], L.statementTone[s.status])}</p></div>
        <div class="page-actions">
          ${s.status === 'draft' ? `<button type="button" class="btn btn-secondary" id="st-regen">${icon('refresh', 16)} ხელახლა დათვლა</button><button type="button" class="btn btn-primary" id="st-final">დასრულება</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="window.print()">${icon('printer', 16)} ბეჭდვა / PDF</button>
        </div></div>
      ${s.status === 'draft' ? `<div class="notice" style="margin-bottom:16px">${icon('alert', 16)}<div>ეს მონახაზია. შეამოწმე ჩანაწერები და დააჭირე „დასრულებას“ — ${owner?.user_id ? 'მფლობელი შეტყობინებას მიიღებს' : 'შემდეგ ამობეჭდე ან გაუგზავნე PDF მფლობელს'}. დასრულების შემდეგ ციფრები აღარ შეიცვლება.</div></div>` : ''}
      <section class="card">
        <div class="card-body">
          <div class="print-only" style="margin-bottom:12px"><strong>${esc(S.org.name)}</strong> · ამონაწერი · ${esc(App.monthLabel(s.month_period))}</div>
          <dl class="kv"><dt>ბინა</dt><dd>${esc(apt?.name || snap.apartment || '')}${apt?.address ? ', ' + esc(apt.address) : ''}</dd><dt>მფლობელი</dt><dd>${esc(owner?.name || '—')}</dd><dt>პერიოდი</dt><dd>${esc(App.monthLabel(s.month_period))}</dd><dt>მომზადდა</dt><dd>${esc(R.dateTime(s.updated_at || s.created_at))}</dd></dl>
        </div>
        <div class="card-head"><h2>შემოსავალი</h2></div>
        ${incomeLines.length ? `<div class="rows">${incomeLines.map(i => `<div class="row" style="--cols:90px minmax(0,1fr) auto"><span class="muted">${esc(R.date(i.date))}</span><span>${esc(i.description || i.source || '')}</span><span class="num">${money(i.amount)}</span></div>`).join('')}</div>` : App.emptyInline('ამ თვეში შემოსავალი არ არის.')}
        <div class="card-head"><h2>ხარჯები</h2></div>
        ${expenseLines.length ? `<div class="rows">${expenseLines.map(e => `<div class="row" style="--cols:90px minmax(0,1fr) auto"><span class="muted">${esc(R.date(e.date))}</span><span>${esc(e.description || L.expenseCategory[e.category] || '')} <span class="muted small">· ${esc(L.expense[e.status] || '')}</span>${e.receipt_url ? ` · <a href="${esc(e.receipt_url)}" target="_blank" rel="noopener">ქვითარი</a>` : ''}</span><span class="num">−${money(e.amount)}</span></div>`).join('')}</div>` : App.emptyInline('ამ თვეში მფლობელზე დაკისრებული ხარჯი არ არის.')}
        <div class="rows" style="border-top:1px solid var(--line)">
          <div class="row" style="--cols:minmax(0,1fr) auto"><span>შემოსავალი</span><span class="num">${money(s.total_income)}</span></div>
          <div class="row" style="--cols:minmax(0,1fr) auto"><span>ხარჯი</span><span class="num">−${money(s.total_expenses)}</span></div>
          <div class="row" style="--cols:minmax(0,1fr) auto"><span>მართვის საკომისიო (${Number(snap.commission_pct || 0)}%)</span><span class="num">−${money(s.commission)}</span></div>
          <div class="row" style="--cols:minmax(0,1fr) auto"><strong>მფლობელის წმინდა ანაზღაურება</strong><strong class="num">${money(s.net_result)}</strong></div>
        </div>
        <p class="calc">${money(s.total_income)} − ${money(s.total_expenses)} − ${money(s.commission)} = <b>${money(s.net_result)}</b></p>
      </section>`;
    $('#st-regen')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
      await q(sb.rpc('generate_statement', { p_apartment: s.apartment_id, p_month: s.month_period }));
      App.upsertLocal('statements', await q(sb.from('monthly_reports').select('*').eq('id', s.id).single()));
      App.render();
    }, { success: 'ამონაწერი ხელახლა დაითვალა' }));
    $('#st-final')?.addEventListener('click', async (e) => {
      const ok = await R.confirm({ title: 'ამონაწერის დასრულება', message: `მფლობელის ანაზღაურება: ${money(s.net_result)}. დასრულების შემდეგ ამონაწერი აღარ შეიცვლება.`, confirmLabel: 'დასრულება' });
      if (!ok) return;
      run(e.target, async () => {
        const row = await q(sb.from('monthly_reports').update({ status: 'finalized' }).eq('id', s.id).select().single());
        App.upsertLocal('statements', row);
        App.logEvent(s.apartment_id, 'statement_finalized', `ამონაწერი დასრულდა · ${App.monthLabel(s.month_period)}`, money(s.net_result));
        App.render();
      }, { success: 'ამონაწერი დასრულდა' });
    });
  }
})();
