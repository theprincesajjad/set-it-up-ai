# Audit: barbershops, threading bars, beauty supply (`barbers-beauty`)

Date 2026-10-27. Owner persona: Omar, runs Crown & Fade (5 chairs, 3 renters). Also Arch & Thread (threading) and Glow Beauty Supply.
Customer persona: a regular with "my barber" and two kids, plus a walk-in from the door tablet. Phone width 390 for the customer.
Screenshots: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/audit/barbers-beauty/` (called `S/` below).
"Verified" = I saw it or called the API. "Opinion" is marked.

## 1. Verdict
- **Owner:** Omar would pay for this today only if he is a pilot shop. A new self-serve barber cannot reach the line, calendar or payouts at all (they say "Coming with Café & Retail"); on Free he gets a stamp card and nothing else. In the seeded shop the line and payouts are strong.
- **Customer:** yes for joining the line (fast, clear, family works). The walk-in who leaves no phone, or does not tick the box, is promised a text that never comes, and the guest is never told they earned a stamp.
- **Biggest blocker:** after the barber taps **Done** on the line, the visit cannot be checked out (no button), so no payment, tip, stamp or payout row. Close behind: a new shop cannot buy or turn on the barber tools.

## 2. What works (keep)
- Line board for Saturday: stats strip, per-row Call and Skip, chairs column, "Call next" picks the longest-waiting person who asked for that barber. Verified. `S/11-crown-queue.png`
- Join on phone is short (name, phone, service, barber, box). Joined in about 2.5 s; status page is big, plain, in 4 languages. `S/23-status-390.png`
- Family: signed-in parent sees "+ Aiden / + Zayn"; picking them creates kids' cut entries, consecutive places, under the parent. `S/53-_shops_crown-and-fade_queue.png`, `S/55-family-status.png`
- "My barber" is pre-selected (Marcus) from the seed. Verified via API and form.
- Duplicate join with the same phone returns the same place (no double entry). Verified.
- Renter privacy mostly holds: customers list, staff, reports, invoices, messages are 403 or "owners and managers"; other barbers' appointments are 403 `own_clients_only`; renter queue hides people who asked for other barbers; payouts shows only his row; CSV only his row; phones masked in calendar. `S/31-marcus-*.png`
- Walk-in checks out through the calendar with cash/card, tip and reward, earns a stamp and becomes a member (Walkin Wes, invoice #121); the status page then says "All done". `S/41-checked-out.png`
- Payouts page is honest ("A report, not a payment"), explains each number, has CSV. `S/11-crown-payouts.png`
- Glow claims guard: "stops hair loss", "prevent balding", "heals" are blocked with a clear reason and a rewrite hint. `S/91-glow-claim.png`

## 3. Findings

| id | severity | who | area | where | what happened | what should happen | screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | blocker | owner | UX / business value | `/m/{id}/queue` (Marcus, also Omar) then calendar | Barber taps **Done** on the line. The appointment becomes "Done, Due at checkout $42" but the detail sheet has no Check out button (button only for booked, arrived and in-service). Verified for Omar Q.; checkout code gates on `live`. No payment, tip, stamp or payout row is possible. A hurried barber will tap Done (the board's last button). | Done on the line should open checkout (or be Check out), or checkout must be allowed on a completed unpaid visit. | `S/37-detail.png`, `S/35-cal-marcus.png` |
| F2 | blocker | owner | business value | `/m/{newId}/queue`, `/payouts`, `/calendar`, `/services`; `/pricing` | A brand-new self-serve Barber shop (signed up in 7 s) sees "Coming with Café & Retail, Notify me" on every barber page. Pricing page and landing never mention walk-in line, payouts or barbers; plans are "pilot shops now", open at 100 shops (37 today). | Say on `/pricing` and the Barber signup what Free gives and when the line arrives, or let barbers turn on the line (it takes no payments). | `S/08-new-queue.png`, `S/08-new-billing.png`, `S/02-pricing.png` |
| F3 | major | owner | trade fit / privacy | `GET /v1/merchants/{id}/counter/lookup?q=0412` as Marcus (renter, own clients only) | Counter lookup by last 4 digits or phone returns name, visit count, stamp balance, last visit for any shop member. Only `customers.ts` and appointments call the own-clients guard (grep). All 12 seed members were also Marcus's clients, so I could not prove a never-served client leaks, but the route is unfiltered. | Renter lookup limited to clients they have served (or require the full card scan). | `S/31-marcus-counter.png` (route in `apps/api/src/routes`) |
| F4 | major | owner | UX / privacy | `/m/{id}/queue/door` | "Door tablet" is a page inside the owner dashboard: full sidebar (Customers, Payouts, Billing, Settings), owner name and email in the corner. A walk-in handed the tablet can open the client list. No kiosk mode or PIN to exit. | Chrome-free page (own route, no sidebar) and a PIN to leave. | `S/60-door-tablet.png` |
| F5 | major | customer | CX | `/shops/{slug}/queue`, `/m/{id}/queue/door` | A guest can join with no phone and no consent (400 only when the box is ticked without a phone). The tablet confirms "you are in line at number 8" in a small banner, then clears; the panel and status page say "We text you when you are next" even though no text will go. Signed-in parent: phone box blank and box unticked, still told "We text you once". | Tick-box and phone should be tied; show "no phone: watch the screen, you are number N" and keep the position on the tablet; do not promise a text. | `S/61-door-joined.png`, `S/55-family-status.png` |
| F6 | major | owner | UX | `/m/{id}/queue` | Skip sits next to Call, same size, no confirm, no undo, and works on someone who was never called. Two taps turn a waiting regular into a no-show and remove them. I did it to seeded Harpreet (see section 6). The rule text says "called and no answer". | Skip only after Call; confirm on second skip; Undo for 10 s. | `S/34-after-skips.png` |
| F7 | major | customer | customer value | `/shops/{slug}/queue` | Join page shows "About 35 min" but not per-barber waits or prices, though the API returns both. Picking Marcus gave "number 6, about 75 min" while Ayo was 10 min and anyone 35. The user learns after joining. | Show each barber's wait on the barber buttons and the price on services. | `S/21-join-390.png`, `S/23-status-390.png` |
| F8 | major | customer | CX | status page for a family party | Parent plus two kids: "About 30 min, 4 ahead" but the party needs three cuts (about 65 min of Marcus). Estimate is for the first start only. | Estimate for the last member, or say "first cut about 30 min". | `S/55-family-status.png` |
| F9 | major | owner | business value | `/m/{id}/payouts`, Staff | Renters are charged the shop reward: payout services are "net of a reward credit", so a Free cut earned at the shop is paid by the renter. Opinion: renters will refuse a shop-wide card unless told or shop-funded. | Option for who funds a free cut; say so on Rewards. | `S/11-crown-payouts.png` |
| F10 | minor | owner | UI / UX | `/m/{id}/payouts` | "Takes home" shows -$7.80, -$61.80, -$33.40 on a Tuesday (whole week's rent against days of work). API with 8-day range charges 205.71 rent for $180/week. No shop-income total (shop keeps + rent). | Show "rent due Friday" apart from take-home; total row for the shop. | `S/11-crown-payouts.png` |
| F11 | minor | owner | UI / privacy | renter `/m/{id}/queue`, `/calendar` | Renter board stat says "Waiting 7" but lists 5 rows; calendar's staff filter lists all four other barbers, while the payouts note promises "not other barbers' names". | Count only visible rows; hide other names. | `S/32-marcus-q2.png`, `S/35-cal-marcus.png` |
| F12 | minor | customer | CX | `/line/{token}` after done | "All done. Thanks for coming." The guest earned a stamp (member created) but is not told, and gets no link to the card. | "You earned 1 stamp. 7 more = free cut. Save your card." | `S/42-status-inservice.png` |
| F13 | minor | owner | trade fit | `/m/{id}/payouts`, `/queue` | Tips presets 15/20/25% while research says 10% is the Canadian norm for barbers. Threading bar UI says "Barber", "My barber" and "Barber's pick". | Presets 10/15/20; "Threader" label for salon vertical. | `S/40-checkout-tip.png`, `S/95-arch-join.png` |
| F14 | minor | owner | trade fit | Glow `/m/{id}/messages`, `PATCH /merchants/{id}` | "treats dandruff", "clinically proven to thicken hair" and "hair growth" pass. The shop description (public page, which Health Canada counts as advertising) accepted "stops hair loss and cures dandruff" (reverted by me). Opinion: "anti-dandruff" likely needs counsel. | Run the guard on the shop description and add "treats/anti-dandruff". | `S/91-glow-claim.png` |
| F15 | minor | owner | UI | `/m/{id}/billing`, `/messages` | Plan is "Café & Retail" but copy says "Everything in Plus" and "Automations come with Plus". | One plan name. | `S/08-new-billing.png` |
| F16 | minor | customer | UI | Glow shop page; checkout | "Your stamps work either way" on a points shop; checkout says "1 points earned" for a stamp. Rewards editor heading "Categories that don't earn" over rows that all say "Earns points". | Use the shop's term; rename the heading. | `S/93-glow-shop-390.png`, `S/90-glow-program.png` |
| F17 | minor | customer | CX | shopper app :3701 | App has Book but no Join the line, family or my barber (grep of `apps/mobile`, by design in research). Web export also fails the profile save: API CORS allows GET,HEAD,POST only, so `PATCH /v1/me` is blocked from :3701 (stack note, native unaffected; OTP prefill not reported per lead). | Link "Join the line" from the shop screen. | `S/83-app-home.png` |
| F18 | polish | owner | UI | `/m/{id}` home | Header says "closed 8:00 pm" mid-afternoon; shop page says "closes 8 pm". Status page says "number 5 / 5 ahead" after a call. | Consistent wording. | `S/10-crown-home.png` |
| F19 | polish | owner | UX | `/signup`, landing | Landing and signup list "Barber" but landing copy says "Cafés, shops, salons, repair"; no barber example. | Add a barber card. | `S/01-home.png`, `S/03-signup.png` |

Counts: blocker 2, major 7, minor 8, polish 2.

## 4. Improvements, ranked
1. **Fix Done-then-pay (F1).** Smallest change: make `live` in `AppointmentSheet.tsx` true for completed unpaid, or make queue Done open `CheckoutSheet`. Files: `apps/web/src/components/dashboard/calendar/AppointmentSheet.tsx`, the queue board component, `services/barber.ts`.
2. **Barber tools for self-serve (F2).** Show on `/pricing` and signup what barbers get free and when; if the line costs us nothing, enable `booking.walkin_queue` on Free. Files: `plans.ts`, `apps/web/src/app/(marketing)/pricing`, signup.
3. **Tablet mode (F4) and guest promises (F5).** Route outside the dashboard layout; tie the text claim to phone plus box.
4. **Show per-barber wait and prices on join (F7), party estimate (F8).** Data already in `GET /public/shops/:slug/queue`.
5. **Skip safety (F6)** and **renter lookup limit (F3)**: confirm/undo; filter `counter/lookup` by own clients.
6. Payouts copy and totals (F10), reward funding choice (F9), stamp message on the done page (F12), claims guard on the description (F14).

## 5. Self-serve check
- Landing to a created shop: 7 s of typing automated, about 3 min for a human (name, type Barber, phone, address, email, password). No help needed. Setup wizard then asks for the first stamp ("Stamp your next haircut", good).
- Landing to first point earned by a real customer: about 6 to 8 min (scan QR, phone, code, open counter, Add stamp). Nothing needs a call. Free barber gets stamps only.
- Steps that need help: getting the line, calendar and payouts (not available); setting renters (Staff > How paid) and PINs ("No PIN yet" for every barber), which a barber shop must do before Saturday.
- Remove or default: ask "chair renter, commission or employee" at signup and preset own-clients-only; default "Join the line" QR on the stand; default phone-required on the tablet.

## 6. Data I changed (review only otherwise)
Crown & Fade: skipped seeded Harpreet twice (now no-show), called/started/done seeded Omar Q. (completed, unpaid, F1), checked out my own Walkin Wes (invoice #121, 647-555-4913). Removed my test queue entries (Dan, Tablet Tim, Nikos party) and at Arch & Thread my two entries. Glow description edited then restored. New shop "Bayview Cuts 7657" (bb7657@example.com). Not tested: Saturday-hours behaviour when the shop is closed, door-tablet idle reset, multi-location, CSV for owner, Glow counter category earning (the counter is a keypad; I did not complete a product award), texts actually delivered (no SMS inbox in this stack).
