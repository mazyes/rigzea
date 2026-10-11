/**
 * RIGZEA 3.0 — LUXURY MOTION & INTERACTION ENGINE
 * 60fps Hardware-Accelerated Scroll Choreography, Bento Motion, & Reactive UI
 * Inspired by scroll-world and Apple product showcases
 */

(() => {
  'use strict';

  // System capability & accessibility detection
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // =========================================================================
  // 1. UNIFIED 60FPS LERP SCROLL SCRUBBER & HEADER CHOREOGRAPHY
  // =========================================================================
  const header = document.querySelector('.lx-header');
  const mobileToggle = document.querySelector('.lx-mobile-toggle');
  const navLinks = document.querySelector('.lx-nav-links');

  let headerScrolled = false;

  function updateHeader(y) {
    if (!header) return;
    const shouldScroll = y > 40;
    if (shouldScroll !== headerScrolled) {
      headerScrolled = shouldScroll;
      header.classList.toggle('scrolled', shouldScroll);
    }
  }

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      mobileToggle.textContent = isOpen ? '✕' : '☰';
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        if (mobileToggle) {
          mobileToggle.textContent = '☰';
          mobileToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  // =========================================================================
  // 2. RADIAL MOUSE SPOTLIGHT (PERFORMANCE-TUNED WITH rAF THROTTLE)
  // =========================================================================
  const cards = document.querySelectorAll('.lx-spotlight-card, .lx-bento-card, .lx-pricing-card, .lx-card-rigzea-way');

  cards.forEach(card => {
    let rect = null;
    let rAFId = null;

    card.addEventListener('pointerenter', () => {
      rect = card.getBoundingClientRect();
    });

    card.addEventListener('pointermove', (e) => {
      if (!rect) rect = card.getBoundingClientRect();
      const clientX = e.clientX;
      const clientY = e.clientY;

      if (rAFId) cancelAnimationFrame(rAFId);
      rAFId = requestAnimationFrame(() => {
        if (!rect) return;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x.toFixed(1)}px`);
        card.style.setProperty('--mouse-y', `${y.toFixed(1)}px`);
        rAFId = null;
      });
    });

    card.addEventListener('pointerleave', () => {
      rect = null;
      if (rAFId) {
        cancelAnimationFrame(rAFId);
        rAFId = null;
      }
    });
  });

  // =========================================================================
  // 3. HORIZONTAL PIN-SCROLL CHOREOGRAPHY (BENTO SHOWCASE)
  //    60fps LERP Scrubber with linear interpolation & smooth camera gliding
  // =========================================================================
  const pinWrap = document.querySelector('.lx-pin-scroll-wrap');
  const horizontalViewport = document.querySelector('.lx-horizontal-viewport');
  const horizontalTrack = document.querySelector('.lx-horizontal-track');
  const progressBarFill = document.querySelector('.lx-pin-progress-bar-fill');
  const stepCounter = document.querySelector('.lx-pin-step-counter');
  const bentoCards = document.querySelectorAll('.lx-horizontal-track .lx-bento-card');
  const pinDots = document.querySelectorAll('.lx-pin-dot');

  // Cached layout metrics to avoid layout thrashing during scroll
  let isMobileMode = window.innerWidth <= 900;
  let laidOutW = window.innerWidth;
  let wrapTop = 0;
  let scrollDistance = 0;
  let maxHorizontalScroll = 0;

  // LERP interpolation state
  let targetProgress = 0;
  let currentProgress = 0;
  let currentTranslateX = 0;
  let isLoopActive = false;
  let activeStep = 0;

  const LERP_FACTOR = prefersReducedMotion ? 1.0 : 0.10;

  function measureLayout() {
    laidOutW = window.innerWidth;
    isMobileMode = laidOutW <= 900;

    if (!pinWrap || !horizontalTrack) return;

    if (isMobileMode) {
      // Clear desktop inline transforms on mobile for native momentum scrolling
      horizontalTrack.style.transform = '';
      bentoCards.forEach(c => {
        c.style.transform = '';
        c.style.opacity = '';
      });
      syncMobileState();
      return;
    }

    const rect = pinWrap.getBoundingClientRect();
    const currentY = window.scrollY || window.pageYOffset;
    wrapTop = rect.top + currentY;
    const wrapHeight = pinWrap.offsetHeight;
    const windowHeight = window.innerHeight;

    scrollDistance = Math.max(1, wrapHeight - windowHeight);
    const trackWidth = horizontalTrack.scrollWidth;
    maxHorizontalScroll = Math.max(0, trackWidth - laidOutW + 80);

    // Compute targetProgress from current scroll position
    const pastTop = currentY - wrapTop;
    targetProgress = Math.max(0, Math.min(1, pastTop / scrollDistance));

    if (prefersReducedMotion) {
      currentProgress = targetProgress;
    }

    renderScrubFrame(true);
  }

  function renderScrubFrame(force = false) {
    if (isMobileMode || !horizontalTrack) return;

    // Apply smooth hardware-accelerated glide
    currentTranslateX = currentProgress * maxHorizontalScroll;
    horizontalTrack.style.transform = `translate3d(-${currentTranslateX.toFixed(2)}px, 0, 0)`;

    // Update GPU-accelerated progress bar fill via transform: scaleX
    if (progressBarFill) {
      const scale = 0.2 + currentProgress * 0.8;
      progressBarFill.style.transform = `scaleX(${scale.toFixed(4)})`;
    }

    // Determine nearest active feature (0 to 4)
    const nearest = Math.min(4, Math.max(0, Math.round(currentProgress * 4)));
    if (nearest !== activeStep || force) {
      activeStep = nearest;
      if (stepCounter) {
        stepCounter.textContent = `0${activeStep + 1} / 05`;
      }
      pinDots.forEach((dot, k) => {
        dot.classList.toggle('active', k === activeStep);
      });
    }

    // Authored focal depth: active feature shines in the center spotlight
    if (!prefersReducedMotion && bentoCards.length) {
      bentoCards.forEach((card, i) => {
        const cardCenterProgress = i / 4;
        const dist = Math.abs(currentProgress - cardCenterProgress);
        // Normalize focal radius: 1 at dead center, 0 at dist >= 0.28
        const rawFocus = Math.max(0, 1 - dist / 0.28);
        const smoothFocus = rawFocus * rawFocus * (3 - 2 * rawFocus);

        const scale = (0.975 + 0.025 * smoothFocus).toFixed(4);
        const opacity = (0.70 + 0.30 * smoothFocus).toFixed(3);

        card.style.transform = `scale(${scale})`;
        card.style.opacity = opacity;
        card.classList.toggle('is-active-feature', smoothFocus > 0.65);
      });
    }
  }

  function scrubTick() {
    if (isMobileMode) {
      isLoopActive = false;
      return;
    }

    const delta = targetProgress - currentProgress;

    if (Math.abs(delta) > 0.0003) {
      currentProgress += delta * LERP_FACTOR;
      renderScrubFrame();
      requestAnimationFrame(scrubTick);
    } else {
      currentProgress = targetProgress;
      renderScrubFrame();
      isLoopActive = false;
    }
  }

  function wakeScrubLoop() {
    if (!isLoopActive && !isMobileMode) {
      isLoopActive = true;
      requestAnimationFrame(scrubTick);
    }
  }

  // Unified scroll handler: pure math, zero layout queries
  window.addEventListener('scroll', () => {
    const y = window.scrollY || window.pageYOffset;
    updateHeader(y);

    if (!isMobileMode && scrollDistance > 0) {
      const pastTop = y - wrapTop;
      targetProgress = Math.max(0, Math.min(1, pastTop / scrollDistance));
      wakeScrubLoop();
    }
  }, { passive: true });

  // Mobile momentum scroll synchronization
  function syncMobileState() {
    if (!isMobileMode || !horizontalViewport || !bentoCards.length) return;

    const scrollLeft = horizontalViewport.scrollLeft;
    const card = bentoCards[0];
    const cardWidth = card ? card.offsetWidth : 300;
    const gap = 16;
    const stride = cardWidth + gap;

    const nearestIdx = Math.min(4, Math.max(0, Math.round(scrollLeft / stride)));

    if (stepCounter) {
      stepCounter.textContent = `0${nearestIdx + 1} / 05`;
    }
    if (progressBarFill) {
      const scale = 0.2 + (nearestIdx / 4) * 0.8;
      progressBarFill.style.transform = `scaleX(${scale.toFixed(4)})`;
    }
    pinDots.forEach((dot, k) => {
      dot.classList.toggle('active', k === nearestIdx);
    });
    bentoCards.forEach((c, idx) => {
      c.classList.toggle('is-active-feature', idx === nearestIdx);
    });
  }

  let mobileScrollTicking = false;
  if (horizontalViewport) {
    horizontalViewport.addEventListener('scroll', () => {
      if (!mobileScrollTicking) {
        requestAnimationFrame(() => {
          mobileScrollTicking = false;
          syncMobileState();
        });
        mobileScrollTicking = true;
      }
    }, { passive: true });
  }

  // Dot navigation buttons (Click to glide on desktop, snap on mobile)
  pinDots.forEach((dot, k) => {
    dot.addEventListener('click', () => {
      if (isMobileMode) {
        if (bentoCards[k] && horizontalViewport) {
          const targetX = bentoCards[k].offsetLeft - 20;
          horizontalViewport.scrollTo({
            left: targetX,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
          });
        }
      } else {
        if (scrollDistance > 0) {
          const targetY = wrapTop + (k / 4) * scrollDistance;
          window.scrollTo({
            top: targetY,
            behavior: prefersReducedMotion ? 'auto' : 'smooth'
          });
        }
      }
    });
  });

  // Mobile browsers fire resize on address bar slide. Ignore height-only resize on touch.
  function handleResize() {
    if (isCoarse && window.innerWidth === laidOutW) return;
    measureLayout();
  }

  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('orientationchange', measureLayout);
  window.addEventListener('load', measureLayout);

  // Initial layout measurement
  measureLayout();

  // =========================================================================
  // 4. HERO INTERACTIVE PHONE VIEW TOGGLE (/p/ RENTER LINK)
  // =========================================================================
  const modePills = document.querySelectorAll('.lx-mode-pill');
  const phoneRenterView = document.querySelector('#phone-renter-view');
  const phoneAgentView = document.querySelector('#phone-agent-view');

  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const mode = pill.dataset.phoneMode;

      if (mode === 'agent') {
        if (phoneRenterView) phoneRenterView.style.display = 'none';
        if (phoneAgentView) phoneAgentView.style.display = 'flex';
      } else {
        if (phoneRenterView) phoneRenterView.style.display = 'flex';
        if (phoneAgentView) phoneAgentView.style.display = 'none';
      }
    });
  });

  // =========================================================================
  // 5. BENTO FEATURE 1: SOCIAL POST GENERATOR (TABS & COPY)
  // =========================================================================
  const postTemplates = {
    facebook: `🔥 ქირავდება პრემიუმ ბინა ვაკეში, ჭავჭავაძის გამზირზე!

📍 ლოკაცია: ვაკე, ჭავჭავაძე (ვაკის პარკთან)
🏢 კორპუსი: ახალაშენებული, 8/14 სართული
📐 ფართობი: 85 მ² | 2 ოთახი (1 საძინებელი)

✨ ბინის უპირატესობები:
• ახალი პრემიუმ ევრორემონტი, უცხოვრებელი
• ცენტრალური გათბობა, კონდიციონერი, ჭურჭლის სარეცხი მანქანა
• აივანი ვაკის პარკის ხედით

💳 ფასი: $950 / თვეში
📌 პირობები: პირველი და ბოლო თვის გადახდით + დეპოზიტი $950
🐾 შინაური ცხოველები: შეთანხმებით

📸 სრული HD ფოტოები და დეტალები იხილეთ ჭკვიან ბმულზე:
👉 rigzea.ge/p/vake-loft-42

📞 WhatsApp: +995 599 12 34 56 (გიორგი)`,

    whatsapp: `მოგესალმებით მარიამ! 🌿

თქვენი მოთხოვნის შესაბამისად, შეგირჩიეთ იდეალური ვარიანტი:

📍 ვაკე, ჭავჭავაძის გამზ.
📐 85 მ², 2 ოთახი
💵 ფასი: $950/თვე (პირველი და ბოლო თვის გადახდით)

ბინის ყველა HD ფოტო, ვიდეო-ტური, ზუსტი ლოკაცია და დეტალური პირობები შეგიძლიათ ნახოთ ამ ბმულზე:
👉 rigzea.ge/p/vake-loft-42

თუ მოგეწონებათ, მომწერეთ და დღესვე შეგვიძლია ადგილზე ნახვა! 🤝`,

    cobroker: `სალამი კოლეგა! 🤝 მყავს აქტუალური ობიექტი, თანამშრომლობაზე გახსნილი ვარ (50/50 საკომისიოს გაყოფით):

📍 ლოკაცია: ვაკე, ჭავჭავაძე (ვაკის პარკი)
🏠 ტიპი: 2 ოთახი, 85 მ²
💵 ფასი: $950/თვე (მეპატრონე ადეკვატურია)
🔑 გასაღები: მაქვს ადგილზე

თუ გყავს რეალური კლიენტი, გადაუგზავნე ეს ჭკვიანი ბმული (მონაცემები სრულადაა):
👉 rigzea.ge/p/vake-loft-42

დეტალებზე დამიკავშირდი: +995 599 12 34 56.`
  };

  const postTabBtns = document.querySelectorAll('.lx-post-tab-btn');
  const postBox = document.querySelector('#post-preview-box');
  const copyBtn = document.querySelector('#copy-post-btn');

  let activePostKey = 'facebook';

  postTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      postTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activePostKey = btn.dataset.postType || 'facebook';
      if (postBox && postTemplates[activePostKey]) {
        postBox.textContent = postTemplates[activePostKey];
      }
    });
  });

  if (copyBtn && postBox) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(postBox.textContent);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span>✓ დაკოპირდა!</span>';
        copyBtn.style.background = 'rgba(0, 245, 155, 0.35)';
        setTimeout(() => {
          copyBtn.innerHTML = originalText;
          copyBtn.style.background = '';
        }, 2200);
      } catch (err) {
        console.error('Clipboard copy error:', err);
      }
    });
  }

  // =========================================================================
  // 6. BENTO FEATURE 2: BILINGUAL LEASE AGREEMENT (KA / EN / DUAL TOGGLE)
  // =========================================================================
  const leaseLangBtns = document.querySelectorAll('.lx-lang-btn');
  const leaseClauses = document.querySelectorAll('.lx-clause-item');

  leaseLangBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      leaseLangBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lang = btn.dataset.leaseLang;

      leaseClauses.forEach(clause => {
        const kaText = clause.querySelector('.clause-text-ka');
        const enText = clause.querySelector('.clause-text-en');
        if (lang === 'en') {
          if (kaText) kaText.style.display = 'none';
          if (enText) enText.style.display = 'block';
        } else if (lang === 'ka') {
          if (kaText) kaText.style.display = 'block';
          if (enText) enText.style.display = 'none';
        } else {
          // Dual
          if (kaText) kaText.style.display = 'block';
          if (enText) enText.style.display = 'block';
        }
      });
    });
  });

  // =========================================================================
  // 7. BENTO FEATURE 3: CLIENT MATCHMAKER (SIMULATOR)
  // =========================================================================
  const matchPills = document.querySelectorAll('.lx-match-pill');
  const matchResultContainer = document.querySelector('#match-results-container');
  const matchScoreEl = document.querySelector('#match-score-display');
  const matchReqText = document.querySelector('#match-req-text');

  const matchData = {
    vake: {
      req: 'ვაკე, ჭავჭავაძე · $950-მდე · 2 ოთახი · ძაღლით 🐶',
      score: '98% იდეალური თანხვედრა',
      title: 'ვაკე, ჭავჭავაძის გამზ. #42',
      details: '85 მ² · $950/თვე · ცხოველები დაშვებულია'
    },
    saburtalo: {
      req: 'საბურთალო, ყაზბეგი · $700-მდე · 2 ოთახი · მეტროსთან 🚇',
      score: '96% იდეალური თანხვედრა',
      title: 'საბურთალო, ალ. ყაზბეგის #14',
      details: '62 მ² · $650/თვე · მეტრო დელისთან 3 წუთი'
    },
    batumi: {
      req: 'ბათუმი, ორბი სითი · $800-მდე · ზღვის პირველი ზოლი 🌊',
      score: '99% იდეალური თანხვედრა',
      title: 'ბათუმი, Orbi City Block A',
      details: '48 მ² · $750/თვე · პანორამული ზღვის ხედი'
    }
  };

  matchPills.forEach(pill => {
    pill.addEventListener('click', () => {
      matchPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const key = pill.dataset.matchKey;
      const data = matchData[key];
      if (data) {
        if (matchReqText) matchReqText.textContent = data.req;
        if (matchScoreEl) matchScoreEl.textContent = data.score;
        const titleEl = document.querySelector('#match-listing-title');
        const descEl = document.querySelector('#match-listing-desc');
        if (titleEl) titleEl.textContent = data.title;
        if (descEl) descEl.textContent = data.details;
      }
    });
  });

  // =========================================================================
  // 8. DEAL & COMMISSION ROI CALCULATOR
  // =========================================================================
  const rentSlider = document.querySelector('#calc-rent');
  const dealsSlider = document.querySelector('#calc-deals');
  const splitSelect = document.querySelector('#calc-split');

  const rentVal = document.querySelector('#calc-rent-val');
  const dealsVal = document.querySelector('#calc-deals-val');

  const monthlyCommUsd = document.querySelector('#calc-result-monthly-usd');
  const monthlyCommGel = document.querySelector('#calc-result-monthly-gel');
  const annualCommUsd = document.querySelector('#calc-result-annual-usd');
  const hoursSaved = document.querySelector('#calc-result-hours');

  function calculateROI() {
    if (!rentSlider || !dealsSlider) return;

    const rent = parseFloat(rentSlider.value);
    const deals = parseFloat(dealsSlider.value);
    const splitRate = splitSelect ? parseFloat(splitSelect.value) : 0.50;

    if (rentVal) rentVal.textContent = `$${rent.toLocaleString()}`;
    if (dealsVal) dealsVal.textContent = `${deals} გარიგება`;

    const monthlyTotal = rent * deals * splitRate;
    const gelRate = 2.72; // GEL/USD exchange rate
    const monthlyGel = Math.round(monthlyTotal * gelRate);
    const annualTotal = monthlyTotal * 12;
    const saved = deals * 8; // 8 hours saved per deal on repetitive chaos

    if (monthlyCommUsd) monthlyCommUsd.textContent = `$${Math.round(monthlyTotal).toLocaleString()}`;
    if (monthlyCommGel) monthlyCommGel.textContent = `~ ₾${monthlyGel.toLocaleString()}`;
    if (annualCommUsd) annualCommUsd.textContent = `$${Math.round(annualTotal).toLocaleString()}`;
    if (hoursSaved) hoursSaved.textContent = `${saved} საათი`;
  }

  rentSlider?.addEventListener('input', calculateROI);
  dealsSlider?.addEventListener('input', calculateROI);
  splitSelect?.addEventListener('change', calculateROI);
  calculateROI();

  // =========================================================================
  // 9. 4-TIER PRICING BILLING INTERVAL TOGGLE (MONTHLY VS YEARLY)
  // =========================================================================
  const billingButtons = document.querySelectorAll('.lx-billing-toggle-pill button');
  const priceElements = document.querySelectorAll('.lx-plan-amount[data-monthly]');

  billingButtons.forEach(button => {
    button.addEventListener('click', () => {
      const isYearly = button.dataset.billing === 'yearly';
      billingButtons.forEach(b => {
        const active = b === button;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });

      priceElements.forEach(priceEl => {
        const targetPrice = isYearly ? priceEl.dataset.yearly : priceEl.dataset.monthly;
        priceEl.textContent = targetPrice;
      });

      const periodLabels = document.querySelectorAll('.lx-plan-period[data-monthly-period]');
      periodLabels.forEach(label => {
        label.textContent = isYearly ? '/ წელი' : '/ თვე';
      });
    });
  });

  // =========================================================================
  // 10. SMOOTH SCROLL FOR IN-PAGE ANCHORS
  // =========================================================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          const behavior = prefersReducedMotion ? 'auto' : 'smooth';
          if (targetId === '#features' && !isMobileMode && wrapTop > 0) {
            window.scrollTo({ top: wrapTop, behavior });
          } else {
            targetEl.scrollIntoView({ behavior });
          }
        }
      }
    });
  });

})();
