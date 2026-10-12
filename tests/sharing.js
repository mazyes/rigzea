// Sharing flows: public listing page states, readable links, listing photos, publish switch, Telegram linking.
// Run: NODE_PATH=$(npm root -g) node tests/sharing.js
const assert = require('assert');
const { serve, launch, newPage, USERS } = require('./harness');

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
const DESKTOP = { width: 1366, height: 860 };
const PHONE = { width: 390, height: 844 };
const SLUG = 'vake-chavchavadze-33-k2m9qx';
const HIDDEN_SLUG = 'sanapiro-801-h7w3zd';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rigzea_mockdb')));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const state = (page) => page.evaluate(() => document.body.dataset.state);
const listing = async (page, slug = SLUG) => (await db(page)).tables.apartments.find(a => a.public_slug === slug);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('1. unknown link shows the unavailable page, never a made-up listing', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.goto(`${BASE}/p/no-such-listing-zz99`);
  await page.locator('.p-state-box h1', { hasText: 'ბმული აღარ მოქმედებს' }).waitFor();
  assert.strictEqual(await state(page), 'unavailable');
  assert.strictEqual(await page.locator('.p-slide img').count(), 0);
  assert(!(await page.content()).includes('ჭავჭავაძის გამზირი · თანამედროვე 3-ოთახიანი ბინა') || !(await page.locator('#p-main').isVisible()));
  assert.deepStrictEqual(page.errors, []);
});

test('2. readable link opens the real listing; no photos means a placeholder, not stock images', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.goto(`${BASE}/p/${SLUG}`);
  await page.locator('#prop-title', { hasText: 'ვაკე · ჭავჭავაძე 33' }).waitFor();
  assert.strictEqual(await state(page), 'ready');
  assert((await page.locator('#prop-price').innerText()).includes('950'));
  assert(await page.locator('#gallery-empty').isVisible());
  assert.strictEqual(await page.locator('.p-slide img').count(), 0);
  assert(!(await page.locator('#badge-verified').isVisible()), 'verified badge must not show on a real listing');
  assert((await page.locator('#btn-whatsapp').getAttribute('href')).includes('995599000111'));
  assert.strictEqual(await overflow(page), 0);
  assert.deepStrictEqual(page.errors, []);
});

test('3. unpublished listing looks exactly like a missing one', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.goto(`${BASE}/p/${HIDDEN_SLUG}`);
  await page.locator('.p-state-box h1', { hasText: 'ბმული აღარ მოქმედებს' }).waitFor();
  assert.strictEqual(await state(page), 'unavailable');
});

test('4. old id-based links keep working', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.goto(`${BASE}/p/?demo=1`);
  const apt = await listing(page);
  await page.goto(`${BASE}/p/?id=${apt.id}`);
  await page.locator('#prop-title', { hasText: 'ვაკე · ჭავჭავაძე 33' }).waitFor();
});

test('5. a failed load shows an error with a working retry', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  await page.addInitScript(() => { if (!sessionStorage.getItem('armed')) { sessionStorage.setItem('armed', '1'); localStorage.setItem('rigzea_mock_fail', JSON.stringify({ 'rpc:get_public_listing': 1 })); } });
  await page.goto(`${BASE}/p/${SLUG}`);
  await page.locator('.p-state-box h1', { hasText: 'გვერდი ვერ ჩაიტვირთა' }).waitFor();
  assert.strictEqual(await state(page), 'error');
  await page.locator('#p-retry').click();
  await page.locator('#prop-title', { hasText: 'ვაკე · ჭავჭავაძე 33' }).waitFor();
});

test('6. the demo listing still shows its gallery when asked for explicitly', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP });
  await page.goto(`${BASE}/p/?demo=1`);
  await page.locator('#prop-title').waitFor();
  assert.strictEqual(await page.locator('#gallery-counter').innerText(), '1 / 6');
});

