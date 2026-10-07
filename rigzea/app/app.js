// რიგზეა (Rigzea) Production SaaS Application Controller
(() => {
  'use strict';

  // Active UI state
  let currentView = 'dashboard';
  let selectedAptId = null;
  let selectedOwnerId = null;
  let selectedConditionId = null;
  let aptSubTab = 'overview';
  let settingsSubTab = 'company';
  let parsedTelegramTask = null;

  // DOM Cache helper
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Toast Notification Helper
  function showToast(message, type = 'normal') {
    const toast = $('app-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.background = type === 'error' ? 'var(--red)' : (type === 'success' ? 'var(--green)' : 'var(--navy)');
    toast.classList.add('visible');
    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3200);
  }

  // Safe Escaper
  function escapeHtml(str) {
    return window.RigzeaUtils.escapeHtml(str);
  }

  // =========================================================================
  // 1. AUTHENTICATION & ONBOARDING CONTROLLER
  // =========================================================================

  async function initApp() {
    try {
      // 1. Check user session
      const user = await window.RigzeaStore.initAuth();
      if (!user) {
        showAuthScreen();
        return;
      }

      // 2. Load user's organizations
      const orgs = await window.RigzeaStore.loadOrganizations();
      if (!orgs || orgs.length === 0) {
        showOnboardingScreen();
        return;
      }

      // 3. User is authenticated and has an active organization
      showAppShell();
      await loadAndRenderAll();
    } catch (err) {
      console.error('App init error:', err);
      showToast('სისტემაში ჩატვირთვის შეცდომა', 'error');
    }
  }

  function showAuthScreen() {
    $('auth-screen').style.display = 'flex';
    $('onboarding-screen').style.display = 'none';
    $('app-shell').style.display = 'none';
    showAuthSubView('signin');
  }

  function showOnboardingScreen() {
    $('auth-screen').style.display = 'none';
    $('onboarding-screen').style.display = 'flex';
    $('app-shell').style.display = 'none';
    $('onboarding-step-1').style.display = 'block';
    $('onboarding-step-2').style.display = 'none';
  }

  function showAppShell() {
    $('auth-screen').style.display = 'none';
    $('onboarding-screen').style.display = 'none';
    $('app-shell').style.display = 'block';

    // Populate user profile info in header
    const user = window.RigzeaStore.user;
    const member = window.RigzeaStore.currentMember;
    const displayName = member?.display_name || user?.email?.split('@')[0] || 'მმართველი';
    $('user-display-name').textContent = displayName;
    $('user-avatar-initials').textContent = displayName.charAt(0).toUpperCase();

    // Populate Organization selector in header
    renderOrgSelector();
  }

  function showAuthSubView(view) {
    $('auth-signin-view').style.display = view === 'signin' ? 'block' : 'none';
    $('auth-signup-view').style.display = view === 'signup' ? 'block' : 'none';
    $('auth-reset-view').style.display = view === 'reset' ? 'block' : 'none';
  }

  // Auth Event Listeners
  $('link-goto-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSubView('signup');
  });

  $('link-goto-signin')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSubView('signin');
  });

  $('link-forgot-pass')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSubView('reset');
  });

  $('link-reset-to-signin')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAuthSubView('signin');
  });

  // Sign In Handler
  $('btn-submit-signin')?.addEventListener('click', async () => {
    const email = $('signin-email').value.trim();
    const password = $('signin-password').value;
    if (!email || !password) {
      showToast('შეიყვანე ელფოსტა და პაროლი', 'error');
      return;
    }

    const btn = $('btn-submit-signin');
    btn.disabled = true;
    btn.textContent = 'მოწმდება...';

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = 'შესვლა ↗';

    if (error) {
      showToast('ავტორიზაციის შეცდომა: ' + error.message, 'error');
      return;
    }

    showToast('სისტემაში შესვლა წარმატებულია', 'success');
    window.RigzeaStore.user = data.user;
    window.RigzeaStore.session = data.session;
    
    const orgs = await window.RigzeaStore.loadOrganizations();
    if (orgs.length === 0) {
      showOnboardingScreen();
    } else {
      showAppShell();
      await loadAndRenderAll();
    }
  });

  // Sign Up Handler
  $('btn-submit-signup')?.addEventListener('click', async () => {
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;

    if (!name || !email || !password) {
      showToast('შეავსე ყველა სავალდებულო ველი', 'error');
      return;
    }

    const btn = $('btn-submit-signup');
    btn.disabled = true;
    btn.textContent = 'იქმნება ანგარიში...';

    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name }
      }
    });
    btn.disabled = false;
    btn.textContent = 'რეგისტრაცია და დაწყება ↗';

    if (error) {
      showToast('რეგისტრაციის შეცდომა: ' + error.message, 'error');
      return;
    }

    showToast('ანგარიში შეიქმნა!', 'success');
    window.RigzeaStore.user = data.user;
    window.RigzeaStore.session = data.session;
    showOnboardingScreen();
  });

  // Password Reset Handler
  $('btn-submit-reset')?.addEventListener('click', async () => {
    const email = $('reset-email').value.trim();
    if (!email) {
      showToast('შეიყვანე ელფოსტა', 'error');
      return;
    }

    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/app/'
    });

    if (error) {
      showToast('შეცდომა: ' + error.message, 'error');
    } else {
      showToast('აღდგენის ინსტრუქცია გაგზავნილია ელფოსტაზე', 'success');
      showAuthSubView('signin');
    }
  });

  // Sign Out Handler
  $('btn-signout')?.addEventListener('click', async () => {
    await window.supabaseClient.auth.signOut();
    localStorage.removeItem('rigzea_selected_org_id');
    window.location.reload();
  });

  // Onboarding Step 1: Create Organization
  let newlyCreatedOrgId = null;
  async function handleOnboardOrgSubmit(e) {
    if (e) e.preventDefault();
    const orgName = $('onboard-org-name').value.trim();
    const city = $('onboard-city').value;
    const portfolioSize = $('onboard-portfolio-size').value;

    if (!orgName) {
      showToast('შეიყვანე კომპანიის დასახელება', 'error');
      return;
    }

    const btn = $('btn-submit-onboard-org');
    btn.disabled = true;
    btn.textContent = 'იქმნება სამუშაო სივრცე...';

    let orgId = null;
    try {
      const rpcRes = await window.supabaseClient.rpc('create_user_organization', {
        p_org_name: orgName,
        p_city: city,
        p_portfolio_size: portfolioSize
      });
      if (!rpcRes.error && rpcRes.data) {
        orgId = rpcRes.data;
      } else {
        console.warn('RPC create_user_organization warning, trying direct insert:', rpcRes.error);
        // Direct Fallback
        const user = window.RigzeaStore.user;
        const { data: newOrg, error: orgErr } = await window.supabaseClient.from('organizations').insert({
          name: orgName,
          city: city,
          portfolio_size: portfolioSize,
          contact_email: user?.email
        }).select().single();

        if (newOrg) {
          orgId = newOrg.id;
          await window.supabaseClient.from('organization_members').insert({
            organization_id: newOrg.id,
            user_id: user.id,
            role: 'owner',
            display_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'მმართველი'
          });
        }
      }
    } catch (e) {
      console.error('Onboard create error:', e);
    }

    btn.disabled = false;
    btn.textContent = 'გაგრძელება: პირველი ბინის დამატება ↗';

    if (!orgId) {
      showToast('ორგანიზაციის შექმნა ვერ მოხერხდა. სცადეთ ხელახლა.', 'error');
      return;
    }

    newlyCreatedOrgId = orgId;
    await window.RigzeaStore.loadOrganizations();
    await window.RigzeaStore.switchOrganization(orgId);

    // Show Step 2
    $('onboarding-step-1').style.display = 'none';
    $('onboarding-step-2').style.display = 'block';
  }

  $('btn-submit-onboard-org')?.addEventListener('click', handleOnboardOrgSubmit);
  $('form-onboarding-org')?.addEventListener('submit', handleOnboardOrgSubmit);

  // Onboarding Step 2: Add First Apartment
  async function handleFirstAptSubmit(e) {
    if (e) e.preventDefault();
    const aptName = $('onboard-apt-name').value.trim();
    const address = $('onboard-apt-address').value.trim();
    const ownerName = $('onboard-owner-name').value.trim();

    if (!aptName || !address) {
      showToast('შეიყვანე ბინის სახელწოდება და მისამართი', 'error');
      return;
    }

    const org = window.RigzeaStore.currentOrg;
    if (!org) return;

    let ownerId = null;
    if (ownerName) {
      const { data: owner } = await window.supabaseClient.from('owners').insert({
        organization_id: org.id,
        name: ownerName
      }).select().single();
      if (owner) ownerId = owner.id;
    }

    const { data: apt, error } = await window.supabaseClient.from('apartments').insert({
      organization_id: org.id,
      name: aptName,
      address: address,
      city: org.city || 'ბათუმი',
      owner_id: ownerId,
      status: 'active'
    }).select().single();

    if (!error && apt) {
      await window.RigzeaStore.logActivity(apt.id, 'apartment_created', 'ბინა დაემატა სისტემაში', `ბინა ${apt.name} წარმატებით შეიქმნა`);
    }

    showToast('მოგესალმებით რიგზეაში!', 'success');
    showAppShell();
    await loadAndRenderAll();
  }

  $('btn-submit-first-apt')?.addEventListener('click', handleFirstAptSubmit);
  $('form-onboarding-first-apt')?.addEventListener('submit', handleFirstAptSubmit);

  $('btn-skip-first-apt')?.addEventListener('click', async () => {
    showAppShell();
    await loadAndRenderAll();
  });

  // =========================================================================
  // 2. DATA LOADING & ORGANIZATION MANAGEMENT
  // =========================================================================

  function renderOrgSelector() {
    const select = $('header-org-select');
    if (!select) return;
    select.innerHTML = '';

    window.RigzeaStore.organizations.forEach(org => {
      const opt = document.createElement('option');
      opt.value = org.id;
      opt.textContent = org.name;
      if (window.RigzeaStore.currentOrg && org.id === window.RigzeaStore.currentOrg.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.onchange = async () => {
      await window.RigzeaStore.switchOrganization(select.value);
      await renderCurrentView();
    };

    // Update sidebar label
    const aptCount = window.RigzeaStore.apartments.length;
    const orgName = window.RigzeaStore.currentOrg?.name || 'პორტფელი';
    $('portfolio-label-text').textContent = `${orgName} · ${aptCount} ბინა`;
  }

  async function loadAndRenderAll() {
    await window.RigzeaStore.loadAllOrgData();
    renderOrgSelector();
    renderNotificationsBadge();
    await renderCurrentView();
  }

  // =========================================================================
  // 3. ROUTING & NAVIGATION
  // =========================================================================

  function switchView(viewName) {
    currentView = viewName;
    
    // Close mobile drawer if open
    $('app-sidebar-drawer')?.classList.remove('drawer-open');
    $('sidebar-backdrop')?.classList.remove('active');
    
    // Scroll window smoothly to top
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Update active state in sidebar and mobile nav
    $$('.app-nav-button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    $$('.mobile-bottom-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update view sections visibility
    $$('.app-screen-view').forEach(view => {
      view.classList.toggle('active', view.id === `view-${viewName}`);
    });

    renderCurrentView();
  }

  // Mobile Drawer Toggle handlers
  $('btn-mobile-sidebar-toggle')?.addEventListener('click', () => {
    $('app-sidebar-drawer')?.classList.add('drawer-open');
    $('sidebar-backdrop')?.classList.add('active');
  });

  $('btn-mobile-sidebar-close')?.addEventListener('click', () => {
    $('app-sidebar-drawer')?.classList.remove('drawer-open');
    $('sidebar-backdrop')?.classList.remove('active');
  });

  $('sidebar-backdrop')?.addEventListener('click', () => {
    $('app-sidebar-drawer')?.classList.remove('drawer-open');
    $('sidebar-backdrop')?.classList.remove('active');
  });

  // Bind navigation buttons
  $$('.app-nav-button, .mobile-bottom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });

  $('btn-dash-goto-reports')?.addEventListener('click', () => switchView('reports'));
  $('btn-dash-add-task')?.addEventListener('click', () => openTaskModal());
  $('btn-quick-new-task')?.addEventListener('click', () => openTaskModal());

  async function renderCurrentView() {
    const aptCount = window.RigzeaStore.apartments.length;
    $('portfolio-label-text').textContent = `${window.RigzeaStore.currentOrg?.name || 'პორტფელი'} · ${aptCount} ბინა`;

    // Calculate open approvals count for sidebar foot
    const openApprovals = window.RigzeaStore.approvals.filter(a => a.status === 'pending');
    $('sidebar-approval-status-label').textContent = `${openApprovals.length} ღია თანხმობა`;

    if (currentView === 'dashboard') {
      renderDashboardView();
    } else if (currentView === 'apartments') {
      renderApartmentsView();
    } else if (currentView === 'tasks') {
      renderTasksView();
    } else if (currentView === 'owners') {
      renderOwnersView();
    } else if (currentView === 'reports') {
      renderReportsView();
    } else if (currentView === 'condition') {
      renderConditionReportsView();
    } else if (currentView === 'settings') {
      renderSettingsView();
    }
  }

  // =========================================================================
  // 4. VIEW: DASHBOARD (მთავარი)
  // =========================================================================

  function renderDashboardView() {
    const { tasks, approvals, activityEvents, expenses, income } = window.RigzeaStore;

    // 1. ყურადღებას საჭიროებს (Attention Needed) - Rule 1 & Rule 12
    const pendingApprovals = approvals.filter(a => a.status === 'pending');
    const overdueTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.priority === 'urgent');
    const attentionContainer = $('dash-attention-container');
    const totalAttention = pendingApprovals.length + overdueTasks.length;

    $('dash-action-count').textContent = `${totalAttention} საკითხი`;
    attentionContainer.innerHTML = '';

    if (totalAttention === 0) {
      attentionContainer.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-state-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h4 class="empty-state-title">ყველაფერი რიგზეა</h4>
          <p class="empty-state-desc">გადაუდებელი საკითხები და მოლოდინში მყოფი თანხმობები არ არის.</p>
          <button class="btn secondary smallbtn" id="btn-dash-empty-add-task">+ ახალი საქმის დამატება</button>
        </div>
      `;
      $('btn-dash-empty-add-task')?.addEventListener('click', () => openTaskModal());
    } else {
      // Render pending approvals
      pendingApprovals.forEach(appr => {
        const apt = window.RigzeaStore.apartments.find(a => a.id === appr.apartment_id);
        const card = document.createElement('div');
        card.className = 'action-required-card';
        card.innerHTML = `
          <div class="action-required-info">
            <strong>${escapeHtml(apt?.name || 'ბინა')} — ${escapeHtml(appr.issue_title || 'თანხმობა')}</strong>
            <p>₾${Number(appr.amount || 0)} რემონტი ელოდება მფლობელის თანხმობას</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="amount-badge num-tabular">₾${Number(appr.amount || 0)}</span>
            <button class="btn smallbtn btn-open-public-appr" data-token="${appr.token}">თანხმობა ↗</button>
          </div>
        `;
        attentionContainer.appendChild(card);
      });

      // Render urgent tasks
      overdueTasks.forEach(task => {
        const apt = window.RigzeaStore.apartments.find(a => a.id === task.apartment_id);
        const card = document.createElement('div');
        card.className = 'action-required-card danger';
        card.innerHTML = `
          <div class="action-required-info">
            <strong>${escapeHtml(apt?.name || 'ბინა')} — ${escapeHtml(task.title)}</strong>
            <p>მაღალი პრიორიტეტი · ${task.due_time ? 'ვადა: ' + task.due_time : 'სასწრაფო'}</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="status-pill wait">გადაუდებელი</span>
            <button class="btn secondary smallbtn btn-view-task-apt" data-apt-id="${task.apartment_id}">ნახვა</button>
          </div>
        `;
        attentionContainer.appendChild(card);
      });
    }

    // Bind approval link buttons
    $$('.btn-open-public-appr').forEach(btn => {
      btn.addEventListener('click', () => {
        const token = btn.dataset.token;
        window.open(`/approve/?token=${token}`, '_blank');
      });
    });

    $$('.btn-view-task-apt').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedAptId = btn.dataset.aptId;
        switchView('apartments');
      });
    });

    // 2. დღეს დაგეგმილი (Today's Schedule) - Rule 12 Actionable Empty State
    const todayTableBody = $('dash-today-table-body');
    const activeTasks = tasks.filter(t => t.status !== 'completed');
    $('dash-today-count').textContent = `${activeTasks.length} საქმე`;
    todayTableBody.innerHTML = '';

    if (activeTasks.length === 0) {
      todayTableBody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state-box">
              <div class="empty-state-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
              </div>
              <h4 class="empty-state-title">დღეისთვის საქმეები არ არის დაგეგმილი</h4>
              <p class="empty-state-desc">დაამატე დასუფთავების, შემოწმების ან რემონტის საქმე განრიგში.</p>
              <button class="btn smallbtn" id="btn-dash-empty-schedule-task">+ საქმის დაგეგმვა</button>
            </div>
          </td>
        </tr>
      `;
      $('btn-dash-empty-schedule-task')?.addEventListener('click', () => openTaskModal());
    } else {
      activeTasks.slice(0, 5).forEach(task => {
        const apt = window.RigzeaStore.apartments.find(a => a.id === task.apartment_id);
        const tr = document.createElement('tr');
        const statusMap = {
          new: { text: 'ახალი', cls: 'neutral' },
          in_progress: { text: 'პროცესშია', cls: 'neutral' },
          pending_approval: { text: 'ელოდება', cls: 'wait' },
          completed: { text: 'დასრულებული', cls: 'done' }
        };
        const st = statusMap[task.status] || { text: task.status, cls: 'neutral' };

        tr.innerHTML = `
          <td><time class="num-tabular" style="font-weight:700">${task.due_time || 'დღეს'}</time></td>
          <td><strong>${escapeHtml(task.title)}</strong></td>
          <td>${escapeHtml(apt?.name || '—')}</td>
          <td>${escapeHtml(task.assigned_to || 'გუნდი')}</td>
          <td><span class="status-pill ${st.cls}">${st.text}</span></td>
        `;
        tr.addEventListener('click', () => {
          if (task.apartment_id) {
            selectedAptId = task.apartment_id;
            switchView('apartments');
          } else {
            switchView('tasks');
          }
        });
        todayTableBody.appendChild(tr);
      });
    }

    // 3. ბოლო განახლებები (Activity Events Stream)
    const activityContainer = $('dash-recent-activity');
    activityContainer.innerHTML = '';

    if (activityEvents.length === 0) {
      activityContainer.innerHTML = `
        <div class="empty-state-box" style="padding:28px 10px">
          <p class="empty-state-desc">ოპერაციული ისტორია დაიწერება ყოველი საქმის, ხარჯისა და თანხმობის შემდეგ.</p>
        </div>
      `;
    } else {
      activityEvents.slice(0, 6).forEach(evt => {
        const apt = window.RigzeaStore.apartments.find(a => a.id === evt.apartment_id);
        const item = document.createElement('div');
        item.className = 'timeline-event-row';
        item.style.marginBottom = '12px';
        item.innerHTML = `
          <time>${window.RigzeaUtils.formatTime(evt.created_at)}</time>
          <div class="timeline-rail"></div>
          <div class="timeline-details">
            <strong>${escapeHtml(evt.title)}</strong>
            <p>${escapeHtml(apt?.name ? apt.name + ' · ' : '')}${escapeHtml(evt.description || '')} (${escapeHtml(evt.actor_name || 'მმართველი')})</p>
          </div>
        `;
        activityContainer.appendChild(item);
      });
    }

    // 4. Current Month Financial KPI
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthIncome = income
      .filter(i => (i.income_date || i.created_at || '').startsWith(currentMonthPrefix))
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const monthExpense = expenses
      .filter(e => (e.expense_date || e.created_at || '').startsWith(currentMonthPrefix))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const monthNet = monthIncome - monthExpense;

    $('dash-kpi-income').textContent = window.RigzeaUtils.formatMoney(monthIncome);
    $('dash-kpi-expense').textContent = window.RigzeaUtils.formatMoney(monthExpense);
    $('dash-kpi-net').textContent = window.RigzeaUtils.formatMoney(monthNet);
  }

  // =========================================================================
  // 5. VIEW: ბინები (APARTMENTS & SIGNATURE TIMELINE)
  // =========================================================================

  function renderApartmentsView() {
    const { apartments, owners } = window.RigzeaStore;
    const listMount = $('apartments-list-mount');
    const searchVal = $('apt-search-input')?.value.toLowerCase() || '';
    const cityFilter = $('apt-filter-city')?.value || 'all';

    listMount.innerHTML = '';

    const filtered = apartments.filter(apt => {
      const matchSearch = apt.name.toLowerCase().includes(searchVal) || apt.address.toLowerCase().includes(searchVal);
      const matchCity = cityFilter === 'all' || apt.city === cityFilter;
      return matchSearch && matchCity;
    });

    if (filtered.length === 0) {
      listMount.innerHTML = `
        <div class="empty-state-box">
          <div class="empty-state-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/></svg>
          </div>
          <h4 class="empty-state-title">ბინები არ მოიძებნა</h4>
          <p class="empty-state-desc">დაამატე ახალი ბინა მართვის ქვეშ ასაყვანად.</p>
          <button class="btn smallbtn" id="btn-empty-add-apt">+ პირველი ბინის დამატება</button>
        </div>
      `;
      $('btn-empty-add-apt')?.addEventListener('click', () => openApartmentModal());
      renderSelectedApartment(null);
      return;
    }

    // If no apartment is selected, select the first
    if (!selectedAptId || !filtered.some(a => a.id === selectedAptId)) {
      selectedAptId = filtered[0].id;
    }

    filtered.forEach(apt => {
      const owner = owners.find(o => o.id === apt.owner_id);
      const isSelected = apt.id === selectedAptId;
      const card = document.createElement('div');
      card.className = `apartment-row-item ${isSelected ? 'active' : ''}`;
      card.innerHTML = `
        <div class="apt-row-top" style="display:flex;justify-content:space-between;align-items:baseline">
          <strong>${escapeHtml(apt.name)}</strong>
          <span class="status-pill done" style="font-size:10px">${escapeHtml(apt.status === 'active' ? 'აქტიური' : 'დაარქივებული')}</span>
        </div>
        <div class="apt-row-meta" style="font-size:12px;color:var(--muted);margin-top:2px">
          ${escapeHtml(apt.city)} · ${escapeHtml(owner ? owner.name : 'მფლობელის გარეშე')}
        </div>
      `;
      card.addEventListener('click', () => {
        selectedAptId = apt.id;
        renderApartmentsView();
      });
      listMount.appendChild(card);
    });

    const currentApt = apartments.find(a => a.id === selectedAptId);
    renderSelectedApartment(currentApt);
  }

  function renderSelectedApartment(apt) {
    if (!apt) {
      $('current-apt-title').textContent = 'ბინა არ არის არჩეული';
      $('current-apt-sub').textContent = '—';
      $('current-apt-open-tasks').textContent = '0';
      $('current-apt-pending-cost').textContent = '₾0';
      $('current-apt-next-clean').textContent = '—';
      $('apt-tab-content').innerHTML = `<div class="empty-state-box"><p class="empty-state-desc">აირჩიე ან დაამატე ბინა</p></div>`;
      return;
    }

    const { owners, tasks, approvals, activityEvents, expenses, income } = window.RigzeaStore;
    const owner = owners.find(o => o.id === apt.owner_id);

    // Header info
    $('current-apt-title').textContent = apt.name;
    $('current-apt-sub').textContent = `${apt.address} · ${apt.city} · მფლობელი: ${owner ? owner.name + ' (' + (owner.phone || 'ტელეფონის გარეშე') + ')' : 'არ არის მითითებული'}`;
    $('current-apt-status-pill').textContent = apt.status === 'active' ? 'აქტიური' : 'დაარქივებული';

    // Summary metrics
    const aptActiveTasks = tasks.filter(t => t.apartment_id === apt.id && t.status !== 'completed');
    const pendingApprovals = approvals.filter(a => a.apartment_id === apt.id && a.status === 'pending');
    const pendingSum = pendingApprovals.reduce((sum, a) => sum + Number(a.amount || 0), 0);

    $('current-apt-open-tasks').textContent = `${aptActiveTasks.length} აქტიური`;
    $('current-apt-pending-cost').textContent = window.RigzeaUtils.formatMoney(pendingSum);
    $('current-apt-next-clean').textContent = 'დღეს, 14:00';

    // Wire up Rule 6: 5 Persistent Actions on Apartment View
    const btnNewTask = $('btn-apt-act-new-task');
    const btnAddExp = $('btn-apt-act-add-expense');
    const btnAddRepair = $('btn-apt-act-add-repair');
    const btnAddPhoto = $('btn-apt-act-add-photo');
    const btnSendOwner = $('btn-apt-act-send-owner');

    if (btnNewTask) btnNewTask.onclick = () => openTaskModal(apt.id);
    if (btnAddExp) btnAddExp.onclick = () => openExpenseModal(apt.id);
    if (btnAddRepair) btnAddRepair.onclick = () => openApprovalModal(apt.id);
    if (btnAddPhoto) btnAddPhoto.onclick = () => openUploadReceiptModal(apt.id);
    if (btnSendOwner) btnSendOwner.onclick = () => openSendOwnerReportModal(apt.id);

    // Sub-tab Navigation
    $$('.apt-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.aptTab === aptSubTab);
    });

    const contentMount = $('apt-tab-content');
    contentMount.innerHTML = '';

    const aptTasks = tasks.filter(t => t.apartment_id === apt.id);
    const aptExpenses = expenses.filter(e => e.apartment_id === apt.id);
    const aptIncome = income.filter(i => i.apartment_id === apt.id);
    const aptApprovals = approvals.filter(a => a.apartment_id === apt.id);
    const aptEvents = activityEvents.filter(e => e.apartment_id === apt.id);

    // Calculate this month's finances
    const now = new Date();
    const curMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthIncome = aptIncome
      .filter(i => (i.income_date || i.created_at || '').startsWith(curMonthPrefix))
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const thisMonthExpense = aptExpenses
      .filter(e => (e.expense_date || e.created_at || '').startsWith(curMonthPrefix))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const thisMonthNet = thisMonthIncome - thisMonthExpense;

    // -------------------------------------------------------------------------
    // SUBTAB 1: მიმოხილვა (OVERVIEW)
    // -------------------------------------------------------------------------
    if (aptSubTab === 'overview') {
      contentMount.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:20px">
          <!-- Property Information Card -->
          <div class="dash-card" style="padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <strong style="font-size:14px;color:var(--ink)">🏢 ბინის მონაცემები</strong>
              <button class="btn link smallbtn" id="btn-sub-edit-apt" style="padding:0;font-size:12px">რედაქტირება ✎</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
              <div>
                <span style="color:var(--muted);display:block">ქალაქი / მისამართი:</span>
                <strong style="color:var(--ink)">${escapeHtml(apt.city || 'ბათუმი')}, ${escapeHtml(apt.address)}</strong>
              </div>
              <div>
                <span style="color:var(--muted);display:block">ბინის / კარის №:</span>
                <strong style="color:var(--ink)">${escapeHtml(apt.unit_number || '—')}</strong>
              </div>
              <div>
                <span style="color:var(--muted);display:block">სტატუსი:</span>
                <span class="status-pill done" style="font-size:11px">${apt.status === 'active' ? 'აქტიური მართვა' : 'დაარქივებული'}</span>
              </div>
              <div>
                <span style="color:var(--muted);display:block">აქტიური საქმეები:</span>
                <strong style="color:var(--ink)">${aptTasks.filter(t => t.status !== 'completed').length} საქმე</strong>
              </div>
            </div>
          </div>

          <!-- Owner Information Card -->
          <div class="dash-card" style="padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <strong style="font-size:14px;color:var(--ink)">👤 მესაკუთრე</strong>
              ${owner ? `<button class="btn link smallbtn" id="btn-sub-view-owner" data-owner-id="${owner.id}" style="padding:0;font-size:12px">პროფილის ნახვა ↗</button>` : ''}
            </div>
            ${owner ? `
              <div style="font-size:13px;line-height:1.5">
                <div style="font-weight:600;font-size:14px;color:var(--ink);margin-bottom:4px">${escapeHtml(owner.name)}</div>
                <div style="display:flex;align-items:center;gap:8px;color:var(--ink-secondary);font-size:12px;margin-bottom:4px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <a href="tel:${escapeHtml(owner.phone || '')}" style="color:var(--ink);text-decoration:none">${escapeHtml(owner.phone || 'ტელეფონი არ არის')}</a>
                </div>
                <div style="display:flex;align-items:center;gap:8px;color:var(--ink-secondary);font-size:12px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <span>${escapeHtml(owner.email || 'ელფოსტა არ არის')}</span>
                </div>
              </div>
            ` : `
              <div style="color:var(--muted);font-size:12px;padding:12px 0">
                მესაკუთრე არ არის მიბმული.<br/>
                <button class="btn link smallbtn" id="btn-sub-assign-owner" style="padding:4px 0">მესაკუთრის მიბმა ✎</button>
              </div>
            `}
          </div>
        </div>

        <!-- Access Instructions & Codes -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <strong style="font-size:14px;color:var(--ink)">🔑 წვდომის ინსტრუქცია და კოდები</strong>
            <button class="btn secondary smallbtn" id="btn-copy-access-code" style="font-size:11px">კოდის კოპირება 📋</button>
          </div>
          <div style="background:var(--surface-subtle);border:1px solid var(--line);border-radius:8px;padding:12px;font-family:monospace,sans-serif;font-size:13px;color:var(--ink)" id="apt-access-display">
            ${escapeHtml(apt.access_instructions || 'წვდომის ინსტრუქცია და კოდები ჯერ არ არის შეყვანილი')}
          </div>
        </div>

        <!-- Monthly Financial Performance Summary -->
        <div style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong style="font-size:14px;color:var(--ink)">📊 მიმდინარე თვის ფინანსები</strong>
            <button class="btn secondary smallbtn" id="btn-sub-view-full-report">სრული რეპორტი ↗</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;text-align:center">
            <div style="background:var(--surface-subtle);padding:12px;border-radius:8px">
              <span style="font-size:11px;color:var(--muted);display:block">შემოსავალი</span>
              <strong style="font-size:16px;color:var(--green)">${window.RigzeaUtils.formatMoney(thisMonthIncome)}</strong>
            </div>
            <div style="background:var(--surface-subtle);padding:12px;border-radius:8px">
              <span style="font-size:11px;color:var(--muted);display:block">საოპერაციო ხარჯი</span>
              <strong style="font-size:16px;color:var(--red)">${window.RigzeaUtils.formatMoney(thisMonthExpense)}</strong>
            </div>
            <div style="background:var(--surface-subtle);padding:12px;border-radius:8px">
              <span style="font-size:11px;color:var(--muted);display:block">მესაკუთრის ნაშთი</span>
              <strong style="font-size:16px;color:${thisMonthNet >= 0 ? 'var(--green)' : 'var(--red)'}">${window.RigzeaUtils.formatMoney(thisMonthNet)}</strong>
            </div>
          </div>
        </div>

        <!-- Archive Option -->
        <div style="display:flex;justify-content:flex-end;padding-top:12px;border-top:1px solid var(--line)">
          <button class="btn secondary smallbtn" id="btn-archive-apt-action" style="color:var(--red);border-color:rgba(239,68,68,0.3)">
            ბინის დაარქივება
          </button>
        </div>
      `;

      // Wire up overview listeners
      $('btn-sub-edit-apt')?.addEventListener('click', () => openApartmentModal(apt.id));
      $('btn-sub-assign-owner')?.addEventListener('click', () => openApartmentModal(apt.id));
      $('btn-sub-view-owner')?.addEventListener('click', () => {
        if (owner) {
          selectedOwnerId = owner.id;
          switchView('owners');
        }
      });
      $('btn-copy-access-code')?.addEventListener('click', () => {
        if (apt.access_instructions) {
          navigator.clipboard.writeText(apt.access_instructions);
          showToast('წვდომის კოდი დაკოპირდა!', 'success');
        } else {
          showToast('კოდი არ არის შეყვანილი', 'error');
        }
      });
      $('btn-sub-view-full-report')?.addEventListener('click', () => {
        aptSubTab = 'reports';
        renderSelectedApartment(apt);
      });
      $('btn-archive-apt-action')?.addEventListener('click', async () => {
        if (!confirm(`ნამდვილად გსურთ ბინა „${apt.name}“-ის დაარქივება?`)) return;
        await window.supabaseClient.from('apartments').update({ status: 'archived' }).eq('id', apt.id);
        await window.RigzeaStore.logActivity(apt.id, 'apartment_archived', 'ბინა დაარქივდა');
        showToast('ბინა დაარქივდა', 'normal');
        await loadAndRenderAll();
      });
    }

    // -------------------------------------------------------------------------
    // SUBTAB 2: ისტორია (TIMELINE)
    // -------------------------------------------------------------------------
    else if (aptSubTab === 'timeline') {
      if (aptEvents.length === 0) {
        contentMount.innerHTML = `
          <div class="empty-state-box">
            <div class="empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 16 14"/></svg>
            </div>
            <h4 class="empty-state-title">ისტორია ჯერ ცარიელია</h4>
            <p class="empty-state-desc">ყოველი შექმნილი საქმე, რემონტი, ხარჯი ან თანხმობა ავტომატურად გაჩნდება ამ ქრონოლოგიაში.</p>
            <button class="btn smallbtn" id="btn-timeline-add-task">+ პირველი საქმის დამატება</button>
          </div>
        `;
        $('btn-timeline-add-task')?.addEventListener('click', () => openTaskModal(apt.id));
      } else {
        const timelineList = document.createElement('div');
        timelineList.className = 'timeline-events-list';
        aptEvents.forEach(evt => {
          const row = document.createElement('div');
          row.className = 'timeline-event-row';
          row.innerHTML = `
            <time>${window.RigzeaUtils.formatDateTime(evt.created_at)}</time>
            <div class="timeline-rail"></div>
            <div class="timeline-details">
              <strong>${escapeHtml(evt.title)}</strong>
              <p>${escapeHtml(evt.description || '')} <small style="color:var(--muted);display:block;margin-top:2px">შემსრულებელი: ${escapeHtml(evt.actor_name || 'მმართველი')}</small></p>
            </div>
          `;
          timelineList.appendChild(row);
        });
        contentMount.appendChild(timelineList);
      }
    }

    // -------------------------------------------------------------------------
    // SUBTAB 3: საქმეები (TASKS)
    // -------------------------------------------------------------------------
    else if (aptSubTab === 'tasks') {
      contentMount.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <strong style="font-size:14px;color:var(--ink)">მიმდინარე და დასრულებული საქმეები (${aptTasks.length})</strong>
          <button class="btn smallbtn" id="btn-apt-add-task">+ საქმის დამატება</button>
        </div>
        <div class="data-table-wrapper">
          <table class="operational-table">
            <thead>
              <tr><th>საქმე</th><th>ტიპი</th><th>შემსრულებელი</th><th>სტატუსი</th><th style="text-align:right">მოქმედება</th></tr>
            </thead>
            <tbody>
              ${aptTasks.length === 0 ? `
                <tr>
                  <td colspan="5">
                    <div class="empty-state-box" style="padding:24px 12px">
                      <p class="empty-state-desc">ამ ბინისთვის საქმეები არ არის დაგეგმილი</p>
                    </div>
                  </td>
                </tr>
              ` : aptTasks.map(t => `
                <tr>
                  <td><strong>${escapeHtml(t.title)}</strong><div style="font-size:11px;color:var(--muted)">${escapeHtml(t.description || '')}</div></td>
                  <td>${escapeHtml(t.task_type || 'სხვა')}</td>
                  <td>${escapeHtml(t.assigned_to || 'გუნდი')}</td>
                  <td>
                    <select class="filter-select apt-inline-task-status" data-task-id="${t.id}" style="height:26px;font-size:11px;padding:2px 8px">
                      <option value="new" ${t.status === 'new' ? 'selected' : ''}>ახალი</option>
                      <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>პროცესშია</option>
                      <option value="pending_approval" ${t.status === 'pending_approval' ? 'selected' : ''}>ელოდება</option>
                      <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>დასრულებული</option>
                    </select>
                  </td>
                  <td style="text-align:right">
                    ${t.status !== 'completed' ? `
                      <button class="btn secondary smallbtn btn-apt-complete-task" data-task-id="${t.id}" style="font-size:11px;padding:2px 8px">✓ დასრულება</button>
                    ` : '<span style="color:var(--green);font-size:11px">დასრულებულია ✓</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      $('btn-apt-add-task')?.addEventListener('click', () => openTaskModal(apt.id));

      $$('.apt-inline-task-status').forEach(sel => {
        sel.addEventListener('change', async () => {
          const taskId = sel.dataset.taskId;
          const newStatus = sel.value;
          await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            task.status = newStatus;
            await window.RigzeaStore.logActivity(apt.id, 'task_status_changed', `საქმის სტატუსი: ${newStatus}`, task.title);
          }
          showToast('სტატუსი განახლდა', 'success');
          renderSelectedApartment(apt);
        });
      });

      $$('.btn-apt-complete-task').forEach(btn => {
        btn.addEventListener('click', async () => {
          const taskId = btn.dataset.taskId;
          await window.supabaseClient.from('tasks').update({ status: 'completed' }).eq('id', taskId);
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            task.status = 'completed';
            await window.RigzeaStore.logActivity(apt.id, 'task_completed', `საქმე დასრულდა: ${task.title}`);
          }
          showToast('საქმე მონიშნულია დასრულებულად!', 'success');
          renderSelectedApartment(apt);
        });
      });
    }

    // -------------------------------------------------------------------------
    // SUBTAB 4: ხარჯები (EXPENSES & INCOME)
    // -------------------------------------------------------------------------
    else if (aptSubTab === 'expenses') {
      const totalExp = aptExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalInc = aptIncome.reduce((sum, i) => sum + Number(i.amount || 0), 0);

      contentMount.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div>
            <strong style="font-size:14px;color:var(--ink)">ხარჯებისა და შემოსავლების რეესტრი</strong>
            <div style="font-size:12px;color:var(--muted)">ჯამური ხარჯი: <strong style="color:var(--red)">${window.RigzeaUtils.formatMoney(totalExp)}</strong> · შემოსავალი: <strong style="color:var(--green)">${window.RigzeaUtils.formatMoney(totalInc)}</strong></div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn secondary smallbtn" id="btn-apt-sub-add-income">+ შემოსავალი</button>
            <button class="btn smallbtn" id="btn-apt-sub-add-expense">+ ხარჯის ჩაწერა</button>
          </div>
        </div>

        <div class="data-table-wrapper" style="margin-bottom:24px">
          <table class="operational-table">
            <thead>
              <tr><th>თარიღი</th><th>აღწერა</th><th>კატეგორია</th><th>თანხა</th><th>ქვითარი</th></tr>
            </thead>
            <tbody>
              ${aptExpenses.length === 0 ? `
                <tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">ხარჯები არ არის დაფიქსირებული</td></tr>
              ` : aptExpenses.map(e => `
                <tr>
                  <td>${window.RigzeaUtils.formatDate(e.expense_date || e.created_at)}</td>
                  <td><strong>${escapeHtml(e.description)}</strong><div style="font-size:11px;color:var(--muted)">${escapeHtml(e.vendor || 'მომწოდებელი: —')}</div></td>
                  <td><span class="status-pill neutral" style="font-size:10px">${escapeHtml(e.category)}</span></td>
                  <td class="num-tabular" style="color:var(--red);font-weight:700">${window.RigzeaUtils.formatMoney(e.amount)}</td>
                  <td>
                    ${e.receipt_url ? `
                      <a href="${escapeHtml(e.receipt_url)}" target="_blank" class="btn link smallbtn" style="padding:0;font-size:11px">ნახვა ↗</a>
                    ` : '<span style="color:var(--muted);font-size:11px">—</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      $('btn-apt-sub-add-expense')?.addEventListener('click', () => openExpenseModal(apt.id));
      $('btn-apt-sub-add-income')?.addEventListener('click', () => openIncomeModal(apt.id));
    }

    // -------------------------------------------------------------------------
    // SUBTAB 5: ფაილები და ქვითრები (FILES)
    // -------------------------------------------------------------------------
    else if (aptSubTab === 'files') {
      const receiptExpenses = aptExpenses.filter(e => e.receipt_url);

      contentMount.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <strong style="font-size:14px;color:var(--ink)">ატვირთული ფაილები და ქვითრები</strong>
            <div style="font-size:12px;color:var(--muted)">სულ მიმაგრებულია ${receiptExpenses.length} ფაილი</div>
          </div>
          <button class="btn smallbtn" id="btn-apt-sub-upload-file">+ ფაილის / ქვითრის ატვირთვა</button>
        </div>

        ${receiptExpenses.length === 0 ? `
          <div class="empty-state-box">
            <div class="empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
            </div>
            <h4 class="empty-state-title">ფაილები და ქვითრები არ არის</h4>
            <p class="empty-state-desc">ატვირთეთ რემონტის ფოტოები, ქვითრები ან ინსპექციის აქტები უსაფრთხო საცავში.</p>
            <button class="btn smallbtn" id="btn-empty-upload-file">+ პირველი ქვითრის ატვირთვა</button>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:14px">
            ${receiptExpenses.map(e => `
              <div style="background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                    <strong style="font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(e.description)}</strong>
                  </div>
                  <div style="font-size:11px;color:var(--muted)">თარიღი: ${window.RigzeaUtils.formatDate(e.expense_date || e.created_at)}</div>
                  <div style="font-size:12px;font-weight:700;color:var(--red);margin-top:4px">${window.RigzeaUtils.formatMoney(e.amount)}</div>
                </div>
                <div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:flex-end">
                  <a href="${escapeHtml(e.receipt_url)}" target="_blank" class="btn secondary smallbtn" style="font-size:11px;padding:3px 10px">გახსნა ↗</a>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;

      $('btn-apt-sub-upload-file')?.addEventListener('click', () => openUploadReceiptModal(apt.id));
      $('btn-empty-upload-file')?.addEventListener('click', () => openUploadReceiptModal(apt.id));
    }

    // -------------------------------------------------------------------------
    // SUBTAB 6: ანგარიშები (MONTHLY STATEMENTS & REPORTS)
    // -------------------------------------------------------------------------
    else if (aptSubTab === 'reports') {
      contentMount.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
          <div>
            <strong style="font-size:14px;color:var(--ink)">მესაკუთრის ყოველთვიური ამონაწერი / რეპორტი</strong>
            <div style="font-size:12px;color:var(--muted)">საოპერაციო რეპორტის გენერირება და მესაკუთრესთან გაგზავნა</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn secondary smallbtn" id="btn-print-statement">ბეჭდვა / PDF ⎙</button>
            <button class="btn smallbtn" id="btn-send-statement-owner">მფლობელისთვის გაგზავნა ↗</button>
          </div>
        </div>

        <!-- Statement Sheet Card -->
        <div class="dash-card printable-report" style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px;max-width:760px;margin:0 auto">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:20px">
            <div>
              <h2 style="font-size:18px;margin:0 0 4px;color:var(--ink)">საოპერაციო ანგარიში</h2>
              <div style="font-size:12px;color:var(--muted)">ბინა: <strong>${escapeHtml(apt.name)}</strong> (${escapeHtml(apt.address)})</div>
              <div style="font-size:12px;color:var(--muted)">მესაკუთრე: <strong>${escapeHtml(owner ? owner.name : '—')}</strong></div>
            </div>
            <div style="text-align:right">
              <span class="status-pill done">მიმდინარე თვე</span>
              <div style="font-size:11px;color:var(--muted);margin-top:4px">გენერირებულია: ${window.RigzeaUtils.formatDate(new Date().toISOString())}</div>
            </div>
          </div>

          <!-- Financial Table -->
          <div style="margin-bottom:20px">
            <h4 style="font-size:13px;margin:0 0 10px;color:var(--ink)">1. ფინანსური შეჯამება</h4>
            <div style="background:var(--surface-subtle);border-radius:8px;padding:14px;display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;text-align:center">
              <div>
                <span style="font-size:11px;color:var(--muted);display:block">შემოსავალი</span>
                <strong style="font-size:16px;color:var(--green)">${window.RigzeaUtils.formatMoney(thisMonthIncome)}</strong>
              </div>
              <div>
                <span style="font-size:11px;color:var(--muted);display:block">გაწეული ხარჯები</span>
                <strong style="font-size:16px;color:var(--red)">${window.RigzeaUtils.formatMoney(thisMonthExpense)}</strong>
              </div>
              <div>
                <span style="font-size:11px;color:var(--muted);display:block">გადასარიცხი წმინდა თანხა</span>
                <strong style="font-size:16px;color:var(--ink)">${window.RigzeaUtils.formatMoney(thisMonthNet)}</strong>
              </div>
            </div>
          </div>

          <!-- Itemized Expenses Table -->
          <div style="margin-bottom:20px">
            <h4 style="font-size:13px;margin:0 0 10px;color:var(--ink)">2. გაწეული ხარჯების ჩამონათვალი</h4>
            <table class="operational-table" style="font-size:12px">
              <thead><tr><th>თარიღი</th><th>აღწერა</th><th>კატეგორია</th><th style="text-align:right">თანხა</th></tr></thead>
              <tbody>
                ${aptExpenses.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--muted)">ხარჯები არ ფიქსირდება</td></tr>' :
                  aptExpenses.map(e => `
                    <tr>
                      <td>${window.RigzeaUtils.formatDate(e.expense_date || e.created_at)}</td>
                      <td>${escapeHtml(e.description)}</td>
                      <td>${escapeHtml(e.category)}</td>
                      <td style="text-align:right;font-weight:700;color:var(--red)">${window.RigzeaUtils.formatMoney(e.amount)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>

          <div style="border-top:1px solid var(--line);padding-top:14px;font-size:12px;color:var(--muted);text-align:center">
            რიგზეა — ქონების მართვის საოპერაციო სისტემა
          </div>
        </div>
      `;

      $('btn-print-statement')?.addEventListener('click', () => window.print());
      $('btn-send-statement-owner')?.addEventListener('click', () => openSendOwnerReportModal(apt.id));
    }
  }

  // Apartment Sub-tab switcher
  $$('.apt-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      aptSubTab = btn.dataset.aptTab;
      const apt = window.RigzeaStore.apartments.find(a => a.id === selectedAptId);
      renderSelectedApartment(apt);
    });
  });

  // Search & Filter listeners
  $('apt-search-input')?.addEventListener('input', () => renderApartmentsView());
  $('apt-filter-city')?.addEventListener('change', () => renderApartmentsView());
  $('btn-add-apartment-modal')?.addEventListener('click', () => openApartmentModal());
  $('btn-apt-quick-edit')?.addEventListener('click', () => {
    if (selectedAptId) openApartmentModal(selectedAptId);
  });

  // =========================================================================
  // 6. VIEW: საქმეები (TASKS & TELEGRAM NLP PARSER)
  // =========================================================================

  function renderTasksView() {
    const { tasks, apartments } = window.RigzeaStore;
    const filterStatus = $('task-filter-status')?.value || 'all';
    const tbody = $('tasks-table-tbody');
    tbody.innerHTML = '';

    const filtered = tasks.filter(t => {
      if (filterStatus === 'all') return true;
      return t.status === filterStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="empty-state-box">
              <div class="empty-state-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              </div>
              <h4 class="empty-state-title">საქმეები არ მოიძებნა</h4>
              <p class="empty-state-desc">დაამატე ახალი დავალება ან გამოიყენე Telegram-ის ჭკვიანი ამოცნობა.</p>
              <button class="btn smallbtn" id="btn-empty-add-task">+ საქმის დამატება</button>
            </div>
          </td>
        </tr>
      `;
      $('btn-empty-add-task')?.addEventListener('click', () => openTaskModal());
      return;
    }

    filtered.forEach(task => {
      const apt = apartments.find(a => a.id === task.apartment_id);
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td><strong>${escapeHtml(task.title)}</strong></td>
        <td>${escapeHtml(apt?.name || '—')}</td>
        <td>${escapeHtml(task.task_type || 'სხვა')}</td>
        <td><span class="status-pill ${task.priority === 'urgent' ? 'danger' : 'neutral'}">${task.priority === 'urgent' ? 'სასწრაფო' : 'ნორმალური'}</span></td>
        <td>
          <select class="filter-select task-status-inline-select" data-task-id="${task.id}" style="height:28px;font-size:11px">
            <option value="new" ${task.status === 'new' ? 'selected' : ''}>ახალი</option>
            <option value="in_progress" ${task.status === 'in_progress' ? 'selected' : ''}>პროცესშია</option>
            <option value="pending_approval" ${task.status === 'pending_approval' ? 'selected' : ''}>ელოდება</option>
            <option value="completed" ${task.status === 'completed' ? 'selected' : ''}>დასრულებული</option>
          </select>
        </td>
        <td style="text-align:right">
          <button class="btn link smallbtn btn-task-view-detail" data-task-id="${task.id}" style="font-size:12px">ბინაზე გადასვლა ↗</button>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('select')) return;
        if (task.apartment_id) {
          selectedAptId = task.apartment_id;
          switchView('apartments');
        }
      });

      tbody.appendChild(tr);
    });

    // Inline status change handler
    $$('.task-status-inline-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const taskId = sel.dataset.taskId;
        const newStatus = sel.value;
        const task = tasks.find(t => t.id === taskId);
        
        await window.supabaseClient.from('tasks').update({ status: newStatus }).eq('id', taskId);
        if (task) {
          task.status = newStatus;
          await window.RigzeaStore.logActivity(task.apartment_id, 'task_status_changed', `საქმის სტატუსი: ${newStatus}`, task.title);
        }
        showToast('სტატუსი განახლდა', 'success');
        renderDashboardView();
      });
    });
  }

  $('task-filter-status')?.addEventListener('change', () => renderTasksView());
  $('btn-open-task-create-modal')?.addEventListener('click', () => openTaskModal());
  $('btn-quick-new-task')?.addEventListener('click', () => openTaskModal());

  // Telegram Smart Natural Language Parser
  $('btn-parse-telegram')?.addEventListener('click', () => {
    const rawText = $('telegram-input-box').value.trim();
    if (!rawText) {
      showToast('შეიყვანე შეტყობინების ტექსტი', 'error');
      return;
    }

    const { apartments } = window.RigzeaStore;
    let matchedApt = null;

    // Match apartment by unit number or name
    for (const apt of apartments) {
      const unit = apt.unit_number || apt.name.match(/\d+/)?.[0];
      if (unit && rawText.includes(unit)) {
        matchedApt = apt;
        break;
      }
      if (rawText.toLowerCase().includes(apt.name.toLowerCase())) {
        matchedApt = apt;
        break;
      }
    }

    if (!matchedApt && apartments.length > 0) {
      matchedApt = apartments[0];
    }

    // Extract amount: e.g. "170 ლარი", "170ლ", "₾170", "170"
    const amountMatch = rawText.match(/(\d+)\s*(ლარი|ლ|₾)?/);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : 0;

    // Extract issue title
    let issueTitle = rawText.replace(/\d+/g, '').replace(/ლარი|ლ|₾|-ში|ში|გაფუჭდა|არის/g, '').trim();
    if (!issueTitle) issueTitle = 'რემონტი / ოპერაციული საქმე';

    parsedTelegramTask = {
      apartmentId: matchedApt?.id,
      apartmentName: matchedApt?.name || 'ბინა',
      amount: amount,
      title: issueTitle,
      rawText: rawText
    };

    $('parsed-apt-name').textContent = parsedTelegramTask.apartmentName;
    $('parsed-amount-val').textContent = window.RigzeaUtils.formatMoney(amount);
    $('parsed-issue-title').textContent = issueTitle;
    $('parse-result-notice').style.display = 'block';
  });

  // Confirm Telegram Parsed Task & Persist to Supabase
  $('btn-confirm-parsed-task')?.addEventListener('click', async () => {
    if (!parsedTelegramTask || !parsedTelegramTask.apartmentId) return;
    const org = window.RigzeaStore.currentOrg;
    const btn = $('btn-confirm-parsed-task');
    btn.disabled = true;
    btn.textContent = 'იქმნება...';

    // 1. Create Task
    const { data: task, error: taskErr } = await window.supabaseClient.from('tasks').insert({
      organization_id: org.id,
      apartment_id: parsedTelegramTask.apartmentId,
      title: parsedTelegramTask.title,
      description: `წყარო: Telegram შეტყობინება — „${parsedTelegramTask.rawText}“`,
      task_type: 'repair',
      status: parsedTelegramTask.amount > 0 ? 'pending_approval' : 'new',
      estimated_cost: parsedTelegramTask.amount
    }).select().single();

    // 2. If cost > 0, create Repair & Approval request
    if (parsedTelegramTask.amount > 0) {
      const apt = window.RigzeaStore.apartments.find(a => a.id === parsedTelegramTask.apartmentId);
      const { data: approval } = await window.supabaseClient.from('approvals').insert({
        organization_id: org.id,
        apartment_id: parsedTelegramTask.apartmentId,
        owner_id: apt?.owner_id,
        issue_title: parsedTelegramTask.title,
        description: parsedTelegramTask.rawText,
        amount: parsedTelegramTask.amount,
        status: 'pending'
      }).select().single();

      await window.RigzeaStore.logActivity(
        parsedTelegramTask.apartmentId,
        'approval_requested',
        `თანხმობის მოთხოვნა: ${parsedTelegramTask.title}`,
        `თანხა: ₾${parsedTelegramTask.amount}`
      );
    } else {
      await window.RigzeaStore.logActivity(
        parsedTelegramTask.apartmentId,
        'task_created',
        `ახალი საქმე: ${parsedTelegramTask.title}`
      );
    }

    btn.disabled = false;
    btn.textContent = 'შექმნა და ბაზაში შენახვა ✓';
    $('parse-result-notice').style.display = 'none';
    $('telegram-input-box').value = '';
    showToast('საქმე შეიქმნა და შეინახა ბაზაში!', 'success');

    await loadAndRenderAll();
  });

  // =========================================================================
  // 7. VIEW: მფლობელები (OWNERS & PUBLIC APPROVAL LINKS)
  // =========================================================================

  function renderOwnersView() {
    const { owners, apartments, approvals } = window.RigzeaStore;
    const tbody = $('owners-table-tbody');
    tbody.innerHTML = '';
    $('owners-count-badge').textContent = `${owners.length} მესაკუთრე`;

    if (owners.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4">
            <div class="empty-state-box">
              <div class="empty-state-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              </div>
              <h4 class="empty-state-title">მფლობელები არ არიან რეგისტრირებული</h4>
              <p class="empty-state-desc">დაამატეთ მფლობელი საკონტაქტო მონაცემებით და მიაბით ბინებს.</p>
              <button class="btn smallbtn" id="btn-empty-add-owner">+ მფლობელის დამატება</button>
            </div>
          </td>
        </tr>
      `;
      $('btn-empty-add-owner')?.addEventListener('click', () => openOwnerModal());
      renderOwnerDetail(null);
      return;
    }

    if (!selectedOwnerId || !owners.some(o => o.id === selectedOwnerId)) {
      selectedOwnerId = owners[0].id;
    }

    owners.forEach(owner => {
      const linkedApts = apartments.filter(a => a.owner_id === owner.id);
      const aptNames = linkedApts.map(a => a.name).join(', ') || 'არ არის მიბმული';
      const isSelected = owner.id === selectedOwnerId;

      const tr = document.createElement('tr');
      tr.className = `clickable ${isSelected ? 'selected-row' : ''}`;
      tr.style.cursor = 'pointer';
      tr.innerHTML = `
        <td><strong>${escapeHtml(owner.name)}</strong></td>
        <td>${escapeHtml(owner.phone || owner.email || '—')}</td>
        <td>${escapeHtml(aptNames)}</td>
        <td><button class="btn link smallbtn" style="font-size:12px">პროფილი ↗</button></td>
      `;
      tr.addEventListener('click', () => {
        selectedOwnerId = owner.id;
        renderOwnersView();
      });
      tbody.appendChild(tr);
    });

    const currentOwner = owners.find(o => o.id === selectedOwnerId);
    renderOwnerDetail(currentOwner);
  }

  function renderOwnerDetail(owner) {
    const body = $('owner-detail-body');
    if (!owner) {
      $('owner-detail-title').textContent = 'მფლობელის პროფილი';
      body.innerHTML = `<div class="empty-state-box"><p class="empty-state-desc">მფლობელი არ არის არჩეული</p></div>`;
      return;
    }

    const { apartments, approvals } = window.RigzeaStore;
    const linkedApts = apartments.filter(a => a.owner_id === owner.id);
    const ownerApprovals = approvals.filter(a => a.owner_id === owner.id || linkedApts.some(apt => apt.id === a.apartment_id));

    $('owner-detail-title').textContent = `${owner.name}`;

    body.innerHTML = `
      <div style="margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--line)">
        <div style="font-size:12px;color:var(--muted)">კონტაქტი:</div>
        <div style="font-size:14px;font-weight:600">${escapeHtml(owner.phone || 'ტელეფონი არ არის')} · ${escapeHtml(owner.email || 'ელფოსტა არ არის')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">სასურველი ენა: ${owner.preferred_language === 'en' ? 'English' : 'ქართული'}</div>
      </div>

      <div style="margin-bottom:20px">
        <strong style="font-size:13px;display:block;margin-bottom:8px">მიბმული ბინები (${linkedApts.length}):</strong>
        ${linkedApts.length === 0 ? '<span style="color:var(--muted);font-size:12px">ბინა არ არის მიბმული</span>' :
          linkedApts.map(a => `<div style="background:var(--surface-subtle);padding:8px 12px;border-radius:8px;font-size:13px;margin-bottom:6px;cursor:pointer" class="btn-jump-to-apt" data-apt-id="${a.id}">🏢 <strong>${escapeHtml(a.name)}</strong> · ${escapeHtml(a.address)}</div>`).join('')
        }
      </div>

      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong style="font-size:13px">თანხმობის მოთხოვნები და ბმულები:</strong>
          <button class="btn smallbtn" id="btn-owner-new-approval" style="font-size:11px">+ მოთხოვნა</button>
        </div>

        ${ownerApprovals.length === 0 ? '<div style="color:var(--muted);font-size:12px;padding:12px 0">თანხმობის მოთხოვნები არ არის</div>' :
          ownerApprovals.map(appr => {
            const publicUrl = `${window.location.origin}/approve/?token=${appr.token}`;
            const statusLabel = appr.status === 'approved' ? '<span class="status-pill done">დადასტურებულია</span>' : (appr.status === 'declined' ? '<span class="status-pill danger">უარყოფილია</span>' : '<span class="status-pill wait">ელოდება</span>');
            return `
              <div style="border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px;background:var(--surface)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <strong style="font-size:13px">${escapeHtml(appr.issue_title || 'რემონტი')}</strong>
                    <div style="font-size:12px;color:var(--muted)">თანხა: <strong class="num-tabular" style="color:var(--amber)">₾${Number(appr.amount || 0)}</strong></div>
                  </div>
                  ${statusLabel}
                </div>
                <div style="display:flex;gap:8px;margin-top:10px">
                  <button class="btn secondary smallbtn btn-copy-approval-link" data-url="${publicUrl}" style="flex:1;font-size:11px">🔗 ბმულის კოპირება</button>
                  <a href="${publicUrl}" target="_blank" class="btn link smallbtn" style="font-size:11px;align-self:center">გახსნა ↗</a>
                </div>
              </div>
            `;
          }).join('')
        }
      </div>
    `;

    // Bind apartment jump
    $$('.btn-jump-to-apt').forEach(el => {
      el.addEventListener('click', () => {
        selectedAptId = el.dataset.aptId;
        switchView('apartments');
      });
    });

    // Bind link copy buttons
    $$('.btn-copy-approval-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        navigator.clipboard.writeText(url);
        showToast('თანხმობის ბმული დაკოპირდა! გაუგზავნე მფლობელს.', 'success');
      });
    });

    $('btn-owner-new-approval')?.addEventListener('click', () => {
      openApprovalModal(linkedApts[0]?.id);
    });
  }

  $('btn-add-owner-modal')?.addEventListener('click', () => openOwnerModal());

  // =========================================================================
  // 8. VIEW: ანგარიშები (REPORTS & FINANCIAL LEDGER)
  // =========================================================================

  function renderReportsView() {
    const { apartments, expenses, income } = window.RigzeaStore;
    const aptSelect = $('report-apt-select');
    const period = $('report-period-select')?.value || '2026-10';

    // Populate apartments in report select
    aptSelect.innerHTML = '';
    apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if (selectedAptId && apt.id === selectedAptId) opt.selected = true;
      aptSelect.appendChild(opt);
    });

    const targetAptId = aptSelect.value || apartments[0]?.id;
    const targetApt = apartments.find(a => a.id === targetAptId);
    const owner = window.RigzeaStore.owners.find(o => o.id === targetApt?.owner_id);

    // Calculate totals for target apartment and period
    const filteredIncome = income.filter(i => (!targetAptId || i.apartment_id === targetAptId) && (i.income_date || '').startsWith(period));
    const filteredExpenses = expenses.filter(e => (!targetAptId || e.apartment_id === targetAptId) && (e.expense_date || '').startsWith(period));

    const totalIncome = filteredIncome.reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const netResult = totalIncome - totalExpenses;

    // Update Document Header
    $('report-doc-title').textContent = `${period} ანგარიში · ${targetApt?.name || 'ყველა ბინა'}`;
    $('report-doc-sub').textContent = `მფლობელი: ${owner ? owner.name : '—'} · სისტემა: რიგზეა`;

    // Update KPI Tiles
    $('report-val-income').textContent = window.RigzeaUtils.formatMoney(totalIncome);
    $('report-val-expense').textContent = window.RigzeaUtils.formatMoney(totalExpenses);
    $('report-val-net').textContent = window.RigzeaUtils.formatMoney(netResult);

    // Populate Itemized List
    const entriesMount = $('report-entries-mount');
    entriesMount.innerHTML = '';

    if (filteredExpenses.length === 0) {
      entriesMount.innerHTML = `<div style="padding:18px 0;color:var(--muted);text-align:center;font-size:12px">არჩეულ პერიოდში ხარჯები არ არის დაფიქსირებული</div>`;
    } else {
      filteredExpenses.forEach(exp => {
        const row = document.createElement('div');
        row.className = 'expense-entry-row';
        row.innerHTML = `
          <time>${window.RigzeaUtils.formatDate(exp.expense_date)}</time>
          <div class="exp-desc">
            <strong>${escapeHtml(exp.description)}</strong>
            <span>კატეგორია: ${escapeHtml(exp.category || 'სხვა')} · მიმღები: ${escapeHtml(exp.vendor || '—')}</span>
          </div>
          <strong class="num-tabular exp-amount" style="color:var(--amber)">${window.RigzeaUtils.formatMoney(exp.amount)}</strong>
        `;
        entriesMount.appendChild(row);
      });
    }
  }

  $('report-apt-select')?.addEventListener('change', () => renderReportsView());
  $('report-period-select')?.addEventListener('change', () => renderReportsView());
  $('btn-add-income-modal')?.addEventListener('click', () => openIncomeModal());
  $('btn-add-expense-modal')?.addEventListener('click', () => openExpenseModal());
  $('btn-print-report')?.addEventListener('click', () => window.print());

  $('btn-finalize-snapshot')?.addEventListener('click', async () => {
    const aptId = $('report-apt-select').value;
    const period = $('report-period-select').value;
    const org = window.RigzeaStore.currentOrg;
    if (!aptId || !org) return;

    const { data, error } = await window.supabaseClient.from('monthly_reports').insert({
      organization_id: org.id,
      apartment_id: aptId,
      period: period,
      total_income: parseFloat($('report-val-income').textContent.replace(/[₾,]/g, '')) || 0,
      total_expenses: parseFloat($('report-val-expense').textContent.replace(/[₾,]/g, '')) || 0,
      net_payout: parseFloat($('report-val-net').textContent.replace(/[₾,]/g, '')) || 0,
      status: 'finalized'
    }).select().single();

    if (error) {
      showToast('შეცდომა ანგარიშის დაფიქსირებისას: ' + error.message, 'error');
    } else {
      showToast('თვის ანგარიში დაფიქსირდა (Snapshot შენახულია)!', 'success');
      $('report-finalized-badge').textContent = 'დამოწმებულია ✓';
    }
  });

  // =========================================================================
  // 9. VIEW: მდგომარეობის აქტები (CONDITION REPORTS)
  // =========================================================================

  async function renderConditionReportsView() {
    const org = window.RigzeaStore.currentOrg;
    if (!org) return;

    const { data: reports } = await window.supabaseClient
      .from('condition_reports')
      .select('*')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false });

    const tbody = $('condition-reports-tbody');
    tbody.innerHTML = '';
    const allReports = reports || [];
    $('condition-count-badge').textContent = `${allReports.length} აქტი`;

    if (allReports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:24px">აქტები არ არის შექმნილი</td></tr>`;
      renderConditionReportDetail(null);
      return;
    }

    if (!selectedConditionId || !allReports.some(r => r.id === selectedConditionId)) {
      selectedConditionId = allReports[0].id;
    }

    allReports.forEach(rep => {
      const apt = window.RigzeaStore.apartments.find(a => a.id === rep.apartment_id);
      const isSelected = rep.id === selectedConditionId;
      const typeMap = { move_in: 'შესახლება', move_out: 'გასვლა', inspection: 'შემოწმება' };

      const tr = document.createElement('tr');
      tr.className = `clickable ${isSelected ? 'selected-row' : ''}`;
      tr.innerHTML = `
        <td>${window.RigzeaUtils.formatDate(rep.created_at)}</td>
        <td><strong>${escapeHtml(apt?.name || '—')}</strong></td>
        <td><span class="status-pill neutral">${typeMap[rep.report_type] || rep.report_type}</span></td>
        <td>${escapeHtml(rep.inspector_name || 'მმართველი')}</td>
        <td><button class="btn link smallbtn" style="font-size:12px">ნახვა ↗</button></td>
      `;
      tr.addEventListener('click', () => {
        selectedConditionId = rep.id;
        renderConditionReportsView();
      });
      tbody.appendChild(tr);
    });

    const targetRep = allReports.find(r => r.id === selectedConditionId);
    renderConditionReportDetail(targetRep);
  }

  function renderConditionReportDetail(rep) {
    const body = $('condition-view-body');
    if (!rep) {
      $('condition-view-title').textContent = 'აქტის დოკუმენტი';
      body.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--muted)">აირჩიე აქტი მარცხენა სიიდან</div>`;
      return;
    }

    const apt = window.RigzeaStore.apartments.find(a => a.id === rep.apartment_id);
    const typeMap = { move_in: 'შესახლების აქტი (Move-in)', move_out: 'გასვლის აქტი (Move-out)', inspection: 'პერიოდული შემოწმების აქტი' };

    $('condition-view-title').textContent = `${typeMap[rep.report_type] || 'აქტი'} · ${apt?.name || 'ბინა'}`;

    const items = rep.checklist_items || {};
    const meters = rep.meter_readings || {};

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px">
        <div>
          <strong style="font-size:15px">${escapeHtml(apt?.name || 'ბინა')}</strong>
          <div style="font-size:12px;color:var(--muted)">მისამართი: ${escapeHtml(apt?.address || '—')}</div>
        </div>
        <div style="text-align:right;font-size:12px">
          <div>თარიღი: <strong>${window.RigzeaUtils.formatDateTime(rep.created_at)}</strong></div>
          <div>შემმოწმებელი: <strong>${escapeHtml(rep.inspector_name || 'მმართველი')}</strong></div>
        </div>
      </div>

      <div style="margin-bottom:18px">
        <strong style="font-size:13px;display:block;margin-bottom:8px">ოთახების მდგომარეობა:</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
          <div style="background:var(--surface-subtle);padding:8px 12px;border-radius:6px">მისაღები: <strong>${escapeHtml(items.living_room?.status || 'იდეალური')}</strong> ${items.living_room?.note ? '— ' + escapeHtml(items.living_room.note) : ''}</div>
          <div style="background:var(--surface-subtle);padding:8px 12px;border-radius:6px">საძინებელი: <strong>${escapeHtml(items.bedroom?.status || 'იდეალური')}</strong> ${items.bedroom?.note ? '— ' + escapeHtml(items.bedroom.note) : ''}</div>
          <div style="background:var(--surface-subtle);padding:8px 12px;border-radius:6px">სამზარეულო: <strong>${escapeHtml(items.kitchen?.status || 'იდეალური')}</strong> ${items.kitchen?.note ? '— ' + escapeHtml(items.kitchen.note) : ''}</div>
          <div style="background:var(--surface-subtle);padding:8px 12px;border-radius:6px">აბაზანა: <strong>${escapeHtml(items.bathroom?.status || 'იდეალური')}</strong> ${items.bathroom?.note ? '— ' + escapeHtml(items.bathroom.note) : ''}</div>
        </div>
      </div>

      <div>
        <strong style="font-size:13px;display:block;margin-bottom:8px">მრიცხველების ჩვენებები:</strong>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">
          <div style="background:var(--surface-subtle);padding:10px;border-radius:6px">
            <span style="font-size:11px;color:var(--muted);display:block">ელექტროენერგია</span>
            <strong class="num-tabular">${escapeHtml(meters.electric || '—')} kWh</strong>
          </div>
          <div style="background:var(--surface-subtle);padding:10px;border-radius:6px">
            <span style="font-size:11px;color:var(--muted);display:block">წყალი</span>
            <strong class="num-tabular">${escapeHtml(meters.water || '—')} m³</strong>
          </div>
          <div style="background:var(--surface-subtle);padding:10px;border-radius:6px">
            <span style="font-size:11px;color:var(--muted);display:block">ბუნებრივი აირი</span>
            <strong class="num-tabular">${escapeHtml(meters.gas || '—')} m³</strong>
          </div>
        </div>
      </div>
    `;
  }

  $('btn-create-condition-modal')?.addEventListener('click', () => openConditionModal());
  $('btn-print-condition')?.addEventListener('click', () => window.print());

  // =========================================================================
  // 10. VIEW: პარამეტრები (SETTINGS)
  // =========================================================================

  async function renderSettingsView() {
    const org = window.RigzeaStore.currentOrg;
    const content = $('settings-tab-content');
    if (!org || !content) return;

    $$('[data-settings-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.settingsTab === settingsSubTab);
    });

    if (settingsSubTab === 'company') {
      content.innerHTML = `
        <div style="max-width:480px">
          <h3 style="font-size:16px;margin:0 0 14px">კომპანიის პარამეტრები</h3>
          <form id="form-update-org" onsubmit="return false;">
            <div class="form-group">
              <label for="set-org-name">კომპანიის დასახელება</label>
              <input type="text" id="set-org-name" class="form-input" value="${escapeHtml(org.name)}" required />
            </div>
            <div class="form-group">
              <label for="set-org-city">ძირითადი ქალაქი</label>
              <select id="set-org-city" class="form-input">
                <option value="ბათუმი" ${org.city === 'ბათუმი' ? 'selected' : ''}>ბათუმი</option>
                <option value="თბილისი" ${org.city === 'თბილისი' ? 'selected' : ''}>თბილისი</option>
                <option value="სხვა" ${org.city === 'სხვა' ? 'selected' : ''}>სხვა</option>
              </select>
            </div>
            <button class="btn smallbtn" id="btn-save-org-settings" style="margin-top:8px">შენახვა ↗</button>
          </form>
        </div>
      `;

      $('btn-save-org-settings')?.addEventListener('click', async () => {
        const name = $('set-org-name').value.trim();
        const city = $('set-org-city').value;
        await window.supabaseClient.from('organizations').update({ name, city }).eq('id', org.id);
        org.name = name;
        org.city = city;
        showToast('კომპანიის მონაცემები განახლდა', 'success');
        renderOrgSelector();
      });
    } else if (settingsSubTab === 'team') {
      // Team Members & Invitations
      const { data: members } = await window.supabaseClient
        .from('organization_members')
        .select('*')
        .eq('organization_id', org.id);

      const roleMap = { owner: 'მფლობელი / ადმინი', admin: 'ადმინისტრატორი', manager: 'მენეჯერი', staff: 'თანამშრომელი' };

      content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div>
            <h3 style="font-size:16px;margin:0 0 4px">გუნდის წევრები</h3>
            <p style="font-size:12px;color:var(--muted);margin:0">მართეთ წვდომის დონეები და მოიწვიეთ კოლეგები</p>
          </div>
          <button class="btn smallbtn" id="btn-open-invite-modal">+ წევრის მოწვევა</button>
        </div>

        <div class="data-table-wrapper">
          <table class="operational-table">
            <thead>
              <tr><th>სახელი</th><th>როლი</th><th>სტატუსი</th></tr>
            </thead>
            <tbody>
              ${(members || []).map(m => `
                <tr>
                  <td><strong>${escapeHtml(m.display_name || 'მომხმარებელი')}</strong></td>
                  <td>${roleMap[m.role] || m.role}</td>
                  <td><span class="status-pill done">აქტიური</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      $('btn-open-invite-modal')?.addEventListener('click', () => {
        $('modal-invite-member').style.display = 'flex';
      });
    } else if (settingsSubTab === 'telegram') {
      content.innerHTML = `
        <div style="max-width:580px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="font-size:16px;margin:0">Telegram ბოტის ინტეგრაცია</h3>
            <span class="status-pill done" style="display:flex;align-items:center;gap:4px">
              <span style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span>
              ბოტი ონლაინშია (@Rigzea_bot)
            </span>
          </div>
          <p style="font-size:13px;color:var(--ink-secondary);line-height:1.6;margin:0 0 16px">
            დააკავშირეთ Telegram ბოტი თქვენს სამუშაო ჩათთან. ნებისმიერი შეტყობინება (ხარჯი, რემონტი, დასუფთავება) ავტომატურად გადაიქცევა სტრუქტურირებულ საქმედ და აისახება ბინის ისტორიაში.
          </p>

          <div style="background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:18px">
            <div style="font-weight:600;margin-bottom:10px;color:var(--ink)">სწრაფი დაკავშირების ინსტრუქცია:</div>
            <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;color:var(--ink)">
              <li>გახსენით ბოტი Telegram-ში: <a href="https://t.me/Rigzea_bot" target="_blank" style="color:var(--brand);font-weight:600">@Rigzea_bot ↗</a></li>
              <li>დააჭირეთ <strong>/start</strong></li>
              <li>გაუგზავნეთ თქვენი კომპანიის გასაღები: <br/>
                <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
                  <code style="background:var(--surface-subtle);color:var(--green);font-weight:600;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;padding:6px 12px;border:1px solid var(--line);border-radius:6px;font-size:12px;user-select:all">${org.id}</code>
                  <button class="btn secondary smallbtn" id="btn-copy-org-tg-key" style="font-size:11px;padding:4px 10px">კოპირება 📋</button>
                </div>
              </li>
            </ol>
          </div>

          <div style="display:flex;gap:10px">
            <a href="https://t.me/Rigzea_bot?start=${org.id}" target="_blank" class="btn smallbtn" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
              Telegram-ში დაკავშირება ↗
            </a>
          </div>
        </div>
      `;

      $('btn-copy-org-tg-key')?.addEventListener('click', () => {
        navigator.clipboard.writeText(org.id);
        showToast('კომპანიის გასაღები დაკოპირდა!', 'success');
      });
    } else if (settingsSubTab === 'plans') {
      const aptCount = window.RigzeaStore.apartments.length;
      content.innerHTML = `
        <div style="max-width:600px">
          <h3 style="font-size:16px;margin:0 0 8px">გამოწერა და საოპერაციო ლიმიტები</h3>
          
          <div style="background:var(--surface-subtle);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div>
                <strong style="font-size:16px">გეგმა: გუნდი (Standard)</strong>
                <div style="font-size:12px;color:var(--muted)">₾199 / თვეში · 40 ბინამდე</div>
              </div>
              <span class="status-pill done">აქტიური</span>
            </div>
            
            <div style="margin-top:12px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span>პორტფელის გამოყენება:</span>
                <strong>${aptCount} / 40 ბინა</strong>
              </div>
              <div style="height:8px;background:var(--line);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${Math.min(100, (aptCount / 40) * 100)}%;background:var(--green)"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  $$('[data-settings-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      settingsSubTab = btn.dataset.settingsTab;
      renderSettingsView();
    });
  });

  // =========================================================================
  // 11. GLOBAL SEARCH CONTROLLER (`/` shortcut)
  // =========================================================================

  function openGlobalSearch() {
    $('modal-global-search').style.display = 'flex';
    const input = $('global-search-input');
    input.value = '';
    input.focus();
    $('global-search-results').innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">აკრიფე საძიებო სიტყვა...</div>`;
  }

  $('btn-global-search-trigger')?.addEventListener('click', openGlobalSearch);

  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });

  $('global-search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const mount = $('global-search-results');
    if (!q) {
      mount.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">აკრიფე საძიებო სიტყვა...</div>`;
      return;
    }

    const { apartments, owners, tasks } = window.RigzeaStore;
    const matchedApts = apartments.filter(a => a.name.toLowerCase().includes(q) || a.address.toLowerCase().includes(q));
    const matchedOwners = owners.filter(o => o.name.toLowerCase().includes(q) || (o.phone && o.phone.includes(q)));
    const matchedTasks = tasks.filter(t => t.title.toLowerCase().includes(q));

    let html = '';

    if (matchedApts.length > 0) {
      html += `<div class="search-result-group-title">ბინები</div>`;
      matchedApts.forEach(apt => {
        html += `
          <div class="search-result-row" data-action="apt" data-id="${apt.id}">
            <div><strong>🏢 ${escapeHtml(apt.name)}</strong><br/><small style="color:var(--muted)">${escapeHtml(apt.address)}</small></div>
            <span class="status-pill done" style="font-size:10px">ბინა</span>
          </div>
        `;
      });
    }

    if (matchedOwners.length > 0) {
      html += `<div class="search-result-group-title">მფლობელები</div>`;
      matchedOwners.forEach(owner => {
        html += `
          <div class="search-result-row" data-action="owner" data-id="${owner.id}">
            <div><strong>👤 ${escapeHtml(owner.name)}</strong><br/><small style="color:var(--muted)">${escapeHtml(owner.phone || owner.email || '')}</small></div>
            <span class="status-pill neutral" style="font-size:10px">მფლობელი</span>
          </div>
        `;
      });
    }

    if (matchedTasks.length > 0) {
      html += `<div class="search-result-group-title">საქმეები</div>`;
      matchedTasks.forEach(task => {
        html += `
          <div class="search-result-row" data-action="task" data-id="${task.id}">
            <div><strong>≡ ${escapeHtml(task.title)}</strong><br/><small style="color:var(--muted)">სტატუსი: ${task.status}</small></div>
            <span class="status-pill wait" style="font-size:10px">საქმე</span>
          </div>
        `;
      });
    }

    if (!html) {
      mount.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">შედეგები არ მოიძებნა</div>`;
      return;
    }

    mount.innerHTML = html;

    $$('.search-result-row').forEach(row => {
      row.addEventListener('click', () => {
        const action = row.dataset.action;
        const id = row.dataset.id;
        closeAllModals();

        if (action === 'apt') {
          selectedAptId = id;
          switchView('apartments');
        } else if (action === 'owner') {
          selectedOwnerId = id;
          switchView('owners');
        } else if (action === 'task') {
          switchView('tasks');
        }
      });
    });
  });

  // =========================================================================
  // 12. IN-APP NOTIFICATIONS
  // =========================================================================

  function renderNotificationsBadge() {
    const notifs = window.RigzeaStore.notifications || [];
    const unread = notifs.filter(n => !n.is_read);
    const badge = $('notif-badge-count');
    if (unread.length > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread.length;
    } else {
      badge.style.display = 'none';
    }
  }

  $('btn-notif-bell')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('notif-panel');
    const isVisible = panel.style.display === 'block';
    panel.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      const mount = $('notif-items-mount');
      const notifs = window.RigzeaStore.notifications || [];
      if (notifs.length === 0) {
        mount.innerHTML = `<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">შეტყობინებები არ არის</div>`;
      } else {
        mount.innerHTML = notifs.map(n => `
          <div class="notif-item ${n.is_read ? '' : 'unread'}">
            <strong>${escapeHtml(n.title)}</strong>
            <p style="margin:2px 0 0;color:var(--ink-secondary)">${escapeHtml(n.body || '')}</p>
            <time style="font-size:10px;color:var(--muted)">${window.RigzeaUtils.formatDateTime(n.created_at)}</time>
          </div>
        `).join('');
      }
    }
  });

  document.addEventListener('click', (e) => {
    const panel = $('notif-panel');
    if (panel && !panel.contains(e.target) && e.target !== $('btn-notif-bell')) {
      panel.style.display = 'none';
    }
  });

  $('btn-mark-all-read')?.addEventListener('click', async () => {
    const user = window.RigzeaStore.user;
    if (!user) return;
    await window.supabaseClient.from('notifications').update({ is_read: true }).eq('user_id', user.id);
    window.RigzeaStore.notifications.forEach(n => n.is_read = true);
    renderNotificationsBadge();
    $('notif-panel').style.display = 'none';
    showToast('შეტყობინებები მონიშნულია წაკითხულად', 'normal');
  });

  // =========================================================================
  // 13. MODALS (CREATE/EDIT CRUD ACTIONS)
  // =========================================================================

  function closeAllModals() {
    $$('.modal-overlay').forEach(m => m.style.display = 'none');
  }

  $$('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Modal: Apartment Add / Edit
  function openApartmentModal(aptId = null) {
    const org = window.RigzeaStore.currentOrg;
    if (!org) return;

    $('edit-apt-id').value = aptId || '';
    $('modal-apt-title-header').textContent = aptId ? 'ბინის რედაქტირება' : 'ახალი ბინის დამატება';

    // Populate owners in select
    const ownerSelect = $('apt-owner-select');
    ownerSelect.innerHTML = '<option value="">— მფლობელის გარეშე —</option>';
    window.RigzeaStore.owners.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.name;
      ownerSelect.appendChild(opt);
    });

    if (aptId) {
      const apt = window.RigzeaStore.apartments.find(a => a.id === aptId);
      if (apt) {
        $('apt-name-input').value = apt.name;
        $('apt-city-select').value = apt.city || 'ბათუმი';
        $('apt-unit-input').value = apt.unit_number || '';
        $('apt-address-input').value = apt.address;
        $('apt-owner-select').value = apt.owner_id || '';
        $('apt-access-input').value = apt.access_instructions || '';
      }
    } else {
      $('apt-name-input').value = '';
      $('apt-unit-input').value = '';
      $('apt-address-input').value = '';
      $('apt-access-input').value = '';
    }

    $('modal-apartment').style.display = 'flex';
  }

  $('btn-save-apartment-submit')?.addEventListener('click', async () => {
    const aptId = $('edit-apt-id').value;
    const name = $('apt-name-input').value.trim();
    const city = $('apt-city-select').value;
    const unit = $('apt-unit-input').value.trim();
    const address = $('apt-address-input').value.trim();
    const ownerId = $('apt-owner-select').value || null;
    const access = $('apt-access-input').value.trim();
    const org = window.RigzeaStore.currentOrg;

    if (!name || !address) {
      showToast('შეიყვანე ბინის სახელწოდება და მისამართი', 'error');
      return;
    }

    const payload = {
      organization_id: org.id,
      name,
      city,
      unit_number: unit,
      address,
      owner_id: ownerId,
      access_instructions: access,
      status: 'active'
    };

    if (aptId) {
      await window.supabaseClient.from('apartments').update(payload).eq('id', aptId);
      await window.RigzeaStore.logActivity(aptId, 'apartment_updated', 'ბინის მონაცემები განახლდა', name);
      showToast('ბინის მონაცემები განახლდა', 'success');
    } else {
      const { data: newApt } = await window.supabaseClient.from('apartments').insert(payload).select().single();
      if (newApt) {
        selectedAptId = newApt.id;
        await window.RigzeaStore.logActivity(newApt.id, 'apartment_created', 'ახალი ბინა დაემატა', name);
      }
      showToast('ახალი ბინა წარმატებით დაემატა', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Task Add
  function openTaskModal(aptId = null) {
    const select = $('task-apt-select');
    select.innerHTML = '';
    window.RigzeaStore.apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if ((aptId && apt.id === aptId) || (!aptId && selectedAptId === apt.id)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    $('task-title-input').value = '';
    $('task-assignee-input').value = '';
    $('task-cost-input').value = '';
    $('task-desc-input').value = '';
    $('modal-task').style.display = 'flex';
  }

  $('btn-save-task-submit')?.addEventListener('click', async () => {
    const title = $('task-title-input').value.trim();
    const aptId = $('task-apt-select').value;
    const type = $('task-type-select').value;
    const assignee = $('task-assignee-input').value.trim();
    const cost = parseFloat($('task-cost-input').value) || 0;
    const desc = $('task-desc-input').value.trim();
    const org = window.RigzeaStore.currentOrg;

    if (!title || !aptId) {
      showToast('შეიყვანე საქმის დასახელება', 'error');
      return;
    }

    const { data: task, error } = await window.supabaseClient.from('tasks').insert({
      organization_id: org.id,
      apartment_id: aptId,
      title,
      task_type: type,
      assigned_to: assignee,
      estimated_cost: cost,
      description: desc,
      status: 'new'
    }).select().single();

    if (!error && task) {
      await window.RigzeaStore.logActivity(aptId, 'task_created', `ახალი საქმე: ${title}`, desc);
      showToast('საქმე წარმატებით დაემატა', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Owner Add
  function openOwnerModal() {
    $('owner-name-input').value = '';
    $('owner-phone-input').value = '';
    $('owner-email-input').value = '';
    $('owner-notes-input').value = '';
    $('modal-owner').style.display = 'flex';
  }

  $('btn-save-owner-submit')?.addEventListener('click', async () => {
    const name = $('owner-name-input').value.trim();
    const phone = $('owner-phone-input').value.trim();
    const email = $('owner-email-input').value.trim();
    const lang = $('owner-lang-select').value;
    const notes = $('owner-notes-input').value.trim();
    const org = window.RigzeaStore.currentOrg;

    if (!name) {
      showToast('შეიყვანე მფლობელის სახელი', 'error');
      return;
    }

    const { data: owner, error } = await window.supabaseClient.from('owners').insert({
      organization_id: org.id,
      name,
      phone,
      email,
      preferred_language: lang,
      notes
    }).select().single();

    if (!error && owner) {
      selectedOwnerId = owner.id;
      showToast('მფლობელი წარმატებით დაემატა', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Expense Add
  function openExpenseModal(aptId = null) {
    const select = $('exp-apt-select');
    select.innerHTML = '';
    window.RigzeaStore.apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if (apt.id === (aptId || selectedAptId)) opt.selected = true;
      select.appendChild(opt);
    });

    $('exp-amount-input').value = '';
    $('exp-desc-input').value = '';
    $('exp-vendor-input').value = '';
    $('exp-date-input').value = new Date().toISOString().split('T')[0];
    $('modal-expense').style.display = 'flex';
  }

  $('btn-save-expense-submit')?.addEventListener('click', async () => {
    const aptId = $('exp-apt-select').value;
    const amount = parseFloat($('exp-amount-input').value);
    const cat = $('exp-category-select').value;
    const desc = $('exp-desc-input').value.trim();
    const vendor = $('exp-vendor-input').value.trim();
    const date = $('exp-date-input').value;
    const org = window.RigzeaStore.currentOrg;

    if (!amount || !desc || !date) {
      showToast('შეავსე თანხა, აღწერა და თარიღი', 'error');
      return;
    }

    const { data: exp, error } = await window.supabaseClient.from('expenses').insert({
      organization_id: org.id,
      apartment_id: aptId,
      amount,
      category: cat,
      description: desc,
      vendor,
      expense_date: date,
      status: 'confirmed'
    }).select().single();

    if (!error && exp) {
      await window.RigzeaStore.logActivity(aptId, 'expense_logged', `ხარჯი: ₾${amount} (${cat})`, desc);
      showToast('ხარჯი დაფიქსირდა', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Income Add
  function openIncomeModal(aptId = null) {
    const select = $('inc-apt-select');
    select.innerHTML = '';
    window.RigzeaStore.apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if (apt.id === (aptId || selectedAptId)) opt.selected = true;
      select.appendChild(opt);
    });

    $('inc-amount-input').value = '';
    $('inc-desc-input').value = '';
    $('inc-date-input').value = new Date().toISOString().split('T')[0];
    $('modal-income').style.display = 'flex';
  }

  $('btn-save-income-submit')?.addEventListener('click', async () => {
    const aptId = $('inc-apt-select').value;
    const amount = parseFloat($('inc-amount-input').value);
    const source = $('inc-source-select').value;
    const desc = $('inc-desc-input').value.trim();
    const date = $('inc-date-input').value;
    const org = window.RigzeaStore.currentOrg;

    if (!amount || !date) {
      showToast('შეავსე თანხა და თარიღი', 'error');
      return;
    }

    const { data: inc, error } = await window.supabaseClient.from('income').insert({
      organization_id: org.id,
      apartment_id: aptId,
      amount,
      source,
      description: desc,
      income_date: date
    }).select().single();

    if (!error && inc) {
      await window.RigzeaStore.logActivity(aptId, 'income_logged', `შემოსავალი: ₾${amount} (${source})`, desc);
      showToast('შემოსავალი დაფიქსირდა', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Approval / Repair Add
  function openApprovalModal(aptId = null) {
    const select = $('appr-apt-select');
    select.innerHTML = '';
    window.RigzeaStore.apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if (apt.id === (aptId || selectedAptId)) opt.selected = true;
      select.appendChild(opt);
    });

    $('appr-issue-input').value = '';
    $('appr-amount-input').value = '';
    $('appr-desc-input').value = '';
    $('modal-create-approval').style.display = 'flex';
  }

  $('btn-save-approval-submit')?.addEventListener('click', async () => {
    const aptId = $('appr-apt-select').value;
    const issue = $('appr-issue-input').value.trim();
    const amount = parseFloat($('appr-amount-input').value);
    const desc = $('appr-desc-input').value.trim();
    const org = window.RigzeaStore.currentOrg;
    const apt = window.RigzeaStore.apartments.find(a => a.id === aptId);

    if (!issue || !amount) {
      showToast('შეიყვანე საკითხი და თანხა', 'error');
      return;
    }

    const { data: appr, error } = await window.supabaseClient.from('approvals').insert({
      organization_id: org.id,
      apartment_id: aptId,
      owner_id: apt?.owner_id,
      issue_title: issue,
      description: desc,
      amount: amount,
      status: 'pending'
    }).select().single();

    if (!error && appr) {
      const link = `${window.location.origin}/approve/?token=${appr.token}`;
      await window.RigzeaStore.logActivity(aptId, 'approval_requested', `თანხმობის მოთხოვნა: ${issue}`, `თანხა: ₾${amount}`);
      navigator.clipboard.writeText(link);
      showToast('თანხმობის მოთხოვნა შეიქმნა და ბმული დაკოპირდა!', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Condition Report Add
  function openConditionModal() {
    const select = $('cond-apt-select');
    select.innerHTML = '';
    window.RigzeaStore.apartments.forEach(apt => {
      const opt = document.createElement('option');
      opt.value = apt.id;
      opt.textContent = apt.name;
      if (apt.id === selectedAptId) opt.selected = true;
      select.appendChild(opt);
    });

    $('modal-condition').style.display = 'flex';
  }

  $('btn-save-condition-submit')?.addEventListener('click', async () => {
    const aptId = $('cond-apt-select').value;
    const type = $('cond-type-select').value;
    const org = window.RigzeaStore.currentOrg;
    const member = window.RigzeaStore.currentMember;

    const checklistItems = {};
    $$('.cond-item-status').forEach(sel => {
      const room = sel.dataset.room;
      const noteInput = document.querySelector(`.cond-item-note[data-room="${room}"]`);
      checklistItems[room] = {
        status: sel.value,
        note: noteInput?.value.trim() || ''
      };
    });

    const meters = {
      electric: $('meter-electric').value.trim(),
      water: $('meter-water').value.trim(),
      gas: $('meter-gas').value.trim()
    };

    const { data: rep, error } = await window.supabaseClient.from('condition_reports').insert({
      organization_id: org.id,
      apartment_id: aptId,
      report_type: type,
      inspector_name: member?.display_name || 'მმართველი',
      checklist_items: checklistItems,
      meter_readings: meters
    }).select().single();

    if (!error && rep) {
      selectedConditionId = rep.id;
      await window.RigzeaStore.logActivity(aptId, 'condition_report_created', 'მდგომარეობის აქტი შეიქმნა');
      showToast('აქტი წარმატებით შეინახა ბაზაში', 'success');
    }

    closeAllModals();
    await loadAndRenderAll();
  });

  // Modal: Invite Team Member
  $('btn-submit-invite')?.addEventListener('click', async () => {
    const email = $('invite-email-input').value.trim();
    const role = $('invite-role-select').value;
    const org = window.RigzeaStore.currentOrg;

    if (!email) {
      showToast('შეიყვანე ელფოსტა', 'error');
      return;
    }

    const { error } = await window.supabaseClient.from('invitations').insert({
      organization_id: org.id,
      email,
      role
    });

    if (error) {
      showToast('მოწვევის შეცდომა: ' + error.message, 'error');
    } else {
      showToast(`მოწვევა გაიგზავნა ${email}-ზე`, 'success');
      closeAllModals();
      await renderSettingsView();
    }
  });

  // Modal: Send Report / Status to Owner (Rule 6 & Rule 18)
  function openSendOwnerReportModal(aptId = null) {
    const targetAptId = aptId || selectedAptId;
    const { apartments, owners, expenses, income, approvals } = window.RigzeaStore;
    const apt = apartments.find(a => a.id === targetAptId);
    if (!apt) {
      showToast('აირჩიეთ ბინა', 'error');
      return;
    }

    const owner = owners.find(o => o.id === apt.owner_id);
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthNamesGeo = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
    const monthLabel = `${monthNamesGeo[now.getMonth()]} ${now.getFullYear()}`;

    const aptIncome = income
      .filter(i => i.apartment_id === apt.id && (i.income_date || i.created_at || '').startsWith(currentMonthPrefix))
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const aptExpense = expenses
      .filter(e => e.apartment_id === apt.id && (e.expense_date || e.created_at || '').startsWith(currentMonthPrefix))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const aptNet = aptIncome - aptExpense;

    const pendingAppr = approvals.find(a => a.apartment_id === apt.id && a.status === 'pending');
    const approvalLink = pendingAppr ? `${window.location.origin}/approve/?token=${pendingAppr.token}` : '';

    $('send-owner-apt-sub').textContent = `ბინა: ${apt.name} · ${apt.address}`;
    $('send-owner-approval-link').value = approvalLink || 'ამ ეტაპზე ღია თანხმობა არ არის';

    let summaryText = `გამარჯობა ${owner ? owner.name : 'მესაკუთრე'}!\n` +
      `რიგზეას საოპერაციო რეპორტი ბინაზე: ${apt.name}\n` +
      `მისამართი: ${apt.address}\n\n` +
      `📊 ${monthLabel} თვის ფინანსური სურათი:\n` +
      `• შემოსავალი: ₾${aptIncome}\n` +
      `• ხარჯები: ₾${aptExpense}\n` +
      `• წმინდა შედეგი: ₾${aptNet}\n`;

    if (pendingAppr) {
      summaryText += `\n⚠️ დასადასტურებელია ხარჯი: ₾${pendingAppr.amount} (${pendingAppr.issue_title})\n` +
        `ბმული 1-Click თანხმობისთვის: ${approvalLink}\n`;
    }

    summaryText += `\nყველაფერი რიგზეა!`;
    $('send-owner-summary-text').value = summaryText;

    $('modal-send-owner-report').style.display = 'flex';
  }

  $('btn-copy-owner-summary')?.addEventListener('click', () => {
    const text = $('send-owner-summary-text').value;
    navigator.clipboard.writeText(text);
    showToast('მზა ტექსტი დაკოპირდა WhatsApp / Telegram-ისთვის!', 'success');
  });

  $('btn-copy-approval-link')?.addEventListener('click', () => {
    const link = $('send-owner-approval-link').value;
    if (link && link.startsWith('http')) {
      navigator.clipboard.writeText(link);
      showToast('თანხმობის ბმული დაკოპირდა!', 'success');
    }
  });

  // Modal: Upload Photo / Receipt (Rule 6)
  function openUploadReceiptModal(aptId = null) {
    const targetAptId = aptId || selectedAptId;
    const apt = window.RigzeaStore.apartments.find(a => a.id === targetAptId);
    $('upload-receipt-apt-sub').textContent = apt ? `ბინა: ${apt.name} · ${apt.address}` : '';
    $('receipt-title-input').value = '';
    $('receipt-amount-input').value = '';
    $('receipt-file-input').value = '';
    $('modal-upload-receipt').style.display = 'flex';
  }

  $('btn-submit-receipt-upload')?.addEventListener('click', async () => {
    const aptId = selectedAptId;
    const title = $('receipt-title-input').value.trim();
    const amount = parseFloat($('receipt-amount-input').value) || 0;
    const fileInput = $('receipt-file-input');
    const file = fileInput.files?.[0];
    const org = window.RigzeaStore.currentOrg;

    if (!title || !aptId) {
      showToast('შეიყვანეთ აღწერა / სათაური', 'error');
      return;
    }

    const btn = $('btn-submit-receipt-upload');
    btn.disabled = true;
    btn.textContent = 'იტვირთება...';

    let fileUrl = '';
    if (file) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${org.id}/${aptId}/${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadErr } = await window.supabaseClient.storage
          .from('rigzea-files')
          .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (uploadErr) {
          console.warn('Storage upload error:', uploadErr);
        } else if (uploadData) {
          const { data: publicUrlData } = window.supabaseClient.storage
            .from('rigzea-files')
            .getPublicUrl(fileName);
          fileUrl = publicUrlData?.publicUrl || '';
        }
      } catch (e) {
        console.error('File upload exception:', e);
      }
    }

    // 1. Log activity with attachment
    await window.RigzeaStore.logActivity(
      aptId,
      'file_uploaded',
      `ფოტო / ქვითარი: ${title}`,
      fileUrl ? `მიმაგრებულია ფაილი: ${fileUrl}` : 'ფაილი აიტვირთა'
    );

    // 2. If amount > 0, create expense record automatically
    if (amount > 0) {
      await window.supabaseClient.from('expenses').insert({
        organization_id: org.id,
        apartment_id: aptId,
        amount: amount,
        category: 'რემონტი / შეკეთება',
        description: `${title} (ქვითრით)`,
        receipt_url: fileUrl,
        expense_date: new Date().toISOString().split('T')[0],
        status: 'confirmed'
      });
    }

    btn.disabled = false;
    btn.textContent = 'ატვირთვა და შენახვა ↗';
    closeAllModals();
    showToast('ფოტო / ქვითარი წარმატებით აიტვირთა!', 'success');
    await loadAndRenderAll();
  });

  // =========================================================================
  // 14. GLOBAL SEARCH SYSTEM (RULES 7 & 8: APARTMENT, OWNER, ADDRESS, TASK, REPAIR)
  // =========================================================================

  function initGlobalSearch() {
    const trigger = $('btn-global-search-trigger');
    const modal = $('modal-global-search');
    const input = $('global-search-input');
    const resultsMount = $('global-search-results');

    function openSearch() {
      modal.style.display = 'flex';
      input.value = '';
      input.focus();
      renderSearchResults('');
    }

    trigger?.addEventListener('click', openSearch);

    // Keyboard shortcut: Press "/" or Ctrl+K / Cmd+K from anywhere
    document.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement?.tagName;
      const isInputActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

      if ((e.key === '/' && !isInputActive) || ((e.ctrlKey || e.metaKey) && e.key === 'k')) {
        e.preventDefault();
        openSearch();
      } else if (e.key === 'Escape' && modal.style.display === 'flex') {
        modal.style.display = 'none';
      }
    });

    input?.addEventListener('input', () => {
      renderSearchResults(input.value.trim().toLowerCase());
    });

    function renderSearchResults(query) {
      if (!query) {
        resultsMount.innerHTML = `
          <div style="padding:28px 20px;text-align:center;color:var(--muted);font-size:13px">
            აკრიფე ბინის ნომერი, მფლობელის სახელი, მისამართი ან საქმე...
          </div>
        `;
        return;
      }

      const { apartments, owners, tasks, expenses, approvals } = window.RigzeaStore;

      // 1. Apartments & Addresses
      const matchedApts = apartments.filter(a =>
        a.name.toLowerCase().includes(query) ||
        (a.unit_number && a.unit_number.toLowerCase().includes(query)) ||
        a.address.toLowerCase().includes(query) ||
        (a.city && a.city.toLowerCase().includes(query))
      );

      // 2. Owners
      const matchedOwners = owners.filter(o =>
        o.name.toLowerCase().includes(query) ||
        (o.phone && o.phone.toLowerCase().includes(query)) ||
        (o.email && o.email.toLowerCase().includes(query))
      );

      // 3. Tasks
      const matchedTasks = tasks.filter(t =>
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.task_type && t.task_type.toLowerCase().includes(query))
      );

      // 4. Repairs & Expenses
      const matchedExpenses = expenses.filter(e =>
        e.description.toLowerCase().includes(query) ||
        (e.category && e.category.toLowerCase().includes(query)) ||
        (e.vendor && e.vendor.toLowerCase().includes(query))
      );

      const totalFound = matchedApts.length + matchedOwners.length + matchedTasks.length + matchedExpenses.length;

      if (totalFound === 0) {
        resultsMount.innerHTML = `
          <div style="padding:32px 20px;text-align:center;color:var(--muted);font-size:13px">
            შედეგი ვერ მოიძებნა სიტყვაზე „<strong>${escapeHtml(query)}</strong>“
          </div>
        `;
        return;
      }

      let html = '';

      if (matchedApts.length > 0) {
        html += `<div class="search-result-group-title">🏢 ბინები და მისამართები (${matchedApts.length})</div>`;
        matchedApts.forEach(apt => {
          html += `
            <div class="search-result-row search-item-jump" data-type="apt" data-id="${apt.id}">
              <div>
                <strong>${escapeHtml(apt.name)}</strong>
                <div style="font-size:12px;color:var(--muted)">${escapeHtml(apt.address)} · ${escapeHtml(apt.city)}</div>
              </div>
              <span class="status-pill done" style="font-size:10px">ბინა</span>
            </div>
          `;
        });
      }

      if (matchedOwners.length > 0) {
        html += `<div class="search-result-group-title">👤 მფლობელები (${matchedOwners.length})</div>`;
        matchedOwners.forEach(owner => {
          html += `
            <div class="search-result-row search-item-jump" data-type="owner" data-id="${owner.id}">
              <div>
                <strong>${escapeHtml(owner.name)}</strong>
                <div style="font-size:12px;color:var(--muted)">${escapeHtml(owner.phone || owner.email || 'კონტაქტის გარეშე')}</div>
              </div>
              <span class="status-pill done" style="font-size:10px">მფლობელი</span>
            </div>
          `;
        });
      }

      if (matchedTasks.length > 0) {
        html += `<div class="search-result-group-title">📝 საქმეები (${matchedTasks.length})</div>`;
        matchedTasks.forEach(task => {
          const apt = apartments.find(a => a.id === task.apartment_id);
          html += `
            <div class="search-result-row search-item-jump" data-type="task" data-apt-id="${task.apartment_id || ''}">
              <div>
                <strong>${escapeHtml(task.title)}</strong>
                <div style="font-size:12px;color:var(--muted)">${escapeHtml(apt?.name || 'ბინა')} · სტატუსი: ${task.status}</div>
              </div>
              <span class="status-pill neutral" style="font-size:10px">საქმე</span>
            </div>
          `;
        });
      }

      if (matchedExpenses.length > 0) {
        html += `<div class="search-result-group-title">💰 ხარჯები და რემონტი (${matchedExpenses.length})</div>`;
        matchedExpenses.forEach(exp => {
          const apt = apartments.find(a => a.id === exp.apartment_id);
          html += `
            <div class="search-result-row search-item-jump" data-type="expense" data-apt-id="${exp.apartment_id}">
              <div>
                <strong>${escapeHtml(exp.description)}</strong>
                <div style="font-size:12px;color:var(--muted)">${escapeHtml(apt?.name || 'ბინა')} · ₾${exp.amount}</div>
              </div>
              <span class="status-pill wait" style="font-size:10px">ხარჯი</span>
            </div>
          `;
        });
      }

      resultsMount.innerHTML = html;

      // Bind jump handlers
      $$('.search-item-jump').forEach(row => {
        row.addEventListener('click', () => {
          const type = row.dataset.type;
          modal.style.display = 'none';

          if (type === 'apt' || type === 'expense') {
            selectedAptId = row.dataset.id || row.dataset.aptId;
            switchView('apartments');
          } else if (type === 'owner') {
            selectedOwnerId = row.dataset.id;
            switchView('owners');
          } else if (type === 'task') {
            if (row.dataset.aptId) {
              selectedAptId = row.dataset.aptId;
              switchView('apartments');
            } else {
              switchView('tasks');
            }
          }
        });
      });
    }
  }

  // =========================================================================
  // 15. THEME SWITCHER CONTROLLER (DARK / LIGHT MODE - PURE NEUTRAL GREY)
  // =========================================================================
  function initTheme() {
    const saved = localStorage.getItem('rigzea_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', saved);

    $('btn-theme-toggle')?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('rigzea_theme', next);
      showToast(next === 'dark' ? 'მუქი თემა ჩაირთო' : 'ნათელი თემა ჩაირთო', 'normal');
    });
  }

  // =========================================================================
  // 16. MACOS-GRADE INTERACTION ENGINE & CONTEXT MENUS
  // =========================================================================
  function initMacOSInteractions() {
    // 1. Sticky Header Dynamic Elevation
    const header = document.querySelector('.app-top-header');
    if (header) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 8) {
          header.classList.add('is-scrolled');
        } else {
          header.classList.remove('is-scrolled');
        }
      }, { passive: true });
    }

    // 2. Global Keyboard Shortcuts (/ for Search, Escape for Modal/Context menu)
    document.addEventListener('keydown', (e) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (e.key === '/' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const searchModal = $('modal-global-search');
        if (searchModal) {
          searchModal.style.display = 'flex';
          const input = $('global-search-input');
          if (input) {
            input.focus();
            input.select();
          }
        }
      }

      if (e.key === 'Escape') {
        hideContextMenu();
        $$('.modal-overlay').forEach(modal => {
          if (modal.style.display !== 'none') {
            modal.style.display = 'none';
          }
        });
      }
    });

    // 3. Desktop Secondary Click / Context Menu
    let contextMenuEl = $('macos-global-context-menu');
    if (!contextMenuEl) {
      contextMenuEl = document.createElement('div');
      contextMenuEl.id = 'macos-global-context-menu';
      contextMenuEl.className = 'macos-context-menu';
      document.body.appendChild(contextMenuEl);
    }

    function showContextMenu(e, items) {
      e.preventDefault();
      e.stopPropagation();

      let html = '';
      items.forEach(item => {
        if (item.divider) {
          html += '<div class="macos-menu-divider"></div>';
        } else {
          html += `
            <button class="macos-menu-item ${item.danger ? 'danger' : ''}" data-action="${item.id}">
              <span class="macos-menu-item-left">
                ${item.icon || ''}
                <span>${escapeHtml(item.label)}</span>
              </span>
              ${item.shortcut ? `<span class="macos-menu-item-shortcut">${item.shortcut}</span>` : ''}
            </button>
          `;
        }
      });

      contextMenuEl.innerHTML = html;

      const x = Math.min(e.clientX, window.innerWidth - 210);
      const y = Math.min(e.clientY, window.innerHeight - (items.length * 36 + 20));
      contextMenuEl.style.left = `${Math.max(10, x)}px`;
      contextMenuEl.style.top = `${Math.max(10, y)}px`;
      contextMenuEl.classList.add('visible');

      contextMenuEl.querySelectorAll('.macos-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const actionId = btn.dataset.action;
          const found = items.find(i => i.id === actionId);
          hideContextMenu();
          if (found && found.onClick) {
            found.onClick();
          }
        });
      });
    }

    function hideContextMenu() {
      if (contextMenuEl) {
        contextMenuEl.classList.remove('visible');
      }
    }

    document.addEventListener('click', (e) => {
      if (!contextMenuEl.contains(e.target)) {
        hideContextMenu();
      }
    });

    // Context menu delegation for Apartment Rows
    document.addEventListener('contextmenu', (e) => {
      const aptItem = e.target.closest('.apartment-row-item');
      if (aptItem && window.innerWidth > 768) {
        const aptId = aptItem.dataset.id;
        const apt = window.RigzeaStore.apartments.find(a => a.id === aptId);
        if (apt) {
          showContextMenu(e, [
            {
              id: 'open',
              label: 'ბინის გახსნა',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
              onClick: () => {
                selectedAptId = apt.id;
                renderApartmentsWorkspace();
              }
            },
            {
              id: 'new-task',
              label: '+ ახალი საქმე',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
              onClick: () => {
                selectedAptId = apt.id;
                $('modal-add-task').style.display = 'flex';
                $('task-modal-apt-select').value = apt.id;
              }
            },
            {
              id: 'add-expense',
              label: '+ ხარჯის დამატება',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
              onClick: () => {
                selectedAptId = apt.id;
                $('modal-add-expense').style.display = 'flex';
                $('expense-modal-apt-select').value = apt.id;
              }
            },
            { divider: true },
            {
              id: 'owner-link',
              label: 'მესაკუთრის ბმული',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
              onClick: () => {
                const link = `${window.location.origin}/app/index.html#owner?apt=${apt.id}`;
                navigator.clipboard.writeText(link);
                showToast('მესაკუთრის ბმული დაკოპირდა!', 'success');
              }
            }
          ]);
        }
      }
    });
  }

  // Boot Application
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initGlobalSearch();
    initMacOSInteractions();
    initApp();
  });

})();

