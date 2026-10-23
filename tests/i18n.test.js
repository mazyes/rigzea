// Exercise the real translation dictionary and phrase rules without a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../rigzea/js/i18n.js'), 'utf8');
function translator(pathname) {
  const rules = source.slice(source.indexOf('  var D ='), source.indexOf('  function text(n)'));
  return vm.runInNewContext('(function () {' + rules + '; return tr; })()', { location: { pathname } });
}

const tr = translator('/app/');
for (const [ka, en] of [
  ['სწრაფი მოქმედებები', 'Quick actions'],
  ['ბოლო ობიექტები', 'Recent properties'],
  ['პირველი ნაბიჯები', 'Getting started'],
  ['ობიექტები', 'Properties'],
  ['ჩემი საქმეები', 'My tasks'],
  ['ახალი მეპატრონე', 'New owner'],
  ['ახალი შეტყობინება არ არის.', 'No new notifications.'],
  ['1 ობიექტი', '1 property'],
  ['2 ობიექტი', '2 properties'],
  ['1 საქმე დღეს', '1 task today'],
  ['3 საქმე დღეს', '3 tasks today'],
  ['1 აქტიური გარიგება', '1 active deal'],
  ['2 აქტიური გარიგება · გაყიდვები და გაქირავება', '2 active deals · sales and rentals'],
  ['ობიექტის აგენტი (25%)', 'Listing agent (25%)'],
  ['გამარჯობა, ნინო!', 'Hello, Nino!'],
  ['მენიუს მდებარეობა', 'Menu position'],
  ['ხელსაწყოები', 'Tools'],
  ['გარეგნობა', 'Appearance'],
  ['მუქი რეჟიმი', 'Dark mode'],
  ['კლიენტის სელექცია', 'Property matching'],
  ['სახელი, ნომერი, მისამართი, უბანი, მფლობელი, ქალაქი', 'Name, unit, address, district, owner, city'],
  ['ბინის ძებნა', 'Search properties'],
  ['ჯავშანი', 'Booking'],
  ['კოლეგასთან გაზიარება: ვაკე · ჭავჭავაძე 33', 'Share with a colleague: Vake · Chavchavadze 33'],
  ['გაწეული ხარჯი', 'Incurred expenses'],
  ['ჯერ არ არის გაწეული', 'Not incurred yet'],
  ['. შეთავაზებული და დადასტურებული, ჯერ გაუწეველი ხარჯი (₾125) არ შედის.', '. Proposed and approved expenses not yet incurred (₾125) are excluded.'],
]) assert.equal(tr(ka), en, ka);

// Missing interface translations must never masquerade as English transliteration.
assert.equal(tr('უცნობი ინტერფეისის ტექსტი'), null);
assert.equal(tr('ლელა ცერცვაძე'), null, 'Keep unknown user-entered names intact');
assert.equal(tr('  ბოლო ობიექტები  '), '  Recent properties  ', 'Keep surrounding spaces');
assert.equal(translator('/app/apartments/')('ბოლო ობიექტები'), 'Recent properties');

// CRM overrides must not change the public site's existing translations.
assert.equal(translator('/')('ობიექტები'), 'Obiektebi');
assert.equal(translator('/pricing/')('აირჩიე შენზე მორგებული ნაკრები'), 'Choose the plan that fits you');
console.log('CRM English: real translations, dynamic counts, names and public-site isolation passed.');
