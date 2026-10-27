# Barbershops, threading bars and beauty supply stores

Market slug: `barbers-beauty`. Written Oct 27, 2026 by the barb team (phase 3: research, Figma, build and verify in one pass). Builds on `service-businesses.md` (the appointment calendar, services, deposits, tips and rebooking already exist and are reused, not rebuilt), `fitness-studios.md` (the pattern for consent text, waitlists and a no-show rule) and `docs/business/pricing.md`.

Figma file: https://www.figma.com/design/UL6WbNqEhoJVZOZMVfsZox ("Local Loyalty — Barbershops, threading bars and beauty supply"). Frame PNGs: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/barbers-beauty/`. Build screenshots beside them: `.../scratchpad/shots/barb-build/`.

Evidence tags: (S) sourced with a link, (C) read from our code, (E) estimate or practice we could not source, validate in pilot, (V) legal or vendor point to verify with counsel or the vendor before relying on it.

## 1. Who this is for

**Barbershops.** Two to eight chairs. Many are walk-in first: the line at the door is the product, and "how long?" is the question asked most. In the GTA the clientele is local and community-led: South Asian (Punjabi, Hindi, Urdu, Tamil), Caribbean and Black-owned shops with a following by barber, Middle Eastern and Korean shops with more booking. Busy times are Friday evening and all day Saturday, and the days before Eid, Diwali, weddings and graduations (E for Toronto; see 2.4). Customers come as families: a father with two boys.

**Barbers inside a shop** are paid in three ways. A commission employee splits each service with the shop. A chair (booth) renter pays the shop a flat rent, sets their own prices and keeps their own clients. A few shops mix both. The owner needs to know who is owed what each week; the renter needs privacy from the other renters about their client list.

**Threading and eyebrow bars** are usually in a mall or plaza, run by two to six threaders, and are walk-in by nature (15 minute services, a queue at a kiosk). Customers rebook every 2 to 4 weeks (S, low quality, in `service-businesses.md`). Same queue as a barbershop, with services and prices on a card, mostly cash and tap, few tips.

**Beauty supply stores** sell hair care, colour, tools, extensions and wigs to consumers and to stylists and barbers buying for work. Loyalty is by product and by trusted staff advice. Canadian rules on claims apply to what they say in texts and promos (2.6).

What they use and pay today (US dollars unless noted, vendor pages move, re-check before quoting) (V):

