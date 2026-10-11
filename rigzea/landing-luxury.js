/**
 * RIGZEA 3.0 — LUXURY MOTION & INTERACTION ENGINE
 * 60fps Hardware-Accelerated Scroll Choreography, Bento Motion, & Reactive UI
 */

(() => {
  'use strict';

  // =========================================================================
  // 1. HEADER SCROLL STATE & MOBILE MENU
  // =========================================================================
  const header = document.querySelector('.lx-header');
  const mobileToggle = document.querySelector('.lx-mobile-toggle');
  const navLinks = document.querySelector('.lx-nav-links');

  window.addEventListener('scroll', () => {
    if (header) {
      if (window.scrollY > 40) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }, { passive: true });

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
  // 2. RADIAL MOUSE SPOTLIGHT (CARD HOVER COORDINATES)
  // =========================================================================
  const cards = document.querySelectorAll('.lx-spotlight-card, .lx-bento-card, .lx-pricing-card, .lx-card-rigzea-way');

  cards.forEach(card => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
  });

  // =========================================================================
  // 3. HORIZONTAL PIN-SCROLL CHOREOGRAPHY (BENTO SHOWCASE)
  // =========================================================================
  const pinWrap = document.querySelector('.lx-pin-scroll-wrap');
  const horizontalTrack = document.querySelector('.lx-horizontal-track');
  const progressBarFill = document.querySelector('.lx-pin-progress-bar-fill');
  const stepCounter = document.querySelector('.lx-pin-step-counter');

  let ticking = false;

  function updatePinScroll() {
    ticking = false;
    if (!pinWrap || !horizontalTrack || window.innerWidth <= 900) return;

    const wrapRect = pinWrap.getBoundingClientRect();
    const wrapHeight = pinWrap.offsetHeight;
    const windowHeight = window.innerHeight;

    // Total distance the wrap stays pinned
    const scrollDistance = wrapHeight - windowHeight;
    if (scrollDistance <= 0) return;

    // How far the top of the wrap has scrolled past the top of viewport
    const scrolledPastTop = -wrapRect.top;
    const progress = Math.max(0, Math.min(1, scrolledPastTop / scrollDistance));

    // Calculate maximum horizontal travel
    const trackWidth = horizontalTrack.scrollWidth;
    const viewportWidth = window.innerWidth;
    const maxHorizontalScroll = trackWidth - viewportWidth + 80;

    if (maxHorizontalScroll > 0) {
      const translateX = progress * maxHorizontalScroll;
      horizontalTrack.style.transform = `translate3d(-${translateX}px, 0, 0)`;
    }

    // Update progress bar
    if (progressBarFill) {
      progressBarFill.style.width = `${20 + progress * 80}%`;
    }

    // Update step counter (1 to 5)
    if (stepCounter) {
      const step = Math.min(5, Math.max(1, Math.floor(progress * 5) + 1));
      stepCounter.textContent = `0${step} / 05`;
    }
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updatePinScroll);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener('resize', updatePinScroll, { passive: true });
  updatePinScroll();

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
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

})();
