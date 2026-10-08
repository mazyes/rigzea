// Shared Playwright setup: static server for ./rigzea and a page whose Supabase
// client is replaced by tests/mock-supabase.js with tests/seed.js fixtures.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.join(__dirname, '..', 'rigzea');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function serve(port = 4173) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function launch() {
  return chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
}

async function newPage(browser, { viewport = { width: 1366, height: 860 }, login } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'ka-GE', timezoneId: 'Asia/Tbilisi' });
  await context.route('**/js/supabase.js', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'mock-supabase.js'), 'utf8') }));
  await context.route(/^https?:\/\/(?!localhost)/, route => route.abort());
  await context.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8') });
  if (login) {
    await context.addInitScript(({ id, email, name }) => {
      if (!localStorage.getItem('rigzea_mock_session')) localStorage.setItem('rigzea_mock_session', JSON.stringify({ access_token: 'mock', user: { id, email, user_metadata: { full_name: name } } }));
    }, login);
  }
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
}

const USERS = {
  manager: { id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'manager@rigzea.test', name: 'ნინო ბერიძე' },
  staff: { id: 'aaaaaaaa-0000-4000-8000-000000000002', email: 'staff@rigzea.test', name: 'მარიამ კაპანაძე' },
};

module.exports = { serve, launch, newPage, USERS, BASE: 'http://localhost:4173' };
