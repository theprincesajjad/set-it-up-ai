# Audit: cafés and retail (cafes-retail)

Oct 27, 2026 · Reviewer plays a busy GTA café owner (two tills, part-time baristas, Square) who also thinks like a gift-shop owner, and a weekday-morning latte regular. Screenshots: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/audit/cafes-retail/` (shown below as `shots/NN-name.png`). Shops used: a new self-serve café ("Audit Latte House 3243"), Pinecone Coffee, Hearth & Crumb, Dog-Eared Books (free-plan retail), Village Apothecary (discount cards). Phone width 390 for customer; 1440 for owner.

## 1. Verdict
- **Owner:** would pay $0 today and happily; would not yet pay $39. The free stamp card, counter and home are close to what a café needs. The paid tier is "coming soon" for non-pilots and POS auto-award (Square) is not available, so two tills and a POS means double keying.
- **Customer:** yes. Join takes about 40 seconds with no app, and the card plus QR is clear. A latte-four-times-a-week regular gets a free drink in about 2.5 weeks (10 stamps).
- **Biggest blocker:** the barista still has to key every sale (last 4 digits or scan) beside the Square till, and the demo data shows impossible visit times ("Weekdays 4 am"), which makes the owner reports look wrong in a sales demo.

## 2. What works (keep)
- Signup is one short form, 7 s to a working shop, lands on a "give your first stamp" step with the QR (`shots/05`).
- Counter: scan-first, 4-digit phone entry, auto-stamp on a single match, 10-second Undo bar, auto-return in 3 s, duplicate guard message, "Reward ready" state with one-tap "Redeem free drink" and a "Stamp instead" option (`shots/30`, `32`, `82`, `83`). Verified end to end.
- Rewards page is three questions with a live pass preview, and hides compliance tables for cafés (`shots/07`). Pharmacy keeps its no-earn rules and the "no prescriptions in this total" counter check.
- Home answers "is today normal": visits vs typical weekday, hourly chart with promo band, slipping-away list that respects consent (`shots/41`).
- Customer join: unticked optional text box with exact consent copy, language switcher (EN/HI/UR/PA), welcome stamp, "Also on your card nearby" network row (`shots/20`, `23`, `65`).
- Reports: heatmap, rewards owed, joiners who came back in 7/14/30 days, network overlap (`shots/46`).
- Discount card shown to the customer with name and live time so it cannot be screenshotted (`shots/100`).

## 3. Findings

| id | severity | who | area | where | what happened | what should happen | screenshot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | major | owner | trade fit / UX | counter on any stamp shop | Every sale is keyed twice (Square till, then our counter). No POS auto-award for non-pilot shops. At a two-till rush that is a second queue. | Say plainly at signup that stamping is a manual step and offer a "stamp on tap" shortcut: customer shows pass, scanner at the till. Keep POS auto-award on the roadmap page with a date. | shots/30 |
| F2 | major | owner | UX / data | Pinecone `/m/{id}/customers`, Home, Reports | "Usually" shows "Weekdays 4 am", "2 am", "Weekends 6 am"; heatmap says "55 visits outside 7 am to 7 pm are not shown". The code uses the shop timezone, so the seeded visit times are likely wrong (cause not verified). A café owner would read it as broken. | Fix the seed so visits fall in opening hours; also show the 2-hour bucket as a range ("8 to 10 am"). | shots/42, 46 |
| F3 | major | owner | business value | Pinecone Home `/m/{id}` | Upsell card "Café & Retail adds promos... $39" shows while the sidebar already has Promos and Messages and two promos are running. | Hide the upsell when the shop already has the features. | shots/41 |
| F4 | major | customer | UX / CX | `/me` wallet header | Big "8" with "stamps to a free drink" while the shop row says "2 stamps". Reads as having 8 stamps. | Lead with "2 of 10" or "8 to go" in words. | shots/68 |
| F5 | major | owner | UX | Pinecone Promos, Home | "Double stamps on slow afternoons 2 to 4 pm" shows 0 / 0 / 0 / 0: the window has no visits in the last 4 weeks (heatmap 2 to 6 pm all 0), so the promo result cannot prove anything. Typical shows "0" not "Not enough history". The heatmap text says "The glow at weekdays 2 to 4 pm" but no glow is visible. | Seed some afternoon traffic; show "Not enough history" when typical is 0; make the glow visible. | shots/44, 46 |
| F6 | major | customer | UX | `/shops/pinecone-coffee` Promos tab | Promo cards say only "Two-stamp Tuesdays / 2x points". No days or hours ("weekdays 2 to 4 pm"), "points" in a stamp shop, shop name repeated on each card. A regular cannot plan a visit. | "2x stamps · Tuesdays all day". | shots/64 |
| F7 | major | owner | UX | Home Visits stat, Dog-Eared Books | "0 visits, -100% vs a typical Tuesday (1)" at 3 pm. The research says counts not percentages on small bases. Compares today so far with a full typical day, so mornings always look bad. | Compare with the typical count to the same hour. | shots/90-dog-eared-books-home |
| F8 | major | owner | UX | shopper app `:3701/name` | Tapping Done on the name screen showed "Can't connect right now" although no API error was logged (possible CORS or request failure). The browser then reached Discover anyway. Not confirmed; I could not repeat it reliably. | Investigate; do not block onboarding on the profile save. | shots/114-app-name |
| F9 | minor | customer | CX | web join `/j/{code}` | A first name is required before the first stamp. The page promises "30 seconds, no account". | Make the name optional; ask after the first stamp. | shots/22b |
| F10 | minor | customer | CX | join result `/j/{code}` | No Apple/Google Wallet buttons (research 7.9 asks for both). Only "Get the app" and "keep it in your browser". The regular's lock-screen stamp count is the main value. | Add the two Wallet buttons. | shots/23 |
| F11 | minor | customer | customer value | join at Pinecone | Join page shows "1 / 10", but the member really has 2 (welcome +1 and a network +50 "points" bonus converted to a stamp). Network "+50 points" is worth 1 stamp at a café and 25% of a reward at the bookshop. | Show the real balance; make network bonuses state their value in the shop's unit. | shots/65, 69 |
| F12 | minor | customer | UI | `/me` Activity | Undo shows to the customer as "Reversal: Undo at counter -2" and "Visit +2 reversed". | Hide counter-undo pairs within 10 s. | shots/69 |
| F13 | minor | customer | UI | `/me` Settings | A café regular sees tiffin, hall booking, repair and quote notification toggles. | Show only categories the member's shops use. | shots/71 |
| F14 | minor | owner | UX | counter, 390x844 | The scan box is 300 px tall, so the keypad bottom row (0, Del) is below the fold on a phone or small tablet. | Shrink the viewfinder on narrow or short screens. | shots/84 |
| F15 | minor | owner | UX | counter, duplicate message | "Priya already got stamps for this visit... adjust it from the customer's page." A barista cannot do that mid-rush, and nothing allows two drinks bought together. | Offer "Add another" (needs manager PIN) on the message. | shots/32 |
| F16 | minor | owner | UI | counter | Viewfinder is an empty black rounded box in headless (no camera); I could not verify camera scan. After a redeem the screen waits for "Next customer" while a stamp auto-returns in 3 s. | Auto-return after redeem; show a camera-denied hint. | shots/83 |
| F17 | minor | customer | UX | Counter shows network perk ("Polish Festival Points Weekend 1 of 3 shops visited") | A barista-facing screen shows a network challenge line that only the customer needs; "Stamp added for Rae. 87 pts." in a points shop. | Say "Points added". Keep the perk line on the customer pass. | shots/96 |
| F18 | minor | customer | UI | Dog-Eared Books `/shops/dog-eared-books` | Consent copy says "Your stamps work either way" in a points shop. | Use the shop's unit. | shots/92 |
| F19 | minor | owner | UX | Pinecone Customers | Stamps shown as "13 / 10", "15 / 10", "12 / 10" (multiple rewards owed) with no sign a second reward is waiting. | "1 reward + 3". | shots/42 |
| F20 | minor | owner | business value | Pinecone Messages | Default channel is Email; no Text option even with the paid tier on. For a café, text is the nudge that pays. The only sent email shows "0 came in" for 20 recipients. | Default Text when available; check the 7-day result query. | shots/45 |
| F21 | minor | owner | business value | Reports / discount cards | Discount cards (students 10% off) are show-to-save. There is no count of uses, so the owner cannot tell if it costs margin or brings visits. | Add a tally button at the counter or a weekly "shown" count. | shots/100 |
| F22 | polish | owner | UI | Rewards `/program` | "Surprise expiry is what sank Drop" refers to a competitor the owner does not know. "1 stamps" in the welcome field. | Plain copy: "Stamps never expire. Recommended." | shots/07 |
| F23 | polish | owner | UX | new shop Home / nav | A new free café sees "Street campaigns" in the sidebar though the research asked to hide it until Phase 3 GA. Setup says "Open counter, find yourself, tap Add stamp" (3 steps). | Hide; update copy to "Scan or type 4 digits". | shots/05 |
| F24 | polish | owner | UX | Dog-Eared Books Home | "YOUR FIRST 30 DAYS ... Past day 30, first stamp day 80" still shown for a 100-day-old shop. | Retire the meter after day 30 or 25 members. | shots/90-dog-eared-books-home |
| F25 | polish | customer | UI | `/discover`, `/map` | Anonymous Discover defaults to Ridgeway Plaza, not a nearby street. Map showed no tiles in this stack (likely offline here, not verified as a bug). | Pick the area from the shop link the visitor came from. | shots/62, 63 |

Counts: blocker 0, major 8, minor 13, polish 4 (total 25; F11 to F21 are minor, F1 to F8 major).

## 4. Improvements (ranked by value)
1. **Square bridge so the barista types nothing** (F1). Smallest change: a "Square payment webhook awards the stamp when the customer's phone is on the order" mode for the Plus tier; until then a keyboard-wedge or "last scan" shortcut. Files: `apps/api/src/services/integrations/*`, `apps/web/src/components/dashboard/counter/CounterApp.tsx`.
2. **Fix demo data timezone and afternoon traffic** (F2, F5). `apps/api/src/seed/demo.ts` (visit hours within opening hours, some 2 to 4 pm visits).
3. **Say what the promo is and when** (F6) and show the shop's own unit (F11, F17, F18). `apps/web/src/app/(pass)/shops/[slug]/page.tsx`, join-page copy.
4. **Hide the upsell for shops that already have the feature** (F3) and retire the 30-day meter (F24). Home page `apps/web/src/app/(dashboard)/m/[merchantId]/page.tsx`.
5. **Wallet header and activity noise** (F4, F12, F13) on `apps/web/src/components/pass/Wallet.tsx`.
6. **Compare to same-hour typical** (F7), `apps/api/src/services/reports.ts` today report.
7. **Join with first name optional, add Wallet buttons** (F9, F10). `apps/web/src/app/(pass)/join/*`.
8. **Text-first messaging and a discount-card tally** (F20, F21).

## 5. Self-serve check
- Landing to first point earned: about **4 minutes** (measured steps: signup form 7 s after filling; join on a phone about 40 s; counter stamp 5 s; the form-fill itself about 2 minutes). Reading the pricing page adds 1 to 2 minutes.
- Steps that need help: none blocked. Confusing points: "Program confirmed" is ticked before the owner has seen the program; the owner must understand the customer's name and OTP requirement on their first test; "Open counter, find yourself" instructions do not match scan-first.
- Remove or default: make first name optional, default Text for messages, hide Street campaigns and Integrations pages on the Free plan for cafés, default the reward to "Free drink after 10" (already done).
- Not verified: camera QR scan (no camera in the test browser), Apple/Google Wallet add, SMS delivery, dark mode, the two-matches list for duplicate last-4 numbers, the staff PIN login, and Square integration (not available).
