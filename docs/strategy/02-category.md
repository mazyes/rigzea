# STEP 2: The Anti-CRM category (Rigzea)

Author: business-strategist. Date: 2026-10-22. Builds on step1-teardown.md ("teardown") and context.md.
Tags: SHIPPED / PARTIAL / ROADMAP. Georgian lines are marked "needs native review". No em dashes.
Confidence labels: HIGH / MEDIUM / LOW. "ESTIMATE" means my reasoning, not a sourced number.

## 0. The answer in six lines

1. Category: **Link-to-Deal Workspace** / **ბმულიდან გარიგებამდე: აგენტის სამუშაო სივრცე**.
2. Enemy: the pile (Excel + chat + Word) and passive record-keeping tools that sit outside where agents work.
3. The noun stays "workspace" (already the hero, voicetone.md and outreach vocabulary). The edge is "link to deal".
4. Moat, honestly: the code is easy to copy. What is defensible is local fit and, if built, a links network. Most of it is not built yet.
5. Beachhead: Tbilisi solo brokers, rental-heavy, 10 to 50 active listings (Pro Agent).
6. Rename job is small: the live site leaks "CRM" in about eight places, the bot says "სისტემაში" (section 5).

### Four repo facts that change the pitch (read from code, 2026-10-22; check the live DB because live may differ from repo)
- `rigzea/js/plans.js`: Starter (9.99 GEL) has `features: []`. Profile/logo, contracts, Smart Match, reminders, link import and PDF start at Pro Agent (39). Multi-listing selection link, analytics and Excel export start at Team (99). Brand colour is Agency only (249). The category promise is therefore a Pro Agent promise; the 14-day trial unlocks everything.
- `api/import-listing.js`: link import is a **server-side fetch from Vercel with a browser User-Agent**, 10 per hour per workspace, parsers tied to page markup. This is the most blockable form of the link-in loop (section 3, rank 3).
- `rigzea/p/index.html`: client links already carry a "Made with Rigzea" footer (removed only by white-label). The exposure device exists; nobody measures it. Single-listing `/p/<slug>` pages have a canonical tag and no `noindex` (only `/p/s/` has it).
- `api/telegram.js`, `cron-reminders.js`, `link-event.js`: bot and notifications say "სისტემაში" and use formal plural, against voicetone.md. Outreach line 48 promises "ფერით" (colour) to agents; colour is Agency only.

---

## 1. Three categories

### A. Link-to-Deal Workspace (built on brand vocabulary)
- KA (needs native review): **ბმულიდან გარიგებამდე: აგენტის სამუშაო სივრცე**
- Promise: Paste a portal link, send your client a page under your own name, and prepare the lease, handover act and commission split in the same place.
- Promise KA (needs native review): ჩასვი განცხადების ბმული, გაუგზავნე კლიენტს შენი სახელით გვერდი და გააფორმე ხელშეკრულება ერთ სივრცეში.
- Must be true: link import SHIPPED (Pro+); branded client page SHIPPED (logo Pro+); "client opened your link" notification SHIPPED; contracts SHIPPED (Pro+); deals, commission calculator and splits SHIPPED; expiry reminders SHIPPED (Pro+); portal publish PARTIAL (keep out of the headline); time-to-first-value number ROADMAP, small (event logging, about a day).
- Buyer compares us to: the status-quo stack, scored as "how many apps sit between the MyHome link and the signed lease"; second, the free tier of a big tool they never finished setting up.
- Main risk: "workspace" is generic (Bitrix24 sells itself as an all-in-one workspace), so the edge must always travel with the noun. The edge also leans on the import leg, which depends on portals.

