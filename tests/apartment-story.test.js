const assert = require('assert');
const { serve, launch, newPage } = require('./harness');

async function run() {
  const server = await serve(4190);
  const browser = await launch();
  try {
    const page = await newPage(browser);
    await page.goto('http://localhost:4190/');
    assert.strictEqual(await page.locator('#lx-story-title').innerText(), 'ერთი ბინა, სამი ხედვა.');
    assert.strictEqual(await page.getByRole('tab').count(), 3);
    assert.strictEqual(await page.locator('#lx-story-panel-agent').isVisible(), true);
    assert.strictEqual(await page.locator('#lx-story-panel-owner').isVisible(), false);

    await page.getByRole('tab', { name: 'მესაკუთრე' }).click();
    assert.strictEqual(await page.locator('#lx-story-panel-owner').isVisible(), true);
    assert.strictEqual(await page.locator('#lx-story-panel-agent').isVisible(), false);
    await page.getByRole('tab', { name: 'მესაკუთრე' }).press('ArrowRight');
    assert.strictEqual(await page.getByRole('tab', { name: 'კლიენტი' }).getAttribute('aria-selected'), 'true');
    assert.strictEqual(await page.locator('#lx-story-panel-client').isVisible(), true);
    assert.strictEqual(await page.locator('#lx-story-panel-client img').evaluate(img => img.complete && img.naturalWidth > 0), true);

    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Horizontal overflow at ${width}px`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.strictEqual(await page.locator('#lx-story-panel-client').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepStrictEqual(page.errors, []);
    await page.close();

    const english = await newPage(browser);
    await english.addInitScript(() => localStorage.setItem('rigzea_lang', 'en'));
    await english.goto('http://localhost:4190/');
    await english.waitForFunction(() => document.documentElement.lang === 'en' && document.querySelector('#lx-story-title')?.textContent === 'One apartment, three views.');
    assert.strictEqual(await english.getByRole('tab', { name: 'Owner' }).count(), 1);
    await english.getByRole('tab', { name: 'Client' }).click();
    assert.strictEqual(await english.locator('#lx-story-panel-client').isVisible(), true);
    assert.deepStrictEqual(english.errors, []);
    await english.close();
    console.log('Apartment story: views, keyboard, localization, image, reduced motion and responsive widths passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
