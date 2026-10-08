// End-to-end UI flows against the in-browser Supabase mock.
// Run: NODE_PATH=$(npm root -g) node tests/e2e.js
const assert = require('assert');
const path = require('path');
const { serve, launch, newPage, USERS, BASE } = require('./harness');

const DESKTOP = { width: 1366, height: 860 };
const PHONE = { width: 375, height: 740 };
const FIXTURE = path.join(__dirname, 'fixture-receipt.png');
require('fs').writeFileSync(FIXTURE, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rigzea_mockdb')));
const fail = (page, key, n = 1) => page.evaluate(([k, c]) => { const f = JSON.parse(localStorage.getItem('rigzea_mock_fail') || '{}'); f[k] = c; localStorage.setItem('rigzea_mock_fail', JSON.stringify(f)); }, [key, n]);

async function pickApartment(page, name) {
  const input = page.locator('dialog[open] [data-picker="apartment_id"] input');
  await input.fill(name.slice(0, 8));
  await page.locator('dialog[open] .picker-list li', { hasText: name }).first().dispatchEvent('mousedown');
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('1. manager sees real tasks needing attention on Today', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const alerts = page.locator('.alert-row');
  await alerts.first().waitFor();
  const text = await page.locator('.cols').first().innerText();
  assert(text.includes('სარეცხი მანქანის შემოწმება'), 'overdue task listed');
  assert(text.includes('ვადა გადაცილებულია'), 'overdue reason shown');
  assert(text.includes('მფლობელი 18 საათია არ პასუხობს'), 'owner waiting time shown');
  assert(text.includes('Check-in'), 'check-in in schedule');
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), 'no raw ids in UI');
  return page;
});

test('2. filter tasks and open the correct task and apartment', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('[data-filter="unassigned"]').click();
  await page.locator('.row', { hasText: 'კონდიციონერი არ აგრილებს' }).waitFor();
  await page.goto(BASE + '/app/#/tasks');
  await page.locator('#tf-type').selectOption('cleaning');
  const rows = page.locator('#view .rows .row');
  assert.strictEqual(await rows.count(), 1);
  await rows.first().click();
  await page.locator('#drawer-title', { hasText: 'დასუფთავება სტუმრების შემდეგ' }).waitFor();
  assert(page.url().includes('?task=eeeeeeee-0000-4000-8000-000000000001'));
  await page.locator('.drawer a', { hasText: 'Orbi City · 1204' }).click();
  await page.getByRole('heading', { name: 'Orbi City · 1204' }).waitFor();
  assert(page.url().endsWith('#/apartments/dddddddd-0000-4000-8000-000000000001'));
  return page;
});

test('3. create and assign a task once, even with double submit and a failed save', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/#/tasks');
  await page.locator('#view .rows').waitFor();
  await page.locator('#btn-new-task').click();
  await page.locator('dialog[open] input[name=type][value=repair]').check({ force: true });
  await pickApartment(page, 'ძველი ბათუმი · 5');
  await page.locator('dialog[open] input[name=title]').fill('ნათურის გამოცვლა');
  const giorgi = await page.locator('dialog[open] select[name=assigned_to] option', { hasText: 'გიორგი' }).getAttribute('value');
  await page.locator('dialog[open] select[name=assigned_to]').selectOption(giorgi);
  // First attempt fails at the network level
  await fail(page, 'insert:tasks');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open] .form-error:not([hidden])').waitFor();
  assert.strictEqual(await page.locator('dialog[open] input[name=title]').inputValue(), 'ნათურის გამოცვლა', 'values kept after failure');
  // Retry with a double click
  await page.locator('dialog[open] [data-submit]').dblclick();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.toast-success', { hasText: 'საქმე შეიქმნა' }).waitFor();
  const tasks = (await db(page)).tables.tasks.filter(t => t.title === 'ნათურის გამოცვლა');
  assert.strictEqual(tasks.length, 1, 'exactly one task');
  assert.strictEqual(tasks[0].status, 'assigned');
  await page.locator('.row', { hasText: 'ნათურის გამოცვლა' }).waitFor();
  return page;
});

