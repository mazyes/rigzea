# RIGZEA CRM: სრული კოდის აუდიტი, იმპლემენტაციის გეგმა (IMPLEMENTATION PLAN)

**პროექტი:** რიგზეა (Rigzea) — ქართული უძრავი ქონების CRM SaaS  
**ვერსია:** 3.1 (Sales & Rentals Unified Architecture)  
**ავტორი:** უფროსი Full-Stack SaaS ინჟინერი & პროდუქტის არქიტექტორი  
**თარიღი:** 2026-10-13  

---

## 1. არსებული არქიტექტურა და ფუნქციონალის ინვენტარიზაცია

### 1.1 ტექნოლოგიური დასტა (Tech Stack)
* **Frontend:** სუფთა Vanilla JavaScript (ES2022+), სუფთა CSS (CSS Variables, Flexbox, Grid, Dark/Light თემები), სემანტიკური HTML5. ჩარჩოების (React/Vue/Angular) ზედმეტი ბალასტის გარეშე, რაც უზრუნველყოფს მყისიერ ჩატვირთვას (<100ms) და ნულოვან build-time სირთულეს.
* **Backend & API:** Vercel Serverless Functions (`api/p.js`, `api/cron-reminders.js`, `api/telegram.js`, `api/_lib.js`) და Vercel Edge Rewrites (`vercel.json`).
* **Database & BaaS:** Supabase (PostgreSQL 15+), Row Level Security (RLS), PL/pgSQL ტრიგერები და RPC ფუნქციები (`security definer`), Supabase Auth (JWT), Supabase Storage (`rigzea-files`).
* **Testing:** Node.js + Playwright E2E ტესტები (`tests/e2e.js`, `tests/audit-suite.js`) in-browser Mock Supabase სისტემით (`tests/mock-supabase.js`, `tests/seed.js`).

### 1.2 მოდულების და ფაილების ინვენტარიზაცია
1. **საჯარო ვებსაიტი & Landing Page (`rigzea/index.html`, `landing-luxury.css`, `landing-luxury.js`):**
   * Luxury Emerald დიზაინის სისტემა (Hardware-accelerated ambient backdrop).
   * ინტერაქციული მობილური დემო (Renter View vs. Agent Analytics).
   * Social Post Generator (Facebook, WhatsApp, Co-broker).
   * ორენოვანი იჯარის ხელშეკრულების სიმულატორი.
   * Client Matchmaker სიმულატორი.
   * ROI კომისიის კალკულატორი.
   * ტარიფების 4-დონიანი ცხრილი (დამწყები, პრო აგენტი, ტოპ აგენტი, სააგენტო).

2. **მენეჯერის სამუშაო სივრცე (`rigzea/app/`):**
   * `index.html`: სტრუქტურა, ავტორიზაცია, სამუშაო სივრცის შექმნა (Onboarding), ძირითადი Shell (Sidebar rail, Topbar, Search, Notifications, User popover, Mobile bottom navigation).
   * `app.css`: სრული დიზაინის სისტემის CSS ტოკენები, ბადეები, ბარათები, ფორმები, დიალოგები, სამკერდე ნიშნები (badges).
   * `app.js`: სესიის მართვა (`boot`), მონაცემთა ჩატვირთვა (`loadData`, ინდექსირება `idx`), როუტინგი (`parseHash`, `route`), გლობალური ძებნა (`openSearch`), სააბონენტო პაკეტების ლიმიტები და მართვა (`PLANS`, `planState`, `guardLimit`, `openUpgrade`).
   * `views-ops.js`: „დღეს“ (Today Dashboard) — ყურადღების მისაქცევი საკითხები, დღის განრიგი (Check-in/Check-out, საქმეები), დავალებების სია და დეტალები (`drawer`), სტატუსის გადართვა (`tasks_lifecycle`), ხელშეკრულების ვადის გასვლის შეხსენებები.
   * `views-portfolio.js`: ბინების სია, ფილტრები (სტატუსი, ქალაქი), ბინის დეტალური გვერდი, ბინის შექმნა/რედაქტირება (`openApartmentForm`), ჭკვიანი ბმულის გენერატორი, ფოტოების მენეჯერი (Client-side Canvas resize და reorder), ჯავშნები, მფლობელები და ხარჯების თანხმობები.
   * `views-deals.js`: გარიგებების Pipeline (აქტიური, ნახვა, დეპოზიტი, დახურული), საკომისიოების რეპორტინგი (USD/GEL კონვერტაცია, Co-broker split), კლიენტის მოთხოვნით შერჩევა (Matchmaker) და მრავალობიექტიანი ბმულები (`selections`), სოციალური პოსტების გენერატორი, ორენოვანი იჯარის ხელშეკრულება (`contracts`).
   * `views-finance.js`: ხარჯების სამუშაო პროცესი (შეთავაზებული → დადასტურებული → გაწეული → გადახდილი), შემოსავლები, ბინების მიხედვით ანგარიშსწორება, მფლობელის ყოველთვიური ამონაწერი (`monthly_reports`).
   * `views-admin.js`: გუნდის მართვა (მოწვევები, როლები: Owner, Admin, Manager, Staff), ორგანიზაციის პარამეტრები, White-label ბრენდინგი, Excel/CSV იმპორტ-ექსპორტი, პლატფორმის სუპერ-ადმინი (`platform_admins`).

