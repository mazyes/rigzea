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
// Forms keep rarely used fields in a collapsed "more details" section.
const openMore = (scope) => scope.locator('details.form-more').evaluateAll(ds => ds.forEach(d => { d.open = true; }));

test('1. manager sees real tasks needing attention on Today', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  const alerts = page.locator('.alert-row');
  await alerts.first().waitFor();
  const text = await page.locator('#view').innerText();
  assert(text.includes('სარეცხი მანქანის შემოწმება'), 'overdue task listed');
  assert(text.includes('ვადა გადაცილებულია'), 'overdue reason shown');
  assert(text.includes('მფლობელი 18 საათია არ პასუხობს'), 'owner waiting time shown');
  assert(text.includes('Check-in'), 'check-in in schedule');
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(text), 'no raw ids in UI');
  return page;
});

test('1b. upcoming lease renewals are listed and can be extended', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    const end = new Date(Date.now() + 10 * 86400e3);
    const iso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
    d.tables.apartments.find(a => a.unit_number === '5').lease_end = iso;
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  await page.reload();
  const card = page.locator('section.card', { has: page.getByRole('heading', { name: /განახლებები/ }) });
  await card.waitFor();
  assert((await card.innerText()).includes('ძველი ბათუმი · 5'), 'apartment with lease ending listed');
  assert((await card.innerText()).includes('10 დღეში'), 'days left shown');
  await card.getByRole('button', { name: 'ხელშეკრულების გაგრძელება' }).click();
  const dlg = page.locator('dialog[open]');
  const next = await dlg.locator('input[name=lease_end]').inputValue();
  await dlg.getByRole('button', { name: 'გაგრძელება', exact: true }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const apt = (await db(page)).tables.apartments.find(a => a.unit_number === '5');
  assert.strictEqual(apt.lease_end, next, 'lease_end updated');
  assert((await page.locator('#view').innerText()).includes('განახლებები') === false, 'renewed lease leaves the block');
  return page;
});

test('1c. the next visit shows saved data at once, read-only, then the fresh data', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByText('სარეცხი მანქანის შემოწმება').first().waitFor();
  // Wait until the copy is saved in this browser.
  await page.waitForFunction(() => new Promise(res => {
    const r = indexedDB.open('rigzea-cache');
    r.onsuccess = () => { const q = r.result.transaction('org-data').objectStore('org-data').count(); q.onsuccess = () => res(q.result > 0); };
    r.onerror = () => res(false);
  }));
  // The server's copy changes, and its tasks now load slowly.
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    db.tables.tasks.find(t => t.title === 'სარეცხი მანქანის შემოწმება').title = 'სარეცხი მანქანა: განახლებული';
    localStorage.setItem('rigzea_mockdb', JSON.stringify(db));
    localStorage.setItem('rigzea_mock_slow', JSON.stringify({ tasks: 2500 }));
  });
  await page.reload();
  await page.getByText('სარეცხი მანქანის შემოწმება').first().waitFor({ timeout: 2000 });
  assert(await page.locator('#view.is-stale').count() === 1, 'saved data is marked as updating');
  assert(await page.evaluate(() => document.querySelector('#view').inert), 'saved data cannot be edited');
  await page.getByText('სარეცხი მანქანა: განახლებული').first().waitFor({ timeout: 15000 });
  assert(await page.locator('#view.is-stale').count() === 0, 'fresh data is editable');
  assert(!(await page.evaluate(() => document.querySelector('#view').inert)), 'view no longer inert');
  await page.evaluate(() => localStorage.removeItem('rigzea_mock_slow'));
  return page;
});

test('1d. each area has its own address, and old #/ links still open the right one', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // An old bookmark or Telegram link lands on the new address.
  await page.goto(BASE + '/app/#/owners?tab=approvals');
  await page.waitForURL('**/app/owners/?tab=approvals');
  await page.locator('#view h1').waitFor();
  assert.strictEqual(await page.title(), 'Rigzea: კონტაქტები', 'page has its own title');
  // Links in the page are real addresses.
  const href = await page.locator('#topbar-nav a', { hasText: 'საქმეები' }).getAttribute('href');
  assert.strictEqual(href, '/app/tasks/', 'nav links are page addresses');
  assert.strictEqual(await page.locator('a[href^="#/"]').count(), 0, 'no #/ links left in the page');
  // Moving to another area swaps the page in place and keeps the data (no reload, see 1i).
  await page.locator('#topbar-nav a', { hasText: 'საქმეები' }).click();
  await page.waitForURL('**/app/tasks/');
  assert.strictEqual(await page.title(), 'Rigzea: საქმეები', 'title follows the area');
  await page.locator('#view .rows').waitFor();
  assert.strictEqual(await page.locator('#view.is-stale').count(), 0, 'handed-over data is current, not read-only');
  // Inside a page, opening a task changes the address without a reload.
  let reloaded = false;
  page.once('load', () => { reloaded = true; });
  await page.locator('#view .rows .row').first().click();
  await page.locator('.drawer').waitFor();
  assert(/\/app\/tasks\/\?task=/.test(page.url()), 'task opens in the address');
  assert(!reloaded, 'opening a task does not reload the page');
  await page.goBack();
  await page.waitForURL('**/app/tasks/');
  return page;
});

test('2. filter tasks and open the correct task and apartment', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('[data-filter="unassigned"]').click();
  await page.locator('.row', { hasText: 'კონდიციონერი არ აგრილებს' }).waitFor();
  await page.goto(BASE + '/app/tasks/');
  await page.locator('#tf-type').selectOption('cleaning');
  const rows = page.locator('#view .rows .row');
  assert.strictEqual(await rows.count(), 1);
  await rows.first().click();
  await page.locator('#drawer-title', { hasText: 'დასუფთავება სტუმრების შემდეგ' }).waitFor();
  assert(page.url().includes('?task=eeeeeeee-0000-4000-8000-000000000001'));
  await page.locator('.drawer a', { hasText: 'Orbi City · 1204' }).click();
  await page.getByRole('heading', { name: 'Orbi City · 1204' }).waitFor();
  assert(page.url().endsWith('/app/apartments/?id=dddddddd-0000-4000-8000-000000000001'), 'apartment page address');
  return page;
});

test('3. create and assign a task once, even with double submit and a failed save', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/tasks/');
  await page.locator('#view .rows').waitFor();
  await page.locator('#btn-new-task').click();
  await page.locator('#quick-add-panel [data-qa=task]').click();
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
  await page.goto(BASE + '/app/owners/');
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
  await page.goto(BASE + '/app/finance/');
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
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
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
  await page.goto(BASE + '/app/tasks/?task=eeeeeeee-0000-4000-8000-000000000002');
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
  await page.goto(BASE + '/app/#signin');
  await page.locator('#form-signin').waitFor();
  await page.fill('#form-signin input[name=email]', 'manager@rigzea.test');
  await page.fill('#form-signin input[name=password]', 'wrong');
  await page.click('#form-signin [type=submit]');
  await page.locator('#form-signin .form-error', { hasText: 'არასწორია' }).waitFor();
  await page.fill('#form-signin input[name=password]', 'test1234');
  await page.click('#form-signin [type=submit]');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.selectOption('#org-select', { label: 'Tbilisi Homes' });
  await page.locator('.toast', { hasText: 'Tbilisi Homes' }).waitFor();
  await page.locator('.setup').waitFor(); // empty org shows first-run steps
  assert.strictEqual(await page.locator('#user-role').innerText(), 'მენეჯერი');
  await page.goto(BASE + '/app/team/');
  await page.locator('#view h1', { hasText: 'გუნდი' }).waitFor();
  assert.strictEqual(await page.locator('#t-invite').count(), 0, 'managers cannot invite (admin only)');
  await page.locator('#btn-user').click();
  await page.locator('#user-panel [data-action="signout"]').click();
  await page.locator('#form-signin').waitFor();
  return page;
});

