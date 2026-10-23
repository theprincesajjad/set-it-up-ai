# Service businesses: repair shops, salons, barbers, tailors, dry cleaners, bike shops

Market slug: `service-businesses`. Written Oct 23, 2026 by the service-businesses research team (phase 1: research and design only, no app code changed).

Figma file: https://www.figma.com/design/UJMzzAEah7Kxm7LnKt68n5 ("Local Loyalty — Service businesses", page "Service business"). Frame screenshots (PNG, v1 and v2 after fixes): `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/service-businesses/`.

Evidence tags: (S) sourced with a link, (C) read from our code, (E) estimate or practice we could not source, validate in pilot, (V) legal or fee point to verify with counsel or the vendor page before relying on it.

## 1. Who this is for

Two different businesses share the word "service". Treat them separately in product and pricing.

**Appointment businesses** (the chair or the table is the product): hair salons, barbershops, nail and beauty studios, threading bars, henna and bridal makeup artists. Typically 1 to 6 people. They live in a calendar, take walk-ins, get paid in a mix of tap, cash and tips, and depend on regulars coming back every few weeks. In the GTA a large share serve South Asian clients: threading, henna, bridal makeup and hair, with weddings as large events (some over 1,000 guests, per a CBC piece on the Suhaag bridal show) (S). Many speak Punjabi, Hindi, Urdu at the counter (C: our language framework already covers all four).

**Drop-off and repair businesses** (the item is the product): phone and computer repair, tailors and alterations, dry cleaners, shoe repair, bike shops. They take an item in, diagnose or price it, get approval, fix it, and wait for the customer to collect and pay. Their pain is the approval loop (phone tag), uncollected items, and disputes about condition and price.

What they use and pay today (US dollars unless noted; vendor pages change, re-check before quoting to a merchant):

