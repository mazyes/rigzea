// Keeps rigzea/js/plans.js and the database in step. plan_limit() in supabase/schema.sql is the
// copy the server enforces; if the two disagree, the app shows one number and the API rejects a
// different one. Run: node tests/plans-sync.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const catalog = require('../rigzea/js/plans.js');
const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

// Reads one branch of `select case p_kind when '<kind>' then case p_plan when 'x' then N ... end`.
function dbLimits(kind) {
  const branch = new RegExp(`when '${kind}' then case p_plan([\\s\\S]*?)end`).exec(schema);
  assert(branch, `plan_limit has no '${kind}' branch in supabase/schema.sql (refresh it after a DB change)`);
  const out = {};
  for (const p of branch[1].matchAll(/when '([a-z]+)' then (null|\d+)/g)) out[p[1]] = p[2] === 'null' ? null : Number(p[2]);
  return out;
}

let failed = 0;
for (const field of ['apartments', 'seats']) {
  const fromDb = dbLimits(field);
  for (const [id, plan] of Object.entries(catalog.PLANS)) {
    const expected = plan[field] === undefined ? null : plan[field];
    if (fromDb[id] === expected) {
      console.log(`✓ ${field}.${id} = ${expected}`);
    } else {
      failed++;
      console.log(`✗ ${field}.${id}: schema.sql has ${fromDb[id]}, plans.js has ${expected}`);
    }
  }
}

if (failed) {
  console.log(`\n${failed} mismatch(es): update supabase/patches and schema.sql with rigzea/js/plans.js`);
  process.exit(1);
}
console.log('\nplans: supabase/schema.sql matches rigzea/js/plans.js');