test('7. agent uploads, reorders and deletes photos; the public page follows', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const apt = await listing(page);
  await page.goto(`${BASE}/app/#/apartments/${apt.id}`);
  await page.locator('#a-link', { hasText: `/p/${SLUG}` }).waitFor();
  assert(await page.locator('.notice', { hasText: 'ბმულის გაგზავნამდე დაამატე ფოტოები' }).isVisible());

  await page.locator('#a-photo-input').setInputFiles([
    { name: 'living.png', mimeType: 'image/png', buffer: PNG },
    { name: 'bedroom.png', mimeType: 'image/png', buffer: PNG },
  ]);
  await page.locator('.lp-item').nth(1).waitFor();
  assert.strictEqual(await page.locator('.lp-item').count(), 2);
  assert.strictEqual((await listing(page)).photos.length, 2);
  assert(await page.locator('.lp-item').first().locator('.lp-cover').isVisible());

  const pub = await page.context().newPage();
  await pub.goto(`${BASE}/p/${SLUG}`);
  await pub.locator('.p-slide img').first().waitFor();
  assert.strictEqual(await pub.locator('.p-slide').count(), 2);
  assert.strictEqual(await pub.locator('#gallery-counter').innerText(), '1 / 2');
  await pub.close();

  const before = (await listing(page)).photos;
  await page.locator('[data-photo-move="1"][data-i="0"]').click();
  await page.waitForFunction((first) => JSON.parse(localStorage.getItem('rigzea_mockdb')).tables.apartments.find(a => a.public_slug === 'vake-chavchavadze-33-k2m9qx').photos[0] !== first, before[0]);
  assert.deepStrictEqual((await listing(page)).photos, [before[1], before[0]]);

  await page.locator('[data-photo-del][data-i="0"]').click();
  await page.locator('dialog[open] [data-submit]').click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rigzea_mockdb')).tables.apartments.find(a => a.public_slug === 'vake-chavchavadze-33-k2m9qx').photos.length === 1);
  assert.deepStrictEqual((await listing(page)).photos, [before[0]]);
  assert.deepStrictEqual(page.errors, []);
});

test('8. hiding a listing closes its public link; publishing reopens it', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const apt = await listing(page);
  await page.goto(`${BASE}/app/#/apartments/${apt.id}`);
  await page.locator('#btn-toggle-publish', { hasText: 'დამალვა' }).click();
  await page.locator('.notice', { hasText: 'ბმული დამალულია' }).waitFor();

  const pub = await page.context().newPage();
  await pub.goto(`${BASE}/p/${SLUG}`);
  await pub.locator('.p-state-box h1', { hasText: 'ბმული აღარ მოქმედებს' }).waitFor();

  await page.locator('#btn-toggle-publish', { hasText: 'გამოქვეყნება' }).click();
  await page.locator('#btn-toggle-publish', { hasText: 'დამალვა' }).waitFor();
  await pub.reload();
  await pub.locator('#prop-title', { hasText: 'ვაკე · ჭავჭავაძე 33' }).waitFor();
});

test('9. a new listing gets its own readable, unguessable link', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/#/apartments`);
  await page.locator('#btn-apt-new').click();
  await page.locator('dialog[open] input[name="name"]').fill('საბურთალო · ნუცუბიძე 12');
  await page.locator('dialog[open] input[name="address"]').fill('ნუცუბიძის 12');
  await page.locator('dialog[open] input[name="amenity"][value="balcony"]').check();
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('#a-link').waitFor();
  const row = (await db(page)).tables.apartments.find(a => a.name === 'საბურთალო · ნუცუბიძე 12');
  assert.match(row.public_slug, /^saburtalo-nutsubidze-12-[a-z0-9]{6}$/);
  assert.deepStrictEqual(row.amenities, ['balcony']);
  assert.strictEqual(row.is_published, true);
  assert((await page.locator('#a-link').innerText()).includes(row.public_slug));
});