| Tool | Who it is for | Price and fees | Source |
| --- | --- | --- | --- |
| Fresha | Salons, barbers, spas | $19.95/mo for one bookable person, $14.95 per bookable team member on Team; 20% one-time commission (min $6) on new clients from its marketplace, none on your own links; online card payments 2.79% + $0.20, in person 2.29% + $0.20 | [fresha.com/pricing](https://www.fresha.com/pricing) |
| Vagaro | Salons, spas | From $30/mo for one location (promo $23.99 for 6 months) plus $10 per extra bookable calendar up to seven | [vagaro.com/pro/pricing](https://www.vagaro.com/pro/pricing). The 20% marketplace first-visit fee comes from third-party comparisons, not its pricing page (V) |
| Booksy | Salons, barbers | About $29.99/mo first user, $20 per extra staff; optional "Boost" takes 30% of a new client's first visit ($10 min, $100 max) | [Booksy blog comparison](https://biz.booksy.com/blog/best-salon-software-2026) (vendor-authored, V) |
| Square Appointments | Anyone with a calendar | Free plan with unlimited calendars; Plus CAD $35 and Premium CAD $85 per location; in-person card 2.5%, online prepayments 2.8% + 30 cents; no-show and cancellation fees only on Plus and up; deposits (prepayments) on all plans | [squareup.com/ca/en/appointments/pricing](https://squareup.com/ca/en/appointments/pricing) |
| GlossGenius | Independent stylists | From about $24/mo plus 2.6% processing, no marketplace fee | [Pabau comparison](https://pabau.com/blog/fresha-alternatives/), [GlossGenius vs Fresha](https://glossgenius.com/blog/glossgenius-vs-fresha) (third party, V) |
| RepairDesk | Phone and computer repair | Essential $99/mo per store, Growth $149/mo per store, Advanced custom | [Capterra](https://www.capterra.ca/software/146659/repairdesk), [G2](https://www.g2.com/products/repairdesk-repairdesk/pricing) (V) |
| RepairShopr | Repair shops | Starter $59.99/mo (75 tickets and invoices a month, 1 user), Repair Shop $129.99/mo (unlimited tickets, 10 users), Big Chain $139.99/mo, on annual billing | [repairshopr.com/pricing](https://repairshopr.com/pricing) |

What this means for us:

- Repair: our Service plan at $99 (C: `packages/shared/src/plans.ts`, `pro`, 9900 cents) is at parity with RepairDesk Essential and between RepairShopr's tiers. Quote approval by link, deposits, pay link and loyalty in one customer app is the differentiator, not price.
- Salons: $99 is out of range. A four-chair salon pays about USD 60 on Fresha (4 x 14.95), about USD 90 on Booksy (29.99 + 3 x 20), about USD 60 on Vagaro (30 + 3 x 10), CAD 35 on Square Plus, or nothing on Square Free. Our appointment calendar has to land near $40 to $60 CAD all-in (see section 4.4).
- Marketplace commission is the salon software model (Fresha 20%, Booksy 30% of a first visit). "No commission, ever" is a real wedge for Toronto salons, and it fits our existing 1% fee rule.

## 2. Evidence

### 2.1 Money, deposits, no-shows

- Deposits and no-show fees: vendor data says deposits cut no-shows by 55% (Timely) or 29% for full deposits (Kitomba); baseline no-show 10% to 25% without a policy; deposits may cost 5% to 10% of new-client conversion. All vendor figures, directional only (S, V). [Kitomba](https://www.kitomba.com/blog/deposits-vs-cancellation-fees-salons/), [Timely](https://nextjs.gettimely.com/blog/proven-strategy-to-reduce-no-shows).
- Bridal makeup contracts (non-GTA examples, no GTA source found): deposit usually non-refundable, from a flat $50 to 20% to 50% of the total; trial billed separately; balance due 7 to 90 days before; cancellation strict (S, E for GTA). [Examples](https://form.jotform.com/230375278857064), [Vancouver-area rates page](https://kellynewmanmakeupartist.format.com/rates). **We found no source for GTA wedding peak months. Do not claim any. Validate with five pilot artists.**
- Tipping: Canadians say 10% is an appropriate tip for hairstylists and barbers and 8% for salon technicians (H&R Block Canada, 2025); 45% would tip 15% at a salon or barber, 23% would tip 5% or nothing, and 60% agree tipping at salons is acceptable (Narrative Research and Logit, Aug 2024) (S). [Logit/Narrative](https://narrativeresearch.ca/while-most-canadians-say-they-tip-15-for-good-service-at-a-restaurant-many-are-divided-on-which-businesses-and-services-should-be-allowed-to-ask-customers-for-a-tip/), [H&R Block summary via Logit](https://logitgroup.com/?p=14201). Product reading: offer tipping at the chair with presets of 15/20/25 and a clear "no tip" and "cash tip"; do not nag. Cash tips are common (E).
- Rebooking cadence: threading is generally 2 to 4 weeks (S, low-quality sources) [example](https://dr-xm.saas.infor.com/how-often-to-thread-eyebrows). Haircuts at 4 to 6 weeks and gel nails at 2 to 3 weeks are commonly cited but we found no source (E). Defaults in the product must be editable.
- Taxes: Ontario HST is 13% on these services (C: `services/tax.ts` default ON 13%). Whether voluntary tips are outside HST (V).

### 2.2 Ontario rules that shape the repair flow

- Estimates: for auto repair, a written estimate is required before charging; the final invoice cannot be more than 10% above it; the estimate must say so; authorisation not in writing needs name, date and time and phone for phone approvals; invoices must be itemised and labelled; removed parts must be offered back. [Ontario guide for auto repair businesses](https://www.ontario.ca/page/guide-auto-repair-businesses) (S). Those rules sit in the Consumer Protection Act, 2002 Part VI and O. Reg. 17/05 and apply to motor vehicles, which this market mostly is not.
- General consumer rule: the Act also limits a supplier to 10% over an estimate in consumer agreements generally (s. 10), per law-firm commentary; "estimate" is undefined and cost-plus work is unclear. [Miller Thomson](https://www.millerthomson.com/en/insights/construction-and-infrastructure-law/construction-estimates-consumer-protection-legislation/) (S, V against the statute: we could not retrieve the e-Laws text). Product decision: apply the 10% cap and written authorisation to every ticket kind. It costs nothing and is what good shops already do.
- The Consumer Protection Act, 2023 received Royal Assent Dec 6, 2023 and will replace the 2002 Act on a date to be proclaimed; regulations were out for consultation Dec 2024. We could not confirm a proclamation date (V). [Gowling](https://gowlingwlg.com/en/insights-resources/articles/2023/ontario-s-new-consumer-protection-act). Keep the cap and authorisation rules in one module so they can follow the regulations.
- Uncollected items: the Repair and Storage Liens Act gives a repairer a lien from when work starts, and lets the repairer sell the article 60 days after payment came due or repair finished, following the Part III procedure (notice details not confirmed) (S, V). [RSLA](https://www.ontario.ca/laws/statute/90r25/v1). Shop policies elsewhere range from 14 to 90 days. A Toronto repair chain closing suddenly left customers without devices, which is why customers want visible status ([iPhone in Canada](https://www.iphoneincanada.ca/news/wireless-repair-store-closes-toronto)) (S).
- Right to repair: Bill 91 (2025) was still being pushed by the opposition in March 2026, not law (S). No product impact now. [NDP release](https://catherinefife.ontariondp.ca/news/fix-it-don-t-toss-it-ndp-calls-ford-pass-right-repair-legislation).
- Messaging: pure appointment reminders (time, place, sender, opt-out, no promotion) are generally outside CASL's consent requirement; any promotional content makes the message commercial and needs consent. [Apptoto](https://www.apptoto.com/compliance/canadas-anti-spam-legislation-casl) (S, V). A rebooking nudge is a commercial message: send only to clients with an existing relationship, include sender ID and STOP, and use the existing marketing consent path in messaging (C: `docs/engineering/api/messaging.md`). Existing-relationship implied consent lasts two years from the last transaction (E from CASL knowledge, V).

### 2.3 Current build, read against the market

Read from code and from `scratchpad/shots/` (core, core-base, qa, polish).

| Area | What is built | Gap against the jobs below |
| --- | --- | --- |
| Tickets board (`apps/web/src/app/(dashboard)/m/[merchantId]/tickets/page.tsx`) | Four columns (Dropped off, Quotes, In the shop, Ready) with search and an Open/Past toggle. Cards show number, status, device, issue, customer, "updated N ago" | No count of what needs the owner, no due time or overdue, no assignee, no quote age or "opened" state, no ready-for-N-days, no money. Sorted in API order. The 1440 shot (`qa/after2/fix-it-phone-lab-tickets-1440.png`) shows one tall empty page below four columns |
| Ticket detail (`tickets/[ticketId]/page.tsx`, 203 lines) | Issue, quote builder with free-text lines, deposit select (0/25/50), quotes list, invoice, timeline, notes | `t.photos` is never rendered and intake has no upload (photos exist in the API as URLs, no upload route found). Tax is a client constant `HST = 0.13`, only labelled "estimate". No canned lines or price list, no "approved by phone", no quote opened/age, no 10% guard. Quote builder is always open above the timeline |
| Intake (`tickets/new/page.tsx`) | Phone, name, item kind, kind-specific fields, issue, notes, promised-by | No photos, no condition checklist, no terms or data-loss acknowledgement, one item per ticket (alterations and dry cleaning bring several), no shelf location |
| Slots (`slots/page.tsx`) | A "Make slots" generator form (location, days, slot length, per-slot capacity), a flat bookings list with Done and No-show, and day-by-day chips | Engineering configuration, not a calendar. Slots are capacity counts with no staff, service or duration (C: `booking_slots`, `bookings`). Kind picker offers only pickup and drop-off, so the `appointment` kind that the API allows is unreachable. No policy, deposit, or reminder control |
| Customer quote (`apps/web/src/app/(pass)/q/[token]` and `QuoteView`, `QuoteApproval`) | Strong: line items, HST, deposit, typed-name signature, decline reasons, language pills, expiry, progress timeline | Shop logo vertical is hard-coded `repair_electronics`. No "what we found" separation, no price-cap statement, no "ask a question" |
| Customer invoice (`(pass)/i/[token]`, `InvoiceView`) | Amount due, lines, deposit credit, pay, print receipt, points earned | No tip, no staff attribution, no rebook prompt |
| Customer ticket status | Mobile `apps/mobile/src/app/tickets/[id].tsx` (timeline, inline approval, invoice card). Web has only the token pages | No web status page without signing in |
| Customer booking | `GET /v1/public/shops/:slug/slots` accepts `kind` (C: `routes/public/index.ts`) | No customer UI to book a drop-off or appointment slot found in web pass or mobile (mobile endpoint types narrow `kind` to pickup) |
| Invoices (dashboard) | API complete (`docs/engineering/api/service.md`), invoices shown inside a ticket | No invoice list page and no nav entry. Nothing lists open or overdue invoices |
| Rebooking, pickup reminders | None. The only reminder is `commerce.booking_reminders` (2 h before a slot). `marketing.automations` win-back exists on Plus | No interval-based rebook nudge; no ready-device reminder ladder; nothing tracks uncollected items |
| Plans (`plans.ts`) | `pro` "Service" $99 with tickets, quote approval, deposits, invoices, drop-off scheduling, staff permissions; `booking.pickup_slots` is Plus | Appointments for salons have no feature key. Fee rule: 1% on deposits and invoices on top of Stripe cost |

## 3. Jobs to be done

Ranked by frequency times pain. O = owner, S = staff, C = customer.

1. **O/S, repair: "What needs me right now, and what is stuck?"** Daily, constant. Board with a needs-you count, due and overdue, quote age.
2. **O/S, repair: "Get a clear yes on a price without phone tag."** Every ticket. Quote by link with opened and expiry state, plus a way to record a phone approval.
3. **O/S, salon: "Run today's chairs."** Every minute of the day. A calendar with staff columns, walk-in gaps, arrived and in-the-chair states, move by drag.
4. **O, all appointment shops: "Stop no-shows and late cancels."** Weekly pain, direct revenue. Reminders, a stated policy, card on file or deposit.
5. **C and S, all: "Pay in one tap, with a tip, and have it recorded."** Every visit. Tip to the right person, counter or online.
6. **O, salon: "Bring regulars back."** The cheapest revenue they have. A nudge at the usual interval, in the client's language, that books the same service and stylist.
7. **O, repair and tailors: "Prove what came in and what was agreed."** Disputes over condition and price. Photos, checklist, signed terms, final price within 10%.
8. **O, repair, tailors, dry cleaners: "Clear the shelf."** Uncollected items cost space and cash. A reminder ladder and a record for the lien process.
9. **O, bridal artists: "Sell a wedding, not a slot."** Seasonal, high ticket. One quote with per-person lines, trial, travel, a held date and a balance due date.
10. **C: "Know the status and book without calling."** Customers book at night and check status without phoning. Status page, booking page.

## 4. What we build and why

Every component maps to a job. The Figma frames show each one; the notes beside each frame repeat the reasoning.

### 4.1 Dashboard (frames at 1440)

| Frame | Component | Job | Why |
| --- | --- | --- | --- |
| 1 Tickets board | Stat strip: Needs you now (accent dot), Waiting on customer (blue), Due today (red), Ready not collected, Open quote value | 1 | Splits "I must act" from "they must act" (the foundations rule). One bordered block, plain numbers, no coloured cards |
| 1 | Four columns, with the quote age on "Waiting on customer" cards | 1, 2 | Same stages as today so staff keep their habits, plus the signal that matters |
| 1 | Ticket card with due time (red when overdue), assignee initials, one money or state line | 1 | Customers call about the promised time. Cash is visible without opening a ticket |
| 1 | Filter chips: staff, due today, overdue, has photos | 1 | Multi-tech shops split work by person |
| 2 Ticket detail | Photos strip, serial, passcode "not stored", intake checklist chips, "terms signed" | 7 | Evidence at intake. Passcodes are not stored by design |
| 2 | Quote panel: status line (sent, opened, expires), diagnosis, lines, credited diagnostic fee, totals, deposit, 10% statement | 2, 7 | "Opened, not approved" is the call-now signal. The 10% statement shows the cap the customer sees |
| 2 | Actions: Resend text, Approved by phone, Preview as customer, Revise quote | 2 | Phone approvals are real and the auto-repair rule says to record name, date, time and phone |
| 2 | Timeline, Update status with "Text in Punjabi" switch, Customer card with language | 2, 10 | Existing behaviour, with the customer's language visible |
| 3 Calendar | Staff columns on a time grid, staff header with booked hours | 3 | See section 4.3 |
| 3 | Block states: booked, arrived, in the chair, done, no-show with fee, open gap, time off, deposit paid | 3, 4, 9 | The front desk runs the day from block weight and colour |
| 3 | Walk-in button, dashed open gap | 3 | Barbers and threading bars live on walk-ins |
| 3 | Appointment sheet with services, deposit credit, client note, last visits, Check out, Reschedule, No-show | 3, 4, 5, 6 | One place to finish a visit |
| 4 Drop-off slots | Heat grid of the next 7 days, today's list with Check in, hours from Locations | 3, 10 | Replaces the generator form. Check in opens intake prefilled |
| 5 Invoices | Stat strip (open, overdue, paid this month, deposits held, time to pay), table, detail panel with Record payment, pay link, reminder log | 5, 8 | Deposits held is money the shop owes back if a job is cancelled. Counter payments keep one record |
| 6 Rebooking | Due list with Send and Skip, rules per service, message preview in four languages, pickup reminder ladder | 6, 8 | Owner stays in control. Same engine serves repair pickup reminders |

### 4.2 Customer (frames at 390)

| Frame | Component | Job | Why |
| --- | --- | --- | --- |
| M1 Pick services | Stylist rail with "Any", service rows with duration and price, "Bridal and events" row, total bar | 3, 9, 10 | Duration sets block length. Bridal routes to a quote, not a slot |
| M2 Pick a time | Date strip, time chips, plain-words policy, card row with deposit | 4, 10 | Policy disclosed before the card is added |
| M3 Repair quote | "What we found", credited diagnostic fee, 10% line, typed-name signature, deposit, call | 2, 7 | Keeps the current strong flow and adds the explanation and cap |
| M4 Bridal quote | Event facts, per-person lines, deposit holds the date, balance due date | 9 | Reuses the catering event quote engine |
| M5 Pay with tip | Amount due, lines, tip presets (15, 20, 25, custom, no tip, cash tip), tip to a named stylist, points line, Apple Pay first | 5, 6 | Tip on the pre-tax amount, only the service earns points |
| M6 Repair status | One big status word, pay now, timeline with times, warranty card, call and directions | 10, 8 | Answers "is it ready" at a glance |

### 4.3 Do salons need a proper appointment calendar with staff columns? Yes.

Reasons:

- Every salon product we priced is built on a staff-column calendar, and Mobbin's salon examples (Fresha, Wix Bookings) put staff columns on a time grid as the home view (S).
- Our slot model cannot represent a salon. A slot is "N bookings at a time" (C: `booking_slots.capacity`), with no staff, no service, no duration, no buffer, no double-booking guard. A 2 h 30 min colour appointment with Simran cannot be expressed. Setting capacity to 1 per stylist means one slot table per stylist with no way to ask for "any".
- The things a salon needs in the day are calendar things: walk-in gaps, who is free, drag to move, arrived and in-the-chair, deposit on the block, a lunch block, a bridal block that spans hours.
- A solo barber is the minimum case: one column, same code.

What we deliberately do not build (section 5) keeps it a scheduler, not a salon suite.

#### Spec: appointment calendar (Frame 3, M1, M2, M5)

Behaviour:

1. **Day view with one column per bookable staff member** at the selected location. Header shows initials, name and booked hours. Week view is for a single staff member (filter chip) and shows seven columns.
2. **Time grid** 9:00 to 18:00 by default from location hours, 15-minute snap, 60 px per hour. Non-working time for a staff member is shaded `bg-muted`. Hours come from `staff_hours` and `staff_time_off`.
3. **Block** = appointment. Height is the sum of service durations and buffers. Shows client, services, time range, and one state or tag line. States: `booked`, `arrived` (muted fill), `in_service` (2 px black outline), `completed` (muted text), `no_show` (red text), `open gap` (dashed, a held walk-in range, not an appointment), `time off` (muted fill). Deposit paid shows in positive green on the time line.
4. **Create:** click an empty cell opens a sheet prefilled with staff and time. "New appointment" and "Walk-in" buttons. Walk-in sets `startsAt` to now, `source = walk_in`, status `arrived`.
5. **Move and resize:** drag a block to another time or column, drag the bottom edge to change duration. The server checks overlaps and returns `409 slot_taken`; the UI snaps back and shows the message. "Requested" stylist (client asked by name) asks for confirmation before moving to someone else.
6. **Appointment sheet (right, 300 px):** client and phone and language, services with duration and price, stylist, deposit paid, amount due, client note, last visits, actions Check out (primary), Reschedule, No-show, Cancel. Check out opens a sheet that adds or removes services, applies a reward (existing counter reward flow), takes a tip, and either records counter payment or sends the pay link.
7. **No-show with fee:** needs a card on file. "No-show" asks "Charge the $25 fee?" and logs it.
8. **Keyboard:** left and right arrows change day; `n` new appointment; `w` walk-in. Row focus order is by staff column then time (screen-reader label on each block: "Neha Sharma, cut and blow-dry, 9:00 to 10:15, Simran, paid").
9. **Empty and first-run state:** "Add your services and hours to open booking" with two buttons (Services and prices, Staff and hours). The calendar does not render until at least one service and one staff schedule exist.
10. **Mobile (390):** day view shows one staff column at a time with a staff switcher, because four columns do not fit. Walk-in and New are the only top actions.

Customer booking behaviour:

- Availability is computed, never stored per slot: free starts at 15-minute steps where one staff member (the chosen one, or any who can do all selected services) has working hours, no overlapping appointment, and enough room for duration plus buffer.
- "Any" picks the stylist with the earliest slot, tie broken by least booked day.
- A hold for 10 minutes while the client enters a card; unpaid holds expire.
- Cancel and reschedule free until the policy window (default 24 hours, per shop); after that the fee is charged to the card on file.

### 4.4 Packaging and pricing recommendation (founder decision, not implemented)

- Put `booking.appointments` (calendar, services, staff hours, online booking, reminders) and `service.rebooking` on a salon-sized price. Simplest: add to Plus ($39). Alternative that keeps the Plus story clean: a "Studio" pack at about $49/mo including 3 staff calendars, $9 per extra calendar (E; compare Fresha $14.95 per seat USD, Booksy $20 per staff USD, Square Plus CAD $35 per location). A four-chair studio would then pay about $58 CAD.
- Keep `service.tickets`, `service.quote_approval`, `service.deposits`, `service.invoices` on Service ($99). Do not ask a barber to buy repair features.
- Fees: the current rule is Stripe at cost plus 1% on deposits and invoices (C: `FEES`). On $60 services plus tips, 1% plus Stripe is above Square's in-person 2.5% (S). Recommend 1% only on online deposits, and 0% on in-person and counter checkout for Studio, so the loyalty network and no-commission story are not undercut by processing cost. Check Stripe Canada's current rate before publishing any comparison (V).
- Loyalty fit: stamps per visit suit threading and barbers ("10th cut free" is common practice, E); points per dollar suit colour and bridal. Rewards should be a service add-on or a dollar amount, not "free cut", so the team's time is not given away at scale. Points never accrue on tips, tax or deposits that are later refunded (C: ledger already keys awards by invoice).

## 5. What we deliberately do not build

- **A marketplace or a new-client commission.** It is the opposite of the pitch. Network discovery is free listing in the existing network.
- **Payroll, commission splits, booth rent, payroll exports.** Record the tip and the staff member; stop there.
- **Inventory, retail POS, parts procurement.** Quote lines can be typed; the Price list gives canned lines. No stock counts.
- **Packages, memberships, gift cards in phase 1.** Real needs, but second to calendar, deposits and rebooking.
- **Online store, delivery or route planning for dry cleaners.** The ticket kinds cover drop-off and pickup; routes are a different product.
- **Storing device passcodes.** Customers unlock at pickup. A passcode field is a liability.
- **Auto-selling uncollected items.** We record notices and dates. Whether and when to sell is the shop's legal decision under the RSLA.
- **Voice or phone-AI booking** for this market in phase 1. The restaurant add-on exists; revisit after the calendar.
- **Tipping prompts on repair invoices by default.** Default on for salon, barber, nail, beauty; off for repair; settable.

## 6. Design

Figma: https://www.figma.com/design/UJMzzAEah7Kxm7LnKt68n5

Built in the existing visual language: monochrome, one accent `#FF5A1F` (points, and "the shop must act" dot), info blue for waiting on a customer, Bricolage Grotesque display (customer screens), Inter body, hairlines, pill buttons, no gradients. Colours are variables in the file (collection "LL tokens", values from `docs/design/foundations.md`). Local components: Button/Primary, Button/Secondary, Chip, Chip/Active, TicketCard, AppointmentBlock (frame "Components (local)", left of the canvas). All sample data is invented and labelled as sample.

| Frame | Node id | Size | Notes |
| --- | --- | --- | --- |
| Index card | on page, top | 1400 | Frame list |
| 1 Tickets board | `3:2` | 1440 x 900 | Repair (Fix-It Phone Lab) |
| 2 Ticket detail with quote approval | `4:130` | 1440 x 1000 | Repair, quote sent and opened |
| 3 Appointments calendar with staff columns | `5:142` | 1440 x 880 | Salon (Bloom Studio) |
| 4 Drop-off slots and bookings | `6:211` | 1440 x 1010 | Repair |
| 5 Invoices and payment status | `7:218` | 1440 x 1000 | Repair |
| 6 Rebooking and pickup reminders | `8:229` | 1440 x 960 | Salon, with repair ladder |
| M1 Book: pick services and stylist | `9:256` | 390 x 844 | Salon |
| M2 Book: pick a time and policy | `9:334` | 390 x 844 | Salon |
| M3 Approve a repair quote | `9:388` | 390 x 1160 | Repair |
| M4 Approve a bridal quote | `9:455` | 390 x 1300 | Bridal |
| M5 Pay an invoice with a tip | `10:256` | 390 x 844 | Salon |
| M6 Repair status | `10:311` | 390 x 880 | Repair |

Each frame has a "Why this exists" note beside it (to the right for 1440 frames, below for 390 frames) mapping components to jobs. Iterations: v1 then fixes (calendar height and now line, drop-off hours text, invoice numbers that did not add up and truncated table cells, M1 default stylist and M2 chip wrap, quote totals styling, a missing Punjabi label); PNGs are in the screenshot folder. Known gap: the Punjabi pill label renders as text "Punjabi" in Figma because the file lacks a Gurmukhi font; the app already ships the real script.

### Mobbin references

Mobbin MCP search, platform and mode noted. Links open the exact screen.

| Used for | Reference | What it taught |
| --- | --- | --- |
| Calendar | [Fresha web calendar](https://mobbin.com/screens/65a2a8d4-8afa-45f6-aaef-f75eb770600a) | Staff selector and day/week toggle in the header; blocks sized by duration; non-working time shaded; "Add" and "Waitlist" as header actions |
| Calendar | [Wix Bookings calendar](https://mobbin.com/screens/710a5c70-57fb-4177-ad6f-5a1a2e14c397) | Staff columns with filters by services, staff, location; a "Staff view" switch |
| Calendar | [GoDaddy appointments calendar](https://mobbin.com/screens/53a40bc5-e278-4d2c-a9b0-64164515158d) | "Update availability" and "Block time" belong next to the calendar, plus a list view as a fallback |
| Calendar | [7shifts schedule](https://mobbin.com/screens/d9ad10cb-11f5-4035-8268-5b83057a0ad6) | Conflict and overtime warnings in the header; we use the idea for double-booking messages only |
| Board | [Programa board](https://mobbin.com/screens/894a77ba-3553-4f11-a721-e274fd07b621) | Quiet columns with counts and plain cards; no colour bars |
| Board | [Wrike board](https://mobbin.com/screens/0636f1b9-6e3a-4358-8852-099c74d5705a) | Counts in the column header; we rejected the coloured headers |
| Board | [Slack Lists board](https://mobbin.com/screens/fd9a81ad-6a72-4916-8eed-5092bd02ad17) | Card fields (assignee, due date) in a consistent order |
| Book a time | [Fresha iOS select date and time](https://mobbin.com/screens/d411fbb9-4912-4e43-8bc4-b5dd4422f6a8) | Professional picker beside a date strip, then a short list of times |
| Book a time | [Careem salon date and time](https://mobbin.com/screens/a030486a-580e-4b86-b331-2b7cdddf94c8) | A free-cancellation notice sits on the time screen, before checkout |
| Book a time | [Airbnb select a time](https://mobbin.com/screens/e4fff56f-b88d-4e5f-9d84-4b423ec7e108) | Big tappable rows with price and spots left |
| Book a time | [Zomato book a table](https://mobbin.com/screens/4bafaf23-c039-4d50-8ef7-aa04164780e5) | Time chips in a grid grouped by part of day |
| Book a time | [Octopus Energy appointment](https://mobbin.com/screens/fd73de74-cc81-444c-bbed-0c52c57d5938) | "Fully booked" cells and "only 8 appointments left" teach how to show scarcity for drop-off slots |
| Book a time | [adidas available times](https://mobbin.com/screens/da1c0bb4-b40e-4620-8111-bc6a603caf98) | Morning/afternoon grouping with counts |
| Review the price | [Fresha review and continue](https://mobbin.com/screens/18644903-663c-467c-9d55-10afae6c79f4) | Service, stylist, time and total on one card before paying |
| Quote | [Jobber review quote](https://mobbin.com/screens/08d8114d-a9b3-49b5-b4fe-fa36f926d3a9) | Itemised quote with intro text; we add status and approval |
| Quote | [Lugg understand your estimate](https://mobbin.com/screens/8a53fb07-4f2b-4990-bcf8-47fa08ff81b7) | A separate "this is only an estimate" callout under the price; informs our 10% line |
| Quote | [Airtasker preview offer](https://mobbin.com/screens/41e6167b-6925-4d82-8687-7dbfa2ba9361) | A single large total with "includes" lines |
| Status | [Shopee order tracking](https://mobbin.com/screens/5bd9141f-8c16-4f6b-b743-5ca9b64fe0ce) | Estimated date at the top, timeline below with times |
| Status | [Bolt Food order](https://mobbin.com/screens/9509b853-f44c-425e-81c0-c6e96efffe2c) | One big status word ("Arriving") over a short tick timeline |
| Status | [Vestiaire status](https://mobbin.com/screens/984bf280-8384-4125-8136-360fc80eddf2) | Current step expanded with a contact button, others collapsed |
| Status | [CVS order details](https://mobbin.com/screens/6ade5a53-e2a8-423e-b5d9-c135e5bf010c) | Four-step vertical timeline with the current step bold |
| Status | [Fiverr order timeline](https://mobbin.com/screens/4e2501e6-29b0-44e8-8681-94c5f212fd8f) | Events with dates and an action sheet; informs ticket detail timeline |
| Invoices | [PayPal invoice](https://mobbin.com/screens/7851aa8f-416c-454e-8c2c-a94fa2dae9ca) | Customer sees "Here's your invoice" with amount and one button |
| Invoices | [Xero record payment](https://mobbin.com/screens/764c5e30-4de3-4ccb-88d6-ee2973203064) | Record payment form with date, amount and reference below the lines |
| Invoices | [Melio create invoice](https://mobbin.com/screens/332c230e-bae7-4a44-80e0-5340ddb19c68) | An "automatic payment reminders" checkbox next to payment options |
| Invoices | [Airwallex pay bill](https://mobbin.com/screens/21b63c71-8de9-431e-80b6-a1db111b9fef) | Invoice preview beside the pay form |
| Invoices | [Mercury invoice](https://mobbin.com/screens/8e512f8f-e46c-47f7-b3a9-2bf46ce8ecbc) | Payment methods as plain checkboxes |

Mobbin search for tip screens and salon rebooking prompts was not run; the tip presets are reasoned from the survey data above.

## 7. Build spec

Executable by a build team without further input. Every item is additive except where marked replace. Keep existing endpoints and DTO fields; add, do not rename.

### 7.1 Shared contracts and plans

`packages/shared/src/plans.ts`
- Add feature keys `booking.appointments` and `service.rebooking`. Default placement: `minPlan: "plus"`, phase 2, `unlockAtMerchants: 100`. Pilot salons get overrides, as the demo seed already does for Pinecone Coffee. If the founder chooses the Studio pack, add a pack ladder the same way as `RESTAURANT_PLANS` instead; the endpoint gating below does not change.
- Add add-on id `extra_staff_calendar` ($9 per month, unit month) only if Studio is chosen.
- Add `FEES.appointmentCheckoutBps = 0` (counter and in-person) and keep `depositInvoiceBps = 100` for online deposits; wire through `computeFees()` in `apps/api/src/services/fees.ts`. Decision gate: only if the founder approves section 4.4.

`packages/shared/src/api/` (new file `appointments.ts`, exported from `index.ts`)
- Zod schemas and types: `ServiceDto { id, name, description, durationMin, priceCents, priceFrom, depositCents, bufferMin, categoryId, rebookAfterDays|null, kind: "appointment"|"repair_line", active, translations }`, `StaffHoursDto`, `TimeOffDto`, `AppointmentDto`, `AvailabilityResponse { days: { date, times: { startsAt, staffId }[] }[] }`, `CheckoutBody`, `RebookingRow`.
- `AppointmentStatus = "booked" | "arrived" | "in_service" | "completed" | "no_show" | "cancelled"`.

`packages/shared/src/api/service.ts` (additive)
- `TicketDto`: add `quote: { status, totalCents, sentAt, firstViewedAt, expiresAt } | null`, `invoice: { status, amountDueCents } | null`, `readyAt`, `dueState: "overdue" | "today" | null`, `assignedStaff: { id, initials } | null`. Extend `photos` handling is unchanged.
- `QuoteDto`: add `firstViewedAt`, `authorizedBy: { method: "link" | "phone" | "counter", name, phone?, at, staffId? } | null`, `maxAuthorizedCents` (= total x 1.10, rounded down).
- New `authorizeQuoteByPhoneBody { name (2 to 120), phone?, note? }`.
- `CreateTicketBody`: add `intakeChecklist: string[]`, `termsAccepted: boolean` (required when the merchant has terms), `shelfLocation?: string`, `items?: { description, tag? }[]` for multi-item (alterations, dry cleaning). Store items in `itemDetails.items` (JSON) to avoid a table for phase 1.
- New `TicketSummaryResponse { needsYou, waitingOnCustomer, dueToday, overdue, readyUncollected, oldestReadyDays, openQuoteValueCents }`.

### 7.2 Database (`packages/db/src/schema.ts` plus a new drizzle migration)

New tables (all with `merchantId` cascade, `createdAt`, `updatedAt`):
- `services`: `id, merchantId, kind ("appointment"|"repair_line"), name, description, durationMin int, priceCents int, priceFrom bool default false, depositCents int default 0, bufferMin int default 0, categoryId uuid null (merchant category, so no-earn categories keep working), rebookAfterDays int null, taxable bool default true, active bool default true, sort int, translations jsonb`. Index `(merchantId, kind, active)`. The same table backs the repair "Price list" used for canned quote lines.
- `staff_services`: `merchantId, userId, serviceId, durationMin null, priceCents null`, PK `(userId, serviceId)`.
- `staff_hours`: `id, merchantId, locationId, userId, weekday smallint 0..6, startsLocal time, endsLocal time`. Multiple rows per day allowed (split shifts).
- `staff_time_off`: `id, merchantId, userId, startsAt, endsAt, reason`.
- `appointments`: `id, merchantId, locationId, userId (customer, nullable for a named walk-in), customerName text null, staffId uuid null, requestedStaff bool default false, source ("online"|"staff"|"walk_in"), items jsonb [{ serviceId, name, durationMin, priceCents }], startsAt, endsAt, status text default "booked", groupId uuid null (a bridal party shares one), notes, clientNote, depositCents int default 0, depositPaymentIntentId, depositPaidAt, cardSetupIntentId, paymentMethodId, noShowFeeCents int null, feeChargedAt, cancelledAt, cancelReason, arrivedAt, startedAt, completedAt, invoiceId uuid null, reminder24SentAt, reminder2SentAt, rebookNudgeSentAt, holdExpiresAt`.
  - Overlap guard: enable `btree_gist` and add `EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (staff_id IS NOT NULL AND status IN ('booked','arrived','in_service'))`. Overlap returns `409 slot_taken`.
  - Indexes `(merchantId, startsAt)`, `(merchantId, staffId, startsAt)`, `(userId, startsAt)`.
- Additive columns: `invoices.appointmentId uuid null`, `invoices.tipCents int default 0`, `invoices.tipStaffId uuid null`; `quotes.firstViewedAt ts null`, `quotes.authorizedBy jsonb null`; `service_tickets.intakeChecklist jsonb default []`, `service_tickets.termsAcceptedAt ts null`, `service_tickets.shelfLocation text null`, `service_tickets.readyAt ts null` (set on status `ready`, used for aging); `merchants.rebookAuto bool default false`, `merchants.cancelWindowHours int default 24`, `merchants.noShowFeeCents int default 0`, `merchants.tipsEnabled bool default null` (null = by vertical default), `merchants.tipPresets jsonb default [15,20,25]`, `merchants.intakeTerms text null`.
- Existing `booking_slots` and `bookings` stay for pickup and drop-off. Do not migrate them to appointments.

### 7.3 API (`apps/api/src/routes/`, new `routes/appointments/`, extend `routes/service/` and `routes/public/`)

Document in a new `docs/engineering/api/appointments.md` and cross-link from `service.md` and `commerce.md`.

Merchant (staff+; permission `bookings.manage` unless noted; feature `booking.appointments`):
- `GET|POST /v1/merchants/:merchantId/services`, `PATCH|DELETE /services/:id`.
- `PUT /v1/merchants/:merchantId/staff/:userId/hours`, `POST /staff/:userId/time-off`, `DELETE /staff/time-off/:id`, `PUT /staff/:userId/services`.
- `GET /v1/merchants/:merchantId/appointments?from&to&staffId&locationId` returns `{ items: AppointmentDto[] }` including `customer { name, phone, language }`.
- `POST /appointments` (staff books; customer found or created by phone as tickets do; `source: "walk_in"` sets start to now and status `arrived`).
- `PATCH /appointments/:id` (move, resize, reassign, edit items). Validates hours, time off and overlap. `409 slot_taken`, `409 outside_hours` (overridable with `force: true` for managers).
- `POST /appointments/:id/status` body `{ status, chargeFee? }`. `no_show` with `chargeFee` charges `noShowFeeCents` against `paymentMethodId` (off-session, Stripe) and records `feeChargedAt`; errors `409 no_card_on_file`.
- `POST /appointments/:id/checkout` body `{ items?, tipCents?, tipStaffId?, rewardId?, mode: "link" | "counter", counterMethod? }`. Creates an invoice (reuse `services/invoices.ts`) with the deposit credited, `appointmentId`, `tipCents`. `link` returns `payUrl` and texts it; `counter` marks paid like `mark-paid`. Points via `ledger.awardPurchase` on service lines only; tips never earn (assert in test).
- `GET /v1/merchants/:merchantId/rebooking?state=due|late|snoozed` returns `RebookingRow[]` computed from completed appointments and paid invoices joined to `services.rebookAfterDays`, skipping customers with a future appointment, a recent nudge, or an opt-out. `POST /rebooking/:userId/:serviceId/send|skip|snooze`. `PUT /rebooking/settings { auto }`. Feature `service.rebooking`.
- `GET /v1/merchants/:merchantId/tickets/summary` returns `TicketSummaryResponse`. `GET /v1/merchants/:merchantId/tickets` adds the new `TicketDto` fields. `GET /v1/merchants/:merchantId/invoices` already exists; add `q` (customer, number) and `appointmentId` filters.
- `POST /v1/merchants/:merchantId/quotes/:quoteId/authorize-by-phone` body `authorizeQuoteByPhoneBody`. Sets quote `approved`, ticket `approved`, `authorizedBy`, creates the deposit payment link if a deposit applies (texted), logs a ticket event "Approved by phone, <name>, <time>". Permission `quotes.send`.
- Invoice creation guard: in `services/invoices.ts`, when `total > quote.maxAuthorizedCents` for the approved quote, return `409 over_estimate` with the cap, unless the request carries `newQuoteId` for an approved replacement. This applies to all item kinds.
- Uploads: add `POST /v1/merchants/:merchantId/uploads` (signed upload, image only, 5 MB, returns a URL) if none exists. We found no upload route under `apps/api/src/routes/`; check object storage in `docs/engineering/connectors.md` before choosing. Needed for ticket photos.

Public and customer:
- `GET /v1/public/shops/:slug/services`; feature `booking.appointments`.
- `GET /v1/public/shops/:slug/availability?serviceIds=a,b&staffId=any|uuid&from&to` returns `AvailabilityResponse`; caches 30 s.
- `POST /v1/me/appointments { serviceIds, staffId|null, startsAt, notes, groupId? }` creates a `booked` hold with `holdExpiresAt = now+10min` and returns `{ appointment, deposit | setup }`: a PaymentIntent when the services carry a deposit, otherwise a SetupIntent to save a card when the merchant has a no-show fee. The hold confirms on webhook. No fee and no deposit: confirms immediately.
- `POST /v1/me/appointments/:id/cancel` and `/reschedule` apply `cancelWindowHours`; inside the window with a card on file, charge the fee and say so in the response.
- `GET /v1/me/appointments`.
- `GET /v1/public/quotes/:token` sets `quotes.firstViewedAt` once (use a conditional update).
- Public quote and invoice payloads add `shop.vertical`, `quote.maxAuthorizedCents`, `invoice.tip { enabled, presets, staff { id, name } | null }`; `POST /v1/public/invoices/:token/pay` accepts `tipCents`, validated 0 to 100% of the pre-tax subtotal.

Jobs (`apps/api/src/jobs/`):
- `appointments.reminders` every 5 min: text and push 24 h and 2 h before; transactional content only, include shop name, time, address, change link, STOP. Sets `reminder24SentAt` and `reminder2SentAt`.
- `appointments.hold_expiry` every minute: cancel unpaid holds past `holdExpiresAt`.
- `service.rebook_nudges` daily at 10:00 merchant time: only when `merchants.rebookAuto` and `service.rebooking`; one message per service per cycle, stop after two unanswered, skip opted-out and clients with no visit in 24 months; message in the client's language with a deep link `/book/<slug>?service=<id>&staff=<id>`. Counts against `smsPerMonth`.
- `service.pickup_reminders` daily: for tickets `ready` and unpaid or uncollected, text at day 3 and day 7 with the pay link; at day 30 create a staff task on the ticket; at day 60 mark `lienEligible` on the ticket summary (shown, not acted on).
- `commerce.generate_slots_rolling` daily: keep 14 days of drop-off slots open from `locations.hours` and the merchant's per-slot setting (stored on `merchants.dropoffSlotMinutes`, `dropoffCapacity`). Removes the need for the Make slots form.

Messaging copy lives in the translation framework: add keys for English, Hindi, Urdu and Punjabi in `packages/shared/src/i18n/messages/*` for reminder, rebook nudge, pickup reminder, quote opened text. Follow `docs/engineering/translation-glossary.md`.

### 7.4 Web dashboard (`apps/web/src`)

`lib/dashboard/nav.ts` (`buildMerchantNav`, `NAV_FEATURES`)
- Add entries: `calendar` (`booking.appointments`), `services` ("Services & prices", `booking.appointments` or `service.tickets` for the repair price list), `rebooking` (`service.rebooking`), `invoices` (`service.invoices`).
- Vertical-aware ordering: hide `tickets` for `salon`, `barber`, `spa` and `beauty` unless the merchant also has `service.tickets`; hide `calendar` for repair and alteration verticals. Rename "Pickup & drop-off" to "Drop-off slots" when `service.tickets` is on.

`app/(dashboard)/m/[merchantId]/tickets/page.tsx` (replace `Board`)
- New components in `components/dashboard/service/`: `TicketStats.tsx` (uses `/tickets/summary`, one bordered block, plain numbers; accent dot only for "Needs you now"), `TicketFilters.tsx` (chips with `useMerchant().detail.staff`), `TicketCard.tsx` (props: number, status label and dot colour, title, issue, who and due text with overdue red, assignee initials, one money or state line). Reorder cards in each column by `dueState` then `updatedAt`.
- Keep Open/Past, search, `pollMs: 30_000`. Add a List view toggle that reuses the Past list markup.
- Column mapping unchanged; first column label "Dropped off"; second "Waiting on customer" and shows `declined` last.

`tickets/[ticketId]/page.tsx` (split into `components/dashboard/service/`: `IntakePanel.tsx`, `QuotePanel.tsx`, `QuoteBuilder.tsx`, `ApproveByPhoneDialog.tsx`, `InvoicePanel.tsx`, `StatusPanel.tsx`, `CustomerPanel.tsx`)
- `IntakePanel` renders `t.photos` (88 px tiles, click opens a Modal), serial, passcode note, `intakeChecklist` chips, "Terms signed" with date.
- `QuotePanel` header status line from `quote.status`, `sentAt`, `firstViewedAt`, `expiresAt`; actions Resend, Approved by phone (opens `ApproveByPhoneDialog`: name, phone, note, confirm), Preview as customer (opens `/q/<token>` in a new tab with `?preview=1`), Revise (opens `QuoteBuilder` pre-filled with the current lines).
- `QuoteBuilder` loads the price list (`GET /services?kind=repair_line`) as a search field that adds a line; remove the client `HST` constant: show the server preview from `POST /tickets/:id/quotes/preview` (new, returns totals via `services/tax.ts`) debounced 300 ms. Show the 10% cap ("Customer sees: final price will not be more than $X") from the preview.
- Keep Timeline, Update status (with a "Text <name> in <language>" switch bound to `notify`), Notes.

`tickets/new/page.tsx`
- Add photo upload (3 tiles, camera input on mobile), intake checklist chips by `itemKind` (device: cracked screen, water indicator, data-loss notice; garment: stains, tears, number of items; vehicle: existing fields), terms checkbox from `merchants.intakeTerms`, shelf location for garment kind, "Add another item" for garment kind (writes `itemDetails.items`).
- Accept `?bookingId=` so "Check in" from the drop-off list prefills customer and issue.

`slots/page.tsx` (replace)
- Remove the Make slots form. Add `DropoffGrid.tsx` (7-day by hour heat grid from `GET /slots` with `remaining/capacity`), `TodayDropoffs.tsx` (bookings with a Check in button linking to `tickets/new?bookingId=`), and `DropoffHours.tsx` (reads `locations.hours`; settings for slot length and per-slot capacity patch `merchants`). Keep the pickup tab for Plus shops, with the same grid.

New `app/(dashboard)/m/[merchantId]/calendar/page.tsx` and `components/dashboard/calendar/`
- `CalendarDay.tsx` (grid, 60 px per hour, 15-minute snap, columns from `staff_hours`), `StaffColumn.tsx`, `AppointmentBlock.tsx` (variants per state; absolutely positioned inside the column; keyboard focusable, role `button`, `aria-label` as in 4.3), `AppointmentSheet.tsx` (right panel), `NewAppointmentSheet.tsx`, `WalkInSheet.tsx`, `CheckoutSheet.tsx`, `useAppointments.ts` (range fetch with `pollMs: 15_000` and optimistic move/resize).
- Drag and resize with pointer events only (no new dependency); on 409 revert and toast. Keyboard: arrows, `n`, `w`.
- 390 px: single-column day with staff switcher.
- First run: show the empty state in 4.3 item 9.

New `app/(dashboard)/m/[merchantId]/services/page.tsx` (Services & prices): table with name, duration, price, deposit, staff, rebook-after; edit in a right panel. Repair shops see the same table titled "Price list" filtered to `kind = repair_line`.

New `app/(dashboard)/m/[merchantId]/invoices/page.tsx`: stat strip from `GET /invoices?status=` aggregates, table (number, customer, for, amount, status word, last activity), right-hand detail with lines, Record payment (cash, debit terminal, other, mapped to `mark-paid`), Copy pay link, Text again, Void (manager). Reminder log reads ticket events.

New `app/(dashboard)/m/[merchantId]/rebooking/page.tsx`: due list, rules per service (writes `services.rebookAfterDays`), message preview with a language switcher (renders the translation key with sample data), auto switch (`merchants.rebookAuto`), and a "Pickup reminders" strip for shops with `service.tickets`.

`app/(dashboard)/m/[merchantId]/staff/`: add "hours and services" per person (writes `staff_hours`, `staff_services`).

### 7.5 Customer web and mobile

- `apps/web/src/app/(pass)/shops/[slug]/book/page.tsx` plus `components/pass/BookFlow.tsx`: M1 and M2. Steps: services (with stylist rail), time (availability), card or deposit (Stripe Payment Element or Setup Element, reuse `StripePayment.tsx` and `StripeSetup.tsx`), confirmation with add-to-calendar (.ics) and change/cancel links. Show a "Book" button on `shops/[slug]/page.tsx` when `booking.appointments` is on, and a "Book a drop-off" button when `booking.dropoff_scheduling` is on (uses the existing public slots with `kind=dropoff`; no service step).
- `apps/mobile/src/app/book/[slug].tsx` mirrors the web flow with the mobile `Screen`, `Section`, `Button` kit; add `api.appointments` to `apps/mobile/src/api/endpoints.ts`; widen the public slots `kind` type to `SlotKind`.
- `components/pass/QuoteView.tsx` and `components/ui/QuoteApproval.tsx`: add the "What we found" heading over the diagnosis, the price-cap line from `quote.maxAuthorizedCents` ("The final price will not be more than $X, 10% above this quote. If we find more work, we ask you first."), a "Credited" line style for fees with negative amounts, and a "Call or message the shop" button. Use `shop.vertical` instead of the hard-coded `repair_electronics`. For event quotes (bridal) show the event facts block, reusing the catering quote layout (find it under `components/restaurant/` and share it).
- `components/pass/InvoiceView.tsx`: add `TipPicker.tsx` (props `presets`, `baseCents`, `staffName`, `onChange`): 15/20/25, custom, no tip, cash tip; total updates; points line says tax and tips do not earn. Pay with Apple Pay first.
- New `app/(pass)/t/[token]/page.tsx` (public ticket status by a ticket token, new `service_tickets.statusToken`) rendering M6: big status word, timeline, pay now if an invoice is open, warranty text, call and directions. Link it in the "ready" text. Mobile `tickets/[id].tsx` gets the same hero.
- Copy: add keys to `apps/web/src/copy/en-CA.ts` and to the four-language message files; calendar and reminder copy follows `docs/design/ux-copy.md` (no exclamation marks, plain dates, "text" not "SMS").

### 7.6 Tests and acceptance checks

API (`apps/api/test/`, vitest like `kitchen.test.ts`):
1. Overlap: two appointments for the same staff overlapping by 1 minute return `409 slot_taken`; adjacent (end equals start) succeeds; a cancelled one frees the time.
2. Availability: respects staff hours, time off, service duration plus buffer, and "any" picks earliest; a day with no hours returns no times; DST change day (Mar 8 and Nov 1) returns correct local times.
3. Hold expiry: an unpaid hold disappears after 10 minutes and releases the slot.
4. No-show fee: charges only with a card on file; `no_card_on_file` otherwise; idempotent on retry.
5. Checkout: tip stored on the invoice and attributed to `tipStaffId`; awarded points equal service lines only; a no-earn category line earns nothing; retried webhook never double-awards.
6. Quote guard: invoice for an approved quote whose total exceeds `maxAuthorizedCents` returns `409 over_estimate`; within 10% succeeds; a replacement approved quote resets the cap. Test with item kinds device, garment and vehicle.
7. Phone approval: records name, phone, time and staff; ticket status `approved`; a second call is idempotent; a staff member without `quotes.send` gets 403.
8. `firstViewedAt` is set once on first public GET and not on staff GET.
9. Rebooking: a client with a future appointment or a nudge inside the cycle is excluded; two unanswered nudges stop further sends; a STOP reply is honoured; a merchant without `service.rebooking` gets 402 `feature_locked`.
10. Pickup reminders: day 3 and day 7 texts only for `ready` tickets with an open invoice or uncollected; day 60 sets the flag and sends nothing.
11. Free-forever invariant: the new keys are not in `FREE_FOREVER`; the plans test still passes.

Web (`apps/web/e2e/`, Playwright like `restaurant-kitchen.spec.ts`):
12. Tickets board at 1440 and 390: stat strip numbers match the API summary; an overdue ticket shows red due text; no horizontal scroll at 390.
13. Ticket detail: photos render and open; "Approved by phone" requires a name; after confirming the quote shows "Approved by phone" and the timeline has the entry; the price-cap line shows total x 1.10.
14. Calendar: drag a block to another staff column updates the server; dropping on a busy time snaps back with a message; walk-in creates an `arrived` block now; keyboard `n` opens the sheet; screen reader labels are present (axe passes on the page).
15. Booking: a client books "any" stylist with a deposit service and the card step appears; policy text is on screen before the card field; the confirmation shows the .ics link; booking an already-taken time shows "That time was just taken. Pick another."
16. Pay with tip: choosing 20% updates the total; "No tip" removes the tip; the points line excludes tax and tip.
17. Quote page: loading it as the customer sets "opened" on the staff board; the Punjabi, Hindi and Urdu views keep the price-cap line and RTL layout for Urdu.
18. All new pages in dark mode have no unstyled backgrounds; frames in Figma and the shipped pages match at 1440 and 390 within normal tolerance (visual diff against the PNGs in the screenshot folder, reviewed by a person).

Definition of done for the first release (calendar and rebooking behind the new feature keys, pilot-only overrides): items 1 to 11 pass; items 12 to 17 pass on a seeded Bloom Studio (3 staff, 6 services) and Fix-It Phone Lab (existing seed).

### 7.7 Suggested order

1. Tickets board, ticket detail, intake (photos, checklist, terms), phone approval, `firstViewedAt`, invoice cap guard. No new plan, no schema beyond additive columns. Sells to repair shops now.
2. Invoices page, tip picker, pickup reminders, customer ticket status page.
3. Appointments tables, availability, calendar, booking flow, reminders, no-show fee. Needs the pricing decision in 4.4.
4. Rebooking nudges and bridal event quote.
5. Drop-off slots redesign and public drop-off booking.

## 8. Open questions for the founder and the pilot

- Pricing: appointments inside Plus, or a Studio pack, and the fee rule on in-person checkout (4.4). One-line decision needed before step 3.
- Verify with counsel: the 10% rule for non-vehicle repairs and alterations, CASL treatment of rebooking nudges, HST on tips, and the RSLA notice steps before any "lien eligible" language ships.
- Validate with five pilot artists: wedding peak months, deposit sizes and balance timing in the GTA, trial fees.
- Validate with five pilot shops: whether the diagnostic fee is credited, and the rebook-after defaults (5, 3, 3, 4, 8 weeks are estimates).
- Language: which of the four reminder languages salons want first. Punjabi and Hindi are the likely pair for threading and bridal; confirm.
