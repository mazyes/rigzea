# STEP 3: Offer, positioning hook and lead magnet (Rigzea)

Author: sales-offer-lead-gen-strategist. Date: 2026-10-22. Builds on step1-teardown.md and step2-category.md.
Tags: SHIPPED / PARTIAL / ROADMAP. Georgian lines are "needs native review" (NR), each with an English gloss.
ESTIMATE = my reasoning, not a sourced number. No em dashes. I changed no repo file.

## 0. Diagnosis and six repo facts that bend the offer

Value equation as the buyer sees it today (1-10): dream outcome 7; perceived likelihood 3 (new brand, no testimonials, manual billing); time delay 5 (unmeasured); effort 5 (link import and contracts need Pro or trial, Telegram connect, activation by WhatsApp). Weakest lever: likelihood. So the offer spends its budget on proof by demonstration and risk reversal, not on price.

1. **Paid Starter equals the free state.** `org_effective_plan()` returns `starter` for an ended trial or an expired plan, and `starter` has 3 listings, 1 seat, zero features (supabase/schema.sql:1493-1555, rigzea/js/plans.js). 9.99 GEL buys what everyone gets free after day 14.
2. **Export is Team-only** (views-admin.js:360, :396) while the FAQ (#5) and features page (line 301) say "any time".
3. **Colour is Agency-only** (`protect_org_branding`, schema.sql:1579); the "Made with Rigzea" footer is removed only by the white-label flag (p/index.html:174, 406). Colour and footer removal can be separated.
4. **Link import** needs the `import` feature (Pro and trial), is authenticated, server-side, 10 per hour per user (api/import-listing.js:38, 106).
5. **Excel/CSV import** exists (SheetJS, views-admin.js:545) and the pricing table lists it on every plan.
6. **The lease template** cites Civil Code arts. 531-575 in code (views-deals.js:1534). No lawyer review is recorded anywhere.

Unverified: the live database may differ from the repo (project memory says it does). Before any packaging change, read the live `plan_has_feature` and count paying `starter` orgs (read-only; ask the owner first).

## 1. Value proposition and tagline

**Primary tagline (NR):** დაიწყე ბმულით, არა ცარიელი ბაზით.
Gloss: Start with a link, not an empty database. It contrasts with a generic CRM's first-run experience (an empty database you must fill) without naming one.

**Alternates (NR):**
- ბაზას ხელით ნუ შეავსებ. ჩასვი ბმული. (Do not fill a database by hand. Paste a link.) Use in posts and group replies.
- ბმულიდან გარიგებამდე, ერთ სივრცეში. (From link to deal, in one space.) The category line; use under the logo and in the title tag.

**Value proposition (NR):** Rigzea იწყება იმ ბმულით, რომელიც უკვე გაქვს: ჩასვი, გაუგზავნე კლიენტს გვერდი შენი სახელით და იმავე ობიექტზე მოამზადე ხელშეკრულება და საკომისიოს გამოთვლა, თავიდან აკრეფის გარეშე.
Gloss: Rigzea starts from the link you already have: paste it, send your client a page under your name, and prepare the lease and commission calculation on the same listing, without retyping.

**From-to contrast (SHIPPED claims only):**

| # | The pile, or a database you fill by hand | Rigzea | Tag and plan |
|---|---|---|---|
| 1 | Copy MyHome fields into a sheet or form | Paste the link; photos, area, price arrive | SHIPPED, Pro and trial |
| 2 | Forward 40 photos; the owner's number travels with them | One page under your name, watermarked photos, owner phone hidden | SHIPPED; name and logo Pro+ |
| 3 | Wonder whether the client looked | Notification when opened; views, WhatsApp taps, calls | SHIPPED, all plans |
| 4 | Edit last month's Word lease | KA/EN lease, deposit, handover act filled from the deal | SHIPPED, Pro+ (not lawyer-reviewed) |
| 5 | Agree the split in a chat | Commission calculator; share a listing with a colleague, owner data hidden | SHIPPED, all plans (splits, leaderboard Team) |
| 6 | Remember which lease ends next month | Telegram reminder 30 days ahead | SHIPPED, Pro+ |
| 7 | Chase an owner to approve a 450 GEL repair | Owner approves from a link, no account | SHIPPED (plan gate not found, verify) |
| 8 | Dollars per seat, setup before value (generic tools) | Flat GEL price, field staff free, 14 days fully open, no card | SHIPPED; billing manual (PARTIAL) |

**Where the contrast lives.**
- Hero, sub-line, outreach, group posts: rows 1-7 against "the pile" and "a database you fill by hand" only.
- FAQ question and a later `/compare/` page: the word CRM appears only as the searcher's word ("მჭირდება CRM, თუ ექსელში ვმართავ?"); competitor names only with verified facts (HubSpot and Kommo have no Georgian UI).
- Internal only: row 8, adoption statistics, "generic CRM" wording, the "10x" framing.

## 2. The no-brainer offer

### a. Dream outcome and first-session deliverable
Working hypothesis in the agent's voice (replace with verbatim phrasing from the first 10 conversations; it is not a quote): "კლიენტი ხედავს ერთ სუფთა გვერდს ჩემი სახელით, მე კი დრო არ მეკარგება გადაწერაზე და არაფერი მეკარგება." (The client sees one clean page under my name; I do not lose time retyping and nothing gets lost.)

Deliverable in hand after one session of about 15 minutes: (1) their own listing as a live client page, sent to their own WhatsApp; (2) their Excel loaded; (3) one lease draft built from a real deal. Measurable promise I control: three artifacts in 15 minutes with the founder on the call. No time-to-value claim beyond that until 20 trials are logged.

### b. Risk reversal, checked against the product

| Element | True today? | Note |
|---|---|---|
| 14 days, everything unlocked, no card | Yes (signup sets `trial`, 14 days, 50 listings, all features) | Keep wording identical everywhere |
| Nothing deleted after the trial | Yes (patch 11): data stays, listings above 3 get paused links | Say the pausing out loud |
| Cancel any time, no auto-charge | Yes (manual activation, falls back to free) | Must stay true after KISA ships: no recurring charge without explicit opt-in |
| Export everything | No: Team-only | Make export free on every plan (section d) before saying it |
| Refund guarantee | Not offered | Recommend below |

**Conditional guarantee (optional, costed):** "If fewer than 5 clients opened your links in your first paid 30 days, I refund the month." Measurable with existing view stats. Worst case is 39 GEL per customer; across the first 50 payers that is at most 1,950 GEL, expected about 300 GEL if 15% claim (ESTIMATE). Cap it at the first 50 customers; launch only after a refund path (bank transfer back) is written down.

### c. The zero-migration path ("10x" is internal; publish "15 minutes with me")
Local setup of a generic CRM is sold from EUR 999 (gegidze.com/ka/crm, accessed 2026-10-22), so the comparison is fair internally but not measurable publicly.

| Step | Minutes | What happens |
|---|---|---|
| 1 | 0-2 | Agent opens rigzea.com/signup on their phone and starts the trial |
| 2 | 2-5 | Pastes 3 of their own MyHome/SS/Place links; photos, area, price arrive |
| 3 | 5-8 | Adds name and logo; sends the client page to their own WhatsApp |
| 4 | 8-12 | Uploads their Excel through "ბაზის გადმოტანა" |
| 5 | 12-15 | Generates one lease draft from a real deal |

Founder hours: 15 live plus 5 prep (dry-run the agent's 3 links first so a blocked portal never surprises the call) plus 10 follow-up = 30 minutes per customer. Cap at the first 50 customers: 25 hours in total, about 3 hours a week for 8 weeks (ESTIMATE). After 50, replace the call with a 3-minute video and chat support. Limits: the trial caps at 50 active listings, so a 300-listing Excel will not fully fit.

### d. Packaging (small changes, same four-plan structure)

| ნაკრები | GEL/mo | What changes | Rationale | Risk |
|---|---|---|---|---|
| უფასო (was "დამწყები") | 0 (was 9.99) | Stop selling 9.99. Free state gets link import, name and logo, Excel export. Still 3 listings, 1 user | Starter demonstrates nothing and equals free. With the loop, every free link carries the footer and shows the category | Import abuse and portal-block exposure on a permanent tier: cap free import at 3 per hour (ESTIMATE); check live DB for paying Starters first |
| პრო აგენტი | 39 | Add selection links (cap 5 active), brand colour, Excel export. Remove "გამოქვეყნება" wording | Solo brokers send "3 options" daily; selection links are the biggest exposure surface; colour costs nothing and outreach already promises it | Team and Agency lose a lever; the cap needs a count check beside `trg_selections_plan` |
| გუნდი | 99 | Unlimited selection links; keeps seats, agent role, splits, leaderboard, analytics | Sells seats and team economics, the real reason a team pays | Thin gap if agencies stay solo; judge after 3 teams |
| სააგენტო | 249 | Remove "AI აღწერები". Keeps unlimited, white-label (footer off), priority support | Claim is not backed | Colour stops being a differentiator; footer removal remains |

Build size: small. It touches plans.js, `plan_has_feature`, one trigger, the pricing HTML and paired i18n keys, and needs a patch with a rolled-back dry run and the owner's go-ahead (CLAUDE.md). Interim fix before the patch: delete the colour promise from outreach.
Option B, not now: if 5 of the first 20 conversations are agents with 4-9 listings, add a real Starter at 9.99 for 10 listings (medium, needs a new `free` plan id).

### e. Price anchor and objections
**Anchor (NR):** პრო აგენტი: დღეში 1,30 ₾. 14 დღე უფასოდ, ბარათის გარეშე. (Pro Agent: 1.30 GEL a day.) On the call ask: "რა გამოგდის ერთი გაქირავებიდან საკომისიოდ?" and compare to 39. Internal comparators: Follow Up Boss Grow $69 per seat is about 181 GEL (ESTIMATE at 2.63 GEL per USD), so Pro is about 22% of one seat.

| Objection | Honest answer (say this, NR) | Must be true |
|---|---|---|
| ექსელი უფასოა და მუშაობს. (Excel is free and works.) | "მართალია, მუშაობს. ატვირთე, როგორც არის, და დარჩეს შენი. ექსელი კლიენტს გვერდს შენი სახელით ვერ გაუგზავნის და ვერ გეტყვის, როდის გახსნა." If you do not need that, stay on Excel. | Free export |
| კლიენტები WhatsApp-ში მყავს. (My clients are in WhatsApp.) | "კარგია, WhatsApp-ს არ ვცვლით. Rigzea ის ბმულია, რომელსაც WhatsApp-ში აგზავნი. შენს ჩატებს არ ვკითხულობთ." No inbox, no auto-messages. | wa.me button only |
| MyHome რომ დაბლოკოს? (What if MyHome blocks it?) | "შეიძლება. მაშინ გადმოტანა გაჩერდება და ველებს ხელით ან ექსელიდან შეავსებ. გვერდები და ხელშეკრულებები ამაზე არ არის დამოკიდებული." No promise of import forever, no portal partnership. | Fallback: manual fields and Excel |
| მესაკუთრეების მონაცემებს ახალ ხელსაწყოს არ ვანდობ. (I do not trust a new tool with owner data.) | "დაიწყე ისე, რომ მესაკუთრის ნომერი არ ჩაწერო; ბმულით გადმოტანა მას არ საჭიროებს. საჯარო ბმულზე ის არასდროს ჩანს." No certifications or audits claimed; database in the EU per the privacy policy. | Test owner-phone hiding before launch |
| დრო არ მაქვს გასაშლელად. (No time to set up.) | "15 წუთი, ერთად, შენს ტელეფონზე. თუ არ მორჩა, დანარჩენს იმავე დღეს WhatsApp-ში ვასრულებთ." | Founder cap of 50 |
| ხელშეკრულებები იურისტმა გადაამოწმა? (Are the contracts reviewed?) | "ჯერ არა. შაბლონი სამოქალაქო კოდექსის 531-575 მუხლებზეა აგებული, მაგრამ იურისტის დასტური ჯერ არ გვაქვს. გამოიყენე პროექტად და პირველი ხელშეკრულება შენს იურისტს ანახე." Say "reviewed" only once a lawyer signs off. | Honest as stated |

## 3. Lead magnet: "ერთი ბმული, ერთი გვერდი" (One link, one page)

Type: Sample plus Solve. Persona: Tbilisi solo broker, problem-aware. Standalone value: they keep a client-ready page for a real listing even if they never sign up. It makes the pile feel heavy: the same listing that took 40 forwarded photos becomes one link.

**Hook (NR):** გამომიგზავნე შენი ერთი MyHome ბმული და დღესვე დაგიბრუნებ მზა გვერდს, რომელსაც კლიენტს 40 ფოტოს ნაცვლად გაუგზავნი. უფასოა, ვალდებულების გარეშე.
Gloss: Send me one of your MyHome links and today I will send back a ready page to give your client instead of 40 photos. Free, no obligation.

### Primary: concierge, zero code, runs this week
1. Prospect sends one link of their own listing.
2. Founder imports it in the internal admin workspace, sets the display name to theirs, sends back the page.
3. Guardrails: only the sender's own listing; say the page is deleted in 7 days; avoid exclusive listings until `/p/<slug>` gets `noindex` (step 2 flag).
4. Honest limit: the open-notification and stats land in the founder's workspace, not theirs. Do not promise them; use it as the upsell.

Founder time: 5 minutes per preview, cap 10 per day (50 minutes). Use an Agency-plan workspace (archived listings do not count against the cap).

**Fallback: "bring your Excel", 15 minutes.** Hook (NR): ექსელი გაქვს? 15 წუთში შენს ტელეფონზე გადმოვიტანოთ ერთად. (Got an Excel? Let us move it onto your phone together in 15 minutes.) It runs in the agent's own workspace with the 5 steps of 2c. The founder never receives the file, which removes the owner-data trust problem.

### Coded: public paste-a-link preview, no signup
Build size: **medium** (about 2-4 days, ESTIMATE): new anonymous endpoint reusing the import parser, an ephemeral render of the `/p/` template, per-IP limits.
Risks: (1) it uses the portal-fetching import (Vercel datacenter fetch with a browser User-Agent; step 1 got HTTP 403 from MyHome), so the hook may fail in public; (2) an anonymous endpoint is an abuse magnet: a free scraping proxy, photo hotlinking, bandwidth; (3) it shows a stranger's listing photos on a page nobody owns.
Guards if built: allow-list of three domains, 3 previews per IP per day (ESTIMATE), nothing stored, "sign up to keep and share it".
**Do not build until the concierge proves demand:** at least 30 previews sent, at least 35% of recipients reply (ESTIMATE target), at least 10 trials started, and founder time (more than 10 requests a day) is the bottleneck.

### Follow-up sequence (NR, warm შენ, WhatsApp or Telegram)
1. Same day: "აი შენი გვერდი: [ბმული]. გაუგზავნე ნებისმიერ კლიენტს, მესაკუთრის ნომერი არსად ჩანს. შენს საკუთარ სივრცეში შეტყობინებასაც მიიღებ, როცა კლიენტი გახსნის. რას იტყვი?"
   (Here is your page. Send it to any client; the owner's number appears nowhere. In your own space you also get a notification when the client opens it. What do you think?)
2. Day 2, no reply: "გამარჯობა, [სახელი]! გაუგზავნე გვერდი ვინმეს? თუ ექსელში გაქვს ობიექტები, 15 წუთში შენს ტელეფონზე გადმოვიტანოთ ერთად. რომელი დღე და საათი გაწყობს?"
   (Did you send it to anyone? If your listings are in Excel, let us move them in 15 minutes. Which day and time suits you?)
3. Day 5, last: "ბოლო შეტყობინებაა, მეტს აღარ დაგაწუხებ. გვერდს 7 დღეში წავშლი. საკუთარი სივრცე თუ გინდა, 14 დღე უფასოა, ბარათი არ გჭირდება: rigzea.com. თუ არ გამოგადგა, მითხარი რა გაკლდა, ძალიან დამეხმარება."
   (Last message. I will delete the page in 7 days. For your own space it is 14 days free, no card. If it did not fit, tell me what was missing.)

### Reading the result (ESTIMATE targets, tiny sample)
Primary conversion: paid Pro by day 21. Leading signals, in order: link sent, trial started, activation (a non-member opened their first client page within 48 hours of signup).

| Stage | Target | If below, the problem is |
|---|---|---|
| Contacted to link sent | 15% | Hook or segment |
| Link sent to trial | 30% | Preview did not convince, or signup friction |
| Trial to activation in 48h | 50% | Onboarding |
| Activated to paid by day 21 | 40% | Price, billing friction (manual WhatsApp) |

Chained, that is about 1 payer per 40 contacted (ESTIMATE). Zero payers in 40 means the offer or hook is wrong, not the market. No conclusions below 20 link-senders.

## 4. 30-day launch plan, zero ad spend

**Channel:** one Core Four channel, personalised outreach, until it plateaus. Rule of 100 is deliberately not applied: a reachable pool of about 1,000-2,000 agents (ESTIMATE, step 1) in a word-of-mouth market would be burned in about three weeks by 100 identical messages, with a risk of WhatsApp restrictions on a new number. Cap: 10 new conversations a day, 15 follow-ups, 5 days a week, 2 hours a day in total.

| Days | Action |
|---|---|
| 1-3 | Fix P0 claims (section 5, #1-5) in outreach copy. Dry-run the concierge on 2 friendly agents. Warm first: message everyone you know in Georgian real estate and every existing signup. Open the tracking sheet |
| 4-10 | Korter list, Tbilisi only: solos first (#1, 3, 5, 9, 10, 11, 14, 15), then #12; agency-type (#2, 4, 6, 7, 13) later via Team. Hold #8 (no number) and #16-20 (Batumi, no Russian UI yet). 5 a day |
| 8-20 | Referral ask to everyone who engages: "ვისთან ინაწილებ ყველაზე ხშირად საკომისიოს?" Reward both sides +14 days of trial (no cash). Five Facebook and Telegram rental groups: answer questions, one demo post per group only with admin permission, no auto-posting |
| 21-30 | Close trials ending day 14; ask 3 payers for verbatim quotes with permission; decide scale, fix or stop against section 3 |

First 20 conversations: about 8 solos from Korter, 4-6 warm or referral, the rest from groups, by day 14.

**Five numbers (weekly):**
1. Hook accept rate: links received per contacted.
2. Trials started.
3. Activation: first client page opened by a non-member within 48 hours (tracked by hand until the PM's events exist).
4. Paid by day 30 and trial-to-paid %.
5. Founder hours per paying customer. Cap 3. At 3 hours and an assumed 20 GEL an hour (ESTIMATE) CAC is 60 GEL against 39 GEL a month, payback about 1.5 months.

### Three outreach rewrites (examples only; the file is untouched)
Pattern: lead with the link hook, no "CRM", no colour, no "publishes", "ბმულიდან გარიგებამდე" once.

**#1 Zauri (NR):** გამარჯობა, ზაურ! მე ვარ [სახელი] Rigzea-დან. Korter-ზე ვნახე, რომ გაყიდვასაც აკეთებ და ქირასაც. გამომიგზავნე შენი ერთი MyHome ან SS.ge ბმული და დღესვე დაგიბრუნებ მზა გვერდს კლიენტისთვის, შენი სახელით და მესაკუთრის ნომრის გარეშე. 40 ფოტოს ნაცვლად ერთი ბმული, ვალდებულების გარეშე.
Gloss: Send me one MyHome or SS.ge link and today I will send back a ready client page under your name, owner's number hidden. One link instead of 40 photos, no obligation.

**#3 Tamar, 43 listings (NR):** გამარჯობა, თამარ! მე ვარ [სახელი] Rigzea-დან. 43 ობიექტზე ფოტოები და შეთანხმებები ჩატებში ადვილად იკარგება. გამომიგზავნე ერთი განცხადების ბმული და დღესვე დაგიბრუნებ გვერდს შენი სახელით. თუ მოგეწონა, ბმულიდან გარიგებამდე ყველაფერი ერთ სივრცეში გექნება, 14 დღე უფასოდ: rigzea.com
Gloss: Photos and agreements get lost in chats at 43 listings. Send one link, get a page under your name today. If you like it, everything from link to deal is in one space, 14 days free.

**#9 Tamari Khvedelidze, property management (NR):** გამარჯობა, თამარ! მე ვარ [სახელი] Rigzea-დან. ხარჯზე მესაკუთრის დასტური ჩატში ადვილად იკარგება. Rigzea-ში მესაკუთრე ხარჯს ბმულიდან ადასტურებს, ანგარიშის გარეშე, შენ კი პასუხს ერთ ადგილას ხედავ. გამომიგზავნე ერთი ობიექტის ბმული და 15 წუთში ცოცხლად გაჩვენებ, ბარათი არ გჭირდება: rigzea.com
Gloss: Owner approvals get lost in chat. Here the owner approves from a link, no account, and you see the answer in one place. Send one listing link and I will show you live in 15 minutes.

## 5. Claims to fix before running the offer

Priority order: public and most damaging first. EN twins live in rigzea/js/i18n.js and must change together with the key.

| # | Where | Claim | Reality | Replacement (NR) |
|---|---|---|---|---|
| 1 | pricing line 195; i18n 1956 | "AI აღწერები, კონტრაქტები და Smart Match" (Agency) | No LLM call exists; Smart Match is already on Pro | "კონტრაქტები და ბინის შერჩევა კლიენტის მოთხოვნით" (Contracts and matching by client request) |
| 2 | outreach #6 "ფერით"; voicetone bento card 2 | Brand colour on Pro-level pages | Agency-only today | Until the patch: "შენი სახელითა და ლოგოთი" (your name and logo). After: keep "ფერით" |
| 3 | pricing 145 and row 234; features line 100, 119 ("გამოქვეყნდა"), meta line 7; i18n 1883, 2233 | "Publishes straight from Rigzea", "პირდაპირი გამოქვეყნება" | PARTIAL: the extension fills the form, the agent presses publish | "Chrome გაფართოება ავსებს MyHome-სა და SS.ge-ს ფორმას, გამოქვეყნებას შენ აჭერ" (The extension fills the form; you press publish) |
| 4 | FAQ #5; features line 301 | "Export your full database any time" | Team-only | Make export free (section d), then keep the claim |
| 5 | FAQ #7 | Payment "by Georgian bank cards" | Pricing says message WhatsApp, pay, we activate; KISA unfinished | "ამჟამად გააქტიურება WhatsApp-ით: მოგვწერე, გადაიხადე გადარიცხვით და ჩაგირთავთ" (For now, activation by WhatsApp and transfer). Verify card payment exists before saying it |
| 6 | pricing 110 | Starter card sells 9.99 as a plan | Equals free state | Retire the card per section d; one name only ("უფასო ნაკრები"); FAQ #4 says "დამწყების" for the same state |
| 7 | landing, features meta, FAQ #3, voicetone | Speed anchors "1 წამში", "10-15 წამში", "10 წამში", "30 წამში" | Four different, unmeasured numbers | "რამდენიმე წამში" until measured |
| 8 | FAQ #6 | "სისტემა ავტომატურად შემოიტანს HD ფოტოებს" | Banned word; "HD" unverified; import is Pro and trial only | "ჩასვი ბმული და ფოტოები, ფართობი და ფასი თავისით შემოდის (პრო აგენტიდან)" |
| 9 | i18n 412, 1388 | "11-article legal act under Civil Code" | Not lawyer-reviewed | "ქირავნობის ხელშეკრულების შაბლონი სსკ 531-575 მუხლებზე, პროექტად გამოსაყენებლად" (Template for use as a draft) |
| 10 | outreach #10 "რამდენიმე ობიექტი ერთ ბმულში" | Selection link offered as part of the 14-day trial | Team-only after the trial | True once Pro gets selection links; otherwise disclose |
| 11 | outreach #20 and #16-19 | Pitch to Russian-speaking Batumi agents | No Russian UI | Hold until Russian ships |
| 12 | outreach, landing, pricing | "ბარათი არ გჭირდება" | True today (no in-product payments) | Keep, one phrase everywhere: "14 დღე უფასოდ, ბარათის გარეშე". Never add auto-charge without opt-in |

Not verified: live plan gates (repo may differ from production); which plan includes the owner approval link; whether `wl=1` is set only for Agency; whether free-state Excel import hits the 3-listing cap.
