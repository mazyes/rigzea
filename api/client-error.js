// Minimal public-client error reporting. Do not accept or log message text, stacks, or user data.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (Number(req.headers['content-length'] || 0) > 2048) return res.status(413).end();

  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');
  try {
    if (!origin || !host || new URL(origin).host !== host) return res.status(403).end();
  } catch { return res.status(403).end(); }

  const parsed = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })()
    : (req.body || {});
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const kind = ['error', 'unhandledrejection'].includes(body.kind) ? body.kind : null;
  if (!kind) return res.status(400).end();

  const path = String(body.path || '').replace(/[^/a-zA-Z0-9_-]/g, '').slice(0, 100);
  const file = String(body.file || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 100);
  const line = Math.max(0, Math.min(1000000, Number(body.line) || 0));
  const column = Math.max(0, Math.min(1000000, Number(body.column) || 0));
  console.error('client-error', JSON.stringify({ kind, path, file, line, column }));
  return res.status(204).end();
}
