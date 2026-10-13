// Who runs Rigzea. Fill these in once; the legal pages and the landing footer read them from here.
// An empty value hides its line. While name or email is empty, the legal pages show a notice.
window.RIGZEA_OPERATOR = {
  name: 'რიგზეა (Rigzea)',     // legal name: company (შპს ...) or individual entrepreneur (ი/მ ...)
  id: '',       // identification code
  address: 'თბილისი, საქართველო',  // legal address
  email: 'contact@rigzea.com',    // contact email for privacy and refund requests
  phone: '+995 599 54 85 75',    // contact phone, international format
};

(function () {
  var op = window.RIGZEA_OPERATOR || {};
  ['name', 'id', 'address', 'email', 'phone'].forEach(function (key) {
    var value = String(op[key] || '').trim();
    document.querySelectorAll('[data-op-row="' + key + '"]').forEach(function (row) { row.hidden = !value; });
    document.querySelectorAll('[data-op="' + key + '"]').forEach(function (el) {
      el.textContent = value;
      if (el.tagName === 'A' && value) el.href = (key === 'email' ? 'mailto:' : 'tel:') + value.replace(/\s+/g, '');
    });
  });
  var complete = String(op.name || '').trim() && String(op.email || '').trim();
  document.querySelectorAll('[data-operator-notice]').forEach(function (el) { el.hidden = !!complete; });
  document.querySelectorAll('[data-operator-line]').forEach(function (el) {
    el.textContent = [op.name, op.id && ('ს/კ ' + op.id), op.address, op.email, op.phone].filter(Boolean).join(' · ');
  });
})();
