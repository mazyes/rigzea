const assert = require('assert');
const { serve, launch, newPage, BASE } = require('./harness');

async function run() {
  console.log('=== MULTI-PAGE ARCHITECTURE TEST SUITE ===');
  const server = await serve(4180);
  const browser = await launch();
  const testBase = 'http://localhost:4180';

  try {
    // 1. /pricing/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/pricing/');
      assert.strictEqual(await page.locator('h1').innerText(), 'აირჩიე შენზე მორგებული ნაკრები');
      assert.strictEqual(await page.locator('.lx-pricing-card').count(), 4);
      // Toggle billing
      const yearlyBtn = page.locator('.lx-billing-toggle-pill button[data-billing="yearly"]');
      await yearlyBtn.click();
      const proPrice = page.locator('.lx-plan-amount[data-monthly="39 ₾"]');
      for (let i = 0; i < 30 && (await proPrice.innerText()) !== '390 ₾'; i++) await new Promise(r => setTimeout(r, 50));
      assert.strictEqual(await proPrice.innerText(), '390 ₾');
      assert.strictEqual(page.errors.length, 0, `Errors on /pricing/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 1. /pricing/ loads with 4 tiers and interactive billing toggle');
    }

    // 2. /features/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/features/');
      assert.strictEqual(await page.locator('h1').innerText(), 'გაიმარტივე საბროკერო ყოველდღიურობა');
      assert.strictEqual(await page.locator('.lx-bento-card').count(), 4);
      // Test matchmaker tabs
      await page.locator('[data-match-key="batumi"]').click();
      assert((await page.locator('#match-req-text').innerText()).includes('ბათუმი'));
      assert.strictEqual(page.errors.length, 0, `Errors on /features/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 2. /features/ loads with 4 bento feature cards and working tabs');
    }

    // 3. /faq/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/faq/');
      assert.strictEqual(await page.locator('h1').innerText(), 'ხშირად დასმული კითხვები');
      assert((await page.locator('.lx-faq-item').count()) >= 5);
      assert.strictEqual(page.errors.length, 0, `Errors on /faq/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 3. /faq/ loads with accordion questions');
    }

    // 4. /signin/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/signin/');
      await page.locator('#form-signin').waitFor();
      await page.fill('#form-signin input[name=email]', 'manager@rigzea.test');
      await page.fill('#form-signin input[name=password]', 'wrong');
      await page.click('#form-signin [type=submit]');
      await page.locator('#form-signin .form-error', { hasText: 'არასწორია' }).waitFor();
      // Valid credentials
      await page.fill('#form-signin input[name=password]', 'test1234');
      await page.click('#form-signin [type=submit]');
      await page.waitForURL('**/app/#/today', { timeout: 8000 });
      assert.strictEqual(page.errors.length, 0, `Errors on /signin/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 4. /signin/ authenticates and redirects to /app/#/today');
    }

    // 5. /signup/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/signup/');
      await page.locator('#form-signup').waitFor();
      assert.strictEqual(await page.locator('#form-signup h1').innerText(), 'ანგარიშის შექმნა');
      assert.strictEqual(page.errors.length, 0, `Errors on /signup/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 5. /signup/ renders registration form cleanly');
    }

    // 6. /reset-password/
    {
      const page = await newPage(browser);
      await page.goto(testBase + '/reset-password/');
      await page.locator('#form-reset').waitFor();
      assert.strictEqual(page.errors.length, 0, `Errors on /reset-password/: ${page.errors.join('; ')}`);
      await page.close();
      console.log('✓ 6. /reset-password/ renders reset form cleanly');
    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n=== ALL MULTI-PAGE ARCHITECTURE TESTS PASSED ✓ ===\n');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