3. **საჯარო გვერდები & Smart Links (`rigzea/p/`, `rigzea/p/s/`):**
   * `/p/<slug>/` (`rigzea/p/index.html` + `api/p.js`): საჯარო ვიტრინა WhatsApp-ით ნახვის დაჯავშნის ღილაკით, ფოტო გალერეით, ლოკაციით და პარამეტრებით (კარის კოდებისა და მფლობელის მონაცემების გარეშე).
   * `/p/s/?id=<slug>` (`rigzea/p/s/index.html`): კლიენტისთვის გაგზავნილი პერსონალური მრავალობიექტიანი გვერდი შედარების ცხრილით.
   * `/approve/?token=<token>`: მფლობელის ხარჯის დადასტურების/უარყოფის გვერდი.
   * `/guide/?apt=<id>`: სტუმრის ციფრული QR გზამკვლევი.
   * `/staff/`: დამლაგებლებისა და ტექნიკოსების მობილური ინტერფეისი.

---

## 2. მონაცემთა ბაზის არსებული სქემა და კავშირები

1. **`organizations`**: სამუშაო სივრცე (სააგენტო/კომპანია).
   * ველები: `id`, `name`, `slug`, `city`, `portfolio_size`, `plan` ('trial', 'starter', 'pro', 'top', 'agency'), `trial_ends_at`, `plan_expires_at`, `brand_color`, `logo_url`, `agent_display_name`, `fx_rate`, `contact_email`, `contact_phone`.
2. **`organization_members`**: სააგენტოს მომხმარებლები.
   * ველები: `id`, `organization_id`, `user_id`, `role` ('owner', 'admin', 'manager', 'staff'), `display_name`, `phone`.
3. **`owners`**: ბინის მესაკუთრეები.
   * ველები: `id`, `organization_id`, `user_id`, `name`, `phone`, `email`, `payout_account`, `notes`, `is_archived`.
4. **`apartments`**: უძრავი ქონების ობიექტები (აქამდე ორიენტირებული ძირითადად გაქირავებაზე).
   * ველები: `id`, `organization_id`, `owner_id`, `name`, `address`, `city`, `unit_number`, `status` ('active', 'maintenance', 'vacant', 'archived'), `bedrooms`, `rooms`, `floor`, `total_floors`, `area_sqm`, `district`, `currency`, `rental_type` ('short_term', 'long_term', 'hybrid'), `monthly_rent`, `rent_due_day`, `deposit_amount`, `lease_end`, `pets_allowed`, `utilities_estimate`, `prepayment_terms`, `agent_phone`, `agent_name`, `agent_commission_percent`, `owner_bonus`, `cobroker_split`, `photos`, `description`, `description_en`, `amenities`, `slug`, `lat`, `lng`, `badge`, `access_instructions`, `door_code`, `wifi_name`, `wifi_password`, `parking_info`.
