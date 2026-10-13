// Unit tests for the smart-import parsers (api/_import-parse.js).
// Run: node tests/import-parse.test.js
const assert = require('assert');
const { hostOf, parseListing, debrand } = require('../api/_import-parse.js');

const next = (props) => `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props })}</script></body></html>`;

const tests = {
  'only the three listing sites are accepted': () => {
    assert.deepStrictEqual(hostOf('https://www.myhome.ge/pr/1/'), { site: 'myhome.ge', url: 'https://www.myhome.ge/pr/1/' });
    assert.strictEqual(hostOf('https://home.ss.ge/ka/x-1').site, 'ss.ge');
    assert.strictEqual(hostOf('http://place.ge/ge/ads/view/1').url, 'https://place.ge/ge/ads/view/1');
    for (const bad of ['https://evil.com/?u=myhome.ge', 'https://myhome.ge.evil.com/a', 'https://notmyhome.ge/', 'file:///etc/passwd', 'ftp://ss.ge/x', 'http://169.254.169.254/', '', null]) {
      assert.strictEqual(hostOf(bad), null, String(bad));
    }
  },

  'myhome: sale listing from the page data': () => {
    const html = next({ pageProps: { dehydratedState: { queries: [{ state: { data: { data: { statement: {
      deal_type_id: 1, real_estate_type_id: 1, currency_id: 2, total_price: 123000,
      price: { 1: { price_total: 319726, price_square: 2780 }, 2: { price_total: 123000, price_square: 1070 } },
      city_name: 'თბილისი', district_name: 'ძველი თბილისი', urban_name: 'მთაწმინდა', address: 'რუსთაველის გამზ. ',
      room_type_id: 4, bedroom_type_id: 3, bathroom_type_id: 1, area: 115, floor: 1, total_floors: 3, lat: 41.69, lng: 44.79,
      dynamic_title: 'იყიდება 4 ოთახიანი ბინა მთაწმინდაზე', comment: 'ნათელი ბინა. დამირეკეთ 599 12 34 56.',
      images: [{ large: 'https://static.example.ge/a.webp' }, { large: 'https://static.example.ge/b.webp' }],
    } } } } }] } } });
    const l = parseListing('myhome.ge', html);
    assert.strictEqual(l.transaction_type, 'sale');
    assert.strictEqual(l.price, 123000); assert.strictEqual(l.currency, 'USD');
    assert.strictEqual(l.price_sqm, 1070);
    assert.deepStrictEqual([l.rooms, l.bedrooms, l.area_sqm, l.floor, l.total_floors], [4, 3, 115, 1, 3]);
    assert.strictEqual(l.district, 'მთაწმინდა'); assert.strictEqual(l.address, 'რუსთაველის გამზ.');
    assert.strictEqual(l.description, 'ნათელი ბინა.');
    assert.strictEqual(l.images.length, 2);
    assert.strictEqual(l.name, 'მთაწმინდა · რუსთაველის გამზ., 4-ოთახიანი');
  },

  'ss.ge: rent listing in GEL': () => {
    const html = next({ pageProps: { applicationData: {
      title: 'ქირავდება 2 ოთახიანი ბინა ვაკეში', realEstateDealType: 'ქირავდება', realEstateType: 'ბინა',
      address: { cityTitle: 'თბილისი', districtTitle: 'ვაკე-საბურთალო', subdistrictTitle: 'ვაკე', streetTitle: 'აბაშიძის ქ.', streetNumber: '14' },
      price: { priceGeo: 2100, priceUsd: 780, currencyType: 1 }, rooms: '2', bedrooms: 1, toilet: '1', floor: '4', floors: '9', totalArea: '64',
      description: { ka: 'მყუდრო ბინა. www.agency.ge' }, cadastralCode: '01.14.03.021.015',
      appImages: [{ fileName: 'https://static.example.ge/1.jpg' }],
    } } });
    const l = parseListing('ss.ge', html);
    assert.strictEqual(l.transaction_type, 'long_term');
    assert.strictEqual(l.price, 2100); assert.strictEqual(l.currency, 'GEL');
    assert.strictEqual(l.price_sqm, null, 'no price per sqm for rentals');
    assert.strictEqual(l.address, 'აბაშიძის ქ. 14'); assert.strictEqual(l.district, 'ვაკე');
    assert.strictEqual(l.cadastral_code, '01.14.03.021.015');
    assert.strictEqual(l.description, 'მყუდრო ბინა.');
  },

  'place.ge: fields from the page text, other ads photos ignored': () => {
    const html = `<html><head><meta property="og:title" content="იყიდება, ბინა, 7 ოთახი, თბილისი, ვაკე - place.ge" /></head><body>
      <div>$790,000 / $2,705 კვ.მ.</div><img src="https://photos.place.ge/photos/111/800x600.webp"><img src="https://photos.place.ge/photos/111/124x89.webp">
      <div>ფართი: 292 კვ.მ. რემონტი: გარემონტებული მისამართი: თბილისი, ვაკე-საბურთალო, ვაკე, ი.აბაშიძის ქ. სართული: 3/8 ოთახი: 7 სველი წერტილი: 4 საძინებელი: 4</div>
      <div>დამატებითი ინფორმაცია გამყიდველისაგან: ბინა არის გამჭოლი. დამიკავშირდით ნომერზე: 597795488.</div>
      <h2>მსგავსი განცხადებები</h2><img src="https://photos.place.ge/photos/999/800x600.webp"></body></html>`;
    const l = parseListing('place.ge', html);
    assert.strictEqual(l.price, 790000); assert.strictEqual(l.price_sqm, 2705);
    assert.deepStrictEqual([l.area_sqm, l.floor, l.total_floors, l.rooms, l.bedrooms, l.bathrooms], [292, 3, 8, 7, 4, 4]);
    assert.deepStrictEqual([l.city, l.district, l.address], ['თბილისი', 'ვაკე', 'ი.აბაშიძის ქ.']);
    assert.deepStrictEqual(l.images, ['https://photos.place.ge/photos/111/800x600.webp']);
    assert.strictEqual(l.description, 'ბინა არის გამჭოლი.');
  },

  'a page without listing data is rejected': () => {
    assert.strictEqual(parseListing('myhome.ge', '<html><body>შესვლა</body></html>'), null);
    assert.strictEqual(parseListing('ss.ge', next({ pageProps: {} })), null);
  },

  'debrand removes contacts, links and cadastral codes but keeps the description': () => {
    const out = debrand('ნათელი ბინა ვაკეში. დამირეკეთ +995 599 12 34 56. ახალი რემონტი! სააგენტო Best Home. info@best.ge. ს/კ 01.10.14.009.011. ეზო მწვანეა.');
    assert.strictEqual(out, 'ნათელი ბინა ვაკეში. ახალი რემონტი! ეზო მწვანეა.');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log('✓', name); } catch (err) { failed++; console.log('✗', name, '\n   ', err.message.split('\n')[0]); }
}
console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
