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

  console.log('Backend security tests passed.');
} finally {
  globalThis.fetch = originalFetch;
  if (originalKisaId === undefined) delete process.env.KISA_CLIENT_ID; else process.env.KISA_CLIENT_ID = originalKisaId;
  if (originalKisaSecret === undefined) delete process.env.KISA_CLIENT_SECRET; else process.env.KISA_CLIENT_SECRET = originalKisaSecret;
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
}
