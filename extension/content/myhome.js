// MyHome.ge posting form filler. Mapped against the live form on 2026-10-16 (statements.myhome.ge): one page,
// every control has a <label for> (ids are random), property and deal types are radio tiles.
(() => {
  const F = window.RigzeaFill;
  const PROPERTY = { apartment: 'ბინა', house: 'კერძო სახლი', land: 'მიწის ნაკვეთი', commercial: 'კომერციული ფართი' };
  const DEAL = { sale: 'იყიდება', long_term: 'ქირავდება', daily: 'ქირავდება დღიურად' };

  function splitAddress(address) {
    const m = String(address || '').trim().match(/^(.*?)[\s,]+(\d+[\wა-ჰ/-]*)$/);
    return m ? { street: m[1].trim(), number: m[2] } : { street: String(address || '').trim(), number: '' };
  }
  const labelEl = (text) => {
    const lab = [...document.querySelectorAll('label[for]')].find(l => F.norm(l.textContent).replace(/\s*\*$/, '') === F.norm(text));
    return lab && document.getElementById(lab.htmlFor);
  };

  F.run('myhome', async (l) => {
    if (!(await F.waitFor(() => labelEl('ბინა'), 20000))) throw new Error('ფორმა ვერ გაიხსნა.');
    F.clickExact(PROPERTY[l.property_type] || PROPERTY.apartment);
    await F.sleep(400);
    F.clickExact(DEAL[l.transaction_type] || DEAL.long_term);
    await F.sleep(800);

    const { street, number } = splitAddress(l.address);
    await F.pickSelect(labelEl('ქუჩა')?.id, street);
    F.byLabel('ქუჩის ნომერი', number);
    F.byLabel('საკადასტრო კოდი', l.cadastral_code);

    F.clickExact(l.currency === 'GEL' ? '₾' : '$');
    F.byLabel('სრული ფასი', l.price);
    F.byLabel('ფართი', l.area_sqm);
    F.byLabel('სართული', l.floor);
    F.byLabel('სართულები სულ', l.total_floors);
    if (l.rooms) F.clickInGroup('ოთახები', l.rooms >= 10 ? '10+' : String(l.rooms));
    if (l.bedrooms) F.clickInGroup('საძინებელი', String(l.bedrooms));
    if (l.bathrooms) F.clickInGroup('სველი წერტილი', l.bathrooms >= 3 ? '3+' : String(l.bathrooms));

    const desc = document.querySelector('textarea[placeholder="დაწერეთ დამატებითი აღწერა"]');
    if (desc && l.description) F.setValue(desc, l.description);

    await F.attachPhotos(l.photos);
    await F.sleep(2500);

    const missing = [['ფასი', 'სრული ფასი'], ['ფართი', 'ფართი'], ['სართული', 'სართული'], ['სართულები სულ', 'სართულები სულ']]
      .filter(([, t]) => !labelEl(t)?.value).map(([n]) => n);
    if (!desc?.value) missing.push('აღწერა');
    if (missing.length) return { note: `ვერ შეივსო: ${missing.join(', ')}. შეავსე ხელით და დააჭირე „გამოქვეყნება“.` };
    if (F.needsHuman()) return { note: 'საჭიროა შესვლა ან კაპჩა. დაასრულე ხელით.' };
    // The form requires building status and condition, which Rigzea does not store, so the agent picks them
    // and presses publish. Auto-submit stays off until those fields exist on the apartment.
    return { note: 'შევსებულია. აირჩიე სტატუსი და მდგომარეობა, გადაამოწმე ფოტოები და დააჭირე „გამოქვეყნება“.' };
  });
})();
