// Usage: node tests/screenshots.js <outDir> — captures key screens with mock data.
const { serve, launch, newPage, USERS, BASE } = require('./harness');
(async () => {
  const out = process.argv[2] || 'screenshots';
  require('fs').mkdirSync(out, { recursive: true });
  const server = await serve();
  const browser = await launch();
  const shots = [
    ['dashboard-desktop', '/app/', { width: 1366, height: 900 }],
    ['apartment-desktop', '/app/#/apartments/dddddddd-0000-4000-8000-000000000001', { width: 1366, height: 900 }],
    ['tasks-desktop', '/app/#/tasks', { width: 1366, height: 900 }],
    ['dashboard-mobile', '/app/', { width: 390, height: 844 }],
    ['tasks-mobile', '/app/#/tasks', { width: 390, height: 844 }],
    ['task-drawer-desktop', '/app/#/tasks?task=eeeeeeee-0000-4000-8000-000000000004', { width: 1366, height: 900 }],
    ['finance-desktop', '/app/#/finance', { width: 1366, height: 900 }],
    ['owners-desktop', '/app/#/owners', { width: 1366, height: 900 }],
    ['apartment-mobile', '/app/#/apartments/dddddddd-0000-4000-8000-000000000001', { width: 390, height: 844 }],
    ['approve-mobile', '/approve/?token=tok-pending-1', { width: 390, height: 844 }, null],
    ['staff-mobile', '/staff/#/job/eeeeeeee-0000-4000-8000-000000000001', { width: 390, height: 844 }, 'staff'],
  ];
  for (const [name, url, viewport, who = 'manager'] of shots) {
    const page = await newPage(browser, { viewport, login: who ? USERS[who] : null });
    await page.goto(BASE + url);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: !name.includes('drawer') });
    if (name === 'tasks-desktop') {
      await page.click('#btn-new-task');
      await page.click('dialog[open] input[name=type][value=repair]', { force: true });
      await page.click('dialog[open] input[name=cost_mode][value=approval]', { force: true });
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${out}/task-form-desktop.png` });
    }
    if (page.errors.length) console.log(name, 'errors:', page.errors.slice(0, 3));
    await page.context().close();
  }
  await browser.close(); server.close();
})();
