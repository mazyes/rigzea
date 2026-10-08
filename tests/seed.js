// Realistic fixture data for UI tests, with dates relative to "now".
(function () {
  if (localStorage.getItem('rigzea_mockdb')) return;
  const H = 3600e3, D = 24 * H;
  const at = (ms) => new Date(Date.now() + ms).toISOString();
  const day = (offset) => { const d = new Date(Date.now() + offset * D); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const todayAt = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const ORG = '11111111-1111-4111-8111-111111111111';
  const MGR = 'aaaaaaaa-0000-4000-8000-000000000001', STAFF = 'aaaaaaaa-0000-4000-8000-000000000002';
  const mM = 'bbbbbbbb-0000-4000-8000-000000000001', mS = 'bbbbbbbb-0000-4000-8000-000000000002', mT = 'bbbbbbbb-0000-4000-8000-000000000003';
  const o1 = 'cccccccc-0000-4000-8000-000000000001', o2 = 'cccccccc-0000-4000-8000-000000000002';
  const a = (n) => 'dddddddd-0000-4000-8000-00000000000' + n;
  const tasks = [
    { id: 'eeeeeeee-0000-4000-8000-000000000001', apartment_id: a(1), title: 'დასუფთავება სტუმრების შემდეგ', type: 'cleaning', priority: 'normal', status: 'assigned', assigned_to: mS, due_date: todayAt(15), scheduled_start: todayAt(12), checklist: [{ label: 'თეთრეულის შეცვლა', done: false }, { label: 'სააბაზანოს დასუფთავება', done: false }, { label: 'სამზარეულოს დასუფთავება', done: false }], photos: [] },
    { id: 'eeeeeeee-0000-4000-8000-000000000002', apartment_id: a(2), title: 'კონდიციონერი არ აგრილებს', type: 'repair', priority: 'urgent', status: 'new', assigned_to: null, due_date: at(5 * H), checklist: [], photos: [] },
    { id: 'eeeeeeee-0000-4000-8000-000000000003', apartment_id: a(3), title: 'სარეცხი მანქანის შემოწმება', type: 'maintenance', priority: 'normal', status: 'in_progress', assigned_to: mT, due_date: at(-6 * H), started_at: at(-8 * H), checklist: [], photos: [] },
    { id: 'eeeeeeee-0000-4000-8000-000000000004', apartment_id: a(2), title: 'ონკანის გამოცვლა', type: 'repair', priority: 'normal', status: 'blocked', blocked_reason: 'მფლობელის თანხმობას ველოდებით', assigned_to: mT, due_date: at(2 * D), checklist: [], photos: [] },
    { id: 'eeeeeeee-0000-4000-8000-000000000005', apartment_id: a(4), title: 'ინსპექცია check-out-ის შემდეგ', type: 'inspection', priority: 'low', status: 'done', assigned_to: mM, due_date: at(-2 * D), completed_at: at(-2 * D), checklist: [], photos: [] },
  ].map(t => ({ organization_id: ORG, created_at: at(-1 * D), ...t }));
  window.__MOCK_SEED = {
    users: [
      { id: MGR, email: 'manager@rigzea.test', password: 'test1234', name: 'ნინო ბერიძე' },
      { id: STAFF, email: 'staff@rigzea.test', password: 'test1234', name: 'მარიამ კაპანაძე' },
    ],
    tables: {
      organizations: [{ id: ORG, name: 'Batumi Stay', city: 'ბათუმი', contact_phone: '+995 555 12 34 56', created_at: at(-60 * D) }],
      organization_members: [
        { id: mM, organization_id: ORG, user_id: MGR, role: 'owner', display_name: 'ნინო ბერიძე', created_at: at(-60 * D) },
        { id: mS, organization_id: ORG, user_id: STAFF, role: 'staff', display_name: 'მარიამ კაპანაძე', phone: '+995 599 11 22 33', created_at: at(-30 * D) },
        { id: mT, organization_id: ORG, user_id: 'aaaaaaaa-0000-4000-8000-000000000003', role: 'staff', display_name: 'გიორგი ტექნიკოსი', created_at: at(-30 * D) },
      ],
      owners: [
        { id: o1, organization_id: ORG, name: 'დავით მამულაშვილი', phone: '+995 577 00 11 22', email: 'davit@example.ge', created_at: at(-50 * D) },
        { id: o2, organization_id: ORG, name: 'თამარ გელაშვილი', phone: '+995 568 33 44 55', email: null, created_at: at(-40 * D) },
      ],
      apartments: [
        { id: a(1), organization_id: ORG, name: 'Orbi City · 1204', unit_number: '1204', address: 'შერიფ ხიმშიაშვილის 7', city: 'ბათუმი', owner_id: o1, status: 'active', door_code: '4821#', wifi_name: 'Orbi1204', wifi_password: 'sea-view-24', access_instructions: 'გასაღები რეცეფციაზე, სახელით.', commission_pct: 20, created_at: at(-50 * D) },
        { id: a(2), organization_id: ORG, name: 'Orbi City · 2210', unit_number: '2210', address: 'შერიფ ხიმშიაშვილის 7', city: 'ბათუმი', owner_id: o1, status: 'active', commission_pct: 20, created_at: at(-50 * D) },
        { id: a(3), organization_id: ORG, name: 'ვაკე · ჭავჭავაძე 33', unit_number: '14', address: 'ილია ჭავჭავაძის გამზ. 33', city: 'თბილისი', owner_id: o2, status: 'maintenance', commission_pct: 15, created_at: at(-40 * D) },
        { id: a(4), organization_id: ORG, name: 'ძველი ბათუმი · 5', unit_number: '5', address: 'გორგილაძის 12', city: 'ბათუმი', owner_id: o2, status: 'active', commission_pct: 20, created_at: at(-40 * D) },
        { id: a(5), organization_id: ORG, name: 'სანაპირო · 801', unit_number: '801', address: 'ზ. გამსახურდიას 30', city: 'ბათუმი', owner_id: null, status: 'vacant', commission_pct: 20, created_at: at(-10 * D) },
      ],
      tasks,
      approvals: [
        { id: 'ffffffff-0000-4000-8000-000000000001', organization_id: ORG, apartment_id: a(2), owner_id: o1, task_id: tasks[3].id, title: 'ონკანის გამოცვლა', description: 'ონკანის გამოცვლა\nსამზარეულოს ონკანი ჟონავს, საჭიროა ახლით შეცვლა.', amount: 180, status: 'pending', token: 'tok-pending-1', photos: [], created_at: at(-18 * H) },
        { id: 'ffffffff-0000-4000-8000-000000000002', organization_id: ORG, apartment_id: a(1), owner_id: o1, title: 'ახალი ფარდები', description: 'მისაღების ფარდების შეცვლა', amount: 240, status: 'approved', token: 'tok-approved-1', responded_at: at(-3 * D), created_at: at(-4 * D) },
      ],
      expenses: [
        { id: '99999999-0000-4000-8000-000000000001', organization_id: ORG, apartment_id: a(2), approval_id: 'ffffffff-0000-4000-8000-000000000001', task_id: tasks[3].id, category: 'repair', amount: 180, description: 'ონკანის გამოცვლა', status: 'proposed', expense_date: day(0), receipt_required: true, charge_to_owner: true, created_at: at(-18 * H) },
        { id: '99999999-0000-4000-8000-000000000002', organization_id: ORG, apartment_id: a(1), category: 'cleaning', amount: 80, description: 'გენერალური დასუფთავება', status: 'incurred', expense_date: day(-3), receipt_url: null, receipt_required: true, charge_to_owner: true, created_at: at(-3 * D) },
        { id: '99999999-0000-4000-8000-000000000003', organization_id: ORG, apartment_id: a(1), approval_id: 'ffffffff-0000-4000-8000-000000000002', category: 'supplies', amount: 240, description: 'ახალი ფარდები', status: 'approved', expense_date: day(-2), receipt_required: true, charge_to_owner: true, created_at: at(-2 * D) },
        { id: '99999999-0000-4000-8000-000000000004', organization_id: ORG, apartment_id: a(4), category: 'utility', amount: 65, description: 'კომუნალური · სექტემბერი', status: 'paid', expense_date: day(-5), receipt_url: 'https://example.com/r.pdf', receipt_required: true, charge_to_owner: true, created_at: at(-5 * D) },
      ],
      income: [
        { id: '88888888-0000-4000-8000-000000000001', organization_id: ORG, apartment_id: a(1), amount: 1450, source: 'Airbnb', income_date: day(-4), description: 'ჯავშანი · 4 ღამე', created_at: at(-4 * D) },
        { id: '88888888-0000-4000-8000-000000000002', organization_id: ORG, apartment_id: a(4), amount: 920, source: 'Booking', income_date: day(-1), description: 'ჯავშანი · 3 ღამე', created_at: at(-1 * D) },
      ],
      reservations: [
        { id: '77777777-0000-4000-8000-000000000001', organization_id: ORG, apartment_id: a(1), guest_name: 'Anna Schmidt', source: 'airbnb', check_in: day(-3), check_out: day(0), check_in_time: '14:00', check_out_time: '12:00', expected_income: 1100, status: 'confirmed' },
        { id: '77777777-0000-4000-8000-000000000002', organization_id: ORG, apartment_id: a(1), guest_name: 'Levan Kapanadze', source: 'booking', check_in: day(0), check_out: day(3), check_in_time: '16:00', check_out_time: '12:00', expected_income: 780, status: 'confirmed' },
        { id: '77777777-0000-4000-8000-000000000003', organization_id: ORG, apartment_id: a(4), guest_name: 'Ahmet Yilmaz', source: 'direct', check_in: day(1), check_out: day(4), check_in_time: '14:00', check_out_time: '11:00', expected_income: 600, status: 'confirmed' },
      ],
      activity_events: [
        { id: uuidish(1), organization_id: ORG, apartment_id: a(3), actor_name: 'გიორგი ტექნიკოსი', event_type: 'task_in_progress', title: 'დაიწყო: სარეცხი მანქანის შემოწმება', created_at: at(-8 * H) },
        { id: uuidish(2), organization_id: ORG, apartment_id: a(2), actor_name: 'ნინო ბერიძე', event_type: 'approval_requested', title: 'თანხმობის მოთხოვნა: ონკანის გამოცვლა', created_at: at(-18 * H) },
        { id: uuidish(3), organization_id: ORG, apartment_id: a(4), actor_name: 'ნინო ბერიძე', event_type: 'task_done', title: 'დასრულდა: ინსპექცია check-out-ის შემდეგ', created_at: at(-2 * D) },
      ],
      notifications: [
        { id: uuidish(4), organization_id: ORG, user_id: MGR, title: 'ვადაგადაცილებული: სარეცხი მანქანის შემოწმება', message: 'ვაკე · ჭავჭავაძე 33', type: 'overdue', link: '/app/?view=tasks', is_read: false, created_at: at(-1 * H) },
      ],
      monthly_reports: [], invitations: [], repairs: [],
    },
  };
  function uuidish(n) { return '66666666-0000-4000-8000-00000000000' + n; }
})();
