// Rigzea public demo layer. Loaded after /js/core.js and before /app/app.js.
// The workspace itself is the real app (/app/*.js) running on demo/mock.js;
// this file only adapts what needs a backend or a real link:
//  - public links (/p/, /p/s/, /approve/, /guide/) open the demo copy of those pages,
//  - uploads stay in this browser, sign-out and server-only actions show a demo notice,
//  - a demo ribbon and a short "what to try" guide for prospects.
(() => {
  'use strict';
  const R = window.R;
  const ORIGIN = location.origin;
  const DEMO_NOTE = 'სადემონსტრაციო რეჟიმი';
  const IDS = {
    vake: 'd1e00000-0000-4000-8000-000000000001', vera: 'd1e00000-0000-4000-8000-000000000004',
    dealVera: 'e1e00000-0000-4000-8000-000000000004', dealElene: 'e1e00000-0000-4000-8000-000000000006',
    vakeSlug: 'vake-chavchavadze-3-otakhiani', selection: 'elene7vake2k',
  };
  // Smart import needs the server; the demo answers with a sample listing instead.
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/import-listing')) {
      const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;
      const listing = {
        source: 'demo', title: 'იყიდება 3 ოთახიანი ბინა საბურთალოზე', name: 'საბურთალო · ნუცუბიძის ქ., 3-ოთახიანი', transaction_type: 'sale', property_type: 'apartment',
        city: 'თბილისი', district: 'საბურთალო', address: 'შალვა ნუცუბიძის ქ.', area_sqm: 86, floor: 7, total_floors: 14, rooms: 3, bedrooms: 2, bathrooms: 1,
        price: 139000, currency: 'USD', price_sqm: 1616, lat: 41.7262, lng: 44.7338, cadastral_code: null,
        description: 'ნათელი 3-ოთახიანი ბინა ახალ კორპუსში. ახალი რემონტი, ჩაშენებული სამზარეულო და ხედი ქალაქზე. მეტრომდე ფეხით 7 წუთია.',
        images: [img('1502672260266-1c1ef2d93688'), img('1484154218962-a197022b5858'), img('1600607687939-ce8a6c25118c')],
      };
      return new Promise(r => setTimeout(() => r(new Response(JSON.stringify({ ok: true, listing }), { status: 200, headers: { 'Content-Type': 'application/json' } })), 600));
    }
    return realFetch(input, init);
  };

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  // ---------------------------------------------------------------------------
  // Public links → demo pages (the live pages would look up the real database)
  // ---------------------------------------------------------------------------
  function demoHref(raw) {
    let u;
    try { u = new URL(raw, ORIGIN); } catch { return null; }
    if (u.origin !== ORIGIN) return null;
    const p = u.pathname;
    const qs = new URLSearchParams(u.search);
    let page = null;
    if (/^\/p\/s\/?$/.test(p)) page = 'p/s';
    else if (/^\/p\/?$/.test(p)) page = 'p';
    else if (/^\/approve\/?$/.test(p)) page = 'approve';
    else if (/^\/guide\/?$/.test(p)) page = 'guide';
    else {
      const m = p.match(/^\/p\/([A-Za-z0-9-]{3,80})\/?$/);
      if (m) { page = 'p'; qs.set('id', m[1]); }
    }
    if (!page) return null;
    qs.set('page', page);
    return `${ORIGIN}/demo/view/?${qs.toString()}`;
  }
  const rewriteText = (text) => String(text ?? '').replace(/https?:\/\/[^\s"'<>]+/g, (m) => demoHref(m) || m);

  const origCopy = R.copyText;
  R.copyText = (text, msg) => origCopy(rewriteText(text), msg);
  const origWa = R.whatsappUrl, origTg = R.telegramUrl;
  R.whatsappUrl = (text) => origWa(rewriteText(text));
  R.telegramUrl = (text, url) => origTg(rewriteText(text), url ? rewriteText(url) : url);
  if (navigator.share) {
    const origShare = navigator.share.bind(navigator);
    try { navigator.share = (d = {}) => origShare({ ...d, text: d.text && rewriteText(d.text), url: d.url && rewriteText(d.url) }); } catch { /* read-only in some browsers */ }
  }

  // Uploads stay in this browser: images are downscaled into data URLs so the
  // public demo pages can show them too.
  const readAsDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  async function shrink(file, max) {
    const bmp = await (window.createImageBitmap ? createImageBitmap(file) : Promise.reject(new Error('no bitmap')));
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.74);
  }
  R.uploadFile = async (_org, _folder, file) => {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) throw new Error('ფაილი 10 მბ-ზე დიდია.');
    if (/^image\//.test(file.type)) {
      try { return await shrink(file, 1000); } catch { return readAsDataUrl(file); }
    }
    return file.size < 400 * 1024 ? readAsDataUrl(file) : URL.createObjectURL(file);
  };

  const toast = (msg, opts) => R.toast(msg, { timeout: 6000, ...opts });
  window.addEventListener('rigzea-demo', (e) => toast(e.detail));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="signout"]')) {
      e.preventDefault(); e.stopImmediatePropagation();
      document.querySelectorAll('dialog[open]').forEach(d => d.close());
      toast(`${DEMO_NOTE}: გასვლა არ არის საჭირო. საკუთარი ანგარიშისთვის დარეგისტრირდი.`, { action: { label: 'რეგისტრაცია', fn: () => { location.href = '/app/'; } } });
      return;
    }
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    const href = a.getAttribute('href');
    if (/^https:\/\/(wa\.me|t\.me)\//.test(href)) {
      // Share links carry the URL inside their text; point it at the demo page.
      try {
        const u = new URL(href);
        ['text', 'url'].forEach(k => { if (u.searchParams.has(k)) u.searchParams.set(k, rewriteText(u.searchParams.get(k))); });
        a.href = u.toString();
      } catch { /* leave as is */ }
      return;
    }
    const target = demoHref(a.href);
    if (!target) return;
    e.preventDefault();
    if (a.target === '_blank') window.open(target, '_blank', 'noopener'); else location.href = target;
  }, true);

  // ---------------------------------------------------------------------------
  // Ribbon + guide
  // ---------------------------------------------------------------------------
  const ic = (name, size = 16) => R.icon(name, size);
  const STEPS = [
    { id: 'nav', icon: 'menu', title: 'გაქირავება და გაყიდვა ცალ-ცალკე', sub: 'მენიუში: ბინები, მდგმურები, მეპატრონეები, მყიდველები, გამყიდველები', run: () => go('#/apartments?type=sale') },
    { id: 'listing', icon: 'camera', title: 'ბინა ფოტოებით და ჭკვიანი ბმულით', sub: 'გალერეა, კეთილმოწყობა, ბეჯი, ნახვები და WhatsApp-ის დაწკაპუნებები', run: () => go(`#/apartments/${IDS.vake}`, '.listing-card') },
    { id: 'client', icon: 'external', title: 'რას ხედავს კლიენტი', sub: 'საჯარო გვერდი /p/ ფოტოგალერეით', run: () => window.open(demoHref(`/p/${IDS.vakeSlug}/`), '_blank', 'noopener') },
    { id: 'import', icon: 'link', title: 'განცხადების შევსება ლინკიდან', sub: 'ჩასვი MyHome / SS.ge / Place.ge ბმული და ფორმა თავისით ივსება', run: () => go('#/apartments?type=sale', null, () => App.openApartmentForm(null, { transaction_type: 'sale' })) },
    { id: 'cobroker', icon: 'whatsapp', title: 'კოლეგასთან გაზიარება', sub: 'მეპატრონის ნომერი დამალულია, პირობა და ტექსტი WhatsApp-ისთვის მზადაა', run: () => go(`#/apartments/${IDS.vake}`, null, () => App.openCoBrokerShare(App.H.apt(IDS.vake))) },
    { id: 'pdf', icon: 'printer', title: 'PDF პრეზენტაცია 1 კლიკით', sub: 'VIP კატალოგი ან ერთგვერდიანი ფლაერი, QR კოდით', run: () => go(`#/apartments/${IDS.vake}`, null, () => App.openPresentation(App.H.apt(IDS.vake))) },
    { id: 'legal', icon: 'file', title: 'ხელშეკრულებები და რეესტრი', sub: 'ექსკლუზივი, საბროკერო, ბე, მიღება-ჩაბარება და NAPR შემოწმება', run: () => go('#/deals/documents?type=sale') },
    { id: 'match', icon: 'sparkle', title: 'ბინების შერჩევა კლიენტისთვის', sub: 'უბანი, ბიუჯეტი, საძინებლები და დამთხვევის %', run: () => go('#/deals?type=rental', null, () => App.openMatchmakerModal(App.H.deal(IDS.dealElene))) },
    { id: 'selection', icon: 'link', title: 'შერჩევის ერთი ბმული', sub: 'რამდენიმე ბინა ერთ გვერდზე, შედარებით', run: () => window.open(demoHref(`/p/s/?id=${IDS.selection}`), '_blank', 'noopener') },
    { id: 'post', icon: 'whatsapp', title: 'პოსტის გენერატორი', sub: 'ქართული, English, WhatsApp და Co-Brokering 50/50', run: () => go(`#/apartments/${IDS.vake}`, null, () => App.openPostGenerator(App.H.apt(IDS.vake))) },
    { id: 'lease', icon: 'file', title: 'ორენოვანი ხელშეკრულება', sub: '11 მუხლი ქართულად და ინგლისურად, PDF', run: () => go('#/deals?type=rental', null, () => App.openLeaseAgreementGenerator(App.H.apt(IDS.vera), App.H.deal(IDS.dealVera))) },
    { id: 'comm', icon: 'wallet', title: 'საკომისიოები და ექსპორტი', sub: 'თვე, აგენტი, სრული, პარტნიორის წილი, სუფთა, CSV', run: () => go('#/deals/commissions') },
    { id: 'team', icon: 'team', title: 'გუნდის წილები და რეიტინგი', sub: 'ობიექტის აგენტი, მყიდველის აგენტი, სააგენტო; გადახდის სტატუსი', run: () => go('#/deals/commissions?type=sale') },
    { id: 'renew', icon: 'clock', title: 'განახლებები და Telegram', sub: 'ხელშეკრულებები 30, 14 და 3 დღეში', run: () => go('#/today', '[data-renew]') },
    { id: 'plans', icon: 'check', title: 'პაკეტები', sub: 'დამწყები, პრო აგენტი, გუნდი, სააგენტო', run: () => go('#/settings/plan') },
    { id: 'brand', icon: 'settings', title: 'White-label ბრენდინგი', sub: 'ლოგო, სახელი და ფერი საჯარო გვერდებზე', run: () => go('#/settings', '#brand-card') },
  ];
  const seen = new Set((store.get('rigzea_demo_seen') || '').split(',').filter(Boolean));

  function waitFor(sel, cb, tries = 40) {
    const el = sel && document.querySelector(sel);
    if (el || !sel) return cb(el);
    if (tries > 0) setTimeout(() => waitFor(sel, cb, tries - 1), 75);
  }
  function go(hash, focusSel, after) {
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    if (location.hash !== hash) location.hash = hash; else App.render();
    waitFor(focusSel || '#view > *', (el) => {
      if (focusSel && el) {
        const card = el.closest('section') || el;
        card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        card.classList.add('demo-flash');
        setTimeout(() => card.classList.remove('demo-flash'), 1600);
      }
      if (after) after();
    });
    if (matchMedia('(max-width: 900px)').matches) setGuide(false);
  }

  function guideHtml() {
    return `<div class="demo-guide-head">
        <div><strong>რა ვცადო?</strong><span>${seen.size} / ${STEPS.length} ნანახი</span></div>
        <button type="button" class="icon-btn" data-guide-close aria-label="ჩაკეცვა">${ic('chevronDown')}</button>
      </div>
      <ol class="demo-steps">${STEPS.map(s => `<li><button type="button" data-step="${s.id}" class="${seen.has(s.id) ? 'is-seen' : ''}">
          <span class="demo-step-ic">${ic(seen.has(s.id) ? 'check' : s.icon)}</span>
          <span class="demo-step-txt"><strong>${s.title}</strong><span>${s.sub}</span></span>
        </button></li>`).join('')}</ol>
      <div class="demo-guide-foot"><a class="btn btn-primary btn-block" href="/app/">დაიწყე 14-დღიანი უფასო ცდა</a></div>`;
  }

  function setGuide(open) {
    const g = document.getElementById('demo-guide');
    if (!g) return;
    g.hidden = !open;
    document.querySelectorAll('[data-guide-toggle]').forEach(b => b.setAttribute('aria-expanded', String(open)));
    store.set('rigzea_demo_guide', open ? '1' : '0');
  }
  function renderGuide() {
    const g = document.getElementById('demo-guide');
    g.innerHTML = guideHtml();
    document.querySelectorAll('[data-guide-count]').forEach(el => { el.textContent = `${seen.size}/${STEPS.length}`; });
  }

  function mount() {
    const ribbon = document.createElement('div');
    ribbon.className = 'demo-ribbon';
    ribbon.setAttribute('role', 'region');
    ribbon.setAttribute('aria-label', DEMO_NOTE);
    ribbon.innerHTML = `
      <span class="demo-tag">დემო</span>
      <span class="demo-text">სანიმუშო სააგენტო „Mzeo Realty“. ყველა ფუნქცია ღიაა, ცვლილებები მხოლოდ ამ ბრაუზერში ინახება.</span>
      <span class="demo-actions">
        <button type="button" class="demo-btn" data-guide-toggle aria-controls="demo-guide" aria-expanded="false">${ic('sparkle', 14)} რა ვცადო? <span class="demo-count" data-guide-count></span></button>
        <button type="button" class="demo-btn" id="demo-reset" title="სანიმუშო მონაცემების თავიდან ჩატვირთვა">${ic('refresh', 14)} <span class="demo-hide-sm">განულება</span></button>
        <a class="demo-btn demo-btn-cta" href="/app/">სცადე უფასოდ</a>
      </span>`;
    document.body.prepend(ribbon);

    const guide = document.createElement('aside');
    guide.id = 'demo-guide';
    guide.className = 'demo-guide';
    guide.setAttribute('aria-label', 'რა ვცადო დემოში');
    document.body.appendChild(guide);
    renderGuide();
    const saved = store.get('rigzea_demo_guide');
    setGuide(saved === null ? !matchMedia('(max-width: 900px)').matches : saved === '1');

    ribbon.querySelector('[data-guide-toggle]').addEventListener('click', () => setGuide(guide.hidden));
    guide.addEventListener('click', (e) => {
      if (e.target.closest('[data-guide-close]')) { setGuide(false); return; }
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const step = STEPS.find(s => s.id === b.dataset.step);
      if (!window.App?.S?.data) { toast('დემო ჯერ იტვირთება, სცადე წამში.'); return; }
      seen.add(step.id);
      store.set('rigzea_demo_seen', [...seen].join(','));
      renderGuide();
      step.run();
    });
    document.getElementById('demo-reset').addEventListener('click', async () => {
      const ok = await R.confirm({ title: 'დემოს განულება', message: 'შენი ცვლილებები წაიშლება და სანიმუშო მონაცემები თავიდან ჩაიტვირთება.', confirmLabel: 'განულება' });
      if (!ok) return;
      window.RigzeaDemoDB.reset();
      store.del('rigzea_demo_seen');
      location.hash = '#/today';
      location.reload();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Owner approval links open the demo approval page.
    if (window.App?.H) App.H.approvalLink = (a) => `${ORIGIN}/demo/view/?page=approve&token=${encodeURIComponent(a.token)}`;
    mount();
  });
})();
