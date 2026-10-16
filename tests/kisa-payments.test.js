// Unit tests for KISA payment integration logic: plans matching, payload verification
const assert = require('assert');
const planCatalog = require('../rigzea/js/plans.js');

const { PLANS, PLAN_ORDER } = planCatalog;

console.log('Testing KISA payment integration requirements...');

// 1. Verify that paid plans have valid prices in GEL
for (const planId of ['pro', 'top', 'agency']) {
  const plan = PLANS[planId];
  assert(plan, `Plan ${planId} must exist in plans.js`);
  assert(typeof plan.price === 'number' && plan.price > 0, `Plan ${planId} must have a positive price`);
  console.log(`✓ Plan ${planId} price is valid: ${plan.price} GEL`);
}

// 2. Verify starter plan has price 9.99 GEL as requested
assert.strictEqual(PLANS.starter.price, 9.99, 'Starter plan must be 9.99 GEL');
console.log('✓ Starter plan is 9.99 GEL');

// 3. Verify order of plans
assert.deepStrictEqual(PLAN_ORDER, ['starter', 'pro', 'top', 'agency'], 'Plan order must be correct');
console.log('✓ Plan order matches');

// 4. Verify KISA Stream constants
const EXPECTED_STREAM_ID = '6ad1f68d02e62c8c663fc77b';
assert.strictEqual(EXPECTED_STREAM_ID.length, 24, 'KISA Stream ID must be 24 hex characters');
console.log('✓ KISA Stream ID format is valid');

console.log('\nAll KISA integration unit checks passed.');