test('11. plans: trial banner, apartment cap upgrade modal, branding, export, platform activation', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
    if (!d.__plan_seeded) {
      d.__plan_seeded = true;
      d.tables.organizations[0].plan = 'trial';
      d.tables.organizations[0].trial_ends_at = new Date(Date.now() + 5 * 864e5).toISOString();
      d.tables.platform_admins = [{ user_id: 'aaaaaaaa-0000-4000-8000-000000000001' }];
    }
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  await page.goto(BASE + '/app/');
  await page.locator('#plan-banner', { hasText: 'დარჩენილია 5 დღე' }).waitFor();
  assert(await page.evaluate(() => App.can('export') && App.can('whitelabel')), 'trial has every feature');
  // Free plan holds 3 active apartments: going past that is refused with the upgrade modal
  await page.waitForFunction(() => App.S.data && App.S.org && !document.querySelector('.skeleton'));
  // The plan is set inside the same call: a background refresh may reload the workspace between calls.
  assert.deepStrictEqual(await page.evaluate(() => {
    App.S.org.plan = 'starter';
    const used = App.activeApartments();
    return [App.PLANS.starter.apartments, App.guardLimit('apartments', 3 - used), App.guardLimit('apartments', 4 - used)];
  }), [3, true, false]);
  await page.locator('dialog[open] h2', { hasText: 'ობიექტების ლიმიტი ამოიწურა' }).waitFor();
  await page.locator('dialog[open]', { hasText: 'მაქსიმუმ 3 აქტიური ობიექტია' }).waitFor();
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/upgrade-modal.png' : undefined });
  await page.locator('dialog[open] a[href*="wa.me"]').first().waitFor();
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.evaluate(() => { App.S.org.plan = 'starter'; return App.can('export'); }), false);
  // Ended trial = free plan: data stays, paid features close, links above the limit are paused
  const before = await page.evaluate(() => App.S.data.apartments.length);
  const ended = await page.evaluate(() => {
    App.S.org.plan = 'trial'; App.S.org.trial_ends_at = new Date(Date.now() - 864e5).toISOString(); App.renderShell();
    const st = App.planState();
    return { eff: st.eff, trialEnded: st.trialEnded, trial: st.trial, apartments: App.S.data.apartments.length, active: App.activeApartments(),
      paused: App.pausedApartmentIds().size, features: ['contracts', 'matchmaker', 'selections', 'export', 'profile', 'import', 'presentation'].filter(f => App.can(f)) };
  });
  assert.deepStrictEqual([ended.eff, ended.trialEnded, ended.trial, ended.features.length], ['starter', true, false, 0]);
  assert.strictEqual(ended.apartments, before, 'no property is removed when the trial ends');
  assert.strictEqual(ended.paused, Math.max(0, ended.active - 3), 'only links above the free limit are paused');
  await page.locator('#plan-banner', { hasText: 'ანგარიში უფასო პაკეტზე გადავიდა' }).waitFor();
  assert.strictEqual(await page.evaluate(() => { App.S.org.plan = 'trial'; App.S.org.trial_ends_at = new Date(Date.now() - 864e5).toISOString(); return App.guardFeature('selections'); }), false);
  await page.locator('dialog[open] h2', { hasText: 'ეს ფუნქცია სხვა პაკეტშია' }).waitFor();
  await page.keyboard.press('Escape');
  // Platform admin activates Pro for this org
  await page.goto(BASE + '/app/settings/?id=platform');
  await page.locator('[data-org] [data-plan]').first().selectOption('top');
  await page.locator('[data-org] [data-save]').first().click();
  await page.locator('.toast', { hasText: 'პაკეტი გააქტიურდა' }).waitFor();
  await page.waitForFunction(() => App.planState().key === 'top' && App.can('export'));
  assert.strictEqual(await page.locator('#plan-banner').isHidden(), true, 'no banner for a fresh paid plan');
  // Platform admins: an unknown email is refused, a registered user can be added and removed, the last admin cannot be removed
  await page.goto(BASE + '/app/settings/?id=platform');
  await page.locator('#p-admins [data-admin]').first().waitFor();
  assert.strictEqual(await page.locator('#p-admins [data-revoke]').count(), 0, 'the only admin has no remove button');
  await page.fill('#p-admin-add input[name=email]', 'nobody@example.ge');
  await page.click('#p-admin-add [type=submit]');
  await page.locator('dialog[open] [type=submit]').click();
  await page.locator('.toast', { hasText: 'მომხმარებელი ვერ მოიძებნა' }).waitFor();
  for (let i = page.errors.length - 1; i >= 0; i--) if (page.errors[i].includes('მომხმარებელი ვერ მოიძებნა')) page.errors.splice(i, 1); // the refusal above is expected
  await page.fill('#p-admin-add input[name=email]', USERS.staff.email);
  await page.click('#p-admin-add [type=submit]');
  await page.locator('dialog[open] [type=submit]').click();
  await page.locator(`#p-admins [data-admin="${USERS.staff.email}"]`).waitFor();
  assert.strictEqual((await db(page)).tables.platform_admins.filter(x => !x.revoked_at).length, 2);
  await page.locator(`#p-admins [data-admin="${USERS.staff.email}"] [data-revoke]`).click();
  await page.locator('dialog[open] [type=submit]').click();
  await page.locator('.toast', { hasText: 'ადმინის უფლება მოიხსნა' }).waitFor();
  const admins = (await db(page)).tables.platform_admins;
  assert.strictEqual(admins.length, 2, 'a removed admin row is kept');
  assert.strictEqual(admins.filter(x => !x.revoked_at).length, 1);
  // Plan tab
  await page.goto(BASE + '/app/settings/?id=plan');
  await page.locator('#view h2', { hasText: 'გუნდი' }).waitFor();
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/plan-tab.png' : undefined, fullPage: true });
  // Branding
  await page.goto(BASE + '/app/settings/');
  await page.locator('#s-brand').waitFor();
  assert.strictEqual(await page.locator('#s-brand input[name=brand_color]').isDisabled(), true, 'colour needs Agency');
  await page.fill('#s-brand input[name=agent_display_name]', 'ნინო ბერიძე · Batumi Stay');
  await page.setInputFiles('#s-brand input[name=logo]', FIXTURE);
  await page.click('#s-brand [type=submit]');
  await page.locator('.toast', { hasText: 'ბრენდინგი შენახულია' }).waitFor();
  const org = (await db(page)).tables.organizations[0];
  assert.strictEqual(org.agent_display_name, 'ნინო ბერიძე · Batumi Stay');
  assert(org.logo_url, 'logo uploaded');
  await page.evaluate(() => { App.S.org.plan = 'agency'; App.render(); });
  await page.fill('#s-brand input[name=brand_color]', '#1a73e8');
  await page.click('#s-brand [type=submit]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rigzea_mockdb')).tables.organizations[0].brand_color);
  assert.strictEqual((await db(page)).tables.organizations[0].brand_color, '#1A73E8');
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/settings-brand.png' : undefined, fullPage: true });
  // Export CSV
  await page.goto(BASE + '/app/settings/?id=export');
  await page.locator('[data-export="apartments"]').click();
  await page.locator('dialog[open] input[value=csv]').check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('dialog[open] [data-submit]').click()]);
  assert(/rigzea-apartments.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  assert(csv.includes('Orbi City · 1204') && csv.includes('ოთახები'), 'csv has apartments and new columns');
  return page;
});

// --- Smart link (public listing page, analytics, apartment form) -------------
const SL_APT = 'dddddddd-0000-4000-8000-000000000001';
const seedListing = (page) => page.addInitScript((id) => {
  const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
  const a = d.tables.apartments.find(x => x.id === id);
  if (!a.slug) {
    d.tables.apartments.forEach((x, i) => { x.slug = x.slug || 'apt-' + (i + 1); });
    Object.assign(a, { slug: 'orbi-1204', monthly_rent: 900, currency: 'USD', rental_type: 'long_term', rooms: 2, bedrooms: 1, area_sqm: 54, floor: '12', total_floors: 40, amenities: ['balcony', 'sea_view'], badge: 'new', description: 'ზღვის ხედით ბინა ორბი სითიში.', photos: [{ url: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2210%22/%3E', order: 0 }] });
    d.tables.organizations[0].brand_color = '#7a1f5c';
  }
  localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
}, SL_APT);

test('12. smart link: real listing data, fail-closed page, white-label and click analytics', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await seedListing(page);
  await page.goto(BASE + '/p/?id=orbi-1204');
  await page.locator('h1.p-title', { hasText: 'Orbi City · 1204' }).waitFor();
  const body = await page.locator('body').innerText();
  assert(body.includes('ზღვის ხედი') && body.includes('აივანი'), 'real amenities');
  assert(!body.includes('ლიფტი'), 'no fabricated amenities');
  assert(body.includes('ახალი'), 'badge shown');
  assert(!/4821|sea-view|დავით|ჭავჭავაძის გამზ\. 37/.test(body), 'no secrets, owner or demo data');
  assert((await page.locator('#btn-whatsapp').getAttribute('href')).startsWith('https://wa.me/995555123456'), 'agency phone used');
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()), '#7a1f5c', 'org brand colour');
  await page.evaluate(() => { const a = document.querySelector('#btn-whatsapp'); a.removeAttribute('target'); a.setAttribute('href', '#'); a.click(); });
  await page.waitForTimeout(300);
  let ev = (await db(page)).tables.link_events || [];
  assert.strictEqual(ev.filter(e => e.kind === 'view').length, 1, 'view tracked once');
  assert.strictEqual(ev.filter(e => e.kind === 'whatsapp').length, 1, 'WhatsApp click tracked');
  await page.reload();
  await page.locator('h1.p-title').waitFor();
  await page.waitForTimeout(300);
  ev = (await db(page)).tables.link_events;
  assert.strictEqual(ev.filter(e => e.kind === 'view').length, 1, 'reload is deduplicated');
  // White-label: no Rigzea branding
  await page.goto(BASE + '/p/?id=' + SL_APT + '&wl=1');
  await page.locator('h1.p-title').waitFor();
  assert(!/რიგზეა|Rigzea/.test(await page.locator('body').innerText()), 'white-label hides Rigzea');
  // Unknown id fails closed
  await page.goto(BASE + '/p/?id=does-not-exist');
  await page.locator('h1', { hasText: 'განცხადება ვერ მოიძებნა' }).waitFor();
  assert(await page.locator('#bottom-bar').isHidden(), 'no contact bar for missing listing');
  assert.strictEqual(await page.locator('.p-gallery').count(), 0, 'no demo gallery');
  // No id → demo, clearly labelled
  await page.goto(BASE + '/p/');
  await page.locator('.p-demo').waitFor();
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert(sw <= w, 'public page fits the phone');
  return page;
});

test('13. apartment edit keeps commission, saves photos and amenities, shows link stats', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await seedListing(page);
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    if (d && !(d.tables.link_events || []).length) { d.tables.link_events = [{ id: 1, apartment_id: 'dddddddd-0000-4000-8000-000000000003', kind: 'view', visitor: 'x', created_at: new Date().toISOString() }, { id: 2, apartment_id: 'dddddddd-0000-4000-8000-000000000003', kind: 'whatsapp', visitor: 'x', created_at: new Date().toISOString() }]; localStorage.setItem('rigzea_mockdb', JSON.stringify(d)); }
  });
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000003');
  await page.locator('[data-ls="views"]', { hasText: '1' }).waitFor();
  assert.strictEqual(await page.locator('[data-ls="whatsapp"]').innerText(), '1');
  assert((await page.locator('#listing-url').inputValue()).endsWith('/p/apt-3/'), 'pretty link with slug');
  await page.locator('#a-edit').click();
  assert.strictEqual(await page.locator('dialog[open] input[name=commission_pct]').inputValue(), '15');
  await page.locator('dialog[open] [data-pm-input]').setInputFiles([FIXTURE, FIXTURE]);
  await page.locator('dialog[open] .pm-item img').nth(1).waitFor();
  await page.locator('dialog[open] [data-pm-del="1"]').click();
  await openMore(page.locator('dialog[open]'));
  await page.locator('dialog[open] [data-amenity="balcony"]').click();
  await page.locator('dialog[open] textarea[name=description_en]').fill('Bright apartment');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const apt = (await db(page)).tables.apartments.find(a => a.id === 'dddddddd-0000-4000-8000-000000000003');
  assert.strictEqual(Number(apt.commission_pct), 15, 'commission not zeroed');
  assert.strictEqual(apt.photos.length, 1);
  assert(apt.photos[0].url && apt.photos[0].thumb && apt.photos[0].order === 0, 'photo shape {url,thumb,order}');
  assert.deepStrictEqual(apt.amenities, ['balcony']);
  assert.strictEqual(apt.description_en, 'Bright apartment');
  assert.strictEqual(apt.slug, 'apt-3', 'slug kept');
  return page;
});

// ---- Deals layer --------------------------------------------------------------
const DEAL_RENT = (page) => page.addInitScript(() => {
  const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
  if (!d.tables.apartments[0].monthly_rent) {
    Object.assign(d.tables.apartments[0], { monthly_rent: 900, currency: 'USD', rooms: 2, area_sqm: 64, district: 'ბულვარი', pets_allowed: true, rental_type: 'long_term' });
    Object.assign(d.tables.apartments[1], { monthly_rent: 2400, currency: 'GEL', rooms: 3, area_sqm: 88, district: 'ბულვარი' });
    d.tables.organizations[0].fx_rate = 2.7;
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  }
});

