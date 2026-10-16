const fs = require('fs');
const assert = require('assert');

// 1. Check HTML files
const appHtml = fs.readFileSync('rigzea/app/index.html', 'utf8');
const demoHtml = fs.readFileSync('rigzea/demo/index.html', 'utf8');

assert(appHtml.includes('id="topbar-nav"'), 'app/index.html missing topbar-nav');
assert(appHtml.includes('id="btn-tools"'), 'app/index.html missing btn-tools');
assert(appHtml.includes('data-tool="calculator"'), 'app/index.html missing calculator tool');
assert(appHtml.includes('data-tool="matchmaker"'), 'app/index.html missing matchmaker tool');
assert(appHtml.includes('data-tool="social-post"'), 'app/index.html missing social-post tool');
assert(appHtml.includes('data-tool="templates"'), 'app/index.html missing templates tool');

assert(demoHtml.includes('id="topbar-nav"'), 'demo/index.html missing topbar-nav');
assert(demoHtml.includes('id="btn-tools"'), 'demo/index.html missing btn-tools');

// 2. Check CSS
const appCss = fs.readFileSync('rigzea/app/app.css', 'utf8');
assert(appCss.includes('.topbar-nav'), 'app.css missing .topbar-nav');
assert(appCss.includes('.topbar-tab'), 'app.css missing .topbar-tab');
assert(appCss.includes('.topbar-tools-btn'), 'app.css missing .topbar-tools-btn');
assert(appCss.includes('.calc-dialog-grid'), 'app.css missing .calc-dialog-grid');
assert(appCss.includes('.calc-net-val'), 'app.css missing .calc-net-val');

// 3. Check JS
const appJs = fs.readFileSync('rigzea/app/app.js', 'utf8');
assert(appJs.includes("topNav = $('#topbar-nav')"), 'app.js missing topNav rendering');
assert(appJs.includes('openCommissionCalculator'), 'app.js missing openCommissionCalculator');
assert(appJs.includes('openMatchmaker'), 'app.js missing openMatchmaker');
assert(appJs.includes('openSocialPostGenerator'), 'app.js missing openSocialPostGenerator');
assert(appJs.includes("qtBtn.addEventListener('click'"), 'app.js missing qtBtn listener');

console.log('ALL TOPBAR & TOOLS CHECKS PASSED PERFECTLY ✓');
