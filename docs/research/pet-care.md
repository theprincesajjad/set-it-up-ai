# Pet care: groomers, dog daycare and boarding, independent pet food stores

Market slug: `pet-care`. Written Oct 27, 2026 by the pet team (phase 3: research, Figma, build and verify in one pass). Builds on `service-businesses.md` (appointments, deposits, no-show fees and the rebooking nudge already exist and are reused), `barbers-beauty.md` (family members under one card, a person-level record under the customer, the line and the consent text pattern), `grocers.md` (the pantry reminder: a text a few days before a bulk staple runs out) and `docs/business/pricing.md`.

Figma file: https://www.figma.com/design/awcRAMkAnRmoXMtG8r58Co ("Local Loyalty — Pet care"). Frame PNGs: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/pet-care/`. Build screenshots beside them: `.../scratchpad/shots/pet-build/`.

Evidence tags: (S) sourced with a link, (C) read from our code, (E) estimate or practice we could not source, validate in pilot, (V) legal or vendor point to verify before relying on it.

## 1. Who this is for

**Independent groomers.** One to five people, a salon in a plaza or a van that comes to the home. They book by phone, text and Instagram, run a paper or free calendar, and live on regulars: a doodle on a six week cycle is worth about $90 to $120 a visit, eight to ten visits a year (E, price from the groomer listings below). Their daily pain is the dog that comes back late and matted, the no-show at 10:00, and having to remember what the dog hates.

**Dog daycare and boarding.** A room or a house with 8 to 40 dogs a day. The product is a safe room. The operator's daily jobs are: is this dog allowed in (vaccines, a passed assessment), how many dogs per staff member, who prepaid a pack, and who is late for pickup. The owner wants a quick "he is fine" with a photo.

