# Rigzea battle plan: from "CRM" to the Link-to-Deal Workspace

Date: 2026-10-22. Built in sequence by four agents (competitor researcher, business strategist, offer strategist,
product manager). Each read the previous file and the code. Full evidence, sources and file/line references:

- [01-teardown.md](01-teardown.md) competitor teardown, 60 sources, 13 items to verify
- [02-category.md](02-category.md) category, manifesto, moat, rename list
- [03-offer.md](03-offer.md) offer, packaging, lead magnet, 30-day launch
- [04-product.md](04-product.md) kill list, wedges, aha script, roadmap

Tags: SHIPPED (live), PARTIAL (works with a manual step or gap), ROADMAP (not built). ESTIMATE = reasoning, not a
sourced number. Georgian lines passed a rule-based grammar read but still need a native speaker. No em dashes.

## 0. Read this first

**Assumptions I made.** The template's blanks were empty, so: the product is what the repo and live pages show;
customers are agents in Tbilisi and Batumi; competitors ("opps") are Bitrix24, HubSpot, Follow Up Boss, Kommo
(Pipedrive briefly), plus the real incumbent, the pile of Excel + WhatsApp + Telegram + Facebook groups + Word.
Portals (MyHome, SS.ge, Place.ge, Korter) are treated as source, audience and risk. If your competitor list differs,
only section 2 changes.

**One line I held against the brief.** "Autonomous Deal Closer" and any AI-agent category are rejected. Rigzea has no
LLM call anywhere in `api/` or the app, reminders are deterministic, and Kommo, HubSpot and Follow Up Boss already
own the AI headline. In a word-of-mouth market of roughly 2,000 to 4,000 agents (ESTIMATE, low confidence), the first
agent who finds a template engine behind an "AI" claim says so in a group chat.

**Weakest evidence.** G2 and Capterra figures reached the researcher only through search summaries, Reddit was
blocked, and there is no first-hand quote from a Georgian agent. The 20 outreach conversations are the cheapest way
to close that gap. Do not quote review-site numbers publicly until you open the pages yourself.

## 1. The plan on one page

| | |
|---|---|
| **Category** | **Link-to-Deal Workspace** / ბმულიდან გარიგებამდე: აგენტის სამუშაო სივრცე. Extends the "workspace" word you already own; the edge is "link to deal". |
| **Enemy** | Not a competitor. The pile, and any tool that sits outside where agents work and needs retyping. |
| **Tagline** | დაიწყე ბმულით, არა ცარიელი ბაზით. (Start with a link, not an empty database.) |
| **Offer** | 14 days, everything open, no card, started from your own MyHome link and your Excel in a 15-minute guided session. Nothing deleted, cancel any time, free export. |
| **Wedge 1** | **Send and know:** paste a portal link, send a page under your name, your phone tells you when the client opens it, the lease comes out of the same deal. |
| **Wedge 2** | **Rental lifecycle:** lease + handover act, 30/14/3-day renewal ping, owner approves expenses from a link. |
| **Aha (first 5 min)** | The "link opened" ping arriving on your phone for a page you just sent. |
| **Beachhead** | Tbilisi solo brokers, rental-heavy, 10 to 50 listings, Pro Agent (39 GEL). Agencies bottom-up later. Batumi after Russian ships. |
| **Real moat today** | Georgian law, language and commission logic. The links-and-colleagues network has the highest ceiling but is not real yet. |
| **Do first** | A trust pass (section 6): the "AI" claim, Vercel Hobby, and about ten claims the code contradicts. |

## 2. Step 1: where the opps are vulnerable

**What users pay for (evidence in 01-teardown.md).**

| Tool | What people pay for | Price anchor |
|---|---|---|
| Bitrix24 | Everything in one place, per-organisation pricing, free tier | Free to $199/mo per org |
| HubSpot | Easy core, free tier, automation, training library | Free; Starter about $7 to $20 per seat |
| Follow Up Boss | Speed to lead: 250+ lead sources, call/text/email in one place | $69 per user/mo, +$39 calling |
| Kommo | One inbox for WhatsApp and Telegram, bots, AI agents | $25 to $45 per user, 6-month minimum |

