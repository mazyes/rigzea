(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STORAGE_KEY = 'rigzea_app_state_v2';
  const defaultState = {
    activeView: 'dashboard',
    phase: 'awaiting', // 'awaiting' | 'approved' | 'completed' | 'rejected'
    selectedApartment: 'orbi',
    reportApartment: 'orbi',
    aptTab: 'timeline',
    extraTasks: []
  };

  let state;
  try {
    state = { ...defaultState, ...JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    state = { ...defaultState };
  }

  const saveState = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  };

  let toastTimer;
  const showToast = text => {
    const el = $('#app-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  };

  const escapeHtml = str => String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  // Realistic sample data
  const apartmentsData = [
    {
      id: 'orbi',
      name: 'Orbi City · 1204',
      city: 'ბათუმი',
      owner: 'ნინო ქ.',
      phone: '+995 599 12 34 56',
      cleanSchedule: 'ხვალ, 12:00',
      income: 1840,
      baseExpense: 320,
      search: 'orbi city 1204 ნინო ბათუმი'
    },
    {
      id: 'vake',
      name: 'Vake Residence · 18',
      city: 'თბილისი',
      owner: 'ლევან დ.',
      phone: '+995 595 22 33 44',
      cleanSchedule: 'ზეგ, 11:00',
      income: 2400,
      baseExpense: 180,
      search: 'vake residence 18 ლევან თბილისი'
    },
    {
      id: 'batumi',
      name: 'Old Batumi · 7',
      city: 'ბათუმი',
      owner: 'თამარ მ.',
      phone: '+995 577 88 99 00',
      cleanSchedule: 'დღეს, 18:00 (Check-in)',
      income: 1650,
      baseExpense: 140,
      search: 'old batumi 7 თამარ ბათუმი'
    }
  ];

  // Helper for status wording
  const getPhaseStatusText = () => {
    switch (state.phase) {
      case 'awaiting': return 'ელოდება პასუხს';
      case 'approved': return 'დადასტურებულია';
      case 'completed': return 'დასრულებულია';
      case 'rejected': return 'უარყოფილია';
      default: return 'რიგზეა';
    }
  };

  const getPhaseBadgeClass = () => {
    switch (state.phase) {
      case 'awaiting': return 'wait';
      case 'approved': return 'wait';
      case 'completed': return 'done';
      case 'rejected': return 'neutral';
      default: return 'done';
    }
  };

  // Switch Screen Views
  const switchScreenView = viewName => {
    const validViews = ['dashboard', 'apartments', 'tasks', 'owners', 'reports'];
    if (!validViews.includes(viewName)) return;

    state.activeView = viewName;
    saveState();

    // Hide all view sections, show target
    $$('.app-screen-view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    // Update sidebar buttons
    $$('.app-nav-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update mobile bottom nav buttons
    $$('.mobile-bottom-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Build Orbi City Signature Operational Timeline
  const getOrbiTimelineEvents = () => {
    const events = [];

    // Chronological order from latest to earliest (signature sequence)
    if (state.phase === 'completed') {
      events.push(
        { time: '15:23', title: 'ქვითარი დაემატა', desc: 'ქვითარი #INV-841 (₾170) მიბმულია ხარჯთან', accent: true, tag: '📄 ქვითარი მიმაგრებულია' },
        { time: '15:20', title: 'რემონტი დასრულდა', desc: 'კონდიციონერის შეკეთება — ხელოსანი დათო', accent: true }
      );
    }

    if (state.phase === 'approved' || state.phase === 'completed') {
      events.push(
        { time: '11:42', title: 'ნინო ქ.-მ ₾170 დაადასტურა', desc: 'მფლობელმა თანხმობა გასცა დაცული ბმულით', accent: false }
      );
    } else if (state.phase === 'rejected') {
      events.push(
        { time: '11:42', title: 'ნინო ქ.-მ უარი თქვა ₾170-ზე', desc: 'მფლობელი ითხოვს ალტერნატიულ შეფასებას', accent: false, amber: true }
      );
    }

    // Base timeline
    events.push(
      { time: '11:08', title: 'რემონტის მოთხოვნა გაეგზავნა მფლობელს', desc: 'შეტყობინება დადასტურების ბმულით გაიგზავნა', amber: state.phase === 'awaiting' },
      { time: '11:05', title: 'ხელოსნის შეფასება — ₾170', desc: 'საჭიროა დეტალის შეცვლა' },
      { time: '10:42', title: 'კონდიციონერი აღარ აგრილებს', desc: 'საკითხი ბინას დაემატა Telegram-ის შეტყობინებიდან' }
    );

    // Any dynamically added tasks
    state.extraTasks.filter(t => t.aptId === 'orbi').forEach((t, idx) => {
      events.unshift({
        time: `16:${String(10 + idx * 5).padStart(2, '0')}`,
        title: t.title,
        desc: `შეფასება: ₾${t.amount || 0} · დამატებული საქმე`,
        accent: true
      });
    });

    return events;
  };

  // Render Dashboard
  const renderDashboard = () => {
    // 1. Attention Box for Orbi City
    const orbiUrgent = $('#dash-orbi-urgent');
    const orbiStateText = $('#dash-orbi-state-text');
    const btnApproval = $('#btn-dash-open-approval');
    const countBadge = $('#dash-action-count');

    if (state.phase === 'awaiting') {
      orbiUrgent.style.display = 'flex';
      orbiStateText.textContent = '₾170 რემონტი ელოდება მფლობელის თანხმობას';
      btnApproval.textContent = 'თანხმობა ↗';
      btnApproval.className = 'btn smallbtn';
      countBadge.textContent = '2 საკითხი';
    } else if (state.phase === 'approved') {
      orbiUrgent.style.display = 'flex';
      orbiStateText.textContent = '₾170 დადასტურებულია · რემონტი შესასრულებელია';
      btnApproval.textContent = 'დასრულება ✓';
      btnApproval.className = 'btn smallbtn';
      countBadge.textContent = '1 საკითხი';
    } else if (state.phase === 'completed') {
      orbiUrgent.style.display = 'none';
      countBadge.textContent = '1 საკითხი';
    } else if (state.phase === 'rejected') {
      orbiUrgent.style.display = 'flex';
      orbiStateText.textContent = 'მფლობელმა უარი თქვა · საკითხი განხილვაშია';
      btnApproval.textContent = 'დეტალები ↗';
      btnApproval.className = 'btn secondary smallbtn';
      countBadge.textContent = '2 საკითხი';
    }

    // 2. Recent activity list
    const recentActivityMount = $('#dash-recent-activity');
    if (recentActivityMount) {
      const events = getOrbiTimelineEvents().slice(0, 4);
      recentActivityMount.innerHTML = events.map(e => `
        <div class="timeline-event-row ${e.accent ? 'accent' : ''} ${e.amber ? 'amber' : ''}">
          <time class="num-tabular">${escapeHtml(e.time)}</time>
          <div class="timeline-rail"></div>
          <div class="timeline-details">
            <strong>${escapeHtml(e.title)}</strong>
            <p>${escapeHtml(e.desc)}</p>
            ${e.tag ? `<span class="receipt-tag js-open-receipt" style="cursor:pointer">${escapeHtml(e.tag)}</span>` : ''}
          </div>
        </div>
      `).join('');
    }

    // 3. Mini KPI update
    const expenseEl = $('#dash-kpi-expense');
    const netEl = $('#dash-kpi-net');
    if (expenseEl && netEl) {
      const isCompleted = state.phase === 'completed';
      expenseEl.textContent = isCompleted ? '₾490' : '₾320';
      netEl.textContent = isCompleted ? '₾1,350' : '₾1,520';
    }
  };

  // Render Apartments Screen
  const renderApartmentsScreen = () => {
    const searchVal = ($('#apt-search-input')?.value || '').trim().toLowerCase();
    const listMount = $('#apartments-list-mount');
    if (!listMount) return;

    const filtered = apartmentsData.filter(a => a.search.includes(searchVal));

    listMount.innerHTML = filtered.map(apt => {
      const isSelected = apt.id === state.selectedApartment;
      const isOrbi = apt.id === 'orbi';
      const statusText = isOrbi ? getPhaseStatusText() : 'რიგზეა';
      const statusClass = isOrbi ? getPhaseBadgeClass() : 'done';

      return `
        <div class="apartment-row-item ${isSelected ? 'active' : ''}" data-apt-select="${apt.id}">
          <div class="apt-row-top">
            <strong>${escapeHtml(apt.name)}</strong>
            <span class="status-pill ${statusClass}" style="font-size:10px">${escapeHtml(statusText)}</span>
          </div>
          <div class="apt-row-meta">
            <span>${escapeHtml(apt.city)} · ${escapeHtml(apt.owner)}</span>
            <span class="num-tabular">${isOrbi && state.phase === 'awaiting' ? '₾170 დასადასტურებელი' : ''}</span>
          </div>
        </div>
      `;
    }).join('');

    // Update active apartment details
    const currentApt = apartmentsData.find(a => a.id === state.selectedApartment) || apartmentsData[0];
    const isOrbi = currentApt.id === 'orbi';

    $('#current-apt-title').textContent = currentApt.name;
    $('#current-apt-sub').textContent = `${currentApt.city} · მფლობელი: ${currentApt.owner} (${currentApt.phone})`;
    $('#apt-badge-name').textContent = currentApt.name;

    const pill = $('#current-apt-status-pill');
    pill.textContent = isOrbi ? getPhaseStatusText() : 'რიგზეა';
    pill.className = `status-pill ${isOrbi ? getPhaseBadgeClass() : 'done'}`;

    $('#current-apt-open-tasks').textContent = isOrbi
      ? (state.phase === 'completed' ? '0 აქტიური' : '1 აქტიური')
      : (currentApt.id === 'vake' ? '1 აქტიური' : '0 აქტიური');

    $('#current-apt-pending-cost').textContent = isOrbi && state.phase === 'awaiting' ? '₾170' : '—';
    $('#current-apt-next-clean').textContent = currentApt.cleanSchedule;

    // Tabs update
    $$('.apt-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aptTab === state.aptTab);
    });

    const contentMount = $('#apt-tab-content');
    if (!contentMount) return;

    if (state.aptTab === 'timeline') {
      const events = isOrbi ? getOrbiTimelineEvents() : (
        currentApt.id === 'vake'
          ? [
              { time: '11:00', title: 'სანტექნიკოსის ვიზიტი დაიგეგმა', desc: 'ხელოსანი გიორგი — დაგვიანებულია', amber: true },
              { time: '09:15', title: 'წყლის წნევის საკითხი დაფიქსირდა', desc: 'სტუმარმა დაწერა შეტყობინება' }
            ]
          : [
              { time: '18:00', title: 'Check-in დაგეგმილია', desc: '2 სტუმარი — ბინა მზადაა', accent: true },
              { time: '13:30', title: 'დასუფთავება დასრულდა', desc: 'დამლაგებლის შემოწმება გავლილია' }
            ]
      );

      contentMount.innerHTML = `
        <div class="ledger-timeline" style="padding:4px 0">
          <div class="timeline-date-label">ოპერაციული ისტორია</div>
          <div class="timeline-events-list">
            ${events.map(e => `
              <div class="timeline-event-row ${e.accent ? 'accent' : ''} ${e.amber ? 'amber' : ''}">
                <time class="num-tabular">${escapeHtml(e.time)}</time>
                <div class="timeline-rail"></div>
                <div class="timeline-details">
                  <strong>${escapeHtml(e.title)}</strong>
                  <p>${escapeHtml(e.desc)}</p>
                  ${e.tag ? `<span class="receipt-tag js-open-receipt" style="cursor:pointer">${escapeHtml(e.tag)}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (state.aptTab === 'tasks') {
      contentMount.innerHTML = isOrbi ? `
        <div class="data-table-wrapper">
          <table class="operational-table">
            <thead>
              <tr><th>საქმე</th><th>ხარჯი</th><th>სტატუსი</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>კონდიციონერის შეკეთება</strong><div style="font-size:10px;color:var(--muted)">დეტალის შეცვლა</div></td>
                <td class="num-tabular">₾170</td>
                <td><span class="status-pill ${getPhaseBadgeClass()}">${escapeHtml(getPhaseStatusText())}</span></td>
              </tr>
              <tr>
                <td><strong>დასუფთავება</strong><div style="font-size:10px;color:var(--muted)">დამლაგებელი: მარიამი</div></td>
                <td class="num-tabular">₾80</td>
                <td><span class="status-pill neutral">დაგეგმილი (14:00)</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : `
        <div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">
          აქტიური საქმეები მიმდინარე გრაფიკშია.
        </div>
      `;
    } else {
      // Expenses tab
      contentMount.innerHTML = isOrbi ? `
        <div class="data-table-wrapper">
          <table class="operational-table">
            <thead>
              <tr><th>თარიღი</th><th>საქმე</th><th>ქვითარი</th><th>თანხა</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>12 სექ</td>
                <td>დასუფთავება</td>
                <td><span class="receipt-tag js-open-receipt" style="cursor:pointer">📄 ქვითარი მიბმულია</span></td>
                <td class="num-tabular"><strong>₾80</strong></td>
              </tr>
              <tr>
                <td>19 სექ</td>
                <td>კონდიციონერის შეკეთება</td>
                <td>${state.phase === 'completed' ? '<span class="receipt-tag js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-841</span>' : '<span style="color:var(--muted)">ელოდება დასრულებას</span>'}</td>
                <td class="num-tabular"><strong>₾170</strong></td>
              </tr>
              <tr>
                <td>24 სექ</td>
                <td>საყოფაცხოვრებო სახარჯი მასალები</td>
                <td><span class="receipt-tag js-open-receipt" style="cursor:pointer">📄 ქვითარი მიბმულია</span></td>
                <td class="num-tabular"><strong>₾70</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      ` : `
        <div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">
          ამ ბინაზე ახალი ხარჯები არ არის დაფიქსირებული.
        </div>
      `;
    }
  };

  // Render Tasks Screen
  const renderTasksScreen = () => {
    const tbody = $('#tasks-table-tbody');
    if (!tbody) return;

    const baseRows = [
      {
        id: 'orbi-repair',
        title: 'კონდიციონერის შეკეთება',
        apt: 'Orbi City · 1204',
        amount: '₾170',
        status: getPhaseStatusText(),
        statusClass: getPhaseBadgeClass(),
        canAct: state.phase === 'awaiting' || state.phase === 'approved'
      },
      {
        id: 'orbi-clean',
        title: 'დასუფთავება',
        apt: 'Orbi City · 1204',
        amount: '₾80',
        status: 'დაგეგმილი',
        statusClass: 'neutral',
        canAct: false
      },
      {
        id: 'vake-plumb',
        title: 'სანტექნიკოსი',
        apt: 'Vake Residence · 18',
        amount: '—',
        status: 'დაგვიანებული',
        statusClass: 'wait',
        canAct: false
      },
      {
        id: 'batumi-checkin',
        title: 'Check-in (2 სტუმარი)',
        apt: 'Old Batumi · 7',
        amount: '—',
        status: 'მზადაა',
        statusClass: 'done',
        canAct: false
      }
    ];

    state.extraTasks.forEach(t => {
      const aptObj = apartmentsData.find(a => a.id === t.aptId);
      baseRows.push({
        id: t.id,
        title: t.title,
        apt: aptObj ? aptObj.name : 'Orbi City · 1204',
        amount: t.amount ? `₾${t.amount}` : '—',
        status: 'ახალი საქმე',
        statusClass: 'neutral',
        canAct: false
      });
    });

    $('#task-total-badge').textContent = `${baseRows.length} საქმე რეესტრში`;

    tbody.innerHTML = baseRows.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.title)}</strong></td>
        <td>${escapeHtml(row.apt)}</td>
        <td class="num-tabular">${escapeHtml(row.amount)}</td>
        <td><span class="status-pill ${row.statusClass}">${escapeHtml(row.status)}</span></td>
        <td>
          ${row.id === 'orbi-repair' && state.phase === 'awaiting'
            ? `<button class="btn smallbtn" id="btn-task-approve-action" style="padding:4px 8px;font-size:11px">თანხმობა ↗</button>`
            : row.id === 'orbi-repair' && state.phase === 'approved'
              ? `<button class="btn smallbtn" id="btn-task-complete-action" style="padding:4px 8px;font-size:11px">დასრულება ✓</button>`
              : `<span style="font-size:11px;color:var(--muted)">—</span>`}
        </td>
      </tr>
    `).join('');
  };

  // Render Owners Screen
  const renderOwnersScreen = () => {
    const ninoPill = $('#nino-status-pill');
    if (ninoPill) {
      ninoPill.textContent = state.phase === 'awaiting' ? '1 ელოდება' : 'რიგზეა';
      ninoPill.className = `status-pill ${state.phase === 'awaiting' ? 'wait' : 'done'}`;
    }

    const feedback = $('#owner-sim-feedback');
    const simActions = $('#owner-sim-actions');

    if (state.phase === 'approved') {
      simActions.style.display = 'none';
      feedback.style.display = 'block';
      feedback.style.background = 'var(--green-light)';
      feedback.style.color = 'var(--green)';
      feedback.textContent = '✓ ნინო ქ.-მ თანხმობა გასცა. რემონტი დაწყებულია.';
    } else if (state.phase === 'completed') {
      simActions.style.display = 'none';
      feedback.style.display = 'block';
      feedback.style.background = 'var(--green-light)';
      feedback.style.color = 'var(--green)';
      feedback.textContent = '✓ რემონტი დასრულებულია და ანგარიშში აისახა.';
    } else if (state.phase === 'rejected') {
      simActions.style.display = 'none';
      feedback.style.display = 'block';
      feedback.style.background = 'var(--red-light)';
      feedback.style.color = 'var(--red)';
      feedback.textContent = '✕ ნინო ქ.-მ უარი თქვა. საქმე განხილვაშია.';
    } else {
      simActions.style.display = 'flex';
      feedback.style.display = 'none';
    }
  };

  // Render Reports Screen
  const renderReportsScreen = () => {
    const aptKey = state.reportApartment || 'orbi';
    const currentApt = apartmentsData.find(a => a.id === aptKey) || apartmentsData[0];
    const isOrbi = currentApt.id === 'orbi';
    const isCompleted = state.phase === 'completed';

    const incomeVal = currentApt.income;
    const expenseVal = isOrbi ? (isCompleted ? 490 : 320) : currentApt.baseExpense;
    const netVal = incomeVal - expenseVal;

    $('#report-doc-title').textContent = `სექტემბრის ანგარიში · ${currentApt.name}`;
    $('#report-doc-sub').textContent = `მფლობელი: ${currentApt.owner} · გენერირებულია: რიგზეა`;

    $('#report-val-income').textContent = `₾${incomeVal.toLocaleString()}`;
    $('#report-val-expense').textContent = `₾${expenseVal.toLocaleString()}`;
    $('#report-val-net').textContent = `₾${netVal.toLocaleString()}`;

    const entriesMount = $('#report-entries-mount');
    if (!entriesMount) return;

    if (isOrbi) {
      entriesMount.innerHTML = `
        <div class="expense-entry-row">
          <time>12 სექ</time>
          <div class="exp-desc">
            <strong>დასუფთავება</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-812 · დამლაგებელი: მარიამი</span>
          </div>
          <div class="exp-amount num-tabular">₾80</div>
        </div>

        <div class="expense-entry-row">
          <time>19 სექ</time>
          <div class="exp-desc">
            <strong>კონდიციონერის შეკეთება</strong>
            <span class="js-open-receipt" style="cursor:pointer">${isCompleted ? 'მფლობელის მიერ დადასტურებული · 📄 ქვითარი #INV-841' : 'თანხმობა მიღებულია · ელოდება დასრულებას'}</span>
          </div>
          <div class="exp-amount num-tabular" style="${!isCompleted ? 'color:var(--muted)' : ''}">₾170</div>
        </div>

        <div class="expense-entry-row">
          <time>24 სექ</time>
          <div class="exp-desc">
            <strong>საყოფაცხოვრებო სახარჯი მასალები</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-833 · თეთრეული და ჰიგიენური საშუალებები</span>
          </div>
          <div class="exp-amount num-tabular">₾70</div>
        </div>
      `;
    } else if (currentApt.id === 'vake') {
      entriesMount.innerHTML = `
        <div class="expense-entry-row">
          <time>08 სექ</time>
          <div class="exp-desc">
            <strong>გენერალური დასუფთავება</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-790</span>
          </div>
          <div class="exp-amount num-tabular">₾100</div>
        </div>
        <div class="expense-entry-row">
          <time>16 სექ</time>
          <div class="exp-desc">
            <strong>ჭკვიანი საკეტის ბატარეები</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-802</span>
          </div>
          <div class="exp-amount num-tabular">₾80</div>
        </div>
      `;
    } else {
      entriesMount.innerHTML = `
        <div class="expense-entry-row">
          <time>10 სექ</time>
          <div class="exp-desc">
            <strong>დასუფთავება და რეცხვა</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-795</span>
          </div>
          <div class="exp-amount num-tabular">₾90</div>
        </div>
        <div class="expense-entry-row">
          <time>22 სექ</time>
          <div class="exp-desc">
            <strong>ჰიგიენური მასალების შევსება</strong>
            <span class="js-open-receipt" style="cursor:pointer">📄 ქვითარი #INV-821</span>
          </div>
          <div class="exp-amount num-tabular">₾50</div>
        </div>
      `;
    }
  };

  // Master Render
  const renderAll = () => {
    renderDashboard();
    renderApartmentsScreen();
    renderTasksScreen();
    renderOwnersScreen();
    renderReportsScreen();
    saveState();
  };

  // Modals Handling
  const modal = $('#approval-modal');
  const receiptModal = $('#receipt-modal');
  const quickTaskModal = $('#quick-task-modal');

  const openModal = () => {
    if (!modal) return;
    $('#modal-pill-status').textContent = getPhaseStatusText();
    $('#modal-pill-status').className = `status-pill ${getPhaseBadgeClass()}`;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  };
  const closeModal = () => {
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
  };

  const openReceiptModal = () => {
    if (!receiptModal) return;
    receiptModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  };
  const closeReceiptModal = () => {
    if (!receiptModal) return;
    receiptModal.classList.remove('show');
    document.body.style.overflow = '';
  };

  const openQuickTaskModal = () => {
    if (!quickTaskModal) return;
    $('#modal-quick-title').value = '';
    $('#modal-quick-amount').value = '';
    quickTaskModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#modal-quick-title')?.focus(), 50);
  };
  const closeQuickTaskModal = () => {
    if (!quickTaskModal) return;
    quickTaskModal.classList.remove('show');
    document.body.style.overflow = '';
  };

  // Action: Approve
  const handleApprove = () => {
    state.phase = 'approved';
    closeModal();
    renderAll();
    showToast('ნინო ქ.-მ დაადასტურა ₾170. საქმე გადავიდა შესრულებაში.');
  };

  // Action: Reject
  const handleReject = () => {
    state.phase = 'rejected';
    closeModal();
    renderAll();
    showToast('მფლობელმა უარი თქვა. სტატუსი განახლდა.');
  };

  // Action: Complete Repair
  const handleCompleteRepair = () => {
    state.phase = 'completed';
    renderAll();
    showToast('რემონტი დასრულდა. ქვითარი დაემატა და ანგარიში განახლდა.');
  };

  // Event Listeners Setup
  // 1. Navigation buttons (Desktop sidebar & Mobile bottom bar)
  $$('.app-nav-button').forEach(btn => {
    btn.addEventListener('click', () => switchScreenView(btn.dataset.view));
  });
  $$('.mobile-bottom-btn').forEach(btn => {
    btn.addEventListener('click', () => switchScreenView(btn.dataset.view));
  });
  $$('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchScreenView(btn.dataset.nav);
      if (btn.dataset.apt) {
        state.selectedApartment = btn.dataset.apt;
        renderAll();
      }
    });
  });

  // 2. Dashboard action buttons
  $('#btn-dash-open-approval')?.addEventListener('click', () => {
    if (state.phase === 'awaiting') {
      openModal();
    } else if (state.phase === 'approved') {
      handleCompleteRepair();
    } else {
      switchScreenView('reports');
    }
  });

  // 3. Apartment search & selector
  $('#apt-search-input')?.addEventListener('input', () => {
    renderApartmentsScreen();
  });

  $('#apartments-list-mount')?.addEventListener('click', e => {
    const row = e.target.closest('[data-apt-select]');
    if (row) {
      state.selectedApartment = row.dataset.aptSelect;
      renderAll();
    }
  });

  // 4. Apartment Detail Tabs
  $$('.apt-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.aptTab = btn.dataset.aptTab;
      renderApartmentsScreen();
      saveState();
    });
  });

  // 5. Telegram Input Box Parsing
  $('#btn-parse-telegram')?.addEventListener('click', () => {
    const input = ($('#telegram-input-box')?.value || '').trim();
    const notice = $('#parse-result-notice');
    if (!notice) return;

    if (!input) {
      notice.style.display = 'block';
      notice.style.background = 'var(--red-light)';
      notice.style.color = 'var(--red)';
      notice.textContent = 'გთხოვთ შეიყვანოთ შეტყობინების ტექსტი.';
      return;
    }

    const aptMatch = input.match(/(?:1204|\b18\b|\b7\b)/);
    const moneyMatch = input.match(/(?:₾\s*)?(\d{2,5})\s*(?:ლარი|ლარს|₾)?/g);

    if (!aptMatch) {
      notice.style.display = 'block';
      notice.style.background = 'var(--amber-light)';
      notice.style.color = 'var(--amber)';
      notice.textContent = 'ბინის ნომერი ვერ ამოვიცანით. სცადეთ 1204, 18 ან 7.';
      return;
    }

    const aptNum = aptMatch[0];
    const aptId = aptNum === '1204' ? 'orbi' : (aptNum === '18' ? 'vake' : 'batumi');
    const aptObj = apartmentsData.find(a => a.id === aptId);

    let detectedAmount = 0;
    if (moneyMatch) {
      const nums = moneyMatch.map(p => Number(p.match(/\d+/)?.[0])).filter(n => n >= 20 && n !== Number(aptNum));
      if (nums.length) detectedAmount = nums[nums.length - 1];
    }

    let detectedTitle = 'ახალი საკითხი';
    if (/კონდიციონერ/i.test(input)) detectedTitle = 'კონდიციონერის შეკეთება';
    else if (/დასუფთავ/i.test(input)) detectedTitle = 'დასუფთავება';
    else if (/სანტექნიკ|წყალ/i.test(input)) detectedTitle = 'სანტექნიკოსი';
    else if (/გასაღებ|მიღებ|check/i.test(input)) detectedTitle = 'სტუმრის მიღება';

    const newTask = {
      id: `task_${Date.now()}`,
      title: detectedTitle,
      aptId,
      amount: detectedAmount
    };

    state.extraTasks.push(newTask);
    renderAll();

    notice.style.display = 'block';
    notice.style.background = 'var(--green-light)';
    notice.style.color = 'var(--green)';
    notice.textContent = `✓ საქმე შეიქმნა: ${aptObj.name} · ${detectedTitle} ${detectedAmount ? `(₾${detectedAmount})` : ''}`;
    showToast('შეტყობინება გადაკეთდა საქმედ და დაემატა რეესტრს.');
  });

  // 6. Tasks actions
  $('#tasks-table-tbody')?.addEventListener('click', e => {
    if (e.target.id === 'btn-task-approve-action') openModal();
    if (e.target.id === 'btn-task-complete-action') handleCompleteRepair();
  });

  // 7. Owner Simulator buttons
  $('#btn-open-owner-preview')?.addEventListener('click', openModal);
  $('#btn-owner-sim-approve')?.addEventListener('click', handleApprove);
  $('#btn-owner-sim-reject')?.addEventListener('click', handleReject);
  $('#owner-row-nino')?.addEventListener('click', openModal);

  // 8. Approval Modal Buttons
  $('#btn-modal-close')?.addEventListener('click', closeModal);
  $('#btn-modal-approve')?.addEventListener('click', handleApprove);
  $('#btn-modal-reject')?.addEventListener('click', handleReject);
  modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

  // 9. Receipt Modal Buttons
  document.addEventListener('click', e => {
    if (e.target.closest('.js-open-receipt')) {
      openReceiptModal();
    }
  });
  $('#btn-receipt-modal-close')?.addEventListener('click', closeReceiptModal);
  $('#btn-receipt-modal-dismiss')?.addEventListener('click', closeReceiptModal);
  receiptModal?.addEventListener('click', e => { if (e.target === receiptModal) closeReceiptModal(); });

  // 10. Quick Task Modal Buttons
  $('#btn-quick-new-task')?.addEventListener('click', openQuickTaskModal);
  $('#btn-quick-task-close')?.addEventListener('click', closeQuickTaskModal);
  $('#btn-quick-task-cancel')?.addEventListener('click', closeQuickTaskModal);
  quickTaskModal?.addEventListener('click', e => { if (e.target === quickTaskModal) closeQuickTaskModal(); });

  $('#btn-quick-task-submit')?.addEventListener('click', () => {
    const title = ($('#modal-quick-title')?.value || '').trim();
    const aptId = $('#modal-quick-apt')?.value || 'orbi';
    const amount = Number($('#modal-quick-amount')?.value) || 0;

    if (!title) {
      showToast('გთხოვთ შეიყვანოთ საქმის დასახელება.');
      return;
    }

    state.extraTasks.push({
      id: `task_${Date.now()}`,
      title,
      aptId,
      amount
    });

    closeQuickTaskModal();
    renderAll();
    showToast('ახალი საქმე წარმატებით დაემატა.');
  });

  // 11. Reports Apartment Filter
  $('#report-apt-select')?.addEventListener('change', e => {
    state.reportApartment = e.target.value;
    renderReportsScreen();
    saveState();
  });

  // 12. Global Esc key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeReceiptModal();
      closeQuickTaskModal();
    }
  });

  $('#btn-reset-demo')?.addEventListener('click', () => {
    state = { ...defaultState, extraTasks: [] };
    sessionStorage.removeItem(STORAGE_KEY);
    renderAll();
    switchScreenView('dashboard');
    showToast('დემო განულდა საწყის მდგომარეობაზე.');
  });

  $('#btn-print-report')?.addEventListener('click', () => window.print());

  // URL query params initialization (e.g. ?view=apartments or ?plan=starter)
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get('view');
  if (viewParam && ['dashboard', 'apartments', 'tasks', 'owners', 'reports'].includes(viewParam)) {
    state.activeView = viewParam;
  }
  const planParam = urlParams.get('plan');
  if (planParam) {
    const planNames = { starter: 'მცირე · 10 ბინა', growth: 'გუნდი · 40 ბინა', enterprise: 'დიდი პორტფელი · 40+ ბინა' };
    if (planNames[planParam]) {
      $('#portfolio-label-text').textContent = planNames[planParam];
    }
  }

  // Initial render
  switchScreenView(state.activeView);
  renderAll();
})();