| Tool | What it does for this market | Price and notes | Source |
| --- | --- | --- | --- |
| Squire | Barbershop booking and POS. Walk-in scheduling and wait lists, tips feeding payout calculations, an "Auto Payout" feature that handles commission and booth-rent distributions | Sources disagree: $30 a month Standard per chair, $50 for a single location, or $100 flat | [GetApp](https://www.getapp.com/barbershop-software/a/squire), [Squire POS page](https://www.getsquire.com/features/pos-payments), [Capterra](https://www.capterra.com/p/153899/Squire-Barber-Appointment-App/) |
| theCut | Client app to find and book barbers; barbers take payment instantly, booked or walk-in | Promotional pages only; no walk-in queue found | [theCut](https://thecut.co/client-features), [for barbers](https://thecut.co/landing-page/barbers-favorite-features) |
| Booksy | Booking, reminders, payments; "Boost" marketplace fee (see `service-businesses.md`) | About US$30 for the first user, $20 per extra staff | [Booksy blog](https://biz.booksy.com/blog/what-app-do-barbers-choose-the-best-booking-app-for-barbers) (vendor) |
| Waitwhile | General virtual queue and waitlist with text alerts | From US$29 flat, free tier | [Capterra](https://www.capterra.ca/software/152494/waitwhile) |
| eWAIT, Waitlist Me | A light waitlist for walk-in shops such as barbershops | From US$9 and US$19.99 a month | [G2](https://www.g2.com/products/ewait/discuss), [Capterra](https://www.capterra.com/p/177811/Waitlist-Me/) |
| Sally Beauty (supply loyalty) | Points on every purchase; Canadian terms: 10 points per $1, a higher tier once spend passes $200 a year, points expire after 12 months with no purchase | Free to join | [Sally Beauty Canada terms](https://www.sallybeauty.ca/about/rewards-terms/) |

What this means for us: a queue is sold separately (US$9 to $29) or inside a barber suite (Squire). We already have the calendar, tips, deposits and rebooking. The gap is a walk-in line, barber-level reports and the family. QueueWise and a Squire public price page were not found; do not quote them.

## 2. Evidence

### 2.1 Walk-ins and appointments

- Vendor-quoted splits disagree. One roundup says about 57% of barbershop visits are still walk-ins and appointments grew from 27% (2021) to 43%, with no primary source; another aggregator claims 78% prefer walk-ins; a software vendor's own platform data says 77.5% of bookings made through it were online (a different measure: booking channel inside its customers). Treat "55 to 60% walk-in, rising appointments" as a rough range (S, E). [SchedulingKit](https://schedulingkit.com/statistics/barbershop-industry-statistics), [Gitnux](https://gitnux.org/barber-shop-industry-statistics/), [Mangomint](https://www.mangomint.com/blog/barbershop-booking-statistics/), [Zenoti](https://www.zenoti.com/thecheckin/barbershop-walk-in-vs-appointment-guide).
- Product reading: both flows must live in one place. A walk-in is an appointment that starts now (C: `source = walk_in` exists), so the queue feeds the same calendar, checkout, tips and loyalty.

### 2.2 Chair rental, commission and tips

- Commission shops typically keep 40% to 60% of services (vendor, S, V); a true renter sets prices and hours, keeps their clients, pays a set rent and supplies products. Mixing control and rent is a misclassification risk. These are US sources. [Vagaro](https://www.vagaro.com/en-au/learn/commission-vs-booth-rental-for-barbers-which-model-actually-pays-more-in-2026), [SalonRenter](https://salonrenter.com/booth-renter-or-employee-the-control-test-salon-owners-should-understand/).
- Canada: a QuickBooks Canada article says self-employed hairstylists and barbers who rent a chair get special treatment from the CRA and that the salon owner may owe the employer share of EI for them (V). We found no CRA primary page for the employee-or-contractor test in this session. [QuickBooks Canada](https://quickbooks.intuit.com/ca/resources/taxes/tips-for-independent-beauty-industry-workers/). Product consequence: we report, we do not classify. The payout report never says "contractor" or "employee"; it says "Chair rental" and "Commission", the owner's words.
- Squire's auto payout shows the need: payouts based on commission or booth rent, tips included, from the same checkout. We copy the report and not the money movement: no payroll, no T4A, no payout transfers (consistent with `service-businesses.md` section 5, now narrowed: we build the report, still not the payment).
- Tips: Canadians say 10% is appropriate for barbers and hairstylists; 45% would tip 15% at a salon or barber and 23% would tip 5% or nothing (S, `service-businesses.md`). Cash tips are common (E). The existing tip goes to a named staff member (C: `invoices.tipStaffId`) and the counter checkout takes a tip amount (C), so a cash tip at the till is recorded.

### 2.3 Loyalty is to the barber

- Barbers carry their clients; theCut markets "find and book your barber". Our own finding in `service-businesses.md` is that rebooking should "book the same service and stylist" (C: the rebooking nudge links `staff=`). We have no stored "my barber". We add one: set from the last completed visit, changeable by the customer.
- For a renter, "my barber" is the barber's regular list. It must not leak to other barbers (see privacy rule in 4.3).

### 2.4 Rushes

- We found no Toronto source on barber demand before Eid or Diwali. What exists is from the Gulf: one Jeddah barber says about 30 customers a day normally and 70 or more at Eid al-Fitr; Bahrain and Jordan barbers say the busiest period is the final two days before Eid-al-Adha and some move to bookings only. [Arab News](https://arabnews.com/node/2290381/), [Daily Tribune Bahrain](https://www.newsofbahrain.com/bahrain/134102.html), [Jordan News](https://www.jordannews.jo/Section-109/News/Irbid-shops-feel-rush-ahead-of-Eid-Al-Adha-5197) (S, not GTA). Ontario shows long lines are normal in a rush: two-hour waits made the news in Kingston [Narcity](https://www.narcity.com/en-ca/news/toronto/dinos-barber-shop-in-kingston-had-people-waiting-2-hours-in-line-to-get-a-cut) (S).
- Product reading: the queue has a switch to stop taking walk-ins and a cap on people waiting (default 30), and an honest estimate. We do not claim GTA peak dates. Validate with five pilot shops.

### 2.5 Kids, families and consent

- OPC interpretation: consent for children under 13 should come from a parent or guardian in all but exceptional cases; for 13 to 17, consent counts only if the organization has taken account of maturity. PIPEDA itself sets no age. [Hunton summary of the OPC report](https://www.hunton.com/privacy-and-information-security-law/canadian-privacy-commissioner-issues-report-childrens-educational-apps), [BLG](https://www.blg.com/en/insights/2017/09/the-opc-publishes-its-report-on-consent) (S, secondary; V against the OPC text).
- Product reading: a family member is a first name and nothing else (no birth date, phone, photo, school, address). A parent adds the person and ticks the consent line; removing the member deletes the name. The shop sees a first name on the queue and the calendar. Points go to the parent's card.
- Mobbin: family screens in other apps teach a "Family" section with an add button (below).

### 2.6 Beauty supply: claims and labels

- Health Canada: a cosmetic product cannot carry therapeutic claims; claims in the name, on the label, in advertising or on a company website can make it a drug or natural health product. [Common issues when submitting a notification](https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/notification-cosmetics/common-issues-submitting.html) (S). Manufacturers and importers notify within 10 days of first sale; that is the brand's duty, not the retailer's. [Guide for cosmetic notifications](https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/notification-cosmetics/guide.html) (S).
- Labels: ingredient list in INCI names, other label text in English and French, under the Food and Drugs Act, the Cosmetic Regulations and the Consumer Packaging and Labelling Act. [Health Canada: cosmetic advertising, labelling and ingredients](https://www.canada.ca/en/health-canada/services/cosmetics/cosmetic-advertising-labelling-ingredients.html) (S). That is the supplier's duty; a retailer sees it when relabelling or selling imports (V).
- We found no source on where a "hair growth" claim falls (V, ask counsel). Product reading: be conservative. The shop's own texts, promo titles and reward names are checked for treatment words (stops hair loss, cures dandruff, regrows hair, treats eczema, heals, prevents balding, clinically proven to treat) and the shop is told why. The check is a guard for shops with the `beauty_supply` vertical. It is not legal advice.
- Loyalty: Sally Beauty Canada: 10 points per $1, points expire after 12 months idle (S). Our existing points per dollar, categories (no-earn per category, C) and digital discount cards (C) cover "points on products" and a "stylist pro card". Do not build a second loyalty type.
- Personal service settings: Ontario Reg. 136/18 covers hairstyling, barbering, nails and aesthetic services; barber-only settings have some record-keeping exemptions; a threading business probably sits in the aesthetics category in Toronto's BodySafe list (V). The health unit must be notified 14 days before opening or adding a service. [Toronto Public Health 2018 letter](https://www.toronto.ca/wp-content/uploads/2018/09/9713-tph-pss-operators-legislation-mohltc-July-2018.pdf). This affects client contact records. Our queue stores a first name and a phone for one text and keeps it only as long as the customer record (C: the customer record already exists), so it does not create a new register (V).
- Messaging: the "you're next" text is a transactional text the customer asked for with a ticked box at join (CASL: the express request is on the join form). It carries the shop name and STOP, no promotion (V; same reasoning as appointment reminders in `service-businesses.md` 2.2).

## 3. Jobs to be done

Ranked by frequency times pain. O = owner, B = barber, C = customer.

1. **O/B, all: "Run the line at the door."** Every walk-in shop, every Saturday. Who is next, for whom, how long.
2. **C: "How long, and can I wait somewhere else?"** A position and an estimate, and a text when next.
3. **B: "I pick who I take next."** Clients ask for a barber; the barber, not a rule, picks.
4. **C: "My barber."** Same barber each time, pre-filled when queueing or booking.
5. **O: "Who is owed what this week?"** Commission and rent, tips included, without a notebook.
6. **B (renter): "Keep my clients mine."** No view of other chairs' clients and prices.
7. **C (parent): "Get the boys cut together."** Family on one card, kids' cuts, first name only.
8. **O, all: "Take the tip and the payment once."** Exists (calendar checkout with a tip).
9. **O, beauty supply: "Bring the stylist back for the reorder, inside the claim rules."** Points on product categories, a pro card, and a words check.
10. **O: "Stop no-shows."** The queue's no-show rule (skip, then remove). Appointments have a fee already.

## 4. What we build and why

### 4.1 Audit of the current build against these jobs

| Area | Today (C) | Verdict | Reason |
| --- | --- | --- | --- |
| Calendar with staff columns, walk-in button, checkout, tip to a named stylist | Built (`calendar`, `appointments*.ts`) | Keep | Job 8. The queue starts a walk-in appointment, so the rest is reused |
| Services and prices, staff hours, rebooking nudge | Built | Keep | Jobs 3, 4; threading bar uses the same services |
| Barber vertical template (8 stamps, "Free cut") | Built | Keep, add a kids' cut service and tip defaults in the seed | Stamps fit barbershops |
| "Walk-in" as an instant appointment with no line | Built | Change: add the queue in front of it | Job 1, 2, 3 |
| A staff member's own clients | Whole shop's customers are visible to any staff | Change: a renter marked "own clients only" sees only their chair | Job 6 |
| Preferred stylist | `requestedStaff` flag on one appointment only | Change: store "my barber" per customer and shop | Job 4 |
| Customer card with one person | One user = one card | Change: family members under the parent | Job 7 |
| Payout view | None; `invoices.tipStaffId` exists | Add a report, no money movement | Job 5 |
| Beauty supply vertical | Falls under `retail` | Add `beauty_supply` with product categories and a claims check | Job 9 |
| Marketplace commission, payroll, T4A, inventory, ratings, POS hardware, kiosk app, SMS blasts on the queue | Not built | Cut (section 5) | No job above needs them |

### 4.2 Components, each mapped to a job (frames in Figma)

| Frame | Component | Job | Why |
| --- | --- | --- | --- |
| 1 Walk-in queue (1440) | Stat strip: waiting, about N min, chairs taking walk-ins, served today | 1, 2 | The owner's "how long now?" in one block |
| 1 | Waiting list with Call and Skip per row; "Text sent" tag on next | 1, 3 | Barber picks; one text per person |
| 1 | Chairs column: each barber's state and one action (Done, Take a walk-in, Call next, Back on) | 1, 3 | One place per barber |
| 1 | No-show rule note | 10 | Skip: back two places once, then off the list. No fee, no card |
| 2 Door tablet (1024) | Wait panel + join form (name, phone, service, barber, family, consent, Join) | 1, 2, 4, 7 | A walk-in will not install an app. Same form as the phone |
| M1 Join the line (390) | Same fields from the shop page or QR | 2, 4, 7 | Join from the sidewalk |
| M2 You're in line (390) | Big position, estimate, ahead, change barber, leave | 2 | Stops "how long?" |
| 3 Payouts (1440) | Stat strip, per-barber table (model, services, tips, shop keeps, rent, taken home), CSV | 5 | Friday-night job |
| 3 | "What a renter sees" note and per-person setting in Staff | 6 | Privacy by default for renters |
| M3 My barber and family (390) | Stamp card counted across family, "My barber", Family list with consent line | 4, 7 | Kids' cuts count to the parent |
| 4 Beauty supply (1440) | Categories with earn, locked gift cards, stylist pro card, message check | 9 | Existing points and cards, plus the claims guard |

### 4.3 Rules the build enforces

- **Estimate.** Waiting time = (sum of the service minutes ahead + minutes left for people in the chair) divided by the number of chairs taking walk-ins, rounded up to 5 minutes. For a named barber: only that barber's queue and chair. Default 25 minutes per cut until the shop's own median (last 20 queue services) exists; kids' cut and beard have their own durations from the service list. Estimates are said as "about N min", never as a promise.
- **Order.** The list is ordered by when people joined; the barber can call anyone who asked for them or "any". Skip sends them back two places once; the second time they are marked no-show. Called but not arrived within 5 minutes (setting) the barber taps Skip. There is no automatic removal so nobody loses a place to a late text.
- **Text.** One text when they become next ("you're next, about 5 minutes") and one when called. English by default; the customer's language if a card exists (hi, ur, pa). Only to people who ticked the box, always with STOP. A guest's phone becomes a customer record by phone as the counter does today.
- **Privacy rule (renter).** A staff member with "own clients only" sees only: their own appointments, queue entries called to them or asked for them, their own payout row. They cannot open the customer directory.
- **Family.** A family member is `first_name` only, with the parent's consent time. At most 6 per parent. Their visits add stamps and points to the parent. The queue shows "Aiden" and the parent's name; the calendar shows the first name.
- **Beauty claims.** Shop texts, promo titles and bodies, reward names and card names for a `beauty_supply` shop are refused (422 `beauty_claims`) if they contain treatment claims from a fixed list. It tells the shop the phrase and why.

## 5. What we deliberately do not build

- **Payroll, payments to barbers, T4A or contractor classification.** We report the numbers the shop's accountant needs. Rent is displayed, not collected.
- **A marketplace or "find a barber" feed.** Network discovery is free listing already.
- **Rating or review prompts on the queue,** photos of cuts, a public portfolio.
- **Queue SMS blasts, estimated wait ads,** or a "we are busy" public push.
- **A separate kiosk app or hardware.** The tablet page is a web page.
- **Children's accounts.** No sign-in, birth dates, photos or schools for family members.
- **Inventory, ingredient databases, label generators** for beauty supply.
- **Automatic removal after a timer,** automatic rebooking of the whole family.
- **Mobile app screens for the queue in this pass.** The phone join and status pages are web pages reached from the QR and the shop page (they work in the phone browser); the app only needs links later.

## 6. Design

Figma: https://www.figma.com/design/UL6WbNqEhoJVZOZMVfsZox. Built in the existing visual language (monochrome, accent `#FF5A1F` for what needs the shop now, Bricolage display on customer screens, Inter body, hairlines, pill buttons). All data in the frames is invented. The frames use local styles, no design-system library.

| Frame | Node id | Size |
| --- | --- | --- |
| 1 Walk-in queue (staff) | `2:2` | 1440 x 900 |
| 2 Door tablet: join the line | `3:2` | 1024 x 768 |
| M1 Join the line (phone) | `3:66` | 390 x 844 |
| M2 You're in line (phone) | `3:120` | 390 x 844 |
| 3 Payouts and chair rental | `4:2` | 1440 x 900 |
| M3 My barber and family card | `4:114` | 390 x 844 |
| 4 Beauty supply rewards and claims check | `4:164` | 1440 x 900 |

Each frame has a "Why this exists" note to its right. Iterations: v1 then fixes (payout shop share did not add up: $1,310 corrected to $520; the Change pill in M3 was clipped; the root frames collapsed to 320 px until sizing was fixed).

### Mobbin references

| Used for | Reference | What it taught |
| --- | --- | --- |
| Queue status | [Waymo, "You are number 1 in the line" with Leave the queue](https://mobbin.com/screens/dd06088e-6808-4598-a93a-1e8ca4e51ea1) | One sentence of position and one quiet Leave button, nothing else |
| Queue status | [Equinox+, "Your place in line #1"](https://mobbin.com/screens/175f19d0-617d-4275-8409-c0917628b1a4) | Position as the big number; a calm line about what happens next |
| Queue status | [Greg, current position bar](https://mobbin.com/screens/293e889c-ac82-42f3-a49a-64a26000333a) | A segmented progress bar for how close you are |
| Estimated wait | [Chick-fil-A, "4-9 min estimated wait"](https://mobbin.com/screens/d831b7c5-6e70-4516-aa00-bc363c290467) | Estimate shown as a range label above the instruction; we say "about" |
| Family list | [Greenlight, Family: Adults and Kids](https://mobbin.com/screens/5a8be526-2a1c-4402-9666-fec75183726b) | Add child as a dashed-style row beneath the list |
| Family list | [Shangri-La Circle, rewards family: Adult invite, Child add](https://mobbin.com/screens/7af9a35e-d043-467b-9938-0cb6e0c2175f) | A loyalty family where a child is added to redeem rewards; points pool at the parent |
| Family list | [Amazon, Your Amazon Family](https://mobbin.com/screens/73a3c496-43b0-40d7-bd03-8667434f381b) | "Kids" as a profile, not an account |

Not searched in Mobbin: payout tables (the existing invoices and counter tables are the reference).

## 7. Build spec

Additive everywhere. Contract file: `packages/shared/src/api/barber.ts` (`barberApi`). Docs: `docs/engineering/api/barber.md`.

### 7.1 Plans and verticals

- `plans.ts`: add feature keys `booking.walkin_queue` and `staff.payouts`, minPlan `plus`, phase 2, unlock 100 merchants. Pilot shops (Crown & Fade, Arch & Thread, Glow) get overrides in the seed. Fees: unchanged (queue and payouts take no payments).
- `verticals.ts`: add `beauty_supply` (template: points per dollar 1, rewards "$10 off" at 500 points, categories Hair care, Hair colour, Tools and devices, Wigs and extensions, Gift cards never earns, discount card "Stylist pro card, 10% off hair care"). `barber` template gets category "Kids' cuts".
- `docs/business/pricing.md`: add the queue and payouts lines to Plus.

### 7.2 Database (migration `barb`)

- `walkin_queues(merchant_id pk, open, minutes_per_cut default 25, text_next default true, max_waiting default 30, call_hold_minutes default 5)`.
- `queue_entries(id, merchant_id, location_id, user_id, family_member_id null, party_id null, name, service_id null, service_name, duration_min, requested_staff_id null, status waiting|called|in_service|done|no_show|left, source join|tablet|staff, token unique, position_at, joined_at, called_at, called_staff_id, started_at, finished_at, appointment_id, text_consent, notified_next_at, notified_called_at, skips)`.
- `staff_pay(merchant_id, user_id pk, model employee|commission|chair_rent, shop_share_bps, rent_cents_week, own_clients_only, takes_walk_ins)`.
- `preferred_staff(user_id, merchant_id pk, staff_id, source auto|chosen, updated_at)`.
- `family_members(id, user_id, first_name, consent_at, created_at)`.

### 7.3 API

Staff (feature `booking.walkin_queue`, permission `bookings.manage` like the calendar): `GET|PUT /merchants/:id/queue/settings`, `GET /merchants/:id/queue`, `POST /merchants/:id/queue` (add), `POST /queue/:entryId/call|start|skip|done|remove`. Payouts (feature `staff.payouts`): `GET /merchants/:id/payouts?from&to` (manager), `GET /merchants/:id/payouts/mine`, `GET /payouts.csv`, `GET|PUT /merchants/:id/staff/:userId/pay` (manager). Public: `GET /public/shops/:slug/queue`, `POST /public/shops/:slug/queue`, `GET /public/queue/:token`, `POST /public/queue/:token/leave`. Customer: `GET|POST|DELETE /me/family`, `GET /me/shops/:slug/barber`, `PUT /me/shops/:slug/barber`. Jobs: `queue.expire` (clear a closed shop's waiting list at close), `queue.notify` (the next-text; runs inside join/call flows, plus a 1 minute sweep).

### 7.4 Web

- Dashboard: `queue` (staff board), `queue/door` (tablet), `payouts`; Staff page: "How this person is paid" section. Nav entries in `lib/dashboard/nav.ts` for barber, salon, spa verticals.
- Customer web (pass): `/shops/[slug]/queue` (join), `/line/[token]` (status), `/me/family` (family and my barber). "Join the line" button on the shop page when the queue is open.
- Strings in four languages for everything the customer reads.

### 7.5 Acceptance checks

API: estimate maths; order and skip rule; text once; renter privacy (appointments, customers); payouts maths against a seeded week; family consent and 6 limit; preferred barber auto-set and override; claims guard; feature gating (402); free-forever invariant. Web: pure logic tests for estimate text. E2E: guest joins by phone, status page shows 1st; staff calls and starts; payout row appears after checkout; family member add and remove; beauty message refused.

## 8. Open questions

- Pricing: queue and payouts are on Plus ($39) by default; confirm with five pilot barbershops (a US$9 to $29 queue sold separately suggests it is not a price driver).
- Counsel: CRA position on chair renters, the wording of the report, EI for the owner (V); the OPC wording for a first name of a child (V); where a hair-growth claim falls (V).
- Pilot: peak dates before Eid and Diwali in the GTA; whether shops want a cap lower than 30; whether a cash tip should be logged per client by the barber rather than at the till.
- Mobile app screens for the queue, if shops want them over the phone browser.

## 9. What was built, and where the build differs from the frames

Every item in section 7 is built: schema and migration `0026_barb`, `barberApi`, the walk-in line (staff board, door tablet, phone join and status pages), pay and payouts with the renter privacy rule, "my barber", family members, the beauty claims guard (server and as-you-type in the message composer), the `beauty_supply` vertical, three seeded shops, the API doc (`docs/engineering/api/barber.md`) and the pricing line. Tests are listed in the build report; the QA matrix rows are 108 to 117 in `docs/design/qa-matrix-staff.md` and the customer rows at the end of `docs/design/qa-matrix-customer.md`.

Differences from the Figma frames, each on purpose:

- **M2 has no "Change barber" button.** A person who wants another barber leaves and joins again (one tap, same place cannot be kept anyway because the estimate and order change). It saves a state with its own rules (does the person keep their place?).
- **"My barber" lives on the join page, not on the family page.** Signed-in customers get their barber pre-selected on the join form and picking another saves the choice; there is no separate card screen for it in this pass. The family page is just the family (title "Family"), reached from the join page and `/me/family`. The stamp card line in M3 ("6 of 8 cuts, counts for you and Aiden") is not built: stamps already go to the parent's card, there is no new card screen in this pass.
- **Frame 1** shows "Queue open" as a pill and "Call next for Marcus" in the header; the build has "Close the line", "Door tablet" and "Add someone" and puts "Call next" on each chair. The stat "About" shows the number and the caption "for someone joining now".
- **Frame 3** shows a week with $4,860 of services; the seed shows whatever has been paid this week to date, and a renter's "takes home" can be negative early in the week because the whole week's rent is charged against it.
- **Frame 4**: categories use the shared "Categories that don't earn" editor placed first on the Rewards page (the way the pharmacy page does it), with Gift cards locked; the stylist pro card is on Discount cards, and the "This can't be sent" box is the message composer's own check.
- **Mobile app**: no native screens in this pass (section 5).

Not found in this pass (stay as open questions in section 8): GTA peak dates, CRA and EI position for chair renters, the OPC wording for a child's first name, and where a hair-growth claim falls with Health Canada.