test('10. Telegram is linked with a one-time code, not the organisation id', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/#/settings`);
  await page.locator('#tg-connect').click();
  await page.locator('#tg-code', { hasText: 'A1B2C3D4E5' }).waitFor();
  assert((await page.locator('#tg-open').getAttribute('href')).endsWith('?start=A1B2C3D4E5'));
  const org = (await db(page)).tables.organizations[0].id;
  assert(!(await page.locator('#s-telegram').innerText()).includes(org));
});

test('11. listing screen fits a phone', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE, login: USERS.manager });
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const apt = await listing(page);
  await page.goto(`${BASE}/app/#/apartments/${apt.id}`);
  await page.locator('#a-link').waitFor();
  assert.strictEqual(await overflow(page), 0);
  const copy = await page.locator('#btn-share-renter').boundingBox();
  assert(copy.height >= 44, `copy button is ${copy.height}px tall`);
});

// Collects what the public page sends to /api/track and answers like the real endpoint.
async function captureTrack(page) {
  const sent = [];
  await page.route('**/api/track', (route) => { sent.push(JSON.parse(route.request().postData() || '{}')); route.fulfill({ status: 204, body: '' }); });
  return sent;
}

test('12. an open is reported after five seconds, contact taps at once, and the client code travels with them', async (browser) => {
  const page = await newPage(browser, { viewport: PHONE });
  const sent = await captureTrack(page);
  await page.goto(`${BASE}/p/${SLUG}?r=abc1234567`);
  await page.locator('#prop-title', { hasText: 'ვაკე' }).waitFor();
  await page.waitForTimeout(2500);
  assert.strictEqual(sent.length, 0, 'nothing may be sent before five seconds');
  await page.waitForFunction(() => true, null, { timeout: 100 });
  for (let i = 0; i < 40 && !sent.length; i++) await page.waitForTimeout(250);
  assert.strictEqual(sent.length, 1);
  assert.deepStrictEqual({ ref: sent[0].ref, kind: sent[0].kind, recipient: sent[0].recipient }, { ref: SLUG, kind: 'view', recipient: 'abc1234567' });
  assert.match(sent[0].visitor, /^[a-z0-9-]{8,64}$/);
  assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['kind', 'recipient', 'ref', 'visitor'], 'no other data leaves the page');

  await page.locator('#btn-whatsapp').evaluate(a => { a.removeAttribute('target'); a.addEventListener('click', e => e.preventDefault()); });
  await page.locator('#btn-whatsapp').click();
  for (let i = 0; i < 20 && sent.length < 2; i++) await page.waitForTimeout(100);
  assert.strictEqual(sent[1].kind, 'whatsapp');
  assert.strictEqual(sent[1].visitor, sent[0].visitor, 'one browser is one visitor');
  await page.waitForTimeout(1500);
  assert.strictEqual(sent.filter(s => s.kind === 'view').length, 1, 'a view is sent once per page load');
});

test('13. the demo listing, a failing endpoint and the agent\'s own browser: nothing is counted and nothing breaks', async (browser) => {
  const demo = await newPage(browser, { viewport: PHONE });
  const demoSent = await captureTrack(demo);
  await demo.goto(`${BASE}/p/?demo=1`);

  const agent = await newPage(browser, { viewport: PHONE });
  await agent.addInitScript(() => localStorage.setItem('sb-project-auth-token', '{}'));
  const agentSent = await captureTrack(agent);
  await agent.goto(`${BASE}/p/${SLUG}`);

  const broken = await newPage(browser, { viewport: PHONE });
  await broken.route('**/api/track', route => route.abort());
  await broken.goto(`${BASE}/p/${SLUG}`);
  await broken.locator('#prop-title', { hasText: 'ვაკე' }).waitFor();

  await demo.waitForTimeout(6500);
  assert.strictEqual(demoSent.length, 0);
  assert.strictEqual(agentSent.length, 0);
  assert.strictEqual(await state(broken), 'ready');
  assert.deepStrictEqual(broken.errors.filter(e => !/api\/track|ERR_FAILED/.test(e)), []);
});

