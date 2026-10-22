# Mobile UI references (Mobbin)

Real-app references for the customer app's look and feel. All screens are iOS
(Mobbin has no Android); Android follows the same layouts with Material
controls. Use these for **structure and feel**, and keep our own tokens
(`@ll/design-tokens`: paper `#FAF6EF` canvas, white cards, pine brand,
marigold reserved for points/rewards, Figtree). Our warm-paper palette is
already close to the references that feel cleanest (Corner, Rodeo, Places,
sweetgreen).

## The feel we're going for

- **Map first, warm and calm.** Full-bleed map, a floating search pill, and
  a bottom sheet. No dense toolbars.
- **One big number.** The home screen shows one large balance with a single
  progress element, not a dashboard.
- **Cards with air.** White cards on the paper canvas, 16–24 px radius,
  24 px section spacing, bold section headings, thumbnails with rounded corners.
- **Pills for status.** "Open · until 9 pm", "3 / 10", "Sponsored", "48 pts"
  are small rounded chips, never paragraphs.
- **Sheets, not pages, for quick things.** My card (QR), a shop peek, redeem
  confirmation and filters open as sheets over the current screen.

## 1. Explore map (Corner-style)

| Reference | Take from it |
|---|---|
| [Corner — your places map](https://mobbin.com/screens/74cc935e-2d23-4f24-921b-1377b9508eb5) | Pins are **round photo/logo thumbnails with a short label** under them; floating **category chips** ("all places ▾", "eat", "café") just above the sheet; recenter button bottom-right; the sheet peeks with one place card (photo, name, category, bookmark). This is the primary model for our Explore tab. |
| [Fresha — map + venue list](https://mobbin.com/screens/9c6ec1d7-3de4-4f92-9897-8b8b28e5b17c) | Search pill at top shows *what* and *where* on two lines; the sheet's half detent says "51 venues in map area" with filter chips (Venues / Best match / Price) and big image cards. |
| [Bump — place sheet over map](https://mobbin.com/screens/6e595a2b-8cf0-4099-8bc1-52b9ccc6223f) | Selected pin gets a callout ("Saved place"); a **distance pill** ("1.8 mi from you" → use km) sits on the map edge; the sheet shows an **OPEN until 9:00 PM** status chip and social links. |
| [Blackbird — curated map](https://mobbin.com/screens/2a4df07c-8cfd-4616-9319-5ee2dcc3a62e) | Minimal dot pins with one emphasized selected pin; bottom card with photo, "Bagel Shop / $$ / Nolita", and **Closed • Opens 7:00 AM**. |
| [Upside — offers map](https://mobbin.com/screens/d8884341-371c-4fa1-88bb-da9331a302aa) | Pins carry the **offer value** ("16%", "43¢/gal") — our pins show the member's balance or a promo badge. "Search this area" chip after panning; List toggle button; "You have 60 offers nearby" sheet header. |
| [Starbucks — nearby stores](https://mobbin.com/screens/6822d485-46c0-4f93-8e02-ce0ccc2d2c29) | Tabs inside the sheet: **Nearby / Previous / Favorites**; rows with distance + hours + a red "Closed" pill. |
| [Tabby — store map with clusters](https://mobbin.com/screens/5617ab31-7cb2-4aa9-8eb8-707f8e098266) | Category chips across the top, numbered cluster bubbles when zoomed out, logo rows in the list. |

**Our Explore spec, from these:**
1. Full-bleed map (react-native-maps; muted custom style). Floating search pill
   top ("Search shops on Roncesvalles"), filter icon on its right.
2. Pins: 40 px round shop logo/photo with a white 2 px ring and the short name
   underneath (Corner). Shops where I'm a member get a small marigold badge
   with my balance ("48"). A live promo adds a small pine dot. A sponsored map
   pin (Phase 3) gets a larger ring and a "Sponsored" label in the sheet,
   never a different colour that implies quality.
3. Category chips floating above the sheet (Corner): All · Coffee · Food ·
   Shops · Services · Repair · Beauty — mapped from `verticals`.
4. Bottom sheet, three detents:
   - **peek** (one card: photo, name, vertical icon · distance, Open/Closed chip, my balance or "Join"),
   - **half** ("14 shops on this strip", chips for Open now / Has promo / My shops, list of cards),
   - **full** (list with section headers: My shops, Promos nearby, Everything else).
5. Tapping a pin moves the map, highlights the pin and swaps the peek card;
   horizontal swipe on the peek card moves to the next nearest shop (Blackbird/Wolt).
6. "Search this area" chip after panning (Upside); recenter button bottom-right (Corner).
7. Neighbourhood perk banner at the top of the half sheet: "Visit 3 shops on
   Roncesvalles this month → +50 pts" with a 3-step progress.

## 2. Rewards home / wallet

| Reference | Take from it |
|---|---|
| [Blackbird — home](https://mobbin.com/screens/122d0bfe-c102-483b-960b-4af2f0126006) | **One huge centered number** with a small multiplier chip under it; "Progress to 2X Rewards" card with two small rings (3/5 dines, $50/$500); clean grey cards. |
| [Satispay — points](https://mobbin.com/screens/c38fead4-b641-47be-a6b1-412f604fb203) | Big bold level + number, a single chunky progress bar, "Lifetime points earned" chip, activity list below. |
| [Everyday Rewards — home](https://mobbin.com/screens/96d76d05-e407-4f9f-a3fd-34a651ceee3d) | "0 / 2000" with a thin progress bar and "2000 more points to collect your reward"; a 4-icon shortcut row (Card, Specials, Vouchers, Extra). |
| [Honest Greens — level](https://mobbin.com/screens/329b84ac-47bd-4b3e-b878-1e5ed9935651) | Tier stepper (Starter → Champ → Star → Legend) with ranges; "I have a code" and "History" buttons; an expiry line in small text (we only show this if a shop enables expiry). |
| [Ulta — tier ring](https://mobbin.com/screens/5e1db78b-5bb0-4336-841e-7ed0d962030f) | Ring to next tier with "Amount to go / You're earning 1 pt per $1" rows — good for a shop's VIP level detail. |
| [TheFork — empty state](https://mobbin.com/screens/bf26ab37-0135-4930-a123-9d764169de0f) | Empty "No recent activity" state that explains how to start earning. |

**Our home spec:** greeting + total network points as the single big number
(tabular figures), a chip "across 4 shops"; then a horizontal carousel of
**shop cards** (logo, name, balance, a one-line progress "2 stamps to a free
drink"); then "Nearby promos" feed cards; then the neighbourhood perk.
Shortcut row: My card · Rewards · Passport · Invite.

## 3. Stamp cards and reward tiers

| Reference | Take from it |
|---|---|
| [Honest Greens — stamp challenge](https://mobbin.com/screens/6dc61bf0-a764-450e-857c-502d99dd769c) | Stamp grid where earned stamps show the **shop's mark**, unearned show the number, the last slot is a **gift icon**; "1 / 10" pill top-right of the card. This is our StampCard. |
| [foodpanda — stamp grid](https://mobbin.com/screens/70e1c039-9b2e-4b08-b1ce-397eed8a9032) | Info banner explaining the rule, "0 / 60 orders" header row. |
| [DoorDash — punch rewards](https://mobbin.com/screens/85cc55d2-9a99-42e4-b015-2b7e00f42607) | "Unlock at **2** punches" rows with a lock over the reward image, deal terms below, a full-width "Check-in & use rewards" button pinned at the bottom. |
| [Burger King — Royal Perks redeem](https://mobbin.com/screens/d7e6bcb4-276a-4f96-9472-dfb93d0e1235) | Rewards grouped by cost (250, 400) as horizontal rows of cards, a lock on unaffordable ones, and a top bar "196 crowns away from unlocking more rewards". |
| [IKEA — locked rewards](https://mobbin.com/screens/f1fb911a-f64c-4cc4-81c6-7e0c372ca510) | "You need 60 more reward keys" caption on each locked card. |

**Our rule:** affordable rewards first with a marigold **Redeem** button;
locked rewards show "You need 12 more points" (never just a lock). Points
are always shown with the shop's terminology (stamps / points / stars).

## 4. My card (QR)

| Reference | Take from it |
|---|---|
| [sweetgreen — scan at checkout](https://mobbin.com/screens/7b45b148-b448-4371-8b72-cc43c362a54a) | A **sheet** with tabs (Earn + Redeem / Pay), a dark brand card with the balance and a white QR tile, a pill CTA "See all reward options", "How it works" steps below. |
| [Chipotle — member card](https://mobbin.com/screens/19542763-ad60-453a-9813-18b8ef9d67aa) | "SCAN BEFORE PAYING — to earn points", member name + code under the QR, black **Add to Apple Wallet** button, "Forgot to scan?" link top-left. |
| [Marriott Bonvoy — card + QR](https://mobbin.com/screens/626ceb57-4d93-47e5-9825-98e28dd2c7d4) | Card visual on top, QR below, "Add to Apple Wallet" row, big Done button. |
| [Best Buy — member ID sheet](https://mobbin.com/screens/3b2581f8-978c-4405-b916-c5bb7cddc93b) | Opens as a sheet from the wallet, name under the QR, short instruction line. |

**Our spec:** a sheet over any screen, opened from a persistent card button
in the tab bar. Pine card with total points and member name; QR in a white
rounded tile (QR always black on white); member code in large monospace below
("63F9 6QMF") for staff to type; brightness to max while open; Apple/Google
Wallet buttons; "Forgot to scan? Claim a purchase" link (uses
`POST /v1/me/purchases/claim`).

## 5. Shop detail

| Reference | Take from it |
|---|---|
| [Neo Financial — merchant page](https://mobbin.com/screens/240f1d3f-e3b5-414e-ac36-fda9c240056e) | Hero photo, **logo overlapping the hero edge**, "Jewellery · 900 Dufferin St" (a Toronto address, Canadian spelling), **Offers / About** tabs, Website button, embedded map at the bottom. Closest match to our shop page. |
| [Rodeo — place detail](https://mobbin.com/screens/8d8a9f02-bb21-4372-b031-c4c9538afa2f) | Bold section headings (About, Location) on the paper background, map card with a photo pin, "Open · Closes 5:00pm" line, round directions button. |
| [Bump — place sheet](https://mobbin.com/screens/6e595a2b-8cf0-4099-8bc1-52b9ccc6223f) | Social proof line ("14 people added it") → for us: "212 neighbours are members". |
| [Mindtrip — place card](https://mobbin.com/screens/a903fbfb-0b91-4c2a-a620-8e747bc3528f) | Photo carousel with page dots, "American · $$" meta row, a pinned bottom CTA. |

**Our spec:** hero (cover photo or the vertical's tint), overlapping logo,
name, vertical · address · distance, Open chip; my balance strip (or a
**Join — free** pinned button with the CASL consent checkbox in the join
sheet); tabs **Rewards / Promos / About**; About has hours, map card,
directions, phone, Instagram, "212 neighbours are members".

## 6. Saved / my shops lists

| Reference | Take from it |
|---|---|
| [Rodeo — My Saves](https://mobbin.com/screens/713b7876-4371-4e1a-b906-f8a9f0a27f44) | Segmented filter chips (Recents / Coming up / By day), cards with a square thumbnail, bold name, meta line and a status pill ("Did it"); a floating bottom bar with grid/map toggle + search. |
| [Places — saved places](https://mobbin.com/screens/bc0a9378-c47d-4249-93bc-b53e3cd22c56) | Calm list rows: thumbnail, name, "neighbourhood • city", category, bookmark icon; Follow / Map buttons at top. |

## 7. Tab bar

Floating pill tab bars ([Tripadvisor](https://mobbin.com/screens/15b7acd5-7a4f-4142-97c2-42adfdaae06d),
[Fresha](https://mobbin.com/screens/9c6ec1d7-3de4-4f92-9897-8b8b28e5b17c)) and a
raised centre action ([Blackbird](https://mobbin.com/screens/122d0bfe-c102-483b-960b-4af2f0126006)).
**Ours:** Home · Explore · **[My card]** (raised centre button opening the QR sheet) · Activity · Profile.
The centre button is the most-used action at the counter.