**What they are hated for, ranked.**
1. **Setup and learning burden before any value.** Recurs for all five vendors reviewed (the single strongest pattern).
2. **Price creep, tier gating, add-ons.** Firmest evidence, since the pricing pages confirm it.
3. Slow support, billing and renewal disputes (Trustpilot: Bitrix24 1.9, HubSpot 1.5, Kommo 2.4, versus Pipedrive 4.4).
4. Manual data entry, so the tool goes stale. In one small 2023 US survey, only 32% of brokerage leaders said more
   than half their agents used the company tool.
5. Thin or slow mobile. 6. Bugs and misdescribed tiers. 7. Data ownership worries (Follow Up Boss after Zillow).

**What they ignore, and where Rigzea stands.**

| Expectation | Rigzea |
|---|---|
| No retyping of listings (none reads MyHome/SS/Place) | SHIPPED (Pro and trial) |
| Georgian UI (HubSpot and Kommo have none; Zoho partial; Bitrix24 and FUB unconfirmed) | SHIPPED; Russian missing |
| Georgian-law contracts, local commission splits | SHIPPED, not lawyer-reviewed |
| Flat local-currency price, free field staff | SHIPPED; billing is manual (PARTIAL) |
| Auto-logged WhatsApp, AI agents | ROADMAP / absent. Competitors lead; do not compete here |
| Mobile speed | SHIPPED UI, **unmeasured**. Do not claim "faster" |

**The real competitor is the pile.** It is free, already on the phone, needs no onboarding, and the client
conversation already lives in WhatsApp. Switch triggers are hypotheses to test: a moment of loss (a forgotten
expiry, a disputed expense), looking better to clients, zero migration pain, a colleague already on it. Not triggers:
feature breadth, AI, reports.

**Five openings, ranked.** (1) Link in, form out: no reviewed tool does it. (2) Useful in minutes, not weeks.
(3) Output that lives in WhatsApp/Telegram: smart link, selection link, owner approval. (4) Georgian-first with local
documents. (5) Flat GEL pricing: Pro is about 22% of one Follow Up Boss seat.

**Three things the opps do better.** Real messaging infrastructure and AI; maturity and free tiers; depth for large
teams. Do not chase 50-seat agencies or developer sales teams.

## 3. Step 2: the re-categorization

### The three names

| | Name | Verdict |
|---|---|---|
| **A (winner)** | **Link-to-Deal Workspace** / ბმულიდან გარიგებამდე: აგენტის სამუშაო სივრცე | Fully backed by shipped features and provable in one demo. Quiet as a noun, so the boldness comes from the enemy and the demo. |
| B | The Pocket Office / ჯიბის ოფისი | Better ad line than category. Implies a WhatsApp inbox that does not exist. Revisit after two-way WhatsApp and stable auto-submit ship. |
| C | Link-First Brokerage / ბმულით მუშაობა | A feature, not a job. Copyable, leaves out contracts and commission. |

Usage rules: always pair "workspace" with "link to deal"; never say all-in-one, never say AI, never say "publishes
for you". The visible brand never calls itself a CRM; the word appears only as the searcher's word (FAQ entry,
later a neutral comparison page, `SoftwareApplication` structured data).

### Enemy manifesto

> **Stop feeding the database.**
>
> Right now, somewhere in Tbilisi, an agent is copying a MyHome listing into a spreadsheet, forwarding forty photos
> into a chat, and opening a Word file to change one name in a lease.
>
> That pile works. It is free, it is already on your phone, and nobody has to teach you anything. That is why
> nothing has beaten it.
>
> The software that promised to replace it asked you to work the opposite way. Most of it lives in a tab you open
> when you finally have time. It asks you to retype what you already said in WhatsApp. It wants setup and training
> before it gives anything back. It bills in dollars, usually per seat, and the useful parts sit in the higher
> tiers. Some of the best known have no Georgian interface at all. As far as we can find, none of them can read the
> one thing you start every deal with: a MyHome link.
>
> So it goes stale. In one small 2023 survey of US brokerage leaders, about two thirds said half or fewer of their
> agents actively used the tool the brokerage paid for. The authors blamed scattered tools, not unwilling agents. A
> tool that sits outside where the work happens becomes a graveyard.
>
> We build the other way round. Start with the link you already have. Paste it, and photos, area and price arrive
> without retyping. Send your client a page with your name and logo, no owner phone number, made for WhatsApp and
> Telegram. Know when it is opened. Share a listing with a colleague without handing over your owner. Let an owner
> approve an expense from a link, no account. Generate the lease and the handover act from the deal you already
> entered. Pay one flat price, in lari.
>
> A tool should do the work, not keep a record of it.
>
> From link to deal. Everything in order: რიგზეა.