test('14. the tracking endpoint: bots ignored, input checked, Telegram failures contained', async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-test';
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token-for-test';
  const { default: handler } = await import(require('url').pathToFileURL(require('path').join(__dirname, '..', 'api', 'track.js')).href);
  const realFetch = global.fetch;
  const call = async (body, { ua = 'Mozilla/5.0 (iPhone)', rpc = { ok: true, counted: true }, rpcStatus = 200, telegram = () => ({ ok: true, status: 200 }) } = {}) => {
    const calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url: String(url), opts });
      if (String(url).includes('/rpc/record_link_event')) return { ok: rpcStatus === 200, status: rpcStatus, json: async () => rpc };
      return telegram(calls.filter(c => c.url.includes('api.telegram.org')).length);
    };
    const res = { code: null, status(c) { this.code = c; return this; }, end() { return this; }, json() { return this; } };
    try { await handler({ method: 'POST', headers: { 'user-agent': ua, host: 'rigzea.test' }, body }, res); } finally { global.fetch = realFetch; }
    return { code: res.code, rpcCalls: calls.filter(c => c.url.includes('/rpc/')), tg: calls.filter(c => c.url.includes('api.telegram.org')) };
  };
  const good = { ref: SLUG, kind: 'view', visitor: '0f8fad5b-d9cb-469f-a165-70867728950e', recipient: null };
  const notify = { ok: true, counted: true, notify: { chat_ids: [111, 222], kind: 'view', apartment_id: 'apt-1', apartment_name: 'ვაკე <b>33</b>', recipient: 'ნინო' } };

  let r = await call(good, { ua: 'WhatsApp/2.23 A' });
  assert.deepStrictEqual([r.code, r.rpcCalls.length], [204, 0], 'link-preview fetchers are not counted');

  r = await call({ ...good, visitor: 'x' });
  assert.deepStrictEqual([r.code, r.rpcCalls.length], [204, 0], 'a malformed visitor id never reaches the database');
  r = await call({ ...good, kind: 'purchase' });
  assert.strictEqual(r.rpcCalls.length, 0);

  r = await call(JSON.stringify(good));
  assert.strictEqual(r.rpcCalls.length, 1, 'a beacon body that arrives as text is still read');
  assert.strictEqual(r.rpcCalls[0].opts.headers.apikey, 'service-key-for-test');
  assert.deepStrictEqual(JSON.parse(r.rpcCalls[0].opts.body), { p_ref: SLUG, p_kind: 'view', p_visitor: good.visitor, p_recipient: null });
  assert.strictEqual(r.tg.length, 0, 'no notification unless the database asks for one');

  r = await call(good, { rpc: notify });
  assert.strictEqual(r.tg.length, 2, 'one message per linked chat');
  const text = JSON.parse(r.tg[0].opts.body).text;
  assert(text.includes('„ნინო“-სთვის გაგზავნილი ბმული'), 'names the link, not the person');
  assert(text.includes('ვაკე &lt;b&gt;33&lt;/b&gt;'), 'listing names are escaped');
  assert(text.includes('https://rigzea.test/app/#/apartments/apt-1'));
  assert(!text.includes('—'));

  r = await call(good, { rpc: notify, telegram: () => { throw new Error('network down'); } });
  assert.deepStrictEqual([r.code, r.tg.length], [204, 4], 'each chat is retried once, and the page still gets its normal answer');

  r = await call(good, { rpc: notify, telegram: () => ({ ok: false, status: 403 }) });
  assert.strictEqual(r.tg.length, 2, 'a blocked bot is not retried');

  r = await call(good, { rpcStatus: 500, rpc: {} });
  assert.deepStrictEqual([r.code, r.tg.length], [204, 0]);
});