test('D1. deals: create, failed stage change is not shown as saved, matchmaker selection link and public page', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await DEAL_RENT(page);
  await page.goto(BASE + '/app/deals/');
  await page.locator('#btn-deal-new').click();
  await page.locator('dialog[open] input[name=client_name]').fill('ლევან გიორგაძე');
  await page.locator('dialog[open] #deal-apt-select').selectOption('dddddddd-0000-4000-8000-000000000001');
  assert.strictEqual(await page.locator('dialog[open] #deal-amount').inputValue(), '900', 'rent prefilled from apartment');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const deal = (await db(page)).tables.deals.find(x => x.client_name === 'ლევან გიორგაძე');
  assert.strictEqual(Number(deal.net_commission), 450);
  // A failed write must surface as an error and leave the stage unchanged
  await fail(page, 'update:deals');
  await page.locator(`[data-deal-advance="${deal.id}"]`).click();
  await page.locator('.toast-error').waitFor();
  assert.strictEqual((await db(page)).tables.deals.find(x => x.id === deal.id).stage, 'active');
  assert.strictEqual(await page.locator('.toast-success', { hasText: 'ეტაპი განახლდა' }).count(), 0, 'no fake success');
  await page.locator(`[data-deal-advance="${deal.id}"]`).click();
  await page.locator('.toast-success', { hasText: 'ეტაპი განახლდა' }).waitFor();
  assert.strictEqual((await db(page)).tables.deals.find(x => x.id === deal.id).stage, 'viewing');
  // Matchmaker: score, pick two, create the selection link
  await page.locator(`[data-deal-match="${deal.id}"]`).click();
  await page.locator('dialog[open] #mm-city').selectOption('ბათუმი');
  await page.locator('dialog[open] #mm-max').fill('1000');
  await page.locator('dialog[open] .mm-item', { hasText: 'Orbi City · 1204' }).locator('.mm-score', { hasText: '100% დამთხვევა' }).waitFor();
  await page.locator('dialog[open] .mm-item', { hasText: 'Orbi City · 1204' }).locator('input').check();
  await page.locator('dialog[open] .mm-item', { hasText: 'Orbi City · 2210' }).locator('input').check();
  await page.locator('dialog[open] #mm-create').click();
  await page.locator('dialog[open] #mm-done:not([hidden])').waitFor();
  const d = await db(page);
  const sel = d.tables.selections[0];
  assert.deepStrictEqual(sel.apartment_ids.length, 2);
  assert.strictEqual(sel.client_name, 'ლევან გიორგაძე');
  assert.strictEqual(d.tables.deals.find(x => x.id === deal.id).criteria.city, 'ბათუმი', 'criteria saved on deal');
  // Public multi-listing page (phone)
  await page.setViewportSize(PHONE);
  await page.goto(BASE + '/p/s/?id=' + sel.slug);
  await page.locator('.s-card').nth(1).waitFor();
  const body = await page.locator('body').innerText();
  assert(!/4821|sea-view/.test(body), 'no access secrets on public selection');
  assert(body.includes('შედარება') && body.includes('$900'), 'comparison table');
  assert((await page.locator('.s-card a.s-btn-primary').first().getAttribute('href')).startsWith('/p/'), 'links to single listing');
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  assert(sw <= w, `selection page overflows: ${sw} > ${w}`);
  await page.goto(BASE + '/p/s/?id=doesnotexist1');
  await page.locator('.s-state h1', { hasText: 'შერჩევა ვერ მოიძებნა' }).waitFor();
  assert.strictEqual(await page.locator('.s-card').count(), 0, 'fail closed');
  return page;
});

test('D2. deals: lease contract is saved and bilingual, commissions tab and phone layout', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await DEAL_RENT(page);
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    if (!(d.tables.deals || []).length) {
      d.tables.deals = [
        { id: '55555555-0000-4000-8000-000000000001', organization_id: '11111111-1111-4111-8111-111111111111', apartment_id: 'dddddddd-0000-4000-8000-000000000001', client_name: 'ანა ლომიძე', stage: 'closed', deal_amount: 1000, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: 'GeoRealty', cobroker_split: 50, created_by: 'aaaaaaaa-0000-4000-8000-000000000001', closed_at: new Date().toISOString(), created_at: new Date().toISOString(), criteria: {} },
        { id: '55555555-0000-4000-8000-000000000002', organization_id: '11111111-1111-4111-8111-111111111111', apartment_id: 'dddddddd-0000-4000-8000-000000000002', client_name: 'გიორგი ბერიძე', stage: 'deposit', deal_amount: 2700, currency: 'GEL', commission_percent: 50, owner_bonus: 0, created_by: 'aaaaaaaa-0000-4000-8000-000000000001', created_at: new Date().toISOString(), criteria: {} },
      ];
      localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
    }
  });
  await page.goto(BASE + '/app/deals/?id=commissions');
  const stats = await page.locator('#deals-body .stats').innerText();
  assert(stats.includes('$500') && stats.includes('$250'), 'gross and net for the closed co-broker deal: ' + stats);
  assert(stats.includes('$500'), 'GEL deal converted with org FX rate (2700 ₾ → $1000 → $500 expected)');
  await page.goto(BASE + '/app/deals/');
  await page.locator('[data-deal-lease="55555555-0000-4000-8000-000000000002"]').click();
  await page.locator('dialog[open] input[name=landlord_name]').waitFor();
  assert.strictEqual(await page.locator('dialog[open] input[name=landlord_name]').inputValue(), 'დავით მამულაშვილი', 'landlord from owner record');
  assert.strictEqual(await page.locator('dialog[open] input[name=landlord_id]').inputValue(), '', 'no fake personal id');
  await page.locator('dialog[open] input[name=start_date]').fill('2026-11-01');
  await page.locator('dialog[open] input[name=start_date]').dispatchEvent('change');
  assert.strictEqual(await page.locator('dialog[open] input[name=end_date]').inputValue(), '2027-10-31');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open] #lease-paper').waitFor();
  const doc = await page.locator('dialog[open] #lease-paper').innerText();
  assert(doc.includes('მუხლი 10. დავების გადაწყვეტა') && doc.includes('Article 10. Disputes'), 'matching bilingual numbering');
  assert(doc.includes('2 700 GEL'), 'rent from deal');
  assert(!/მუხლი 531|§ ?531/.test(doc), 'no article citations');
  const c = (await db(page)).tables.contracts;
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].deal_id, '55555555-0000-4000-8000-000000000002');
  await page.locator('dialog[open] [data-close]').first().click();
  await page.setViewportSize(PHONE);
  for (const hash of ['#/deals', '#/deals/commissions', '#/deals/selections']) {
    await page.goto(BASE + '/app/' + hash);
    await page.locator('#view h1').waitFor();
    await page.waitForTimeout(150);
    const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(sw <= w, `${hash} overflows: ${sw} > ${w}`);
  }
  return page;
});

test('14. sales: create property for sale, compute price/sqm, filter inventory by sale vs rent', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/apartments/');
  await page.locator('#btn-apt-new').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await dlg.locator('select[name=transaction_type]').selectOption('sale');
  await dlg.locator('select[name=transaction_type]').dispatchEvent('change');
  await dlg.locator('input[name=name]').fill('ვაკე · ჭავჭავაძის 45');
  await dlg.locator('input[name=unit_number]').fill('22');
  await dlg.locator('input[name=address]').fill('ჭავჭავაძის 45');
  await dlg.locator('input[name=city]').fill('თბილისი');
  await dlg.locator('input[name=area_sqm]').fill('100');
  await dlg.locator('input[name=sale_price]').fill('220000');
  await dlg.locator('input[name=sale_price]').dispatchEvent('input');
  // Check auto-calculated price_sqm
  const sqmVal = await dlg.locator('input[name=price_sqm]').inputValue();
  assert.strictEqual(sqmVal, '2200', 'price per sqm calculated automatically');
  await dlg.locator('[data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.toast-success', { hasText: 'ობიექტი დაემატა' }).waitFor();

  const apt = (await db(page)).tables.apartments.find(a => a.name === 'ვაკე · ჭავჭავაძის 45');
  assert.strictEqual(apt.transaction_type, 'sale');
  assert.strictEqual(Number(apt.sale_price), 220000);
  assert.strictEqual(Number(apt.price_sqm), 2200);

  // Filter inventory by "sale"
  await page.goto(BASE + '/app/apartments/');
  await page.locator('[data-tp="sale"]').click();
  await page.waitForTimeout(200);
  const rows = page.locator('#view .rows a.row');
  const count = await rows.count();
  assert(count >= 1, 'at least one sale property listed');
  const rowText = await rows.first().innerText();
  assert(rowText.includes('იყიდება'), 'sales transaction badge shown');
  assert(rowText.includes('220 000') || rowText.includes('220,000'), 'sales price shown');

  // Open property detail
  await rows.first().click();
  await page.locator('.sales-hero').waitFor();
  const heroText = await page.locator('.sales-hero').innerText();
  assert(heroText.includes('გასაყიდი ფასი') && heroText.includes('ფასი მ²-ზე'), 'sales hero fields rendered');
  assert(heroText.includes('+ დათვალიერება'), 'schedule viewing button available');
  return page;
});

test('14.1. switching a rental to sale clears fields that no longer apply', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    Object.assign(d.tables.apartments[0], {
      transaction_type: 'long_term', rental_type: 'long_term', monthly_rent: 1200,
      rent_due_day: 5, deposit_amount: 2400, tenant_name: 'ტესტი მდგმური',
      tenant_phone: '+995 500 00 00 00', lease_end: '2027-01-01',
      checkin_time: '15:00', checkout_time: '11:00',
    });
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  const id = 'dddddddd-0000-4000-8000-000000000001';
  await page.goto(`${BASE}/app/apartments/?id=${id}`);
  await page.locator('#a-edit').click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('select[name=transaction_type]').selectOption('sale');
  await dlg.locator('select[name=transaction_type]').dispatchEvent('change');
  await dlg.locator('input[name=sale_price]').fill('175000');
  await dlg.locator('[data-submit]').click();
  await dlg.waitFor({ state: 'detached' });
  const saved = (await db(page)).tables.apartments.find(a => a.id === id);
  assert.strictEqual(saved.transaction_type, 'sale');
  assert.strictEqual(Number(saved.sale_price), 175000);
  for (const field of ['monthly_rent', 'rent_due_day', 'deposit_amount', 'tenant_name', 'tenant_phone', 'lease_end', 'checkin_time', 'checkout_time']) {
    assert.strictEqual(saved[field], null, `${field} cleared when changing to sale`);
  }
  return page;
});

