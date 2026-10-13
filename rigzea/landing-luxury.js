/**
 * RIGZEA 3.0 - LUXURY MOTION & INTERACTION ENGINE
 * Elite Creative-Technologist Motion Suite
 * Lenis Smooth Scroll + GSAP 3.12 + ScrollTrigger Architecture
 * 
 * Features:
 * 1. Lenis 1.1 + GSAP ScrollTrigger Integration with Hardware rAF Synced Ticker
 * 2. Magnetic Button Physics with 2.5D Multilayer Depth (.lx-btn-primary, .lx-btn-secondary)
 * 3. Dynamic 3D Perspective Card Tilt on Bento Cards, Pricing Cards, and Phone Mockup
 * 4. Specular Diamond Glass Shine Ray Sweep on Hover
 * 5. Interactive Cursor Ripple & Animated SVG Checkmark on Copy CTAs
 * 6. Fluid Numeric Odometer / Count-Up Spring Ticker on ROI Calculator
 * 7. Hardware-Accelerated Ambient Mesh & Glow Orbs Parallax on Scroll
 * 8. Horizontal Bento Showcase 60fps LERP Scrubber & Mobile Momentum Tracking
 * 9. Respects @media (prefers-reduced-motion) and Coarse Pointer Detection
 */

(() => {
  'use strict';

  // =========================================================================
  // 0. CAPABILITY & ACCESSIBILITY DETECTION
  // =========================================================================
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // =========================================================================
  // 1. LENIS SMOOTH SCROLL + GSAP SCROLLTRIGGER ENGINE
  // =========================================================================
  let lenis = null;

  if (typeof window.Lenis !== 'undefined' && !prefersReducedMotion) {
    try {
      lenis = new window.Lenis({
        lerp: 0.12,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
        smoothWheel: true,
        smoothTouch: false // Leave mobile touch natural to browser momentum
      });

      if (typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined') {
        window.gsap.registerPlugin(window.ScrollTrigger);
        lenis.on('scroll', window.ScrollTrigger.update);
        window.gsap.ticker.add((time) => {
          lenis.raf(time * 1000);
        });
        window.gsap.ticker.lagSmoothing(0);
      } else {
        const lenisRaf = (time) => {
          lenis.raf(time);
          requestAnimationFrame(lenisRaf);
        };
        requestAnimationFrame(lenisRaf);
      }
    } catch (err) {
      console.warn('Lenis init fallback:', err);
    }
  }

  // =========================================================================
  // 2. BUTTER-SMOOTH BACKGROUND MESH & AMBIENT ORBS PARALLAX
  // =========================================================================
  const orbPrimary = document.querySelector('.lx-orb-primary');
  const orbSecondary = document.querySelector('.lx-orb-secondary');
  const orbTertiary = document.querySelector('.lx-orb-tertiary');
  const ambientGrid = document.querySelector('.lx-ambient-grid');

  let currentScrollY = 0;
  let targetOrb1Y = 0, currentOrb1Y = 0;
  let targetOrb2Y = 0, currentOrb2Y = 0;
  let targetOrb3Y = 0, currentOrb3Y = 0;
  let targetGridY = 0, currentGridY = 0;
  let isParallaxTicking = false;

  function renderParallaxFrame() {
    if (prefersReducedMotion) return;

    currentOrb1Y += (targetOrb1Y - currentOrb1Y) * 0.10;
    currentOrb2Y += (targetOrb2Y - currentOrb2Y) * 0.10;
    currentOrb3Y += (targetOrb3Y - currentOrb3Y) * 0.10;
    currentGridY += (targetGridY - currentGridY) * 0.12;

    if (orbPrimary) {
      orbPrimary.style.transform = `translate3d(0, ${currentOrb1Y.toFixed(2)}px, 0)`;
    }
    if (orbSecondary) {
      orbSecondary.style.transform = `translate3d(0, ${currentOrb2Y.toFixed(2)}px, 0)`;
    }
    if (orbTertiary) {
      orbTertiary.style.transform = `translate3d(0, ${currentOrb3Y.toFixed(2)}px, 0)`;
    }
    if (ambientGrid) {
      ambientGrid.style.transform = `translate3d(0, ${currentGridY.toFixed(2)}px, 0)`;
    }

    const delta = Math.abs(targetOrb1Y - currentOrb1Y) + Math.abs(targetOrb2Y - currentOrb2Y);
    if (delta > 0.05) {
      requestAnimationFrame(renderParallaxFrame);
    } else {
      isParallaxTicking = false;
    }
  }

  function updateParallax(y) {
    if (prefersReducedMotion) return;
    currentScrollY = y;
    targetOrb1Y = -y * 0.06;
    targetOrb2Y = y * 0.08;
    targetOrb3Y = -y * 0.04;
    targetGridY = (y * 0.12) % 36;

    if (!isParallaxTicking) {
      isParallaxTicking = true;
      requestAnimationFrame(renderParallaxFrame);
    }
  }

  // =========================================================================
  // 3. HEADER SCROLL & MOBILE DRAWER NAVIGATION
  // =========================================================================
  const header = document.querySelector('.lx-header');
  const mobileToggle = document.querySelector('.lx-mobile-toggle');
  const navLinks = document.querySelector('.lx-nav-links');
  let headerScrolled = false;

  function updateHeader(y) {
    if (!header) return;
    const shouldScroll = y > 35;
    if (shouldScroll !== headerScrolled) {
      headerScrolled = shouldScroll;
      header.classList.toggle('scrolled', shouldScroll);
    }
  }

  const ICON_MENU = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
  const ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      mobileToggle.innerHTML = isOpen ? ICON_CLOSE : ICON_MENU;
      mobileToggle.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        if (mobileToggle) {
          mobileToggle.innerHTML = ICON_MENU;
          mobileToggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  // =========================================================================
  // 4. RADIAL MOUSE SPOTLIGHT (HARDWARE-ACCELERATED VIA rAF THROTTLE)
  // =========================================================================
  const spotlightCards = document.querySelectorAll('.lx-spotlight-card, .lx-bento-card, .lx-pricing-card, .lx-card-rigzea-way');

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
  // 6. MAGNETIC BUTTON PHYSICS (.lx-btn-primary, .lx-btn-secondary)
  // =========================================================================
  if (!prefersReducedMotion && !isCoarse) {
    const magneticButtons = document.querySelectorAll('.lx-btn-primary, .lx-btn-secondary');

    magneticButtons.forEach(btn => {
      let rect = null;
      let targetX = 0, targetY = 0;
      let currX = 0, currY = 0;
      let isHovered = false;
      let animId = null;
      const isPrimary = btn.classList.contains('lx-btn-primary');
      const pullFactor = isPrimary ? 0.30 : 0.22;
      const maxDist = 14;

      const innerElements = btn.querySelectorAll(':scope > *');

      function updateMagnetic() {
        currX += (targetX - currX) * 0.18;
        currY += (targetY - currY) * 0.18;

        btn.style.transform = `translate3d(${currX.toFixed(2)}px, ${currY.toFixed(2)}px, 0)`;

        if (innerElements.length) {
          const innerX = (currX * 0.28).toFixed(2);
          const innerY = (currY * 0.28).toFixed(2);
          innerElements.forEach(el => {
            el.style.transform = `translate3d(${innerX}px, ${innerY}px, 0)`;
          });
        }

        const delta = Math.abs(targetX - currX) + Math.abs(targetY - currY);
        if (isHovered || delta > 0.04) {
          animId = requestAnimationFrame(updateMagnetic);
        } else {
          currX = 0;
          currY = 0;
          btn.style.transform = '';
          innerElements.forEach(el => { el.style.transform = ''; });
          animId = null;
        }
      }

      btn.addEventListener('pointerenter', () => {
        rect = btn.getBoundingClientRect();
        isHovered = true;
        if (!animId) animId = requestAnimationFrame(updateMagnetic);
      });

      btn.addEventListener('pointermove', (e) => {
        if (!rect) rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = (e.clientX - centerX) * pullFactor;
        const dy = (e.clientY - centerY) * pullFactor;

        targetX = Math.max(-maxDist, Math.min(maxDist, dx));
        targetY = Math.max(-maxDist, Math.min(maxDist, dy));

        if (!animId) animId = requestAnimationFrame(updateMagnetic);
      });

      btn.addEventListener('pointerleave', () => {
        isHovered = false;
        targetX = 0;
        targetY = 0;
        rect = null;
      });
    });
  }

  // =========================================================================
  // 7. DYNAMIC 3D CARD TILT ON HOVER (BENTO CARDS & PHONE MOCKUP)
  //    Aceternity 3D Perspective + Smooth LERP Physics Reset
  // =========================================================================
  if (!prefersReducedMotion && !isCoarse) {
    // 7A. Hero Phone Mockup 3D Tilt
    const phone = document.querySelector('.lx-phone-mockup');
    const phoneContainer = document.querySelector('#hero-phone-container') || phone;

    if (phone) {
      const restRotX = 4.0;
      const restRotY = -5.0;
      const restTransY = 0;

      let targetRotX = restRotX;
      let targetRotY = restRotY;
      let targetTransY = restTransY;

      let currRotX = restRotX;
      let currRotY = restRotY;
      let currTransY = restTransY;

      let phoneTicking = false;
      let phoneHovered = false;
      let phoneRect = null;

      function renderPhoneTilt() {
        currRotX += (targetRotX - currRotX) * 0.12;
        currRotY += (targetRotY - currRotY) * 0.12;
        currTransY += (targetTransY - currTransY) * 0.12;

        phone.style.transform = `perspective(1000px) rotateX(${currRotX.toFixed(2)}deg) rotateY(${currRotY.toFixed(2)}deg) translateY(${currTransY.toFixed(2)}px)`;

        const delta = Math.abs(targetRotX - currRotX) + Math.abs(targetRotY - currRotY) + Math.abs(targetTransY - currTransY);
        if (phoneHovered || delta > 0.05) {
          requestAnimationFrame(renderPhoneTilt);
        } else {
          currRotX = restRotX;
          currRotY = restRotY;
          currTransY = restTransY;
          phone.style.transform = `perspective(1000px) rotateX(${restRotX}deg) rotateY(${restRotY}deg) translateY(${restTransY}px)`;
          phoneTicking = false;
        }
      }

      function wakePhoneLoop() {
        if (!phoneTicking) {
          phoneTicking = true;
          requestAnimationFrame(renderPhoneTilt);
        }
      }

      phoneContainer.addEventListener('pointerenter', () => {
        phoneRect = phone.getBoundingClientRect();
        phoneHovered = true;
        targetTransY = -8;
        wakePhoneLoop();
      });

      let phonePressed = false;
      phoneContainer.addEventListener('pointerdown', () => {
        phonePressed = true;
        targetRotX = currRotX;
        targetRotY = currRotY;
        targetTransY = currTransY;
      });
      window.addEventListener('pointerup', () => { phonePressed = false; });

      phoneContainer.addEventListener('pointermove', (e) => {
        if (phonePressed) return;
        if (!phoneRect) phoneRect = phone.getBoundingClientRect();
        const normX = (e.clientX - phoneRect.left - phoneRect.width / 2) / (phoneRect.width / 2);
        const normY = (e.clientY - phoneRect.top - phoneRect.height / 2) / (phoneRect.height / 2);

        targetRotX = -normY * 7.5;
        targetRotY = normX * 8.5;
        targetTransY = -8;

        wakePhoneLoop();
      });

      phoneContainer.addEventListener('pointerleave', () => {
        phoneHovered = false;
        phoneRect = null;
        targetRotX = restRotX;
        targetRotY = restRotY;
        targetTransY = restTransY;
      });
    }

    // 7B. Bento Feature Cards 3D Perspective Tilt
    const bentoTiltCards = document.querySelectorAll('.lx-bento-card, .lx-pricing-card, .lx-card-rigzea-way');

    bentoTiltCards.forEach(card => {
      let rect = null;
      let targetRotX = 0, targetRotY = 0;
      let currRotX = 0, currRotY = 0;
      let isHovered = false;
      let tiltAnimId = null;
      const maxTilt = card.classList.contains('lx-bento-card') ? 6.5 : 4.5;

      function updateCardTilt() {
        currRotX += (targetRotX - currRotX) * 0.12;
        currRotY += (targetRotY - currRotY) * 0.12;

        const baseScale = card._bentoScale || 1.0;
        card.style.transform = `perspective(1000px) rotateX(${currRotX.toFixed(2)}deg) rotateY(${currRotY.toFixed(2)}deg) scale(${baseScale})`;

        const delta = Math.abs(targetRotX - currRotX) + Math.abs(targetRotY - currRotY);
        if (isHovered || delta > 0.04) {
          tiltAnimId = requestAnimationFrame(updateCardTilt);
        } else {
          currRotX = 0;
          currRotY = 0;
          card.style.transform = baseScale !== 1.0 ? `scale(${baseScale})` : '';
          tiltAnimId = null;
        }
      }

      card.addEventListener('pointerenter', () => {
        rect = card.getBoundingClientRect();
        isHovered = true;
        if (!tiltAnimId) tiltAnimId = requestAnimationFrame(updateCardTilt);
      });

      card.addEventListener('pointermove', (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        const normX = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const normY = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

        targetRotX = -normY * maxTilt;
        targetRotY = normX * maxTilt;

        if (!tiltAnimId) tiltAnimId = requestAnimationFrame(updateCardTilt);
      });

      card.addEventListener('pointerleave', () => {
        isHovered = false;
        targetRotX = 0;
        targetRotY = 0;
        rect = null;
      });
    });
  }

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
          <svg class="lx-check-icon-anim" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00f59b" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
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
  // 9. FLUID NUMERIC ODOMETER / SPRING TICKER ON ROI CALCULATOR
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
  const calcHighlight = document.querySelector('.lx-calc-metric-highlight');

  // State interpolation for numbers
  const tickerState = {
    currRent: 800,
    targetRent: 800,
    currDeals: 4,
    targetDeals: 4,
    currMonthlyUsd: 1600,
    targetMonthlyUsd: 1600,
    currMonthlyGel: 4352,
    targetMonthlyGel: 4352,
    currAnnualUsd: 19200,
    targetAnnualUsd: 19200,
    currHours: 32,
    targetHours: 32,
    isTicking: false
  };

  function stepTicker() {
    const s = tickerState;
    const factor = 0.22;

    s.currRent += (s.targetRent - s.currRent) * factor;
    s.currDeals += (s.targetDeals - s.currDeals) * factor;
    s.currMonthlyUsd += (s.targetMonthlyUsd - s.currMonthlyUsd) * factor;
    s.currMonthlyGel += (s.targetMonthlyGel - s.currMonthlyGel) * factor;
    s.currAnnualUsd += (s.targetAnnualUsd - s.currAnnualUsd) * factor;
    s.currHours += (s.targetHours - s.currHours) * factor;

    if (rentVal) rentVal.textContent = `$${Math.round(s.currRent).toLocaleString()}`;
    if (dealsVal) dealsVal.textContent = `${Math.round(s.currDeals)} გარიგება`;
    if (monthlyCommUsd) monthlyCommUsd.textContent = `$${Math.round(s.currMonthlyUsd).toLocaleString()}`;
    if (monthlyCommGel) monthlyCommGel.textContent = `~ ₾${Math.round(s.currMonthlyGel).toLocaleString()}`;
    if (annualCommUsd) annualCommUsd.textContent = `$${Math.round(s.currAnnualUsd).toLocaleString()}`;
    if (hoursSaved) hoursSaved.textContent = `${Math.round(s.currHours)} საათი`;

    const maxDelta = Math.max(
      Math.abs(s.targetMonthlyUsd - s.currMonthlyUsd),
      Math.abs(s.targetAnnualUsd - s.currAnnualUsd),
      Math.abs(s.targetRent - s.currRent)
    );

    if (maxDelta > 0.8) {
      requestAnimationFrame(stepTicker);
    } else {
      // Snap to exact
      s.currRent = s.targetRent;
      s.currDeals = s.targetDeals;
      s.currMonthlyUsd = s.targetMonthlyUsd;
      s.currMonthlyGel = s.targetMonthlyGel;
      s.currAnnualUsd = s.targetAnnualUsd;
      s.currHours = s.targetHours;

      if (rentVal) rentVal.textContent = `$${s.targetRent.toLocaleString()}`;
      if (dealsVal) dealsVal.textContent = `${s.targetDeals} გარიგება`;
      if (monthlyCommUsd) monthlyCommUsd.textContent = `$${s.targetMonthlyUsd.toLocaleString()}`;
      if (monthlyCommGel) monthlyCommGel.textContent = `~ ₾${s.targetMonthlyGel.toLocaleString()}`;
      if (annualCommUsd) annualCommUsd.textContent = `$${s.targetAnnualUsd.toLocaleString()}`;
      if (hoursSaved) hoursSaved.textContent = `${s.targetHours} საათი`;

      s.isTicking = false;
      if (calcHighlight) calcHighlight.classList.remove('is-ticking');
    }
  }

  function triggerROIChange() {
    if (!rentSlider || !dealsSlider) return;

    const rent = parseFloat(rentSlider.value);
    const deals = parseFloat(dealsSlider.value);
    const splitRate = splitSelect ? parseFloat(splitSelect.value) : 0.50;

    const monthlyTotal = rent * deals * splitRate;
    const gelRate = 2.72;
    const monthlyGel = Math.round(monthlyTotal * gelRate);
    const annualTotal = monthlyTotal * 12;
    const saved = deals * 8;

    tickerState.targetRent = rent;
    tickerState.targetDeals = deals;
    tickerState.targetMonthlyUsd = Math.round(monthlyTotal);
    tickerState.targetMonthlyGel = monthlyGel;
    tickerState.targetAnnualUsd = Math.round(annualTotal);
    tickerState.targetHours = saved;

    if (calcHighlight) calcHighlight.classList.add('is-ticking');

    if (!tickerState.isTicking) {
      tickerState.isTicking = true;
      requestAnimationFrame(stepTicker);
    }
  }

  rentSlider?.addEventListener('input', triggerROIChange);
  dealsSlider?.addEventListener('input', triggerROIChange);
  splitSelect?.addEventListener('change', triggerROIChange);

  // Initialize initial values
  triggerROIChange();

  // =========================================================================
  // 10. HORIZONTAL PIN-SCROLL CHOREOGRAPHY (BENTO SHOWCASE)
  //     60fps LERP Scrubber with linear interpolation & smooth camera gliding
  // =========================================================================
  const pinWrap = document.querySelector('.lx-pin-scroll-wrap');
  const horizontalViewport = document.querySelector('.lx-horizontal-viewport');
  const horizontalTrack = document.querySelector('.lx-horizontal-track');
  const progressBarFill = document.querySelector('.lx-pin-progress-bar-fill');
  const stepCounter = document.querySelector('.lx-pin-step-counter');
  const bentoCards = document.querySelectorAll('.lx-horizontal-track .lx-bento-card');
  const pinDots = document.querySelectorAll('.lx-pin-dot');

  let isMobileMode = window.innerWidth <= 900;
  let laidOutW = window.innerWidth;
  let wrapTop = 0;
  let scrollDistance = 0;
  let maxHorizontalScroll = 0;

  let targetProgress = 0;
  let currentProgress = 0;
  let currentTranslateX = 0;
  let isLoopActive = false;
  let activeStep = 0;

  const LERP_FACTOR = prefersReducedMotion ? 1.0 : 0.16;

  function measureLayout() {
    laidOutW = window.innerWidth;
    isMobileMode = laidOutW <= 900;

    if (!pinWrap || !horizontalTrack) return;

    if (isMobileMode) {
      horizontalTrack.style.transform = '';
      bentoCards.forEach(c => {
        c.style.transform = '';
        c.style.opacity = '';
        c._bentoScale = 1.0;
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

    const pastTop = currentY - wrapTop;
    targetProgress = Math.max(0, Math.min(1, pastTop / scrollDistance));

    if (prefersReducedMotion) {
      currentProgress = targetProgress;
    }

    renderScrubFrame(true);
  }

  function renderScrubFrame(force = false) {
    if (isMobileMode || !horizontalTrack) return;

    currentTranslateX = currentProgress * maxHorizontalScroll;
    horizontalTrack.style.transform = `translate3d(-${currentTranslateX.toFixed(2)}px, 0, 0)`;

    if (progressBarFill) {
      const scale = 0.2 + currentProgress * 0.8;
      progressBarFill.style.transform = `scaleX(${scale.toFixed(4)})`;
    }

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

    if (!prefersReducedMotion && bentoCards.length) {
      bentoCards.forEach((card, i) => {
        const cardCenterProgress = i / 4;
        const dist = Math.abs(currentProgress - cardCenterProgress);
        const rawFocus = Math.max(0, 1 - dist / 0.28);
        const smoothFocus = rawFocus * rawFocus * (3 - 2 * rawFocus);

        const scale = (0.975 + 0.025 * smoothFocus).toFixed(4);
        const opacity = (0.70 + 0.30 * smoothFocus).toFixed(3);

        card._bentoScale = parseFloat(scale);
        card.style.opacity = opacity;
        card.classList.toggle('is-active-feature', smoothFocus > 0.65);

        // If card is not actively hovered by 3D tilt, apply scale
        if (!card.matches(':hover')) {
          card.style.transform = `scale(${scale})`;
        }
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

  // Unified Scroll Listener (Pure Math, 60fps)
  function handleScrollUpdate(scrollY) {
    updateHeader(scrollY);
    updateParallax(scrollY);

    if (!isMobileMode && scrollDistance > 0) {
      const pastTop = scrollY - wrapTop;
      targetProgress = Math.max(0, Math.min(1, pastTop / scrollDistance));
      wakeScrubLoop();
    }
  }

  if (lenis) {
    lenis.on('scroll', (e) => {
      handleScrollUpdate(e.scroll);
    });
  } else {
    window.addEventListener('scroll', () => {
      const y = window.scrollY || window.pageYOffset;
      handleScrollUpdate(y);
    }, { passive: true });
  }

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
          if (lenis) {
            lenis.scrollTo(targetY, { duration: 1.2 });
          } else {
            window.scrollTo({
              top: targetY,
              behavior: prefersReducedMotion ? 'auto' : 'smooth'
            });
          }
        }
      }
    });
  });

  function handleResize() {
    if (isCoarse && window.innerWidth === laidOutW) return;
    measureLayout();
  }

  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('orientationchange', measureLayout);
  window.addEventListener('load', measureLayout);
  measureLayout();

  // =========================================================================
  // 11. HERO INTERACTIVE PHONE VIEW TOGGLE (/p/ RENTER LINK)
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
  // 12. BENTO FEATURE 1: SOCIAL POST GENERATOR TABS
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

💳 ფასი: $950 თვეში
📌 პირობები: პირველი და ბოლო თვის გადახდით + დეპოზიტი $950
🐾 შინაური ცხოველები: შეთანხმებით

📸 სრული HD ფოტოები და დეტალები იხილეთ ჭკვიან ბმულზე:
👉 rigzea.com/p/vake-loft-42

📞 WhatsApp: +995 599 12 34 56 (გიორგი)`,

    whatsapp: `მოგესალმებით, მარიამ! 🌿

თქვენი მოთხოვნის შესაბამისად, შეგირჩიეთ იდეალური ვარიანტი:

📍 ვაკე, ჭავჭავაძის გამზ.
📐 85 მ², 2 ოთახი
💵 ფასი: $950/თვე (პირველი და ბოლო თვის გადახდით)

ბინის ყველა HD ფოტო, ვიდეოტური, ზუსტი ლოკაცია და დეტალური პირობები შეგიძლიათ ნახოთ ამ ბმულზე:
👉 rigzea.com/p/vake-loft-42

თუ მოგეწონებათ, მომწერეთ და დღესვე შეგვიძლია ადგილზე ნახვა! 🤝`,

    cobroker: `სალამი, კოლეგა! 🤝 მაქვს აქტუალური ობიექტი და მზად ვარ თანამშრომლობისთვის (საკომისიოს გაყოფა 50/50):

📍 ლოკაცია: ვაკე, ჭავჭავაძე (ვაკის პარკი)
🏠 ტიპი: 2 ოთახი, 85 მ²
💵 ფასი: $950/თვე (მეპატრონე ადეკვატურია)
🔑 გასაღები: მაქვს ადგილზე

თუ გყავს რეალური კლიენტი, გადაუგზავნე ეს ჭკვიანი ბმული (მონაცემები სრულადაა):
👉 rigzea.com/p/vake-loft-42

დეტალებზე დამიკავშირდი: +995 599 12 34 56.`
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
        priceEl.textContent = targetPrice;
      });

      // the free plan keeps its own label; paid plans switch between month and year
      document.querySelectorAll('.lx-plan-period[data-monthly-period]').forEach(label => {
        if (!label.dataset.monthlyText) label.dataset.monthlyText = label.textContent;
        const isFree = label.previousElementSibling && label.previousElementSibling.dataset.yearly === label.previousElementSibling.dataset.monthly;
        label.textContent = isYearly && !isFree ? '/ წელი' : label.dataset.monthlyText;
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
          if (targetId === '#features' && !isMobileMode && wrapTop > 0) {
            if (lenis) {
              lenis.scrollTo(wrapTop, { duration: 0.8 });
            } else {
              window.scrollTo({ top: wrapTop, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            }
          } else {
            if (lenis) {
              lenis.scrollTo(targetEl, { offset: -75, duration: 0.8 });
            } else {
              const rect = targetEl.getBoundingClientRect();
              const targetY = window.pageYOffset + rect.top - 75;
              window.scrollTo({ top: targetY, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            }
          }
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
      '⚡ WhatsApp: ახალი ჯავშანი ვაკეში $950',
      '🎉 საკომისიო: +₾1,292 დაფიქსირდა',
      '📄 KA/EN ხელშეკრულება ხელმოსაწერად მზადაა',
      '👀 კლიენტმა გახსნა ჭკვიანი ბმული'
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
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=720&q=85',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=720&q=85',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=720&q=85'
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

  // 1. KokonutUI: particle-button Engine
  function createParticleBurst(x, y, count = 28) {
    const colors = ['#00f59b', '#10b981', '#ffd700', '#ffffff', '#34d399', '#6ee7b7'];
    const container = document.body;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'lx-burst-particle';
      
      const size = Math.random() * 7 + 3;
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.backgroundColor = color;
      particle.style.left = x + 'px';
      particle.style.top = y + 'px';
      particle.style.zIndex = '999999';
      particle.style.boxShadow = '0 0 ' + (size * 1.5) + 'px ' + color;

      container.appendChild(particle);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 110 + 45;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const duration = Math.random() * 600 + 450;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
          if (particle.parentNode) particle.parentNode.removeChild(particle);
          return;
        }

        // Ease out quadratic with slight gravity
        const currentX = x + vx * progress * (1 - progress * 0.4);
        const currentY = y + vy * progress + (progress * progress * 80);
        const scale = 1 - progress * 0.7;
        const opacity = 1 - Math.pow(progress, 1.8);

        particle.style.transform = 'translate(' + (currentX - x) + 'px, ' + (currentY - y) + 'px) scale(' + scale + ')';
        particle.style.opacity = opacity;

        requestAnimationFrame(update);
      }

      requestAnimationFrame(update);
    }
  }

  // Bind particle bursts to all primary & interactive buttons
  document.addEventListener('click', function(e) {
    const target = e.target.closest('.lx-btn-primary, .lx-particle-btn, .lx-copy-btn, #btn-new-task, .lx-quick-tour-btn');
    if (target) {
      const rect = target.getBoundingClientRect();
      const clickX = e.clientX || (rect.left + rect.width / 2);
      const clickY = e.clientY || (rect.top + rect.height / 2);
      createParticleBurst(clickX, clickY, 26);
    }
  });

  // 2. Micro-Toast Notification Utility
  window.showLuxuryToast = function(message) {
    let toast = document.getElementById('lx-global-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lx-global-toast';
      toast.className = 'lx-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f59b" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> <span>' + message + '</span>';
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

    tourBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        modalOpener = btn;
        modalBackdrop.classList.add('is-open');
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
      modalBackdrop.classList.remove('is-open');
      if (modalOpener) modalOpener.focus();
    });

    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => {
        modalBackdrop.classList.remove('is-open');
      });
    }

    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        modalBackdrop.classList.remove('is-open');
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
        modalBackdrop.classList.remove('is-open');
        
        const rect = modalConfirmBtn.getBoundingClientRect();
        createParticleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 36);
        
        window.showLuxuryToast('✓ ვიზიტი დაჯავშნილია (' + slotText + ')! აგენტი დაგიკავშირდებათ.');
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

