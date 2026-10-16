/**
 * KISA Webhook Handler: POST
 * Conforms 100% to KISA official Integrator API callbacks:
 * Header: X-Kisa-Event: payment.callback
 * Payload: { orderId, status: "SUCCESS" | "FAILED", amount, metaData }
 */
import { BASE_APP_URL, publicConfig, callRpc } from './_lib.js';
import { sendEmail } from './_email.js';
import planCatalog from '../rigzea/js/plans.js';

const { PLANS } = planCatalog;
const fmtDay = (iso) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
    .format(new Date(iso))
    .replace(/\//g, '.');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});

  const orderId = String(body.orderId || body.order_id || '');
  const status = String(body.status || '').toUpperCase();
  const meta = body.metaData || body.metadata || {};
  const paymentId = meta.payment_id || null;

  const { url } = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(503).json({ ok: false, error: 'database_not_configured' });
  }

  // 1. If payment failed
  if (status !== 'SUCCESS') {
    if (paymentId || orderId) {
      const match = paymentId ? `id=eq.${paymentId}` : `provider_order_id=eq.${encodeURIComponent(orderId)}`;
      await fetch(`${url}/rest/v1/payments?${match}`, {
        method: 'PATCH',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, notice: 'recorded_failed_payment' });
  }

  // 2. Lookup payment record in DB to check idempotency
  let paymentRecord = null;
  try {
    const match = paymentId ? `id=eq.${paymentId}` : `provider_order_id=eq.${encodeURIComponent(orderId)}`;
    const pRes = await fetch(`${url}/rest/v1/payments?${match}&select=*`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (pRes.ok) {
      const rows = await pRes.json();
      paymentRecord = rows[0] || null;
    }
  } catch (err) {
    console.error('kisa-webhook: lookup error', err);
  }

  // Idempotency: avoid double extensions
  if (paymentRecord && paymentRecord.status === 'completed') {
    return res.status(200).json({ ok: true, notice: 'already_completed' });
  }

  const targetOrgId = paymentRecord?.organization_id || meta.org_id;
  const targetPlan = paymentRecord?.plan || meta.plan;

  if (!targetOrgId || !targetPlan) {
    console.error('kisa-webhook: missing org_id or plan', body);
    return res.status(400).json({ ok: false, error: 'missing_context' });
  }

  // 3. Extend organization subscription by 30 days
  const activation = await callRpc('activate_org_subscription', {
    p_org: targetOrgId,
    p_plan: targetPlan,
    p_days: 30,
    p_payment_id: paymentRecord?.id || null,
    p_provider_payment_id: orderId || null,
  });

  if (!activation || !activation.ok) {
    console.error('kisa-webhook: activation RPC error', activation);
    return res.status(502).json({ ok: false, error: 'activation_failed' });
  }

  // 4. Send email confirmation to owner
  const planInfo = PLANS[targetPlan];
  if (activation.owner_email && planInfo) {
    const until = activation.plan_expires_at ? fmtDay(activation.plan_expires_at) : null;
    try {
      await sendEmail({
        to: activation.owner_email,
        subject: `პაკეტი „${planInfo.name}“ გააქტიურდა · Rigzea`,
        content: {
          preheader: until ? `მოქმედებს ${until}-მდე (30 დღე).` : 'გადახდა მიღებულია.',
          title: `პაკეტი „${planInfo.name}“ გააქტიურდა`,
          lines: ['გადახდა წარმატებით შესრულდა. პაკეტი გააქტიურდა 30 დღით და ყველა ფუნქცია ხელმისაწვდომია.'],
          rows: [
            ['პაკეტი', planInfo.name],
            ['მოქმედებს', until ? `${until}-მდე` : '30 დღე'],
            ['საფასური', `${planInfo.price} ₾`],
          ],
          list: planInfo.bullets || [],
          button: { label: 'Rigzea-ს გახსნა', url: `${BASE_APP_URL}/app/` },
          note: 'ვადის გასვლის შემდეგ ანგარიში გადავა უფასო პაკეტზე. მონაცემები არ წაიშლება.',
        },
      });
    } catch (e) {
      console.error('kisa-webhook: email error', e);
    }
  }

  return res.status(200).json({
    ok: true,
    activated: true,
    plan: targetPlan,
    expires_at: activation.plan_expires_at,
  });
}
