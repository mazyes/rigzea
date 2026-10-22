# STEP 4: Wedge product blueprint (Rigzea)

Author: product-manager. Date: 2026-10-22. Basis: context.md, step1-teardown.md, step2-category.md and the code files named in the brief. Paths are relative to the repo; `file:line` means I read that line. Tags: SHIPPED / PARTIAL / ROADMAP. Sizes: S under 1 day, M 1 to 5 days, L over 1 week. Georgian lines "need native review" and carry an English gloss. Confidence: HIGH on code facts, MEDIUM on the wedge choice (no agent interviews yet), LOW on every target (hypotheses, no baseline).

## 0. Bottom line

1. The link loop works, but a new account never reaches its payoff. Onboarding does not ask for a WhatsApp number, so the first client page has no WhatsApp or call button (`rigzea/p/index.html:507`). A push ping needs Telegram linked, and that sits in a side card, not in the Quick Start (`views-ops.js:535`, `:299`).
2. Three claims are contradicted by code: "AI descriptions" (no LLM exists), "white-label link without my contact" (the `wl` flag only hides the Rigzea footer and brand), and watermarked photos on imported listings (hotlinked, skipped by the watermark tool).
3. Vercel Hobby forbids commercial use. It is the one item that can hurt a paying customer, so it is first.
4. Wedge 1: the link loop, "send and know". Wedge 2: the rental lifecycle (lease, handover act, renewal ping, owner approval): no portal needed, deterministic, shipped. One wire is missing: a saved lease never arms the reminder.

## 1. The feature kill list (5)

**K1. Custom fields / objects builder.** Why: setup and clutter is complaint pattern 1 for all five vendors; Pipedrive has no property object, so agents bend listings into custom fields (S17, rival-written); Bitrix24 needs partners to implement (S62).
Say (KA): ველების საკუთარი კონსტრუქტორი არ გვაქვს: ბროკერის საჭირო ველები უკვე ჩაშენებულია. რა გაკლია? მითხარი და ყველასთვის დავამატებთ.
Gloss: We have no field builder: the broker fields are built in. What is missing? Tell me and we add it for everyone.
Reconsider if: 5 paying agents independently ask for the same field. Add it as a standard field, never a builder.

**K2. Email marketing and drip campaigns.** Why: HubSpot's cost creep comes from hubs and add-ons (pattern 2); Georgian distribution is WhatsApp, Telegram and Facebook groups, not email (teardown section 4).
Say (KA): ელფოსტის კამპანიებს არ ვაკეთებთ: შენი კლიენტი WhatsApp-ზეა. ამის მაგივრად გაუგზავნე ბმული და მზა ტექსტი.
Gloss: We don't do email campaigns: your client is on WhatsApp. Instead send the link and a ready text.
Reconsider if: over a third of paying agents say email is their main channel to foreign buyers (ask the Batumi partners).

**K3. Sales forecast and reporting suite.** Why: advanced reporting sits in Pipedrive's $39 to $79 tiers (pattern 2); Rigzea already shows earned and expected commission and a leaderboard.
Say (KA): რთული რეპორტები არ გვაქვს: ერთ ეკრანზე ხედავ, რამდენი საკომისიო აიღე და რამდენი გელოდება, დანარჩენს Excel-ში გადაიტან. (true on every plan only after R5)
Gloss: No complex reports: one screen shows commission earned and expected; the rest goes to Excel.
Reconsider if: Agency accounts above 10 agents ask for payout reports twice in a quarter.

**K4. Generic multi-pipeline designer.** Why: pattern 1 again. Rigzea has two fixed pipelines, rent and sale, 7 stages (`views-deals.js:8`). A designer turns the simplest screen into a configuration project.
Say (KA): ეტაპების საკუთარ სქემას ვერ გააკეთებ: გაქირავებასა და გაყიდვას თითო მზა გზა აქვს, ისეთი, როგორც ბროკერები რეალურად მუშაობენ.
Gloss: You can't design your own stages: rent and sale each have a ready path, the way brokers really work.
Reconsider if: a new vertical (developer sales, land) shows up in Agency accounts. Ship a third fixed pipeline, not a designer.

