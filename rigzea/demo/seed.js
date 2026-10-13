// Rigzea public demo: realistic sample portfolio for a Tbilisi agency that rents out and sells.
// Dates are relative to the moment the demo is seeded (see demo/mock.js).
(function () {
  'use strict';
  window.__RIGZEA_DEMO_SEED = function () {
    const H = 3600e3, D = 24 * H;
    const now = new Date();
    const at = (ms) => new Date(Date.now() + ms).toISOString();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day = (offset) => iso(new Date(Date.now() + offset * D));
    const todayAt = (h, m = 0, plusDays = 0) => { const d = new Date(); d.setDate(d.getDate() + plusDays); d.setHours(h, m, 0, 0); return d.toISOString(); };
    // Dates kept inside the current month so the commissions tab always has data.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
    const thisMonthPast = (n) => new Date(Math.max(monthStart, Date.now() - n * D)).toISOString();
    const thisMonthAhead = (n) => iso(new Date(Math.min(monthEnd, Math.max(monthStart, Date.now() + n * D))));
    const lastMonth = (n) => new Date(monthStart - n * D).toISOString();

    const img = (id, w) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
    const PH = {
      living: '1502672260266-1c1ef2d93688', lounge: '1522708323590-d24dbb6b0267', interior: '1560448204-e02f11c3d0e2',
      kitchen: '1484154218962-a197022b5858', room: '1600607687939-ce8a6c25118c', facade: '1545324418-cc1a3fa10c00',
      villa: '1600585154340-be6161a56a0c', house: '1512917774080-9991f1c4c750',
    };
    const photos = (...keys) => keys.map((k, i) => ({ url: img(PH[k], 1400), thumb: img(PH[k], 480), order: i }));

    const ORG = '5a1e0000-0000-4000-8000-000000000001';
    const U = { nino: 'a1e00000-0000-4000-8000-000000000001', ana: 'a1e00000-0000-4000-8000-000000000002', giorgi: 'a1e00000-0000-4000-8000-000000000003', levan: 'a1e00000-0000-4000-8000-000000000004' };
    const M = { nino: 'b1e00000-0000-4000-8000-000000000001', ana: 'b1e00000-0000-4000-8000-000000000002', giorgi: 'b1e00000-0000-4000-8000-000000000003', levan: 'b1e00000-0000-4000-8000-000000000004' };
    const O = (n) => 'c1e00000-0000-4000-8000-00000000000' + n;
    const C = (n) => 'c2e00000-0000-4000-8000-00000000000' + n; // clients: renters and buyers
    const SD = (n) => 'e2e00000-0000-4000-8000-00000000000' + n; // sale deals
    const A = (n) => 'd1e00000-0000-4000-8000-0000000000' + String(n).padStart(2, '0');
    const DL = (n) => 'e1e00000-0000-4000-8000-00000000000' + n;
    const TK = (n) => 'f1e00000-0000-4000-8000-00000000000' + n;
    const base = { organization_id: ORG };
    const phone = '+995 555 12 34 56';

    const apartments = [
      { id: A(1), name: 'ვაკე · ჭავჭავაძის გამზ., 3-ოთახიანი', slug: 'vake-chavchavadze-3-otakhiani', city: 'თბილისი', district: 'ვაკე', address: 'ილია ჭავჭავაძის გამზ. 37', unit_number: '24',
        owner_id: O(1), status: 'active', monthly_rent: 1200, currency: 'USD', rooms: 3, bedrooms: 2, area_sqm: 95, floor: '7', total_floors: 12, pets_allowed: false,
        utilities_estimate: 120, prepayment_terms: 'პირველი და ბოლო თვე წინასწარ', deposit_amount: 1200, badge: 'hot', lat: 41.7093, lng: 44.7656,
        amenities: ['wifi', 'ac', 'heating', 'balcony', 'dishwasher', 'washing_machine', 'elevator', 'parking', 'tv'],
        description: 'მზიანი 3-ოთახიანი ბინა ვაკის პარკთან ახლოს. ახალი რემონტი, სრულად აღჭურვილი სამზარეულო და დიდი აივანი ქალაქის ხედით. შენობაში არის ლიფტი და მიწისქვეშა პარკინგი.',
        description_en: 'Sunny 3-room apartment near Vake Park. Newly renovated, with a fully equipped kitchen and a large balcony with city views. Elevator and underground parking in the building.',
        photos: photos('living', 'kitchen', 'room', 'interior', 'lounge') },
      { id: A(2), name: 'საბურთალო · ვაჟა-ფშაველას გამზ., 2-ოთახიანი', slug: 'saburtalo-vazha-2-otakhiani', city: 'თბილისი', district: 'საბურთალო', address: 'ვაჟა-ფშაველას გამზ. 45', unit_number: '61',
        owner_id: O(2), status: 'active', monthly_rent: 1650, currency: 'GEL', rooms: 2, bedrooms: 1, area_sqm: 62, floor: '9', total_floors: 16, pets_allowed: true,
        utilities_estimate: 90, prepayment_terms: 'ერთი თვე წინასწარ + დეპოზიტი', deposit_amount: 1650, badge: 'new', lat: 41.7266, lng: 44.7480,
        amenities: ['wifi', 'ac', 'heating', 'washing_machine', 'elevator', 'tv', 'oven'],
        description: 'ნათელი 2-ოთახიანი ბინა მეტრო „დელისიდან“ 5 წუთის სავალზე. ახალი ავეჯი და ტექნიკა. შინაური ცხოველი დასაშვებია.',
        description_en: 'Bright 2-room apartment a 5-minute walk from Delisi metro station. New furniture and appliances. Pets are welcome.',
        photos: photos('lounge', 'interior', 'kitchen', 'room') },
      { id: A(3), name: 'კრწანისი · პენტჰაუსი პანორამული ხედით', slug: 'krtsanisi-penthouse', city: 'თბილისი', district: 'კრწანისი', address: 'კრწანისის ქ. 12', unit_number: 'PH-2',
        owner_id: O(3), status: 'active', monthly_rent: 2800, currency: 'USD', rooms: 5, bedrooms: 3, area_sqm: 210, floor: '6', total_floors: 6, pets_allowed: true,
        utilities_estimate: 300, prepayment_terms: 'ორი თვე წინასწარ', deposit_amount: 2800, badge: 'exclusive', lat: 41.6720, lng: 44.8150, owner_bonus: 200,
        amenities: ['wifi', 'ac', 'heating', 'balcony', 'dishwasher', 'washing_machine', 'parking', 'security', 'tv', 'oven'],
        description: 'ექსკლუზიური პენტჰაუსი კრწანისის რეზიდენციაში: პანორამული ტერასა, საერთო აუზი და სპორტული დარბაზი, 24-საათიანი დაცვა.',
        description_en: 'Exclusive penthouse in a Krtsanisi residence: panoramic terrace, shared pool and gym, 24/7 security.',
        photos: photos('villa', 'house', 'living', 'kitchen', 'room') },
      { id: A(4), name: 'ვერა · ბარნოვის ქ., 4-ოთახიანი', slug: 'vera-barnovi-4-otakhiani', city: 'თბილისი', district: 'ვერა', address: 'ბარნოვის ქ. 18', unit_number: '5',
        owner_id: O(4), status: 'active', monthly_rent: 1450, currency: 'USD', rooms: 4, bedrooms: 3, area_sqm: 120, floor: '2', total_floors: 4, pets_allowed: false,
        utilities_estimate: 150, prepayment_terms: 'პირველი და ბოლო თვე წინასწარ', deposit_amount: 1450, badge: 'price_drop', lat: 41.7050, lng: 44.7790,
        amenities: ['wifi', 'heating', 'balcony', 'washing_machine', 'oven', 'tv'],
        description: '4-ოთახიანი ბინა ისტორიულ შენობაში — მაღალი ჭერი, ხის იატაკი და ორი აივანი. ფასი შემცირებულია.',
        description_en: '4-room apartment in a historic building with high ceilings, wooden floors and two balconies. Price reduced.',
        photos: photos('interior', 'living', 'room', 'kitchen') },
      { id: A(5), name: 'მთაწმინდა · ლერმონტოვის ქ., 2-ოთახიანი', slug: 'mtatsminda-lermontovi', city: 'თბილისი', district: 'მთაწმინდა', address: 'ლერმონტოვის ქ. 9', unit_number: '3',
        owner_id: O(5), status: 'active', monthly_rent: 950, currency: 'USD', rooms: 2, bedrooms: 1, area_sqm: 70, floor: '3', total_floors: 5, pets_allowed: true,
        utilities_estimate: 80, prepayment_terms: 'ერთი თვე წინასწარ', deposit_amount: 950, badge: 'available', lat: 41.6930, lng: 44.7960,
        amenities: ['wifi', 'ac', 'heating', 'balcony', 'washing_machine', 'microwave'],
        description: 'მყუდრო 2-ოთახიანი ბინა ლერმონტოვის ქუჩაზე, ქალაქის ხედით. ძველ თბილისამდე ფეხით 10 წუთია.',
        description_en: 'Cosy 2-room apartment on Lermontov Street with city views, a 10-minute walk from Old Tbilisi.',
        photos: photos('room', 'lounge', 'kitchen') },
      { id: A(6), name: 'დიდუბე · წერეთლის გამზ., 2-ოთახიანი', slug: 'didube-tsereteli', city: 'თბილისი', district: 'დიდუბე', address: 'აკაკი წერეთლის გამზ. 116', unit_number: '42',
        owner_id: O(2), status: 'active', monthly_rent: 1300, currency: 'GEL', rooms: 2, bedrooms: 1, area_sqm: 55, floor: '11', total_floors: 14, pets_allowed: false,
        utilities_estimate: 70, prepayment_terms: 'ერთი თვე წინასწარ', deposit_amount: 1300, badge: null, lat: 41.7420, lng: 44.7800,
        amenities: ['wifi', 'heating', 'elevator', 'washing_machine'],
        description: 'კომფორტული ბინა წერეთლის გამზირზე, მეტროსთან ახლოს. იდეალურია ერთი ადამიანისთვის ან წყვილისთვის.',
        description_en: 'Comfortable apartment on Tsereteli Avenue close to the metro. Ideal for one person or a couple.',
        photos: photos('kitchen', 'interior', 'lounge') },
      { id: A(7), name: 'ბათუმი · ახალი ბულვარი, ზღვის ხედით', slug: 'batumi-new-boulevard', city: 'ბათუმი', district: 'ახალი ბულვარი', address: 'შერიფ ხიმშიაშვილის ქ. 21', unit_number: '1907',
        owner_id: O(6), status: 'active', monthly_rent: 900, currency: 'USD', rooms: 2, bedrooms: 1, area_sqm: 58, floor: '19', total_floors: 32, pets_allowed: false,
        utilities_estimate: 100, prepayment_terms: 'ერთი თვე წინასწარ', deposit_amount: 900, badge: 'new', lat: 41.6420, lng: 41.6150,
        amenities: ['wifi', 'ac', 'balcony', 'elevator', 'security', 'tv'],
        description: 'ბინა ახალ ბულვართან, ზღვის ხედით. შენობაში არის აუზი და დაცვა.',
        description_en: 'Apartment by the New Boulevard with sea views. The building has a pool and security.',
        photos: photos('lounge', 'room', 'kitchen', 'facade') },
      // Leased apartments: renewals within 3 / 14 / 30 days
      { id: A(8), name: 'ვაკე · აბაშიძის ქ. 14', slug: 'vake-abashidze-14', city: 'თბილისი', district: 'ვაკე', address: 'ირაკლი აბაშიძის ქ. 14', unit_number: '8',
        owner_id: O(1), status: 'active', rental_type: 'long_term', monthly_rent: 2100, currency: 'GEL', rooms: 3, bedrooms: 2, area_sqm: 88, floor: '4', total_floors: 9,
        tenant_name: 'გიორგი წიკლაური', tenant_phone: '+995 599 21 43 65', rent_due_day: 5, deposit_amount: 2100, lease_end: day(3), lat: 41.7085, lng: 44.7605,
        amenities: ['wifi', 'heating', 'balcony', 'parking'], photos: photos('living', 'room') },
      { id: A(9), name: 'საბურთალო · ნუცუბიძის ქ. 2', slug: 'saburtalo-nutsubidze-2', city: 'თბილისი', district: 'საბურთალო', address: 'შალვა ნუცუბიძის ქ. 2', unit_number: '33',
        owner_id: O(5), status: 'active', rental_type: 'long_term', monthly_rent: 1500, currency: 'GEL', rooms: 2, bedrooms: 1, area_sqm: 64, floor: '6', total_floors: 12,
        tenant_name: 'Anna Kowalczyk', tenant_phone: '+48 600 123 456', rent_due_day: 10, deposit_amount: 1500, lease_end: day(14), lat: 41.7240, lng: 44.7330,
        amenities: ['wifi', 'ac', 'heating'], photos: photos('interior') },
      { id: A(10), name: 'დიღომი · მირიან მეფის ქ. 7', slug: 'dighomi-mirian-mepe-7', city: 'თბილისი', district: 'დიღომი', address: 'მირიან მეფის ქ. 7', unit_number: '12',
        owner_id: O(3), status: 'active', rental_type: 'long_term', monthly_rent: 1200, currency: 'GEL', rooms: 2, bedrooms: 1, area_sqm: 57, floor: '3', total_floors: 10,
        tenant_name: 'დავით სამხარაძე', tenant_phone: '+995 577 65 43 21', rent_due_day: 1, deposit_amount: 1200, lease_end: day(30), lat: 41.7700, lng: 44.7640,
        amenities: ['wifi', 'heating', 'elevator'], photos: photos('kitchen') },
      // For sale
      { id: A(11), name: 'ვაკე · ფალიაშვილის ქ., 3-ოთახიანი (იყიდება)', slug: 'vake-paliashvili-sale', city: 'თბილისი', district: 'ვაკე', address: 'ზაქარია ფალიაშვილის ქ. 52', unit_number: '17',
        owner_id: O(7), cadastral_code: '01.14.03.021.015', transaction_type: 'sale', property_type: 'apartment', status: 'active', sale_price: 245000, price_sqm: 2333, currency: 'USD', rooms: 3, bedrooms: 2, bathrooms: 2, area_sqm: 105, floor: '5', total_floors: 10,
        badge: 'new', lat: 41.7068, lng: 44.7712, amenities: ['heating', 'balcony', 'elevator', 'parking'],
        description: '3-ოთახიანი ბინა ვაკეში, ახალ კორპუსში. მწვანე ჩარჩო, ორი სველი წერტილი, მიწისქვეშა პარკინგი.',
        description_en: '3-room apartment in a new building in Vake. Two bathrooms and underground parking.',
        photos: photos('living', 'kitchen', 'room') },
      { id: A(12), name: 'საბურთალო · ყაზბეგის გამზ., 2-ოთახიანი (იყიდება)', slug: 'saburtalo-kazbegi-sale', city: 'თბილისი', district: 'საბურთალო', address: 'ალექსანდრე ყაზბეგის გამზ. 24', unit_number: '88',
        owner_id: O(8), cadastral_code: '01.10.14.009.011', transaction_type: 'sale', property_type: 'apartment', status: 'reserved', sale_price: 128000, price_sqm: 1969, currency: 'USD', rooms: 2, bedrooms: 1, bathrooms: 1, area_sqm: 65, floor: '12', total_floors: 18,
        badge: 'hot', lat: 41.7255, lng: 44.7560, amenities: ['heating', 'balcony', 'elevator'],
        description: 'გარემონტებული 2-ოთახიანი ბინა ყაზბეგის გამზირზე, მეტროსთან ახლოს. ავეჯით და ტექნიკით.',
        description_en: 'Renovated 2-room apartment on Kazbegi Avenue near the metro. Furnished.',
        photos: photos('lounge', 'interior', 'kitchen') },
      { id: A(13), name: 'წყნეთი · კერძო სახლი ეზოთი (იყიდება)', slug: 'tskneti-house-sale', city: 'თბილისი', district: 'წყნეთი', address: 'წყნეთის გზატკეცილი 31', unit_number: '',
        owner_id: O(7), cadastral_code: '01.20.01.044.007', transaction_type: 'sale', property_type: 'house', status: 'active', sale_price: 390000, price_sqm: 1773, currency: 'USD', rooms: 6, bedrooms: 4, bathrooms: 3, area_sqm: 220, floor: '2', total_floors: 2,
        badge: 'exclusive', lat: 41.6890, lng: 44.7010, amenities: ['heating', 'parking', 'security'],
        description: 'ორსართულიანი სახლი წყნეთში, 600 მ² ეზოთი და ხეხილის ბაღით. ქალაქის ცენტრამდე 20 წუთია.',
        description_en: 'Two-storey house in Tskneti with a 600 sqm garden, 20 minutes from the city centre.',
        photos: photos('villa', 'house', 'living') },
    ].map((a, i) => ({ ...base, transaction_type: 'long_term', property_type: 'apartment', commission_pct: 10, agent_commission_percent: 50, cobroker_split: 50, agent_name: 'ნინო ბერიძე', agent_phone: phone, is_archived: false, created_at: at(-(60 - i * 4) * D), ...a }));

    const deals = [
      { id: DL(1), apartment_id: A(1), client_name: 'ლუკა ჩიქოვანი', client_phone: '+995 591 11 22 33', stage: 'closed', deal_amount: 1200, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: null, cobroker_split: 0, created_by: U.nino, created_at: lastMonth(10), closed_at: thisMonthPast(4), target_move_in: thisMonthAhead(1) },
      { id: DL(2), apartment_id: A(3), client_name: 'Sarah Miller', client_phone: '+44 7700 900123', client_email: 'sarah.miller@example.com', stage: 'closed', deal_amount: 2800, currency: 'USD', commission_percent: 50, owner_bonus: 200, partner_agent: 'ლაშა გოგიბერიძე · Tbilisi Prime', partner_phone: '+995 595 44 55 66', cobroker_split: 50, created_by: U.ana, created_at: lastMonth(6), closed_at: thisMonthPast(9), target_move_in: thisMonthAhead(3) },
      { id: DL(3), apartment_id: A(2), client_name: 'თამარ კვარაცხელია', client_phone: '+995 568 77 88 99', stage: 'closed', deal_amount: 1650, currency: 'GEL', commission_percent: 50, owner_bonus: 0, partner_agent: null, cobroker_split: 0, created_by: U.giorgi, created_at: lastMonth(20), closed_at: lastMonth(4), target_move_in: iso(new Date(lastMonth(2))) },
      { id: DL(4), apartment_id: A(4), client_name: 'ნიკა ბერიძე', client_phone: '+995 599 30 40 50', stage: 'deposit', deal_amount: 1450, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: null, cobroker_split: 0, created_by: U.nino, created_at: thisMonthPast(7), deposit_paid_at: thisMonthPast(1), target_move_in: thisMonthAhead(6) },
      { id: DL(5), apartment_id: A(5), client_name: 'Daniel Kowalski', client_phone: '+49 151 2345 6789', stage: 'viewing', deal_amount: 950, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: 'მარიამ ჯავახიშვილი · City Homes', partner_phone: '+995 593 12 12 12', cobroker_split: 50, created_by: U.ana, created_at: thisMonthPast(5), target_move_in: thisMonthAhead(10) },
      { id: DL(6), apartment_id: null, client_name: 'ელენე ხარაიშვილი', client_phone: '+995 555 98 76 54', stage: 'active', deal_amount: 1300, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: null, cobroker_split: 0, created_by: U.giorgi, created_at: thisMonthPast(2), target_move_in: thisMonthAhead(14),
        notes: 'ეძებს ბინას ვაკეში ან მთაწმინდაზე, ბიუჯეტი $1 300-მდე. ჰყავს პატარა ძაღლი.',
        criteria: { city: 'თბილისი', district: 'ვაკე', budget_max: 1300, currency: 'USD', bedrooms: 1, pets: true } },
      { id: DL(7), apartment_id: A(6), client_name: 'ირაკლი მესხი', client_phone: '+995 571 23 45 67', stage: 'active', deal_amount: 1300, currency: 'GEL', commission_percent: 50, owner_bonus: 0, partner_agent: null, cobroker_split: 0, created_by: U.nino, created_at: thisMonthPast(1), target_move_in: thisMonthAhead(12) },
      { id: DL(8), apartment_id: A(7), client_name: 'Ahmet Yılmaz', client_phone: '+90 532 123 45 67', stage: 'viewing', deal_amount: 900, currency: 'USD', commission_percent: 50, owner_bonus: 0, partner_agent: 'ბექა დიასამიძე · Batumi Estate', cobroker_split: 50, created_by: U.giorgi, created_at: thisMonthPast(3), target_move_in: thisMonthAhead(8) },
      // Sales
      { id: SD(5), deal_type: 'sale', contact_type: 'buyer', apartment_id: null, client_name: 'თორნიკე ლაშხი', client_phone: '+995 599 08 09 10', stage: 'closed', deal_amount: 172000, currency: 'USD', commission_percent: 3, owner_bonus: 0, partner_agent: null, cobroker_split: 0, lead_source: 'referral', created_by: U.ana, created_at: lastMonth(15), closed_at: thisMonthPast(6), target_move_in: thisMonthAhead(2), listing_agent_id: M.giorgi, selling_agent_id: M.ana, listing_split: 25, selling_split: 25, listing_paid: true, selling_paid: false },
      { id: SD(1), deal_type: 'sale', contact_type: 'buyer', apartment_id: A(11), client_name: 'ნინო ასათიანი', client_phone: '+995 599 71 82 93', stage: 'negotiation', deal_amount: 240000, currency: 'USD', commission_percent: 3, owner_bonus: 0, partner_agent: null, cobroker_split: 0, lead_source: 'myhome', created_by: U.nino, created_at: thisMonthPast(8), target_move_in: thisMonthAhead(15) },
      { id: SD(2), deal_type: 'sale', contact_type: 'buyer', apartment_id: A(12), client_name: 'Michael Brandt', client_phone: '+49 170 555 0142', client_email: 'm.brandt@example.com', stage: 'deposit', deal_amount: 126000, currency: 'USD', commission_percent: 3, owner_bonus: 0, partner_agent: 'ლაშა გოგიბერიძე · Tbilisi Prime', partner_phone: '+995 595 44 55 66', cobroker_split: 50, lead_source: 'referral', created_by: U.ana, created_at: thisMonthPast(12), deposit_paid_at: thisMonthPast(2), target_move_in: thisMonthAhead(9) },
      { id: SD(3), deal_type: 'sale', contact_type: 'buyer', apartment_id: A(13), client_name: 'გიგა ფხაკაძე', client_phone: '+995 577 36 47 58', stage: 'viewing', deal_amount: 390000, currency: 'USD', commission_percent: 3, owner_bonus: 0, partner_agent: null, cobroker_split: 0, lead_source: 'instagram', created_by: U.giorgi, created_at: thisMonthPast(3), target_move_in: thisMonthAhead(20) },
      { id: SD(4), deal_type: 'sale', contact_type: 'buyer', apartment_id: null, client_name: 'სალომე ჯიქია', client_phone: '+995 593 15 26 37', stage: 'enquiry', deal_amount: 150000, currency: 'USD', commission_percent: 3, owner_bonus: 0, partner_agent: null, cobroker_split: 0, lead_source: 'facebook', created_by: U.nino, created_at: thisMonthPast(1), target_move_in: thisMonthAhead(25),
        notes: 'ეძებს 2-ოთახიან ბინას საბურთალოზე ან დიდ დიღომში, ბიუჯეტი $150 000-მდე.' },
    ].map(d => {
      const gross = d.deal_amount * d.commission_percent / 100 + Number(d.owner_bonus || 0);
      const partner = d.partner_agent ? gross * d.cobroker_split / 100 : 0;
      return { ...base, deal_type: 'rental', contact_type: 'renter', listing_agent_id: null, selling_agent_id: null, listing_split: 25, selling_split: 25, listing_paid: false, selling_paid: false, criteria: {}, commission_amount: d.deal_amount * d.commission_percent / 100, net_commission: gross - partner, updated_at: d.closed_at || d.created_at, ...d };
    });

    const tasks = [
      { id: TK(1), apartment_id: A(4), title: 'ფოტოსესია განცხადებისთვის', type: 'other', priority: 'normal', status: 'assigned', assigned_to: M.levan, scheduled_start: todayAt(14), due_date: todayAt(15), checklist: [{ label: 'მისაღები ოთახი და სამზარეულო', done: false }, { label: 'აივნის ხედი', done: false }] },
      { id: TK(2), apartment_id: A(4), title: 'ნახვა: ნიკა ბერიძე', type: 'inspection', priority: 'normal', status: 'assigned', assigned_to: M.nino, due_date: todayAt(18) },
      { id: TK(3), apartment_id: A(8), title: 'კონდიციონერი არ მუშაობს', description: 'მდგმურმა დარეკა: საძინებლის კონდიციონერი არ რთავს.', type: 'repair', priority: 'urgent', status: 'new', assigned_to: null, due_date: at(5 * H) },
      { id: TK(4), apartment_id: A(3), title: 'გასაღების გადაცემა: Sarah Miller', type: 'other', priority: 'normal', status: 'assigned', assigned_to: M.ana, due_date: todayAt(11, 0, 1) },
      { id: TK(5), apartment_id: A(9), title: 'ონკანის გამოცვლა', type: 'repair', priority: 'normal', status: 'blocked', blocked_reason: 'მფლობელის თანხმობას ველოდებით', assigned_to: M.levan, due_date: at(2 * D) },
      { id: TK(6), apartment_id: A(1), title: 'დასუფთავება ჩაბარებამდე', type: 'cleaning', priority: 'normal', status: 'in_progress', assigned_to: M.levan, due_date: at(-5 * H), started_at: at(-7 * H) },
      { id: TK(7), apartment_id: A(10), title: 'მრიცხველების ჩვენების ჩაწერა', type: 'inspection', priority: 'low', status: 'done', assigned_to: M.giorgi, due_date: at(-2 * D), completed_at: at(-2 * D) },
    ].map(t => ({ ...base, checklist: [], photos: [], created_at: at(-1 * D), ...t }));

    const linkEvents = [];
    const counts = { [A(1)]: [86, 12, 5], [A(2)]: [63, 9, 2], [A(3)]: [41, 6, 3], [A(4)]: [28, 3, 1], [A(5)]: [52, 7, 2], [A(6)]: [19, 2, 0], [A(7)]: [34, 5, 1] };
    let evId = 1;
    Object.entries(counts).forEach(([aptId, [v, wa, calls]], k) => {
      const visitors = Math.round(v * 0.68);
      const push = (kind, i, n) => {
        // Spread over ~3 weeks, denser recently; the newest view is minutes old.
        const ageH = i === 0 ? 0.3 + k * 0.7 : Math.pow(i / n, 1.6) * 21 * 24 + (i % 5);
        linkEvents.push({ id: evId++, organization_id: ORG, apartment_id: aptId, selection_id: null, kind, visitor: 'v' + k + '-' + (i % Math.max(1, kind === 'view' ? visitors : n)), created_at: at(-ageH * H) });
      };
      for (let i = 0; i < v; i++) push('view', i, v);
      for (let i = 0; i < wa; i++) push('whatsapp', i + 1, wa + 1);
      for (let i = 0; i < calls; i++) push('call', i + 1, calls + 1);
    });

    return {
      users: [{ id: U.nino, email: 'demo@rigzea.com', password: '', name: 'ნინო ბერიძე' }],
      tables: {
        organizations: [{ id: ORG, name: 'Mzeo Realty', city: 'თბილისი', contact_phone: phone, contact_email: 'hello@example.ge', plan: 'trial', trial_ends_at: at(11 * D + 2 * H), plan_expires_at: null, fx_rate: 2.7, agent_display_name: 'Mzeo Realty · ნინო ბერიძე', brand_color: null, logo_url: null, created_at: at(-3 * D) }],
        organization_members: [
          { id: M.nino, ...base, user_id: U.nino, role: 'owner', display_name: 'ნინო ბერიძე', phone, created_at: at(-3 * D) },
          { id: M.ana, ...base, user_id: U.ana, role: 'manager', display_name: 'ანა ლომიძე', phone: '+995 599 45 67 89', created_at: at(-3 * D) },
          { id: M.giorgi, ...base, user_id: U.giorgi, role: 'manager', display_name: 'გიორგი მაისურაძე', phone: '+995 598 76 54 32', created_at: at(-2 * D) },
          { id: M.levan, ...base, user_id: U.levan, role: 'staff', display_name: 'ლევან ხუციშვილი', phone: '+995 551 33 22 11', created_at: at(-2 * D) },
        ],
        owners: [
          { id: O(1), ...base, name: 'ზურაბ ქავთარაძე', phone: '+995 577 10 20 30', email: 'zurab@example.ge', payout_account: 'GE29TB0000000000000001', created_at: at(-50 * D) },
          { id: O(2), ...base, name: 'მანანა ლორთქიფანიძე', phone: '+995 599 40 50 60', email: null, created_at: at(-45 * D) },
          { id: O(3), ...base, name: 'ლევან გაბუნია', phone: '+995 595 70 80 90', email: 'levan.g@example.ge', created_at: at(-40 * D) },
          { id: O(4), ...base, name: 'ქეთევან ჯაფარიძე', phone: '+995 568 12 34 56', email: null, created_at: at(-35 * D) },
          { id: O(5), ...base, name: 'ნათია ბაქრაძე', phone: '+995 571 65 43 21', email: 'natia@example.ge', created_at: at(-30 * D) },
          { id: O(6), ...base, name: 'დავით ცქიტიშვილი', phone: '+995 555 24 68 10', email: null, created_at: at(-20 * D) },
          // Sellers
          { id: O(7), ...base, contact_type: 'seller', personal_id: '01008012345', name: 'ვახტანგ ერისთავი', phone: '+995 599 62 73 84', email: 'vakho@example.ge', lead_source: 'referral', created_at: at(-18 * D) },
          { id: O(8), ...base, contact_type: 'seller', name: 'ეკა ნიჟარაძე', phone: '+995 571 48 59 60', email: null, lead_source: 'myhome', created_at: at(-12 * D) },
          // Renters
          { id: C(1), ...base, contact_type: 'renter', name: 'ელენე ხარაიშვილი', phone: '+995 555 98 76 54', email: null, budget_max: 1300, budget_currency: 'USD', preferred_city: 'თბილისი', preferred_district: 'ვაკე', requirements: '1 საძინებელი, შინაური ცხოველი დასაშვები', lead_source: 'instagram', created_at: at(-2 * D) },
          { id: C(2), ...base, contact_type: 'renter', name: 'ირაკლი მესხი', phone: '+995 571 23 45 67', email: null, budget_max: 1400, budget_currency: 'GEL', preferred_city: 'თბილისი', preferred_district: 'დიდუბე', requirements: 'მეტროსთან ახლოს', lead_source: 'ss_ge', created_at: at(-1 * D) },
          { id: C(3), ...base, contact_type: 'renter', name: 'Daniel Kowalski', phone: '+49 151 2345 6789', email: 'daniel.k@example.com', budget_max: 1000, budget_currency: 'USD', preferred_city: 'თბილისი', preferred_district: 'მთაწმინდა', requirements: 'ავეჯით, სწრაფი ინტერნეტი', lead_source: 'referral', created_at: at(-5 * D) },
          { id: C(7), ...base, contact_type: 'renter', name: 'ზაზა ქობალია', phone: '+995 598 40 41 42', email: null, budget_max: 900, budget_currency: 'USD', preferred_city: 'თბილისი', lead_source: 'facebook', is_flagged: true, flag_note: 'ჩვენების შემდეგ სცადა მეპატრონესთან პირდაპირ დაკავშირება.', flagged_at: at(-6 * D), flagged_by_name: 'ანა ლომიძე', created_at: at(-9 * D) },
          // Buyers
          { id: C(4), ...base, contact_type: 'buyer', personal_id: '01024067890', name: 'ნინო ასათიანი', phone: '+995 599 71 82 93', email: 'nino.a@example.ge', budget_min: 200000, budget_max: 250000, budget_currency: 'USD', preferred_city: 'თბილისი', preferred_district: 'ვაკე', requirements: '3 ოთახი, პარკინგი', lead_source: 'myhome', created_at: at(-8 * D) },
          { id: C(5), ...base, contact_type: 'buyer', name: 'Michael Brandt', phone: '+49 170 555 0142', email: 'm.brandt@example.com', budget_max: 130000, budget_currency: 'USD', preferred_city: 'თბილისი', preferred_district: 'საბურთალო', requirements: 'საინვესტიციო, გასაქირავებლად', lead_source: 'referral', created_at: at(-12 * D) },
          { id: C(6), ...base, contact_type: 'buyer', name: 'სალომე ჯიქია', phone: '+995 593 15 26 37', email: null, budget_max: 150000, budget_currency: 'USD', preferred_city: 'თბილისი', preferred_district: 'საბურთალო', requirements: '2 ოთახი, ახალი რემონტი', lead_source: 'facebook', created_at: at(-1 * D) },
        ].map(o => ({ contact_type: 'owner', ...o })),
        apartments,
        deals,
        tasks,
        selections: [
          { id: '71e00000-0000-4000-8000-000000000001', ...base, slug: 'elene7vake2k', client_name: 'ელენე', apartment_ids: [A(1), A(5), A(6)], criteria: deals[5].criteria, deal_id: DL(6), created_by: U.giorgi, is_active: true, created_at: at(-1 * D) },
        ],
        link_events: linkEvents,
        approvals: [
          { id: '81e00000-0000-4000-8000-000000000001', ...base, apartment_id: A(9), owner_id: O(5), task_id: TK(5), title: 'ონკანის გამოცვლა', description: 'სამზარეულოს ონკანი ჟონავს, საჭიროა ახლით შეცვლა.', amount: 180, status: 'pending', token: 'demo-onkani-180', photos: [], created_at: at(-20 * H) },
          { id: '81e00000-0000-4000-8000-000000000002', ...base, apartment_id: A(1), owner_id: O(1), title: 'ახალი ფარდები მისაღებში', description: 'ფარდების შეცვლა ჩაბარებამდე.', amount: 240, status: 'approved', token: 'demo-pardebi-240', responded_at: at(-3 * D), created_at: at(-4 * D) },
        ],
        expenses: [
          { id: '91e00000-0000-4000-8000-000000000001', ...base, apartment_id: A(9), approval_id: '81e00000-0000-4000-8000-000000000001', task_id: TK(5), category: 'repair', amount: 180, description: 'ონკანის გამოცვლა', status: 'proposed', expense_date: day(0), receipt_required: true, charge_to_owner: true, created_at: at(-20 * H) },
          { id: '91e00000-0000-4000-8000-000000000002', ...base, apartment_id: A(1), category: 'cleaning', amount: 120, description: 'გენერალური დასუფთავება', status: 'paid', expense_date: day(-3), receipt_url: null, receipt_required: true, charge_to_owner: true, created_at: at(-3 * D) },
          { id: '91e00000-0000-4000-8000-000000000003', ...base, apartment_id: A(1), approval_id: '81e00000-0000-4000-8000-000000000002', category: 'supplies', amount: 240, description: 'ახალი ფარდები მისაღებში', status: 'approved', expense_date: day(-2), receipt_required: true, charge_to_owner: true, created_at: at(-2 * D) },
        ],
        income: [
          { id: '61e00000-0000-4000-8000-000000000001', ...base, apartment_id: A(8), amount: 2100, source: 'ქირა', income_date: thisMonthAhead(-7), description: 'ყოველთვიური ქირა', created_at: at(-7 * D) },
          { id: '61e00000-0000-4000-8000-000000000002', ...base, apartment_id: A(9), amount: 1500, source: 'ქირა', income_date: thisMonthAhead(-2), description: 'ყოველთვიური ქირა', created_at: at(-2 * D) },
          { id: '61e00000-0000-4000-8000-000000000003', ...base, apartment_id: A(10), amount: 1200, source: 'ქირა', income_date: iso(monthStart), description: 'ყოველთვიური ქირა', created_at: monthStart.toISOString() },
        ],
        reservations: [],
        activity_events: [
          { id: '51e00000-0000-4000-8000-000000000001', ...base, apartment_id: A(4), actor_name: 'ნინო ბერიძე', event_type: 'deal_deposit', title: 'დეპოზიტი შეტანილია: ნიკა ბერიძე', created_at: at(-1 * D) },
          { id: '51e00000-0000-4000-8000-000000000002', ...base, apartment_id: A(9), actor_name: 'ნინო ბერიძე', event_type: 'approval_requested', title: 'თანხმობის მოთხოვნა: ონკანის გამოცვლა', created_at: at(-20 * H) },
          { id: '51e00000-0000-4000-8000-000000000003', ...base, apartment_id: A(1), actor_name: 'ლევან ხუციშვილი', event_type: 'task_in_progress', title: 'დაიწყო: დასუფთავება ჩაბარებამდე', created_at: at(-7 * H) },
          { id: '51e00000-0000-4000-8000-000000000004', ...base, apartment_id: A(3), actor_name: 'ანა ლომიძე', event_type: 'deal_closed', title: 'გარიგება დაიხურა: Sarah Miller', created_at: thisMonthPast(9) },
          { id: '51e00000-0000-4000-8000-000000000005', ...base, apartment_id: A(10), actor_name: 'გიორგი მაისურაძე', event_type: 'task_done', title: 'დასრულდა: მრიცხველების ჩვენების ჩაწერა', created_at: at(-2 * D) },
        ],
        notifications: [
          { id: '41e00000-0000-4000-8000-000000000001', ...base, user_id: U.nino, title: 'ხელშეკრულება 3 დღეში იწურება', message: 'ვაკე · აბაშიძის ქ. 14 · გიორგი წიკლაური', type: 'lease', link: '/app/#/today', is_read: false, created_at: at(-2 * H) },
          { id: '41e00000-0000-4000-8000-000000000002', ...base, user_id: U.nino, title: 'ვადაგადაცილებული: დასუფთავება ჩაბარებამდე', message: 'ვაკე · ჭავჭავაძის გამზ., 3-ოთახიანი', type: 'overdue', link: '/app/#/tasks', is_read: false, created_at: at(-4 * H) },
          { id: '41e00000-0000-4000-8000-000000000003', ...base, user_id: U.nino, title: 'ზურაბ ქავთარაძემ დაადასტურა ₾240', message: 'ახალი ფარდები მისაღებში', type: 'approval', link: '/app/#/owners', is_read: true, created_at: at(-3 * D) },
        ],
        monthly_reports: [], invitations: [], repairs: [], contracts: [],
      },
    };
  };
})();