5. **`deals`**: გარიგებები და კლიენტების მოთხოვნები.
   * ველები: `id`, `organization_id`, `apartment_id`, `client_name`, `client_phone`, `client_email`, `stage` ('active', 'viewing', 'deposit', 'closed', 'lost'), `deal_amount`, `currency`, `commission_percent`, `commission_amount`, `owner_bonus`, `partner_agent`, `partner_phone`, `cobroker_split`, `net_commission`, `viewing_date`, `deposit_paid_at`, `closed_at`, `target_move_in`, `criteria`, `notes`, `created_by`.
6. **`tasks`**: ოპერაციული დავალებები (დასუფთავება, რემონტი, ინსპექცია).
   * ველები: `id`, `organization_id`, `apartment_id`, `reservation_id`, `title`, `description`, `type` ('cleaning', 'maintenance', 'repair', 'inspection', 'payment', 'other'), `priority`, `status` ('new', 'assigned', 'in_progress', 'blocked', 'done', 'cancelled'), `assigned_to`, `due_date`, `scheduled_start`, `blocked_reason`, `checklist`, `photos`, `notes`.
7. **`selections`**: კლიენტის პერსონალური შერჩევები (მრავალბინიანი ბმული).
8. **`contracts`**: იჯარის გენერირებული ხელშეკრულებები.
9. **`expenses` & `approvals` & `income` & `monthly_reports`**: ფინანსური მოდელი და ამონაწერები.
10. **`notifications` & `activity_events` & `telegram_chats`**: შეტყობინებები და ისტორია.

---

## 3. ფუნქციონალი, რომელიც მკაცრად უცვლელი რჩება

1. **არსებული გაქირავების სამუშაო პროცესი (Rentals):**
   * დღიური გაქირავების ჯავშნები (`reservations`), Check-in / Check-out განრიგი, დასუფთავების ავტომატური დაგეგმვა.
   * გრძელვადიანი გაქირავების მონაცემები: მდგმურის სახელი, ტელეფონი, თვიური ქირა, დეპოზიტი, გადახდის რიცხვი, ხელშეკრულების ვადის გასვლა (`lease_end`).
   * იჯარის ვადის ამოწურვის შეხსენებები (30, 14, 3 დღით ადრე) და Telegram ინტეგრაცია.
   * ორენოვანი იჯარის ხელშეკრულების გენერატორი.
2. **სააბონენტო პაკეტები და ფასები:**
   * **Starter (დამწყები):** 0 ₾ (უფასო სამუდამოდ), 3 ობიექტი, 1 ადგილი.
   * **Pro Agent (პრო აგენტი):** 29 ₾ / თვე, 50 ობიექტი, 1 ადგილი.
   * **Top Agent (ტოპ აგენტი):** 69 ₾ / თვე, 150 ობიექტი, 3 ადგილი.
   * **Agency (სააგენტო):** 149 ₾ / თვე, ულიმიტო ობიექტები და ადგილები.
   * **Trial (საცდელი):** 14 დღე უფასოდ, 50 ობიექტი, 3 ადგილი, ყველა ფუნქცია ღიაა.
3. **ბრენდინგი, დიზაინის ენა და ვიზუალური იდენტობა:**
   * Emerald Dark Theme & Clean Glass UI, FiraGO ტიპოგრაფია, ბუნებრივი ქართული ტერმინოლოგია.
4. **მრავალმოიჯარიანი იზოლაცია (Multi-tenant RLS):**
   * მონაცემთა ბაზის Row-Level Security წესები, ორგანიზაციის იზოლაცია, საჯარო ვიტრინებზე სენსიტიური ინფორმაციის დაცვა.

---

## 4. იდენტიფიცირებული ხარვეზები, შეზღუდვები და ნაკლოვანებები

1. **უძრავი ქონების გაყიდვების (Sales) არარსებობა:**
   * ობიექტების მოდელი შეიცავდა მხოლოდ `rental_type`-ს (`short_term`, `long_term`, `hybrid`). გაყიდვის შესაძლებლობა (`sale`) საერთოდ არ არსებობდა.
   * ფასის ველად გამოიყენებოდა მხოლოდ `monthly_rent` (თვიური ქირა), რაც გაყიდვის ობიექტისთვის შეუსაბამოა.
   * არ იყო კვადრატული მეტრის ფასის (`price_sqm`) ავტომატური დათვლა და ჩვენება.
   * არ იყო სველი წერტილების რაოდენობა (`bathrooms`), უძრავი ქონების კატეგორია (`property_type`: ბინა, სახლი, კომერციული, მიწა).
