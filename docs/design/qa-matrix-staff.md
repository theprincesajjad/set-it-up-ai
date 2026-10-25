# Staff QA matrix (vqa-dash)

Every staff-facing screen against its Figma frame and research purpose. Built from a fresh seed, production build (NEXT_DIST_DIR=.next-vqa-dash, ports 4710 / 3710). Side-by-sides: `scratchpad/shots/vqa-final/staff/sbs-*.png`; raw shots `scratchpad/vqa-staff/raw/<shop>/<route>-<width>[-dark].png`.

Light / dark columns: `shot` = captured at the widths listed. Review depth is stated per section below: frame rows were compared side by side; no-frame rows were reviewed from contact sheets for Pinecone at 1440 light and dark, and every route at 390 and on every other shop was checked for horizontal overflow by script (overX in the crawl logs), not eyeballed.

| # | Screen / state | Figma frame (file + PNG) | Width | Light | Dark | Purpose (research doc) | Result |
|---|---|---|---|---|---|---|---|
| 1 | Café counter, ready (scan first) · web /m/{id}/counter | cafes-retail/01-counter-ready.png (KJK4rcrFvzr83JKhWqzC4e) | 390 (+1440 shell) | shot | shot | Take a stamp in one step: scan or 4 digits (cafes-retail §4). | match |
| 2 | Mobile staff counter, ready · apps/mobile counter/index | cafes-retail/01-counter-ready.png | 390 | shot | shot | Same job on the Expo counter (cafes-retail §7.2). | match (frame draws a phone status bar; app does not) |
| 3 | Café counter, two matches | cafes-retail/04-counter-two-matches.png | 390 | shot | shot | Two members share the last 4 digits; tap one (cafes-retail §7.2). | match |
| 4 | Café counter, stamped | cafes-retail/05-counter-stamped.png | 390 | shot | shot | Show the stamp landed and offer Undo for 10 s. | fixed: web showed "1 stamp(s)" under the card; API breakdown now says "1 stamp" and the counter drops the line that repeats the big number (packages/shared/src/points.ts, CounterApp.tsx). Mobile counter: stamp-on-scan was ignored because counterAutoStamp never reached the counter program (state/counter.tsx) |
| 5 | Café counter, reward ready | cafes-retail/06-counter-reward-ready.png | 390 | shot | shot | Make Redeem the main action when a reward is owed. | match |
| 6 | Café home, 7 am | cafes-retail/02-home-7am.png | 1440 + 390 | shot | shot | Is today normal? Yesterday vs a typical weekday (cafes-retail §4). | fixed: hourly chart hidden when there is no history and it is morning; plural for rewards waiting. intentional difference: onboarding upsell card shows because Pinecone is on the free plan and active |
| 7 | Café home, at close (?mode=close) | cafes-retail/03-home-close.png | 1440 + 390 | shot | shot | How was today: visits, stamps vs redemptions, regulars who came in. | fixed: "Free drinks waiting · redeemed" pluralised. intentional difference: real seed data and the onboarding card |
| 8 | Rewards · stamp card setup | cafes-retail/07-rewards-setup.png | 1440 + 390 | shot | shot | One reward in three steps with a live pass preview. | match |
| 9 | Customers | cafes-retail/08-customers.png | 1440 + 390 | shot | shot | Who are my regulars, who is slipping, who has a reward. | match (VIP chip appears when the feature is on) |
| 10 | Promos | cafes-retail/09-promos.png | 1440 + 390 | shot | shot | Start a promo from a template; see its result. | intentional difference: template row above the tabs gives owners a starting point the frame omits |
| 11 | Messages · new text | cafes-retail/09a-messages.png | 1440 + 390 | shot | shot | Send a text to regulars who agreed (CASL). | fixed: composer opened on "Slipping away" even when it had 0 people; it now starts on the first audience with people (Composer.tsx). intentional difference: Pinecone is on the free plan, so Email is the channel and SMS is gated |
| 12 | Reports | cafes-retail/10-reports.png | 1440 + 390 | shot | shot | Heatmap of when people come in; rewards owed; retention. | fixed: 390 overflowed 128 px because the screen-reader table inside the heatmap was wider than the page; wrapped in an sr-only div (also HourlyShape, ReportMock) |
| 13 | Repair tickets board (Fix-It Phone Lab) | service-businesses/01-tickets-board-v1.png (UJMzzAEah7Kxm7LnKt68n5) | 1440 + 390 | shot | shot | See every repair by stage and what needs me now. | match |
| 14 | Ticket detail with quote approval (quote opened) | service-businesses/02-ticket-detail-v2.png (v1 superseded) | 1440 + 390 | shot | shot | Quote sent/opened, approve, photos, timeline. | match |
| 15 | Appointments calendar with staff columns (Bloom) | service-businesses/03-calendar-v2.png (v1 superseded) | 1440 + 390 | shot | shot | Who is free, drag to move, walk-in gaps. | fixed: 15-minute blocks were 14 px tall with clipped text and a resize grip on top; single-line compact block (AppointmentBlock.tsx) |
| 16 | Drop-off / pickup slots | service-businesses/04-dropoff-slots-v2.png (v1 superseded) | 1440 + 390 | shot | shot | Capacity per hour and who is booked. | match |
| 17 | Invoices and payment status | service-businesses/05-invoices-v2.png (v1 superseded) | 1440 + 390 | shot | shot | Who owes, who paid. | match |
| 18 | Rebooking and pickup reminders | service-businesses/06-rebooking-v2.png (v1 superseded) | 1440 + 390 | shot | shot | Remind regulars when due; remind customers to collect. | fixed: 390 overflowed by 1 px (grid had no single column track) |
| 19 | v1 of tickets-board | service-businesses/01-tickets-board-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 20 | v1 of ticket-detail | service-businesses/02-ticket-detail-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 21 | v1 of calendar | service-businesses/03-calendar-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 22 | v1 of dropoff-slots | service-businesses/04-dropoff-slots-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 23 | v1 of invoices | service-businesses/05-invoices-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 24 | v1 of rebooking | service-businesses/06-rebooking-v1.png | - | shot | shot | Earlier iteration; its v2 supersedes it. | intentional difference: superseded by v2 (same screen, fixes listed in the research doc) |
| 25 | Tiffin · Today | tiffin-catering-banquet/T1-dashboard-today.png (9LPYTB531RMBi05zWfqK0R) | 1440 + 390 | shot | shot | Count for the kitchen, the run, who needs a look. | match |
| 26 | Tiffin · Subscribers + record payment | tiffin-catering-banquet/T2-subscribers-record-payment.png | 1440 + 390 | shot | shot | Record an e-transfer in one panel. | match |
| 27 | Tiffin · Deliveries | tiffin-catering-banquet/T3-deliveries-run.png | 1440 + 390 | shot | shot | Mark the route out, send the driver link. | fixed: 390 overflowed 39 px (button row did not wrap) |
| 28 | Tiffin · Plans / Menus | tiffin-catering-banquet/T4-plans-menu-week.png | 1440 + 390 | shot | shot | Plans and the week's menu. | match |
| 29 | Tiffin · Revenue | tiffin-catering-banquet/T5-revenue.png | 1440 + 390 | shot | shot | MRR, cash in, still to come in. | match (platform fee line differs by seed data) |
| 30 | Driver route run (public /d/{token}, phone) | tiffin-catering-banquet/M1-driver-route-run.png | 390 | shot | shot | One stop at a time: navigate, call, delivered. | match |
| 31 | Catering pipeline | tiffin-catering-banquet/C1-caterer-pipeline.png | 1440 + 390 | shot | shot | Inquiry to done, money tiles. | match |
| 32 | Catering event detail (quoted) | tiffin-catering-banquet/C2-event-detail-quote.png | 1440 + 390 | shot | shot | Menu and pricing, payments, where it stands. | intentional difference: quoted events are locked, so fields read as disabled; frame shows the pre-send state |
| 33 | Banquet · availability | tiffin-catering-banquet/B1-banquet-calendar-booking.png | 1440 + 390 | shot | shot | Month grid with holds and a day panel. | match (seed has no November holds on Nawab) |
| 34 | How you get paid (payments) | tiffin-catering-banquet/P1-payments-decision.png | 1440 + 390 | shot | shot | Which payment methods the shop accepts. | intentional difference: frame is a decision table for the team; the page is the settings that decision produced |
| 35 | Restaurant home (Nawab Biryani House) | desi-restaurants/01-home-1440.png (L33XfLFzGJ4axXIrvCy04N) | 1440 + 390 | shot | shot | Open orders, coming up, needs you. | match |
| 36 | Orders + split bill | desi-restaurants/02-orders-split-1440.png | 1440 + 390 | shot | shot | One queue for every channel; split a bill. | match (queue shows all open orders; frame shows a focused subset) |
| 37 | Kitchen display | desi-restaurants/03-kitchen-1440.png | 1440 + 390 | shot | shot | Tickets by station, fire time, bump. | match |
| 38 | Menu · dietary and languages | desi-restaurants/04-menu-dietary-1440.png | 1440 + 390 | shot | shot | Halal, spice, four languages, cash price. | intentional difference: built page shows all dishes with the cash-price panel; frame shows a dish editor open |
| 39 | Pre-orders | desi-restaurants/05-preorders-1440.png | 1440 + 390 | shot | shot | Pots booked, what to cook, balances due. | match |
| 40 | WhatsApp inbox | desi-restaurants/06-whatsapp-1440.png | 1440 + 390 | shot | shot | Chats, order summary, pay link. | match |
| 41 | Reviews | desi-restaurants/07-reviews-1440.png | 1440 + 390 | shot | shot | Read hard feedback first, ask for reviews. | match |
| 42 | Festivals | desi-restaurants/08-festivals-1440.png | 1440 + 390 | shot | shot | Dates, plan, message in four languages. | match |
| 43 | Phone orders | desi-restaurants/09-phone-orders-1440.png | 1440 + 390 | shot | shot | Check, fix, confirm a drafted call. | match |
| 44 | BIA dashboard (Overview) | landing-and-network/bia-dashboard-1440.png | 1440 | shot | shot | Is the street healthy; board report. | match (real seed numbers; campaign list shows 4 rows vs 3) |
| 45 | BIA dashboard 390 | landing-and-network/bia-dashboard-390.png | 390 | shot | shot | Same on a phone with bottom tabs. | intentional difference: pill tab bar floats mid-page in a full-page screenshot; it is fixed to the viewport bottom on a device |
| 46 | Signup | merchant-onboarding/01-signup-390.png (HiEm7SKLAdqZ0sOM7slxZZ) | 390 + 1440 | shot | shot | One screen to the first stamp. | match |
| 47 | Setup guide, first stamp | merchant-onboarding/02-setup-first-stamp.png | 1440 + 390 | shot | shot | Give your first stamp; QR waits. | match |
| 48 | Home, activation view | merchant-onboarding/03-home-activation.png | 1440 + 390 | shot | shot | 1 of 25 members visited; first 30 days. | match |
| 49 | Vertical playbooks | merchant-onboarding/04-vertical-playbooks.png | n/a | shot | shot | Per-vertical start; data not a page. | intentional difference: frame documents the playbook table that lives in code (packages/shared/src/onboarding.ts); the page uses it on Home |
| 50 | Restaurant upsell at activation | merchant-onboarding/05-restaurant-upsell.png | 1440 + 390 | shot | shot | Founding offer once the restaurant is active. | match |
| 51 | Admin activation funnel | merchant-onboarding/06-admin-funnel.png | 1440 + 390 | shot | shot | Founder call list. | match |
| 52 | Rep · Today | rep-and-admin/rep-today.png (1MwoR2wKTKfBIeI4uBkWwr) | 390 | shot | shot | Calls due, website leads. | match |
| 53 | Rep · Street day | rep-and-admin/rep-streetday.png | 390 | shot | shot | Next shop card, outcomes. | match |
| 54 | Rep · Pitch and outcome | rep-and-admin/rep-pitch.png | 390 | shot | shot | Two-minute pitch with live proof. | fixed: pitch lines were 14 px; set to 17 px like the frame so they can be read aloud outdoors (rep/day/page.tsx) |
| 55 | Admin · Today | rep-and-admin/admin-today.png | 1440 + 390 | shot | shot | Pace, MRR, at-risk shops. | fixed: at-risk list showed 18 shops and stretched the page; shows 6 with "All 18" (admin/page.tsx) |
| 56 | Admin · Merchant | rep-and-admin/admin-merchant.png | 1440 + 390 | shot | shot | Money, charge mode, follow-ups, audit. | fixed: audit trail listed 20 rows; shows 8 with a link to the whole log |
| 57 | Admin · Areas | rep-and-admin/admin-areas.png | 1440 + 390 | shot | shot | Launch calendar and perks. | intentional difference: built page adds perks and BIA details; frame is the calendar only |
| 58 | Dashboard · Counter page (shell) | none | 1440 + 390 | shot | shot | Same counter inside the dashboard. | match |
| 59 | Dashboard · Ads | none | 1440 + 390 | shot | shot | Sponsored placements (hidden until ga). | match: teaser is one title, one line, one state |
| 60 | Dashboard · Ads new / detail | none | 1440 + 390 | shot | shot | Create a sponsored ad. | match: teaser (feature hidden) |
| 61 | Dashboard · Billing & plans | none | 1440 + 390 | shot | shot | Show plans, never push. | match |
| 62 | Dashboard · Calendar on a non-salon shop | none | 1440 + 390 | shot | shot | Appointments. | match: teaser |
| 63 | Dashboard · Street campaigns | none | 1440 + 390 | shot | shot | Join the BIA's events. | match |
| 64 | Dashboard · Menu & catalog | none | 1440 + 390 | shot | shot | What customers can order ahead. | match |
| 65 | Dashboard · Customer detail (member with reward / without) | none | 1440 + 390 | shot | shot | Balance, activity, notes. | match |
| 66 | Dashboard · Customers side panel | none | 1440 + 390 | shot | shot | Quick stamp/redeem. | match |
| 67 | Dashboard · Customers import | none | 1440 + 390 | shot | shot | Migrate from another app. | fixed: locked state had two stacked headings; teaser now carries the only title |
| 68 | Dashboard · Discount cards | none | 1440 + 390 | shot | shot | Show-to-save cards. | match |
| 69 | Dashboard · POS & integrations | none | 1440 + 390 | shot | shot | Connect tools. | fixed: "Mailchimp · Coming soon" row with nothing to press moved into the single quiet line |
| 70 | Dashboard · Webhooks & API | none | 1440 + 390 | shot | shot | Developers. | match: teaser |
| 71 | Dashboard · Invoices on a free shop | none | 1440 + 390 | shot | shot | Service invoices. | match: teaser |
| 72 | Dashboard · Locations & QR kit / Print kit | none | 1440 + 390 | shot | shot | Counter QR, print stand. | match |
| 73 | Dashboard · Message detail / Automations / Sent | none | 1440 + 390 | shot | shot | Results of one send. | match |
| 74 | Dashboard · Orders (café) | none | 1440 + 390 | shot | shot | Order-ahead queue. | match |
| 75 | Dashboard · Promo detail (live / ended) and new | none | 1440 + 390 | shot | shot | Edit or review a promo. | match |
| 76 | Dashboard · Rebooking on a free shop | none | 1440 + 390 | shot | shot | Teaser. | match |
| 77 | Dashboard · Services & prices, Tickets new/settings, Slots (non-service) | none | 1440 + 390 | shot | shot | Service tools. | match: teaser or table |
| 78 | Dashboard · Settings (profile, hours, tax, counter, privacy, danger) | none | 1440 + 390 | shot | shot | Shop settings. | match |
| 79 | Dashboard · Setup guide (every step) | none | 1440 + 390 | shot | shot | Five steps to live. | match |
| 80 | Dashboard · Staff | none | 1440 + 390 | shot | shot | Invite, PIN, language. | match |
| 81 | Dashboard · Restaurant: menu languages, more, catering tab calendar, banquet bookings/halls, tiffin routes | none | 1440 + 390 | shot | shot | Restaurant tools not in a frame. | match on Nawab/Zeenat/Shree shots; Growth shops see a tier teaser for Pro modules |
| 82 | Dashboard · Ticket intake / declined / ready, tickets list, past | none | 1440 + 390 | shot | shot | Other ticket states. | match |
| 83 | Dashboard · Verticals not framed: Bloom (salon) and Sarson Dhaba (Starter) home, orders, counter | none | 1440 + 390 | shot | shot | Each vertical's start. | match: same components; Sarson shows only unlocked modules |
| 84 | Rep · Leads list, lead detail, Shops, shop detail, QR kit, New (9 steps), Sign up (2 min) | none | 390 | shot | shot | Field work. | match |
| 85 | Admin · Merchants list, Costs, Rollout, Onboarding funnel, Ads review, Users, Audit log, Campaigns | none | 1440 + 390 | shot | shot | Founder tools. | fixed: Audit log table overflowed the page by 308 px at 390; scroll now inside its panel (audit/page.tsx) |
| 86 | BIA · Shops, Reports, Print report, Campaigns, Campaign detail | none | 1440 + 390 | shot | shot | BIA tools. | match |
| 87 | Mobile counter · staff sign-in, shop/location picker | none | 1440 + 390 | shot | shot | Counter mode entry. | match |
| 88 | Mobile counter · keypad, two matches, member found, redeem picker, redeem code | none | 390 | shot | shot | Award and redeem. | fixed: stamp-on-scan flag was dropped (see counter row above) |
| 89 | Mobile counter · Today, menu, settings, kiosk (phone and tablet), kitchen, order, scan, pin | none | 390 / 1180 | shot | shot | Day summary and modes. | match |

## Counts

- match: 61
- fixed: 15
- intentional difference: 13
- total rows: 89

## Notes
- Figma file URLs are in each docs/research/<slug>.md. Section letters: A café, B service, C tiffin/catering/banquet, D desi restaurants, E BIA, F onboarding, G rep/admin frames, H-K routes with no frame.
- Superseded v1 frames are listed so every PNG appears once.
- Not done: a full eyeball pass of every no-frame route on the non-café shops and at 390 in dark; those rows say `match` on the strength of shared components plus the overflow check.