### B. The Pocket Office (bolder category claim)
- KA (needs native review): **ჯიბის ოფისი**
- Promise: Your whole back office, contracts, owner approvals, field staff, reminders and commission, in the phone you already carry.
- Promise KA (needs native review): შენი ოფისი, რომელიც ყოველთვის ტელეფონში გაქვს: ობიექტები, კლიენტები, ხელშეკრულებები და საკომისიო ერთ სივრცეში.
- Must be true: everything in A, plus owner approval link SHIPPED; field-staff app SHIPPED; installable mobile app PARTIAL (mobile-first web, no store app; verify install flow); two-way WhatsApp inbox ROADMAP, large (Meta verification, templates, per-conversation fees); auto-submit publish PARTIAL, small to medium plus portal risk; AI ROADMAP, do not mention.
- Buyer compares us to: an assistant or secretary, and all-in-one suites. That invites a feature checklist Bitrix24 and HubSpot win.
- Main risk: "office" implies an inbox and a phone line. The first agent who asks "where are my WhatsApp chats?" finds a gap, and in a word-of-mouth market overreach is repeated in Telegram groups.

### C. Link-First Brokerage (narrow mechanic)
- KA (needs native review): **ბმულით მუშაობა**
- Promise: Send one link instead of forty photos, and know when the client opens it.
- Promise KA (needs native review): გაუგზავნე კლიენტს ერთი ბმული 40 ფოტოს ნაცვლად და გაიგე, როცა გახსნის.
- Must be true: smart link SHIPPED; stats and open notification SHIPPED; colleague share with owner data hidden SHIPPED; multi-listing selection link SHIPPED (Team+ only).
- Buyer compares us to: the raw MyHome link, a PDF, a photo dump, link-in-bio tools, portal share pages.
- Main risk: a link is a feature, not a job. A portal or a weekend project can copy it, and it leaves out the most Georgian-specific assets (contracts, splits).

**Rejected on sight:** "Autonomous Deal Closer", "AI agent", "agent operating system". No paid LLM runs (COST_ANALYSIS.md, 2026-10-13), reminders are deterministic, and Kommo, HubSpot and Follow Up Boss already own the AI headline (teardown section 3). The first agent who finds a template engine will say so in the group chat. Auto-publish language is also out until the agent no longer has to press publish.

### Winner: A, Link-to-Deal Workspace
1. It is the only option fully backed by what ships and provable in one demo: paste a link, end at a contract.
2. It extends words the owner already owns. The hero says "მართე შენი საქმე ერთ სივრცეში"; only the title tag, manifest and a few meta tags still say CRM. B would force replacing "workspace" in voicetone.md and every script.
3. It names the through-line the status quo lacks. Nothing in the pile carries a listing from portal link to signed lease (teardown openings 1 to 4).
4. "ბმულიდან გარიგებამდე" is three words an agent can repeat.

Why B loses: it is a better ad line ("ოფისი ტელეფონში") than a category, and it promises breadth the product cannot yet show. Upgrade trigger: relaunch as Pocket Office only after two-way WhatsApp and stable auto-submit ship. Why C loses: it is a feature, copyable, and cannot carry contracts or commission.

