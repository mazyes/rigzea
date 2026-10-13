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

test('1b. upcoming lease renewals are listed and can be extended', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
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
  // Starter with 4 apartments: cap 10 -> adding 7 more is refused with the upgrade modal
  await page.evaluate(() => { App.S.org.plan = 'starter'; });
  assert.strictEqual(await page.evaluate(() => App.guardLimit('apartments')), true);
  assert.strictEqual(await page.evaluate(() => App.guardLimit('apartments', 7)), false);
  await page.locator('dialog[open] h2', { hasText: 'ობიექტების ლიმიტი ამოიწურა' }).waitFor();
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/upgrade-modal.png' : undefined });
  await page.locator('dialog[open] a[href*="wa.me"]').first().waitFor();
  await page.keyboard.press('Escape');
  assert.strictEqual(await page.evaluate(() => App.can('export')), false);
  // Expired trial = locked, banner says so
  await page.evaluate(() => { App.S.org.plan = 'trial'; App.S.org.trial_ends_at = new Date(Date.now() - 864e5).toISOString(); App.renderShell(); });
  await page.locator('#plan-banner', { hasText: 'საცდელი პერიოდი დასრულდა' }).waitFor();
  assert.strictEqual(await page.evaluate(() => App.guardLimit('apartments')), false);
  await page.keyboard.press('Escape');
  // Platform admin activates Pro for this org
  await page.goto(BASE + '/app/#/settings/platform');
  await page.locator('[data-org] [data-plan]').first().selectOption('top');
  await page.locator('[data-org] [data-save]').first().click();
  await page.locator('.toast', { hasText: 'პაკეტი გააქტიურდა' }).waitFor();
  await page.waitForFunction(() => App.planState().key === 'top' && App.can('export'));
  assert.strictEqual(await page.locator('#plan-banner').isHidden(), true, 'no banner for a fresh paid plan');
  // Plan tab
  await page.goto(BASE + '/app/#/settings/plan');
  await page.locator('#view h2', { hasText: 'გუნდი' }).waitFor();
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/plan-tab.png' : undefined, fullPage: true });
  // Branding
  await page.goto(BASE + '/app/#/settings');
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
  await page.goto(BASE + '/app/#/settings/export');
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
  await page.goto(BASE + '/app/#/apartments/dddddddd-0000-4000-8000-000000000003');
  await page.locator('[data-ls="views"]', { hasText: '1' }).waitFor();
  assert.strictEqual(await page.locator('[data-ls="whatsapp"]').innerText(), '1');
  assert((await page.locator('#listing-url').inputValue()).endsWith('/p/apt-3/'), 'pretty link with slug');
  await page.locator('#a-edit').click();
  assert.strictEqual(await page.locator('dialog[open] input[name=commission_pct]').inputValue(), '15');
  await page.locator('dialog[open] [data-pm-input]').setInputFiles([FIXTURE, FIXTURE]);
  await page.locator('dialog[open] .pm-item img').nth(1).waitFor();
  await page.locator('dialog[open] [data-pm-del="1"]').click();
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
  await page.goto(BASE + '/app/#/deals');
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
  assert((await page.locator('.s-card a.s-btn-primary').first().getAttribute('href')).startsWith('/p/?id='), 'links to single listing');
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
  await page.goto(BASE + '/app/#/deals/commissions');
  const stats = await page.locator('#deals-body .stats').innerText();
  assert(stats.includes('$500') && stats.includes('$250'), 'gross and net for the closed co-broker deal: ' + stats);
  assert(stats.includes('$500'), 'GEL deal converted with org FX rate (2700 ₾ → $1000 → $500 expected)');
  await page.goto(BASE + '/app/#/deals');
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
  await page.goto(BASE + '/app/#/apartments');
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
  await page.goto(BASE + '/app/#/apartments');
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

test('15. sales CRM: buyer lead, sales deal commission, 7-stage pipeline advance & viewing appointment', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // 1. Verify Buyer contact
  await page.goto(BASE + '/app/#/owners');
  await page.locator('[data-tab="owners"]').click();
  await page.locator('[data-oct="buyer"]').click();
  await page.locator('.row', { hasText: 'გიორგი მაისურაძე' }).waitFor();
  const contactRowText = await page.locator('.row', { hasText: 'გიორგი მაისურაძე' }).innerText();
  assert(contactRowText.includes('მყიდველი'), 'buyer badge displayed');

  // 2. Create a Sales Deal
  await page.goto(BASE + '/app/#/deals');
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
  await page.goto(BASE + '/app/#/today');
  await page.getByRole('heading', { name: /უძრავი ქონების მიმოხილვა/ }).waitFor();
  const todayText = await page.locator('#view').innerText();
  assert(todayText.includes('აქტიური ქონება') && todayText.includes('იყიდება'), 'active sales properties counted');
  assert(todayText.includes('დათვალიერებები'), 'viewings tracked on dashboard');
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
  await page.goto(BASE + '/app/');
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();

  // Buyers and landlords are separate pages reached from the menu
  await page.locator('#rail a[href="#/owners?type=buyer"]').click();
  await page.getByRole('heading', { name: 'მყიდველები', exact: true }).waitFor();
  await page.locator('#o-body .row', { hasText: 'გიორგი მაისურაძე' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row', { hasText: 'დავით მამულაშვილი' }).count(), 0, 'landlord is not listed among buyers');
  assert.strictEqual(await page.locator('#rail [aria-current="page"]').getAttribute('href'), '#/owners?type=buyer');

  await page.locator('#rail a[href="#/owners?type=owner"]').click();
  await page.getByRole('heading', { name: 'მეპატრონეები', exact: true }).waitFor();
  await page.locator('#o-body .row', { hasText: 'დავით მამულაშვილი' }).waitFor();
  assert.strictEqual(await page.locator('#o-body .row', { hasText: 'გიორგი მაისურაძე' }).count(), 0, 'buyer is not listed among landlords');

  // A contact added from the tenants page is saved as a tenant
  await page.locator('#rail a[href="#/owners?type=renter"]').click();
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
  assert.strictEqual(await page.locator('#rail [aria-current="page"]').getAttribute('href'), '#/owners?type=renter');

  // Apartments and deals follow the section
  await page.locator('#rail a[href="#/apartments?type=sale"]').click();
  await page.getByRole('heading', { name: 'გასაყიდი ბინები', exact: true }).waitFor();
  assert.strictEqual(await page.locator('[data-tp]').count(), 0, 'no type filter inside the sales section');
  await page.locator('#rail a[href="#/deals?type=sale"]').click();
  await page.getByRole('heading', { name: 'გაყიდვის გარიგებები', exact: true }).waitFor();
  await page.locator('#btn-deal-new').click();
  assert.strictEqual(await page.locator('dialog[open] #deal-type-select').inputValue(), 'sale');
  await page.keyboard.press('Escape');
  await page.context().close();

  // Phone: section tabs above the content, sections in the bottom bar, the rest in the menu
  const phone = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  for (const hash of ['#/apartments?type=rent', '#/owners?type=renter', '#/owners?type=owner&tab=approvals', '#/deals?type=sale']) {
    await phone.goto(BASE + '/app/' + hash);
    await phone.locator('#view h1').waitFor();
    await phone.waitForTimeout(150);
    const { sw, w } = await phone.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    assert(sw <= w, `${hash} overflows: ${sw} > ${w}`);
    assert.strictEqual(await phone.locator('#section-bar a').count(), 4, `${hash} shows the section pages`);
  }
  assert.strictEqual((await phone.locator('#bottom-nav [aria-current="page"]').innerText()).trim(), 'გაყიდვა');
  await phone.locator('#section-bar a[href="#/owners?type=seller"]').click();
  await phone.getByRole('heading', { name: 'გამყიდველები', exact: true }).waitFor();
  await phone.locator('#btn-more').click();
  await phone.locator('dialog[open] a[href="#/finance"]').click();
  await phone.getByRole('heading', { name: 'ფინანსები', exact: true }).waitFor();
  assert(await phone.locator('#section-bar').isHidden(), 'no section tabs outside a section');
  return phone;
});

test('18. co-broker share: owner data hidden by default, toggles rebuild the text, daily digest', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/#/apartments/dddddddd-0000-4000-8000-000000000001');
  await page.locator('#a-share').click();
  const dlg = page.locator('dialog[open]');
  const text = () => dlg.locator('#cb-output').inputValue();
  let t = await text();
  assert(!t.includes('577 00 11 22') && !t.includes('დავით მამულაშვილი'), 'owner is hidden by default');
  assert(t.includes('შერიფ ხიმშიაშვილის') && !t.includes('ხიმშიაშვილის 7'), 'building number is removed from the address');
  assert(t.includes('50/50'), 'default commission terms');
  assert(t.includes('/p/?id='), 'white-label link is included');
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

  await page.goto(BASE + '/app/#/today');
  await page.locator('#btn-digest').click();
  const digest = await page.locator('dialog[open] #digest-output').inputValue();
  assert(digest.includes('დღევანდელი ნახვები') && digest.includes('ცხელი ობიექტები'), 'digest lists viewings and hot listings');
  assert((await page.locator('dialog[open] #digest-tg').getAttribute('href')).startsWith('https://t.me/share/url?'), 'Telegram share link');
  return page;
});

test('19. trust: cadastral duplicate banner, unreliable client flag warns in contact and deal forms', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  // Save a cadastral code on an existing property (dots are inserted while typing)
  await page.goto(BASE + '/app/#/apartments/dddddddd-0000-4000-8000-000000000001');
  await page.locator('#a-edit').click();
  await page.locator('dialog[open] #apt-cadastral').fill('01101400901' + '1');
  assert.strictEqual(await page.locator('dialog[open] #apt-cadastral').inputValue(), '01.10.14.009.011');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert.strictEqual((await db(page)).tables.apartments.find(a => a.id === 'dddddddd-0000-4000-8000-000000000001').cadastral_code, '01.10.14.009.011');

  // Adding another property with the same code warns immediately
  await page.goto(BASE + '/app/#/apartments?type=rent');
  await page.locator('#btn-apt-new').click();
  const dlg = page.locator('dialog[open]');
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
  await page.goto(BASE + '/app/#/owners/cccccccc-0000-4000-8000-000000000003');
  await page.locator('#ow-edit').click();
  await page.locator('dialog[open] #ow-flag').check();
  await page.locator('dialog[open] textarea[name=flag_note]').fill('არ იხდის საკომისიოს');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
  assert((await page.locator('#ow-flag-banner').innerText()).includes('არ იხდის საკომისიოს'));
  const flagged = (await db(page)).tables.owners.find(o => o.id === 'cccccccc-0000-4000-8000-000000000003');
  assert(flagged.is_flagged === true && flagged.flagged_by_name, 'flag and who set it are saved');

  // The same number typed in a new deal or a new contact shows the warning
  await page.goto(BASE + '/app/#/deals?type=sale');
  await page.locator('#btn-deal-new').click();
  await page.locator('dialog[open] #deal-client-phone').fill('591 00 22 33');
  assert((await page.locator('dialog[open] #deal-flag-banner').innerText()).includes('არ იხდის საკომისიოს'));
  await page.keyboard.press('Escape');
  await page.goto(BASE + '/app/#/owners?type=buyer');
  await page.locator('#o-body .badge-danger', { hasText: 'არასანდო' }).waitFor();
  await page.locator('#o-new').click();
  await page.locator('dialog[open] input[name=phone]').fill('+995591002233');
  assert((await page.locator('dialog[open] #ow-dup-banner').innerText()).includes('არასანდო კლიენტი'));
  return page;
});

test('20. documents: PDF presentation templates, auto-filled sale contract, registry check', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(BASE + '/app/#/apartments/dddddddd-0000-4000-8000-000000000001');
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
  await page.goto(BASE + '/app/#/deals/documents?type=sale');
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
      console.log('✗', t.name, '\n   ', err.message.split('\n').slice(0,4).join(' | ') + ' ' + (err.stack||'').split('\n').find(l=>l.includes('e2e.js')));
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