2. **გარიგებებისა და მილსადენის (Pipeline) შეზღუდულობა:**
   * `deals.stage` შეიცავდა მხოლოდ 5 ეტაპს: `active`, `viewing`, `deposit`, `closed`, `lost`. აკლდა გაყიდვების სრულფასოვანი ეტაპები: ახალი მოთხოვნა / ლიდი (`enquiry`), კონტაქტი დამყარებულია (`contacted`), შეთავაზება გაგზავნილია (`offer`), მოლაპარაკება (`negotiation`).
   * გარიგებებში არ იყო გარჩეული გაყიდვა vs. გაქირავება (`deal_type`).
   * საკომისიოს ტიპი შეზღუდული იყო მხოლოდ ქირის პროცენტით; აკლდა ფიქსირებული თანხა გაყიდვებისთვის ან შეთანხმებული პროცენტი გაყიდვის ფასიდან.
3. **კლიენტებისა და ლიდების (Leads) მონაცემთა ბაზის დეფიციტი:**
   * კლიენტის ტიპები (მყიდველი, დამქირავებელი, მესაკუთრე, გამყიდველი) არ იყო სისტემატიზებული.
   * არ ინახებოდა ბიუჯეტის დიაპაზონი (`budget_min`, `budget_max`), ლოკაციის პრეფერენციები, ლიდის წყარო (`lead_source`), შემდგომი კონტაქტის თარიღი (`follow_up_date`).
4. **დათვალიერებებისა (Viewings) და შეხსენებების (Follow-ups) ნაკლებობა:**
   * დავალებებში (`tasks.type`) არ იყო გათვალისწინებული ობიექტის ნახვა (`viewing`) და კლიენტთან დაკავშირება (`followup`), რაც აგენტის ყოველდღიური მუშაობის 80%-ია.
5. **საჯარო გვერდების შეზღუდულობა:**
   * `/p/<slug>/` და `api/p.js` ყველა ობიექტს აჩვენებდა როგორც გასაქირავებელს („თვეში“ / „/ month“), რაც გაყიდვის ბინებისთვის სრულიად არასწორია.

---

## 5. მონაცემთა ბაზის ცვლილებები და მიგრაციის სტრატეგია (`05_sales_crm.sql`)

ცვლილებები სრულად იდემპოტენტურია (`if not exists`, `check` შეზღუდვების უსაფრთხო განახლება) და არ აზიანებს არსებულ მონაცემებს.

### 5.1 ცხრილი `public.apartments`
* `transaction_type text not null default 'long_term' check (transaction_type in ('sale', 'long_term', 'daily'))`
* `property_type text not null default 'apartment' check (property_type in ('apartment', 'house', 'commercial', 'land'))`
* `sale_price numeric(12,2)`
* `price_sqm numeric(10,2)`
* `bathrooms integer default 1`
* `status` შეზღუდვის გაფართოება: `'active'` (ხელმისაწვდომი), `'reserved'` (დაჯავშნილი), `'rented'` (გაქირავებული), `'sold'` (გაყიდული), `'maintenance'` (რემონტზე), `'vacant'` (არააქტიური), `'archived'` (დაარქივებული).
* მონაცემთა ავტომატური მიგრაცია: არსებული `rental_type = 'short_term'` გარდაიქმნება `transaction_type = 'daily'`-დ; `rental_type = 'long_term'` -> `transaction_type = 'long_term'`.

