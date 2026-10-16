// Apartments, apartment detail, reservations, owners and approvals.
(() => {
  'use strict';
  const { sb, $, $$, esc, icon, q, toast, run, L, money } = R;
  const { S, H } = App;

  // ===========================================================================
  // LISTING (smart link) HELPERS
  // ===========================================================================
  // Amenity ids are shared with the public page /p/ (AMENITIES there).
  const AMENITIES = [['wifi', 'Wi-Fi'], ['ac', 'კონდიციონერი'], ['heating', 'ცენტრალური გათბობა'], ['furnished', 'ავეჯით'], ['balcony', 'აივანი'],
    ['sea_view', 'ზღვის ხედი'], ['city_view', 'ქალაქის ხედი'], ['washing_machine', 'სარეცხი მანქანა'], ['dishwasher', 'ჭურჭლის სარეცხი მანქანა'],
    ['oven', 'ღუმელი'], ['microwave', 'მიკროტალღური ღუმელი'], ['tv', 'Smart TV'], ['elevator', 'ლიფტი'], ['parking', 'პარკინგი'],
    ['security', 'დაცვა 24/7'], ['pool', 'აუზი'], ['gym', 'სპორტული დარბაზი']];
  const BADGES = [['', 'არ არის'], ['new', 'ახალი'], ['hot', 'ცხელი შეთავაზება'], ['price_drop', 'ფასი შემცირდა'], ['exclusive', 'ექსკლუზივი'], ['available', 'თავისუფალია'], ['reserved', 'დაჯავშნილია']];
  const MAX_PHOTOS = 30;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
  const KA_LAT = { 'ა': 'a', 'ბ': 'b', 'გ': 'g', 'დ': 'd', 'ე': 'e', 'ვ': 'v', 'ზ': 'z', 'თ': 't', 'ი': 'i', 'კ': 'k', 'ლ': 'l', 'მ': 'm', 'ნ': 'n', 'ო': 'o', 'პ': 'p', 'ჟ': 'zh', 'რ': 'r', 'ს': 's', 'ტ': 't', 'უ': 'u', 'ფ': 'p', 'ქ': 'k', 'ღ': 'gh', 'ყ': 'q', 'შ': 'sh', 'ჩ': 'ch', 'ც': 'ts', 'ძ': 'dz', 'წ': 'ts', 'ჭ': 'ch', 'ხ': 'kh', 'ჯ': 'j', 'ჰ': 'h' };

  // Columns added by supabase/patches/01_smartlink.sql (slug, lat, lng, badge, agent_name).
  // Sent only when the database already has them, so an unpatched project keeps working.
  const smartlinkReady = () => S.data.apartments.some(x => x && 'slug' in x);

  function slugify(text) {
    const base = String(text || '').toLowerCase().split('').map(c => KA_LAT[c] ?? c).join('')
      .normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
    return `${base.length >= 3 ? base + '-' : 'bina-'}${Math.random().toString(36).slice(2, 6)}`;
  }

  const listingUrl = (a, wl = false) => R.listingUrl(a, wl);
  const listingPhotos = (a) => (Array.isArray(a.photos) ? a.photos : [])
    .map((p, i) => typeof p === 'string' ? { url: p, thumb: p, order: i } : { url: p?.url, thumb: p?.thumb || p?.url, order: p?.order ?? i, ...(p?.wm ? { wm: true } : {}) })
    .filter(p => p.url).sort((x, y) => x.order - y.order);

  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImg(file));
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  // Downscale to fit `max` px on the longest side and re-encode as JPEG.
  async function resizeImage(file, max, quality = 0.84) {
    let bmp;
    try { bmp = await loadBitmap(file); } catch { throw new Error(`„${file.name}“ ვერ წავიკითხე. ატვირთე JPG, PNG ან WebP ფორმატის ფოტო.`); }
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error(`„${file.name}“ ვერ დამუშავდა.`);
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  }

  async function uploadListingPhoto(aptId, file) {
    const [big, small] = await Promise.all([resizeImage(file, 1600), resizeImage(file, 480, 0.78)]);
    const folder = `apartments/${aptId}`;
    const [url, thumb] = await Promise.all([R.uploadFile(S.org.id, folder, big), R.uploadFile(S.org.id, folder, small)]);
    return { url, thumb };
  }

  // Photo manager inside a dialog: upload (resized), reorder, delete. get() → [{url, thumb, order}]
  function photoManagerHtml() {
    return `<div class="pm" data-pm>
      <div class="pm-grid" data-pm-grid></div>
      <p class="field-hint" data-pm-hint></p>
    </div>`;
  }
  function photoManager(root, initial, aptId) {
    let items = listingPhotos({ photos: initial }).map(({ url, thumb }) => ({ url, thumb }));
    let pending = 0;
    const grid = $('[data-pm-grid]', root);
    const hint = $('[data-pm-hint]', root);
    const draw = () => {
      if (!grid) return;
      grid.innerHTML = items.map((p, i) => `<figure class="pm-item">
          <img src="${esc(p.thumb || p.url)}" alt="ფოტო ${i + 1}" loading="lazy" />
          ${i === 0 ? '<span class="pm-cover">მთავარი</span>' : ''}
          <div class="pm-actions">
            <button type="button" class="pm-btn" data-pm-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="ფოტო ${i + 1}: წინ გადატანა" title="წინ გადატანა">‹</button>
            <button type="button" class="pm-btn" data-pm-move="${i}" data-dir="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="ფოტო ${i + 1}: უკან გადატანა" title="უკან გადატანა">›</button>
            <button type="button" class="pm-btn pm-del" data-pm-del="${i}" aria-label="ფოტო ${i + 1}: წაშლა" title="წაშლა">${icon('close', 14)}</button>
          </div></figure>`).join('')
        + Array.from({ length: pending }, () => '<div class="pm-item pm-loading"><span>იტვირთება…</span></div>').join('')
        + (items.length + pending < MAX_PHOTOS ? `<label class="pm-add">${icon('camera', 20)}<span>ფოტოების დამატება</span><input type="file" accept="image/*" multiple data-pm-input /></label>` : '');
      hint.textContent = items.length
        ? `${items.length} ფოტო. პირველი ფოტო მთავარია: ის ჩანს ბმულის გაზიარებისას. რიგის შესაცვლელად გამოიყენე ისრები.`
        : 'ატვირთე ბინის ფოტოები. ფოტოები ავტომატურად შემცირდება სწრაფი ჩატვირთვისთვის.';
    };
    grid.addEventListener('click', (e) => {
      const mv = e.target.closest('[data-pm-move]');
      const del = e.target.closest('[data-pm-del]');
      if (mv) {
        const i = Number(mv.dataset.pmMove), j = i + Number(mv.dataset.dir);
        if (j < 0 || j >= items.length) return;
        [items[i], items[j]] = [items[j], items[i]];
        draw();
        $(`[data-pm-move="${j}"][data-dir="${mv.dataset.dir}"]`, grid)?.focus();
      } else if (del) {
        items.splice(Number(del.dataset.pmDel), 1);
        draw();
      }
    });
    grid.addEventListener('change', async (e) => {
      if (!e.target.matches('[data-pm-input]')) return;
      const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name));
      const room = MAX_PHOTOS - items.length - pending;
      if (files.length > room) toast(`მაქსიმუმ ${MAX_PHOTOS} ფოტო. დაემატება მხოლოდ პირველი ${room}.`, { type: 'error' });
      const batch = files.slice(0, Math.max(0, room));
      pending += batch.length; draw();
      for (const f of batch) {
        try { items.push(await uploadListingPhoto(aptId, f)); }
        catch (err) { console.error(err); toast(R.friendlyError(err), { type: 'error' }); }
        finally { pending -= 1; draw(); }
      }
    });
    draw();
    const addUrls = (urls) => { urls.slice(0, Math.max(0, MAX_PHOTOS - items.length)).forEach(u => { if (!items.some(p => p.url === u)) items.push({ url: u, thumb: u }); }); draw(); };
    return { get: () => items.map((p, i) => ({ url: p.url, thumb: p.thumb || p.url, order: i, ...(p.wm ? { wm: true } : {}) })), busy: () => pending > 0, addUrls };
  }

  function openPhotosDialog(a) {
    let pm;
    return R.dialog({
      title: 'განცხადების ფოტოები', subtitle: a.name, wide: true, submitLabel: 'შენახვა',
      body: photoManagerHtml(),
      onOpen: (form) => { pm = photoManager(form, a.photos, a.id); },
      onSubmit: async () => {
        if (pm.busy()) throw new Error('დაელოდე ფოტოების ატვირთვის დასრულებას.');
        const row = await q(sb.from('apartments').update({ photos: pm.get() }).eq('id', a.id).select().single());
        App.upsertLocal('apartments', row);
        App.render();
        toast('ფოტოები შენახულია', { type: 'success' });
      },
    });
  }
  App.openListingPhotos = openPhotosDialog;

  // ===========================================================================
  // WATERMARK TOOL (1-Click Anti-Theft Branding)
  // ===========================================================================
  function openWatermarkDialog(a) {
    const photos = listingPhotos(a);
    if (!photos.length) {
      toast('ამ ბინას ფოტოები არ აქვს. ჯერ ატვირთე ფოტოები.', { type: 'error' });
      return;
    }
    let currentIdx = 0;
    let wmText = `${S.org.name || 'Rigzea Real Estate'} · ${a.agent_phone || S.org.contact_phone || ''}`.trim();
    let wmPos = 'br';
    let wmOpacity = 0.70;
    let activeImageObj = null;

    return R.dialog({
      title: '🛡️ ფოტოების დაცვა: Watermark & ლოგო',
      subtitle: `${a.name} · ${photos.length} ფოტო`,
      wide: true,
      body: `
        <div class="wm-modal-wrap">
          <div class="wm-canvas-preview">
            <canvas id="wm-canvas" width="800" height="500"></canvas>
          </div>
          ${photos.length > 1 ? `
          <div class="wm-thumbs" id="wm-thumbs">
            ${photos.map((p, i) => `
              <div class="wm-thumb ${i === 0 ? 'active' : ''}" data-wm-idx="${i}">
                <img src="${esc(p.thumb || p.url)}" alt="ფოტო ${i + 1}" />
              </div>`).join('')}
          </div>` : ''}

          <div class="wm-controls-grid">
            <label class="field">
              <span class="field-label">Watermark-ის ტექსტი</span>
              <input type="text" id="wm-input-text" class="input" value="${esc(wmText)}" placeholder="მაგ.: Apex Real Estate · 599 00 00 00" />
            </label>
            <label class="field">
              <span class="field-label">პოზიცია</span>
              <select id="wm-select-pos" class="input">
                <option value="br" selected>ქვედა მარჯვენა (კლასიკური ბეჯი)</option>
                <option value="bl">ქვედა მარცხენა</option>
                <option value="diag">ცენტრში დიაგონალურად (Anti-Theft დაცვა)</option>
                <option value="repeat">განმეორებადი ბადე (მაქსიმალური დაცვა)</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">გამჭვირვალობა: <strong id="wm-op-label">70%</strong></span>
              <input type="range" id="wm-range-op" min="20" max="100" value="70" class="input" />
            </label>
          </div>

          <div class="wm-actions-bar">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-wm-dl-current">
              ${icon('upload', 14)} ამ ფოტოს ჩამოტვირთვა
            </button>
            <button type="button" class="btn btn-primary" id="btn-wm-save-apt">
              ${icon('check', 14)} ყველა ფოტოს დაცვა & განახლება ბინაზე
            </button>
          </div>
        </div>`,
      submitLabel: 'დახურვა',
      onOpen: (dialogEl, dlg) => {
        const canvas = $('#wm-canvas', dialogEl);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const drawWatermark = (img, text, pos, opacity) => {
          canvas.width = img.naturalWidth || img.width || 800;
          canvas.height = img.naturalHeight || img.height || 500;
          const w = canvas.width;
          const h = canvas.height;

          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          if (!text) return;

          ctx.save();
          const baseFontSize = Math.max(16, Math.round(w / 30));
          ctx.font = `bold ${baseFontSize}px 'FiraGO', -apple-system, sans-serif`;

          if (pos === 'br' || pos === 'bl') {
            const metrics = ctx.measureText(text);
            const padX = baseFontSize * 0.8;
            const padY = baseFontSize * 0.5;
            const boxW = metrics.width + padX * 2;
            const boxH = baseFontSize * 1.7;
            const x = pos === 'br' ? w - boxW - (w * 0.03) : (w * 0.03);
            const y = h - boxH - (h * 0.03);

            ctx.fillStyle = `rgba(15, 23, 42, ${opacity * 0.85})`;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, boxW, boxH, 8);
            else ctx.rect(x, y, boxW, boxH);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + padX, y + boxH / 2);
          } else if (pos === 'diag') {
            ctx.translate(w / 2, h / 2);
            ctx.rotate(-28 * Math.PI / 180);
            const diagSize = Math.max(22, Math.round(w / 18));
            ctx.font = `800 ${diagSize}px 'FiraGO', -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.6})`;
            ctx.lineWidth = Math.max(2, Math.round(diagSize / 8));
            ctx.strokeText(text, 0, 0);

            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.9})`;
            ctx.fillText(text, 0, 0);
          } else if (pos === 'repeat') {
            ctx.rotate(-25 * Math.PI / 180);
            const repSize = Math.max(14, Math.round(w / 38));
            ctx.font = `700 ${repSize}px 'FiraGO', -apple-system, sans-serif`;
            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.45})`;
            ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.3})`;
            ctx.lineWidth = 1;
            const stepX = w * 0.35;
            const stepY = h * 0.25;
            for (let y = -h; y < h * 2; y += stepY) {
              for (let x = -w; x < w * 2; x += stepX) {
                ctx.strokeText(text, x, y);
                ctx.fillText(text, x, y);
              }
            }
          }
          ctx.restore();
        };

        const loadActiveImage = () => {
          const p = photos[currentIdx];
          if (!p) return;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            activeImageObj = img;
            drawWatermark(img, wmText, wmPos, wmOpacity);
          };
          img.src = p.url;
        };

        loadActiveImage();

        $('#wm-input-text', dialogEl)?.addEventListener('input', (e) => {
          wmText = e.target.value.trim();
          if (activeImageObj) drawWatermark(activeImageObj, wmText, wmPos, wmOpacity);
        });
        $('#wm-select-pos', dialogEl)?.addEventListener('change', (e) => {
          wmPos = e.target.value;
          if (activeImageObj) drawWatermark(activeImageObj, wmText, wmPos, wmOpacity);
        });
        $('#wm-range-op', dialogEl)?.addEventListener('input', (e) => {
          wmOpacity = Number(e.target.value) / 100;
          const lbl = $('#wm-op-label', dialogEl);
          if (lbl) lbl.textContent = `${e.target.value}%`;
          if (activeImageObj) drawWatermark(activeImageObj, wmText, wmPos, wmOpacity);
        });

        $('#wm-thumbs', dialogEl)?.addEventListener('click', (e) => {
          const thumb = e.target.closest('[data-wm-idx]');
          if (thumb) {
            $$('.wm-thumb', dialogEl).forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            currentIdx = Number(thumb.dataset.wmIdx);
            loadActiveImage();
          }
        });

        $('#btn-wm-dl-current', dialogEl)?.addEventListener('click', () => {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const u = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${slugify(a.name)}-watermarked-${currentIdx + 1}.jpg`;
            link.href = u;
            link.click();
            URL.revokeObjectURL(u);
            toast('ფოტო ჩამოიტვირთა', { type: 'success' });
          }, 'image/jpeg', 0.92);
        });

        $('#btn-wm-save-apt', dialogEl)?.addEventListener('click', (e) => {
          const btn = e.currentTarget || $('#btn-wm-save-apt', dialogEl);
          const label = btn ? btn.innerHTML : '';
          return run(btn, async () => {
            if (btn) btn.disabled = true;
            try {
              const newPhotos = [];
              let skipped = 0;
              for (let i = 0; i < photos.length; i++) {
                if (btn) btn.textContent = `მუშავდება ${i + 1}/${photos.length}…`;
                const p = photos[i];
                // Already watermarked photos are left alone so marks never stack. (The unmarked original is not
                // kept: the photo list is public, so storing it would hand out a clean copy.)
                if (p.wm) { skipped++; newPhotos.push({ ...p, order: i }); continue; }
                const source = p.url;
                const img = await new Promise((res) => {
                  const im = new Image();
                  im.crossOrigin = 'anonymous';
                  im.onload = () => res(im);
                  im.onerror = () => res(null);
                  im.src = source;
                });
                // Photos from other sites (link import) can't be redrawn; keep them as they are.
                if (!img) { skipped++; newPhotos.push({ ...p, order: i }); continue; }

                const off = document.createElement('canvas');
                off.width = img.naturalWidth || 1600;
                off.height = img.naturalHeight || 1000;
                const oCtx = off.getContext('2d');
                oCtx.drawImage(img, 0, 0, off.width, off.height);

                if (wmText) {
                  oCtx.save();
                  const baseFontSize = Math.max(16, Math.round(off.width / 30));
                  oCtx.font = `bold ${baseFontSize}px 'FiraGO', -apple-system, sans-serif`;

                  if (wmPos === 'br' || wmPos === 'bl') {
                    const metrics = oCtx.measureText(wmText);
                    const padX = baseFontSize * 0.8;
                    const boxW = metrics.width + padX * 2;
                    const boxH = baseFontSize * 1.7;
                    const x = wmPos === 'br' ? off.width - boxW - (off.width * 0.03) : (off.width * 0.03);
                    const y = off.height - boxH - (off.height * 0.03);
                    oCtx.fillStyle = `rgba(15, 23, 42, ${wmOpacity * 0.85})`;
                    oCtx.beginPath();
                    if (oCtx.roundRect) oCtx.roundRect(x, y, boxW, boxH, 8);
                    else oCtx.rect(x, y, boxW, boxH);
                    oCtx.fill();
                    oCtx.fillStyle = '#ffffff';
                    oCtx.textBaseline = 'middle';
                    oCtx.fillText(wmText, x + padX, y + boxH / 2);
                  } else if (wmPos === 'diag') {
                    oCtx.translate(off.width / 2, off.height / 2);
                    oCtx.rotate(-28 * Math.PI / 180);
                    const diagSize = Math.max(24, Math.round(off.width / 18));
                    oCtx.font = `800 ${diagSize}px 'FiraGO', -apple-system, sans-serif`;
                    oCtx.textAlign = 'center';
                    oCtx.textBaseline = 'middle';
                    oCtx.strokeStyle = `rgba(0, 0, 0, ${wmOpacity * 0.6})`;
                    oCtx.lineWidth = Math.max(2, Math.round(diagSize / 8));
                    oCtx.strokeText(wmText, 0, 0);
                    oCtx.fillStyle = `rgba(255, 255, 255, ${wmOpacity * 0.9})`;
                    oCtx.fillText(wmText, 0, 0);
                  } else if (wmPos === 'repeat') {
                    oCtx.rotate(-25 * Math.PI / 180);
                    const repSize = Math.max(14, Math.round(off.width / 38));
                    oCtx.font = `700 ${repSize}px 'FiraGO', -apple-system, sans-serif`;
                    oCtx.fillStyle = `rgba(255, 255, 255, ${wmOpacity * 0.45})`;
                    oCtx.strokeStyle = `rgba(0, 0, 0, ${wmOpacity * 0.3})`;
                    oCtx.lineWidth = 1;
                    const stepX = off.width * 0.35;
                    const stepY = off.height * 0.25;
                    for (let y = -off.height; y < off.height * 2; y += stepY) {
                      for (let x = -off.width; x < off.width * 2; x += stepX) {
                        oCtx.strokeText(wmText, x, y);
                        oCtx.fillText(wmText, x, y);
                      }
                    }
                  }
                  oCtx.restore();
                }

                const blob = await new Promise(r => off.toBlob(r, 'image/jpeg', 0.86));
                const file = new File([blob], `photo-${i + 1}.jpg`, { type: 'image/jpeg' });
                const uploaded = await uploadListingPhoto(a.id, file);
                newPhotos.push({ url: uploaded.url, thumb: uploaded.thumb, wm: true, order: i });
              }

              const row = await q(sb.from('apartments').update({ photos: newPhotos }).eq('id', a.id).select().single());
              App.upsertLocal('apartments', row);
              App.render();
              try { localStorage.setItem('rigzea_watermark_done', '1'); } catch { /* private mode */ }
              toast(skipped ? `Watermark დაემატა ${photos.length - skipped} ფოტოს. ${skipped} ფოტო უცვლელი დარჩა (უკვე აქვს watermark ან სხვა საიტიდანაა).` : 'ყველა ფოტო განახლდა Watermark-ით.', { type: 'success' });
              dlg?.close();
            } finally {
              if (btn) {
                btn.disabled = false;
                if (label) btn.innerHTML = label;
              }
            }
          });
        });
      }
    });
  }
  App.openWatermarkModal = openWatermarkDialog;

  // ===========================================================================
  // OWNER WEEKLY WHATSAPP REPORT (მესაკუთრის 1-კლიკიანი რეპორტი)
  // ===========================================================================
  const budgetText = (o) => `${o.budget_min ? o.budget_min + '–' : ''}${o.budget_max} ${o.budget_currency || 'USD'}`;

  async function openOwnerReportDialog(apt) {
    if (!apt) return;
    const owner = apt.owner_id ? H.owner(apt.owner_id) : null;
    const isSale = apt.transaction_type === 'sale';
    const priceStr = isSale
      ? (apt.sale_price ? money(apt.sale_price, apt.currency) : 'შეთანხმებით')
      : (apt.monthly_rent ? `${money(apt.monthly_rent, apt.currency)} / თვე` : 'შეთანხმებით');

    // Only real numbers go to the owner; anything we can't count shows as "—".
    await loadLinkStats(apt.id);
    const s = linkStats.get(apt.id)?.data;
    const weekAgo = Date.now() - 7 * 864e5;
    const inWeek = (v) => v && new Date(v).getTime() >= weekAgo;
    const views = s ? (s.views_7d ?? 0) : '–';
    const inquiries = (S.data.deals || []).filter(d => d.apartment_id === apt.id && inWeek(d.created_at)).length;
    const viewings = (S.data.tasks || []).filter(t => t.apartment_id === apt.id && t.type === 'viewing' && inWeek(t.due_date || t.created_at)).length;
    const publicUrl = listingUrl(apt);
    const agentName = S.member?.display_name || S.user?.user_metadata?.full_name || S.org?.name || 'თქვენი უძრავი ქონების აგენტი';
    const agentPhone = S.member?.phone || S.org?.contact_phone || '';

    const recOptions = [
      'აქტივობა მაღალია, ფასი შეესაბამება ბაზარს. ვაგრძელებთ აქტიურ მარკეტინგს.',
      'ინტერესი არის, თუმცა რამდენიმე კლიენტი ითხოვს მცირე დაკლებას (5-10%).',
      'სეზონური სტაბილური ინტერესია. ვამზადებთ კიდევ 2 პოტენციურ კლიენტს სანახავად.',
      'ფასის მცირედით კორექტირება ($50-$100-ით) მკვეთრად გაზრდის ზარებისა და შემოთავაზებების ნაკადს.',
    ];

    const generateText = (rec) => {
      const salutation = owner?.name ? `გამარჯობა, ${owner.name}! 🤝` : 'გამარჯობა! 🤝';
      return `${salutation}
ეს არის Rigzea-ს ყოველკვირეული რეპორტი თქვენს ბინაზე:
📍 ${apt.name || apt.address || 'ბინა'} (${priceStr})

📊 გასული 7 დღის აქტივობა:
• 👁️ ონლაინ ნახვები: ${views}
• 📞 ახალი მოთხოვნები: ${inquiries}
• 🔑 ბინის ჩვენებები: ${viewings}

💡 აგენტის რეკომენდაცია:
${rec || recOptions[0]}

🔗 განცხადების VIP ბმული:
${publicUrl}

პატივისცემით,
${agentName}${agentPhone ? ` (${agentPhone})` : ''}`;
    };

    const initialText = generateText(recOptions[0]);
    const phoneRaw = owner?.phone || '';
    const cleanPhone = phoneRaw.replace(/[^\d+]/g, '').replace(/^0/, '+995');

    return R.dialog({
      title: '📊 მესაკუთრის ყოველკვირეული რეპორტი',
      subtitle: 'მოამზადე და 1 კლიკით გაუგზავნე მესაკუთრეს WhatsApp-ში ბინის სტატუსი',
      wide: true,
      body: `
        <div class="owner-report-modal">
          ${!owner ? `<div class="notice notice-warn" style="margin-bottom:12px">
            <span>ამ ბინას მესაკუთრე ჯერ არ ჰყავს მითითებული. ტექსტი მაინც შეგიძლიათ დააკოპიროთ ან გაგზავნოთ ნებისმიერ ნომერზე.</span>
            <button type="button" class="btn btn-secondary btn-sm" id="or-set-owner">მესაკუთრის მიბმა</button>
          </div>` : ''}

          <div class="form-grid" style="margin-bottom:14px">
            <label class="field">
              <span class="field-label">მესაკუთრის სახელი და ტელეფონი</span>
              <input type="text" id="or-phone" class="input" value="${esc(phoneRaw ? `${owner?.name ? owner.name + ' · ' : ''}${phoneRaw}` : '')}" placeholder="+995 5XX XX XX XX" />
            </label>
            <label class="field">
              <span class="field-label">რეკომენდაციის შაბლონი</span>
              <select id="or-rec-select" class="input">
                ${recOptions.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}
              </select>
            </label>
          </div>

          <div class="stats" style="grid-template-columns:repeat(3, 1fr);margin-bottom:14px">
            <div class="stat"><span class="stat-label">ონლაინ ნახვები (7 დღე)</span><span class="stat-value">${views}</span></div>
            <div class="stat"><span class="stat-label">ახალი მოთხოვნები</span><span class="stat-value">${inquiries}</span></div>
            <div class="stat"><span class="stat-label">ჩვენებები (ვიზიტები)</span><span class="stat-value">${viewings}</span></div>
          </div>

          <label class="field" style="margin-bottom:14px">
            <span class="field-label">WhatsApp შეტყობინების ტექსტი (შეგიძლიათ ჩაასწოროთ)</span>
            <textarea id="or-text" class="input" rows="10" style="font-family:inherit;line-height:1.45">${esc(initialText)}</textarea>
          </label>

          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <a class="btn btn-wa" id="or-wa-btn" href="https://wa.me/${cleanPhone.replace('+', '')}?text=${encodeURIComponent(initialText)}" target="_blank" rel="noopener">
              ${icon('whatsapp', 16)} WhatsApp-ით გაგზავნა
            </a>
            <button type="button" class="btn btn-secondary" id="or-copy-btn">
              ${icon('copy', 16)} ტექსტის კოპირება
            </button>
          </div>
        </div>
      `,
      onOpen: (form) => {
        const textEl = $('#or-text', form);
        const recSel = $('#or-rec-select', form);
        const waBtn = $('#or-wa-btn', form);
        const phoneInput = $('#or-phone', form);
        const copyBtn = $('#or-copy-btn', form);

        const syncWa = () => {
          const p = (phoneInput.value.match(/(?:\+?995)?\s*5\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}|\b5\d{8}\b/) || [phoneInput.value])[0] || '';
          const clean = p.replace(/[^\d+]/g, '').replace(/^0/, '+995').replace('+', '');
          waBtn.href = clean ? `https://wa.me/${clean}?text=${encodeURIComponent(textEl.value)}` : R.whatsappUrl(textEl.value);
        };

        recSel.addEventListener('change', () => {
          textEl.value = generateText(recSel.value);
          syncWa();
        });

        textEl.addEventListener('input', syncWa);
        phoneInput.addEventListener('input', syncWa);

        copyBtn.addEventListener('click', () => {
          R.copyText(textEl.value, 'რეპორტი დაკოპირდა ბუფერში');
        });

        $('#or-set-owner', form)?.addEventListener('click', () => {
          openApartmentForm(apt);
        });
      }
    });
  }
  App.openOwnerReportModal = openOwnerReportDialog;

  // Link analytics (views / WhatsApp / calls), cached for a minute per apartment.
  const linkStats = new Map();
  function fillLinkStats(id) {
    const box = $('[data-link-stats]');
    if (!box || box.dataset.apt !== id) return;
    const s = linkStats.get(id)?.data;
    const scope = box.closest('section') || box;
    const set = (k, v) => { const el = $(`[data-ls="${k}"]`, scope); if (el) el.textContent = v; };
    if (!s) { ['views', 'whatsapp', 'calls'].forEach(k => set(k, '–')); set('note', 'სტატისტიკა ჯერ არ არის ხელმისაწვდომი.'); return; }
    set('views', s.views ?? 0); set('whatsapp', s.whatsapp ?? 0); set('calls', s.calls ?? 0);
    set('visitors', s.visitors ? `${s.visitors} უნიკალური ვიზიტორი` : '');
    set('note', s.last_view_at ? `ბოლო ნახვა: ${R.relative(s.last_view_at)} · ბოლო 7 დღეში ${s.views_7d ?? 0}` : 'ბმული ჯერ არავის გაუხსნია. გაუზიარე კლიენტს.');
  }
  async function loadLinkStats(id) {
    const c = linkStats.get(id);
    if (c && Date.now() - c.at < 60e3) return fillLinkStats(id);
    try {
      const { data, error } = await sb.rpc('get_link_stats', { p_apartment_id: id });
      linkStats.set(id, { at: Date.now(), data: error ? null : data });
    } catch { linkStats.set(id, { at: Date.now(), data: null }); }
    fillLinkStats(id);
  }

  // Public listing fields only: never door codes, wifi, notes, owner or tenant data.
  function portalPayload(a) {
    const isSale = a.transaction_type === 'sale';
    return {
      transaction_type: a.transaction_type || 'long_term',
      property_type: a.property_type || 'apartment',
      price: Number(isSale ? a.sale_price : a.monthly_rent) || null,
      currency: a.currency || 'USD',
      rooms: a.rooms ?? null, bedrooms: a.bedrooms ?? null, bathrooms: a.bathrooms ?? null,
      area_sqm: a.area_sqm ?? null, floor: a.floor ?? null, total_floors: a.total_floors ?? null,
      city: a.city || '', district: a.district || '', address: a.address || '',
      lat: a.lat ?? null, lng: a.lng ?? null, cadastral_code: a.cadastral_code || '',
      description: a.description || '',
      photos: listingPhotos(a).map(p => p.url),
    };
  }

  // Hands the listing to the Rigzea Chrome extension (content script on this page) via postMessage.
  function sendToPortals(a, targets) {
    return new Promise((resolve) => {
      const onMsg = (e) => {
        if (e.source !== window || e.data?.type !== 'rigzea:ack') return;
        clearTimeout(timer); window.removeEventListener('message', onMsg); resolve(true);
      };
      const timer = setTimeout(() => { window.removeEventListener('message', onMsg); resolve(false); }, 1200);
      window.addEventListener('message', onMsg);
      window.postMessage({ type: 'rigzea:post', targets, listing: portalPayload(a) }, window.location.origin);
    });
  }

  function openExtensionGuide() {
    return R.dialog({
      title: 'დააყენე Rigzea-ს გაფართოება',
      subtitle: 'ერთხელ დასაყენებელია, მხოლოდ კომპიუტერის Chrome-ში',
      body: `
        <ol class="ext-guide" style="margin:0;padding-left:20px;display:grid;gap:10px">
          <li><a class="btn btn-primary btn-sm" href="/downloads/rigzea-extension.zip" download>ჩამოტვირთე გაფართოება (ZIP)</a></li>
          <li>გახსენი ZIP ფაილი (მარჯვენა ღილაკი, „Extract All“) და დატოვე საქაღალდე ისეთ ადგილას, საიდანაც არ წაშლი.</li>
          <li>Chrome-ის მისამართის ველში ჩაწერე <code>chrome://extensions</code> და დააჭირე Enter.</li>
          <li>ზედა მარჯვნივ ჩართე „Developer mode“.</li>
          <li>დააჭირე „Load unpacked“ და აირჩიე გახსნილი საქაღალდე.</li>
          <li>შედი შენს ანგარიშზე SS.ge-ზე და MyHome.ge-ზე, დაბრუნდი აქ და სცადე თავიდან.</li>
        </ol>
        <p class="field-hint">გაფართოება ავსებს ფორმას. სტატუსს და მდგომარეობას შენ აირჩევ და გამოქვეყნებას თვითონ დააჭერ. თუ საიტი კაპჩას გკითხავს, ის შენ უნდა გაიარო.</p>`,
    });
  }

  function openPortalPostDialog(a) {
    return R.dialog({
      title: 'გამოქვეყნება SS.ge / MyHome.ge-ზე',
      subtitle: a.name,
      submitLabel: 'ფორმის შევსება',
      body: `
        <p class="dlg-text">Rigzea-ს Chrome-ის გაფართოება გახსნის საიტს, ავტომატურად შეავსებს განცხადებას ამ ობიექტის მონაცემებით. საიტზე წინასწარ უნდა იყო შესული. სტატუსს და მდგომარეობას შენ აირჩევ, შემდეგ დააჭირე გამოქვეყნებას.</p>
        <label class="field"><span class="field-label">სად გამოქვეყნდეს</span>
          <select name="target" class="input">
            <option value="both">SS.ge და MyHome.ge</option>
            <option value="ss">მხოლოდ SS.ge</option>
            <option value="myhome">მხოლოდ MyHome.ge</option>
          </select></label>`,
      onSubmit: async (_f, v) => {
        const targets = v.target === 'both' ? ['ss', 'myhome'] : [v.target];
        const ok = await sendToPortals(a, targets);
        if (!ok) { setTimeout(() => openExtensionGuide(), 0); return; }
        toast('გაფართოებას გადაეცა. ახალ ფანჯარაში იხილავ შევსებას.');
      },
    });
  }

  function listingCard(a) {
    const photos = listingPhotos(a);
    const isSale = a.transaction_type === 'sale';
    const missing = [!photos.length && 'ფოტოები', !(isSale ? Number(a.sale_price) : Number(a.monthly_rent)) && (isSale ? 'გასაყიდი ფასი' : 'ფასი'), !a.description && 'აღწერა', !(a.amenities || []).length && 'კეთილმოწყობა', !a.agent_phone && !S.org.contact_phone && 'საკონტაქტო ნომერი'].filter(Boolean);
    const url = listingUrl(a);
    const paused = App.pausedApartmentIds().has(a.id);
    return `<section class="card listing-card" style="margin-bottom:16px">
      <div class="card-head"><h2>${icon('link', 18)} განცხადების ბმული</h2>
        <a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 14)} გახსნა</a></div>
      <div class="card-body">
        ${paused ? `<div class="notice notice-warn" id="listing-paused" style="margin-bottom:12px"><span>ეს ბმული შეჩერებულია: „${esc(App.planState().plan.name)}“ პაკეტში ${App.planState().plan.apartments} აქტიური ობიექტია და ეს ობიექტი ლიმიტს აღემატება. ობიექტი და მისი მონაცემები ადგილზეა.</span> <button type="button" class="btn btn-secondary btn-sm" id="listing-paused-upgrade">პაკეტების ნახვა</button></div>` : ''}
        <div class="listing-url"><input class="input" readonly value="${esc(url)}" aria-label="განცხადების ბმული" id="listing-url" /></div>
        <div class="listing-actions">
          <button type="button" class="btn btn-primary btn-sm" id="btn-share-renter">${icon('copy', 14)} ბმულის კოპირება</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-share-wl" title="ბმული რიგზეას ლოგოს გარეშე: პარტნიორი აგენტებისთვის">${icon('copy', 14)} White-label ბმული</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-photos">${icon('camera', 14)} ფოტოები (${photos.length})</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-watermark" title="ფოტოებზე საავტორო Watermark-ის დატანა">${icon('shield', 14)} Watermark / დაცვა</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-owner-report" title="მესაკუთრის 1-კლიკიანი WhatsApp რეპორტი">${icon('whatsapp', 14)} მესაკუთრის რეპორტი</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-reverse-match" title="იპოვე კლიენტები, რომლებიც ამ ბინას ეძებენ">${icon('sparkle', 14)} შესაბამისი კლიენტები</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-open-post">${icon('whatsapp', 14)} პოსტი WhatsApp-ისა და Facebook-ისთვის</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-post-portals" title="Chrome-ის გაფართოება ავტომატურად შეავსებს განცხადებას">${icon('external', 14)} გამოქვეყნება SS.ge / MyHome.ge-ზე</button>
          ${isSale ? '' : `<button type="button" class="btn btn-secondary btn-sm" id="btn-open-lease">${icon('file', 14)} იჯარის ხელშეკრულება</button>`}
          <button type="button" class="btn btn-secondary btn-sm" id="btn-apt-viewing">${icon('clock', 14)} + დათვალიერება</button>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-apt-deal">+ გარიგება</button>
        </div>
        ${photos.length ? `<div class="listing-strip">${photos.slice(0, 6).map(p => `<img src="${esc(p.thumb || p.url)}" alt="" loading="lazy" />`).join('')}${photos.length > 6 ? `<span>+${photos.length - 6}</span>` : ''}</div>` : ''}
        ${missing.length ? `<p class="field-hint listing-missing">${icon('alert', 14)}<span>განცხადებას აკლია: ${esc(missing.join(', '))}. შეავსე „რედაქტირებიდან“. სრული განცხადება კლიენტს მეტ ინფორმაციას აძლევს.</span></p>` : ''}
      </div>
      <div class="stats" data-link-stats data-apt="${esc(a.id)}">
        <div class="stat"><span class="stat-label">ნახვები</span><span class="stat-value" data-ls="views">…</span><span class="stat-note" data-ls="visitors"></span></div>
        <div class="stat"><span class="stat-label">WhatsApp-ზე დაწკაპუნება</span><span class="stat-value" data-ls="whatsapp">…</span></div>
        <div class="stat"><span class="stat-label">ზარები</span><span class="stat-value" data-ls="calls">…</span></div>
      </div>
      <p class="muted small listing-note" data-link-stats-note><span data-ls="note"></span></p>
    </section>`;
  }

  // ===========================================================================
  // MULTI-LISTING COLLECTION CREATOR (Client Showcase Links)
  // ===========================================================================
  let colMode = false;
  const colPicked = new Set();

  function openCollectionModal({ apartmentIds = [], clientName = '', dealId = null } = {}) {
    if (!App.guardFeature('selections')) return;
    let pickedIds = apartmentIds.slice();
    let colRowId = null;
    if (!pickedIds.length) {
      toast('მონიშნე მინიმუმ 1 ბინა კოლექციისთვის', { type: 'error' });
      return;
    }
    return R.dialog({
      title: '✨ მრავალბინიანი კოლექციის შექმნა',
      subtitle: 'კლიენტისთვის გაგზავნილი პირადი პრემიუმ კატალოგი',
      wide: true,
      body: `
        <div class="col-modal-form">
          <div class="form-grid" style="margin-bottom:14px">
            <label class="field"><span class="field-label">კლიენტის სახელი (გამოჩნდება სათაურში)</span>
              <input type="text" id="col-client-name" class="input" placeholder="მაგ.: მარიამი ან გიორგი" value="${esc(clientName || '')}" maxlength="60" />
            </label>
            <label class="field"><span class="field-label">კოლექციის სათაური</span>
              <input type="text" id="col-title" class="input" placeholder="მაგ.: შერჩეული ბინები ვაკეში" value="თქვენთვის შერჩეული ბინები" maxlength="80" />
            </label>
          </div>
          <div class="col-modal-apts">
            <div class="field-label" style="margin-bottom:8px">შერჩეული ბინები (<span id="col-apts-count">${pickedIds.length}</span>):</div>
            <div class="rows" id="col-apts-list" style="--cols:minmax(0,2fr) 120px 80px">
              ${pickedIds.map(id => {
                const a = H.apt(id);
                if (!a) return '';
                const isSale = a.transaction_type === 'sale';
                const p = isSale ? a.sale_price : a.monthly_rent;
                return `<div class="row" data-col-item="${a.id}">
                  <span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc([a.address, a.city].filter(Boolean).join(', '))}</span></span>
                  <span class="cell-meta">${p ? money(p, a.currency || 'USD') : '–'}</span>
                  <span class="cell-actions"><button type="button" class="btn btn-ghost btn-sm t-danger" data-col-rm="${a.id}" title="ამოშლა">×</button></span>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="notice notice-ok" style="margin-top:14px">
            ${icon('check', 16)} <span>კოლექციის ბმულზე განთავსებულია შენი საკონტაქტო მონაცემები, ბრენდინგი და WhatsApp-ის ღილაკი.</span>
          </div>
        </div>`,
      submitLabel: '⚡ კოლექციის ბმულის შექმნა',
      onOpen: (dialogEl) => {
        const updateRows = () => {
          const list = $('#col-apts-list', dialogEl);
          const count = $('#col-apts-count', dialogEl);
          if (count) count.textContent = pickedIds.length;
          if (list) {
            list.innerHTML = pickedIds.map(id => {
              const a = H.apt(id);
              if (!a) return '';
              const isSale = a.transaction_type === 'sale';
              const p = isSale ? a.sale_price : a.monthly_rent;
              return `<div class="row" data-col-item="${a.id}">
                <span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc([a.address, a.city].filter(Boolean).join(', '))}</span></span>
                <span class="cell-meta">${p ? money(p, a.currency || 'USD') : '–'}</span>
                <span class="cell-actions"><button type="button" class="btn btn-ghost btn-sm t-danger" data-col-rm="${a.id}" title="ამოშლა">×</button></span>
              </div>`;
            }).join('');
          }
        };
        dialogEl.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-col-rm]');
          if (rm) {
            pickedIds = pickedIds.filter(x => x !== rm.dataset.colRm);
            if (pickedIds.length === 0) {
              toast('კოლექციაში მინიმუმ 1 ბინა უნდა დარჩეს', { type: 'error' });
            }
            updateRows();
          }
        });
      },
      onSubmit: async (dialogEl) => {
        if (!pickedIds.length) throw new Error('კოლექციაში მინიმუმ 1 ბინა უნდა იყოს.');
        if (pickedIds.length > 20) throw new Error('ერთ ბმულში მაქსიმუმ 20 ბინის დამატებაა შესაძლებელი.');
        const client = ($('#col-client-name', dialogEl)?.value || '').trim();
        const a = 'abcdefghijkmnpqrstuvwxyz23456789';
        const b = crypto.getRandomValues(new Uint8Array(12));
        const slug = Array.from(b, x => a[x % a.length]).join('');
        // One id per dialog, so a retried submit can't create a second collection.
        colRowId = colRowId || R.uuid();
        const row = {
          id: colRowId,
          slug,
          organization_id: S.org.id,
          client_name: client || null,
          apartment_ids: pickedIds,
          criteria: {},
          deal_id: dealId || null,
          created_by: S.user.id
        };
        const sel = await App.insertOnce('selections', row);
        App.addSelection?.(sel);
        colMode = false;
        colPicked.clear();
        App.render();

        const url = `${location.origin}/p/s/?id=${encodeURIComponent(sel.slug)}`;
        const waText = `გამარჯობა! თქვენთვის შევარჩიე ${sel.apartment_ids.length} ბინა. ფოტოები, ფასები და შედარების ცხრილი ერთ გვერდზეა:\n${url}`;

        // Close this form first, then show the link.
        setTimeout(() => R.dialog({
          title: '🎉 კოლექციის ბმული მზადაა!',
          subtitle: `${sel.apartment_ids.length} ბინა მზადაა კლიენტთან გასაგზავნად`,
          body: `
            <div class="share-dialog-content">
              <div class="listing-url"><input class="input" readonly value="${esc(url)}" id="col-done-url" /></div>
              <div class="share-preview-box"><strong>გასაგზავნი ტექსტი:</strong>\n${esc(waText)}</div>
              <div class="share-actions-grid">
                <a class="btn btn-wa" href="${R.whatsappUrl(waText)}" target="_blank" rel="noopener">${icon('whatsapp', 16)} WhatsApp-ით გაგზავნა</a>
                <button type="button" class="btn btn-secondary" id="btn-col-copy-url">${icon('copy', 16)} ბმულის კოპირება</button>
              </div>
              <a class="btn btn-ghost btn-block" href="${esc(url)}" target="_blank" rel="noopener">${icon('external', 16)} გვერდის გახსნა და შემოწმება</a>
            </div>`,
          submitLabel: 'დახურვა',
          onOpen: (d) => {
            $('#btn-col-copy-url', d)?.addEventListener('click', () => R.copyText(url, 'კოლექციის ბმული დაკოპირდა'));
            $('#col-done-url', d)?.addEventListener('focus', e => e.target.select());
          }
        }), 0);
        return true;
      }
    });
  }
  App.openCollectionModal = openCollectionModal;

  // ===========================================================================
  // APARTMENTS LIST
  // ===========================================================================
  const af = { q: '', type: 'all', status: 'current', city: '' };

  function nextReservation(aptId) {
    const today = R.isoDate();
    return S.data.reservations.filter(r => r.status !== 'cancelled' && r.apartment_id === aptId && r.check_out >= today).sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
  }

  App.views.apartments = (r) => {
    if (r.id) return renderApartment(r.id);
    const apts = S.data.apartments;
    const cities = [...new Set(apts.map(a => a.city).filter(Boolean))];
    const s = af.q.trim().toLowerCase();
    // Section pages (#/apartments?type=rent|sale) are scoped to one side of the business.
    const sec = ['rent', 'sale'].includes(r.params.get('type')) ? r.params.get('type') : null;
    const txOf = (a) => a.transaction_type || (a.rental_type === 'long_term' ? 'long_term' : 'daily');
    const inSec = (a) => !sec || (sec === 'sale') === (txOf(a) === 'sale');
    const inType = (a, tp) => inSec(a) && (tp === 'all' || txOf(a) === tp);
    const TYPES = sec === 'sale' ? [] : sec === 'rent'
      ? [['all', 'ყველა'], ['long_term', 'გრძელვადიანი'], ['daily', 'დღიურად']]
      : [['all', 'ყველა ტიპი'], ['sale', 'იყიდება'], ['long_term', 'ქირავდება'], ['daily', 'დღიურად']];
    if (!TYPES.some(([id]) => id === af.type)) af.type = 'all';
    const title = sec === 'sale' ? 'გასაყიდი ბინები' : sec === 'rent' ? 'გასაქირავებელი ბინები' : 'უძრავი ქონება';
    const inScope = apts.filter(a => inSec(a) && a.status !== 'archived').length;
    const inStatus = (a, st) => st === 'current' ? !['archived', 'sold'].includes(a.status) : a.status === st;
    const base = apts.filter(a => (!af.city || a.city === af.city) && inType(a, af.type) && (!s || [a.name, a.unit_number, a.address, a.city, H.owner(a.owner_id)?.name].some(v => String(v || '').toLowerCase().includes(s))));
    const list = base.filter(a => inStatus(a, af.status));
    const STATUS = [['current', 'ყველა მიმდინარე'], ['active', 'აქტიური'], ['reserved', 'დაჯავშნილი'], ['rented', 'გაქირავებული'], ['sold', 'გაყიდული'], ['maintenance', 'რემონტზე'], ['vacant', 'არააქტიური'], ['archived', 'დაარქივებული']]
      .filter(([id]) => !(sec === 'sale' && id === 'rented') && !(sec === 'rent' && id === 'sold'));
    if (!STATUS.some(([id]) => id === af.status)) af.status = 'current';
    const cols = colMode
      ? '36px minmax(0,2fr) minmax(0,1.2fr) 120px 110px 140px 120px 190px'
      : 'minmax(0,2fr) minmax(0,1.2fr) 120px 110px 140px 120px 190px';

    $('#view').innerHTML = `
      <div class="page-head"><div><h1>${title}</h1><p class="page-sub">${inScope} ობიექტი ${sec ? 'ამ სექციაში' : 'პორტფოლიოში'}</p></div>
        <div class="page-actions">
          <button type="button" class="btn ${colMode ? 'btn-primary' : 'btn-secondary'}" id="btn-col-toggle">${icon('link', 16)} ${colMode ? '✓ მონიშვნა' : 'კოლექციის შექმნა'}</button>
          <button type="button" class="btn btn-secondary" id="btn-quick-import">${icon('sparkle', 16)} ⚡ ლინკით შემოტანა</button>
          <a class="btn btn-secondary" href="#/settings/import">${icon('upload', 16)} იმპორტი</a>
          <button type="button" class="btn btn-primary" id="btn-apt-new">${icon('plus', 16)} ობიექტის დამატება</button>
        </div></div>
      ${TYPES.length ? `<div class="chips" role="group" aria-label="ტრანზაქციის ტიპი" style="margin-bottom:8px">${TYPES.map(([id, label]) => `<button type="button" class="chip" data-tp="${id}" aria-pressed="${af.type === id}">${label} <span class="count">${apts.filter(a => inType(a, id) && a.status !== 'archived').length}</span></button>`).join('')}</div>` : ''}
      <div class="chips" role="group" aria-label="სტატუსი">${STATUS.map(([id, label]) => `<button type="button" class="chip" data-st="${id}" aria-pressed="${af.status === id}">${label} <span class="count">${base.filter(a => inStatus(a, id)).length}</span></button>`).join('')}</div>
      <div class="toolbar">
        <div class="search-input grow">${icon('search', 16)}<input class="input" type="search" id="af-q" value="${esc(af.q)}" placeholder="სახელი, ნომერი, მისამართი, მფლობელი, ქალაქი" aria-label="ბინის ძებნა" /></div>
        ${cities.length > 1 ? `<select class="input" id="af-city" aria-label="ქალაქი"><option value="">ყველა ქალაქი</option>${cities.map(c => `<option ${af.city === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      </div>
      <section class="card">${list.length ? `<div class="rows">
        <div class="rows-head" style="--cols:${cols}">
          ${colMode ? `<span class="apt-select-cell"><input type="checkbox" id="col-cb-all" title="ყველას მონიშვნა" ${list.length && list.every(a => colPicked.has(a.id)) ? 'checked' : ''} /></span>` : ''}
          <span>ობიექტი</span><span>მფლობელი</span><span>ფასი</span><span>აქტიური საქმე</span><span>შემდეგი ჯავშანი / ნახვა</span><span>სტატუსი</span><span></span>
        </div>
        ${list.map(a => {
          const open = S.data.tasks.filter(t => t.apartment_id === a.id && H.isOpen(t));
          const overdue = open.filter(H.isOverdue).length;
          const pend = S.data.approvals.filter(x => x.apartment_id === a.id && R.approvalStatus(x) === 'pending').length;
          const next = nextReservation(a.id);
          const viewings = open.filter(t => t.type === 'viewing').length;
          const flags = [overdue && `<span class="t-danger">${overdue} ვადაგადაც.</span>`, pend && `<span class="t-warn">${pend} თანხმობა</span>`, viewings && `<span class="t-ok">${viewings} ნახვა</span>`].filter(Boolean).join(' · ');
          const isSale = a.transaction_type === 'sale';
          const priceHtml = isSale
            ? (a.sale_price ? `<strong>${money(a.sale_price, a.currency || 'USD')}</strong>${a.price_sqm ? `<div class="small muted">${money(a.price_sqm, a.currency || 'USD')}/მ²</div>` : ''}` : '–')
            : (a.monthly_rent ? `<strong>${money(a.monthly_rent, a.currency || 'USD')}</strong><div class="small muted">${R.isDaily(a) ? '/ დღე' : '/ თვე'}</div>` : '–');
          const tt = a.transaction_type || (a.rental_type === 'long_term' ? 'long_term' : 'daily');
          return `<a class="row ${colPicked.has(a.id) ? 'is-col-picked' : ''}" href="#/apartments/${a.id}" data-apt-row="${a.id}" style="--cols:${cols}">
            ${colMode ? `<span class="apt-select-cell"><input type="checkbox" class="apt-col-cb" data-col-id="${a.id}" ${colPicked.has(a.id) ? 'checked' : ''} aria-label="მონიშვნა: ${esc(a.name)}" /></span>` : ''}
            <span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc([a.address, a.city].filter(Boolean).join(', '))} · ${R.transactionBadge(tt)}${App.pausedApartmentIds().has(a.id) ? ' · <span class="t-warn">ბმული შეჩერებულია</span>' : ''}</span></span>
            <span class="cell-meta" data-label="მფლობელი">${esc(H.owner(a.owner_id)?.name || '–')}</span>
            <span class="cell-meta" data-label="ფასი">${priceHtml}</span>
            <span class="cell-meta" data-label="საქმე">${open.length}</span>
            <span class="cell-meta" data-label="ჯავშანი">${next ? (next.check_in <= R.isoDate() ? `გასვლა ${esc(R.dayLabel(next.check_out))}` : `შესვლა ${esc(R.dayLabel(next.check_in))}`) : (isSale ? (viewings ? `${viewings} ნახვა` : '–') : '–')}</span>
            <span class="cell-status">${R.badge(L.aptStatus[a.status] || a.status, L.aptStatusTone[a.status])}</span>
            <span class="cell-actions"><button type="button" class="btn btn-ghost btn-sm" data-new-task="${a.id}">+ საქმე</button><button type="button" class="btn btn-ghost btn-sm" data-new-exp="${a.id}">+ ხარჯი</button><button type="button" class="btn btn-ghost btn-sm" data-share-apt="${a.id}" title="კოლეგასთან გაზიარება" aria-label="კოლეგასთან გაზიარება: ${esc(a.name)}">${icon('whatsapp', 14)}</button></span>
          </a>`;
        }).join('')}</div>` : `<div class="empty">${icon('building', 28)}<h3>${apts.length ? (inScope ? 'ობიექტი ვერ მოიძებნა' : (sec === 'sale' ? 'გასაყიდი ბინა ჯერ არ არის' : 'გასაქირავებელი ბინა ჯერ არ არის')) : 'ობიექტი ჯერ არ არის დამატებული'}</h3>
          <p>${apts.length ? (inScope ? 'შეცვალე ძებნა ან ფილტრი.' : 'დაამატე ობიექტი ზედა ღილაკით.') : 'დაამატე ბინა ან კომერციული ფართი სახელით და მისამართით, მაგ.: „Orbi City · 1204“. ბევრი ობიექტი გაქვს? გამოიყენე Excel/CSV იმპორტი.'}</p>
          ${apts.length ? '' : '<button class="btn btn-primary" type="button" id="btn-apt-empty">ობიექტის დამატება</button>'}</div>`}
      </section>
      ${colMode ? `
        <div class="col-floating-bar" id="col-floating-bar">
          <span class="col-bar-count">${icon('link', 16)} მონიშნულია <strong>${colPicked.size}</strong> ბინა</span>
          <button type="button" class="btn btn-primary btn-sm" id="btn-col-build" ${colPicked.size ? '' : 'disabled'}>⚡ კოლექციის ბმული</button>
          ${colPicked.size ? '<button type="button" class="btn btn-ghost btn-sm" id="btn-col-clear" style="color:#cbd5e1">გასუფთავება</button>' : ''}
          <button type="button" class="btn btn-ghost btn-sm" id="btn-col-cancel" style="color:#cbd5e1">დახურვა</button>
        </div>` : ''}`;

    let timer;
    $('#af-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { af.q = e.target.value; App.render(); const i = $('#af-q'); i.focus(); i.setSelectionRange(af.q.length, af.q.length); }, 200); });
    $('#af-city')?.addEventListener('change', (e) => { af.city = e.target.value; App.render(); });
    $$('[data-tp]').forEach(b => b.addEventListener('click', () => { af.type = b.dataset.tp; App.render(); }));
    $$('[data-st]').forEach(b => b.addEventListener('click', () => { af.status = b.dataset.st; App.render(); }));
    const formDefaults = sec ? { transaction_type: sec === 'sale' ? 'sale' : 'long_term' } : {};
    $('#btn-apt-new').onclick = () => openApartmentForm(null, formDefaults);
    $('#btn-quick-import')?.addEventListener('click', () => openApartmentForm(null, { ...formDefaults, autoFocusImport: true }));
    $('#btn-apt-empty')?.addEventListener('click', () => openApartmentForm(null, formDefaults));
    $$('[data-new-task]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); App.openTaskForm({ apartmentId: b.dataset.newTask }); }));
    $$('[data-new-exp]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); App.openExpenseForm({ apartmentId: b.dataset.newExp }); }));
    $$('[data-share-apt]').forEach(b => b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); App.openCoBrokerShare(H.apt(b.dataset.shareApt)); }));

    // Collection mode bindings
    $('#btn-col-toggle')?.addEventListener('click', () => {
      colMode = !colMode;
      if (!colMode) colPicked.clear();
      App.render();
    });
    $('#btn-col-cancel')?.addEventListener('click', () => {
      colMode = false;
      colPicked.clear();
      App.render();
    });
    $('#btn-col-clear')?.addEventListener('click', () => {
      colPicked.clear();
      App.render();
    });
    $('#btn-col-build')?.addEventListener('click', () => {
      if (!colPicked.size) return;
      openCollectionModal({ apartmentIds: Array.from(colPicked) });
    });
    $('#col-cb-all')?.addEventListener('change', (e) => {
      if (e.target.checked) list.forEach(a => colPicked.add(a.id));
      else list.forEach(a => colPicked.delete(a.id));
      App.render();
    });
    if (colMode) {
      $$('[data-apt-row]').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.cell-actions') || e.target.closest('button')) return;
          e.preventDefault();
          const id = row.dataset.aptRow;
          if (colPicked.has(id)) colPicked.delete(id);
          else colPicked.add(id);
          App.render();
        });
      });
    }
  };

  // ===========================================================================
  // APARTMENT DETAIL
  // ===========================================================================
  const aptPeriod = {};
  const PERIODS = [['month', 'მიმდინარე თვე'], ['last', 'წინა თვე'], ['3m', 'ბოლო 3 თვე'], ['year', 'მიმდინარე წელი']];
  function periodRange(p) {
    const n = new Date();
    if (p === 'last') return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)];
    if (p === '3m') return [new Date(n.getFullYear(), n.getMonth() - 2, 1), n];
    if (p === 'year') return [new Date(n.getFullYear(), 0, 1), n];
    return [new Date(n.getFullYear(), n.getMonth(), 1), n];
  }

  function renderApartment(id) {
    const a = H.apt(id);
    if (!a) {
      $('#view').innerHTML = `<div class="card"><div class="empty">${icon('building', 28)}<h3>ბინა ვერ მოიძებნა</h3><p>შესაძლოა წაშლილია ან სხვა სამუშაო სივრცეს ეკუთვნის.</p><a class="btn btn-secondary" href="#/apartments">ბინების სია</a></div></div>`;
      return;
    }
    const owner = H.owner(a.owner_id);
    const tasks = S.data.tasks.filter(t => t.apartment_id === id);
    const open = tasks.filter(H.isOpen);
    const approvals = S.data.approvals.filter(x => x.apartment_id === id);
    const today = R.isoDate();
    const res = S.data.reservations.filter(r => r.apartment_id === id && r.status !== 'cancelled');
    const upcoming = res.filter(r => r.check_out >= today).sort((x, y) => x.check_in.localeCompare(y.check_in));
    const current = upcoming.find(r => r.check_in <= today);
    const nextIn = upcoming.find(r => r.check_in >= today && r !== current);
    const nextTask = open.filter(t => H.taskTime(t)).sort((x, y) => String(H.taskTime(x)).localeCompare(String(H.taskTime(y))))[0];
    const period = aptPeriod[id] || 'month';
    const [from, to] = periodRange(period);
    const fromIso = R.isoDate(from), toIso = R.isoDate(to);
    const inP = (d) => d && d >= fromIso && d <= toIso;
    const inc = S.data.income.filter(i => i.apartment_id === id && inP(i.income_date));
    const exp = S.data.expenses.filter(e => e.apartment_id === id && inP(e.expense_date));
    const aptDeals = (S.data.deals || []).filter(d => d.apartment_id === id);
    const sum = (l) => l.reduce((s, x) => s + Number(x.amount), 0);
    const counted = exp.filter(e => ['incurred', 'paid'].includes(e.status));
    const pendingExp = exp.filter(e => ['proposed', 'approved'].includes(e.status));
    const events = S.data.events.filter(e => e.apartment_id === id);
    const photos = tasks.flatMap(t => (t.photos || []).map(p => ({ ...p, task: t })));
    const archived = a.status === 'archived';

    const isSale = a.transaction_type === 'sale';
    const isLongTerm = a.transaction_type === 'long_term' || (!a.transaction_type && a.rental_type === 'long_term');
    const viewings = tasks.filter(t => t.type === 'viewing');

    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="crumbs"><a href="#/apartments?type=${App.aptSection(a)}">${isSale ? 'გასაყიდი ბინები' : 'გასაქირავებელი ბინები'}</a> ›</div>
          <h1>${esc(a.name)}</h1><p class="page-sub">${esc([a.address, a.unit_number && 'ბინა ' + a.unit_number, a.city].filter(Boolean).join(', '))}${a.cadastral_code ? ` · საკადასტრო ${esc(a.cadastral_code)} <button type="button" class="link-btn small" data-napr="${esc(a.cadastral_code)}">NAPR რეესტრში გადამოწმება</button>` : ''} · ${R.transactionBadge(a.transaction_type || (a.rental_type === 'long_term' ? 'long_term' : 'daily'))} ${R.badge(L.aptStatus[a.status] || a.status, L.aptStatusTone[a.status])}</p></div>
        <div class="page-actions">
          <a class="btn btn-secondary" href="/guide/?${a.guide_token ? 't=' + encodeURIComponent(a.guide_token) : 'apt=' + encodeURIComponent(a.id)}" target="_blank" title="სტუმრის ციფრული გზამკვლევი და A5 ბარათი">${icon('sparkle', 16)} სტუმრის QR</a>
          <button type="button" class="btn btn-secondary" id="a-pdf">${icon('file', 16)} PDF პრეზენტაცია</button>
          <button type="button" class="btn btn-secondary" id="a-share">${icon('whatsapp', 16)} კოლეგასთან გაზიარება</button>
          <button type="button" class="btn btn-secondary" id="a-docs">${icon('file', 16)} ხელშეკრულებები</button>
          <button type="button" class="btn btn-secondary" id="a-viewing">${icon('clock', 16)} დათვალიერება</button>
          <button type="button" class="btn btn-primary" id="a-task">${icon('plus', 16)} საქმე</button>
          <button type="button" class="btn btn-secondary" id="a-exp">+ ხარჯი</button>
          ${isSale || isLongTerm ? '' : '<button type="button" class="btn btn-secondary" id="a-res">+ ჯავშანი</button>'}
          <button type="button" class="btn btn-ghost" id="a-edit">რედაქტირება</button>
        </div>
      </div>

      ${listingCard(a)}

      ${isSale ? `
      <!-- Property Sales Hero Section -->
      <section class="card sales-hero" style="margin-bottom:16px;border-left:4px solid var(--brand)">
        <div class="card-head">
          <h2>${icon('building', 18)} გასაყიდი უძრავი ქონება</h2>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-hero-viewing">+ დათვალიერება</button>
            ${R.badge(L.propertyType[a.property_type] || 'ბინა', 'info')}
          </div>
        </div>
        <div class="stats">
          <div class="stat"><span class="stat-label">გასაყიდი ფასი</span><span class="stat-value" style="font-size:22px;color:var(--brand)">${money(a.sale_price || a.monthly_rent || 0, a.currency || 'USD')}</span></div>
          <div class="stat"><span class="stat-label">ფასი მ²-ზე</span><span class="stat-value">${a.price_sqm ? money(a.price_sqm, a.currency || 'USD') + ' / მ²' : (a.sale_price && a.area_sqm ? Math.round(Number(a.sale_price) / Number(a.area_sqm)) + ' / მ²' : '–')}</span></div>
          <div class="stat"><span class="stat-label">ფართობი</span><span class="stat-value">${a.area_sqm ? `${a.area_sqm} მ²` : '–'}</span><span class="stat-note">${a.rooms ? `${a.rooms} ოთახი` : ''}${a.bedrooms ? ` · ${a.bedrooms} საძინებელი` : ''}</span></div>
          <div class="stat"><span class="stat-label">სართული</span><span class="stat-value">${a.floor ? `${a.floor}${a.total_floors ? `/${a.total_floors}` : ''}` : '–'}</span><span class="stat-note">${a.bathrooms ? `${a.bathrooms} სველი წერტილი` : ''}</span></div>
          <div class="stat"><span class="stat-label">სტატუსი</span><span class="stat-value" style="font-size:16px">${L.aptStatus[a.status] || a.status}</span><span class="stat-note">${a.is_archived ? 'დაარქივებული' : 'აქტიური შეთავაზება'}</span></div>
        </div>
      </section>` : ''}

      <!-- Deals & Commission Tracker Section -->
      <section class="card" style="margin-bottom:16px">
        <div class="card-head">
          <h2>${icon('wallet', 18)} გარიგებები და საკომისიო <span class="count">${aptDeals.length}</span></h2>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-apt-deal-2">+ ახალი გარიგება</button>
        </div>
        ${aptDeals.length ? `
          <div class="rows">
            ${aptDeals.map(d => {
              const isDealSale = d.deal_type === 'sale' || (!d.deal_type && isSale);
              const commPct = Number(d.commission_percent ?? (isDealSale ? 3 : 50));
              const dealAmount = Number(d.deal_amount || (isDealSale ? a.sale_price : a.monthly_rent) || 0);
              const comm = d.commission_type === 'fixed' ? Number(d.commission_amount || 0) : ((dealAmount * commPct) / 100);
              const cur = d.currency || a.currency || 'USD';
              return `
                <div class="row" style="--cols:minmax(0,1.5fr) 130px 140px 150px auto">
                  <span class="cell-main">
                    <strong>${esc(d.client_name)}</strong>
                    <span>${d.client_phone ? `<a href="tel:${esc(d.client_phone)}">${esc(d.client_phone)}</a>` : 'ტელეფონი არაა'} · ${d.target_move_in ? 'თარიღი: ' + esc(R.date(d.target_move_in)) : (isDealSale ? 'გაყიდვა' : 'ქირა')}</span>
                  </span>
                  <span class="cell-meta"><strong>${money(dealAmount, cur)}</strong> ${isDealSale ? '<span class="small muted">(გაყიდვა)</span>' : '<span class="small muted">/ თვე</span>'}</span>
                  <span class="cell-meta" style="color:#047857">საკომისიო: <strong>${money(Math.round(comm), cur)}</strong></span>
                  <span class="cell-status">${R.dealBadge(d.stage)}</span>
                  <span class="cell-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-deal-edit="${d.id}">რედაქტირება</button>
                  </span>
                </div>
              `;
            }).join('')}
          </div>
        ` : App.emptyInline('ამ ობიექტზე აქტიური გარიგება ჯერ არ არის. დაამატე გარიგება კლიენტის დასაკავშირებლად.')}
      </section>
      ${isLongTerm ? `
      <section class="card" style="margin-bottom:16px;border-left:4px solid var(--brand)">
        <div class="card-head">
          <h2>${icon('building', 18)} გრძელვადიანი გაქირავება</h2>
          <span class="badge badge-ok">აქტიური ხელშეკრულება</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="stat-label">მდგმური</span><span class="stat-value" style="font-size:16px">${esc(a.tenant_name || 'არ არის მითითებული')}</span><span class="stat-note">${a.tenant_phone ? `<a href="tel:${esc(a.tenant_phone)}">${esc(a.tenant_phone)}</a>` : ''}</span></div>
          <div class="stat"><span class="stat-label">თვიური ქირა</span><span class="stat-value">${money(a.monthly_rent || 0, a.currency || 'USD')}</span><span class="stat-note">გადახდა: ყოველ ${a.rent_due_day || 1} რიცხვში</span></div>
          <div class="stat"><span class="stat-label">დეპოზიტი</span><span class="stat-value">${money(a.deposit_amount || 0, a.currency || 'USD')}</span><span class="stat-note">${a.lease_end ? 'ვადა: ' + esc(R.date(a.lease_end)) : 'უვადო'}</span></div>
        </div>
      </section>` : ''}
      ${archived ? `<div class="notice notice-warn" style="margin-bottom:16px">${icon('alert', 16)}<div>ობიექტი დაარქივებულია და აქტიურ სიებში არ ჩანს. <button class="link-btn" id="a-restore">აღდგენა</button></div></div>` : ''}
      <div class="cols">
        <div class="stack">
          ${isSale ? `
          <section class="card">
            <div class="card-head"><h2>დათვალიერებები და ვიზიტები <span class="count">${viewings.length}</span></h2><button type="button" class="btn btn-ghost btn-sm" id="btn-add-viewing">+ დათვალიერება</button></div>
            ${viewings.length ? App.taskRows(viewings, false) : App.emptyInline('დათვალიერება ჯერ არ არის დანიშნული. დანიშნე ნახვა კლიენტთან ერთად.')}
          </section>` : `
          <section class="card"><div class="stats">
            <div class="stat"><span class="stat-label">ახლა</span><span class="stat-value" style="font-size:15px">${current ? esc(current.guest_name) : 'თავისუფალია'}</span><span class="stat-note">${current ? `გასვლა ${esc(R.dayLabel(current.check_out))}, ${esc(String(current.check_out_time || '').slice(0, 5))}` : ''}</span></div>
            <div class="stat"><span class="stat-label">შემდეგი შესვლა</span><span class="stat-value" style="font-size:15px">${nextIn ? esc(R.dayLabel(nextIn.check_in)) + ', ' + esc(String(nextIn.check_in_time || '').slice(0, 5)) : '–'}</span><span class="stat-note">${nextIn ? esc(nextIn.guest_name) : ''}</span></div>
            <div class="stat"><span class="stat-label">შემდეგი საქმე</span><span class="stat-value" style="font-size:15px">${nextTask ? esc(R.dateTime(H.taskTime(nextTask))) : '–'}</span><span class="stat-note">${nextTask ? esc(nextTask.title) : ''}</span></div>
          </div></section>`}

          <section class="card"><div class="card-head"><h2>აქტიური საქმეები <span class="count">${open.length}</span></h2><a class="link-btn small" href="#/tasks" id="a-all-tasks">ყველა საქმე (${tasks.length})</a></div>
            ${open.length ? App.taskRows(open, false) : App.emptyInline('აქტიური საქმე არ არის.')}</section>

          <section class="card"><div class="card-head"><h2>ფინანსები</h2>
              <select class="input" id="a-period" aria-label="პერიოდი" style="width:auto;min-height:32px">${PERIODS.map(([v, l]) => `<option value="${v}" ${period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="stats">
              <div class="stat"><span class="stat-label">შემოსავალი</span><span class="stat-value">${money(sum(inc))}</span></div>
              <div class="stat"><span class="stat-label">გაწეული ხარჯი</span><span class="stat-value">${money(sum(counted))}</span></div>
              <div class="stat"><span class="stat-label">მოლოდინში</span><span class="stat-value">${money(sum(pendingExp))}</span><span class="stat-note">შეთავაზებული/დადასტურებული</span></div>
            </div>
            ${inc.length || exp.length ? `<div class="rows">${[...inc.map(i => ({ d: i.income_date, html: `<span class="cell-main"><strong>${esc(i.description || i.source || 'შემოსავალი')}</strong><span>${esc(R.date(i.income_date))} · ${esc(i.source || '')}</span></span><span class="cell-right num t-ok">+${money(i.amount)}</span>` })),
              ...exp.map(e => ({ d: e.expense_date, html: `<span class="cell-main"><strong>${esc(e.description || L.expenseCategory[e.category])}</strong><span>${esc(R.date(e.expense_date))} · ${esc(L.expenseCategory[e.category] || e.category)}${e.receipt_url ? ` · <a href="${R.safeUrl(e.receipt_url)}" target="_blank" rel="noopener">ქვითარი</a>` : ['incurred', 'paid'].includes(e.status) && e.receipt_required !== false ? ' · <span class="t-warn">ქვითარი აკლია</span>' : ''}</span></span><span class="cell-right" style="display:flex;gap:8px;align-items:center">${R.expenseBadge(e.status)}<span class="num">−${money(e.amount)}</span></span>` }))]
              .sort((x, y) => String(y.d).localeCompare(String(x.d))).map(x => `<div class="row" style="--cols:minmax(0,1fr) auto">${x.html}</div>`).join('')}</div>` : App.emptyInline('ამ პერიოდში ჩანაწერი არ არის.')}
          </section>

          ${photos.length ? `<section class="card"><div class="card-head"><h2>ფოტოები</h2></div><div class="card-body"><div class="photos">${photos.slice(-12).reverse().map(p => `<a class="photo" href="${R.esc(App.taskHref(p.task.id))}" title="${esc(p.task.title)}"><img src="${esc(p.url)}" alt="${esc(p.task.title)}" loading="lazy" /><span>${esc({ before: 'მანამდე', after: 'შემდეგ', problem: 'პრობლემა' }[p.phase] || '')}</span></a>`).join('')}</div></div></section>` : ''}

          <section class="card"><div class="card-head"><h2>ისტორია</h2></div>${App.activityList(events.slice(0, 15))}</section>
        </div>

        <div class="stack">
          <section class="card"><div class="card-head"><h2>მესაკუთრე / პარტნიორი</h2>${owner ? `<a class="link-btn small" href="#/owners/${owner.id}">პროფილი</a>` : ''}</div>
            <div class="card-body">${a.owner_id && !owner ? `<div class="notice" id="a-owner-masked">${icon('key', 16)}<div><strong>მეპატრონის კონტაქტი დამალულია</strong><br>დანიშნე დათვალიერება და სახელი და ნომერი გამოჩნდება.</div></div>` : owner ? `<dl class="kv"><dt>სახელი</dt><dd>${esc(owner.name)}</dd>
              <dt>სტატუსი</dt><dd>${R.contactBadge(owner.contact_type || 'owner')}</dd>
              <dt>ტელეფონი</dt><dd>${owner.phone ? `<a href="tel:${esc(owner.phone)}">${esc(owner.phone)}</a>` : '–'}</dd>
              <dt>ელფოსტა</dt><dd>${owner.email ? `<a href="mailto:${esc(owner.email)}">${esc(owner.email)}</a>` : '–'}</dd>
              <dt>საკომისიო</dt><dd>${Number(a.commission_pct || 0)}%</dd></dl>`
              : '<p class="muted">მესაკუთრე არ არის მითითებული. თანხმობებისა და ამონაწერებისთვის მიუთითე მესაკუთრე.</p><button class="btn btn-secondary btn-sm" style="margin-top:8px" id="a-set-owner">მესაკუთრის მითითება</button>'}</div></section>

          <section class="card"><div class="card-head"><h2>თანხმობები</h2>${owner ? '<button type="button" class="btn btn-ghost btn-sm" id="a-approval">+ მოთხოვნა</button>' : ''}</div>
            ${approvals.length ? `<div class="rows">${approvals.slice(0, 6).map(x => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(x.title || x.description || 'ხარჯი')} · ${money(x.amount)}</strong><span>${esc(R.date(x.created_at))}${R.approvalStatus(x) === 'pending' ? ` · ${esc(R.elapsed(x.created_at))} ელოდება` : ''}</span></span>${R.approvalBadge(x)}</div>`).join('')}</div>` : App.emptyInline('თანხმობის მოთხოვნა ჯერ არ ყოფილა.')}</section>

          ${!isSale && !isLongTerm ? `<section class="card"><div class="card-head"><h2>ჯავშნები</h2><button type="button" class="btn btn-ghost btn-sm" id="a-res2">+ ჯავშანი</button></div>
            ${upcoming.length ? `<div class="rows">${upcoming.slice(0, 8).map(rv => {
              const outTs = H.resTs(rv.check_out, rv.check_out_time);
              const hasClean = S.data.tasks.some(t => t.type === 'cleaning' && t.status !== 'cancelled' && (t.reservation_id === rv.id ||
                (t.apartment_id === rv.apartment_id && !t.reservation_id && Math.abs(new Date(H.taskTime(t) || 0) - outTs) < 24 * 3600e3)));
              const conflict = res.some(o => o.id !== rv.id && o.check_in < rv.check_out && rv.check_in < o.check_out);
              return `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(rv.guest_name)} · ${esc(L.source[rv.source] || rv.source)}</strong>
                <span>${esc(R.date(rv.check_in))} → ${esc(R.date(rv.check_out))}${Number(rv.expected_income) ? ' · ' + money(rv.expected_income) : ''}</span>
                ${conflict ? '<span class="t-danger small">კონფლიქტი: თარიღები სხვა ჯავშანს ემთხვევა</span>' : ''}</span>
                <span>${hasClean ? R.badge('დასუფთავება დაგეგმილია', 'ok') : `<button type="button" class="btn btn-secondary btn-sm" data-clean="${rv.id}">დასუფთავების დაგეგმვა</button>`}</span></div>`;
            }).join('')}</div>` : App.emptyInline('მომავალი ჯავშანი არ არის. დაამატე ჯავშანი. სისტემა შემოგთავაზებს დასუფთავებას გასვლის შემდეგ.')}</section>` : ''}

          <section class="card"><div class="card-head"><h2>${icon('key', 16)} დაშვება</h2>${hasAccess(a) ? '<button type="button" class="btn btn-ghost btn-sm" id="a-reveal" aria-expanded="false">ჩვენება</button>' : ''}</div>
            <div class="card-body">${hasAccess(a) ? `<div id="a-access" hidden><dl class="kv">
                ${a.door_code ? `<dt>კარის კოდი</dt><dd class="secret">${esc(a.door_code)}</dd>` : ''}
                ${a.wifi_name ? `<dt>Wi-Fi</dt><dd>${esc(a.wifi_name)}</dd>` : ''}
                ${a.wifi_password ? `<dt>Wi-Fi პაროლი</dt><dd class="secret">${esc(a.wifi_password)}</dd>` : ''}
                ${a.parking_info ? `<dt>პარკინგი</dt><dd>${esc(a.parking_info)}</dd>` : ''}
                ${a.access_instructions ? `<dt>ინსტრუქცია</dt><dd style="white-space:pre-wrap">${esc(a.access_instructions)}</dd>` : ''}</dl></div>
                <p class="muted small" id="a-access-note">დაშვების მონაცემები დამალულია. ჩანს მენეჯერებისთვის და იმ თანამშრომლისთვის, ვისაც ამ ბინაში აქტიური საქმე აქვს.</p>`
              : '<p class="muted small">კარის კოდი, Wi-Fi და ინსტრუქცია არ არის შევსებული. დაამატე „რედაქტირებიდან“. დამლაგებელი ან აგენტი მათ საქმესთან ერთად ნახავს.</p>'}</div></section>
          ${!archived && App.isAdmin() ? `<button type="button" class="btn btn-danger-outline" id="a-archive">ობიექტის დაარქივება</button>` : ''}
        </div>
      </div>`;

    $('#a-task')?.addEventListener('click', () => App.openTaskForm({ apartmentId: id }));
    $('#a-viewing')?.addEventListener('click', () => App.openTaskForm({ apartmentId: id, type: 'viewing', prefill: { title: `დათვალიერება: ${a.name}` } }));
    $('#btn-add-viewing')?.addEventListener('click', () => App.openTaskForm({ apartmentId: id, type: 'viewing', prefill: { title: `დათვალიერება: ${a.name}` } }));
    $('#a-exp')?.addEventListener('click', () => App.openExpenseForm({ apartmentId: id }));
    const onRes = () => openReservationForm({ apartmentId: id });
    $('#a-res')?.addEventListener('click', onRes);
    $('#a-res2')?.addEventListener('click', onRes);
    $('#a-edit')?.addEventListener('click', () => openApartmentForm(a));
    $('#a-set-owner')?.addEventListener('click', () => openApartmentForm(a));
    $('#a-approval')?.addEventListener('click', () => App.openApprovalForm({ apartmentId: id }));
    const aPeriod = $('#a-period');
    if (aPeriod) aPeriod.onchange = (e) => { aptPeriod[id] = e.target.value; App.render(); };
    $('#a-all-tasks')?.addEventListener('click', (e) => { e.preventDefault(); App.setTaskFilter({ apt: id, status: 'all' }); App.go('#/tasks'); });
    
    // Marketing Showcase & Deals Bindings
    $('#listing-paused-upgrade')?.addEventListener('click', () => App.openUpgrade({ kind: 'apartments' }));
    $('#btn-share-renter')?.addEventListener('click', () => R.copyText(listingUrl(a), 'ბმული დაკოპირდა'));
    $('#btn-share-wl')?.addEventListener('click', () => R.copyText(listingUrl(a, true), 'White-label ბმული დაკოპირდა'));
    $('#btn-photos')?.addEventListener('click', () => openPhotosDialog(a));
    $('#btn-watermark')?.addEventListener('click', () => openWatermarkDialog(a));
    $('#btn-owner-report')?.addEventListener('click', () => openOwnerReportDialog(a));
    $('#btn-reverse-match')?.addEventListener('click', () => App.openReverseMatchmakerModal(a));
    $('#listing-url')?.addEventListener('focus', (e) => e.target.select());
    loadLinkStats(id);
    $('#btn-open-post')?.addEventListener('click', () => App.openPostGenerator(a));
    $('#btn-post-portals')?.addEventListener('click', () => openPortalPostDialog(a));
    $('#a-share')?.addEventListener('click', () => App.openCoBrokerShare(a));
    $('#a-pdf')?.addEventListener('click', () => App.openPresentation(a));
    $('#a-docs')?.addEventListener('click', () => App.openDocChooser({ apartment: a }));
    $('#btn-open-lease')?.addEventListener('click', () => App.openLeaseAgreementGenerator(a, null));
    App.bindNapr($('#view'));
    const openViewing = () => App.openTaskForm({ apartmentId: id, type: 'viewing', prefill: { title: `დათვალიერება: ${a.name}` } });
    $('#btn-apt-viewing')?.addEventListener('click', openViewing);
    $('#a-viewing')?.addEventListener('click', openViewing);
    $('#btn-hero-viewing')?.addEventListener('click', openViewing);
    const dAmount = isSale ? a.sale_price : a.monthly_rent;
    $('#btn-apt-deal')?.addEventListener('click', () => App.openDealForm(null, { apartment_id: id, deal_amount: dAmount, currency: a.currency || 'USD', deal_type: isSale ? 'sale' : 'rental' }));
    $('#btn-apt-deal-2')?.addEventListener('click', () => App.openDealForm(null, { apartment_id: id, deal_amount: dAmount, currency: a.currency || 'USD', deal_type: isSale ? 'sale' : 'rental' }));
    $$('[data-deal-edit]').forEach(b => b.addEventListener('click', () => {
      const deal = (S.data.deals || []).find(x => x.id === b.dataset.dealEdit);
      if (deal) App.openDealForm(deal);
    }));

    $('#a-reveal')?.addEventListener('click', (e) => {
      const box = $('#a-access'); box.hidden = !box.hidden;
      e.target.textContent = box.hidden ? 'ჩვენება' : 'დამალვა';
      e.target.setAttribute('aria-expanded', String(!box.hidden));
      $('#a-access-note').hidden = !box.hidden;
    });
    $$('[data-clean]').forEach(b => b.addEventListener('click', () => App.planCleaningAfter(S.data.reservations.find(x => x.id === b.dataset.clean))));
    $('#a-archive')?.addEventListener('click', async (e) => {
      const ok = await R.confirm({ title: 'ობიექტის დაარქივება', message: `${a.name} გაქრება აქტიური სიებიდან. ისტორია და ფინანსები შენარჩუნდება და აღდგენა ნებისმიერ დროს შეიძლება.`, confirmLabel: 'დაარქივება', danger: true });
      if (ok) setAptStatus(a, 'archived', e.target);
    });
    $('#a-restore')?.addEventListener('click', (e) => setAptStatus(a, 'active', e.target));
    App.bindNextActions($('#view'));
  }

  const hasAccess = (a) => a.door_code || a.wifi_name || a.wifi_password || a.parking_info || a.access_instructions;

  function setAptStatus(a, status, btn) {
    return run(btn, async () => {
      const row = await q(sb.from('apartments').update({ status, is_archived: status === 'archived' }).eq('id', a.id).select().single());
      App.upsertLocal('apartments', row);
      App.logEvent(a.id, status === 'archived' ? 'apartment_archived' : 'apartment_restored', status === 'archived' ? 'ბინა დაარქივდა' : 'ბინა აღდგა');
      App.render();
      toast(status === 'archived' ? 'ბინა დაარქივდა' : 'ბინა აღდგა', { type: 'success', action: status === 'archived' ? { label: 'დაბრუნება', fn: () => setAptStatus(row, 'active') } : null });
    });
  }

  // ===========================================================================
  // APARTMENT FORM
  // ===========================================================================
  function openApartmentForm(a = null, defaults = {}) {
    const edit = Boolean(a);
    if (!edit && App.guardLimit && !App.guardLimit('apartments')) return;
    const v = a || { status: 'active', transaction_type: 'sale', property_type: 'apartment', city: S.org.city || 'ბათუმი', commission_pct: 20, checkin_time: '14:00', checkout_time: '12:00', currency: 'USD', pets_allowed: false, agent_commission_percent: 50, cobroker_split: 50, owner_bonus: 0, ...defaults };
    const id = a?.id || R.uuid();
    const sl = smartlinkReady();
    const amen = new Set(Array.isArray(v.amenities) ? v.amenities : []);
    const numVal = (x) => (x === null || x === undefined || x === '' ? '' : esc(Number(x)));
    const txType = v.transaction_type || (v.rental_type === 'long_term' ? 'long_term' : 'daily');
    const hasMore = Boolean(edit && (v.cadastral_code || v.door_code || v.wifi_name || v.parking_info || v.access_instructions || v.prepayment_terms || v.utilities_estimate || v.notes || (v.amenities && v.amenities.length) || (v.agent_commission_percent !== 50 && v.agent_commission_percent !== undefined) || v.owner_bonus || (v.cobroker_split !== 50 && v.cobroker_split !== undefined)));
    let pm;
    return R.dialog({
      title: edit ? 'ობიექტის რედაქტირება' : 'ახალი უძრავი ქონება', wide: true, submitLabel: edit ? 'შენახვა' : 'ობიექტის დამატება',
      body: `${edit ? '' : `<div class="import-box" id="apt-import">
          <label class="field"><span class="field-label">${icon('link', 14)} განცხადების ლინკი (MyHome.ge / SS.ge / Place.ge)</span>
            <div class="import-row"><input type="url" id="apt-import-url" placeholder="https://www.myhome.ge/pr/..." inputmode="url" autocomplete="off" />
              <button type="button" class="btn btn-primary" id="apt-import-go">${icon('sparkle', 16)} 1-წამიანი შევსება</button></div></label>
          <p class="small" id="apt-import-msg" role="status">ჩასვი ბმული და ველები თავისით შეივსება. შემდეგ გადახედე, მიუთითე მეპატრონე და შეინახე.</p>
        </div>`}<div class="form-grid">
        <label class="field"><span class="field-label">დასახელება</span><input name="name" required maxlength="120" value="${esc(v.name || '')}" placeholder="მაგ.: Orbi City · 1204" data-error="ჩაწერე ობიექტის სახელი." /></label>
        <label class="field"><span class="field-label">ნომერი / ბინა</span><input name="unit_number" value="${esc(v.unit_number || '')}" placeholder="1204" /></label>
        <label class="field"><span class="field-label">მისამართი</span><input name="address" required value="${esc(v.address || '')}" placeholder="ქუჩა და ნომერი" data-error="ჩაწერე მისამართი." /></label>
        <label class="field"><span class="field-label">ქალაქი</span><input name="city" value="${esc(v.city || '')}" list="city-list" /><datalist id="city-list"><option>თბილისი</option><option>ბათუმი</option><option>ქუთაისი</option><option>გუდაური</option><option>ბაკურიანი</option></datalist></label>
        <label class="field"><span class="field-label">რაიონი / უბანი</span><input name="district" value="${esc(v.district || '')}" list="district-list" placeholder="ვაკე, საბურთალო, ბულვარი..." /><datalist id="district-list"><option>ვაკე</option><option>საბურთალო</option><option>ვერა</option><option>მთაწმინდა</option><option>ჩუღურეთი</option><option>ორთაჭალა</option><option>დიღომი</option><option>ძველი ბულვარი</option><option>ახალი ბულვარი</option><option>რუსთაველი</option></datalist></label>
        <label class="field"><span class="field-label">მესაკუთრე (კონტაქტი დაცულია)</span><select name="owner_id"><option value="">არ არის მითითებული</option>${S.data.owners.map(o => `<option value="${o.id}" ${o.id === v.owner_id ? 'selected' : ''}>${esc(o.name)} (${esc(L.contactType[o.contact_type] || 'მესაკუთრე')})</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">ტრანზაქციის ტიპი</span>
          <select name="transaction_type" id="apt-tx-type">
            <option value="sale" ${txType === 'sale' ? 'selected' : ''}>იყიდება (გაყიდვა)</option>
            <option value="long_term" ${txType === 'long_term' ? 'selected' : ''}>ქირავდება (გრძელვადიანი)</option>
            <option value="daily" ${txType === 'daily' ? 'selected' : ''}>დღიურად (მოკლევადიანი)</option>
          </select>
        </label>
        <label class="field"><span class="field-label">ქონების ტიპი</span>
          <select name="property_type">
            <option value="apartment" ${(v.property_type || 'apartment') === 'apartment' ? 'selected' : ''}>ბინა</option>
            <option value="house" ${v.property_type === 'house' ? 'selected' : ''}>სახლი / აგარაკი</option>
            <option value="commercial" ${v.property_type === 'commercial' ? 'selected' : ''}>კომერციული ფართი</option>
            <option value="land" ${v.property_type === 'land' ? 'selected' : ''}>მიწის ნაკვეთი</option>
          </select>
        </label>
        <label class="field"><span class="field-label">სტატუსი</span><select name="status">${['active', 'reserved', 'rented', 'sold', 'maintenance', 'vacant'].map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${L.aptStatus[s]}</option>`).join('')}${edit && v.status === 'archived' ? '<option value="archived" selected>დაარქივებული</option>' : ''}</select></label>

        <!-- Sales Price Section -->
        <div class="form-section span-2" id="apt-sale-section">
          <div class="form-section-title">გასაყიდი ფასი და კვადრატულობა</div>
          <div class="form-grid">
            <label class="field"><span class="field-label">გასაყიდი ფასი</span>
              <div style="display:grid;grid-template-columns:1fr 85px;gap:6px">
                <input type="number" id="apt-sale-price" name="sale_price" min="0" step="100" value="${esc(v.sale_price || '')}" placeholder="150000" />
                <select name="currency_sale"><option value="USD" ${v.currency !== 'GEL' ? 'selected' : ''}>USD ($)</option><option value="GEL" ${v.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option></select>
              </div>
            </label>
            <label class="field"><span class="field-label">ფასი 1 მ²-ზე</span>
              <input type="number" id="apt-price-sqm" name="price_sqm" min="0" step="10" value="${esc(v.price_sqm || '')}" placeholder="2000" />
              <span class="field-hint">ავტომატურად გამოითვლება ფართობიდან</span>
            </label>
          </div>
        </div>

        <!-- Long-term rental section -->
        <div class="form-section span-2" id="apt-rent-section">
          <div class="form-section-title">გრძელვადიანი გაქირავების მონაცემები</div>
          <div class="form-grid">
            <label class="field"><span class="field-label">მდგმურის სახელი</span><input name="tenant_name" value="${esc(v.tenant_name || '')}" placeholder="გიორგი მაისურაძე" /></label>
            <label class="field"><span class="field-label">მდგმურის ტელეფონი</span><input type="tel" name="tenant_phone" value="${esc(v.tenant_phone || '')}" placeholder="+995 599 00 11 22" /></label>
            <label class="field"><span class="field-label">თვიური ქირა</span>
              <div style="display:grid;grid-template-columns:1fr 85px;gap:6px">
                <input type="number" name="monthly_rent" min="0" step="10" value="${esc(v.monthly_rent || '')}" placeholder="1200" />
                <select name="currency"><option value="USD" ${v.currency !== 'GEL' ? 'selected' : ''}>USD ($)</option><option value="GEL" ${v.currency === 'GEL' ? 'selected' : ''}>GEL (₾)</option></select>
              </div>
            </label>
            <label class="field"><span class="field-label">გადახდის რიცხვი</span><input type="number" name="rent_due_day" min="1" max="31" value="${esc(v.rent_due_day || 1)}" placeholder="1" /></label>
            <label class="field"><span class="field-label">დეპოზიტი</span><input type="number" name="deposit_amount" min="0" step="10" value="${esc(v.deposit_amount || '')}" placeholder="1200" /></label>
            <label class="field"><span class="field-label">ხელშეკრულების ვადა</span><input type="date" name="lease_end" value="${esc(v.lease_end || '')}" /></label>
          </div>
        </div>

        <!-- Core Property Specs & Photos -->
        <div class="form-section span-2" style="background:var(--surface-2);padding:14px;border-radius:var(--r);border:1px solid var(--line)">
          <div class="form-section-title" style="margin-bottom:8px;font-weight:700">ძირითადი პარამეტრები და ფოტოები</div>
          <div class="form-grid">
            <label class="field" data-rooms-field><span class="field-label">ოთახების რაოდენობა</span><input type="number" name="rooms" min="1" max="20" value="${esc(edit ? (v.rooms ?? '') : 2)}" /></label>
            <label class="field" data-rooms-field><span class="field-label">საძინებლები</span><input type="number" name="bedrooms" min="0" max="10" value="${esc(edit ? (v.bedrooms ?? '') : 1)}" /></label>
            <label class="field" data-rooms-field><span class="field-label">სველი წერტილები</span><input type="number" name="bathrooms" min="0" max="10" value="${esc(edit ? (v.bathrooms ?? '') : 1)}" /></label>
            <label class="field"><span class="field-label">ფართობი (მ²)</span><input type="number" name="area_sqm" id="apt-area-sqm" min="5" step="0.5" value="${esc(v.area_sqm || '')}" placeholder="75" /></label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <label class="field"><span class="field-label">სართული</span><input name="floor" value="${esc(v.floor || '')}" placeholder="7" /></label>
              <label class="field"><span class="field-label">სულ სართ.</span><input type="number" name="total_floors" value="${esc(v.total_floors || '')}" placeholder="12" /></label>
            </div>
            <div class="field span-2"><span class="field-label">ფოტოები</span>${photoManagerHtml()}</div>
            <label class="field span-2"><span class="field-label">აღწერა (ქართულად)</span><textarea name="description" rows="3" placeholder="თანამედროვე უძრავი ქონება...">${esc(v.description || '')}</textarea></label>
          </div>
        </div>

        <!-- Progressive disclosure: Advanced details -->
        <details class="form-more span-2" ${hasMore ? 'open' : ''}>
          <summary>⚙️ დამატებითი დეტალები (საკადასტრო, კოდები, საკომისიოს წილები)</summary>
          <div class="form-grid" style="margin-top:12px">
            <label class="field"><span class="field-label">საკადასტრო კოდი</span><input name="cadastral_code" id="apt-cadastral" value="${esc(v.cadastral_code || '')}" placeholder="01.10.14.009.011" inputmode="numeric" autocomplete="off" /><span class="field-hint">წერტილები თავისით ჩაისმება. დუბლიკატს ბაზაში ავტომატურად ვამოწმებთ.</span></label>
            <div class="span-2" id="apt-dup" hidden></div>
            <label class="field"><span class="field-label">შინაური ცხოველები</span>
              <select name="pets_allowed">
                <option value="true" ${v.pets_allowed ? 'selected' : ''}>🐾 ნებადართულია (Pet Friendly)</option>
                <option value="false" ${!v.pets_allowed ? 'selected' : ''}>🚫 ცხოველების გარეშე</option>
              </select>
            </label>
            <label class="field"><span class="field-label">კომუნალური ხარჯი (~₾)</span><input type="number" name="utilities_estimate" min="0" step="10" value="${esc(v.utilities_estimate || '')}" placeholder="220" /><span class="field-hint">გაზი, დენი, წყალი, ინტერნეტი</span></label>
            <label class="field"><span class="field-label">წინასწარი გადახდის პირობები</span><input name="prepayment_terms" value="${esc(v.prepayment_terms || '')}" placeholder="1-ლი და ბოლო თვე + 1 თვის დეპოზიტი" /></label>
            <label class="field"><span class="field-label">აგენტის WhatsApp ნომერი</span><input type="tel" name="agent_phone" value="${esc(v.agent_phone || S.org.contact_phone || '')}" placeholder="+995599001122" /><span class="field-hint">ნახვის დაჯავშნის ღილაკისთვის</span></label>
            ${sl ? `<label class="field"><span class="field-label">აგენტის სახელი განცხადებაზე</span><input name="agent_name" maxlength="80" value="${esc(v.agent_name || '')}" placeholder="მაგ.: ნინო ბერიძე" /></label>` : ''}
            ${sl ? `<label class="field"><span class="field-label">ნიშანი ფოტოზე</span><select name="badge">${BADGES.map(([k, l]) => `<option value="${k}" ${(v.badge || '') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
            <div class="field span-2" role="group" aria-label="კეთილმოწყობა"><span class="field-label">კეთილმოწყობა</span>
              <div class="chips amenity-chips">${AMENITIES.map(([k, l]) => `<button type="button" class="chip" data-amenity="${k}" aria-pressed="${amen.has(k)}">${esc(l)}</button>`).join('')}</div></div>
            <label class="field span-2"><span class="field-label">აღწერა ინგლისურად <span class="muted">(არასავალდებულო)</span></span><textarea name="description_en" rows="3" lang="en" placeholder="Modern real estate listing...">${esc(v.description_en || '')}</textarea><span class="field-hint">უცხოელ კლიენტს ბმულზე ინგლისური ვერსია გამოუჩნდება.</span></label>
            ${sl ? `<label class="field span-2"><span class="field-label">ბმულის მისამართი</span>
              <div class="slug-input"><span class="muted small">${esc(location.host)}/p/</span><input name="slug" value="${esc(v.slug || '')}" maxlength="80" placeholder="vake-3-otakhiani" autocapitalize="off" spellcheck="false" data-error="ბმულში გამოიყენე მხოლოდ ლათინური ასოები, ციფრები და ტირე (მინიმუმ 3 სიმბოლო)." /></div>
              <span class="field-hint">${edit ? 'მისამართის შეცვლის შემდეგ ძველი ბმული აღარ იმუშავებს.' : 'თუ ცარიელს დატოვებ, სახელიდან ავტომატურად შეიქმნება.'}</span></label>
            <label class="field"><span class="field-label">განედი (lat) <span class="muted">(არასავალდებულო)</span></span><input name="lat" type="number" step="any" min="-90" max="90" value="${numVal(v.lat)}" placeholder="41.7151" data-error="განედი უნდა იყოს −90-დან 90-მდე." /></label>
            <label class="field"><span class="field-label">გრძედი (lng) <span class="muted">(არასავალდებულო)</span></span><input name="lng" type="number" step="any" min="-180" max="180" value="${numVal(v.lng)}" placeholder="44.8271" data-error="გრძედი უნდა იყოს −180-დან 180-მდე." /><span class="field-hint">კოორდინატების გარეშე რუკა მისამართით განისაზღვრება.</span></label>` : ''}
            
            <div class="form-section span-2">
              <div class="form-section-title">საკომისიო</div>
              <div class="form-grid">
                <label class="field"><span class="field-label">მართვის საკომისიო (%)</span><input type="number" name="commission_pct" min="0" max="100" step="0.5" value="${numVal(v.commission_pct ?? 20)}" data-error="საკომისიო უნდა იყოს 0-დან 100-მდე." /><span class="field-hint">მფლობელის თვიურ ამონაწერში შემოსავლიდან გამოიქვითება.</span></label>
                <label class="field"><span class="field-label">აგენტის საკომისიო (% ქირიდან ან გაყიდვიდან)</span><input type="number" name="agent_commission_percent" min="0" max="300" step="1" value="${numVal(v.agent_commission_percent)}" placeholder="50" /></label>
                <label class="field"><span class="field-label">მფლობელის ბონუსი</span><input type="number" name="owner_bonus" min="0" step="10" value="${numVal(v.owner_bonus)}" placeholder="0" /><span class="field-hint">ფიქსირებული თანხა ვალუტაში.</span></label>
                <label class="field"><span class="field-label">პარტნიორი აგენტის წილი (%)</span><input type="number" name="cobroker_split" min="0" max="100" step="5" value="${numVal(v.cobroker_split)}" placeholder="50" /></label>
              </div>
            </div>

            <div class="form-grid span-2" id="apt-daily-section" style="gap:8px"><label class="field"><span class="field-label">Check-in</span><input type="time" name="checkin_time" value="${esc(String(v.checkin_time || '14:00').slice(0, 5))}" /></label><label class="field"><span class="field-label">Check-out</span><input type="time" name="checkout_time" value="${esc(String(v.checkout_time || '12:00').slice(0, 5))}" /></label></div>
            <div class="form-section span-2"><div class="form-section-title">დაშვება <span class="muted small">– ჩანს მხოლოდ მენეჯერებისთვის</span></div>
              <div class="form-grid">
                <label class="field"><span class="field-label">კარის კოდი</span><input name="door_code" value="${esc(v.door_code || '')}" autocomplete="off" /></label>
                <label class="field"><span class="field-label">პარკინგი</span><input name="parking_info" value="${esc(v.parking_info || '')}" /></label>
                <label class="field"><span class="field-label">Wi-Fi ქსელი</span><input name="wifi_name" value="${esc(v.wifi_name || '')}" autocomplete="off" /></label>
                <label class="field"><span class="field-label">Wi-Fi პაროლი</span><input name="wifi_password" value="${esc(v.wifi_password || '')}" autocomplete="off" /></label>
                <label class="field span-2"><span class="field-label">ინსტრუქცია დამლაგებლისა და ტექნიკოსისთვის</span><textarea name="access_instructions" rows="2" placeholder="მაგ.: გასაღები რეცეფციაზე, სახელით">${esc(v.access_instructions || '')}</textarea></label>
              </div></div>
            <label class="field span-2"><span class="field-label">შიდა შენიშვნა</span><textarea name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
          </div>
        </details>
      </div>`,
      onOpen: (form) => {
        pm = photoManager(form, v.photos, id);
        // Land and commercial space have no rooms; hide those fields so they aren't saved by accident.
        const syncRooms = () => { const none = ['land', 'commercial'].includes(form.property_type.value); $$('[data-rooms-field]', form).forEach(el => { el.hidden = none; }); };
        form.property_type.addEventListener('change', syncRooms);
        syncRooms();
        $$('[data-amenity]', form).forEach(b => b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'))));
        const txSelect = $('#apt-tx-type', form);
        const syncTx = () => {
          const tp = txSelect?.value || 'sale';
          const saleSec = $('#apt-sale-section', form);
          const rentSec = $('#apt-rent-section', form);
          const dailySec = $('#apt-daily-section', form);
          if (saleSec) saleSec.hidden = tp !== 'sale';
          if (rentSec) rentSec.hidden = tp !== 'long_term';
          if (dailySec) dailySec.hidden = tp !== 'daily';
        };
        txSelect?.addEventListener('change', syncTx);
        syncTx();

        const saleInput = $('#apt-sale-price', form);
        const areaInput = $('#apt-area-sqm', form);
        const sqmInput = $('#apt-price-sqm', form);
        const calcM2 = () => {
          const sp = Number(saleInput?.value || 0);
          const ar = Number(areaInput?.value || 0);
          if (sp > 0 && ar > 0 && !sqmInput.dataset.manual) {
            sqmInput.value = Math.round(sp / ar);
          }
        };
        // Smart import: read a listing page and fill the form; the agent reviews before saving.
        const importBtn = $('#apt-import-go', form);
        const importMsg = $('#apt-import-msg', form);
        const setField = (name, value) => { const el = form.elements[name]; if (el && value !== null && value !== undefined && value !== '') { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } };
        const say = (text, tone) => { importMsg.textContent = text; importMsg.className = `small ${tone === 'error' ? 't-danger' : tone === 'ok' ? 't-ok' : ''}`; };
        importBtn?.addEventListener('click', async () => {
          if (!App.guardFeature('import')) return;
          const url = $('#apt-import-url', form).value.trim();
          if (!/^https?:\/\/([\w-]+\.)*(myhome\.ge|ss\.ge|place\.ge)\//i.test(url)) { say('ჩასვი განცხადების ბმული MyHome.ge-დან, SS.ge-დან ან Place.ge-დან.', 'error'); return; }
          importBtn.disabled = true; importBtn.classList.add('is-busy'); say('ვკითხულობთ განცხადებას…');
          try {
            const { data: { session } } = await sb.auth.getSession();
            const res = await fetch('/api/import-listing/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ url, org: S.org.id }) });
            const out = await res.json().catch(() => ({}));
            if (!res.ok || !out.ok) {
              // The server explains known cases; the rest are mapped here so the agent always knows what to do next.
              throw new Error(out.message || (res.status === 401 ? 'სესია ამოიწურა. შედი ანგარიშში თავიდან და სცადე ხელახლა.'
                : res.status === 429 ? 'ძალიან ბევრი მოთხოვნა. სცადე ერთ წუთში.'
                : res.status >= 500 ? 'იმპორტის სერვისი დროებით მიუწვდომელია. შეავსე ველები ხელით.'
                : 'განცხადება ვერ წავიკითხეთ. შეავსე ველები ხელით.'));
            }
            const l = out.listing;
            setField('transaction_type', l.transaction_type); setField('property_type', l.property_type);
            setField('name', l.name); setField('address', l.address || l.district); setField('city', l.city); setField('district', l.district);
            setField('rooms', l.rooms); setField('bedrooms', l.bedrooms); setField('bathrooms', l.bathrooms);
            setField('area_sqm', l.area_sqm); setField('floor', l.floor); setField('total_floors', l.total_floors);
            setField('description', l.description); setField('lat', l.lat); setField('lng', l.lng);
            if (l.cadastral_code) setField('cadastral_code', l.cadastral_code);
            if (l.transaction_type === 'sale') { setField('currency_sale', l.currency); setField('sale_price', l.price); if (l.price_sqm) setField('price_sqm', l.price_sqm); }
            else { setField('currency', l.currency); setField('monthly_rent', l.price); }
            if (pm && Array.isArray(l.images)) pm.addUrls(l.images);
            const filled = [l.price && 'ფასი', l.area_sqm && 'ფართი', l.rooms && 'ოთახები', l.address && 'მისამართი', l.images?.length && `${l.images.length} ფოტო`].filter(Boolean).join(', ');
            const missing = [!l.price && 'ფასი', !l.area_sqm && 'ფართი', !l.address && 'მისამართი'].filter(Boolean).join(', ');
            // The demo has no server, so it cannot read the pasted link; say so instead of implying it did.
            if (l.source === 'demo') say('დემო რეჟიმში ბმული არ იკითხება: ფორმა შეივსო სანიმუშო განცხადებით, რომ ნახო, როგორ მუშაობს. რეალურ ანგარიშში ფორმა შენი ბმულის მონაცემებით და ფოტოებით შეივსება.', 'ok');
            else say(`შევსებულია: ${filled || 'ძირითადი ველები'}.${missing ? ` ვერ ვიპოვეთ: ${missing}.` : ''} სხვა სააგენტოს კონტაქტები აღწერიდან ამოღებულია.${l.images?.length ? ' ფოტოები წყარო საიტზე რჩება: თუ განცხადება წაიშლება, ისინიც გაქრება, ამიტომ მნიშვნელოვანი ფოტოები თავად ატვირთე.' : ''} გადახედე, მიუთითე მეპატრონე და შეინახე.`, 'ok');
          } catch (err) {
            say(err instanceof TypeError ? 'ინტერნეტთან კავშირი ვერ დამყარდა. შეამოწმე კავშირი და სცადე ხელახლა.' : (err.message || 'განცხადება ვერ წავიკითხეთ. შეავსე ველები ხელით.'), 'error');
          } finally { importBtn.disabled = false; importBtn.classList.remove('is-busy'); }
        });

        // Cadastral code: format while typing and warn when the object is already in the workspace.
        const cadInput = $('#apt-cadastral', form);
        const dupBox = $('#apt-dup', form);
        const checkCadastral = () => {
          const code = cadInput.value.trim();
          const dup = code && S.data.apartments.find(x => x.id !== id && x.cadastral_code === code);
          const complete = R.CADASTRAL_RE.test(code);
          dupBox.hidden = !dup;
          dupBox.innerHTML = dup ? `<div class="notice notice-warn" id="apt-dup-banner">${icon('alert', 16)}<div><strong>ობიექტი უკვე ბაზაშია!</strong> ${esc(dup.name)}<br>აგენტი: ${esc(dup.agent_name || 'არ არის მითითებული')} | დამატებულია: ${esc(R.date(dup.created_at))} | სტატუსი: ${esc(L.aptStatus[dup.status] || dup.status)}</div></div>` : '';
          cadInput.setCustomValidity(code && !complete ? 'invalid' : '');
        };
        cadInput.dataset.error = 'საკადასტრო კოდი არასრულია. მაგ.: 01.10.14.009.011';
        cadInput.addEventListener('input', () => { cadInput.value = R.cadastralFormat(cadInput.value); checkCadastral(); });
        checkCadastral();
        saleInput?.addEventListener('input', calcM2);
        areaInput?.addEventListener('input', calcM2);
        sqmInput?.addEventListener('input', () => { sqmInput.dataset.manual = '1'; });
      },
      onSubmit: async (form, f) => {
        if (pm?.busy()) throw new Error('დაელოდე ფოტოების ატვირთვის დასრულებას.');
        const num = (x, dflt = null) => (x === undefined || String(x).trim() === '' ? dflt : Number(x));
        const txType = f.transaction_type || 'sale';
        const cur = txType === 'sale' ? (f.currency_sale || f.currency || 'USD') : (f.currency || 'USD');
        const areaSqm = f.area_sqm ? Number(f.area_sqm) : null;
        const salePrice = f.sale_price ? Number(f.sale_price) : null;
        const priceSqm = f.price_sqm ? Number(f.price_sqm) : (salePrice && areaSqm ? Math.round(salePrice / areaSqm) : null);

        const payload = {
          name: f.name.trim(), unit_number: f.unit_number.trim() || null, address: f.address.trim(), city: f.city.trim() || null,
          district: f.district?.trim() || null, currency: cur,
          cadastral_code: f.cadastral_code?.trim() || null,
          transaction_type: txType,
          property_type: f.property_type || 'apartment',
          sale_price: salePrice,
          price_sqm: priceSqm,
          ...(['land', 'commercial'].includes(f.property_type)
            ? { rooms: null, bedrooms: null, bathrooms: null }
            : { rooms: f.rooms ? Number(f.rooms) : null, bedrooms: f.bedrooms ? Number(f.bedrooms) : null, bathrooms: f.bathrooms ? Number(f.bathrooms) : null }),
          area_sqm: areaSqm, floor: f.floor?.trim() || null, total_floors: f.total_floors ? Number(f.total_floors) : null,
          pets_allowed: f.pets_allowed === 'true', utilities_estimate: f.utilities_estimate ? Number(f.utilities_estimate) : null,
          prepayment_terms: f.prepayment_terms?.trim() || null, agent_phone: f.agent_phone?.trim() || null,
          description: f.description?.trim() || null,
          description_en: f.description_en?.trim() || null,
          photos: pm ? pm.get() : (v.photos || []),
          amenities: $$('[data-amenity][aria-pressed="true"]', form).map(b => b.dataset.amenity),
          commission_pct: num(f.commission_pct, 0), agent_commission_percent: num(f.agent_commission_percent),
          owner_bonus: num(f.owner_bonus, 0), cobroker_split: num(f.cobroker_split),
          owner_id: f.owner_id || null, status: f.status, is_archived: f.status === 'archived',
          rental_type: txType === 'long_term' ? 'long_term' : 'short_term',
          tenant_name: f.tenant_name?.trim() || null, tenant_phone: f.tenant_phone?.trim() || null,
          monthly_rent: f.monthly_rent ? Number(f.monthly_rent) : null, rent_due_day: f.rent_due_day ? Number(f.rent_due_day) : 1,
          deposit_amount: f.deposit_amount ? Number(f.deposit_amount) : null, lease_end: f.lease_end || null,
          checkin_time: f.checkin_time || null, checkout_time: f.checkout_time || null,
          door_code: f.door_code.trim() || null, parking_info: f.parking_info.trim() || null, wifi_name: f.wifi_name.trim() || null,
          wifi_password: f.wifi_password.trim() || null, access_instructions: f.access_instructions.trim() || null, notes: f.notes.trim() || null,
        };
        if (sl) {
          const slug = String(f.slug || '').trim().toLowerCase();
          if (slug && !SLUG_RE.test(slug)) throw new Error('ბმულში გამოიყენე მხოლოდ ლათინური ასოები, ციფრები და ტირე (მინიმუმ 3 სიმბოლო).');
          if (slug && S.data.apartments.some(x => x.id !== id && x.slug === slug)) throw new Error('ეს ბმული უკვე სხვა ბინას აქვს. აირჩიე სხვა მისამართი.');
          Object.assign(payload, {
            slug: slug || (edit && v.slug) || slugify(payload.name),
            agent_name: f.agent_name?.trim() || null, badge: f.badge || null,
            lat: num(f.lat), lng: num(f.lng),
          });
        }
        let row;
        try {
          row = edit
            ? await q(sb.from('apartments').update(payload).eq('id', a.id).select().single())
            : await App.insertOnce('apartments', { id, organization_id: S.org.id, listing_agent_id: S.member?.id || null, ...payload });
        } catch (err) {
          if (err?.code === '23505' && /slug/i.test(err.message || '')) throw new Error('ეს ბმული უკვე დაკავებულია. აირჩიე სხვა მისამართი.');
          throw err;
        }
        App.upsertLocal('apartments', row);
        App.logEvent(row.id, edit ? 'apartment_updated' : 'apartment_created', edit ? 'მონაცემები განახლდა' : 'ობიექტი დაემატა', row.name);
        toast(edit ? 'ობიექტი განახლდა' : `ობიექტი დაემატა: ${row.name}`, { type: 'success' });
        if (edit) App.render(); else App.go(`#/apartments/${row.id}`);
      },
    });
  }
  App.openApartmentForm = openApartmentForm;

  // ===========================================================================
  // RESERVATION FORM
  // ===========================================================================
  function openReservationForm({ apartmentId }) {
    const a = H.apt(apartmentId);
    const id = R.uuid();
    return R.dialog({
      title: 'ახალი ჯავშანი', subtitle: a.name, submitLabel: 'ჯავშნის დამატება',
      body: `<div class="form-grid">
        <label class="field"><span class="field-label">სტუმარი</span><input name="guest_name" required data-error="ჩაწერე სტუმრის სახელი." /></label>
        <label class="field"><span class="field-label">წყარო</span><select name="source">${Object.entries(L.source).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">შესვლა</span><div style="display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:6px"><input class="input" type="date" name="check_in" required data-error="მიუთითე შესვლის თარიღი." /><input class="input" type="time" name="check_in_time" value="${esc(String(a.checkin_time || '14:00').slice(0, 5))}" aria-label="შესვლის დრო" /></div></label>
        <label class="field"><span class="field-label">გასვლა</span><div style="display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:6px"><input class="input" type="date" name="check_out" required data-error="მიუთითე გასვლის თარიღი." /><input class="input" type="time" name="check_out_time" value="${esc(String(a.checkout_time || '12:00').slice(0, 5))}" aria-label="გასვლის დრო" /></div></label>
        <label class="field"><span class="field-label">მოსალოდნელი შემოსავალი (₾)</span><input type="number" name="expected_income" min="0" step="0.01" inputmode="decimal" /><span class="field-hint">შემოსავლად ჩაიწერება მხოლოდ მაშინ, როცა „ფინანსებში“ აღრიცხავ.</span></label>
        <label class="field"><span class="field-label">სტუმრის ტელეფონი</span><input name="guest_phone" type="tel" /></label>
        <label class="field span-2"><span class="field-label">შენიშვნა</span><textarea name="notes" rows="2"></textarea></label>
        <p class="span-2" data-conflict hidden></p>
      </div>`,
      onOpen: (form) => {
        const check = () => {
          const box = $('[data-conflict]', form);
          const ci = form.check_in.value, co = form.check_out.value;
          const hit = ci && co && S.data.reservations.find(r => r.apartment_id === apartmentId && r.status !== 'cancelled' && r.check_in < co && ci < r.check_out);
          box.hidden = !hit;
          if (hit) { box.className = 'span-2 notice notice-warn'; box.textContent = `კონფლიქტი: ${hit.guest_name} (${R.date(hit.check_in)} → ${R.date(hit.check_out)}). შეამოწმე თარიღები.`; }
        };
        form.check_in.addEventListener('change', () => { if (!form.check_out.value) { const d = R.toDate(form.check_in.value); d.setDate(d.getDate() + 1); form.check_out.value = R.isoDate(d); } check(); });
        form.check_out.addEventListener('change', check);
      },
      onSubmit: async (form, v) => {
        if (v.check_out <= v.check_in) throw new Error('გასვლა შესვლაზე გვიან უნდა იყოს.');
        const conflict = S.data.reservations.find(r => r.apartment_id === apartmentId && r.status !== 'cancelled' && r.check_in < v.check_out && v.check_in < r.check_out);
        if (conflict && form.dataset.conflictOk !== '1') { form.dataset.conflictOk = '1'; throw new Error('თარიღები სხვა ჯავშანს ემთხვევა. თუ მაინც გინდა შენახვა, დააჭირე ღილაკს ხელახლა.'); }
        const row = await App.insertOnce('reservations', {
          id, organization_id: S.org.id, apartment_id: apartmentId, guest_name: v.guest_name.trim(), source: v.source,
          check_in: v.check_in, check_out: v.check_out, check_in_time: v.check_in_time || null, check_out_time: v.check_out_time || null,
          expected_income: Number(v.expected_income || 0), guest_phone: v.guest_phone.trim() || null, notes: v.notes.trim() || null, created_by: S.user.id,
        }).catch(err => { throw /row-level security|permission/i.test(err.message) ? new Error('ჯავშნების შენახვა ჯერ არ არის ჩართული ბაზაში (საჭიროა operations RLS მიგრაცია).') : err; });
        S.data.reservations.push(row);
        App.logEvent(apartmentId, 'reservation_created', `ჯავშანი: ${row.guest_name}`, `${R.date(row.check_in)} → ${R.date(row.check_out)}`);
        App.render();
        toast('ჯავშანი დაემატა', { type: 'success', action: { label: 'დასუფთავების დაგეგმვა', fn: () => App.planCleaningAfter(row) } });
      },
    });
  }

  // ===========================================================================
  // OWNERS & APPROVALS
  // ===========================================================================
  let apprFilter = 'pending';

  // Section pages: one contact type each (#/owners?type=renter|owner|buyer|seller).
  const CONTACT_PAGES = {
    renter: { title: 'მდგმურები', one: 'მდგმური', add: 'მდგმურის დამატება', sub: 'ვინც ბინას ქირაობს ან ეძებს' },
    owner: { title: 'მეპატრონეები', one: 'მეპატრონე', add: 'მეპატრონის დამატება', sub: 'ვისი ბინებიც გაქირავებაშია' },
    buyer: { title: 'მყიდველები', one: 'მყიდველი', add: 'მყიდველის დამატება', sub: 'ვინც ბინის ყიდვას აპირებს' },
    seller: { title: 'გამყიდველები', one: 'გამყიდველი', add: 'გამყიდველის დამატება', sub: 'ვინც ბინას ყიდის' },
  };
  const contactsHref = (ct) => (CONTACT_PAGES[ct] ? `#/owners?type=${ct}` : '#/owners?tab=owners');

  function renderContactPage(r, type) {
    const page = CONTACT_PAGES[type];
    const count = S.data.owners.filter(o => (o.contact_type || 'owner') === type).length;
    const pending = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending');
    const isOwner = type === 'owner';
    const tab = isOwner && r.params.get('tab') === 'approvals' ? 'approvals' : 'list';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>${page.title}</h1><p class="page-sub">${count} ${page.one} · ${page.sub}</p></div>
        <div class="page-actions">${isOwner ? '<button type="button" class="btn btn-secondary" id="o-appr">თანხმობის მოთხოვნა</button>' : ''}<button type="button" class="btn btn-primary" id="o-new">${icon('plus', 16)} ${page.add}</button></div></div>
      ${isOwner ? `<div class="tabs" role="tablist"><a class="tab" role="tab" href="#/owners?type=owner" aria-selected="${tab === 'list'}">მეპატრონეები <span class="count">${count}</span></a><a class="tab" role="tab" href="#/owners?type=owner&tab=approvals" aria-selected="${tab === 'approvals'}">თანხმობები <span class="count">${pending.length}</span></a></div>` : ''}
      <div id="o-body"></div>`;
    $('#o-new').onclick = () => openOwnerForm(null, { contact_type: type });
    // Show the new request right away instead of leaving the user on the contact list.
    $('#o-appr')?.addEventListener('click', async () => { if (await App.openApprovalForm({})) location.hash = '#/owners?type=owner&tab=approvals'; });
    if (tab === 'approvals') renderApprovals($('#o-body')); else renderOwnersList($('#o-body'), type);
  }

  App.views.owners = (r) => {
    if (r.id) return renderOwner(r.id);
    if (CONTACT_PAGES[r.params.get('type')]) return renderContactPage(r, r.params.get('type'));
    const pending = S.data.approvals.filter(a => R.approvalStatus(a) === 'pending');
    const tab = r.params.get('tab') === 'approvals' ? 'approvals' : 'owners';
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>ყველა კონტაქტი</h1><p class="page-sub">${S.data.owners.length} კონტაქტი · ${pending.length} თანხმობა ელოდება პასუხს</p></div>
        <div class="page-actions"><button type="button" class="btn btn-secondary" id="o-appr">თანხმობის მოთხოვნა</button><button type="button" class="btn btn-primary" id="o-new">${icon('plus', 16)} კონტაქტის დამატება</button></div></div>
      <div class="tabs" role="tablist"><button type="button" role="tab" class="tab" data-tab="owners" aria-selected="${tab === 'owners'}">კონტაქტები <span class="count">${S.data.owners.length}</span></button><button type="button" role="tab" class="tab" data-tab="approvals" aria-selected="${tab === 'approvals'}">თანხმობები <span class="count">${pending.length}</span></button></div>
      <div id="o-body"></div>`;
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.tab === 'approvals' ? '#/owners?tab=approvals' : '#/owners'; }));
    $('#o-new').onclick = () => openOwnerForm();
    $('#o-appr').onclick = async () => { if (await App.openApprovalForm({})) location.hash = '#/owners?tab=approvals'; };
    if (tab === 'approvals') renderApprovals($('#o-body')); else renderOwnersList($('#o-body'));
  };

  function renderApprovals(root) {
    const all = S.data.approvals;
    const F = [['pending', 'ელოდება პასუხს'], ['approved', 'დადასტურებული'], ['declined', 'უარყოფილი'], ['expired', 'ვადაგასული'], ['all', 'ყველა']];
    const list = all.filter(a => apprFilter === 'all' || R.approvalStatus(a) === apprFilter).sort((a, b) => apprFilter === 'pending' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
    const cols = 'minmax(0,1.6fr) minmax(0,1.2fr) 100px 110px 130px 140px 150px';
    root.innerHTML = `<div class="chips">${F.map(([id, l]) => `<button type="button" class="chip" data-af="${id}" aria-pressed="${apprFilter === id}">${l} <span class="count">${all.filter(a => id === 'all' || R.approvalStatus(a) === id).length}</span></button>`).join('')}</div>
      <section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>საკითხი</span><span>ბინა · მფლობელი</span><span>თანხა</span><span>მოთხოვნილია</span><span>ელოდება</span><span>სტატუსი</span><span></span></div>
      ${list.map(a => {
        const st = R.approvalStatus(a);
        const exp = S.data.expenses.find(e => e.approval_id === a.id);
        let action = '';
        if (st === 'pending') action = `<button type="button" class="btn btn-secondary btn-sm" data-share="${a.id}">${navigator.share ? 'გაზიარება' : 'ბმულის კოპირება'}</button>`;
        else if (st === 'approved' && exp && exp.status === 'approved') action = `<a class="btn btn-ghost btn-sm" href="#/finance?status=approved">ხარჯის აღრიცხვა</a>`;
        return `<div class="row ${a.task_id ? 'clickable' : ''}" style="--cols:${cols}" ${a.task_id ? `data-go="${App.taskHref(a.task_id)}"` : ''}>
          <span class="cell-main"><strong>${esc(a.title || a.description || 'ხარჯი')}</strong><span>${esc(a.description && a.title ? a.description : '')}</span></span>
          <span class="cell-meta">${esc(H.aptName(a.apartment_id))} · ${esc(H.owner(a.owner_id)?.name || '–')}</span>
          <span class="cell-meta num strong">${money(a.amount)}</span>
          <span class="cell-meta" data-label="მოთხოვნილია">${esc(R.date(a.created_at))}</span>
          <span class="cell-meta">${st === 'pending' ? `<span class="${Date.now() - new Date(a.created_at) > 24 * 3600e3 ? 't-danger' : 't-warn'}">${esc(R.elapsed(a.created_at))} ელოდება</span>` : a.responded_at ? `პასუხი ${esc(R.date(a.responded_at))}` : ''}</span>
          <span class="cell-status">${R.approvalBadge(a)}${exp && st === 'approved' ? `<div class="small muted">${exp.status === 'approved' ? 'ჯერ არ არის გაწეული' : L.expense[exp.status]}</div>` : ''}</span>
          <span class="cell-actions">${action}${st === 'pending' ? `<button type="button" class="btn btn-ghost btn-sm" data-cancel-appr="${a.id}">გაუქმება</button>` : ''}</span>
        </div>`;
      }).join('')}</div>` : `<div class="empty">${icon('owner', 28)}<h3>${apprFilter === 'pending' ? 'პასუხის მომლოდინე მოთხოვნა არ არის' : 'ჩანაწერი არ არის'}</h3><p>თანხმობის მოთხოვნით მფლობელი ტელეფონიდან ერთი ბმულით დაადასტურებს ან უარყოფს ხარჯს, მაგ.: „ონკანის გამოცვლა, ₾180“.</p><button class="btn btn-primary" type="button" id="o-appr-empty">თანხმობის მოთხოვნა</button></div>`}</section>`;
    $$('[data-af]', root).forEach(b => b.addEventListener('click', () => { apprFilter = b.dataset.af; App.render(); }));
    $$('[data-go]', root).forEach(rw => rw.addEventListener('click', (e) => { if (!e.target.closest('button,a')) App.go(rw.dataset.go); }));
    $('#o-appr-empty')?.addEventListener('click', () => App.openApprovalForm({}));
    App.bindApprovalShare(root);
    $$('[data-cancel-appr]', root).forEach(b => b.addEventListener('click', async () => {
      const a = S.data.approvals.find(x => x.id === b.dataset.cancelAppr);
      const ok = await R.confirm({ title: 'მოთხოვნის გაუქმება', message: `„${a.title || a.description}“ (${money(a.amount)}). მფლობელის ბმული აღარ იმუშავებს.`, confirmLabel: 'გაუქმება', danger: true });
      if (!ok) return;
      run(b, async () => {
        const row = await q(sb.from('approvals').update({ status: 'cancelled' }).eq('id', a.id).select().single());
        App.upsertLocal('approvals', row);
        const exp = S.data.expenses.find(e => e.approval_id === a.id && e.status === 'proposed');
        if (exp) App.upsertLocal('expenses', await q(sb.from('expenses').update({ status: 'declined' }).eq('id', exp.id).select().single()));
        App.logEvent(a.apartment_id, 'approval_cancelled', `თანხმობის მოთხოვნა გაუქმდა: ${a.title || a.description}`);
        App.render();
      }, { success: 'მოთხოვნა გაუქმდა' });
    }));
  }

  let ownerContactType = 'all';

  // fixedType: a section page shows one contact type and no type filter.
  function renderOwnersList(root, fixedType = null) {
    const all = S.data.owners;
    const TYPES = [['all', 'ყველა'], ['owner', 'მეპატრონეები'], ['buyer', 'მყიდველები'], ['renter', 'მდგმურები'], ['seller', 'გამყიდველები']];
    const activeType = fixedType || ownerContactType;
    const list = all.filter(o => activeType === 'all' || (o.contact_type || 'owner') === activeType);
    const page = CONTACT_PAGES[fixedType];
    const cols = 'minmax(0,1.5fr) 110px minmax(0,1.2fr) minmax(0,1.3fr) 100px';

    root.innerHTML = `
      ${fixedType ? '' : `<div class="chips" role="group" aria-label="კონტაქტის ტიპი" style="margin-bottom:12px">
        ${TYPES.map(([id, label]) => `<button type="button" class="chip" data-oct="${id}" aria-pressed="${ownerContactType === id}">${label} <span class="count">${all.filter(o => id === 'all' || (o.contact_type || 'owner') === id).length}</span></button>`).join('')}
      </div>`}
      <section class="card">${list.length ? `<div class="rows"><div class="rows-head" style="--cols:${cols}"><span>სახელი</span><span>ტიპი</span><span>საკონტაქტო / ბიუჯეტი</span><span>ობიექტები / მოთხოვნა</span><span>თანხმობა</span></div>
      ${list.map(o => {
        const apts = S.data.apartments.filter(a => a.owner_id === o.id && a.status !== 'archived');
        const pend = S.data.approvals.filter(a => a.owner_id === o.id && R.approvalStatus(a) === 'pending').length;
        const ct = o.contact_type || 'owner';
        const isClient = ['buyer', 'renter'].includes(ct);
        const budgetStr = o.budget_max ? `ბიუჯეტი: ${budgetText(o)}` : '';
        const prefStr = [o.preferred_city, o.preferred_district].filter(Boolean).join(', ');
        return `<a class="row" href="#/owners/${o.id}" style="--cols:${cols}"><span class="cell-main"><strong>${esc(o.name)} ${H.flagTag(o)}</strong><span>${o.user_id ? 'პორტალთან დაკავშირებული' : (o.lead_source ? 'წყარო: ' + esc(L.leadSource[o.lead_source] || o.lead_source) : '')}</span></span>
          <span class="cell-meta">${R.contactBadge(ct)}</span>
          <span class="cell-meta">${esc([o.phone, o.email].filter(Boolean).join(' · ') || '–')}${budgetStr ? `<div class="small t-ok" style="font-weight:600">${esc(budgetStr)}</div>` : ''}</span>
          <span class="cell-meta" data-label="დეტალები">${apts.length ? esc(apts.map(a => a.name).join(', ')) : (prefStr ? esc(prefStr) : (typeof o.requirements === 'string' && o.requirements ? esc(o.requirements.slice(0, 40)) : '–'))}</span>
          <span class="cell-status">${pend ? R.badge(`${pend} ელოდება`, 'warn') : ''}</span></a>`;
      }).join('')}</div>` : `<div class="empty">${icon('owner', 28)}<h3>${page ? `${page.one} ჯერ არ არის დამატებული` : 'კონტაქტი ვერ მოიძებნა'}</h3><p>${page ? 'დაამატე სახელი და ტელეფონი. დანარჩენის შევსება მოგვიანებითაც შეიძლება.' : 'დაამატე მეპატრონე, გამყიდველი, მყიდველი ან მდგმური.'}</p><button class="btn btn-primary" type="button" id="o-new-empty">${page ? page.add : 'კონტაქტის დამატება'}</button></div>`}</section>`;

    $$('[data-oct]', root).forEach(b => b.addEventListener('click', () => { ownerContactType = b.dataset.oct; renderOwnersList(root); }));
    $('#o-new-empty')?.addEventListener('click', () => openOwnerForm(null, fixedType ? { contact_type: fixedType } : {}));
  }

  function renderOwner(id) {
    const o = H.owner(id);
    if (!o) { $('#view').innerHTML = `<div class="card"><div class="empty"><h3>კონტაქტი ვერ მოიძებნა</h3><a class="btn btn-secondary" href="#/owners?tab=owners">კონტაქტების სია</a></div></div>`; return; }
    const apts = S.data.apartments.filter(a => a.owner_id === id);
    const approvals = S.data.approvals.filter(a => a.owner_id === id);
    const statements = S.data.statements.filter(s => apts.some(a => a.id === s.apartment_id));
    const ct = o.contact_type || 'owner';
    const isClient = ['buyer', 'renter'].includes(ct);

    $('#view').innerHTML = `
      <div class="page-head"><div><div class="crumbs"><a href="${contactsHref(ct)}">${CONTACT_PAGES[ct]?.title || 'კონტაქტები'}</a> ›</div><h1>${esc(o.name)}</h1><p class="page-sub">${R.contactBadge(ct)} · ${apts.length} ობიექტი</p></div>
        <div class="page-actions"><button type="button" class="btn btn-secondary" id="ow-appr">თანხმობის მოთხოვნა</button><button type="button" class="btn btn-ghost" id="ow-edit">რედაქტირება</button></div></div>
      ${o.is_flagged ? `<div class="notice notice-danger" id="ow-flag-banner" style="margin-bottom:16px">${icon('alert', 16)}<div><strong>არასანდო / პრობლემური კლიენტი</strong>${o.flag_note ? `<br>${esc(o.flag_note)}` : ''}${o.flagged_by_name ? `<br><span class="small">მონიშნა: ${esc(o.flagged_by_name)}${o.flagged_at ? ' · ' + esc(R.date(o.flagged_at)) : ''}</span>` : ''}</div></div>` : ''}
      <div class="cols"><div class="stack">
        <section class="card"><div class="card-head"><h2>მიბმული ობიექტები</h2></div>${apts.length ? `<div class="rows">${apts.map(a => `<a class="row" href="#/apartments/${a.id}" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(a.name)}</strong><span>${esc(a.address || '')}</span></span>${R.badge(L.aptStatus[a.status], L.aptStatusTone[a.status])}</a>`).join('')}</div>` : App.emptyInline('ობიექტი არ არის მიბმული.')}</section>
        <section class="card"><div class="card-head"><h2>თანხმობები</h2></div>${approvals.length ? `<div class="rows">${approvals.map(a => `<div class="row" style="--cols:minmax(0,1fr) auto"><span class="cell-main"><strong>${esc(a.title || a.description || 'ხარჯი')} · ${money(a.amount)}</strong><span>${esc(H.aptName(a.apartment_id))} · ${esc(R.date(a.created_at))}${a.response_note ? ' · „' + esc(a.response_note) + '“' : ''}</span></span>${R.approvalBadge(a)}</div>`).join('')}</div>` : App.emptyInline('თანხმობის მოთხოვნა ჯერ არ ყოფილა.')}</section>
        <section class="card"><div class="card-head"><h2>ამონაწერები</h2></div>${statements.length ? `<div class="rows">${statements.map(s => `<a class="row" href="#/finance/statement/${s.id}" style="--cols:minmax(0,1fr) auto auto"><span class="cell-main"><strong>${esc(H.aptName(s.apartment_id))} · ${esc(monthLabel(s.month_period))}</strong><span>წმინდა ${money(s.net_result)}</span></span>${R.badge(L.statement[s.status], L.statementTone[s.status])}</a>`).join('')}</div>` : App.emptyInline('ამონაწერი ჯერ არ მომზადებულა. მოამზადე „ფინანსებში“.')}</section>
      </div><div class="stack">
        <section class="card"><div class="card-head"><h2>პროფილი და მოთხოვნები</h2></div><div class="card-body"><dl class="kv">
          <dt>ტიპი</dt><dd>${R.contactBadge(ct)}</dd>
          <dt>ტელეფონი</dt><dd>${o.phone ? `<a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>` : '–'}</dd>
          <dt>ელფოსტა</dt><dd>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '–'}</dd>
          ${o.personal_id ? `<dt>პირადი ნომერი</dt><dd>${esc(o.personal_id)}</dd>` : ''}
          ${o.budget_max ? `<dt>ბიუჯეტი</dt><dd class="strong t-ok">${esc(budgetText(o))}</dd>` : ''}
          ${o.preferred_city || o.preferred_district ? `<dt>სასურველი ლოკაცია</dt><dd>${esc([o.preferred_city, o.preferred_district].filter(Boolean).join(', '))}</dd>` : ''}
          ${o.lead_source ? `<dt>წყარო</dt><dd>${esc(L.leadSource[o.lead_source] || o.lead_source)}</dd>` : ''}
          ${o.follow_up_date ? `<dt>შემდეგი დაკავშირების თარიღი</dt><dd>${esc(R.date(o.follow_up_date))}</dd>` : ''}
          ${o.payout_account ? `<dt>ანგარიში</dt><dd>${esc(o.payout_account)}</dd>` : ''}
          ${reqText(o) ? `<dt>მოთხოვნები</dt><dd style="white-space:pre-wrap">${esc(reqText(o))}</dd>` : ''}
          ${o.notes ? `<dt>შიდა შენიშვნა</dt><dd style="white-space:pre-wrap">${esc(o.notes)}</dd>` : ''}</dl></div></section>
      </div></div>`;
    $('#ow-edit').onclick = () => openOwnerForm(o);
    $('#ow-appr').onclick = () => App.openApprovalForm({ apartmentId: apts[0]?.id });
  }
  const monthLabel = (mk) => { const [y, m] = String(mk).split('-').map(Number); return `${R.MONTHS[m - 1]} ${y}`; };
  App.monthLabel = monthLabel;

  // requirements is stored as text; older rows may hold an empty object.
  const reqText = (o) => (typeof o?.requirements === 'string' ? o.requirements : '');

  function openOwnerForm(o = null, defaults = {}) {
    const edit = Boolean(o);
    const id = o?.id || R.uuid();
    const ct = o?.contact_type || defaults.contact_type || 'owner';
    return R.dialog({
      title: edit ? 'კონტაქტის რედაქტირება' : (CONTACT_PAGES[ct] ? `ახალი ${CONTACT_PAGES[ct].one}` : 'ახალი კონტაქტი'), submitLabel: edit ? 'შენახვა' : 'დამატება',
      wide: true,
      body: `<div class="form-grid">
        <label class="field"><span class="field-label">კონტაქტის ტიპი</span>
          <select name="contact_type" id="ow-contact-type">
            <option value="owner" ${ct === 'owner' ? 'selected' : ''}>მეპატრონე (მესაკუთრე)</option>
            <option value="seller" ${ct === 'seller' ? 'selected' : ''}>გამყიდველი</option>
            <option value="buyer" ${ct === 'buyer' ? 'selected' : ''}>მყიდველი</option>
            <option value="renter" ${ct === 'renter' ? 'selected' : ''}>მდგმური</option>
            <option value="other" ${ct === 'other' ? 'selected' : ''}>სხვა კონტაქტი</option>
          </select>
        </label>
        <label class="field"><span class="field-label">სახელი და გვარი</span><input name="name" required value="${esc(o?.name || '')}" data-error="ჩაწერე სახელი." placeholder="მაგ.: დავით მამულაშვილი" /></label>
        <label class="field"><span class="field-label">ტელეფონი</span><input name="phone" type="tel" value="${esc(o?.phone || '')}" placeholder="+995 5XX XX XX XX" /></label>
        <div class="span-2" id="ow-dup" hidden></div>
        <label class="field"><span class="field-label">პირადი ნომერი</span><input name="personal_id" value="${esc(o?.personal_id || '')}" inputmode="numeric" maxlength="20" autocomplete="off" /><span class="field-hint">ავტომატურად ჩაჯდება ხელშეკრულებებში</span></label>
        <label class="field"><span class="field-label">ელფოსტა</span><input name="email" type="email" value="${esc(o?.email || '')}" data-error="ელფოსტის ფორმატი არასწორია." /></label>
        
        <div class="form-section span-2" id="ow-pref-section" style="background:var(--surface-2);padding:12px;border-radius:var(--r);border:1px solid var(--line)">
          <div class="form-section-title" style="margin-bottom:8px;font-weight:700">კლიენტის მოთხოვნები და ბიუჯეტი</div>
          <div class="form-grid">
            <label class="field"><span class="field-label">მინიმალური ბიუჯეტი</span><input type="number" name="budget_min" min="0" step="100" value="${esc(o?.budget_min || '')}" placeholder="50000" /></label>
            <label class="field"><span class="field-label">მაქსიმალური ბიუჯეტი</span>
              <div style="display:grid;grid-template-columns:1fr 85px;gap:6px">
                <input type="number" name="budget_max" min="0" step="100" value="${esc(o?.budget_max || '')}" placeholder="120000" />
                <select name="budget_currency"><option value="USD" ${(o?.budget_currency || 'USD') === 'USD' ? 'selected' : ''}>USD ($)</option><option value="GEL" ${(o?.budget_currency) === 'GEL' ? 'selected' : ''}>GEL (₾)</option></select>
              </div>
            </label>
            <label class="field"><span class="field-label">სასურველი ქალაქი</span><input name="preferred_city" value="${esc(o?.preferred_city || '')}" list="city-list" placeholder="თბილისი / ბათუმი" /></label>
            <label class="field"><span class="field-label">სასურველი უბანი</span><input name="preferred_district" value="${esc(o?.preferred_district || '')}" list="district-list" placeholder="ვაკე, საბურთალო..." /></label>
            <label class="field span-2"><span class="field-label">დეტალური მოთხოვნები</span><textarea name="requirements" rows="2" placeholder="მაგ.: 2 საძინებელი, აივნით, ახალ კორპუსში, პარკინგით">${esc(reqText(o))}</textarea></label>
          </div>
        </div>

        <label class="field"><span class="field-label">ლიდის / კონტაქტის წყარო</span>
          <select name="lead_source">
            ${Object.entries(L.leadSource).map(([k, l]) => `<option value="${k}" ${(o?.lead_source || 'direct') === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span class="field-label">შემდეგი დაკავშირების თარიღი</span><input type="date" name="follow_up_date" value="${esc(o?.follow_up_date || '')}" /></label>
        <label class="field span-2"><span class="field-label">საბანკო ანგარიში (მესაკუთრისთვის)</span><input name="payout_account" value="${esc(o?.payout_account || '')}" placeholder="GE00TB0000000000000000" /></label>
        <label class="field span-2"><span class="field-label">შიდა შენიშვნა</span><textarea name="notes" rows="2">${esc(o?.notes || '')}</textarea></label>
        <div class="form-section span-2">
          <label class="check"><input type="checkbox" name="is_flagged" id="ow-flag" ${o?.is_flagged ? 'checked' : ''} /> <span><strong>არასანდო / პრობლემური კლიენტი</strong><br><span class="small muted">გუნდის ყველა წევრი დაინახავს გაფრთხილებას, როცა ამ ნომერს შეიყვანს ან მოძებნის.</span></span></label>
          <label class="field" id="ow-flag-note" hidden style="margin-top:10px"><span class="field-label">რა მოხდა</span><textarea name="flag_note" rows="2" placeholder="მაგ.: ჩვენების შემდეგ სცადა მეპატრონესთან პირდაპირ დაკავშირება; არ იხდის საკომისიოს">${esc(o?.flag_note || '')}</textarea></label>
        </div>
      </div>`,
      onOpen: (form) => {
        const phoneInput = $('input[name=phone]', form);
        const dupBox = $('#ow-dup', form);
        const flag = $('#ow-flag', form);
        const checkPhone = () => {
          const dup = H.contactByPhone(phoneInput.value, edit ? o.id : null);
          dupBox.hidden = !dup;
          dupBox.innerHTML = dup ? `<div class="notice ${dup.is_flagged ? 'notice-danger' : 'notice-warn'}" id="ow-dup-banner">${icon('alert', 16)}<div><strong>${dup.is_flagged ? 'არასანდო კლიენტი!' : 'ეს ნომერი უკვე ბაზაშია.'}</strong> ${esc(dup.name)} · ${esc(L.contactType[dup.contact_type || 'owner'])} · დამატებულია: ${esc(R.date(dup.created_at))}${dup.is_flagged && dup.flag_note ? `<br>${esc(dup.flag_note)}` : ''}</div></div>` : '';
        };
        const syncFlag = () => { $('#ow-flag-note', form).hidden = !flag.checked; };
        phoneInput.addEventListener('input', checkPhone);
        flag.addEventListener('change', syncFlag);
        checkPhone(); syncFlag();
      },
      onSubmit: async (form, v) => {
        const flagged = $('#ow-flag', form).checked;
        const payload = {
          name: v.name.trim(),
          contact_type: v.contact_type || 'owner',
          phone: v.phone.trim() || null,
          email: v.email.trim() || null,
          personal_id: v.personal_id?.trim() || null,
          budget_min: v.budget_min ? Number(v.budget_min) : null,
          budget_max: v.budget_max ? Number(v.budget_max) : null,
          budget_currency: v.budget_currency || 'USD',
          preferred_city: v.preferred_city?.trim() || null,
          preferred_district: v.preferred_district?.trim() || null,
          requirements: v.requirements?.trim() || null,
          lead_source: v.lead_source || 'direct',
          follow_up_date: v.follow_up_date || null,
          payout_account: v.payout_account.trim() || null,
          notes: v.notes.trim() || null,
          is_flagged: flagged,
          flag_note: flagged ? (v.flag_note?.trim() || null) : null,
          flagged_at: flagged ? (o?.is_flagged && o.flagged_at ? o.flagged_at : new Date().toISOString()) : null,
          flagged_by_name: flagged ? (o?.is_flagged && o.flagged_by_name ? o.flagged_by_name : (S.member?.display_name || S.user.email)) : null,
        };
        const row = edit ? await q(sb.from('owners').update(payload).eq('id', o.id).select().single()) : await App.insertOnce('owners', { id, organization_id: S.org.id, assigned_to: S.member?.id || null, ...payload });
        App.upsertLocal('owners', row);
        App.render();
        toast(edit ? 'კონტაქტი განახლდა' : `კონტაქტი დაემატა: ${row.name}`, { type: 'success' });
      },
    });
  }
  App.openOwnerForm = openOwnerForm;

  // ===========================================================================
  // APPROVAL REQUEST
  // ===========================================================================
  // Creates the approval and its "proposed" expense. Both use stable ids so a retry never duplicates.
  App.createApproval = async ({ id, expenseId, apt, task = null, title, description, amount, category, photoUrl }) => {
    const appr = await App.insertOnce('approvals', {
      id, organization_id: S.org.id, apartment_id: apt.id, owner_id: apt.owner_id, task_id: task?.id || null,
      title, description: [title, description].filter(Boolean).join('\n'), amount, photos: photoUrl ? [photoUrl] : [],
    });
    App.upsertLocal('approvals', appr);
    const exp = await App.insertOnce('expenses', {
      id: expenseId, organization_id: S.org.id, apartment_id: apt.id, task_id: task?.id || null, approval_id: appr.id,
      category, amount, description: title, expense_date: R.isoDate(), status: 'proposed', created_by: S.user.id,
    });
    App.upsertLocal('expenses', exp);
    App.logEvent(apt.id, 'approval_requested', `თანხმობის მოთხოვნა: ${title}`, money(amount), { task_id: task?.id, approval_id: appr.id });
    if (task && task.status !== 'blocked' && ['assigned', 'in_progress'].includes(task.status)) {
      const t = await q(sb.from('tasks').update({ status: 'blocked', blocked_reason: 'მფლობელის თანხმობას ველოდებით' }).eq('id', task.id).select().single()).catch(() => null);
      if (t) App.upsertLocal('tasks', t);
    }
    toast(`თანხმობის მოთხოვნა შეიქმნა · ${money(amount)}`, { type: 'success', action: { label: navigator.share ? 'გაზიარება' : 'ბმულის კოპირება', fn: () => App.shareApproval(appr) } });
    return appr;
  };

  App.openApprovalForm = ({ apartmentId = null, task = null }) => {
    const ids = { approval: R.uuid(), expense: R.uuid() };
    return R.dialog({
      title: 'მფლობელის თანხმობის მოთხოვნა', submitLabel: 'მოთხოვნის შექმნა',
      subtitle: 'მფლობელი მიიღებს ბმულს და ტელეფონიდან დაადასტურებს ან უარყოფს. ხარჯი დადასტურებამდე „შეთავაზებულად“ დარჩება.',
      body: `<div class="form-stack">
        ${App.pickerHtml('apartment_id', 'ბინა')}
        <p class="field-hint" data-owner></p>
        <label class="field"><span class="field-label">რა საჭიროებს თანხმობას</span><input name="title" required maxlength="140" value="${esc(task?.title || '')}" placeholder="მაგ.: კონდიციონერის კომპრესორის გამოცვლა" data-error="აღწერე საკითხი." /></label>
        <label class="field"><span class="field-label">თანხა (₾)</span><input type="number" name="amount" required min="0.01" step="0.01" inputmode="decimal" data-error="ჩაწერე თანხა." /></label>
        <label class="field"><span class="field-label">განმარტება მფლობელისთვის</span><textarea name="description" rows="3" placeholder="რა მოხდა, რატომ არის საჭირო, ვინ შეასრულებს">${esc(task?.description || '')}</textarea><span class="field-hint">ეს ტექსტი გამოჩნდება მფლობელის გვერდზე. ნუ ჩაწერ კარის კოდს ან შიდა შენიშვნებს.</span></label>
        <label class="field"><span class="field-label">კატეგორია</span><select name="category">${['repair', 'maintenance', 'supplies', 'cleaning', 'other'].map(c => `<option value="${c}">${L.expenseCategory[c]}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">ფოტო <span class="muted">(არასავალდებულო)</span></span><input type="file" name="photo" accept="image/*" /></label>
      </div>`,
      onOpen: (form) => {
        App.picker(form, 'apartment_id', App.aptItems(), apartmentId);
        const sync = () => {
          const apt = H.apt(form.apartment_id.value);
          const owner = apt && H.owner(apt.owner_id);
          const p = $('[data-owner]', form);
          p.textContent = !apt ? '' : owner ? `მფლობელი: ${owner.name}${owner.phone ? ' · ' + owner.phone : ''}` : 'ამ ბინას მფლობელი არ ჰყავს მითითებული. ჯერ მიუთითე მფლობელი ბინის რედაქტირებით.';
          p.className = 'field-hint' + (apt && !owner ? ' t-danger' : '');
        };
        form.apartment_id.addEventListener('change', sync);
        sync();
      },
      onSubmit: async (form, v) => {
        const apt = H.apt(v.apartment_id);
        if (!apt) throw new Error('აირჩიე ბინა სიიდან.');
        if (!apt.owner_id) throw new Error('ამ ბინას მფლობელი არ ჰყავს მითითებული.');
        if (!form.dataset.photoUrl && form.photo.files[0]) form.dataset.photoUrl = await R.uploadFile(S.org.id, `approvals/${ids.approval}`, form.photo.files[0]);
        await App.createApproval({ id: ids.approval, expenseId: ids.expense, apt, task, title: v.title.trim(), description: v.description.trim(), amount: Number(v.amount), category: v.category, photoUrl: form.dataset.photoUrl || null });
        App.render();
        return true;
      },
    });
  };
})();
