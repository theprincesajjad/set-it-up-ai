# Design v3: strategy and system

Owner: Design. Status: **proposal for build teams**, 2026-10-28. Baseline: [foundations.md](./foundations.md) (v2),
[system.md](./system.md), [brand.md](./brand.md), [polish-audit.md](./polish-audit.md), `docs/audits/*.md`.
Nothing in this change touches app code. Everything here is docs and Figma.

**Figma file:** [Local Loyalty — v3 design system](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA)
(file key `tat1lWRQIJ2Q3Al98pWOtA`). Frame list with node ids is in [section 9](#9-figma-index).
PNG exports of every frame: `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/v3/`
(scratch only, not committed).

---

## 0. Decisions at a glance

| # | Decision | Why in one line |
| --- | --- | --- |
| 1 | **shadcn/ui core on Base UI**, `rtl: true`, Tailwind v4, `cn` package, CLI v4 | Base UI is the default for new shadcn projects since July 2026; we have no Radix code to migrate; RTL is built in. |
| 2 | **One extra registry: ReUI** (`@reui`): Data Grid, Event Calendar, Kanban, Timeline, Stepper | Only registry we found that ships dashboard-grade calendar, kanban and data grid in both Base UI and Radix, MIT, with versions that match ours. |
| 3 | **Optional second registry: Bklit UI** (`@bklit`) for gauge, ring and heatmap charts, behind a one-day spike | Charts are the only gap; core shadcn Chart (Recharts) covers line and bar. Bklit versions are not published on its README, hence the spike. |
| 4 | **Dev tooling:** `@shadcn/lint` in CI, `shadcn migrate cn` | Stops raw colours and arbitrary values, which is how drift starts. |
| 5 | **Keep custom:** stamp card, points ring, keypad, QR, redeem code, discount card, counter, kiosk, category objects | Brand objects and counter-speed interactions have no shadcn equivalent. |
| 6 | **Tokens:** shadcn variable names for every role; our orange becomes `points`; warm stone neutrals; new `info`, `warning`, `paper` roles | shadcn's `--accent` means "hover surface". Keeping our orange under that name would collide silently. |
| 7 | **One shell for every trade:** five fixed sidebar sections, only `run` changes per trade; a four-card Today home | Today the sidebar has three different grouping schemes (flat, restaurant, grocery). |
| 8 | **Import paths do not move.** The 42 files in `apps/web/src/components/ui` stay and become thin wrappers over `components/primitives/**` | 307 files import from `@/components/ui`. Swap internals, not paths. |
| 9 | **7 workstreams**, one gate (A), then B to G in parallel with disjoint file ownership | See [section 8](#8-migration-plan). |

---

## 1. What the audits and the code say (why v3 is not just a reskin)

Evidence read for this strategy (not restated in full):

| Finding | Source | v3 response |
| --- | --- | --- |
| Three different sidebar grouping schemes: flat list, restaurant `r-today / r-sell / r-menu / r-talk / r-loyalty`, grocery `g-*` | `apps/web/src/lib/dashboard/nav.ts` (`buildMerchantNav`, `restaurantNav`, grocery block) | One five-section structure; trade modules plug into `run`. |
| Dead ends: pending payments with no "Finish payment" or "Cancel" (F3) | `docs/audits/fitness-studios.md` | Needs you rows always carry a verb and a destination; empty and error states always carry one action. |
| Disabled switch with no way to enable it (P7); two rebooking pages side by side, one empty (P4) | `docs/audits/pet-care.md` | Settings pattern: a disabled control must link to the thing it needs. One module per job in `run`. |
| Tax is buried in Settings and never prompted (S5); calendar now-line crosses a block title (S17) | `docs/audits/services.md` | Needs you card can surface "Tax is not set up". Calendar uses ReUI Event Calendar with block z-order above the now line. |
| Cutoff chip "Skip cutoff for Thu, Oct 29 in 16 h 51 m" hard to read (F19) | `docs/audits/tiffin-catering-banquet.md` | Time copy: "Wed 8:00 a.m.: last skip for Thursday". Age and due strings follow one format. |
| 20-minute setup beaten by about 4x, weak links are dead ends, not time | `docs/audits/fitness-studios.md` summary | Setup progress stays in the sidebar; every dead end gets an owner. |
| 307 files import from `@/components/ui`; `kit.tsx` is 627 lines holding 35 exports | `grep` of `apps/web/src`, `components/dashboard/kit.tsx` | Keep barrel; split `kit.tsx` mechanically first (workstream A) so streams stop colliding. |
| Tokens: `theme.css` ships ~90 colour names including a deprecated v1 block | `packages/design-tokens/css/theme.css` | v3 keeps old names as aliases until the last sweep, then deletes them. |
| App already supports `en / hi / ur / pa` with fonts and `dir` | `packages/shared/src/i18n/locales.ts` | Design for RTL from the shell down; fonts match the locale table (Noto Sans Devanagari, Noto Nastaliq Urdu, Noto Sans Gurmukhi). |

---

## 2. Research

**Method and limits.** Searched with WebSearch, then verified on GitHub. The `gh` CLI was blocked for repos outside
this project, so stars, creation dates and "pushed" dates come from the GitHub repository search API (queried
2026-10-27, so "recent activity" is exact to that day). Licences, versions and feature lists come from each repo page
or its `package.json` fetched on the same day. Where a repo page does not state a fact it is marked **not stated**,
not guessed. The shadcn changelog is `ui.shadcn.com/docs/changelog` (fetched 2026-10-28).

### 2.1 shadcn/ui core: state now (Oct 2026)

| Topic | State | Source |
| --- | --- | --- |
| Repo | [shadcn-ui/ui](https://github.com/shadcn-ui/ui): 126,716 stars, pushed 2026-10-27. Licence: MIT (long-standing; not re-fetched this session). | GitHub search |
| Base UI vs Radix | Base UI docs Jan 2026; **Base UI became the default for new projects in July 2026** (`shadcn init`). Radix is not deprecated: "every update and new component will ship for both". Keep Radix with `-b radix`. Migration skill: `pnpm dlx skills add shadcn/ui`, then "migrate accordion to base-ui" (one component at a time; both can coexist). | [changelog](https://ui.shadcn.com/docs/changelog), Jul 2026 entry |
| Radix package | Single `radix-ui` package since Feb 2026 (`shadcn migrate radix`). | changelog, Feb 2026 |
| Tailwind v4 | Supported since Feb 2025; no 2026 entry needed. Every v4 registry we checked pins `tailwindcss ^4.3`. | changelog; package.json of ReUI and the Kiranism starter |
| CLI | **shadcn/cli v4** (Mar 2026): `npx shadcn@latest init -t next [--monorepo] [-b radix] [--preset CODE] [--rtl]`; `-d` for defaults; `shadcn apply`, `eject`, `preset` (Apr 2026); `migrate rtl`, `migrate cn`, `migrate radix`. | changelog; [installation/next](https://ui.shadcn.com/docs/installation/next) |
| Registry | GitHub registries (Jun 2026), private GitHub registries (Aug 2026), registry `include` and `validate` (May 2026). Namespaced installs: `npx shadcn@latest add @reui/<name>`. | changelog |
| RTL | **Native since Jan 2026**: `rtl: true` in `components.json`; the CLI rewrites `left/right` to `start/end`, adds `DirectionProvider`, flips directional icons with `rtl:rotate-180`. **Gaps:** Calendar, Pagination and Sidebar are not auto-migrated (follow each component's RTL section); portal content needs `dir="rtl"` because of a `tw-animate-css` issue. Docs recommend Noto fonts. | [docs/rtl](https://ui.shadcn.com/docs/rtl) |
| `cn` | `cn` is now a standalone package (Sep 2026): replaces `tailwind-merge` + `clsx`, same API, MIT, Tailwind v4 compatible (`shadcn migrate cn`). [shadcn-ui/cn](https://github.com/shadcn-ui/cn), 1,716 stars, created 2026-08-31. | changelog; repo |
| Lint | [shadcn-ui/lint](https://github.com/shadcn-ui/lint) (`@shadcn/lint`), MIT, 3,276 stars, created 2026-09-02. Rules: `no-restyle`, `no-raw-colors`, `no-arbitrary-values`, `no-inline-styles`, `no-unknown-classes`, `require-static-classes`. Tailwind v4, ESLint 9.30+ or Oxlint 1.80+, Node 20.19+. | repo |
| New in 2026 | Toast, Questionnaire, Trace, Code Block, shadcn/typeset, dynamic search, React Aria as a third base. | changelog |

### 2.2 Candidates (shadcn-based libraries and registries, May to Oct 2026 relevance)

"Window" means launched in, or had major activity in, the last ~6 months. Older repos are listed when they pushed this
week and matter to the decision.

| Candidate | GitHub | Licence | Stars, activity (2026-10-27) | Offers | TW v4 / React 19 / Next 16 | A11y | Weight and fit | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **ReUI** | [keenthemes/reui](https://github.com/keenthemes/reui) | MIT | 3,803; created 2025-02; pushed 2026-10-27; package `reui` 2.8.1; GitHub Releases not used | 27 in-house components: **Data Grid** (TanStack Table v9 + Virtual: sort, filter, pin, resize, DnD, tree rows), **Event Calendar** (month, week, day, N-day, agenda, DnD), **Gantt, Kanban** (dnd-kit), Timeline, Stepper, Tree, Sortable, Cascader; 60 primitives; 1,264 examples. Free MCP + skill. **Pro is paid** (51 chart blocks, 8 dashboard blocks, 44 data-grid blocks); we use free only. | **Yes, verified in package.json:** next 16.3.8, react 19.2.7, tailwindcss ^4.3.1, `@base-ui/react` 1.5.0 and `radix-ui` ^1.4.3 (both bases for all 27), recharts 3.8.1, motion ^12.38 | "Accessibility notes" on each page; no WCAG claim | Copy-and-own, no npm lock-in: `npx shadcn@latest add @reui/<id>`. Pulls dnd-kit, TanStack v9, date-fns, react-day-picker. | **Adopt** (registry #1) |
| **Bklit UI** | [bklit/bklit-ui](https://github.com/bklit/bklit-ui) | MIT (charts); Studio package proprietary | 1,820; **created 2026-01-19**; pushed 2026-10-27 | 17 charts: area, bar, candlestick, choropleth, composed, funnel, **gauge**, **heatmap**, line, live line, P/L line, pie, radar, **ring**, sankey, scatter, sunburst. `npx shadcn@latest add @bklit/line-chart`. | **Not stated** on README (monorepo, Turborepo; topics list base-ui, visx, motion). Spike needed. | **Not stated** | visx + motion = extra weight; use only for ring, gauge, heatmap | **Spike, then adopt narrowly** (registry #2, optional) |
| **Kiranism dashboard starter** | [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) | README says MIT; `package.json` has no licence field | 7,187; pushed 2026-10-27 | Full admin template: tables (TanStack v9, nuqs), forms (TanStack Form), kanban, charts, auth, billing | **Exact match to us:** next 16.4.2, react 19.3.0, tailwindcss ^4.3.3, `@base-ui/react` ^1.9, recharts 3.10.1 | Not stated | Brings Clerk, Sentry, AI SDK we do not want | **Reference only** (copy patterns, not code) |
| **square-ui** | [zerostaticthemes/square-ui](https://github.com/zerostaticthemes/square-ui) | In `LICENSE.md`, **not read** | 6,160; pushed 2026-10-27 | 20 free layouts: calendar, tasks, projects timeline, maps, dashboards 1 to 5, employees, payrolls; Radix and Base UI trees | Not stated | Not stated | Layout inspiration only | **Reference only** |
| **tablecn** | [sadmann7/tablecn](https://github.com/sadmann7/tablecn) | MIT | 6,362; pushed 2026-10-26 | Data table and data grid: server filters, Notion/Linear-style filter menu, action bar, virtualised grid | Not stated; demo app, install path unclear on the repo page | Not stated | Demo-app shaped | **Reference for filter UX**; do not install |
| **Dice UI** | [sadmann7/diceui](https://github.com/sadmann7/diceui) | MIT | 2,098; pushed 2026-10-27 | Accessible shadcn components, data grid; Base UI and Radix | Not stated (Node >= 22.13) | Tagged accessibility, wai-aria | Overlaps ReUI | **Watch** |
| **data-table-filters** | [openstatusHQ/data-table-filters](https://github.com/openstatusHQ/data-table-filters) | Not checked | 2,284; pushed 2026-10-26 | Faceted filters, infinite scroll, SQL-side filtering with Drizzle | Not stated | Not stated | We do not use Drizzle on web | **Skip** |
| **shadcn-studio** | [shadcnstudio/shadcn-studio](https://github.com/shadcnstudio/shadcn-studio) | MIT | 1,968; pushed 2026-10-27 | Blocks, templates, theme generator; free and premium | "Tailwind v4 Compatibility" listed | Not stated | Mixed free/paid, block categories not listed | **Skip** |
| **evilcharts** | [legions-developer/evilcharts](https://github.com/legions-developer/evilcharts) | Not checked | 3,144; pushed 2026-10-27 | shadcn + Recharts chart set | Not stated | Not stated | Alternative to Bklit | **Skip** (Recharts via shadcn Chart is enough) |
| **tweakcn** | [jnsahaj/tweakcn](https://github.com/jnsahaj/tweakcn) | Apache-2.0 | 10,489; pushed 2026-10-27 | Visual theme editor for shadcn | Topic `tailwindcss-v4`; export format not stated | n/a | Design-time tool | **Use to preview tokens**, no dependency |
| **react-native-reusables** | [founded-labs/react-native-reusables](https://github.com/founded-labs/react-native-reusables) | MIT | 8,708; pushed 2026-10-27 | shadcn for React Native (NativeWind / Uniwind) | n/a (RN); Expo SDK not stated; RTL not mentioned | Not stated | Our Expo app already has 40+ matching components in `apps/mobile/src/ui` | **Not adopted.** Mobile takes tokens only. |
| Motion sets: cult-ui, kokonutui, arc-library (2026-09-24), canvas-ui (2026-07-16, WebGL), affectui (2026-10-03) | cult-ui 6,788; kokonutui 2,236; arc-library 1,022; canvas-ui 5,142 | cult-ui MIT, others not checked | Animated showcase components | Not stated | Not stated | Conflict with "nothing bounces twice", add weight | **Reject** |
| Small or too new: hextaui (2026-09-25, 143 stars), e-suiss/ui (2026-09-30, 15 stars), gauge-ui (2026-09-27, 166 stars), full-calendar (483 stars) | | | | | | | Too little track record | **Skip** |

### 2.3 Recommendation

1. **Core:** shadcn/ui on **Base UI** (`npx shadcn@latest init -t next --monorepo --rtl`, default base). Reasons:
   default for new projects; no Radix code in `apps/web/package.json` today, so no migration cost; ReUI and the
   Kiranism starter both ship Base UI; RTL support is equal on both bases. Risks: `asChild` becomes `render`;
   Calendar, Pagination and Sidebar RTL are manual (see workstreams B and C).
2. **Registries (at most two beyond core):** `@reui` (adopt), `@bklit` (spike).
3. **Where each component class comes from:**

| Need | Source |
| --- | --- |
| Button, Card, Badge, Alert, Avatar, Skeleton, Spinner, Empty, Item, Separator, Tooltip, Progress | shadcn core |
| Sidebar, Sheet, Drawer, Dialog, AlertDialog, Popover, Command (cmdk), Tabs, Toggle, ToggleGroup | shadcn core |
| Field, Input, InputGroup, InputOTP, Textarea, Select, Combobox, Checkbox, Switch, RadioGroup | shadcn core |
| Table + simple data tables (customers, orders, invoices) | shadcn core Table with TanStack Table v9 |
| Large grids (customers over a few hundred rows, imports, payouts) | ReUI Data Grid |
| Calendar (appointments, classes, roster) | ReUI Event Calendar |
| Walk-in line board, kitchen tickets, order boards | ReUI Kanban (spike for kitchen display) |
| Ticket timeline, order steps | ReUI Timeline, ReUI Stepper |
| Line, bar, area charts | shadcn Chart (Recharts 3) |
| Gauge, ring analytics, retention heatmap | Bklit (after spike) or keep `DensityGauge` and `Heatmap.tsx` |
| Toast | shadcn Toast (Jul 2026) vs Sonner: pick one in workstream A, do not ship both |
| Class merging | `cn` package |
| CI guardrail | `@shadcn/lint` |

4. **Keep custom (with reason):** `StampCard` and `PointsRing` (brand objects, stamp pop, haptics); `Keypad` (72 and 88 px
   keys, no equivalent); `MemberQr`, `QrCode`, `RedeemCode` (fixed black on white, scanner reliability, countdown);
   `DiscountCard` (live clock against screenshot reuse); `PromoCard`, `RewardCard` (domain rules, built on shadcn Card);
   `CategoryIcon`, `VerticalIcon`, `ShopTile` (category objects and brand colour rules); `PhoneField` (E.164 and
   `dir="ltr"` inside RTL, built on InputGroup); counter and kiosk surfaces; `LockedFeature` (never "Upgrade").

---

## 3. Mood board summary

Frame: [Mood board / main street](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=19-2) (`19:2`, page `01 Mood board`).

**Concept: the main street.** Warm like the corner shop, plain about money and consent, fast at the counter,
multilingual (en, hi, ur, pa; left to right and right to left), calm. An awning, a window sign, a decal.

| Section | Node | What it holds |
| --- | --- | --- |
| 01 concept | `19:3` | Concept statement, keywords, awning shopfront with window sign and decal (real logo mark and wordmark from `apps/web/public/brand`). |
| 02 keep and evolve | `19:64` | Ten rows: what stays (logo, black primary, Bricolage + Inter, category objects), what evolves (neutrals, role of the orange, status colours, sidebar, dark mode), what is new (awning stripe), each with a reason. |
| 03 colour | `19:114` | Swatches bound to the Primitives collection: warm stone, ink and points, status dots, awning stripe. |
| 04 type | `19:293` | Scale in real styles, and four language specimens (English, Hindi, Urdu RTL, Punjabi) with font and line-height notes. |
| 05 iconography | `19:346` | 31 Lucide icons at 1.75 stroke, and the 8 real category objects from `packages/design-tokens/assets/categories` imported as vectors. |
| 06 photo and illustration | `19:489` | Four photo slots with shot list (placeholders to be shot or licensed), do and do-not lists. No stock photos were generated. |
| 07 motion | `19:540` | Tap 150 ms ease-out, sheet 240 ms spring, stamp pop, drawn from `durations`, `easings`, `springs`. |
| 08 references | `19:567` | 27 Mobbin screens, grouped, each with app, platform, one line on what we take, and the Mobbin URL. |

**What evolves versus v2, and why** (full table in the frame): warm stone neutrals (`#F6F4F1`, `#6B6762`, `#E7E3DD`,
paper `#FBF9F6`) instead of cool greys; the orange renamed `points`; `info` and `warning` as dot colours so Needs you
can say who must act; one fixed sidebar; warm charcoal dark mode (`#0E0D0C`, `#161412`). The logo, the black primary
and the single accent rule stay.

### Reference screens (Mobbin)

Searches used `search_screens` after loading the Mobbin search skill. Platform noted per screen. iOS references
inform the Expo app and the counter; web references inform the dashboard.

| Group | Screens (Mobbin id) | What we take |
| --- | --- | --- |
| Dashboards, web | [Square](https://mobbin.com/screens/a7b88cfc-ad6a-45c2-ab23-46ac537546c9), [Fresha](https://mobbin.com/screens/66a88338-c579-4782-a177-26e130edf1af), [HoneyBook](https://mobbin.com/screens/db20d057-61a0-4a8d-ba52-49bda519a6b8), [Jobber](https://mobbin.com/screens/850e0dd4-ef8e-45a8-846d-c6545868509c) | Light sidebar and hairline cards; today's next appointments; three numbers split by hairlines; workflow counts with a to-do list. |
| Rosters, web | [Square schedule](https://mobbin.com/screens/66ea4b9b-7284-4f6a-bc5f-cb0860a34724), [Deputy](https://mobbin.com/screens/376702ab-9613-42c3-8d00-0348c2ffb101), [7shifts](https://mobbin.com/screens/d6a011bd-c292-49cc-86bb-bfc568d9f1ba) | Week roster with one black Publish; totals rows; warnings above the grid. |
| Queues and boards, web (issue trackers: structure only; **no kitchen or order-queue app was returned**) | [Linear](https://mobbin.com/screens/be6c4ee4-aa93-42b4-89b3-dcfc8386f022), [HubSpot](https://mobbin.com/screens/f9b9fcf1-0767-4ee5-adad-12003a31331e), [Slack Lists](https://mobbin.com/screens/30373d82-eb7e-40ed-ac03-17fdc7eea165) | Grouped list by status; columns by state; board cards. |
| Counter and keypad, iOS | [Satispay](https://mobbin.com/screens/10680749-73c4-4c55-bd13-0db4da2b4811), [PayPal](https://mobbin.com/screens/ae1974f2-3414-42be-87bd-0ab155b527ea), [Careem](https://mobbin.com/screens/15e197ba-ce96-48ad-bf0c-87291a83dec8), [Grab](https://mobbin.com/screens/344f70d4-d09c-481b-84a8-b0901f9b297c) | Amount hero, big keys, a points toggle above Pay, one black button. |
| Booking, iOS | [Fresha](https://mobbin.com/screens/0a1e201a-c0d7-4ce7-8cd1-39ac3921096d), [Careem salon](https://mobbin.com/screens/a030486a-580e-4b86-b331-2b7cdddf94c8), [Zocdoc](https://mobbin.com/screens/e44c3e62-24dd-47f3-94ce-929f5d78b9a5), [Beli](https://mobbin.com/screens/275dd494-deef-4651-81b9-7af46f67db3a) | Date strip + time list with total and black Continue in a footer; slot grid. |
| Loyalty wallets, iOS | [Starbucks](https://mobbin.com/screens/e8f3cd58-ea9a-42b2-8c11-4831abde1526), [Honest Greens](https://mobbin.com/screens/6dc61bf0-a764-450e-857c-502d99dd769c), [7-Eleven](https://mobbin.com/screens/98ac3108-7273-4e51-bc65-fd63963430b7), [Klarna](https://mobbin.com/screens/8a4ee5e9-1b9b-4bf9-a699-c3ae89fcbac0), [foodpanda](https://mobbin.com/screens/07535f9a-17cc-450d-bfad-989aa742fb87) | Scan card with earn rate; stamp cards where the brand colour stays inside the card; Apple Wallet button; stamp grid. |
| Maps, iOS | [corner](https://mobbin.com/screens/9bbbf30d-7433-4955-8834-3a6c7fcf2a57), [Pangea](https://mobbin.com/screens/35d864c0-77f9-492e-8ffb-595593434807), [Places](https://mobbin.com/screens/a975205e-1d5d-48a8-b153-0ad30ccf710a), [komoot](https://mobbin.com/screens/8bebc13e-ce91-425e-9716-c2fa35db6a76) | Light map with round bubbles and lowercase labels (our foundations source); place sheet with chips; card carousel. |

Gap: two Mobbin searches for Arabic-script RTL app screens returned nothing usable. RTL is validated against our own
Urdu build (page `07 Dark and RTL`), not against external references.

---

## 4. Universal design structure

### 4.1 The shell (same for every trade)

Annotated frame: [Shell anatomy](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=11-918) (`11:918`).

```
+----------------------------------------------------------------------------------+
| sidebar 248        | top bar 56: location | search (Ctrl K) | language | help | bell | account |
| 1 shop switcher    +----------------------------------------------------------------+
| 2 TODAY            | page header: title 22 + one line      [secondary] [ONE black primary] |
|   Home Counter Inbox| numbers: one bordered block, 4 numbers, real deltas            |
| 3 RUN (per trade)  | Needs you (8 cols)                    | Up next (4 cols)       |
| 4 CUSTOMERS        |                                       |                        |
|   Customers Rewards Promos                                                          |
|   GROW Reports Street campaigns               | Quick actions (4 tiles)               |
|   SHOP Locations & QR kit, Settings                                                  |
| 5 setup progress   |                                                                |
+----------------------------------------------------------------------------------+
```

| Zone | Rule |
| --- | --- |
| Sidebar | `bg-sidebar`, 32 px rows, active = `sidebar-accent`. Section labels lowercase `Meta strong` muted. Needs-you badge only on rows that need the shop. `md` collapses to a 72 px rail, `< md` to a top bar plus bottom nav (Today, Counter, Customers, the trade's main module, More). In RTL the sidebar sits on the right (`side="right"`). |
| Sections | `today` (Home, Counter, Inbox), `run` (trade modules, 3 to 6), `customers` (Customers, Rewards, Promos), `grow` (Reports, Street campaigns; Ads when unlocked), `shop` (Locations & QR kit, Settings). Staff, Billing and Integrations live under Settings tabs so every trade fits in 16 rows at 900 px. Locked modules fold into one "More for {trade}" row at the end of `run`. |
| Top bar | Location switcher, search, language (en, hi, ur, pa), help, alerts, account. No page actions. |
| Page header | Title 22 semibold, one line of description, secondary action, **one** black primary. Optional underline tabs below. |
| Today | Four standard cards: **Needs you**, **Today's numbers**, **Up next**, **Quick actions**. Desktop order: numbers strip, then Needs you beside Up next, then Quick actions. **Mobile and DOM order: Needs you, numbers, Up next, Quick actions** (urgent first). |
| Needs you row | Dot, title, one line of context, age. Dot says who must act: `points` = the shop, now; `info` = waiting on a customer; `warning` = due soon; muted = FYI. Max 5. Every row opens the thing it names. |
| Dark mode | Same roles. Frame `Today / Café / 1440 / Dark` proves it. |

### 4.2 One structure, four trades

All eight frames use the same instances of `NavItem`, `Row`, `Stat`, `Button`, `Avatar`. Only data changes.

| Trade | Shop (fictional) | `run` section | Needs you example | Up next | Frames (1440, 390) |
| --- | --- | --- | --- | --- | --- |
| Café | Corner Bean Café | Orders (badge), Menu & catalog, Pickup slots | 3 new pre-orders | pickups | `7:4`, `7:327` |
| Salon and barber | Fade & Thread Barbers | Calendar, Walk-in line (badge), Services & prices | Jay is next in the walk-in line | appointments | `8:243`, `8:551` |
| Restaurant and kitchen | Amma's Kitchen | Orders (badge), Kitchen display, Menu & dietary, Tiffin, Catering, More for restaurants | 4 new orders, 2 older than 10 min | tiffin runs, pickups, catering | `8:709`, `8:1040` |
| Studio | Breathe Yoga Studio | Class schedule, Door check-in, Memberships & passes | 6:30 pm Vinyasa is full | classes with booked counts | `8:1196`, `8:1495` |

Long names wrap (Breathe Yoga Studio, Fade & Thread Barbers); they never truncate mid-word.
Other trades (grocer, pharmacy, pets, auto, repair) use the same shell; their modules in `nav.ts` map to `run`.
BIA, rep and admin consoles use the same sidebar and header; their sections replace `run` and `customers`.

### 4.3 Patterns (page `05 Patterns`)

| Pattern | Frame | Notes |
| --- | --- | --- |
| List + detail sheet | [`12:2`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=12-2) | Filter capsules, 40 px sticky header on `muted`, 56 px rows, row click opens a right panel (440 px) and the table drops to three columns. Panel footer holds the actions (Redeem, Add stamp). |
| Empty, loading, error, locked, no access, offline | [`12:349`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=12-349) | One sentence, one action, skeleton rows with real row height, "Try again", quiet "Coming with Plus. Notify me", who can change it, what is saved offline. |
| Settings form | [`14:143`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=14-143) | Underline tabs, panels with 2-column fields, switch rows, inline error with a sentence, **SaveBar** shown only while dirty. |
| Mobile bottom sheet | [`14:415`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=14-415) | 24 px top radius, grabber, same content as the desktop panel. |
| Mobile form | [`14:545`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=14-545) | Full-width fields, SaveBar pinned above the safe area. |

### 4.4 Counter, kiosk and pass (page `06 Counter and Pass`)

| Surface | Frame | Notes |
| --- | --- | --- |
| Staff counter (tablet, 1180x820) | [`15:2`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=15-2) | Chrome-free. Left: phone display and 72 px keypad with scan key and Look up. Right: customer, stamps, **one** decision (Redeem when a reward is ready; otherwise Add 1 stamp), terse confirmation toast ("Added 1 stamp. Sam now has 10."). Offline-ready status in the top strip. |
| Kiosk (customer-facing, 820x1180) | [`15:130`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=15-130) | 88 px keys, language chips (English, हिन्दी, اردو, ਪੰਜਾਬੀ), consent sentence under the button. |
| Customer pass (web, 390) | [`15:184`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=15-184) | Awning stripe, shop identity with open status, points ring and next reward, QR in a white block, **one** black Apple Wallet button, rewards with progress, recent visits, four tabs (Card, Rewards, Shops, Activity). |

### 4.5 Languages and RTL

* Frames: [`Today / Restaurant / 1440 / Urdu RTL`](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=9-473) (`9:473`) and `9:757` (390). Layout is mirrored, not just text-aligned: sidebar on the right, chevrons point left, badges at the end edge, columns reversed.
* Urdu uses Noto Nastaliq Urdu at roughly +2 px with line height about 2.0. Rows hug their content (never fixed 64 px) or Nastaliq glyphs collide. This was found and fixed while building the frame.
* Numerals stay Latin in all four locales (matches `LOCALES`); phone numbers stay `dir="ltr"` inside RTL.
* Hindi: Noto Sans Devanagari at about 1.65 line height. Punjabi: Noto Sans Gurmukhi (the Figma file uses Anek Gurmukhi because Noto Sans Gurmukhi was not installed in the Figma environment; code uses Noto per `locales.ts`).
* shadcn RTL gaps to handle by hand: Calendar, Pagination, Sidebar; portal content needs `dir`.

---

## 5. Tokens: v3 set and mapping

Figma collections: `Primitives` (36), `Color` (46 semantic variables, modes Light and Dark; the Foundations frame shows 40 chips, the six omitted `sidebar-*` companions mirror their non-sidebar twins), `Radius` (7), `Space` (10), `Layout` (9).
Text styles: 17 plus 2 Urdu extras. Effect styles: `Shadow/float`, `Shadow/sheet`. Frame: [Foundations](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=20-558) (`20:558`).
Every Figma variable carries `var(--name)` as its WEB code syntax and its v2 name in the description.

### 5.1 Colour roles

Mechanical rule: **rename, do not redesign.** `ll-` names stay as deprecated aliases in `theme.css` until the final sweep.

| shadcn variable | Light | Dark | v2 token it replaces | Tailwind utility (v2 to v3) |
| --- | --- | --- | --- | --- |
| `--background` | `#FFFFFF` | `#0E0D0C` | `--ll-color-bg` | `bg-bg` to `bg-background` |
| `--foreground` | `#0B0B0C` | `#F6F4F1` | `--ll-color-fg` | `text-fg` to `text-foreground` |
| `--card`, `--popover` | `#FFFFFF` | `#161412` | `surface`, `surface-raised` | `bg-surface` to `bg-card` |
| `--card-foreground`, `--popover-foreground` | `#0B0B0C` | `#F6F4F1` | `fg` | to `text-card-foreground` |
| `--primary` | `#0B0B0C` | `#F6F4F1` | `fg` used as fill | `bg-fg` to `bg-primary` |
| `--primary-foreground` | `#FFFFFF` | `#0E0D0C` | `bg` on an fg fill | `text-bg` to `text-primary-foreground` |
| `--secondary`, `--muted` | `#F6F4F1` | `#1C1A18` | `bg-subtle` | `bg-bg-subtle` to `bg-muted` |
| `--secondary-foreground` | `#0B0B0C` | `#F6F4F1` | `fg` | |
| `--muted-foreground` | `#6B6762` | `#A8A39C` | `fg-muted` | `text-fg-muted` to `text-muted-foreground` |
| `--accent` | `#EEEBE6` | `#262320` | `bg-muted` (**hover surface, not the orange**) | `bg-bg-muted` to `bg-accent` |
| `--accent-foreground` | `#0B0B0C` | `#F6F4F1` | `fg` | |
| `--destructive` | `#DC2626` | `#F87171` | `negative` | `text-negative` to `text-destructive` |
| `--border` | `#E7E3DD` | `#2C2926` | `line` | `border-line` to `border-border` |
| `--input` | `#8A8680` | `#7C7770` | `line-strong` (3:1 outline) | `border-line-strong` to `border-input` |
| `--ring` | `#0B0B0C` | `#F6F4F1` | `focus-ring` | `focus-ring` utility stays |
| `--subtle-foreground` | `#8A8680` | `#7C7770` | `fg-subtle` (placeholders, disabled) | `text-fg-subtle` to `text-subtle-foreground` |
| `--sidebar` | `#F6F4F1` | `#161412` | `bg-subtle` on the sidebar | new |
| `--sidebar-foreground`, `--sidebar-primary-foreground` etc. | as `foreground`, `primary-foreground` | | | new |
| `--sidebar-accent` | `#EEEBE6` | `#262320` | `bg-muted` active row | new |
| `--sidebar-border`, `--sidebar-ring` | as `border`, `ring` | | | new |
| `--chart-1` to `--chart-5` | `#0B0B0C`, `#FF5A1F`, `#6B6762`, `#2F7BF6`, `#16A34A` | `#F6F4F1`, `#FF7A45`, `#A8A39C`, `#4C8DF8`, `#22C55E` | `charts.ts` series | |
| **`--points`** | `#FF5A1F` | `#FF7A45` | `--ll-color-accent` | `bg-accent` (orange) to `bg-points` |
| `--points-text` | `#C2410C` | `#FF7A45` | `accent-text` | `text-accent-text` to `text-points-text` |
| `--points-soft` | `#FFF1EA` | `#2A1710` | `accent-soft` | `bg-accent-soft` to `bg-points-soft` |
| `--points-foreground` | `#FFFFFF` | `#0E0D0C` | `on-accent` | `text-on-accent` to `text-points-foreground` |
| `--success`, `--success-text` | `#16A34A`, `#15803D` | `#22C55E`, `#4ADE80` | `positive`, `positive-text` | `bg-positive` to `bg-success` |
| `--info`, `--info-text`, `--info-soft` | `#2F7BF6`, `#1D4ED8`, `#EFF4FF` | `#4C8DF8`, `#8DB2FF`, `#111C33` | `location`; the rest new | `bg-location` to `bg-info` |
| `--warning`, `--warning-text` | `#D97706`, `#B45309` | `#FBBF24`, `#FBBF24` | new | |
| `--paper` | `#FBF9F6` | `#0E0D0C` | new (pass, marketing canvas) | |
| `--qr-fg`, `--qr-bg` | `#0B0B0C`, `#FFFFFF` | same | same | unchanged: always black on white |

**Dropped:** the whole v1 block (`canvas`, `surface-*`, `brand*`, `on-brand*`, `vertical-*` tints, `neutral-subtle`, `success-subtle`, `warning-subtle`,
`danger-subtle`, `info-subtle`). They are deprecated today and resolve to v2 values; they go in the final sweep.

**Contrast (computed, WCAG 2.x ratios).** Add each pair to `contrastPairs` before use.

| Pair | Light | Dark |
| --- | --- | --- |
| `foreground` on `background` | 19.7 | 17.7 |
| `muted-foreground` on `background` / `muted` / `accent` | 5.6 / 5.1 / 4.7 | 7.8 / 6.9 (on `muted`) |
| `points-text` on `background` / `points-soft` | 5.2 / 4.7 | 7.5 (on `background`) / 6.6 (on `points-soft`) |
| `success-text` on `background` / `muted` | 5.0 / 4.6 | 11.1 |
| `info-text` on `background` / `info-soft` | 6.7 / 6.1 | 9.2 / 8.0 |
| `warning-text` on `background` | 5.0 | 11.6 |
| `destructive` on `background`; white on `destructive` | 4.8; 4.8 | 7.0 |
| `input` outline on `background` (needs 3:1) | 3.6 | 4.4 |
| Dots on `background` (need 3:1): points 3.1, success 3.3, info 4.0, warning 3.2 | all pass | |
| `subtle-foreground` on `background` | **3.6: fails 4.5.** Keep for disabled only. Use `muted-foreground` for placeholders so AA holds. | |

`--points` (3.1:1) stays for fills, dots and numbers 17 px and up; small orange text uses `--points-text`. Same rule as v2.

### 5.2 Geometry, type, depth, motion

| Group | v3 | Maps to |
| --- | --- | --- |
| Radius | `--radius: 0.625rem` (10 px). `sm` 6, `md` 8, `lg` 10, `xl` 14 (shadcn calc). **`--radius-card` 16, `--radius-sheet` 24**, `--radius-full`. | `rounded-input` to `rounded-lg`; `rounded-card`, `rounded-sheet` unchanged |
| Space | 4 px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Gutter 16 mobile, 32 desktop. | Tailwind spacing scale as-is |
| Layout | sidebar 248, rail 72, top bar 56, page max 1120, touch 44, counter key 72, kiosk key 88 | `--sidebar-width`, `--sidebar-width-icon`, `touch-target*` |
| Type | Inter 400/500/600, Bricolage Grotesque 700/800. Scale 11, 13, 15, 17, 22, 28, 40, plus kiosk 64. Hindi 15/25 (Noto Sans Devanagari). Urdu 17/34 and title 24/46 (Noto Nastaliq Urdu). Punjabi 15/25 (Noto Sans Gurmukhi). Tabular figures only on numbers. | Existing `text-*` utilities; add `font-ur`, `font-hi`, `font-pa` via `lang` selectors |
| Shadow | `float`: `0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.08)`; `sheet`: `0 -8px 32px rgba(0,0,0,.14)` | `shadow-float`, new `shadow-sheet` |
| Motion | `tap` 150 ms `cubic-bezier(0.16, 1, 0.3, 1)`; `sheet` 240 ms spring (damping 32, stiffness 320); stamp pop spring (22, 380, 0.8). Reduced motion removes pop and sheet travel. | `durations`, `easings`, `springs` in `scales.ts` (unchanged) |

### 5.3 `globals.css` target (workstream A)

```css
@import "tailwindcss";
@import "@ll/design-tokens/theme.css";   /* generated; see build-css.ts */

:root {
  --radius: 0.625rem;
  --background: #FFFFFF;   --foreground: #0B0B0C;
  --card: #FFFFFF;         --card-foreground: #0B0B0C;
  --popover: #FFFFFF;      --popover-foreground: #0B0B0C;
  --primary: #0B0B0C;      --primary-foreground: #FFFFFF;
  --secondary: #F6F4F1;    --secondary-foreground: #0B0B0C;
  --muted: #F6F4F1;        --muted-foreground: #6B6762;
  --accent: #EEEBE6;       --accent-foreground: #0B0B0C;   /* hover surface, NOT orange */
  --destructive: #DC2626;
  --border: #E7E3DD;       --input: #8A8680;   --ring: #0B0B0C;
  --sidebar: #F6F4F1;      --sidebar-foreground: #0B0B0C;
  --sidebar-primary: #0B0B0C;  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EEEBE6;   --sidebar-accent-foreground: #0B0B0C;
  --sidebar-border: #E7E3DD;   --sidebar-ring: #0B0B0C;
  --points: #FF5A1F;  --points-text: #C2410C;  --points-soft: #FFF1EA;  --points-foreground: #FFFFFF;
  --success: #16A34A; --success-text: #15803D;
  --info: #2F7BF6;    --info-text: #1D4ED8;    --info-soft: #EFF4FF;
  --warning: #D97706; --warning-text: #B45309;
  --paper: #FBF9F6;
  /* deprecated aliases, removed in the final sweep */
  --ll-color-bg: var(--background);  --ll-color-fg: var(--foreground);
  --ll-color-bg-subtle: var(--muted); --ll-color-bg-muted: var(--accent);
  --ll-color-fg-muted: var(--muted-foreground); --ll-color-line: var(--border);
  --ll-color-accent: var(--points); --ll-color-accent-text: var(--points-text);
}
:root[data-theme="dark"] {   /* generated twice: here, and inside @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } } */
  --background: #0E0D0C;  --foreground: #F6F4F1;
  --card: #161412;        --popover: #161412;   --card-foreground: #F6F4F1;
  --primary: #F6F4F1;     --primary-foreground: #0E0D0C;
  --secondary: #1C1A18;   --muted: #1C1A18;     --muted-foreground: #A8A39C;
  --accent: #262320;      --destructive: #F87171;
  --border: #2C2926;      --input: #7C7770;     --ring: #F6F4F1;
  --sidebar: #161412;     --sidebar-accent: #262320;  --sidebar-border: #2C2926;
  --points: #FF7A45;  --points-text: #FF7A45;  --points-soft: #2A1710;  --points-foreground: #0E0D0C;
  --success: #22C55E; --success-text: #4ADE80;
  --info: #4C8DF8;    --info-text: #8DB2FF;     --info-soft: #111C33;
  --warning: #FBBF24; --warning-text: #FBBF24;
  --paper: #0E0D0C;
}
@theme inline {
  --color-background: var(--background);  --color-foreground: var(--foreground);
  --color-card: var(--card);              --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);        --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);        --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);    --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);            --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);          --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);          --color-input: var(--input);   --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);        --color-sidebar-accent: var(--sidebar-accent);
  --color-points: var(--points);          --color-points-text: var(--points-text);
  --color-points-soft: var(--points-soft); --color-points-foreground: var(--points-foreground);
  --color-success: var(--success);        --color-info: var(--info);     --color-warning: var(--warning);
  --radius-sm: calc(var(--radius) - 4px); --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);             --radius-xl: calc(var(--radius) + 4px);
  --radius-card: 16px;                    --radius-sheet: 24px;
}
```

The real file is generated by `packages/design-tokens/src/build-css.ts` from `colors.ts`; this block is the
target output, not a hand-edited file. The native theme (`apps/mobile/src/theme`) consumes the same roles from
`colors.ts`; names there change only in the final sweep.

---

## 6. Component map

42 component files plus the `index.ts` barrel (43 files) in `apps/web/src/components/ui`. Figma copy of this table:
[Component map](https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA?node-id=21-15) (`21:15`). "WS" = owning workstream.

| # | Today | v3 source | Reason / note | WS |
| --- | --- | --- | --- | --- |
| 1 | AppShell | shadcn `Sidebar` (`SidebarProvider`, `SidebarMenu`, `SidebarInset`) + `Sheet` on phones; custom bottom nav | Shell structure is ours (five sections); `side="right"` for RTL; Sidebar RTL needs manual pass | B |
| 2 | Avatar | shadcn `Avatar` | `ShopMark` keeps brand colour and initials fallback | C |
| 3 | Badge | shadcn `Badge` (outline) + custom `StatusDot` | Status is dot + word, never a filled chip | C |
| 4 | Banner | shadcn `Alert` | One quiet block, tone on the icon only | C |
| 5 | Button | shadcn `Button` | Variants default, outline, ghost, destructive; add sizes `counter` (72) and `kiosk` (88); remove the `accent` variant | A |
| 6 | Card | shadcn `Card` | Hairline, `rounded-card`, no shadow | A |
| 7 | CategoryIcon | Keep custom | Flat-3D objects from design-tokens assets | F |
| 8 | Checkbox | shadcn `Checkbox` | | D |
| 9 | Chip | shadcn `ToggleGroup` (outline, `rounded-full`) | `floating` variant keeps the single float shadow | D |
| 10 | CountUp | Keep custom | About 40 lines, reduced-motion aware; no dependency worth adding | C |
| 11 | DataTable | shadcn `Table` + TanStack Table v9; ReUI Data Grid for large lists | Keep `loading`, `error`, `empty` props | C |
| 12 | DensityGauge | Keep custom (admin, rep) | Revisit Bklit gauge after the spike | C |
| 13 | DiscountCard | Keep custom | Live clock so screenshots cannot be reused | F |
| 14 | EmptyState | shadcn `Empty` | One sentence, one action | C |
| 15 | Keypad | Keep custom | 72 and 88 px keys, haptics; no equivalent | E |
| 16 | Layout (`Container`, `PageHeader`, `EnvironmentStrip`) | Keep custom on shadcn `Separator` | Page header pattern is ours | B |
| 17 | Link (`TextLink`) | Keep custom | Thin Next `Link` wrapper, hairline underline | A |
| 18 | LockedFeature | Keep custom on shadcn `Item` | Domain rule: never "Upgrade", never a red lock | B |
| 19 | MemberQr | Keep custom | Always black on white | E |
| 20 | Modal | shadcn `Dialog`, `AlertDialog`, `Drawer` | Sheet on desktop, bottom Drawer on phones | D |
| 21 | OrderTracker | ReUI `Stepper` in a custom wrapper | Large title and order number stay ours | C |
| 22 | OtpField | shadcn `InputOTP` | | D |
| 23 | PhoneField | Keep custom on shadcn `InputGroup` | Country prefix, E.164, `dir="ltr"` in RTL | D |
| 24 | PointsRing | Keep custom | Brand object; optional Bklit Ring for analytics only | E |
| 25 | ProgressBar | shadcn `Progress` | | C |
| 26 | PromoCard | Keep custom on shadcn `Card` | Sponsored labelling rules | F |
| 27 | QrCode | Keep custom | Fixed colours and quiet zone for scanners | E |
| 28 | RedeemCode | Keep custom | Mono code and countdown | E |
| 29 | RewardCard | Keep custom on shadcn `Card` | Progress and ready state | F |
| 30 | SegmentedControl | shadcn `ToggleGroup` (single) | Ranges and views | D |
| 31 | Select | shadcn `Select` + `Combobox` | Combobox for long lists | D |
| 32 | ShopTile | Keep custom | Avatar plus brand colour rules | F |
| 33 | Skeleton | shadcn `Skeleton` | Rows match real row heights | C |
| 34 | Spinner | shadcn `Spinner` | Inside buttons only | C |
| 35 | StampCard | Keep custom | Stamp pop, haptics | E |
| 36 | StatTile | Keep custom on shadcn `Card` (`StatBlock`) | One bordered block, hairline dividers | C |
| 37 | Switch | shadcn `Switch` | | D |
| 38 | Tabs | shadcn `Tabs` | Underline style, RTL aware | D |
| 39 | TextField | shadcn `Field` + `Input`, `InputGroup`, `Textarea` | Label, hint, error wired with `aria-describedby` | D |
| 40 | Timeline | ReUI `Timeline` | Customer ticket log | C |
| 41 | Toast | shadcn `Toast` (spike against Sonner) | Pick one in A | D |
| 42 | VerticalIcon | Keep custom | Maps trade to Lucide icon and category object | F |
| 43 | index.ts | Keep | Stable import path for 307 files | A |

Tally of the 42 components: 20 from shadcn core (`DataTable` also uses ReUI Data Grid for large lists), 2 from ReUI (`OrderTracker`, `Timeline`), 1 spike (`Toast`), 19 kept custom (several built on shadcn `Card`, `Item`, `InputGroup`).

**Dashboard kit** (`components/dashboard/kit.tsx`, 627 lines): split mechanically in workstream A, then migrate.

| kit export | v3 | New file | WS |
| --- | --- | --- | --- |
| `PageHeader`, `Section`, `Panel`, `QuietLink`, `QuietButton`, `BackLink`, `ToolbarButton`, `Kbd` | custom on shadcn `Card`, `Button`, `Kbd` | `kit/page.tsx` | B |
| `StatBlock`, `StatTile`, `StatGrid`, `RowList`, `Row`, `DefList`, `Dot`, `StatusDot`, `StatusPill`, `Tag`, `Meter`, `Table*`, `Empty`, `EmptyState`, `SkeletonRows`, `ErrorLine` | shadcn `Item`, `Table`, `Badge`, `Progress`, `Empty`, `Skeleton` | `kit/data.tsx` | C |
| `Capsules`, `Segmented`, `PageTabs`, `Tabs`, `TabPanel`, `SidePanel`, `SaveBar` | shadcn `ToggleGroup`, `Tabs`, `Sheet`; SaveBar custom | `kit/forms.tsx` | D |

`kit.tsx` itself becomes `export * from "./kit/page"; export * from "./kit/data"; export * from "./kit/forms";` so no import changes.

---

## 7. Component and pattern purposes (why each exists)

Every component earns its place by a job. Anything without one is removed in the sweep.

| Job | Component | Test |
| --- | --- | --- |
| Tell staff what to do now | Needs you row, `StatusDot` | Row opens the thing it names |
| Show how the day is going | `StatBlock` (4 numbers) | Every number is real data or the card is hidden |
| Take a stamp in one step | Counter, `Keypad`, `StampCard` | Under 5 seconds from scan to confirmation |
| Make the next decision obvious | One black `Button` per page | Axe-free and exactly one primary in the DOM |
| Show where you are | Sidebar sections, page header | Same eleven zones on every trade |
| Fix a mistake | `SaveBar`, undo toast, confirm dialog | Destructive actions name what will happen |
| Explain a state | `Empty`, error, locked, offline | One sentence and one action |
| Work in another language | Language switcher, locale fonts, RTL mirroring | Each locale renders without clipping |

---

## 8. Migration plan

### 8.1 Sequencing

```
A foundation (gate) -----------------------------------------> final sweep (A)
     |
     +--> B shell + nav + Today
     +--> C data display
     +--> D forms + overlays
     +--> E counter + kiosk
     +--> F customer pass + mobile token parity
     +--> G marketing
```

* **Gate:** A lands first in two small PRs. **A1** tokens (new roles, aliases kept, contrast tests). **A2** shadcn install into
  `components/primitives/**`, `cn` package, lint, and the mechanical `kit.tsx` split. B to G can start designing against Figma immediately and merge after A2.
* **Why `components/primitives`:** shadcn writes lower-case files (`button.tsx`). The repo has `Button.tsx`. On a case-insensitive
  filesystem they collide. Set `components.json` `aliases.ui` to `@/components/primitives` and make each `ui/*.tsx` file a thin wrapper that re-exports or composes the primitive.
* **Compat rule:** old token names and `kit` exports keep working until the final sweep. No stream renames a name it does not own.
* **Messages:** `packages/shared/src/i18n/messages/{en,hi,ur,pa}.ts` are shared. Each stream adds keys only under its own prefix
  (`shell.*`, `data.*`, `forms.*`, `counter.*`, `pass.*`, `site.*`), appended in sorted order; run `pnpm l10n:scan` before opening a PR.
* **Barrel:** `ui/index.ts` is frozen. No stream adds or removes exports (A owns it).
* **Order of work inside a stream:** wrapper first (same props, new internals), then pages, then delete dead code.

Sizing is relative (S about 2 to 3 days, M about 1 week, L about 2 weeks, for one engineer).

### 8.2 Workstreams

#### A. Foundation: tokens, shadcn install, guardrails (gate) · size M

| | |
| --- | --- |
| **Owns** | `packages/design-tokens/**` (colors, scales, css, tests, charts); `apps/web/components.json` (new); `apps/web/src/components/primitives/**` (new, shadcn output); `apps/web/src/lib/cn.ts`; `apps/web/src/app/globals.css` and `layout.tsx` font setup (add Noto fonts); `apps/web/eslint.config.*` (add the `@shadcn/lint` block); `apps/web/src/components/ui/{Button,Card,Link,index}.ts(x)`; `apps/web/src/components/dashboard/kit.tsx` and new `kit/` folder (split only); `docs/design/foundations.md`, `system.md`, `brand.md` updates; final sweep PR |
| **Does not touch** | any page, any other `ui/*` file, `apps/mobile/**` (tokens package only) |
| **Steps** | 1. A1: add v3 roles to `colors.ts` and `build-css.ts`, keep every v2 name as an alias, extend `contrastPairs`. 2. A2: `pnpm dlx shadcn@latest init -t next --monorepo --rtl` (Base UI), set `aliases.ui`, add the base set (button, card, badge, alert, avatar, skeleton, spinner, empty, item, separator, tooltip, progress, sidebar, sheet, drawer, dialog, alert-dialog, popover, command, tabs, toggle, toggle-group, field, input, input-group, input-otp, textarea, select, combobox, checkbox, switch, radio-group, table, chart, toast or sonner, direction). 3. `shadcn migrate cn`. 4. Add `@shadcn/lint` (`no-raw-colors`, `no-arbitrary-values`, `no-inline-styles`) with `themeImports` for `@ll/design-tokens`; start as warnings. 5. Split `kit.tsx` into `kit/{page,data,forms}.tsx` plus barrel (no behaviour change). 6. Spike (1 day each, written up in `docs/design/v3-spikes.md`): Toast vs Sonner; Bklit versions against Next 16.4 and React 19.3; ReUI Data Grid with 10,000 rows. 7. Final sweep after B to G: rename remaining v2 classes, delete aliases and the v1 block, switch lint to errors. |
| **Acceptance** | `pnpm --filter @ll/design-tokens test` green with every pair in section 5.1 asserted; `pnpm typecheck`, `pnpm lint`, `pnpm test` green; `next build` green; `npx shadcn@latest add button` writes to `components/primitives`, not `ui`; `kit.tsx` diff is moves only (verified by a script that compares exported names before and after); warm neutrals visible, no other visual change (Playwright screenshot diff of dashboard Today and counter under a 1% pixel threshold except the colour shift); `@shadcn/lint` runs in CI; dark mode and `data-theme` still switch. |

#### B. Shell, navigation, Today home · size L

| | |
| --- | --- |
| **Owns** | `apps/web/src/lib/dashboard/nav.ts` and its tests; `components/ui/{AppShell,Layout,LockedFeature}.tsx`; `components/dashboard/{MerchantShell,Shell,ConsoleShell,CommandMenu,AccountMenu,ShopMark,PageStates,FeatureGate,FeatureTeaser,Checklist,MerchantContext}.tsx`; `components/dashboard/home/**`; `kit/page.tsx`; `app/(dashboard)/m/[merchantId]/{layout,page}.tsx`; shell layouts of `app/(admin)`, `app/(bia)`, `app/(rep)` |
| **Does not touch** | list and form pages, `kit/data.tsx`, `kit/forms.tsx`, counter, pass |
| **Steps** | 1. Rewrite `buildMerchantNav` so every trade returns `{ today, run, customers, grow, shop }` in that order; restaurant and grocery navs become `run` contributions. 2. Rebuild AppShell on shadcn Sidebar with RTL (`side`), rail at `md`, bottom nav under `md`. 3. Top bar with language switcher bound to `LOCALES`. 4. Today home: `NeedsYou`, `TodayNumbers`, `UpNext`, `QuickActions` cards fed by a per-trade `TodayConfig` (rows come from existing API data; no new endpoints). 5. `LockedFeature` and "More for {trade}" fold. 6. BIA, rep and admin shells adopt the same sidebar with their own sections. |
| **Acceptance** | Snapshot test over fixtures for café, salon, restaurant, studio, grocer, pharmacy: section keys and order identical, only `run` differs; Today renders four cards in the Figma DOM order at 390 and the grid order at 1440; Playwright screenshots at 1440 and 390 for four trades match frames `7:4` to `8:1495` within layout tolerance; Urdu run mirrors (sidebar right, chevrons flip) and passes an axe check; keyboard: skip link, arrow keys in sidebar, `aria-current="page"`; one black primary per page header (test counts `button[data-variant=default]` in the header); no new API calls. |

#### C. Data display: tables, stats, calendars, boards, charts · size L

| | |
| --- | --- |
| **Owns** | `components/ui/{Avatar,Badge,Banner,CountUp,DataTable,DensityGauge,EmptyState,OrderTracker,ProgressBar,Skeleton,Spinner,StatTile,Timeline}.tsx`; `kit/data.tsx`; `components/dashboard/{Charts,NetworkGauges}.tsx`; `components/dashboard/{calendar,queue,reports,customers,admin,bia}/**` (except `queue/DoorTablet.tsx`); page files under `app/(dashboard)/m/[merchantId]/{orders,customers,reports,calendar,queue,invoices,payouts,tickets,classes (not door)}/**`; list pages of `app/(admin)` and `app/(bia)` |
| **Does not touch** | forms, shell, counter, pass |
| **Steps** | 1. Table on shadcn Table + TanStack v9; row click opens the Sheet (pattern `12:2`). 2. ReUI Data Grid for Customers and imports; keep server pagination. 3. Calendar on ReUI Event Calendar: day, week, agenda; block z-order above the now line; minimum block height 24 px; RTL by hand. 4. Walk-in line and kitchen tickets on ReUI Kanban (spike first). 5. Charts on shadcn Chart: thin `chart-1` line, `chart-2` only for the highlighted series. 6. StatBlock, Row, DefList, StatusDot on shadcn Item and Badge. 7. Empty, loading, error for every list (pattern `12:349`). |
| **Acceptance** | Each list has all three states and a Playwright test that forces each; 10,000-row Customers scrolls at 60 fps in a trace budget set by the spike; keyboard: arrow keys move rows, Enter opens the panel, Esc closes and restores focus; calendar: 15-minute block is tappable, now line never covers a title (regression for audit S17); chart colours only from `--chart-*`; no `color` literals (`@shadcn/lint` clean in owned files); screenshot parity with frames `12:2`, `12:349`; unit and API tests unchanged. |

#### D. Forms, settings and overlays · size L

| | |
| --- | --- |
| **Owns** | `components/ui/{Checkbox,Chip,Modal,OtpField,PhoneField,SegmentedControl,Select,Switch,Tabs,TextField,Toast}.tsx`; `kit/forms.tsx`; `components/dashboard/{HoursEditor,PromoEditor,ImportWizard,ConfirmDialog,onboarding,program}/**`; `components/auth/**`; page files under `app/(dashboard)/m/[merchantId]/{settings,setup,program,promos,discount-cards,locations,staff,billing,integrations,catalog,services,slots,messages}/**` and login and signup pages |
| **Does not touch** | tables, shell, counter, pass |
| **Steps** | 1. `Field` + `Input` + `InputGroup` wrappers with the same props as `TextField` and `PhoneField`. 2. Select, Combobox, Switch, Checkbox, Tabs, ToggleGroup. 3. `Modal` to Dialog, AlertDialog and Drawer; `SidePanel` to Sheet. 4. SaveBar (custom): visible only when dirty, pinned above the safe area on phones. 5. Settings pattern: tabs, panels, inline errors after first submit. 6. Surface "Tax is not set up" in setup and in Needs you (audit S5). 7. A disabled control always links to what it needs (audit P7). |
| **Acceptance** | Every field has label, hint and error wired through `aria-describedby`; error shows after first submit, not on load; `PhoneField` keeps its existing unit tests and stays `dir="ltr"` inside an RTL page; SaveBar test: appears on change, Discard restores, Save disables while pending; dialogs trap focus and restore it; Toast live region announces; Urdu form frames pass axe and show no clipped labels; 44 px minimum hit area asserted for controls; screenshots match `14:143`, `14:415`, `14:545`. |

#### E. Counter and kiosk · size M

| | |
| --- | --- |
| **Owns** | `components/ui/{Keypad,MemberQr,QrCode,RedeemCode,StampCard,PointsRing}.tsx`; `components/dashboard/counter/**`; `components/dashboard/queue/DoorTablet.tsx`; `app/(kiosk)/**`; `app/(dashboard)/m/[merchantId]/counter/**`; `app/(dashboard)/m/[merchantId]/classes/door/**` |
| **Does not touch** | shell chrome, pass pages (consume `StampCard` and `PointsRing` read-only; changes go through E) |
| **Steps** | 1. Counter tablet layout from `15:2`: left pane lookup, right pane customer, one decision. 2. Button `counter` size and Keypad keys at 72; kiosk at 88. 3. Terse confirmation toast and Undo for 10 s (already in product; keep). 4. Offline-ready indicator and saved-on-device copy. 5. Language chips on the kiosk. 6. Stamp pop and reward check with reduced-motion fallback. |
| **Acceptance** | Playwright flow scan or phone to confirmation in under 5 seconds on the seeded café, 3 runs, no flakes; hit areas measured: keys at least 72 px (counter) and 88 px (kiosk) with 8 px gaps; QR always black on white in dark mode (screenshot); no marketing or tips on counter screens (test asserts none of the page-header or banner components render); existing counter and e2e tests pass; Urdu kiosk renders without clipping; reduced motion removes pop. |

#### F. Customer pass and mobile token parity · size M

| | |
| --- | --- |
| **Owns** | `components/ui/{CategoryIcon,DiscountCard,PromoCard,RewardCard,ShopTile,VerticalIcon}.tsx`; `components/pass/**`; `components/restaurant/**`, `components/grocery/**`, `components/site/**` (customer-facing); `app/(pass)/**`; `apps/mobile/src/theme/**` (token names only; component files in `apps/mobile/src/ui` are untouched) |
| **Does not touch** | dashboard, counter internals |
| **Steps** | 1. Pass shell from `15:184`: awning stripe, identity, points ring, QR block, wallet buttons, rewards with progress, recent visits, four tabs. 2. Language switcher on every pass page. 3. `paper` canvas. 4. Brand colour only inside `ShopTile`. 5. Native theme consumes the new roles from `@ll/design-tokens` (names and values), with a test that web and native values match. |
| **Acceptance** | 390 px screenshots match `15:184`; no horizontal scroll at 320 px; one black button per screen; Urdu pass mirrors and passes axe; contrast pairs from section 5.1 asserted for `ShopTile` initials on brand colours (brand colour that fails 4.5:1 gets black or white text automatically); mobile `pnpm --filter mobile test` green and a token-parity test proves values equal web values; wallet button and QR unchanged functionally. |

#### G. Marketing site · size M

| | |
| --- | --- |
| **Owns** | `app/(marketing)/**`, `app/opengraph-image.tsx`, `app/icon.svg`, `components/marketing/**`, `apps/web/public/brand/**`, `apps/web/public/categories/**` |
| **Does not touch** | any `ui/*` file (consume only), dashboard, pass |
| **Steps** | 1. `paper` canvas and the awning stripe (one per page). 2. Category objects as the only illustration; photo slots filled from the shot list (section 3). 3. Landing pages per audience keep their routes; copy in en, hi, ur, pa with `dir`. 4. Pricing and bias pages restyled with shadcn Card and Button. 5. OG images regenerated with the wordmark. |
| **Acceptance** | Lighthouse accessibility 95 or higher on home, pricing and one audience page in all four locales; LCP under 2.5 s on mobile throttling on home; Urdu pages mirror and have no overlapping text; no raw hex in owned files; images have alt text or are marked decorative; the awning stripe appears once per page. |

### 8.3 Collision map

| Shared file | Owner | Rule for everyone else |
| --- | --- | --- |
| `ui/index.ts`, `kit.tsx`, `globals.css`, `components.json` | A | Request changes in the A PR queue |
| `packages/shared/src/i18n/messages/*.ts` | all | Own prefix only; sorted append; run `l10n:scan` |
| `lib/dashboard/nav.ts` | B | C to E register pages via B's `run` contribution API, not by editing the file |
| `kit/*.tsx` | B, C, D (one file each) | No cross-file edits |
| `components/ui/*.tsx` | by table in section 6 | One owner per file |
| `apps/mobile/**` | F (theme only) | Mobile components follow after web, separate effort |

### 8.4 Definition of done (every stream)

1. Props of every wrapper unchanged (type test or `tsc` against existing call sites).
2. No raw colours or arbitrary values in owned files (`@shadcn/lint` clean).
3. Light, dark and one RTL screenshot attached to the PR next to the Figma node.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm l10n:scan` green; e2e for the stream's flows green.
5. No new dependency except those named in section 2.3.

### 8.5 Risks and open questions

| Risk | Mitigation |
| --- | --- |
| Base UI differs from Radix (`asChild` becomes `render`, some behaviour) | Pin one base; use the official migration skill only if we ever switch; do not mix bases per component |
| TanStack Table v9 and Base UI 1.x are recent | Both used in ReUI and the Kiranism starter at the versions above; A runs the spike before C starts |
| ReUI publishes no GitHub Releases and its Pro tier is paid | Copy-and-own the free components; record the commit pinned in `components.json`; do not import Pro blocks |
| Bklit versions are not stated | Spike before use; fallback is Recharts via shadcn Chart and the existing `DensityGauge` |
| RTL gaps in shadcn Calendar, Pagination, Sidebar | Explicit RTL acceptance checks in B and C |
| Nastaliq line height clips fixed-height rows | Rows hug content; tested with the Urdu frames |
| `subtle-foreground` fails AA for text | Use only for disabled; placeholders use `muted-foreground` |
| Large mechanical diffs | A splits into A1, A2 and a last sweep; no stream renames another stream's names |
| Figma environment lacked Noto Sans Gurmukhi | Figma shows Anek Gurmukhi; code uses Noto Sans Gurmukhi from `locales.ts` |
| Licence facts not re-verified: shadcn-ui/ui (MIT assumed), square-ui (`LICENSE.md` unread), openstatus/data-table-filters, evilcharts, Kiranism (no `licence` field) | Legal check before copying any code from those; we only copy from ReUI (MIT) and shadcn |

---

## 9. Figma index

File: https://www.figma.com/design/tat1lWRQIJ2Q3Al98pWOtA. Pages and frames (node id, size):

| Page | Frame | Node | Size |
| --- | --- | --- | --- |
| `Cover` | Cover | `21:195` | 1600 x 1126 |
| `01 Mood board` | Mood board / main street (sections `19:3`, `19:64`, `19:114`, `19:293`, `19:346`, `19:489`, `19:540`, `19:567`) | `19:2` | 2400 x 9281 |
| `02 Foundations` | Foundations / tokens v3 (40 colour chips, radius, space, layout, shadows, text styles) | `20:558` | 2200 x 2767 |
| `03 Components` | Icons (42 components); Button (32 variants); NavItem; Status; Chip; Avatar; Input; Stat; Row; Keypad key; Stamp; PointsRing; MemberQr; Component map | `3:2`; `4:266`; `4:295`; `4:314`; `4:319`; `5:18`; `5:39`; `5:52`; `5:85`; `5:94`; `5:99`; `5:115`; `5:116`; `21:15` | |
| `04 Shell and Today` | Shell anatomy | `11:918` | 2020 x 904 |
| | Today / Café / 1440, 390 | `7:4`, `7:327` | 1440 x 900, 390 x 1367 |
| | Today / Salon / 1440, 390 | `8:243`, `8:551` | |
| | Today / Restaurant / 1440, 390 | `8:709`, `8:1040` | |
| | Today / Studio / 1440, 390 | `8:1196`, `8:1495` | |
| `05 Patterns` | List + detail sheet | `12:2` | 1440 x 900 |
| | Empty, loading, error | `12:349` | 1240 x 742 |
| | Settings form | `14:143` | 1440 x 1160 |
| | Mobile list + bottom sheet | `14:415` | 390 x 844 |
| | Mobile form + SaveBar | `14:545` | 390 x 1100 |
| `06 Counter and Pass` | Counter, staff tablet | `15:2` | 1180 x 820 |
| | Kiosk | `15:130` | 820 x 1180 |
| | Customer pass, web | `15:184` | 390 x 1317 |
| `07 Dark and RTL` | Café 1440 Dark | `9:2` | 1440 x 900 |
| | Restaurant 390 Dark | `9:317` | 390 x 1371 |
| | Restaurant 1440 Urdu RTL | `9:473` | 1440 x 1180 |
| | Restaurant 390 Urdu RTL | `9:757` | 390 x 1745 |

Components are real Figma components with variants and variable bindings (colour, radius, space). Icons are Lucide vectors recoloured per use.
Mobbin screenshots are imported as images (PNG; WebP did not render in Figma exports); the product screenshots stay on Mobbin and are linked by URL.
Photo slots are placeholders; no photography was generated.

Review loop used: every frame was screenshotted, inspected, and fixed (clipped Nastaliq rows, overflowing Row text, wrap, top-bar overflow with a side panel, progress bar overflow, anatomy badges over labels, caption wrapping, foundation overflow, SVG sizing, WebP rendering).