test('14.2. apartment search includes district in the list and global search', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    Object.assign(d.tables.apartments[0], { name: 'სატესტო სახლი', address: 'სატესტო ქუჩა', city: 'ქუთაისი', district: 'წყალტუბო' });
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  await page.goto(BASE + '/app/apartments/');
  await page.locator('#af-q').fill('წყალტუბო');
  await page.locator('#view .rows a.row', { hasText: 'სატესტო სახლი' }).waitFor();
  await page.locator('#af-q').fill('');
  await page.locator('#btn-search').click();
  await page.locator('#search-q').fill('წყალტუბო');
  await page.locator('#search-results a.row', { hasText: 'სატესტო სახლი' }).waitFor();
  return page;
});

test('14.3. large property lists show the count and can load more', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/apartments/');
  await page.locator('#btn-apt-new').waitFor();
  const total = await page.evaluate(async () => { const n = window.App.S.data.apartments.length; window.App.S.limits.apartments = 2; await window.App.refresh({ quiet: true }); return n; });
  await page.locator('#data-notice', { hasText: `ობიექტები 2/${total}` }).waitFor();
  await page.locator('#data-notice [data-load-more="apartments"]').click();
  await page.locator('#data-notice').waitFor({ state: 'hidden' });
  assert.strictEqual(await page.locator('#view .rows a.row').count(), total, 'loading more reveals the full fixture list');
  return page;
});

test('14.4. global search combines type and status filters, pages results, and loads the rest', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(async () => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    const org = d.tables.organizations[0].id;
    for (let i = 1; i <= 24; i++) d.tables.apartments.push({
      id: `a1111111-0000-4000-8000-${String(i).padStart(12, '0')}`, organization_id: org,
      name: `Needle apartment ${i}`, address: `Needle road ${i}`, city: 'თბილისი', district: 'ვაკე',
      transaction_type: i % 2 ? 'sale' : 'long_term', rental_type: 'long_term', status: 'active', created_at: new Date().toISOString(),
    });
    d.tables.owners.push({ id: 'c1111111-0000-4000-8000-000000000001', organization_id: org, name: 'Needle contact', phone: '+995 500 00 00 01', contact_type: 'buyer' });
    d.tables.tasks.push({ id: 'e1111111-0000-4000-8000-000000000001', organization_id: org, title: 'Needle task', status: 'new', type: 'followup', created_at: new Date().toISOString() });
    d.tables.deals.push({ id: 'f1111111-0000-4000-8000-000000000001', organization_id: org, client_name: 'Needle deal', stage: 'enquiry', deal_type: 'sale', created_at: new Date().toISOString() });
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
    window.App.S.limits.apartments = 2;
    await window.App.refresh({ quiet: true });
  });
  await page.locator('#btn-search').click();
  await page.locator('#search-q').fill('Needle');
  await page.locator('#search-kind').selectOption('all');
  await page.locator('#search-results [data-search-load="apartments"]').waitFor();
  assert(await page.locator('#search-results .row[data-search-index]').count() >= 4, 'cross-category results include contacts, tasks, deals, and loaded properties');
  await page.locator('#search-results [data-search-load="apartments"]').click();
  await page.locator('#search-results [data-search-more]').waitFor();
  assert.strictEqual(await page.locator('#search-results .row[data-search-index]').count(), 20, 'results show one page at a time');
  await page.locator('#search-results [data-search-more]').click();
  assert.strictEqual(await page.locator('#search-results .row[data-search-index]').count(), 27, 'show more reveals every matching loaded record');

  await page.locator('#search-kind').selectOption('deals');
  await page.locator('#search-filter').selectOption('enquiry');
  assert.strictEqual(await page.locator('#search-results .row[data-search-index]').count(), 1, 'type and stage filters combine with the query');
  await page.locator('#search-results .row[data-search-index]').click();
  const dealForm = page.locator('dialog[open] input[name=client_name]');
  await dealForm.waitFor();
  assert.strictEqual(await dealForm.inputValue(), 'Needle deal', 'search opens the matching deal');
  await page.keyboard.press('Escape');
  await page.locator('#btn-search').click();
  await page.locator('#search-q').fill('Needle');
  await page.locator('#search-kind').selectOption('apartments');
  await page.locator('#search-filter').selectOption('sale');
  await page.locator('#search-results .row[data-search-index]').first().waitFor();
  assert.strictEqual(await page.locator('#search-results .row[data-search-index]').count(), 12, 'property type filter is applied alongside the query');
  return page;
});

test('17.1. contacts can be searched by name, phone, or email', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/owners/');
  await page.locator('#ow-q').fill('davit@example.ge');
  await page.waitForFunction(() => document.querySelectorAll('#o-body .row').length === 1);
  await page.locator('#o-body .row', { hasText: 'დავით მამულაშვილი' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row').count(), 1, 'only matching contact is shown');
  await page.locator('#ow-q').fill('თამარ');
  await page.waitForFunction(() => document.querySelector('#o-body .row strong')?.textContent.includes('თამარ'));
  await page.locator('#o-body .row', { hasText: 'თამარ გელაშვილი' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row').count(), 1, 'query updates without changing the contact type filter');
  return page;
});

test('17.2. optional dashboard read failures are explained and can be retried', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => { if (!sessionStorage.getItem('failedOptional')) { sessionStorage.setItem('failedOptional', '1'); localStorage.setItem('rigzea_mock_fail', JSON.stringify({ 'select:reservations': 1 })); } });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.locator('#data-notice', { hasText: 'ჯავშნები' }).waitFor();
  await page.locator('#btn-data-retry').click();
  await page.locator('#data-notice').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  return page;
});

test('17.3. non-managers do not request manager-only repair records', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    const own = d.tables.organization_members.find(m => m.user_id === 'aaaaaaaa-0000-4000-8000-000000000001');
    own.role = 'agent';
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
    localStorage.setItem('rigzea_mock_fail', JSON.stringify({ 'select:repairs': 1 }));
  });
  await page.reload();
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('rigzea_mock_fail'))), { 'select:repairs': 1 }, 'repair query was skipped for an agent');
  assert.strictEqual(await page.locator('#data-notice').isVisible(), false, 'skipped permission-specific read does not show a false error');
  return page;
});

test('17.4. manager repair read errors are visible and recoverable after startup', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => { if (!sessionStorage.getItem('failedRepairs')) { sessionStorage.setItem('failedRepairs', '1'); localStorage.setItem('rigzea_mock_fail', JSON.stringify({ 'select:repairs': 1 })); } });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.locator('#data-notice', { hasText: 'რემონტის ჩანაწერები' }).waitFor();
  await page.locator('#btn-data-retry').click();
  await page.locator('#data-notice').waitFor({ state: 'hidden' });
  return page;
});

test('15. sales CRM: buyer lead, sales deal commission, 7-stage pipeline advance & viewing appointment', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // 1. Verify Buyer contact
  await page.goto(BASE + '/app/owners/');
  await page.locator('[data-tab="owners"]').click();
  await page.locator('[data-oct="buyer"]').click();
  await page.locator('.row', { hasText: 'გიორგი მაისურაძე' }).waitFor();
  const contactRowText = await page.locator('.row', { hasText: 'გიორგი მაისურაძე' }).innerText();
  assert(contactRowText.includes('მყიდველი'), 'buyer badge displayed');

  // 2. Create a Sales Deal
  await page.goto(BASE + '/app/deals/');
  await page.locator('#btn-deal-new').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  await dlg.locator('#deal-type-select').selectOption('sale');
  await dlg.locator('#deal-type-select').dispatchEvent('change');
  await dlg.locator('input[name=client_name]').fill('გიორგი მაისურაძე');
  await dlg.locator('#deal-contact-type').selectOption('buyer');
  await dlg.locator('#deal-amount').fill('200000');
  await dlg.locator('#deal-amount').dispatchEvent('input');
  await dlg.locator('#deal-comm-pct').fill('3');
  await dlg.locator('#deal-comm-pct').dispatchEvent('input');
  // 3% of 200,000 = 6,000
  const netText = await dlg.locator('#deal-calc-net').innerText();
  assert(netText.includes('6 000') || netText.includes('6,000'), 'sales commission computed at 3%');
  await dlg.locator('[data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.toast-success', { hasText: 'გარიგება დაემატა' }).waitFor();

  const d = await db(page);
  const deal = d.tables.deals.find(x => x.client_name === 'გიორგი მაისურაძე');
  assert.strictEqual(deal.deal_type, 'sale');
  assert.strictEqual(deal.stage, 'enquiry');
  assert.strictEqual(Number(deal.net_commission), 6000);

  // 3. Advance through stages: enquiry -> contacted -> viewing
  await page.locator(`[data-deal-advance="${deal.id}"]`).click();
  await page.waitForFunction((id) => {
    const data = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    return data.tables.deals.find(x => x.id === id)?.stage === 'contacted';
  }, deal.id);
  assert.strictEqual((await db(page)).tables.deals.find(x => x.id === deal.id).stage, 'contacted');

  const viewingAdvanceBtn = page.locator(`[data-deal-advance="${deal.id}"][data-next-stage="viewing"]`);
  await viewingAdvanceBtn.waitFor();
  await viewingAdvanceBtn.click();
  await page.waitForFunction((id) => {
    const data = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    return data.tables.deals.find(x => x.id === id)?.stage === 'viewing';
  }, deal.id);
  assert.strictEqual((await db(page)).tables.deals.find(x => x.id === deal.id).stage, 'viewing');

  // 4. Schedule Viewing appointment task linked to this deal
  await page.locator(`[data-deal-viewing="${deal.id}"]`).click();
  const taskDlg = page.locator('dialog[open]');
  await taskDlg.waitFor();
  const taskTypeVal = await taskDlg.locator('input[name=type]:checked').inputValue();
  assert.strictEqual(taskTypeVal, 'viewing', 'viewing task pre-selected');
  await pickApartment(page, 'საბურთალო · პეკინი 15');
  await taskDlg.locator('[data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('.toast-success', { hasText: 'საქმე შეიქმნა' }).waitFor();

  const viewingTask = (await db(page)).tables.tasks.find(t => t.type === 'viewing');
  assert(viewingTask, 'viewing task created');

  // 5. Today dashboard shows real estate CRM stats
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  const todayText = await page.locator('#view').innerText();
  assert(todayText.includes('აქტიური ქონება') && todayText.includes('იყიდება'), 'active sales properties counted');
  assert(todayText.includes('დათვალიერებები'), 'viewings tracked on dashboard');
  assert.strictEqual(await page.locator('.dash-kpi').count(), 4, 'four dashboard KPI cards are shown');
  assert.strictEqual(await page.locator('.dash-analytics').count(), 1, 'analytics charts render');
  return page;
});

