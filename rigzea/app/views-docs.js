// Documents layer: client PDF presentation (print to PDF), sale contract templates
// and the public registry (NAPR) check. Everything renders in the browser.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, L, copyText } = R;
  const { S, H } = App;
  const { fmtMoney, convert, listingUrl, LEASE_CSS } = App.dealsUtil;

  const BLANK = '________________';
  const val = (v, blank = BLANK) => (v === null || v === undefined || String(v).trim() === '' ? blank : esc(String(v).trim()));
  const dmy = (v) => { const d = R.toDate(v); return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}` : ''; };
  const fontFace = (wt, f) => `@font-face{font-family:'FiraGO';src:url('${location.origin}/fonts/${f}.woff2') format('woff2');font-weight:${wt};}`;
  const FONTS = fontFace(400, 'FiraGO-Regular') + fontFace(600, 'FiraGO-SemiBold') + fontFace(700, 'FiraGO-Bold');

  // Opens a print window; the browser's "Save as PDF" produces the file. Waits for fonts and photos.
  function printHtml(html, { title, css, page = 'size: A4; margin: 16mm 15mm;' }) {
    const w = window.open('', '_blank');
    if (!w) { toast('ბრაუზერმა ახალი ფანჯარა დაბლოკა. დაუშვი pop-up ამ საიტისთვის და სცადე ხელახლა.', { type: 'error' }); return; }
    w.document.write(`<!doctype html><html lang="ka"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>${FONTS} @page { ${page} } body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; } ${css}</style></head><body>${html}
      <script>
        var imgs = Array.prototype.slice.call(document.images);
        var ready = imgs.map(function (i) { return i.complete ? Promise.resolve() : new Promise(function (r) { i.onload = i.onerror = r; }); });
        Promise.all(ready.concat([document.fonts.ready])).then(function () { setTimeout(function () { window.print(); }, 200); });
        window.onafterprint = function () { window.close(); };
      <\/script></body></html>`);
    w.document.close();
  }

  // ===========================================================================
  // PUBLIC REGISTRY (NAPR)
  // ===========================================================================
  // The registry search has no address that accepts a code, so the code is copied and the search page opened.
  const NAPR_URL = 'https://naprweb.reestri.gov.ge/_dea/';
  App.openNapr = (code) => {
    const c = String(code || '').trim();
    if (c) copyText(c, 'საკადასტრო კოდი დაკოპირდა. ჩასვი რეესტრის ძებნაში.');
    window.open(NAPR_URL, '_blank', 'noopener');
  };
  App.naprButton = (code) => `<button type="button" class="btn btn-ghost btn-sm" data-napr="${esc(code || '')}">${icon('search', 14)} NAPR რეესტრში გადამოწმება</button>`;
  App.bindNapr = (root) => $$('[data-napr]', root).forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); App.openNapr(b.dataset.napr); }));

  // ===========================================================================
  // CLIENT PRESENTATION (PDF)
  // ===========================================================================
  // QR library is loaded on demand (same CDN as the Excel export); without it the link is printed as text.
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = '/vendor/qrcode.min.js';
      s.onload = () => resolve(window.qrcode || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      setTimeout(() => resolve(window.qrcode || null), 4000);
    });
  }
  async function qrSvg(text) {
    const lib = await loadQr();
    if (typeof lib !== 'function') return '';
    try { const qr = lib(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch { return ''; }
  }

  // OpenStreetMap tiles around the point: a 3x2 grid with the pin on the exact spot.
  function mapSnapshot(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    const z = 16, n = 2 ** z;
    const fx = ((lng + 180) / 360) * n;
    const rad = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
    const x0 = Math.floor(fx) - 1, y0 = Math.floor(fy - 0.5);
    let tiles = '';
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) tiles += `<img src="https://tile.openstreetmap.org/${z}/${x0 + dx}/${y0 + dy}.png" alt="" />`;
    const left = ((fx - x0) / 3) * 100, top = ((fy - y0) / 2) * 100;
    return `<div class="pz-map"><div class="pz-tiles">${tiles}</div><span class="pz-pin" style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%"></span><small>© OpenStreetMap</small></div>`;
  }

  const PZ_CSS = `
    .pz { font-family: 'FiraGO', system-ui, sans-serif; color: #14201b; font-size: 12px; line-height: 1.5; }
    .pz * { box-sizing: border-box; }
    .pz-page { width: 210mm; height: 297mm; padding: 12mm; display: flex; flex-direction: column; gap: 5mm; overflow: hidden; background: #fff; page-break-after: always; }
    .pz-page:last-child { page-break-after: auto; }
    .pz-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .pz-brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
    .pz-brand img { height: 30px; max-width: 120px; object-fit: contain; }
    .pz-tag { background: var(--pz); color: #fff; padding: 3px 12px; border-radius: 999px; font-weight: 600; font-size: 11.5px; }
    .pz-photo { position: relative; overflow: hidden; border-radius: 6px; background: #e8ece9; }
    .pz-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .pz-wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-weight: 700; font-size: 20px; letter-spacing: 1px; transform: rotate(-18deg); text-shadow: 0 1px 2px rgba(0,0,0,.25); pointer-events: none; text-align: center; }
    .pz-hero { height: 92mm; }
    .pz-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; height: 36mm; }
    .pz-grid { display: grid; grid-template-columns: repeat(2, 1fr); grid-auto-rows: 58mm; gap: 3mm; }
    .pz-title { font-size: 19px; font-weight: 700; margin: 0; line-height: 1.25; }
    .pz-where { color: #55635d; margin: 1mm 0 0; }
    .pz-price { font-size: 22px; font-weight: 700; color: var(--pz); white-space: nowrap; }
    .pz-price small { display: block; font-size: 11px; font-weight: 400; color: #55635d; text-align: right; }
    .pz-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; }
    .pz-facts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; }
    .pz-fact { border: 1px solid #dfe5e1; border-radius: 6px; padding: 2mm 3mm; }
    .pz-fact b { display: block; font-size: 14px; }
    .pz-fact span { color: #55635d; font-size: 10.5px; }
    .pz-table { width: 100%; border-collapse: collapse; }
    .pz-table td { padding: 1.6mm 0; border-bottom: 1px solid #e6eae7; }
    .pz-table td:last-child { text-align: right; font-weight: 600; }
    .pz-list { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, 1fr); gap: 1mm 6mm; }
    .pz-list li::before { content: '✓ '; color: var(--pz); font-weight: 700; }
    .pz h4 { margin: 0 0 1.5mm; font-size: 12.5px; text-transform: uppercase; letter-spacing: .4px; color: #55635d; }
    .pz-desc { margin: 0; }
    .pz-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 6mm; border-top: 2px solid var(--pz); padding-top: 4mm; }
    .pz-agent b { font-size: 14px; display: block; }
    .pz-qr { display: flex; align-items: center; gap: 3mm; font-size: 10.5px; color: #55635d; text-align: right; }
    .pz-qr svg { width: 24mm; height: 24mm; display: block; }
    .pz-map { position: relative; height: 52mm; overflow: hidden; border-radius: 6px; background: #e8ece9; }
    .pz-tiles { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); display: grid; grid-template-columns: repeat(3, 1fr); aspect-ratio: 3 / 2; }
    .pz-tiles img { width: 100%; height: 100%; display: block; }
    .pz-pin { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--pz); border: 3px solid #fff; box-shadow: 0 0 0 2px var(--pz); }
    .pz-map small { position: absolute; right: 4px; bottom: 2px; font-size: 8px; background: rgba(255,255,255,.8); padding: 0 3px; }
    .pz-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }`;

  function presentationHtml(a, o) {
    const isSale = a.transaction_type === 'sale';
    const cur = (a.currency || 'USD').toUpperCase() === 'GEL' ? 'GEL' : 'USD';
    const other = cur === 'USD' ? 'GEL' : 'USD';
    const price = Number(isSale ? a.sale_price : a.monthly_rent) || 0;
    const alt = price ? convert(price, cur, other) : null;
    const brand = /^#[0-9a-f]{6}$/i.test(S.org?.brand_color || '') ? S.org.brand_color : '#0a5c44';
    const agency = S.org?.agent_display_name || S.org?.name || '';
    const agentName = a.agent_name || S.member?.display_name || agency;
    const phone = a.agent_phone || S.member?.phone || S.org?.contact_phone || '';
    const photos = (Array.isArray(a.photos) ? a.photos : []).map(p => p.url || p.thumb).filter(Boolean);
    const photo = (src, cls = '') => `<div class="pz-photo ${cls}">${src ? `<img src="${esc(src)}" alt="" />` : ''}${o.watermark && src ? `<span class="pz-wm">${esc(agency)}</span>` : ''}</div>`;
    const where = [a.city, a.district, a.address].filter(Boolean).join(', ');
    const sqm = isSale ? (a.price_sqm || (price && a.area_sqm ? Math.round(price / a.area_sqm) : null)) : null;
    const facts = [
      a.area_sqm && [`${a.area_sqm} მ²`, 'ფართი'],
      a.rooms && [a.rooms, 'ოთახი'],
      a.bedrooms && [a.bedrooms, 'საძინებელი'],
      a.floor && [`${a.floor}${a.total_floors ? '/' + a.total_floors : ''}`, 'სართული'],
      sqm ? [fmtMoney(sqm, cur), '1 მ² ფასი'] : (a.bathrooms && [a.bathrooms, 'სველი წერტილი']),
    ].filter(Boolean);
    const amenities = (Array.isArray(a.amenities) ? a.amenities : []).map(k => App.amenityLabel?.(k) || k);
    const desc = String(a.description || '').trim();
    const head = `<div class="pz-head"><div class="pz-brand">${S.org?.logo_url ? `<img src="${esc(S.org.logo_url)}" alt="" />` : ''}<span>${esc(agency)}</span></div><span class="pz-tag">${isSale ? 'იყიდება' : 'ქირავდება'}</span></div>`;
    const top = `<div class="pz-top"><div><h1 class="pz-title">${esc(a.name)}</h1><p class="pz-where">${esc(where)}</p></div>
      <div class="pz-price">${price ? fmtMoney(price, cur) : 'ფასი შეთანხმებით'}${isSale ? '' : (price ? ' / თვე' : '')}${alt !== null ? `<small>≈ ${fmtMoney(alt, other)}</small>` : ''}</div></div>`;
    const factRow = facts.length ? `<div class="pz-facts" style="grid-template-columns:repeat(${facts.length},1fr)">${facts.map(([v, l]) => `<div class="pz-fact"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>` : '';
    const foot = `<div class="pz-foot"><div class="pz-agent"><b>${esc(agentName)}</b>${agency && agency !== agentName ? `${esc(agency)}<br>` : ''}${phone ? `ტელ.: ${esc(phone)}` : ''}</div>
      <div class="pz-qr"><span>სრული გალერეა და დეტალები<br>${o.qr ? 'დაასკანერე ტელეფონით' : esc(o.url)}</span>${o.qr || ''}</div></div>`;

    if (o.template === 'flyer') {
      return `<div class="pz" style="--pz:${brand}"><section class="pz-page">${head}
        ${photo(photos[0], 'pz-hero')}
        ${photos.length > 1 ? `<div class="pz-row" style="grid-template-columns:repeat(${Math.min(3, photos.length - 1)},1fr)">${photos.slice(1, 4).map(p => photo(p)).join('')}</div>` : ''}
        ${top}${factRow}
        ${amenities.length ? `<ul class="pz-list">${amenities.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${desc ? `<p class="pz-desc">${esc(desc.length > 420 ? desc.slice(0, 420).trim() + '…' : desc)}</p>` : ''}
        ${foot}</section></div>`;
    }
    const specs = [
      ['ტიპი', L.propertyType[a.property_type || 'apartment']], ['ქალაქი', a.city], ['უბანი', a.district], ['ფართი', a.area_sqm && `${a.area_sqm} მ²`],
      ['ოთახები', a.rooms], ['საძინებლები', a.bedrooms], ['სველი წერტილები', a.bathrooms], ['სართული', a.floor && `${a.floor}${a.total_floors ? ' / ' + a.total_floors : ''}`],
      isSale ? ['1 მ² ფასი', sqm && fmtMoney(sqm, cur)] : ['წინასწარი გადახდა', a.prepayment_terms],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
    const map = mapSnapshot(Number(a.lat), Number(a.lng));
    return `<div class="pz" style="--pz:${brand}">
      <section class="pz-page">${head}${photo(photos[0], 'pz-hero')}${top}${factRow}
        <div class="pz-cols"><div><h4>მახასიათებლები</h4><table class="pz-table">${specs.map(([l, v]) => `<tr><td>${l}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
          <div><h4>აღწერა</h4><p class="pz-desc">${esc(desc.length > 900 ? desc.slice(0, 900).trim() + '…' : desc) || 'დეტალებისთვის დაგვიკავშირდით.'}</p></div></div>
        ${foot}</section>
      <section class="pz-page">${head}
        <div class="pz-grid">${[1, 2, 3, 4].map(i => photo(photos[i] || photos[i % Math.max(1, photos.length)])).join('')}</div>
        <div class="pz-cols"><div><h4>კეთილმოწყობა</h4>${amenities.length ? `<ul class="pz-list">${amenities.slice(0, 12).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="pz-desc">დაზუსტებით.</p>'}</div>
          <div><h4>მდებარეობა</h4>${map || `<p class="pz-desc">${esc(where)}</p>`}</div></div>
        ${foot}</section></div>`;
  }
  App.presentationHtml = presentationHtml;

  App.openPresentation = (a) => {
    if (!a || !App.guardFeature('presentation')) return undefined;
    const url = listingUrl(a);
    const state = { template: 'catalog', watermark: false, qr: '', url };
    const waText = `გამარჯობა! გიგზავნით ობიექტის პრეზენტაციას:\n${a.name}\n\nფოტოები და ყველა დეტალი:\n${url}`;
    return R.dialog({
      title: 'PDF პრეზენტაცია',
      subtitle: a.name,
      wide: true,
      body: `
        <style>${PZ_CSS} .pz-preview { border: 1px solid var(--line); border-radius: var(--r); max-height: 52vh; overflow: auto; background: #d9ded9; padding: 10px; }
          .pz-preview .pz { zoom: var(--pz-zoom, .45); width: 210mm; margin: 0 auto; } .pz-preview .pz-page { margin-bottom: 10px; box-shadow: 0 2px 10px rgba(0,0,0,.2); }</style>
        <div class="lease-toolbar">
          <div class="seg" role="radiogroup" aria-label="შაბლონი">
            <label><input type="radio" name="pz-template" value="catalog" checked /><span>VIP კატალოგი (2 გვერდი)</span></label>
            <label><input type="radio" name="pz-template" value="flyer" /><span>ერთგვერდიანი ფლაერი</span></label>
          </div>
          <label class="check"><input type="checkbox" id="pz-watermark" /> <span>სააგენტოს წყლის ნიშანი ფოტოებზე</span></label>
        </div>
        <div class="pz-preview" id="pz-preview"></div>
        <div class="post-actions" style="margin-top:12px">
          <button type="button" class="btn btn-primary" id="pz-print">${icon('printer', 16)} ჩამოტვირთვა (PDF)</button>
          <a class="btn btn-wa" id="pz-wa" href="${R.whatsappUrl(waText)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp-ით გაგზავნა</a>
        </div>
        <p class="small muted" style="margin-top:8px">PDF: აირჩიე „Save as PDF“. WhatsApp-ით იგზავნება ბმული; PDF ხელით მიამაგრე.</p>`,
      onOpen: (form) => {
        const box = $('#pz-preview', form);
        const draw = () => {
          if (!box) return;
          box.style.setProperty('--pz-zoom', String(Math.min(0.62, (box.clientWidth - 24) / 794)));
          box.innerHTML = presentationHtml(a, state);
        };
        $$('input[name="pz-template"]', form).forEach(i => i.addEventListener('change', () => { state.template = i.value; draw(); }));
        $('#pz-watermark', form).addEventListener('change', (e) => { state.watermark = e.target.checked; draw(); });
        $('#pz-print', form).onclick = () => printHtml(presentationHtml(a, state), { title: `${a.name} · პრეზენტაცია`, css: PZ_CSS, page: 'size: A4; margin: 0;' });
        draw();
        qrSvg(url).then(svg => { if (svg && box.isConnected) { state.qr = svg; draw(); } });
      },
    });
  };

  // ===========================================================================
  // CONTRACT TEMPLATES (sale side). The lease agreement lives in views-deals.js.
  // ===========================================================================
  const DOCS = {
    exclusive: { title: 'ექსკლუზიური მომსახურების ხელშეკრულება', sub: 'სააგენტო ↔ მეპატრონე', parties: ['agency', 'owner'], needs: ['property', 'price', 'commission', 'term'] },
    brokerage: { title: 'საბროკერო მომსახურების ხელშეკრულება', sub: 'სააგენტო ↔ მყიდველი', parties: ['agency', 'buyer'], needs: ['wish', 'commission', 'term'] },
    deposit: { title: 'ბეს / წინარე ნასყიდობის ხელშეკრულება', sub: 'გამყიდველი ↔ მყიდველი', parties: ['owner', 'buyer'], needs: ['property', 'price', 'deposit'] },
    handover: { title: 'მიღება-ჩაბარების აქტი', sub: 'გამყიდველი → მყიდველი', parties: ['owner', 'buyer'], needs: ['property', 'handover'] },
  };
  App.DOCS = DOCS;

  const money = (n, cur) => (n === '' || n === null || n === undefined || isNaN(n) ? BLANK : `${Number(n).toLocaleString('en-US').replace(/,/g, ' ')} ${cur === 'GEL' ? 'ლარი' : 'აშშ დოლარი'}`);

  function docArticles(type, d) {
    const price = money(d.price, d.currency);
    const prop = `${val(d.property_address)} (საკადასტრო კოდი: ${val(d.cadastral_code)}${d.area_sqm ? `, ფართობი: ${esc(d.area_sqm)} მ²` : ''})`;
    const comm = val(d.commission);
    const term = val(dmy(d.term_end));
    if (type === 'exclusive') return [
      ['ხელშეკრულების საგანი', [
        `მესაკუთრე ანიჭებს სააგენტოს ექსკლუზიურ უფლებას, მოიძიოს მყიდველი და წარმოადგინოს მესაკუთრე შემდეგი უძრავი ქონების გასაყიდად: ${prop} (შემდგომში „ქონება“).`,
        `ქონების გასაყიდი ფასი შეადგენს ${price}-ს. ფასის ცვლილება ხდება მხარეთა წერილობითი შეთანხმებით.`,
        `ექსკლუზიურობა ნიშნავს, რომ ხელშეკრულების მოქმედების ვადაში მესაკუთრე ქონების გაყიდვას არ ანდობს სხვა სააგენტოს ან შუამავალს.`]],
      ['სააგენტოს ვალდებულებები', [
        'სააგენტო საკუთარი ხარჯით ამზადებს ქონების ფოტოებსა და აღწერას, ათავსებს განცხადებებს და აწყობს ქონების ჩვენებებს დაინტერესებული პირებისთვის.',
        'სააგენტო მესაკუთრეს რეგულარულად აწვდის ინფორმაციას ჩატარებული ჩვენებებისა და მიღებული შეთავაზებების შესახებ.',
        'სააგენტო არ არის უფლებამოსილი, მესაკუთრის სახელით ხელი მოაწეროს ნასყიდობის ხელშეკრულებას ან მიიღოს თანხა, თუ ამაზე ცალკე მინდობილობა არ გაცემულა.']],
      ['მესაკუთრის ვალდებულებები', [
        'მესაკუთრე ადასტურებს, რომ არის ქონების მესაკუთრე და უფლებამოსილია, განკარგოს იგი. ქონებაზე არსებული იპოთეკის, ყადაღის ან სხვა უფლებრივი ტვირთის შესახებ მესაკუთრე სააგენტოს წერილობით ატყობინებს.',
        'მესაკუთრე უზრუნველყოფს ქონების დათვალიერების შესაძლებლობას წინასწარ შეთანხმებულ დროს.',
        'მესაკუთრე ყველა დაინტერესებულ პირს, რომელიც მას პირდაპირ დაუკავშირდება, გადაამისამართებს სააგენტოსთან.']],
      ['საკომისიო', [
        `სააგენტოს მომსახურების საზღაური შეადგენს ${comm}-ს ქონების ფაქტობრივი გასაყიდი ფასიდან.`,
        'საკომისიო გადაიხდება ნასყიდობის ხელშეკრულების საჯარო რეესტრში რეგისტრაციის დღეს.',
        'საკომისიო გადაიხდება იმ შემთხვევაშიც, თუ ქონება ხელშეკრულების მოქმედების ვადაში ან მისი დასრულებიდან 6 თვის განმავლობაში გაიყიდა იმ პირზე, რომელსაც ქონება სააგენტომ წარუდგინა.']],
      ['ვადა და შეწყვეტა', [
        `ხელშეკრულება ძალაშია ხელმოწერის დღიდან ${term}-მდე.`,
        'მხარეს უფლება აქვს, ვადამდე შეწყვიტოს ხელშეკრულება მეორე მხარის მიერ ვალდებულებების არსებითი დარღვევისას, 10 დღით ადრე წერილობითი შეტყობინებით.']],
    ];
    if (type === 'brokerage') return [
      ['ხელშეკრულების საგანი', [
        'სააგენტო იღებს ვალდებულებას, კლიენტისთვის მოიძიოს უძრავი ქონება მისი მოთხოვნების შესაბამისად და დაეხმაროს შეძენის პროცესში.',
        `კლიენტის მოთხოვნები: ${val(d.wish)}.`]],
      ['სააგენტოს ვალდებულებები', [
        'სააგენტო კლიენტს სთავაზობს მოთხოვნებთან შესაბამის ობიექტებს და აწყობს მათ დათვალიერებას.',
        'სააგენტო კლიენტს აწვდის მისთვის ცნობილ ინფორმაციას ობიექტის სამართლებრივი მდგომარეობის შესახებ და ეხმარება საჯარო რეესტრის ამონაწერის გადამოწმებაში.',
        'სააგენტო წარმართავს მოლაპარაკებას გამყიდველთან კლიენტის ინტერესების შესაბამისად.']],
      ['კლიენტის ვალდებულებები', [
        'კლიენტი ადასტურებს, რომ სააგენტოს მიერ ნაჩვენებ ობიექტებთან დაკავშირებით მესაკუთრესთან ან მის წარმომადგენელთან მოლაპარაკებას აწარმოებს მხოლოდ სააგენტოს მეშვეობით.',
        'კლიენტი ხელს აწერს ყოველი ობიექტის დათვალიერების ფურცელს, რომელიც ადასტურებს, რომ ობიექტი მას სააგენტომ წარუდგინა.']],
      ['საკომისიო', [
        `სააგენტოს მომსახურების საზღაური შეადგენს ${comm}-ს შეძენილი ქონების ფასიდან.`,
        'საკომისიო გადაიხდება ნასყიდობის ხელშეკრულების საჯარო რეესტრში რეგისტრაციის დღეს.',
        'საკომისიო გადაიხდება იმ შემთხვევაშიც, თუ კლიენტი ან მასთან დაკავშირებული პირი სააგენტოს მიერ ნაჩვენებ ობიექტს შეიძენს ხელშეკრულების დასრულებიდან 6 თვის განმავლობაში.']],
      ['ვადა', [
        `ხელშეკრულება ძალაშია ხელმოწერის დღიდან ${term}-მდე.`,
        'მხარეს უფლება აქვს, ვადამდე შეწყვიტოს ხელშეკრულება 10 დღით ადრე წერილობითი შეტყობინებით. შეწყვეტა არ ათავისუფლებს კლიენტს უკვე წარმოშობილი საკომისიოს გადახდისგან.']],
    ];
    if (type === 'deposit') return [
      ['ხელშეკრულების საგანი', [
        `მხარეები თანხმდებიან, რომ არაუგვიანეს ${val(dmy(d.final_date))}-ისა დადებენ ნასყიდობის ხელშეკრულებას შემდეგ უძრავ ქონებაზე: ${prop}.`,
        `ქონების ნასყიდობის ფასი შეადგენს ${price}-ს და ძირითადი ხელშეკრულების დადებამდე არ შეიცვლება.`]],
      ['ბე', [
        `ვალდებულების შესრულების უზრუნველსაყოფად მყიდველი გამყიდველს ხელშეკრულების ხელმოწერისას გადასცემს ბეს ${money(d.deposit_amount, d.currency)}-ის ოდენობით. ხელმოწერა ადასტურებს თანხის მიღებას.`,
        'ბე ჩაითვლება ნასყიდობის ფასში.',
        'თუ ძირითადი ხელშეკრულება არ დაიდო მყიდველის ბრალით, ბე რჩება გამყიდველს.',
        'თუ ძირითადი ხელშეკრულება არ დაიდო გამყიდველის ბრალით, გამყიდველი მყიდველს უბრუნებს ბეს ორმაგი ოდენობით.']],
      ['გამყიდველის გარანტიები', [
        'გამყიდველი ადასტურებს, რომ არის ქონების მესაკუთრე, ქონება არ არის დატვირთული იპოთეკით, ყადაღით ან მესამე პირთა უფლებებით და არ არის სადავო. სხვა შემთხვევაში ამის შესახებ მითითებულია დამატებით პირობებში.',
        'გამყიდველი ვალდებულია, ძირითადი ხელშეკრულების დადებამდე ქონება არ გაასხვისოს და არ დატვირთოს.']],
      ['დასკვნითი დებულებები', [
        'ძირითადი ხელშეკრულება იდება წერილობით და რეგისტრირდება საჯარო რეესტრში. რეგისტრაციის ხარჯს იხდის მყიდველი, თუ მხარეები სხვაგვარად არ შეთანხმდებიან.',
        'დავა წყდება მოლაპარაკებით, შეუთანხმებლობისას კი საქართველოს სასამართლოში.']],
    ];
    return [
      ['ჩაბარების საგანი', [
        `გამყიდველმა გადასცა, ხოლო მყიდველმა ჩაიბარა უძრავი ქონება: ${prop}.`,
        `ქონების გადაცემის თარიღი: ${val(dmy(d.contract_date))}.`]],
      ['ქონების მდგომარეობა', [
        `მყიდველმა ქონება დაათვალიერა. მდგომარეობის შესახებ შენიშვნები: ${val(d.condition, 'შენიშვნის გარეშე')}.`,
        `გადაცემული გასაღებების რაოდენობა: ${val(d.keys, '____')}.`,
        `მრიცხველების ჩვენებები გადაცემის მომენტში: ელექტროენერგია ${val(d.meter_power, '________')}, წყალი ${val(d.meter_water, '________')}, გაზი ${val(d.meter_gas, '________')}.`]],
      ['ანგარიშსწორება', [
        'გადაცემის დღემდე დარიცხულ კომუნალურ გადასახადებს ფარავს გამყიდველი, გადაცემის დღიდან კი მყიდველი.',
        'ამ აქტის ხელმოწერით მხარეები ადასტურებენ, რომ ქონების გადაცემასთან დაკავშირებით ერთმანეთის მიმართ პრეტენზია არ გააჩნიათ.']],
    ];
  }

  function docHtml(d) {
    const def = DOCS[d.doc_type] || DOCS.exclusive;
    const party = {
      agency: ['სააგენტო', `${val(d.agency_name)}${d.agency_code ? `, ს/კ: ${esc(d.agency_code)}` : ''}, წარმომადგენელი: ${val(d.agency_rep)}`, d.agency_rep, d.agency_code, d.agency_phone],
      owner: [d.doc_type === 'exclusive' ? 'მესაკუთრე' : 'გამყიდველი', `${val(d.owner_name)}, პირადი ნომერი: ${val(d.owner_id)}${d.owner_address ? `, მისამართი: ${esc(d.owner_address)}` : ''}`, d.owner_name, d.owner_id, d.owner_phone],
      buyer: [d.doc_type === 'brokerage' ? 'კლიენტი' : 'მყიდველი', `${val(d.buyer_name)}, პირადი ნომერი: ${val(d.buyer_id)}${d.buyer_address ? `, მისამართი: ${esc(d.buyer_address)}` : ''}`, d.buyer_name, d.buyer_id, d.buyer_phone],
    };
    const [p1, p2] = def.parties.map(k => party[k]);
    const arts = docArticles(d.doc_type, d);
    if (String(d.extra_terms || '').trim()) arts.push(['დამატებითი პირობები', [esc(d.extra_terms.trim())]]);
    const sign = ([role, , name, pid, phone]) => `<div><strong>${role}</strong><div>${val(name)}</div><div>პ/ნ: ${val(pid)}${phone ? ` · ტელ.: ${esc(phone)}` : ''}</div><div class="ld-line"></div><small>ხელმოწერა</small></div>`;
    return `<div class="lease-doc">
      <h2>${def.title}</h2>
      <div class="ld-place"><span>ქ. ${val(d.city)}</span><span>${val(dmy(d.contract_date))}</span></div>
      <div class="ld-parties"><p>ერთი მხრივ, ${p1[1]} (შემდგომში „${p1[0]}“), და მეორე მხრივ, ${p2[1]} (შემდგომში „${p2[0]}“), ${d.doc_type === 'handover' ? 'ადგენენ ამ აქტს შემდეგზე:' : 'დებენ ამ ხელშეკრულებას შემდეგზე:'}</p></div>
      ${arts.map(([title, clauses], i) => `<h3>მუხლი ${i + 1}. ${title}</h3>${clauses.map((c, j) => `<p>${i + 1}.${j + 1}. ${c}</p>`).join('')}`).join('')}
      <p>${d.doc_type === 'handover' ? 'აქტი' : 'ხელშეკრულება'} შედგენილია ორ თანაბარი იურიდიული ძალის მქონე ეგზემპლარად, თითო თითოეული მხარისთვის.</p>
      <div class="ld-sign">${sign(p1)}${sign(p2)}</div>
    </div>`;
  }
  App.docHtml = docHtml;

  // Fills every field the workspace already knows: parties, property, price and commission.
  function docDefaults(type, a, deal) {
    const owner = H.owner(deal?.seller_id) || H.owner(a?.owner_id);
    const buyer = deal ? H.contactByPhone(deal.client_phone) : null;
    const isSale = (deal?.deal_type || a?.transaction_type) === 'sale';
    const price = deal?.deal_amount || (a ? (a.transaction_type === 'sale' ? a.sale_price : a.monthly_rent) : '') || '';
    const pct = deal?.commission_type === 'fixed' ? '' : (deal?.commission_percent ?? (isSale ? 3 : ''));
    const nextQuarter = new Date(); nextQuarter.setMonth(nextQuarter.getMonth() + 3);
    return {
      doc_type: type, city: a?.city || S.org?.city || '', contract_date: R.isoDate(),
      agency_name: S.org?.name || '', agency_code: '', agency_rep: S.member?.display_name || '', agency_phone: S.member?.phone || S.org?.contact_phone || '',
      owner_name: owner?.name || '', owner_id: owner?.personal_id || '', owner_phone: owner?.phone || '', owner_address: '',
      buyer_name: deal?.client_name || '', buyer_id: buyer?.personal_id || '', buyer_phone: deal?.client_phone || '', buyer_address: '',
      property_address: a ? [a.city, a.district, a.address, a.unit_number && `ბინა ${a.unit_number}`].filter(Boolean).join(', ') : '',
      cadastral_code: a?.cadastral_code || '', area_sqm: a?.area_sqm || '',
      price, currency: deal?.currency || a?.currency || 'USD',
      commission: pct !== '' ? `${pct}%` : (deal?.commission_amount ? fmtMoney(deal.commission_amount, deal.currency || 'USD') : ''),
      term_end: R.isoDate(nextQuarter), deposit_amount: '', final_date: deal?.target_move_in || '',
      wish: buyer?.requirements && typeof buyer.requirements === 'string' ? buyer.requirements : (deal?.notes || ''),
      condition: '', keys: '', meter_power: '', meter_water: '', meter_gas: '', extra_terms: '',
    };
  }

  App.openLegalDoc = (type, { apartment = null, deal = null } = {}) => {
    const def = DOCS[type];
    if (!def || !App.guardFeature('contracts')) return undefined;
    let a = apartment || H.apt(deal?.apartment_id) || null;
    let dl = deal;
    const d = docDefaults(type, a, dl);
    const has = (k) => def.needs.includes(k) || def.parties.includes(k);
    const f = (name, label, o = {}) => `<label class="field ${o.span ? 'span-2' : ''}"><span class="field-label">${label}</span>${o.textarea
      ? `<textarea name="${name}" rows="${o.rows || 2}" placeholder="${esc(o.ph || '')}">${esc(d[name] || '')}</textarea>`
      : `<input name="${name}" type="${o.type || 'text'}" ${o.required ? `required data-error="${esc(o.err || 'შეავსე სავალდებულო ველები.')}"` : ''} ${o.attrs || ''} value="${esc(d[name] ?? '')}" placeholder="${esc(o.ph || '')}" />`}${o.hint ? `<span class="field-hint">${o.hint}</span>` : ''}</label>`;
    const person = (key, title) => `<div class="form-section"><div class="form-section-title">${title}</div><div class="form-grid">
      ${f(`${key}_name`, 'სახელი, გვარი', { required: true, err: `მიუთითე: ${title}.` })}${f(`${key}_id`, 'პირადი ნომერი', { attrs: 'inputmode="numeric" maxlength="20"' })}
      ${f(`${key}_phone`, 'ტელეფონი', { type: 'tel' })}${f(`${key}_address`, 'მისამართი')}</div></div>`;
    const deals = (S.data.deals || []).filter(x => !['lost'].includes(x.stage));
    const apts = S.data.apartments.filter(x => x.status !== 'archived');

    return R.dialog({
      title: def.title,
      subtitle: def.sub,
      wide: true,
      submitLabel: 'დოკუმენტის შედგენა',
      body: `
        <div class="notice small">${icon('alert', 14)} ზოგადი შაბლონი. ხელმოწერამდე გადაამოწმე იურისტთან. ცარიელი ველები ხელით შეივსება.</div>
        <div class="form-section"><div class="form-section-title">საიდან შევავსო</div><div class="form-grid">
          <label class="field"><span class="field-label">გარიგება</span><select id="doc-deal"><option value="">არ არის არჩეული</option>${deals.map(x => `<option value="${x.id}" ${x.id === dl?.id ? 'selected' : ''}>${esc(x.client_name)}${x.apartment_id ? ' · ' + esc(H.aptName(x.apartment_id)) : ''}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">ობიექტი</span><select id="doc-apt"><option value="">არ არის არჩეული</option>${apts.map(x => `<option value="${x.id}" ${x.id === a?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        </div></div>
        ${has('agency') ? `<div class="form-section"><div class="form-section-title">სააგენტო</div><div class="form-grid">
          ${f('agency_name', 'დასახელება', { required: true, err: 'მიუთითე სააგენტოს დასახელება.' })}${f('agency_code', 'საიდენტიფიკაციო კოდი', { attrs: 'inputmode="numeric" maxlength="20"' })}
          ${f('agency_rep', 'წარმომადგენელი')}${f('agency_phone', 'ტელეფონი', { type: 'tel' })}</div></div>` : ''}
        ${has('owner') ? person('owner', type === 'exclusive' ? 'მესაკუთრე' : 'გამყიდველი') : ''}
        ${has('buyer') ? person('buyer', type === 'brokerage' ? 'კლიენტი' : 'მყიდველი') : ''}
        ${has('property') ? `<div class="form-section"><div class="form-section-title">ქონება</div><div class="form-grid">
          ${f('property_address', 'მისამართი', { span: true, required: true, err: 'მიუთითე ქონების მისამართი.' })}
          <label class="field"><span class="field-label">საკადასტრო კოდი</span><input name="cadastral_code" id="doc-cadastral" value="${esc(d.cadastral_code)}" placeholder="01.10.14.009.011" inputmode="numeric" /><span class="field-hint"><button type="button" class="link-btn small" id="doc-napr">${icon('search', 12)} NAPR რეესტრში გადამოწმება</button></span></label>
          ${f('area_sqm', 'ფართობი (მ²)', { type: 'number', attrs: 'min="1" step="0.1"' })}</div></div>` : ''}
        <div class="form-section"><div class="form-section-title">პირობები</div><div class="form-grid">
          ${f('city', 'დადების ქალაქი')}${f('contract_date', 'თარიღი', { type: 'date' })}
          ${has('price') ? `<label class="field"><span class="field-label">ფასი</span><div class="input-pair"><input name="price" type="number" min="0" step="100" value="${esc(d.price ?? '')}" />
            <select name="currency" aria-label="ვალუტა"><option value="USD" ${d.currency !== 'GEL' ? 'selected' : ''}>USD</option><option value="GEL" ${d.currency === 'GEL' ? 'selected' : ''}>GEL</option></select></div></label>` : ''}
          ${has('commission') ? f('commission', 'საკომისიო', { ph: '3%', hint: 'პროცენტი ან თანხა' }) : ''}
          ${has('term') ? f('term_end', 'მოქმედების ვადა', { type: 'date' }) : ''}
          ${has('deposit') ? f('deposit_amount', 'ბეს ოდენობა', { type: 'number', attrs: 'min="0" step="100"', hint: 'ფასის ვალუტაში' }) + f('final_date', 'ძირითადი ხელშეკრულების ბოლო ვადა', { type: 'date' }) : ''}
          ${has('wish') ? f('wish', 'კლიენტის მოთხოვნები', { textarea: true, span: true, ph: 'მაგ.: 2-ოთახიანი ბინა საბურთალოზე, $150 000-მდე' }) : ''}
          ${has('handover') ? f('keys', 'გასაღებების რაოდენობა', { type: 'number', attrs: 'min="0"' }) + f('meter_power', 'ელექტროენერგიის მრიცხველი') + f('meter_water', 'წყლის მრიცხველი') + f('meter_gas', 'გაზის მრიცხველი') + f('condition', 'მდგომარეობის შენიშვნები', { textarea: true, span: true }) : ''}
          ${f('extra_terms', 'დამატებითი პირობები', { textarea: true, span: true, rows: 3, hint: 'არასავალდებულო. ცალკე მუხლად დაემატება.' })}
        </div></div>`,
      onOpen: (form) => {
        // Choosing another deal or property refills the fields from the workspace data.
        const refill = () => {
          dl = H.deal($('#doc-deal', form).value) || null;
          a = H.apt($('#doc-apt', form).value) || null;
          const next = docDefaults(type, a, dl);
          Object.entries(next).forEach(([k, v]) => { const el = form.elements[k]; if (el && k !== 'extra_terms') el.value = v ?? ''; });
        };
        $('#doc-deal', form).addEventListener('change', () => { const x = H.deal($('#doc-deal', form).value); if (x?.apartment_id) $('#doc-apt', form).value = x.apartment_id; refill(); });
        $('#doc-apt', form).addEventListener('change', refill);
        const cad = $('#doc-cadastral', form);
        cad?.addEventListener('input', () => { cad.value = R.cadastralFormat(cad.value); });
        $('#doc-napr', form)?.addEventListener('click', () => App.openNapr(cad.value));
      },
      onSubmit: async (_f, v) => {
        const data = { ...d, ...v, doc_type: type };
        const row = await App.insertOnce('contracts', { id: R.uuid(), organization_id: S.org.id, apartment_id: a?.id || null, deal_id: dl?.id || null, data, created_by: S.user.id });
        docCache.org = null;
        if (App.route().name === 'deals' && App.route().id === 'documents') App.render();
        toast('დოკუმენტი შენახულია', { type: 'success' });
        setTimeout(() => openDocPreview(row.data || data), 0);
      },
    });
  };

  function openDocPreview(d) {
    const def = DOCS[d.doc_type];
    return R.dialog({
      title: 'დოკუმენტი მზადაა',
      subtitle: def.title,
      wide: true,
      body: `<style>${LEASE_CSS}</style>
        <div class="lease-toolbar"><span class="small muted lease-hint">${icon('alert', 13)} შაბლონი არ ცვლის იურიდიულ კონსულტაციას.</span>
          <button type="button" class="btn btn-primary" id="btn-print-doc">${icon('printer', 16)} ბეჭდვა / PDF</button></div>
        <div class="lease-paper" id="doc-paper">${docHtml(d)}</div>`,
      onOpen: (form) => { $('#btn-print-doc', form).onclick = () => printHtml(docHtml(d), { title: def.title, css: `body { padding: 0; } ${LEASE_CSS}` }); },
    });
  }

  // Template picker opened from a property page or a sale deal card.
  App.openDocChooser = ({ apartment = null, deal = null } = {}) => {
    if (!App.guardFeature('contracts')) return undefined;
    const a = apartment || H.apt(deal?.apartment_id) || null;
    const rental = a ? a.transaction_type !== 'sale' : (deal ? deal.deal_type !== 'sale' : true);
    return R.dialog({
      title: 'ხელშეკრულებები',
      subtitle: a?.name || deal?.client_name || '',
      body: `<div class="rows">${Object.entries(DOCS).map(([k, def]) => `<button type="button" class="row" data-pick="${k}" style="--cols:minmax(0,1fr) 20px"><span class="cell-main"><strong>${def.title}</strong><span>${def.sub}</span></span>${icon('chevronRight', 16)}</button>`).join('')}
        ${rental ? `<button type="button" class="row" data-pick="lease" style="--cols:minmax(0,1fr) 20px"><span class="cell-main"><strong>ქირავნობის ხელშეკრულება</strong><span>ორენოვანი · მეპატრონე ↔ მდგმური</span></span>${icon('chevronRight', 16)}</button>` : ''}</div>
        ${a?.cadastral_code ? `<div style="margin-top:12px">${App.naprButton(a.cadastral_code)}</div>` : ''}`,
      onOpen: (form, dlg) => {
        $$('[data-pick]', form).forEach(b => b.addEventListener('click', () => {
          dlg.close();
          setTimeout(() => (b.dataset.pick === 'lease' ? App.openLeaseAgreementGenerator(a, deal) : App.openLegalDoc(b.dataset.pick, { apartment: a, deal })), 0);
        }));
        App.bindNapr(form);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Documents tab (inside Deals): templates, saved documents, registry check
  // ---------------------------------------------------------------------------
  const docCache = { org: null, rows: [], error: null, loading: false };
  // Called when a contract is saved elsewhere (lease form) so the Documents tab reloads.
  App.invalidateDocs = () => { docCache.org = null; };
  async function loadDocs() {
    docCache.loading = true; docCache.error = null;
    try {
      docCache.rows = await q(sb.from('contracts').select('*').eq('organization_id', S.org.id).order('created_at', { ascending: false }).limit(50));
      docCache.org = S.org.id;
    } catch (err) { console.error(err); docCache.error = err; } finally { docCache.loading = false; }
    if (App.route().name === 'deals' && App.route().id === 'documents') App.render();
  }

  App.renderDocuments = (root) => {
    if (docCache.org !== S.org.id && !docCache.error && !docCache.loading) loadDocs();
    const saved = docCache.org === S.org.id ? docCache.rows : null;
    root.innerHTML = `
      <div class="cols"><div class="stack">
        <section class="card"><div class="card-head"><h2>${icon('file', 18)} შაბლონები</h2></div>
          <div class="rows">${Object.entries(DOCS).map(([k, def]) => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${def.title}</strong><span>${def.sub} · ავტომატურად ივსება გარიგებიდან და ობიექტიდან</span></span>
            <button type="button" class="btn btn-secondary btn-sm" data-doc="${k}">შედგენა</button></div>`).join('')}
            <div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>ქირავნობის ხელშეკრულება (ორენოვანი)</strong><span>მეპატრონე ↔ მდგმური · სსკ 531–575 მუხლები და მიღება-ჩაბარების აქტი</span></span>
              <button type="button" class="btn btn-secondary btn-sm" data-doc="lease">შედგენა</button></div>
          </div></section>
        <section class="card"><div class="card-head"><h2>შენახული დოკუმენტები</h2></div>
          ${docCache.error ? `<div class="error-state"><p>დოკუმენტები ვერ ჩაიტვირთა. ${esc(R.friendlyError(docCache.error))}</p><button type="button" class="btn btn-primary" id="doc-retry">${icon('refresh', 16)} ხელახლა ცდა</button></div>`
            : saved === null ? '<div class="skeleton" aria-label="იტვირთება"><i></i><i></i><i></i></div>'
            : saved.length ? `<div class="rows">${saved.map(c => { const t = c.data?.doc_type; const name = t ? DOCS[t]?.title : 'ქირავნობის ხელშეკრულება'; const who = t ? [c.data.owner_name, c.data.buyer_name].filter(Boolean).join(' · ') : [c.data?.landlord_name, c.data?.tenant_name].filter(Boolean).join(' · ');
              return `<button type="button" class="row" data-saved="${c.id}" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(name || 'დოკუმენტი')}</strong><span>${esc(who)}${c.apartment_id ? ' · ' + esc(H.aptName(c.apartment_id)) : ''}</span></span><span class="cell-meta">${esc(R.date(c.created_at))}</span></button>`; }).join('')}</div>`
            : App.emptyInline('შენახული დოკუმენტი ჯერ არ არის. აირჩიე შაბლონი და შეადგინე პირველი.')}
        </section>
      </div><div class="stack">
        <section class="card"><div class="card-head"><h2>${icon('search', 18)} საჯარო რეესტრი (NAPR)</h2></div><div class="card-body">
          <p class="small muted" style="margin-bottom:10px">გარიგებამდე გადაამოწმე მესაკუთრე, იპოთეკა და ყადაღა. კოდი დაკოპირდება და რეესტრის ძებნა გაიხსნება.</p>
          <label class="field"><span class="field-label">საკადასტრო კოდი</span><input class="input" id="napr-code" placeholder="01.10.14.009.011" inputmode="numeric" /></label>
          <button type="button" class="btn btn-primary btn-block" id="napr-go" style="margin-top:10px">${icon('search', 16)} NAPR რეესტრში გადამოწმება</button>
        </div></section>
      </div></div>`;
    $$('[data-doc]', root).forEach(b => b.addEventListener('click', () => {
      if (b.dataset.doc === 'lease') App.openLeaseAgreementGenerator(null, null);
      else App.openLegalDoc(b.dataset.doc);
    }));
    $$('[data-saved]', root).forEach(b => b.addEventListener('click', () => {
      const c = docCache.rows.find(x => x.id === b.dataset.saved);
      if (!c) return;
      if (c.data?.doc_type) openDocPreview(c.data); else App.openLeasePreview?.(c.data, H.apt(c.apartment_id) || { name: c.data?.property_address || '' });
    }));
    $('#doc-retry', root)?.addEventListener('click', () => { docCache.error = null; App.render(); });
    const code = $('#napr-code', root);
    code.addEventListener('input', () => { code.value = R.cadastralFormat(code.value); });
    $('#napr-go', root).onclick = () => App.openNapr(code.value);
  };
})();