### 5.2 ცხრილი `public.deals`
* `deal_type text not null default 'rental' check (deal_type in ('sale', 'rental', 'daily'))`
* `contact_type text default 'buyer' check (contact_type in ('buyer', 'renter', 'owner', 'seller', 'other'))`
* `stage` შეზღუდვის გაფართოება: `enquiry` (ახალი ლიდი), `contacted` (დაკავშირებული), `viewing` (ნახვა დანიშნულია), `offer` (შეთავაზება გაგზავნილია), `negotiation` (მოლაპარაკება), `deposit` (დეპოზიტი/ბე), `closed` (მოგებული/დახურული), `lost` (ჩაშლილი), `active` (აქტიური - თავსებადობისთვის).
* `commission_type text default 'percent' check (commission_type in ('percent', 'fixed'))`
* `lead_source text` ('instagram', 'facebook', 'myhome', 'ss_ge', 'referral', 'walk_in', 'website', 'other')
* `assigned_agent_id uuid references public.organization_members(id) on delete set null`
* `seller_id uuid references public.owners(id) on delete set null`
* `follow_up_date timestamptz`

### 5.3 ცხრილი `public.owners` (კლიენტები და კონტაქტები)
* `contact_type text not null default 'owner' check (contact_type in ('owner', 'seller', 'buyer', 'renter', 'other'))`
* `budget_min numeric(12,2)`
* `budget_max numeric(12,2)`
* `budget_currency text default 'USD'`
* `preferred_city text`
* `preferred_district text`
* `requirements jsonb not null default '{}'::jsonb`
* `lead_source text`
* `assigned_to uuid references public.organization_members(id) on delete set null`
* `follow_up_date timestamptz`

### 5.4 ცხრილი `public.tasks`
* `type` შეზღუდვის გაფართოება: `'viewing'` (ნახვა/დათვალიერება), `'followup'` (კლიენტთან დაკავშირება), `'meeting'` (შეხვედრა), `'cleaning'`, `'maintenance'`, `'repair'`, `'inspection'`, `'payment'`, `'other'`.
* `deal_id uuid references public.deals(id) on delete set null`

### 5.5 განახლებული RPC ფუნქციები
* `public.get_public_listing(p_ref text)`: უსაფრთხოდ აბრუნებს `transaction_type`, `property_type`, `sale_price`, `price_sqm`, `bathrooms`-ს მესაკუთრის პირადი ნომრისა და კარის კოდების გარეშე.

---

## 6. UI/UX ცვლილებები გვერდების მიხედვით

### 6.1 მთავარი დაფა (Today Dashboard — `views-ops.js`)
* **KPI მეტრიკები:** აქტიური ობიექტები (ჯამი, გასაყიდი, გასაქირავებელი), ახალი ლიდები, დანიშნული დათვალიერებები, დღეს შესასრულებელი Follow-up შეხსენებები, მოლაპარაკების ეტაპზე მყოფი გარიგებები, გაყიდული ობიექტები, დახურული საკომისიოები.
* **ტრანზაქციის ფილტრი:** ყველა / გაყიდვები / გაქირავება.
* **განრიგი:** დათვალიერებები (`viewing`) და შეხვედრები ინტეგრირებულია დღის განრიგში Check-in/Check-out-ებთან ერთად.

### 6.2 ობიექტების ინვენტარიზაცია (Properties — `views-portfolio.js`)
* **ტაბები და ჩიპები:** ყველა / იყიდება / გრძელვადიანი / დღიური.
* **სტატუსები:** თავისუფალი / დაჯავშნილი / გაქირავებული / გაყიდული / რემონტზე / დაარქივებული.
* **ფასის ფორმატირება:**
  * გაყიდვა: `$150,000` (მეტრიკა: `$1,875 / მ²`).
  * გრძელვადიანი: `$1,200 / თვე`.
  * დღიური: `$70 / დღე`.
* **ობიექტის ფორმა (`openApartmentForm`):**
  * დინამიური ველები: ტრანზაქციის ტიპის მიხედვით (`sale` vs `long_term` vs `daily`).
  * გაყიდვისას იმალება იჯარის ვადები, დეპოზიტი, Check-in/out; ჩნდება გაყიდვის ფასი, კვ.მ. ფასის ავტო-კალკულაცია, გაყიდვის საკომისიოს პარამეტრები.
  * დამატებულია სველი წერტილები (`bathrooms`) და ქონების ტიპი.