test('1e. dashboard layout fits phone viewport', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  assert.strictEqual(await page.locator('.bottom-nav').evaluate(el => getComputedStyle(el).display), 'grid', 'mobile navigation is visible');
  assert.strictEqual(await page.locator('.dash-kpi').count(), 4, 'all KPI cards remain visible on mobile');
  assert(await page.locator('.dash-analytics').evaluate(el => {
    const widths = [...el.children].map(child => child.getBoundingClientRect().width);
    return widths.length > 1 && widths.every(width => Math.abs(width - widths[0]) < 1);
  }), 'dashboard cards stack on mobile');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'dashboard has no horizontal page overflow');
  return page;
});

test('1f. dark mode stays green and the navbar is a pill menu', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => localStorage.setItem('rigzea_theme', 'dark'));
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  const colors = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    brand: getComputedStyle(document.querySelector('#shell')).getPropertyValue('--brand').trim(),
    logo: getComputedStyle(document.querySelector('#shell .brand-mark')).backgroundColor,
    chart: getComputedStyle(document.querySelector('.dash-stage-track span')).backgroundImage,
    button: getComputedStyle(document.querySelector('#btn-new-task')).backgroundColor,
    pill: getComputedStyle(document.querySelector('#topbar-nav .nav-pill')).backgroundImage,
    activeText: getComputedStyle(document.querySelector('#topbar-nav a[aria-current="page"]')).color,
    success: getComputedStyle(document.querySelector('#shell')).getPropertyValue('--ok').trim(),
    navRadius: getComputedStyle(document.querySelector('#topbar-nav')).borderTopLeftRadius,
  }));
  assert.strictEqual(colors.theme, 'dark', 'dark theme is active');
  assert.strictEqual(colors.brand, '#047857', 'dark-mode brand is green');
  assert.strictEqual(colors.logo, 'rgb(4, 120, 87)', 'logo tile is brand green');
  assert(colors.chart.includes('52, 211, 153'), 'dashboard chart bars use green');
  assert.strictEqual(colors.button, 'rgb(4, 120, 87)', 'primary buttons are green');
  assert(colors.pill.includes('4, 120, 87'), 'sliding nav pill is green');
  assert.strictEqual(colors.activeText, 'rgb(255, 255, 255)', 'active tab text is white');
  assert.strictEqual(colors.success, '#34d399', 'success accents are green');
  assert.strictEqual(colors.navRadius, '999px', 'nav is a pill');
  return page;
});

test('1g. light mode stays light and green', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => localStorage.setItem('rigzea_theme', 'light'));
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  const colors = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    bg: getComputedStyle(document.querySelector('#shell')).getPropertyValue('--bg').trim(),
    surface: getComputedStyle(document.querySelector('#shell')).getPropertyValue('--surface').trim(),
    button: getComputedStyle(document.querySelector('#btn-new-task')).backgroundColor,
    chart: getComputedStyle(document.querySelector('.dash-stage-track span')).backgroundImage,
  }));
  assert.strictEqual(colors.theme, 'light', 'light theme is active');
  assert.strictEqual(colors.bg, '#f6f7f8', 'light mode keeps a light canvas');
  assert.strictEqual(colors.surface, '#ffffff', 'light mode keeps white cards');
  assert.strictEqual(colors.button, 'rgb(10, 92, 68)', 'primary buttons are green');
  assert(colors.chart.includes('10, 92, 68'), 'dashboard chart bars are green');
  return page;
});

test('1h. dashboard quick actions open their forms', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  for (const [qa, title] of [['apartment', 'ახალი უძრავი ქონება'], ['deal', 'ახალი გარიგება'], ['task', 'ახალი საქმე']]) {
    await page.locator(`.dash-action[data-qa=${qa}]`).click();
    await page.locator('dialog[open]', { hasText: title }).waitFor();
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
  }
  return page;
});

test('1i. switching areas swaps the page in place without a reload', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  await page.evaluate(() => { window.__noReload = true; });
  for (const [href, title] of [['/app/deals/', 'გარიგებები'], ['/app/apartments/', 'ბინები'], ['/app/', 'მთავარი']]) {
    await page.locator(`#topbar-nav a[href="${href}"]`).click();
    await page.waitForFunction((t) => document.title === `Rigzea: ${t}`, title);
    assert.strictEqual(new URL(page.url()).pathname, href);
    assert(await page.evaluate(() => window.__noReload === true), `${href} reloaded the page`);
  }
  await page.goBack();
  await page.waitForFunction(() => document.title === 'Rigzea: ბინები');
  assert(await page.evaluate(() => window.__noReload === true), 'back button reloaded the page');
  return page;
});

test('1j. pages animate in, and only fade when the system asks for less motion', async (browser) => {
  const probe = (page) => page.evaluate(() => { const el = document.querySelector('#view .dash-kpi'); const cs = getComputedStyle(el); return { name: cs.animationName, duration: cs.animationDuration }; });
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('#view .dash-kpi').first().waitFor();
  assert.strictEqual((await probe(page)).name, 'swipeIn', 'full reveal by default');
  const phone = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  await phone.goto(BASE + '/app/');
  await phone.locator('#view .dash-kpi').first().waitFor();
  assert.strictEqual((await probe(phone)).name, 'swipeInPhone', 'phones get the reveal too');
  await phone.context().close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/app/');
  await page.locator('#view .dash-kpi').first().waitFor();
  const reduced = await probe(page);
  assert.strictEqual(reduced.name, 'fadeIn', 'fade only with reduced motion');
  assert.strictEqual(reduced.duration, '0.4s', 'fade is not cut to zero length');
  return page;
});

test('1k. charts start at zero and fill when scrolled into view, even with reduced motion', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(BASE + '/app/');
  await page.locator('.dash-donut').waitFor();
  const donut = page.locator('.dash-donut');
  assert.strictEqual(await donut.getAttribute('data-fill'), 'wait', 'ring waits below the fold');
  assert.strictEqual(await page.locator('.dash-stage-track span').first().evaluate(el => getComputedStyle(el).transform), 'matrix(1, 0, 0, 0, 0, 0)', 'bars start flat');
  await donut.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.dash-donut').dataset.fill === 'go');
  const bar = await page.locator('.dash-stage-track span').first().evaluate(el => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration }));
  assert.strictEqual(bar.name, 'growY');
  assert.strictEqual(bar.duration, '1s', 'chart animation is not cut by reduced motion');
  return page;
});

test('1l. the + button opens its menu on a phone and every item is reachable', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('#btn-new-task').waitFor();
  const box = await page.locator('#btn-new-task').boundingBox();
  assert(box.width >= 38 && box.height >= 38 && Math.abs(box.width - box.height) < 2, `+ is a round tap target: ${JSON.stringify(box)}`);
  await page.locator('#btn-new-task').click();
  const panel = page.locator('#quick-add-panel');
  await panel.waitFor({ state: 'visible' });
  await page.waitForTimeout(700);
  const info = await panel.evaluate((el) => { const r = el.getBoundingClientRect(); const nav = document.querySelector('.bottom-nav').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, navTop: nav.top, iw: innerWidth, ih: innerHeight }; });
  assert(info.left >= 0 && info.right <= info.iw, `menu fits the width: ${JSON.stringify(info)}`);
  assert(info.top >= 0 && info.bottom <= info.navTop + 1, `menu sits above the tab bar: ${JSON.stringify(info)}`);
  for (const qa of ['apartment', 'deal', 'viewing', 'task']) {
    const item = page.locator(`#quick-add-panel [data-qa=${qa}]`);
    const r = await item.boundingBox();
    assert(r && r.height >= 44, `${qa} item is a 44px tap target: ${JSON.stringify(r)}`);
  }
  await page.locator('#quick-add-panel [data-qa=task]').click();
  await page.locator('dialog[open]').waitFor();
  return page;
});

test('1n. clicking navbar tabs fast keeps the pill glued to the active tab and ends exactly on it', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('#topbar-nav .is-active').waitFor();
  await page.waitForTimeout(800);
  const gap = () => page.evaluate(() => {
    const p = document.querySelector('#topbar-nav .nav-pill').getBoundingClientRect(), a = document.querySelector('#topbar-nav .is-active').getBoundingClientRect();
    return Math.max(Math.abs(p.left - a.left), Math.abs(p.right - a.right));
  });
  assert(await gap() <= 1, 'pill is on the active tab on first paint');
  // six switches 70ms apart, back and forth, while the previous ones are still animating
  await page.evaluate(() => new Promise((done) => {
    const ids = ['apartments', 'finance', 'contacts', 'deals', 'today', 'finance'];
    ids.forEach((id, i) => setTimeout(() => { document.querySelector(`#topbar-nav a[data-id="${id}"]`).click(); if (i === ids.length - 1) done(); }, i * 70));
  }));
  await page.waitForTimeout(1200);
  const end = await gap();
  assert(end <= 1, `pill is ${end}px off the active tab after the animation`);
  assert.strictEqual(await page.locator('#topbar-nav .is-active').getAttribute('data-id'), 'finance');
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(300);
  assert(await gap() <= 1, 'pill follows the tab after a resize');
  assert.deepStrictEqual(page.errors, []);
  return page;
});

test('1m. the plans list highlights the plan you are on', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/settings/?id=plan');
  await page.locator('.plan-grid').waitFor();
  const trial = await page.locator('.plan-trial').count();
  const current = await page.locator('.plan-card.is-current').count();
  assert.strictEqual(trial + current, 1, 'exactly one highlighted "your plan" block');
  assert((await page.locator('.plan-grid .plan-tag-now').first().innerText()).includes('შენი პაკეტი'), 'it says it is your plan');
  return page;
});

test('1o. the menu can move to the left side and the English switch stays', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.locator('#topbar-nav .is-active').waitFor();
  assert(await page.locator('#rail').isHidden(), 'left menu is off by default');
  await page.locator('#btn-user').click();
  await page.locator('[data-nav-mode="side"]').click();
  await page.locator('#rail .nav-item').first().waitFor({ state: 'visible' });
  assert(await page.locator('#topbar-nav').isHidden(), 'top menu is hidden in left mode');
  assert.strictEqual(await page.locator('#rail .nav-item').count(), 8, 'all eight areas are in the left menu');
  assert(await page.locator('#rail [data-lang-toggle]').isVisible(), 'English switch is in the left menu');
  assert(await page.locator('#btn-lang').isVisible(), 'English switch is also in the top bar');
  const right = await page.locator('#btn-user').boundingBox();
  assert(right.x > 1100, `top bar buttons stay on the right: ${right.x}`);
  await page.locator('#rail a[href="/app/deals/"]').click();
  await page.waitForURL('**/app/deals/');
  await page.waitForTimeout(800);
  const hl = await page.evaluate(() => { const a = document.querySelector('#rail .nav-item[aria-current="page"]').getBoundingClientRect(), p = document.querySelector('#rail .rail-pill').getBoundingClientRect(); return Math.abs(a.top - p.top) + Math.abs(a.height - p.height); });
  assert(hl < 1.5, `green highlight sits on the active item: ${hl}`);
  await page.reload();
  await page.locator('#rail .nav-item').first().waitFor({ state: 'visible' });
  assert(await page.evaluate(() => document.documentElement.classList.contains('nav-side')), 'choice is remembered');
  return page;
});

