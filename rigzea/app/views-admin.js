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
    S.seatInvites = invitations.filter(i => i.status === 'pending' && i.role !== 'staff').length;
  }

  // The agent role needs supabase/patches/08_team.sql; offer it only where the database supports it.
  let agentRole = null;
  function checkAgentRole() {
    agentRole = false;
    sb.rpc('is_org_agent', { p_org: S.org.id }).then(({ error }) => { agentRole = !error; if (agentRole && App.route().name === 'team') App.render(); }, () => {});
  }

  App.views.team = () => {
    if (agentRole === null) checkAgentRole();
    if (invitations === null) { loadInvitations().then(() => App.route().name === 'team' && App.render()); }
    const members = S.data.members.slice().sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    const pendingInv = (invitations || []).filter(i => i.status === 'pending');
    const cols = 'minmax(0,1.6fr) 170px minmax(0,1fr) 130px 160px';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>გუნდი</h1><p class="page-sub">${members.length} წევრი · სამუშაო ადგილი: ${App.seatsUsed()}${App.PLANS[App.planState().eff].seats === null ? '' : ' / ' + App.PLANS[App.planState().eff].seats} · თანამშრომლები ხედავენ მხოლოდ თავიანთ დანიშნულ საქმეებს ტელეფონიდან.</p></div>
        <div class="page-actions">${App.isAdmin() ? `<button type="button" class="btn btn-primary" id="t-invite">${icon('plus', 16)} წევრის მოწვევა</button>` : ''}</div></div>
      <section class="card" style="margin-bottom:16px"><div class="rows"><div class="rows-head" style="--cols:${cols}"><span>წევრი</span><span>როლი</span><span>ტელეფონი</span><span>აქტიური საქმე</span><span></span></div>
        ${members.map(m => {
          const open = S.data.tasks.filter(t => t.assigned_to === m.id && H.isOpen(t));
          const overdue = open.filter(H.isOverdue).length;
          const self = m.user_id === S.user.id;
          return `<div class="row" style="--cols:${cols}"><span class="cell-main"><strong>${esc(m.display_name || 'უსახელო')}${self ? ' <span class="muted">(შენ)</span>' : ''}</strong><span>წევრია ${esc(R.date(m.created_at))}-დან</span></span>
            <span class="cell-meta">${App.isAdmin() && !self && m.role !== 'owner' ? `<select class="input" data-role="${m.id}" aria-label="როლი" style="min-height:32px">${['admin', 'manager', 'agent', 'staff'].filter(r => r !== 'agent' || agentRole || m.role === 'agent').map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${L.role[r]}</option>`).join('')}</select>` : esc(L.role[m.role])}</span>
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

    $('#t-invite')?.addEventListener('click', () => openInvite());
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
          <label class="choice" ${agentRole ? '' : 'style="display:none"'}><input type="radio" name="role" value="agent"><span><strong>აგენტი</strong><small>ხედავს საერთო ბაზას და თავის გარიგებებს. მეპატრონის ნომერი იხსნება ნახვის დანიშვნის შემდეგ. ფინანსებს ვერ ხედავს.</small></span></label>
          <label class="choice"><input type="radio" name="role" value="manager"><span><strong>მენეჯერი</strong><small>მართავს ბინებს, საქმეებს, ხარჯებს და თანხმობებს.</small></span></label>
          <label class="choice"><input type="radio" name="role" value="admin"><span><strong>ადმინისტრატორი</strong><small>მენეჯერის უფლებებს ემატება გუნდისა და პარამეტრების მართვა.</small></span></label>
        </div></div></div>`,
      onSubmit: async (_f, v) => {
        const email = v.email.trim().toLowerCase();
        if (v.role !== 'staff' && !App.guardLimit('seats')) return false;
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
    const tabs = [['org', 'კომპანია', '#/settings'], ['plan', 'პაკეტი', '#/settings/plan'], ['import', 'Excel/CSV იმპორტი', '#/settings/import'], ['export', 'ექსპორტი', '#/settings/export']];
    if (S.platformAdmin) tabs.push(['platform', 'პლატფორმა', '#/settings/platform']);
    const tab = tabs.some(t => t[0] === r.id) ? r.id : 'org';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>პარამეტრები</h1></div></div>
      <div class="tabs" role="tablist">${tabs.map(([id, label, href]) => `<a class="tab" role="tab" href="${href}" aria-selected="${tab === id}">${label}</a>`).join('')}</div>
      <div id="s-body"></div>`;
    const body = $('#s-body');
    if (tab === 'import') return renderImport(body);
    if (tab === 'export') return renderExportTab(body);
    if (tab === 'plan') return renderPlanTab(body);
    if (tab === 'platform') return renderPlatformTab(body);
    renderOrgTab(body);
  };

  function renderOrgTab(root) {
    const o = S.org;
    const admin = App.isAdmin();
    const canProfile = App.can('profile'), canBrand = App.can('whitelabel');
    root.innerHTML = `<section class="card" style="max-width:640px;margin-bottom:16px"><div class="card-body">
      ${admin ? '' : '<div class="notice" style="margin-bottom:14px">კომპანიის მონაცემებს ცვლის მხოლოდ ადმინისტრატორი.</div>'}
      <form id="s-org" class="form-grid" novalidate>
        <div class="form-error span-2" role="alert" hidden></div>
        <label class="field span-2"><span class="field-label">კომპანიის სახელი</span><input name="name" required value="${esc(o.name)}" ${admin ? '' : 'disabled'} /></label>
        <label class="field"><span class="field-label">ძირითადი ქალაქი</span><input name="city" value="${esc(o.city || '')}" ${admin ? '' : 'disabled'} /></label>
        <label class="field"><span class="field-label">საკონტაქტო ტელეფონი</span><input name="contact_phone" type="tel" value="${esc(o.contact_phone || '')}" ${admin ? '' : 'disabled'} /><span class="field-hint">ჩანს მფლობელის თანხმობის გვერდზე.</span></label>
        <label class="field"><span class="field-label">საკონტაქტო ელფოსტა</span><input name="contact_email" type="email" value="${esc(o.contact_email || '')}" ${admin ? '' : 'disabled'} /></label>
        ${admin ? '<div class="span-2"><button type="submit" class="btn btn-primary">შენახვა</button></div>' : ''}
      </form></div></section>
    <section class="card" style="max-width:640px" id="brand-card"><div class="card-head"><h2>ბრენდინგი</h2></div><div class="card-body">
      <p class="muted" style="margin-top:0">ლოგო, სახელი და ფერი ჩანს კლიენტებისთვის გაგზავნილ საჯარო გვერდებზე.</p>
      ${!canProfile ? `<div class="notice notice-warn" style="margin-bottom:14px"><span>ბრენდინგი ხელმისაწვდომია „${esc(App.PLANS.pro.name)}“ პაკეტიდან. ფერისა და White-label ბრენდირებისთვის საჭიროა „${esc(App.PLANS.agency.name)}“.</span> <button type="button" class="btn btn-secondary btn-sm" id="b-upgrade">პაკეტების ნახვა</button></div>` : ''}
      <form id="s-brand" class="form-grid" novalidate>
        <div class="form-error span-2" role="alert" hidden></div>
        <div class="span-2 brand-preview" id="b-preview"></div>
        <label class="field span-2"><span class="field-label">აგენტის / სააგენტოს სახელი საჯარო გვერდებზე</span><input name="agent_display_name" maxlength="80" value="${esc(o.agent_display_name || '')}" placeholder="მაგ.: ნინო ბერიძე · Batumi Stay" ${admin && canProfile ? '' : 'disabled'} /></label>
        <div class="field span-2"><span class="field-label">ლოგო</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" ${admin && canProfile ? '' : 'disabled'} /><button type="button" class="btn btn-ghost btn-sm" id="b-logo-clear" ${admin && canProfile && o.logo_url ? '' : 'hidden'}>ლოგოს ამოშლა</button></div>
          <span class="field-hint">PNG, JPG, WebP ან SVG, მაქსიმუმ 10 მბ. კვადრატული ან ჰორიზონტალური ლოგო საუკეთესოდ გამოჩნდება.</span></div>
        <div class="field span-2"><span class="field-label">ბრენდის ფერი</span>
          <div style="display:flex;gap:8px;align-items:center"><input type="color" id="b-color-pick" value="${esc(/^#[0-9a-f]{6}$/i.test(o.brand_color || '') ? o.brand_color : '#0a5c44')}" aria-label="ფერის არჩევა" ${admin && canBrand ? '' : 'disabled'} style="width:44px;padding:2px" />
            <input name="brand_color" id="b-color" placeholder="#0A5C44" maxlength="7" value="${esc(o.brand_color || '')}" pattern="#[0-9a-fA-F]{6}" data-error="ფერი ჩაწერე ფორმატით #0A5C44." ${admin && canBrand ? '' : 'disabled'} style="max-width:140px" /></div>
          ${canProfile && !canBrand ? `<span class="field-hint">ფერი ხელმისაწვდომია „${esc(App.PLANS.agency.name)}“ პაკეტში.</span>` : '<span class="field-hint">დატოვე ცარიელი, თუ რიგზეას სტანდარტული ფერი გინდა.</span>'}</div>
        ${admin && canProfile ? '<div class="span-2"><button type="submit" class="btn btn-primary">ბრენდინგის შენახვა</button></div>' : ''}
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

    // ---- branding
    const form = $('#s-brand');
    let logoUrl = o.logo_url || null;
    let objectUrl = null;
    const preview = () => {
      const col = /^#[0-9a-f]{6}$/i.test(form.brand_color.value) ? form.brand_color.value : null;
      $('#b-preview').innerHTML = `${logoUrl ? `<img src="${esc(logoUrl)}" alt="ლოგო" />` : `<span class="brand-mark" style="width:48px;height:48px;display:grid;place-items:center;border-radius:8px;background:${col || 'var(--brand)'};color:#fff;font-weight:700">${esc((form.agent_display_name.value || o.name || '·').trim().charAt(0).toUpperCase())}</span>`}
        <div style="min-width:0"><strong>${esc(form.agent_display_name.value.trim() || o.name)}</strong><div class="small muted">${esc(o.contact_phone || '')}</div></div>
        <span class="swatch" style="margin-left:auto;background:${col || 'var(--brand)'}" title="${col ? esc(col) : 'სტანდარტული ფერი'}"></span>`;
    };
    preview();
    form.agent_display_name.addEventListener('input', preview);
    form.brand_color.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(form.brand_color.value)) $('#b-color-pick').value = form.brand_color.value; preview(); });
    $('#b-color-pick').addEventListener('input', (e) => { form.brand_color.value = e.target.value.toUpperCase(); preview(); });
    form.logo.addEventListener('change', () => {
      const file = form.logo.files[0];
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (file) { objectUrl = URL.createObjectURL(file); logoUrl = objectUrl; $('#b-logo-clear').hidden = false; }
      preview();
    });
    $('#b-logo-clear').onclick = () => { form.logo.value = ''; logoUrl = null; form.dataset.clearLogo = '1'; $('#b-logo-clear').hidden = true; preview(); };
    $('#b-upgrade')?.addEventListener('click', () => App.openUpgrade({ kind: 'feature', feature: 'profile' }));
    form.onsubmit = (e) => {
      e.preventDefault();
      const err = $('.form-error', form);
      err.hidden = true;
      const color = form.brand_color.value.trim();
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) { err.textContent = 'ფერი ჩაწერე ფორმატით #0A5C44.'; err.hidden = false; return; }
      if (!App.guardFeature('profile')) return;
      if (color && !App.guardFeature('whitelabel')) return;
      run(form.querySelector('[type=submit]'), async () => {
        const patch = { agent_display_name: form.agent_display_name.value.trim() || null, brand_color: color ? color.toUpperCase() : null };
        const file = form.logo.files[0];
        if (file) patch.logo_url = await R.uploadFile(S.org.id, 'branding', file);
        else if (form.dataset.clearLogo === '1') patch.logo_url = null;
        const row = await q(sb.from('organizations').update(patch).eq('id', o.id).select().single());
        Object.assign(S.org, row);
        form.dataset.clearLogo = '';
        logoUrl = row.logo_url || null;
        form.logo.value = '';
        preview();
        $('#b-logo-clear').hidden = !logoUrl;
      }, { success: 'ბრენდინგი შენახულია' });
    };
  }

  // ---- plan tab -------------------------------------------------------------
  function renderPlanTab(root) {
    const st = App.planState();
    const apts = App.activeApartments(), seats = App.seatsUsed();
    const meter = (label, used, cap) => `<div class="field"><span class="field-label">${label}: <strong>${used}${cap === null ? '' : ' / ' + cap}</strong>${cap === null ? ' (ულიმიტო)' : ''}</span>${cap === null ? '' : `<div class="meter ${used >= cap ? 'is-full' : ''}" role="img" aria-label="${used} / ${cap}"><i style="width:${cap ? Math.min(100, Math.round(used / cap * 100)) : 100}%"></i></div>`}</div>`;
    const planName = st.trial ? 'საცდელი პერიოდი' : App.PLANS[st.eff].name;
    let status;
    const paused = App.pausedApartmentIds().size;
    if (st.trialEnded) status = `<span class="t-warn">საცდელი პერიოდი დასრულდა ${esc(R.date(st.end))}-ს. ანგარიში უფასო პაკეტზეა, შენი მონაცემები ადგილზეა.</span>`;
    else if (st.lapsed) status = `<span class="t-warn">პაკეტის ვადა ამოიწურა ${esc(R.date(st.end))}-ს. ანგარიში უფასო პაკეტზეა, შენი მონაცემები ადგილზეა.</span>`;
    else if (st.trial) status = st.end ? `ყველა ფუნქცია ღიაა ${esc(R.date(st.end))}-მდე (დარჩენილია ${st.daysLeft} დღე).` : 'ყველა ფუნქცია ღიაა.';
    else status = st.end ? `აქტიურია ${esc(R.date(st.end))}-მდე (დარჩენილია ${st.daysLeft} დღე).` : 'აქტიურია.';
    root.innerHTML = `<section class="card" style="max-width:900px;margin-bottom:16px"><div class="card-head"><h2>შენი პაკეტი: ${esc(planName)}</h2></div><div class="card-body form-stack">
      <p style="margin:0">${status}</p>
      ${paused ? `<div class="notice notice-warn" id="plan-paused"><span>აქტიური ობიექტი პაკეტის ლიმიტს აღემატება: ${st.plan.apartments} ყველაზე ძველი ობიექტის საჯარო ბმული მუშაობს, დანარჩენი ${paused} შეჩერებულია. ობიექტები არ წაშლილა: ბმულები დაბრუნდება, როცა უფრო დიდ პაკეტს აირჩევ ან ზედმეტ ობიექტებს დაარქივებ.</span></div>` : ''}
      <div class="form-grid">${meter('აქტიური ობიექტი', apts, st.plan.apartments)}${meter('სამუშაო ადგილი', seats, st.plan.seats)}</div>
      <div><span class="field-label">ფუნქციები</span><ul class="plan-features" style="list-style:none;padding:0;margin:6px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:6px;font-size:13px">${Object.entries(App.FEATURE_LABEL).map(([k, l]) => App.can(k) ? `<li class="t-ok">✓ ${esc(l)}</li>` : `<li class="muted">🔒 ${esc(l)}</li>`).join('')}</ul></div>
    </div></section>
    <section class="card" style="max-width:900px"><div class="card-head"><h2>პაკეტები</h2></div><div class="card-body">
      ${App.planCardsHtml(st.key === 'trial' ? 'pro' : null, st.trial ? null : st.eff)}
      <p class="plan-contact">პაკეტის გასააქტიურებლად მოგვწერე WhatsApp-ში ან დარეკე <a href="tel:${App.CONTACT.phone}">${App.CONTACT.phone}</a>. გადახდის შემდეგ პაკეტს იმავე დღეს ჩავრთავთ.</p>
      <div class="plan-cta"><a class="btn btn-primary" href="${esc(App.waLink())}" target="_blank" rel="noopener">${icon('whatsapp', 16)} მოგვწერე WhatsApp-ში</a></div>
    </div></section>`;
  }

  // ---- platform admin tab ---------------------------------------------------
  let platformOrgs = null;
  let platformAdmins = null;
  async function renderPlatformTab(root) {
    if (!S.platformAdmin) { root.innerHTML = '<div class="card"><div class="empty-inline">ამ გვერდზე წვდომა არ გაქვს.</div></div>'; return; }
    if (platformOrgs === null) {
      root.innerHTML = '<div class="card"><div class="skeleton"><i></i><i></i><i></i></div></div>';
      try { platformOrgs = await q(sb.rpc('admin_list_orgs')); platformAdmins = await q(sb.rpc('list_platform_admins')).catch(() => null); }
      catch (err) { root.innerHTML = `<div class="card"><div class="error-state"><p>სია ვერ ჩაიტვირთა. ${esc(R.friendlyError(err))}</p><button class="btn btn-secondary btn-sm" id="p-retry">ხელახლა ცდა</button></div></div>`; $('#p-retry').onclick = () => renderPlatformTab(root); return; }
      if (App.route().id !== 'platform') return;
    }
    const cols = 'minmax(0,1.5fr) minmax(0,1.2fr) 130px 90px 110px 100px';
    const statusText = (o) => {
      const end = o.plan === 'trial' ? o.trial_ends_at : o.plan_expires_at;
      if (o.plan === 'starter') return 'უფასო';
      if (o.effective_plan === 'starter') return `<span class="t-warn">${o.plan === 'trial' ? 'საცდელი დასრულდა' : 'ვადა გავიდა'}: უფასოზეა</span>`;
      return end ? `${esc(R.date(end))}-მდე` : 'ვადის გარეშე';
    };
    root.innerHTML = `<section class="card"><div class="card-head"><h2>სამუშაო სივრცეები <span class="count">${platformOrgs.length}</span></h2></div>
      <div class="card-body" style="padding-top:0"><p class="muted small" style="margin-top:0">აირჩიე პაკეტი და დღეების რაოდენობა (გადახდილი პაკეტი არსებულ ვადას აგრძელებს; ცარიელი = ვადის გარეშე; საცდელზე ნაგულისხმევია 14 დღე), შემდეგ დააჭირე „გააქტიურება“.</p></div>
      <div class="rows"><div class="rows-head" style="--cols:${cols}"><span>კომპანია</span><span>მფლობელი</span><span>პაკეტი</span><span>დღე</span><span>სტატუსი</span><span></span></div>
      ${platformOrgs.map(o => `<div class="row" style="--cols:${cols}" data-org="${o.id}">
        <span class="cell-main"><strong>${esc(o.name)}</strong><span>${o.apartments_count} ობიექტი · ${o.members_count} წევრი</span></span>
        <span class="cell-meta">${esc(o.owner_email || '—')}</span>
        <span><select class="input" data-plan aria-label="პაკეტი" style="min-height:32px">${['trial', 'starter', 'pro', 'top', 'agency'].map(p => `<option value="${p}" ${o.plan === p ? 'selected' : ''}>${p === 'trial' ? 'საცდელი' : esc(App.PLANS[p].name)}</option>`).join('')}</select></span>
        <span><input class="input" type="number" min="1" max="3650" data-days value="${o.plan === 'trial' || o.plan === 'starter' ? '' : 30}" placeholder="${o.plan === 'trial' ? '14' : '—'}" aria-label="დღეების რაოდენობა" style="min-height:32px" ${o.plan === 'starter' ? 'disabled' : ''} /></span>
        <span class="cell-meta">${statusText(o)}</span>
        <span class="cell-actions"><button type="button" class="btn btn-primary btn-sm" data-save>გააქტიურება</button></span></div>`).join('')}</div></section>
      ${platformAdmins ? `<section class="card" style="margin-top:16px" id="p-admins"><div class="card-head"><h2>პლატფორმის ადმინები <span class="count">${platformAdmins.length}</span></h2></div>
      <div class="card-body" style="padding-top:0"><p class="muted small" style="margin-top:0">ადმინი ააქტიურებს პაკეტებს ყველა სამუშაო სივრცისთვის. უფლებას იძლევა მხოლოდ მოქმედი ადმინი; ყველა მინიჭება, მოხსნა და პაკეტის ცვლილება ჟურნალში იწერება.</p>
        <form id="p-admin-add" style="display:flex;gap:8px;flex-wrap:wrap" novalidate><input class="input" type="email" name="email" required placeholder="რეგისტრირებული მომხმარებლის ელფოსტა" aria-label="ახალი ადმინის ელფოსტა" style="flex:1;min-width:220px" /><button type="submit" class="btn btn-secondary">უფლების მიცემა</button></form></div>
      <div class="rows">${platformAdmins.map(a => `<div class="row" style="--cols:minmax(0,1fr) auto" data-admin="${esc(a.email)}">
        <span class="cell-main"><strong>${esc(a.email)}</strong><span>${esc(R.date(a.granted_at, { withYear: true }))}${a.granted_by_email ? ` · მიანიჭა ${esc(a.granted_by_email)}` : ' · მინიჭებულია ბაზიდან'}</span></span>
        <span class="cell-actions">${platformAdmins.length > 1 ? '<button type="button" class="btn btn-ghost btn-sm" data-revoke>მოხსნა</button>' : ''}</span></div>`).join('')}</div></section>` : ''}`;
    const reloadAdmins = async () => { platformAdmins = await q(sb.rpc('list_platform_admins')); await renderPlatformTab(root); };
    const addForm = $('#p-admin-add', root);
    if (addForm) addForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = addForm.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { toast('ჩაწერე სწორი ელფოსტა.', { type: 'error' }); return; }
      const ok = await R.confirm({ title: 'პლატფორმის ადმინის უფლება', message: `${email} შეძლებს ყველა სამუშაო სივრცის ნახვას და პაკეტების გააქტიურებას. დარწმუნებული ხარ?`, confirmLabel: 'უფლების მიცემა', danger: true });
      if (!ok) return;
      run(addForm.querySelector('[type=submit]'), async () => { await q(sb.rpc('grant_platform_admin', { p_email: email })); await reloadAdmins(); }, { success: 'ადმინის უფლება მიენიჭა' });
    };
    $$('[data-admin] [data-revoke]', root).forEach(b => b.onclick = async () => {
      const email = b.closest('[data-admin]').dataset.admin;
      const ok = await R.confirm({ title: 'ადმინის უფლების მოხსნა', message: `${email} ვეღარ გაააქტიურებს პაკეტებს.`, confirmLabel: 'მოხსნა', danger: true });
      if (!ok) return;
      run(b, async () => {
        await q(sb.rpc('revoke_platform_admin', { p_email: email }));
        if (email === String(S.user.email || '').toLowerCase()) { S.platformAdmin = false; App.go('#/settings'); return; }
        await reloadAdmins();
      }, { success: 'ადმინის უფლება მოიხსნა' });
    });
    $$('[data-org]', root).forEach(row => {
      const sel = $('[data-plan]', row), days = $('[data-days]', row);
      sel.onchange = () => { days.disabled = sel.value === 'starter'; days.value = sel.value === 'trial' || sel.value === 'starter' ? '' : '30'; days.placeholder = sel.value === 'trial' ? '14' : '—'; };
      $('[data-save]', row).onclick = (e) => run(e.currentTarget, async () => {
        const res = await q(sb.rpc('admin_set_org_plan', { p_org: row.dataset.org, p_plan: sel.value, p_days: days.value === '' ? null : Number(days.value) }));
        if (row.dataset.org === S.org.id) { Object.assign(S.org, { plan: res.plan, trial_ends_at: res.trial_ends_at, plan_expires_at: res.plan_expires_at }); App.renderShell(); }
        platformOrgs = null;
        await renderPlatformTab(root);
      }, { success: 'პაკეტი გააქტიურდა' });
    });
  }

  // ===========================================================================
  // EXPORT (CSV / Excel)
  // ===========================================================================
  const csvCell = (v) => {
    let t = v instanceof Date ? R.isoDate(v) : v == null ? '' : String(v);
    if (/^[=@\t\r]|^[+\-][^0-9\s]/.test(t)) t = "'" + t; // spreadsheet formula injection
    return `"${t.replace(/"/g, '""')}"`;
  };
  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => R.isoDate(new Date());
  const safeSheet = (n) => n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);

  // sets: [{ name, headers: [..], rows: [[..]] }]; Excel = one workbook, CSV = one file per set.
  async function downloadSets(sets, format, base) {
    if (format === 'csv') {
      sets.forEach((s, i) => setTimeout(() => saveBlob(new Blob(['﻿' + [s.headers, ...s.rows].map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${base}-${s.file || s.name}-${stamp()}.csv`), i * 250));
      return;
    }
    const XLSX = await loadSheetJS();
    const wb = XLSX.utils.book_new();
    sets.forEach(s => {
      const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
      ws['!cols'] = s.headers.map((h, i) => ({ wch: Math.min(40, Math.max(String(h).length, ...s.rows.slice(0, 200).map(r => String(r[i] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, safeSheet(s.name));
    });
    XLSX.writeFile(wb, `${base}-${stamp()}.xlsx`);
  }

  // Dialog: pick sets (when several) and format, then download. Gated by the "export" feature.
  function exportDialog({ title = 'ექსპორტი', base = 'rigzea', sets }) {
    if (!App.guardFeature('export')) return Promise.resolve(false);
    return R.dialog({
      title, submitLabel: 'ჩამოტვირთვა',
      body: `<div class="form-stack">
        ${sets.length > 1 ? `<div class="field"><span class="field-label">რა ჩამოიტვირთოს</span><div class="choice-list">${sets.map((s, i) => `<label class="choice"><input type="checkbox" name="set" value="${i}" checked><span><strong>${esc(s.name)}</strong><small>${s.rows.length} ჩანაწერი</small></span></label>`).join('')}</div></div>` : `<p class="dlg-text">${esc(sets[0].name)}: ${sets[0].rows.length} ჩანაწერი.</p>`}
        <div class="field"><span class="field-label">ფორმატი</span><div class="seg" role="radiogroup"><label><input type="radio" name="format" value="xlsx" checked><span>Excel (.xlsx)</span></label><label><input type="radio" name="format" value="csv"><span>CSV</span></label></div></div></div>`,
      onSubmit: async (form) => {
        const picked = sets.length > 1 ? $$('input[name=set]:checked', form).map(i => sets[Number(i.value)]) : sets;
        if (!picked.length) throw new Error('აირჩიე მინიმუმ ერთი სია.');
        await downloadSets(picked, form.format.value, base);
        toast('ფაილი მზადაა', { type: 'success' });
      },
    });
  }

  const EXPENSE_STATUS = { proposed: 'შეთავაზებული', approved: 'დადასტურებული', declined: 'უარყოფილი', incurred: 'გაწეული', paid: 'გადახდილი' };
  const yn = (v) => v ? 'კი' : 'არა';
  const dealOut = (d) => ({ client_name: d.client_name, client_phone: d.client_phone, client_email: d.client_email, apartment: d.apartment_id ? H.aptName(d.apartment_id) : '', stage: L.dealStage[d.stage] || d.stage, deal_amount: d.deal_amount, currency: d.currency, commission_percent: d.commission_percent, owner_bonus: d.owner_bonus, partner_agent: d.partner_agent, partner_phone: d.partner_phone, cobroker_split: d.cobroker_split, target_move_in: d.target_move_in, notes: d.notes });
  const aptOut = (a) => ({ name: a.name, address: a.address, unit_number: a.unit_number, city: a.city, owner: H.owner(a.owner_id)?.name || '', door_code: a.door_code, wifi_name: a.wifi_name, wifi_password: a.wifi_password, commission_pct: a.commission_pct, rooms: a.rooms, district: a.district, floor: a.floor, area_sqm: a.area_sqm, monthly_rent: a.monthly_rent, currency: a.currency, pets_allowed: yn(a.pets_allowed), lease_end: a.lease_end, agent_phone: a.agent_phone });
  const expOut = (e) => ({ apartment: H.aptName(e.apartment_id), amount: e.amount, expense_date: e.expense_date, description: e.description, category: L.expenseCategory[e.category] || e.category, status: EXPENSE_STATUS[e.status] || e.status, vendor: e.vendor });
  const ownOut = (o) => ({ name: o.name, phone: o.phone, email: o.email, payout_account: o.payout_account, notes: o.notes });
  // Same column order as the matching importer so an export can be edited and re-imported.
  const setFor = (kind, name, list, out) => { const cols = IMPORTS[kind].columns; return { name, file: kind, headers: cols.map(c => c[1]), rows: list.map(x => { const o = out(x); return cols.map(([k]) => o[k] ?? ''); }) }; };

  const incomeSet = (list) => ({ name: 'შემოსავალი', file: 'income', headers: ['ბინა', 'თანხა', 'თარიღი', 'წყარო', 'აღწერა'], rows: list.map(i => [H.aptName(i.apartment_id), i.amount, i.income_date, i.source, i.description || '']) });
  const exportSets = {
    apartments: () => setFor('apartments', 'ბინები', S.data.apartments, aptOut),
    owners: () => setFor('owners', 'მფლობელები', S.data.owners, ownOut),
    expenses: (list = S.data.expenses) => setFor('expenses', 'ხარჯები', list, expOut),
    income: (list = S.data.income) => incomeSet(list),
    deals: () => setFor('deals', 'გარიგებები', S.data.deals || [], dealOut),
  };
  function renderExportTab(root) {
    const d = S.data;
    const items = [['apartments', 'ბინები', d.apartments.length], ['owners', 'მფლობელები', d.owners.length], ['deals', 'გარიგებები', (d.deals || []).length], ['expenses', 'ხარჯები', d.expenses.length], ['income', 'შემოსავალი', d.income.length]];
    root.innerHTML = `<section class="card" style="max-width:640px"><div class="card-body form-stack">
      <p class="muted" style="margin:0">ჩამოტვირთე შენი მონაცემები Excel-ში ან CSV-ში: სარეზერვო ასლისთვის, ბუღალტრისთვის ან სხვა სისტემაში გადასატანად.${App.can('export') ? '' : ` ექსპორტი ხელმისაწვდომია „${esc(App.PLANS.top.name)}“ პაკეტიდან.`}</p>
      <div class="rows">${items.map(([k, label, n]) => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${label}</strong><span>${n} ჩანაწერი</span></span><span class="cell-actions"><button type="button" class="btn btn-secondary btn-sm" data-export="${k}" ${n ? '' : 'disabled'}>${App.can('export') ? 'ჩამოტვირთვა' : '🔒 ჩამოტვირთვა'}</button></span></div>`).join('')}</div>
      <div><button type="button" class="btn btn-primary" id="x-all">${icon('file', 16)} ყველაფრის ჩამოტვირთვა (Excel)</button></div>
    </div></section>`;
    $$('[data-export]', root).forEach(b => b.addEventListener('click', () => exportDialog({ title: 'ექსპორტი', base: 'rigzea-' + b.dataset.export, sets: [exportSets[b.dataset.export]()] })));
    $('#x-all').onclick = () => exportDialog({ title: 'ყველაფრის ექსპორტი', base: 'rigzea', sets: items.filter(i => i[2]).map(i => exportSets[i[0]]()) });
  }
  App.exportDialog = exportDialog;
  App.exportApartments = () => exportDialog({ base: 'rigzea-apartments', sets: [exportSets.apartments()] });
  App.exportDeals = () => exportDialog({ base: 'rigzea-deals', sets: [exportSets.deals()] });
  App.exportFinance = (expenses, income) => exportDialog({ title: 'ფინანსების ექსპორტი', base: 'rigzea-finance', sets: [exportSets.expenses(expenses), exportSets.income(income)] });

  // ===========================================================================
  // IMPORT (Excel / CSV)
  // ===========================================================================
  const IMPORTS = {
    apartments: {
      label: 'ბინები', table: 'apartments',
      columns: [['name', 'სახელი', true], ['address', 'მისამართი', true], ['unit_number', 'ნომერი'], ['city', 'ქალაქი'], ['owner', 'მფლობელი'], ['door_code', 'კარის კოდი'], ['wifi_name', 'Wi-Fi'], ['wifi_password', 'Wi-Fi პაროლი'], ['commission_pct', 'საკომისიო %'],
        ['rooms', 'ოთახები'], ['district', 'უბანი'], ['floor', 'სართული'], ['area_sqm', 'ფართი მ²'], ['monthly_rent', 'ქირა'], ['currency', 'ვალუტა'], ['pets_allowed', 'შინაური ცხოველი'], ['lease_end', 'ხელშეკრულების დასასრული'], ['agent_phone', 'აგენტის ტელეფონი']],
      example: [['Orbi City · 1204', 'შერიფ ხიმშიაშვილის 7', '1204', 'ბათუმი', 'ნინო ქავთარაძე', '4821#', 'Orbi1204', 'sea-view-24', '20', '2', 'ძველი ბათუმი', '12', '64', '650', 'USD', 'არა', '2027-06-30', '+995 555 12 34 56']],
      toRow: (r, ctx) => {
        const owner = r.owner ? ctx.ownerByName(r.owner) : null;
        if (r.owner && !owner) return { error: `მფლობელი „${r.owner}“ ვერ მოიძებნა — ჯერ მფლობელები შემოიტანე` };
        const pct = r.commission_pct === '' || r.commission_pct == null ? 20 : Number(String(r.commission_pct).replace('%', ''));
        if (isNaN(pct)) return { error: 'საკომისიო რიცხვი უნდა იყოს' };
        const rooms = r.rooms === '' ? null : Number(r.rooms);
        if (rooms !== null && !(Number.isInteger(rooms) && rooms >= 0 && rooms < 100)) return { error: 'ოთახების რაოდენობა მთელი რიცხვი უნდა იყოს' };
        const area = parseNum(r.area_sqm), rent = parseNum(r.monthly_rent);
        if (Number.isNaN(area) || Number.isNaN(rent)) return { error: 'ფართი და ქირა რიცხვი უნდა იყოს' };
        const currency = r.currency ? parseCurrency(r.currency) : (rent != null ? 'USD' : null);
        if (r.currency && !currency) return { error: 'ვალუტა უნდა იყოს USD ან GEL ($ / ₾)' };
        const pets = r.pets_allowed ? parseBool(r.pets_allowed) : null;
        if (r.pets_allowed && pets === null) return { error: 'შინაური ცხოველი: ჩაწერე „კი“ ან „არა“' };
        const lease = r.lease_end ? parseDate(r.lease_end) : null;
        if (r.lease_end && !lease) return { error: 'ხელშეკრულების თარიღი არასწორია (გამოიყენე 2026-10-01 ან 01.10.2026)' };
        if (ctx.apartmentByName(r.name)) return { error: 'ასეთი ბინა უკვე არსებობს' };
        const row = { name: r.name, address: r.address, unit_number: r.unit_number || null, city: r.city || S.org.city || null, owner_id: owner?.id || null, door_code: r.door_code || null, wifi_name: r.wifi_name || null, wifi_password: r.wifi_password || null, commission_pct: pct, status: 'active',
          district: r.district || null, floor: r.floor || null, area_sqm: area, monthly_rent: rent, agent_phone: r.agent_phone || null, lease_end: lease };
        if (rooms !== null) row.rooms = rooms;
        if (currency) row.currency = currency;
        if (pets !== null) row.pets_allowed = pets;
        return { row };
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
    deals: {
      label: 'გარიგებები', table: 'deals',
      columns: [['client_name', 'კლიენტი', true], ['client_phone', 'ტელეფონი'], ['client_email', 'ელფოსტა'], ['apartment', 'ბინა'], ['stage', 'ეტაპი'], ['deal_amount', 'თანხა'], ['currency', 'ვალუტა'], ['commission_percent', 'საკომისიო %'], ['owner_bonus', 'მესაკუთრის ბონუსი'], ['partner_agent', 'პარტნიორი აგენტი'], ['partner_phone', 'პარტნიორის ტელეფონი'], ['cobroker_split', 'პარტნიორის წილი %'], ['target_move_in', 'გადმოსვლის თარიღი'], ['notes', 'შენიშვნა']],
      example: [['გიორგი ბერიძე', '+995 599 11 22 33', 'giorgi@example.ge', 'Orbi City · 1204', 'ნახვა დანიშნულია', '650', 'USD', '50', '0', '', '', '50', '2026-11-01', 'ეძებს ზღვის ხედს']],
      dupKey: (r) => norm(`${r.client_name}|${r.apartment}|${r.deal_amount}`),
      toRow: (r, ctx) => {
        const apt = r.apartment ? ctx.apartmentByName(r.apartment) : null;
        if (r.apartment && !apt) return { error: `ბინა „${r.apartment}“ ვერ მოიძებნა — ჯერ ბინები შემოიტანე` };
        const stage = r.stage ? matchLabel(r.stage, L.dealStage) : 'active';
        if (!stage) return { error: `ეტაპი „${r.stage}“ უცნობია (${Object.values(L.dealStage).join(', ')})` };
        const amount = r.deal_amount === '' ? 0 : parseNum(r.deal_amount);
        const pct = r.commission_percent === '' ? 50 : parseNum(String(r.commission_percent).replace('%', ''));
        const bonus = r.owner_bonus === '' ? 0 : parseNum(r.owner_bonus);
        const split0 = r.cobroker_split === '' ? 50 : parseNum(String(r.cobroker_split).replace('%', ''));
        if ([amount, pct, bonus, split0].some(Number.isNaN)) return { error: 'თანხა, საკომისიო, ბონუსი და წილი რიცხვები უნდა იყოს' };
        if (pct < 0 || pct > 100 || split0 < 0 || split0 > 100) return { error: 'პროცენტი 0-დან 100-მდე უნდა იყოს' };
        const currency = r.currency ? parseCurrency(r.currency) : 'USD';
        if (!currency) return { error: 'ვალუტა უნდა იყოს USD ან GEL ($ / ₾)' };
        const move = r.target_move_in ? parseDate(r.target_move_in) : null;
        if (r.target_move_in && !move) return { error: 'გადმოსვლის თარიღი არასწორია (გამოიყენე 2026-10-01 ან 01.10.2026)' };
        if (r.client_email && !/^\S+@\S+\.\S+$/.test(r.client_email)) return { error: 'ელფოსტის ფორმატი არასწორია' };
        // Same math as the deal form (views-deals.js)
        const base = amount * pct / 100, gross = base + bonus;
        const partner = r.partner_agent || null;
        const split = partner ? split0 : 0;
        const net = gross - (partner ? gross * split / 100 : 0);
        return { row: { apartment_id: apt?.id || null, client_name: r.client_name, client_phone: r.client_phone || null, client_email: r.client_email || null, stage, deal_amount: amount, currency, commission_percent: pct, commission_amount: base, owner_bonus: bonus, partner_agent: partner, partner_phone: r.partner_phone || null, cobroker_split: split, net_commission: net, target_move_in: move, notes: r.notes || null, created_by: S.user.id } };
      },
    },
  };
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  function parseNum(v) { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[₾$\s]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; }
  function parseBool(v) { const n = norm(v); if (['კი', 'დიახ', 'yes', 'y', 'true', '1', '+'].includes(n)) return true; if (['არა', 'no', 'n', 'false', '0', '-'].includes(n)) return false; return null; }
  function parseCurrency(v) { const n = norm(v).replace(/[.\s]/g, ''); if (['usd', '$', 'დოლარი'].includes(n)) return 'USD'; if (['gel', '₾', 'ლარი', 'lari'].includes(n)) return 'GEL'; return null; }
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
      s.src = '/vendor/xlsx.full.min.js';
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('Excel-ის ბიბლიოთეკა ვერ ჩაიტვირთა. სცადე CSV ფორმატი.')));
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
      const dupKey = def.dupKey ? def.dupKey(r) : norm(r.name || `${r.apartment}|${r.amount}|${r.expense_date}|${r.description}`);
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
      <p class="muted">შემოიტანე არსებული სია Excel-დან (.xlsx) ან CSV-დან. ჯერ შემოიტანე მფლობელები, შემდეგ ბინები, შემდეგ გარიგებები და ხარჯები — ბინები მფლობელს სახელით უკავშირდება, გარიგებები და ხარჯები ბინას. შემოტანამდე ნახავ შედეგს და შეცდომებს.</p>
      <div class="seg" role="radiogroup" aria-label="რას შემოიტან">${Object.entries(IMPORTS).map(([k, d]) => `<label><input type="radio" name="kind" value="${k}" ${importState.kind === k ? 'checked' : ''}><span>${d.label}</span></label>`).join('')}</div>
      <div class="toolbar" style="margin:0"><label class="btn btn-primary" style="cursor:pointer">${icon('upload', 16)} ფაილის არჩევა<input type="file" id="imp-file" accept=".csv,.xlsx,.xls" hidden /></label>
        <button type="button" class="btn btn-secondary" id="imp-template">${icon('file', 16)} შაბლონის ჩამოტვირთვა (CSV)</button>
        <span class="small muted">სვეტები: ${def.columns.map(([, l, r]) => r ? `<strong>${esc(l)}</strong>` : esc(l)).join(', ')} (მუქი — სავალდებულო)</span></div>
    </div>
    ${rows ? `<div class="card-head"><h2>${esc(importState.fileName)} · ${ok.length} მზადაა${bad.length ? `, <span class="t-danger">${bad.length} შეცდომით</span>` : ''}</h2>
        <div style="display:flex;gap:8px"><button type="button" class="btn btn-ghost btn-sm" id="imp-clear">გასუფთავება</button><button type="button" class="btn btn-primary btn-sm" id="imp-go" ${ok.length ? '' : 'disabled'}>${ok.length} ჩანაწერის შემოტანა</button></div></div>
      <div class="rows" style="max-height:420px;overflow-y:auto">${rows.map(r => `<div class="row" style="--cols:56px minmax(0,1fr) minmax(0,1fr)"><span class="muted small">ხაზი ${r.line}</span><span class="cell-main"><strong>${esc(r.raw.name || r.raw.client_name || r.raw.description || '')}</strong><span>${esc(Object.values(r.raw).filter(v => v && !(v instanceof Date)).slice(1, 4).join(' · '))}</span></span><span class="small ${r.error ? 't-danger' : 't-ok'}">${r.error ? esc(r.error) : 'მზადაა'}</span></div>`).join('')}</div>` : ''}
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
      if (def.table === 'apartments' && !App.guardLimit('apartments', ok.length)) return;
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