Edited from the strategist's draft: I removed "watermarked photos" because the code skips the watermark for imported
photos, and the "none can read a MyHome link" line stays only while the owner's spot-check holds.

**Georgian version (needs native review):**
> დაივიწყე ჩატებში გაფანტული ფოტოები და არეული ცხრილები.
> ბაზა, რომელსაც ხელით ავსებ, შენს ნაცვლად არაფერს აკეთებს.
> დაიწყე იმ ბმულით, რომელიც უკვე გაქვს: ჩასვი, გაუგზავნე კლიენტს და გააფორმე ხელშეკრულება.
> მართე საქმე ერთ სივრცეში, ბმულიდან გარიგებამდე.
> ყველაფერი რიგზეა.

### The moat, honestly

Horizontal CRMs are kept out of Georgia by language, setup burden and economics, **not by architecture**. Nothing in
Rigzea's code is hard to rebuild; a competent developer could redo the import, templates and share page in weeks
(ESTIMATE). So the moat is local fit, trust and distribution, and the last two are mostly unbuilt.

| Rank today | Source | Verdict | Head start |
|---|---|---|---|
| 1 | Georgian law, language, commission logic | Real, moderate. Needs lawyer review and Russian | Indefinite vs foreigners; 3 to 6 months vs a local clone |
| 2 | Counter-positioning and price | Real but narrow; protects only against players who were never coming | 12 to 24 months vs foreigners |
| 3 | Link-in loop | Strong hook, weak moat, **real liability** (portal can block) | 2 to 4 months, zero if blocked |
| 4 | Time-to-first-value | A wedge, not a moat; unmeasured | Weeks |
| 5 | Client-link network + colleague co-brokering | **Not real yet**, highest ceiling. Invest first | 12+ months if achieved |
| 6 | Data lock-in | Weak. Make export free instead | n/a |

What kills it: a portal ships agent tooling (Korter most likely), or a local founder clones it and out-distributes it.

**Portal dependency: HIGH impact, MEDIUM-HIGH likelihood.** Import is a server-side fetch from Vercel with a browser
User-Agent; the researcher's own fetch got HTTP 403 from MyHome. Mitigation chain, cheapest first: log every import
outcome per portal; a quick-listing form that always works; an extension "read this tab" using the agent's own
session; an official feed via a Korter/MyHome conversation. Monthly drill: with import off, can a new account still
reach a sent link and a lease in one session? Do not escalate to proxies or rotating IPs.

## 4. Step 3: the offer

**Value proposition (needs native review).** Rigzea იწყება იმ ბმულით, რომელიც უკვე გაქვს: ჩასვი, გაუგზავნე კლიენტს
შენი სახელით გვერდი და იმავე ობიექტზე მოამზადე ხელშეკრულება, ხელახლა აკრეფის გარეშე.
(Rigzea starts from the link you already have: paste it, send your client a page under your name, and prepare the
lease on the same listing, without retyping.)
Alternates: ბაზას ხელით ნუ შეავსებ. ჩასვი ბმული. / ბმულიდან გარიგებამდე, ერთ სივრცეში.

**Where the contrast lives.** Public copy contrasts with "the pile" and "a database you fill by hand". The word CRM
and competitor names stay out of the hero; they appear only in the FAQ and a later `/compare/` page, with verified
facts only.

**The no-brainer offer.**
- **Dream outcome:** the client sees one clean page under my name; I stop retyping; nothing gets lost. After one
  15-minute session the agent holds three artifacts: a live client page for their own listing, their Excel loaded,
  and one lease draft.