Honest concession: A is the quietest of the three. The boldness must come from the enemy and the demo, not the noun. Rules: always pair "workspace" with "link to deal"; never say "all-in-one" (Bitrix24's claim); never say "AI".

### SEO: a quiet capture path without the brand ever saying CRM
Rule: "CRM" may appear only as the searcher's word or the thing Rigzea is compared with. Never as what Rigzea is, and never in nav, hero, home title, meta description, OG tags, manifest, app chrome, outreach or bot messages.
1. **Meta keywords:** Google ignores them, so removing "CRM" there costs nothing and captures nothing.
2. **FAQ entry** on `/faq/` with FAQPage JSON-LD (cheapest, do first). Q: "მჭირდება CRM, თუ ობიექტებს ექსელში ვმართავ?" A: "თუ შენი საქმე ბმულებით, WhatsApp-ითა და ხელშეკრულებებით მიდის, დაგჭირდება ერთი სივრცე, რომელიც განცხადების ბმულიდან იწყება და ხელშეკრულებით მთავრდება. ამისთვის არის Rigzea." (needs native review; gloss: "If your work runs on links, WhatsApp and contracts, you need one space that starts at the listing link and ends at the contract. That is what Rigzea is for.")
3. **One neutral-slug comparison page** (`/compare/`, later): Rigzea vs Excel + WhatsApp vs foreign tools. Use only verified facts: HubSpot and Kommo have no Georgian UI (HIGH), Zoho partial (HIGH), plan prices from their pricing pages. Do not claim Bitrix24 lacks Georgian, and do not quote G2/Capterra numbers, until the owner verifies (teardown section 8, items 2 and 3).
4. **Structured data:** add `SoftwareApplication` (applicationCategory `BusinessApplication`, offers in GEL, inLanguage ka) to the home JSON-LD, which today holds only Organization and WebSite. No invented ratings.
5. **Directories:** list under "real estate software"; describe as an alternative to spreadsheets.
6. **Validate before investing:** check Search Console queries after four weeks. I have no search-volume data. Georgian agents may search "პროგრამა" more than "CRM" (the pricing page already targets "ბროკერის პროგრამა"). The main channel is referral and outreach, so cap SEO effort at items 2 and 4.

---

## 2. The enemy manifesto (winner)

**Stop feeding the database.**

Right now, somewhere in Tbilisi, an agent is copying a MyHome listing into a spreadsheet, forwarding forty photos into a chat, and opening a Word file to change one name in a lease.

That pile works. It is free, it is already on your phone, and nobody has to teach you anything. That is why nothing has beaten it.

The software that promised to replace it asked you to work the opposite way. Most of it lives in a tab you open when you finally have time. It asks you to retype what you already said in WhatsApp. It wants setup and training before it gives anything back. It bills in dollars, usually per seat, and the useful parts sit in the higher tiers. Some of the best known have no Georgian interface at all. As far as we can find, none of them can read the one thing you start every deal with: a MyHome link.

So it goes stale. In one small 2023 survey of US brokerage leaders, about two thirds said half or fewer of their agents actively used the tool the brokerage paid for. The authors blamed scattered tools, not unwilling agents. A tool that sits outside where the work happens becomes a graveyard.

We build the other way round. Start with the link you already have. Paste it, and photos, area and price arrive without retyping. Send your client a page with your name, your logo and watermarked photos, no owner phone number, made for WhatsApp and Telegram. Know when it is opened. Share a listing with a colleague without handing over your owner. Let an owner approve an expense from a link, no account. Generate the lease and the handover act from the deal you already entered. Pay one flat price, in lari.

A tool should do the work, not keep a record of it.

From link to deal. Everything in order: რიგზეა.

**Georgian version (needs native review):**
დაივიწყე ჩატებში გაფანტული ფოტოები და არეული ცხრილები.
ბაზა, რომელსაც ხელით ავსებ, შენს ნაცვლად არაფერს აკეთებს.
დაიწყე იმ ბმულით, რომელიც უკვე გაქვს: ჩასვი, გაუგზავნე კლიენტს და გააფორმე ხელშეკრულება.
მართე საქმე ერთ სივრცეში, ბმულიდან გარიგებამდე.
ყველაფერი რიგზეა.

Gloss: Forget the photos scattered in chats and the messy sheets. A database you fill by hand does nothing in your place. Start with the link you already have: paste it, send it to the client, and sign the contract. Run the work in one space, from link to deal. Everything is in order.

### Claim map (every factual claim, with its backing)
| Claim in manifesto | Backing | Confidence |
|---|---|---|
| The pile is free, on the phone, needs no teaching | Teardown section 4 | HIGH |
| Tools outside the agent's flow need retyping | Complaint pattern 4 (adoption study, 2023 vendor survey); Kommo is the exception since it logs WhatsApp | MEDIUM |
| Setup and training before value | Pattern 1, all five deep-dive vendors; local implementers sell setup from EUR 999 | MEDIUM to HIGH |
| Dollars, usually per seat, useful parts in higher tiers | Pricing pages: FUB, Kommo, HubSpot, Pipedrive (Bitrix24 is per organisation, hence "usually") | HIGH |
| Some best known have no Georgian UI | HubSpot, Kommo official language lists | HIGH |
| None reads a MyHome link | Researcher's English, Georgian and Russian searches found none; absence of evidence | MEDIUM, owner should spot-check |
| About two thirds half or fewer | totalbrokerage.com, 72 US leaders, 2023: 32% said more than half use it | MEDIUM, small US sample |
| Link import, branded page, open notification, colleague share, owner approval link, contracts, flat GEL price | Context file, plans.js, api files | SHIPPED. Name and logo need Pro Agent. Billing is manual WhatsApp activation (PARTIAL). Have a Georgian lawyer review the lease templates before any ad says "Georgian-law". |

---

## 3. The moat

Honest frame: horizontal CRMs are kept out of Georgia by language, setup burden and economics, not architecture. Nothing in Rigzea's code is hard to rebuild: one fetch plus parser, a template engine and a share page are weeks of work for a competent developer (ESTIMATE). So the moat is local fit, trust and distribution, and the last two are mostly unbuilt. Ranking is by real defensibility today. Investment priority is different: rank 5 first, then rank 1.

**1. Georgian legal documents, language and commission logic. REAL, moderate.**
- Hard to copy: foreign vendors will not localise law and habits for roughly 2,000 to 4,000 working agents (teardown ESTIMATE). HubSpot and Kommo have no Georgian UI (HIGH). A local rival can copy templates but must keep them lawyer-reviewed and current.
- Head start: against foreigners, indefinite while the market stays small (indifference, not inability). Against a local clone, 3 to 6 months (ESTIMATE).
- 90 days: lawyer review of lease, exclusive, brokerage, deposit and handover act; state "reviewed" only once true. Ship Russian UI and a RU lease variant if the first Batumi agents confirm the need (foreign buyers were 52% of 2025 Batumi sales). Track GNARE licensing news.

**2. Counter-positioning and price vs horizontal tools. REAL but narrow.**
- Hard to copy: USD per seat, tiering and partner-led setup cannot shrink to a 39 GEL paste-and-go product without cannibalising their model. Rigzea Pro is about 22% of one FUB seat (teardown 5.4).
- Verdict: protects only against players who were never coming. It does not stop free (Excel, HubSpot and Bitrix24 free tiers) or a local founder on the same free infra. Price is a reason to trial, not a moat.
- Head start: 12 to 24 months against foreigners (ESTIMATE).
- 90 days: keep zero add-ons, keep field staff free, keep Starter honest about what it lacks.

**3. Link-in / form-out loop. STRONG HOOK, WEAK MOAT, REAL LIABILITY.**
- Hard to copy: foreigners will not write per-portal parsers. Locals can. The only barrier is maintenance: parsers depend on page markup, so whoever has daily users catches breakage first.
- Head start: 2 to 4 months (ESTIMATE), and zero if a portal blocks it or ships its own.
- **Portal dependency rating:** teardown says MEDIUM. I rate the server-side import **HIGH impact, MEDIUM-HIGH likelihood over 12 months**, because it fetches from datacenter IPs with a browser User-Agent and the researcher's own fetch got HTTP 403 from MyHome.ge. The publish extension is lower risk: the agent's own logged-in session, no captcha solving, the agent presses publish.
- **Mitigation plan, in order of cost:**
  1. Log import outcomes per portal (ok, blocked, gone, parse) from `import-listing.js` and alert when blocked plus parse exceeds 20% in a day. About half a day.
  2. Build a fallback chain: server fetch, then the extension reads the page the agent already has open (own IP, own session), then a fast manual path. A block should degrade the product, not break it.
  3. Test monthly: with import switched off, can a new agent still reach a signed lease in one session? If not, the category rests on one leg.
  4. Ask a Georgian lawyer one question: is reading a public listing on a user's behalf and re-presenting its photos on a private client page allowed? Add an "I am the agent or have the owner's permission" tick on import. Read the MyHome.ge and SS.ge terms (teardown section 8, item 1).
  5. Add `noindex` to `/p/<slug>` pages (verify first) so Rigzea never looks like a rival listing board indexing portal content.
  6. Open a partner conversation with Korter first (most likely to build agent tools, MEDIUM) and MyHome. Offer attribution and traffic; ask for an official agency feed.
  7. Never headline "publishes for you". Keep "from a link" (SHIPPED).

**4. Time-to-first-value. A WEDGE, NOT A MOAT; unmeasured.**
- Setup burden is the top complaint across all five vendors, but any tool can ship a quick-start.
- Head start: weeks.
- 90 days: log sign-up, first import, first shared link, first client open. Publish a median only after 20 trials. Offer a 15-minute call that imports the agent's Excel live. This turns the weakest moat into a trust-builder.

**5. Client-link network, colleague co-brokering and distribution. NOT YET REAL, highest ceiling.**
- Hard to copy once real: every link is seen by clients, owners and colleagues, and the footer already advertises Rigzea. In a reachable pool of about 1,000 to 2,000 agents (ESTIMATE), density in one circle makes Rigzea "how we split deals here", and a latecomer cannot buy that.
- Why not real: no adoption data, 20 outreach contacts, selection links are Team-only, and nobody tracks footer clicks or colleague acceptance.
- Head start if achieved: 12+ months. Today: zero.
- 90 days: measure links sent, opens by non-members, co-broke shares accepted, sign-ups from the footer. Put 3 selection links on Pro Agent (offer-strategist call). Concentrate outreach in two or three clusters (one agency plus its co-broking partners) instead of 20 scattered agents.

**6. Data and workflow lock-in. WEAK; do not lean on it.**
- Solo agents hold 4 to 50 listings and Excel works both ways. Real lock-in is history (contracts, approvals, link stats) and grows slowly.
- Export is Team-only today, which hurts a trust-led pitch against Follow Up Boss's export limits (teardown pattern 7, MEDIUM).
- 90 days: make Excel export free on every plan. "Leave any time" is a trust asset.

What would kill the moat: a portal ships agent tooling (Korter, MEDIUM that one builds it, LOW that it is a full workspace), or a local founder copies the product and out-distributes it.

---

## 4. Beachhead and sequencing

**Wave 1 (now): Tbilisi solo brokers, rental-heavy, 10 to 50 active listings, posting on MyHome/SS, living in WhatsApp.** Pro Agent, 39 GEL.
- One decision-maker, so the fastest purchase. Every Pro feature (import, contracts, reminders, Smart Match) lands for them.
- Rentals repeat: expiry reminder, handover act, owner expense approvals. Habit forms faster than in rare sales.
- 15 of 20 sampled Tbilisi profiles had 10+ listings (teardown 5.4, tiny sample). Solos co-broker with each other, which feeds rank 5.
- Hypothesis to test in the 20 conversations (LOW to MEDIUM): ask whether they do more rent or sale.

**Wave 2: small agencies (Team, 99), entered bottom-up** through solo members already using it, not pitched top-down. Agencies are a bad first customer: CRM adoption stays under half of agents at about 68% of brokerages even when mandated (teardown S18, MEDIUM, US).

**Wave 3: Batumi foreign-facing agents.** Largest ticket (52% foreign buyers, sales +17% in 2025) but gated by language: Cyrillic names dominate the directory and Rigzea has no Russian. Recruit 3 Batumi design partners now to learn the real language; ship Russian before selling.

**Who Rigzea is NOT for:** Rigzea is not for developer sales departments or large agencies that need call queues, lead routing and deep reporting; it is for agents who work from their phone, sell through WhatsApp and Telegram, and want to be useful today.

---

## 5. What to rename (owner action list; I edited nothing)

| Priority | Where | Now | Replace with |
|---|---|---|---|
| P0 | `CLAUDE.md` lines 3, 9; `AGENTS.md` lines 3, 9 | "Real-estate CRM for agents in Georgia"; "`app/` the CRM:" | "Real-estate agent workspace for Georgia"; "`app/` the workspace app:". AI agents read these before writing copy. |
| P0 | `rigzea/index.html:33` title and `rigzea/js/i18n.js:2228` | "Rigzea: უძრავი ქონების CRM აგენტებისთვის" / "...real estate CRM for agents" | "Rigzea: უძრავი ქონების აგენტის სამუშაო სივრცე" / "Rigzea: real estate agent workspace". Change key and value together or the English toggle falls back silently. |
| P0 | `rigzea/manifest.webmanifest` name and description | "Rigzea: უძრავი ქონების CRM"; "...სამუშაო სისტემა" | "Rigzea: უძრავი ქონების აგენტის სამუშაო სივრცე"; "უძრავი ქონების აგენტებისა და სააგენტოების სამუშაო სივრცე" |
| P0 | `rigzea/app/index.html:28` og:title (plus 7 stamped pages: apartments, deals, finance, owners, settings, tasks, team) | "Rigzea: უძრავი ქონების CRM" | Same workspace title. Edit only `app/index.html`, then `node scripts/stamp-assets.mjs`. |
| P1 | `api/telegram.js` (lines 122, 145, 162, 177, 203, 221), `api/cron-reminders.js:40`, `api/link-event.js:37` | "სისტემაში გახსნა", formal plural (თქვენს, დაამატეთ, გთხოვთ) | Warm "შენ" and "სივრცეში გახსენი" / "რიგზეაში გახსენი". Most-seen words for paying users. |
| P1 | `rigzea/pricing/index.html:8`, `rigzea/faq/index.html:8` keywords | "უძრავი ქონების CRM", "ტარიფები" | "უძრავი ქონების სამუშაო სივრცე", "ნაკრები"; add the FAQ entry from section 1 |
| P1 | `rigzea/index.html` JSON-LD | Organization + WebSite only | Add `SoftwareApplication` (BusinessApplication, GEL offers) |
| P2 | `package.json:4` | "real-estate CRM for agents in Georgia" | "real-estate agent workspace for Georgia" |
| P2 | `voicetone.md` | Core identity line | Add "ბმულიდან გარიგებამდე" as the secondary descriptor; keep CRM only in the ban list |
| P2 | `COST_ANALYSIS.md` lines 1, 3 | "RIGZEA CRM", "...CRM SaaS" | "RIGZEA", "...სამუშაო სივრცე (SaaS)" |
| P3 | `tests/e2e.js:820, 887` | "sales CRM" | "sales pipeline" (tests are selected by number, safe) |
| P2 | Off-repo | Chrome extension listing, Telegram bot "about", WhatsApp profile, Facebook page, Korter profile | Check for "CRM" and "სისტემა" |
| Leave | `supabase/patches/05_sales_crm.sql`, APPLIED.md, migrations.md, `docs/archive/*`, `docs/landing-audit-*`, logo SVGs | History, and the SVG "CRM" hit is base64 noise | Do not rename; renaming a patch breaks the migration record |

## 6. Hand-offs
- **Offer strategist:** anchor the offer on Pro Agent with the 14-day trial; Starter cannot demonstrate the category. Reconcile "colour" in outreach with Agency-only colour. Decide whether 3 selection links belong on Pro.
- **Product manager:** import health metric and extension fallback; time-to-first-value events; free export; footer-click tracking; `/p/` noindex check; bot copy; Russian. Verify two unknowns: whether "AI descriptions" on the Agency plan is true, and whether Vercel Hobby terms allow a paid commercial product (I recall they limit Hobby to non-commercial use; check before scaling).
