# Auto care: car washes, independent garages and tire shops

Market slug: `auto-care`. Written Oct 27, 2026 by the auto team (phase 3: research, Figma, build and verify in one pass). Builds on `service-businesses.md` (tickets, written quotes, the 10% cap, phone approvals and the pickup ladder already exist and are reused), `fitness-studios.md` (the recurring membership engine, the Ontario 10-day cooling-off refund and the fixed-term renewal notice are reused for wash plans), `pet-care.md` (the pattern of a per-item record under the customer with a cadence and a reminder, and the way consent is shown on every row) and `docs/business/pricing.md`.

Figma file: https://www.figma.com/design/xZBdDevVVg9GCK4DHLkuXw ("Local Loyalty — Auto care"). Frame PNGs: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/auto-care/`. Build screenshots beside them: `.../scratchpad/shots/auto-build/`.

Evidence tags: (S) sourced with a link, (C) read from our code, (E) estimate or practice we could not source, validate in pilot, (V) legal or vendor point to verify before relying on it.

## 1. Who this is for

**Car washes.** Four kinds in the GTA: tunnel washes (a conveyor and a pay station, often with vacuums), self-serve bays (coin or card, no staff), hand wash and detailing studios (an appointment, $60 to $400), and gas-station washes. The ones that gain from this product are the tunnel washes and hand-wash shops that sell an unlimited monthly plan, and any wash that wants a punch card. Their daily pain is that a plan is only worth it if the member comes four to six times a month, the member who stops coming cancels, and the card on file fails (S below).

**Independent garages and quick-lube shops.** Two to eight bays, a service writer, a licensed technician or two. They live on repeat customers: an oil change every few months, brakes, safeties and tires. Pain: customers forget the interval, drift to the dealer for "warranty" reasons that are mostly a myth, and the shop has no written trail when a customer disputes the bill.

**Tire shops and the tire swap rush.** Many garages are tire shops in fall and spring. A swap is 30 to 60 minutes of work and a booked bay; the October to November and March to April peaks fill every bay and the phone does not stop. Storing a customer's off-season set ("tire hotel") is what makes a customer come back twice a year.

**Their customers.** Commuters in their own cars, families with one or two cars, and a large group of ride-hail drivers (Uber, Lyft) who put on far more kilometres than other drivers and have rules about their cars (section 2.6). They speak English, Punjabi, Hindi, Urdu and others; they want a text, not an app.

## 2. Evidence

### 2.1 Unlimited wash memberships

