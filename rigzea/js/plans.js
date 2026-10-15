// Single source of truth for plan limits, features and copy.
//
// Loaded in the browser as a plain script (window.RIGZEA_PLANS, before /app/app.js) and imported
// by api/plan-email.js. Anything else that states a number or a feature must be updated with it:
//
//   - the database: plan_limit() and plan_has_feature() (supabase/patches/10_free_plan_limit.sql,
//     11_trial_to_free.sql, and supabase/schema.sql)
//   - the public pricing table in rigzea/index.html (static marketing HTML)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RIGZEA_PLANS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ALL_FEATURES = ['profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation', 'selections', 'analytics', 'export', 'whitelabel'];

  // apartments / seats: null = unlimited. A seat is an owner/admin/manager member; field staff are free.
  const PLANS = {
    trial:   { id: 'trial', name: 'საცდელი', price: 0, apartments: 50, seats: 3, features: ALL_FEATURES },
    starter: { id: 'starter', name: 'დამწყები', price: 0, apartments: 3, seats: 1, features: [],
      bullets: ['3 აქტიური ობიექტი', 'ჭკვიანი ბმულები', 'საკომისიოს კალკულატორი'] },
    pro:     { id: 'pro', name: 'პრო აგენტი', price: 39, apartments: 50, seats: 1, features: ['profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation'],
      bullets: ['50 აქტიური ობიექტი', 'შევსება განცხადების ბმულით', 'PDF პრეზენტაცია', 'ორენოვანი ხელშეკრულებები', 'ბინის შერჩევა კლიენტის მოთხოვნით', 'ვადის გასვლის შეხსენებები'] },
    top:     { id: 'top', name: 'გუნდი', price: 99, apartments: 150, seats: 3, features: ['profile', 'contracts', 'matchmaker', 'reminders', 'import', 'presentation', 'selections', 'analytics', 'export'],
      bullets: ['150 აქტიური ობიექტი', '3 სამუშაო ადგილი', 'მრავალობიექტიანი გვერდი', 'ანალიტიკა და ექსპორტი'] },
    agency:  { id: 'agency', name: 'სააგენტო', price: 249, apartments: null, seats: null, features: ALL_FEATURES,
      bullets: ['ულიმიტო ობიექტები', '10+ აგენტის სამუშაო ადგილი', 'White-label ბრენდირება', 'პრიორიტეტული მხარდაჭერა'] },
  };
  const PLAN_ORDER = ['starter', 'pro', 'top', 'agency'];

  const FEATURE_LABEL = {
    profile: 'პირადი პროფილი და ლოგო', contracts: 'ორენოვანი ხელშეკრულებები', matchmaker: 'კლიენტის მოთხოვნით ბინის შერჩევა',
    reminders: 'ვადის გასვლის შეხსენებები', selections: 'მრავალობიექტიანი პერსონალური გვერდი', analytics: 'საკომისიოების დეტალური ანალიტიკა',
    import: 'შევსება MyHome.ge, SS.ge და Place.ge ბმულით', presentation: 'PDF პრეზენტაცია',
    export: 'ექსპორტი Excel-ში', whitelabel: 'White-label ბრენდირება',
  };

  return { ALL_FEATURES, PLANS, PLAN_ORDER, FEATURE_LABEL };
});
