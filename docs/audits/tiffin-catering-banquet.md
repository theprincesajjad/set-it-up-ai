# Audit: tiffin, catering and banquet (slug `tiffin-catering-banquet`)

Date 2026-10-27. Stack at localhost:3700/4700/3701. Screenshots: `S/` = `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/audit/tiffin-catering-banquet/`.
Shops used: new self-serve shop "Ammi Ka Dabba Audit" (`ammi-ka-dabba-audit`), seeded `shree-thali-and-tiffin`, `zeenat-catering`, `nawab-biryani-house` (Noor Hall). My own test data: one subscriber (+16475558290), catering inquiry #8 "Rubina Anwar" (quote approved, deposit shown as due), no hall booking created (conflict attempt was rejected).
Not driven: sign-in and purchase in the shopper app (:3701); I only loaded its welcome, "my tiffin" (empty state) and plan list screens. Text/WhatsApp delivery was not observed; reminder behaviour below is from code reading and is marked as such.

## 1. Verdict
- **Owner:** would pay $199 (Growth) for the tiffin + catering core once running: the Today sheet, driver page, e-transfer recording and quote flow are the best parts of the product. Not with the current signup and gating, which sell a loyalty stamp card and hide a wrong price.
- **Customer:** yes for the tiffin plan and the quote page (clear, phone-first, e-transfer instructions with a reference). No reason to use the wallet or shopper app for it: a subscription earns nothing and never appears in the wallet.
- **Biggest blocker:** a new "Tiffin kitchen" signs up into a free loyalty shop with no tiffin tools, then is told tiffin is "Included with Restaurant Starter, $99" when it needs Growth $199 (catering Growth, banquet Pro $349).

## 2. What works (keep)
- Owner Today (seeded Shree): servings to cook, per-plan menu with pack counts, rotli/puri totals, "Prep for the whole kitchen", allergy chips, skip counts, Delivered 7/19, Money to confirm, Needs you, driver run. `S/t1-today.png`
- Driver page `/d/<token>` at 390: next stop card, Navigate, Call, Delivered, Could not deliver, "Running late: tell the rest", language switch. `S/t2-driver-390.png`
- Auto-route by postal prefix: my new subscriber (L5R) landed on "Mississauga east" stop 1 with no action.
- E-transfer as a first-class method: owner toggles it, sets the email, customer gets "Send $65 to ... Message: LL-1001" with Copy email / Copy reference on shop page and `/me/tiffin`; owner sees "Awaiting e-transfer", "Check your bank, then record it", Record payment form with method, amount prefilled, receipt toggle, Void. Recording flipped the subscriber to Active/Paid. `S/c6-me-tiffin.png`, `S/o8-sub-sheet.png`
- Skip: one tap, clear cutoff wording per day ("Skip by Wed 8:00 a.m."), immediate credit message ("About $13 comes off your next payment"). `S/c8-skipped.png`
- Tax prompt that explains small-supplier status; GST/HST number shown on quotes only when set.
- Quote flow: per-head dish add, HST, deposit 30%, "$31.64 per guest tax included", approval link with typed signature, e-transfer or card. `S/z5-quote.png`
- Hall: conflict is blocked at hold time ("Noor Hall is already booked for part of that time"); public hall page shows packages per guest, 25% deposit, availability. `S/h4-conflict.png`, `S/h5-public-hall.png`
- Degh page: full/half, spice, add-ons, per-day "N left", 30% deposit, cancel rule after picking a time. `S/d4-preorder.png`
- Four languages on every customer page.

## 3. Findings
Severity counts: blocker 2, major 7, minor 9, polish 5.

