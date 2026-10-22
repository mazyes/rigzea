/** KISA Stream sends donation events to the browser, so those events cannot prove payment. */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  return res.status(410).json({
    ok: false,
    error: 'payment_verification_unavailable',
    message: 'KISA Stream-ის გადახდის დადასტურება დროებით მიუწვდომელია. გამოიყენე ბარათით გადახდა.',
  });
}