test('4. staff completes the assigned job checklist on a phone', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.staff });
  await page.goto(BASE + '/app/');
  await page.waitForURL('**/staff/**');
  await page.locator('.job', { hasText: 'Orbi City · 1204' }).click();
  await page.locator('text=4821#').waitFor(); // access details visible
  await page.locator('[data-move="in_progress"]').click();
  await page.locator('[data-move="done"]').waitFor();
  for (let i = 0; i < 3; i++) {
    await page.locator(`[data-check="${i}"]`).check();
    await page.locator(`[data-check="${i}"]:not([disabled])`).waitFor();
  }
  await page.locator('input[data-phase="after"]').setInputFiles(FIXTURE);
  await page.locator('.photo').first().waitFor();
  const box = await page.locator('[data-move="done"]').boundingBox();
  assert(box.height >= 44, 'touch target ≥ 44px');
  await page.locator('[data-move="done"]').click();
  await page.locator('.toast-success', { hasText: 'სამუშაო დასრულდა' }).waitFor();
  const t = (await db(page)).tables.tasks.find(x => x.id === 'eeeeeeee-0000-4000-8000-000000000001');
  assert.strictEqual(t.status, 'done');
  assert(t.checklist.every(i => i.done));
  // Staff never sees tasks assigned to others
  await page.locator('.group-title').first().waitFor();
  assert(!(await page.locator('body').innerText()).includes('კონდიციონერი'), 'no other people\'s jobs');
  return page;
});

test('5. manager requests owner approval and sees its status', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/#/owners');
  await page.locator('#o-appr').click();
  await pickApartment(page, 'Orbi City · 1204');
  await page.locator('dialog[open] [data-owner]', { hasText: 'დავით' }).waitFor();
  await page.locator('dialog[open] input[name=title]').fill('მაცივრის გამოცვლა');
  await page.locator('dialog[open] input[name=amount]').fill('650');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.row', { hasText: 'მაცივრის გამოცვლა' }).locator('.badge', { hasText: 'ელოდება პასუხს' }).waitFor();
  const d = await db(page);
  const appr = d.tables.approvals.find(a => a.title === 'მაცივრის გამოცვლა');
  const exp = d.tables.expenses.find(e => e.approval_id === appr.id);
  assert.strictEqual(exp.status, 'proposed', 'cost stays proposed until approval');
  return page;
});

test('6. owner sees confirmation only after the server records the decision', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.goto(BASE + '/approve/?token=tok-pending-1');
  await page.locator('h1', { hasText: 'ონკანის გამოცვლა' }).waitFor();
  const body = await page.locator('body').innerText();
  assert(!/4821|sea-view|კარის კოდი/.test(body), 'no access secrets on public page');
  await page.locator('[data-d="approved"]').click();
  await fail(page, 'rpc:respond_public_approval');
  await page.locator('#send').click();
  await page.locator('.form-error', { hasText: 'არ დაფიქსირებულა' }).waitFor();
  assert.strictEqual(await page.locator('.ap-result').count(), 0, 'no success shown after failure');
  await page.locator('#send').click();
  await page.locator('.ap-result.ok').waitFor();
  const d = await db(page);
  assert.strictEqual(d.tables.approvals.find(a => a.token === 'tok-pending-1').status, 'approved');
  assert.strictEqual(d.tables.expenses.find(e => e.approval_id === 'ffffffff-0000-4000-8000-000000000001').status, 'approved');
  return page;
});

test('7. manager records an expense with a receipt and sees it once', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/#/finance');
  await page.locator('#f-exp').click();
  await pickApartment(page, 'სანაპირო · 801');
  await page.locator('dialog[open] input[name=amount]').fill('95');
  await page.locator('dialog[open] input[name=description]').fill('სარეცხი საშუალებები');
  await page.locator('dialog[open] input[name=receipt]').setInputFiles(FIXTURE);
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const rows = page.locator('#f-body .row', { hasText: 'სარეცხი საშუალებები' });
  await rows.first().waitFor();
  assert.strictEqual(await rows.count(), 1);
  assert((await rows.first().innerText()).includes('ნახვა'), 'receipt link');
  assert((await rows.first().innerText()).includes('გადახდილი'));
  // Proposed costs are not counted as expenses
  const calc = await page.locator('.calc').first().innerText();
  assert(calc.includes('შეთავაზებული და დადასტურებული'));
  return page;
});

