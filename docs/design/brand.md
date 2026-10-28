# Brand

Owner: Design. Product name is a working name and lives in `packages/shared/src/brand.ts`
(`BRAND.name`, `BRAND.shortName`, `BRAND.tagline`). **Never hard-code "Local Loyalty" in UI
strings**; interpolate `BRAND.name`. Assets in `apps/web/public/brand/` use the current name
and must be regenerated if it changes.

**v2 look: [foundations.md](./foundations.md) is the spec and wins over this file.**
Tokens: `packages/design-tokens` (`@ll/design-tokens`). System: [system.md](./system.md).
Copy: [ux-copy.md](./ux-copy.md). Screens: [screens/](./screens/).

---

## 1. Positioning

**For** people who live and work on a Toronto shopping street, **Local Loyalty is** one card for
every independent shop on the block. **Unlike** chain programs and coupon apps, it is free for
shops, run with the neighbourhood, and your points always stay redeemable where you earned them.

| Audience | What they hear | Proof we show |
| --- | --- | --- |
| Customer | "One card for every shop on your street." | Shops on the map near you; join in 30 s with no app; points never expire. |
| Counter staff | "Phone number, tap, done." | Under 5 seconds. Big buttons. Works when the Wi-Fi doesn't. |
| Owner | "Free forever. We set it up. Your regulars already walk this street." | No fee on loyalty, unlimited locations, setup in 20 minutes, first 25 members in 30 days. |
| BIA manager | "Proof that street events bring people in." | Visits and redemptions per shop, per day, during your event. |

**Brand idea: _the shopfront_.** Everything we make should feel like the best corner shop you
know: the owner knows your name, the awning is a little faded, and there is always a small
thank-you. Not a bank. Not a crypto app. Not a coupon flyer.

### Personality

| We are | We are not |
| --- | --- |
| Neighbourly: we talk like the person behind the counter | Corporate, "valued customer" |
| Warm and plain-spoken | Cutesy, punny, emoji-heavy |
| Trustworthy: clear about money, data and consent | Pushy, salesy, FOMO, fake urgency |
| Proudly local and Canadian | Flag-waving, maple-leaf clip art |
| Quick: respects that people are mid-rush | Gamified for its own sake |

## 2. Voice and tone

**Voice (always):** short sentences, plain words, second person ("you"), active verbs, Canadian
English (neighbourhood, colour, favourite, cheque, centre, licence (noun), cancelled, catalogue
is fine but prefer "list"). Numbers as digits. Money as `$4.50` (CAD implied; write `CAD` only on
billing and invoices). Dates `Oct 21` / `Tue, Oct 21`; times `3:30 pm`.

**Tone shifts by moment:**

| Moment | Tone | Example |
| --- | --- | --- |
| Earning, rewards | Warm, small celebration | "Nice. 2 more stamps for a free coffee." |
| Counter mode | Terse, instructional, zero fluff | "Added 1 stamp. Sam now has 8." |
| Errors | Calm, specific, tells you what to do next | "That code expired. Ask Sam to tap Redeem again." |
| Money, consent, data | Precise, no jokes | "We'll only text you if you say yes. Reply STOP to stop." |
| Coming-soon features | Optimistic, honest, never nagging | "Order-ahead comes to the network once 150 shops are on. 38 to go." |
| Owner dashboard | Helpful colleague | "You're 6 members from your 30-day goal." |

**Rules**

- Lead with the outcome, not the mechanism: "Get a free coffee" not "Redeem 10 stamps".
- Use the shop's own terminology from the program (`points`, `stamps`, `stars`).
- Name the shop, not the platform, in anything a customer sees about a shop. The platform name
  appears in onboarding, settings, legal, and the "Sent via" line.
- No exclamation marks in errors. At most one per screen elsewhere.
- No "Oops", "Uh oh", "Whoops". No ALL CAPS. Map, category and city labels are lowercase.
- Never guilt ("Don't miss out!", "Last chance!" unless it is literally the last day of a promo).
- Points are always described as never expiring, unless the merchant enabled expiry, in which
  case the rule is shown next to every balance.

## 3. Logo

Files in `apps/web/public/brand/` (v2):