| id | severity | who | area | where | what happened | what should happen | screenshot |
|---|---|---|---|---|---|---|---|
| F1 | blocker | owner | UX / business value | /signup | "Tiffin kitchen" creates a Free loyalty shop. Home and setup wizard are stamp-card steps ("1 of 5", QR stand, POS). Tiffin, catering and banquet are not mentioned. No "caterer" or "banquet hall" type exists. | Restaurant-type picks route to restaurant plan choice and the tiffin/catering setup path; offer caterer and banquet hall types. | `S/m-signup.png`, `S/o-after-signup.png` |
| F2 | blocker | owner | UX / pricing | /m/{id}/restaurant/tiffin, /catering, /banquet on a Free shop | Locked page says "Included with Restaurant Starter. Restaurant Starter is $99 a month." Tiffin and catering need Growth $199; banquet needs Pro $349 (/pricing and /billing say so). Owner buys $99 and finds nothing. | Name the real plan and price per feature; deep link to that plan's checkout. | `S/o-tiffin.png`, `S/o-restaurant-plans.png` |
| F3 | major | owner | UX | After upgrade at /m/{id} | Setup banner still "Complete your setup 1/5" (loyalty), Home is a restaurant orders dashboard (Busy mode, Counter, Commission avoided), not a tiffin start. No "first run" checklist (plan, route, how you get paid, tax, menu, share link). Needed: Plans, Routes, Menus, Payments (reached only via a "How you get paid" button) and Settings in five places. | Post-upgrade checklist for tiffin: plan, payment method, tax, menu, share link, with the link and QR for `/shops/{slug}/tiffin`. | `S/o2-home.png` |
| F4 | major | customer | customer value | /me, shopper app | Subscribing and paying earns no stamps/points; `/me` still says "Your shops will live here" with 0 shops and no link to "my tiffin". The setup wizard even says "A delivered box is one stamp" but the customer gets none. | Subscribers join the shop's program; delivered box or paid period earns; wallet links to tiffin. | `S/c9-me` text (no png) / `S/c6-me-tiffin.png` |
| F5 | major | customer | UX | /shops/{slug}/tiffin | Fill address, then "Sign in" step: after OTP the delivery address and postal code are blank again and must be retyped. | Keep the form state across sign-in. | `S/c4-after-verify.png` |
| F6 | major | owner | UX | Subscribers sheet | New subscriber is identified only as "+16475558290"; no name collected at subscribe. Owner cannot match "Priya" to a number. Also no "Add subscriber" for regulars who phone in (not seen in toolbar or empty state). | Ask name at subscribe; owner can add a subscriber by phone and choose pays-by. | `S/o8-sub-sheet.png` |
| F7 | major | customer | UX | /me/tiffin | A skipped day shows "Skipped" with no Undo (buttons list had only Skip on other days). One misclick loses a meal until support. | Undo before cutoff. | `S/c8-skipped.png` |
| F8 | major | customer | CX | /e/{token} | Per-guest line reads "150 trays x $28.00" (also owner editor labels "Trays / Per tray" for a per-guest dish). Deposit paragraph says "Meals start once it lands" (tiffin copy). Cancellation block says "Ask Zeenat about changes... before you sign", with no terms, even after signing. | Unit follows dish (guests); catering copy; show the actual deposit/cancel terms before signing. | `S/z5-quote.png`, `S/z6-approved.png`, `S/z4-dish-added.png` |
| F9 | major | owner | business value | Catering (code) | No scheduled job for catering deposit/balance reminders (jobs: tiffin, banquet only). Seeded "Engagement Nov 4, awaiting deposit" has no nudge. Tiffin (day 1 and 3) and banquet reminders exist in code; I did not see texts sent. | Same reminder job for event deposits and balances with a one-tap "Remind" on the card. | `S/z1-pipeline.png` |
| F10 | major | owner | trade fit | Tiffin plans | Weekly plan means a weekly e-transfer per customer to chase and reconcile; no way to bill a month by e-transfer with weekly meals, no trial day on the plan page although the menu sells "Trial Tiffin: Single Lunch". | Monthly default for e-transfer customers; trial-day plan type. | `S/c10-shree-tiffin.png` |
| F11 | minor | customer | UX | /shops/{slug}/tiffin | Menu disclosure is labelled "On the menu soon" even when the week's menu exists (expanding shows Tue to Fri). | "This week's menu". | `S/c2-choose.png` |
| F12 | minor | owner | UX | Tiffin > Menus | Edits need "Save week"; typing then navigating loses everything silently (my first pass saved nothing). | Warn on leave or autosave. | `S/o7-menu-unsaved-bar.png` |
| F13 | minor | owner | UX | Tiffin on 390 | Today is 3,600 px tall; "Needs you" and Driver run sit at the bottom; tab row clips "Revenue". Deliveries tab is 4,055 px. | Needs you and driver run first on phones. | `S/t2-today-390.png` |
| F14 | minor | owner | UX | Today (seeded) | "Allergy" block repeats the whole sentence per person ("No peanuts...: Ayesha Khan (2); No peanuts...: Hamza Butt (1)") and lists Jain under Allergy. | Group by note: "No peanuts: Ayesha (2), Hamza (1)"; Jain as a diet chip. | `S/t1-today.png` |
| F15 | minor | owner | UX | Banquet availability | Cards read "Deposits to collect $0.00 / 1 hold"; "Weekend nights taken 0 of 10" for October on Oct 27 (past nights counted open). Hold form says "up to 72 hours" while a seeded hold shows "4 d 21 h left". | Totals that match; count future nights only. | `S/h1-banquet.png` |
| F16 | minor | owner | UX | Hold conflict message | "Noor Hall is already booked for part of that time" with no who/when or nearby open slots. | Show the clashing booking and the nearest free times. | `S/h4-conflict.png` |
| F17 | minor | customer | CX | /shops/zeenat-catering/catering | Inquiry form has no packages or per-head range, and no way to follow the inquiry afterwards ("Reference #8", owner will call). Shop page says "Order at least 336 hours ahead". | Show "from $X per guest"; say "14 days". | `S/z2-inquiry-sent.png`, `S/c10-zeenat.png` |
| F18 | minor | owner | UX | Seeded routes | Route A covers L5R, L5V and Route B covers L4Z, L5V; overlap makes auto-assign ambiguous. | Warn on overlapping prefixes. | `S/t1-routes` (text) |
| F19 | minor | owner | UX | Tiffin Today on a Free-to-Growth shop | Cutoff chip "Skip cutoff for Thu, Oct 29 in 16 h 51 m" on a Tuesday is hard to read. | "Wed 8:00 a.m.: last skip for Thursday". | `S/t1-today.png` |
| F20 | polish | customer | UI | Quote page after approval | GST/HST number line is dropped after approval. | Keep it. | `S/z6-approved.png` |
| F21 | polish | owner | UI | Payments page | Four toggles all off; no default for e-transfer, which the research says is the main method. "How you get paid" is not in the sidebar. | Default e-transfer on, ask for the email at that moment. | `S/o5-howpaid.png` |
| F22 | polish | customer | UI | Shop page | Catering link is shown for a shop with no catering set up. | Show only when configured. | `S/c1-newshop.png` |
| F23 | polish | customer | CX | /shops/{slug}/menu | Degh row label "Pre-order" is not itself a link; clicking it did nothing, only the row link worked (one try, unconfirmed). | Make the whole row tappable. | `S/d3-preorder.png` |
| F24 | polish | owner | trade fit | Hall | One hall only, times like 5:21 pm to 10:15 pm in seed; no double-slot (lunch/dinner) or a Friday nikah plus Saturday walima across two days. | Slots and multi-day bookings. | `S/h2-bookings` (text) |

