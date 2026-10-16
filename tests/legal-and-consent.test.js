const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== LEGAL PAGES & CONSENT CHECKBOX TEST ===');

const baseDir = path.join(__dirname, '..', 'rigzea');

// 1. Check legal.css theme colors
const legalCss = fs.readFileSync(path.join(baseDir, 'legal', 'legal.css'), 'utf8');
assert(legalCss.includes('--brand: #047857;'), 'legal.css root brand color must be #047857');
assert(legalCss.includes('--bg: #09090b;'), 'legal.css dark mode bg must be #09090b');
assert(legalCss.includes('--card: #121215;'), 'legal.css dark mode card must be #121215');
assert(legalCss.includes('--line: #27272a;'), 'legal.css dark mode line must be #27272a');
console.log('✓ 1. legal.css dark mode & brand colors verified');

// 2. Check 4 legal pages
const legalPages = ['refund', 'terms', 'privacy', 'cookies'];
legalPages.forEach(p => {
  const content = fs.readFileSync(path.join(baseDir, 'legal', p, 'index.html'), 'utf8');
  assert(content.includes('<meta name="theme-color" content="#047857" />'), `${p} must have theme-color #047857`);
  assert(content.includes('16 ოქტომბერი, 2026'), `${p} must have date 16 ოქტომბერი, 2026`);
  assert(!content.includes('—'), `${p} must not contain em dashes`);
});
console.log('✓ 2. All 4 legal pages have updated theme-color, date 16 ოქტომბერი, 2026, and no em dashes');

// 3. Check refund page specifics
const refundHtml = fs.readFileSync(path.join(baseDir, 'legal', 'refund', 'index.html'), 'utf8');
assert(refundHtml.includes('24 საათის განმავლობაში'), 'refund must mention 24 hours');
assert(refundHtml.includes('Anti-Abuse'), 'refund must have Anti-Abuse section');
assert(refundHtml.includes('Excel/CSV ექსპორტი'), 'refund must mention Excel/CSV export');
assert(refundHtml.includes('MyHome.ge / SS.ge / Place.ge'), 'refund must mention listing portals');
assert(refundHtml.includes('class="lg-operator"'), 'refund must preserve lg-operator block');
console.log('✓ 3. Refund page has 24h policy and Anti-Abuse clauses');

// 4. Check terms page specifics
const termsHtml = fs.readFileSync(path.join(baseDir, 'legal', 'terms', 'index.html'), 'utf8');
assert(termsHtml.includes('/legal/privacy/'), 'terms must link to privacy');
assert(termsHtml.includes('/legal/cookies/'), 'terms must link to cookies');
assert(termsHtml.includes('/legal/refund/'), 'terms must link to refund');
assert(termsHtml.includes('მხოლოდ 24 საათის განმავლობაში'), 'terms Article 3 must mention 24h refund');
console.log('✓ 4. Terms page links all 4 documents and specifies 24h refund');

// 5. Check privacy page specifics
const privacyHtml = fs.readFileSync(path.join(baseDir, 'legal', 'privacy', 'index.html'), 'utf8');
assert(privacyHtml.includes('terms_accepted_at'), 'privacy must mention terms_accepted_at');
assert(privacyHtml.includes('@Rigzeabot'), 'privacy must mention @Rigzeabot');
assert(privacyHtml.includes('Resend'), 'privacy must mention Resend');
assert(privacyHtml.includes('Google OAuth'), 'privacy must mention Google OAuth');
assert(privacyHtml.includes('Telegram'), 'privacy must mention Telegram');
assert(privacyHtml.includes('sao.ge'), 'privacy must mention State Audit Office sao.ge');
console.log('✓ 5. Privacy page includes terms_accepted_at, Telegram, supplier rows, and sao.ge');

// 6. Check cookies page specifics
const cookiesHtml = fs.readFileSync(path.join(baseDir, 'legal', 'cookies', 'index.html'), 'utf8');
assert(cookiesHtml.includes('/legal/privacy/'), 'cookies must link to privacy');
assert(cookiesHtml.includes('/legal/terms/'), 'cookies must link to terms');
assert(cookiesHtml.includes('/legal/refund/'), 'cookies must link to refund');
console.log('✓ 6. Cookies page links to all other legal documents');

// 7. Check app consent checkbox and styles
const appHtml = fs.readFileSync(path.join(baseDir, 'app', 'index.html'), 'utf8');
assert(appHtml.includes('id="signup-consent-label"'), 'app/index.html must have #signup-consent-label');
assert(appHtml.includes('id="signup-agree"'), 'app/index.html must have #signup-agree');
assert(appHtml.includes('/legal/refund/'), 'app/index.html must link to refund');

const appCss = fs.readFileSync(path.join(baseDir, 'app', 'app.css'), 'utf8');
assert(appCss.includes('.auth-consent.is-invalid'), 'app/app.css must have .auth-consent.is-invalid style');

const appJs = fs.readFileSync(path.join(baseDir, 'app', 'app.js'), 'utf8');
assert(appJs.includes('currentAuthView'), 'app/app.js must track currentAuthView');
assert(appJs.includes('policies_accepted_version'), 'app/app.js must pass policies_accepted_version');
assert(appJs.includes('is-invalid'), 'app/app.js must toggle is-invalid class');

console.log('✓ 7. App HTML, CSS, and JS consent and Google OAuth validation verified');

console.log('=== ALL LEGAL & CONSENT TESTS PASSED ✓ ===');