test('8. failed load is understandable and recoverable', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => { if (!sessionStorage.getItem('failed')) { sessionStorage.setItem('failed', '1'); localStorage.setItem('rigzea_mock_fail', JSON.stringify({ 'select:tasks': 1 })); } });
  await page.goto(BASE + '/app/');
  await page.locator('.error-state', { hasText: 'კავშირი ვერ დამყარდა' }).waitFor();
  await page.locator('#btn-load-retry').click();
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  return page;
});

test('9. phone layout has no horizontal overflow on main screens', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  for (const hash of ['#/today', '#/tasks', '#/apartments', '#/apartments/dddddddd-0000-4000-8000-000000000001', '#/owners', '#/finance', '#/team', '#/settings/import']) {
    await page.goto(BASE + '/app/' + hash);
    await page.locator('#view h1').waitFor();
    await page.waitForTimeout(150);
    const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(sw <= w, `${hash} overflows: ${sw} > ${w}`);
  }
  await page.goto(BASE + '/app/#/tasks?task=eeeeeeee-0000-4000-8000-000000000002');
  await page.locator('.drawer').waitFor();
  const b = await page.locator('.drawer-foot .btn').first().boundingBox();
  assert(b.height >= 44 && b.x >= 0, 'drawer actions reachable');
  return page;
});

test('10. auth, organization switching and permissions still work', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP });
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
    if (!d.tables.organizations.some(o => o.name === 'Tbilisi Homes')) {
      d.tables.organizations.push({ id: '22222222-2222-4222-8222-222222222222', name: 'Tbilisi Homes', city: 'თბილისი' });
      d.tables.organization_members.push({ id: 'bbbbbbbb-0000-4000-8000-000000000009', organization_id: '22222222-2222-4222-8222-222222222222', user_id: 'aaaaaaaa-0000-4000-8000-000000000001', role: 'manager', display_name: 'ნინო ბერიძე' });
    }
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  await page.goto(BASE + '/app/');
  await page.locator('#form-signin').waitFor();
  await page.fill('#form-signin input[name=email]', 'manager@rigzea.test');
  await page.fill('#form-signin input[name=password]', 'wrong');
  await page.click('#form-signin [type=submit]');
  await page.locator('#form-signin .form-error', { hasText: 'არასწორია' }).waitFor();
  await page.fill('#form-signin input[name=password]', 'test1234');
  await page.click('#form-signin [type=submit]');
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  await page.selectOption('#org-select', { label: 'Tbilisi Homes' });
  await page.locator('.toast', { hasText: 'Tbilisi Homes' }).waitFor();
  await page.locator('.setup').waitFor(); // empty org shows first-run steps
  assert.strictEqual(await page.locator('#user-role').innerText(), 'მენეჯერი');
  await page.goto(BASE + '/app/#/team');
  await page.locator('#view h1', { hasText: 'გუნდი' }).waitFor();
  assert.strictEqual(await page.locator('#t-invite').count(), 0, 'managers cannot invite (admin only)');
  await page.locator('#btn-user').click();
  await page.locator('#user-panel [data-action="signout"]').click();
  await page.locator('#form-signin').waitFor();
  return page;
});

(async () => {
  const server = await serve();
  const browser = await launch();
  let failed = 0;
  for (const t of tests) {
    let page;
    try {
      page = await t.fn(browser);
      const errs = (page?.errors || []).filter(e => !/Failed to load resource|ERR_FAILED|net::|Failed to fetch|Invalid login credentials/.test(e));
      assert.deepStrictEqual(errs, [], 'console errors: ' + JSON.stringify(errs).slice(0, 400));
      console.log('✓', t.name);
    } catch (err) {
      failed++;
      console.log('✗', t.name, '\n   ', err.message.split('\n')[0]);
      if (page) await page.screenshot({ path: `/tmp/fail-${tests.indexOf(t) + 1}.png` }).catch(() => {});
    } finally {
      await page?.context().close().catch(() => {});
    }
  }
  await browser.close();
  server.close();
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