**K5. Integration platform: lead-capture connectors, Zapier-style hooks, app store.** Why: Follow Up Boss's draw is 250+ lead sources (S8); Georgian portals expose no API or feed (teardown 5.2), so there is nothing to connect, and every connector is permanent upkeep for a team of one.
Say (KA): სხვა სერვისებთან კავშირების ბაზარს არ ვაკეთებთ: კლიენტი ბმულიდან WhatsApp-ზე ან ზარზე გადადის და რიგზეა ამას თვლის. თუ პორტალი ოფიციალურ არხს გახსნის, ჩავრთავთ.
Gloss: No integration marketplace: the client goes from the link to WhatsApp or a call and Rigzea counts it. If a portal opens an official feed, we connect it.
Reconsider if: a portal (Korter first) offers an official agency feed.

**"Not yet", not a kill: two-way WhatsApp inbox.** ROADMAP, large: Meta verification, templates, per-conversation fees (teardown section 3), and Kommo owns it. Revisit when 10+ agents pay, cost per conversation is known and import health is stable. Dialer and call recording are also declined (Follow Up Boss sells calling as a $39 add-on; agents call from their own SIM) but need no slot.

## 2. The two killer wedges

### Wedge 1: Send and know (the link loop)

**Story:** "I paste the MyHome link, send Mariam a page with my name on it, and my phone tells me when she opens it. Then the lease comes out of the same deal."

| Step | State | Evidence |
|---|---|---|
| Paste link; photos, area, price land | SHIPPED (Pro+ and trial), 10 per hour | `api/import-listing.js:37-127`, `views-portfolio.js:1429` |
| Branded page: name, logo, map, WhatsApp button | SHIPPED; button only if a phone is set | `p/index.html:505-520`, `api/p.js` |
| Send to client | PARTIAL: copy only, no send sheet, no client name | `views-portfolio.js:681` |
| Client opens | SHIPPED | `p/index.html:329-339` |
| Ping | PARTIAL: in-app bell always, Telegram if linked; names the listing, not the client; max 20 per hour | `link-event.js`, patch 14 lines 130-168 |
| Deal, then lease with handover annex, prefilled | SHIPPED | `views-deals.js:1807-1939` |

**Missing to be undeniable:**
- Per-client link and named ping (M): "Send to Mariam" creates `/p/<slug>/?c=<token>`; the ping reads "მარიამმა გახსნა ბმული: {ბინა}" (gloss: Mariam opened the link: {flat}); the link attaches to the deal and moves it to "contacted". This is the literal link-to-deal thread.
- First-run fixes (section 3), and the fallback chain below.
- Re-host imported photos on save (M) so they survive a deleted ad and can be watermarked. Lawyer first, plus an "I am the agent or have the owner's permission" tick.

**Portal blocking and the fallback chain.** Risk stays HIGH impact, MEDIUM-HIGH likelihood. New evidence (fetched 2026-10-22): ss.ge robots.txt disallows only user pages, place.ge only `/admin*`; MyHome's (tool summary, not verbatim, read it yourself) disallows `/makler`, `/help`, `/contact` and `/product` with query strings, allows `/udzravi-qoneba`, and sets `ai-train=no`. Robots is not terms of use. The server fetch presents itself as Chrome (`import-listing.js:7`): do not escalate to proxies or rotating IPs. Chain:
1. Server fetch (today), every outcome logged (R3).
2. On blocked/parse/timeout: a "quick listing" form (address, price, rooms, photos from the phone gallery). Always works; link ready in about 90 s (R3).
3. Extension "read this tab": the agent's own session sends the page to the app. Parsers are pure functions of HTML (`_import-parse.js:1`), so the API only needs an `html` field (R8; desktop Chrome only, and today an unpacked ZIP, `views-portfolio.js:629`).
4. An official feed via the Korter/MyHome conversation (step 2).
Monthly drill: new account, import off, reach a sent link and a lease in one session.

**Activation event:** `link_first_open`, the first notified open by a visitor with no Rigzea session. Rate = workspaces with one within 24 h of signup; target 40% (hypothesis). TTFV = median minutes from `workspace_created` to `link_shared`; target 5 or less.
**Failure modes:** portal blocks (floor: quick form); no phone, so a dead-looking page; the agent opens their own link while signed in and is not counted (`p/index.html:333`), then thinks it is broken; Telegram unlinked, so no push; pages indexable (`api/p.js` adds no robots tag to found listings; only not-found gets noindex, line 136); hotlinked photos vanish.

### Wedge 2: Rental lifecycle (lease, renewal, owner approval)

**Story:** "When I rent a flat out I want the lease and handover act in minutes, I never learn on the last day that the term ended, and the owner approves a repair from a link."

