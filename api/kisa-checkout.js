/**
 * KISA Checkout initialization: POST { orgId, plan }
 * Conforms 100% to KISA official Integrator API:
 * 1. Exchanges clientId & clientSecret for accessToken at POST /api/integrator/auth/token
 * 2. Creates Keepz checkout session at POST /api/integrator/create-payment
 * 3. Saves pending payment in Supabase and returns redirect URL.
 */
import { BASE_APP_URL, publicConfig } from './_lib.js';
import planCatalog from '../rigzea/js/plans.js';
import { createHash, randomBytes } from 'node:crypto';

const { PLANS } = planCatalog;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const orgId = String(body.orgId || '');
  const planId = String(body.plan || '');

  if (!UUID_RE.test(orgId)) return res.status(400).json({ ok: false, error: 'invalid_org' });
  const plan = PLANS[planId];
  if (!plan || !['starter', 'pro', 'top', 'agency'].includes(planId)) {
    return res.status(400).json({ ok: false, error: 'invalid_plan' });
  }

  const { url, key } = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const kisaBaseUrl = (process.env.KISA_API_URL || 'https://www.kisa.ge').replace(/\/$/, '');
  const clientId = process.env.KISA_CLIENT_ID;
  const clientSecret = process.env.KISA_CLIENT_SECRET;
  if (!url || !key || !serviceKey) {
    return res.status(503).json({ ok: false, error: 'database_not_configured' });
  }

  // 1. Verify user authentication
  let user = null;
  try {
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    user = await userRes.json();
  } catch (err) {
    console.error('kisa-checkout: auth error', err);
    return res.status(500).json({ ok: false, error: 'auth_failed' });
  }

  // 2. Verify workspace permission (owner or admin)
  try {
    const memberRes = await fetch(
      `${url}/rest/v1/organization_members?organization_id=eq.${orgId}&user_id=eq.${user.id}&select=role`,
      { headers: { apikey: key, Authorization: `Bearer ${token}` } }
    );
    const members = memberRes.ok ? await memberRes.json() : [];
    const role = members[0]?.role;
    if (!role || !['owner', 'admin'].includes(role)) {
      return res.status(403).json({ ok: false, error: 'forbidden', message: 'პაკეტის შეძენის უფლება აქვს მხოლოდ მფლობელს ან ადმინს.' });
    }
  } catch (err) {
    console.error('kisa-checkout: member check error', err);
    return res.status(500).json({ ok: false, error: 'permission_check_failed' });
  }

  if (!clientId || !clientSecret) {
    return res.status(503).json({ ok: false, error: 'payment_provider_not_configured', message: 'ბარათით გადახდა დროებით მიუწვდომელია.' });
  }

  const callbackToken = randomBytes(32).toString('base64url');
  const callbackTokenHash = createHash('sha256').update(callbackToken).digest('hex');

  // 3. Create pending payment record in DB
  let paymentRecord = null;
  try {
    const insertRes = await fetch(`${url}/rest/v1/payments`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        organization_id: orgId,
        user_id: user.id,
        plan: planId,
        amount: plan.price,
        currency: 'GEL',
        provider: 'kisa',
        status: 'pending',
        metadata: {
          user_email: user.email,
          plan_name: plan.name,
          initiated_at: new Date().toISOString(),
          callback_token_hash: callbackTokenHash,
        },
      }),
    });
    if (!insertRes.ok) {
      console.error('kisa-checkout: insert payment error', await insertRes.text());
      return res.status(502).json({ ok: false, error: 'payment_record_failed' });
    }
    const inserted = await insertRes.json();
    paymentRecord = inserted[0];
    if (!paymentRecord?.id) return res.status(502).json({ ok: false, error: 'payment_record_failed' });
  } catch (err) {
    console.error('kisa-checkout: db insert exception', err);
    return res.status(500).json({ ok: false, error: 'db_error' });
  }
  const markPaymentFailed = () => fetch(`${url}/rest/v1/payments?id=eq.${paymentRecord.id}&status=eq.pending`, {
    method: 'PATCH',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
  }).catch(() => {});

  // 4. KISA API interaction
  const successRedirectUrl = `${BASE_APP_URL}/app/settings/?payment=success&plan=${encodeURIComponent(planId)}`;
  const failRedirectUrl = `${BASE_APP_URL}/app/settings/?payment=failed`;
  // Trailing slash: vercel.json trailingSlash answers /api/kisa-webhook with a 308 that KISA may not follow on POST.
  const callbackUrl = `${BASE_APP_URL.replace(/\/$/, '')}/api/kisa-webhook/?token=${encodeURIComponent(callbackToken)}`;

  try {
    // Step 4.1: Get access token from KISA
    const tokenRes = await fetch(`${kisaBaseUrl}/api/integrator/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.accessToken) {
      console.error('kisa-checkout: failed to obtain KISA access token', tokenRes.status);
      await markPaymentFailed();
      return res.status(502).json({
        ok: false,
        error: 'kisa_auth_error',
        message: 'KISA-ს ავტორიზაცია ვერ მოხერხდა. შეამოწმეთ Client ID და Client Secret.',
      });
    }

    // Step 4.2: Create payment on KISA (Keepz checkout session)
    const paymentRes = await fetch(`${kisaBaseUrl}/api/integrator/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.accessToken}`,
      },
      body: JSON.stringify({
        amount: Number(plan.price),
        callbackUrl,
        successRedirectUrl,
        failRedirectUrl,
        metaData: {
          payment_id: paymentRecord.id,
          org_id: orgId,
          plan: planId,
        },
      }),
    });

    const paymentData = await paymentRes.json().catch(() => ({}));
    let checkoutUrl;
    try { checkoutUrl = new URL(paymentData.url); } catch { checkoutUrl = null; }
    if (!paymentRes.ok || !checkoutUrl || checkoutUrl.protocol !== 'https:' || !paymentData.orderId) {
      console.error('kisa-checkout: create-payment error', paymentRes.status);
      await markPaymentFailed();
      return res.status(502).json({
        ok: false,
        error: 'kisa_payment_error',
        message: paymentData.message || 'გადახდის სესიის შექმნა ვერ მოხერხდა.',
      });
    }

    // Store KISA orderId before returning the checkout URL, so callbacks can only match this row.
    try {
      const stored = await fetch(`${url}/rest/v1/payments?id=eq.${paymentRecord.id}&status=eq.pending`, {
        method: 'PATCH',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider_order_id: String(paymentData.orderId) }),
      });
      if (!stored.ok) {
        console.error('kisa-checkout: could not store provider order', stored.status);
        await markPaymentFailed();
        return res.status(502).json({ ok: false, error: 'payment_record_update_failed' });
      }
    } catch (err) {
      console.error('kisa-checkout: could not store provider order', err.message);
      await markPaymentFailed();
      return res.status(502).json({ ok: false, error: 'payment_record_update_failed' });
    }

    return res.status(200).json({
      ok: true,
      checkoutUrl: checkoutUrl.href,
      orderId: paymentData.orderId,
      paymentId: paymentRecord.id,
    });
  } catch (err) {
    console.error('kisa-checkout: exception', err);
    await markPaymentFailed();
    return res.status(502).json({ ok: false, error: 'kisa_connection_error' });
  }
}
