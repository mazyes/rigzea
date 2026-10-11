// Comprehensive QA Bug Hunter Audit Suite
// Tests luxury landing, renter showcase (/p/), deals pipeline, calculators, tabs, clipboard copies, modals, and console logs.
const assert = require('assert');
const path = require('path');
const { serve, launch, newPage, USERS, BASE } = require('./harness');

async function runAudit() {
  console.log('=== STARTING RIGZEA DEEP QA AUDIT ===');
  const server = await serve(4174);
  const browser = await launch();
  const testBase = 'http://localhost:4174';
  let passedCount = 0;
  let totalCount = 0;

  async function step(name, fn) {
    totalCount++;
    process.stdout.write(`• ${name}... `);
    try {
      await fn();
      console.log('PASSED ✓');
      passedCount++;
    } catch (err) {
      console.log('FAILED ✗');
      console.error(err);
      throw err;
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Landing Page (rigzea/index.html & landing-luxury.js)
    // -------------------------------------------------------------------------
    await step('1. Landing page loads with zero console errors and valid markup', async () => {
      const page = await newPage(browser);
      const errors = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', err => errors.push(String(err)));

      await page.goto(testBase + '/');
      await page.locator('.lx-hero-title').waitFor();
      assert.strictEqual(errors.length, 0, `Console errors found on landing page: ${errors.join('; ')}`);
      await page.close();
    });

    await step('2. Hero mobile mockup switches between Renter View and Agent Analytics', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/');

      const renterView = page.locator('#phone-renter-view');
      const agentView = page.locator('#phone-agent-view');
      const agentPill = page.locator('[data-phone-mode="agent"]');
      const renterPill = page.locator('[data-phone-mode="renter"]');

      await renterView.waitFor({ state: 'visible' });
      await agentPill.click();
      await agentView.waitFor({ state: 'visible' });
      assert(await agentPill.getAttribute('class').then(c => c.includes('active')));

      await renterPill.click();
      await renterView.waitFor({ state: 'visible' });
      assert(await renterPill.getAttribute('class').then(c => c.includes('active')));
      await page.close();
    });

    await step('3. Bento Feature 1: Social Post Generator tabs & copy button work cleanly', async () => {
      const page = await newPage(browser);
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto(testBase + '/');

      const postBox = page.locator('#post-preview-box');
      await postBox.waitFor();

      // Facebook tab by default
      assert((await postBox.innerText()).includes('ქირავდება'));

      // Switch to WhatsApp tab
      await page.locator('[data-post-type="whatsapp"]').click();
      assert((await postBox.innerText()).includes('მოგესალმებით მარიამ'));

      // Switch to Co-broker tab
      await page.locator('[data-post-type="cobroker"]').click();
      assert((await postBox.innerText()).includes('სალამი კოლეგა'));

      // Copy button test
      const copyBtn = page.locator('#copy-post-btn');
      await copyBtn.click();
      await page.locator('#copy-post-btn', { hasText: 'დაკოპირდა' }).waitFor();

      await page.close();
    });

    await step('4. Bento Feature 2: Bilingual Lease Agreement toggles KA, EN, and Dual modes', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/');

      const kaBtn = page.locator('[data-lease-lang="ka"]');
      const enBtn = page.locator('[data-lease-lang="en"]');
      const dualBtn = page.locator('[data-lease-lang="dual"]');

      const kaClause = page.locator('.clause-text-ka').first();
      const enClause = page.locator('.clause-text-en').first();

      // Default: KA visible
      await kaBtn.click();
      assert.strictEqual(await kaClause.isVisible(), true);
      assert.strictEqual(await enClause.isVisible(), false);

      // EN mode
      await enBtn.click();
      assert.strictEqual(await kaClause.isVisible(), false);
      assert.strictEqual(await enClause.isVisible(), true);

      // Dual mode
      await dualBtn.click();
      assert.strictEqual(await kaClause.isVisible(), true);
      assert.strictEqual(await enClause.isVisible(), true);

      await page.close();
    });

    await step('5. Bento Feature 3: Client Matchmaker simulator tabs update recommendations', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/');

      const reqText = page.locator('#match-req-text');
      const scoreBadge = page.locator('#match-score-display');

      // Vake default
      assert((await reqText.innerText()).includes('ვაკე'));

      // Switch Saburtalo
      await page.locator('[data-match-key="saburtalo"]').click();
      assert((await reqText.innerText()).includes('საბურთალო'));
      assert((await scoreBadge.innerText()).includes('96%'));

      // Switch Batumi
      await page.locator('[data-match-key="batumi"]').click();
      assert((await reqText.innerText()).includes('ბათუმი'));
      assert((await scoreBadge.innerText()).includes('99%'));

      await page.close();
    });

    await step('6. ROI Calculator: sliders and dropdown update commission and time metrics live', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/#calculator');

      const rentSlider = page.locator('#calc-rent');
      const dealsSlider = page.locator('#calc-deals');
      const splitSelect = page.locator('#calc-split');

      const monthlyUsd = page.locator('#calc-result-monthly-usd');
      const hoursSaved = page.locator('#calc-result-hours');

      // Initial defaults: Rent 800, Deals 4, Split 50% -> 800 * 4 * 0.5 = 1600 USD, 32 hours
      await page.locator('#calc-result-monthly-usd', { hasText: '$1,600' }).waitFor();
      await page.locator('#calc-result-hours', { hasText: '32 საათი' }).waitFor();

      // Adjust Rent slider to 1200
      await rentSlider.fill('1200');
      await rentSlider.dispatchEvent('input');
      // 1200 * 4 * 0.5 = 2400 USD
      await page.locator('#calc-result-monthly-usd', { hasText: '$2,400' }).waitFor();

      // Adjust Deals slider to 6
      await dealsSlider.fill('6');
      await dealsSlider.dispatchEvent('input');
      // 1200 * 6 * 0.5 = 3600 USD, 6 * 8 = 48 hours
      await page.locator('#calc-result-monthly-usd', { hasText: '$3,600' }).waitFor();
      await page.locator('#calc-result-hours', { hasText: '48 საათი' }).waitFor();

      // Adjust Split select to 25% (0.25)
      await splitSelect.selectOption('0.25');
      // 1200 * 6 * 0.25 = 1800 USD
      await page.locator('#calc-result-monthly-usd', { hasText: '$1,800' }).waitFor();

      await page.close();
    });

    await step('7. Pricing 4-Tier: monthly/yearly billing interval switch updates prices', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/#pricing');

      const monthlyBtn = page.locator('.lx-billing-toggle-pill button[data-billing="monthly"]');
      const yearlyBtn = page.locator('.lx-billing-toggle-pill button[data-billing="yearly"]');

      // Default monthly: Pro Agent is 29 GEL
      const proPrice = page.locator('.lx-plan-amount[data-monthly="29 ₾"]');
      assert.strictEqual(await proPrice.innerText(), '29 ₾');

      // Switch to yearly
      await yearlyBtn.click();
      assert.strictEqual(await proPrice.innerText(), '279 ₾');

      // Switch back to monthly
      await monthlyBtn.click();
      assert.strictEqual(await proPrice.innerText(), '29 ₾');

      await page.close();
    });

    // -------------------------------------------------------------------------
    // TEST 2: Renter Showcase (rigzea/p/index.html)
    // -------------------------------------------------------------------------
    await step('8. Renter Showcase (/p/): loads with zero errors, renders specs and gallery', async () => {
      const page = await newPage(browser);
      const errors = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', err => errors.push(String(err)));

      await page.goto(testBase + '/p/');
      await page.locator('#prop-title').waitFor();
      assert.strictEqual(errors.length, 0, `Renter showcase console errors: ${errors.join('; ')}`);

      // Verify price, address, specs rendered
      assert((await page.locator('#prop-price').innerText()).includes('$'));
      assert((await page.locator('#prop-address').innerText()).length > 5);
      assert((await page.locator('#spec-rooms').innerText()).length > 0);

      // Gallery Next/Prev
      const counter = page.locator('#gallery-counter');
      assert.strictEqual(await counter.innerText(), '1 / 6');
      await page.locator('#btn-next').click();
      assert.strictEqual(await counter.innerText(), '2 / 6');
      await page.locator('#btn-prev').click();
      assert.strictEqual(await counter.innerText(), '1 / 6');

      // Lightbox open and close
      await page.locator('.p-slide').first().click();
      await page.locator('#lightbox.open').waitFor();
      await page.locator('#lightbox-close').click();
      await page.locator('#lightbox:not(.open)').waitFor();

      // Language Switcher KA -> EN -> KA
      await page.locator('#lang-en').click();
      assert((await page.locator('#title-desc').innerText()).includes('Property Description'));
      assert((await page.locator('#btn-whatsapp-text').innerText()).includes('WhatsApp'));
      await page.locator('#lang-ka').click();
      assert((await page.locator('#title-desc').innerText()).includes('ბინის აღწერა'));

      await page.close();
    });

    // -------------------------------------------------------------------------
    // TEST 3: Deals Pipeline & Marketing Generators (rigzea/app/views-deals.js)
    // -------------------------------------------------------------------------
    await step('9. Deals CRM & Pipeline: opens with manager login, triggers deal creation and calculations', async () => {
      const page = await newPage(browser, { login: USERS.manager });
      const errors = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', err => errors.push(String(err)));

      await page.goto(testBase + '/app/#/deals');
      await page.locator('h1', { hasText: 'გარიგებები და საკომისიო' }).waitFor();
      assert.strictEqual(errors.length, 0, `Deals view console errors: ${errors.join('; ')}`);

      // Open new deal modal
      await page.locator('#btn-deal-new').click();
      await page.locator('dialog[open]').waitFor();

      // Live commission calculator inside modal
      await page.locator('input[name="client_name"]').fill('გიორგი ტესტერი');
      const dealAmountInput = page.locator('#deal-amount');
      await dealAmountInput.fill('2000');
      await dealAmountInput.dispatchEvent('input');

      const netCalc = page.locator('#deal-calc-net');
      // Default 50% of 2000 = $1,000
      assert.strictEqual(await netCalc.innerText(), '$1,000');

      // Partner agent co-brokering split
      const partnerInput = page.locator('#deal-partner');
      await partnerInput.fill('ლევანი (Realty Co)');
      await partnerInput.dispatchEvent('input');
      // 50/50 split of $1000 = $500
      assert.strictEqual(await netCalc.innerText(), '$500');

      // Submit deal
      await page.locator('dialog[open] [data-submit]').click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });

      // Verify deal card in pipeline
      await page.locator('.deal-card', { hasText: 'გიორგი ტესტერი' }).waitFor();

      // Open Client Matchmaker modal
      await page.locator('#btn-matchmaker').click();
      await page.locator('dialog[open]').waitFor();
      await page.locator('#mm-results .card').first().waitFor();
      // Close matchmaker
      await page.locator('dialog[open] [data-submit]').click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });

      await page.close();
    });

    // -------------------------------------------------------------------------
    // TEST 4: Apartment Detail with Long-term Rental (Verifies fix for #a-res)
    // -------------------------------------------------------------------------
    await step('10. Apartment Detail: verifies long-term and short-term apartments render without null pointer exception', async () => {
      const page = await newPage(browser, { login: USERS.manager });
      const errors = [];
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', err => errors.push(String(err)));

      // Go to apartments list
      await page.goto(testBase + '/app/#/apartments');
      await page.locator('#af-q').waitFor();

      // Open first apartment
      const firstAptRow = page.locator('.row').first();
      await firstAptRow.click();
      await page.locator('.crumbs').waitFor();
      assert.strictEqual(errors.length, 0, `Apartment detail console errors: ${errors.join('; ')}`);

      // Edit apartment and toggle to long_term rental
      await page.locator('#a-edit').click();
      await page.locator('dialog[open]').waitFor();
      await page.locator('dialog[open] select[name="rental_type"]').selectOption('long_term');
      await page.locator('dialog[open] [data-submit]').click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });

      // Re-render apartment detail as long-term: MUST NOT THROW (#a-res was conditional)
      await page.locator('.crumbs').waitFor();
      assert.strictEqual(errors.length, 0, `Long-term apartment detail threw null pointer: ${errors.join('; ')}`);
      assert(await page.locator('body').innerText().then(t => t.includes('გრძელვადიანი გაქირავება')));

      // Test Renter link copy button on apartment
      const shareBtn = page.locator('#btn-share-renter');
      await shareBtn.click();
      await page.locator('.toast-success').waitFor();

      // Test 1-Click Social Post Generator Modal
      await page.locator('#btn-open-post').click();
      await page.locator('dialog[open]').waitFor();
      await page.locator('#gen-output').waitFor();
      await page.locator('#gen-tab-en').click();
      assert(await page.locator('#gen-output').inputValue().then(v => v.includes('For Rent: Modern Apartment')));
      await page.locator('dialog[open] [data-submit]').click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });

      // Test Bilingual Lease Agreement Generator Modal
      await page.locator('#btn-open-lease').click();
      await page.locator('dialog[open]').waitFor();
      await page.locator('#lease-printable-area').waitFor();
      assert(await page.locator('#lease-printable-area').innerText().then(t => t.includes('RESIDENTIAL LEASE AGREEMENT')));
      await page.locator('dialog[open] [data-submit]').click();
      await page.locator('dialog[open]').waitFor({ state: 'detached' });

      await page.close();
    });

  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n=== AUDIT COMPLETE: ${passedCount}/${totalCount} TESTS PASSED ===\n`);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
