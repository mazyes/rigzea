// Shared form helpers for the site fillers. Works with React/Next forms by using native setters + events.
window.RigzeaFill = (() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  async function waitFor(fn, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(250); }
    return null;
  }

  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Finds an input/textarea/select by its label text, placeholder, name or aria-label.
  function field(re) {
    for (const el of document.querySelectorAll('input, textarea, select')) {
      if (el.type === 'hidden' || el.type === 'file') continue;
      const lab = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const wrap = el.closest('label') || el.parentElement;
      const text = [lab?.textContent, wrap?.textContent?.slice(0, 80), el.placeholder, el.name, el.getAttribute('aria-label')].join(' ');
      if (re.test(text)) return el;
    }
    return null;
  }

  function clickText(re, scope = document) {
    const b = [...scope.querySelectorAll('button, [role="button"], a, label, li, [role="option"]')].find(x => re.test(norm(x.textContent)) && x.offsetParent);
    b?.click();
    return !!b;
  }

  // Clicks the visible element whose own text is exactly `text` (tiles on ss.ge are plain divs).
  function clickExact(text, scope = document) {
    const el = [...scope.querySelectorAll('div, span, button, label, p')]
      .find(x => x.children.length === 0 && norm(x.textContent) === norm(text) && x.offsetParent);
    el?.click();
    return !!el;
  }

  // myhome.ge: input/radio ids are random (React useId) but every control has a <label for>, so match by label text.
  function byLabel(text, value) {
    const lab = [...document.querySelectorAll('label[for]')].find(l => norm(l.textContent).replace(/\s*\*$/, '') === norm(text));
    const el = lab && document.getElementById(lab.htmlFor);
    if (!el || value === null || value === undefined || value === '') return false;
    setValue(el, value);
    return true;
  }

  // Clicks option `option` inside the group titled `heading` (e.g. rooms "3" vs bedrooms "3").
  function clickInGroup(heading, option) {
    const head = [...document.querySelectorAll('div, span, p, h3, h4')].find(x => x.children.length === 0 && norm(x.textContent).replace(/\s*\*$/, '') === norm(heading));
    for (let p = head?.parentElement, i = 0; p && i < 4; p = p.parentElement, i++) {
      const lab = [...p.querySelectorAll('label[for]')].find(l => norm(l.textContent) === norm(option));
      if (lab) { lab.click(); return true; }
    }
    return false;
  }

  // Fills an input by its name attribute (stable on ss.ge).
  function byName(name, value) {
    const el = document.querySelector(`input[name="${name}"], textarea[name="${name}"]`);
    if (!el || value === null || value === undefined || value === '') return false;
    setValue(el, value);
    return true;
  }

  // Types into a react-select input and picks the first option.
  async function pickSelect(inputId, text) {
    const input = document.getElementById(inputId);
    if (!input || !text) return false;
    input.focus();
    setValue(input, text);
    const opt = await waitFor(() => document.querySelector('[class*="option"], [id*="-option-"]'), 4000);
    opt?.click();
    return !!opt;
  }

  async function fillText(re, value) {
    if (value === null || value === undefined || value === '') return false;
    const el = field(re);
    if (!el) return false;
    setValue(el, value);
    return true;
  }

  async function attachPhotos(urls) {
    const input = document.querySelector('input[type="file"][multiple], input[type="file"]');
    if (!input || !urls.length) return false;
    const dt = new DataTransfer();
    for (const [i, url] of urls.slice(0, 30).entries()) {
      try {
        const blob = await (await fetch(url)).blob();
        dt.items.add(new File([blob], `photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }));
      } catch { /* skip a photo that fails to load */ }
    }
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return dt.files.length > 0;
  }

  // Stops automation when the site needs a human: login, captcha or payment.
  function needsHuman() {
    if (document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [data-sitekey]')) return 'კაპჩა';
    if (document.querySelector('input[type="password"]')) return 'შესვლა';
    return '';
  }

  function banner(text, kind = 'info') {
    let b = document.getElementById('rigzea-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'rigzea-banner';
      b.style.cssText = 'position:fixed;z-index:2147483647;top:12px;right:12px;max-width:360px;padding:12px 14px;border-radius:10px;font:14px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25)';
      document.body.appendChild(b);
    }
    b.style.background = kind === 'error' ? '#b42318' : kind === 'ok' ? '#067647' : '#1d2939';
    b.textContent = text;
  }

  // Runs a job saved by the background script for this site (target "ss" or "myhome").
  async function run(target, fillFn) {
    const key = `job:${target}`;
    const stored = (await chrome.storage.session.get(key))[key];
    if (!stored || Date.now() - stored.at > 10 * 60 * 1000) return;
    banner('Rigzea: ველების შევსება მიმდინარეობს…');
    const human = needsHuman();
    if (human) { banner(`Rigzea: საჭიროა შენი ჩარევა (${human}). შესვლის შემდეგ ხელახლა დააჭირე ღილაკს რიგზეაში.`, 'error'); return; }
    try {
      const res = await fillFn(stored.listing);
      await chrome.storage.session.remove(key);
      banner(res?.submitted ? 'Rigzea: განცხადება გამოქვეყნდა.' : `Rigzea: ${res?.note || 'შევსებულია, გადაამოწმე და გამოაქვეყნე.'}`, res?.submitted ? 'ok' : 'info');
    } catch (err) {
      banner(`Rigzea: შეცდომა. ${err.message}`, 'error');
    }
  }

  return { sleep, norm, waitFor, setValue, field, clickText, clickExact, byName, byLabel, clickInGroup, pickSelect, fillText, attachPhotos, needsHuman, banner, run };
})();