test('15. the listing screen shows views, estimated visitors, contact taps and which client link was opened', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const apt = await listing(page);
  await page.evaluate(([aptId, org]) => {
    const d = JSON.parse(localStorage.getItem('rigzea_mockdb'));
    const at = (min) => new Date(Date.now() - min * 60000).toISOString();
    d.tables.share_links = [{ id: 'link-1', organization_id: org, apartment_id: aptId, token: 'nino123456', recipient_name: 'ნინო', is_active: true, created_at: at(600) }];
    d.tables.link_events = [
      { id: 1, organization_id: org, apartment_id: aptId, share_link_id: 'link-1', kind: 'view', visitor_id: 'visitor-aaaa', created_at: at(5) },
      { id: 2, organization_id: org, apartment_id: aptId, share_link_id: null, kind: 'view', visitor_id: 'visitor-bbbb', created_at: at(50) },
      { id: 3, organization_id: org, apartment_id: aptId, share_link_id: 'link-1', kind: 'view', visitor_id: 'visitor-aaaa', created_at: at(300) },
      { id: 4, organization_id: org, apartment_id: aptId, share_link_id: 'link-1', kind: 'whatsapp', visitor_id: 'visitor-aaaa', created_at: at(4) },
      { id: 5, organization_id: org, apartment_id: 'another-listing', share_link_id: null, kind: 'view', visitor_id: 'visitor-cccc', created_at: at(3) },
    ];
    localStorage.setItem('rigzea_mockdb', JSON.stringify(d));
  }, [apt.id, apt.organization_id]);
  await page.goto(`${BASE}/app/#/apartments/${apt.id}`);
  await page.reload();
  await page.locator('#eng-views').waitFor();
  assert.strictEqual(await page.locator('#eng-views').innerText(), '3');
  assert.strictEqual(await page.locator('#eng-unique').innerText(), '2');
  assert.strictEqual(await page.locator('#eng-contacts').innerText(), '1');
  assert((await page.locator('#eng-links').innerText()).includes('2 ნახვა'));
  const activity = await page.locator('#eng-activity').innerText();
  assert(activity.includes('„ნინო“-ის ბმული') && activity.includes('საერთო ბმული'));
  assert.strictEqual(await page.locator('#eng-activity .row').count(), 4, 'another listing\'s events stay out');
});

test('16. a link made for one client carries its own code and can be switched off', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  const apt = await listing(page);
  await page.goto(`${BASE}/app/#/apartments/${apt.id}`);
  await page.locator('#btn-named-link').click();
  await page.locator('dialog[open] input[name="recipient_name"]').fill('გიორგი, საბურთალო');
  await page.locator('dialog[open] [data-submit]').click();
  await page.locator('#eng-links', { hasText: 'გიორგი, საბურთალო' }).waitFor();
  const row = (await db(page)).tables.share_links.find(l => l.recipient_name === 'გიორგი, საბურთალო');
  assert.match(row.token, /^[a-z0-9]{10}$/);
  assert.strictEqual(row.apartment_id, apt.id);
  assert.strictEqual(await page.evaluate(() => navigator.clipboard.readText()), `${BASE}/p/${SLUG}?r=${row.token}`);

  await page.locator(`[data-link-off="${row.id}"]`).click();
  await page.locator('#eng-links', { hasText: 'გათიშულია' }).waitFor();
  assert.strictEqual((await db(page)).tables.share_links.find(l => l.id === row.id).is_active, false);
});

test('17. a linked user chooses which opens reach Telegram', async (browser) => {
  const page = await newPage(browser, { viewport: DESKTOP, login: USERS.manager });
  await page.goto(`${BASE}/app/`);
  await page.getByRole('heading', { name: 'დღეს', exact: true }).waitFor();
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('rigzea_mockdb')); d.tgLinked = true; localStorage.setItem('rigzea_mockdb', JSON.stringify(d)); });
  await page.goto(`${BASE}/app/#/settings`);
  await page.reload();
  await page.locator('#tg-notify').selectOption('named');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rigzea_mockdb')).tgNotify === 'named');
});

(async () => {
  const server = await serve(PORT);
  const browser = await launch();
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(browser); console.log('✓ ' + t.name); }
    catch (e) { failed++; console.log('✗ ' + t.name + '\n    ' + String(e.message || e).split('\n').slice(0, 4).join('\n    ')); }
  }
  await browser.close();
  server.close();
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