### 6.3 გარიგებები და Pipeline (`views-deals.js`)
* **Kanban / Pipeline სვეტები:**
  1. ახალი მოთხოვნა / ლიდი
  2. კონტაქტი დამყარებულია
  3. ნახვა დანიშნულია
  4. შეთავაზება გაგზავნილია
  5. მოლაპარაკება
  6. მოგებული / გაყიდული
  7. ჩაშლილი
* **გარიგების ბარათი და ფორმა:**
  * ტრანზაქციის ტიპის არჩევა (გაყიდვა vs გაქირავება).
  * საკომისიოს მოქნილი კალკულატორი: პროცენტი (%) ან ფიქსირებული თანხა.
  * დათვალიერების პირდაპირი დანიშვნა კალენდარში.
  * Co-broker წილის გამჭვირვალე გათვლა.

### 6.4 კლიენტები და კონტაქტები (Clients & Owners — `views-admin.js` / `views-portfolio.js`)
* გაერთიანებული კონტაქტების მოდული: მყიდველები, დამქირავებლები, გამყიდველები, მესაკუთრეები.
* კლიენტის მოთხოვნების აღრიცხვა (ბიუჯეტი, ოთახები, უბანი, წყარო).
* შემდგომი დაკავშირების (`follow_up_date`) კონტროლი.

### 6.5 საჯარო ვიტრინა (`rigzea/p/index.html` & `api/p.js`)
* ტრანზაქციის ტიპის სამკერდე ნიშანი: „იყიდება“, „ქირავდება“, „ქირავდება დღიურად“.
* გაყიდვის შემთხვევაში: სრული ფასი და კვ.მ. ფასი „/ თვე“-ს გარეშე.
* სველი წერტილების და ფართობის მკაფიო ჩვენება.

---

## 7. უსაფრთხოება და Multi-Tenancy რისკები

1. **მკაცრი ორგანიზაციული იზოლაცია:**
   * ყველა ცხრილში (`apartments`, `deals`, `owners`, `tasks`, `selections`, `contracts`) დაცულია `organization_id` და Supabase RLS წესები:
   ```sql
   create policy deals_select on public.deals for select using (public.is_org_manager(organization_id));
   ```
2. **მესაკუთრისა და კლიენტის პერსონალური მონაცემების დაცვა:**
   * საჯარო RPC ფუნქცია `get_public_listing` არასოდეს აბრუნებს კარის კოდებს, Wi-Fi პაროლებს, მესაკუთრის ტელეფონს/პირად ნომერს ან შიდა შენიშვნებს.
3. **სერვის-როლის გასაღებების იზოლაცია:**
   * ბრაუზერში იგზავნება მხოლოდ საჯარო Anon გასაღები; ყველა პრივილეგირებული ოპერაცია დაცულია PostgreSQL RLS-ით და `auth.uid()` შემოწმებით.

---

## 8. ინფრასტრუქტურის ნულოვანი ხარჯის ანალიზი (0 GEL Recurring Cost)

1. **Vercel Hobby Tier:**
   * 100 GB გამტარუნარიანობა, Serverless ფუნქციების უფასო ლიმიტი (100,000 invocations/თვეში).
   * საჯარო ვიტრინები იყენებენ Vercel Edge Cache-ს (`s-maxage=60`), რაც სერვერის რესურსს მინიმუმამდე ამცირებს.
2. **Supabase Free Tier:**
   * 500 MB მონაცემთა ბაზა, 1 GB Storage, 50,000 თვიური აქტიური მომხმარებელი (MAU).
   * ფოტოების ავტომატური კლიენტური ოპტიმიზაცია (HTML5 Canvas resize 1600px / 480px) გამორიცხავს Storage-ის გადავსებას.
3. **ნულოვანი ფასიანი API-ები:**
   * SMS/WhatsApp Business Paid API-ების ნაცვლად გამოიყენება პირდაპირი `wa.me` Deep-Link-ები და უფასო Telegram Bot Webhook.
   * არ გამოიყენება ფასიანი AI სერვისები.

---

## 9. იმპლემენტაციის ეტაპები და თანმიმდევრობა (Checklist)

