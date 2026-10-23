/**
 * Invitation email: POST { invitation: <id>, lang: 'ka' | 'en' } from the Team page, right after an owner or admin
 * creates (or re-sends) an invitation. Only the invitation id comes from the browser: the address, role, token,
 * workspace name and sender name are read from the database by invitation_email_data(), which runs with the
 * caller's own JWT, so only an owner or admin of that workspace gets an answer, and it also limits the sends
 * (5 per invitation, 30 seconds apart). The link carries the private token: /app/?invite=<token>.
 */
import { BASE_APP_URL, requireEnv, callRpcAs, publicConfig } from './_lib.js';
import { sendEmail } from './_email.js';

const ROLE = {
  ka: { admin: 'ადმინისტრატორი', manager: 'მენეჯერი', agent: 'აგენტი', staff: 'თანამშრომელი' },
  en: { admin: 'Administrator', manager: 'Manager', agent: 'Agent', staff: 'Team member' },
};
const fmtDay = (iso) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)).replace(/\//g, '.');

// Exported so the layout can be reviewed and tested without sending anything.
export function inviteContent({ lang = 'ka', inviter, org, role, token, expires_at }) {
  const en = lang === 'en';
  const until = expires_at ? fmtDay(expires_at) : null;
  const url = `${BASE_APP_URL}/app/?invite=${token}`;
  const roleName = (en ? ROLE.en : ROLE.ka)[role] || role;
  const staff = role === 'staff';
  if (en) {
    return {
      subject: `You are invited to ${org} on Rigzea`,
      content: {
        lang: 'en',
        preheader: `${inviter} invited you to join ${org} as ${roleName}.`,
        title: `You are invited to ${org}`,
        lines: [`${inviter} invited you to the ${org} team on Rigzea, a workspace for real estate agents.`, 'Open the invitation, then create your account or sign in with this email address. You will join the team automatically.'],
        rows: [['Invited by', inviter], ['Workspace', org], ['Your role', roleName], ...(until ? [['Valid until', until]] : [])],
        list: staff
          ? ['See the tasks assigned to you', 'Fill in checklists and upload photos from your phone']
          : ['Properties, clients and deals in one place', 'Tasks and reminders for the whole team', 'A private team chat'],
        button: { label: 'Accept the invitation', url },
        note: `This link is personal${until ? ` and works until ${until}` : ''}. If you did not expect this email, you can ignore it.`,
      },
    };
  }
  return {
    subject: `მოწვევა: „${org}“ · Rigzea`,
    content: {
      lang: 'ka',
      preheader: `${inviter} გიწვევს „${org}“-ის გუნდში, როლი: ${roleName}.`,
      title: `მოწვევა: „${org}“`,
      lines: [`მოგიწვიეს „${org}“-ის გუნდში Rigzea-ზე, უძრავი ქონების აგენტების სამუშაო სივრცეში.`, 'გახსენი მოწვევა, შემდეგ შექმენი ანგარიში ან შედი ამავე ელფოსტით. გუნდს ავტომატურად დაემატები.'],
      rows: [['ვინ მოგიწვია', inviter], ['სამუშაო სივრცე', org], ['შენი როლი', roleName], ...(until ? [['მოქმედებს', `${until}-მდე`]] : [])],
      list: staff
        ? ['დაინახავ შენთვის დანიშნულ საქმეებს', 'ტელეფონიდან შეავსებ ჩეკლისტს და ატვირთავ ფოტოებს']
        : ['ბინები, კლიენტები და გარიგებები ერთ სივრცეში', 'საქმეები და შეხსენებები მთელი გუნდისთვის', 'გუნდური ჩატი'],
      button: { label: 'მოწვევის მიღება', url },
      note: `ბმული პირადულია${until ? ` და ${until}-მდე მოქმედებს` : ''}. თუ ეს წერილი მოულოდნელია, უბრალოდ უგულებელყავი.`,
    },
  };
}

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
  if (!/^[0-9a-f-]{36}$/i.test(String(body.invitation || ''))) return res.status(400).json({ ok: false, error: 'invitation' });

  const r = await callRpcAs(token, 'invitation_email_data', { p_id: body.invitation });
  if (!r.ok) {
    const msg = String(r.error || '');
    if (r.status === 401) return res.status(401).json({ ok: false, error: 'auth' });
    if (/wait a moment|too many/.test(msg)) return res.status(429).json({ ok: false, error: /too many/.test(msg) ? 'limit' : 'wait' });
    if (/not pending/.test(msg)) return res.status(409).json({ ok: false, error: 'not_pending' });
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const d = r.data || {};
  if (!d.email || !d.token || !d.org_name) return res.status(502).json({ ok: false, error: 'data' });

  const { subject, content } = inviteContent({ lang: body.lang === 'en' ? 'en' : 'ka', inviter: d.inviter || 'Rigzea', org: d.org_name, role: d.role, token: d.token, expires_at: d.expires_at });
  const sent = await sendEmail({ to: d.email, subject, content });
  if (!sent.ok) return res.status(502).json({ ok: false, error: 'send' });
  return res.status(200).json({ ok: true, to: d.email });
}
