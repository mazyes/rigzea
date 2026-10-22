const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { serve, launch, newPage } = require('./harness');

(async () => {
  const server = await serve(4182);
  let browser;
  const base = 'http://localhost:4182';
  try {
    browser = await launch();
    const page = await newPage(browser);
    await page.goto(base + '/?utm_source=test&utm_campaign=launch');
    assert.equal(await page.evaluate(() => window.RigzeaCampaign()), undefined);
    await page.getByRole('button', { name: 'არ ვეთანხმები', exact: true }).click();
    await page.locator('.st-cookie').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('rigzea_campaign')), null);
    await page.getByRole('button', { name: 'ქუქიების პარამეტრები', exact: true }).click();
    await page.getByRole('button', { name: 'ვეთანხმები', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.RigzeaCampaign()), { utm_source: 'test', utm_campaign: 'launch' });
    await page.locator('.st-search-button').click();
    await page.locator('#site-search-query').fill('ბინ');
    await page.getByRole('button', { name: 'მოძებნე', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.st-search [role="status"]').textContent.startsWith('ნაპოვნია:'));
    assert(await page.locator('.st-search-results a').count() > 0);
    await page.locator('#site-search-query').fill('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'მოძებნე', exact: true }).click();
    await page.getByText('ვერაფერი მოიძებნა. სცადე სხვა სიტყვა.').waitFor();
    assert.equal(await page.locator('.st-search-results img').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.st-search-button').evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => !document.querySelector('.st-floating button').hidden);
    assert(await page.locator('.st-progress').evaluate(el => Number(getComputedStyle(el).transform.split(',')[0].slice(7)) > .9));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.st-floating button').click();
    assert.equal(await page.evaluate(() => scrollY), 0);
    for (const route of ['/', '/features/', '/pricing/', '/faq/']) {
      await page.goto(base + route);
      await page.locator('.st-cookie').waitFor({ state: 'hidden' });
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'rigzea-tools-desktop.png') });
    await page.goto(base + '/signup/');
    assert.equal((await page.evaluate(() => window.RigzeaCampaign())).utm_source, 'test');
    const password = page.locator('input[name="password"]');
    await password.fill('sample-password');
    const toggle = page.locator('.st-password-toggle').first();
    await toggle.click();
    assert.equal(await password.getAttribute('type'), 'text');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await toggle.click();
    assert.equal(await password.getAttribute('type'), 'password');
    assert.equal(await password.inputValue(), 'sample-password');
    await page.evaluate(() => {
      window.supabaseClient.auth.signUp = async payload => {
        window.signupPayload = payload;
        return { error: { message: 'Test failure' } };
      };
    });
    await page.locator('input[name="name"]').fill('ტესტი');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('#signup-agree').check();
    await page.locator('form button[type="submit"]').click();
    await page.waitForFunction(() => !!window.signupPayload);
    assert.equal(await page.evaluate(() => window.signupPayload.options.data.campaign.utm_source), 'test');
    assert.equal(await page.locator('.form-error').isVisible(), true);
    assert.deepEqual(page.errors.splice(0), ['{message: Test failure}']);
    await page.goto(base + '/reset-password/');
    assert.equal(await page.locator('.st-password-toggle').count(), 2);
    await page.goto(base + '/app/');
    assert.equal(await page.locator('.st-password-toggle').count(), 4);
    await page.goto(base + '/');
    await page.getByRole('button', { name: 'ქუქიების პარამეტრები', exact: true }).click();
    await page.getByRole('button', { name: 'არ ვეთანხმები', exact: true }).click();
    assert.equal(await page.evaluate(() => window.RigzeaCampaign()), undefined);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('rigzea_campaign')), null);
    assert.deepEqual(page.errors, []);

    const mobile = await newPage(browser, { viewport: { width: 375, height: 812 } });
    await mobile.goto(base + '/');
    await mobile.screenshot({ path: path.join(os.tmpdir(), 'rigzea-tools-mobile-banner.png') });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.getByRole('button', { name: 'არ ვეთანხმები', exact: true }).click();
    await mobile.locator('#theme-toggle').click();
    await mobile.locator('.st-search-button').click();
    await mobile.screenshot({ path: path.join(os.tmpdir(), 'rigzea-tools-mobile-search.png') });
    await mobile.route('**/features/', route => route.abort());
    await mobile.locator('#site-search-query').fill('ბინ');
    await mobile.getByRole('button', { name: 'მოძებნე', exact: true }).click();
    await mobile.getByText('ძიება ვერ მოხერხდა. სცადე ხელახლა.').waitFor();
    await mobile.unroute('**/features/');
    await mobile.getByRole('button', { name: 'მოძებნე', exact: true }).click();
    await mobile.waitForFunction(() => document.querySelector('.st-search [role="status"]').textContent.startsWith('ნაპოვნია:'));
    await mobile.keyboard.press('Escape');
    await mobile.setViewportSize({ width: 320, height: 740 });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mobile.emulateMedia({ media: 'print' });
    assert.equal(await mobile.locator('.st-floating').isVisible(), false);

    const blocked = await newPage(browser);
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = Storage.prototype.setItem = Storage.prototype.removeItem = () => { throw new Error('blocked'); };
    });
    await blocked.goto(base + '/');
    await blocked.getByRole('button', { name: 'არ ვეთანხმები', exact: true }).click();
    await blocked.locator('.st-cookie').waitFor({ state: 'hidden' });
    assert.equal(await blocked.evaluate(() => window.RigzeaCampaign()), undefined);
    console.log('Site tools: consent, attribution, search/retry, keyboard, password controls, mobile and print passed.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
