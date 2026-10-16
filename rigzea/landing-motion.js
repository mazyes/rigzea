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
