import assert from 'node:assert/strict';
import kisaStreamConfirm from '../api/kisa-stream-confirm.js';
import kisaCheckout from '../api/kisa-checkout.js';
import importListing from '../api/import-listing.js';

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function call(handler, req) {
  const res = response();
  await handler(req, res);
  return res;
}

const originalFetch = globalThis.fetch;
const originalKisaId = process.env.KISA_CLIENT_ID;
const originalKisaSecret = process.env.KISA_CLIENT_SECRET;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

try {
  const stream = await call(kisaStreamConfirm, { method: 'POST', body: { donation: { validation: true } } });
  assert.equal(stream.statusCode, 410, 'browser donation events cannot confirm a payment');

  let webhookLookups = 0;
  globalThis.fetch = async () => { webhookLookups++; throw new Error('invalid callback token must stop before lookup'); };
  const invalidWebhook = await call((await import('../api/kisa-webhook.js')).default, {
    method: 'POST',
    headers: { 'x-kisa-event': 'payment.callback' },
    query: {},
    body: { orderId: 'provider-order-1', status: 'SUCCESS' },
  });
  assert.equal(invalidWebhook.statusCode, 401, 'webhook rejects callbacks without the per-payment token');
  assert.equal(webhookLookups, 0, 'unauthenticated callbacks do not reach the database');

  delete process.env.KISA_CLIENT_ID;
  delete process.env.KISA_CLIENT_SECRET;
  const checkoutFetches = [];
  globalThis.fetch = async (url) => {
    checkoutFetches.push(String(url));
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    if (String(url).includes('/organization_members?')) return new Response(JSON.stringify([{ role: 'owner' }]), { status: 200 });
    throw new Error('checkout should stop before creating a payment');
  };
  const checkout = await call(kisaCheckout, {
    method: 'POST',
    headers: { authorization: 'Bearer test-user-token' },
    body: { orgId: '00000000-0000-4000-8000-000000000001', plan: 'starter' },
  });
  assert.equal(checkout.statusCode, 503, 'checkout fails closed when provider credentials are absent');
  assert.equal(checkout.body.error, 'payment_provider_not_configured');
  assert.equal(checkoutFetches.length, 2, 'no payment record or provider request is created');

  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    if (value.includes('/rpc/my_org_has_feature')) return new Response('true', { status: 200 });
    if (value.includes('/rpc/register_import')) return new Response('rate limit unavailable', { status: 500 });
    throw new Error('import must not fetch the supplied listing when limiter fails');
  };
  const importResult = await call(importListing, {
    method: 'POST',
    headers: { authorization: 'Bearer test-user-token' },
    body: { org: '00000000-0000-4000-8000-000000000001', url: 'https://www.myhome.ge/en/pr/123' },
  });
  assert.equal(importResult.statusCode, 503, 'import fails closed when the shared limiter is unavailable');
  assert.equal(importResult.body.error, 'rate_limit_unavailable');

  // MyHome.ge blocks datacenter fetches with a Cloudflare challenge: without a proxy key that is a clear message, with one the page is read through Firecrawl.
  const mhHtml = '<html><body>proxied page</body></html>'; // the parser itself is covered by import-parse.test.js
  let proxyCalls = 0;
  const importBody = { org: '00000000-0000-4000-8000-000000000001', url: 'https://www.myhome.ge/pr/23991315/' };
  const challenge = async (url, init) => {
    const value = String(url);
    if (value.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
    if (value.includes('/rpc/my_org_has_feature') ) return new Response('true', { status: 200 });
    if (value.includes('/rpc/register_import')) return new Response('true', { status: 200 });
    if (value.includes('api.firecrawl.dev')) { proxyCalls++; assert.equal(JSON.parse(init.body).url, importBody.url, 'only the validated listing url is sent to the proxy'); return new Response(JSON.stringify({ success: true, data: { rawHtml: mhHtml } }), { status: 200 }); }
    return new Response('Just a moment...', { status: 403 });
  };
  const originalFirecrawl = process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  globalThis.fetch = challenge;
  const blockedImport = await call(importListing, { method: 'POST', headers: { authorization: 'Bearer test-user-token' }, body: importBody });
  assert.equal(blockedImport.statusCode, 502, 'a Cloudflare challenge without a proxy key is reported');
  assert.equal(blockedImport.body.error, 'blocked');
  assert.equal(proxyCalls, 0, 'no proxy request without a key');
  process.env.FIRECRAWL_API_KEY = 'test-firecrawl-key';
  const proxiedImport = await call(importListing, { method: 'POST', headers: { authorization: 'Bearer test-user-token' }, body: importBody });
  assert.equal(proxyCalls, 1, 'a blocked site is read through the proxy when a key is set');
  assert.notEqual(proxiedImport.body.error, 'blocked', 'the proxy result is used instead of the block message');
  if (originalFirecrawl === undefined) delete process.env.FIRECRAWL_API_KEY; else process.env.FIRECRAWL_API_KEY = originalFirecrawl;

  console.log('Backend security tests passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKisaId === undefined) delete process.env.KISA_CLIENT_ID; else process.env.KISA_CLIENT_ID = originalKisaId;
  if (originalKisaSecret === undefined) delete process.env.KISA_CLIENT_SECRET; else process.env.KISA_CLIENT_SECRET = originalKisaSecret;
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
}
