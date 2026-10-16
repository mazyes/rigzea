// SS.ge posting form filler. Mapped against the live form on 2026-10-16: a single page with a tile wizard
// (property type, then deal type) followed by the form. Field names (totalArea, floor, ...) are stable;
// tiles are plain divs found by their exact Georgian text.
(() => {
  const F = window.RigzeaFill;
  const PROPERTY = { apartment: 'ბინა', house: 'კერძო სახლი', land: 'მიწის ნაკვეთი', commercial: 'კომერციული' };
  const DEAL = { sale: 'იყიდება', long_term: 'ქირავდება', daily: 'ქირავდება დღიურად' };

  // Splits "შერიფ ხიმშიაშვილის 7" into street and house number.
  function splitAddress(address) {
    const m = String(address || '').trim().match(/^(.*?)[\s,]+(\d+[\wა-ჰ/-]*)$/);
    return m ? { street: m[1].trim(), number: m[2] } : { street: String(address || '').trim(), number: '' };
  }

  F.run('ss', async (l) => {
    await F.waitFor(() => F.clickExact(PROPERTY[l.property_type] || PROPERTY.apartment), 20000);
    await F.sleep(500);
    if (!F.clickExact(DEAL[l.transaction_type] || DEAL.long_term)) throw new Error('გარიგების ტიპი ვერ მოიძებნა.');
    if (!(await F.waitFor(() => document.querySelector('input[name="totalArea"]'), 15000))) throw new Error('ფორმა ვერ გაიხსნა.');
    await F.sleep(500);

    const { street, number } = splitAddress(l.address);
    await F.pickSelect('react-select-3-input', street);
    F.byName('house-number', number);
    F.byName('cadastral-code-1', l.cadastral_code);
    F.byName('totalArea', l.area_sqm);
    F.byName('floor', l.floor);
    F.byName('floors', l.total_floors);
    if (l.rooms) F.clickExact(l.rooms > 8 ? '8+' : String(l.rooms));
    if (l.bathrooms) F.clickExact(l.bathrooms > 4 ? '5+' : String(l.bathrooms));

    const desc = document.querySelector('textarea');
    if (desc && l.description) F.setValue(desc, l.description);

    F.clickExact(l.currency === 'GEL' ? '₾' : '$');
    const price = document.querySelector('input[type="number"]');
    if (price && l.price) F.setValue(price, l.price);

    await F.attachPhotos(l.photos);
    await F.sleep(2000);

    const missing = [['ფართი', 'totalArea'], ['სართული', 'floor'], ['სართულიანობა', 'floors']]
      .filter(([, n]) => !document.querySelector(`input[name="${n}"]`)?.value).map(([t]) => t);
    if (!price?.value) missing.push('ფასი');
    if (!desc?.value) missing.push('აღწერა');
    if (missing.length) return { note: `ვერ შეივსო: ${missing.join(', ')}. შეავსე ხელით და დააჭირე „განთავსება“.` };
    if (F.needsHuman()) return { note: 'საჭიროა შესვლა ან კაპჩა. დაასრულე ხელით.' };
    // The form requires building status and condition, which Rigzea does not store, so the agent picks them
    // and presses publish. Auto-submit stays off until those fields exist on the apartment.
    return { note: 'შევსებულია. აირჩიე სტატუსი და მდგომარეობა, გადაამოწმე ფოტოები და დააჭირე „განთავსება“.' };
  });
})();
