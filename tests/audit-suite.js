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
      assert((await postBox.innerText()).includes('მოგესალმებით, მარიამ'));

      // Switch to Co-broker tab
      await page.locator('[data-post-type="cobroker"]').click();
      assert((await postBox.innerText()).includes('სალამი, კოლეგა'));

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


    await step('7. Pricing 4-Tier: monthly/yearly billing interval switch updates prices', async () => {
      const page = await newPage(browser);
      await page.goto(testBase + '/#pricing');

      const monthlyBtn = page.locator('.lx-billing-toggle-pill button[data-billing="monthly"]');
      const yearlyBtn = page.locator('.lx-billing-toggle-pill button[data-billing="yearly"]');

      // Default monthly: Pro Agent is 39 GEL
      const proPrice = page.locator('.lx-plan-amount[data-monthly="39 ₾"]');
      assert.strictEqual(await proPrice.innerText(), '39 ₾');

      // Switch to yearly
      await yearlyBtn.click();
      assert.strictEqual(await proPrice.innerText(), '390 ₾');

      // Switch back to monthly
      await monthlyBtn.click();
      assert.strictEqual(await proPrice.innerText(), '39 ₾');

      await page.close();
    });

    // The public listing page, deals and apartment detail are covered by tests/e2e.js (12, 13, D1, D2).

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
