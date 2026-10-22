/** KISA callback: each checkout URL carries a random, per-payment callback token. */
import { createHash, timingSafeEqual } from 'node:crypto';
import { BASE_APP_URL, publicConfig, callRpc } from './_lib.js';
import { sendEmail } from './_email.js';
import planCatalog from '../rigzea/js/plans.js';

const { PLANS } = planCatalog;
const fmtDay = (iso) => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(iso)).replace(/\//g, '.');

function callbackToken(req) {
  if (typeof req.query?.token === 'string') return req.query.token;
  try { return new URL(req.url, BASE_APP_URL).searchParams.get('token') || ''; } catch { return ''; }
}

function tokenMatches(token, expectedHash) {
  if (!token || !/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) return false;
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function asCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'invalid_payload' });
  const event = String(req.headers['x-kisa-event'] || '').toLowerCase();
  if (event !== 'payment.callback') return res.status(400).json({ ok: false, error: 'invalid_event' });

  const orderId = String(body.orderId || body.order_id || '').trim();
  const status = String(body.status || '').toUpperCase();
  const token = callbackToken(req);
  if (!orderId || orderId.length > 200 || !['SUCCESS', 'FAILED'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'invalid_callback' });
  }
  if (!token || token.length > 128) return res.status(401).json({ ok: false, error: 'invalid_callback' });

  const { url } = publicConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(503).json({ ok: false, error: 'database_not_configured' });

  let payment;
  try {
    const query = new URLSearchParams({
      provider: 'eq.kisa',
      provider_order_id: `eq.${orderId}`,
      select: 'id,organization_id,plan,amount,currency,provider,status,provider_order_id,metadata',
    });
    const lookup = await fetch(`${url}/rest/v1/payments?${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!lookup.ok) return res.status(502).json({ ok: false, error: 'payment_lookup_failed' });
    const rows = await lookup.json();
    payment = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  } catch (err) {
    console.error('kisa-webhook: payment lookup failed', err.message);
    return res.status(502).json({ ok: false, error: 'payment_lookup_failed' });
  }

  if (!payment || !tokenMatches(token, payment.metadata?.callback_token_hash)) {
    return res.status(401).json({ ok: false, error: 'invalid_callback' });
  }
  if (payment.status === 'completed') return res.status(200).json({ ok: true, notice: 'already_completed' });
  if (payment.status !== 'pending') return res.status(409).json({ ok: false, error: 'payment_not_pending' });

  const meta = body.metaData || body.metadata || {};
  if (meta.payment_id && meta.payment_id !== payment.id) return res.status(400).json({ ok: false, error: 'payment_mismatch' });
  if (meta.org_id && meta.org_id !== payment.organization_id) return res.status(400).json({ ok: false, error: 'payment_mismatch' });
  if (meta.plan && meta.plan !== payment.plan) return res.status(400).json({ ok: false, error: 'payment_mismatch' });

  if (status === 'FAILED') {
    try {
      const update = await fetch(`${url}/rest/v1/payments?id=eq.${payment.id}&status=eq.pending`, {
        method: 'PATCH',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
      });
      if (!update.ok) return res.status(502).json({ ok: false, error: 'payment_update_failed' });
      return res.status(200).json({ ok: true, notice: 'recorded_failed_payment' });
    } catch (err) {
      console.error('kisa-webhook: failed-payment update failed', err.message);
      return res.status(502).json({ ok: false, error: 'payment_update_failed' });
    }
  }

  if (asCents(body.amount) === null || asCents(body.amount) !== asCents(payment.amount)) {
    return res.status(400).json({ ok: false, error: 'payment_amount_mismatch' });
  }
  if (body.currency && String(body.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
    return res.status(400).json({ ok: false, error: 'payment_currency_mismatch' });
  }

  const activation = await callRpc('activate_org_subscription', {
    p_org: payment.organization_id,
    p_plan: payment.plan,
    p_days: 30,
    p_payment_id: payment.id,
    p_provider_payment_id: body.paymentId || body.payment_id || null,
  });
  if (!activation?.ok) {
    console.error('kisa-webhook: activation RPC failed');
    return res.status(502).json({ ok: false, error: 'activation_failed' });
  }
  if (activation.already_completed) return res.status(200).json({ ok: true, notice: 'already_completed' });

  const planInfo = PLANS[payment.plan];
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
          rows: [['პაკეტი', planInfo.name], ['მოქმედებს', until ? `${until}-მდე` : '30 დღე'], ['საფასური', `${planInfo.price} ₾`]],
          list: planInfo.bullets || [],
          button: { label: 'Rigzea-ს გახსნა', url: `${BASE_APP_URL}/app/` },
          note: 'ვადის გასვლის შემდეგ ანგარიში გადავა უფასო პაკეტზე. მონაცემები არ წაიშლება.',
        },
      });
    } catch (err) {
      console.error('kisa-webhook: receipt email failed', err.message);
    }
  }

  return res.status(200).json({ ok: true, activated: true, plan: payment.plan, expires_at: activation.plan_expires_at });
}
