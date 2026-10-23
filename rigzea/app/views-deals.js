// Deals layer: pipeline, commissions, client matchmaker + selections,
// social post generator and the bilingual lease agreement.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, copyText } = R;
  const { S, H } = App;

  const STAGES = [
    { id: 'enquiry', label: 'ახალი მოთხოვნა', badge: 'info' },
    { id: 'contacted', label: 'კონტაქტი დამყარებულია', badge: 'info' },
    { id: 'viewing', label: 'ნახვა დანიშნულია', badge: 'warn' },
    { id: 'offer', label: 'შეთავაზება გაგზავნილია', badge: 'warn' },
    { id: 'negotiation', label: 'მოლაპარაკება', badge: 'warn' },
    { id: 'deposit', label: 'დეპოზიტი / ბე', badge: 'warn' },
    { id: 'closed', label: 'გარიგება დახურულია', badge: 'ok' },
  ];
  const OPEN_STAGES = ['enquiry', 'contacted', 'viewing', 'offer', 'negotiation', 'deposit', 'active'];

  // Amenity ids shared with the public listing page.
  const AMENITIES = {
    wifi: ['Wi-Fi', 'Wi-Fi'], ac: ['კონდიციონერი', 'Air conditioning'], heating: ['ცენტრალური გათბობა', 'Central heating'],
    balcony: ['აივანი', 'Balcony'], dishwasher: ['ჭურჭლის სარეცხი მანქანა', 'Dishwasher'], washing_machine: ['სარეცხი მანქანა', 'Washing machine'],
    elevator: ['ლიფტი', 'Elevator'], parking: ['პარკინგი', 'Parking'], tv: ['Smart TV', 'Smart TV'], oven: ['ღუმელი', 'Oven'],
    microwave: ['მიკროტალღური ღუმელი', 'Microwave'], security: ['დაცვა 24/7', '24/7 security'], furniture: ['ავეჯი', 'Furnished'],
  };

  // ---------------------------------------------------------------------------
  // Money helpers (org FX rate: GEL per 1 USD, set on the organization)
  // ---------------------------------------------------------------------------
  const fxRate = () => { const r = Number(S.org?.fx_rate); return r > 0 ? r : null; };
  const curSym = (c) => (c === 'GEL' ? '₾' : '$');

  function fmtMoney(amount, currency = 'USD') {
    return R.money(amount, currency);
  }

  // Converts between USD and GEL with the org rate; returns null when a rate is needed but missing.
  function convert(amount, from, to) {
    const v = Number(amount || 0);
    if ((from || 'USD') === to) return v;
    const r = fxRate();
    if (!r) return null;
    return to === 'GEL' ? v * r : v / r;
  }

  function calcCommission(deal) {
    const isSale = deal.deal_type === 'sale';
    const amount = Number(deal.deal_amount || 0);
    const commType = deal.commission_type || 'percent';
    let baseComm = 0;
    let commPct = 0;
    if (commType === 'fixed') {
      baseComm = Number(deal.commission_amount || 0);
    } else {
      commPct = Number(deal.commission_percent ?? (isSale ? 3 : 50));
      baseComm = (amount * commPct) / 100;
    }
    const bonus = Number(deal.owner_bonus || 0);
    const gross = baseComm + bonus;
    const hasPartner = Boolean(String(deal.partner_agent || '').trim());
    const cobrokerPct = hasPartner ? Number(deal.cobroker_split ?? 50) : 0;
    const partnerShare = hasPartner ? (gross * cobrokerPct) / 100 : 0;
    const net = gross - partnerShare;
    return { dealAmount: amount, isSale, commType, commPct, baseComm, bonus, gross, hasPartner, cobrokerPct, partnerShare, net };
  }


  // Team split of the net commission (after the external partner's share).
  function calcSplit(d) {
    const c = calcCommission(d);
    const listingPct = d.listing_agent_id ? Number(d.listing_split ?? 25) : 0;
    const sellingPct = d.selling_agent_id ? Number(d.selling_split ?? 25) : 0;
    const listing = (c.net * listingPct) / 100, selling = (c.net * sellingPct) / 100;
    return { ...c, listingPct, sellingPct, listing, selling, house: c.net - listing - selling };
  }
  App.calcSplit = calcSplit;
  // Amount in both currencies when the workspace has an FX rate.
  function bothCur(amount, cur) {
    const other = cur === 'GEL' ? 'USD' : 'GEL';
    const alt = convert(amount, cur, other);
    if (alt === null) return fmtMoney(amount, cur);
    return `${fmtMoney(cur === 'USD' ? amount : alt, 'USD')} · ${fmtMoney(cur === 'GEL' ? amount : alt, 'GEL')}`;
  }
  const memberName = (id) => S.data.members.find(m => m.id === id)?.display_name || '–';
  const deskMembers = () => S.data.members.filter(m => m.role !== 'staff');

  // Sums a per-deal value in one currency. missing = deals that could not be converted (no FX rate).
  function sumIn(deals, cur, pick) {
    let value = 0, missing = 0;
    deals.forEach(d => { const v = convert(pick(d), d.currency || 'USD', cur); if (v === null) missing++; else value += v; });
    return { value, missing };
  }

  const displayCur = () => { try { return localStorage.getItem('rigzea_deals_cur') === 'GEL' ? 'GEL' : 'USD'; } catch { return 'USD'; } };
  const setDisplayCur = (c) => { try { localStorage.setItem('rigzea_deals_cur', c); } catch { /* per-viewer convenience only */ } };

  const agentName = (userId) => S.data.members.find(m => m.user_id === userId)?.display_name || '–';
  const dmy = (v) => { const d = R.toDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : ''; };
  const randomSlug = () => { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; const b = crypto.getRandomValues(new Uint8Array(12)); return Array.from(b, x => a[x % a.length]).join(''); };
  const selectionUrl = (slug) => `${location.origin}/p/s/?id=${encodeURIComponent(slug)}`;
  const listingUrl = (a, wl = false) => R.listingUrl(a, wl);
  const aptPriceLabel = (a) => {
    if (!a) return '–';
    if (a.transaction_type === 'sale') return a.sale_price ? `${fmtMoney(a.sale_price, a.currency || 'USD')} (გაყიდვა)` : 'ფასი მითითებული არაა';
    return a.monthly_rent ? `${fmtMoney(a.monthly_rent, a.currency || 'USD')} / თვე` : 'ქირა მითითებული არაა';
  };

  // ===========================================================================
  // DEALS VIEW (tabs: pipeline · commissions · selections)
  // ===========================================================================
  let dealTypeFilter = 'all';
  let dealViewMode = localStorage.getItem('rigzea_deal_view') || 'board';
  // Section pages (#/deals?type=rental|sale) show one side of the business.
  let dealSection = null;
  const inSection = (d) => !dealSection || (dealSection === 'sale') === (d.deal_type === 'sale');

  App.views.deals = (r = {}) => {
    const tab = ['commissions', 'selections', 'documents'].includes(r.id) ? r.id : 'pipeline';
    const type = r.params?.get('type');
    dealSection = ['rental', 'sale'].includes(type) ? type : null;
    const qs = dealSection ? `?type=${dealSection}` : '';
    const deals = (S.data.deals || []).filter(inSection);
    const activeCount = deals.filter(d => OPEN_STAGES.includes(d.stage)).length;
    const title = dealSection === 'sale' ? 'გაყიდვის გარიგებები' : dealSection === 'rental' ? 'გაქირავების გარიგებები' : 'გარიგებები და საკომისიო';

    $('#view').innerHTML = `
      <div class="page-head">
        <div>
          <h1>${title}</h1>
          <p class="page-sub muted">${activeCount} აქტიური გარიგება${dealSection ? '' : ' · გაყიდვები და გაქირავება'}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-secondary" id="btn-matchmaker">${icon('sparkle', 16)} ბინების შერჩევა</button>
          <button type="button" class="btn btn-primary" id="btn-deal-new">${icon('plus', 16)} ახალი გარიგება</button>
        </div>
      </div>
      <div class="tabs" role="tablist">
        <a class="tab" role="tab" href="#/deals${qs}" aria-selected="${tab === 'pipeline'}">ეტაპები</a>
        <a class="tab" role="tab" href="#/deals/commissions${qs}" aria-selected="${tab === 'commissions'}">საკომისიოები</a>
        <a class="tab" role="tab" href="#/deals/selections${qs}" aria-selected="${tab === 'selections'}">შერჩევები</a>
        <a class="tab" role="tab" href="#/deals/documents${qs}" aria-selected="${tab === 'documents'}">ხელშეკრულებები და რეესტრი</a>
      </div>
      <div id="deals-body"></div>`;

    $('#btn-deal-new').onclick = () => openDealForm(null, dealSection ? { deal_type: dealSection } : {});
    $('#btn-matchmaker').onclick = () => openMatchmakerModal();

    if (tab === 'commissions') renderCommissions();
    else if (tab === 'selections') renderSelections();
    else if (tab === 'documents') App.renderDocuments($('#deals-body'));
    else renderPipeline();
  };

  // ---------------------------------------------------------------------------
  // Pipeline
  // ---------------------------------------------------------------------------
  function renderPipeline() {
    const allDeals = (S.data.deals || []).filter(inSection);
    const DEAL_TYPES = [['all', 'ყველა ტიპი'], ['sale', 'გაყიდვა'], ['rental', 'გაქირავება']];
    const deals = allDeals.filter(d => dealSection || dealTypeFilter === 'all' || (d.deal_type || 'rental') === dealTypeFilter);
    const cur = displayCur();
    const open = deals.filter(d => OPEN_STAGES.includes(d.stage));
    const closed = deals.filter(d => d.stage === 'closed');
    const pipe = sumIn(open, cur, d => d.deal_amount);
    const expected = sumIn(open, cur, d => calcCommission(d).net);
    const earned = sumIn(closed, cur, d => calcCommission(d).net);
    const missing = pipe.missing + earned.missing;

    $('#deals-body').innerHTML = `
      ${dealSection ? '' : `<div class="chips" role="group" aria-label="გარიგების ტიპი" style="margin-bottom:12px">
        ${DEAL_TYPES.map(([id, label]) => `<button type="button" class="chip" data-dt="${id}" aria-pressed="${dealTypeFilter === id}">${label} <span class="count">${allDeals.filter(d => id === 'all' || (d.deal_type || 'rental') === id).length}</span></button>`).join('')}
      </div>`}
      <section class="card" style="margin-bottom:16px">
        <div class="stats">
          <div class="stat"><span class="stat-label">ღია გარიგებების მოცულობა</span><span class="stat-value">${fmtMoney(pipe.value, cur)}</span><span class="stat-note">${open.length} ღია გარიგება</span></div>
          <div class="stat"><span class="stat-label">მოსალოდნელი საკომისიო (სუფთა)</span><span class="stat-value">${fmtMoney(expected.value, cur)}</span><span class="stat-note">პარტნიორის წილის გარეშე</span></div>
          <div class="stat"><span class="stat-label">გამომუშავებული საკომისიო</span><span class="stat-value t-ok">${fmtMoney(earned.value, cur)}</span><span class="stat-note">${closed.length} დახურული გარიგება</span></div>
        </div>
        ${missing ? `<div class="calc">${icon('alert', 14)} ${missing} გარიგება სხვა ვალუტაშია და ჯამში არ შევიდა. მიუთითე ვალუტის კურსი „საკომისიოების“ ჩანართში.</div>` : ''}
      </section>
      <div class="toolbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${curToggle(cur)}
        <div class="seg" role="radiogroup" aria-label="ხედი">
          <label><input type="radio" name="deals-view-mode" value="board" ${dealViewMode === 'board' ? 'checked' : ''} /><span>${icon('list', 14)} დაფა</span></label>
          <label><input type="radio" name="deals-view-mode" value="table" ${dealViewMode === 'table' ? 'checked' : ''} /><span>${icon('chart', 14)} ცხრილი</span></label>
        </div>
        <span class="grow"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-export="csv">${icon('file', 14)} CSV</button>
        <button type="button" class="btn btn-ghost btn-sm" data-export="xlsx">${icon('file', 14)} Excel</button>
      </div>
      ${deals.length ? '' : `<section class="card" style="margin-bottom:16px"><div class="empty">${icon('wallet', 28)}<h3>გარიგება ჯერ არ არის</h3><p>დაამატე კლიენტი და მიაბი ობიექტი.</p><button type="button" class="btn btn-primary" id="btn-deal-empty">${icon('plus', 16)} პირველი გარიგება</button></div></section>`}
      ${dealViewMode === 'table' && deals.length ? `
        <section class="card deal-table-wrap">
          <table class="deal-table">
            <thead>
              <tr>
                <th>კლიენტი</th>
                <th>ობიექტი</th>
                <th>ტიპი</th>
                <th>თანხა</th>
                <th>სუფთა საკომისიო</th>
                <th>ეტაპი</th>
                <th style="text-align:right">მოქმედება</th>
              </tr>
            </thead>
            <tbody>
              ${deals.map(d => {
                const apt = H.apt(d.apartment_id);
                const comm = calcCommission(d);
                const cur = d.currency || 'USD';
                const isSale = d.deal_type === 'sale';
                return `<tr>
                  <td>
                    <strong>${esc(d.client_name)} ${H.flagTag(H.contactByPhone(d.client_phone))}</strong>
                    <div class="small muted">${d.contact_type ? R.contactBadge(d.contact_type) + ' · ' : ''}${d.client_phone ? `<a href="tel:${esc(d.client_phone)}">${esc(d.client_phone)}</a>` : '–'}</div>
                  </td>
                  <td>${apt ? `<a href="#/apartments/${apt.id}">${esc(apt.name)}</a>` : '<span class="muted">–</span>'}</td>
                  <td>${isSale ? 'გაყიდვა' : 'ქირა'}</td>
                  <td class="num strong">${fmtMoney(d.deal_amount, cur)}</td>
                  <td class="num strong t-ok">${fmtMoney(comm.net, cur)}</td>
                  <td>
                    <select class="deal-stage-select" data-deal-quick-stage="${d.id}" aria-label="ეტაპი: ${esc(d.client_name)}">
                      ${STAGES.map(s => `<option value="${s.id}" ${d.stage === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                      <option value="lost" ${d.stage === 'lost' ? 'selected' : ''}>ჩაშლილი</option>
                    </select>
                  </td>
                  <td style="text-align:right;white-space:nowrap">
                    ${!isSale ? `<button type="button" class="btn btn-ghost btn-sm" data-deal-lease="${d.id}" title="ხელშეკრულება" aria-label="ხელშეკრულება">${icon('file', 14)}</button>` : `<button type="button" class="btn btn-ghost btn-sm" data-deal-docs="${d.id}" title="ხელშეკრულებები" aria-label="ხელშეკრულებები">${icon('file', 14)}</button>`}
                    <button type="button" class="btn btn-ghost btn-sm" data-deal-edit="${d.id}" title="რედაქტირება">${icon('wrench', 14)}</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </section>` : ''}
      ${dealViewMode === 'board' && deals.length ? `
        <div class="deal-board">
          ${STAGES.map(st => {
            const list = deals.filter(d => d.stage === st.id || (st.id === 'enquiry' && d.stage === 'active'));
            const colSum = sumIn(list, cur, d => calcCommission(d).net).value;
            return `
              <section class="deal-col card">
                <div class="deal-col-head">
                  <span class="badge badge-${st.badge}">${list.length}</span>
                  <strong>${esc(st.label)}</strong>
                  <small class="muted">${fmtMoney(colSum, cur)}</small>
                </div>
                <div class="deal-col-cards" data-stage-col="${st.id}">
                  ${list.length ? list.map(renderDealCard).join('') : '<div class="empty-inline">ჩანაწერი არ არის</div>'}
                </div>
              </section>`;
          }).join('')}
        </div>
        ${deals.some(d => d.stage === 'lost') ? `<p class="muted small" style="margin-top:8px">${deals.filter(d => d.stage === 'lost').length} წაგებული გარიგება დაფაზე არ ჩანს. ნახე „ცხრილის“ ხედში.</p>` : ''}` : ''}`;

    $$('[data-dt]').forEach(b => b.addEventListener('click', () => { dealTypeFilter = b.dataset.dt; renderPipeline(); }));
    $('#btn-deal-empty')?.addEventListener('click', () => openDealForm(null, dealSection ? { deal_type: dealSection } : {}));
    bindCurToggle();
    $$('input[name="deals-view-mode"]').forEach(i => i.addEventListener('change', () => {
      dealViewMode = i.value;
      localStorage.setItem('rigzea_deal_view', dealViewMode);
      renderPipeline();
    }));
    $$('[data-deal-quick-stage]').forEach(sel => sel.addEventListener('change', () => {
      const deal = H.deal(sel.dataset.dealQuickStage);
      if (deal && deal.stage !== sel.value) {
        advanceDealStage(deal, sel.value, sel);
      }
    }));
    $$('[data-export]').forEach(b => b.addEventListener('click', () => exportDeals(deals, b.dataset.export, b, 'all')));

    $$('[data-deal-edit]').forEach(b => b.addEventListener('click', () => {
      const deal = H.deal(b.dataset.dealEdit);
      if (deal) openDealForm(deal);
    }));
    $$('[data-deal-advance]').forEach(b => b.addEventListener('click', () => {
      const deal = H.deal(b.dataset.dealAdvance);
      if (deal) advanceDealStage(deal, b.dataset.nextStage, b);
    }));
    $$('[data-deal-match]').forEach(b => b.addEventListener('click', () => openMatchmakerModal(H.deal(b.dataset.dealMatch))));
    $$('[data-deal-viewing]').forEach(b => b.addEventListener('click', () => {
      const deal = H.deal(b.dataset.dealViewing);
      if (deal) App.openTaskForm({ type: 'viewing', apartmentId: deal.apartment_id, dealId: deal.id, prefill: { title: `ნახვა: ${deal.client_name}` } });
    }));
    $$('[data-deal-post]').forEach(b => b.addEventListener('click', () => { const apt = H.apt(b.dataset.dealPost); if (apt) App.openPostGenerator(apt); }));
    $$('[data-deal-docs]').forEach(b => b.addEventListener('click', () => { const deal = H.deal(b.dataset.dealDocs); if (deal) App.openDocChooser({ deal }); }));
    $$('[data-deal-lease]').forEach(b => b.addEventListener('click', () => {
      const deal = H.deal(b.dataset.dealLease);
      const apt = H.apt(deal?.apartment_id);
      App.openLeaseAgreementGenerator(apt, deal);
    }));

    if (dealViewMode === 'board') {
      $$('.deal-card[draggable="true"]').forEach(card => {
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', card.dataset.dealId);
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('is-dragging');
        });
      });
      $$('.deal-col-cards[data-stage-col]').forEach(col => {
        col.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          col.classList.add('is-drag-over');
        });
        col.addEventListener('dragleave', (e) => {
          if (!col.contains(e.relatedTarget)) col.classList.remove('is-drag-over');
        });
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('is-drag-over');
          const dealId = e.dataTransfer.getData('text/plain');
          const deal = H.deal(dealId);
          const newStage = col.dataset.stageCol;
          if (deal && newStage && deal.stage !== newStage) {
            advanceDealStage(deal, newStage);
          }
        });
      });
    }
  }

  function curToggle(cur) {
    return `<div class="seg" role="radiogroup" aria-label="ვალუტა">
      ${['USD', 'GEL'].map(c => `<label><input type="radio" name="deals-cur" value="${c}" ${cur === c ? 'checked' : ''} /><span>${c} (${curSym(c)})</span></label>`).join('')}
    </div>`;
  }
  function bindCurToggle() {
    $$('input[name="deals-cur"]').forEach(i => i.addEventListener('change', () => { setDisplayCur(i.value); App.render(); }));
  }

  function renderDealCard(d) {
    const apt = H.apt(d.apartment_id);
    const comm = calcCommission(d);
    const cur = d.currency || 'USD';
    const isSale = d.deal_type === 'sale';
    const nextMap = {
      enquiry: ['contacted', 'კონტაქტი', 'btn-ghost', 'user'],
      contacted: ['viewing', 'ნახვა', 'btn-ghost', 'clock'],
      active: ['viewing', 'ნახვა', 'btn-ghost', 'clock'],
      viewing: ['offer', 'შეთავაზება', 'btn-ghost', 'file'],
      offer: ['negotiation', 'მოლაპარაკება', 'btn-ghost', 'sparkle'],
      negotiation: ['deposit', 'დეპოზიტი / ბე', 'btn-ghost', 'wallet'],
      deposit: ['closed', 'დახურვა', 'btn-primary', 'check'],
    };
    const next = nextMap[d.stage];
    return `
      <article class="deal-card" draggable="true" data-deal-id="${d.id}">
        <div class="deal-card-head">
          <div class="cell-main">
            <strong>${esc(d.client_name)} ${H.flagTag(H.contactByPhone(d.client_phone))}</strong>
            <span class="small muted">${d.contact_type ? R.contactBadge(d.contact_type) + ' · ' : ''}${d.client_phone ? `<a href="tel:${esc(d.client_phone)}">${esc(d.client_phone)}</a>` : ''}</span>
          </div>
          <button type="button" class="icon-btn" data-deal-edit="${d.id}" title="რედაქტირება" aria-label="რედაქტირება: ${esc(d.client_name)}">${icon('wrench', 14)}</button>
        </div>
        <dl class="deal-card-facts">
          <div><dt>ობიექტი</dt><dd>${apt ? `<a href="#/apartments/${apt.id}">${esc(apt.name)}</a>` : '<span class="muted">არ არის მიბმული</span>'}</dd></div>
          <div><dt>${isSale ? 'გაყიდვა' : 'ქირა'}</dt><dd>${fmtMoney(d.deal_amount, cur)}${isSale ? '' : ' / თვე'}</dd></div>
        </dl>
        ${comm.hasPartner ? `<div class="deal-partner" style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span>${icon('team', 12)} ${esc(d.partner_agent)} · ${comm.cobrokerPct}% (${fmtMoney(comm.partnerShare, cur)})</span>
          ${d.partner_phone ? `<a href="https://wa.me/${d.partner_phone.replace(/[^\d]/g, '').replace(/^0/, '995')}" target="_blank" rel="noopener" class="t-ok" style="display:inline-flex;align-items:center;gap:3px;font-size:11px" title="WhatsApp მიწერა">${icon('whatsapp', 12)} WA</a>` : ''}
        </div>` : ''}
        <div class="deal-card-foot">
          <div class="deal-card-tools">
            <button type="button" class="btn btn-ghost btn-sm" data-deal-viewing="${d.id}" title="ნახვის დანიშვნა" aria-label="ნახვის დანიშვნა">${icon('clock', 14)}</button>
            <button type="button" class="btn btn-ghost btn-sm" data-deal-match="${d.id}" title="შერჩევა" aria-label="შერჩევა">${icon('sparkle', 14)}</button>
            ${apt ? `<button type="button" class="btn btn-ghost btn-sm" data-deal-post="${apt.id}" title="პოსტის გენერატორი" aria-label="პოსტის გენერატორი">${icon('whatsapp', 14)}</button>` : ''}
            ${!isSale ? `<button type="button" class="btn btn-ghost btn-sm" data-deal-lease="${d.id}" title="ხელშეკრულება" aria-label="ხელშეკრულება">${icon('file', 14)}</button>` : ''}
            ${isSale ? `<button type="button" class="btn btn-ghost btn-sm" data-deal-docs="${d.id}" title="ხელშეკრულებები" aria-label="ხელშეკრულებები">${icon('file', 14)}</button>` : ''}
          </div>
          ${next ? `<button type="button" class="btn ${next[2]} btn-sm" data-deal-advance="${d.id}" data-next-stage="${next[0]}">${icon(next[3], 14)} ${next[1]}</button>` : ''}
        </div>
      </article>`;
  }

  // Writes only after the database confirms; failures surface through run() with a retry.
  function advanceDealStage(deal, newStage, btn) {
    return run(btn, async () => {
      const now = new Date().toISOString();
      const patch = { stage: newStage, updated_at: now };
      if (newStage === 'closed') patch.closed_at = now;
      if (newStage === 'deposit') patch.deposit_paid_at = now;
      const row = await q(sb.from('deals').update(patch).eq('id', deal.id).select().single());
      App.upsertLocal('deals', row);
      toast(`ეტაპი განახლდა: ${L.dealStage[newStage] || newStage}`, { type: 'success' });
      App.render();
    });
  }

  // ===========================================================================
  // DEAL FORM
  // ===========================================================================
  function openDealForm(deal = null, defaults = {}) {
    const edit = Boolean(deal);
    const isDefSale = defaults.deal_type === 'sale';
    const v = deal || { deal_type: isDefSale ? 'sale' : 'rental', contact_type: isDefSale ? 'buyer' : 'renter', stage: isDefSale ? 'enquiry' : 'active', apartment_id: '', currency: 'USD', commission_type: 'percent', commission_percent: isDefSale ? 3 : 50, cobroker_split: 50, deal_amount: '', owner_bonus: 0, commission_amount: '',
      listing_agent_id: H.apt(defaults.apartment_id)?.listing_agent_id || '', selling_agent_id: S.member?.id || '', listing_split: 25, selling_split: 25, ...defaults };
    const id = deal?.id || R.uuid();
    const canSplit = App.isManager();
    // Co-broking is on only when a partner is recorded; the default 50% split alone doesn't count.
    const hasPartner = Boolean(v.partner_agent);
    const hasMore = Boolean(edit && (v.partner_agent || v.partner_phone || Number(v.owner_bonus) || v.target_move_in || v.follow_up_date || v.client_email || v.listing_agent_id));
    const agentOptions = (sel) => `<option value="">არ არის</option>${deskMembers().map(m => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.display_name || 'უსახელო')}</option>`).join('')}`;
    const numOr = (val, dflt) => (val === '' || val === undefined || val === null ? dflt : Number(val));

    return R.dialog({
      title: edit ? 'გარიგების რედაქტირება' : 'ახალი გარიგება',
      wide: true,
      submitLabel: edit ? 'შენახვა' : 'გარიგების დამატება',
      body: `
        <div class="form-grid">
          <label class="field"><span class="field-label">გარიგების ტიპი</span>
            <select name="deal_type" id="deal-type-select">
              <option value="sale" ${(v.deal_type || 'rental') === 'sale' ? 'selected' : ''}>გაყიდვა</option>
              <option value="rental" ${(v.deal_type || 'rental') === 'rental' ? 'selected' : ''}>გაქირავება</option>
            </select>
          </label>
          <label class="field"><span class="field-label">კონტაქტის ტიპი</span>
            <select name="contact_type" id="deal-contact-type">
              <option value="buyer" ${(v.contact_type || 'buyer') === 'buyer' ? 'selected' : ''}>მყიდველი</option>
              <option value="renter" ${(v.contact_type) === 'renter' ? 'selected' : ''}>მდგმური</option>
              <option value="seller" ${(v.contact_type) === 'seller' ? 'selected' : ''}>გამყიდველი</option>
              <option value="owner" ${(v.contact_type) === 'owner' ? 'selected' : ''}>მეპატრონე</option>
              <option value="other" ${(v.contact_type) === 'other' ? 'selected' : ''}>სხვა</option>
            </select>
          </label>
          <label class="field"><span class="field-label">კლიენტის სახელი</span><input name="client_name" required value="${esc(v.client_name || '')}" placeholder="მაგ.: დავით ბერიძე" data-error="შეიყვანე კლიენტის სახელი." /></label>
          <label class="field"><span class="field-label">კლიენტის ტელეფონი</span><input type="tel" name="client_phone" id="deal-client-phone" value="${esc(v.client_phone || '')}" placeholder="+995 5XX XX XX XX" /></label>
          <div class="span-2" id="deal-flag" hidden></div>
          <label class="field span-2"><span class="field-label">ობიექტი პორტფოლიოდან</span>
            <select name="apartment_id" id="deal-apt-select">
              <option value="">აირჩიე ობიექტი</option>
              ${S.data.apartments.filter(a => a.status !== 'archived').map(a => `<option value="${a.id}" data-type="${a.transaction_type || 'rental'}" data-rent="${a.transaction_type === 'sale' ? (a.sale_price || '') : (a.monthly_rent || '')}" data-cur="${a.currency || 'USD'}" ${a.id === v.apartment_id ? 'selected' : ''}>${esc(a.name)}${a.city ? ' · ' + esc(a.city) : ''} (${esc(aptPriceLabel(a))})</option>`).join('')}
            </select>
          </label>
          <label class="field"><span class="field-label" id="deal-amount-label">თანხა</span>
            <div class="input-pair">
              <input type="number" id="deal-amount" name="deal_amount" min="0" step="10" required value="${esc(v.deal_amount ?? '')}" placeholder="1200" data-error="მიუთითე თანხა." />
              <select name="currency" id="deal-currency" aria-label="ვალუტა">
                <option value="USD" ${v.currency !== 'GEL' ? 'selected' : ''}>USD ($)</option>
                <option value="GEL" ${v.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option>
              </select>
            </div>
          </label>
          <label class="field"><span class="field-label">ეტაპი</span>
            <select name="stage" id="deal-stage-select">
              ${[...STAGES.map(s => [s.id, s.label]), ['active', 'აქტიური მოთხოვნა'], ['lost', 'ჩაშლილი']].map(([sid, l]) => `<option value="${sid}" ${v.stage === sid ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>

          <div class="form-section span-2 deal-calc-section">
            <div class="form-section-title">${icon('wallet', 16)} საკომისიოს კალკულატორი</div>
            <div class="form-grid">
              <label class="field"><span class="field-label">საკომისიოს გაანგარიშება</span>
                <select name="commission_type" id="deal-comm-type">
                  <option value="percent" ${(v.commission_type || 'percent') === 'percent' ? 'selected' : ''}>პროცენტი (%)</option>
                  <option value="fixed" ${(v.commission_type) === 'fixed' ? 'selected' : ''}>ფიქსირებული თანხა</option>
                </select>
              </label>
              <label class="field" id="deal-comm-pct-field"><span class="field-label" id="deal-comm-pct-label">საკომისიო (%)</span><input type="number" id="deal-comm-pct" name="commission_percent" min="0" max="100" step="0.5" value="${esc(v.commission_percent ?? (v.deal_type === 'sale' ? 3 : 50))}" /></label>
              <label class="field" id="deal-comm-fixed-field" hidden><span class="field-label">ფიქსირებული საკომისიო</span><input type="number" id="deal-comm-fixed" name="commission_amount" min="0" step="50" value="${esc(v.commission_amount || '')}" placeholder="3000" /></label>
            </div>
            <div class="deal-calc-box">
              <div><small class="muted">შენი სუფთა საკომისიო</small><strong id="deal-calc-net">–</strong></div>
              <div id="deal-calc-breakdown" class="small muted"></div>
            </div>
          </div>

          <!-- Co-broker (Partner Agent Split) -->
          <div class="form-section span-2" style="background:var(--surface-sunken);border:1px solid var(--line);border-radius:10px;padding:14px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;margin:0">
                <input type="checkbox" id="deal-cobroker-toggle" ${hasPartner ? 'checked' : ''} />
                <span>${icon('handshake', 14)} პარტნიორ აგენტთან გარიგება (Co-Broking)</span>
              </label>
              <div class="seg" id="cb-quick-split" style="margin:0">
                <button type="button" class="btn btn-ghost btn-sm" data-cb-set="50">50/50</button>
                <button type="button" class="btn btn-ghost btn-sm" data-cb-set="40">60/40</button>
                <button type="button" class="btn btn-ghost btn-sm" data-cb-set="30">70/30</button>
              </div>
            </div>
            <div id="cb-fields" style="${hasPartner || Number(v.owner_bonus) ? '' : 'display:none'}">
              <div class="form-grid">
                <label class="field"><span class="field-label">პარტნიორი აგენტი (სახელი, სააგენტო)</span><input name="partner_agent" id="deal-partner" value="${esc(v.partner_agent || '')}" placeholder="მაგ.: დავითი (Remax)" /></label>
                <label class="field"><span class="field-label">პარტნიორის წილი (%)</span><input type="number" id="deal-partner-split" name="cobroker_split" min="0" max="100" step="5" value="${esc(v.cobroker_split ?? 50)}" /><span class="field-hint">50 = თანაბრად გაყოფა</span></label>
                <label class="field"><span class="field-label">პარტნიორის ტელეფონი</span><input type="tel" name="partner_phone" id="deal-partner-phone" value="${esc(v.partner_phone || '')}" placeholder="+995 5XX XX XX XX" /></label>
                <label class="field"><span class="field-label">მესაკუთრის ბონუსი</span><input type="number" id="deal-bonus" name="owner_bonus" min="0" step="10" value="${esc(v.owner_bonus || 0)}" /></label>
              </div>
            </div>
          </div>

          <!-- Progressive disclosure: Team split, dates -->
          <details class="form-more span-2" ${hasMore ? 'open' : ''}>
            <summary>დამატებითი: გუნდის წილები და თარიღები</summary>
            <div class="form-grid" style="margin-top:12px">

              <div class="form-section span-2" id="deal-split-section">
                <div class="form-section-title">${icon('team', 16)} გუნდის წილები</div>
                <div class="form-grid">
                  <label class="field"><span class="field-label">ობიექტის აგენტი</span><select name="listing_agent_id" id="deal-listing-agent" ${canSplit ? '' : 'disabled'}>${agentOptions(v.listing_agent_id)}</select></label>
                  <label class="field"><span class="field-label">ობიექტის აგენტის წილი (%)</span><input type="number" name="listing_split" id="deal-listing-split" min="0" max="100" step="1" value="${esc(v.listing_split ?? 25)}" ${canSplit ? '' : 'disabled'} /></label>
                  <label class="field"><span class="field-label">მყიდველის აგენტი</span><select name="selling_agent_id" id="deal-selling-agent" ${canSplit ? '' : 'disabled'}>${agentOptions(v.selling_agent_id)}</select></label>
                  <label class="field"><span class="field-label">მყიდველის აგენტის წილი (%)</span><input type="number" name="selling_split" id="deal-selling-split" min="0" max="100" step="1" value="${esc(v.selling_split ?? 25)}" ${canSplit ? '' : 'disabled'} /></label>
                </div>
                <div id="deal-split-out" class="deal-split-out small"></div>
                ${canSplit ? '' : '<p class="field-hint">წილებს ადმინისტრატორი ან მენეჯერი ადგენს.</p>'}
              </div>

              <label class="field"><span class="field-label">სამიზნე / დასრულების თარიღი</span><input type="date" name="target_move_in" value="${esc(v.target_move_in || '')}" /></label>
              <label class="field"><span class="field-label">შემდეგი დაკავშირების თარიღი</span><input type="date" name="follow_up_date" value="${esc(v.follow_up_date || '')}" /></label>
              <label class="field"><span class="field-label">ლიდის წყარო</span>
                <select name="lead_source">
                  ${Object.entries(L.leadSource).map(([k, l]) => `<option value="${k}" ${(v.lead_source || 'direct') === k ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
              </label>
              <label class="field"><span class="field-label">კლიენტის ელფოსტა</span><input type="email" name="client_email" value="${esc(v.client_email || '')}" /></label>
            </div>
          </details>

          <label class="field span-2"><span class="field-label">შენიშვნა / კლიენტის მოთხოვნები</span><textarea name="notes" rows="2" placeholder="მაგ.: ეძებს წყნარ ადგილს, ბიუჯეტი $100K-მდე">${esc(v.notes || '')}</textarea></label>
        </div>`,
      onOpen: (form) => {
        // Warn as soon as the typed number belongs to a client the team marked as unreliable.
        const phoneInput = $('#deal-client-phone', form);
        const flagBox = $('#deal-flag', form);
        const checkClient = () => {
          const c = H.contactByPhone(phoneInput.value);
          flagBox.hidden = !c?.is_flagged;
          flagBox.innerHTML = c?.is_flagged ? `<div class="notice notice-danger" id="deal-flag-banner">${icon('alert', 16)}<div><strong>არასანდო კლიენტი: ${esc(c.name)}</strong>${c.flag_note ? `<br>${esc(c.flag_note)}` : ''}</div></div>` : '';
        };
        phoneInput.addEventListener('input', checkClient);
        checkClient();
        const typeSelect = $('#deal-type-select', form);
        const commTypeSelect = $('#deal-comm-type', form);
        const stageSelect = $('#deal-stage-select', form);
        const aptSelect = $('#deal-apt-select', form);
        const amountInput = $('#deal-amount', form);
        const amountLabel = $('#deal-amount-label', form);
        const curSelect = $('#deal-currency', form);
        const pctField = $('#deal-comm-pct-field', form);
        const fixedField = $('#deal-comm-fixed-field', form);
        const pctInput = $('#deal-comm-pct', form);
        const fixedInput = $('#deal-comm-fixed', form);
        const pctLabel = $('#deal-comm-pct-label', form);

        const syncType = () => {
          const isSale = typeSelect.value === 'sale';
          amountLabel.textContent = isSale ? 'გასაყიდი ფასი' : 'ქირის თანხა (თვეში)';
          pctLabel.textContent = isSale ? 'საკომისიო (% ფასიდან)' : 'საკომისიო (% 1 თვის ქირიდან)';
          if (!edit && !pctInput.dataset.manual) {
            pctInput.value = isSale ? 3 : 50;
          }
          if (!edit && !stageSelect.dataset.manual) {
            stageSelect.value = isSale ? 'enquiry' : 'active';
          }
        };

        const syncCommType = () => {
          const isFixed = commTypeSelect.value === 'fixed';
          pctField.hidden = isFixed;
          fixedField.hidden = !isFixed;
        };

        const updateCalc = () => {
          const isSale = typeSelect.value === 'sale';
          const isFixed = commTypeSelect.value === 'fixed';
          const c = calcCommission({
            deal_type: typeSelect.value,
            deal_amount: amountInput.value,
            commission_type: commTypeSelect.value,
            commission_percent: numOr(pctInput.value, isSale ? 3 : 50),
            commission_amount: numOr(fixedInput.value, 0),
            owner_bonus: $('#deal-bonus', form).value,
            partner_agent: $('#deal-partner', form).value,
            cobroker_split: numOr($('#deal-partner-split', form).value, 50),
          });
          const cur = curSelect.value;
          $('#deal-calc-net', form).textContent = fmtMoney(c.net, cur);
          $('#deal-calc-breakdown', form).innerHTML = `სრული საკომისიო: ${fmtMoney(c.gross, cur)}<br>${c.hasPartner ? `პარტნიორის წილი: −${fmtMoney(c.partnerShare, cur)}` : 'პარტნიორის გარეშე'}`;
          const lp = $('#deal-listing-agent', form).value ? numOr($('#deal-listing-split', form).value, 0) : 0;
          const sp = $('#deal-selling-agent', form).value ? numOr($('#deal-selling-split', form).value, 0) : 0;
          const part = (label, amount) => `<div><span>${label}</span><strong>${bothCur(amount, cur)}</strong></div>`;
          $('#deal-split-out', form).innerHTML = lp + sp > 100 ? '<span class="t-danger">წილების ჯამი 100%-ს აღემატება.</span>'
            : part(`ობიექტის აგენტი (${lp}%)`, (c.net * lp) / 100) + part(`მყიდველის აგენტი (${sp}%)`, (c.net * sp) / 100) + part(`სააგენტო (${100 - lp - sp}%)`, (c.net * (100 - lp - sp)) / 100);
        };

        typeSelect.addEventListener('change', () => { syncType(); updateCalc(); });
        commTypeSelect.addEventListener('change', () => { syncCommType(); updateCalc(); });
        pctInput.addEventListener('input', () => { pctInput.dataset.manual = '1'; });
        // A stage the user picked survives a later deal-type change.
        stageSelect.addEventListener('change', () => { stageSelect.dataset.manual = '1'; });
        // Keep the commission and split preview live while any field changes.
        form.addEventListener('input', updateCalc);
        form.addEventListener('change', updateCalc);

        aptSelect.addEventListener('change', () => {
          const opt = aptSelect.selectedOptions[0];
          if (opt?.dataset.rent && !amountInput.value) {
            amountInput.value = opt.dataset.rent;
            curSelect.value = opt.dataset.cur || 'USD';
            if (opt.dataset.type === 'sale') {
              typeSelect.value = 'sale';
              syncType();
            }
          }
          updateCalc();
        });
        const cbToggle = $('#deal-cobroker-toggle', form);
        const cbFields = $('#cb-fields', form);
        const partnerInput = $('#deal-partner', form);
        const partnerSplit = $('#deal-partner-split', form);
        cbToggle?.addEventListener('change', () => {
          cbFields.style.display = cbToggle.checked ? '' : 'none';
          if (!cbToggle.checked) {
            partnerInput.value = '';
          } else if (!partnerInput.value) {
            partnerSplit.value = 50;
          }
          updateCalc();
        });
        $$('[data-cb-set]', form).forEach(btn => btn.addEventListener('click', () => {
          if (!cbToggle.checked) {
            cbToggle.checked = true;
            cbFields.style.display = '';
          }
          partnerSplit.value = btn.dataset.cbSet;
          updateCalc();
        }));

        syncType();
        syncCommType();
        updateCalc();
      },
      onSubmit: async (_f, f) => {
        const partner = f.partner_agent?.trim() || null;
        const isSale = f.deal_type === 'sale';
        const payload = {
          apartment_id: f.apartment_id || null,
          deal_type: f.deal_type || 'rental',
          contact_type: f.contact_type || (isSale ? 'buyer' : 'renter'),
          client_name: f.client_name.trim(),
          client_phone: f.client_phone?.trim() || null,
          client_email: f.client_email?.trim() || null,
          stage: f.stage || (isSale ? 'enquiry' : 'active'),
          deal_amount: Number(f.deal_amount || 0),
          currency: f.currency || 'USD',
          commission_type: f.commission_type || 'percent',
          commission_percent: numOr(f.commission_percent, isSale ? 3 : 50),
          commission_amount: f.commission_amount ? Number(f.commission_amount) : null,
          owner_bonus: Number(f.owner_bonus || 0),
          partner_agent: partner,
          partner_phone: f.partner_phone?.trim() || null,
          cobroker_split: partner ? numOr(f.cobroker_split, 50) : 0,
          target_move_in: f.target_move_in || null,
          follow_up_date: f.follow_up_date || null,
          lead_source: f.lead_source || 'direct',
          notes: f.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        };
        // Split fields are disabled for agents, so their values come from the deal itself.
        if (canSplit) {
          Object.assign(payload, { listing_agent_id: f.listing_agent_id || null, selling_agent_id: f.selling_agent_id || null, listing_split: numOr(f.listing_split, 25), selling_split: numOr(f.selling_split, 25) });
          if (payload.listing_split + payload.selling_split > 100) throw new Error('აგენტების წილების ჯამი 100%-ს არ უნდა აღემატებოდეს.');
        } else if (!edit) {
          Object.assign(payload, { listing_agent_id: v.listing_agent_id || null, selling_agent_id: v.selling_agent_id || null });
        }
        const c = calcCommission(payload);
        if (payload.commission_type === 'percent') {
          payload.commission_amount = c.baseComm;
        }
        payload.net_commission = c.net;
        if (payload.stage === 'closed' && !deal?.closed_at) payload.closed_at = new Date().toISOString();

        // Errors propagate to the dialog: it stays open with the values and shows the reason.
        const row = edit
          ? await q(sb.from('deals').update(payload).eq('id', deal.id).select().single())
          : await App.insertOnce('deals', { id, ...payload, criteria: defaults.criteria || {}, organization_id: S.org.id, created_by: S.user.id });
        App.upsertLocal('deals', row);
        toast(edit ? 'გარიგება განახლდა' : `გარიგება დაემატა: ${row.client_name}`, { type: 'success' });
        App.render();
        return row;
      },
    });
  }
  App.openDealForm = openDealForm;

  // ===========================================================================
  // COMMISSIONS
  // ===========================================================================
  const commFilter = { month: R.monthKey(), agent: '' };

  function commissionRows() {
    const deals = (S.data.deals || []).filter(inSection);
    const inMonth = (v) => !commFilter.month || (v && R.monthKey(R.toDate(v)) === commFilter.month);
    return deals.filter(d => {
      if (commFilter.agent && d.created_by !== commFilter.agent) return false;
      if (d.stage === 'closed') return inMonth(d.closed_at || d.updated_at || d.created_at);
      if (OPEN_STAGES.includes(d.stage)) return inMonth(d.target_move_in || d.created_at);
      return false;
    });
  }

  function renderCommissions() {
    const cur = displayCur();
    const rows = commissionRows();
    const closed = rows.filter(d => d.stage === 'closed');
    const open = rows.filter(d => d.stage !== 'closed');
    const gross = sumIn(closed, cur, d => calcCommission(d).gross);
    const partner = sumIn(closed, cur, d => calcCommission(d).partnerShare);
    const net = sumIn(closed, cur, d => calcCommission(d).net);
    const expected = sumIn(open, cur, d => calcCommission(d).net);
    const missing = gross.missing + expected.missing;
    const agents = [...new Set((S.data.deals || []).map(d => d.created_by).filter(Boolean))];
    const rate = fxRate();
    const dateOf = (d) => (d.stage === 'closed' ? (d.closed_at || d.updated_at) : (d.target_move_in || d.created_at));

    $('#deals-body').innerHTML = `
      <div class="toolbar">
        <label class="sr-only" for="cm-month">თვე</label>
        <input type="month" id="cm-month" class="input" value="${esc(commFilter.month)}" />
        <button type="button" class="chip" id="cm-all" aria-pressed="${!commFilter.month}">ყველა თვე</button>
        <label class="sr-only" for="cm-agent">აგენტი</label>
        <select id="cm-agent" class="input">
          <option value="">ყველა აგენტი</option>
          ${agents.map(u => `<option value="${esc(u)}" ${commFilter.agent === u ? 'selected' : ''}>${esc(agentName(u))}</option>`).join('')}
        </select>
        ${curToggle(cur)}
        <span class="grow"></span>
        <button type="button" class="btn btn-ghost btn-sm" data-export="csv">${icon('file', 14)} CSV</button>
        <button type="button" class="btn btn-ghost btn-sm" data-export="xlsx">${icon('file', 14)} Excel</button>
      </div>

      <section class="card" style="margin-bottom:16px">
        <div class="stats">
          <div class="stat"><span class="stat-label">სრული საკომისიო (დახურული)</span><span class="stat-value">${fmtMoney(gross.value, cur)}</span><span class="stat-note">${closed.length} დახურული გარიგება</span></div>
          <div class="stat"><span class="stat-label">პარტნიორების წილი</span><span class="stat-value">${partner.value ? '−' : ''}${fmtMoney(partner.value, cur)}</span><span class="stat-note">Co-Brokering</span></div>
          <div class="stat"><span class="stat-label">სუფთა საკომისიო (დახურული)</span><span class="stat-value t-ok">${fmtMoney(net.value, cur)}</span><span class="stat-note">ხელზე მისაღები</span></div>
          <div class="stat"><span class="stat-label">მოსალოდნელი (სუფთა)</span><span class="stat-value">${fmtMoney(expected.value, cur)}</span><span class="stat-note">${open.length} ღია გარიგება</span></div>
        </div>
        <div class="calc">
          ${icon('refresh', 13)} კურსი: ${rate ? `<b>1 USD = ${rate} ₾</b>` : '<b class="t-danger">მითითებული არ არის</b>'}
          ${App.isAdmin() ? ' · <button type="button" class="link-btn small" id="cm-fx">შეცვლა</button>' : ''}
          ${missing ? `<br>${icon('alert', 13)} ${missing} გარიგება სხვა ვალუტაშია და კურსის გარეშე ჯამში ვერ შევიდა.` : ''}
          <br>დახურული: დახურვის თარიღით; მოსალოდნელი: გადაბარგების სამიზნე თარიღით (თუ არ არის, შექმნის თარიღით).
        </div>
      </section>

      ${App.can('analytics') ? leaderboardHtml(rows) + teamPayoutsHtml(rows) : ''}
      <section class="card">
        ${rows.length ? `
          <div class="rows" style="--cols:minmax(0,2fr) minmax(0,1fr) 180px 80px 90px 90px 100px">
            <div class="rows-head"><span>კლიენტი / ბინა</span><span>აგენტი</span><span>ეტაპი</span><span>თარიღი</span><span class="cell-right">სრული</span><span class="cell-right">პარტნიორი</span><span class="cell-right">სუფთა</span></div>
            ${rows.slice().sort((a, b) => String(dateOf(b) || '').localeCompare(String(dateOf(a) || ''))).map(d => {
              const c = calcCommission(d); const dc = d.currency || 'USD';
              return `<div class="row comm-row">
                <span class="cell-main"><strong>${esc(d.client_name)}</strong><span>${esc(d.apartment_id ? H.aptName(d.apartment_id) : 'ბინა არ არის მიბმული')}</span>
                  <span class="comm-m">${esc(agentName(d.created_by))} · ${esc(R.date(dateOf(d)))} · სრული ${fmtMoney(c.gross, dc)}${c.hasPartner ? ` · პარტნიორი −${fmtMoney(c.partnerShare, dc)}` : ''}</span></span>
                <span class="comm-d">${esc(agentName(d.created_by))}</span>
                <span class="comm-d">${R.dealBadge(d.stage)}</span>
                <span class="comm-d">${esc(R.date(dateOf(d)))}</span>
                <span class="cell-right comm-d">${fmtMoney(c.gross, dc)}</span>
                <span class="cell-right comm-d">${c.hasPartner ? '−' + fmtMoney(c.partnerShare, dc) : '–'}</span>
                <span class="cell-right comm-net"><strong>${fmtMoney(c.net, dc)}</strong><span class="comm-m">${R.dealBadge(d.stage)}</span></span>
              </div>`;
            }).join('')}
          </div>` : '<div class="empty-inline">ამ ფილტრით გარიგება ვერ მოიძებნა.</div>'}
      </section>`;

    $('#cm-month').addEventListener('change', (e) => { commFilter.month = e.target.value; App.render(); });
    $('#cm-all').addEventListener('click', () => { commFilter.month = commFilter.month ? '' : R.monthKey(); App.render(); });
    $('#cm-agent').addEventListener('change', (e) => { commFilter.agent = e.target.value; App.render(); });
    bindCurToggle();
    $('#cm-fx')?.addEventListener('click', openFxDialog);
    bindPayouts();
    $$('[data-export]').forEach(b => b.addEventListener('click', () => exportDeals(rows, b.dataset.export, b, commFilter.month || 'all')));
  }


  // ---------------------------------------------------------------------------
  // Team payouts and leaderboard (commissions tab)
  // ---------------------------------------------------------------------------
  const STAGE_ORDER = ['enquiry', 'contacted', 'viewing', 'offer', 'negotiation', 'deposit', 'closed'];
  const stageIdx = (d) => STAGE_ORDER.indexOf(d.stage === 'active' ? 'enquiry' : d.stage);

  function teamPayoutsHtml(rows) {
    const closed = rows.filter(d => d.stage === 'closed' && (d.listing_agent_id || d.selling_agent_id));
    if (!closed.length) return '';
    const canPay = App.isManager();
    const lines = closed.flatMap(d => {
      const s = calcSplit(d); const dc = d.currency || 'USD';
      const line = (role, label, memberId, amount, pct, paid) => `<div class="row comm-row" style="--cols:minmax(0,1.4fr) minmax(0,1.4fr) 90px minmax(0,1.2fr) 130px">
        <span class="cell-main"><strong>${esc(memberName(memberId))}</strong><span>${label} · ${pct}%</span></span>
        <span class="cell-meta">${esc(d.client_name)}${d.apartment_id ? ' · ' + esc(H.aptName(d.apartment_id)) : ''}</span>
        <span class="cell-meta">${esc(R.date(d.closed_at || d.updated_at))}</span>
        <span class="cell-right"><strong>${bothCur(amount, dc)}</strong></span>
        <span class="cell-actions">${canPay
          ? `<button type="button" class="btn btn-sm ${paid ? 'btn-ghost' : 'btn-secondary'}" data-payout="${d.id}" data-role="${role}" aria-pressed="${paid}">${paid ? icon('check', 14) + ' გადახდილია' : 'გადასახდელია'}</button>`
          : R.badge(paid ? 'გადახდილია' : 'გადასახდელია', paid ? 'ok' : 'warn')}</span></div>`;
      return [
        d.listing_agent_id ? line('listing', 'ობიექტის აგენტი', d.listing_agent_id, s.listing, s.listingPct, d.listing_paid) : '',
        d.selling_agent_id ? line('selling', 'მყიდველის აგენტი', d.selling_agent_id, s.selling, s.sellingPct, d.selling_paid) : '',
      ];
    }).join('');
    const cur = displayCur();
    const house = sumIn(closed, cur, d => calcSplit(d).house);
    const due = sumIn(closed, cur, d => { const s = calcSplit(d); return (d.listing_paid ? 0 : s.listing) + (d.selling_paid ? 0 : s.selling); });
    return `<section class="card" style="margin-bottom:16px" id="team-payouts">
      <div class="card-head"><h2>${icon('team', 18)} გუნდის გადახდები</h2><span class="small muted">სააგენტოს წილი: <strong>${fmtMoney(house.value, cur)}</strong> · აგენტებისთვის გადასახდელი: <strong>${fmtMoney(due.value, cur)}</strong></span></div>
      <div class="rows">${lines}</div></section>`;
  }

  // Ranking for the selected period: closed volume, deals won, commission earned, viewing → offer rate.
  function leaderboardHtml(rows) {
    if (!App.isManager()) return '';
    const cur = displayCur();
    const all = (S.data.deals || []).filter(inSection);
    const byUser = (uid) => S.data.members.find(m => m.user_id === uid)?.id || null;
    const agentOf = (d) => d.selling_agent_id || d.listing_agent_id || byUser(d.created_by);
    const stats = new Map();
    const get = (id) => { if (!stats.has(id)) stats.set(id, { id, won: 0, volume: [], earned: [], viewed: 0, offered: 0 }); return stats.get(id); };
    rows.filter(d => d.stage === 'closed').forEach(d => {
      const s = calcSplit(d);
      const main = agentOf(d);
      if (main) { const m = get(main); m.won += 1; m.volume.push(d); }
      if (d.listing_agent_id) get(d.listing_agent_id).earned.push([d, s.listing]);
      if (d.selling_agent_id) get(d.selling_agent_id).earned.push([d, s.selling]);
      if (!d.listing_agent_id && !d.selling_agent_id && main) get(main).earned.push([d, s.net]);
    });
    all.forEach(d => {
      const id = agentOf(d); if (!id) return;
      const hadViewing = stageIdx(d) >= 2 || S.data.tasks.some(t => t.deal_id === d.id && t.type === 'viewing');
      if (hadViewing) { const m = get(id); m.viewed += 1; if (stageIdx(d) >= 3) m.offered += 1; }
    });
    const list = [...stats.values()].map(m => ({
      ...m,
      vol: sumIn(m.volume, cur, d => d.deal_amount).value,
      comm: m.earned.reduce((sum, [d, amount]) => { const v = convert(amount, d.currency || 'USD', cur); return sum + (v === null ? 0 : v); }, 0),
      rate: m.viewed ? Math.round((m.offered / m.viewed) * 100) : null,
    })).sort((a, b) => b.comm - a.comm || b.vol - a.vol || b.viewed - a.viewed);
    if (!list.length) return '';
    return `<section class="card" style="margin-bottom:16px" id="leaderboard">
      <div class="card-head"><h2>${icon('sparkle', 18)} აგენტების რეიტინგი</h2><span class="small muted">არჩეული პერიოდი · ნახვიდან შეთავაზებამდე: ყველა გარიგება</span></div>
      <div class="rows" style="--cols:32px minmax(0,1.6fr) 90px minmax(0,1fr) minmax(0,1fr) 130px">
        <div class="rows-head"><span>#</span><span>აგენტი</span><span>მოგებული</span><span class="cell-right">დახურული მოცულობა</span><span class="cell-right">საკომისიო</span><span class="cell-right">ნახვა → შეთავაზება</span></div>
        ${list.map((m, i) => `<div class="row comm-row"><span class="cell-meta"><strong>${i + 1}</strong></span>
          <span class="cell-main"><strong>${esc(memberName(m.id))}</strong></span>
          <span class="cell-meta">${m.won}</span>
          <span class="cell-right">${fmtMoney(m.vol, cur)}</span>
          <span class="cell-right"><strong class="t-ok">${fmtMoney(m.comm, cur)}</strong></span>
          <span class="cell-right">${m.rate === null ? '–' : `${m.rate}% <span class="small muted">(${m.offered}/${m.viewed})</span>`}</span></div>`).join('')}
      </div></section>`;
  }

  function bindPayouts() {
    $$('[data-payout]').forEach(b => b.addEventListener('click', () => {
      const deal = H.deal(b.dataset.payout);
      if (!deal) return undefined;
      const field = b.dataset.role === 'listing' ? 'listing_paid' : 'selling_paid';
      return run(b, async () => {
        const row = await q(sb.from('deals').update({ [field]: !deal[field], updated_at: new Date().toISOString() }).eq('id', deal.id).select().single());
        App.upsertLocal('deals', row);
        App.render();
      });
    }));
  }

  function openFxDialog() {
    return R.dialog({
      title: 'ვალუტის კურსი',
      submitLabel: 'შენახვა',
      body: `<label class="field"><span class="field-label">1 USD ლარში</span><input type="number" name="fx_rate" min="0.5" max="99" step="0.0001" required value="${esc(fxRate() || '')}" placeholder="2.70" data-error="მიუთითე კურსი (მაგ.: 2.70)." />
        <span class="field-hint">გამოიყენება ფასების ორ ვალუტაში საჩვენებლად, პოსტებში, შერჩევის გვერდზე და საკომისიოების ჯამში.</span></label>`,
      onSubmit: async (_f, v) => {
        const rate = Number(v.fx_rate);
        if (!(rate > 0)) throw new Error('კურსი დადებითი რიცხვი უნდა იყოს.');
        const row = await q(sb.from('organizations').update({ fx_rate: rate }).eq('id', S.org.id).select().single());
        Object.assign(S.org, { fx_rate: row.fx_rate ?? rate });
        toast('კურსი შენახულია', { type: 'success' });
        App.render();
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Export (CSV, or XLSX via SheetJS loaded on demand — same CDN as the importer)
  // ---------------------------------------------------------------------------
  function loadSheetJS() {
    if (window.XLSX?.utils) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/xlsx.full.min.js';
      s.onload = () => (window.XLSX?.utils ? resolve(window.XLSX) : reject(new Error('Excel-ის ბიბლიოთეკა ვერ ჩაიტვირთა. გამოიყენე CSV.')));
      s.onerror = () => reject(new Error('Excel-ის ბიბლიოთეკა ვერ ჩაიტვირთა. შეამოწმე ინტერნეტი ან გამოიყენე CSV.'));
      document.head.appendChild(s);
    });
  }

  function dealsMatrix(deals) {
    const head = ['კლიენტი', 'ტელეფონი', 'ბინა', 'ეტაპი', 'ქირა', 'ვალუტა', 'საკომისიო %', 'მესაკუთრის ბონუსი', 'სრული საკომისიო', 'პარტნიორი', 'პარტნიორის წილი %', 'პარტნიორის თანხა', 'სუფთა საკომისიო', 'აგენტი', 'შექმნის თარიღი', 'გადაბარგების თარიღი', 'დახურვის თარიღი'];
    const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
    return [head, ...deals.map(d => {
      const c = calcCommission(d);
      return [d.client_name, d.client_phone || '', d.apartment_id ? H.aptName(d.apartment_id) : '', L.dealStage[d.stage] || d.stage, r2(d.deal_amount), d.currency || 'USD', c.commPct, r2(c.bonus), r2(c.gross), d.partner_agent || '', c.cobrokerPct, r2(c.partnerShare), r2(c.net), agentName(d.created_by), dmy(d.created_at), dmy(d.target_move_in), dmy(d.closed_at)];
    })];
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function exportDeals(deals, kind, btn, label) {
    if (!App.guardFeature('export')) return undefined;
    if (!deals.length) { toast('საექსპორტო გარიგება არ არის.', { type: 'info' }); return undefined; }
    const name = `rigzea-deals-${label}`;
    const matrix = dealsMatrix(deals);
    if (kind === 'csv') {
      const cell = (v) => {
        let s = String(v ?? '');
        if (/^[=@+-]/.test(s)) s = "'" + s;
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      download(new Blob(['\ufeff' + matrix.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
      toast('CSV ფაილი ჩამოიტვირთა', { type: 'success' });
      return undefined;
    }
    return run(btn, async () => {
      const XLSX = await loadSheetJS();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(matrix);
      ws['!cols'] = matrix[0].map((h, i) => ({ wch: Math.min(32, Math.max(String(h).length, ...matrix.slice(1).map(r => String(r[i] ?? '').length)) + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Deals');
      XLSX.writeFile(wb, `${name}.xlsx`);
      toast('Excel ფაილი ჩამოიტვირთა', { type: 'success' });
    });
  }

  // ===========================================================================
  // SELECTIONS LIST
  // ===========================================================================
  const selCache = { org: null, rows: [], error: null, loading: false };
  App.addSelection = (sel) => {
    if (selCache.org === S.org.id) selCache.rows.unshift(sel);
    try { localStorage.setItem('rigzea_col_done', '1'); } catch { /* private mode */ }
  };

  async function loadSelections() {
    selCache.loading = true; selCache.error = null;
    try {
      selCache.rows = await q(sb.from('selections').select('*').eq('organization_id', S.org.id).order('created_at', { ascending: false }));
      selCache.org = S.org.id;
    } catch (err) {
      console.error(err);
      selCache.error = err;
    } finally {
      selCache.loading = false;
    }
    if (App.route().name === 'deals' && App.route().id === 'selections') renderSelections();
  }

  function selectionShareText(sel) {
    const n = (sel.apartment_ids || []).length;
    return `გამარჯობა! თქვენი მოთხოვნის მიხედვით შევარჩიე ${n} ბინა. ფოტოები, ფასები და შედარება ერთ გვერდზეა:\n${selectionUrl(sel.slug)}`;
  }

  function renderSelections() {
    const body = $('#deals-body');
    if (!body) return;
    if (selCache.org !== S.org.id && !selCache.error) {
      body.innerHTML = '<div class="card"><div class="skeleton" aria-label="იტვირთება"><i></i><i></i><i></i></div></div>';
      if (!selCache.loading) loadSelections();
      return;
    }
    if (selCache.error) {
      body.innerHTML = `<div class="card"><div class="error-state"><p>შერჩევები ვერ ჩაიტვირთა. ${esc(R.friendlyError(selCache.error))}</p><button type="button" class="btn btn-primary" id="sel-retry">${icon('refresh', 16)} ხელახლა ცდა</button></div></div>`;
      $('#sel-retry').onclick = () => { selCache.error = null; selCache.org = null; renderSelections(); };
      return;
    }
    const rows = selCache.rows;
    body.innerHTML = `<section class="card">${rows.length ? `
      <div class="rows" style="--cols:minmax(0,1fr) auto">
        ${rows.map(s => `
          <div class="row">
            <span class="cell-main"><strong>${esc(s.client_name || 'შერჩევა კლიენტის სახელის გარეშე')} ${s.is_active === false ? R.badge('გათიშული', 'muted') : ''}</strong>
              <span>${(s.apartment_ids || []).length} ბინა · ${esc(R.date(s.created_at))}${s.deal_id && H.deal(s.deal_id) ? ' · გარიგება: ' + esc(H.deal(s.deal_id).client_name) : ''}</span></span>
            <span class="cell-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-sel-copy="${s.id}" aria-label="ბმულის კოპირება">${icon('copy', 14)}</button>
              <a class="btn btn-ghost btn-sm" href="${R.whatsappUrl(selectionShareText(s))}" target="_blank" rel="noopener" aria-label="WhatsApp-ით გაგზავნა">${icon('whatsapp', 14)}</a>
              <a class="btn btn-ghost btn-sm" href="${esc(selectionUrl(s.slug))}" target="_blank" rel="noopener" aria-label="გახსნა">${icon('external', 14)}</a>
              <button type="button" class="btn btn-ghost btn-sm" data-sel-toggle="${s.id}">${s.is_active === false ? 'ჩართვა' : 'გათიშვა'}</button>
            </span>
          </div>`).join('')}
      </div>` : `<div class="empty">${icon('link', 28)}<h3>შერჩევა ჯერ არ შეგიქმნია</h3><p>მონიშნე ბინები და გაუგზავნე კლიენტს ერთი ბმული.</p><button type="button" class="btn btn-primary" id="sel-new">${icon('sparkle', 16)} ბინების შერჩევა</button></div>`}</section>`;

    $('#sel-new')?.addEventListener('click', () => openMatchmakerModal());
    $$('[data-sel-copy]').forEach(b => b.addEventListener('click', () => { const s = rows.find(x => x.id === b.dataset.selCopy); copyText(selectionUrl(s.slug), 'შერჩევის ბმული დაკოპირდა'); }));
    $$('[data-sel-toggle]').forEach(b => b.addEventListener('click', () => run(b, async () => {
      const s = rows.find(x => x.id === b.dataset.selToggle);
      const row = await q(sb.from('selections').update({ is_active: s.is_active === false }).eq('id', s.id).select().single());
      Object.assign(s, row);
      toast(row.is_active === false ? 'ბმული გაითიშა. კლიენტი მას ვეღარ გახსნის' : 'ბმული ისევ აქტიურია', { type: 'success' });
      renderSelections();
    })));
  }

  // ===========================================================================
  // MATCHMAKER
  // ===========================================================================
  // Weighted match of one apartment against client criteria. Returns 0–100, or null with no criteria.
  function matchScore(a, c = {}) {
    let total = 0, got = 0;
    const add = (w, part) => { total += w; got += w * Math.max(0, Math.min(1, part)); };
    const norm = (s) => String(s || '').trim().toLowerCase();
    const isSale = a.transaction_type === 'sale';
    if (c.transaction_type && c.transaction_type !== 'all') {
      const wantSale = c.transaction_type === 'sale' || c.transaction_type === 'buy';
      if (wantSale !== isSale) return 0;
    }
    if (c.city) add(15, norm(a.city) === norm(c.city) ? 1 : 0);
    if (c.district) add(25, a.district && (norm(a.district).includes(norm(c.district)) || norm(c.district).includes(norm(a.district))) ? 1 : 0);
    const min = Number(c.budget_min || 0), max = Number(c.budget_max || 0);
    if (min || max) {
      const rawPrice = isSale ? a.sale_price : a.monthly_rent;
      const price = rawPrice ? convert(rawPrice, a.currency || 'USD', c.currency || 'USD') : null;
      if (price === null) add(30, 0);
      else if (max && price > max) add(30, 1 - (price - max) / (max * 0.25));
      else if (min && price < min) add(30, 1 - (min - price) / (min * 0.5));
      else add(30, 1);
    }
    const rooms = Number(c.rooms || 0);
    if (rooms) { const v = Number(a.rooms || 0); add(15, v >= rooms ? 1 : v === rooms - 1 ? 0.5 : 0); }
    const beds = Number(c.bedrooms || 0);
    if (beds) { const v = Number(a.bedrooms || 0); add(15, v >= beds ? 1 : v === beds - 1 ? 0.5 : 0); }
    if (c.pets) add(15, a.pets_allowed ? 1 : 0);
    return total ? Math.round((got / total) * 100) : null;
  }
  App.matchScore = matchScore;

  function openMatchmakerModal(deal = null) {
    if (!App.guardFeature('matchmaker')) return undefined;
    const apts = (S.data.apartments || []).filter(a => a.status !== 'archived');
    const uniq = (arr) => [...new Set(arr.filter(Boolean).map(s => String(s).trim()))].sort((x, y) => x.localeCompare(y));
    const cities = uniq(apts.map(a => a.city));
    const districts = uniq(apts.map(a => a.district));
    const openDeals = (S.data.deals || []).filter(d => OPEN_STAGES.includes(d.stage));
    const picked = new Set();
    let linkedDeal = deal;

    return R.dialog({
      title: 'ბინების შერჩევა კლიენტისთვის',
      wide: true,
      body: `
        <div class="mm-filters">
          <div class="form-grid">
            <label class="field"><span class="field-label">გარიგება (არასავალდებულო)</span>
              <select id="mm-deal"><option value="">გარიგების გარეშე</option>${openDeals.map(d => `<option value="${d.id}" ${deal?.id === d.id ? 'selected' : ''}>${esc(d.client_name)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">კლიენტის სახელი (ბმულზე გამოჩნდება)</span><input id="mm-client" maxlength="60" value="${esc(deal?.client_name || '')}" placeholder="მაგ.: მარიამი" /></label>
          </div>
          <div class="mm-grid">
            <label class="field"><span class="field-label">ტიპი</span><select id="mm-type" data-c="transaction_type"><option value="">ნებისმიერი</option><option value="rent">ქირა</option><option value="sale">ყიდვა / გაყიდვა</option></select></label>
            <label class="field"><span class="field-label">ქალაქი</span><select id="mm-city" data-c="city"><option value="">ნებისმიერი</option>${cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">უბანი</span><input id="mm-district" data-c="district" list="mm-district-list" placeholder="მაგ.: ვაკე" /><datalist id="mm-district-list">${districts.map(d => `<option value="${esc(d)}"></option>`).join('')}</datalist></label>
            <label class="field"><span class="field-label">ბიუჯეტი: მინ.</span><input type="number" min="0" step="50" id="mm-min" data-c="budget_min" /></label>
            <label class="field"><span class="field-label">ბიუჯეტი: მაქს.</span><input type="number" min="0" step="50" id="mm-max" data-c="budget_max" /></label>
            <label class="field"><span class="field-label">ვალუტა</span><select id="mm-cur" data-c="currency"><option value="USD">USD ($)</option><option value="GEL">GEL (₾)</option></select></label>
            <label class="field"><span class="field-label">ოთახები (მინ.)</span><select id="mm-rooms" data-c="rooms"><option value="">ნებისმიერი</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${n}+</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">საძინებლები (მინ.)</span><select id="mm-beds" data-c="bedrooms"><option value="">ნებისმიერი</option>${[1, 2, 3, 4].map(n => `<option value="${n}">${n}+</option>`).join('')}</select></label>
            <label class="field"><span class="field-label">შინაური ცხოველი</span><select id="mm-pets" data-c="pets"><option value="">არ აქვს მნიშვნელობა</option><option value="1">ცხოველით</option></select></label>
          </div>
        </div>
        <div class="mm-head"><strong>შესაბამისი ბინები (<span id="mm-count">0</span>)</strong><button type="button" class="link-btn small" id="mm-save" hidden>კრიტერიუმების შენახვა გარიგებაში</button></div>
        <div id="mm-results" class="mm-list"></div>
        <div class="mm-bar" id="mm-bar">
          <span id="mm-picked" class="small muted">მონიშნე ბინები, რომლებიც კლიენტს უნდა გაუგზავნო.</span>
          <button type="button" class="btn btn-primary" id="mm-create" disabled>${icon('link', 16)} შერჩევის ბმულის შექმნა</button>
        </div>
        <div id="mm-done" class="mm-done" hidden></div>`,
      onOpen: (form) => {
        const fields = $$('[data-c]', form);
        const readCriteria = () => {
          const c = {};
          fields.forEach(el => { const v = el.value.trim(); if (v) c[el.dataset.c] = ['budget_min', 'budget_max', 'rooms', 'bedrooms'].includes(el.dataset.c) ? Number(v) : el.dataset.c === 'pets' ? true : v; });
          if (!c.currency) c.currency = 'USD';
          return c;
        };
        const fillCriteria = (c = {}) => {
          fields.forEach(el => { const v = c[el.dataset.c]; el.value = el.dataset.c === 'pets' ? (v ? '1' : '') : (v ?? (el.dataset.c === 'currency' ? 'USD' : '')); });
        };

        const updateList = () => {
          const c = readCriteria();
          const scored = apts.map(a => ({ a, s: matchScore(a, c) }));
          scored.sort((x, y) => (y.s ?? -1) - (x.s ?? -1) || String(x.a.name).localeCompare(String(y.a.name)));
          $('#mm-count', form).textContent = scored.length;
          $('#mm-results', form).innerHTML = scored.length ? scored.map(({ a, s }) => {
            const tone = s === null ? '' : s >= 80 ? 'hi' : s >= 50 ? 'mid' : 'lo';
            const isSaleApt = a.transaction_type === 'sale';
            const priceLabel = isSaleApt
              ? (a.sale_price ? `${fmtMoney(a.sale_price, a.currency || 'USD')}${a.price_sqm ? ` (${fmtMoney(a.price_sqm, a.currency || 'USD')}/მ²)` : ''}` : '–')
              : (a.monthly_rent ? `${fmtMoney(a.monthly_rent, a.currency || 'USD')} / თვე` : '–');
            const facts = [[a.city, a.district].filter(Boolean).join(', '), isSaleApt ? 'იყიდება' : 'ქირავდება', a.rooms ? `${a.rooms} ოთახი` : '', a.bedrooms ? `${a.bedrooms} საძინებელი` : '', a.area_sqm ? `${a.area_sqm} მ²` : '', a.pets_allowed ? 'ცხოველი დასაშვებია' : ''].filter(Boolean).join(' · ');
            return `<label class="mm-item ${s !== null && s < 50 ? 'is-weak' : ''}">
              <input type="checkbox" value="${a.id}" ${picked.has(a.id) ? 'checked' : ''} />
              <span class="cell-main wrap"><strong>${esc(a.name)}</strong><span>${esc(facts || 'დეტალები შევსებული არ არის')}</span></span>
              <span class="mm-side"><strong>${esc(priceLabel)}</strong>${s !== null ? `<span class="mm-score ${tone}">${s}% დამთხვევა</span>` : ''}</span>
            </label>`;
          }).join('') : '<div class="empty-inline">პორტფოლიოში აქტიური ბინა არ არის.</div>';
          $$('#mm-results input[type=checkbox]', form).forEach(cb => cb.addEventListener('change', () => { cb.checked ? picked.add(cb.value) : picked.delete(cb.value); updateBar(); }));
          updateBar();
        };
        const updateBar = () => {
          $('#mm-create', form).disabled = !picked.size;
          $('#mm-picked', form).textContent = picked.size ? `მონიშნულია ${picked.size} ბინა` : 'მონიშნე ბინები, რომლებიც კლიენტს უნდა გაუგზავნო.';
          $('#mm-save', form).hidden = !linkedDeal;
        };

        const dealSelect = $('#mm-deal', form);
        dealSelect.addEventListener('change', () => {
          linkedDeal = H.deal(dealSelect.value) || null;
          if (linkedDeal) {
            $('#mm-client', form).value = linkedDeal.client_name || '';
            const crit = { ...(linkedDeal.criteria || {}) };
            if (!crit.transaction_type && linkedDeal.deal_type) crit.transaction_type = linkedDeal.deal_type;
            fillCriteria(crit);
          }
          updateList();
        });
        fields.forEach(el => { el.addEventListener('input', updateList); el.addEventListener('change', updateList); });

        const saveCriteria = async (criteria) => {
          const row = await q(sb.from('deals').update({ criteria, updated_at: new Date().toISOString() }).eq('id', linkedDeal.id).select().single());
          App.upsertLocal('deals', row);
          linkedDeal = row;
        };
        $('#mm-save', form).addEventListener('click', (e) => run(e.currentTarget, async () => { await saveCriteria(readCriteria()); }, { success: 'კრიტერიუმები შენახულია' }));

        let pendingId = null;
        $('#mm-create', form).addEventListener('click', (e) => {
          if (!picked.size) return;
          if (!App.guardFeature('selections')) return;
          if (picked.size > 20) { toast('ერთ ბმულში მაქსიმუმ 20 ბინის დამატებაა შესაძლებელი.', { type: 'error' }); return; }
          // Public page shows listings in the current (best match first) order.
          const order = $$('#mm-results input[type=checkbox]', form).map(cb => cb.value).filter(id => picked.has(id));
          const row = { id: pendingId = pendingId || R.uuid(), slug: randomSlug(), organization_id: S.org.id, client_name: $('#mm-client', form).value.trim() || null, apartment_ids: order, criteria: readCriteria(), deal_id: linkedDeal?.id || null, created_by: S.user.id };
          run(e.currentTarget, async () => {
            const sel = await App.insertOnce('selections', row);
            pendingId = null;
            if (linkedDeal) await saveCriteria(row.criteria);
            App.addSelection(sel);
            showDone(sel);
          });
        });

        const showDone = (sel) => {
          const url = selectionUrl(sel.slug);
          const text = selectionShareText(sel);
          const done = $('#mm-done', form);
          done.hidden = false;
          done.innerHTML = `
            <div class="mm-done-head">${icon('check', 18)} <strong>ბმული მზადაა: ${sel.apartment_ids.length} ბინა</strong></div>
            <div class="mm-link"><input class="input" readonly value="${esc(url)}" aria-label="შერჩევის ბმული" /></div>
            <div class="mm-done-actions">
              <button type="button" class="btn btn-secondary" id="mm-copy">${icon('copy', 16)} კოპირება</button>
              <a class="btn btn-wa" href="${R.whatsappUrl(text)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp-ით გაგზავნა</a>
              <a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 16)} გახსნა</a>
            </div>`;
          $('#mm-copy', form).onclick = () => copyText(url, 'შერჩევის ბმული დაკოპირდა');
          copyText(url, 'შერჩევის ბმული შეიქმნა და დაკოპირდა');
          done.scrollIntoView({ block: 'nearest' });
        };

        if (deal) fillCriteria(deal.criteria || {});
        updateList();
      },
    });
  }
  App.openMatchmakerModal = openMatchmakerModal;

  // ===========================================================================
  // REVERSE MATCHMAKER (იპოვე კლიენტები ამ ბინისთვის)
  // ===========================================================================
  function openReverseMatchmakerModal(apt) {
    if (!apt) return;
    const deals = (S.data.deals || []).filter(d => OPEN_STAGES.includes(d.stage));
    const isSaleApt = apt.transaction_type === 'sale';
    const aptPrice = isSaleApt ? apt.sale_price : apt.monthly_rent;
    const cur = apt.currency || 'USD';
    const pUrl = R.listingUrl(apt);

    // Calculate score for each deal
    const matches = deals.map(d => {
      let crit = d.criteria;
      if (!crit || !Object.keys(crit).length) {
        crit = {
          transaction_type: d.deal_type || (isSaleApt ? 'sale' : 'rental'),
          budget_max: d.deal_amount ? Number(d.deal_amount) * 1.15 : null,
          budget_min: d.deal_amount ? Number(d.deal_amount) * 0.75 : null,
          currency: d.currency || cur,
        };
      }
      const score = matchScore(apt, crit);
      return { deal: d, crit, score: score ?? (d.deal_type === (isSaleApt ? 'sale' : 'rental') ? 65 : 30) };
    });

    matches.sort((a, b) => (b.score - a.score));

    return R.dialog({
      title: 'კლიენტების მოძიება (Reverse Matchmaker)',
      subtitle: `${apt.name}: ვინ ეძებს ამ ტიპის ბინას?`,
      wide: true,
      body: `
        <div class="reverse-mm">
          <div class="card" style="margin-bottom:14px;background:var(--surface-sunken);border:1px solid var(--line);padding:12px 16px;border-radius:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
              <div>
                <strong style="font-size:15px;display:block">${esc(apt.name)}</strong>
                <span class="muted small">${esc([apt.city, apt.district, apt.address].filter(Boolean).join(', '))} · ${apt.rooms ? `${apt.rooms} ოთახი · ` : ''}${apt.area_sqm ? `${apt.area_sqm} მ²` : ''}</span>
              </div>
              <div style="text-align:right">
                <strong class="t-ok" style="font-size:16px">${aptPrice ? fmtMoney(aptPrice, cur) : '–'}${isSaleApt ? '' : ' / თვე'}</strong>
                <span class="badge badge-neutral" style="display:block;margin-top:2px">${isSaleApt ? 'გაყიდვა' : 'ქირავდება'}</span>
              </div>
            </div>
          </div>

          <div class="field-label" style="margin-bottom:8px">შესაბამისი აქტიური კლიენტები (${matches.length}):</div>

          <div class="rows" id="rmm-list" style="max-height:420px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">
            ${matches.length ? matches.map(({ deal: d, score }) => {
              const tone = score >= 80 ? 't-ok' : score >= 50 ? 't-warn' : 'muted';
              const cleanPhone = (d.client_phone || '').replace(/[^\d+]/g, '').replace(/^0/, '+995');
              const waText = `გამარჯობა, ${d.client_name || ''}! თქვენი მოთხოვნის შესაბამისად გამოგიგზავნეთ ახალი ვარიანტი:\n${apt.name} (${aptPrice ? fmtMoney(aptPrice, cur) : ''})\nნახეთ დეტალები და ფოტოები: ${pUrl}`;

              return `<div class="card" style="padding:12px 16px;border:1px solid var(--line);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                <div style="flex:1;min-width:200px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <strong>${esc(d.client_name)}</strong>
                    <span class="badge" style="font-size:11px;font-weight:700;color:var(--${tone === 't-ok' ? 'ok' : tone === 't-warn' ? 'warn' : 'muted'})">${score}% დამთხვევა</span>
                  </div>
                  <div class="small muted" style="margin-top:2px">
                    ${d.client_phone ? `<a href="tel:${esc(d.client_phone)}">${esc(d.client_phone)}</a> · ` : ''}
                    ბიუჯეტი: ${d.deal_amount ? fmtMoney(d.deal_amount, d.currency || 'USD') : 'მიუთითებელი'} · ეტაპი: ${STAGES.find(s => s.id === d.stage)?.label || d.stage}
                  </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <a class="btn btn-wa btn-sm" href="https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(waText)}" target="_blank" rel="noopener" title="გაუგზავნე ეს ბინა WhatsApp-ში">
                    ${icon('whatsapp', 14)} შეთავაზება
                  </a>
                  <button type="button" class="btn btn-secondary btn-sm" data-rmm-link="${d.id}" title="მიაბი ეს ბინა გარიგებას">
                    მიბმა
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" data-rmm-deal="${d.id}" title="გარიგების გახსნა">
                    ${icon('wrench', 14)}
                  </button>
                </div>
              </div>`;
            }).join('') : '<div class="empty-inline">აქტიური კლიენტები არ მოიძებნა.</div>'}
          </div>
        </div>
      `,
      onOpen: (form) => {
        $$('[data-rmm-deal]', form).forEach(b => b.addEventListener('click', () => {
          const d = H.deal(b.dataset.rmmDeal);
          if (d) openDealForm(d);
        }));

        $$('[data-rmm-link]', form).forEach(b => b.addEventListener('click', async () => {
          const d = H.deal(b.dataset.rmmLink);
          if (!d) return;
          if (d.apartment_id && d.apartment_id !== apt.id && !window.confirm(`${d.client_name} უკვე მიბმულია ბინაზე „${H.aptName(d.apartment_id)}“. შევცვალო ამ ბინით?`)) return;
          b.disabled = true;
          try {
            const row = await q(sb.from('deals').update({ apartment_id: apt.id, updated_at: new Date().toISOString() }).eq('id', d.id).select().single());
            App.upsertLocal('deals', row);
            toast(`ბინა წარმატებით მიება კლიენტს: ${d.client_name}`, { type: 'success' });
            b.textContent = 'მიბმულია';
            b.classList.add('t-ok');
          } catch (err) {
            toast('შეცდომა მიბმისას', { type: 'error' });
            b.disabled = false;
          }
        }));
      }
    });
  }
  App.openReverseMatchmakerModal = openReverseMatchmakerModal;

  // ===========================================================================
  // POST GENERATOR (KA · EN · WhatsApp · Co-Brokering 50/50)
  // ===========================================================================
  function amenityLabels(a, lang) {
    const i = lang === 'en' ? 1 : 0;
    return (Array.isArray(a.amenities) ? a.amenities : []).map(x => {
      if (typeof x === 'string') return AMENITIES[x]?.[i] || x;
      if (x && typeof x === 'object') return (lang === 'en' ? x.en || x.label_en : x.ka || x.label) || AMENITIES[x.id]?.[i] || x.label || '';
      return '';
    }).filter(Boolean);
  }

  App.openPostGenerator = (apartment) => {
    const a = apartment;
    const isSale = a.transaction_type === 'sale';
    const cur = (a.currency || 'USD').toUpperCase() === 'GEL' ? 'GEL' : 'USD';
    const priceAmount = Number((isSale ? a.sale_price : a.monthly_rent) || 0);
    const other = cur === 'USD' ? 'GEL' : 'USD';
    const alt = priceAmount ? convert(priceAmount, cur, other) : null;
    const sqmPrice = a.price_sqm || (priceAmount && a.area_sqm ? Math.round(priceAmount / Number(a.area_sqm)) : null);

    const priceKA = priceAmount
      ? `${fmtMoney(priceAmount, cur)}${isSale ? '' : ' / თვე'}${alt !== null ? ` (~${fmtMoney(alt, other)})` : ''}${isSale && sqmPrice ? ` (${fmtMoney(sqmPrice, cur)}/მ²)` : ''}`
      : 'ფასი შეთანხმებით';
    const priceEN = priceAmount
      ? `${fmtMoney(priceAmount, cur)}${isSale ? '' : ' / month'}${alt !== null ? ` (~${fmtMoney(alt, other)})` : ''}${isSale && sqmPrice ? ` (${fmtMoney(sqmPrice, cur)}/m²)` : ''}`
      : 'Price on request';

    const publicUrl = listingUrl(a);
    const wlUrl = listingUrl(a, true);
    const phone = a.agent_phone || S.member?.phone || S.org?.contact_phone || '';
    const place = [a.district, a.city].filter(Boolean).join(', ');
    const tag = (s) => (s ? '#' + String(s).replace(/[^\p{L}\p{N}]+/gu, '') : '');
    const floorKA = a.floor ? `სართული ${a.floor}${a.total_floors ? '/' + a.total_floors : ''}` : '';
    const floorEN = a.floor ? `floor ${a.floor}${a.total_floors ? '/' + a.total_floors : ''}` : '';
    const specsKA = [a.rooms ? `${a.rooms} ოთახი` : '', a.bedrooms ? `${a.bedrooms} საძინებელი` : '', a.area_sqm ? `${a.area_sqm} მ²` : '', floorKA].filter(Boolean).join(' · ');
    const specsEN = [a.rooms ? `${a.rooms} rooms` : '', a.bedrooms ? `${a.bedrooms} bedrooms` : '', a.area_sqm ? `${a.area_sqm} m²` : '', floorEN].filter(Boolean).join(' · ');
    const amKA = amenityLabels(a, 'ka');
    const amEN = amenityLabels(a, 'en');
    const lines = (...xs) => xs.filter(x => x !== null && x !== undefined && x !== false && x !== '').join('\n');

    const postKA = lines(
      isSale ? `იყიდება ბინა${place ? ' · ' + place : ''}` : `ქირავდება ბინა${place ? ' · ' + place : ''}`,
      `${a.name}`,
      a.address && `მისამართი: ${a.address}`,
      `ფასი: ${priceKA}`,
      specsKA && `${specsKA}`,
      !isSale && (a.pets_allowed ? 'შინაური ცხოველი: დასაშვებია' : 'შინაური ცხოველი: დაუშვებელია'),
      !isSale && a.utilities_estimate && `კომუნალური: ~${a.utilities_estimate} ₾ / თვე`,
      !isSale && a.prepayment_terms && `პირობები: ${a.prepayment_terms}`,
      amKA.length && `\nკეთილმოწყობა: ${amKA.join(', ')}`,
      a.description && `\n${String(a.description).trim()}`,
      '',
      'ფოტოები და დეტალები:',
      `${publicUrl}`,
      '',
      phone ? `ნახვის დასაჯავშნად მოგვწერეთ WhatsApp-ში ან დაგვირეკეთ:\n${phone}` : 'ნახვის დასაჯავშნად მოგვწერეთ პირად შეტყობინებაში.',
      [isSale ? '#იყიდება' : '#ქირავდება', '#ბინა', tag(a.city), tag(a.district)].filter(Boolean).join(' '),
    );

    const postEN = lines(
      isSale ? `Apartment for sale${place ? ' · ' + place : ''}` : `Apartment for rent${place ? ' · ' + place : ''}`,
      `${a.name}`,
      a.address && `Address: ${a.address}`,
      isSale ? `Price: ${priceEN}` : `Rent: ${priceEN}`,
      specsEN && `${specsEN}`,
      !isSale && (a.pets_allowed ? 'Pets: allowed' : 'Pets: not allowed'),
      !isSale && a.utilities_estimate && `Utilities: ~${a.utilities_estimate} GEL / month`,
      !isSale && a.prepayment_terms && `Terms: ${a.prepayment_terms}`,
      amEN.length && `\nAmenities: ${amEN.join(', ')}`,
      a.description_en && `\n${String(a.description_en).trim()}`,
      '',
      'Photos and details:',
      `${publicUrl}`,
      '',
      phone ? `To book a viewing, message on WhatsApp or call:\n${phone}` : 'To book a viewing, send us a private message.',
      isSale ? ['#ApartmentForSale', '#BuyPropertyGeorgia', '#RealEstateGeorgia'].join(' ') : ['#ApartmentForRent', '#RentGeorgia', '#Expats'].join(' '),
    );

    const postWA = lines(
      'გამარჯობა! გიგზავნით ბინის ვარიანტს:',
      `${a.name}${place ? ' · ' + place : ''}`,
      `${priceKA}`,
      [specsKA, !isSale && a.pets_allowed ? 'ცხოველი დასაშვებია' : ''].filter(Boolean).join(' · '),
      '',
      'ფოტოები და ყველა დეტალი:',
      publicUrl,
      '',
      'თუ მოგეწონებათ, ნახვას დაგიჯავშნით.',
    );

    const split = Number(a.cobroker_split ?? 50);
    const commPct = Number(a.agent_commission_percent ?? (isSale ? 3 : 50));
    const commAmount = priceAmount ? (priceAmount * commPct) / 100 + Number(a.owner_bonus || 0) : 0;
    const postCB = lines(
      `Co-Brokering ${split}/${100 - split} · ${isSale ? 'იყიდება ბინა' : 'ქირავდება ბინა'}`,
      `${a.name}${place ? ' · ' + place : ''}`,
      `${isSale ? 'ფასი' : 'ქირა'}: ${priceKA}`,
      specsKA && `${specsKA}`,
      !isSale && (a.pets_allowed ? 'ცხოველი დასაშვებია' : 'ცხოველი დაუშვებელია'),
      priceAmount ? `საკომისიო: ${commPct}% ${isSale ? 'გაყიდვის ფასიდან' : 'პირველი თვის ქირიდან'}${Number(a.owner_bonus) ? ' + მესაკუთრის ბონუსი' : ''} (${fmtMoney(commAmount, cur)}), ვიყოფთ ${split}/${100 - split}` : `საკომისიოს ვიყოფთ ${split}/${100 - split}`,
      '',
      'ბმული კლიენტისთვის (Rigzea-ს ბრენდის გარეშე):',
      `${wlUrl}`,
      '',
      phone ? `თუ შესაფერისი კლიენტი გყავთ, მომწერეთ: ${phone}` : 'თუ შესაფერისი კლიენტი გყავთ, მომწერეთ პირად შეტყობინებაში.',
    );

    const posts = { ka: postKA, en: postEN, wa: postWA, cb: postCB };
    const tabs = [['ka', 'ქართული პოსტი'], ['en', 'English post'], ['wa', 'WhatsApp კლიენტს'], ['cb', 'Co-Brokering 50/50']];
    const warnings = [
      !phone && 'საკონტაქტო ტელეფონი არ არის მითითებული. დაამატე ბინის ან კომპანიის პარამეტრებში.',
      isSale ? (!priceAmount && 'ბინას გასაყიდი ფასი არ აქვს მითითებული.') : (!priceAmount && 'ბინას ქირა არ აქვს მითითებული.'),
      !a.description_en && 'ინგლისური აღწერა (description_en) არ არის. English პოსტი აღწერის გარეშე იქნება.'
    ].filter(Boolean);

    return R.dialog({
      title: 'პოსტის გენერატორი',
      subtitle: a.name,
      wide: true,
      body: `
        <div class="tabs" role="tablist">${tabs.map(([k, l], i) => `<button type="button" role="tab" class="tab" data-post="${k}" aria-selected="${i === 0}">${l}</button>`).join('')}</div>
        ${warnings.length ? `<div class="notice notice-warn notice-list small">${warnings.map(w => `<div>${icon('alert', 13)} ${esc(w)}</div>`).join('')}</div>` : ''}
        <label class="sr-only" for="gen-output">პოსტის ტექსტი</label>
        <textarea id="gen-output" rows="14" class="input post-output">${esc(postKA)}</textarea>
        <div class="post-actions">
          <button type="button" class="btn btn-primary" id="btn-copy-post">${icon('copy', 16)} ტექსტის კოპირება</button>
          <a class="btn btn-wa" id="btn-wa-post" href="${R.whatsappUrl(postKA)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp</a>
          <button type="button" class="btn btn-secondary" id="btn-copy-wl" title="კლიენტისთვის გადასაგზავნი ბმული Rigzea-ს ბრენდის გარეშე">White-label ბმული</button>
          <a class="btn btn-ghost" href="${esc(publicUrl)}" target="_blank" rel="noopener">${icon('external', 16)} გვერდის გახსნა</a>
        </div>`,
      onOpen: (form) => {
        const out = $('#gen-output', form);
        const wa = $('#btn-wa-post', form);
        const sync = () => { wa.href = R.whatsappUrl(out.value); };
        $$('[data-post]', form).forEach(t => t.addEventListener('click', () => {
          $$('[data-post]', form).forEach(x => x.setAttribute('aria-selected', String(x === t)));
          out.value = posts[t.dataset.post];
          sync();
        }));
        out.addEventListener('input', sync);
        $('#btn-copy-post', form).onclick = () => copyText(out.value, 'პოსტის ტექსტი დაკოპირდა');
        $('#btn-copy-wl', form).onclick = () => copyText(wlUrl, 'White-label ბმული დაკოპირდა (Rigzea-ს ბრენდის გარეშე)');
      },
    });
  };

  // ===========================================================================
  // CO-BROKER SHARE (text for colleagues: WhatsApp deep link and broker chat groups)
  // ===========================================================================
  const CB_TERMS = [['split', '50/50 სააგენტოებთან'], ['percent', '1% კოლეგას'], ['fixed', 'ფიქსირებული $1000 კოლეგას']];
  const CB_TERM_TEXT = { split: 'საკომისიო იყოფა 50/50', percent: 'კოლეგას 1% გარიგების თანხიდან', fixed: 'კოლეგას ფიქსირებული $1000' };
  // Street without the building number, so the exact address stays with the listing agent.
  const streetOnly = (address) => String(address || '').replace(/[\s,]*(№|N)?\s*\d+\s*[ა-ჰa-zA-Z]?(\s*[/-]\s*\d+)?\s*$/, '').trim();

  function coBrokerText(a, o) {
    const isSale = a.transaction_type === 'sale';
    const cur = (a.currency || 'USD').toUpperCase() === 'GEL' ? 'GEL' : 'USD';
    const other = cur === 'USD' ? 'GEL' : 'USD';
    const base = Number(isSale ? a.sale_price : a.monthly_rent) || 0;
    const price = base ? Math.round(base * (1 + (Number(o.margin) || 0) / 100)) : 0;
    const alt = price ? convert(price, cur, other) : null;
    const priceText = price ? `${fmtMoney(price, cur)}${alt !== null ? ` (${fmtMoney(alt, other)})` : ''}${isSale ? '' : ' / თვე'}` : 'შეთანხმებით';
    const where = (o.shortAddress
      ? [a.city, a.district, streetOnly(a.address)]
      : [a.city, a.district, a.address, a.unit_number && `ბინა ${a.unit_number}`]).filter(Boolean).join(', ');
    const owner = H.owner(a.owner_id);
    const phone = a.agent_phone || S.member?.phone || S.org?.contact_phone || '';
    // The public page shows the real price, so the link is left out when a margin is added.
    const link = Number(o.margin) > 0 ? '' : listingUrl(a, true);
    const rows = [
      `${isSale ? 'იყიდება' : 'ქირავდება'} · თანამშრომლობა კოლეგებთან`,
      `ლოკაცია: ${where || 'დაზუსტებით'}`,
      a.area_sqm && `ფართი: ${a.area_sqm} მ²${a.floor ? ` · სართული ${a.floor}${a.total_floors ? '/' + a.total_floors : ''}` : ''}`,
      a.rooms && `ოთახები: ${a.rooms}${a.bedrooms ? ` (საძინებელი: ${a.bedrooms})` : ''}`,
      `ფასი: ${priceText}`,
      `პირობა: ${CB_TERM_TEXT[o.terms] || CB_TERM_TEXT.split}`,
      !o.hideOwner && owner && `მეპატრონე: ${owner.name}${owner.phone ? ', ' + owner.phone : ''}`,
      !o.hideOwner && a.cadastral_code && `საკადასტრო კოდი: ${a.cadastral_code}`,
      link && '\nფოტოები და დეტალები (შეგიძლია კლიენტს გადაუგზავნო):',
      link && `${link}`,
      phone ? `\nკლიენტი თუ გყავს, მომწერე ან დამირეკე: ${phone}` : '\nკლიენტი თუ გყავს, მომწერე პირადში.',
    ];
    return rows.filter(x => typeof x === 'string' && x).join('\n');
  }

  App.openCoBrokerShare = (a) => {
    if (!a) return undefined;
    const tag = (s) => (s ? '#' + String(s).replace(/[^\p{L}\p{N}]+/gu, '') : '');
    const hashtags = ['#თანამშრომლობა', a.transaction_type === 'sale' ? '#იყიდება' : '#ქირავდება', tag(a.city), tag(a.district)].filter(Boolean).join(' ');
    return R.dialog({
      title: 'კოლეგასთან გაზიარება',
      subtitle: a.name,
      wide: true,
      body: `
        <div class="form-grid">
          <label class="check span-2"><input type="checkbox" id="cb-hide" checked /> <span>მეპატრონის ნომრისა და საკადასტრო კოდის დამალვა</span></label>
          <label class="check span-2"><input type="checkbox" id="cb-short" checked /> <span>მისამართის შემოკლება <span class="muted">(მხოლოდ უბანი და ქუჩა)</span></span></label>
          <label class="field"><span class="field-label">საკომისიოს პირობა</span><select id="cb-terms">${CB_TERMS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">ფასის მარჟა (+%)</span><input type="number" id="cb-margin" min="0" max="50" step="0.5" placeholder="0" inputmode="decimal" /><span class="field-hint" id="cb-margin-hint">არასავალდებულო</span></label>
        </div>
        <label class="sr-only" for="cb-output">გასაზიარებელი ტექსტი</label>
        <textarea id="cb-output" rows="12" class="input post-output"></textarea>
        <div class="post-actions">
          <a class="btn btn-wa" id="cb-wa" href="#" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp-ით გაგზავნა</a>
          <button type="button" class="btn btn-secondary" id="cb-tg">${icon('telegram', 16)} კოპირება Telegram ჯგუფისთვის</button>
          <button type="button" class="btn btn-ghost" id="cb-copy">${icon('copy', 16)} ტექსტის კოპირება</button>
        </div>`,
      onOpen: (form) => {
        const out = $('#cb-output', form);
        const wa = $('#cb-wa', form);
        const sync = () => { wa.href = R.whatsappUrl(out.value); };
        const build = () => {
          const margin = Number($('#cb-margin', form).value) || 0;
          out.value = coBrokerText(a, { hideOwner: $('#cb-hide', form).checked, shortAddress: $('#cb-short', form).checked, terms: $('#cb-terms', form).value, margin });
          $('#cb-margin-hint', form).textContent = margin > 0 ? 'ბმული არ ემატება: საჯარო გვერდზე რეალური ფასი ჩანს.' : 'არასავალდებულო';
          sync();
        };
        ['cb-hide', 'cb-short', 'cb-terms'].forEach(x => $(`#${x}`, form).addEventListener('change', build));
        $('#cb-margin', form).addEventListener('input', build);
        out.addEventListener('input', sync);
        $('#cb-copy', form).onclick = () => copyText(out.value, 'ტექსტი დაკოპირდა');
        $('#cb-tg', form).onclick = () => copyText(`${out.value}\n\n${hashtags}`, 'დაკოპირდა. ჩასვი Telegram ჯგუფში.');
        build();
      },
    });
  };

  // ===========================================================================
  // LEASE AGREEMENT (form → saved contract → bilingual preview / print)
  // ===========================================================================
  const BLANK = '________________';
  const val = (v, blank = BLANK) => (v === null || v === undefined || String(v).trim() === '' ? blank : esc(String(v).trim()));
  const amountKA = (n, cur) => (n === '' || n === null || n === undefined || isNaN(n) ? BLANK : `${Number(n).toLocaleString('en-US').replace(/,/g, ' ')} ${cur}`);
  const amountEN = (n, cur) => (n === '' || n === null || n === undefined || isNaN(n) ? BLANK : `${cur} ${Number(n).toLocaleString('en-US')}`);

  // Clause set: each article has a KA and EN heading and parallel clauses, so numbering always matches.
  // Strictly formulated according to the Civil Code of Georgia (საქართველოს სამოქალაქო კოდექსი, მუხლები 531–575).
  function leaseArticles(d) {
    const cur = d.currency || 'USD';
    const area = d.area_sqm ? { ka: `, ფართობი: ${esc(d.area_sqm)} მ²`, en: `, area: ${esc(d.area_sqm)} m²` } : { ka: '', en: '' };
    const deposit = Number(d.deposit) > 0;
    const iban = d.landlord_bank ? { ka: `: ${esc(d.landlord_bank)}`, en: `: ${esc(d.landlord_bank)}` } : { ka: '', en: '' };
    const notice = val(d.notice_days, '30');
    const penaltyPct = val(d.penalty_pct, '0.1');
    const payDay = val(d.pay_day, '1');
    const utilities = {
      tenant: ['ხელშეკრულების მოქმედების პერიოდში მოხმარებულ კომუნალურ მომსახურებას (ელექტროენერგია, ბუნებრივი აირი, წყალი, დასუფთავება, ლიფტი, ინტერნეტი) სრულად იხდის დამქირავებელი, მრიცხველების ფაქტობრივი ჩვენებებისა და წარმოდგენილი ქვითრების მიხედვით.',
        'All utilities consumed during the lease term (electricity, natural gas, water, waste disposal, elevator, internet) shall be paid in full by the Tenant according to actual meter readings and official utility bills.'],
      landlord: ['კომუნალური მომსახურების (ელექტროენერგია, ბუნებრივი აირი, წყალი, დასუფთავება, ლიფტი, ინტერნეტი) ღირებულება შედის ქირაში და მას სრულად ფარავს გამქირავებელი.',
        'The cost of utilities (electricity, natural gas, water, waste disposal, elevator, internet) is included in the rent and shall be paid in full by the Landlord.'],
      custom: [`კომუნალური გადასახადები იფარება მხარეთა შემდეგი შეთანხმებით: ${val(d.utilities_note)}`, `Utility expenses are paid according to the following agreed terms: ${val(d.utilities_note)}`],
    }[d.utilities || 'tenant'];

    const arts = [
      { ka: 'ხელშეკრულების საგანი და გარანტიები', en: 'Subject of Agreement and Warranties', c: [
        [`გამქირავებელი დამქირავებელს დროებით სასყიდლიან სარგებლობაში (ექსკლუზიურად საცხოვრებელი მიზნებისთვის) გადასცემს საცხოვრებელ ბინას, რომელიც მდებარეობს მისამართზე: ${val(d.property_address)} (საკადასტრო კოდი: ${val(d.cadastral_code)}${area.ka}) (შემდგომში „ბინა“), ხოლო დამქირავებელი კისრულობს ვალდებულებას, გადაიხადოს ქირა ამ ხელშეკრულებით დადგენილი წესითა და ოდენობით (საქართველოს სამოქალაქო კოდექსის 531-ე მუხლი).`,
          `The Landlord grants the Tenant temporary use of the residential apartment for exclusive residential purposes, located at: ${val(d.property_address)} (cadastral code: ${val(d.cadastral_code)}${area.en}) (hereinafter the "Apartment"), and the Tenant undertakes to pay rent in accordance with this Agreement (Article 531 of the Civil Code of Georgia).`],
        ['გამქირავებელი გარანტიას იძლევა, რომ არის ბინის კანონიერი მესაკუთრე ან უფლებამოსილი წარმომადგენელი, და ბინა თავისუფალია ყოველგვარი ნივთობრივი და უფლებრივი ნაკლისგან (სსკ 532-ე და 533-ე მუხლები), არ არის დაყადაღებული, გასხვისებული ან დატვირთული მესამე პირთა ისეთი უფლებებით, რაც ხელს შეუშლის დამქირავებლის მიერ მის შეუფერხებელ სარგებლობას.',
          'The Landlord warrants that they are the lawful owner or authorised representative of the Apartment, and that the Apartment is free from any material or legal defects (Articles 532 and 533 of the Civil Code of Georgia), is not seized, alienated, or encumbered with third-party claims that would impede unhindered use by the Tenant.'],
      ] },
      { ka: 'ქირა და ანგარიშსწორების წესი', en: 'Rent and Payment Terms', c: [
        [`ბინის ყოველთვიური ქირის ოდენობა შეადგენს ${amountKA(d.rent, cur)} (საქართველოს სამოქალაქო კოდექსის 536-ე მუხლი).`, `The monthly rent for the Apartment is ${amountEN(d.rent, cur)} (Article 536 of the Civil Code of Georgia).`],
        [`ქირა გადაიხდება წინასწარ, ყოველი საანგარიშო თვის ${payDay} რიცხვამდე (ჩათვლით).`, `Rent is payable monthly in advance, on or before day ${payDay} of each billing period.`],
        [`ანგარიშსწორება ხორციელდება უნაღდო ფორმით გამქირავებლის საბანკო ანგარიშზე ჩარიცხვით${iban.ka} ან მხარეთა ურთიერთშეთანხმებით ნაღდი ანგარიშსწორების გზით შესაბამისი წერილობითი დადასტურებით.`,
          `Payment is made by bank transfer to the Landlord's bank account${iban.en} or, by mutual consent, in cash with written receipt confirmation.`],
        ['ქირის ოდენობის ცალმხრივი შეცვლა ხელშეკრულების მოქმედების პერიოდში დაუშვებელია; ნებისმიერი ცვლილება დასაშვებია მხოლოდ მხარეთა ორმხრივი წერილობითი შეთანხმებით.',
          'Unilateral modification of the rent during the term of this Agreement is prohibited; any adjustment is valid only upon mutual written agreement of both Parties.'],
      ] },
      { ka: 'საგარანტიო დეპოზიტი', en: 'Security Deposit', c: deposit ? [
        [`ხელშეკრულების ხელმოწერისას დამქირავებელი გამქირავებელს უხდის საგარანტიო დეპოზიტს ${amountKA(d.deposit, cur)} ოდენობით, რომელიც ემსახურება დამქირავებლის მიერ ნაკისრი ვალდებულებების შესრულების, ქონებრივი ზიანისა და კომუნალური დავალიანების უზრუნველყოფას.`,
          `Upon signing this Agreement, the Tenant pays the Landlord a security deposit of ${amountEN(d.deposit, cur)} to secure the performance of obligations, property damage compensation, and utility payments.`],
        ['საგარანტიო დეპოზიტი სრულად უბრუნდება დამქირავებელს ბინის დაბრუნებისა და საბოლოო მიღება-ჩაბარების აქტის გაფორმებიდან არაუგვიანეს 14 (თოთხმეტი) კალენდარული დღის ვადაში, იმ პირობით, რომ დამქირავებელს არ ერიცხება ქირის ან კომუნალური მომსახურების დავალიანება და ბინა ბრუნდება დაუზიანებელ მდგომარეობაში (ჩვეულებრივი ცვეთის გათვალისწინებით).',
          'The security deposit shall be refunded in full to the Tenant within 14 (fourteen) calendar days after the Apartment is returned and the final handover report signed, provided there are no rental or utility debts and the Apartment is returned undamaged (allowing for normal wear and tear).'],
        ['დავალიანების ან ქონების დაზიანების შემთხვევაში, გამქირავებელი უფლებამოსილია, დეპოზიტიდან გამოქვითოს შესაბამისი დოკუმენტურად დადასტურებული ხარჯი/დავალიანება, ხოლო დარჩენილი თანხა დაუბრუნოს დამქირავებელს დასაბუთებულ გაანგარიშებასთან ერთად.',
          'In case of arrears or property damage, the Landlord is entitled to deduct the documented debt or repair costs from the deposit and refund the remaining balance with an itemised statement.'],
        ['საგარანტიო დეპოზიტი არ წარმოადგენს ბოლო თვის (ან ნებისმიერი სხვა თვის) ქირას და დაუშვებელია მისი თვითნებურად ქირის გადასახადად ჩათვლა გამქირავებლის წინასწარი წერილობითი თანხმობის გარეშე.',
          'The security deposit does not constitute the last month\'s (or any other month\'s) rent and cannot be unilaterally applied toward rent without the Landlord\'s prior written consent.'],
      ] : [
        ['მხარეები შეთანხმდნენ, რომ საგარანტიო დეპოზიტის გადახდა გათვალისწინებული არ არის.', 'The Parties have agreed that no security deposit is payable.'],
      ] },
      { ka: 'ხელშეკრულების ვადა და გაგრძელება', en: 'Term and Renewal', c: [
        [`ხელშეკრულება ძალაში შედის მხარეთა ხელმოწერისთანავე და მოქმედებს: ${val(dmy(d.start_date))} – ${val(dmy(d.end_date))} (ორივე თარიღის ჩათვლით) (საქართველოს სამოქალაქო კოდექსის 558-ე მუხლი).`,
          `This Agreement enters into force upon signature and shall be valid from ${val(dmy(d.start_date))} to ${val(dmy(d.end_date))} inclusive (Article 558 of the Civil Code of Georgia).`],
        ['ხელშეკრულების ვადის გაგრძელება ან განახლება დასაშვებია მხოლოდ მხარეთა ორმხრივი წერილობითი შეთანხმებით, ვადის გასვლამდე არანაკლებ 30 კალენდარული დღით ადრე.',
          'Renewal or extension of this Agreement is permitted only by mutual written agreement of both Parties, at least 30 calendar days before the expiration date.'],
      ] },
      { ka: 'კომუნალური გადასახადები', en: 'Utilities and Operating Costs', c: [
        utilities,
        ['ბინის გადაცემამდე წარმოშობილ ნებისმიერ კომუნალურ თუ სხვაგვარ დავალიანებაზე სრულად პასუხისმგებელია გამქირავებელი, ხოლო გადაცემის შემდგომ პერიოდზე, დამქირავებელი, მიღება-ჩაბარების აქტში დაფიქსირებული მრიცხველების საწყისი ჩვენებების შესაბამისად.',
          'Any utility or municipal debts incurred prior to handover are the sole responsibility of the Landlord; all charges incurred after handover are paid by the Tenant based on the initial meter readings recorded in the handover report.'],
      ] },
      { ka: 'ბინით სარგებლობა, რემონტი და შემოწმება', en: 'Use, Maintenance, and Inspection', c: [
        ['დამქირავებელი ბინას იყენებს ექსკლუზიურად საცხოვრებლად, ვალდებულია გაუფრთხილდეს მას, დაიცვას სანიტარული, ხანძარსაწინააღმდეგო და სამეზობლო წესრიგის ნორმები.',
          'The Tenant shall use the Apartment exclusively for residential purposes, maintain good care, and comply with sanitary, fire safety, and neighbourhood conduct regulations.'],
        ['კაპიტალური შეკეთება (სსკ 532-ე მუხლი): გამქირავებელი ვალდებულია საკუთარი ხარჯით უზრუნველყოს ბინის კაპიტალური შეკეთება, მზიდი კონსტრუქციების, სახურავისა და ცენტრალური საინჟინრო კომუნიკაციების (გათბობა, წყალი, ელექტროობა) გაუმართაობის აღმოფხვრა, თუ ის არ არის გამოწვეული დამქირავებლის ბრალეული მოქმედებით.',
          'Capital Repairs (Article 532 Civil Code): The Landlord shall at their own expense carry out capital repairs and eliminate defects in load-bearing structures, roof, and central engineering systems (heating, water, electricity), unless caused by Tenant fault.'],
        ['მიმდინარე მოვლა და წვრილმანი შეკეთება (სსკ 542-ე მუხლი): დამქირავებელი ვალდებულია საკუთარი ხარჯით აღმოფხვრას ბინისა და ინვენტარის ის წვრილმანი გაუმართაობა, რაც გამოწვეულია ჩვეულებრივი ყოველდღიური ექსპლუატაციით.',
          'Day-to-day Maintenance (Article 542 Civil Code): The Tenant shall remedy minor routine faults in the Apartment and inventory at their own expense where resulting from ordinary day-to-day use.'],
        ['ქვექირავნობის აკრძალვა (სსკ 544-ე მუხლი): დამქირავებელს ეკრძალება ბინის ან მისი ნაწილის ქვექირავნობით გაცემა, მესამე პირებისთვის სარგებლობაში გადაცემა ან ბინის იურიდიულ მისამართად რეგისტრაცია გამქირავებლის წინასწარი წერილობითი თანხმობის გარეშე.',
          'Prohibition of Subletting (Article 544 Civil Code): The Tenant is strictly forbidden to sublet the Apartment, transfer occupancy to third parties, or register legal entities at the address without prior written consent of the Landlord.'],
        d.pets === 'yes'
          ? ['შინაური ცხოველის ყოლა ნებადართულია. ცხოველის მიერ ბინისთვის ან ინვენტარისთვის მიყენებულ ნებისმიერ ზიანზე სრულ მატერიალურ პასუხისმგებლობას იღებს დამქირავებელი.',
            'Pets are permitted. The Tenant assumes full financial liability for any damage caused to the premises or inventory by pets.']
          : ['შინაური ცხოველის ყოლა დაუშვებელია გამქირავებლის წინასწარი წერილობითი თანხმობის გარეშე.',
            'Pets are strictly prohibited without the Landlord\'s prior written consent.'],
        ['ბინის დათვალიერება: გამქირავებელს უფლება აქვს, დამქირავებელთან არანაკლებ 24 საათით ადრე შეთანხმებით, გონივრულ დღის საათებში დაათვალიეროს ბინა მისი მოვლის მდგომარეობის შესამოწმებლად.',
          'Inspection: The Landlord is entitled to inspect the Apartment upon giving at least 24 hours\' advance notice to the Tenant, at a reasonable time during daytime hours.'],
      ] },
      { ka: 'მხარეთა პასუხისმგებლობა და პირგასამტეხლო', en: 'Liability and Delay Penalty', c: [
        ['ვალდებულებების შეუსრულებლობის ან არაჯეროვნად შესრულებისთვის მხარეები პასუხს აგებენ საქართველოს მოქმედი კანონმდებლობის შესაბამისად (საქართველოს სამოქალაქო კოდექსის 394-ე და 417–420-ე მუხლები).',
          'The Parties are liable for non-performance or improper performance of their obligations pursuant to Georgian law (Articles 394 and 417–420 of the Civil Code of Georgia).'],
        [`პირგასამტეხლო ქირის გადაცილებაზე: ქირის გადახდის ვადის გადაცილების შემთხვევაში დამქირავებელი უხდის გამქირავებელს პირგასამტეხლოს ყოველ ვადაგადაცილებულ დღეზე გადაუხდელი თანხის ${penaltyPct}%-ის ოდენობით, სრულ დაფარვამდე.`,
          `Delay Penalty: In the event of late rent payment, the Tenant shall pay the Landlord a contractual penalty of ${penaltyPct}% of the overdue amount for each day of delay until full settlement.`],
        ['ბინის დროულად დაუბრუნებლობა (სსკ 564-ე მუხლი): ხელშეკრულების შეწყვეტისას ბინის დაბრუნების დაყოვნების შემთხვევაში, დამქირავებელი ვალდებულია გადაიხადოს ქირა დაყოვნების მთელი დროისთვის და აუნაზღაუროს გამქირავებელს მიყენებული ზიანი.',
          'Delay in Handback (Article 564 Civil Code): If the Tenant fails to hand back the Apartment upon termination, they shall pay rent for the entire overdue duration and indemnify the Landlord for all incurred damages.'],
        ['მატერიალური ზიანი: დამქირავებელი სრულად აგებს პასუხს ბინის, ავეჯისა და საყოფაცხოვრებო ტექნიკის დაზიანებაზე, რომელიც გამოწვეულია მისი, მასთან მცხოვრები პირების ან მისი სტუმრების ბრალეული ქმედებით ან უხეში გაუფრთხილებლობით.',
          'Property Indemnity: The Tenant is fully liable for damage to the premises, furniture, or appliances caused by the fault or gross negligence of the Tenant, family members, or guests.'],
      ] },
      { ka: 'ხელშეკრულების შეწყვეტა და მოშლა', en: 'Termination and Cancellation', c: [
        ['ხელშეკრულება შეიძლება ვადამდე შეწყდეს მხარეთა ორმხრივი წერილობითი შეთანხმებით.',
          'The Agreement may be terminated early by mutual written agreement of both Parties.'],
        [`ცალმხრივი შეწყვეტა: თითოეულ მხარეს უფლება აქვს, ვადამდე შეწყვიტოს ხელშეკრულება მეორე მხარისთვის არანაკლებ ${notice} კალენდარული დღით ადრე გაგზავნილი წერილობითი შეტყობინების საფუძველზე.`,
          `Unilateral Termination: Either Party may terminate early by serving at least ${notice} calendar days' prior written notice to the other Party.`],
        ['გამქირავებლის მიერ ხელშეკრულების დაუყოვნებლივი მოშლა (სსკ 558-ე და 559-ე მუხლები): გამქირავებელს უფლება აქვს დაუყოვნებლივ, ცალმხრივად მოშალოს ხელშეკრულება და მოითხოვოს ბინის გათავისუფლება, თუ: (ა) დამქირავებელი ქირის გადახდას აგვიანებს 10 (ათი) კალენდარულ დღეზე მეტი ვადით; (ბ) დამქირავებელი უხეშად ან სისტემატურად აზიანებს ბინას ან არღვევს მეზობლების სიმშვიდეს; (გ) დამქირავებელმა ბინა უკანონოდ გადასცა მესამე პირს (ქვექირავნობა) ან გამოიყენა არასაცხოვრებელი მიზნებისთვის.',
          'Immediate Cancellation by Landlord (Articles 558, 559 Civil Code): The Landlord may immediately cancel this Agreement and demand immediate eviction if: (a) the Tenant is more than 10 calendar days late with rent; (b) the Tenant materially or systematically damages the premises or disturbs neighbours; (c) the Tenant unauthorisedly sublets the apartment or uses it for non-residential purposes.'],
        ['დამქირავებლის მიერ ხელშეკრულების მოშლა: დამქირავებელს უფლება აქვს მოშალოს ხელშეკრულება, თუ ბინა გამქირავებლის ბრალით გახდა საცხოვრებლად გამოუსადეგარი და გამქირავებელმა ნაკლი არ აღმოფხვრა გონივრულ ვადაში.',
          'Cancellation by Tenant: The Tenant may cancel if the Apartment becomes uninhabitable due to Landlord fault and the defect is not remedied within a reasonable cure period.'],
      ] },
      { ka: 'ფორს-მაჟორი (დაუძლეველი ძალა)', en: 'Force Majeure', c: [
        ['მხარეები თავისუფლდებიან პასუხისმგებლობისგან ნაკისრი ვალდებულებების შეუსრულებლობისთვის, თუ ეს გამოწვეულია დაუძლეველი ძალით (სტიქიური უბედურება, საომარი მოქმედებები, სახელმწიფო შეზღუდვები), რომელთა განჭვრეტა ან თავიდან აცილება ობიექტურად შეუძლებელი იყო.',
          'The Parties are relieved from liability for failure to perform if caused by force majeure events (natural disasters, war, hostilities, statutory bans) that were objectively unforeseeable and insurmountable.'],
      ] },
      { ka: 'დავების გადაწყვეტა და განსჯადობა', en: 'Disputes and Jurisdiction', c: [
        ['ხელშეკრულებიდან გამომდინარე ყველა დავას მხარეები წყვეტენ ურთიერთმოლაპარაკების გზით.',
          'The Parties shall resolve all disputes arising under this Agreement through friendly negotiations.'],
        ['შეთანხმების მიუღწევლობის შემთხვევაში, დავა გადაეცემა განსახილველად საქართველოს საერთო სასამართლოებს საქართველოს მატერიალური და საპროცესო კანონმდებლობის შესაბამისად.',
          'If no amicable agreement is reached, the dispute shall be resolved by the common courts of Georgia in accordance with the substantive and procedural laws of Georgia.'],
      ] },
    ];
    if (String(d.extra_terms || '').trim()) {
      arts.push({ ka: 'დამატებითი პირობები', en: 'Additional Terms', c: [[esc(d.extra_terms.trim()).replace(/\n/g, '<br>'), esc(d.extra_terms.trim()).replace(/\n/g, '<br>')]] });
    }
    arts.push({ ka: 'დასკვნითი დებულებები', en: 'Final Provisions', c: [
      ['ხელშეკრულება ძალაში შედის მხარეთა ხელმოწერის მომენტიდან.', 'This Agreement enters into legal force upon signature by both Parties.'],
      ['წინამდებარე ხელშეკრულების ნებისმიერი ცვლილება და დამატება იურიდიულ ძალას იძენს მხოლოდ წერილობითი ფორმით შედგენისა და ორივე მხარის ხელმოწერის შემთხვევაში.',
        'Any amendment or addition to this Agreement is legally binding only if executed in writing and signed by both Parties.'],
      ['წინამდებარე ხელშეკრულებას თან ერთვის და მის განუყოფელ ნაწილს წარმოადგენს: დანართი N1 (ბინის მიღება-ჩაბარების აქტი).',
        'Attached hereto and forming an integral part of this Agreement is: Annex No. 1 (Apartment Handover and Acceptance Act).'],
      ['ხელშეკრულება შედგენილია ქართულ და ინგლისურ ენებზე თანაბარი იურიდიული ძალის მქონე ორ იდენტურ ეგზემპლარად, თითო-თითო თითოეული მხარისთვის. ტექსტებს შორის რაიმე შეუსაბამობის შემთხვევაში, უპირატესობა ენიჭება ქართულ ტექსტს.',
        'This Agreement is executed in Georgian and English in two identical copies having equal legal force, one for each Party. In case of any discrepancy, the Georgian text prevails.'],
    ] });
    return arts;
  }

  const LEASE_CSS = `
    .lease-doc { font-family: 'FiraGO', system-ui, sans-serif; color: #111; background: #fff; font-size: 12px; line-height: 1.52; }
    .lease-doc h2 { font-size: 15px; text-align: center; margin: 0 0 2px; text-transform: uppercase; letter-spacing: .3px; font-weight: 700; }
    .lease-doc .ld-law-ref { text-align: center; font-size: 11px; color: #475569; margin: 0 0 10px; font-style: italic; }
    .lease-doc .ld-sub { text-align: center; color: #334155; font-size: 12px; margin: 0 0 2px; font-weight: 600; }
    .lease-doc .ld-place { display: flex; justify-content: space-between; margin: 0 0 12px; font-size: 11.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .lease-doc .ld-parties { margin: 0 0 10px; font-size: 11.5px; }
    .lease-doc h3 { font-size: 12.5px; margin: 12px 0 5px; padding-bottom: 2px; border-bottom: 1px solid #cbd5e1; break-after: avoid; font-weight: 700; color: #0f172a; }
    .lease-doc p { margin: 0 0 5px; }
    .lease-doc .ld-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; break-inside: avoid; }
    .lease-doc .ld-pair > :last-child { color: #334155; }
    .lease-doc .ld-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 22px; break-inside: avoid; }
    .lease-doc .ld-sign div { font-size: 11.5px; }
    .lease-doc .ld-line { border-bottom: 1px solid #0f172a; height: 32px; margin-bottom: 4px; }
    .lease-doc .ld-annex-wrap { margin-top: 32px; padding-top: 20px; border-top: 2px dashed #94a3b8; break-before: page; page-break-before: always; }
    .lease-doc .ld-annex-title { font-size: 14px; text-align: center; font-weight: 700; margin: 0 0 2px; text-transform: uppercase; color: #0f172a; }
    .lease-doc .ld-annex-sub { text-align: center; font-size: 11px; color: #475569; margin: 0 0 12px; }
    .lease-doc .ld-table { width: 100%; border-collapse: collapse; margin: 10px 0 12px; font-size: 11.5px; }
    .lease-doc .ld-table th, .lease-doc .ld-table td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; vertical-align: top; }
    .lease-doc .ld-table th { background: #f8fafc; font-weight: 600; width: 34%; color: #1e293b; }
    @media (max-width: 600px) { .lease-doc .ld-pair { grid-template-columns: 1fr; gap: 4px; } .lease-doc .ld-sign { grid-template-columns: 1fr; } }`;

  function leaseHtml(d, mode = 'dual') {
    const showKa = mode !== 'en', showEn = mode !== 'ka', dual = mode === 'dual';
    const arts = leaseArticles(d);
    const partyKA = `${val(d.landlord_name)}, პირადი ნომერი: ${val(d.landlord_id)}, მისამართი: ${val(d.landlord_address)} (შემდგომში „გამქირავებელი“), ერთი მხრივ, და ${val(d.tenant_name)}, პირადი ნომერი: ${val(d.tenant_id)}, მისამართი: ${val(d.tenant_address)} (შემდგომში „დამქირავებელი“), მეორე მხრივ (ერთად „მხარეები“), ვდებთ წინამდებარე ხელშეკრულებას შემდეგზე:`;
    const partyEN = `${val(d.landlord_name)}, personal ID: ${val(d.landlord_id)}, address: ${val(d.landlord_address)} (hereinafter the "Landlord"), on the one hand, and ${val(d.tenant_name)}, personal ID: ${val(d.tenant_id)}, address: ${val(d.tenant_address)} (hereinafter the "Tenant"), on the other hand (together the "Parties"), have concluded this Agreement as follows:`;
    const block = (ka, en) => (dual ? `<div class="ld-pair"><p>${ka}</p><p>${en}</p></div>` : `<p>${showKa ? ka : en}</p>`);
    const finalLang = dual ? [['ხელშეკრულება შედგენილია ქართულ და ინგლისურ ენებზე. ტექსტებს შორის შეუსაბამობის შემთხვევაში, უპირატესობა ენიჭება ქართულ ტექსტს.', 'This Agreement is made in Georgian and English. In case of any discrepancy, the Georgian text prevails.']] : [];
    const sign = (roleKa, roleEn, name, pid, phone) => `<div>
        <strong>${showKa ? roleKa : ''}${dual ? ' / ' : ''}${showEn ? roleEn : ''}</strong>
        <div>${val(name)}</div>
        <div>${showKa ? 'პ/ნ' : 'ID'}: ${val(pid)}${phone ? ` · ${showKa ? 'ტელ.' : 'Tel.'}: ${esc(phone)}` : ''}</div>
        <div class="ld-line"></div><small>${showKa ? 'ხელმოწერა' : ''}${dual ? ' / ' : ''}${showEn ? 'Signature' : ''}</small>
      </div>`;

    // Annex 1: Handover & Acceptance Act (მიღება-ჩაბარების აქტი)
    const keys = val(d.keys_count, '2');
    const el = val(d.meter_electricity, '_______');
    const gas = val(d.meter_gas, '_______');
    const water = val(d.meter_water, '_______');
    const inv = val(d.inventory_notes, showKa ? 'ბინა გადაცემულია სუფთა, საცხოვრებლად ვარგის მდგომარეობაში, მუშა კომუნიკაციებითა და ტექნიკით.' : 'Handed over in clean, habitable condition with functioning utilities and appliances.');
    const rem = val(d.acceptance_notes, showKa ? 'მხარეებს ბინისა და ინვენტარის მდგომარეობაზე პრეტენზია არ გააჩნიათ.' : 'The Parties have no claims regarding the condition of the premises or inventory.');

    const annexKA = `<div class="ld-annex-wrap">
      <div class="ld-annex-title">დანართი N1: საცხოვრებელი ბინის მიღება-ჩაბარების აქტი</div>
      <div class="ld-annex-sub">(წარმოადგენს ${val(dmy(d.contract_date))} ქირავნობის ხელშეკრულების განუყოფელ ნაწილს)</div>
      <p>წინამდებარე აქტით გამქირავებელმა გადასცა, ხოლო დამქირავებელმა ჩაიბარა საცხოვრებელი ბინა მდებარე მისამართზე: <strong>${val(d.property_address)}</strong> შემდეგი პირობებით:</p>
      <table class="ld-table">
        <tr><th>1. გასაღებები</th><td>გადაცემულია გასაღებების <strong>${keys}</strong> კომპლექტი.</td></tr>
        <tr><th>2. მრიცხველების საწყისი ჩვენებები</th><td>
          <div>• ელექტროენერგია: <strong>${el}</strong> კვტ/სთ (kWh)</div>
          <div>• ბუნებრივი აირი (გაზი): <strong>${gas}</strong> მ³ (m³)</div>
          <div>• წყალი: <strong>${water}</strong> მ³ (m³)</div>
        </td></tr>
        <tr><th>3. ავეჯი, ტექნიკა და მდგომარეობა</th><td>${inv}</td></tr>
        <tr><th>4. შენიშვნები / ხარვეზები</th><td>${rem}</td></tr>
      </table>
      <div class="ld-sign">
        ${sign('ჩააბარა (გამქირავებელი)', 'Handed over by (Landlord)', d.landlord_name, d.landlord_id, d.landlord_phone)}
        ${sign('ჩაიბარა (დამქირავებელი)', 'Accepted by (Tenant)', d.tenant_name, d.tenant_id, d.tenant_phone)}
      </div>
    </div>`;

    const annexEN = `<div class="ld-annex-wrap">
      <div class="ld-annex-title">Annex No. 1: Apartment Handover and Acceptance Act</div>
      <div class="ld-annex-sub">(Integral part of the Residential Lease Agreement dated ${val(dmy(d.contract_date))})</div>
      <p>By this Act, the Landlord has handed over and the Tenant has accepted the residential apartment located at: <strong>${val(d.property_address)}</strong> on the following terms:</p>
      <table class="ld-table">
        <tr><th>1. Keys Handover</th><td>Handed over <strong>${keys}</strong> set(s) of keys.</td></tr>
        <tr><th>2. Initial Meter Readings</th><td>
          <div>• Electricity: <strong>${el}</strong> kWh</div>
          <div>• Natural Gas: <strong>${gas}</strong> m³</div>
          <div>• Water: <strong>${water}</strong> m³</div>
        </td></tr>
        <tr><th>3. Furniture, Appliances & Condition</th><td>${inv}</td></tr>
        <tr><th>4. Remarks / Existing Defects</th><td>${rem}</td></tr>
      </table>
      <div class="ld-sign">
        ${sign('Handed over by (Landlord)', 'Landlord', d.landlord_name, d.landlord_id, d.landlord_phone)}
        ${sign('Accepted by (Tenant)', 'Tenant', d.tenant_name, d.tenant_id, d.tenant_phone)}
      </div>
    </div>`;

    const annexDual = `<div class="ld-annex-wrap">
      <div class="ld-annex-title">დანართი N1: საცხოვრებელი ბინის მიღება-ჩაბარების აქტი / Annex No. 1: Handover & Acceptance Act</div>
      <div class="ld-annex-sub">(${val(dmy(d.contract_date))} ქირავნობის ხელშეკრულების განუყოფელი ნაწილი / Integral part of the Lease Agreement)</div>
      <div class="ld-pair">
        <p>წინამდებარე აქტით გამქირავებელმა გადასცა, ხოლო დამქირავებელმა ჩაიბარა საცხოვრებელი ბინა მდებარე მისამართზე: <strong>${val(d.property_address)}</strong> შემდეგი პირობებით:</p>
        <p>By this Act, the Landlord has handed over and the Tenant has accepted the residential apartment located at: <strong>${val(d.property_address)}</strong> on the following terms:</p>
      </div>
      <table class="ld-table">
        <tr>
          <th>1. გასაღებები / Keys</th>
          <td>გადაცემულია გასაღებების <strong>${keys}</strong> კომპლექტი / Handed over <strong>${keys}</strong> set(s) of keys.</td>
        </tr>
        <tr>
          <th>2. მრიცხველების საწყისი ჩვენებები / Initial Meter Readings</th>
          <td>
            <div>• ელექტროენერგია / Electricity: <strong>${el}</strong> კვტ/სთ (kWh)</div>
            <div>• ბუნებრივი აირი / Natural Gas: <strong>${gas}</strong> მ³ (m³)</div>
            <div>• წყალი / Water: <strong>${water}</strong> მ³ (m³)</div>
          </td>
        </tr>
        <tr>
          <th>3. ავეჯი და ტექნიკა / Furniture & Inventory</th>
          <td>${inv}</td>
        </tr>
        <tr>
          <th>4. შენიშვნები / Remarks</th>
          <td>${rem}</td>
        </tr>
      </table>
      <div class="ld-sign">
        ${sign('ჩააბარა (გამქირავებელი)', 'Handed over by (Landlord)', d.landlord_name, d.landlord_id, d.landlord_phone)}
        ${sign('ჩაიბარა (დამქირავებელი)', 'Accepted by (Tenant)', d.tenant_name, d.tenant_id, d.tenant_phone)}
      </div>
    </div>`;

    return `<div class="lease-doc">
      ${showKa ? '<h2>საცხოვრებელი ბინის ქირავნობის ხელშეკრულება</h2><div class="ld-law-ref">(საქართველოს სამოქალაქო კოდექსის 531–575 მუხლების შესაბამისად)</div>' : ''}
      ${showEn ? `<${showKa ? 'p class="ld-sub"' : 'h2'}>Residential Lease Agreement</${showKa ? 'p' : 'h2'}><div class="ld-law-ref">(In accordance with Articles 531–575 of the Civil Code of Georgia)</div>` : ''}
      <div class="ld-place"><span>${showKa ? 'ქ.' : 'City:'} ${val(d.city)}</span><span>${val(dmy(d.contract_date))}</span></div>
      <div class="ld-parties">${block(partyKA, partyEN)}</div>
      ${arts.map((art, i) => {
        const n = i + 1;
        const clauses = art.c.concat(i === arts.length - 1 ? finalLang : []);
        return `<h3>${showKa ? `მუხლი ${n}. ${art.ka}` : ''}${dual ? ' / ' : ''}${showEn ? `Article ${n}. ${art.en}` : ''}</h3>
          ${clauses.map(([ka, en], j) => block(`${n}.${j + 1}. ${ka}`, `${n}.${j + 1}. ${en}`)).join('')}`;
      }).join('')}
      <div class="ld-sign">
        ${sign('გამქირავებელი', 'Landlord', d.landlord_name, d.landlord_id, d.landlord_phone)}
        ${sign('დამქირავებელი', 'Tenant', d.tenant_name, d.tenant_id, d.tenant_phone)}
      </div>
      ${mode === 'ka' ? annexKA : (mode === 'en' ? annexEN : annexDual)}
    </div>`;
  }
  App.leaseHtml = leaseHtml;
  // Shared with views-docs.js (presentation and sale contract templates).
  App.dealsUtil = { fmtMoney, convert, listingUrl, LEASE_CSS };
  App.amenityLabel = (k) => AMENITIES[k]?.[0] || k;
  App.openLeasePreview = (d, a) => openLeasePreview(d, a);

  function printLease(d, mode, title) {
    const w = window.open('', '_blank');
    if (!w) { toast('ბრაუზერმა ახალი ფანჯარა დაბლოკა. დაუშვი pop-up ამ საიტისთვის და სცადე ხელახლა.', { type: 'error' }); return; }
    const font = (wt, f) => `@font-face{font-family:'FiraGO';src:url('${location.origin}/fonts/${f}.woff2') format('woff2');font-weight:${wt};}`;
    w.document.write(`<!doctype html><html lang="${mode === 'en' ? 'en' : 'ka'}"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>${font(400, 'FiraGO-Regular')}${font(600, 'FiraGO-SemiBold')}${font(700, 'FiraGO-Bold')}
      @page { size: A4; margin: 15mm 14mm; } body { margin: 0; padding: 20px; background: #fff; } @media print { body { padding: 0; } }
      ${LEASE_CSS}</style></head><body>${leaseHtml(d, mode)}
      <script>document.fonts.ready.then(function(){ setTimeout(function(){ window.print(); }, 150); }); window.onafterprint = function(){ window.close(); };<\/script></body></html>`);
    w.document.close();
  }

  App.openLeaseAgreementGenerator = async (apartment, deal = null) => {
    if (!App.guardFeature('contracts')) return;
    let a = apartment || (deal?.apartment_id ? H.apt(deal.apartment_id) : null);
    let dl = deal;
    let last = null;
    try {
      let query = sb.from('contracts').select('*').eq('organization_id', S.org.id);
      if (dl?.id) query = query.eq('deal_id', dl.id);
      else if (a?.id) query = query.eq('apartment_id', a.id);
      else query = null;
      if (query) {
        const { data } = await query.order('created_at', { ascending: false }).limit(1);
        last = data?.[0]?.data || null;
      }
    } catch { last = null; }

    function getDefaults(apt, dealObj) {
      const ow = apt ? H.owner(apt.owner_id) : null;
      return {
        notice_days: '30',
        penalty_pct: '0.1',
        keys_count: '2',
        city: apt?.city || 'თბილისი',
        landlord_name: ow?.name || '', landlord_phone: ow?.phone || '', landlord_id: ow?.personal_id || '', landlord_address: '', landlord_bank: ow?.payout_account || '',
        tenant_name: dealObj?.client_name || '', tenant_phone: dealObj?.client_phone || '', tenant_id: '', tenant_address: '',
        property_address: apt ? [apt.city, apt.district, apt.address, apt.unit_number && `ბინა ${apt.unit_number}`].filter(Boolean).join(', ') : '',
        cadastral_code: apt?.cadastral_code || '', area_sqm: apt?.area_sqm || '', contract_date: R.isoDate(),
        start_date: dealObj?.target_move_in || '', end_date: '', rent: dealObj?.deal_amount || apt?.monthly_rent || '', currency: dealObj?.currency || apt?.currency || 'USD',
        pay_day: apt?.rent_due_day || '1', deposit: apt?.deposit_amount || '', pets: apt?.pets_allowed ? 'yes' : 'no', utilities: 'tenant', utilities_note: '', extra_terms: '',
        meter_electricity: '', meter_gas: '', meter_water: '', inventory_notes: '', acceptance_notes: '',
      };
    }

    // A previous contract of the same deal is this lease's draft: reuse all of it. One from the same
    // apartment belongs to an earlier tenant: keep landlord, property and terms, never their personal data or dates.
    const TENANT_KEYS = /^(tenant_|meter_)|^(contract_date|start_date|end_date|inventory_notes|acceptance_notes)$/;
    const reuse = last && !dl?.id ? Object.fromEntries(Object.entries(last).filter(([k]) => !TENANT_KEYS.test(k))) : (last || {});
    const d = {
      ...getDefaults(a, dl),
      ...reuse,
    };
    const f = (name, label, opts = {}) => `<label class="field ${opts.span ? 'span-2' : ''}"><span class="field-label">${label}</span>${opts.textarea
      ? `<textarea name="${name}" rows="${opts.rows || 2}" ${opts.required ? 'required' : ''} placeholder="${esc(opts.ph || '')}">${esc(d[name] || '')}</textarea>`
      : `<input name="${name}" type="${opts.type || 'text'}" ${opts.required ? `required data-error="${esc(opts.err || 'შეავსე სავალდებულო ველები.')}"` : ''} ${opts.attrs || ''} value="${esc(d[name] ?? '')}" placeholder="${esc(opts.ph || '')}" />`}${opts.hint ? `<span class="field-hint">${opts.hint}</span>` : ''}</label>`;

    const deals = (S.data.deals || []).filter(x => !['lost'].includes(x.stage) && x.deal_type !== 'sale');
    const apts = (S.data.apartments || []).filter(x => x.status !== 'archived' && x.transaction_type !== 'sale');

    return R.dialog({
      title: 'ქირავნობის ხელშეკრულება (სამოქალაქო კოდექსი)',
      subtitle: a?.name || dl?.client_name || 'ორენოვანი შაბლონი',
      wide: true,
      submitLabel: 'ხელშეკრულების შედგენა',
      body: `
        <div class="notice small">${icon('shield', 14)} ქირავნობის შაბლონი (სსკ 531–575). მოიცავს დეპოზიტს, პირგასამტეხლოს და მიღება-ჩაბარების აქტს მრიცხველებით. ხელმოწერამდე გადაამოწმე იურისტთან.</div>
        <div class="form-section"><div class="form-section-title">საიდან შევავსო</div><div class="form-grid">
          <label class="field"><span class="field-label">გარიგება</span><select id="lease-deal"><option value="">არ არის არჩეული</option>${deals.map(x => `<option value="${x.id}" ${x.id === dl?.id ? 'selected' : ''}>${esc(x.client_name)}${x.apartment_id ? ' · ' + esc(H.aptName(x.apartment_id)) : ''}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">ობიექტი</span><select id="lease-apt"><option value="">არ არის არჩეული</option>${apts.map(x => `<option value="${x.id}" ${x.id === a?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        </div></div>
        <div class="form-section"><div class="form-section-title">გამქირავებელი</div><div class="form-grid">
          ${f('landlord_name', 'სახელი, გვარი', { required: true, err: 'მიუთითე გამქირავებლის სახელი და გვარი.' })}${f('landlord_id', 'პირადი ნომერი', { attrs: 'inputmode="numeric" maxlength="20"' })}
          ${f('landlord_address', 'მისამართი')}${f('landlord_phone', 'ტელეფონი', { type: 'tel' })}
          ${f('landlord_bank', 'საბანკო ანგარიში (IBAN)', { span: true, hint: 'საქართველოს ბანკი, თიბისი და ა.შ.' })}
        </div></div>
        <div class="form-section"><div class="form-section-title">დამქირავებელი</div><div class="form-grid">
          ${f('tenant_name', 'სახელი, გვარი', { required: true, err: 'მიუთითე დამქირავებლის სახელი და გვარი.' })}${f('tenant_id', 'პირადი ნომერი / პასპორტი', { attrs: 'maxlength="20"' })}
          ${f('tenant_address', 'მისამართი')}${f('tenant_phone', 'ტელეფონი', { type: 'tel' })}
        </div></div>
        <div class="form-section"><div class="form-section-title">ბინა</div><div class="form-grid">
          ${f('property_address', 'ბინის მისამართი', { span: true, required: true, err: 'მიუთითე ბინის მისამართი.' })}
          ${f('cadastral_code', 'საკადასტრო კოდი', { ph: '00.00.00.000.000.00.000' })}${f('area_sqm', 'ფართობი (მ²)', { type: 'number', attrs: 'min="1" step="0.1"' })}
          ${f('city', 'ხელშეკრულების დადების ქალაქი')}${f('contract_date', 'ხელშეკრულების თარიღი', { type: 'date' })}
        </div></div>
        <div class="form-section"><div class="form-section-title">ვადა, ქირა და პირგასამტეხლო</div><div class="form-grid">
          ${f('start_date', 'დაწყების თარიღი', { type: 'date', required: true, err: 'მიუთითე ხელშეკრულების დაწყების თარიღი.' })}${f('end_date', 'დასრულების თარიღი', { type: 'date', required: true, err: 'მიუთითე ხელშეკრულების დასრულების თარიღი.' })}
          <label class="field"><span class="field-label">ყოველთვიური ქირა</span><div class="input-pair"><input name="rent" type="number" min="0" step="10" required data-error="მიუთითე ქირის ოდენობა." value="${esc(d.rent ?? '')}" />
            <select name="currency" aria-label="ვალუტა"><option value="USD" ${d.currency !== 'GEL' ? 'selected' : ''}>USD</option><option value="GEL" ${d.currency === 'GEL' ? 'selected' : ''}>GEL</option></select></div></label>
          ${f('pay_day', 'გადახდის ბოლო რიცხვი', { type: 'number', attrs: 'min="1" max="31"', hint: 'თვის რომელ რიცხვამდე (მაგ. 1 ან 5)' })}
          ${f('deposit', 'საგარანტიო დეპოზიტი', { type: 'number', attrs: 'min="0" step="10"', hint: 'ცარიელი ან 0: დეპოზიტის გარეშე' })}
          ${f('penalty_pct', 'პირგასამტეხლო დღეზე (%)', { type: 'number', attrs: 'min="0" step="0.01" max="5"', hint: 'ნაგულისხმევი: 0.1% დღეში (სსკ 417-420)' })}
          ${f('notice_days', 'შეწყვეტის შეტყობინება (დღე)', { type: 'number', attrs: 'min="0" max="365"', hint: 'ნაგულისხმევი: 30 დღე' })}
        </div></div>
        <div class="form-section"><div class="form-section-title">სარგებლობის პირობები</div><div class="form-grid">
          <label class="field"><span class="field-label">შინაური ცხოველი</span><select name="pets"><option value="no" ${d.pets !== 'yes' ? 'selected' : ''}>დაუშვებელია (თანხმობის გარეშე)</option><option value="yes" ${d.pets === 'yes' ? 'selected' : ''}>დასაშვებია</option></select></label>
          <label class="field"><span class="field-label">კომუნალური გადასახადები</span><select name="utilities" id="lease-util"><option value="tenant" ${d.utilities === 'tenant' ? 'selected' : ''}>იხდის დამქირავებელი</option><option value="landlord" ${d.utilities === 'landlord' ? 'selected' : ''}>შედის ქირაში (იხდის გამქირავებელი)</option><option value="custom" ${d.utilities === 'custom' ? 'selected' : ''}>სხვა პირობა</option></select></label>
          <div class="span-2" id="lease-util-note" ${d.utilities === 'custom' ? '' : 'hidden'}>${f('utilities_note', 'კომუნალურის პირობა', { textarea: true, ph: 'მაგ.: ელექტროენერგიას და გაზს იხდის დამქირავებელი, ინტერნეტს, გამქირავებელი' })}</div>
          ${f('extra_terms', 'დამატებითი პირობები', { textarea: true, span: true, rows: 2, hint: 'არასავალდებულო. ცალკე მუხლად დაემატება.' })}
        </div></div>
        <div class="form-section"><div class="form-section-title">დანართი N1: მიღება-ჩაბარების აქტი</div><div class="form-grid">
          ${f('keys_count', 'გასაღებების რაოდენობა (კომპლექტი)', { type: 'number', attrs: 'min="1" max="10"', hint: 'ნაგულისხმევი: 2' })}
          ${f('meter_electricity', 'ელექტროენერგიის მრიცხველი (საწყისი)', { ph: 'მაგ.: 12450 კვტ/სთ' })}
          ${f('meter_gas', 'ბუნებრივი აირის მრიცხველი (საწყისი)', { ph: 'მაგ.: 3120 მ³' })}
          ${f('meter_water', 'წყლის მრიცხველი (საწყისი)', { ph: 'მაგ.: 450 მ³' })}
          ${f('inventory_notes', 'ავეჯი, ტექნიკა და მდგომარეობა', { textarea: true, span: true, rows: 2, ph: 'ტელევიზორი, მაცივარი, სარეცხი მანქანა, კონდიციონერი... (დატოვე ცარიელი ზოგადი ტექსტისთვის)' })}
          ${f('acceptance_notes', 'შენიშვნები მიღებისას / ხარვეზები', { textarea: true, span: true, rows: 2, ph: 'არსებული ხარვეზები (თუ არის), ან დატოვე ცარიელი' })}
        </div></div>`,
      onOpen: (form) => {
        const refill = () => {
          dl = H.deal($('#lease-deal', form)?.value) || null;
          a = H.apt($('#lease-apt', form)?.value) || null;
          const next = getDefaults(a, dl);
          Object.entries(next).forEach(([k, v]) => {
            const el = form.elements[k];
            if (el && k !== 'extra_terms') el.value = v ?? '';
          });
        };
        $('#lease-deal', form)?.addEventListener('change', () => {
          const x = H.deal($('#lease-deal', form).value);
          if (x?.apartment_id && $('#lease-apt', form)) $('#lease-apt', form).value = x.apartment_id;
          refill();
        });
        $('#lease-apt', form)?.addEventListener('change', refill);

        const start = $('[name=start_date]', form), end = $('[name=end_date]', form);
        start?.addEventListener('change', () => {
          if (!start.value || end.value) return;
          const s = R.toDate(start.value); const e = new Date(s.getFullYear() + 1, s.getMonth(), s.getDate() - 1);
          end.value = R.isoDate(e);
        });
        const util = $('#lease-util', form);
        util?.addEventListener('change', () => { $('#lease-util-note', form).hidden = util.value !== 'custom'; });
      },
      onSubmit: async (_f, v) => {
        if (v.start_date && v.end_date && v.end_date <= v.start_date) throw new Error('დასრულების თარიღი დაწყების თარიღის შემდეგ უნდა იყოს.');
        const data = { ...v, rent: Number(v.rent), deposit: v.deposit === '' ? '' : Number(v.deposit) };
        const row = await App.insertOnce('contracts', { id: R.uuid(), organization_id: S.org.id, apartment_id: a?.id || null, deal_id: dl?.id || null, data, created_by: S.user.id });
        App.invalidateDocs?.();
        try { localStorage.setItem('rigzea_lease_done', '1'); } catch { /* private mode */ }
        toast('ხელშეკრულება შენახულია', { type: 'success' });
        setTimeout(() => openLeasePreview(row.data || data, a), 0);
      },
    });
  };

  function openLeasePreview(d, a) {
    let mode = (window.RLang && window.RLang.lang === 'en') ? 'en' : 'dual';
    const titleName = a?.name || d.property_address || 'ბინა';
    return R.dialog({
      title: 'ხელშეკრულება მზადაა',
      subtitle: titleName,
      wide: true,
      body: `
        <style>${LEASE_CSS}</style>
        <div class="lease-toolbar">
          <div class="seg" role="radiogroup" aria-label="ენა">
            ${[['dual', 'ორენოვანი'], ['ka', 'ქართული'], ['en', 'English']].map(([k, l]) => `<label><input type="radio" name="lease-mode" value="${k}" ${k === mode ? 'checked' : ''} /><span>${l}</span></label>`).join('')}
          </div>
          <button type="button" class="btn btn-primary" id="btn-print-lease">${icon('printer', 16)} ბეჭდვა / PDF</button>
        </div>
        <p class="small muted lease-hint">${icon('alert', 13)} შაბლონი არ ცვლის იურიდიულ კონსულტაციას. ხელმოწერამდე ტექსტი იურისტს აჩვენე.</p>
        <div class="lease-paper" id="lease-paper">${leaseHtml(d, mode)}</div>`,
      onOpen: (form) => {
        $$('input[name="lease-mode"]', form).forEach(i => i.addEventListener('change', () => { mode = i.value; $('#lease-paper', form).innerHTML = leaseHtml(d, mode); }));
        $('#btn-print-lease', form).onclick = () => printLease(d, mode, `ხელშეკრულება · ${titleName}`);
      },
    });
  }

  // Link copy helper used by the apartment views
  App.copyRenterLink = (aptId, isWhiteLabel = false) => {
    const a = H.apt(aptId) || { id: aptId };
    copyText(listingUrl(a, isWhiteLabel), isWhiteLabel ? 'White-label ბმული დაკოპირდა' : 'ბინის ბმული დაკოპირდა');
  };
})();
