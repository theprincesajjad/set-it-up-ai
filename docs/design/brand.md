# Brand

Owner: Design. Product name is a working name and lives in `packages/shared/src/brand.ts`
(`BRAND.name`, `BRAND.shortName`, `BRAND.tagline`). **Never hard-code "Local Loyalty" in UI
strings**; interpolate `BRAND.name`. Assets in `apps/web/public/brand/` use the current name
and must be regenerated if it changes.

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
| Owner | "Free forever. We set it up. Your regulars already walk this street." | No transaction fees, unlimited locations, setup in 20 minutes, first 25 members in 30 days. |
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
- No "Oops", "Uh oh", "Whoops". No ALL CAPS except the overline style.
- Never guilt ("Don't miss out!", "Last chance!" unless it is literally the last day of a promo).
- Points are always described as never expiring, unless the merchant enabled expiry, in which
  case the rule is shown next to every balance.

## 3. Logo

Files in `apps/web/public/brand/`:

| File | Use |
| --- | --- |
| `logo-mark.svg` | The mark, full colour, on paper/white. Favicon, avatar, small spaces. |
| `logo-mark-mono.svg` | One colour (`currentColor`). Receipts, stamps, embossing, single-ink print, coloured tabs. |
| `wordmark.svg` | Horizontal lockup on light backgrounds. Default logo. |
| `wordmark-inverse.svg` | Lockup on pine `#1F6A50` or ink `#1F1B16`. |
| `app-icon.svg` | 1024 x 1024 master for iOS / Android / PWA. Full bleed, platforms mask it. |
| `qr-stand-a6.svg` | Counter stand template (see section 7). |

**Concept: "The Shopfront".** A rounded pine storefront under a striped marigold awning with a
scalloped edge. The door is open. The marigold doorknob is the _point_: the small reward
every visit leaves behind. It reads as "a shop" at 16 px and as "your shop" at poster size.

- **Clear space:** the door height (14/64 of the mark) on every side.
- **Minimum size:** mark 16 px (digital) / 6 mm (print). Wordmark 96 px / 25 mm wide.
- **Wordmark type:** Figtree Bold, tracking -0.5 at 34 px. "Local" ink, "Loyalty" pine. The SVG
  uses live text; outline it (convert to paths) before sending to a print shop.
- **Don't:** recolour the awning, add a maple leaf, put the mark in a circle, add drop shadows,
  rotate, stretch, outline, or place the full-colour mark on marigold or photos without a paper
  backing plate.

**App icon:** pine `#1F6A50` field, deeper pine `#195841` halo, paper shop body, door in pine,
marigold awning with pale-marigold stripes. Artwork fits inside the central 704 px (Android
adaptive safe zone). Export: iOS 1024 PNG no alpha; Android adaptive foreground = everything
except the background `rect`; background = `#1F6A50`. Expo `app.json`: `icon` and
`android.adaptiveIcon.backgroundColor: "#1F6A50"`; splash background `#FAF6EF` with the mark centred.

## 4. Colour meaning

Full tokens: `packages/design-tokens/src/palette.ts` and `colors.ts`. Contrast is tested in CI
(`pnpm --filter @ll/design-tokens test`).

| Colour | Hex | Means | Use for | Never for |
| --- | --- | --- | --- | --- |
| **Pine** | `#1F6A50` (brand) | Trust, local, "go" | Primary buttons, links, active tabs, brand header, the "you" series in charts | Errors, success toasts (use leaf) |
| **Marigold** | `#F5A524` (accent) | Sunshine, reward, "you earned it" | Filled stamps, points-earned moments, reward-ready badge, awning | Body text (fails contrast); warnings |
| **Brick** | `#C65334` | Toronto storefront brick, warmth | Illustration, marketing backgrounds, second chart series | UI states (looks like an error) |
| **Paper** | `#FAF6EF` (canvas) | Warm, printed, human | App and page background | Pure white page backgrounds (surfaces are white, canvas is paper) |
| **Ink** | `#1F1B16` (fg) | Readable, calm | Body text, icons | Never pure `#000` except QR codes |
| **Leaf** | `#1D7A3D` | Success | Award confirmed, payment received, connected | Brand buttons |
| **Ochre** | `#EBAA2E` / text `#5E3409` | Warning | Offline banner, expiring codes, quote needs approval | Rewards |
| **Cherry** | `#B42318` | Danger | Errors, destructive actions, declined | Promos, "sale" |
| **Lake** | `#1D5FA8` | Info, focus | Focus rings, info banners, "new" | Brand |