## 4. Improvements, ranked
1. **Fix the entry path (F1, F2, F3).** Smallest change: signup "Tiffin kitchen" and "South Asian restaurant" lead to the restaurant plan screen; correct the gate copy to the real plan and price; replace the loyalty setup banner with a 6-step tiffin checklist. Files: `apps/web/src/app/(marketing)/signup`, `apps/web/src/app/(dashboard)/m/[merchantId]/restaurant/layout.tsx`, `.../billing`, setup step config.
2. **Collect the name and keep form state at subscribe (F5, F6).** `apps/web/src/app/(pass)/shops/[slug]/tiffin`, `apps/api/src/services/tiffin.ts`.
3. **Close the money loop (F9, F10).** Event deposit/balance reminder job plus "Remind" button; monthly default for e-transfer; trial-day plan. `apps/api/src/jobs`, `services/catering.ts`.
4. **Customer value (F4, F7).** Join the shop program on subscribe; Undo skip; link `/me` to "my tiffin".
5. **Quote copy and units (F8, F17).** Per-guest unit, catering wording, visible cancel terms, indicative per-head price on the inquiry page. `apps/web/src/app/(pass)/e/[token]`, catering editor.
6. **Phone layout for owner Today (F13).**
7. Hall polish (F15, F16, F24).

## 5. Self-serve check
- Landing to a live, shareable tiffin page (scripted, no human delays): about 12 to 15 minutes: signup 2, checkout (test mode) 1, tax + payments 2, plan 1, route 1, menu 2, plus finding where each lives.
- Landing to first point earned by a real customer: **not reached.** The customer subscribed in about 2 minutes (about 3 with the address retype) and earned 0 points; the "first stamp" in setup is the owner stamping herself.
- Steps that need help: choosing the plan (the $99 text is wrong), locating "How you get paid", knowing menus need "Save week", deciding weekly vs monthly, tax status, and adding existing regulars (no add-subscriber).
- Remove or default: loyalty-first setup for restaurant types, the 1/5 banner, e-transfer default on with email prompt, auto-name from signup, preselect monthly.