- **Risk reversal (all true today unless noted):** 14 days, everything unlocked, no card; nothing deleted after the
  trial (links above 3 listings pause, say so out loud); cancel any time, no auto-charge; **free Excel export on every
  plan (needs a small change first)**. Optional conditional guarantee for the first 50 payers: refund the month if
  fewer than 5 clients opened their links. Worst case 1,950 GEL, expected about 300 GEL (ESTIMATE).
- **"10x faster than migrating":** keep "10x" internal. Publish "15 minutes with me, on your phone". Local CRM setup is
  sold from EUR 999, so the comparison is real but not measurable publicly.
- **Founder cost:** about 30 minutes per customer, capped at the first 50 customers (about 25 hours).

**Packaging changes (small, same four plans).** Needs a database patch, so it waits for your approval and a
rolled-back dry run (CLAUDE.md). Check the live count of paying Starter orgs first.

| Plan | Change | Why |
|---|---|---|
| დამწყები 9.99 | Retire as a paid plan; make it **უფასო (0 GEL)** with link import, name and logo, export | After day 14 every account already drops to Starter limits, so 9.99 buys what everyone gets free. It demonstrates nothing. Cap free import at 3 per hour. |
| პრო აგენტი 39 | Add 5 selection links, brand colour, export | Solo brokers send "3 options" daily; colour is already promised in outreach |
| გუნდი 99 | Unlimited selection links; keeps seats, splits, analytics | Sells team economics |
| სააგენტო 249 | Remove "AI აღწერები"; keep unlimited, white-label, priority support | Claim is not backed |

**Objections (honest answers in 03-offer.md).** Excel is free; clients are in WhatsApp; what if MyHome blocks it; I do
not trust new tools with owner data; no time to set up; are the contracts reviewed (answer today: not yet).

### Lead magnet: "ერთი ბმული, ერთი გვერდი" (One link, one page)

**Hook (needs native review):** გამომიგზავნე შენი ერთი MyHome ბმული და დღესვე დაგიბრუნებ მზა გვერდს, რომელსაც
კლიენტს 40 ფოტოს ნაცვლად გაუგზავნი. უფასოა, ვალდებულების გარეშე.
(Send me one of your MyHome links and today I will send back a ready page for your client instead of 40 photos. Free,
no obligation.)

- **Primary, zero code, this week:** concierge. The agent sends one link on WhatsApp, you import it, set their
  display name, send the page back. Guardrails: only the sender's own listing, page deleted after 7 days, and **not
  until `/p/<slug>` has `noindex`**. Honest limit: the open-notification lands in your workspace, not theirs; use that
  as the upsell. Five minutes each, cap 10 a day.
- **Fallback:** "bring your Excel", 15 minutes, in the agent's own account, so you never receive the file.
- **Coded version (paste-a-link preview, no signup):** medium build. Do not build until the concierge proves demand
  (30+ previews sent, 35%+ reply, 10+ trials started, and your time is the bottleneck). Risks: portal blocks,
  anonymous abuse, showing a stranger's photos on a page nobody owns.
- **Funnel targets (ESTIMATE):** contacted to link sent 15%, link to trial 30%, trial to activation in 48h 50%,
  activated to paid by day 21 40%. Chained that is about one payer per 40 contacted. Zero payers in 40 means the
  offer or hook is wrong, not the market. No conclusions below 20 link-senders.

### 30-day launch (zero ad spend)

One channel, personalised outreach, until it plateaus. Cap: 10 new conversations a day, 15 follow-ups, 2 hours a
day. The Rule of 100 is deliberately not applied: a pool of 1,000 to 2,000 agents would be burned in about three
weeks, with a risk of WhatsApp restrictions on a new number.