test('16. sales public listing: sales price, sqm price, no rental labels or internal owner data leak', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
    const saleApt = d.tables.apartments.find(a => a.transaction_type === 'sale');
    if (saleApt) {
      saleApt.slug = 'pekin-15-sale';
      localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
    }
  });
  await page.goto(BASE + '/p/?id=pekin-15-sale');
  await page.locator('h1.p-title', { hasText: 'საბურთალო · პეკინი 15' }).waitFor();
  const body = await page.locator('body').innerText();
  assert(body.includes('180 000') || body.includes('$180,000'), 'sales price shown');
  assert(body.includes('2 000') || body.includes('2,000'), 'price per sqm shown');
  assert(!body.includes('/ თვეში') && !body.includes('თვიური ქირა'), 'no rental monthly labels on sale listing');
  assert(!body.includes('დეპოზიტი') && !body.includes('პირველი და ბოლო'), 'no rental lease terms on sale listing');
  assert(!/მამულაშვილი|577 00 11 22/.test(body), 'owner contact not leaked');

  // Test api/p.js buildMeta server-side OpenGraph generator directly
  const { buildMeta } = require(path.join(__dirname, '..', 'api', 'p.js'));
  const meta = buildMeta({
    apartment: { name: 'პეკინის 15', transaction_type: 'sale', sale_price: 180000, currency: 'USD', rooms: 3, area_sqm: 90, city: 'თბილისი' },
    agency: { name: 'Rigzea' }
  }, 'https://rigzea.ge/p/pekin-15-sale', false);
  assert(meta.tags.includes('(იყიდება)'), 'OpenGraph contains (იყიდება)');
  assert(!meta.tags.includes('/ თვეში'), 'OpenGraph does not contain rental suffix for sale');
  return page;
});

test('17. navigation: rentals and sales sections scope apartments, contacts and deals', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // The menu has one "contacts" item; buyers, landlords and tenants are filtered views of it.
  const go = async (hash) => { await page.goto(BASE + '/app/' + hash); };
  await go('#/owners?type=buyer');
  await page.getByRole('heading', { name: 'მყიდველები', exact: true }).waitFor();
  await page.locator('#o-body .row', { hasText: 'გიორგი მაისურაძე' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row', { hasText: 'დავით მამულაშვილი' }).count(), 0, 'landlord is not listed among buyers');
  assert.strictEqual(await page.locator('#topbar-nav [aria-current="page"]').getAttribute('href'), '/app/owners/');

  await go('#/owners?type=owner');
  await page.getByRole('heading', { name: 'მეპატრონეები', exact: true }).waitFor();
  await page.locator('#o-body .row', { hasText: 'დავით მამულაშვილი' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row', { hasText: 'გიორგი მაისურაძე' }).count(), 0, 'buyer is not listed among landlords');

  // A contact added from the tenants page is saved as a tenant
  await go('#/owners?type=renter');
  await page.getByRole('heading', { name: 'მდგმურები', exact: true }).waitFor();
  await page.locator('#o-new').click();
  const dlg = page.locator('dialog[open]');
  assert.strictEqual(await dlg.locator('#ow-contact-type').inputValue(), 'renter');
  await dlg.locator('input[name=name]').fill('ლიკა თოდუა');
  await dlg.locator('[data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('#o-body .row', { hasText: 'ლიკა თოდუა' }).waitFor();
  assert.strictEqual((await db(page)).tables.owners.find(o => o.name === 'ლიკა თოდუა').contact_type, 'renter');

  // The contact's own page keeps the section highlighted
  await page.locator('#o-body .row', { hasText: 'ლიკა თოდუა' }).click();
  await page.getByRole('heading', { name: 'ლიკა თოდუა' }).waitFor();
  assert.strictEqual(await page.locator('#topbar-nav [aria-current="page"]').getAttribute('href'), '/app/owners/');

  // Apartments and deals follow the section
  await go('#/apartments?type=sale');
  await page.getByRole('heading', { name: 'გასაყიდი ბინები', exact: true }).waitFor();
  assert.strictEqual(await page.locator('[data-tp]').count(), 0, 'no type filter inside the sales section');
  await go('#/deals?type=sale');
  await page.getByRole('heading', { name: 'გაყიდვის გარიგებები', exact: true }).waitFor();
  await page.locator('#btn-deal-new').click();
  assert.strictEqual(await page.locator('dialog[open] #deal-type-select').inputValue(), 'sale');
  await page.keyboard.press('Escape');
  await page.context().close();

  // Phone: section tabs above the content, sections in the bottom bar, the rest in the menu
  const phone = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  const tabCount = { apartments: 3, owners: 5, deals: 3 };
  for (const hash of ['#/apartments?type=rent', '#/owners?type=renter', '#/owners?type=owner&tab=approvals', '#/deals?type=sale']) {
    await phone.goto(BASE + '/app/' + hash);
    await phone.locator('#view h1').waitFor();
    await phone.waitForTimeout(150);
    const { sw, w } = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(sw <= w, `${hash} overflows: ${sw} > ${w}`);
    assert.strictEqual(await phone.locator('#section-bar a').count(), tabCount[hash.slice(2).split('?')[0]], `${hash} shows the section tabs`);
  }
  assert.strictEqual((await phone.locator('#bottom-nav [aria-current="page"]').innerText()).trim(), 'გარიგებები');
  await phone.goto(BASE + '/app/owners/');
  await phone.locator('#section-bar a[href="/app/owners/?type=seller"]').click();
  await phone.getByRole('heading', { name: 'გამყიდველები', exact: true }).waitFor();
  await phone.locator('#btn-more').click();
  await phone.locator('dialog[open] a[href="/app/finance/"]').click();
  await phone.getByRole('heading', { name: 'ფინანსები', exact: true }).waitFor();
  assert(await phone.locator('#section-bar').isHidden(), 'no section tabs outside a section');
  return phone;
});

test('18. co-broker share: owner data hidden by default, toggles rebuild the text, daily digest', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await page.locator('#a-share').click();
  const dlg = page.locator('dialog[open]');
  const text = () => dlg.locator('#cb-output').inputValue();
  let t = await text();
  assert(!t.includes('577 00 11 22') && !t.includes('დავით მამულაშვილი'), 'owner is hidden by default');
  assert(t.includes('შერიფ ხიმშიაშვილის') && !t.includes('ხიმშიაშვილის 7'), 'building number is removed from the address');
  assert(t.includes('50/50'), 'default commission terms');
  assert(/\/p\/[^\s]+\/\?wl=1/.test(t), 'white-label link is included');
  assert((await dlg.locator('#cb-wa').getAttribute('href')).startsWith('https://wa.me/?text='), 'WhatsApp deep link');

  await dlg.locator('#cb-hide').uncheck();
  await dlg.locator('#cb-short').uncheck();
  await dlg.locator('#cb-terms').selectOption('percent');
  t = await text();
  assert(t.includes('დავით მამულაშვილი') && t.includes('577 00 11 22'), 'owner shown when the toggle is off');
  assert(t.includes('ხიმშიაშვილის 7'), 'full address when shortening is off');
  assert(t.includes('1%') && !t.includes('50/50'), 'commission terms follow the selector');
  await dlg.locator('#cb-margin').fill('10');
  assert(!(await text()).includes('/p/?id='), 'link is dropped when a price margin is added');
  assert(decodeURIComponent(await dlg.locator('#cb-wa').getAttribute('href')).includes('1%'), 'WhatsApp link carries the current text');
  await page.keyboard.press('Escape');

  await page.goto(BASE + '/app/');
  await page.locator('#btn-digest').click();
  const digest = await page.locator('dialog[open] #digest-output').inputValue();
  assert(digest.includes('დღევანდელი ნახვები') && digest.includes('ცხელი ობიექტები'), 'digest lists viewings and hot listings');
  assert((await page.locator('dialog[open] #digest-tg').getAttribute('href')).startsWith('https://t.me/share/url?'), 'Telegram share link');
  return page;
});

test('19. trust: cadastral duplicate banner, unreliable client flag warns in contact and deal forms', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // Save a cadastral code on an existing property (dots are inserted while typing)
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await page.locator('#a-edit').click();
  await page.locator('dialog[open] #apt-cadastral').fill('01101400901' + '1');
  assert.strictEqual(await page.locator('dialog[open] #apt-cadastral').inputValue(), '01.10.14.009.011');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.strictEqual((await db(page)).tables.apartments.find(a => a.id === 'dddddddd-0000-4000-8000-000000000001').cadastral_code, '01.10.14.009.011');

  // Adding another property with the same code warns immediately
  await page.goto(BASE + '/app/apartments/?type=rent');
  await page.locator('#btn-apt-new').click();
  const dlg = page.locator('dialog[open]');
  await openMore(dlg);
  await dlg.locator('#apt-cadastral').fill('01101400901');
  assert(await dlg.locator('#apt-dup').isHidden(), 'no warning for an incomplete code');
  await dlg.locator('input[name=name]').fill('დუბლიკატი');
  await dlg.locator('input[name=address]').fill('შერიფ ხიმშიაშვილის 7');
  await dlg.locator('[data-submit]').click();
  await dlg.locator('.form-error', { hasText: 'საკადასტრო კოდი არასრულია' }).waitFor();
  await dlg.locator('#apt-cadastral').fill('01101400901' + '1');
  const banner = await dlg.locator('#apt-dup-banner').innerText();
  assert(banner.includes('ობიექტი უკვე ბაზაშია') && banner.includes('Orbi City · 1204') && banner.includes('სტატუსი'), 'duplicate banner names the existing property');
  await page.keyboard.press('Escape');

  // Mark a buyer as unreliable
  await page.goto(BASE + '/app/owners/?id=cccccccc-0000-4000-8000-000000000003');
  await page.locator('#ow-edit').click();
  await page.locator('dialog[open] #ow-flag').check();
  await page.locator('dialog[open] textarea[name=flag_note]').fill('არ იხდის საკომისიოს');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await page.locator('#ow-flag-banner').innerText()).includes('არ იხდის საკომისიოს'));
  const flagged = (await db(page)).tables.owners.find(o => o.id === 'cccccccc-0000-4000-8000-000000000003');
  assert(flagged.is_flagged === true && flagged.flagged_by_name, 'flag and who set it are saved');

  // The same number typed in a new deal or a new contact shows the warning
  await page.goto(BASE + '/app/deals/?type=sale');
  await page.locator('#btn-deal-new').click();
  await page.locator('dialog[open] #deal-client-phone').fill('591 00 22 33');
  assert((await page.locator('dialog[open] #deal-flag-banner').innerText()).includes('არ იხდის საკომისიოს'));
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/app/owners/?type=buyer');
  await page.locator('#o-body .badge-danger', { hasText: 'არასანდო' }).waitFor();
  await page.locator('#o-new').click();
  await page.locator('dialog[open] input[name=phone]').fill('+995591002233');
  assert((await page.locator('dialog[open] #ow-dup-banner').innerText()).includes('არასანდო კლიენტი'));
  return page;
});

