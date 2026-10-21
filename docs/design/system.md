# Design system

Owner: Design. Status: v1 (MVP + Phase 2 placeholders).
Tokens: `packages/design-tokens` (`@ll/design-tokens`). Brand: [brand.md](./brand.md).
Copy: [ux-copy.md](./ux-copy.md). Screen specs: [screens/](./screens/).

Web (Next.js + Tailwind v4) and mobile (Expo / React Native) build **the same component
names with the same props**. Web components live in `apps/web/src/components/ui/`, mobile in
`apps/mobile/src/components/ui/`. When a prop only makes sense on one platform it is marked.

---

## 0. Using the tokens

### Web

```css
/* apps/web/src/app/globals.css */
@import "tailwindcss";
@import "@ll/design-tokens/theme.css"; /* includes tokens.css, dark variant, utilities */
```

```tsx
// apps/web/src/app/layout.tsx
import { Figtree, Fraunces } from "next/font/google";
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], weight: ["600"], axes: ["SOFT", "opsz"], variable: "--font-fraunces", display: "swap" });
<html lang="en-CA" className={`${figtree.variable} ${fraunces.variable}`}> <body className="bg-canvas text-fg font-sans text-body antialiased">
```

- Semantic utilities: `bg-canvas`, `bg-surface`, `text-fg`, `text-fg-muted`, `bg-brand text-on-brand`,
  `hover:bg-brand-hover`, `border-border`, `border-border-strong`, `bg-danger-subtle text-on-danger-subtle`,
  `bg-vertical-cafe-tint text-vertical-cafe-ink`, `fill-chart-1`.
- Type: `text-h1`, `text-h2`, `text-h3`, `text-title`, `text-body`, `text-body-sm`, `text-label`,
  `text-caption`, `text-overline uppercase`, `text-points tabular-nums`, `text-stat`, `text-keypad`,
  `text-counter-hero`, `text-code`.
- Radii: `rounded-xs` 4, `rounded-sm` 8, `rounded-md` 12, `rounded-lg` 16, `rounded-xl` 24, `rounded-full`.
- Shadows: `shadow-sm|md|lg|xl` (switch in dark mode). Easing: `ease-standard|enter|exit|emphasized`.
- Extras: `touch-target`, `touch-target-counter`, `touch-target-kiosk`, `focus-ring`, `skeleton`,
  `z-sticky|banner|overlay|modal|popover|toast`, `animate-stamp-pop|fade-in|sheet-up|shimmer`.
- Theme: follows OS. Force with `<html data-theme="light|dark">`. `dark:` variant respects both.
- Raw palette (`bg-pine-600`, `text-marigold-700`, ...) is for marketing and illustration only.
  Lint rule to add: no raw palette or Tailwind default colours (`bg-gray-*`, `text-white`) in
  `apps/web/src/app/(app)` or `components/ui`.

### Mobile

```ts
import { colors, textStyles, spacing, radii, shadows, touchTargets, durations, nativeFonts, verticalVisual } from "@ll/design-tokens";
const scheme = useColorScheme();            // counter mode / kiosk: default "light", user toggle
const c = colors[scheme === "dark" ? "dark" : "light"];
```

- Load fonts with `@expo-google-fonts/figtree` (`Figtree_400Regular`, `_500Medium`, `_600SemiBold`,
  `_700Bold`). Map `fontWeight` → `nativeFonts.*` in a `<Text variant="body">` wrapper; RN Android
  does not synthesise weights for custom fonts.
- Shadows: spread `shadows.md.native`. Dark mode: use `surfaceRaised` instead of shadow.
- Respect `AccessibilityInfo.isReduceMotionEnabled()` and `allowFontScaling` (cap at
  `maxFontSizeMultiplier={1.6}` on counter mode keypad digits only; everywhere else unlimited).
- Use `react-native-reanimated` with `easingsNative` / `springs`. Haptics via `expo-haptics`.

### Foundations at a glance

| Token group | Values |
| --- | --- |
| Brand | pine `#1F6A50` (hover `#195841`, pressed `#144634`), on-brand `#FFFFFF` |
| Accent | marigold `#F5A524`, on-accent ink `#1F1B16` |
| Canvas / surface | paper `#FAF6EF` / white `#FFFFFF`; dark `#16130F` / `#1F1B16` |
| Text | fg `#1F1B16`, muted `#655A4C`, link `#195841`; dark fg `#F3EDE3`, muted `#A99D8B` |
| Semantic | success `#1D7A3D`, warning `#EBAA2E` (text `#5E3409`), danger `#B42318`, info `#1D5FA8` |
| Spacing | 4 px grid: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96 |
| Radii | 4, 8, 12, 16, 24, full |
| Type | Figtree; body 16/24; mobile minimum 16 for body, 12 for captions |
| Touch | min 44, default 48, counter 64, keypad 72, kiosk 88, gap 8 |
| Motion | 80 / 150 / 220 / 320 / 600 ms; standard `cubic-bezier(0.2,0,0,1)` |
| Breakpoints | sm 640, md 768, lg 1024, xl 1280, 2xl 1536 |
| Z-index | sticky 100, banner 200, dropdown 300, overlay 400, modal 500, popover 600, toast 700, tooltip 800 |