**Ratios to remember:** 60% paper/white, 30% ink and stone neutrals, 8% pine, 2% marigold.
Marigold is a spice: if a screen has more than one marigold element besides stamps, remove one.

**Dark mode** keeps the same meaning with lifted tints (pine `#4E9C7D`, text on it is near-black).
Counter mode and the kiosk default to light (bright shops), with a manual dark toggle.

**Verticals** each have a hue-derived `accent / tint / ink` (`verticalVisuals` in tokens) used
for shop placeholders and map pins when a shop has no logo. The shop's logo and photos always win.

## 5. Typography

- **Figtree** (Google Fonts) for all UI. Weights 400 / 500 / 600 / 700. Tabular figures for
  balances, keypad, KPIs (`font-variant-numeric: tabular-nums`; RN `fontVariant: ["tabular-nums"]`).
- **Fraunces** (Google Fonts, SemiBold 600, SOFT 50, opsz auto) for display moments only:
  marketing headlines, printed stands, campaign posters, the "Welcome to Roncesvalles" hero.
  Never in app UI below 24 px; never in counter mode or the dashboard.
- System font fallback always. Never block first paint on font loading (`font-display: swap`).

## 6. Photography and illustration

**Photography** (marketing, shop pages, onboarding):

- Real Toronto streets and real owners: Roncesvalles, the Danforth, Leslieville, Junction,
  Bloor West. Daylight, slightly warm white balance, natural grain.
- People mid-action: handing over a coffee, a mechanic wiping hands, a florist wrapping stems.
  Hands and counters more than posed faces. Diverse, every age, including seniors.
- Phones appear small and incidental; the shop is the hero, not the screen.
- Shot on the street, at eye level. Awnings, hand-painted signs, streetcar tracks, snowbanks in
  winter. Four seasons, not just summer.
- Don't: stock-photo handshakes, people pointing at phones, neon, money imagery, gold coins,
  "deal" starbursts, flat-lays of gift cards, CN Tower as a shortcut for "Toronto".

**Merchant photos in the app**: shop cover 16:9, logo 1:1. If missing, use the vertical
placeholder (`ShopTile` placeholder: vertical `tint` with the lucide icon in `accent`).

**Illustration**:

- Flat shapes, chunky rounded corners (match `radius.lg`), 2 px ink line accents allowed.
  Palette: paper, pine, marigold, brick, stone. One accent object per illustration.
- Subjects: storefronts with awnings, a street of shops, a paper bag, a coffee cup, a wrench,
  a bicycle, a streetcar silhouette. Used for empty states, onboarding, and campaign posters.
- Empty-state illustrations are 120-160 px, never more than 30% of the viewport, and always
  paired with a single clear action.
- Icons: **lucide** (`lucide-react`, `lucide-react-native`), stroke 2, rounded joins. Don't mix
  icon sets. Vertical icons are mapped in `verticalVisuals`.

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

Copy is fixed: "Scan to join" / "earn points at {Shop} and every shop on {Street}" /
"No app needed · Free · Takes 30 seconds" / "No phone camera? Just tell us your number."
Printing: 300 dpi, matte cardstock (glossy causes glare on QR under shop lights), no lamination
gloss. QR must survive being scanned at 1 m on a 3-year-old phone: do not shrink below 40 mm.

Kit also includes a window decal (round, 120 mm: mark + "Proud member of {Street} Local Loyalty")
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
| Paper canvas, white cards, pine actions | Gradients, glassmorphism, neon, gold |
| Celebrate earning with a stamp pop and a haptic | Confetti on every tap, sounds by default |