test('20. documents: PDF presentation templates, auto-filled sale contract, registry check', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await page.locator('#a-pdf').click();
  const pz = page.locator('dialog[open] #pz-preview');
  await pz.locator('.pz-page').first().waitFor();
  assert.strictEqual(await pz.locator('.pz-page').count(), 2, 'catalog has two pages');
  assert((await pz.innerText()).includes('Orbi City · 1204'), 'presentation shows the property');
  await page.locator('dialog[open] input[name="pz-template"][value="flyer"]').check({ force: true });
  assert.strictEqual(await pz.locator('.pz-page').count(), 1, 'flyer is one page');
  assert((await page.locator('dialog[open] #pz-wa').getAttribute('href')).startsWith('https://wa.me/?text='));
  await page.keyboard.press('Escape');

  // Deposit agreement filled from the property and its owner
  await page.goto(BASE + '/app/deals/?id=documents&type=sale');
  await page.locator('[data-doc="deposit"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('#doc-apt').selectOption('dddddddd-0000-4000-8000-000000000001');
  assert.strictEqual(await dlg.locator('input[name=owner_name]').inputValue(), 'დავით მამულაშვილი');
  assert((await dlg.locator('input[name=property_address]').inputValue()).includes('შერიფ ხიმშიაშვილის 7'));
  await dlg.locator('input[name=buyer_name]').fill('ნიკა ბერიძე');
  await dlg.locator('input[name=price]').fill('120000');
  await dlg.locator('input[name=deposit_amount]').fill('5000');
  await dlg.locator('[data-submit]').click();
  const paper = page.locator('dialog[open] #doc-paper');
  await paper.waitFor();
  const doc = await paper.innerText();
  assert(/ბეს \/ წინარე ნასყიდობის ხელშეკრულება/i.test(doc) && doc.includes('ორმაგი ოდენობით'), 'deposit agreement text');
  assert(doc.includes('დავით მამულაშვილი') && doc.includes('ნიკა ბერიძე') && doc.includes('5 000 აშშ დოლარი'), 'parties and amounts are injected');
  assert.strictEqual((await db(page)).tables.contracts.at(-1).data.doc_type, 'deposit');
  await page.keyboard.press('Escape');
  await page.locator('[data-saved]', { hasText: 'ბეს / წინარე ნასყიდობის' }).waitFor();

  // Registry check opens the public registry search
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await page.locator('#napr-code').fill('01101400901' + '1');
  await page.locator('#napr-go').click();
  assert((await page.evaluate(() => window.__opened)).some(u => u.includes('naprweb.reestri.gov.ge')), 'registry page opened');
  return page;
});

test('21. smart import: a listing link fills the new property form, errors are explained', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  let mode = 'ok';
  await page.route('**/api/import-listing/', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (mode === 'blocked') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'blocked', message: 'საიტმა ავტომატური წაკითხვა დაბლოკა. შეავსე ველები ხელით ან სცადე მოგვიანებით.' }) });
    assert(route.request().headers().authorization?.startsWith('Bearer '), 'request is authenticated');
    assert(body.url.includes('myhome.ge'));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, listing: {
      source: 'myhome.ge', name: 'მთაწმინდა · რუსთაველის გამზ., 4-ოთახიანი', transaction_type: 'sale', property_type: 'apartment', city: 'თბილისი', district: 'მთაწმინდა', address: 'რუსთაველის გამზ.',
      area_sqm: 115, floor: 1, total_floors: 3, rooms: 4, bedrooms: 3, bathrooms: 1, price: 123000, currency: 'USD', price_sqm: 1070, lat: 41.69, lng: 44.79, cadastral_code: null,
      description: 'ნათელი ბინა ცენტრში.', images: [] } }) });
  });
  await page.goto(BASE + '/app/apartments/?type=rent');
  await page.locator('#btn-apt-new').click();
  const dlg = page.locator('dialog[open]');

  await dlg.locator('#apt-import-url').fill('https://example.com/listing');
  await dlg.locator('#apt-import-go').click();
  await dlg.locator('#apt-import-msg.t-danger').waitFor();

  mode = 'blocked';
  await dlg.locator('#apt-import-url').fill('https://www.myhome.ge/pr/26242248/');
  await dlg.locator('#apt-import-go').click();
  await dlg.locator('#apt-import-msg.t-danger', { hasText: 'დაბლოკა' }).waitFor();

  mode = 'ok';
  await dlg.locator('#apt-import-go').click();
  await dlg.locator('#apt-import-msg.t-ok').waitFor();
  assert.strictEqual(await dlg.locator('#apt-tx-type').inputValue(), 'sale', 'transaction type switches to sale');
  assert.strictEqual(await dlg.locator('input[name=name]').inputValue(), 'მთაწმინდა · რუსთაველის გამზ., 4-ოთახიანი');
  assert.strictEqual(await dlg.locator('#apt-sale-price').inputValue(), '123000');
  assert.strictEqual(await dlg.locator('#apt-price-sqm').inputValue(), '1070');
  assert.strictEqual(await dlg.locator('input[name=rooms]').inputValue(), '4');
  await dlg.locator('[data-submit]').click();
  await page.locator('.toast-success', { hasText: 'ობიექტი დაემატა' }).waitFor();
  const row = (await db(page)).tables.apartments.find(a => a.name.startsWith('მთაწმინდა · რუსთაველის'));
  assert(row.transaction_type === 'sale' && Number(row.sale_price) === 123000 && Number(row.area_sqm) === 115 && row.district === 'მთაწმინდა', 'imported values are saved');
  return page;
});

test('22. team: commission split, payout marks, leaderboard and the agent role', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/deals/?type=sale');
  await page.locator('#btn-deal-new').click();
  const dlg = page.locator('dialog[open]');
  await dlg.locator('input[name=client_name]').fill('ლევან ჩხეიძე');
  await dlg.locator('#deal-amount').fill('200000');
  await dlg.locator('#deal-comm-pct').fill('3');
  await openMore(dlg);
  await dlg.locator('#deal-listing-agent').selectOption({ label: 'ნინო ბერიძე' });
  await dlg.locator('#deal-stage-select').selectOption('closed');
  // net 6 000: 25% + 25% to the agents, 50% to the agency
  const split = (await dlg.locator('#deal-split-out').innerText()).replace(/\s+/g, ' ');
  // Amounts use the Georgian thousands separator (a space), e.g. "$1 500".
  assert((split.match(/\$1[ ,  ]500/g) || []).length === 2 && /\$3[ ,  ]000/.test(split) && split.includes('სააგენტო (50%)'), 'split amounts: ' + split);
  await dlg.locator('#deal-listing-split').fill('80');
  assert((await dlg.locator('#deal-split-out').innerText()).includes('100%-ს აღემატება'), 'over 100% is refused');
  await dlg.locator('#deal-listing-split').fill('25');
  await dlg.locator('[data-submit]').click();
  await page.locator('.toast-success', { hasText: 'გარიგება დაემატა' }).waitFor();
  const deal = (await db(page)).tables.deals.find(x => x.client_name === 'ლევან ჩხეიძე');
  assert(deal.listing_agent_id && deal.selling_agent_id && Number(deal.listing_split) === 25 && Number(deal.selling_split) === 25);

  await page.goto(BASE + '/app/deals/?id=commissions&type=sale');
  const payouts = page.locator('#team-payouts');
  await payouts.waitFor();
  assert.strictEqual(await payouts.locator(`[data-payout="${deal.id}"]`).count(), 2, 'one payout line per agent');
  await payouts.locator(`[data-payout="${deal.id}"][data-role="listing"]`).click();
  await page.locator(`[data-payout="${deal.id}"][data-role="listing"][aria-pressed="true"]`).waitFor();
  assert.strictEqual((await db(page)).tables.deals.find(x => x.id === deal.id).listing_paid, true);
  const board = (await page.locator('#leaderboard').innerText()).replace(/\s+/g, ' ');
  assert(board.includes('ნინო ბერიძე') && /\$200[ ,  ]000/.test(board) && /\$3[ ,  ]000/.test(board), 'leaderboard: ' + board);
  await page.context().close();

  // Agent: no finance or team pages, owner contact hidden until a viewing exists
  const agent = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await agent.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb') || 'null') || structuredClone(window.__MOCK_SEED);
    d.tables.organization_members.find(m => m.user_id === 'aaaaaaaa-0000-4000-8000-000000000001').role = 'agent';
    // What row-level security returns to an agent: other people's contacts are absent.
    d.tables.owners = d.tables.owners.filter(o => o.contact_type === 'buyer');
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  });
  await agent.goto(BASE + '/app/finance/');
  await agent.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  assert.strictEqual(await agent.locator('#topbar-nav a[href="/app/finance/"], #topbar-nav a[href="/app/team/"], #topbar-nav a[href="/app/settings/"]').count(), 0, 'management pages are not in the menu');
  assert.strictEqual(await agent.locator('#topbar-nav a[href="/app/deals/"]').count(), 1);
  await agent.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await agent.locator('#a-owner-masked').waitFor();
  assert(!(await agent.locator('#view').innerText()).includes('577 00 11 22'), 'owner phone is not shown');
  return agent;
});

test('23. password reset link asks for a new password before opening the workspace', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // js/config.js notes the link type before the auth client clears it from the address.
  await page.goto(BASE + '/app/#access_token=x&type=recovery');
  assert.strictEqual(await page.evaluate(() => window.RIGZEA_RECOVERY), true);
  await page.locator('#form-newpass h1', { hasText: 'ახალი პაროლი' }).waitFor();
  assert.strictEqual(await page.locator('.layout').isVisible().catch(() => false), false, 'workspace stays closed until the password is set');
  await page.fill('#form-newpass input[name=password]', 'newpass123');
  await page.fill('#form-newpass input[name=password2]', 'different1');
  await page.click('#form-newpass [type=submit]');
  await page.locator('#form-newpass .form-error', { hasText: 'არ ემთხვევა' }).waitFor();
  await page.fill('#form-newpass input[name=password2]', 'newpass123');
  await page.click('#form-newpass [type=submit]');
  await page.locator('.toast', { hasText: 'პაროლი შეიცვალა' }).waitFor();
  await page.locator('.layout').waitFor();
  assert.strictEqual((await db(page)).users.find(u => u.email === USERS.manager.email).password, 'newpass123');
  for (let i = page.errors.length - 1; i >= 0; i--) if (page.errors[i].includes('არ ემთხვევა')) page.errors.splice(i, 1); // the mismatch above is expected
  return page;
});

