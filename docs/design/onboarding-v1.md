# Onboarding v1: solo pros and storefront shops, in the Clear theme

Owner: Design and strategy. Date: Oct 28, 2026. Status: spec for the build fleet (`scratchpad/phase-solo/plan.md`). Pairs with `docs/business/solo-pro-launch.md` (what we sell) and `docs/business/people-side.md` (what the client list must become). Follows `docs/design/v3.2-clear.md`, `v3.2-clear-audit.md`, `v3.2-clear-build.md` and `docs/design/ux-copy.md`.

Founder decisions folded in (Oct 28): reminders go through the app and the web pass first; Instagram is read-only and turned into bookings; the website is a built-in builder with presets; paid plans carry a promo allowance; home-based pros show by area or city only; nothing about licences or inspections anywhere.

---

## 1. What exists today, and what we keep

Read from code and `apps/web/e2e/screenshots/onboarding/*`.

| Piece | Where | Verdict |
| --- | --- | --- |
| One-screen signup: shop name, 16 type chips plus "More types", mobile, street address, email, password | `apps/web/src/components/auth/SignupWizard.tsx`, `(marketing)/signup/page.tsx` | **Keep the one-screen shape and the chips.** Change: add the solo-pro types, replace "Street address" with "Where do you work?" for home-based trades (§3.2), and route by trade (`lib/signupRoute.ts`, keep) |
| Setup page: left rail of steps, one open panel with one primary action, "Later, optional" group, progress meter in the sidebar, polling | `(dashboard)/m/[merchantId]/setup/page.tsx`, `steps.ts`, `components/dashboard/Checklist.tsx` | **Keep the master-detail layout and the polling.** It matches Shopify's setup guide and Circle's checklist (`docs/research/merchant-onboarding.md`). Change: a new step list per path (§3), step cards and choice tiles from §5, the live preview rail |
| Trade setup (plan gate, services, hours, HST, share link, first stamp) | `components/dashboard/onboarding/TradeSetup.tsx` | **Replace for solo pros** (the plan gate goes away because one calendar is free; the order changes to link → services → hours → share). Storefront trades keep it with the new components |
| Activation card on Home (members, pace, milestones, next move, sources) | `ActivationCard.tsx`, `services/onboarding.ts` | **Keep for storefronts.** Solo pros get a sibling card measured in bookings (§4) |
| Setup nudges by text (day 1, 3, 7, 14, 25), stop link | `runOnboardingNudges` | **Keep**, add the solo-pro sequence (§4) and send them as app push first, text second |
| Starter price lists per trade | `packages/shared/src/service-starters.ts` | **Keep and extend** with nails, brows and lashes, makeup (§3.4) |
| Program template per vertical | `packages/shared/src/verticals.ts` | **Keep**; add the three new verticals with a stamp program |
| The flat-3D category illustrations | `packages/design-tokens/assets/categories/*.svg`, `apps/web/public/categories/` (coffee, beauty, eat, repair, services, shops, bakery, top) | **Keep as the seed of the icon system** (§6). They already are objects with form and shadow on a pastel tile. The new set extends them, same light, same shading rules |
| Marketing hero: category tiles on a sand stage | `components/marketing/HeroArt.tsx` | Keep the structure; the new vertical pages use the same stage with the trade's own objects |