- **Price.** An Ontario chain sells three unlimited plans at $19.50, $29.99 and $39.99 a month (S, [Canadian Carwash Association magazine](https://ccentral.ca/membership-has-its-benefits)). A trade guideline puts a plan at about 1.5 to 2.5 times a single wash (S, vendor, [Professional Carwashing](https://www.carwash.com/how-to-start-a-carwash-what-are-unlimited-carwash-programs/)). A software vendor cites $29 to $49 (S, vendor, [RaftLabs](https://www.raftlabs.com/blog/how-to-build-car-wash-management-software)).
- **Churn.** US operators using one reporting service see total monthly churn of 7.9% in Q2 2026, 4.9 points of it voluntary cancels and the rest failed cards (S, [Rinsed via the International Carwash Association](https://www.carwash.org/car-wash-news/rinsed-releases-q2-2026-quarterly-car-wash-industry-report)); 7.6% in Q4 2025 with 3.0 points from failed cards ([Rinsed Q4 2025](https://www.carwash.org/car-wash-news/rinsed-launches-new-quarterly-car-wash-industry-report-with-insights-from-2025q4)). Family plans last about 19 months and single plans about 15 (same Q2 2026 report). No Canadian churn figure was found (V). Product reading: a failed card is a third of the loss, so the retry ladder that already exists for studio memberships (day 1, 2 and 5) matters, and a "fewer than 3 visits" list is the early warning.
- **Use.** A vendor rule of thumb is four to six visits per member per month, with fewer than three a churn risk (S, vendor, RaftLabs above). Product reading: the owner needs to see visits per member, not just members.
- **How the car is recognised.** Licence plate recognition (LPR) and RFID windshield tags are the two hardware paths. An Ontario wash uses RFID tags with automated monthly payments ([Dreams Eco Xpress via CCA](https://ccentral.ca/node/5845), S). A US vendor case study says RFID was costly and inaccurate for an independent ([Rekor](https://www.rekor.ai/case-studies/waves), S, vendor), and a software vendor puts LPR failure at 2 to 5% so a fallback is needed (RaftLabs, S, vendor). Product reading: we do not sell or run camera or tag hardware. The check-in is software that works with what the wash already has: type the plate, scan the member QR on the phone, or look the member up by phone number. If their camera reads a plate, staff type it.
- **Ontario rules for recurring memberships.** Gyms and similar "personal development services" have a 10-day cooling-off right and renewal notices under the Consumer Protection Act, 2002 (S, summarised in `fitness-studios.md` 2.2). A car wash plan is not obviously one of those, and the Consumer Protection Act, 2023 has been law since Dec 2023 but not yet proclaimed in the sources we found ([Gowling](https://gowlingwlg.com/en/insights-resources/articles/2023/ontario-s-new-consumer-protection-act), V). Product decision: keep the 10-day refund and written agreement that the membership engine already gives every plan, labelled as the shop's policy, and ask counsel whether it is required for a wash (V). Cancelling must be as easy as joining: a button in the app, no phone call.

### 2.2 Oil change intervals

- **The 3,000 mile rule is a myth.** It dates to the 1950s and was pushed by quick-lube businesses; the owner's manual is the authority, and recent manuals commonly say 5,000 to 10,000 km or more with synthetic oil (S, [Wikipedia](https://en.wikipedia.org/wiki/3,000_mile_myth), [Scientific American](https://www.scientificamerican.com/article/oil-change-truths)). Short trips and cold starts are "severe" service and shorten the interval; many sources say at least twice a year (S, same).
- **Km or months, whichever comes first.** Manuals and oil-life monitors give both numbers. We did not find a Canadian source that states the rule in those words (V). Product reading: the shop sets an interval per service in km and months, and the reminder fires on the earlier date. Default 8,000 km or 6 months for synthetic oil (E: a common shop default, not a manufacturer figure; every shop edits it).
- **Estimating km.** A garage sees the odometer only at visits. We compute km a day from the last readings (two or more) and use it to say "about Dec 8 by km". It is an estimate and it is labelled as one. The customer can send a reading from the app or by text and the owner can type one.
- **How garages remind today.** A sticker on the windshield, a text from a scheduling tool, or nothing. We found no reliable source for how many shops text (V). The product answers with a per-car reminder by km or months, texted once and only to customers who said yes.

### 2.3 The tire swap rush and tire storage

- **Winter tires are not mandatory in Ontario.** The province's position is that two sets, the twice yearly swap and storage are the costs (S, [editorial quoting the minister](https://norfolkandtillsonburgnews.com/opinion/editorials/editorial-its-time-winter-tire-use-became-law-in-ontario/wcm/a0ddbb48-479f-4898-a051-23b9370b590d/amp/), older, V). Two things still create a rush: **insurers must offer a winter tire discount** (private passenger policies, since Jan 1, 2016; the size is set by each insurer, one broker found 2 to 5%; many need a full set with the three-peak mountain snowflake mark and keep receipts as proof; windows run from early November to April, for example Nov 20 to Apr 15 at one insurer) (S, [MyChoice](https://www.mychoice.ca/blog/ontario-winter-tire-discount/), [iSure](https://isure.ca/inews/winter-tire-insurance-discount/)), and **Toronto's ride-hail rules require snow or all-weather tires from Dec 1 to Apr 30** (S, [Uber Toronto vehicle requirements](https://www.uber.com/en-CA/drive/toronto/vehicle-requirements/)).
- **Timing.** The fall window we default to is Oct 15 to Nov 30 and the spring window Mar 25 to Apr 30 (E: practice and the insurer dates above; a shop edits both). We found no Ontario wait-time data, so no number about wait times appears anywhere in the product (V).
- **Storage price.** About $50 to $150 a season in the GTA, from a Toronto guide and a comparison table that do not name their source (S, weak: [Trumeter](https://dev-cloud.trumeter.com/best-buzz/toronto-winter-tire-change-cost-and-expert-guide-1767648188), E). The product does not set a price; storage is billed on the shop's usual ticket.
- **Tread depth.** The wear bar is 2/32 inch (1.6 mm); many tire guides treat 4/32 inch (about 3.2 mm) as the point to replace for winter driving (S, [Auto123](https://www.auto123.com/en/news/winter-tire-wear-calculating-preventing/23806), [Tire Review](https://www.tirereview.com/treading-close-to-limits/)). We found no Ontario Safety Standards figure (V). Product reading: record tread in mm at intake, flag under 3.2 mm as "replace soon" and under 1.6 mm as "at the wear bar"; the shop decides what to tell the customer.
- **Capacity.** A swap is a bay for 30 to 60 minutes (E). The shop sets bays, hours and minutes a swap and the product shows how many swaps fit in a day and stops booking when a day is full. A stored set means a pickup too.

### 2.4 Ontario repair rules (the "MVRA" in the brief)

The Motor Vehicle Repair Act was repealed in 2005; the rules now sit in Part VI of the Consumer Protection Act, 2002 and O. Reg. 17/05 (S, [Ontario guide for auto repair businesses](https://www.ontario.ca/page/guide-auto-repair-businesses)). The page says:

- **Estimate.** A written estimate before charging, unless the customer sets a maximum they will pay and the cost stays inside it. It lists the customer, vehicle and business, a description of the work, each part's price, labour, any itemised charges (storage is the example), the total, the date it was given, when it expires, and when the work will be done. An estimate fee must be disclosed first and cannot be charged for work the customer authorises. (S)
- **10% rule.** "The final invoice cannot be more than 10% higher than the written estimate." (S, quoted)
- **Authorisation.** The customer authorises before work is charged. If not in writing, record the name, date, time and contact details; for a phone approval, the number it came from. (S)
- **Invoice.** Written, labelled so it is not confused with the estimate; customer and vehicle details; odometer at drop-off and at return; the dates of authorisation, completion and return; each part as new, used or reconditioned; shop supplies; labour; total; payment method; the estimate total if there was one; warranty terms; the statutory notice printed in full. (S) We cannot quote the notice text from the page (V); the product prints the warranty line and the 10% line and leaves the notice to the shop's invoice footer setting.
- **Replaced parts.** Offer to return them, unless the customer declined when authorising, the part was not charged for, or the manufacturer needs it back. (S)
- **Warranty.** At least 90 days or 5,000 km, whichever comes first, on new or reconditioned parts and the labour to fit them; fluids, filters, lights, tires and batteries are exempt. (S)

What exists already (C, `service-businesses.md`): written quotes with line items and HST, an approval link, a typed-name signature, phone and counter approvals with name, number and time, a revised quote that the customer approves again, an invoice that is refused above 10% (`409 over_estimate`), pickup reminders and a status page. What is missing for a vehicle: the part condition, the three dates, odometer in and out, the parts-return record, the estimate on the invoice, a block on starting work or invoicing a car with no approved estimate, and the warranty line. Those are the build (section 4).

### 2.5 What keeps a customer at an independent garage

AIA Canada's 2021 survey of 2,000 owners (S, [AIA Canada](https://www.aiacanada.com/?p=3730), [summary](https://www.collisionrepairmag.com/what-drivers-want-aia-canada-releases-report-on-service-centre-preferences/)): about a quarter always use a dealer, a fifth only an independent, most use both; independents win on a fair price (39%) and being cheaper (25%); dealers win on warranty worries (25%), trust (23%) and knowledge (14%). Earlier AIA data: trust rises if the same technician always works on the car (67%), the desk explains the value of maintenance (66%), there is a clear preventive maintenance plan (63%) and the shop uses video or email to explain the work (50%). Product reading: what an independent can add is the written trail (an estimate that was kept, a visit history by car and km) and a reminder from the shop that knows the car. We do not build technician assignment, video inspections or warranty tracking (section 5).

### 2.6 Fleet and ride-hail drivers

Uber in Toronto, Mississauga, Oakville and Brampton asks for a model year 7 years old or newer, four doors, an annual inspection with the certificate uploaded within 36 days, and snow or all-weather tires Dec 1 to Apr 30 in Toronto and Mississauga (S, [Uber](https://www.uber.com/en-CA/drive/toronto/vehicle-requirements/)). We found no source for their annual kilometres or oil change habits (V); a high-kilometre car is the clearest case for km-based reminders because the km date comes up long before the months date. Product reading: a vehicle can be marked "rideshare", which selects the shop's severe-service intervals (E: city stop and go and idling are listed as severe in manuals), and the km a day estimate does the rest. A safety certificate is a service on the list with a 12 month interval. Fleet billing is not built.

### 2.7 Privacy: plates and VINs

Privacy commissioners have generally treated a licence plate as personal information; an Alberta court majority held otherwise under Alberta's own law, which does not govern the GTA (S, [Slaw](https://www.slaw.ca/2011/04/06/privacy-and-drivers-licenses-and-license-plates/), [Slaw 2](https://www.slaw.ca/2011/12/08/more-on-licence-plates-as-personal-information/); V: the federal PIPEDA guidance on a shop's own use was not found). Product decisions: the plate is optional, shown only to staff of the shop that the customer visits and to the customer, never in a text or a public page, deleted when the customer deletes the vehicle or the account, and included in the data export. We do not store a VIN at all (it adds nothing to a reminder and links to a specific car's whole history); a shop that needs it types it on the ticket, which already exists.

### 2.8 Current build, read against the market (audit)

| Area | Built today (C) | Verdict |
| --- | --- | --- |
| Auto shop vertical | `repair_auto` with a points template; the intake form picks "vehicle" and has a vehicle checklist, itemDetails for make, model, plate, mileage | Keep. Vehicle becomes a record under the customer (change) |
| Tickets, quotes, approval link, phone approval, revisions, invoice with 10% refusal | Complete (service plan) | Keep; add the vehicle estimate fields and the gate (change) |
| Quote page | Cap line, line items, HST, typed-name approval | Change: dates, part condition, parts-return line |
| Invoice page | Lines, deposit, tip, pay | Change: estimate total and percent over, odometer, authorisation date, warranty |
| Rebooking nudge by service | Per customer and service, days after the last | Keep for groomers and salons; not reused (a car's due date comes from km and months) |
| Studio memberships | Products, joining with a card, billing, freeze, cancel, cooling-off, renewal notice, door check-in | Keep for wash plans; add the wash check-in beside it (new) |
| Class packs | Credits with an expiry | Keep as the wash punch card |
| Appointments calendar | Staff columns, services, deposits | Keep for detail and quick-lube bookings; tire swaps are a day-capacity booking of their own (new) |
| Car wash vertical | None | New: `car_wash` |
| Vehicles, reminders, tire storage, swap capacity | None | New |
| Vehicle wording on customer pass | None | New `/me/vehicles` |

## 3. Jobs to be done

1. **Garage owner: be able to prove what the customer agreed to.** A dated written estimate, who approved it and how, a cap that is enforced, an invoice that shows the estimate. (Frequency: every repair. Pain: disputes, the Ministry's rules.)
2. **Garage and quick-lube owner: bring the customer back at the right time.** A reminder per car by km or months, whichever comes first, texted once with consent.
3. **Tire shop owner: get through the swap rush.** A capacity plan for the fall and spring windows so the day never overbooks, and bookings that customers make themselves.
4. **Tire shop owner: know where each set is and what shape it is in.** Rack, season, tread, pickup reminder.
5. **Wash owner: turn a one-time customer into a plan, and keep the plan.** A plan on the card on file, easy cancelling, fewer failed cards, a list of members who stopped coming.
6. **Wash attendant: let a member in without a card and without arguing.** Plate, QR or phone; "active", "paused", "card failed" in one line; one wash a day.
7. **Wash owner: reward a non-member for coming back.** A punch card that counts at the till.
8. **Driver (commuter or ride-hail): see what my car needs and book it.** My vehicles, due dates, one tap to book a swap, the estimate on my phone before work starts.
9. **Customer: not be tracked.** Plate optional, never in a text, deleted on request.
10. **Ride-hail driver: get to the winter-tire deadline.** Severe-service intervals and the swap window.

## 4. What we build and why

Each row maps to a job; anything not listed was cut.

### 4.1 Components (frames in Figma)

| # | Component | Frame | Job |
| --- | --- | --- | --- |
| 1 | Vehicles under the customer: year, make, model, use (personal or rideshare), plate (optional), odometer readings, km a day | F1, M1 | 2, 8, 9, 10 |
| 2 | Service intervals per shop (km and months, severe values) and the reminder status per car | F1 | 2, 10 |
| 3 | Reminder list with consent on each row, send and skip, optional automatic send | F2 | 2 |
| 4 | Tire season: window dates, bays, hours, minutes a swap; day capacity plan; staff and customer booking that refuses a full day | F3, M1 | 3 |
| 5 | Tire storage record: rack, season, label, tread in mm, flag, pickup reminder before the window | F3 | 4 |
| 6 | Vehicle estimate fields: part condition, given, valid until, completion date, odometer in and out | F4, M2 | 1 |
| 7 | Approval gate: no work and no invoice on a vehicle ticket without an approved estimate; the 10% cap stays; a revision needs a new approval | F4 | 1 |
| 8 | Invoice shows the estimate total, percent over, odometer, authorisation and warranty | F4 | 1 |
| 9 | Wash check-in by plate, QR or phone, one wash a day, shows plan state | F5, M3 | 6 |
| 10 | Wash plans on the membership engine and the punch card on class packs | F5, M3 | 5, 7 |
| 11 | Members with fewer than three washes in the last 30 days | F5 | 5 |
| 12 | Demo seed: Splash Auto Wash and Wheelhouse Tire & Auto | n/a | all |

### 4.2 Rules the build enforces

- Reminder due date = the earlier of last done plus every-km at the km a day estimate, and last done plus every-months. Status: overdue, due soon (within 14 days or 1,000 km), ok. No reading, no km date; the months date still works.
- km a day comes from the latest readings (at least two, 14 days apart, at least 5 km a day and at most 400 to cut out typos), else the shop's default 40 (E), else the owner's override.
- A reminder text is sent once per car and service per due date, only if the customer has a phone, marketing consent at that shop and has not said STOP; the text names the service and the car's make and model, never the plate; it is sent between 09:00 and 20:00 shop time.
- A tire swap booking is refused when the day is full (409 `day_full`), is outside the open window (400), or when the customer has a booking that day already.
- Tread under 3.2 mm is "replace soon"; under 1.6 mm "at the wear bar". A stored set cannot be picked up twice.
- A vehicle ticket cannot move to In progress, nor can an invoice be made for it, until a quote on it is approved (409 `estimate_required`). The 10% cap and revised approvals are unchanged.
- A wash check-in counts one wash per member per day (409 `already_washed`), refuses a member that is cancelled, expired, frozen or past due with a plain reason, and takes a punch card credit when there is no active plan.
- The plate is never in a text, a notification, a public page or the export of another user.

### 4.3 Packaging and pricing

Three features, all Café & Retail $39 for the `car_wash` and `repair_auto` verticals, hidden until an admin turns them on (the same default as pets): `auto.vehicles` (vehicles, reminders), `auto.tires` (tire season and storage), `auto.wash` (wash check-in). The estimate flow needs the Service plan ($99) because it uses tickets, quotes and invoices; a garage buys Service, a tire-only or wash-only shop buys Café & Retail and the wash uses `booking.classes` and `memberships.recurring` for plans, which Café & Retail already includes. Founder decision, not final.

## 5. What we deliberately do not build

- Licence plate cameras and RFID readers or tags: hardware, cost and accuracy are the vendor's problem; we work with what the shop has (2.1).
- A VIN field, VIN decoding, recall lookups and warranty tracking: no job; privacy cost (2.7).
- Digital vehicle inspection with photos and video: AIA says video builds trust but it is a product of its own (E).
- Technician assignment by car: the existing ticket has an assigned staff member; nothing more.
- Online payment for storage, subscriptions to storage and tire sales or inventory: storage is billed on the ticket.
- A customer-set maximum price as a substitute for an estimate (the Ministry allows it): added later if shops ask.
- Fleet accounts, invoicing a company, driver lists, dealer warranty claims, towing, valet and loaner cars.
- Wash tunnel controller integration and fair-use cameras: a daily cap is enough.
- A promise about wait times or an insurance discount amount anywhere in the product copy.

## 6. Design

Figma file: https://www.figma.com/design/xZBdDevVVg9GCK4DHLkuXw. Frames (1440): F1 Vehicle page (2:2), F2 Service reminders (3:2), F3 Tire season and storage (3:135), F4 Estimate and approval (4:2), F5 Wash memberships and punch cards (4:129). Frames (390): M1 My vehicles (5:2), M2 Approve an estimate (5:33), M3 Wash membership card (5:66). Every frame carries a yellow "Why this exists" note beside or under it.

### Mobbin references

| App | Screen | What it taught us |
| --- | --- | --- |
| Rivian | [Vehicle maintenance](https://mobbin.com/screens/ae14021c-b3ac-4d30-ba2a-6de03bcdc071) | One sentence ("service every X, next checkpoint at Y") with a progress bar and one button beats a table on a phone |
| Lloyds Mobile Banking | [Manage vehicle](https://mobbin.com/screens/9f05b39a-3e76-488d-849d-81273fb6b96d) | A vehicle card with due dates as small tiles and an empty "Set reminder" tile for what is missing |
| My BMW | [Vehicle status](https://mobbin.com/screens/eff7caad-efbf-47f6-ae14-6215c3f0b242) | A service row with "Overdue since" in red and a mileage row that says when it was last updated; we label km as estimated |
| Mercedes-Benz | [Services](https://mobbin.com/screens/155f60ad-ee02-4383-8de4-80f7f999eeb6) | A status list with a Book appointment button pinned under it |
| Lugg | [Understand your estimate](https://mobbin.com/screens/8a53fb07-4f2b-4990-bcf8-47fa08ff81b7) | A boxed "This is only an estimate" with the terms in plain words, above the price |
| Jobber | [Quote detail](https://mobbin.com/screens/41e431e1-7ab9-4daa-bd5f-08cee3045f63) | The Approved status chip with created and approved dates side by side |
| Rivian | [Work order](https://mobbin.com/screens/f9b6f705-69f5-42fb-a677-30264ed563e2) | An invoice that carries customer, vehicle and order details in labelled sections |
| Target | [Membership plans](https://mobbin.com/screens/2b0ba790-4bc0-4d16-9bd2-e3137fa837f6) | Annual and monthly side by side with the fee shown per month |
| Blank Street | [Membership options](https://mobbin.com/screens/7948a0aa-5374-4601-81cf-9c68efcb0cec) | Two plans, each with what you get in one line and a radio, tax stated as extra |

## 7. Build spec

See section 9 for what was built; the spec below is the plan the build followed.

- **Shared** (`packages/shared`): `auto.ts` (reminder math, km a day, tread, tire windows and capacity, plate normalising, default services, wash check-in reasons); `api/auto.ts` (contracts); `plans.ts` features `auto.vehicles`, `auto.tires`, `auto.wash` (plus, vertical `car_wash`, `repair_auto`); `verticals.ts` `car_wash`; `service-rules.ts` estimate and invoice requirements for a vehicle; i18n `auto.*`.
- **DB** (`packages/db`): migration `0028_auto`: `vehicles`, `vehicle_shop`, `vehicle_readings`, `vehicle_services`, `vehicle_nudges`, `auto_settings`, `tire_sets`, `tire_swaps`, `wash_visits`.
- **API**: `services/auto-vehicles.ts`, `auto-tires.ts`, `auto-wash.ts`, `routes/auto`, `jobs/auto.ts` (reminders 10:00, tire pickup), hooks in `privacy-scrub.ts` and `data-export.ts`; changes in `tickets.ts` (gate), `invoices.ts` (estimate block, gate), `quotes.ts` and the public quote and invoice responses.
- **Web**: dashboard pages `vehicles`, `vehicles/[vehicleId]`, `service-reminders`, `tire-season`, `wash`; pass `/me/vehicles`; changes in the quote builder, the quote and invoice views, and the tickets intake.
- **Acceptance**: each rule in 4.2 has an API test; the e2e spec walks an estimate to an invoice, books a swap, logs a reading, checks a member in.

## 8. Open questions for the founder, counsel and the pilot

- Does the Consumer Protection Act 2002 or 2023 require a cooling-off refund and a written agreement for a car wash plan (V)? The build gives both regardless.
- The Ministry's notice text for the invoice (V) and whether the "customer-set maximum" path should be built.
- Intervals, fall and spring windows and capacity defaults are estimates (E); validate with five pilot shops.
- Whether a wash wants one wash a day or no cap; the setting exists, default 1.
- The Hindi, Urdu and Punjabi strings were written by the team, not a native speaker.

## 9. What was built, and where the build differs from the frames

Built Oct 27, 2026 by the auto team. API doc: `docs/engineering/api/auto.md`. Pricing line added to `docs/business/pricing.md` (the three features in Café & Retail for `repair_auto` and `car_wash` shops, founder default). Migration `0028_auto`. Seed: Splash Auto Wash and Wheelhouse Tire & Auto in Ridgeway Plaza (`owner+splash-auto-wash@example.com`, `owner+wheelhouse-tire-and-auto@example.com`, password `localloyalty-demo`; the demo customer on +16475551000 has a Honda Civic at both).

| Spec item | Done | Where |
| --- | --- | --- |
| Vehicles under the customer: year, make, model, optional plate, use, odometer readings | Done | `vehicles`, `vehicle_readings`; `/me/vehicles`, `/m/{id}/vehicles`, `/m/{id}/vehicles/{vehicleId}` |
| Service reminders by km or months, whichever comes first, with km a day from readings | Done | `packages/shared/src/auto.ts` (`reminderState`, `kmPerDay`), `vehicle_services`, `/m/{id}/service-reminders`, job `auto.service_reminders` (off until the shop switches it on) |
| Seasonal tire swap window with a capacity plan and booking that refuses a full day | Done | `auto_settings`, `tire_swaps`, `/m/{id}/tire-season`, `POST /v1/me/tire-swaps` (409 `day_full`, under a per-day lock) |
| Tire storage record with rack, season and tread, and a pickup reminder | Done | `tire_sets`, job `auto.tire_pickup`, tire hotel on `/m/{id}/tire-season` and on `/me/vehicles` |
| MVRA-style estimate: part condition, dates, odometer, approval before work, 10% cap, revision, estimate on the invoice | Done | `auto-estimate.ts`, `quotes.ts`, `tickets.ts`, `invoices.ts`, `VehiclePanel`, `QuoteBuilder`, `QuoteView`, `InvoiceView` |
| Wash membership on the membership engine with the Ontario notices, wash punch card | Done (reused) | plans are `class_products` memberships and the punch card a pack, managed on the existing Memberships and passes page |
| Wash check-in by plate, QR or phone, one a day | Done | `auto-wash.ts`, `wash_visits`, `/m/{id}/wash` |
| Demo shops | Done | `apps/api/src/seed/auto.ts` |
| Four-language strings for customer text | Done, not read by a native speaker | `auto.*` keys (76), listed in the glossary review list |

Differences from the frames, each on purpose:

- **Frame 1** (vehicle page) has the owner card and an odometer form on the right as drawn. The build adds a "Done today" button on each reminder row (a service done at the counter without a ticket), an edit block for the plate, km a day and ride-hail use, and a "Services done this visit" checklist on the ticket page that logs the services with the odometer out.
- **Frame 2** (reminders) is built as drawn. The row button reads "No text consent" for an owner who never said yes; the frame's "Text her" is "Send text".
- **Frame 3** (tire season) draws capacity with 3 slots held back for walk-ins. The build has no hold-back: a walk-in is a staff booking on the same day, and the day can be filled. The tire hotel table keeps the pickup text status as a line under the set (the frame had it as a column that did not fit at 1440).
- **Frame 4** (estimate) is split across the ticket page (the checklist panel, the quote builder with a condition select on each part, the 10% line, phone approval) and the customer invoice (the estimate block). "Revise and re-send" is the existing Revise quote.
- **Frame 5** (wash) shows plans, a churn figure and member counts per plan. The build lists plans on the existing Memberships and passes page and shows on the wash desk the active plans, washes today, the average a plan member and the open punch cards, plus the members with fewer than three washes. There is no churn percentage: it needs a month of cancellation history we do not keep yet.
- **M1** is built as drawn plus the tire swap booking and stored sets on the same page. **M2** is the existing quote page with the estimate box, the dates, each part's condition and the parts line. **M3** (the member card with a QR) is not built: the member's own plan card is the existing studio Passes page, and the wash looks the member up by plate or phone; a wash-branded card page is the first thing to add if a wash asks for it.
- The wash page title and the shop page link still say "classes" for a car wash (the studio pages are reused as they are).
- No mobile app screens: the pass pages are web, as for the barber and pet modules. Texts link to the web pages. The Expo ticket screen does not show a part's condition (an open item).

Not built (kept from section 5): plate cameras, VIN, inspections with photos, fleet accounts, storage billing, the customer-set maximum price.

Decisions worth knowing:

- Where the Ontario guide says "estimate", the build requires an approved quote before work on a vehicle for every shop with tickets, not only on a shop's choice. A shop that wants to quote orally uses "Approved by phone", which records the name, the number and the time.
- The cap and the revised-estimate approval were already built; the build only adds the part condition, the three dates, the odometer, the gate, the parts-return record and the estimate on the invoice.
- A reading from a ticket's odometer is recorded once per ticket, car and day, so a re-sent form does not make a second reading.
- Reminder texts count their own due date: a text or a skip is one row per car, service and due date, so a later due date (after a new service) can be texted again.
- A swap is a day booking, not a timed slot, so it does not reuse `booking_slots` (those are timed and shared with pickup and drop-off). Capacity is one number a day.
- The hourly jobs only send at 10:00 shop time and only for shops that opted in (reminders) or have stored sets (pickup).
- The Hindi, Urdu and Punjabi strings were written by the team, not a native speaker.