Contrast: every pair in `contrastPairs` (`colors.ts`) is tested at >= 4.5:1 (text) or >= 3:1 (UI).
Lowest body-text pair: `fgMuted` on `surfaceSunken` = 5.78:1 (light), 5.77:1 on `surfaceRaised` (dark).
**If you need a new colour pair, add it to `contrastPairs` first.**

### Global rules

1. **One primary action per screen.** Primary = brand fill. Everything else is secondary/ghost.
2. **Touch:** every interactive element >= 48 x 48 hit area (44 absolute minimum on dense web
   tables with a pointer). Counter mode >= 64.
3. **Focus:** web uses `:focus-visible` 2 px `focusRing` + 2 px offset (already global). Never
   `outline: none` without a replacement.
4. **States** every interactive component must implement: default, hover (web), pressed, focus-visible,
   disabled, loading; plus error/success where relevant.
5. **Loading:** skeletons for content > 300 ms; spinners only inside buttons. Never a full-screen
   spinner except app boot.
6. **Old phones:** no blur/backdrop-filter, no box-shadow animations, no Lottie on lists, images
   served at 1x/2x with `width` hints, lists virtualised (`FlashList`) beyond 30 rows. Target
   60 fps on a 2023 mid-range Android (Moto G / Galaxy A14 class).
7. **Bright shops:** counter mode uses light theme, body 18 px, no text below 14 px, success uses
   full-fill colour blocks rather than subtle tints.