**Independent pet supply and food stores.** The shop competes with Pet Valu and its 2.8 million Your Rewards members (S: [Pet Valu release, Nov 2024](https://www.newswire.ca/en/releases/archive/November2024/25/c6317.html)). The chain's hook is buy 12 bags of the same brand, size and format, the 13th is free. Independents run the same offer per brand, on paper cards or a spreadsheet (E: we found no independent's tracking tool; the vendor programs below tell shops to track "in store").

What they use today, USD unless noted (V, re-check before quoting):

| Tool | Who | Price | Source |
| --- | --- | --- | --- |
| MoeGo | Groomers, incl. mobile | G2 lists a Starter Mobile plan at $49 a month; Capterra lists $79 | [G2](https://www.g2.com/products/moego/pricing), [Capterra](https://www.capterra.ca/software/165732/moego) |
| Gingr | Daycare, boarding, grooming | G2 lists the Spa plan at $105 a month | [G2](https://g2.com/products/gingr/pricing) |
| Groomsoft | Groomers | $29.95 a month on Capterra | [Capterra compare](https://www.capterra.com/compare/129785-165732/Groomsoft-vs-MoeGo) |
| Pet Valu "Your Rewards" | Chain | Free to join; buy 12, 13th free | [Newswire](https://www.newswire.ca/en/releases/archive/November2024/25/c6317.html) |

No Canadian dollar price was found for MoeGo or Gingr. Our $39 Café & Retail plan (calendar, deposits, reminders, loyalty) is below all of them, and the pet pieces below ride inside it (section 4).

## 2. Evidence

### 2.1 Grooming cadence and why rebooking at checkout matters

- Groomer and breeder guides agree on 4 to 8 weeks. Curly coats (poodles, doodles, bichons) 4 to 6 weeks with brushing at home; long silky coats (shih tzu, maltese, yorkie) every 4 to 6 weeks, some say a strict 4; doodles 4 to 8 weeks depending on coat and cut length; a short, easy cut stretches the gap. [Dogkrazy](https://dogkrazy.com/blog/how-often-should-i-groom-my-dog/), [Doodle Doods](https://doodledoods.com/how-to-care-for-a-doodle/grooming-and-coat-care/grooming-costs-and-frequency/), [iHeartDogs](https://iheartdogs.com/ask-a-groomer-how-often-should-i-groom-my-dog/) (S, groomer marketing, not veterinary advice).
- Product reading: cadence belongs to the pet and the shop, not the service. The same "full groom" is every 6 weeks for a goldendoodle and every 12 for a lab. Our existing rebooking nudge hangs the interval on the service (`services.rebookAfterDays`, C), so one price-list line cannot serve a 4 week shih tzu and an 8 week lab. We keep that nudge for the other trades and add a per-pet cadence for groomers, with a default from the coat (curly 5 weeks, long silky 4, double coat 8, short 8; E, mid-points of the sources).
- Why at checkout: the dog is on the table, the owner is paying and the calendar is open. A later text competes with everything else on the phone. We found no source with a rebooking-at-checkout rate (gap). Product reading: the checkout step already asks for the next date (C, appointment checkout); the list of due pets is the safety net for the owners who said "I'll call".

### 2.2 Vaccine proof for daycare, boarding and grooming

- Law: Ontario Reg. 567 under the Health Protection and Promotion Act requires every owner of a dog, cat or ferret three months or older to have it immunized against rabies; a vet issues a certificate and a tag, and the certificate carries the owner's name and address, the animal's description and the clinic. [Reg. 567](https://www.ontario.ca/laws/regulation/900567) (S). The regulation is about the owner; it does not make a daycare check anyone's certificate. A shop's check is its own policy.
- Policy: sources agree on rabies, DHPP (distemper, parvo, adenovirus, parainfluenza) and bordetella as the minimum a daycare should ask, some add canine influenza and leptospirosis, and one example requires dogs to be spayed or neutered and flea free. [Zoomroom](https://www.zoomroom.com/tips/choosing-dog-daycare), [VCA Range Pet Lodge](https://vcahospitals.com/range-pet-lodge/services/day-care), [BC SPCA, ten questions to ask your daycare](https://bvspca.org/news-events-resources/10-important-questions-you-should-ask-your-dog-daycare) (S, marketing and a charity's checklist).
- How shops collect it today: a paper form or an email attachment kept in a folder, checked at the first visit and not again (E; the sources only say shops "require" it). The failure is the expired date nobody sees.
- Product reading: store one expiry date and one photo per vaccine, per pet; the date is what the counter checks. Required kinds are the shop's setting, with rabies, DHPP and bordetella on by default and a note that only rabies is the law. A vet certificate is not a health record of the person, so it is not health data under Ontario's PHIPA; it does carry the owner's name and address, so it is private information of the owner under PIPEDA. We keep the photo behind the same signed, expiring links as the other uploads and store no diagnosis, no medication, no vet notes.

### 2.3 Daycare packs, temperament assessments and capacity per staff

- Assessment: an intake evaluation (a short trial visit to see how the dog handles people, other dogs and the place) is the norm; dogs that guard resources are often judged unsuitable for group play. [VCA](https://vcahospitals.com/range-pet-lodge/services/day-care), [Zoomroom](https://www.zoomroom.com/tips/choosing-dog-daycare) (S).
- Ratio: 15 dogs to one staff member is the most common benchmark in the sources (some say 10 to 15, tighter for high energy groups); no authoritative standard was found. [Jet Pet Resort](https://jetpetresort.com/blog/doggie-daycare/dog-daycare-safety-best-practices/), [Zoomroom](https://www.zoomroom.com/tips/choosing-dog-daycare) (S, marketing). Product reading: capacity and dogs per staff are the shop's own numbers; we ship 16 and 15 as example defaults and say where they come from. We do not say a shop is "compliant".
- Licensing: Toronto's 2021 council file said the City does not license dog kennels; a 2025 draft of a pet establishment licence (a daycare, boarding or training endorsement, a pet daycare defined as 7 a.m. to 11 p.m. and a kennel as overnight) was in committee and its status is unclear. [2021 file](https://www.toronto.ca/legdocs/mmis/2021/gl/bgrd/backgroundfile-173357.pdf), [2025 draft](https://www.toronto.ca/legdocs/mmis/2025/ec/bgrd/backgroundfile-256994.pdf) (S, V). Ottawa licenses boarding kennels and requires an inspection under the Animal Welfare Services Act, 2019 ([Ottawa guide](https://documents.ottawa.ca/sites/default/files/lbr_guide31_en.pdf)). Product reading: we never show or claim a licence; the shop's licence number is not collected.
- Packs: daycare is sold as a pack of days (5, 10, 20) at a lower day rate, used at check-in. We found no source on pack pricing or expiry in Canada (gap). Our default: the shop sets size, price and validity; a day is used at check-in, not at booking, and a pack pays by hand (e-transfer, cash, card at the desk) so it carries no platform fee (C, pricing.md: payments recorded by hand 0%).

### 2.4 Pet food "frequent buyer" programs

- Programs are per brand, run by the retailer, and rules differ. Mud Bay publishes the clearest example: most brands are Buy 12 Get 1 (A Pup Above, Acana, Farmina, FirstMate, Fromm, Open Farm, Orijen, Primal, Vital Essentials, Wellness, ZIWI), others Buy 6, 8, 9, 10 or 11; each brand has its own card; items are grouped by size class (small, medium, large) and the free item must come from the same group; the free item is no more than the least valued of the 12; time limits are 12, 14, 18 or 24 months by brand; several brands require all purchases at the same store. [Mud Bay program rules](https://mudbay.com/program-info.html) (S).
- Red Dog Blue Kat: buy 12 of the same product line and size, the 13th is free and is the most frequently bought item; 12 months from the first qualifying purchase; tracked in store with no sign-up; the reward is product only and not transferable; purchases at different stores do not combine. [Red Dog Blue Kat](https://www.reddogbluekat.com/frequent-buyer) (S).
- Pet Valu: 12 of the same select brand, size and format, the 13th is free, over 3,000 products. [Newswire](https://www.newswire.ca/en/releases/archive/November2024/25/c6317.html) (S).
- Acana, Orijen: the "Buy 12 get 1" for Champion's brands appears in a 2025 US frequent buyer guide labelled "Champion (Acana & Orijen USA)" and on Mud Bay (a US retailer). We found no Canadian brand-run program for Acana, Orijen, Fromm or Open Farm (gap). Champion's Canadian pages say only that the brands are sold through over 2,200 neighbourhood pet stores. [Acana where to buy](https://acana.com/en-CA/where-to-buy). Product reading: do not hard-code a brand rule. The shop defines each brand's card (how many bags, how long it lasts) because in Canada the offer is the retailer's, and independents copy the chains' terms.
- Product reading: counting by brand and bag size (not "any bag") is what makes the free bag cost the shop one bag of the same value; a card per (customer, product) is the unit. A redeem button that is locked until the count is reached stops the usual loss, a cashier handing out the free bag on the 11th.
- Auto-reorder: how long a bag lasts is its weight divided by the daily amount. A 26 lb (11.8 kg) bag at 360 g a day lasts about 32 days. Feeding amounts come from the bag's chart for the dog's weight; owners know their number (E). The grocery pantry reminder already texts a few days before a staple runs out (C: five days, 10:00, only with a yes). We reuse its rules with a bag size and daily amount instead of a learned gap.

### 2.5 No-shows and late pickups

- Groomer policies seen on booking pages: 24 to 48 hours notice; a fee of half to the full price for a late cancel or no-show; some take a deposit only from repeat offenders; late drop-off past 5 to 15 minutes is rescheduled or charged a flat fee; late pickup is often $1 a minute after about 30 minutes or a holding fee per 15 minutes. One payments vendor says late fees are often waived because collecting them is awkward and a card on file fixes that (vendor view). [Goldie listings](https://book.heygoldie.com/Pets-Grub-Spa), [Schedly](https://schedly.io/payments/dog-groomers) (S, marketing, V).
- Product reading: groomers already have deposits, the card on file and a no-show fee in the calendar (C). That is the whole answer for appointments. The new gap is daycare: a late pickup after closing. We record the minutes late at check-out and show it; the shop charges by hand. Automatic late fees are not built (section 5).

### 2.6 What owners want to see

- Report cards sent during or after a visit with photos, by text or email, are standard in daycare tools (Gingr, Kennel Connection). Owners mostly want fast confirmation of the basics: did he eat and drink, were meds given, was he happy or stressed; they do not want a long story. [Gingr](https://www.gingrapp.com/blog/engage-customers-with-gingrs-report-cards), [PetExec](https://petexec.net/resources/business-operations/dog-report-cards-benefits-examples-and-templates-for-your-pet-business), [Kennel Connection](https://www.fintechfutures.com/press-releases/fintech-leader-kennel-connection-launches-enhanced-report-cards-to-help-pet-care-pros-save-time-and-build-trust) (S, vendor). One vendor says owners who get photos and a mood rating are "significantly more likely to rebook" with no study cited (V).
- Product reading: a report card is chips (mood, what we did) plus an optional line and one photo, sent as a short text with a link to a private page. Ten seconds at the table. The text names the shop and carries STOP. Because it reports a visit the owner booked, it is a service message; it does not carry a promotion.

### 2.7 Privacy

- A pet's record is not health data about a person. It is still information linked to an identifiable owner (name, phone, address on a vet certificate), and PIPEDA applies to small businesses, with a name plus address given as an example of personal information. [OPC small business notes](https://www.priv.gc.ca/media/4895/bus_notes_eng.pdf), [OPC PIPEDA pages](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/) (S). We found no OPC guidance on keys or door codes (gap).
- Product reading: the sensitive items are the owner's address and access (a mobile groomer entering a home, a boarding house with keys). We store none of: door or gate codes, key location, alarm codes, house address beyond what the existing customer record has, a vet's name or record. The handling note is for the dog ("nervous at the dryer"), visible to that shop's team only. Mobile groomers keep address and access in the appointment note they already use; we say plainly in the product that the field is not for codes (the profile card says "what we do not keep"). A pet is deleted with its owner's account (cascade) and its proof photos are deleted from storage.

## 3. Jobs to be done

Ranked by frequency times pain. O = owner, S = staff, C = customer.

1. **S, daycare: "Is this dog allowed in today, and is the room over the limit?"** Every dog, every morning. Vaccine dates and a count.
2. **O/S, groomer: "Bring the dog back before the coat mats."** A cadence per pet and one text per cycle.
3. **O, pet store: "Win the 12th bag."** A buy-N card per brand and bag size, counted and locked until earned.
4. **C: "Did he eat? Was he okay?"** A report card text with a photo after the visit.
5. **O, pet store: "Text me before they run out."** A reminder from bag size and daily amount.
6. **S: "What does this dog hate?"** A handling note and the pet's breed, size and coat on the booking.
7. **C: "Keep the shots current without driving to the shop."** The owner uploads a photo of the certificate and sees days left.
8. **O, daycare: "Sell and track packs."** Days left, used at check-in.
9. **O: "Stop no-shows and late pickups."** Existing calendar deposit and fee; late-pickup minutes recorded.
10. **C: "Many pets, one account."** A pet list under the customer.

## 4. What we build and why

### 4.1 Audit of the current build against these jobs

| Area | Today (C) | Verdict | Reason |
| --- | --- | --- | --- |
| Appointment calendar, services, deposits, card on file, no-show fee, tips, checkout | Built | Keep, reuse | Job 9, all of the groomer's booking |
| Rebooking nudge by service (`services.rebookAfterDays`, `rebooking_nudges`) | Built | Keep; add pet cadence beside it | Job 2. Interval belongs to the pet, not the price-list line |
| Family members under a customer (`family_members`, first name only) | Built | Keep for people; pets are a separate table | A pet needs breed, size, coat, shots; a child needs none. Merging would put vaccine fields on children |
| Pantry reminder (`pantry_items`, `pantry_entries`, 10:00 job, consent) | Built, grocery only | Reuse its rules and send path | Job 5 |
| Signed upload URLs (`providers/storage.ts`, service uploads route) | Built for ticket photos | Reuse for proof and report-card photos | Job 7, 4 |
| `pet` vertical template (points per dollar, $5 off) | Built | Keep; add the pet module to that vertical | A groomer and a pet store both use it |
| Customer record of a person | Built | Keep; pets hang off the owner | Jobs 6, 10 |
| Class and queue engines | Built | Not reused for daycare | A day stay is a count per day, not a class seat or a line |

### 4.2 Components, each mapped to a job (frames in Figma)

| Frame | Component | Job | Why |
| --- | --- | --- | --- |
| 1 Pet profile (1440) | Pet header with breed, size, coat and chips for the owner's other pets | 6, 10 | What the team needs at the table |
| 1 | Grooming card: every N weeks, last groom, next due, reminder date, handling note, last visits | 2, 6 | The cadence lives where it is set |
| 1 | Vaccine proof list: expiry, status tag (current, expires in N days, expired), proof on file or upload | 1, 7 | The one thing the counter checks |
| 1 | "What we do not keep" note | privacy | Says the limits out loud |
| 1 | Daycare temperament check: not tested, passed, not suitable | 1 | Required before the first day |
| 2 Groom rebooking (1440) | Stat strip, table of due and late pets, Skip and Send text, "Text all due", preview of the text | 2 | Safety net behind checkout rebooking |
| 3 Daycare today (1440) | Stat strip: in the room of capacity, staff on and ratio, expected, packs low | 1, 8 | The count |
| 3 | Dog list with Check in, Check out, and Blocked with the reason | 1, 8, 9 | Expired shot or no assessment blocks check-in |
| 4 Food cards (1440) | Brands on a card (buy N, bag rule, expiry) | 3 | The shop's own terms per brand |
| 4 | Running out soon, text date | 5 | Reminder from bag size and daily amount |
| 4 | Counter card: bag buttons, N circles, Add bag, locked Give the free bag | 3 | Count and lock |
| 5 Report card sheet (560) | Mood and what-we-did chips, optional line, photo, text preview, Send | 4 | Ten seconds |
| M1 My pets (390) | Pet card with vaccine tags, add certificate, next groom date | 7, 10 | The owner keeps proof current |
| M2 Food card (390) | Punch card, run-out line and switch | 3, 5 | Shows the next free bag |
| M3 Report card (390) | Private page: photo, chips, line, Book the next groom | 4, 2 | Rebook while happy |

### 4.3 Rules the build enforces

- **Pets belong to the owner.** A pet has an owner (a user), a name, species (dog, cat, other), breed, size band (small under 10 kg, medium, large, giant, E), coat (short, double, curly, long silky, wire, hairless). Up to 8 per owner. A shop sees only pets of its own members.
- **Vaccines.** One row per pet and kind (rabies, DHPP, bordetella, other) with an expiry date and optional proof photo. Status: current, expiring (30 days or less), expired. The owner or the shop may set a date; the proof photo is uploaded with a signed upload and shown through a short-lived link.
- **Daycare check-in is blocked (409 `blocked`)** when a required vaccine (shop setting) is missing or expired on the day, or the pet has no passed assessment when the shop requires one, or the room is at capacity (a shop manager can override capacity with a reason, never the vaccine rule), or the pack has no days left and the stay is not a drop-in. The response names what is wrong.
- **Packs.** Sold by hand at the counter (size, price and validity from the shop's settings); a day is taken at check-in; an expired pack is not used; the count never goes below zero.
- **Cadence.** Shop sets "every N weeks" per pet (1 to 26), default from the coat. Due date = last groom visit + N weeks. A pet is listed when due within 7 days or late. One text per cycle (last groom visit), never more than twice without a visit in between, only to owners with marketing consent who have not muted the shop and not STOPped, never overnight, always with STOP. A pet with a booked future appointment under its owner is not listed (reuse the existing check on the owner's appointments).
- **Report cards.** Sent by text to a phone on file, with consent for service messages given by booking (we send at most one per visit). The page is public by a long random token and expires after 30 days; the photo is a signed link. A groom report card logs a groom visit (it moves the cadence); a daycare one logs a daycare visit.
- **Food cards.** A program is a brand plus how many bags (N, default 12) and how many months the count lasts (default 12). A product (SKU) has a name and a bag weight. A card counts bags per (customer, product). The free bag can only be given when bags counted minus bags already given times N is at least N (409 `not_earned` otherwise). Bags older than the expiry window are not counted and the card says so. A free bag is not a purchase and adds nothing. Undo of the last punch within 10 minutes by the person who did it.
- **Run-out reminder.** Needs a daily amount (grams) on the card and the owner's yes recorded with who asked and where (reuse of the pantry consent record). The text goes five days before the bag should run out at 10:00 shop time, once per bag.

### 4.4 Packaging and pricing

Founder default until told otherwise (same as `barbers-beauty.md`): the four features are Café & Retail ($39), for shops whose vertical is `pet`, hidden until an admin turns them on for a pilot shop. No per-pet or per-dog charge, no pack fee. Daycare money taken by hand carries no platform fee; the existing 1% on online deposits stays. Against MoeGo ($49 to $79) and Gingr Spa ($105, both USD, V) the plan is cheaper and includes the loyalty program.

## 5. What we deliberately do not build

- **Vet records, diagnoses, medication lists, weight history, microchip numbers.** No job needs them and they raise the privacy cost. A certificate photo is the limit.
- **Door codes, gate codes, key locations, alarm codes, home addresses beyond the customer record.** See 2.7.
- **Automatic late-pickup charges.** The sources say collection is awkward and a card on file is the fix; a charge needs a policy the owner has shown the customer (Consumer Protection Act, V). We record the minutes; the shop charges by hand.
- **Overnight boarding stays, kennel runs and feeding schedules.** A day stay is a count; boarding needs rooms, nights and medication. Pilot daycares first.
- **Online pack purchase and Stripe for packs.** Packs are recorded at the counter. Revisit when a daycare asks.
- **A PDF certificate upload.** Photos only (the upload route sniffs images). Phones photograph the paper.
- **Live video, a pet GPS or a pet-parent app.** The owner uses the pass.
- **A grooming marketplace and commission.** "No commission" is the wedge (see `service-businesses.md`).
- **Brand-run program integrations (Champion, Fromm, Open Farm).** We found no Canadian program to integrate; the shop sets its own cards.
- **Inventory and a POS for food.** The shop has one; the card counts what the cashier taps.
- **Breed-by-breed grooming guides.** The default cadence is by coat, five values.

## 6. Design

Figma: https://www.figma.com/design/awcRAMkAnRmoXMtG8r58Co. Built in the existing visual language (monochrome, accent `#FF5A1F` and its dark text colour for what needs the shop now, Bricolage display on headings, Inter body, hairlines, pill buttons). All data in the frames is invented.

| Frame | Node id | Size |
| --- | --- | --- |
| 1 Pet profile | `1:2` | 1440 x 710 |
| 2 Groom rebooking | `2:2` | 1440 x 749 |
| 3 Daycare today | `2:181` | 1440 x 780 |
| 4 Food cards | `2:319` | 1440 x 710 |
| 5 Report card sheet | `3:2` | 560 x 625 |
| M1 My pets | `3:59` | 390 |
| M2 Food card | `3:105` | 390 |
| M3 Report card page | `3:153` | 390 |

Each frame has a "Why this exists" note beside it (frame 1 to the right at x 1480). Iterations: v1, then the rebooking table was fixed (header columns did not line up with the rows, the rows were too tall, and the sample due dates were wrong for today, Oct 27).

### Mobbin references

| Used for | Reference | What it taught |
| --- | --- | --- |
| Pet profile and health | [Fi, Tilda's health with Documents and Vets tabs](https://mobbin.com/screens/91f61f44-b310-478b-a122-e543cfd639d0) | Pet name as the page title, documents on their own tab |
| Pet profile | [Amazon Shopping, Your Pets with Pet Profiles](https://mobbin.com/screens/872da8c6-4c38-4333-92f9-fbe959d03560) | One line of species, breed, age under the name |
| Pet profile form | [Walmart, Pet info with health questions](https://mobbin.com/screens/160da445-5451-4800-990e-c414b79b13bb) | Keep the health questions to yes and no; we ask none |
| Locked reward | [DoorDash, Unlock at 2 punches, Unlock at 5 punches](https://mobbin.com/screens/85cc55d2-9a99-42e4-b015-2b7e00f42607) | The reward is visible and locked until the count is reached |
| Stamp grid | [foodpanda, stamp card 0/60 orders](https://mobbin.com/screens/07535f9a-17cc-450d-bfad-989aa742fb87) | Numbered circles with the filled ones dark |
| Card as a stack | [Honest Greens, challenge cards](https://mobbin.com/screens/6dc61bf0-a764-450e-857c-502d99dd769c) | A card per challenge, the last cell is the gift |
| Count to the next reward | [Shell, Fuel Rewards status: 12 more fill-ups](https://mobbin.com/screens/17a2f84f-a2f7-4e58-b06b-b45e2b675ce2) | "N more to reach" as a sentence above the dots |
| Capacity count | [Luma, Guests at a glance with cap 1,000 and Check In Guests](https://mobbin.com/screens/77625847-95c6-46b2-b900-1b8647c84ed4) | The cap and count at the top, check in as an action |
| Check-in list | [Meetup, Attendees: Checked in, Not checked in](https://mobbin.com/screens/7570078c-9460-4b54-9c7f-1f3a29af1e1d) | A status tag on each row, a filter by state |
| Activity update | [Fi, Behaviors list with Eating and Activity](https://mobbin.com/screens/cda34d5e-ab30-4739-a3ad-2bf959660a27) | Short labelled facts about the day, not prose |
| Photos and notes | [AllTrails, Edit activity with photos and notes](https://mobbin.com/screens/4fb38295-67da-4794-bfca-2fee3026141c) | A photo row with a cover, an optional note field |

Mobbin's usage notice at the time of search: "Your Mobbin AI usage is high this month. Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect."

## 7. Build spec

See section 9 for what was built and where it differs from the frames.

### 7.1 Plans and verticals

Four features in `packages/shared/src/plans.ts`, all `plus`, `vertical: "pet"`, hidden by default: `pets.profiles`, `pets.daycare`, `pets.food_cards`, `pets.report_cards`. `pets.profiles` carries the pet list, vaccines, handling note and cadence and the rebooking list; the other three each gate their own pages and endpoints.

### 7.2 Database (migration `pet`)

`pets`, `pet_vaccines`, `pet_shop`, `pet_visits`, `pet_nudges`, `pet_settings`, `daycare_packs`, `daycare_stays`, `food_programs`, `food_skus`, `food_cards`, `food_events` (twelve tables, migration `0027_pet`). Unique keys: one vaccine per pet and kind; one stay per pet and day; one card per customer and product.

### 7.3 API (`routes/pets`, contract `@ll/shared` `petApi`, doc `docs/engineering/api/pets.md`)

Staff, under `/v1/merchants/:merchantId`: `GET/POST /pets`, `GET/PATCH /pets/:petId`, `PUT /pets/:petId/vaccines/:kind`, `PUT /pets/:petId/shop` (cadence, handling note, assessment), `POST /pets/:petId/visits` (log a groom), `GET /pets/rebooking`, `POST /pets/rebooking/send`, `GET/PUT /pets/settings`, `GET /daycare/day`, `POST /daycare/stays` (expect), `POST /daycare/stays/:id/check-in|check-out`, `POST /daycare/packs`, `POST /pets/:petId/report-card`, food: `GET/POST /food/programs`, `POST /food/programs/:id/skus`, `POST /food/punch`, `POST /food/cards/:id/redeem`, `POST /food/cards/:id/undo`, `GET /food/cards`, `GET /food/runout`, `POST /food/runout/send`. Owner: `GET/POST /me/pets`, `PATCH/DELETE /me/pets/:id`, `POST /me/pets/uploads`, `PUT /me/pets/:id/vaccines/:kind`, `GET /me/food-cards`, `PUT /me/food-cards/:id/remind`. Public: `GET /public/visits/:token`.

### 7.4 Web

Dashboard: `pets` (list, add), `pets/[petId]` (frame 1 and the report card sheet), `groom-rebooking` (frame 2), `daycare` (frame 3, settings and sell a pack in sheets), `food-cards` (frame 4). Pass: `/me/pets` (M1), `/me/food` (M2), `/visit/[token]` (M3). Nav group "Pets" for shops with the features.

### 7.5 Acceptance checks

1. Rabies, DHPP, bordetella dates set and shown with the right status; an owner can upload a certificate photo and the shop sees it by a signed link; another shop cannot see the pet.
2. Check-in refuses an expired bordetella, a pet with no passed assessment, and a full room, with a message that says why.
3. A pack with 1 day left check-in leaves 0 and the next check-in is refused.
4. The 12th bag is counted, the 11th cannot be redeemed, the 12th can, and then the count restarts; bags older than the window are not counted.
5. A run-out text goes five days before the bag runs out, once per bag, only with a yes.
6. A report card text goes out with a private link; the groom visit moves the next due date.
7. A groom due list shows late pets and one text per cycle.
8. A pet's data disappears with the owner's account; the proof photos are deleted.

## 8. Open questions

- Packs and a late-pickup charge on the card: wait for the first daycare pilot.
- Whether independents want a shared brand list (Fromm 12 and 1, Open Farm 12 and 1) pre-filled. We ship the list as suggestions the shop edits.
- A PDF upload for certificates.
- A native speaker has not reviewed the Hindi, Urdu and Punjabi report card and reminder strings.

## 9. What was built, and where the build differs from the frames

Built Oct 27, 2026 by the pet team. API doc: `docs/engineering/api/pets.md`. Pricing line added to `docs/business/pricing.md` (all four features in Café & Retail for `pet` shops, founder default). Migration `0027_pet`. Seed: Pawsh Grooming, Wag Wing Dog Daycare and Tail & Kibble in Ridgeway Plaza (`owner+pawsh-grooming@example.com`, `owner+wag-wing-daycare@example.com`, `owner+tail-and-kibble@example.com`, password `localloyalty-demo`; the demo customer on +16475551000 has a dog, Biscuit, in all three). Screenshots from the final build are in `apps/web/e2e/screenshots/pets/` and `scratchpad/shots/pet-build/`.

| Spec item | Done | Where |
| --- | --- | --- |
| Pets under the customer with breed, size, coat, handling note, vaccine dates and a certificate photo by the existing signed upload | Done | `pets`, `pet_vaccines`, `pet_shop`; `/m/{id}/pets`, `/m/{id}/pets/{petId}`, `/me/pets`; uploads reuse `providers/storage.ts` (an owner's photo is stored under the owner's id and a shop's under the shop's id; a key from another account is refused) |
| Groom rebooking on the pet's cadence with a reminder | Done | `GET/POST /pets/rebooking`, `/m/{id}/groom-rebooking`, optional 10:00 job `pets.groom_reminders` (off until the shop switches it on) |
| Per-brand buy N get 1 card that counts bags by product and cannot be redeemed early, with a run-out reminder from bag size and daily amount | Done | `food_*` tables, `/m/{id}/food-cards` (brands, counter, running out), `/me/food`, job `pets.runout_reminders`, redeem enforced on the server (409 `not_earned`) |
| Daycare pack with check-in, capacity and blocks on expired vaccines | Done | `daycare_*`, `/m/{id}/daycare`; also dogs per staff, a temperament check, no-show and late-pickup minutes |
| Report-card text after a visit | Done | `POST /pets/{id}/report-card`, the sheet on the pet's page and the daycare list, `/visit/{token}` |
| Seed a demo groomer and pet store | Done | three shops (a daycare as well) |
| Four-language strings for customer text | Done, not reviewed by a native speaker | `pet.*` keys (79 plus two), added to the glossary review list |

Differences from the frames, each on purpose:

- **Frame 1** has a "Vaccine proof" list with Update on every row and a temperament control, as drawn. The build adds a "Log a groom" button (a groom without a report card, which moves the cadence) and a visits list. "Book groom" opens the existing calendar, because a groom booking is a calendar appointment (the calendar is not changed to pick a pet).
- **Frame 2** is a table with Skip and Send text per row; the build adds the switch for automatic reminders under the table (off by default) and shows "No text consent" instead of the button for an owner who never said yes.
- **Frame 3** shows a Blocked chip with the reason; the build shows the reason in red under the dog and keeps No-show beside it. The room settings (capacity, dogs per staff, closing time, required shots, temperament requirement) sit in a side panel opened from the header, and so does selling a pack.
- **Frame 4** has the same blocks. The counter panel adds Undo last bag (10 minutes, same person) and the daily amount field with the consent line, and the free-bag button is locked as drawn. The Figma sample showed a brand "Fromm 212 cards"; the build shows the real count.
- **Report card** (frame 5): the build adds "Log without a text". When the text cannot go (no phone, night, STOP, out of texts) the sheet stays open and shows the private link so the shop can hand it over. The report-card page (M3) shows the photo only when one was added.
- **My pets** (M1): the row button reads Add or Update rather than "Add a vaccine certificate (photo)" because the long label did not fit at 390; the form that opens says "Add a certificate (photo)".
- The report-card page is `/visit/<token>`, not `/r/<token>`: `/r/` is the restaurant review link (a first build overwrote it by mistake and was put back).
- The groom rebooking page moved from `/pets/rebooking` to `/groom-rebooking` so the sidebar highlights one entry, not two.
- No mobile app screens: the pass pages are web, as for the barber module. Owner texts link to the web pages.

Not built (kept from section 5): late-pickup charges, boarding, online pack purchase, PDF certificates, vet records.

Decisions worth knowing:

- A report card exists as soon as the shop asks for one to be sent: the private page and link are made even if the text is held, so no visit is lost at night. The page is public by token for 30 days.
- The groom cadence counts from the last groom visit at that shop, from a report card, a "Log a groom" tap or (for the cron) a seeded visit. It does not read appointments, because an appointment has no pet. Linking a booking to a pet is the first thing to add if a groomer wants it.
- Food-card consent reuses the pantry record (who asked, where, when) and the shop's marketing consent. A daily amount without consent does not text.
- `pets.report_cards` has no sidebar entry; it is an in-page feature (a button), listed with the other in-page features in `nav.ts`.
- The Hindi, Urdu and Punjabi strings were written by the team, not a native speaker. They are in the list for review in `docs/engineering/translation-glossary.md`.
