# Design foundations (v2) — built from Corner

This replaces the v1 look (paper background, pine green, marigold, Figtree).
Everything — customer app, web pass, merchant dashboard, rep, admin — is
rebuilt on these foundations. `docs/design/references.md` stays as layout
reference; where it conflicts with this file, this file wins.

> **v3 roles have landed (workstream A1).** [v3-strategy.md](./v3-strategy.md) keeps this identity, moves the component
> layer to shadcn/ui, renames the orange role to `points`, and defines one shell for every trade. The colour roles in
> "Colour" below are the v3 set (shadcn variable names, warm stone neutrals); every v2 name still works as an alias until
> the final sweep. Everything else in this file (type, shape, motion, customer app, dashboard, anti-slop) is unchanged.

## What Corner actually does (studied on Mobbin)

Sources: Corner map ([1](https://mobbin.com/flows/5a10c893-ab8a-43c8-8b92-00768417390a),
[2](https://mobbin.com/flows/b90e603f-2973-4bba-939f-9e6fb7245257),
[your places](https://mobbin.com/screens/74cc935e-2d23-4f24-921b-1377b9508eb5),
[home](https://mobbin.com/screens/f589383a-2738-4ada-8c37-80e410701d71)).

1. **The map is the canvas and it is almost colourless.** A near-white,
   desaturated basemap (white roads, pale grey blocks, faint green parks,
   pale blue water). All colour on screen comes from the *places*, not the chrome.
2. **Places are objects, not markers.** Each pin is a small round white
   bubble holding a photo or a 3D-ish object icon (coffee cup, croissant,
   cocktail). Next to it: the name in bold black, and one italic grey line
   underneath ("trending cozy cafe", "eat"). No teardrop markers, no coloured pins.
3. **Labels are lowercase and set in a heavy, slightly wide grotesk**
   (city pills: "toronto", "montreal"; categories: "top picks · eat · cafes · bars").
   Lowercase is the voice: friendly, not shouty.
4. **Chrome floats.** Everything over the map is a white, softly shadowed
   capsule or circle: top-left round button, top-right grouped capsule
   (location + bell), filter capsules ("everyone ▾", "open now"), a frosted
   capsule tab bar with 4 icons, and a separate round "+" button.
5. **One black element per screen** carries the strongest action: the black
   search capsule, the black recenter circle, the black "search here" pill.
6. **Category rail of objects.** A horizontal row of small object
   illustrations with lowercase captions under them sits right above the tab bar.
7. **Density with air.** Small type (13–15 px), generous spacing between
   groups, no boxes around things that don't need them.

## The system

### Colour

Monochrome first. One warm accent, reserved for points and rewards. Neutrals are **warm stone**, not cool grey.
Source of truth: `packages/design-tokens/src/colors.ts` (`rolesV3`); the CSS variables are generated from it
(`pnpm --filter @ll/design-tokens build:css`). Web utilities use the shadcn names (`bg-background`, `text-muted-foreground`,
`border-border`, `bg-points`); mobile reads the same values from `colors` and `rolesV3`.

| Role (CSS variable) | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FFFFFF` | `#0E0D0C` | screens, sheets |
| `foreground` | `#0B0B0C` | `#F6F4F1` | primary text |
| `card`, `popover` (+ `-foreground`) | `#FFFFFF` | `#161412` | cards, popovers, menus (hairline, no shadow on cards) |
| `primary` (+ `-foreground`) | `#0B0B0C` (`#FFFFFF`) | `#F6F4F1` (`#0E0D0C`) | the one black button per screen |
| `secondary`, `muted` | `#F6F4F1` | `#1C1A18` | grouped backgrounds, table header, skeleton base |
| `muted-foreground` | `#6B6762` | `#A8A39C` | secondary text, placeholders |
| `accent` | `#EEEBE6` | `#262320` | **hover and pressed surface. Not the orange.** |
| `destructive` | `#DC2626` | `#F87171` | errors, destructive actions, closed |
| `border` | `#E7E3DD` | `#2C2926` | hairlines (1 px; 0.5 px on retina native) |
| `input` | `#8A8680` | `#7C7770` | form-control outlines (3:1) |
| `ring` | `#0B0B0C` | `#F6F4F1` | focus ring (2 px + 2 px offset) |
| `subtle-foreground` | `#8A8680` | `#7C7770` | **disabled only** (3.6:1, fails 4.5:1 by design) |
| `sidebar`, `sidebar-accent`, `sidebar-border`, `sidebar-foreground`, `sidebar-primary(-foreground)`, `sidebar-ring` | `#F6F4F1`, `#EEEBE6`, `#E7E3DD`, as foreground/primary/ring | `#161412`, `#262320`, `#2C2926`, as foreground/primary/ring | dashboard sidebar, 32 px rows, active = `sidebar-accent` |
| `points` | `#FF5A1F` | `#FF7A45` | points, stamps, "reward ready", activity dots, and in the dashboard the one thing that needs the shop right now. Fills, dots, numbers >= 17 px |
| `points-text` | `#C2410C` | `#FF7A45` | small orange text (balances in lists, "reward ready") |
| `points-soft` | `#FFF1EA` | `#2A1710` | background behind points text and badges |
| `points-foreground` | `#FFFFFF` | `#0E0D0C` | icon or large label on a points fill |
| `success`, `success-text` | `#16A34A`, `#15803D` | `#22C55E`, `#4ADE80` | "open now" dot, positive deltas, "paid" |
| `info`, `info-text`, `info-soft` | `#2F7BF6`, `#1D4ED8`, `#EFF4FF` | `#4C8DF8`, `#8DB2FF`, `#111C33` | waiting on a customer; the user's own location dot |
| `warning`, `warning-text` | `#D97706`, `#B45309` | `#FBBF24`, `#FBBF24` | due soon (dot colour) |
| `paper` | `#FBF9F6` | `#0E0D0C` | customer pass and marketing canvas |
| `qr-fg`, `qr-bg` | `#000000`, `#FFFFFF` | same | QR codes are always black on white |
| `chart-1` to `chart-5` | `#0B0B0C`, `#FF5A1F`, `#6B6762`, `#2F7BF6`, `#16A34A` | `#F6F4F1`, `#FF7A45`, `#A8A39C`, `#4C8DF8`, `#22C55E` | charts: `chart-1` line, `chart-2` only for the highlighted series |

**v2 names are aliases** (removed in the final sweep): `bg` = `background`, `bg-subtle` = `muted`, `bg-muted` = `accent`,
`fg` = `foreground`, `fg-muted` = `muted-foreground`, `fg-subtle` = `subtle-foreground`, `line` = `border`,
`line-strong` = `input`, `accent` = `points` (the orange), `accent-text` = `points-text`, `accent-soft` = `points-soft`,
`on-accent` = `points-foreground`, `positive` = `success`, `negative` = `destructive`, `location` = `info`.
`positive-text` keeps its v2 value (`#166534` light) because `success-text` is 4.2:1 on the hover surface.
**Collision to know about:** in Tailwind the name `accent` is still the v2 orange (`bg-accent`, `text-accent`) until the sweep
renames those call sites to `points`. shadcn's hover surface is exposed as `bg-hover` / `text-hover-foreground`
(`pnpm --filter @ll/web shadcn:fix` rewrites it in `components/primitives`). In CSS, `var(--accent)` is already the hover surface.

Rules: primary buttons are **black** (`primary`, inverted in dark). No
gradients. No tinted cards. Status is a small dot + word, never a filled
coloured card. Charts are `chart-1` (black line/bars) with `points` only for the
highlighted series. Every pair a component uses is in `contrastPairs` / `contrastPairsV3` and tested in light and dark.

Shop identity: each shop keeps its `brandColor`, shown **only** inside its own
avatar (initials or logo). Never as a page background.

### Type

| Role | Web | Native |
| --- | --- | --- |
| Display & map labels | **Bricolage Grotesque** 700/800 (Google Fonts), lowercase for map/category labels | same font via `@expo-google-fonts/bricolage-grotesque` |
| UI & body | **Inter** 400/500/600 (Google Fonts), tabular numbers | **system font** (SF Pro / Roboto) — this is what makes it feel native |

Scale (px): 11 caption · 13 meta · 15 body · 17 headline · 22 title ·
28 large title · 40 display number. Line height 1.3 for UI, 1.15 for display.
Letter-spacing −0.01em on display sizes. Numbers always tabular.
Italic is used for exactly one thing: the grey subtitle under a place name.

### Shape, depth, spacing

- Spacing on a 4 px grid; screen gutter 16 (mobile) / 24–32 (web).
- Radius: `--radius` 10 (`rounded-lg`, `rounded-input`: inputs and small buttons; `sm` 6, `md` 8, `xl` 14 derive from it) ·
  16 cards & sheets' inner blocks (`rounded-card`) · 24 bottom sheets (`rounded-sheet`) · full for capsules, chips, map chrome, avatars.
- Shadow: only for things that float over the map or content —
  `0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.08)` (`shadow-float`); bottom sheets use
  `0 -8px 32px rgba(0,0,0,.14)` (`shadow-sheet`). Cards on a white
  page get a hairline, not a shadow.
- Frosted chrome (tab bar, top capsules): white at 80% + 20 px blur
  (native `BlurView`, web `backdrop-filter`).
- Icons: Lucide, 1.75 stroke, 20/24 px. Category objects: small flat-3D
  illustrations (one set, drawn once, shipped as PNG/SVG in
  `packages/design-tokens/assets/categories/`).
- Touch targets ≥ 44 pt; counter keys 72 pt; kiosk 88 pt.
- Motion: 150 ms ease-out for taps, 240 ms spring for sheets; nothing bounces twice.

## Customer app (native)

- **Explore is the home screen** (Corner): full-bleed light map, floating
  chrome as above. Pins = white bubble + shop object/photo + bold name +
  italic subtitle ("your 7 / 10 stamps", "2× points today", "bakery").
  Category rail: `all · coffee · bakery · eat · shops · beauty · repair`.
  Filter capsules: `my shops ▾` / `open now` / `rewards ready`.
- Tab bar (frosted capsule): **map · wallet · [card] · activity** and the
  avatar. The card is the round black button that opens the QR sheet.
- **Wallet**: iOS large title "wallet", a list (not a carousel) of shops
  with avatar, name, one line of progress, and the balance right-aligned in
  `accent`. Rewards ready float to the top under a hairline section header.
- **Shop sheet** (not a pushed page first): grabber, avatar + name + italic
  vertical line, open dot, a stamp row or points bar, rewards list, then
  "about". Swiping up expands to full height.
- **My card**: white sheet, big QR, member code in mono, one black button
  "add to apple wallet". No coloured card art.
- Native controls everywhere: system switches, action sheets, haptics on
  award/redeem, SF-style large titles that collapse on scroll.

## Merchant dashboard (web) — Square/Stripe-grade calm

- Light grey sidebar (`bg-subtle`), white content, hairline separators.
  Sidebar items: 32 px rows, icon + label, active = `bg-muted` fill.
- Page header: title (22, semibold), one-line description, actions right.
  One black primary button per page.
- Stats: plain numbers on white with a label above and a small delta below;
  separated by vertical hairlines inside one bordered block, not four cards.
- Tables: 44 px rows, hairline row dividers, sticky header on `bg-subtle`,
  right-aligned numbers, row click opens a right-side panel (Square pattern).
- Charts: thin black line or black bars, light grid, no legends unless two series.
- Empty states: one sentence + one action. No illustrations of people.
- Paid features don't appear in the sidebar until the shop can use them.
  When useful, a single quiet line: "Promos — coming with Plus · Notify me".

## Anti-slop checklist (review every screen against this)

- [ ] No gradients, glows, glassmorphism outside map chrome, or neon.
- [ ] No emoji in UI copy or headings.
- [ ] No more than one accent-coloured thing per viewport, and it means points.
- [ ] No coloured stat cards, no "icon in a coloured circle" decoration.
- [ ] No centred hero text inside the product (marketing site only).
- [ ] No generic "Welcome back! 👋" copy; use the person's or shop's name plainly.
- [ ] Every number is real data or a clear empty state — no fake trend arrows.
- [ ] Alignment on a single left edge; consistent 16/24 gutters.
- [ ] Text never truncates mid-word on common names; test with long Toronto shop names.
- [ ] Looks right in dark mode.