| File | Use |
| --- | --- |
| `logo-mark.svg` | The mark: black tile, four places, one accent. Favicon, avatar, small spaces. |
| `logo-mark-mono.svg` | One colour (`currentColor`); the earned place is a ring + dot. Receipts, stamps, embossing, single-ink print. |
| `wordmark.svg` | Mark + lowercase "local loyalty" on white. Default logo. |
| `wordmark-inverse.svg` | Same on black `#0B0B0C` (tile turns white, places turn black). |
| `app-icon.svg` | 1024 x 1024 master for iOS / Android / PWA. Full bleed black, platforms mask it. |
| `qr-stand-a6.svg` | Counter stand template (see section 7). |

**Concept: "four corners".** A black rounded tile with four round places in a 2 x 2 grid.
Three are white; one is filled with the accent `#FF5A1F`: the point you earned. It reads as a
stamp card and as a map of corner shops, and survives at 16 px.

- **Colours:** black `#0B0B0C`, white, accent `#FF5A1F`. Nothing else. No gradients, no shadow.
- **Clear space:** one place (dot diameter) on every side. **Minimum:** mark 16 px / 6 mm; wordmark 96 px / 25 mm wide.
- **Wordmark type:** Bricolage Grotesque 800, **lowercase** "local loyalty", tracking -0.01em.
  The SVGs use live text; outline before sending to a printer.
- **Don't:** recolour the places, move the accent to another corner, add a second accent, put
  the mark in a circle, add drop shadows, rotate, stretch or outline it, or use title case in the wordmark.

**App icon:** black field, four places spanning 290–734 px (inside the 704 px Android safe zone).
Export: iOS 1024 PNG no alpha; Android adaptive foreground = the four circles, background `#0B0B0C`.
Expo `app.json`: `android.adaptiveIcon.backgroundColor: "#0B0B0C"`; splash background `#FFFFFF`
with the mark centred (dark splash `#0B0B0C` with the inverse mark).

## 4. Colour meaning