| Days | Action |
|---|---|
| 1-3 | Fix the outreach claims (colour, selection link, Batumi hold). Dry-run the concierge on 2 friendly agents. Message everyone you know. Open the tracking sheet. |
| 4-10 | Korter list, Tbilisi solos first (#1, 3, 5, 9, 10, 11, 14, 15, then 12), 5 a day. Agencies later via Team. Hold #8 (no number) and #16-20 (Batumi, no Russian). |
| 8-20 | Referral ask: "ვისთან ინაწილებ ყველაზე ხშირად საკომისიოს?" (Who do you split commission with most often?) Reward both sides +14 trial days. Five Facebook/Telegram groups, admin permission only. |
| 21-30 | Close trials ending day 14, ask 3 payers for quotes, decide scale, fix or stop. |

**Five weekly numbers:** hook accept rate; trials started; activation (a non-member opens the first client page
within 48 hours); paid by day 30 and trial-to-paid; founder hours per paying customer (cap 3).

## 5. Step 4: the wedge product

### The feature kill list (refuse these, with the evidence behind each)

| # | Refuse | Why | Reconsider if |
|---|---|---|---|
| K1 | Custom fields / objects builder | Setup and clutter is complaint #1 for all five vendors | 5 paying agents ask for the same field: add it as a standard field, never a builder |
| K2 | Email marketing and drip campaigns | Georgian distribution is WhatsApp, Telegram, Facebook groups; HubSpot cost creep comes from add-on hubs | A third of payers say email is their main channel to foreign buyers |
| K3 | Forecast and reporting suite | Advanced reporting is a paid-tier lever; Rigzea already shows earned vs expected commission | Agency accounts above 10 agents ask for payout reports twice in a quarter |
| K4 | Multi-pipeline designer | Two fixed pipelines (rent, sale) are the point | A new vertical appears: ship a third fixed pipeline, not a designer |
| K5 | Integration marketplace and lead connectors | Georgian portals expose no API or feed; every connector is upkeep for a team of one | A portal offers an official agency feed |

**"Not yet", not a kill:** a two-way WhatsApp inbox (large: Meta verification, templates, per-conversation fees;
Kommo owns it). Revisit when 10+ agents pay, cost per conversation is known and import health is stable.
Dialer and call recording are also declined.

### The two wedges

**Wedge 1, send and know.** Flow: paste link, branded page, send, client-open ping, lease from the same deal.
Status: import SHIPPED, page SHIPPED, open ping SHIPPED, send step PARTIAL (copy only), deal-to-lease SHIPPED.
Make it undeniable: per-client link and named ping ("მარიამმა გახსნა ბმული"), re-hosted and watermarked photos,
and the fallback chain in section 3. Activation event: `link_first_open`, target 40% within 24h of signup
(hypothesis).
**Failure modes:** portal blocks; no WhatsApp number, so a dead-looking page; the agent opens their own link
signed in and thinks it is broken; Telegram not linked, so no push; pages indexable; hotlinked photos vanish.

**Wedge 2, rental lifecycle.** Flow: lease + handover act, then the 30/14/3-day renewal ping, then owner approval
from a link. All SHIPPED except **one missing wire: a saved lease never sets `lease_end`**, so the reminder is
never armed (verified in `views-deals.js`; the reminder needs the date typed by hand). Fix: lease save writes
`lease_end`, tenant, rent, deposit and status. Activation event: first lease whose save armed a reminder, target 80%
armed (hypothesis).
**Failure mode:** only matters if beachhead brokers manage rentals after placing them. Ask the 20 agents: "do you
track when your tenants' terms end?"

**Why not the others.** Co-brokering is copy-paste text with no recipient workspace, and its "link without my
contact" promise is false in code. Smart Match is a good demo, but its share link is Team-only, so a Pro Agent
cannot finish the loop; it plugs into wedge 1 once selection links reach Pro.

### The aha in the first five minutes

Aha event: the "ბმული გაიხსნა" (link opened) ping on your phone for a page you just sent. It is the only step with a
second person, it proves the whole chain, and the pile cannot do it.

| Time | What the broker sees and does | Today |
|---|---|---|
| 0:00 | Google one-tap sign-up | exists |
| 0:30 | Two fields: the name clients see, and their WhatsApp number (რომელ ნომერზე მოგწერონ კლიენტებმა?) | **GAP:** phone not asked |
| 1:00 | Paste a MyHome/SS/Place link; fields and photos fill in 10 seconds or less | long form |
| 1:45 | Review and save, phone prefilled | GAP |
| 2:15 | "Link ready": phone preview of the client page, big Send button | GAP: copy only |
| 3:00 | One tap opens @Rigzeabot with the code prefilled; bot confirms and sends a test ping | side card, 15-min code |
| 3:45 | Send the link to yourself in Telegram, tap it. **The ping arrives.** | works if Telegram is linked |
| 4:30 | Next cards: "add the client, lease in a minute", "import 9 more" | GAP |

If import fails, the dialog flips to a quick-listing form (address, price, rooms, gallery photos) and the link is
ready at about 3:00. Failure is logged, never a dead end. Instrumentation: a `product_events` table written through
an allowlisted RPC, no personal data (a new SQL patch, so it needs your approval).

**Reconciling the guided session with the aha.** The offer's 15-minute call must add the WhatsApp number and the
Telegram link to its first three steps, and treat the Excel step as optional. Until the first-run rebuild ships, the
call is the onboarding.

## 6. Fix before you scale: trust and truth

These come before any growth push. Some are one-line copy fixes; two need your decision.

**Decisions only you can make**
1. **Vercel Hobby forbids commercial use.** Vercel's fair-use guidelines restrict Hobby to non-commercial personal
   use, and advertising paid plans or processing payment counts as commercial
   (https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage). Rigzea advertises paid plans and has a card
   checkout. Pro is $20 a month (about 53 GEL, ESTIMATE). Supabase Free has no backups and pauses when idle; Pro is
   $25 with 7-day backups. Together about 118 GEL a month, the price of three Pro Agent plans. `COST_ANALYSIS.md`
   puts Pro "past 100 agencies", which is wrong. Confirm your actual plans in both dashboards.
2. **"AI აღწერები" on the Agency plan: remove, do not build.** The only trace is `pricing/index.html:195` and its
   English key in `i18n.js`. Replace with "კონტრაქტები და ბინის შერჩევა კლიენტის მოთხოვნით".
3. **Lawyer review** of the five contract templates. Until then, say "პროექტი" (draft) and never "reviewed" or
   "strictly complies" (`views-deals.js` ~1861). Start now: it has the longest lead time.
4. **Packaging patch** (section 4) and **`product_events`** table. Both are database changes; per CLAUDE.md I will
   write the patch, dry-run it, and ask you before running anything on production.

**Claims the code contradicts** (consolidated from both agents; the EN twin lives in `rigzea/js/i18n.js` and must
change with the key)

| Claim | Reality | Fix |
|---|---|---|
| "Publishes directly from Rigzea" (pricing 145, features, i18n, extension README) | Extension fills the form; the agent presses publish | "ავსებს ფორმას, გამოქვეყნებას შენ აჭერ" |
| Brand colour for Pro-level pages (outreach #6, voicetone copy bank) | Agency-only | Say "სახელითა და ლოგოთი" until the patch ships |
| "Export any time" (FAQ #5, features) | Team-only | Make export free, then keep the claim |
| "Link without my contact" (`views-deals.js` 1399, 1425, 1439) | Co-broker view still shows the original agent's WhatsApp button | Drop the phrase |
| "Watermarked photos" | Skipped for imported photos (hotlinked) | Limit the claim to uploaded photos |
| FAQ #7 "pay by Georgian bank card" | Activation is by WhatsApp today | Say so; verify the KISA flow |
| Speed anchors "1 / 10 / 15 / 30 წამში" | Four different, unmeasured numbers | "რამდენიმე წამში" until measured |
| Two currencies on the client page | Page shows one; PDF and posts show both | Move the claim to PDF and posts |
| Bot and hero say "სისტემაში", formal plural | Against `voicetone.md` | "სივრცეში", warm "შენ" (`telegram.js`, `cron-reminders.js`, `link-event.js`) |

Also: `/p/<slug>` pages are indexable (add `noindex,nofollow` meta in `api/p.js`), and the live site still says CRM in
about eight places (landing `<title>`, `CLAUDE.md`, `AGENTS.md`, manifest, og:title on the app pages, JSON-LD, FAQ
keywords; priority-ordered table in 02-category.md section 5). Leave `supabase/patches/05_sales_crm.sql` and the
archive alone.

## 7. One timeline

| When | Build / ship | Go-to-market |
|---|---|---|
| **Days 0-7** | R1 truth pass (copy, `noindex`, bot register). R2 Vercel Pro, nightly data dump, fix `COST_ANALYSIS.md`. Start lawyer review. | Fix outreach claims. Dry-run the concierge on 2 friendly agents (after `noindex`). |
| **Days 7-30** | R3 events + import health + quick-listing fallback + import cap 30/h for paid, 3/h free. R4 first-run rebuild (phone, import-first, "Send" card, Telegram in Quick Start). R5 free export. | Run the 30-day launch above; measure the five numbers. |
| **Days 31-60** | R6 per-client link + named ping. R7 lease arms the reminder. R11 footer and colleague-share measurement. Packaging patch (with your OK). | Decide scale / fix / stop against the funnel targets. Concentrate in 2 or 3 clusters (one agency plus its co-brokers). |
| **Days 61-90** | R8 extension "read this tab" (triggered if blocked+parse rate stays above 20% for 3 days). R9 Russian on client surfaces (triggered if 3 Batumi partners ask). R10 template description "მზა ტექსტი" (triggered if 3 of 20 ask). | Batumi design partners; agencies bottom-up. |

About 22 build days of roughly 60 available; the rest is outreach and support.

**Deliberately not doing:** two-way WhatsApp inbox, auto-submit publish, AI or agents, bulk import of an agent's
whole portal page (MyHome's robots disallows `/makler`), full Russian app UI, an in-app co-brokering network,
dialer, new reports, store app, a fourth portal, everything on the kill list.

## 8. Where the agents disagreed, and what I decided

| Conflict | Decision |
|---|---|
| Free-tier import cap: offer says 3 per hour, product says raise to 30 | 3 per hour on free (abuse and portal exposure), 30 per hour on paid |
| Product file says Smart Match plugs in "after R5" (export) | It depends on selection links reaching Pro (the offer's packaging change), not on export |
| Manifesto said "watermarked photos" | Removed until imported photos are re-hosted and watermarked |
| Concierge preview could run before `noindex` | `noindex` first, then the concierge |
| 15-minute session omitted phone number and Telegram link | Added to the first three steps; Excel optional (may stretch to 20 minutes; measure) |
| Paid Starter retirement vs the portal risk on a permanent free tier | Retire it, but cap free import and check live paying-Starter count first |

## 9. What is still unverified

1. MyHome.ge and SS.ge terms on automated access and browser extensions (MyHome was unreadable). This decides how
   safe the link loop is long term.
2. Whether Bitrix24 has a Georgian interface. Open a free account and check before saying it does not.
3. Every G2/Capterra figure (search summaries only) and all Reddit sentiment (zero evidence).
4. The live database (the repo may differ): plan gates, paying Starter count, RLS, KISA webhook, `lease_end` handling.
5. Whether Batumi agents work in Russian (inferred from Cyrillic names), and Viber use (27% weekly, general
   population, 2024).
6. Agent counts: no register exists. Korter lists 2,053 realtor profiles; working agents ESTIMATE 2,000 to 4,000,
   reachable core 1,000 to 2,000. Revenue arithmetic, not a forecast: 1,000 Pro agents at 39 GEL is 468,000 GEL a year.
7. Mobile speed and time-to-first-value: unmeasured. No speed or "X minutes" claim until 20 trials are logged.
8. Whether any of the 20 outreach agents already use a CRM, and what they pay. This is the single most valuable fact
   to collect next.

## 10. Outreach file note

`outreach-agents.md` is owned by another session ("Georgian real estate agents outreach"), so I did not touch it.
Three edits it needs: remove "ფერით" from #6, rework #10 ("რამდენიმე ობიექტი ერთ ბმულში" is Team-only after the
trial), and hold #16 to #20 until Russian ships. 03-offer.md section 4 has three rewritten examples (#1, #3, #9).
