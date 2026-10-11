// Deal Pipeline, Commission CRM, Client Matchmaker and Document Generators
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money, copyText } = R;
  const { S, H } = App;

  const STAGES = [
    { id: 'active', label: 'აქტიური დაინტერესება', badge: 'info', icon: 'tasks' },
    { id: 'viewing', label: 'ნახვა დანიშნულია', badge: 'warn', icon: 'clock' },
    { id: 'deposit', label: 'დეპოზიტი შეტანილია', badge: 'warn', icon: 'wallet' },
    { id: 'closed', label: 'გარიგება დახურულია', badge: 'ok', icon: 'check' },
  ];

  // Helper to calculate commissions
  function calcCommission(deal) {
    const rent = Number(deal.deal_amount || 0);
    const commPct = Number(deal.commission_percent ?? 50);
    const baseComm = (rent * commPct) / 100;
    const bonus = Number(deal.owner_bonus || 0);
    const gross = baseComm + bonus;
    const hasPartner = Boolean(deal.partner_agent?.trim());
    const cobrokerPct = hasPartner ? Number(deal.cobroker_split ?? 50) : 0;
    const partnerShare = hasPartner ? (gross * cobrokerPct) / 100 : 0;
    const net = gross - partnerShare;
    return { rent, commPct, baseComm, bonus, gross, hasPartner, cobrokerPct, partnerShare, net };
  }

  // Format currency with symbol
  function formatDealMoney(amount, currency = 'USD') {
    if (!amount && amount !== 0) return '—';
    const num = Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return currency === 'USD' ? `$${num}` : `${num} ₾`;
  }

  // ===========================================================================
  // DEALS PIPELINE VIEW
  // ===========================================================================
  App.views.deals = () => {
    const deals = S.data.deals || [];
    const activeDeals = deals.filter(d => !['closed', 'lost'].includes(d.stage));
    const closedDeals = deals.filter(d => d.stage === 'closed');

    // Totals
    const totalPipelineRent = activeDeals.reduce((sum, d) => sum + Number(d.deal_amount || 0), 0);
    const totalExpectedComm = activeDeals.reduce((sum, d) => sum + calcCommission(d).net, 0);
    const totalEarnedComm = closedDeals.reduce((sum, d) => sum + calcCommission(d).net, 0);

    $('#view').innerHTML = `
      <div class="page-head">
        <div>
          <h1>გარიგებები და საკომისიო</h1>
          <p class="page-sub">Deals CRM · ${activeDeals.length} აქტიური გარიგება მილსადენში</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-secondary" id="btn-matchmaker">
            ${icon('sparkle', 16)} კლიენტის მატჩმეიკერი
          </button>
          <button type="button" class="btn btn-primary" id="btn-deal-new">
            ${icon('plus', 16)} ახალი გარიგება
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards -->
      <section class="card" style="margin-bottom:20px">
        <div class="stats">
          <div class="stat">
            <span class="stat-label">მილსადენის მოცულობა</span>
            <span class="stat-value" style="color:var(--brand)">$${totalPipelineRent.toLocaleString()}</span>
            <span class="stat-note">${activeDeals.length} აქტიური კლიენტი</span>
          </div>
          <div class="stat">
            <span class="stat-label">მოსალოდნელი საკომისიო (Net)</span>
            <span class="stat-value">$${Math.round(totalExpectedComm).toLocaleString()}</span>
            <span class="stat-note">50% პირველი თვე (სუფთა)</span>
          </div>
          <div class="stat">
            <span class="stat-label">გამომუშავებული საკომისიო</span>
            <span class="stat-value" style="color:#047857">$${Math.round(totalEarnedComm).toLocaleString()}</span>
            <span class="stat-note">${closedDeals.length} დახურული გარიგება</span>
          </div>
        </div>
      </section>

      <!-- Pipeline Kanban Columns -->
      <div class="deals-pipeline-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;align-items:start">
        ${STAGES.map(st => {
          const list = deals.filter(d => d.stage === st.id);
          const colSum = list.reduce((sum, d) => sum + calcCommission(d).net, 0);
          return `
            <div class="deal-column card" style="padding:16px;background:var(--surface)">
              <div class="deal-col-head" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="badge badge-${st.badge}">${list.length}</span>
                  <strong style="font-size:14.5px">${esc(st.label)}</strong>
                </div>
                <small class="muted" style="font-weight:600">$${Math.round(colSum).toLocaleString()}</small>
              </div>

              <div class="deal-col-cards" style="display:flex;flex-direction:column;gap:12px;min-height:80px">
                ${list.length ? list.map(d => renderDealCard(d)).join('') : `<div class="empty-inline" style="padding:16px 8px;font-size:12.5px">ჩანაწერი არ არის</div>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bindings
    $('#btn-deal-new').onclick = () => openDealForm();
    $('#btn-matchmaker').onclick = () => openMatchmakerModal();

    // Card buttons
    $$('[data-deal-edit]').forEach(b => b.addEventListener('click', () => {
      const deal = S.data.deals.find(x => x.id === b.dataset.dealEdit);
      if (deal) openDealForm(deal);
    }));

    $$('[data-deal-advance]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const deal = S.data.deals.find(x => x.id === b.dataset.dealAdvance);
      const nextStage = b.dataset.nextStage;
      if (deal && nextStage) advanceDealStage(deal, nextStage, b);
    }));

    $$('[data-deal-post]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const apt = H.apt(b.dataset.dealPost);
      if (apt) App.openPostGenerator(apt);
    }));

    $$('[data-deal-lease]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const deal = S.data.deals.find(x => x.id === b.dataset.dealLease);
      const apt = H.apt(deal?.apartment_id);
      if (apt) App.openLeaseAgreementGenerator(apt, deal);
    }));
  };

  function renderDealCard(d) {
    const apt = H.apt(d.apartment_id);
    const comm = calcCommission(d);
    const cur = d.currency || 'USD';

    let nextBtn = '';
    if (d.stage === 'active') {
      nextBtn = `<button type="button" class="btn btn-ghost btn-sm" data-deal-advance="${d.id}" data-next-stage="viewing"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:5px;vertical-align:-2px"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>ნახვის დანიშვნა</button>`;
    } else if (d.stage === 'viewing') {
      nextBtn = `<button type="button" class="btn btn-ghost btn-sm" data-deal-advance="${d.id}" data-next-stage="deposit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:5px;vertical-align:-2px"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>დეპოზიტი</button>`;
    } else if (d.stage === 'deposit') {
      nextBtn = `<button type="button" class="btn btn-primary btn-sm" data-deal-advance="${d.id}" data-next-stage="closed"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:5px;vertical-align:-2px"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1 .45-1 1v1h12v-1c0-.55-.45-1-1-1h-2c-.55 0-1-.45-1-1v-2.34"></path><path d="M18 4H6v7a6 6 0 0 0 12 0V4z"></path></svg>დახურვა & საკომისიო</button>`;
    }

    return `
      <div class="deal-card" style="background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r);padding:14px;box-shadow:var(--shadow)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
          <div>
            <strong style="font-size:15px;display:block">${esc(d.client_name)}</strong>
            ${d.client_phone ? `<a href="tel:${esc(d.client_phone)}" style="font-size:12.5px;color:var(--muted);text-decoration:none">${esc(d.client_phone)}</a>` : ''}
          </div>
          <button type="button" class="icon-btn" data-deal-edit="${d.id}" title="რედაქტირება" style="width:28px;height:28px">
            ${icon('wrench', 14)}
          </button>
        </div>

        <div style="font-size:13px;margin-bottom:10px;padding:6px 8px;background:var(--surface);border-radius:6px;border:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="muted">ბინა:</span>
            <strong>${apt ? `<a href="#/apartments/${apt.id}" style="color:var(--brand);text-decoration:none">${esc(apt.name)}</a>` : 'არ არის მიბმული'}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span class="muted">ქირა:</span>
            <span><strong>${formatDealMoney(d.deal_amount, cur)}</strong> / თვეში</span>
          </div>
        </div>

        <!-- Commission Breakdown Badge -->
        <div style="display:flex;justify-content:space-between;align-items:center;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:6px 8px;margin-bottom:10px;font-size:12px">
          <span style="color:#047857;font-weight:600">შენი საკომისიო (Net):</span>
          <strong style="color:#047857;font-size:13.5px">${formatDealMoney(comm.net, cur)}</strong>
        </div>

        ${comm.hasPartner ? `
          <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;display:flex;align-items:center;gap:4px">
            ${icon('team', 12)} Co-Brokering: ${esc(d.partner_agent)} (${comm.cobrokerPct}% / ${formatDealMoney(comm.partnerShare, cur)})
          </div>
        ` : ''}

        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;border-top:1px solid var(--line);padding-top:10px">
          ${apt ? `
            <div style="display:flex;gap:4px">
              <button type="button" class="btn btn-ghost btn-sm" data-deal-post="${apt.id}" title="WhatsApp & FB პოსტი">${icon('whatsapp', 14)}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-deal-lease="${d.id}" title="ხელშეკრულება">${icon('file', 14)}</button>
            </div>
          ` : '<div></div>'}
          <div>${nextBtn}</div>
        </div>
      </div>
    `;
  }

  async function advanceDealStage(deal, newStage, btn) {
    return run(btn, async () => {
      const patch = { stage: newStage, updated_at: new Date().toISOString() };
      if (newStage === 'closed') patch.closed_at = new Date().toISOString();
      if (newStage === 'deposit') patch.deposit_paid_at = new Date().toISOString();

      let row;
      try {
        row = await q(sb.from('deals').update(patch).eq('id', deal.id).select().single());
      } catch {
        // Fallback local update
        row = { ...deal, ...patch };
      }
      App.upsertLocal('deals', row);
      toast(`სტატუსი განახლდა: ${L.dealStage[newStage] || newStage}`, { type: 'success' });
      App.render();
    });
  }

  // ===========================================================================
  // DEAL FORM MODAL
  // ===========================================================================
  function openDealForm(deal = null, defaults = {}) {
    const edit = Boolean(deal);
    const v = deal || {
      stage: defaults.stage || 'active',
      apartment_id: defaults.apartment_id || '',
      currency: defaults.currency || 'USD',
      commission_percent: 50,
      cobroker_split: 50,
      deal_amount: defaults.deal_amount || '',
      owner_bonus: 0,
      ...defaults
    };
    const id = deal?.id || R.uuid();

    return R.dialog({
      title: edit ? 'გარიგების რედაქტირება' : 'ახალი გარიგება / Deal',
      wide: true,
      submitLabel: edit ? 'შენახვა' : 'გარიგების დამატება',
      body: `
        <div class="form-grid">
          <label class="field"><span class="field-label">კლიენტის სახელი</span><input name="client_name" required value="${esc(v.client_name || '')}" placeholder="მაგ.: დავით ბერიძე" data-error="შეიყვანე კლიენტის სახელი." /></label>
          <label class="field"><span class="field-label">კლიენტის ტელეფონი</span><input type="tel" name="client_phone" value="${esc(v.client_phone || '')}" placeholder="+995 599 00 11 22" /></label>
          
          <label class="field span-2"><span class="field-label">ბინა პორტფოლიოდან</span>
            <select name="apartment_id" id="deal-apt-select">
              <option value="">-- აირჩიე ბინა --</option>
              ${S.data.apartments.filter(a => a.status !== 'archived').map(a => `
                <option value="${a.id}" data-rent="${a.monthly_rent || ''}" data-cur="${a.currency || 'USD'}" ${a.id === v.apartment_id ? 'selected' : ''}>
                  ${esc(a.name)} · ${esc(a.city || '')} (${a.monthly_rent ? (a.currency === 'GEL' ? a.monthly_rent + ' ₾' : '$' + a.monthly_rent) : 'ქირა მითითებული არაა'})
                </option>
              `).join('')}
            </select>
          </label>

          <label class="field"><span class="field-label">ქირის თანხა</span>
            <div style="display:grid;grid-template-columns:1fr 90px;gap:6px">
              <input type="number" id="deal-amount" name="deal_amount" min="0" step="10" required value="${esc(v.deal_amount || '')}" placeholder="1200" />
              <select name="currency" id="deal-currency">
                <option value="USD" ${v.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                <option value="GEL" ${v.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option>
              </select>
            </div>
          </label>

          <label class="field"><span class="field-label">ეტაპი (Stage)</span>
            <select name="stage">
              <option value="active" ${v.stage === 'active' ? 'selected' : ''}>აქტიური დაინტერესება</option>
              <option value="viewing" ${v.stage === 'viewing' ? 'selected' : ''}>ნახვა დანიშნულია</option>
              <option value="deposit" ${v.stage === 'deposit' ? 'selected' : ''}>დეპოზიტი შეტანილია</option>
              <option value="closed" ${v.stage === 'closed' ? 'selected' : ''}>დახურული (წარმატებული)</option>
              <option value="lost" ${v.stage === 'lost' ? 'selected' : ''}>ჩაშლილი</option>
            </select>
          </label>

          <!-- Commission Calculator Section -->
          <div class="form-section span-2" style="background:var(--surface-2);padding:14px;border-radius:var(--r);border:1px solid var(--line)">
            <div class="form-section-title" style="margin-bottom:10px;font-weight:700;display:flex;align-items:center;gap:6px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> საკომისიო და ბონუსის კალკულატორი</div>
            <div class="form-grid">
              <label class="field"><span class="field-label">საკომისიო (%)</span><input type="number" id="deal-comm-pct" name="commission_percent" min="0" max="100" step="5" value="${esc(v.commission_percent ?? 50)}" /><span class="field-hint">სტანდარტული: 50% (1-ლი თვე)</span></label>
              <label class="field"><span class="field-label">მესაკუთრის ბონუსი ($/₾)</span><input type="number" id="deal-bonus" name="owner_bonus" min="0" step="10" value="${esc(v.owner_bonus || 0)}" /><span class="field-hint">დამატებითი ბონუსი მესაკუთრისგან</span></label>
              <label class="field"><span class="field-label">Co-Broker პარტნიორი აგენტი</span><input name="partner_agent" id="deal-partner" value="${esc(v.partner_agent || '')}" placeholder="მაგ.: ირაკლი (GeoRealty)" /></label>
              <label class="field"><span class="field-label">პარტნიორის წილი (%)</span><input type="number" id="deal-partner-split" name="cobroker_split" min="0" max="100" step="5" value="${esc(v.cobroker_split ?? 50)}" /><span class="field-hint">50/50 თანაბარი გაყოფა</span></label>
            </div>

            <!-- Live Net Take-Home Calculation Box -->
            <div id="deal-calc-box" style="margin-top:12px;background:#ffffff;border:1px solid #a7f3d0;border-radius:8px;padding:12px;display:flex;align-items:center;justify-content:space-between">
              <div>
                <small class="muted" style="display:block">შენი სუფთა საკომისიო (Net Take-Home):</small>
                <strong id="deal-calc-net" style="font-size:20px;color:#047857">$600</strong>
              </div>
              <div id="deal-calc-breakdown" style="font-size:12px;color:var(--muted);text-align:right">
                Gross: $600 · Co-Broker: $0
              </div>
            </div>
          </div>

          <label class="field"><span class="field-label">გადაბარგების სამიზნე თარიღი</span><input type="date" name="target_move_in" value="${esc(v.target_move_in || '')}" /></label>
          <label class="field"><span class="field-label">კლიენტის ელფოსტა</span><input type="email" name="client_email" value="${esc(v.client_email || '')}" /></label>
          <label class="field span-2"><span class="field-label">შენიშვნა / კლიენტის მოთხოვნები</span><textarea name="notes" rows="2" placeholder="მაგ.: ეძებს წყნარ ადგილს, ჰყავს პატარა ძაღლი">${esc(v.notes || '')}</textarea></label>
        </div>
      `,
      onOpen: (form) => {
        // Auto fill rent when selecting apartment
        const aptSelect = $('#deal-apt-select', form);
        const rentInput = $('#deal-amount', form);
        const curSelect = $('#deal-currency', form);

        aptSelect.addEventListener('change', () => {
          const opt = aptSelect.selectedOptions[0];
          if (opt && opt.dataset.rent && !rentInput.value) {
            rentInput.value = opt.dataset.rent;
            if (opt.dataset.cur) curSelect.value = opt.dataset.cur;
            updateCalc();
          }
        });

        const updateCalc = () => {
          const rent = Number(rentInput.value || 0);
          const commPct = Number($('#deal-comm-pct', form).value || 50);
          const bonus = Number($('#deal-bonus', form).value || 0);
          const baseComm = (rent * commPct) / 100;
          const gross = baseComm + bonus;
          const partner = $('#deal-partner', form).value.trim();
          const split = partner ? Number($('#deal-partner-split', form).value || 50) : 0;
          const partnerShare = partner ? (gross * split) / 100 : 0;
          const net = gross - partnerShare;
          const curSym = curSelect.value === 'USD' ? '$' : '₾';

          $('#deal-calc-net', form).textContent = `${curSym}${Math.round(net).toLocaleString()}`;
          $('#deal-calc-breakdown', form).innerHTML = `
            სრული საკომისიო: ${curSym}${Math.round(gross).toLocaleString()}<br/>
            ${partner ? `პარტნიორის წილი: −${curSym}${Math.round(partnerShare).toLocaleString()}` : 'პირდაპირი გარიგება (100%)'}
          `;
        };

        ['deal-amount', 'deal-comm-pct', 'deal-bonus', 'deal-partner', 'deal-partner-split', 'deal-currency'].forEach(id => {
          $(`#${id}`, form)?.addEventListener('input', updateCalc);
          $(`#${id}`, form)?.addEventListener('change', updateCalc);
        });

        updateCalc();
      },
      onSubmit: async (_f, f) => {
        const rent = Number(f.deal_amount || 0);
        const commPct = Number(f.commission_percent || 50);
        const bonus = Number(f.owner_bonus || 0);
        const baseComm = (rent * commPct) / 100;
        const gross = baseComm + bonus;
        const partner = f.partner_agent?.trim() || null;
        const split = partner ? Number(f.cobroker_split || 50) : 0;
        const partnerShare = partner ? (gross * split) / 100 : 0;
        const net = gross - partnerShare;

        const payload = {
          apartment_id: f.apartment_id || null,
          client_name: f.client_name.trim(),
          client_phone: f.client_phone?.trim() || null,
          client_email: f.client_email?.trim() || null,
          stage: f.stage || 'active',
          deal_amount: rent,
          currency: f.currency || 'USD',
          commission_percent: commPct,
          commission_amount: baseComm,
          owner_bonus: bonus,
          partner_agent: partner,
          cobroker_split: split,
          net_commission: net,
          target_move_in: f.target_move_in || null,
          notes: f.notes?.trim() || null,
          organization_id: S.org.id,
          created_by: S.user.id
        };

        let row;
        try {
          row = edit
            ? await q(sb.from('deals').update(payload).eq('id', deal.id).select().single())
            : await App.insertOnce('deals', { id, ...payload });
        } catch (err) {
          console.warn('Deals remote write notice:', err);
          row = { id, ...payload, updated_at: new Date().toISOString() };
        }

        App.upsertLocal('deals', row);
        toast(edit ? 'გარიგება განახლდა' : `ახალი გარიგება შეიქმნა: ${row.client_name}`, { type: 'success' });
        App.render();
      }
    });
  }
  App.openDealForm = openDealForm;

  // ===========================================================================
  // CLIENT MATCHMAKER MODAL
  // ===========================================================================
  function openMatchmakerModal() {
    const apts = (S.data.apartments || []).filter(a => a.status !== 'archived');
    const cities = [...new Set(apts.map(a => a.city).filter(Boolean))];

    return R.dialog({
      title: 'კლიენტის მატჩმეიკერი (Client Matchmaker)',
      wide: true,
      submitLabel: 'დახურვა',
      body: `
        <div style="margin-bottom:16px;background:var(--surface-2);padding:14px;border-radius:var(--r);border:1px solid var(--line)">
          <div style="font-weight:600;font-size:13.5px;margin-bottom:8px">შეიყვანე კლიენტის ძებნის კრიტერიუმები:</div>
          <div class="form-grid" style="grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px">
            <label class="field"><span class="field-label">ქალაქი</span>
              <select id="mm-city">
                <option value="">ყველა ქალაქი</option>
                ${cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select>
            </label>
            <label class="field"><span class="field-label">მაქს. ქირა ($)</span><input type="number" id="mm-price" placeholder="მაგ. 1200" /></label>
            <label class="field"><span class="field-label">ოთახები</span>
              <select id="mm-rooms">
                <option value="">ნებისმიერი</option>
                <option value="1">1 (სტუდია)</option>
                <option value="2">2 (1 საძინებელი)</option>
                <option value="3">3 (2 საძინებელი)</option>
                <option value="4">4+ ოთახი</option>
              </select>
            </label>
            <label class="field"><span class="field-label">შინაური ცხოველები</span>
              <select id="mm-pets">
                <option value="">სულერთია</option>
                <option value="1">მხოლოდ Pet Friendly</option>
              </select>
            </label>
          </div>
        </div>

        <div id="mm-results-head" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong>შესაბამისი ბინები (<span id="mm-count">${apts.length}</span>)</strong>
          <small class="muted">ავტომატურად ფილტრავს პორტფოლიოს</small>
        </div>

        <div id="mm-results" style="display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto"></div>
      `,
      onOpen: (form) => {
        const updateList = () => {
          const city = $('#mm-city', form).value;
          const maxPrice = Number($('#mm-price', form).value || 0);
          const rooms = Number($('#mm-rooms', form).value || 0);
          const petsOnly = $('#mm-pets', form).value === '1';

          const filtered = apts.filter(a => {
            if (city && a.city !== city) return false;
            if (maxPrice && Number(a.monthly_rent || 0) > maxPrice) return false;
            if (rooms && Number(a.rooms || a.bedrooms || 1) < rooms) return false;
            if (petsOnly && !a.pets_allowed) return false;
            return true;
          });

          $('#mm-count', form).textContent = filtered.length;
          const container = $('#mm-results', form);

          if (!filtered.length) {
            container.innerHTML = `<div class="empty-inline" style="padding:24px">მითითებული პარამეტრებით ბინა ვერ მოიძებნა. შეამცირე ფილტრები.</div>`;
            return;
          }

          container.innerHTML = filtered.map(a => {
            const rentText = a.monthly_rent ? (a.currency === 'GEL' ? `${a.monthly_rent} ₾` : `$${a.monthly_rent}`) : '—';
            const showcaseUrl = `${location.origin}/p/?id=${a.id}`;
            return `
              <div class="card" style="padding:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--surface)">
                <div>
                  <strong style="font-size:14.5px;display:block">${esc(a.name)}</strong>
                  <span style="font-size:12.5px;color:var(--muted)">
                    ${esc([a.city, a.district, a.address].filter(Boolean).join(', '))} · 
                    ${a.rooms || 2} ოთახი · 
                    ${a.pets_allowed ? '<span style="display:inline-flex;align-items:center;gap:3px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="15" r="3"/><circle cx="6" cy="11" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="18" cy="11" r="2"/></svg> Pet Friendly</span>' : 'ცხოველების გარეშე'}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
                  <span style="font-size:16px;font-weight:700;color:var(--brand)">${rentText}</span>
                  <button type="button" class="btn btn-secondary btn-sm" data-mm-copy="${a.id}">
                    ${icon('copy', 14)} ბმული
                  </button>
                  <button type="button" class="btn btn-primary btn-sm" data-mm-deal="${a.id}">
                    + გარიგება
                  </button>
                </div>
              </div>
            `;
          }).join('');

          $$('[data-mm-copy]', form).forEach(b => b.addEventListener('click', () => {
            const url = `${location.origin}/p/?id=${b.dataset.mmCopy}`;
            copyText(url, 'სტუმრის ბმული დაკოპირდა!');
          }));

          $$('[data-mm-deal]', form).forEach(b => b.addEventListener('click', () => {
            const apt = H.apt(b.dataset.mmDeal);
            openDealForm(null, { apartment_id: apt.id, deal_amount: apt.monthly_rent, currency: apt.currency || 'USD' });
          }));
        };

        ['mm-city', 'mm-price', 'mm-rooms', 'mm-pets'].forEach(id => {
          $(`#${id}`, form)?.addEventListener('input', updateList);
          $(`#${id}`, form)?.addEventListener('change', updateList);
        });

        updateList();
      }
    });
  }
  App.openMatchmakerModal = openMatchmakerModal;

  // ===========================================================================
  // 1-CLICK SOCIAL & WHATSAPP POST GENERATOR MODAL
  // ===========================================================================
  App.openPostGenerator = (apartment) => {
    const a = apartment;
    const isUSD = (a.currency || 'USD').toUpperCase() === 'USD';
    const rent = Number(a.monthly_rent || 0);
    const usd = isUSD ? rent : Math.round(rent / 2.7);
    const gel = isUSD ? Math.round(rent * 2.7) : rent;
    const priceStr = isUSD ? `$${usd} / თვეში (~${gel} ₾)` : `${gel} ₾ / თვეში (~$${usd})`;

    const publicUrl = `${location.origin}/p/?id=${a.id}`;
    const whiteLabelUrl = `${location.origin}/p/?id=${a.id}&wl=1`;

    const city = a.city || 'თბილისი';
    const district = a.district || (a.city === 'ბათუმი' ? 'ბულვარი' : 'ვაკე');
    const rooms = a.rooms || a.bedrooms || 2;
    const floor = a.floor ? `${a.floor} სართული` : '';
    const pets = a.pets_allowed ? '🐾 შინაური ცხოველები: დაშვებულია' : '🚫 შინაური ცხოველები: დაუშვებელია';
    const petsEn = a.pets_allowed ? '🐾 Pets: Allowed (Pet friendly)' : '🚫 Pets: Not allowed';
    const util = a.utilities_estimate ? `💡 კომუნალური ხარჯი: ~${a.utilities_estimate} ₾/თვე` : '';

    // Georgian Post Format (Facebook / Telegram)
    const postKA = `✨ ქირავდება თანამედროვე ბინა ${city}-ში (${district})! ✨

📍 მისამართი: ${a.address || city}
💰 ფასი: ${priceStr}
🚪 ოთახები: ${rooms} ოთახი ${floor ? '· ' + floor : ''}
${pets}
${util}
🔑 პირობები: 1-ლი და ბოლო თვის წინასწარი გადახდა + დეპოზიტი

📸 იხილეთ სრული ფოტოები და დეტალები ბმულზე:
👉 ${publicUrl}

📲 დასაჯავშნად დაგვიკავშირდით პირადში ან WhatsApp-ში:
☎️ ${a.agent_phone || S.org.contact_phone || '+995 599 00 11 22'}
#ქირავდება #თბილისი #ბინა #ApartmentForRent #${district.replace(/\s+/g, '')}`;

    // English Post Format (Expats / FB Groups)
    const postEN = `✨ For Rent: Modern Apartment in ${city} (${district})! ✨

📍 Location: ${a.address || city}
💰 Rent: $${usd} / month (~${gel} GEL)
🚪 Rooms: ${rooms} rooms ${floor ? '· Floor ' + a.floor : ''}
${petsEn}
🔑 Terms: 1st & last month upfront + 1 month security deposit
🛡️ 100% Free for tenants · Zero agent fee!

📸 Full high-res photo gallery & specs:
👉 ${publicUrl}

📲 To schedule a viewing contact via WhatsApp:
☎️ ${a.agent_phone || S.org.contact_phone || '+995 599 00 11 22'}
#TbilisiRent #ApartmentForRent #ExpatsTbilisi #Rigzea`;

    // WhatsApp Direct Client Message
    const postWA = `გამარჯობა! გიგზავნით ბინის ვარიანტს ${district}-ში:
🏠 ${a.name}
💰 ${priceStr}
🚪 ${rooms} ოთახი · ${a.pets_allowed ? 'Pet friendly 🐾' : ''}

ფოტოების სრული გალერეა და მონაცემები:
${publicUrl}

თუ მოგეწონებათ, შემიძლია ნახვა დაგიჯავშნოთ!`;

    return R.dialog({
      title: 'WhatsApp & FB პოსტის გენერატორი',
      wide: true,
      submitLabel: 'დახურვა',
      body: `
        <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-secondary btn-sm" id="gen-tab-ka" style="font-weight:700">ქართული პოსტი (FB/Telegram)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="gen-tab-en">English Post (Expats)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="gen-tab-wa" style="display:inline-flex;align-items:center;gap:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>WhatsApp Direct კლიენტისთვის</button>
        </div>

        <div style="position:relative">
          <textarea id="gen-output" rows="12" class="input" style="font-family:monospace;font-size:13px;line-height:1.5;width:100%">${esc(postKA)}</textarea>
        </div>

        <div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div style="display:flex;gap:8px">
            <button type="button" class="btn btn-primary" id="btn-copy-post">
              ${icon('copy', 16)} ტექსტის კოპირება
            </button>
            <button type="button" class="btn btn-secondary" id="btn-copy-wl" style="display:inline-flex;align-items:center;gap:5px">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> White-Label ბმულის კოპირება
            </button>
          </div>
          <a class="btn btn-ghost" href="${publicUrl}" target="_blank">
            ${icon('external', 16)} გვერდის გახსნა
          </a>
        </div>
      `,
      onOpen: (form) => {
        const out = $('#gen-output', form);
        const tabKa = $('#gen-tab-ka', form);
        const tabEn = $('#gen-tab-en', form);
        const tabWa = $('#gen-tab-wa', form);

        const setTab = (activeTab, text) => {
          [tabKa, tabEn, tabWa].forEach(t => { t.className = 'btn btn-ghost btn-sm'; });
          activeTab.className = 'btn btn-secondary btn-sm';
          activeTab.style.fontWeight = '700';
          out.value = text;
        };

        tabKa.onclick = () => setTab(tabKa, postKA);
        tabEn.onclick = () => setTab(tabEn, postEN);
        tabWa.onclick = () => setTab(tabWa, postWA);

        $('#btn-copy-post', form).onclick = () => {
          copyText(out.value, 'პოსტის ტექსტი დაკოპირდა!');
        };

        $('#btn-copy-wl', form).onclick = () => {
          copyText(whiteLabelUrl, 'White-Label ბმული დაკოპირდა (კონტაქტის გარეშე)!');
        };
      }
    });
  };

  // ===========================================================================
  // STANDARD GEORGIAN/ENGLISH LEASE AGREEMENT GENERATOR (PRINT / PDF)
  // ===========================================================================
  App.openLeaseAgreementGenerator = (apartment, deal = null) => {
    const a = apartment;
    const owner = H.owner(a.owner_id);
    const tenantName = deal?.client_name || a.tenant_name || 'დავით ბერიძე';
    const tenantPhone = deal?.client_phone || a.tenant_phone || '+995 599 00 11 22';
    const ownerName = owner?.name || S.org.name || 'მესაკუთრე';
    const ownerPhone = owner?.phone || S.org.contact_phone || '—';

    const cur = deal?.currency || a.currency || 'USD';
    const rent = deal?.deal_amount || a.monthly_rent || 1200;
    const curSymbol = cur === 'USD' ? '$' : '₾';
    const deposit = a.deposit_amount || rent;

    const todayStr = R.date(new Date(), { withYear: true });
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const endDateStr = R.date(oneYearLater, { withYear: true });

    return R.dialog({
      title: 'საიჯარო ხელშეკრულება (Lease Agreement Generator)',
      wide: true,
      submitLabel: 'დახურვა',
      body: `
        <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
          <p class="muted" style="margin:0;font-size:13.5px">საქართველოს სამოქალაქო კოდექსის შესაბამისი ორენოვანი სტანდარტული ხელშეკრულება.</p>
          <button type="button" class="btn btn-primary" id="btn-print-lease">
            ${icon('printer', 16)} ბეჭდვა / PDF შენახვა
          </button>
        </div>

        <div id="lease-printable-area" style="background:#ffffff;border:1px solid var(--line);border-radius:var(--r);padding:32px 28px;max-height:550px;overflow-y:auto;font-size:13px;line-height:1.6;color:#1e293b">
          <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:20px">
            <h2 style="font-size:18px;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px">საცხოვრებელი ბინის ქირავნობის ხელშეკრულება</h2>
            <h3 style="font-size:14px;margin:0;color:var(--muted);font-weight:600">RESIDENTIAL LEASE AGREEMENT</h3>
            <p style="margin:8px 0 0;font-size:12px;color:var(--muted)">ქალაქი ${esc(a.city || 'თბილისი')} · თარიღი: ${todayStr}</p>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;padding:12px;background:#f8fafc;border-radius:8px">
            <div>
              <strong style="display:block;font-size:13px;color:var(--brand)">1. გამქირავებელი (LESSOR):</strong>
              <div>სახელი / სახელი: <strong>${esc(ownerName)}</strong></div>
              <div>ტელეფონი: ${esc(ownerPhone)}</div>
            </div>
            <div>
              <strong style="display:block;font-size:13px;color:var(--brand)">2. დამქირავებელი (LESSEE):</strong>
              <div>სახელი / სახელი: <strong>${esc(tenantName)}</strong></div>
              <div>ტელეფონი: ${esc(tenantPhone)}</div>
            </div>
          </div>

          <h4 style="font-size:14px;margin:16px 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px">მუხლი 1. ხელშეკრულების საგანი (SUBJECT OF AGREEMENT)</h4>
          <p>
            1.1. გამქირავებელი გადასცემს, ხოლო დამქირავებელი დროებით სარგებლობაში იღებს საცხოვრებელ ბინას, მდებარე მისამართზე: <strong>${esc([a.city, a.district, a.address, a.unit_number && 'ბინა ' + a.unit_number].filter(Boolean).join(', '))}</strong>.<br/>
            <i>1.1. The Lessor provides and the Lessee accepts for temporary residential use the apartment located at: ${esc([a.city, a.district, a.address].filter(Boolean).join(', '))}.</i>
          </p>

          <h4 style="font-size:14px;margin:16px 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px">მუხლი 2. ქირის ოდენობა და გადახდის წესი (RENT & PAYMENT)</h4>
          <p>
            2.1. ყოველთვიური ქირის ოდენობა შეადგენს: <strong>${curSymbol}${rent} (${cur})</strong>.<br/>
            2.2. ქირის გადახდა ხორციელდება ყოველი თვის <strong>${a.rent_due_day || 1}</strong> რიცხვამდე.<br/>
            2.3. ხელშეკრულების ხელმოწერისას დამქირავებელი იხდის პირველი და ბოლო თვის ქირას და საგარანტიო დეპოზიტს <strong>${curSymbol}${deposit}</strong> ოდენობით, რომელიც უბრუნდება ბინის ჩაბარებისას.<br/>
            <i>2.1. The monthly rent amount is ${curSymbol}${rent}. The Lessee shall pay rent before day ${a.rent_due_day || 1} of each month. A security deposit of ${curSymbol}${deposit} is paid upon signing.</i>
          </p>

          <h4 style="font-size:14px;margin:16px 0 6px;border-bottom:1px solid var(--line);padding-bottom:4px">მუხლი 3. ვადები და კომუნალური ხარჯები (TERM & UTILITIES)</h4>
          <p>
            3.1. ხელშეკრულების მოქმედების ვადა: <strong>${todayStr}</strong>-დან <strong>${endDateStr}</strong>-მდე (1 წელი).<br/>
            3.2. დამქირავებელი ვალდებულია დროულად გადაიხადოს მოხმარებული კომუნალური გადასახადები (ელექტროენერგია, გაზი, წყალი, ინტერნეტი).<br/>
            3.3. შინაური ცხოველების ყოლა: <strong>${a.pets_allowed ? 'ნებადართულია (Pet friendly)' : 'აკრძალულია'}</strong>.<br/>
            <i>3.1. Lease term: from ${todayStr} until ${endDateStr}. The Lessee pays all consumed utility bills. Pets: ${a.pets_allowed ? 'Allowed' : 'Prohibited'}.</i>
          </p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;padding-top:20px;border-top:1px dashed var(--line)">
            <div>
              <p style="margin:0 0 40px"><strong>გამქირავებელი / Lessor:</strong></p>
              <div style="border-bottom:1px solid #000;width:180px;margin-bottom:6px"></div>
              <small class="muted">ხელმოწერა / Signature</small>
            </div>
            <div>
              <p style="margin:0 0 40px"><strong>დამქირავებელი / Lessee:</strong></p>
              <div style="border-bottom:1px solid #000;width:180px;margin-bottom:6px"></div>
              <small class="muted">ხელმოწერა / Signature</small>
            </div>
          </div>
        </div>
      `,
      onOpen: (form) => {
        $('#btn-print-lease', form).onclick = () => {
          const content = $('#lease-printable-area', form).innerHTML;
          const printWin = window.open('', '_blank');
          printWin.document.write(`
            <!doctype html>
            <html>
            <head>
              <title>Lease Agreement · ${esc(a.name)}</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #000; line-height: 1.6; }
                @media print { body { padding: 0; } }
              </style>
            </head>
            <body>${content}</body>
            </html>
          `);
          printWin.document.close();
          printWin.focus();
          setTimeout(() => { printWin.print(); printWin.close(); }, 300);
        };
      }
    });
  };

  // Link copy helper
  App.copyRenterLink = (aptId, isWhiteLabel = false) => {
    const url = isWhiteLabel ? `${location.origin}/p/?id=${aptId}&wl=1` : `${location.origin}/p/?id=${aptId}`;
    copyText(url, isWhiteLabel ? 'White-Label ბმული დაკოპირდა!' : 'სტუმრის ბმული დაკოპირდა!');
  };

})();
