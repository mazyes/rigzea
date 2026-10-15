/**
 * Plan activation email: POST { org } from the platform admin tab, right after
 * admin_set_org_plan. Tells the workspace owner which plan is now active and until when.
 * Only a platform admin can trigger it: admin_list_orgs runs with the caller's own JWT
 * and refuses everyone else, and the plan and owner address come from the database,
 * never from the request.
 */
import { BASE_APP_URL, requireEnv, callRpcAs, publicConfig } from './_lib.js';
import { sendEmail } from './_email.js';
// The same plan catalogue the app uses, so names and limits cannot drift apart.
import planCatalog from '../rigzea/js/plans.js';

const { PLANS, PLAN_ORDER } = planCatalog;

const fmtDay = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)).replace(/\//g, '.');

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  try {
    requireEnv('RESEND_API_KEY');
  } catch (e) {
    console.error(e.message);
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }
  if (!publicConfig().key) return res.status(503).json({ ok: false, error: 'not_configured' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  if (!token) return res.status(401).json({ ok: false, error: 'auth' });
  if (!/^[0-9a-f-]{36}$/i.test(String(body.org || ''))) return res.status(400).json({ ok: false, error: 'org' });

  const orgs = await callRpcAs(token, 'admin_list_orgs');
  if (!orgs.ok) return res.status(orgs.status === 401 ? 401 : 403).json({ ok: false, error: 'forbidden' });

  const org = (orgs.data || []).find((o) => o.id === body.org);
  if (!org) return res.status(404).json({ ok: false, error: 'org' });
  const plan = PLANS[org.effective_plan];
  if (!plan || !PLAN_ORDER.includes(plan.id)) return res.status(409).json({ ok: false, error: 'not_paid' }); // free, trial, or already expired
  if (!org.owner_email) return res.status(409).json({ ok: false, error: 'no_owner' });

  const until = org.plan_expires_at ? fmtDay(org.plan_expires_at) : null;
  const sent = await sendEmail({
    to: org.owner_email,
    subject: `პაკეტი „${plan.name}“ გააქტიურდა · Rigzea`,
    content: {
      preheader: until ? `მოქმედებს ${until}-მდე.` : 'გადახდა მივიღეთ, პაკეტი ჩართულია.',
      title: `პაკეტი „${plan.name}“ გააქტიურდა`,
      lines: ['გადახდა მივიღეთ, მადლობა. პაკეტი უკვე ჩართულია და ყველა ფუნქცია ხელმისაწვდომია.'],
      rows: [['სამუშაო სივრცე', org.name], ['პაკეტი', plan.name], ['მოქმედებს', until ? `${until}-მდე` : 'ვადის გარეშე']],
      list: plan.bullets,
      button: { label: 'გახსენი Rigzea', url: `${BASE_APP_URL}/app/` },
      note: until ? `ვადის გასვლის შემდეგ ანგარიში უფასო პაკეტზე გადავა. მონაცემები არ წაიშლება.` : '',
    },
  });
  if (!sent.ok) return res.status(502).json({ ok: false, error: 'send' });
  return res.status(200).json({ ok: true, to: org.owner_email });
}