- [ ] **ნაბიჯი 1: მონაცემთა ბაზის მიგრაცია (`supabase/patches/05_sales_crm.sql`)**
  - დაემატოს `transaction_type`, `property_type`, `sale_price`, `price_sqm`, `bathrooms` `apartments` ცხრილს.
  - გაფართოვდეს `apartments.status`, `deals.stage`, `tasks.type`.
  - დაემატოს გაყიდვების, კონტაქტების და საკომისიოს ველები `deals`, `owners`, `tasks` ცხრილებში.
  - განახლდეს `get_public_listing` RPC.
- [ ] **ნაბიჯი 2: ტესტირების გარემოსა და Mock DB-ის განახლება**
  - განახლდეს `tests/mock-supabase.js` და `tests/seed.js` ახალი ველებით, სტატუსებითა და RPC-ებით.
- [ ] **ნაბიჯი 3: ობიექტების მართვა და ინვენტარიზაცია (`views-portfolio.js`)**
  - დაემატოს გაყიდვის/გაქირავების/დღიურის ტაბები, სტატუსები, ფასის ფორმატირება.
  - განახლდეს ობიექტის ფორმა (`openApartmentForm`) დინამიური ველებით.
- [ ] **ნაბიჯი 4: გაყიდვების მილსადენი და გარიგებები (`views-deals.js`)**
  - განახლდეს Pipeline 7 ეტაპით.
  - დაემატოს გაყიდვის გარიგების ფორმა, ფიქსირებული/პროცენტული საკომისიო, დათვალიერების დანიშვნა.
- [ ] **ნაბიჯი 5: კლიენტებისა და ლიდების მოდული (`views-admin.js` / `views-portfolio.js`)**
  - მხარდაჭერილი იყოს მყიდველები, დამქირავებლები, მესაკუთრეები, გამყიდველები, ბიუჯეტი და მოთხოვნები.
- [ ] **ნაბიჯი 6: მთავარი დაფის განახლება (`views-ops.js` / `app.js`)**
  - KPI ბლოკები გაყიდვებისა და გაქირავებისთვის, დათვალიერებები, Follow-up შეხსენებები, ტრანზაქციის ფილტრები.
- [ ] **ნაბიჯი 7: საჯარო ვიტრინები და გაზიარება (`rigzea/p/`, `api/p.js`)**
  - გაყიდვის ობიექტების სწორი ჩვენება (სამკერდე ნიშანი, ფასი, კვ.მ. ფასი).
- [ ] **ნაბიჯი 8: QA & ტესტების გაშვება**
  - განახლდეს `tests/e2e.js` და `tests/audit-suite.js` ახალი Sales ფუნქციონალის ტესტებით.
  - გაეშვას სრული სატესტო ნაკრები და დადასტურდეს 100%-იანი წარმატება.
- [ ] **ნაბიჯი 9: დოკუმენტაციის მომზადება**
  - მომზადდეს `COST_ANALYSIS.md` და `IMPLEMENTATION_REPORT.md`.

---

## 10. მიღების კრიტერიუმები (Acceptance Criteria)

1. ობიექტის დამატებისას შესაძლებელია არჩევა: „იყიდება“, „ქირავდება გრძელვადიანად“, „ქირავდება დღიურად“.
2. გაყიდვის ობიექტზე ავტომატურად ითვლება კვ.მ. ფასი და არ ჩანს ქირის/მდგმურის შეუსაბამო ველები.
3. გაყიდვების Pipeline-ში მუშაობს 7 ეტაპი (ახალი ლიდიდან დახურვამდე), ეტაპის შეცვლა ინახება ბაზაში.
4. საკომისიოების რეპორტინგი ითვლის როგორც გაყიდვების, ისე გაქირავების საკომისიოს.
5. საჯარო გვერდზე `/p/<slug>/` გაყიდვის ბინა ჩანს გაყიდვის ფასით და შესაბამისი სამკერდე ნიშნით.
6. არსებული გაქირავების, ჯავშნების, დალაგებების და სააბონენტო პაკეტების ფუნქციონალი მუშაობს უნაკლოდ.
7. ყველა ავტომატური Playwright და E2E ტესტი წარმატებით გადის.
8. არ დამატებულა არცერთი ფასიანი ინფრასტრუქტურული სერვისი (0 GEL ხარჯი).
