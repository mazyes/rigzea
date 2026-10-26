const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { serve, launch, newPage } = require('./harness');

// Composite ancestor surfaces so transparent buttons are checked against their actual background.
async function colors(page, selectors) {
  return page.evaluate(selectors => {
    const rgb = value => value.match(/[\d.]+/g).map(Number);
    const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = c => c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => {
      const x = luminance(a), y = luminance(b);
      return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
    };
    return selectors.map(selector => {
      const el = document.querySelector(selector);
      const style = getComputedStyle(el);
      const ancestors = [];
      for (let p = el; p; p = p.parentElement) ancestors.unshift(p);
      const bg = ancestors.reduce((bg, node) => over(rgb(getComputedStyle(node).backgroundColor), bg), [255, 255, 255]);
      const fg = over(rgb(style.color), bg);
      const focus = rgb(style.getPropertyValue('--st-focus').trim().startsWith('#')
        ? (() => { const hex = style.getPropertyValue('--st-focus').trim().slice(1); return `rgb(${[0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')})`; })()
        : style.getPropertyValue('--st-focus').trim());
      return { selector, text: contrast(fg, bg), focus: contrast(focus, bg), radius: style.borderRadius };
    });
  }, selectors);
}

(async () => {
  const server = await serve(4184);
  let browser;
  try {
    browser = await launch();
    const page = await newPage(browser);
    await page.goto('http://localhost:4184/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const results = [];
    for (const theme of ['dark', 'light']) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
      await page.waitForTimeout(350); // Measure the selected theme after existing color transitions settle.
      const measurements = await colors(page, ['.st-cookie', '.st-accept', '.st-actions button', '.st-search-button', '.lx-hero-desc', '.lx-nav-link', '.lx-problem-list span', '.lx-showcase-copy p', '.lx-step-card p', '.lx-footer-copy', '.lx-footer-links a', '.lx-footer-legal a', '.lx-story-intro h2', '.lx-story-tab[aria-selected="false"]']);
      for (const item of measurements) assert(item.text >= 4.5, `${theme} ${item.selector}: text contrast ${item.text}`);
      // The ring sits outside the control, against the surrounding surface.
      const surface = (await colors(page, ['.st-cookie']))[0];
      assert(surface.focus >= 3, `${theme}: focus contrast ${surface.focus}`);
      await page.locator('.st-search-button').click();
      const input = (await colors(page, ['.st-search input']))[0];
      assert(input.text >= 4.5 && input.focus >= 3, `${theme}: search input contrast`);
      await page.keyboard.press('Escape');
      results.push({ theme, measurements, input });
    }
    await page.getByRole('button', { name: 'არ ვეთანხმები', exact: true }).click();
    assert.equal(await page.locator('.st-progress, .lx-progress').count(), 1);
    assert.equal(await page.locator('main > section').count(), 6);
    assert.equal(await page.locator('.lx-story-section').count(), 1);
    assert.equal(await page.locator('#features-grid, #pricing-grid, #faq, #comparison, #tour-modal-backdrop').count(), 0);
    assert.deepEqual(await page.locator('a[href^="#"]').evaluateAll(links => links.filter(a => a.hash && !document.getElementById(a.hash.slice(1))).map(a => a.hash)), []);
    assert.equal(await page.locator('img:not([alt])').count(), 0);
    assert.equal(await page.locator('h1').count(), 1);
    const expectedNav = await page.locator('#main-nav').innerHTML();
    for (const route of ['/features/', '/pricing/', '/faq/']) {
      await page.goto('http://localhost:4184' + route);
      assert.equal(await page.locator('#main-nav').innerHTML(), expectedNav, `${route}: consistent navigation`);
    }
    await page.goto('http://localhost:4184/');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert(await page.locator('.lx-step-card').evaluateAll(els => els.every(el => getComputedStyle(el).opacity === '1')), 'steps stay visible without a reveal animation');
      if (width <= 700) assert(await page.locator('.lx-step-card').evaluateAll(els => els.every(el => el.getBoundingClientRect().height < 240)), 'compact mobile steps');
      for (const theme of ['dark', 'light']) {
        await page.evaluate(t => { document.documentElement.dataset.theme = t; }, theme);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme}: overflow`);
        for (const control of await page.locator('.lx-header-actions button').all()) {
          const box = await control.boundingBox();
          if (box) assert(box.width >= 44 && box.height >= 44, `${width}: ${await control.getAttribute('class')} touch target ${box.width}x${box.height}`);
        }
        if (width === 1440 || width === 390) {
          await page.screenshot({ path: path.join(os.tmpdir(), `rigzea-refined-${theme}-${width}.png`), fullPage: true });
        }
      }
    }
    console.log(JSON.stringify(results.map(r => ({ theme: r.theme, textContrastMin: Math.min(...r.measurements.map(m => m.text), r.input.text).toFixed(2), searchFocusContrast: r.input.focus.toFixed(2) }))));
    assert.deepEqual(page.errors, []);
    console.log('Landing themes: text/focus contrast, 4 viewport widths, touch targets, structure and single progress bar passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