test('24. honest owner report, direct lead source, guest guide keeps codes behind the token', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // Owner report: no invented numbers (the apartment has no deals or viewings this week)
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await page.locator('#btn-owner-report').click();
  const report = await page.locator('dialog[open] #or-text').inputValue();
  assert(/ახალი მოთხოვნები: 0/.test(report) && /ბინის ჩვენებები: 0/.test(report), 'report shows real counts: ' + report.slice(0, 300));
  await page.keyboard.press('Escape');

  // A new contact is saved with lead source "direct", not the first option (Instagram)
  await page.goto(BASE + '/app/owners/?type=buyer');
  await page.locator('#o-new').click();
  await page.locator('dialog[open] input[name=name]').fill('ტესტ წყარო');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.strictEqual((await db(page)).tables.owners.find(o => o.name === 'ტესტ წყარო').lead_source, 'direct');

  // The apartment page links the guest guide by token; the old id link hides the codes
  const href = await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001').then(() => page.locator('a[href^="/guide/"]').getAttribute('href'));
  assert(href.includes('t=g1d3t0k3n'), 'guide link uses the token: ' + href);
  await page.goto(BASE + href);
  await page.locator('.door-code', { hasText: '4821#' }).waitFor();
  await page.goto(BASE + '/guide/?apt=dddddddd-0000-4000-8000-000000000001');
  await page.locator('.guide-hero h1').waitFor();
  const body = await page.locator('body').innerText();
  assert(!body.includes('4821') && !body.includes('sea-view-24'), 'id link must not show door code or Wi-Fi password');
  return page;
});

test('25. an expired private receipt link is re-signed when clicked', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/finance/');
  await page.locator('#view h1').waitFor();
  // A one-year link that expired in 2020 (JWT payload {"exp":1600000000})
  const expired = 'https://x.supabase.co/storage/v1/object/sign/rigzea-private/org/receipts/a.jpg?token=h.' + Buffer.from('{"exp":1600000000}').toString('base64url') + '.s';
  await page.evaluate((u) => { const a = document.createElement('a'); a.id = 'old-receipt'; a.href = u; a.target = '_blank'; a.textContent = 'ქვითარი'; document.body.append(a); }, expired);
  const [popup] = await Promise.all([page.context().waitForEvent('page'), page.locator('#old-receipt').click()]);
  await popup.waitForURL(/mock\.storage\.local\/signed\/org\/receipts\/a\.jpg/);
  await popup.close();
  return page;
});

test('26. a capped list says how much is hidden and can load more', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  // Seed more expenses than a deliberately small cap, then reload the workspace with that cap.
  await page.evaluate((uid) => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    const org = d.tables.organization_members.find(m => m.user_id === uid).organization_id;
    for (let i = 0; i < 6; i++) d.tables.expenses.push({ id: 'e2e-exp-' + i, organization_id: org, amount: 5 + i, expense_date: '2026-02-0' + (i + 1), status: 'incurred', created_at: new Date().toISOString() });
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
    window.App.S.limits.expenses = 2;
    return window.App.refresh({ quiet: true });
  }, USERS.manager.id);
  const notice = page.locator('#data-notice');
  await notice.waitFor();
  const text = await notice.innerText();
  assert(/ხარჯები 2\/\d+/.test(text), 'notice says how many expenses are hidden: ' + text);
  // Loading more raises the cap and the notice disappears once everything fits.
  await notice.getByRole('button', { name: /ხარჯები/ }).click();
  await page.waitForFunction(() => document.querySelector('#data-notice')?.hidden === true);
  return page;
});

test('27. watermarking every photo saves them and closes the tool', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await seedListing(page);
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000003');
  await page.locator('#a-edit').click();
  await page.locator('dialog[open] [data-pm-input]').setInputFiles([FIXTURE, FIXTURE]);
  await page.locator('dialog[open] .pm-item img').nth(1).waitFor();
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  // The watermark tool used to throw while closing after a successful save, leaving the modal open.
  await page.locator('#btn-watermark').click();
  await page.locator('dialog[open] #btn-wm-save-apt').waitFor();
  await page.locator('dialog[open] #wm-select-pos').selectOption('diag');
  await page.locator('dialog[open] #btn-wm-save-apt').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const apt = (await db(page)).tables.apartments.find(a => a.id === 'dddddddd-0000-4000-8000-000000000003');
  assert.strictEqual(apt.photos.length, 2, 'both photos kept');
  assert(apt.photos.every(p => p.wm === true), 'every photo is marked as watermarked');
  return page;
});

test('29. the portal button hands public listing data to the extension and warns when it is missing', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/apartments/?id=dddddddd-0000-4000-8000-000000000001');
  await page.locator('#btn-post-portals').waitFor();
  // No extension answers: the install guide opens with the download link
  await page.locator('#btn-post-portals').click();
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open] a[href="/downloads/rigzea-extension.zip"]').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('#btn-post-portals').click();
  // A stand-in extension acknowledges and records the payload
  await page.evaluate(() => {
    window.__posted = null;
    window.addEventListener('message', (e) => {
      if (e.source === window && e.data?.type === 'rigzea:post') { window.__posted = e.data; window.postMessage({ type: 'rigzea:ack' }, location.origin); }
    });
  });
  await page.locator('dialog[open] select[name=target]').selectOption('ss');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  const posted = await page.evaluate(() => window.__posted);
  assert.deepStrictEqual(posted.targets, ['ss']);
  const json = JSON.stringify(posted.listing);
  assert(!/4821#|sea-view-24|door_code|wifi/.test(json), 'private fields leaked: ' + json.slice(0, 300));
  assert(posted.listing.city === 'ბათუმი', 'public fields are sent');
  return page;
});

test('30. with FORCE_NO_TRIAL a trial workspace is limited at once and card checkout goes to the KISA payment page', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.addInitScript(() => { window.RIGZEA_FORCE_NO_TRIAL = true; });
  // The server creates the pending payment and returns KISA's hosted checkout link.
  let reply = { ok: false, message: 'ბარათით გადახდა დროებით მიუწვდომელია.' };
  const posted = [];
  await page.route('**/api/kisa-checkout', route => { posted.push(route.request().postDataJSON()); route.fulfill({ status: reply.ok ? 200 : 503, contentType: 'application/json', body: JSON.stringify(reply) }); });
  await page.goto(BASE + '/app/');
  await page.waitForFunction(() => window.App && App.S.data && App.S.org);
  const st = await page.evaluate(() => { App.S.org.plan = 'trial'; App.S.org.trial_ends_at = new Date(Date.now() + 20 * 864e5).toISOString(); const s = App.planState(); return { eff: s.eff, trial: s.trial, ended: s.trialEnded }; });
  assert.deepStrictEqual([st.eff, st.trial, st.ended], ['starter', false, true]);
  await page.evaluate(() => { App.openUpgrade({ kind: 'info' }); }); // the dialog promise only settles on close
  const pay = page.locator('dialog[open] .plan-card', { hasText: 'დამწყები' }).locator('[data-kisa-checkout="starter"]');
  // A refused checkout explains itself and stays on the page.
  await pay.click();
  await page.locator('.toast', { hasText: 'დროებით მიუწვდომელია' }).waitFor();
  assert.ok(page.url().startsWith(BASE + '/app/'), 'stays in the app when checkout is refused');
  page.errors = page.errors.filter(e => !e.includes('kisa checkout error')); // the refusal is logged on purpose
  // An accepted checkout sends the agent to the payment page for the chosen plan.
  reply = { ok: true, checkoutUrl: 'https://pay.kisa.ge/checkout/test-1' };
  await Promise.all([page.waitForURL('https://pay.kisa.ge/**'), pay.click()]);
  assert.strictEqual(posted.length, 2);
  assert.strictEqual(posted[1].plan, 'starter');
  assert.ok(posted[1].orgId, 'organization is sent');
  return page;
});

test('28. the service worker precaches the app shell under a content-named cache', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: /გამარჯობა,/ }).waitFor();
  const state = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => 'ready'),
    new Promise(r => setTimeout(() => r('timeout'), 15000)),
  ]));
  assert.strictEqual(state, 'ready', 'service worker became active');
  const keys = await page.evaluate(() => caches.keys());
  const mine = keys.filter(k => k.startsWith('rigzea-'));
  assert.strictEqual(mine.length, 1, 'exactly one rigzea cache: ' + JSON.stringify(keys));
  assert(/^rigzea-[0-9a-f]{12}$/.test(mine[0]), 'cache name is a content hash: ' + mine[0]);
  const urls = await page.evaluate(async (name) => {
    const cache = await caches.open(name);
    return (await cache.keys()).map(r => new URL(r.url).pathname);
  }, mine[0]);
  for (const need of ['/js/supabase.js', '/js/plans.js', '/app/app.js', '/app/app.css']) {
    assert(urls.includes(need), 'precached ' + need);
  }
  return page;
});

(async () => {
  const server = await serve();
  const browser = await launch();
  let failed = 0;
  // `node tests/e2e.js 7 D1` runs only the tests whose number matches.
  const only = process.argv.slice(2);
  const selected = only.length ? tests.filter(t => only.some(o => t.name.startsWith(o + '.'))) : tests;
  for (const t of selected) {
    let page;
    try {
      page = await t.fn(browser);
      const errs = (page?.errors || []).filter(e => !/Failed to load resource|ERR_FAILED|net::|Failed to fetch|Invalid login credentials/.test(e));
      assert.deepStrictEqual(errs, [], 'console errors: ' + JSON.stringify(errs).slice(0, 400));
      console.log('✓', t.name);
    } catch (err) {
      failed++;
      console.log('✗', t.name, '\n   ', err.message.split('\n').slice(0,4).join(' | ') + ' ' + (err.stack||'').split('\n').find(l=>l.includes('e2e.js')));
      if (page) await page.screenshot({ path: require('path').join(require('os').tmpdir(), `rigzea-fail-${tests.indexOf(t) + 1}.png`) }).catch(() => {});
    } finally {
      await page?.context().close().catch(() => {});
    }
  }
  await browser.close();
  server.close();
  console.log(`\n${selected.length - failed}/${selected.length} passed`);
  process.exit(failed ? 1 : 0);
})();
