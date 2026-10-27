# Audit: main-street-self-serve (florist, bookstore, hardware store with no module)

Reviewer: main-street-self-serve · Oct 27, 2026 · Stack: web :3700, API :4700, shopper app :3701 (all as found, nothing restarted).
Screenshots: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/audit/main-street-self-serve/` (called `SS/` below).
Method: Playwright. New shop "Lakeshore Hardware 8256" (type "Other") signed up from the marketing site; new customers on random +1647 numbers; seeded Petal & Stem (florist) and Dog-Eared Books (bookstore) looked at as owner and as shop pages. Read `docs/research/merchant-onboarding.md`, `docs/research/landing-and-network.md`, `docs/business/pricing.md`.
Tags: **V** = verified by me in the running product, **O** = my opinion, **U** = not verified.

## 1. Verdict

- **Would the owner pay?** The free program is easy to start and works (V: sign up to first point in about 4 minutes, no rep). But nothing can be paid for yet (V: every paid plan is "coming soon / ask for early access"), so today the owner pays nothing and the founder earns nothing from this owner. The owner would use it free; would pay for texts and promos only once they are buyable.
- **Would the customer use it?** Yes. Joining took 11 s scripted (about 30 s by a human), the second shop is one tap, and the first reward hook (25 welcome points) is instant (V). The customer's gain is thin for a hardware or book shop (2% back) unless the street network works (O).
- **Biggest blocker:** the "one card for the whole street" promise is not delivered to a new shop. A new shop is hidden from the map, Discover and app search until 25 members have visited (V), it never gets a map pin because no address is geocoded (V), and a shop outside the 2 pilot streets has no street at all (V). "Every small business can add this" is true for the stamp card, not for the network.

## 2. What works (keep)

- Hero and trust line: "your regulars already walk this street", "Free forever · no fee on loyalty · no contract · unlimited locations and staff" (V, `SS/landing-d-fold.png`, `SS/landing-m-fold.png`). No horizontal scroll at 390 on landing, signup, setup, home, counter, program (V).
- Named, dated competitor table (SoPoints Free 5% / 1 location, Square from CA$60) on the landing. The price of free is very clear (V).
- One-screen signup with a preview of the starter program ("1 point for every $1. 250 points = $5 off") (V, `SS/signup-hw-filled.png`). Postal code, logo, GST/HST and staff correctly pushed to later.
- Landing on "Give your first stamp" with a live QR, polling status and "Copy join link" (V, `SS/setup-first-stamp-d.png`). Milestone "First stamp, 3 min later" appears on Home.
- Counter: last 4 digits of the phone finds the customer, a typed amount awards, undo shows for 10 s, recent list (V, `SS/counter-awarded-d.png`). Staff PIN works: Set PIN, then "Sign in with a PIN" on the counter, awards are attributed to the person (V, `SS/counter-pin2.png`).
- Join page: phone, code (auto-filled in dev), first name, done. 25 welcome points and a "show this to staff" code immediately (V, `SS/join-3.png`). When already signed in, a second shop is a one-tap Join (V). Wallet totals across shops ("75 points ... across 3 shops") (V, `SS/me-m.png`, `SS/app-wallet.png`).
- Shop page lists neighbours ("More shops on Roncesvalles Village") and after joining shows "Also on your card nearby" (V, `SS/florist-joined-m.png`). The street perk ("Polish Festival Points Weekend, +50 bonus points at each new shop") is shown in `/me` and the app Discover hero (V).
- Free-plan honesty in the product: Rewards page says birthday, referrals and VIP "come with Café & Retail" and keeps them off the screen; Billing says "Loyalty is free forever" (V).

## 3. Findings

| id | severity | who | area | where | what happened | what should happen | screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | blocker | owner + customer | business value / customer value | `GET /v1/network/shops?q=Lakeshore`, app Map and Discover, `apps/api/src/services/network.ts` `listShops` (filter `status = active`), `ledger.ts`/`onboarding.ts` (`recordVisitMilestones` flips `onboarding` to `active` at 25 visited members) | After signup, join and a $42.50 sale my shop returned 0 results in the network search and did not appear on the shopper app map or in the 37 shops in Discover (V). The shop page `/shops/lakeshore-hardware-8256` works by direct link only. Even once active it would have no pin: the location has `lat: null, lng: null` and the Location edit and Settings forms have no field for it (V). The Free plan and landing promise "Network listing (map and feed)". | List a shop as soon as its first member has visited (or at signup), geocode the street address at signup so the pin exists, and show "Your shop is not on the map yet" as a setup step if it is not. Activation (25 members) should stay a rep metric, not a visibility gate. | `SS/app-5.png`, `SS/app-discover.png`, `SS/loc-edit-d.png` |
| F2 | major | owner + customer | UX / trade fit | `/signup` Neighbourhood select; `/m/{id}/campaigns` | Only 2 streets exist in the picker (Ridgeway Plaza, Roncesvalles Village) plus "Not sure / not listed" (V). A hardware store on Lake Shore chooses "not listed" and gets no street, no BIA, no perks, no "more shops on your street" for its customers (the join page shows none, V: `SS/join-3.png`). Street campaigns then says "No campaigns on your street right now ... When your BIA plans one" for a shop that has no street (V). No way to say "add my street". | Assign the street from the geocoded address (nearest neighbourhood or BIA polygon); if none, store the free-text street/BIA name, tell the owner "Your street is not live yet; we will tell you when 5 shops join", and hide the Street campaigns item. Replace the dropdown. | `SS/signup-d.png`, `SS/own-campaigns-d.png` |
| F3 | major | owner | UX / business value | `/` "How it works" | The landing's only process section says "Today, 20 minutes: A rep visits ... trains one person" and "We call on day 7 and day 30". The hero says "set up with you in 20 minutes" (V). An owner who found us on Google with no rep sees no description of the self-serve path (about 4 minutes, no visit), and the day-7/30 calls are a promise the founder cannot keep for 400 shops. The primary button is self-serve; the copy is not. | Rewrite step 1 as "Today, 5 minutes: sign up, we pick the program for your kind of shop, show the QR on your phone." Make the rep visit the secondary option ("Prefer a hand? Book a visit"). Make the day-7/30 call conditional ("if you are behind, we will text"). | `SS/landing-d-part1.png` |
| F4 | major | owner | UX / business value | `/pricing`, `/m/{id}/billing`, Home footer line | Pricing says Café & Retail "Pilot shops now ... $39" with a button "Start free, ask for early access" that goes to `/signup` (no early-access form). Billing says "Coming soon, Planned price $39" with "Notify me". Home shows "More with Café & Retail ... coming soon · Notify me". Restaurant plans "Start Starter / Growth / Pro" also go to `/signup` (V). Three different statuses for one plan; the owner cannot tell whether $39 can be bought, and the plan is called "Plus" in some copy (Billing body "Everything in Plus") and "Café & Retail" in others. | One status everywhere ("Opens when the network reaches 100 shops, 37 today. Join the list."), one working "Notify me" capture on `/pricing`, deep link plan buttons to billing after signup, one plan name. | `SS/pricing-d-full.png`, `SS/own-billing-d.png`, `SS/home-new-d.png` |
| F5 | major | owner | trade fit / business value | Home "Your first 30 days", `docs/research/merchant-onboarding.md` §4 | Success is defined as 25 members who have visited within 30 days, "12 by day 14". That fits a café with daily regulars, not a hardware store (monthly visits), a florist (occasions) or a bookstore. Seeded Petal & Stem, a healthy florist with 11 active members after 92 days, shows "Past day 30" with the only next step "Print the QR stand" (V). It also gates the map listing (F1). | Per-trade targets (for example florist/hardware/books: 10 members in 60 days) or no clock; change "Past day 30" to a positive "11 of 25, next: ask at the till". Never gate listing on it. | `SS/petal-and-stem-home-d.png` |
| F6 | minor | owner | trade fit / UI | `/` section "Built for your kind of shop" | The landing's industry chips are cafés, bakeries, salons, repair, pharmacies, restaurants. A florist, bookseller or hardware owner sees no chip and the router row says "Cafés, shops, salons, repair" (V). The demo card says "Welcome bonus: 1 stamp", while retail shops get 25 to 50 points. The signup picker is better (10 chips plus 17 more under "Something else?" incl. Florist, Bookstore, Retail) but "Something else?" is below the fold of the chips. | Add Retail/Florist/Books/Hardware chips (or a "Your shop type" search that lists all 28) and show each type's real default; on signup, put "Something else?" in the same chip row ("More types"). | `SS/landing-d-part2.png`, `SS/signup-d.png` |
| F7 | minor | owner | UX / trade fit | `/signup` "Other" | Hardware is not a type; "Retail" is the natural pick and works. If the owner picks Other (V) the program is labelled "Set up for: Your shop", one category "General", and the trade the owner does is never captured, so the founder cannot see which trades are asking for a module. | When "Other" is picked, ask one free-text "What do you sell?" and store it on the merchant; show "Retail" first for "Other". | `SS/signup-hw-filled.png`, `SS/setup-program-d.png` |
| F8 | minor | owner + customer | UX / CX | signup form | 8 fields: shop name, your name, type, mobile, street address, neighbourhood, email, password. Scripted fill 15 s; human estimate 90 to 120 s (O). Phone, email and password are three credentials; the customer side uses phone OTP only. | Keep shop name, type, mobile, street (autocomplete that also fills pin and street, F1/F2). Sign in the owner with phone OTP like customers; ask email and your name on the setup page. | `SS/signup-d.png`, `SS/signup-m.png` |
| F9 | minor | owner + customer | UI copy | counter toast, shop and join page, setup | Points shop says "Stamp added for Priya. 67 pts" (V), "Your stamps work either way" under the text-consent checkbox (V on `/shops/lakeshore...` and `/j/...`), "Give your first stamp", "Stamps by staff today" on Home. The owner and customer chose points. | Use the program's terminology (`terminology` is already in the API) in all strings. | `SS/counter-awarded-d.png`, `SS/shop-page-d.png` |
| F10 | minor | owner | UI / UX | `/m/{id}` Home for a new solo shop | The new owner's Home shows a "Today by hour vs typical Tuesday" chart of 12 zero bars, "Stamps by staff today: Spot a counter that skips the ask", "Slipping away: 0 regulars", "Regulars who came in 0 of 0" (V). That is noise for an owner with 0 to 5 members and no staff. | Hide each block until it has data (chart after 10 visits, staff block when 2 or more people stamp, slipping after 10 members). Keep the 30-day card and the next step. | `SS/home-new-d.png` |
| F11 | minor | owner | UX | `/m/{id}/staff` | Staff are invited by phone with a "sign in link" and then show "No PIN yet"; the PIN is a separate Set PIN button (V). The owner has no PIN. A hardware store with one till tablet only needs PINs. | Make the invite dialog ask for a 4-digit PIN (optional) and say "for the shared till"; add a default "Till" staff without a phone. | `SS/staff-invite-d.png`, `SS/staff-after-invite-d.png` |
| F12 | minor | owner | UX | `/m/{id}/settings` | Logo and cover photo are "Logo URL (optional)" / "Cover photo URL (optional)": a text field expecting a web address. A non-technical owner cannot use it (V). Shop avatar shows initials, which is acceptable. | File upload (or take a photo) for the logo; drop the cover URL field. | `SS/own-settings-d.png` |
| F13 | minor | owner + customer | UX | settings Hours, shop page | Hours default to "Closed" for all 7 days and the API returns `hours: null` (V). The map "open now" filter and the shop page's open or closed line are blank for a new shop. Hours are not in the five setup steps. | Pre-fill 9 to 5:30 Mon to Sat and ask "Are these your hours?" as part of Step 1; reuse them for the QR stand. | `SS/loc-edit-d.png` |
| F14 | minor | owner | UX / UI | `/m/{id}/locations/kit` | "Print or save as PDF" is the only output; the A6 stand needs "fit to page" and a printer (V). The stand says "earn points at X and every shop on the street" even for a shop with no street, and does not say what the reward is. "I printed it" is an honour tick. | Add "Download PNG / send to my phone" and a "Show on screen" mode for the till; put the first reward on the stand ("250 points = $5 off"); drop "every shop on the street" when there is no street. | `SS/qr-kit-d.png` |
| F15 | minor | customer | UX copy | shopper app `/phone` | After 3 code requests the API answers 429 "Try again in an hour" (V), the app shows "Too many tries. Try again in 10 minutes." (V). The wrong time makes a customer wait or give up. | Show the server's message. | `SS/app-4.png` |
| F16 | minor | customer | CX copy | join page | "Also on your card nearby" appears after joining even for shops the customer is not a member of; it lists them as if they were on the card (V). Shops for a customer at a shop with no street (F2) show nothing, so the cross-shop moment is lost. | Rename to "Also on this street" and show the street's perk (+50 bonus). | `SS/florist-joined-m.png` |
| F17 | polish | owner | UI copy | `/m/{id}/program` | "Recommended. Surprise expiry is what sank Drop" assumes the owner knows Drop (a dead rewards app) (V). "1 members" in Customers header (V). "Welcome point ... Given when someone joins from the counter QR" while the field is a number of points. | Plain words; plural fix. | `SS/own-program-d.png`, `SS/own-customers-d.png` |
| F18 | polish | owner | UX | landing "Ask us" | In this stack the assistant answered "not available right now ... I passed your message to the team" (V). Degrades gracefully; the real answer quality is U. | Keep the fallback; make sure the human reply reaches the owner by text. | `SS/ask-2.png` |

## 4. Improvements, ranked

1. **List every shop from its first member and give it a pin and a street at signup** (F1, F2). Smallest change: remove the `status = active` gate in `listShops` for shops with a visited member (or list on signup), geocode `locations.address` to `lat/lng` on create, and assign `neighbourhoodId` by nearest neighbourhood within its radius; otherwise store free text. Files: `apps/api/src/services/network.ts`, `apps/api/src/services/merchant.ts` (`createMerchantWithTemplate`), `apps/web/src/components/auth/SignupWizard.tsx`, `apps/api/src/services/onboarding.ts`. Value: the whole network promise for every shop, and the first 24 customers see neighbours.
2. **Make the landing speak to a self-serve owner** (F3, F6): rewrite "How it works", add the real trade chips and a visible "or do it yourself in 5 minutes". Files: `apps/web/src/app/(marketing)/page.tsx`, `apps/web/src/copy/en-CA.ts`.
3. **One truthful status for the paid plans and one working "tell me when" capture** (F4). Files: `apps/web/src/app/(marketing)/pricing/page.tsx`, `apps/web/src/app/(dashboard)/m/[merchantId]/billing`, `packages/shared/src/plans.ts` (`publicPlans`).
4. **Trade-aware activation target and no negative state** (F5). Files: `packages/shared/src/onboarding.ts` (`ACTIVATION`, `paceFor`), `apps/web/src/components/dashboard/onboarding/ActivationCard.tsx`.
5. **Cut the signup to four fields and use phone OTP for the owner** (F8, F7, F13). Files: `SignupWizard.tsx`, `apps/api/src/services/auth.ts`.
6. **Hide empty dashboard blocks and fix terminology strings** (F9, F10, F17). Files: `apps/web/src/app/(dashboard)/m/[merchantId]/page.tsx`, counter toast in `apps/web/src/components/dashboard/counter/CounterApp.tsx`, shared catalog `ob.*`/join consent copy.
7. **Staff PIN in the invite and a no-printer QR option** (F11, F14). Files: `apps/web/src/app/(dashboard)/m/[merchantId]/staff/page.tsx`, `apps/web/src/components/dashboard/QrKitPrint.tsx`.
8. **Logo upload and default hours** (F12, F13). Files: `settings/page.tsx`, `locations/page.tsx`.

Opinion on customer value (O): the default reward for Retail and Other (1 point per $1, $5 off at 250) is 2% back. For a hardware store with a $40 ticket that is 6 visits. The 25-point welcome bonus (10% of the first reward) and the street perk are what the customer feels. A $2 off at 100 points as the first rung would make the first redemption reachable in 2 to 3 visits.

## 5. Self-serve check

Timed run, owner starts on `/` with no rep.

| step | scripted (V) | human estimate (O) |
| --- | --- | --- |
| Read the hero, press Get started free | 1.5 s page load | 20 to 40 s |
| Fill the signup (8 fields) and submit | 15 s fill, 4.7 s to the setup page | 90 to 120 s |
| Program confirmed (preset, nothing to do) | 0 | 10 s |
| Owner scans their own QR, joins, gets 25 points (customer's first point) | 11.3 s | 40 s |
| Counter: last 4 digits, amount, award (first stamp milestone, "3 min later") | about 8 s | 20 s |
| **Landing to first point earned by a real customer** | **about 40 s of script** | **about 4 to 6 minutes** with the QR shown on a screen |
| Add printing the QR stand | needs a printer, "fit to page" | plus 3 to 10 minutes |

The 20-minute claim on the landing is beaten by about 4x, with no rep. The weak links are not time but dead ends.

Steps that needed help or a workaround (V unless marked):
1. **Street**: not listed and no way to add it (F2). Default: derive from the address.
2. **Pin on the map**: impossible to set (F1). Default: geocode the address.
3. **Trade**: hardware not listed; "Retail" works, "Other" loses the trade (F7). Default: Retail first plus free text.
4. **Staff PIN**: invite, then a second dialog (F11). Default: PIN in the invite; single "Till" PIN.
5. **Logo URL**: cannot be done without a web address (F12). Remove, or upload.
6. **Hours**: default Closed (F13). Default 9 to 5:30.
7. **Printing**: no printer path (F14). Add show-on-screen and PNG.
8. **Paid plan**: cannot be bought, three statuses (F4). Remove or unify.
9. **"A rep visits / we call on day 7 and 30"**: promise with no rep (F3). Remove or make conditional.
10. **Email and password**: two more credentials than the customer has (F8). Remove in favour of phone OTP.
11. **AI assistant** was down in this stack (F18, U for production).

Remove or default: neighbourhood dropdown, your name, email and password from the first screen; cover photo URL; empty Home blocks until data exists; the 30-day clock for slow trades; the "ask for early access" button until it does something.

## 6. Landing page, block by block (the question asked)

| block | earns its place? | note |
| --- | --- | --- |
| Hero + trust line | yes | clear price of the core product: $0 |
| Router row (shops / restaurants / BIAs) | yes | good; "Cafés, shops, salons, repair" is vague for a florist |
| Live counts (37 shops, 2 streets, 73.2% at 2+ shops) | yes, honest | "2 streets" tells an owner on a third street the network is not there (true, but see F2) |
| How it works | no, rewrite | rep language (F3) |
| Network block | yes | the reason to choose us; F1 means it does not hold for a new shop |
| Kind of shop (6 chips) | partly | missing retail, florist, books, hardware (F6) |
| Restaurant band | yes for restaurants, off-topic for a florist | keep after the shop blocks |
| Free means free vs SoPoints and Square | yes | the best price block; add one line: "paid add-ons open at 100 shops: $39 and $99" so the owner sees the whole price on the landing |
| BIA band with "Sample data" | yes for BIAs, none for the shop owner | fine, small |
| FAQ, Book a visit | yes | Book-a-visit is the only place the "rep" fits |

Price clear? Free is: yes. The next price ($39 Café & Retail, $99 Service) is not on the landing, only on `/pricing`, and cannot be bought (F4).
