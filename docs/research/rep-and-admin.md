# Rep and admin consoles: the internal tools that run the business

Market slug: `rep-and-admin`. Written Oct 24, 2026 (phase 3: research, design and build in one pass). Team `ops`, ports 4630/3630.

Figma file: https://www.figma.com/design/1MwoR2wKTKfBIeI4uBkWwr ("Local Loyalty — Rep and Admin consoles", page 1). Frames: `Rep / Today (390)`, `Rep / Street day (390)`, `Rep / Pitch and outcome (390)`, `Admin / Today (1440)`, `Admin / Merchant (1440)`, `Admin / Areas (1440)`. Each frame has a yellow "WHY" note beside it. PNG exports: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/rep-and-admin/`. Built pages beside the frames: `.../scratchpad/shots/ops-build/`.

Evidence tags: (S) sourced with a link, (C) read from our code or docs, (E) estimate or practice we could not source, validate in the pilot.

## 1. Who this is for

Two users, one product, very different days.

**The field rep (and, in the founder's plan, the founder himself).** In the plan the founder sells by phone and "AI onboarding agents" do setup, with no paid reps (C: `docs/finance/launch-plan-economics.md` Part A). The one field job left is the **street day**: one person visits all of an area's ~30 shops in one day, at $200 + ~$20 transit, or $0 when the founder does it (C: same doc, A1). The alternative plan (Part B) uses student reps at minimum wage with a $50 signing and $25 activation commission (C: `repApi.REP_COMMISSION`). A rep is standing on a sidewalk with a phone, one hand free, patchy signal inside older plazas (E), talking to an owner who is busy and often not English-first (C: leads carry `language` en/hi/ur/pa).

**The founder, daily.** Needs to know in under a minute: am I on pace (the plan is 109, 248, 400 shops at the end of months 1, 2, 3 (C)); what am I earning (MRR, fee revenue); which street is stalling; which shops need a call today; what each shop costs me. The finance doc says 400 by month 3 needs 31 of 35 storefronts to sign in every area and 5 to 7 signed shops a working day (C), so a wrong read of the pace is the most expensive mistake available.

## 2. Evidence

- **Field sales tools.** Spotio is built for door-to-door canvassing: "Download My Day" pre-loads an area for 24 hours of offline work with full activity logging, routes up to 150 stops, hands off to Google Maps or Waze, and has territory layers (S, vendor page: [Spotio vs Badger Maps](https://spotio.com/compare/badger-maps-vs-spotio/)). Badger Maps targets B2B territory reps, optimizes routes with live traffic, and starts at $58 per user per month (S, [Badger alternative page](https://www.badgermapping.com/alternative/alternatives-to-spotio/), [Spotio blog](https://spotio.com/blog/badger-maps/)). Both comparisons are vendor-authored and each says the other's offline mode is weaker, so treat them as marketing. Lesson that holds either way: offline logging and "today's list, already ordered" are table stakes for a street day.
- **Costs we must show the founder.** Twilio's Canada SMS price is $0.0083 per segment at base volume, plus carrier fees, per segment (S, [Twilio Canada SMS pricing](https://www.twilio.com/en-us/sms/pricing/ca)). Meta charges WhatsApp per message since July 1, 2025, with utility templates free inside an open 24-hour customer-service window (S, [Meta pricing](https://developers.facebook.com/docs/whatsapp/pricing)). A third-party rate card lists Canada at about US$0.0034 per utility message and US$0.025 per marketing message (E, not verified against Meta's calculator). The finance model uses $0.022 per SMS segment and we use 0.5 cents per WhatsApp message as a clearly-labelled estimate (C: `UNIT_COSTS` in `packages/shared/src/launch.ts`).
- **Admin patterns.** Stripe's customer and payment pages put actions top-right, a timeline in the main column and details in a right column, with an internal-note step on every balance change (S: Mobbin refs below). Airwallex and Mixpanel put MRR, active customers and churn as the first row of billing dashboards (S: Mobbin).
- **What the code already does (audit).** Table below.

### Audit of the current build: keep, change, cut

| Component (before) | Job it does | Verdict and reason |
| --- | --- | --- |
| Rep Today: "Visits and follow-ups planned" list | Leads whose next step is due | **Change.** Became the Today stack (street day, calls and setups due, website leads, follow-ups). One screen answers "what do I do next". |
| Rep Today: "Check-ins due" panel | Day 7 and day 30 calls | **Keep** the job, **change** the shape: oldest first, capped at 8 with "show all" (the seed has 28 shops all due, a real founder-day problem). |
| Rep Today: neighbourhood density bar | none for a rep on the street | **Cut.** Density matters to the admin (rollout gates), which already has it. |
| Leads board and list | Pipeline | **Keep.** Added Source column (website, street, phone, referral, BIA) and setup date. |
| Lead detail | Activity log | **Keep.** |
| `/rep/new` nine-step wizard | The 20-minute done-for-you visit | **Keep** for the full setup, **add** `/rep/signup` (four fields, about two minutes, QR on screen). A street rep cannot run a nine-step wizard at a counter. |
| My merchants (+ detail, kit) | Activation tracking and QR print | **Keep.** Renamed "Shops". |
| Earnings | Commission under Part B | **Keep, demote** to the account menu. In Part A (no paid reps) it is not a daily screen. Open item: hide when the founder confirms plan A. |
| Admin Network page: 4 stat tiles, gauges, weekly visits, by neighbourhood, by type | Network density and rollout gating | **Change.** Tiles replaced by pace, MRR, fee revenue, activation, cost per shop. Gauges and weekly visits **kept** (they gate paid tools). "By type" **cut** (no decision depends on it); "by neighbourhood" became the funnel by area. |
| Rollout, Merchants, Users, Ads review, BIA campaigns, Audit | Feature gates, support, roles, ad moderation, BIA billing, audit | **Keep.** Audit gets the new action prefixes. |
| Neighbourhoods and perks | BIA info, perks | **Change.** Gains the launch calendar: opens on, street day, who walks it, shop target. |
| Merchant detail | Status, staff, overrides | **Change.** Gains money, charge mode, follow-up calls, support session. "Locations" and "SMS used" tiles **cut** (cost now shows texts and WhatsApp together). |
| Implicit admin impersonation | Support | **Change.** It worked silently and the banner said "Changes are logged" with no log behind it. Now a reasoned 30-minute support session plus an audit row for every write. |
| Campaign mark-paid, draw winner, manager add or remove | Money and prize actions | **Change.** They were not audited at all; each now writes one row. |

## 3. Jobs to be done

Rep (ranked by frequency times pain):
1. Know today's shops in walking order without planning. (Every shop, all day.)
2. Pitch in two minutes with proof that is true today.
3. Log what happened with one tap and never lose it when the signal drops.
4. Sign the shop up on the spot, with the QR code in the owner's hands.
5. Know which shops to call on day 7 and day 30, and which setups are booked.
6. Pick up website leads before they go cold.

Founder:
1. Am I on pace for 400 shops by month 3, and for the 5 areas a month?
2. What is MRR and fee revenue this month, and what does a shop cost me?
3. Which street is stalling and which shops are at risk today?
4. Help a shop (support) without being able to do it silently.
5. Change who is merchant of record for a shop, with a reason on file.
6. Plan next month's areas and who walks them.

## 4. What we build and why

| Screen or component | Job | Data (computed from) |
| --- | --- | --- |
| Rep Today stack | R1, R5, R6 | `GET /v1/rep/today` |
| Street day: next-shop card (Call, Navigate, Pitch, five outcome buttons) | R1, R3 | `GET /v1/rep/street-day`; `POST /v1/rep/leads/:id/outcome` |
| Walking order (odd side up, even side back; nearest neighbour when 80% of stops are pinned) | R1 | `orderStreetDay` in `packages/shared/src/launch.ts` |
| Offline queue ("3 to sync"), idempotent by `clientId` | R3 | `apps/web/src/lib/rep/outcomeQueue.ts`, `POST /v1/rep/outcomes/sync` |
| Pin this door | R1 (better order next time) | `leads.lat/lng` |
| Pitch sheet with live proof | R2 | `GET /v1/rep/proof` (active shops, members, 2+ shop share, visits in 7 days; falls back to network numbers when the area has fewer than three shops) |
| Setup call outcome (date, phone/WhatsApp/video) | R5 | `leads.setupAt/setupChannel` |
| Two-minute signup | R4 | existing `POST /v1/rep/merchants` |
| Admin Today: pace card | F1 | `planPace` against shops not closed |
| Admin Today: MRR, fees, activation, cost per shop | F2 | `subscriptions`, `orders`/`invoices`/`tiffin_charges` fees, `merchants.activatedAt`, usage counters |
| Funnel by area | F3 | `leads` by stage, `merchants` per area, check-ins due |
| Shops at risk (payment failed, setup stalled, quiet, slow, SMS cap) | F3 | `atRiskShops` |
| Costs page | F2 | per-shop texts, WhatsApp, hosting vs plan + fees |
| Merchant money, charge mode, follow-ups, support session | F4, F5 | `GET /v1/admin/merchants/:id/money`, existing charge-mode route (reason added), support sessions |
| Areas calendar | F6 | `neighbourhoods.opensOn/streetDayOn/streetDayRepId/targetShops` |

## 5. What we deliberately do not build

- **Map view and live route re-optimisation.** Walking one street needs an order, not turn-by-turn; Navigate hands off to Google Maps. A map would add a geocoding vendor for no job.
- **Gamified leaderboards (Spotio-style).** The plan has one or two people on the street.
- **AI call scripts and an in-app dialer.** The founder phones from his phone; tel: links are enough. The "AI onboarding agents" in the plan are not built here.
- **Rep payroll.** Commission display stays; payment runs outside the app.
- **Impersonation by "log in as the owner".** A support session gives access with a reason and audit; we never mint the owner's session.
- **Per-message SMS/WhatsApp cost ledger.** The counters are monthly credits; cost is an estimate from them. A true ledger needs provider webhooks (open item).

## 6. Design

Figma frames listed at the top. Mobbin references (all cited from the Mobbin MCP search):
- Route and stops list on a phone: [Google Maps multi-stop route](https://mobbin.com/screens/f113e866-20ce-4b90-b9ef-dde690ec3c59), [Bolt route editor](https://mobbin.com/screens/51e7a47c-e645-4dc4-bde7-114ece60484e), [My BMW edit route](https://mobbin.com/screens/21755b89-6b29-4d7d-b2c7-74e81ee38169). Taught us: one ordered list with a total, drag to reorder, and a handoff to the maps app. We kept the list and dropped drag (order is computed).
- Today with the next visit as a card: [Jobber home](https://mobbin.com/screens/e4979820-6f4e-4695-a160-4c243602d36c). Taught us: the next appointment is a card with name, address and a status, a bottom tab bar, and one floating create action. We used the card and the tab bar, and put "Sign up a shop" in the header.
- Lead detail with call and note: [Jobber client](https://mobbin.com/screens/7c66f8f1-8ea8-4582-98bf-a0f88dcccf56), [Telegram profile action row](https://mobbin.com/screens/859bbc08-aa4d-4fec-9984-d460a066cc7f), [Shopify customer](https://mobbin.com/screens/eef0daad-490b-4e23-862c-2f97c11f1b6a). Taught us: Call sits in a row of three equal actions directly under the name.
- Pipeline fields: [monday.com lead card](https://mobbin.com/screens/991ca978-afc2-4835-9792-144369e6e502): "next action item" and "last contact date" are the two fields that matter; we already have both (`nextActionAt`, `lastActivityAt`).
- Founder overview: [Mixpanel MRR dashboard](https://mobbin.com/screens/22eb1fe3-2c20-4547-9292-49520fc7feee), [Airwallex billing](https://mobbin.com/screens/d6c002f4-9360-45b8-8bf3-bec74f58feed), [Whop analytics](https://mobbin.com/screens/b090486e-df14-4907-9b42-2a0294d13d19), [Jobber insights](https://mobbin.com/screens/b2e76258-0ede-40d5-930e-551365cffad9). Taught us: MRR is the first number, a delta chip beside each, a right-hand activity column (we used the at-risk list instead, because the founder acts on it). Mixpanel's MRR-by-plan split became "Plus 6, Pro 3" under MRR.
- Admin detail: [Stripe customer](https://mobbin.com/screens/1a4aa88b-e0be-49b2-a87f-1264e0b5e786), [Stripe payment timeline](https://mobbin.com/screens/bd229058-a354-43cf-a92f-2680531ba5a8), [Stripe credit-balance adjustment dialog](https://mobbin.com/screens/731c4495-3c95-42b2-9502-5a1b60ab96eb). Taught us: a sensitive change opens a small dialog with an "internal note", and the page has an activity timeline. Our charge-mode and support dialogs copy that, with the note called "Reason (audit log)" and required.

Visual language: unchanged (monochrome, hairlines, one accent). The accent appears only for "needs a person now": an unassigned website lead, behind-plan chip, stalled shops.

## 7. Build spec and status

Everything below is built (see the report for check counts). Migration: `packages/db/migrations/0015_repadmin.sql`.

**Schema** (`packages/db/src/schema.ts`): `neighbourhoods.opens_on, street_day_on, street_day_rep_id, target_shops`; `leads.source, lat, lng, setup_at, setup_channel`; `lead_activities.client_id` (unique); table `support_sessions`.

**Shared**: `packages/shared/src/launch.ts` (`LAUNCH_PLAN`, `UNIT_COSTS`, `AT_RISK`, `planPace`, `messagingCostCents`, `orderStreetDay`, `parseStreetAddress`); contracts in `api/rep.ts` and `api/admin.ts`; billing `setChargeModeBody` gains optional `reason`.

**API**
- `GET /v1/rep/street-day?neighbourhoodId`, `GET /v1/rep/today`, `GET /v1/rep/proof`, `POST /v1/rep/leads/:id/outcome`, `POST /v1/rep/outcomes/sync` (up to 100). Files: `services/rep-field.ts`, `routes/rep/index.ts`.
- `GET /v1/admin/overview`, `/v1/admin/at-risk`, `/v1/admin/costs`, `/v1/admin/merchants/:id/money`, `POST /v1/admin/merchants/:id/support-sessions`, `POST /v1/admin/support-sessions/:id/end`, `GET /v1/admin/support-sessions`. Files: `services/admin-ops.ts`, `routes/admin/index.ts`.
- Audit: `support.session_started|ended`; `support.write` (admin) and `rep.write` (a rep on their own shop) on every non-GET request through `requireStaff` (`lib/auth.ts`); `billing.charge_mode_changed` now carries the reason; `campaign.marked_paid|winner_drawn|manager_added|manager_removed`.
- Admin merchant detail returns `checkIns`; `POST /v1/rep/merchants/:id/check-ins` works for shops with no rep when an admin logs the call.
- Neighbourhood update validates that the street-day rep is a rep or admin.

**Web**: rep `/rep` (Today), `/rep/day`, `/rep/signup`, nav and bottom tabs; admin `/admin` (Today), `/admin/costs`, areas on `/admin/neighbourhoods`, money, charge mode, follow-ups and support on `/admin/merchants/[id]`, audit prefixes.

**Acceptance checks**: `apps/api/test/rep-admin.test.ts` (14), `packages/shared/test/launch.test.ts` (6), `apps/web/test/rep-street-day.test.ts` (8), `apps/web/e2e/rep-admin.spec.ts` (5).

## 8. Open items

1. Founder to confirm plan A (no paid reps); then hide Earnings and the commission fields.
2. MRR counts the subscription row only. Add-on revenue (WhatsApp packs, extra location) is not in MRR yet.
3. SMS and WhatsApp cost is estimated from monthly credit counters at assumed unit prices. A true ledger needs Twilio and Meta usage webhooks.
4. Rep and street-day screens are English only (internal tools). If Hindi, Urdu or Punjabi-speaking reps join, translate with the glossary.
5. Leads have a pin only when a rep taps "Pin this door"; there is no geocoder, so imported leads fall back to address order.
6. Support sessions are advisory: they record reason and window, and writes are audited, but the API does not yet refuse an admin write outside an active session (that would break existing admin flows and tests).
7. The "Activation" admin page (another team) and this Today page both show activation; reconcile once both settle.
