/**
 * Rigzea landing interactions: header and mobile drawer, the featured pricing card's
 * pointer light, copy feedback, the interactive feature demos, billing toggle and anchors.
 * Native scrolling only; respects prefers-reduced-motion and coarse pointers.
 */

(() => {
  'use strict';

  // =========================================================================
  // 0. CAPABILITY & ACCESSIBILITY DETECTION
  // =========================================================================
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // Smooth wheel scrolling (Lenis). Touch keeps the browser's own momentum; reduced motion keeps native scroll.
  let lenis = null;
  if (window.Lenis && !prefersReducedMotion) {
    lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true });
    const lenisRaf = (time) => { lenis.raf(time); requestAnimationFrame(lenisRaf); };
    requestAnimationFrame(lenisRaf);
  }

  // =========================================================================
  // 3. HEADER SCROLL, MOBILE DRAWER & STICKY THUMB BAR
  // =========================================================================
  const header = document.querySelector('.lx-header');
  const mobileToggle = document.querySelector('.lx-mobile-toggle');
  const navLinks = document.querySelector('.lx-nav-links');
  const thumbBar = document.getElementById('mobile-thumb-bar');
  const finalCta = document.querySelector('.lx-final-cta-box') || document.querySelector('.lx-final-cta-section');
  const tourModal = document.getElementById('tour-modal-backdrop');
  let headerScrolled = false;

  function updateHeader(y) {
    if (!header) return;
    const shouldScroll = y > 35;
    if (shouldScroll !== headerScrolled) {
      headerScrolled = shouldScroll;
      header.classList.toggle('scrolled', shouldScroll);
    }
  }

  function updateThumbBar(y) {
    if (!thumbBar) return;
    if (window.innerWidth > 768) {
      thumbBar.classList.remove('is-visible');
      return;
    }
    const isModalOpen = tourModal && tourModal.classList.contains('is-open');
    const isMenuOpen = navLinks && navLinks.classList.contains('open');
    if (isModalOpen || isMenuOpen) {
      thumbBar.classList.remove('is-visible');
      return;
    }

    const heroPassed = y > 420;
    thumbBar.classList.toggle('is-visible', heroPassed && !nearBottom);
  }

  // True once the final call to action reaches 80px above the bottom of the screen (or has
  // scrolled past). Kept by an observer, so scrolling never has to measure the layout.
  let nearBottom = false;
  if (finalCta && thumbBar && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      nearBottom = entry.isIntersecting || entry.boundingClientRect.top < 0;
      updateThumbBar(window.scrollY);
    }, { rootMargin: '0px 0px -80px 0px' }).observe(finalCta);
  }

  function closeMobileMenu() {
    if (!navLinks || !navLinks.classList.contains('open')) return;
    navLinks.classList.remove('open');
    document.body.classList.remove('lx-menu-open');
    document.body.style.overflow = '';
    if (mobileToggle) {
      mobileToggle.innerHTML = ICON_MENU;
      mobileToggle.setAttribute('aria-expanded', 'false');
    }
    updateThumbBar(window.scrollY);
  }

  const ICON_MENU = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
  const ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      document.body.classList.toggle('lx-menu-open', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
      mobileToggle.innerHTML = isOpen ? ICON_CLOSE : ICON_MENU;
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
      updateThumbBar(window.scrollY);
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => closeMobileMenu());
    });

    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
        closeMobileMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        closeMobileMenu();
      }
    });
  }

  // The only scroll handler: header state and the mobile thumb bar (both just toggle a class)
  const onPageScroll = () => {
    const y = window.scrollY;
    updateHeader(y);
    updateThumbBar(y);
  };
  window.addEventListener('scroll', onPageScroll, { passive: true });
  window.addEventListener('resize', () => updateThumbBar(window.scrollY), { passive: true });
  onPageScroll();

  // =========================================================================
  // 4. RADIAL MOUSE SPOTLIGHT (HARDWARE-ACCELERATED VIA rAF THROTTLE)
  // =========================================================================
  const spotlightCards = document.querySelectorAll('.lx-pricing-card.featured'); // the only card that reacts to the pointer

  spotlightCards.forEach(card => {
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
  // 5. GLASS SHINE RAY SWEEP EFFECT ON CARDS
  // =========================================================================
  spotlightCards.forEach(card => {
    if (!card.querySelector('.lx-glass-shine')) {
      const shine = document.createElement('div');
      shine.className = 'lx-glass-shine';
      shine.setAttribute('aria-hidden', 'true');
      card.appendChild(shine);
    }
  });

  // =========================================================================
  // 8. INTERACTIVE RIPPLE & ANIMATED SVG CHECKMARK ON COPY CTAS
  // =========================================================================
  const copyButtons = document.querySelectorAll('.lx-copy-btn');

  copyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      // 8A. Precise Cursor Radiating Ripple
      const rect = btn.getBoundingClientRect();
      const rippleX = e.clientX - rect.left;
      const rippleY = e.clientY - rect.top;

      const ripple = document.createElement('span');
      ripple.className = 'lx-btn-ripple';
      ripple.style.left = `${rippleX}px`;
      ripple.style.top = `${rippleY}px`;
      btn.appendChild(ripple);

      setTimeout(() => { ripple.remove(); }, 620);

      // 8B. Clipboard Content Copy
      const targetBox = document.querySelector('#post-preview-box');
      if (targetBox) {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(targetBox.textContent);
          } else {
            throw new Error('Clipboard API unavailable');
          }
        } catch (err) {
          const ta = document.createElement('textarea');
          ta.value = targetBox.textContent;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          try { document.execCommand('copy'); } catch (_) {}
          ta.remove();
        }
      }

      // 8C. Animated Signature Checkmark
      if (!btn.classList.contains('copied')) {
        const originalContent = btn.innerHTML;
        btn.classList.add('copied');
        btn.innerHTML = `
          <svg class="lx-check-icon-anim" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
            <path class="lx-check-path" d="M20 6L9 17l-5-5"></path>
          </svg>
          <span>დაკოპირდა!</span>
        `;

        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.classList.remove('copied');
        }, 2200);
      }
    });
  });


  // =========================================================================
  // 11. HERO INTERACTIVE PHONE VIEW TOGGLE (/p/ PREVIEWS)
  // =========================================================================
  const modePills = document.querySelectorAll('.lx-mode-pill');
  const phoneSaleView = document.querySelector('#phone-sale-view');
  const phoneRenterView = document.querySelector('#phone-renter-view');
  const phoneAgentView = document.querySelector('#phone-agent-view');
  const phoneUrlDisplay = document.querySelector('#phone-url-display');

  modePills.forEach(pill => {
    pill.addEventListener('click', () => {
      modePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const mode = pill.dataset.phoneMode;

      if (mode === 'agent') {
        if (phoneSaleView) phoneSaleView.style.display = 'none';
        if (phoneRenterView) phoneRenterView.style.display = 'none';
        if (phoneAgentView) phoneAgentView.style.display = 'flex';
        if (phoneUrlDisplay) phoneUrlDisplay.textContent = 'rigzea.com/app/#/analytics';
      } else if (mode === 'rent') {
        if (phoneSaleView) phoneSaleView.style.display = 'none';
        if (phoneRenterView) phoneRenterView.style.display = 'flex';
        if (phoneAgentView) phoneAgentView.style.display = 'none';
        if (phoneUrlDisplay) phoneUrlDisplay.textContent = 'rigzea.com/p/chavchavadze-82';
      } else {
        // default: sale
        if (phoneSaleView) phoneSaleView.style.display = 'flex';
        if (phoneRenterView) phoneRenterView.style.display = 'none';
        if (phoneAgentView) phoneAgentView.style.display = 'none';
        if (phoneUrlDisplay) phoneUrlDisplay.textContent = 'rigzea.com/p/vake-loft-42';
      }
    });
  });

  // =========================================================================
  // 12. BENTO FEATURE 1: SOCIAL POST GENERATOR TABS
  // =========================================================================
  const postTemplates = {
    facebook: `ქირავდება ბინა ვაკეში, ჭავჭავაძის გამზ.
85 მ² | 2 ოთახი | $950/თვე
ფოტოები: rigzea.com/p/vake-loft-42
WhatsApp: +995 599 12 34 56`,

    whatsapp: `მოგესალმებით, მარიამ!
ვაკე · 85 მ² · $950/თვე
ფოტოები და პირობები: rigzea.com/p/vake-loft-42`,

    cobroker: `სალამი, კოლეგა! საკომისიო 50/50:
ვაკე · 2 ოთახი · $950/თვე
rigzea.com/p/vake-loft-42`
  };

  const postTabBtns = document.querySelectorAll('.lx-post-tab-btn');
  const postBox = document.querySelector('#post-preview-box');

  postTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      postTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const activePostKey = btn.dataset.postType || 'facebook';
      if (postBox && postTemplates[activePostKey]) {
        postBox.textContent = postTemplates[activePostKey];
      }
    });
  });

  // =========================================================================
  // 13. BENTO FEATURE 2: BILINGUAL LEASE AGREEMENT (KA / EN / DUAL)
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
          if (kaText) kaText.style.display = 'block';
          if (enText) enText.style.display = 'block';
        }
      });
    });
  });

  // =========================================================================
  // 14. BENTO FEATURE 3: CLIENT MATCHMAKER SIMULATOR
  // =========================================================================
  const matchPills = document.querySelectorAll('.lx-match-pill');
  const matchScoreEl = document.querySelector('#match-score-display');
  const matchReqText = document.querySelector('#match-req-text');

  const matchData = {
    vake: {
      req: 'ვაკე, ჭავჭავაძე · $950-მდე · 2 ოთახი · ძაღლით',
      score: '98% თანხვედრა',
      title: 'ვაკე, ჭავჭავაძის გამზ. #42',
      details: '85 მ² · $950/თვე · ცხოველები დაშვებულია'
    },
    saburtalo: {
      req: 'საბურთალო, ყაზბეგი · $700-მდე · 2 ოთახი · მეტროსთან',
      score: '96% თანხვედრა',
      title: 'საბურთალო, ალ. ყაზბეგის #14',
      details: '62 მ² · $650/თვე · მეტრო დელისთან 3 წუთი'
    },
    batumi: {
      req: 'ბათუმი, ორბი სითი · $800-მდე · ზღვის პირველი ზოლი',
      score: '99% თანხვედრა',
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
  // 15. PRICING BILLING INTERVAL TOGGLE (MONTHLY VS YEARLY)
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
        if (window.lxRollPrice) window.lxRollPrice(priceEl, targetPrice); else priceEl.textContent = targetPrice;
      });

      // switch labels between month and year
      document.querySelectorAll('.lx-plan-period[data-monthly-period]').forEach(label => {
        if (!label.dataset.monthlyText) label.dataset.monthlyText = label.textContent;
        label.textContent = isYearly ? '/ წელი' : label.dataset.monthlyText;
      });

      // hide free trial notice on yearly billing
      document.querySelectorAll('.lx-plan-trial').forEach(trial => {
        trial.style.display = isYearly ? 'none' : '';
      });
    });
  });

  // =========================================================================
  // 16. SMOOTH SCROLL FOR IN-PAGE ANCHORS
  // =========================================================================
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          const targetY = window.pageYOffset + targetEl.getBoundingClientRect().top - 75;
          if (lenis) lenis.scrollTo(targetY, { duration: 1.1 });
          else window.scrollTo({ top: targetY, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
      }
    });
  });

  // =========================================================================
  // 17. HERO HEADLINE WORD ROTATOR (21st.dev style)
  // =========================================================================
  const wordRotator = document.querySelector('#hero-word-rotator');
  if (wordRotator) {
    const words = wordRotator.querySelectorAll('.word-item');
    let activeWordIndex = 0;

    setInterval(() => {
      if (document.hidden) return;
      words[activeWordIndex].classList.remove('active');
      activeWordIndex = (activeWordIndex + 1) % words.length;
      words[activeWordIndex].classList.add('active');
    }, 3200);
  }

  // =========================================================================
  // 18. MAGIC UI LIVE ACTIVITY STREAM TICKER (Tbilisi & Batumi real-time activity)
  // =========================================================================
  const liveTickerText = document.querySelector('#lx-ticker-text');
  if (liveTickerText) {
    const liveActivities = [
      { name: 'გიორგი მ. (ვაკე)', action: 'ჭკვიანი ბმული გაიგზავნა WhatsApp‑ში', time: '2 წთ წინ' },
      { name: 'ნინო კ. (ბათუმი)', action: 'KA/EN ხელშეკრულება მომზადდა', time: '5 წთ წინ' },
      { name: 'დავით ბ. (საბურთალო)', action: 'დახურა გარიგება · საკომისიო +$475', time: '9 წთ წინ' },
      { name: 'მარიამ ხ. (ვერა)', action: 'კლიენტმა 3 ბინის ვიტრინა ნახა', time: '14 წთ წინ' },
      { name: 'ლევან შ. (ორთაჭალა)', action: 'Facebook‑პოსტი წამებში მომზადდა', time: '21 წთ წინ' }
    ];

    let actIdx = 0;
    setInterval(() => {
      if (document.hidden) return;
      actIdx = (actIdx + 1) % liveActivities.length;
      const act = liveActivities[actIdx];

      liveTickerText.style.opacity = '0';
      liveTickerText.style.transform = 'translateY(-4px)';
      liveTickerText.style.transition = 'opacity 0.25s ease, transform 0.25s ease';

      setTimeout(() => {
        liveTickerText.innerHTML = `
          <span class="lx-ticker-name">${act.name}</span> · 
          <span class="lx-ticker-action">${act.action}</span> 
          <span class="lx-ticker-time">(${act.time})</span>
        `;
        liveTickerText.style.opacity = '1';
        liveTickerText.style.transform = 'translateY(0)';
      }, 260);
    }, 4200);
  }

  // =========================================================================
  // 19. BENCHO INTERACTIVE DYNAMIC ISLAND & HERO PHONE GALLERY
  // =========================================================================
  const dynamicIsland = document.querySelector('#hero-dynamic-island');
  const diLiveText = dynamicIsland?.querySelector('.di-live-text');

  if (dynamicIsland && diLiveText) {
    const islandAlerts = [
      'WhatsApp: ახალი ჯავშანი ვაკეში $950',
      'საკომისიო: +₾1,292 დაფიქსირდა',
      'KA/EN ხელშეკრულება ხელმოსაწერად მზადაა',
      'კლიენტმა გახსნა ჭკვიანი ბმული'
    ];

    let islandIdx = 0;
    setInterval(() => {
      if (document.hidden) return;
      islandIdx = (islandIdx + 1) % islandAlerts.length;
      diLiveText.textContent = islandAlerts[islandIdx];
    }, 4500);

    dynamicIsland.addEventListener('click', () => {
      dynamicIsland.classList.toggle('is-expanded');
    });
  }

  // Hero Phone Gallery Switcher
  const phonePhoto = document.querySelector('#phone-main-photo');
  const photoDots = document.querySelectorAll('.lx-photo-dot');
  const apartmentPhotos = [
    '/img/1600585154340-be6161a56a0c.jpg',
    '/img/1600607687939-ce8a6c25118c.jpg',
    '/img/1512917774080-9991f1c4c750.jpg'
  ];

  photoDots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      photoDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      const idx = parseInt(dot.dataset.imgIdx || '0', 10);
      if (phonePhoto && apartmentPhotos[idx]) {
        phonePhoto.style.opacity = '0.6';
        phonePhoto.src = apartmentPhotos[idx];
        setTimeout(() => { phonePhoto.style.opacity = '1'; }, 180);
      }
    });
  });

  // Hero Phone Quick Link Copy
  const phoneCopyLinkBtn = document.querySelector('#phone-copy-link-btn');
  if (phoneCopyLinkBtn) {
    phoneCopyLinkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = 'https://rigzea.com/p/vake-loft-42';
      navigator.clipboard?.writeText(url).catch(() => {});
      phoneCopyLinkBtn.style.color = '#fff';
      phoneCopyLinkBtn.style.background = 'rgba(0, 245, 155, 0.35)';
      setTimeout(() => {
        phoneCopyLinkBtn.style.color = '';
        phoneCopyLinkBtn.style.background = '';
      }, 1500);
    });
  }

  // =========================================================================
  // 20. BENCHO.DEV INTERACTIVE BEFORE / AFTER SPLIT COMPARISON SLIDER
  // =========================================================================
  const splitStage = document.querySelector('#lx-split-stage');
  const splitHandle = document.querySelector('#lx-split-handle');
  const splitRigzeaLayer = document.querySelector('#lx-split-rigzea-layer');
  const compareModeBtns = document.querySelectorAll('.lx-compare-mode-btn');

  if (splitStage && splitHandle && splitRigzeaLayer) {
    let isSplitDragging = false;
    let splitPosPercent = 50; // default 50%

    function setSplitPosition(percent, smooth = false) {
      splitPosPercent = Math.max(2, Math.min(98, percent));
      
      if (smooth) {
        splitRigzeaLayer.style.transition = 'clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
        splitHandle.style.transition = 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
        setTimeout(() => {
          splitRigzeaLayer.style.transition = 'none';
          splitHandle.style.transition = 'none';
        }, 360);
      } else {
        splitRigzeaLayer.style.transition = 'none';
        splitHandle.style.transition = 'none';
      }

      splitRigzeaLayer.style.clipPath = `polygon(0 0, ${splitPosPercent}% 0, ${splitPosPercent}% 100%, 0 100%)`;
      splitHandle.style.left = `${splitPosPercent}%`;
      splitHandle.setAttribute('aria-valuenow', Math.round(splitPosPercent));
    }

    function onPointerMove(e) {
      if (!isSplitDragging) return;
      const rect = splitStage.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left + rect.width / 2);
      const relativeX = clientX - rect.left;
      const percent = (relativeX / rect.width) * 100;
      setSplitPosition(percent, false);
    }

    function onPointerUp() {
      if (isSplitDragging) {
        isSplitDragging = false;
        splitHandle.classList.remove('is-dragging');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('touchend', onPointerUp);
      }
    }

    splitHandle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      isSplitDragging = true;
      splitHandle.classList.add('is-dragging');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    splitStage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#lx-split-handle')) return;
      const rect = splitStage.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPosition(percent, true);
    });

    // Touch support for mobile devices
    splitHandle.addEventListener('touchstart', (e) => {
      isSplitDragging = true;
      splitHandle.classList.add('is-dragging');
      window.addEventListener('touchmove', onPointerMove, { passive: true });
      window.addEventListener('touchend', onPointerUp);
    }, { passive: true });

    // Mode preset buttons
    compareModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        compareModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const val = parseFloat(btn.dataset.compareVal || '50');
        setSplitPosition(val, true);
      });
    });

    // Keyboard accessibility for slider
    splitHandle.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSplitPosition(splitPosPercent - 5, true);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSplitPosition(splitPosPercent + 5, true);
      }
    });

    // Initialize at 50%
    setSplitPosition(50, false);
  }



  /* ==========================================================================
     KOKONUT UI & SHADCN SPACE JAVASCRIPT ENHANCEMENTS
     ========================================================================== */



  // 2. Micro-Toast Notification Utility
  window.showLuxuryToast = function(message) {
    let toast = document.getElementById('lx-global-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lx-global-toast';
      toast.className = 'lx-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#047857" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>' + message + '</span>';
    toast.classList.add('is-visible');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 3200);
  };

  // 3. ShadcnSpace hero-02: Interactive Tour Modal Handler
  function initTourModal() {
    const tourBtns = document.querySelectorAll('.lx-quick-tour-btn');
    const modalBackdrop = document.getElementById('tour-modal-backdrop');
    const modalCloseBtn = document.getElementById('tour-modal-close');
    const modalConfirmBtn = document.getElementById('tour-modal-confirm');
    const slotBtns = document.querySelectorAll('.lx-time-slot-btn');

    if (!modalBackdrop) return;

    let modalOpener = null;
    const setModalOpen = (open) => {
      modalBackdrop.classList.toggle('is-open', open);
      document.body.classList.toggle('lx-modal-open', open);
      if (typeof updateThumbBar === 'function') updateThumbBar(window.scrollY);
    };

    tourBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        modalOpener = btn;
        setModalOpen(true);
        if (modalCloseBtn) modalCloseBtn.focus();
      });
    });

    // Tab stays inside the open dialog; Escape closes it and hands focus back to the button that opened it
    document.addEventListener('keydown', (e) => {
      if (!modalBackdrop.classList.contains('is-open')) return;
      if (e.key === 'Tab') {
        const stops = modalBackdrop.querySelectorAll('button, a[href]');
        const first = stops[0], last = stops[stops.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key !== 'Escape') return;
      setModalOpen(false);
      if (modalOpener) modalOpener.focus();
    });

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        setModalOpen(false);
      });
    }

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        setModalOpen(false);
      }
    });

    slotBtns.forEach(slot => {
      slot.addEventListener('click', () => {
        slotBtns.forEach(s => s.classList.remove('is-selected'));
        slot.classList.add('is-selected');
      });
    });

    if (modalConfirmBtn) {
      modalConfirmBtn.addEventListener('click', (e) => {
        const selectedSlot = document.querySelector('.lx-time-slot-btn.is-selected');
        const slotText = selectedSlot ? selectedSlot.textContent : 'დღეს 18:00';
        setModalOpen(false);
        
        const rect = modalConfirmBtn.getBoundingClientRect();
        createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 36);
        
        window.showLuxuryToast('ვიზიტი დაჯავშნილია (' + slotText + ')! აგენტი დაგიკავშირდებათ.');
      });
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTourModal);
  } else {
    initTourModal();
  }

})();

