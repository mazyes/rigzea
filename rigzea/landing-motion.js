/* Rigzea landing motion: one-time entrances that show the product working.
   Native Web Animations + CSS only. Everything is visible by default; html.lx-motion is added
   only when motion is allowed, and every effect plays once. */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const small = window.matchMedia('(max-width: 700px)').matches;
  const T = small ? 0.75 : 1; // shorter on phones
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

  // 7. Scroll progress line (orientation, not decoration: runs even with reduced motion)
  const bar = document.createElement('div');
  bar.className = 'lx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let ticking = false;
  const paint = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
  paint();

  // 6. FAQ answers slide open and closed (instant with reduced motion)
  document.querySelectorAll('.lx-faq-item').forEach((item) => {
    const summary = item.querySelector('summary');
    const body = item.querySelector('.lx-faq-answer');
    if (!summary || !body || reduce) return;
    let anim = null;
    summary.addEventListener('click', (e) => {
      e.preventDefault();
      if (anim) anim.cancel();
      const opening = !item.open;
      if (opening) item.open = true;
      const h = body.scrollHeight;
      anim = body.animate(
        opening ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }] : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 280 * T, easing: EASE }
      );
      anim.onfinish = () => { anim = null; if (!opening) item.open = false; };
    });
  });

  // Phones: swipe carousels get dots that follow the snapped card; tapping a dot scrolls to it
  const phone = window.matchMedia('(max-width: 700px)');
  document.querySelectorAll('.lx-dots[data-dots-for]').forEach((dots) => {
    const track = document.getElementById(dots.dataset.dotsFor);
    if (!track) return;
    const items = [...track.children];
    const go = (it, smooth) => track.scrollTo({ left: it.offsetLeft - items[0].offsetLeft, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1;
      b.addEventListener('click', () => go(it, true));
      dots.appendChild(b);
    });
    const setActive = (i) => [...dots.children].forEach((b, k) => b.classList.toggle('is-active', k === i));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(items.indexOf(e.target)); }), { root: track, threshold: 0.6 });
    items.forEach((it) => io.observe(it));
    // pricing opens on the most popular plan
    const start = Math.max(0, items.findIndex((it) => it.classList.contains('featured')));
    setActive(start);
    if (start && phone.matches) requestAnimationFrame(() => go(items[start], false));
  });

  // Phones: old way vs Rigzea as a segmented control; moves to the Rigzea side once on its own
  const seg = document.querySelector('.lx-cmp-seg');
  const cmpGrid = document.querySelector('.lx-comparison-grid');
  if (seg && cmpGrid) {
    let touched = false;
    const show = (k) => {
      cmpGrid.dataset.cmpShow = k;
      seg.querySelectorAll('button[data-cmp]').forEach((b) => { const on = b.dataset.cmp === k; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on)); });
      if (!reduce && cmpGrid.classList.contains('is-in')) { cmpGrid.classList.remove('is-in'); requestAnimationFrame(() => requestAnimationFrame(() => cmpGrid.classList.add('is-in'))); }
    };
    seg.addEventListener('click', (e) => { const b = e.target.closest('button[data-cmp]'); if (b) { touched = true; show(b.dataset.cmp); } });
    if (phone.matches) {
      const auto = new IntersectionObserver((es) => {
        if (!es[0].isIntersecting) return;
        auto.disconnect();
        setTimeout(() => { if (!touched) show('new'); }, 2600);
      }, { rootMargin: '0px 0px -30% 0px' });
      auto.observe(cmpGrid);
    }
  }

  // Phones: the Dynamic Island in the hero mockup turns into a live notification (tap the phone to replay)
  const island = document.querySelector('.lx-phone-island');
  if (island && phone.matches && !reduce) {
    const ic = island.querySelector('.lx-island-ic'), msg = island.querySelector('.lx-island-msg');
    const EYE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    const DOC = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="9 15 11 17 15 13"/></svg>';
    const steps = [[EYE, 'კლიენტმა გახსნა ბმული'], [DOC, 'ხელშეკრულება მზადაა']];
    let running = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const play = async () => {
      if (running) return; running = true;
      for (const [svg, text] of steps) {
        ic.innerHTML = svg; msg.textContent = text;
        island.classList.add('is-open'); await wait(2600);
        island.classList.remove('is-open'); await wait(900);
      }
      running = false;
    };
    setTimeout(play, 1700);
    const shot = document.querySelector('.lx-hero-shot');
    if (shot) shot.addEventListener('click', play);
  }

  if (reduce) return;
  root.classList.add('lx-motion');

  const countUp = (el, to, { from = 0, dur = 900, pad = 0, fmt } = {}) => {
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / (dur * T));
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4)));
      el.textContent = fmt ? fmt(v) : String(v).padStart(pad, '0');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Elements get .is-in once when they first come into view
  const once = (els, fn, margin = '0px 0px -12% 0px') => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); en.target.classList.add('is-in'); if (fn) fn(en.target); } });
    }, { rootMargin: margin });
    els.forEach((el) => el && io.observe(el));
  };

  // 1. Hero: copy, then the product window rises and settles (CSS keyframes, on load)
  root.classList.add('lx-hero-play');

  // 2. Steps appear in order; each numeral counts up as it lands
  const steps = [...document.querySelectorAll('.lx-steps-grid-3 > .lx-step-card')];
  steps.forEach((s, i) => s.style.setProperty('--i', i));
  once([document.querySelector('.lx-steps-grid-3')], () => {
    steps.forEach((s, i) => {
      const n = s.querySelector('.lx-step-num-badge');
      if (n) setTimeout(() => countUp(n, i + 1, { pad: 2, dur: 500 }), i * 140 * T);
    });
  });

  // 3. Feature demos play once: link fills in, result lands; match score counts; clauses write in; post writes in
  const bento = [...document.querySelectorAll('#features-grid > *')];
  once(bento, (card) => {
    const chip = card.querySelector('#match-score-display');
    if (chip) {
      const m = chip.textContent.match(/^(\d+)(.*)$/s);
      if (m) countUp(chip, +m[1], { dur: 1100, fmt: (v) => v + m[2] });
    }
  });

  // 4. Old way crosses itself out, then the Rigzea way checks itself off
  const oldCard = document.querySelector('.lx-card-old-way');
  const newCard = document.querySelector('.lx-card-rigzea-way');
  [oldCard, newCard].forEach((c) => c && c.querySelectorAll('.lx-points-list li').forEach((li, i) => li.style.setProperty('--i', i)));
  once([document.querySelector('.lx-comparison-grid')]);

  // 8. Final call to action: an accent line draws itself under the heading
  once([document.querySelector('.lx-final-cta-box')]);

  // 5. Billing toggle rolls prices instead of jumping (used by landing-luxury.js)
  window.lxRollPrice = (el, text) => {
    const m = String(text).match(/^([\d.,]+)(.*)$/s);
    const num = (s) => parseFloat(String(s).replace(/,/g, '')); // commas are thousands separators
    const cur = num(el.textContent || '');
    if (!m || isNaN(cur)) { el.textContent = text; return; }
    const to = num(m[1]);
    const dec = (m[1].split('.')[1] || '').length;
    const fmt = (v) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const start = performance.now();
    const dur = 450 * T;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const v = cur + (to - cur) * (1 - Math.pow(1 - p, 4));
      el.textContent = (p < 1 ? fmt(v) : m[1]) + m[2];
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
})();