8. **Numbers:** tabular figures; thousands separator `1,250`; money `$4.50`; points `120 pts`
   (or the program's terminology).
9. **Dark mode** is supported everywhere except printed artifacts and QR codes (always black on white).
10. **Right-to-left:** not required for MVP, but use logical properties (`ps-`, `pe-`, `start`, `end`).

---

## 1. Actions

### Button

```ts
interface ButtonProps {
  variant?: "primary" | "secondary" | "tonal" | "ghost" | "danger" | "accent"; // default "primary"
  size?: "sm" | "md" | "lg" | "counter";       // default "md"
  loading?: boolean;                             // shows spinner, keeps width, sets aria-busy
  disabled?: boolean;
  fullWidth?: boolean;
  iconStart?: LucideIcon; iconEnd?: LucideIcon;
  children: string;                              // verb-first label, <= 3 words ideally
  onPress / onClick; href?: string (web: renders <a>)
}
```

| Variant | Fill | Text | Border | Hover / pressed | Use |
| --- | --- | --- | --- | --- | --- |
| primary | `brand` | `onBrand` | none | `brandHover` / `brandPressed` | The one main action |
| secondary | `surface` | `fg` | 1 px `borderStrong` | `surfaceSunken` | Second action, Cancel |
| tonal | `brandSubtle` | `onBrandSubtle` | none | darken 4% | Tertiary in cards ("View card") |
| ghost | transparent | `fgBrand` | none | `brandSubtle` bg | Inline actions, toolbars |
| danger | `danger` | `onDanger` | none | `dangerHover` | Delete, Void, Remove staff (always confirmed) |
| accent | `accent` | `onAccent` | none | `accentHover` | Reserved: "Redeem" and reward-ready actions only |

| Size | Height | Padding x | Text style | Icon | Radius |
| --- | --- | --- | --- | --- | --- |
| sm | 36 (hit area padded to 44) | 12 | label (14/600) | 16 | `sm` 8 |
| md | 48 | 16 | bodyStrong (16/600) | 20 | `md` 12 |
| lg | 56 | 20 | bodyStrong 17/600 | 20 | `md` 12 |
| counter | 64 (min), full width | 24 | title 20/700 | 24 | `lg` 16 |

States: disabled = `disabledBg` / `onDisabled`, no hover, `aria-disabled` (keep focusable when it
explains why with a tooltip); loading = spinner replaces `iconStart`, label stays, clicks ignored;
pressed = scale 0.98 over `instant` 80 ms (skip if reduced motion). Mobile: `Pressable` with
`android_ripple={{ color: overlay }}` on Android, opacity 0.88 on iOS.

Rules: labels are verbs ("Add stamp", "Save program", "Send code"). Never "OK"/"Submit". Destructive
actions always open a confirm `Modal` that repeats the consequence. Max one primary per view.

### IconButton

Square, `size` 40 (web dense) / 48 (default) / 64 (counter). Requires `label` (used for
`aria-label` / `accessibilityLabel` and tooltip on web). Variants `ghost` (default), `secondary`, `primary`.

### Link

Inline text, `fgLink`, underline on hover/focus (always underlined inside body copy). External
links get `lucide:external-link` 14 px and `rel="noopener"`.

---

## 2. Inputs

### TextField (Input)

```ts
interface TextFieldProps {
  label: string;                 // always visible above the field. Never placeholder-as-label.
  hint?: string;                 // fgMuted, below
  error?: string;                // replaces hint, danger text + lucide:circle-alert 16
  value; onChange; placeholder?: string;
  type?: "text" | "email" | "number" | "money" | "search" | "password" | "textarea";
  prefix?: string; suffix?: string;  // "$", "pts", "%"
  required?: boolean; optionalLabel?: boolean; // shows "(optional)" after label
  maxLength?: number; showCount?: boolean;
  autoComplete?: string; inputMode?: string;
}
```

- Height 48, radius `sm` 8, bg `surface`, border 1 px `borderStrong`, padding x 12, text body 16
  (16 prevents iOS zoom). Label `label` style 14/600 `fg`, 6 px above.
- Focus: border 2 px `brand` + focus ring on web. Error: border 2 px `danger`, `aria-invalid`,
  `aria-describedby` → error id. Disabled: `surfaceSunken`, `onDisabled` text.
- `money`: `inputMode="decimal"`, prefix `$`, formats `12.5` → `12.50` on blur, stored as cents.
- Validate on blur, re-validate on change once errored. Don't show errors while typing the first time.

### PhoneField (PhoneInput with auto-format)

Canadian/US numbers only for MVP (NANP).

- Visual: optional static prefix chip "+1" (non-interactive, `fgMuted`), then the input.
- `type="tel"`, `inputMode="numeric"` (web) / `keyboardType="phone-pad"` (RN), `autoComplete="tel-national"`
  (web) / `textContentType="telephoneNumber"` + `autoComplete="tel"` (RN).
- **Auto-format as you type:** digits only internally; display `(416) 555-0123`.
  `4` → `(4`; `416` → `(416`; `4165` → `(416) 5`; `416555` → `(416) 555`; `4165550` → `(416) 555-0`.
  Caret stays at the end when typing; backspace over a formatting character deletes the previous digit.
- **Paste / autofill:** strip everything but digits; drop a leading `1` if 11 digits; accept
  `+1 416-555-0123`, `416.555.0123`, `14165550123`.
- **Validate:** exactly 10 digits; area code and exchange don't start with 0 or 1. Error copy in
  [ux-copy.md](./ux-copy.md#errors). Emit E.164 (`+14165550123`) via `onChangeE164`.
- Show a "Use a different country" link only post-MVP.
- Counter mode uses the `Keypad` instead of the system keyboard but the same formatter
  (export `formatNanp(digits)` / `toE164(digits)` from `apps/*/src/lib/phone.ts`; same algorithm both apps).

### OtpField (OTP input)

- 6 digits. Renders 6 boxes 48 x 56 (gap 8), radius `sm`, text `keypad` 28/600 tabular.
- Implementation: **one** real input (`autoComplete="one-time-code"`, `inputMode="numeric"`,
  `textContentType="oneTimeCode"` on iOS, `maxLength=6`) visually hidden behind the boxes, so
  SMS autofill and paste work. Boxes are presentational (`aria-hidden`); the input has
  `aria-label="6-digit code"`.
- Active box: 2 px `brand` border + caret blink. Filled: `fg` digit. Error: all borders `danger`,
  shake 3 x 4 px over 220 ms (fade instead if reduced motion), clear and refocus.
- Auto-submit on 6th digit. Web OTP API (`navigator.credentials.get({ otp })`) where supported;
  Android SMS Retriever (`expo-sms-retriever` or equivalent) where available.
- Below: "Resend code" ghost button, disabled with countdown "Resend in 0:27" for 30 s; after
  3 resends, "Call me instead" (Phase 1.5) or "Try again in 10 minutes".

### Keypad (counter + kiosk)

3 x 4 grid: 1-9, then `clear` (lucide:x, label "Clear"), 0, `backspace` (lucide:delete, label "Delete").
Key size `touchTargets.keypad` 72 (kiosk 88), gap 8, radius `md`, bg `surface`, border 1 px `border`,
digit `keypad` 32/600. Pressed: `surfaceSunken` + haptic `selection`. Long-press backspace = clear.
Hardware keyboards (tablets with keyboards, USB number pads) map 0-9, Backspace, Enter.

### Select, Checkbox, Radio, Switch

- Select: web native `<select>` styled like TextField (height 48) for short lists; `Combobox` for >10
  options. RN: opens a `Sheet` with a list of `ListRow`s with check marks.
- Checkbox 24 x 24 (hit area 48), radius 6, border 2 px `borderStrong`, checked = `brand` fill +
  white check. **ConsentCheckbox** is a Checkbox with the full consent sentence as its label, never
  pre-checked, and its exact wording version is sent to the API (`consentTextVersion`).
- Radio 24, ring 2 px `borderStrong`, selected = 2 px `brand` ring + 10 px `brand` dot.
- Switch 52 x 32, track `borderStrong` → `brand`, thumb white with `shadow.sm`. Use only for settings
  that apply immediately; label on the left, describe the on-state ("Mute Rosie's Bakery").

### SegmentedControl

2-4 options, height 40 (hit 48), track `surfaceSunken`, selected segment `surface` + `shadow.sm`,
text `label`. Use for view switches (List / Map, Day / Week / Month), not navigation.

---

## 3. Containers

### Card

`surface`, radius `lg` 16, padding 16 (mobile) / 20-24 (web), `shadow.sm` on canvas, or 1 px
`border` with no shadow inside other surfaces. Pressable cards: whole card is the target, hover
`shadow.md` (web), pressed opacity 0.88. Header row: `title` + optional trailing action (ghost
`sm`). Never nest cards more than once.

### ListRow

Height >= 56 (64 with two lines). Leading (Avatar/ShopTile 40 or icon 24 in 40 circle), title
(`bodyStrong`), subtitle (`bodySm fgMuted`), trailing (value, Badge, chevron-right 20 `fgMuted`).
Dividers 1 px `border`, inset to text start.

### Sheet (bottom sheet, mobile + mobile web)

- Top corners radius `xl` 24, `surfaceRaised`, `shadow.lg`, grabber 36 x 4 `borderStrong` centred 8 px
  from top. Snap points: content height (default), 50%, 90%. Scrim `overlay`.
- Enter `sheet-up` 320 ms `enter` / spring `springs.sheet`; exit 220 ms `exit`.
- Close: swipe down, scrim tap, Escape (web), Android back. Focus trapped; return focus to opener.
- Title row: `h3` + close IconButton (lucide:x). Primary action pinned at bottom above safe area.

### Modal (dialog)

Centred on >= md, sheet-style on < md. Max width 480 (form 560). Radius `xl`, padding 24,
`shadow.xl`. `role="dialog"` `aria-modal` `aria-labelledby`. Confirm dialogs: title states the
action ("Remove Priya from staff?"), body states the consequence, buttons `[Cancel] [Remove]`
with the destructive action on the right and `danger` variant.

### Tabs

- **Page tabs (web dashboard):** underline style, height 48, text `label`, active = `fg` + 2 px `brand`
  underline, inactive `fgMuted`. Scrollable horizontally on mobile with fade edges. `role="tablist"`,
  arrow-key navigation.
- **Bottom tab bar (customer app):** 5 items, height 56 + safe area, icons 24, labels `caption` 12/500
  always visible. Active = `brand` icon + label; inactive `fgMuted`. Centre item **Card** is a raised
  56 px pine circle with `qr-code` icon (`onBrand`), the only elevated tab.

---

## 4. Feedback

### Toast

Bottom-centre (mobile above tab bar; web bottom-left on lg+), max width 420, `surfaceInverse`
bg + `fgInverse` text, radius `md`, `shadow.lg`, padding 12 x 16, optional leading icon (success:
lucide:circle-check; error: circle-alert) and one action ("Undo", "Retry") as an underlined
`label` button. Icon, text and action all use `fgInverse` (the only tested pair on
`surfaceInverse`; it flips correctly in dark mode). Don't colour toast icons. Auto-dismiss 4 s (8 s with an action; never for errors that
need action, use a Banner instead). `role="status"` (`aria-live="polite"`); errors `role="alert"`.
Max one visible; new replaces old. Swipe to dismiss on mobile.

### Banner (inline and global)

Full-width strip. Variants `info | success | warning | danger | neutral`, using `xSubtle` bg +
`onXSubtle` text + leading icon in `x`. Height >= 48, padding 12 x 16, text `bodySm` 14/500,
optional action (ghost sm) and dismiss.

**OfflineBanner** (counter mode, customer card): sticky under the app bar, `z-banner`,
`warning` fill + `onWarning` text: lucide:wifi-off + "Offline. 3 awards waiting to send." + spinner
while retrying. Turns `success` for 2 s ("Back online. All 3 sent.") then collapses (height animates 220 ms).

### Badge and Chip

- **Badge** (status, non-interactive): height 24, padding x 8, radius `full`, text `caption` 12/600.
  Tones: `neutral` (neutralSubtle), `brand`, `accent`, `success`, `warning`, `danger`, `info`; each uses
  `xSubtle` + `onXSubtle`. Optional leading dot 6 px or icon 14. Always include text, not just colour.
  Status mapping:

  | Domain | Value → tone |
  | --- | --- |
  | promo_status | draft neutral, scheduled info, live success, ended neutral, archived neutral |
  | message_status | draft neutral, scheduled info, sending info, sent success, failed danger, cancelled neutral |
  | order_status | pending warning, accepted info, preparing info, ready success, picked_up neutral, cancelled/refunded neutral |
  | ticket_status | intake/diagnosing info, quote_sent warning ("Needs approval"), approved/in_progress/waiting_parts info, ready success, picked_up neutral, declined/cancelled neutral |
  | quote_status | sent warning, approved success, declined danger, expired neutral, superseded neutral |
  | invoice_status | open warning, paid success, void neutral |
  | integration_status | connected success, pending info, error danger, disconnected neutral |
  | merchant_status | onboarding info, active success, paused warning, closed neutral |
  | rollout stage | hidden neutral "Hidden", beta info "Beta", ga success "Live" |

- **Chip** (interactive filter/selection): height 36 (hit 48), radius `full`, 1 px `borderStrong`,
  text `label`; selected = `brandSubtle` bg, `onBrandSubtle` text, lucide:check 16 leading.
  Vertical filter chips show the vertical emoji/icon.
- **Sponsored label**: `Badge` tone `neutral` with text "Sponsored" and trailing lucide:info 12;
  tapping opens a Sheet "Why you're seeing this" (see PromoCard).
- **Coming soon tag**: `Badge` tone `neutral`, leading lucide:sprout 14, text "Coming soon".

### EmptyState

Centred stack, max width 360: illustration or 48 px icon in a 96 px `brandSubtle` circle → `h3`
title → `body fgMuted` description (1-2 lines) → one primary or tonal Button → optional ghost
secondary. Copy per screen in [ux-copy.md](./ux-copy.md#empty-states). Never a dead end.

### Skeleton

`skeleton` utility (web) / `Skeleton` component (RN, Reanimated opacity pulse 0.6-1 over 1.2 s,
static if reduced motion). Match final layout: text lines 12/16 px tall radius 4, widths 60-90%;
avatars as circles; cards as `rounded-lg` blocks. Show after 150 ms delay to avoid flash; max
10 s before switching to an error state. `aria-busy="true"` on the region, one visually hidden
"Loading..." label.

### ErrorState

Same layout as EmptyState with lucide:cloud-off or circle-alert in a `dangerSubtle` circle,
specific message, and "Try again" (secondary). Inline section errors use Banner `danger`.

### ProgressBar

Height 8, radius full, track `ringTrack`, fill `brand` (or `accent` for reward progress), animated
width 320 ms. Label above (`label`) and value right (`label tabular`). `role="progressbar"` with
`aria-valuenow/min/max` and `aria-valuetext` ("6 of 25 members").

---

## 5. Identity and media

### Avatar

Sizes 24, 32, 40, 56, 80. Circle. Image or initials (first letter of first + last name, `label`
weight 600) on a background picked deterministically from the 6 categorical chart tints
(`xSubtle`-like: use `verticalVisuals` tints by hashing the id) with matching `ink` text.
Staff avatars in counter mode always show initials + name, never photo-only.

### ShopTile

The shop's identity block in lists, wallet, map callouts, feed.

```ts
interface ShopTileProps {
  shop: { name: string; vertical: Vertical; logoUrl?: string; coverUrl?: string; neighbourhood?: string; distanceM?: number };
  balance?: { value: number; terminology: "points" | "stamps" | "stars"; nextRewardAt?: number };
  variant: "wallet" | "list" | "compact" | "hero";
  rewardReady?: boolean; muted?: boolean; sponsored?: boolean;
}
```

- Logo: 48 px (list), 40 (compact), 72 (hero), radius `md`; fallback = vertical `tint` bg + lucide icon
  (`verticalVisual(v).iconComponent`) 24 in vertical `accent`.
- **wallet** (Home "My shops"): card 100% width, height 88, logo left, name `title`, sub `bodySm fgMuted`
  ("2 more stamps for a free drink"), right = balance `h3 tabular` in `fgBrand` + unit `caption`.
  `rewardReady` → accent Badge "Reward ready" with lucide:gift, and a 4 px `accent` left edge.
- **list**: ListRow with distance ("350 m", "1.2 km"; walking minutes on hover/long-press) and open
  status ("Open · closes 6 pm" success text; "Closed · opens 8 am" fgMuted).
- **hero** (Shop detail header): cover 16:9 (fallback: vertical tint with large icon at 30% opacity),
  logo overlapping bottom-left by 50%, name `h2`.
- `muted` shows lucide:bell-off 16 after the name. Never hide balance when muted.

### MemberQr (My card)

QR always `qrFg` on `qrBg`, min 220 px (target 260 on phones, 70% of screen width), quiet zone
16 px, ECC M, inside a white rounded `xl` card even in dark mode. Under it: member number in
`code` style grouped `4821 0937`, and "Show this at the counter". Screen brightness to max while
visible (`expo-brightness`, restore on blur); keep awake (`expo-keep-awake`). The QR payload is
the API's member token; refresh in background when online, last token cached for offline use.

### MapPin

- Default: 36 px teardrop, fill vertical `accent`, 2 px white stroke, white lucide icon 18.
  Selected: 48 px, `shadow.md`, label chip with shop name below. Shop where you're a member:
  small `accent` star badge top-right. Reward ready: marigold dot with gift icon.
- **Featured map pin** (`ads.map_pin`, Phase 3): same pin at 44 px with a marigold 3 px ring and the
  "Sponsored" label in the callout. Max 1 featured pin per 500 m radius.
- Clusters: circle 40 `brand` with count `label onBrand`; tap zooms.
- User location: 16 px `info` dot, 2 px white ring, 40 px 20% `info` halo.
- Map style: muted basemap (stone greys, pine parks, lake water), POIs off except transit.

---

## 6. Loyalty components

### PointsRing

Circular progress to the next reward, for points programs.

- Sizes 64 (list), 120 (shop detail), 200 (My card / reward screen). Stroke 8 / 10 / 14, round caps.
  Track `ringTrack`, progress `brand`; when reward ready, full ring in `accent` with lucide:gift centre.
- Centre: balance `points` style (scaled: 20 / 32 / 56) tabular + unit `caption fgMuted`.
- Below or beside: "130 pts to Free tire rotation" (`bodySm`). Animate stroke 600 ms `standard`
  after earning; count-up number over same duration (skip for reduced motion).
- `accessibilityLabel`: "270 of 400 points. 130 points to Free tire rotation."

### StampCard (visual stamp grid)

For `earnType: "stamps"` (cafés, bakeries, barbers).

- Grid of `stampGoal` slots (6-12). Columns: 5 for goal 10, 4 for 8, otherwise `ceil(goal/2)` up to 6.
  Slot 44-56 px circles (fit width), gap 12.
- Empty slot: 2 px dashed `stampEmpty` ring. Filled: `accent` fill + vertical icon (or lucide:check) in
  `onAccent` 22 px, with slight random rotation -8°..8° (seeded by index) for a hand-stamped feel.
  Last slot: lucide:gift outline in `fgMuted` until filled; filled reward slot = `brand` fill + gift
  `onBrand`.
- Newly earned stamp animates `stamp-pop` 600 ms + haptic `success`.
- Caption: "8 of 10 · 2 more for a free drink". Card bg `surface`, header with shop logo + name.
- Overflow: when a stamp completes the card, show the reward as ready and start a fresh card; extra
  stamps carry over (show "+1 on your next card").
- Accessibility: grid is one element: "8 of 10 stamps. 2 more for a free drink."

### RewardCard

```ts
interface RewardCardProps {
  reward: { name: string; pointsCost: number; rewardType: RewardType; value: number; terms?: string };
  balance: number; terminology: string;
  state: "available" | "locked" | "redeeming" | "redeemed";
  onRedeem?: () => void;
}
```

- Card, horizontal: 56 px icon tile (accentSubtle bg + lucide:gift / badge-percent / coffee in
  `onAccentSubtle`), name `title`, cost "400 pts" `bodySm fgMuted`.
- `available`: trailing accent Button sm "Redeem". `locked`: ProgressBar showing balance/cost and
  "130 pts to go" in `fgMuted`; no button. `redeeming`: shows RedeemCode. `redeemed`: success Badge
  "Redeemed Oct 21".
- Terms line below (`caption fgMuted`), e.g. "Front-store items only."

### RedeemCode

What the customer shows staff. Full-screen Sheet: shop logo + reward name `h2`, the code in `code`
style 40/700 letter-spaced inside a `surfaceSunken` rounded `lg` box (e.g. `K7 4Q`, 4 characters from
`23456789ABCDEFGHJKMNPQRSTUVWXYZ`, no 0/O/1/I/L), plus a QR of the same code (160 px). Countdown
"Expires in 9:41" (`warning` text in the last 60 s). Brightness max. States: waiting → "Confirmed by
Sam. Enjoy." success full-card (leaf fill, check draw animation) → auto-close after 4 s. Expired →
"This code expired. Tap Redeem to get a new one." Points are only deducted when staff confirm.

### PromoCard

```ts
interface PromoCardProps {
  promo: { title: string; kind: "offer" | "multiplier" | "bonus_points" | "discount" | "event"; startsAt; endsAt; imageUrl?: string };
  shop: ShopTileProps["shop"];
  sponsored?: { advertiser: string; reason: string } | null;
  variant: "feed" | "compact" | "preview";   // preview = dashboard editor
}
```

- Feed: Card, optional image 16:9 radius `lg` top, then row: shop logo 24 + shop name `label` +
  distance `caption fgMuted`; title `title` (max 2 lines); meta "Ends Sun" / "Today only" `bodySm`.
  Kind badge: multiplier/bonus_points → accent Badge "2x points"; discount → brand Badge "10% off";
  event → info Badge "Event".
- **Sponsored treatment:** a neutral `Badge` "Sponsored" sits **top-left above the shop row**, same
  size as other badges, never hidden behind truncation. The card keeps the same layout as organic
  cards (no special colours, no marigold ring). Tapping the badge opens "Why you're seeing this":
  "{Shop} paid to show this offer to people near {Street}. Sponsored posts never change your
  points." with a link to ad settings. Max 1 sponsored item per 5 feed items, never in the first
  slot of "My shops", never more than 1 visible at once. Screen-reader label begins with "Sponsored."
- Ended promos are never shown to customers.

### DiscountCard (show-to-save)

Wallet-style card, ratio 1.586 (credit card), radius `xl`, bg vertical `tint`, shop logo top-left,
big value "10% off" `h1` in vertical `ink`, name "Seniors 10% off", terms `caption`
("Front-store items only. Not valid on prescriptions or pharmacy services."). Bottom: member name +
live clock (seconds ticking) so a screenshot can't be reused, and "Valid today" badge.

### LockedFeature ("Coming soon" card)

For Phase 2/3 features that are `hidden` (or `beta` without opt-in), and for paid features when the
plan is not yet available.

- Card with 1 px dashed `borderStrong`, bg `surface` (no tint, no grey-out of the whole page).
  Leading 40 px circle `neutralSubtle` with lucide icon of the feature (e.g. `shopping-bag` for
  order-ahead, `wrench` tickets, `file-text` invoices), title `title`, Coming soon Badge (lucide:sprout).
- Body `bodySm fgMuted`: what it does in one line + why it isn't here yet + the network progress
  when relevant: ProgressBar `brand` "112 of 150 shops on the network".
- Actions: tonal Button "Notify me" (records interest, becomes "We'll let you know" + check) and
  ghost "Learn more". **Never** "Upgrade", never a price as the headline, never a lock icon in
  danger colours, never a modal that interrupts a task.
- States: `hidden` → coming soon (above). `beta` and merchant not opted in → "In beta" info Badge +
  "Try the beta" tonal button. Plan available but merchant on Free → "Available on Plus · $39/mo"
  Badge brand + "See plans" ghost. Enabled → not rendered.
- Placement rules: dashboard Home shows at most **one** LockedFeature (the vertical's `upsellPlan`
  feature), dismissible for 30 days. Billing & plans shows all. Navigation never shows locked items.
  Customers only see LockedFeature in "Orders & tickets" when a shop they follow has opted into beta.

### Timeline (service ticket)

Vertical list of steps from `ticket_status`: Dropped off → Diagnosing → Quote sent → Approved → In
progress → (Waiting for parts) → Ready for pickup → Picked up.

- Each step: 24 px node + 2 px connector. Done: `brand` filled node + white check; current: 24 px
  `brand` ring with 10 px pulse dot (static if reduced motion) and bold label; upcoming: `border`
  ring, `fgMuted` label. Declined/cancelled: `danger` node with x, and the timeline stops.
- Step content: label `bodyStrong`, timestamp `caption fgMuted` ("Tue 3:12 pm"), optional note and
  photo thumbnails 64 px radius `sm`. "Waiting for parts" shows as `warning` node with lucide:hourglass.
- The step that needs the customer (quote_sent) expands into a QuoteApproval card inline.

### QuoteApproval card

- Header: shop logo + "Quote for iPhone 13 screen" `h3`, ticket number `caption`.
- Line items table (description, qty, amount right-aligned tabular), subtotal, HST 13%, total `h3`,
  deposit due on approval (if `service.deposits`) highlighted in `accentSubtle` row.
- Technician note (`body`, quoted style with 3 px `border` left).
- Photos carousel (if any).
- Legal: "By approving you agree to the work above. Your approval is recorded with your name,
  time and device." (`caption`).
- Actions: primary "Approve and pay $40 deposit" / "Approve quote" (full width), secondary
  "Decline", ghost "Call {shop}" (tel link). Approve requires typed full name (TextField, "Type your
  name to sign") when the quote total >= $200, otherwise a checkbox "I approve this quote".
- States: sent (actions), approving (button loading), approved (success Banner "Approved Oct 21,
  3:20 pm by Alex Chen"), declined (neutral Banner + "Changed your mind? Call {shop}"), expired
  ("This quote expired on Oct 28. Ask {shop} for a new one."), superseded ("There's a newer quote"
  link).

### OrderTracker (order status)

Horizontal 4-step tracker (pending → accepted/preparing → ready → picked up) on phones as a
segmented bar with labels below; big status line on top `h2` ("Ready for pickup"), pickup time,
order number `code` style 32. Ready state: full-width `success` card, lucide:package-check, "Show
this at the counter" + order code. Cancelled/refunded: neutral card with reason and refund line.

### DataTable (web dashboard)

- Header row `surfaceSunken`, text `label fgMuted`, sticky on scroll, sortable headers with
  lucide:arrow-up-down 14 and `aria-sort`. Rows 52 px, `bodySm`, 1 px `border` dividers, hover
  `canvasSubtle`, selected `brandSubtle`. Numbers right-aligned tabular.
- Toolbar: search TextField (debounced 250 ms), filter Chips, column menu, "Export CSV" secondary.
- Pagination: cursor-based "Load more" + "Showing 1-50 of 1,204" (`caption`).
- < md: rows collapse into ListRows (primary column as title, two key columns as subtitle, value
  trailing); the toolbar becomes a search + "Filters" Sheet.
- Empty → EmptyState in table body; loading → 8 skeleton rows; error → Banner danger + retry.

### StatTile (KPI)

Card, padding 16-20. Overline label (`overline fgMuted`, e.g. "ACTIVE MEMBERS"), value `stat`
32/700 tabular, delta row: lucide:trending-up/down 16 + "+12% vs last 30 days" (`bodySm`, success /
danger text colour only when the direction is good/bad for the merchant; neutral otherwise),
optional sparkline 32 px tall in `chart-you`. Clickable tiles navigate to the report. Loading:
skeleton value block 32 x 96.

### DensityGauge (admin, rep)

Semi-circle gauge 160 x 90, 12 px stroke, segments coloured by `chart.status` (low < 40% of target,
building 40-99%, healthy >= 100%), needle-free: filled arc + value `stat` + label "28 / 40 shops".
Always paired with the number and status text, never colour alone.

### Chart colours

Use `chartColors[theme]` (TS) or `var(--ll-chart-*)` / `fill-chart-1` (web).

| Role | Light | Dark |
| --- | --- | --- |
| Series 1 (you / primary) | `#1F6A50` | `#7DBBA0` |
| Series 2 | `#C65334` | `#EB9479` |
| Series 3 | `#1D5FA8` | `#8DB7E6` |
| Series 4 | `#7A4FA3` | `#C2A3E0` |
| Series 5 | `#A35A06` | `#F6C35A` |
| Series 6 / network | `#655A4C` / `#857867` | `#D4C9B8` / `#857867` |
| Grid / axis text | `#E7DFD2` / `#655A4C` | `#332D26` / `#A99D8B` |
| Sequential (heatmap) | pine 50 → 800 | pine 950 → 300 |

Rules: max 6 series; direct labels over legends; 2 px lines, 4 px dots on hover only; bars radius 4
top; tooltips use `surfaceInverse`. "You vs network" comparisons: you = series 1, network = stone.
Every chart has a "View as table" toggle (accessibility + CSV).

---

## 7. Layout patterns

- **Customer app:** bottom tabs Home · Map · Card · Rewards · You. App bar 56 with large title on
  scroll-to-top screens (Home, Rewards). Gutters 16. Section spacing 24-32.
- **Counter mode:** no tab bar. Header 56: location name, staff chip (avatar + name, tap to
  switch), overflow menu. Content is one task at a time.
- **Merchant dashboard (web):** lg+: left sidebar 248 (logo, merchant/location switcher, nav,
  help), content max 1200, gutters 24. md: collapsible rail 72. < md: top bar + bottom nav (Home,
  Customers, Promos, Counter, More).
- **Rep console / Admin:** same shell as dashboard, different nav, a coloured environment strip
  (4 px top border: info for rep, danger for admin) so staff always know where they are.
- **Public web (join, quote, invoice, shop page):** single column max 480, paper canvas, shop
  identity first, our brand only in the footer.

## 8. Accessibility checklist (all components)

- WCAG 2.2 AA. Contrast tested in tokens; don't introduce untested pairs.
- Hit areas >= 48 (44 min). Spacing between adjacent targets >= 8.
- Every icon-only control has a label. Decorative icons `aria-hidden` / `accessibilityElementsHidden`.
- Status never by colour alone: always text or icon + text.
- Dynamic type: layouts survive 200% text (web) and iOS XXXL / Android 1.6x. Counter mode keypad
  digits cap at 1.6x; everything else wraps.
- Announce async results: award success, errors and offline state via live regions /
  `AccessibilityInfo.announceForAccessibility`.
- Focus order follows visual order; modals trap focus and restore it.
- Reduced motion: replace movement with 120 ms fades, no count-ups, no pulses. Keep haptics.
- Forms: labels always visible; errors linked with `aria-describedby`; don't disable submit to
  signal errors, validate on submit and focus the first error.
- Language: `lang="en-CA"`; French (`fr-CA`) is planned, so no text in images and allow 30% longer
  strings in every layout.
- Time limits: redeem codes (10 min) and OTP (10 min) show countdowns and offer a one-tap renewal.