| Step | State | Evidence |
|---|---|---|
| Lease + handover act from deal, flat, owner | SHIPPED (Pro+) | `views-deals.js:1807-1939` |
| Save arms the reminder | **GAP**: writes a `contracts` row only; `lease_end`, tenant, rent never reach the flat | `views-deals.js:1929-1937` |
| 30/14/3-day ping, daily 05:00 UTC, bell + Telegram | SHIPPED (Pro+), needs `lease_end` typed by hand | patch 14 lines 53-73, `cron-reminders.js` |
| One-tap renewal (+1 year) | SHIPPED | `views-ops.js:204-224` |
| Telegram sentence -> task + owner approval link | SHIPPED (regex parser, not AI) | `telegram.js:15-224` |
| Owner approves from a link, no account, expiry | SHIPPED | `approve/index.html` |

**Missing (S-M):** lease save writes `lease_end`, tenant, rent, deposit and status "rented" to the flat (confirm toggle); the renewal ping carries "new lease from this one"; a lawyer reviews all five templates; verify an owner's answer pings the agent.
**Activation event:** first lease whose save armed a reminder (`lease_generated`, `armed=true`). Proof: armed rate (target 80%, hypothesis) and renewals actioned within 7 days of a ping.
**Failure modes:** it matters only if beachhead brokers manage rentals after placing them (ask the 20 agents: "do you track when your tenants' terms end?"); lease PII (personal numbers) sits in `contracts.data`; unlinked Telegram means bell-only reminders; Hobby cron runs once a day within a 59-minute window (https://vercel.com/docs/cron-jobs/usage-and-pricing).

### Why the others are not the wedge
- **Co-brokering:** copy-paste text with the owner hidden (`views-deals.js:1452-1523`). No recipient workspace, no acceptance, no shared split record, and "link without my contact" is false: `p/index.html` uses `wl` only for footer, brand and title (lines 377, 406, 503), so the colleague's client still sees the original agent's WhatsApp button (506-516). The network effect step 2 hoped for needs a shared listing to land in a colleague's workspace (L). Fix the copy now, build later.
- **Smart Match:** a deterministic weighted score (`views-deals.js:1019`) and a good demo, but it needs a stocked base and typed criteria, and its share output, the selection link, is Team-only (`plans.js:25`). A Pro Agent cannot finish the loop. After R5 it plugs into wedge 1 as "pick listings for Mariam".

## 3. The "aha" moment in the first 5 minutes

**Today (from code):** Google or email sign-up (`app.js:206`; if email confirmation is on it bounces to the mailbox, `:221`: verify live) -> onboarding asks company name, city, listing-count band (`app/index.html:146-153`) -> Today with a hero "add your first flat in 1 second" whose two buttons open the same long form (`views-ops.js:445-464`, `:552`) -> a 4-step Quick Start: add flat, watermark, share a collection (a Team feature, works only in the trial), make a lease. Progress flags are per-device localStorage (`:299-312`).

**Aha event:** the existing ping "ბმული გაიხსნა" (link opened, `link-event.js:11`) for a link the agent shared. Why this one: it is the only step involving a second person, it proves the whole chain (import, phone, page, send, Telegram), and it is the one thing the Excel and WhatsApp pile cannot do. "Lease from an imported listing" is the downstream value but needs a real tenant, so it cannot happen in 5 minutes.

**Ideal script (Tbilisi solo broker, on a phone):**

| Time | See and do | Today |
|---|---|---|
| 0:00 | Google one-tap sign-up | exists |
| 0:30 | Two fields: name clients see, WhatsApp number. KA: რომელ ნომერზე მოგწერონ კლიენტებმა? (which number should clients write to?) | GAP: no phone asked |
| 1:00 | Hero: paste a MyHome/SS/Place link copied from the phone browser; fields and photos fill in 10 s or less | partial: long form |
| 1:45 | Review, save; phone prefilled | GAP |
| 2:15 | "Link ready": phone preview of the client page and a big Send button (WhatsApp, Telegram, copy) | GAP: dense page, copy only (`views-portfolio.js:680-691`) |
| 3:00 | One tap opens @Rigzeabot with the code prefilled; bot confirms and sends a test ping | partial: side card, 15-minute code (`views-ops.js:248`) |
| 3:45 | Send the link to self in Telegram Saved Messages, tap it in Telegram's in-app browser (no Rigzea session, so it counts). **Ping arrives.** | works if Telegram is linked |
| 4:30 | Next cards: "add the client, lease in a minute", "import 9 more" | GAP |

Session-1 activation counts any notified open. "Real" activation is the first open at least 15 minutes after the share, within 48 h.
**If import fails:** the dialog flips to the quick form (address, price, rooms, gallery photos), the link is ready at about 3:00 and the rest is unchanged. Failure is logged, never a dead end.
**Gaps:** G1 ask the WhatsApp number (S). G2 import-first dialog (S). G3 post-save "Send to client" card (S-M). G4 Telegram inside the Quick Start, a test ping, and a hint that your own signed-in view does not count (S). G5 server-side steps: link ready, Telegram linked, first open, first lease (S). G6 import cap 10 to 30 per hour (a 10-50 listing broker hits 10 in session one) (S). G7 banned word "სისტემა" in the hero (`views-ops.js:452`) (S). G8 confirm the email-confirmation setting (S).

**Instrumentation, no PII.** Table `product_events(id, org_id, event, props jsonb, created_at)`, written only through a `log_event` RPC with an event allowlist and a membership check; server events come from `import-listing.js` (via `callRpcAs`) and the existing DB functions. Not Vercel logs: `api/client-error.js` only calls `console.error`, and Hobby keeps runtime logs for 1 hour, Pro 1 day (https://vercel.com/docs/plans/hobby). Events (props are enums or bands): `workspace_created` {city, size_band}; `profile_ready` {has_phone, has_logo}; `import_attempt` {site, outcome: ok|blocked|gone|parse|timeout|fetch|rate_limit|plan, http_status, ms_band}; `listing_saved` {via, photos_band, has_phone}; `link_shared` {surface, kind}; `telegram_linked`; `link_first_open` {hours_since_share_band, notified}; `lease_generated` {kind, armed}; `renewal_ping` {days_bucket}; `approval_answered` {decision}. Never stored: URLs, listing text, names, phones, emails, IPs, visitor ids. It is a database change: write `supabase/patches/23_product_events.sql`, dry-run it, and ask the user before applying (CLAUDE.md).

## 4. Roadmap: 30 / 60 / 90 days, one person

**P0 verdicts.**
- **Vercel Hobby: not allowed for this product.** "Hobby teams are restricted to non-commercial personal use only"; commercial means any deployment used for financial gain of anyone involved, with examples "requesting or processing payment from visitors" and "advertising the sale of a product or service" (https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage; also https://vercel.com/docs/plans/hobby). Rigzea advertises paid plans and has a card checkout (`app.js:1313`), so it is commercial now. Pro is $20 per month per developer seat, viewers free, $20 usage credit included (https://vercel.com/pricing): about 53 GEL (ESTIMATE, 2.63 GEL/USD, teardown S57). No code changes; it adds per-minute cron, 1-day logs, more firewall rules, email support. COST_ANALYSIS.md schedules Pro only past 100 agencies: wrong. Also Supabase Free has no daily backups and pauses after a week idle; Pro is $25 with 7-day backups (https://supabase.com/pricing). Together about 118 GEL a month, the price of 3 Pro Agent plans.
- **"AI აღწერები": remove, do not build.** No LLM call exists in any API file I read. The nearest features are templates: `openPostGenerator` (`views-deals.js:1309`), `openSocialPostGenerator` (`app.js:1736`), `debrand()` regexes, the Telegram regex "NLP" parser; COST_ANALYSIS.md:15 says no paid LLM. The only AI text is `pricing/index.html:195` plus its i18n key. Replace with "Smart Match და კონტრაქტები". A real generator adds a paid API and Georgian quality risk for no evidenced demand.

| # | Item | Size | When | Why now | Metric it moves |
|---|---|---|---|---|---|
| R1 | Claims and copy truth pass: remove the AI line; `pricing:145` "directly from Rigzea" -> form fill; `extension/README.md:3`; drop "ჩემი კონტაქტის გარეშე" (`views-deals.js:1399, 1425, 1439`); soften "strictly complies" (`:1861`) to the sale-docs wording; two-currency claim -> PDF and posts; watermark claim -> uploaded photos; bot and in-app register ("სისტემაში", formal plural, "Serverless 24/7": `telegram.js`, `cron-reminders.js:40`, `link-event.js:37`, `core.js:228`); noindex,nofollow meta on found listings in `api/p.js` (meta, not robots.txt, so previews keep working) | S | 0-7 | code contradicts the copy | unbacked claims = 0 |
| R2 | Vercel Pro before KISA goes live; nightly data dump now, Supabase Pro at 3 paying orgs; fix COST_ANALYSIS.md | S | 0-7 | commercial use today; no backups on contracts and money | takedown and data-loss risk |
| R3 | Events table + import health + quick-listing fallback + import cap 30/h + daily blocked-rate alert to the founder via the existing bot | M | 7-30 | portal risk; cannot manage what is not logged | import success by portal; TTFV |
| R4 | First-run rebuild (G1-G5) | M | 15-30 | the aha is unreachable today | signup to `link_shared` median 5 min |
| R5 | Free Excel export on every plan: drop `guardFeature('export')` at `views-deals.js:922` and `views-admin.js:360`, update `plans.js` and the mirrored DB function (the pricing row is the offer strategist's) | S | 15-30 | export restriction breeds distrust (pattern 7); costs nothing | "can I leave" objection; trial to paid |
| R6 | Per-client link, named ping, deal link (SQL patch) | M | 30-60 | turns "someone opened" into "call Mariam" | `link_first_open` rate; share-to-open |
| R7 | Lease arms the reminder; "new lease from this one"; external lawyer review | S-M | 30-60 | the missing wire in wedge 2 | armed rate; renewals actioned |
| R8 | Extension "read this tab" + `html` param + unlisted Chrome Web Store listing | M | 61-90, trigger: blocked+parse above 20% for 3 days, or MyHome smoke test fails | portal fallback 2 | import success incl. fallback at 95% |
| R9 | Russian on client surfaces (`p/index.html:184` dict, `/p/s/`, `/approve/`), not the app UI | S-M | 61-90, trigger: 3 Batumi partners ask | foreign-buyer reach | share of links opened in RU |
| R10 | Deterministic description template named "მზა ტექსტი" | S | 61-90, trigger: 3 of 20 agents ask | only if demanded | listings with a description |
| R11 | Network measurement: footer link with `utm_source=listing_footer` (`app.js:213` already sends `RigzeaCampaign()`; check what it reads), opens by non-members, `colleague_text_copied`, weekly SQL view | S | 31-60 | step 2 moat rank 5 is unmeasured | footer clicks; signups by source |

Roughly 22 build days of about 60 available; the rest is the 20-agent outreach and support.
**Deliberately NOT doing:** two-way WhatsApp inbox; auto-submit publish (needs building status and condition stored first, plus portal terms; never a headline); AI or agents; bulk import of an agent's whole portal page (MyHome robots disallows `/makler`); full Russian app UI (L); in-app co-brokering network (L); dialer; new reports; a store app (a PWA manifest exists); a fourth portal; everything on the kill list.

## 5. Product truth table

| Claim | Status | Evidence | Code contradicts |
|---|---|---|---|
| Link import | SHIPPED, reliability unproven | `import-listing.js`, `_import-parse.js` (MyHome/SS read `__NEXT_DATA__`, Place uses regex) | "1 second": 8 s timeout, unmeasured; photos hotlinked (`views-portfolio.js:1454`) |
| Branded page | SHIPPED | `p/index.html`, `api/p.js`; name/logo Pro+, colour Agency (`views-admin.js:127-155`) | page shows one currency (PDF and posts show both); "watermarked": manual, skipped for imported photos (`views-portfolio.js:347-357`); indexable |
| Open notification | SHIPPED | bell + Telegram if linked; once per visitor and listing per hour; cap 20 (patch 14) | not per client; own signed-in views never count |
| Contracts | SHIPPED (Pro+) | lease KA/EN + handover annex; exclusive, brokerage, deposit, handover act (`views-docs.js`) | lease says "strictly complies" (`:1861`), sale docs say general template; not lawyer-reviewed; lease does not arm reminders |
| Reminders | SHIPPED (Pro+) | 30/14/3 days, daily cron | `lease_end` typed by hand |
| Owner approval | SHIPPED | `approve/index.html`: no account, expiry, noindex, KA/EN | copy says "property manager" |
| Colleague share | PARTIAL | copy-paste text, owner hidden by default | "without my contact" false; no recipient workspace |
| Publish to portals | PARTIAL | extension fills, agent presses publish; desktop Chrome, unpacked ZIP | `pricing:145`; README line 3 says "publishes" |
| Flat GEL pricing | SHIPPED; billing PARTIAL | `plans.js`; KISA button, webhook, manual activation tool | `app.js:1370` says activation is automatic: verify live |
| Georgian UI | SHIPPED | KA default, EN toggle | no Russian; bot in formal plural; "სისტემა" in strings |
| Smart Match | SHIPPED, deterministic | `views-deals.js:1019` | selection link Team-only |
| AI descriptions | does not exist | section 4 | `pricing:195` |

Not verified: the live database (RLS, `get_public_listing` fields), the KISA webhook, `/p/s/`, `RigzeaCampaign`, whether an owner's answer pings the agent.
