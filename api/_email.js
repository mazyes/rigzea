/**
 * Rigzea email: one branded layout for every message, and delivery through Resend.
 * The same layout produces the Supabase Auth templates in supabase/templates/
 * (see supabase/templates/build.mjs), so the verification email and our own
 * emails look identical.
 * Email clients ignore stylesheets, so everything is inline and table-based.
 */
import { BASE_APP_URL, esc } from './_lib.js';

const C = { page: '#f3f6f4', card: '#ffffff', ink: '#14201a', muted: '#5b6b62', line: '#e3eae6', dark: '#080c0a', mint: '#00f59b', emerald: '#107557' };
const FONT = "'FiraGO',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Georgian','BPG Arial',Arial,sans-serif";
// Clients that honour web fonts (Apple Mail, iOS) get the same FiraGO as the site; the rest fall back.
const FONT_FACE = `@font-face{font-family:'FiraGO';src:url('${BASE_APP_URL}/fonts/FiraGO-Regular.woff2') format('woff2');font-weight:400}@font-face{font-family:'FiraGO';src:url('${BASE_APP_URL}/fonts/FiraGO-Bold.woff2') format('woff2');font-weight:700 800}`;

const attr = (s) => esc(s).replace(/"/g, '&quot;');

/**
 * title: heading. lines: paragraphs (plain text). button: { label, url }.
 * rows: [label, value] pairs shown as a summary table. list: bullet points.
 * note: small print under the button. Text is escaped; URLs may hold Supabase
 * template variables such as {{ .ConfirmationURL }}.
 */
export function renderEmail({ preheader = '', title, lines = [], button = null, rows = [], list = [], note = '' }) {
  const p = (t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.ink}">${esc(t)}</p>`;
  const summary = rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;border:1px solid ${C.line};border-radius:10px">${rows.map(([k, v], i) =>
    `<tr><td style="padding:11px 14px;font-size:13px;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ''}">${esc(k)}</td><td align="right" style="padding:11px 14px;font-size:14px;font-weight:600;color:${C.ink};${i ? `border-top:1px solid ${C.line};` : ''}">${esc(v)}</td></tr>`).join('')}</table>` : '';
  const bullets = list.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${list.map((t) =>
    `<tr><td valign="top" style="padding:0 10px 8px 0;font-size:15px;line-height:1.5;color:${C.emerald};font-weight:700">&#10003;</td><td style="padding:0 0 8px;font-size:15px;line-height:1.5;color:${C.ink}">${esc(t)}</td></tr>`).join('')}</table>` : '';
  const cta = button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px"><tr><td bgcolor="${C.emerald}" style="border-radius:10px"><a href="${attr(button.url)}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${esc(button.label)}</a></td></tr></table>
            <p style="margin:0 0 14px;font-size:12px;line-height:1.6;color:${C.muted}">თუ ღილაკი არ მუშაობს, ჩასვი ეს ბმული ბრაუზერში:<br><a href="${attr(button.url)}" style="color:${C.emerald};word-break:break-all">${esc(button.url)}</a></p>` : '';
  const small = note ? `<p style="margin:0;font-size:13px;line-height:1.6;color:${C.muted}">${esc(note)}</p>` : '';

  return `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<style>${FONT_FACE}</style>
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background:${C.page}">
  <tr><td align="center" style="padding:28px 14px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td bgcolor="${C.dark}" style="background:${C.dark};border-radius:14px 14px 0 0;padding:22px 28px">
        <a href="${attr(BASE_APP_URL)}" target="_blank" style="font-family:${FONT};font-size:21px;font-weight:800;letter-spacing:-0.3px;color:#ffffff;text-decoration:none">Rigzea<span style="color:${C.mint}">.</span></a>
        <div style="margin-top:3px;font-size:12px;color:#8ea398">უძრავი ქონების აგენტის სამუშაო სივრცე</div>
      </td></tr>
      <tr><td bgcolor="${C.card}" style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 14px 14px;padding:28px">
        <h1 style="margin:0 0 14px;font-family:${FONT};font-size:21px;line-height:1.35;font-weight:800;color:${C.ink}">${esc(title)}</h1>
        ${lines.map(p).join('\n        ')}
        ${summary}${bullets}${cta}${small}
      </td></tr>
      <tr><td align="center" style="padding:18px 20px 0;font-size:12px;line-height:1.6;color:${C.muted}">
        Rigzea · <a href="${attr(BASE_APP_URL)}" style="color:${C.muted}">${esc(BASE_APP_URL.replace(/^https?:\/\//, ''))}</a><br>ეს წერილი ავტომატურად გამოიგზავნა. თუ შენ არ მოგითხოვია, უბრალოდ არ მიაქციო ყურადღება.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

// Plain-text alternative for the same content (better deliverability, readable anywhere).
export function renderText({ title, lines = [], button = null, rows = [], list = [], note = '' }) {
  return [title, '', ...lines, ...(rows.length ? ['', ...rows.map(([k, v]) => `${k}: ${v}`)] : []), ...(list.length ? ['', ...list.map((t) => `- ${t}`)] : []),
    ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(note ? ['', note] : []), '', `Rigzea · ${BASE_APP_URL}`].join('\n');
}

// Sends one email through Resend. Returns { ok, id } or { ok: false, error }.
export async function sendEmail({ to, subject, content }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Rigzea <contact@rigzea.com>', to: [to], subject, html: renderEmail(content), text: renderText(content) }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`Resend failed: ${res.status} ${out.message || ''}`);
      return { ok: false, error: out.message || `http_${res.status}` };
    }
    return { ok: true, id: out.id };
  } catch (e) {
    console.error('Resend error:', e.message);
    return { ok: false, error: e.message };
  }
}