Spec: [foundations.md § Colour](./foundations.md#colour). Tokens: `packages/design-tokens/src/colors.ts`
(contrast tested in CI). **Monochrome first; colour comes from the places, not the chrome.**

| Colour | Light / dark | Means | Use for | Never for |
| --- | --- | --- | --- | --- |
| **Ink** `foreground` (v2 `fg`) | `#0B0B0C` / `#F6F4F1` | Clarity | Text, icons, **primary buttons (black)**, the one black element per screen, chart lines | — |
| **White** `background` (v2 `bg`) | `#FFFFFF` / `#0E0D0C` | Calm | Screens and sheets | Tinted cards |
| **Warm stone** `muted`, `accent` (hover), `border` (v2 `bg-subtle` `bg-muted` `line`) | `#F6F4F1` `#EEEBE6` `#E7E3DD` / `#1C1A18` `#262320` `#2C2926` | Structure, a corner shop rather than an office | Grouped backgrounds, hover and pressed rows, hairlines | Decoration |
| **Paper** `paper` | `#FBF9F6` / `#0E0D0C` | The shop window | Customer pass and marketing canvas | Dashboard screens |
| **Points** `points` (v2 `accent`) | `#FF5A1F` / `#FF7A45` | Points | Stamps, points, "reward ready", activity dots, the dashboard dot that says the shop must act now, large balances | Anything that isn't points. Small text (use `points-text` `#C2410C`) |
| **Success** `success` (v2 `positive`) | `#16A34A` / `#22C55E` | Open, up, paid | "Open now" dot, positive deltas | Buttons, cards |
| **Destructive** `destructive` (v2 `negative`) | `#DC2626` / `#F87171` | Closed, error | Errors, destructive actions, "closed" | Promos, "sale" |
| **Info** `info` (v2 `location`) | `#2F7BF6` / `#4C8DF8` | Waiting on someone else; you are here | A customer must act (quote sent, invoice open); the user's own location dot | Links, decoration |
| **Warning** `warning` | `#D97706` / `#FBBF24` | Due soon | The dot on a Needs-you row that is due soon | Buttons, banners, fills |

**Rules:** no more than one points-coloured thing per viewport; status is a dot + word, never a
filled card; no gradients; dark mode is a straight inversion of the same roles.

**Shops** keep their own `brandColor`, shown only inside their avatar (initials or logo). Verticals
have no colour in v2: each maps to a map category with an object illustration (section 6).

## 5. Typography

Spec: [foundations.md § Type](./foundations.md#type).

- **Bricolage Grotesque** 700 / 800 for display, big numbers, and every map, category and city
  label, which are **lowercase** ("toronto", "coffee", "search here").
- **Inter** 400 / 500 / 600 for web UI and body. **System font** (SF Pro / Roboto) for native UI.
- Numbers always tabular. Italic only for the grey subtitle under a place name.
- Fallback to the system font always; never block first paint on font loading.

## 6. Photography and illustration

**Photography** (marketing, shop pages, onboarding): real Toronto streets and owners in daylight;
hands and counters more than posed faces; phones small and incidental. Don't: stock handshakes,
neon, money imagery, gold coins, CN Tower shortcuts. In the product, shop photos sit in round
white bubbles (map pins) or 16:9 covers.

**Category objects** (the only illustration in the product): one set of small flat-3D objects
in `packages/design-tokens/assets/categories/` (`coffee` cup, `bakery` croissant, `eat` bowl,
`shops` bag, `beauty` scissors, `repair` wrench, `services` bell, `top` star), 64 x 64
SVG + PNG @1x/2x/3x. Light from the top-left, 2–3 tones per material, no outlines, a faint contact
shadow. Shown at 28–40 px in white bubbles and the category rail. New categories must match the set.

**Empty states:** one sentence + one action. No illustrations of people.

## 7. Counter QR stand

Template `apps/web/public/brand/qr-stand-a6.svg`, A6 portrait (105 x 148 mm), prints on 4x6"
cardstock with "fit to page". Generated per location by Locations & QR kit
([merchant-dashboard.md](./screens/merchant-dashboard.md#10-locations-and-qr-kit)) and the rep console.

| Field (id) | Content | Rule |
| --- | --- | --- |
| `#shop-name` | Shop display name | <= 20 chars at font-size 8; 21-30 chars at 6; longer: use short name |
| `#street-1` | Shop name in the sub line | <= 28 chars, else "here" |
| `#street-2` | Street / BIA name, e.g. "Roncesvalles", "the Danforth" | <= 22 chars |
| `#qr-slot` | QR for `https://<host>/j/<code>` | 50 x 50 mm, black on white, ECC level M, quiet zone provided by the white card |
| `#join-url` | Short URL without `https://` | Shown for people who type it |

Copy is fixed: "scan to join" (lowercase, Bricolage) / "earn points at {Shop} and every shop on {Street}" /
"No app needed · Free · Takes 30 seconds" / "No phone camera? Just tell us your number."
Printing: 300 dpi, matte cardstock (glossy causes glare on QR under shop lights), no lamination
gloss. QR must survive being scanned at 1 m on a 3-year-old phone: do not shrink below 40 mm.

Kit also includes a window decal (round, 120 mm, white: mark + "proud member of {street} local loyalty", lowercase)
and a 2-line staff script card (see [ux-copy.md](./ux-copy.md#11-staff-script-card)).

## 8. Do and don't

| Do | Don't |
| --- | --- |
| Show the shop first, the network second | Lead with our brand on shop screens |
| Small, frequent, honest rewards | Points inflation ("10,000 pts!") |
| "Coming soon" with a real reason and number | "Upgrade now" modals, red badges on locked features |
| Label sponsored placements every time, clearly | Disguise ads as recommendations |
| Black-on-white QR, big, with a manual fallback | Branded/coloured QR codes, logos inside QR |
| Keep counter screens to one decision each | Put marketing or tips on counter screens |
| Explain consent in one plain sentence | Pre-tick consent boxes or bundle consent with sign-up |
| White screens, hairlines, one black action | Gradients, tinted cards, glassmorphism outside map chrome, neon, gold |
| Accent only for points | Accent on buttons, links or decoration |
| Celebrate earning with a stamp fill and a haptic | Confetti on every tap, sounds by default |
