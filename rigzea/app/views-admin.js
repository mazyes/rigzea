// Team (members, invitations), organization settings and Excel/CSV import.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money } = R;
  const { S, H } = App;

  // ===========================================================================
  // TEAM
  // ===========================================================================
  let invitations = null;
  let invitationsError = null;

  async function loadInvitations() {
    try { invitations = await q(sb.from('invitations').select('*').eq('organization_id', S.org.id).order('created_at', { ascending: false })); invitationsError = null; }
    catch (err) { invitationsError = err; invitations = []; }
  }

  App.views.team = () => {
    if (invitations === null) { loadInvitations().then(() => App.route().name === 'team' && App.render()); }
    const members = S.data.members.slice().sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    const pendingInv = (invitations || []).filter(i => i.status === 'pending');
    const cols = 'minmax(0,1.6fr) 170px minmax(0,1fr) 130px 160px';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>გუნდი</h1><p class="page-sub">${members.length} წევრი · თანამშრომლები ხედავენ მხოლოდ თავიანთ დანიშნულ საქმეებს ტელეფონიდან.</p></div>
        <div class="page-actions">${App.isAdmin() ? `<button type="button" class="btn btn-primary" id="t-invite">${icon('plus', 16)} წევრის მოწვევა</button>` : ''}</div></div>
      <section class="card" style="margin-bottom:16px"><div class="rows"><div class="rows-head" style="--cols:${cols}"><span>წევრი</span><span>როლი</span><span>ტელეფონი</span><span>აქტიური საქმე</span><span></span></div>
        ${members.map(m => {
          const open = S.data.tasks.filter(t => t.assigned_to === m.id && H.isOpen(t));
          const overdue = open.filter(H.isOverdue).length;
          const self = m.user_id === S.user.id;
          return `<div class="row" style="--cols:${cols}"><span class="cell-main"><strong>${esc(m.display_name || 'უსახელო')}${self ? ' <span class="muted">(შენ)</span>' : ''}</strong><span>წევრია ${esc(R.date(m.created_at))}-დან</span></span>
            <span class="cell-meta">${App.isAdmin() && !self && m.role !== 'owner' ? `<select class="input" data-role="${m.id}" aria-label="როლი" style="min-height:32px">${['admin', 'manager', 'staff'].map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${L.role[r]}</option>`).join('')}</select>` : esc(L.role[m.role])}</span>
            <span class="cell-meta">${m.phone ? `<a href="tel:${esc(m.phone)}">${esc(m.phone)}</a>` : '—'}</span>
            <span class="cell-meta" data-label="საქმე"><a href="#/tasks" data-filter-assignee="${m.id}">${open.length}</a>${overdue ? ` <span class="t-danger">(${overdue} ვადაგადაც.)</span>` : ''}</span>
            <span class="cell-actions">${App.isAdmin() && !self && m.role !== 'owner' ? `<button type="button" class="btn btn-ghost btn-sm" data-remove="${m.id}">გუნდიდან ამოშლა</button>` : ''}</span></div>`;
        }).join('')}</div></section>
      <section class="card"><div class="card-head"><h2>მოწვევები <span class="count">${pendingInv.length}</span></h2></div>
        ${invitations === null ? '<div class="skeleton"><i></i><i></i></div>' : invitationsError ? `<div class="error-state"><p>მოწვევები ვერ ჩაიტვირთა. ${esc(R.friendlyError(invitationsError))}</p><button class="btn btn-secondary btn-sm" id="t-inv-retry">ხელახლა ცდა</button></div>`
          : pendingInv.length ? `<div class="rows">${pendingInv.map(i => `<div class="row" style="--cols:minmax(0,1fr) 150px auto"><span class="cell-main"><strong>${esc(i.email)}</strong><span>გაიგზავნა ${esc(R.date(i.created_at))}</span></span><span class="cell-meta">${esc(L.role[i.role])}</span><span class="cell-actions">${App.isAdmin() ? `<button type="button" class="btn btn-ghost btn-sm" data-cancel-inv="${i.id}">გაუქმება</button>` : ''}</span></div>`).join('')}</div>`
          : App.emptyInline('ღია მოწვევა არ არის.')}
        <div class="card-foot">მოწვეული ადამიანი რეგისტრირდება მისამართზე <strong>${esc(location.origin)}/app/</strong> იმავე ელფოსტით — სამუშაო სივრცე ავტომატურად დაემატება. ელფოსტით ავტომატური გაგზავნა ჯერ არ არის ჩართული, ამიტომ ბმული თავად გაუგზავნე. <button type="button" class="link-btn" id="t-copy">ბმულის კოპირება</button></div>
      </section>`;

    $('#t-invite')?.addEventListener('click', openInvite);
    $('#t-copy').onclick = () => R.copyText(`${location.origin}/app/`, 'ბმული დაკოპირდა');
    $('#t-inv-retry')?.addEventListener('click', () => { invitations = null; App.render(); });
    $$('[data-filter-assignee]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); App.setTaskFilter({ assignee: a.dataset.filterAssignee, status: 'active' }); App.go('#/tasks'); }));
    $$('[data-role]').forEach(sel => sel.addEventListener('change', () => {
      const m = H.member(sel.dataset.role);
      const prev = m.role;
      run(null, async () => {
        const row = await q(sb.from('organization_members').update({ role: sel.value }).eq('id', m.id).select().single());
        App.upsertLocal('members', row);
        App.render();
      }, { success: `როლი შეიცვალა: ${L.role[sel.value]}` }).then(r => { if (r === undefined && H.member(m.id).role === prev) sel.value = prev; });
    }));
    $$('[data-remove]').forEach(b => b.addEventListener('click', async () => {
      const m = H.member(b.dataset.remove);
      const open = S.data.tasks.filter(t => t.assigned_to === m.id && H.isOpen(t)).length;
      const ok = await R.confirm({ title: 'გუნდიდან ამოშლა', message: `${m.display_name} დაკარგავს წვდომას ამ სამუშაო სივრცეზე.${open ? ` მასზე დანიშნული ${open} აქტიური საქმე დარჩება დაუნიშნავი.` : ''}`, confirmLabel: 'ამოშლა', danger: true });
      if (!ok) return;
      run(b, async () => {
        await q(sb.from('organization_members').delete().eq('id', m.id));
        await App.refresh({ quiet: true });
      }, { success: 'წევრი ამოიშალა' });
    }));
    $$('[data-cancel-inv]').forEach(b => b.addEventListener('click', () => run(b, async () => {
      await q(sb.from('invitations').update({ status: 'cancelled' }).eq('id', b.dataset.cancelInv));
      await loadInvitations();
      App.render();
    }, { success: 'მოწვევა გაუქმდა' })));
  };

  function openInvite() {
    return R.dialog({
      title: 'წევრის მოწვევა', submitLabel: 'მოწვევის შექმნა',
      body: `<div class="form-stack">
        <label class="field"><span class="field-label">ელფოსტა</span><input type="email" name="email" required data-error="ჩაწერე სწორი ელფოსტა." placeholder="name@example.ge" /></label>
        <div class="field"><span class="field-label">როლი</span><div class="choice-list">
          <label class="choice"><input type="radio" name="role" value="staff" checked><span><strong>თანამშრომელი</strong><small>დამლაგებელი ან ტექნიკოსი: ხედავს მხოლოდ თავის საქმეებს, ჩეკლისტს და ბინის დაშვებას.</small></span></label>
          <label class="choice"><input type="radio" name="role" value="manager"><span><strong>მენეჯერი</strong><small>მართავს ბინებს, საქმეებს, ხარჯებს და თანხმობებს.</small></span></label>
          <label class="choice"><input type="radio" name="role" value="admin"><span><strong>ადმინისტრატორი</strong><small>მენეჯერის უფლებებს ემატება გუნდისა და პარამეტრების მართვა.</small></span></label>
        </div></div></div>`,
      onSubmit: async (_f, v) => {
        const email = v.email.trim().toLowerCase();
        if ((invitations || []).some(i => i.status === 'pending' && i.email.toLowerCase() === email)) throw new Error('ამ ელფოსტაზე მოწვევა უკვე გაგზავნილია.');
        await q(sb.from('invitations').insert({ organization_id: S.org.id, email, role: v.role, invited_by: S.user.id }));
        await loadInvitations();
        App.render();
        toast(`მოწვევა შეიქმნა: ${email}. გაუგზავნე რეგისტრაციის ბმული.`, { type: 'success', action: { label: 'ბმულის კოპირება', fn: () => R.copyText(`${location.origin}/app/`) } });
      },
    });
  }

  // ===========================================================================
  // SETTINGS
  // ===========================================================================
  App.views.settings = (r) => {
    const tab = r.id === 'import' ? 'import' : 'org';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>პარამეტრები</h1></div></div>
      <div class="tabs" role="tablist"><a class="tab" role="tab" href="#/settings" aria-selected="${tab === 'org'}">კომპანია</a><a class="tab" role="tab" href="#/settings/import" aria-selected="${tab === 'import'}">Excel/CSV იმპორტი</a></div>
      <div id="s-body"></div>`;
    if (tab === 'import') return renderImport($('#s-body'));
    const o = S.org;
    $('#s-body').innerHTML = `<section class="card" style="max-width:640px"><div class="card-body">
      ${App.isAdmin() ? '' : '<div class="notice" style="margin-bottom:14px">კომპანიის მონაცემებს ცვლის მხოლოდ ადმინისტრატორი.</div>'}
      <form id="s-org" class="form-grid" novalidate>
        <div class="form-error span-2" role="alert" hidden></div>
        <label class="field span-2"><span class="field-label">კომპანიის სახელი</span><input name="name" required value="${esc(o.name)}" ${App.isAdmin() ? '' : 'disabled'} /></label>
        <label class="field"><span class="field-label">ძირითადი ქალაქი</span><input name="city" value="${esc(o.city || '')}" ${App.isAdmin() ? '' : 'disabled'} /></label>
        <label class="field"><span class="field-label">საკონტაქტო ტელეფონი</span><input name="contact_phone" type="tel" value="${esc(o.contact_phone || '')}" ${App.isAdmin() ? '' : 'disabled'} /><span class="field-hint">ჩანს მფლობელის თანხმობის გვერდზე.</span></label>
        <label class="field"><span class="field-label">საკონტაქტო ელფოსტა</span><input name="contact_email" type="email" value="${esc(o.contact_email || '')}" ${App.isAdmin() ? '' : 'disabled'} /></label>
        ${App.isAdmin() ? '<div class="span-2"><button type="submit" class="btn btn-primary">შენახვა</button></div>' : ''}
      </form></div></section>`;
    $('#s-org').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target;
      const err = $('.form-error', f);
      err.hidden = true;
      if (!f.name.value.trim()) { err.textContent = 'ჩაწერე კომპანიის სახელი.'; err.hidden = false; return; }
      run(f.querySelector('[type=submit]'), async () => {
        const row = await q(sb.from('organizations').update({ name: f.name.value.trim(), city: f.city.value.trim() || null, contact_phone: f.contact_phone.value.trim() || null, contact_email: f.contact_email.value.trim() || null }).eq('id', o.id).select().single());
        Object.assign(S.org, row);
        App.renderShell();
      }, { success: 'კომპანიის მონაცემები შენახულია' });
    };
  };

  // ===========================================================================
  // IMPORT (Excel / CSV)
  // ===========================================================================
  const IMPORTS = {
    apartments: {
      label: 'ბინები', table: 'apartments',
      columns: [['name', 'სახელი', true], ['address', 'მისამართი', true], ['unit_number', 'ნომერი'], ['city', 'ქალაქი'], ['owner', 'მფლობელი'], ['door_code', 'კარის კოდი'], ['wifi_name', 'Wi-Fi'], ['wifi_password', 'Wi-Fi პაროლი'], ['commission_pct', 'საკომისიო %']],
      example: [['Orbi City · 1204', 'შერიფ ხიმშიაშვილის 7', '1204', 'ბათუმი', 'ნინო ქავთარაძე', '4821#', 'Orbi1204', 'sea-view-24', '20']],
      toRow: (r, ctx) => {
        const owner = r.owner ? ctx.ownerByName(r.owner) : null;
        if (r.owner && !owner) return { error: `მფლობელი „${r.owner}“ ვერ მოიძებნა — ჯერ მფლობელები შემოიტანე` };
        const pct = r.commission_pct === '' || r.commission_pct == null ? 20 : Number(String(r.commission_pct).replace('%', ''));
        if (isNaN(pct)) return { error: 'საკომისიო რიცხვი უნდა იყოს' };
        if (ctx.apartmentByName(r.name)) return { error: 'ასეთი ბინა უკვე არსებობს' };
        return { row: { name: r.name, address: r.address, unit_number: r.unit_number || null, city: r.city || S.org.city || null, owner_id: owner?.id || null, door_code: r.door_code || null, wifi_name: r.wifi_name || null, wifi_password: r.wifi_password || null, commission_pct: pct, status: 'active' } };
      },
    },
    owners: {
      label: 'მფლობელები', table: 'owners',
      columns: [['name', 'სახელი', true], ['phone', 'ტელეფონი'], ['email', 'ელფოსტა'], ['payout_account', 'ანგარიში'], ['notes', 'შენიშვნა']],
      example: [['ნინო ქავთარაძე', '+995 555 12 34 56', 'nino@example.ge', 'GE00TB0000000000000000', '']],
      toRow: (r, ctx) => {
        if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) return { error: 'ელფოსტის ფორმატი არასწორია' };
        if (ctx.ownerByName(r.name)) return { error: 'ასეთი მფლობელი უკვე არსებობს' };
        return { row: { name: r.name, phone: r.phone || null, email: r.email || null, payout_account: r.payout_account || null, notes: r.notes || null } };
      },
    },
    expenses: {
      label: 'ხარჯები', table: 'expenses',
      columns: [['apartment', 'ბინა', true], ['amount', 'თანხა', true], ['expense_date', 'თარიღი', true], ['description', 'აღწერა', true], ['category', 'კატეგორია'], ['status', 'სტატუსი'], ['vendor', 'მომწოდებელი']],
      example: [['Orbi City · 1204', '80', '2026-10-01', 'გენერალური დასუფთავება', 'დასუფთავება', 'გადახდილი', 'CleanPro']],
      toRow: (r, ctx) => {
        const apt = ctx.apartmentByName(r.apartment);
        if (!apt) return { error: `ბინა „${r.apartment}“ ვერ მოიძებნა` };
        const amount = Number(String(r.amount).replace(/[₾\s]/g, '').replace(',', '.'));
        if (!(amount > 0)) return { error: 'თანხა არასწორია' };
        const date = parseDate(r.expense_date);
        if (!date) return { error: 'თარიღი არასწორია (გამოიყენე 2026-10-01 ან 01.10.2026)' };
        const cat = matchLabel(r.category, L.expenseCategory) || 'other';
        const status = matchLabel(r.status, { paid: 'გადახდილი', incurred: 'გაწეული' }) || 'paid';
        return { row: { apartment_id: apt.id, amount, expense_date: date, description: r.description, category: cat, status, vendor: r.vendor || null, created_by: S.user.id } };
      },
    },
  };
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const matchLabel = (v, labels) => { const n = norm(v); if (!n) return null; return Object.entries(labels).find(([k, l]) => norm(k) === n || norm(l) === n)?.[0] || null; };
  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return R.isoDate(v);
    const s = String(v ?? '').trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400e3); return R.isoDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    return null;
  }

  let importState = { kind: 'apartments', rows: null, fileName: '' };

  function loadSheetJS() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Excel-ის წამკითხველი ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი ან გამოიყენე CSV ფაილი.'));
      document.head.appendChild(s);
    });
  }

  function parseCSV(text) {
    const rows = []; let row = []; let cell = ''; let quoted = false;
    const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
      else if (c === '"') quoted = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => String(c).trim()));
  }

  async function readFile(file) {
    if (/\.csv$/i.test(file.name)) return parseCSV((await file.text()).replace(/^﻿/, ''));
    const XLSX = await loadSheetJS();
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  }

  function mapRows(kind, matrix) {
    const def = IMPORTS[kind];
    const [header, ...data] = matrix;
    const colIndex = def.columns.map(([key, label]) => header.findIndex(h => norm(h) === norm(label) || norm(h) === key));
    const missing = def.columns.filter(([, , req], i) => req && colIndex[i] < 0).map(([, label]) => label);
    if (missing.length) throw new Error(`ფაილში ვერ მოიძებნა სვეტ(ებ)ი: ${missing.join(', ')}. გამოიყენე შაბლონი.`);
    const ctx = {
      ownerByName: (n) => S.data.owners.find(o => norm(o.name) === norm(n)),
      apartmentByName: (n) => S.data.apartments.find(a => norm(a.name) === norm(n) || (a.unit_number && norm(a.unit_number) === norm(n))),
    };
    const seen = new Set();
    return data.map((cells, i) => {
      const r = {};
      def.columns.forEach(([key], ci) => { const v = colIndex[ci] >= 0 ? cells[colIndex[ci]] : ''; r[key] = v instanceof Date ? v : String(v ?? '').trim(); });
      const req = def.columns.filter(([, , q]) => q).find(([k]) => !r[k]);
      if (req) return { line: i + 2, raw: r, error: `სავალდებულო ველი ცარიელია: ${req[1]}` };
      const dupKey = norm(r.name || `${r.apartment}|${r.amount}|${r.expense_date}|${r.description}`);
      if (seen.has(dupKey)) return { line: i + 2, raw: r, error: 'ფაილში ორჯერ მეორდება' };
      seen.add(dupKey);
      const res = def.toRow(r, ctx);
      return { line: i + 2, raw: r, ...res };
    });
  }

  function renderImport(root) {
    const def = IMPORTS[importState.kind];
    const rows = importState.rows;
    const ok = rows ? rows.filter(r => r.row) : [];
    const bad = rows ? rows.filter(r => r.error) : [];
    root.innerHTML = `<section class="card"><div class="card-body form-stack">
      <p class="muted">შემოიტანე არსებული სია Excel-დან (.xlsx) ან CSV-დან. ჯერ შემოიტანე მფლობელები, შემდეგ ბინები, შემდეგ ხარჯები — ბინები მფლობელს სახელით უკავშირდება. შემოტანამდე ნახავ შედეგს და შეცდომებს.</p>
      <div class="seg" role="radiogroup" aria-label="რას შემოიტან">${Object.entries(IMPORTS).map(([k, d]) => `<label><input type="radio" name="kind" value="${k}" ${importState.kind === k ? 'checked' : ''}><span>${d.label}</span></label>`).join('')}</div>
      <div class="toolbar" style="margin:0"><label class="btn btn-primary" style="cursor:pointer">${icon('upload', 16)} ფაილის არჩევა<input type="file" id="imp-file" accept=".csv,.xlsx,.xls" hidden /></label>
        <button type="button" class="btn btn-secondary" id="imp-template">${icon('file', 16)} შაბლონის ჩამოტვირთვა (CSV)</button>
        <span class="small muted">სვეტები: ${def.columns.map(([, l, r]) => r ? `<strong>${esc(l)}</strong>` : esc(l)).join(', ')} (მუქი — სავალდებულო)</span></div>
    </div>
    ${rows ? `<div class="card-head"><h2>${esc(importState.fileName)} · ${ok.length} მზადაა${bad.length ? `, <span class="t-danger">${bad.length} შეცდომით</span>` : ''}</h2>
        <div style="display:flex;gap:8px"><button type="button" class="btn btn-ghost btn-sm" id="imp-clear">გასუფთავება</button><button type="button" class="btn btn-primary btn-sm" id="imp-go" ${ok.length ? '' : 'disabled'}>${ok.length} ჩანაწერის შემოტანა</button></div></div>
      <div class="rows" style="max-height:420px;overflow-y:auto">${rows.map(r => `<div class="row" style="--cols:56px minmax(0,1fr) minmax(0,1fr)"><span class="muted small">ხაზი ${r.line}</span><span class="cell-main"><strong>${esc(r.raw.name || r.raw.description || '')}</strong><span>${esc(Object.values(r.raw).filter(v => v && !(v instanceof Date)).slice(1, 4).join(' · '))}</span></span><span class="small ${r.error ? 't-danger' : 't-ok'}">${r.error ? esc(r.error) : 'მზადაა'}</span></div>`).join('')}</div>` : ''}
    </section>`;
    $$('input[name=kind]', root).forEach(i => i.addEventListener('change', () => { importState = { kind: i.value, rows: null, fileName: '' }; App.render(); }));
    $('#imp-template').onclick = () => {
      const csv = [def.columns.map(c => c[1]), ...def.example].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `rigzea-${importState.kind}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#imp-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      run(null, async () => {
        const matrix = await readFile(file);
        if (matrix.length < 2) throw new Error('ფაილი ცარიელია ან მხოლოდ სათაურებს შეიცავს.');
        importState.rows = mapRows(importState.kind, matrix);
        importState.fileName = file.name;
        App.render();
      }, { retry: false });
    };
    $('#imp-clear')?.addEventListener('click', () => { importState.rows = null; App.render(); });
    $('#imp-go')?.addEventListener('click', (e) => run(e.target, async () => {
      // Client ids make the batch idempotent: retrying after a lost response won't duplicate.
      const payload = ok.map(r => { r.id = r.id || R.uuid(); return { id: r.id, organization_id: S.org.id, ...r.row }; });
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 100) {
        const chunk = payload.slice(i, i + 100);
        const { error } = await sb.from(def.table).insert(chunk);
        if (error && error.code !== '23505') throw new Error(`${inserted} ჩანაწერი შემოვიდა, დანარჩენი ვერა: ${R.friendlyError(error)}`);
        inserted += chunk.length;
      }
      importState.rows = null;
      await App.refresh({ quiet: true });
      toast(`შემოტანილია ${inserted} ჩანაწერი (${def.label})${bad.length ? ` · ${bad.length} გამოტოვებულია შეცდომის გამო` : ''}`, { type: 'success' });
    }));
  }
})();
