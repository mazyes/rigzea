// Rigzea shared UI core: formatting, labels, icons, toasts, dialogs and safe actions.
// Used by /app/, /staff/ and /approve/. Requires /js/config.js (window.supabaseClient).
(() => {
  'use strict';

  const sb = window.supabaseClient;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------------------
  // Escaping & formatting
  // ---------------------------------------------------------------------------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
  const MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
  const WEEKDAYS = ['კვირა', 'ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი'];

  const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const money = (n) => {
    if (n === null || n === undefined || n === '' || isNaN(n)) return '—';
    const v = Number(n);
    return (v < 0 ? '−₾' : '₾') + numberFmt.format(Math.abs(v)).replace(/,/g, ' ');
  };

  const pad = (n) => String(n).padStart(2, '0');
  // Parse 'YYYY-MM-DD' as a local date (not UTC) so dates don't shift by timezone.
  const toDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };
  const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const time = (v) => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—'; };
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function date(v, { withYear = false } = {}) {
    const d = toDate(v);
    if (!d) return '—';
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${withYear || d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
  }

  function dayLabel(v) {
    const d = toDate(v);
    if (!d) return '—';
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return 'დღეს';
    if (sameDay(d, tomorrow)) return 'ხვალ';
    if (sameDay(d, yesterday)) return 'გუშინ';
    return date(d);
  }

  // "დღეს, 14:00" — for timestamps where time matters
  const dateTime = (v) => { const d = toDate(v); return d ? `${dayLabel(d)}, ${time(d)}` : '—'; };

  function duration(ms) {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return { n: Math.max(m, 1), unit: 'წუთ' };
    const h = Math.round(m / 60);
    if (h < 48) return { n: h, unit: 'საათ' };
    return { n: Math.round(h / 24), unit: 'დღ' };
  }

  // "3 საათის წინ" / "2 საათში"
  function relative(v) {
    const d = toDate(v);
    if (!d) return '—';
    const diff = d - Date.now();
    const { n, unit } = duration(diff);
    const forms = { 'წუთ': ['წუთის', 'წუთში'], 'საათ': ['საათის', 'საათში'], 'დღ': ['დღის', 'დღეში'] }[unit];
    return diff < 0 ? `${n} ${forms[0]} წინ` : `${n} ${forms[1]}`;
  }

  // "18 საათი" — elapsed amount in nominative-like form for "N საათია"
  function elapsed(v) {
    const d = toDate(v);
    if (!d) return '';
    const { n, unit } = duration(Date.now() - d);
    return `${n} ${{ 'წუთ': 'წუთია', 'საათ': 'საათია', 'დღ': 'დღეა' }[unit]}`;
  }

  // Amount of time between now and v in a given grammatical form:
  // 'nom' → "90 წუთი", 'instr' → "6 საათით"
  function span(v, form = 'nom') {
    const d = toDate(v);
    if (!d) return '';
    const { n, unit } = duration(d - Date.now());
    return `${n} ${{ nom: { 'წუთ': 'წუთი', 'საათ': 'საათი', 'დღ': 'დღე' }, instr: { 'წუთ': 'წუთით', 'საათ': 'საათით', 'დღ': 'დღით' } }[form][unit]}`;
  }

  // ---------------------------------------------------------------------------
  // Labels (single source of truth for user-facing status names)
  // ---------------------------------------------------------------------------
  const L = {
    taskStatus: { new: 'ახალი', assigned: 'დანიშნული', in_progress: 'პროცესშია', blocked: 'შეჩერებული', done: 'დასრულებული', cancelled: 'გაუქმებული' },
    taskStatusTone: { new: 'neutral', assigned: 'info', in_progress: 'warn', blocked: 'danger', done: 'ok', cancelled: 'muted' },
    taskType: { cleaning: 'დასუფთავება', repair: 'რემონტი', maintenance: 'ტექმომსახურება', inspection: 'ინსპექცია', payment: 'გადახდა', other: 'სხვა' },
    priority: { low: 'დაბალი', normal: 'ჩვეულებრივი', urgent: 'სასწრაფო' },
    approval: { pending: 'ელოდება პასუხს', approved: 'დადასტურებული', declined: 'უარყოფილი', cancelled: 'გაუქმებული', expired: 'ვადაგასული' },
    approvalTone: { pending: 'warn', approved: 'ok', declined: 'danger', cancelled: 'muted', expired: 'muted' },
    expense: { proposed: 'შეთავაზებული', approved: 'დადასტურებული', declined: 'უარყოფილი', incurred: 'გაწეული', paid: 'გადახდილი' },
    expenseTone: { proposed: 'warn', approved: 'info', declined: 'muted', incurred: 'neutral', paid: 'ok' },
    expenseCategory: { cleaning: 'დასუფთავება', repair: 'რემონტი', maintenance: 'ტექმომსახურება', utility: 'კომუნალური', supplies: 'სახარჯი მასალა', laundry: 'სამრეცხაო', other: 'სხვა' },
    aptStatus: { active: 'აქტიური', maintenance: 'რემონტზე', vacant: 'არააქტიური', archived: 'დაარქივებული' },
    aptStatusTone: { active: 'ok', maintenance: 'warn', vacant: 'neutral', archived: 'muted' },
    role: { owner: 'ანგარიშის მფლობელი', admin: 'ადმინისტრატორი', manager: 'მენეჯერი', staff: 'თანამშრომელი' },
    source: { airbnb: 'Airbnb', booking: 'Booking.com', direct: 'პირდაპირი', other: 'სხვა' },
    statement: { draft: 'მონახაზი', finalized: 'დასრულებული', sent: 'გაგზავნილი' },
    statementTone: { draft: 'neutral', finalized: 'ok', sent: 'ok' },
  };

  const badge = (text, tone = 'neutral') => `<span class="badge badge-${tone}">${esc(text)}</span>`;
  const taskBadge = (s) => badge(L.taskStatus[s] || s, L.taskStatusTone[s]);
  const approvalStatus = (a) => (a.status === 'pending' && a.expires_at && new Date(a.expires_at) < new Date()) ? 'expired' : a.status;
  const approvalBadge = (a) => { const s = approvalStatus(a); return badge(L.approval[s] || s, L.approvalTone[s]); };
  const expenseBadge = (s) => badge(L.expense[s] || s, L.expenseTone[s]);

  // ---------------------------------------------------------------------------
  // Icons (single stroke icon set, 24px grid)
  // ---------------------------------------------------------------------------
  const ICONS = {
    today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8 14h3v3H8z"/>',
    tasks: '<path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="1.5"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    owner: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h.01"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20v-.5A5.5 5.5 0 0 1 7.5 14h3a5.5 5.5 0 0 1 5.5 5.5v.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20v-.5a5.5 5.5 0 0 0-4-5.3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/>',
  };
  const icon = (name, size = 18) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ---------------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------------
  function friendlyError(err) {
    const msg = String(err?.message || err || '');
    if (/fetch|network|Load failed|NetworkError/i.test(msg)) return 'კავშირი ვერ დამყარდა. შეამოწმე ინტერნეტი და სცადე ხელახლა.';
    if (/row-level security|permission denied|42501/i.test(msg) || err?.code === '42501') return 'ამ მოქმედების უფლება არ გაქვს.';
    if (/JWT|session/i.test(msg)) return 'სესია ამოიწურა. შედი სისტემაში ხელახლა.';
    if (/violates check constraint/i.test(msg)) return 'მონაცემი ბაზის წესებს არ შეესაბამება. შეამოწმე ველები.';
    return msg || 'მოულოდნელი შეცდომა. სცადე ხელახლა.';
  }

  // Throws on Supabase { error } so callers can use try/catch uniformly.
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  function toast(message, { type = 'info', action = null, timeout } = {}) {
    let host = $('#toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${esc(message)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = action.label;
      b.onclick = () => { el.remove(); action.fn(); };
      el.appendChild(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'დახურვა');
    close.innerHTML = icon('close', 14);
    close.onclick = () => el.remove();
    el.appendChild(close);
    host.appendChild(el);
    setTimeout(() => el.remove(), timeout || (type === 'error' || action ? 8000 : 3500));
  }

  // Runs an async action from a button: blocks double submission, shows a busy
  // state, and reports failures with a retry action. Returns the result or undefined.
  async function run(btn, fn, { success, retry = true } = {}) {
    if (btn && btn.dataset.busy === '1') return undefined;
    if (btn) { btn.dataset.busy = '1'; btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true'); }
    try {
      const result = await fn();
      if (success) toast(success, { type: 'success' });
      return result;
    } catch (err) {
      console.error(err);
      toast(friendlyError(err), { type: 'error', action: retry ? { label: 'ხელახლა ცდა', fn: () => run(btn, fn, { success, retry }) } : null });
      return undefined;
    } finally {
      if (btn) { btn.dataset.busy = ''; btn.disabled = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); }
    }
  }

  // ---------------------------------------------------------------------------
  // Dialogs (native <dialog>: focus trap, Esc to close)
  // ---------------------------------------------------------------------------
  // opts: { title, subtitle, body (html), submitLabel, danger, wide, onOpen(form), onSubmit(form, values) }
  // onSubmit may throw: the dialog stays open, values are kept and the error is shown inline.
  function dialog(opts) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'dlg' + (opts.wide ? ' dlg-wide' : '');
      dlg.innerHTML = `
        <form method="dialog" class="dlg-form" novalidate>
          <header class="dlg-head">
            <div><h2>${esc(opts.title)}</h2>${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}</div>
            <button type="button" class="icon-btn" data-close aria-label="დახურვა">${icon('close')}</button>
          </header>
          <div class="dlg-body">
            <div class="form-error" role="alert" hidden></div>
            ${opts.body || ''}
          </div>
          ${opts.onSubmit ? `<footer class="dlg-foot">
            <button type="button" class="btn btn-ghost" data-close>გაუქმება</button>
            <button type="submit" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-submit>${esc(opts.submitLabel || 'შენახვა')}</button>
          </footer>` : ''}
        </form>`;
      document.body.appendChild(dlg);
      const form = $('form', dlg);
      const errBox = $('.form-error', dlg);
      let result;
      const close = () => { dlg.close(); };
      dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
      $$('[data-close]', dlg).forEach(b => b.addEventListener('click', close));
      dlg.addEventListener('cancel', (e) => { if ($('[data-submit]', dlg)?.dataset.busy === '1') e.preventDefault(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = $('[data-submit]', dlg);
        if (!btn || btn.dataset.busy === '1') return;
        errBox.hidden = true;
        // Native validation first, with Georgian messages
        const invalid = $$('input, select, textarea', form).find(el => !el.checkValidity());
        if (invalid) {
          errBox.textContent = invalid.dataset.error || 'შეავსე მონიშნული სავალდებულო ველები.';
          errBox.hidden = false;
          invalid.focus();
          return;
        }
        btn.dataset.busy = '1'; btn.disabled = true; btn.classList.add('is-busy');
        try {
          result = await opts.onSubmit(form, Object.fromEntries(new FormData(form).entries()));
          if (result === false) return; // handler asked to keep dialog open
          close();
        } catch (err) {
          console.error(err);
          errBox.textContent = friendlyError(err) + ' შეყვანილი მონაცემები შენახულია ამ ფორმაში.';
          errBox.hidden = false;
          errBox.scrollIntoView({ block: 'nearest' });
        } finally {
          btn.dataset.busy = ''; btn.disabled = false; btn.classList.remove('is-busy');
        }
      });
      dlg.showModal();
      opts.onOpen?.(form, dlg);
      const first = $('[autofocus], input:not([type=hidden]), select, textarea', form);
      first?.focus();
    });
  }

  function confirm({ title, message, confirmLabel = 'დადასტურება', danger = false }) {
    return dialog({ title, body: `<p class="dlg-text">${esc(message)}</p>`, submitLabel: confirmLabel, danger, onSubmit: async () => true }).then(Boolean);
  }

  // Asks for a required reason; resolves to the text or undefined if cancelled.
  function ask({ title, label, placeholder = '', submitLabel = 'შენახვა', required = true, danger = false }) {
    return dialog({
      title, danger, submitLabel,
      body: `<label class="field"><span class="field-label">${esc(label)}</span><textarea name="reason" rows="3" ${required ? 'required' : ''} data-error="მიუთითე მიზეზი." placeholder="${esc(placeholder)}"></textarea></label>`,
      onSubmit: async (_f, v) => v.reason.trim(),
    });
  }

  // ---------------------------------------------------------------------------
  // Files
  // ---------------------------------------------------------------------------
  async function uploadFile(orgId, folder, file) {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) throw new Error('ფაილი 10 მბ-ზე დიდია.');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await q(sb.storage.from('rigzea-files').upload(path, file, { cacheControl: '3600', upsert: false }));
    return sb.storage.from('rigzea-files').getPublicUrl(path).data.publicUrl;
  }

  async function copyText(text, okMsg = 'დაკოპირდა') {
    try { await navigator.clipboard.writeText(text); toast(okMsg, { type: 'success' }); }
    catch { window.prompt('დააკოპირე ბმული:', text); }
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------
  function applyTheme(t = localStorage.getItem('rigzea_theme') || 'system') {
    const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  applyTheme();

  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

  window.R = {
    sb, $, $$, esc, money, toDate, isoDate, monthKey, time, date, dayLabel, dateTime, relative, elapsed, span, sameDay,
    MONTHS, WEEKDAYS, L, badge, taskBadge, approvalStatus, approvalBadge, expenseBadge, icon,
    friendlyError, q, toast, run, dialog, confirm, ask, uploadFile, copyText, applyTheme, uuid,
  };
})();
