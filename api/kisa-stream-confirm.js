/**
 * KISA Stream Widget Payment Confirmation Endpoint
 * POST /api/kisa-stream-confirm
 * Receives real-time donation event detected from KISA Socket.IO widget,
 * verifies validation ID, amount, short code, and ensures idempotency
 * before activating the organization's subscription via Supabase RPC.
 */
import { BASE_APP_URL, publicConfig, callRpc } from './_lib.js';
import planCatalog from '../rigzea/js/plans.js';

const { PLANS } = planCatalog;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPECTED_VALIDATION = process.env.KISA_STREAM_ID || '6ad1f68d02e62c8c663fc77b';
const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const { orgId, plan: planId, code, donation } = body;

  if (!orgId || !UUID_RE.test(orgId)) return res.status(400).json({ ok: false, error: 'invalid_org' });
  const plan = PLANS[planId];
  if (!plan || !['starter', 'pro', 'top', 'agency'].includes(planId)) {
    return res.status(400).json({ ok: false, error: 'invalid_plan' });
  }

  if (!code || typeof code !== 'string' || code.length < 3) {
    return res.status(400).json({ ok: false, error: 'invalid_code' });
  }

  if (!donation || typeof donation !== 'object') {
    return res.status(400).json({ ok: false, error: 'missing_donation' });
  }

  // 1. Verify validation token
  const donationValidation = String(donation.validation || '');
  if (donationValidation !== EXPECTED_VALIDATION) {
    console.error('kisa-stream-confirm: validation token mismatch', donationValidation, EXPECTED_VALIDATION);
    return res.status(400).json({ ok: false, error: 'invalid_stream_token', message: 'არავალიდური გადახდის წყარო.' });
  }

  // 2. Verify amount
  const amount = Number(donation.amount || 0);
  if (amount < plan.price) {
    console.error('kisa-stream-confirm: amount below plan price', amount, plan.price);
    return res.status(400).json({
      ok: false,
      error: 'insufficient_amount',
      message: `გადახდილი თანხა (${amount} ₾) ნაკლებია პაკეტის საფასურზე (${plan.price} ₾).`,
    });
  }

  // 3. Verify short code in message
  const msg = String(donation.message || '').toUpperCase();
  const cleanCode = code.trim().toUpperCase();
  if (!msg.includes(cleanCode)) {
    console.error('kisa-stream-confirm: code not found in message', msg, cleanCode);
    return res.status(400).json({
      ok: false,
      error: 'code_mismatch',
      message: `კომენტარში არ მოიძებნა თქვენი კოდი: ${cleanCode}.`,
    });
  }

  const { url, key } = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !serviceKey) {
    return res.status(503).json({ ok: false, error: 'database_not_configured' });
  }

  // 4. Verify user authentication & permissions
  let user = null;
  try {
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
    user = await userRes.json();
  } catch (err) {
    console.error('kisa-stream-confirm: auth error', err);
    return res.status(500).json({ ok: false, error: 'auth_failed' });
  }

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
    console.error('kisa-stream-confirm: membership error', err);
    return res.status(500).json({ ok: false, error: 'membership_check_failed' });
  }

  // 5. Unique donation ID to guarantee idempotency
  const donationId = String(donation._id || donation.id || `${cleanCode}_${amount}_${Date.now()}`);

  // Check if already redeemed in payments
  try {
    const checkRes = await fetch(
      `${url}/rest/v1/payments?provider=eq.kisa_stream&provider_payment_id=eq.${encodeURIComponent(donationId)}&select=id,status`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const existing = checkRes.ok ? await checkRes.json() : [];
    if (existing.length > 0 && existing[0].status === 'completed') {
      return res.status(409).json({ ok: false, error: 'already_redeemed', message: 'ეს გადახდა უკვე გააქტიურებულია.' });
    }
  } catch (err) {
    console.error('kisa-stream-confirm: duplicate check error', err);
  }

  // 6. Record payment in public.payments
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
        provider: 'kisa_stream',
        provider_order_id: cleanCode,
        provider_payment_id: donationId,
        plan: planId,
        amount_gel: amount,
        currency: 'GEL',
        status: 'completed',
        raw_payload: donation,
      }),
    });
    if (insertRes.ok) {
      const records = await insertRes.json();
      paymentRecord = records[0] || null;
    }
  } catch (err) {
    console.error('kisa-stream-confirm: insert payment error', err);
  }

  // 7. Activate organization subscription by 30 days
  const activation = await callRpc('activate_org_subscription', {
    p_org: orgId,
    p_plan: planId,
    p_days: 30,
    p_payment_id: paymentRecord?.id || null,
    p_provider_payment_id: donationId,
  });

  if (!activation || !activation.ok) {
    console.error('kisa-stream-confirm: activation RPC failed', activation);
    return res.status(502).json({ ok: false, error: 'activation_failed', message: 'პაკეტის გააქტიურება ვერ მოხერხდა ბაზაში.' });
  }

  return res.status(200).json({
    ok: true,
    plan: activation.plan,
    plan_expires_at: activation.plan_expires_at,
    message: `პაკეტი „${plan.name}“ წარმატებით გააქტიურდა 30 დღით!`,
  });
}