Mobbin research (run through the Mobbin MCP on Oct 28, 2026; patterns, not pixels): [Fresha onboarding](https://mobbin.com/flows/6558dbd2-ab87-41c1-bf16-3189974089ab) (email or phone first, one question per screen, a gradient splash we do not copy, the service picker with category chips and a "Try something else" list); [Square Go onboarding](https://mobbin.com/flows/29d5c7f7-ef6b-4b52-a1e9-705fff5fde60) (phone first, a code, then email; the category grid uses soft 3D objects on pale tiles, scissors, a dryer, an eye, a nail; this is the closest published reference for our icon style); [Shopify setup guide](https://mobbin.com/flows/2513bddc-2b15-4e3e-8ba3-39b637ccc85a) (one collapsible checklist, the current task open with one primary button, "1 / 11 completed", a product illustration beside the task); [Linear onboarding](https://mobbin.com/flows/cbaf58a9-fd84-4afe-b214-e65b24484013) (a centred card per step with a dot progress row, "Invite co-workers" with a plain "I'll do this later", a "That was easy" beat after the first action). A GlossGenius search returned Mindvalley screens, so GlossGenius is not cited.

---

## 2. Principles

1. **Time to value: the booking link is live in under three minutes** from "Create my shop". Measured from `signed_up` to `booking_link_live` milestones (new).
2. **One question per card, one primary button.** Secondary actions are text links. Nothing is modal.
3. **Nothing blocks the link.** Services from a template, hours from a default, privacy from the signup answer. The pro can go live with defaults and fix later; the setup rail stays until it is done.
4. **The preview is live.** Every step updates the phone-sized booking page on the right (desktop) or in a sheet (phone). The pro sees what her client will see as she types.
5. **Copy is plain, warm and short** (`ux-copy.md`): second person, sentence case, no "Oops", no "Upgrade", no developer words, Canadian spelling. Trade words (client) are fine inside the pro's own tools; shared screens say "customer".
6. **Clear theme, exactly.** Content layer flat Polaris white; glass only on the chrome. The onboarding components are content, so they are cards, not glass. Primary button black. Trade colour appears in the shop mark, the preview's stamps and the 3D objects' accent face, nowhere else.
7. **No gradients as decoration, no AI slop.** The 3D comes from form, light and shadow (§6), never from rainbow fills, glows or sparkles.

---

## 3. The flows

### 3.1 Which path

| Signup type | Path | First step after signup |
| --- | --- | --- |
| Nail tech, brow and lash tech, makeup artist, hairstylist working alone, barber working alone, pet groomer working alone, tutor or other by-appointment | **Solo pro** | `your_link` |
| Salon, barbershop, spa with staff, groomer with staff | **Storefront, appointment-led** | `your_link` (same steps, plus `staff`) |
| Café, bakery, restaurant, grocer, pet shop, pharmacy, retail, repair | **Storefront** (existing, re-skinned) | `first_stamp` or `trade_setup` as today |

Vertical additions (`verticals.ts`): `nails`, `brows_lashes`, `makeup`. Each a stamp program (1 stamp per visit, 6 = "$10 off your next visit"), `upsellPlan: "plus"`. Chips at signup in the order most owners pick: Nail tech · Brows & lashes · Barber · Salon · Makeup artist · Café · Bakery · Restaurant · …

### 3.2 Signup (both paths), one screen, under 60 seconds

Fields: Shop or studio name · What kind of shop? (chips) · **Where do you work?** (three choice tiles: "My place" / "A shop or salon" / "I travel to clients") · Mobile number · Email · Password. The street address field shows only for "A shop or salon"; "My place" asks for a postal code only ("We show your area on the map, never your address"); "I travel" asks for nothing.

Copy under the name field for a home-based pick: "Your address stays private. Clients get it after they book."

Prefill from the ad or landing page: `?vertical=nails&src=ig`. The sales-assistant prefill (`signupPrefill.ts`) keeps working.

### 3.3 Solo pro setup: six cards, three minutes

| # | Step key | Title | Body (copy) | Primary | Secondary | Preview shows | Target time |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `your_link` | Your booking link | "This is what you put in your bio. Pick a name people will recognise." Field prefilled from the studio name, slug shown live: `localloyalty.ca/<slug>`. Below: "Have an Instagram? Paste your handle and we'll match it." (§3.6 import) | Save and continue | Skip | The booking page header with the name and the trade colour | 20 s |
| 2 | `services` | Services and prices | "Start from the usual list for your trade. Change anything." A checklist of the starter services with price and duration editable inline; a "+ Add a service" row; a toggle "Ask for a deposit" per service with the default from the template | Save and continue | Add all, I'll edit later | The service list on the booking page | 60 s |
| 3 | `hours` | When can people book? | "Pick your usual days. You can block any day later." A week strip of seven day chips, each with a start and end time; a "Same every day" shortcut; "Bookings need N hours notice" (default 24) | Save and continue | Use these defaults | The first available slots appear on the preview | 30 s |
| 4 | `privacy` | Your address | For "My place": "Clients see **Bloor West area · by appointment**. They get your address after they book, in the confirmation and the day-before reminder." Two tiles: "Show my area" (default) / "Show the city only". For "I travel": "How far do you go?" (radius chips 5 / 10 / 20 km). For "A shop or salon": the address check, as today | Save and continue | | The map thumbnail with the soft pin, and the confirmation card "Address: sent after you book" | 15 s |
| 5 | `share` | You're live. Share it. | "Your link is live. Put it where your clients already are." Three rows with a 3D object each: **Instagram bio** ("Copy link", then the three steps to edit a bio), **Text it** ("Text yourself the link"), **QR** ("Download" for a story or a mirror sticker). Below: "Already booking somewhere else? Paste your Linktree, Fresha or Booksy link and we'll show you what to move." (§3.6) | Copy link | Download QR | The full booking page, now with "Book" enabled | 30 s |
| 6 | `invite` | Invite your regulars | "Send your link to the people who already come. This goes from your phone, so it reads as you." A textarea with a prefilled message ("Hey! I've moved my bookings to one link. Grab your next spot here: {link}") and a big "Open in Messages" button (`sms:` with the body) on phones; on desktop a "Text me this message" button and the same QR. Optional: paste numbers to create client records (no message is sent by us) | Open in Messages | I'll do this later | The client list preview with the pasted names | 30 s |

After step 5 the Home page replaces the setup rail with the **Bookings activation card** (§4). Steps 6 and the "Later" group stay in the rail.

**Later, optional** (never blocks): `profile` (photo, a sentence, the shop mark), `loyalty` (the stamp card is already on; this card explains it: "Every visit earns a stamp. Six stamps, $10 off."), `instagram_connect` (the Settings card "See your Instagram messages here and turn them into bookings" with the professional-account note; stub until Meta approval), `site` (annual: "Your site, ready to publish" with the three presets, §3.7), `promos` (paid: "4 promos a month to your regulars", the template picker), `pos` (storefronts only).

### 3.4 Services and prices templates per trade

Added to `service-starters.ts`. Prices are starting points in CAD (A; nothing cited; the pro edits them). `rebookAfterDays` drives the rebooking nudge on paid plans.

| Trade | Services (duration · price · deposit · rebook) |
| --- | --- |
| **Nails** | Gel manicure 60 · $55 · $15 · 21 · Gel extensions, full set 120 · $90 · $25 · 21 · Fill 90 · $65 · $20 · 21 · Removal 30 · $20 · 0 · — · Pedicure 60 · $60 · $15 · 35 · Nail art, per nail 10 · $5 · 0 · — |
| **Brows and lashes** | Brow shaping 20 · $25 · 0 · 21 · Brow lamination 60 · $85 · $20 · 42 · Brow tint 20 · $20 · 0 · 28 · Classic lashes, full set 120 · $120 · $30 · 21 · Lash fill 75 · $70 · $20 · 21 · Lash lift and tint 60 · $95 · $20 · 42 |
| **Makeup** | Event makeup 60 · $90 · $30 · — · Bridal trial 90 · $120 · $40 · — · Bridal day 120 · $250 · $100 · — · Lesson 90 · $120 · $30 · — |
| **Barber** (existing list, keep) | Haircut 30 · $35 · 0 · 28 · Cut and beard 45 · $50 · 0 · 28 · Kids' cut 25 · $25 · 0 · 35 · Beard trim 20 · $20 · 0 · 21 |
| **Salon** (existing list, keep) | Haircut, Colour (from), Brow threading, Blow dry |
| **Pet groomer** (existing by-size list, keep) | |

Deposit defaults: on for anything 60 minutes or longer; "Ask for a deposit" copy: "A deposit holds the spot and comes off the price. Clients can change for free until 24 hours before."

### 3.5 Storefront shops (café, barbershop with staff, salon)

Same components, different list. Appointment-led storefront: `your_link` → `services` → `staff` ("Who takes bookings? Add your team; each gets their own column and PIN") → `hours` (per staff) → `share` → `invite`. The one-calendar cap shows as a quiet line on `staff`: "The free plan books one calendar. More chairs are on Café & Retail, $39 a month, no per-chair charge." with a secondary "See the plan".

Café and retail: the existing `program` → `first_stamp` → `qr_kit` → `staff` → `first_members` sequence, re-skinned with the step cards, choice tiles and the 3D objects; copy unchanged except where `ux-copy.md` is not followed today.

### 3.6 Import from an Instagram bio or an existing link

What is possible without Meta approval:

- **Handle match**: the pro types `@handle`; we set `merchants.instagram`, offer the slug `handle` if free, and show "Message" (`ig.me/m/handle`) on the shop page.
- **Public link pages** (Linktree, Beacons, Fresha and Booksy profile pages are public HTML): on `share`, "Paste your current link" fetches the page server-side (allow-listed hosts only, 5-second timeout, no login), extracts the visible links and, for Fresha and Booksy, the service names and prices if present in the page, and shows "We found these. Add?" as a checklist. Nothing is fetched from instagram.com itself (no official way to read a profile without login; we do not scrape it).
- **Instagram messages**: only after the connector ships (read-only; see `solo-pro-launch.md` §6).

### 3.7 The website preview (annual)

The `site` card shows three presets rendered with the pro's real data, side by side at phone width, each a flat card with a 3D object above it: **Studio** (one page, big booking button, services as a list, the map pin), **Portfolio** (a photo grid first, booking second), **Shop front** (storefront trades: hours, menu or price list, order or book, reviews). "Pick one. The copy is written for you from your services and reviews; change any line." The builder itself lives at `/m/[id]/site` (plan.md, workstream G): preset → AI draft (Claude, capped at 10 drafts and 40 edits a month) → inline edits → domain ("Pick your .ca; we register and renew it while you're on the annual plan") → Publish. On Free and monthly the card shows the preview with a quiet "Included with the annual plan, $390 a year" and the founding price when it applies.

---

## 4. Activation, nudges and the people-side hook

**Milestones (new keys in `merchant_milestones`):** `booking_link_live`, `first_share`, `first_online_booking` (by someone other than the owner; the activation event for solo pros), `five_bookings`, `first_promo_sent` (paid), `site_published` (annual), `instagram_connected`.

**Bookings activation card (Home, solo pro, first 30 days):** title "Your first 10 bookings"; the number of online bookings by others; a pace line ("3 by day 7 keeps you on track", A); four milestones (link live, first share, first booking, 10 bookings); one next move (share the link / invite regulars / turn on the deposit / post the QR to a story). Sources list: Instagram bio, text, QR, the map, "Powered by" links.

**Nudges (app push first, text second, same stop link):**

| Day | If | Message |
| --- | --- | --- |
| 1 | No share | "Your link is live but nobody has it yet. Put it in your bio: {steps}" |
| 3 | No booking by others | "Try this: text your last five clients your link. Here's a message you can send: {prefilled}" |
| 7 | < 3 bookings | "A $15 deposit on your longer services cuts no-shows. Turn it on in a tap: {link}" |
| 14 | ≥ 5 bookings, Free | "Your regulars are on your card now. Send them a promo for {season}: {template}" (paid preview) |
| 25 | Any | "Your site is ready to publish on your own .ca: {preview}" (annual preview) |

---

## 5. Onboarding components (content layer, Clear)

All values follow `v3.2-clear-audit.md` §2 (card radius 12, control radius 8, 13/20 body, 14/20 card titles at 650, 26/32 page titles, 4/8/12/16/20/24/32 spacing, card padding 16 desktop and 16 phone, black primary 40 px on desktop and 44 on phones, hairlines `--border`).

| Component | Spec |
| --- | --- |
| **`SetupProgress`** | The rail (desktop 240 px, left) or a top strip (phone). Steps as 28 px rows: a 20 px circle (hairline ring; filled black with a white check when done; a black ring with the number when current), the title at 13/550, the time estimate at 12 muted ("20 s"). A 2 px progress track under the group title (`--seg-track` with a black fill). On phones the strip is horizontal: "2 of 6 · Services" with the track, the rows in a sheet on tap |
| **`StepCard`** | White card, 12 radius, 1 px `--border`, `--shadow-card`. Header: a 64 px 3D object (§6) top left, the title 20/26 at 650, the body 13/20 muted, max 60 words. Body region: the form. Footer: primary black button right, secondary text link left ("Skip", "I'll do this later"), both 40 px. The card animates in 120 ms fade and 8 px rise; reduced motion: instant |
| **`ChoiceTile`** | A radio presented as a tile: 1 px `--border`, 12 radius, 16 padding, a 40 px 3D object, a 14/550 label, a 12 muted one-line hint. Selected: 2 px black ring, no fill change. Grid: 3 across on desktop, 1 across on phones with the object left. Keyboard: arrow keys move, space selects; `role="radio"` inside `role="radiogroup"` |
| **`ServiceRow`** | A checklist row: 20 px checkbox, name (13/550), duration and price as inline editable fields (tabular, 32 px slim controls), a "Deposit" toggle with the amount. Hairline between rows, no left border. Add row: dashed hairline, "+ Add a service" |
| **`WeekStrip`** | Seven day chips (Mon–Sun, 40 px tall, segmented-control look, `--seg-track`, selected white with the 1 px shadow). Below, start and end `TimeField`s for the selected day, "Same every day" as a text link |
| **`LivePreview`** | A phone frame, 300 × 620 on desktop in a right rail (sticky, 24 px from the top), rendering the real `BookFlow` in a read-only mode with the shop's current data; on phones a bottom sheet toggled by a glass pill "Preview" (the only glass element in onboarding, because it is chrome). Updates on every saved field with a 160 ms crossfade |
| **`ShareRow`** | A row with a 40 px 3D object, a 13/550 title, a 12 hint, and one 32 px secondary button right ("Copy link", "Download") |
| **`PresetCard`** (site) | A 3:4 card with a static render of the preset at phone width using the pro's data, a 14/550 name, a 12 hint, a "Pick" primary when hovered or focused |
| **`PlanLine`** | The quiet upsell: 13 muted text with the price and a "See the plan" text link. Never a banner, never a button |

Empty, loading and error states follow `v3.2-clear.md` §4 (Polaris empty state; skeleton rows; the error banner with "Try again").

---

## 6. The 3D icon and illustration system

### 6.1 Why 3D, and how it stays inside the rules

The founder banned gradients as decoration and "AI slop", and asked for custom 3D-style SVG icons. These are compatible if the 3D is **form, light and shadow**, not colour effects. The reference is Apple's and Shopify's product-object style (and the Square Go category grid seen on Mobbin): simple clay-like objects with a single light source, two or three flat tones per surface, a soft contact shadow, and a restrained palette. No rainbow fills, no glows, no sparkle, no lens flares, no specular highlights sprayed on everything. A tonal step on a face is shading; a mesh gradient on a background is decoration. The existing `categories/*.svg` set already follows this and is the seed.

### 6.2 Style rules

| Rule | Value |
| --- | --- |
| Light | One source, top-left, 135° (from the upper left, slightly in front). Every object in the set is lit the same way; never mirror an object without re-lighting it |
| Form | Rounded "soft clay" primitives: cylinders, slabs, capsules, spheres, with corner radii about 12–18% of the object's width. Isometric-ish three-quarter view, 20–25° rotation, 15° tilt; no perspective convergence |
| Shading | Exactly three tones per material: **lit** (the base colour), **mid** (base mixed 18% toward ink), **shade** (base mixed 36% toward ink). Flat fills, hard edges between faces. One optional 1 px lighter edge on the lit top-left rim (base mixed 20% toward white), used only on the largest surface |
| Shadow | One contact shadow: an ellipse under the object, ink at 8% opacity, blurred 2 px, offset 2 px down-right. No cast shadows across other objects |
| Palette | Neutral body from the Clear tokens: lit `#F2F2F7`, mid `#D2D2D7`, shade `#AEAEB4`; ink `#1D1D1F` for marks. **Trade colour enters as one accent material** per object (the nail polish, the clipper's blade guard, the coffee in the cup), using the trade family's accent (`--trade`, 14 families in `v3.2-clear.md` §2.4) with the same three-tone rule. When no trade is known (marketing, generic steps), the accent is the sky family `#2873B0` in light. Nothing else is coloured. Dark mode: the body tones become `#3A3A3C` / `#2C2C2E` / `#1C1C1E`, the accent is the family's dark value, the shadow is white at 6% |
| Gradients | None in fills. The only permitted gradient is the existing specular rim on glass chrome, which is not part of the icon set |
| Line | No outlines. Faces meet by tone. Interior marks (a stamp, a digit) are ink at 100% or white |
| Stroke icons | For 16–24 px UI glyphs the app keeps Lucide (`lucide-react`). The 3D set is for 40 px and up only. Never put a 3D object where a Lucide glyph belongs (table rows, buttons, nav) |

### 6.3 Grid and sizes

- Built on a **24-unit grid** at 48 × 48, exported as SVG with `viewBox="0 0 48 48"`; the object fills 36 units with a 6-unit margin so the shadow sits inside the box. Corner radii snap to the grid.
- Sizes used: **40** (choice tiles, share rows), **64** (step cards), **96** (empty states, Home cards), **120** (landing-page hero tiles). Spot illustrations (below) are 160 × 120 (`viewBox="0 0 160 120"`) and use the same grid at 40 units.
- Files: `packages/design-tokens/assets/icons3d/<name>.svg`, copied to `apps/web/public/icons3d/` at build (same mechanism as `categories`). A React wrapper `Icon3d name="nails" size={64} trade="rose"` sets the accent via CSS variables inside the SVG (`fill: var(--i3d-accent)` and the two derived tones), so one file serves every trade colour. The accent tones are computed in `packages/design-tokens` (`icon3dTones(familyAccent)`) with `color-mix` in CSS.
- Accessibility: decorative, `aria-hidden`, `alt=""`; each object also exists as a PNG @2x for email and Open Graph.

### 6.4 The set

**Trade objects** (40 / 64 / 120; accent = trade colour)

| Name | Object | Accent face |
| --- | --- | --- |
| `nails` | A polish bottle with a rounded cap beside a single nail tip | The polish |
| `brows_lashes` | A tweezers and a lash wand crossed on a slab | The wand handle |
| `makeup` | A compact, lid open at 30°, with a brush | The powder |
| `barber` | Clippers, three-quarter view | The blade guard |
| `salon` | Scissors and a comb on a slab | The comb |
| `groomer` | A dog brush and a bow | The bow |
| `cafe` | The existing coffee cup (re-exported to the grid) | The coffee |
| `bakery` | Existing | The glaze |
| `butcher` | A cleaver on a block | The handle |
| `pet_shop` | A food bowl with a paw mark | The bowl |
| `repair`, `shops`, `services`, `eat` | Existing, re-exported | |

**Step and concept objects** (64; accent = trade colour when known)

| Name | Object | Used on |
| --- | --- | --- |
| `link` | Two chain links, one lit | `your_link` |
| `price_tag` | A tag with a hole and a string | `services` |
| `calendar_week` | A calendar slab with seven stubs, one raised | `hours` |
| `pin_area` | A soft map pin inside a translucent-looking disc (two tones, no blur) | `privacy` |
| `megaphone` | A small megaphone | `share`, promos |
| `phone_message` | A phone with one speech bubble | `invite`, texts |
| `qr_stand` | The existing counter QR stand | `share` QR, `qr_kit` |
| `stamp_card` | A card with six stamp dots, two filled in the accent | `loyalty`, program |
| `deposit` | A coin on a slab with a small lock | the deposit toggle, no-show policy |
| `bell` | A bell | reminders |
| `pass` | A wallet pass with a notch | wallet, the pass |
| `site` | A browser window slab with a tiny page | `site` preview |
| `domain` | A globe on a slab | domain step |
| `inbox` | A tray with two letters | inbox, Instagram card |
| `instagram_mark` | A rounded square with a ring (not the brand logo; our own object) | `instagram_connect` |
| `team` | Two capsules side by side, one shorter | `staff` |
| `pos` | A card reader | `pos` |
| `check_done` | A tick on a disc | step done, "You're live" |
| `sparkle_none` | (deliberately absent) | |

**Spot illustrations** (160 × 120; one scene each, same rules, at most four objects per scene)

| Name | Scene | Used on |
| --- | --- | --- |
| `live` | The link object, the phone and a tick | "You're live" banner |
| `first_booking` | The calendar with one raised accent stub and the bell | Activation card empty state |
| `regulars` | Three passes fanned, the megaphone | Promos card, people-side empty state |
| `home_studio` | The pin inside its disc beside a small house slab | Privacy step, landing page |
| `site_ready` | The browser slab with a tiny booking button and the globe | Site card |
| `inbox_quiet` | The tray, empty, with the Instagram object beside it | Inbox empty state |
| `chairs` | Three clippers in a row, one accented | Staff step (barbers), "no per-chair charge" |

### 6.5 Production notes for the build team

- Author each object once in Figma on the 24-unit grid, three tones per material as named colour styles (`i3d/body/lit` …), export SVG with `fill` attributes replaced by the CSS variables by a script (`packages/design-tokens/scripts/icons3d.mjs`), and check the result in both themes with the e2e screenshot job.
- A contrast check is not needed for decorative objects, but the accent must still be the family accent so the object matches the shop mark beside it.
- Reduced motion: objects never animate on their own; the step card's 8 px rise is the only motion and it is disabled under `prefers-reduced-motion`.
- As built (solo pro, workstream C): the set is authored in code, not Figma (`packages/design-tokens/scripts/icons3d/`: one projection with yaw -24 and tilt 22, light from the top-left, primitives for slab, cylinder, sphere and extruded plate, three flat tones per material). `pnpm --filter @ll/design-tokens build` writes `assets/icons3d/*.svg` (41: 16 trade objects including the existing `beauty` and `top`, 18 step objects, 7 scenes), `@2x.png`, `sprite.svg` and `css/icons3d.css`, copies them to `apps/web/public/icons3d/` and `apps/mobile/assets/icons3d/`, and fails on any gradient, filter, raw colour or unknown tone class. The shadow is three stacked ellipses (a blur filter is not allowed). `Icon3d` references the sprite, so the accent and the dark body tones come from CSS variables; in an `<img>`, an email or an OG card each file falls back to the light neutral body and the sky accent. Contact sheet: `/dev/onboarding-kit/icons`; component kit: `/dev/onboarding-kit`.

---

## 7. Copy sheet (English; keys for `packages/shared/src/i18n/messages/*`, to be translated into hi, ur, pa by the copy workstream)

| Key | Copy |
| --- | --- |
| `ob.solo.link.title` | Your booking link |
| `ob.solo.link.body` | This is what you put in your bio. Pick a name people will recognise. |
| `ob.solo.link.handleHint` | Have an Instagram? Paste your handle and we'll match it. |
| `ob.solo.services.title` | Services and prices |
| `ob.solo.services.body` | Start from the usual list for your trade. Change anything. |
| `ob.solo.services.depositHint` | A deposit holds the spot and comes off the price. Clients can change for free until 24 hours before. |
| `ob.solo.hours.title` | When can people book? |
| `ob.solo.hours.body` | Pick your usual days. You can block any day later. |
| `ob.solo.privacy.title` | Your address |
| `ob.solo.privacy.area` | Clients see "{area} · by appointment". They get your address after they book, in the confirmation and the day-before reminder. |
| `ob.solo.privacy.city` | Clients see "{city} · by appointment". |
| `ob.solo.share.title` | You're live. Share it. |
| `ob.solo.share.body` | Your link is live. Put it where your clients already are. |
| `ob.solo.share.paste` | Already booking somewhere else? Paste your Linktree, Fresha or Booksy link and we'll show you what to move. |
| `ob.solo.invite.title` | Invite your regulars |
| `ob.solo.invite.body` | Send your link to the people who already come. This goes from your phone, so it reads as you. |
| `ob.solo.invite.message` | Hey! I've moved my bookings to one link. Grab your next spot here: {link} |
| `ob.solo.staffCap` | The free plan books one calendar. More chairs are on Café & Retail, $39 a month, no per-chair charge. |
| `ob.solo.site.title` | Your site, ready to publish |
| `ob.solo.site.body` | Pick one. The copy is written for you from your services and reviews; change any line. |
| `ob.solo.site.plan` | Included with the annual plan, $390 a year. |
| `ob.solo.promos.title` | 4 promos a month to your regulars |
| `ob.solo.promos.body` | Valentine's nails, back-to-school cuts, Eid brows. Sent to the people who already come, by app and email. |
| `ob.solo.instagram.title` | Your Instagram messages, next to your calendar |
| `ob.solo.instagram.body` | See your DMs here and turn one into a booking in a tap. You still reply from Instagram. Needs an Instagram professional account. |
| `ob.solo.instagram.soon` | Coming soon. Add me to the list |
| `ob.solo.activation.title` | Your first 10 bookings |
| `ob.solo.activation.pace` | {n} by day {day} keeps you on track |
| `ob.solo.live` | You're live. Your first client can book right now. |

---

## 8. Acceptance for this spec

- A new nail tech reaches `booking_link_live` in under 3 minutes in the e2e test (`e2e/onboarding-solo.spec.ts`), at 390 and 1440, in English and Urdu (RTL mirrors the rail and the preview).
- Every onboarding screen passes the Clear audit values (`v3.2-clear-audit.md` §2) when measured with the audit's `measure.js` approach.
- The 3D set renders in light and dark with the trade accent switched by CSS variable; no SVG contains a `linearGradient` or `radialGradient` element (a lint rule in `icons3d.mjs`).
- No address appears anywhere a client can see before booking (`privacy.spec.ts`).
- All new keys exist in en, hi, ur and pa (the existing parity test).
