// Small public-site tools, shared with authentication for password controls and attribution.
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = (d) => {
    const svg = document.createElementNS(svgNs, 'svg');
    for (const [key, value] of Object.entries({ width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(key, value);
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', d);
    svg.append(path);
    return svg;
  };
  // Icon-only control: the label lives in aria-label and the tooltip.
  const iconButton = (tag, label, d, cls) => {
    const node = make(tag, '', `${cls} st-icon`);
    node.setAttribute('aria-label', label);
    node.title = label;
    node.append(icon(d));
    return node;
  };
  const icons = {
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
    eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
    up: 'M12 19V5M5 12l7-7 7 7',
    close: 'M18 6L6 18M6 6l12 12',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  };
  const read = (store, key) => { try { return window[store].getItem(key); } catch { return null; } };
  const write = (store, key, value) => {
    try {
      if (value === null) window[store].removeItem(key);
      else window[store].setItem(key, value);
    } catch { /* Controls still work when browser storage is unavailable. */ }
  };
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  window.RigzeaCampaign = () => {
    if (read('localStorage', 'rigzea_campaign_consent') !== 'yes') return undefined;
    try {
      const stored = JSON.parse(read('sessionStorage', 'rigzea_campaign'));
      const campaign = {};
      for (const key of campaignKeys) {
        if (typeof stored?.[key] === 'string') campaign[key] = stored[key].slice(0, 200);
      }
      return Object.keys(campaign).length ? campaign : undefined;
    } catch { return undefined; }
  };

  // Auth forms are already present, including the initially hidden reset forms.
  document.querySelectorAll('input[type="password"]').forEach((input, index) => {
    if (!input.id) input.id = `password-field-${index}`;
    const wrap = make('span', '', 'st-password');
    input.before(wrap);
    wrap.append(input);
    const toggle = iconButton('button', 'აჩვენე პაროლი', icons.eye, 'btn btn-ghost st-password-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', input.id);
    toggle.setAttribute('aria-pressed', 'false');
    const conceal = () => {
      input.type = 'password';
      toggle.replaceChildren(icon(icons.eye));
      toggle.setAttribute('aria-label', toggle.title = 'აჩვენე პაროლი');
      toggle.setAttribute('aria-pressed', 'false');
    };
    toggle.addEventListener('click', () => {
      if (input.type === 'text') return conceal();
      input.type = 'text';
      toggle.replaceChildren(icon(icons.eyeOff));
      toggle.setAttribute('aria-label', toggle.title = 'დამალე პაროლი');
      toggle.setAttribute('aria-pressed', 'true');
    });
    input.form?.addEventListener('submit', conceal);
    wrap.append(toggle);
  });

  if (!document.body.classList.contains('luxury-theme')) return;
  const main = $('main');
  if (!main) return;
  main.id ||= 'main-content';
  main.tabIndex = -1;

  const progress = make('div', '', 'st-progress');
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  const tools = make('aside', '', 'st-floating');
  tools.setAttribute('aria-label', 'სწრაფი მოქმედებები');
  const top = iconButton('button', 'ზემოთ', icons.up, 'lx-btn lx-btn-secondary lx-btn-sm st-control');
  top.type = 'button';
  top.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    main.focus({ preventScroll: true });
  });
  tools.append(top);
  document.body.append(tools);
  let scheduled = false, lastY = scrollY, settle;
  const updateScroll = () => {
    const height = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${height > 0 ? Math.min(1, Math.max(0, scrollY / height)) : 0})`;
    top.classList.toggle('st-show', scrollY >= 400);
    const dy = scrollY - lastY;
    lastY = scrollY;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      top.style.setProperty('--st-lag', Math.max(-18, Math.min(18, dy * .5)) + 'px');
      clearTimeout(settle);
      settle = setTimeout(() => top.style.setProperty('--st-lag', '0px'), 120);
    }
    scheduled = false;
  };
  const schedule = () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateScroll); }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(document.body);
  updateScroll();

  const footer = $('.lx-footer');

  // Optional campaign tags stay in this tab and are attached only to an accepted signup.
  const captureCampaign = () => {
    if (read('localStorage', 'rigzea_campaign_consent') !== 'yes') {
      write('sessionStorage', 'rigzea_campaign', null);
      return;
    }
    const params = new URLSearchParams(location.search);
    const campaign = {};
    campaignKeys.forEach(key => {
      const value = params.get(key)?.trim();
      if (value) campaign[key] = value.slice(0, 200);
    });
    if (Object.keys(campaign).length) write('sessionStorage', 'rigzea_campaign', JSON.stringify(campaign));
  };
  captureCampaign();
  const banner = make('section', '', 'st-cookie');
  banner.hidden = true;
  banner.setAttribute('aria-label', 'ქუქიების პარამეტრები');
  const note = make('p', 'საიტი იყენებს მხოლოდ აუცილებელ ქუქი-ფაილებს. თანახმა ხარ, რომ დავიმახსოვროთ, რომელი ბმულით შემოხვედი?');
  banner.append(note);
  const policy = make('a', 'ქუქიების პოლიტიკა');
  policy.href = '/legal/cookies/';
  const actions = make('div', '', 'st-actions');
  const essential = make('button', 'არ ვეთანხმები', 'lx-btn lx-btn-secondary lx-btn-sm st-control');
  const accept = make('button', 'ვეთანხმები', 'lx-btn lx-btn-primary lx-btn-sm st-control st-accept');
  [essential, accept].forEach(button => { button.type = 'button'; });
  const showBanner = (show) => {
    banner.classList.remove('st-leaving');
    document.body.classList.toggle('st-cookie-open', show);
    if (show || banner.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { banner.hidden = !show; return; }
    banner.classList.add('st-leaving');
    setTimeout(() => { if (banner.classList.contains('st-leaving')) { banner.hidden = true; banner.classList.remove('st-leaving'); } }, 260);
  };
  const preferences = make('button', 'ქუქიების პარამეტრები', 'st-preferences');
  preferences.type = 'button';
  preferences.addEventListener('click', () => { showBanner(true); essential.focus(); });
  footer?.append(preferences);
  const choose = (value) => {
    write('localStorage', 'rigzea_campaign_consent', value);
    captureCampaign();
    showBanner(false);
    preferences.focus({ preventScroll: true });
  };
  essential.addEventListener('click', () => choose('no'));
  accept.addEventListener('click', () => choose('yes'));
  actions.append(essential, accept);
  note.append(' ', policy);
  banner.append(actions);
  document.body.append(banner);
  showBanner(!['yes', 'no'].includes(read('localStorage', 'rigzea_campaign_consent')));
  window.addEventListener('storage', e => {
    if (e.key === 'rigzea_campaign_consent' || e.key === null) {
      captureCampaign();
      showBanner(!['yes', 'no'].includes(read('localStorage', 'rigzea_campaign_consent')));
    }
  });

  const searchButton = make('button', '', 'lx-theme-toggle st-search-button');
  searchButton.type = 'button';
  searchButton.setAttribute('aria-label', 'ძიება');
  searchButton.append(icon(icons.search));
  searchButton.setAttribute('aria-haspopup', 'dialog');
  $('.lx-header-actions')?.prepend(searchButton);
  const dialog = make('dialog', '', 'st-search');
  dialog.setAttribute('aria-labelledby', 'site-search-title');
  const title = make('h2', 'საიტზე ძიება');
  title.id = 'site-search-title';
  const close = iconButton('button', 'დახურვა', icons.close, 'lx-btn lx-btn-secondary lx-btn-sm st-control');
  close.type = 'button';
  close.addEventListener('click', () => dialog.close());
  const form = make('form');
  const label = make('label', 'რას ეძებ?');
  label.htmlFor = 'site-search-query';
  const input = make('input');
  input.id = 'site-search-query';
  input.type = 'search';
  input.required = true;
  input.maxLength = 100;
  const submit = iconButton('button', 'მოძებნე', icons.search, 'lx-btn lx-btn-primary lx-btn-sm st-control');
  submit.type = 'submit';
  const status = make('p');
  status.setAttribute('role', 'status');
  const results = make('ul', '', 'st-search-results');
  form.append(label, input, submit);
  const searchHeading = make('div', '', 'st-search-heading');
  searchHeading.append(title, close);
  dialog.append(searchHeading, form, status, results);
  document.body.append(dialog);
  searchButton.addEventListener('click', () => { dialog.showModal(); input.focus(); });
  let pages;
  const paths = ['/', '/features/', '/pricing/', '/faq/'];
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const query = input.value.trim().toLocaleLowerCase('ka');
    if (!query) return;
    submit.disabled = true;
    results.replaceChildren();
    status.textContent = 'იტვირთება…';
    form.setAttribute('aria-busy', 'true');
    try {
      if (!pages) pages = await Promise.all(paths.map(async path => {
        const response = await fetch(path, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('search');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const content = $('main', doc);
        return { path, title: $('h1', content)?.textContent.trim() || doc.title,
          text: content.textContent.replace(/\s+/g, ' ').trim() };
      }));
      for (const page of pages) {
        const index = page.text.toLocaleLowerCase('ka').indexOf(query);
        if (index < 0) continue;
        const item = make('li');
        const link = make('a', page.title);
        link.href = page.path;
        item.append(link, make('p', page.text.slice(Math.max(0, index - 55), index + 160)));
        results.append(item);
      }
      status.textContent = results.children.length ? `ნაპოვნია: ${results.children.length}` : 'ვერაფერი მოიძებნა. სცადე სხვა სიტყვა.';
    } catch {
      status.textContent = 'ძიება ვერ მოხერხდა. სცადე ხელახლა.';
    } finally {
      submit.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
})();
