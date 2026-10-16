/**
 * RIGZEA 3.0 - LUXURY MOTION & INTERACTION ENGINE
 * Elite Creative-Technologist Motion Suite
 * Lenis Smooth Scroll + GSAP 3.12 + ScrollTrigger Architecture
 * 
 * Features:
 * 1. Lenis 1.1 + GSAP ScrollTrigger Integration with Hardware rAF Synced Ticker
 * 2. Magnetic Button Physics with 2.5D Multilayer Depth (.lx-btn-primary, .lx-btn-secondary)
 * 3. Dynamic 3D Perspective Tilt on the Phone Mockup (cards stay still)
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
    let nearBottom = false;
    if (finalCta) {
      const rect = finalCta.getBoundingClientRect();
      nearBottom = rect.top < window.innerHeight - 80;
    }
    thumbBar.classList.toggle('is-visible', heroPassed && !nearBottom);
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

  // Unified scroll handler for header, parallax, and thumb bar
  const onPageScroll = () => {
    const y = window.scrollY;
    updateHeader(y);
    updateThumbBar(y);
    updateParallax(y);
  };
  window.addEventListener('scroll', onPageScroll, { passive: true });
  window.addEventListener('resize', () => updateThumbBar(window.scrollY), { passive: true });
  if (lenis) {
    lenis.on('scroll', (e) => {
      const y = typeof e.scroll === 'number' ? e.scroll : window.scrollY;
      updateHeader(y);
      updateThumbBar(y);
      updateParallax(y);
    });
  }
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
      const restRotX = 0.0;
      const restRotY = 0.0;
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
  // 9. LANDO-STYLE 3D SCROLL EXPERIENCE
  //    9A hero 3D stage · 9B scroll-drawn track · 9C velocity tilt
  //    9D kinetic ribbons · 9E sticky 3D card stack
  //    Only transform/opacity are animated. Skipped for prefers-reduced-motion.
  // =========================================================================
  const hasScrollFx = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const clampNum = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 9B. Track line: build the path from the real page size (used by static + animated modes)
  const trackLayout = document.querySelector('.luxury-layout');
  const trackSvg = document.querySelector('.lx-track-svg');
  const trackPaths = trackSvg ? Array.from(trackSvg.querySelectorAll('path')) : [];
  let trackTween = null;

  function buildTrackLine() {
    if (!trackLayout || !trackSvg || !trackPaths.length) return;
    const W = trackLayout.clientWidth;
    const H = trackLayout.scrollHeight;
    if (W < 700 || H < 600) { trackSvg.style.display = 'none'; return; }
    trackSvg.style.display = '';
    trackSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const xLeft = W * 0.04;
    const xRight = W * 0.96;
    const segs = Math.max(4, Math.round(H / 950));
    const step = (H - 140) / segs;
    let x = xRight;
    let d = `M ${x.toFixed(1)} 70`;
    for (let i = 0; i < segs; i++) {
      const y0 = 70 + i * step;
      const y1 = y0 + step;
      const nx = x === xRight ? xLeft : xRight;
      d += ` C ${x.toFixed(1)} ${(y0 + step * 0.5).toFixed(1)}, ${nx.toFixed(1)} ${(y0 + step * 0.5).toFixed(1)}, ${nx.toFixed(1)} ${y1.toFixed(1)}`;
      x = nx;
    }
    trackPaths.forEach(p => p.setAttribute('d', d));

    if (trackTween) {
      if (trackTween.scrollTrigger) trackTween.scrollTrigger.kill();
      trackTween.kill();
      trackTween = null;
    }

    if (prefersReducedMotion || !hasScrollFx) {
      // Static: whole line visible, no animation
      trackPaths.forEach(p => { p.style.strokeDasharray = 'none'; p.style.strokeDashoffset = '0'; });
      return;
    }

    const len = Math.ceil(trackPaths[0].getTotalLength());
    trackPaths.forEach(p => { p.style.strokeDasharray = `${len}`; p.style.strokeDashoffset = `${len}`; });
    trackTween = window.gsap.to(trackPaths, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: { trigger: trackLayout, start: 'top top', end: 'bottom bottom', scrub: 0.5 }
    });
  }

  let trackResizeTimer = null;
  function scheduleTrackRebuild() {
    clearTimeout(trackResizeTimer);
    trackResizeTimer = setTimeout(buildTrackLine, 220);
  }
  buildTrackLine();
  window.addEventListener('resize', scheduleTrackRebuild);
  window.addEventListener('load', () => {
    buildTrackLine();
    if (hasScrollFx) window.ScrollTrigger.refresh();
  });
  if (typeof ResizeObserver !== 'undefined' && trackLayout) {
    new ResizeObserver(scheduleTrackRebuild).observe(trackLayout);
  }

  if (hasScrollFx && !prefersReducedMotion) {
    const gs = window.gsap;
    const mm = gs.matchMedia();

    // 9A. Hero 3D stage: phone straightens on scroll, badges/ghost move at different depths
    const heroSection = document.querySelector('.lx-hero');
    const stagePhone = document.querySelector('.lx-stage-phone');
    const stageGhost = document.querySelector('.lx-stage-ghost');
    const stageBadges = Array.from(document.querySelectorAll('.lx-float-badge'));
    const badgeDepth = [1.0, 1.5, 2.1];

    if (heroSection && stagePhone) {
      mm.add('(min-width: 901px)', () => {
        const st = { mx: 0, my: 0, cx: 0, cy: 0, prog: 0, visible: true };

        gs.fromTo(stagePhone,
          { rotateX: 14, rotateY: -16, rotateZ: 3, scale: 1 },
          {
            rotateX: 0, rotateY: 0, rotateZ: 0, scale: 1.06, ease: 'none',
            scrollTrigger: {
              trigger: heroSection, start: 'top top', end: 'bottom 35%', scrub: 0.6,
              onUpdate: (self) => { st.prog = self.progress; }
            }
          }
        );

        const io = new IntersectionObserver((entries) => { st.visible = entries[0].isIntersecting; });
        io.observe(heroSection);

        const onMove = (e) => {
          const r = heroSection.getBoundingClientRect();
          st.mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
          st.my = ((e.clientY - r.top) / r.height - 0.5) * 2;
        };
        const onLeave = () => { st.mx = 0; st.my = 0; };
        if (!isCoarse) {
          heroSection.addEventListener('pointermove', onMove, { passive: true });
          heroSection.addEventListener('pointerleave', onLeave);
        }

        const layerTick = () => {
          if (!st.visible) return;
          st.cx += (st.mx - st.cx) * 0.08;
          st.cy += (st.my - st.cy) * 0.08;
          if (stageGhost) {
            stageGhost.style.transform = `translate3d(${(-st.cx * 18).toFixed(1)}px, ${(-st.cy * 12 - st.prog * 70).toFixed(1)}px, -150px)`;
          }
          stageBadges.forEach((b, i) => {
            const dp = badgeDepth[i] || 1;
            b.style.transform = `translate3d(${(st.cx * 26 * dp).toFixed(1)}px, ${(st.cy * 20 * dp - st.prog * 90 * dp).toFixed(1)}px, 80px)`;
          });
        };
        gs.ticker.add(layerTick);

        return () => {
          gs.ticker.remove(layerTick);
          io.disconnect();
          heroSection.removeEventListener('pointermove', onMove);
          heroSection.removeEventListener('pointerleave', onLeave);
          if (stageGhost) stageGhost.style.transform = '';
          stageBadges.forEach(b => { b.style.transform = ''; });
        };
      });
    }

    // 9C + 9D share one smoothed, signed scroll velocity (px per 60fps frame)
    let lastScrollY = window.scrollY;
    let scrollVel = 0;

    // 9C. Velocity tilt on headings / grids (max ±4deg, springs back via LERP)
    const tiltEls = isCoarse ? [] : Array.from(document.querySelectorAll('.lx-section-header, .lx-steps-grid-3, .lx-pricing-grid-4'));
    tiltEls.forEach(el => el.classList.add('lx-fx-tilt'));
    let tiltCur = 0;
    let tiltActive = false;

    // 9D. Kinetic ribbons: clone the text group until the loop is seamless
    const ribbonState = Array.from(document.querySelectorAll('.lx-ribbon')).map(r => {
      const track = r.querySelector('.lx-ribbon-track');
      const group = track && track.querySelector('.lx-ribbon-group');
      return { r, track, group, dir: r.dataset.dir === 'right' ? 1 : -1, base: parseFloat(r.dataset.speed) || 60, x: 0, w: 0, visible: true };
    }).filter(o => o.track && o.group);

    function measureRibbons() {
      ribbonState.forEach(o => {
        o.track.querySelectorAll('.lx-ribbon-group[data-clone]').forEach(c => c.remove());
        o.w = o.group.offsetWidth;
        if (!o.w) return;
        const need = Math.ceil((o.r.offsetWidth + o.w) / o.w);
        for (let i = 0; i < need; i++) {
          const c = o.group.cloneNode(true);
          c.setAttribute('data-clone', '');
          c.setAttribute('aria-hidden', 'true');
          o.track.appendChild(c);
        }
        if (o.x <= -o.w || o.x > 0) o.x = -o.w / 2;
      });
    }
    measureRibbons();
    window.addEventListener('resize', measureRibbons);
    window.addEventListener('load', measureRibbons);
    const ribbonIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const o = ribbonState.find(s => s.r === e.target);
        if (o) o.visible = e.isIntersecting;
      });
    });
    ribbonState.forEach(o => ribbonIO.observe(o.r));

    gs.ticker.add((time, deltaMs) => {
      const dtMs = Math.max(deltaMs || 16.667, 1);
      const y = window.scrollY;
      const raw = (y - lastScrollY) * (16.667 / dtMs);
      lastScrollY = y;
      scrollVel += (raw - scrollVel) * 0.2;

      // 9C
      if (tiltEls.length) {
        const target = clampNum(scrollVel * 0.1, -4, 4);
        tiltCur += (target - tiltCur) * 0.12;
        if (Math.abs(tiltCur) < 0.01) {
          if (tiltActive) { tiltEls.forEach(el => { el.style.transform = ''; }); tiltActive = false; }
        } else {
          tiltActive = true;
          const t = `perspective(1000px) rotateX(${tiltCur.toFixed(2)}deg) skewY(${(tiltCur * 0.6).toFixed(2)}deg)`;
          tiltEls.forEach(el => { el.style.transform = t; });
        }
      }

      // 9D
      const boost = 1 + Math.min(Math.abs(scrollVel) * 0.12, 5);
      ribbonState.forEach(o => {
        if (!o.visible || !o.w) return;
        o.x += o.dir * o.base * boost * (dtMs / 1000);
        if (o.x <= -o.w) o.x += o.w;
        else if (o.x > 0) o.x -= o.w;
        o.track.style.transform = `translate3d(${o.x.toFixed(1)}px, 0, 0)`;
      });
    });

    // 9E. Sticky 3D card stack (desktop): the previous card sinks back as the next one slides over it
    const stackEl = document.querySelector('#features-stack');
    if (stackEl) {
      mm.add('(min-width: 901px)', () => {
        const items = Array.from(stackEl.querySelectorAll('.lx-stack-item'));
        const docTop = () => stackEl.getBoundingClientRect().top + window.scrollY;
        const stickTop = (it) => parseFloat(getComputedStyle(it).top) || 0;
        const gapOf = (it) => parseFloat(getComputedStyle(it).marginBottom) || 0;
        // Natural (un-stuck) top of item j, relative to the stack container
        const naturalTop = (j) => {
          let t = 0;
          for (let k = 0; k < j; k++) t += items[k].offsetHeight + gapOf(items[k]);
          return t;
        };

        items.forEach((item, i) => {
          const next = items[i + 1];
          if (!next) return;
          const shade = item.querySelector('.lx-stack-shade');
          const tl = gs.timeline({
            scrollTrigger: {
              // next card top touches the bottom of the stuck card -> reaches its own stuck position
              start: () => docTop() + naturalTop(i + 1) - (stickTop(item) + item.offsetHeight + gapOf(item)),
              end: () => docTop() + naturalTop(i + 1) - stickTop(next),
              scrub: true,
              invalidateOnRefresh: true
            }
          });
          tl.to(item, { scale: 0.93, y: -20, rotateX: 4, transformPerspective: 1200, transformOrigin: '50% 0%', ease: 'none' }, 0);
          if (shade) tl.to(shade, { opacity: 0.5, ease: 'none' }, 0);
        });
      });
    }
  }


  // =========================================================================
  // 10. SCROLL EVENT LISTENER (Header & Parallax)
  // =========================================================================
  function handleScrollUpdate(scrollY) {
    if (typeof updateHeader === 'function') updateHeader(scrollY);
    if (typeof updateParallax === 'function') updateParallax(scrollY);
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
    facebook: `🔥 ქირავდება ბინა ვაკეში, ჭავჭავაძის გამზ.
📐 85 მ² | 2 ოთახი | $950/თვე
📸 ფოტოები: rigzea.com/p/vake-loft-42
📞 WhatsApp: +995 599 12 34 56`,

    whatsapp: `მოგესალმებით, მარიამ! 🌿
📍 ვაკე · 85 მ² · $950/თვე
👉 ფოტოები და პირობები: rigzea.com/p/vake-loft-42`,

    cobroker: `სალამი, კოლეგა! 🤝 საკომისიო 50/50:
📍 ვაკე · 2 ოთახი · $950/თვე
👉 rigzea.com/p/vake-loft-42`
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

