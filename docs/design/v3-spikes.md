# Design v3: spikes (workstream A, step 6)

Owner: workstream A. Date: 2026-10-28. Plan: [v3-strategy.md](./v3-strategy.md) section 8.2 A step 6. Each spike ran for about a
day of work, against **our** versions (Next 16.4.2, React 19.3.1, Tailwind 4.3.3, TypeScript 5.9.3, Node 22).

**Method and limits.** Browser numbers come from headless Chromium (Playwright 1.56.1) on a shared cloud VM, production builds
(`next build` then `next start`, or an esbuild production bundle where stated), median of 5 runs unless a row says otherwise. "4x CPU"
is Chrome DevTools CPU throttling (rate 4), a rough stand-in for a mid-range phone, not a real device. Sizes are gzip level 9 of the
JS the browser downloaded. Absolute milliseconds will differ on your machine; compare rows against each other, and re-run the scripts
described under each spike before you quote a number in a PR. Scratch projects are not committed (the Next scratch app was created
with `shadcn init -t next -b base --rtl`, which pins exactly our Next and React versions).

Decisions in short:

| Spike | Decision |
| --- | --- |
| Toast vs Sonner | **shadcn Toast (Base UI).** No new dependency; Sonner adds two and a theme provider we cannot use. |
| Bklit | **Do not adopt for v3 now.** It builds and renders on our stack but is +124 KB gzip for four charts, hydrates wrongly without `ssr:false`, and overwrites `lib/utils.ts`. Keep `DensityGauge`, `Heatmap.tsx`, and shadcn Chart. Revisit after C ships. |
| ReUI Data Grid, 10,000 rows | **Adopt for Customers and imports, virtualised.** 58 to 60 fps at 1x CPU, 26 to 32 fps at 4x CPU. Budget below. |

---

## 1. Toast vs Sonner

**Question.** Strategy section 2.3: "shadcn Toast (Jul 2026) vs Sonner: pick one in workstream A, do not ship both."

**What was compared.**

* Current: `components/ui/Toast.tsx` (ours, 67 lines, one toast at a time, role `status` or `alert`).
* shadcn Toast: `shadcn add toast` (registry item `toast`, built on `@base-ui/react/toast`, depends on `@base-ui/react` and `button` only).
* Sonner: `shadcn add sonner` (registry item `sonner`, depends on `sonner` and `next-themes`).

**Numbers.**

| | Current | shadcn Toast (Base UI) | Sonner (`sonner` 2.0.8 + wrapper) |
| --- | --- | --- | --- |
| New dependencies | 0 | **0** (`@base-ui/react` is already in) | **2** (`sonner`, `next-themes`) |
| Standalone bundle, gzip | 0.8 KB | 39.8 KB | 10.4 KB (includes `next-themes`) |
| Marginal bundle when Dialog, Popover, Tooltip, Select, Button primitives are already loaded, gzip | 0.8 KB | **+8.0 KB** (94.0 vs 86.0 KB) | 10.4 KB (nothing is shared) |
| One toast: `add()` to first paint | 3.2 ms | 17.3 ms | 11.2 ms |
| 50 toasts added in a loop, then settled | 3.4 ms | 44.3 ms | 101.6 ms |
| DOM nodes for 1 toast / 51 toasts | 3 / 2 (replaces) | 4 / 154 | 5 / 155 |
| Calls from outside React | no (context hook) | **yes** (`toast.add()` on a manager) | yes |
| Live region | `role=status aria-live=polite` (`alert` for errors) | viewport `role=region aria-live=polite aria-label=Notifications`, each toast `role=dialog aria-modal=false`, **F6** jumps to the region | `section aria-label="Notifications alt+T" aria-live=polite` |
| Action button (our Undo) | yes | yes (`actionProps`) | yes |
| RTL | uses logical classes | generated file already uses `start/end` utilities; **swipe-to-dismiss direction is physical** (left/right) | physical `position` prop |
| Themes with our `data-theme` | n/a | yes, tokens only | **no**: wrapper reads `useTheme()` from `next-themes`, which toggles a class, not `data-theme` |

How the numbers were taken: esbuild production bundles (react and react-dom external) for the size rows; a Chromium page per
library that adds toasts through each library's public API and times to the next animation frame (5 runs, median) for the timing
rows. The 50-toast row is a stress case, not a real flow: nobody queues 50 toasts, and Base UI's `limit` option hides extras with
`data-limited` but keeps their nodes.

**Decision: shadcn Toast on Base UI.**

1. Zero new dependencies and +8 KB gzip once the other Base UI primitives are on the page (they share the same internals).
2. Sonner's wrapper needs `next-themes`, and our dark mode is `data-theme` plus the OS setting (`theme.css`). Using it means a second theming system.
3. A toast manager that works outside React lets non-React code (the API client, the offline queue) raise toasts, which the counter needs for "Saved on this device".
4. Sonner is faster for bursts (not our case) and 2 KB heavier; neither matters at one toast at a time.

**For workstream D (owns `ui/Toast.tsx`).** Keep `useToast()` and `ToastProvider` exactly as they are (102 files import them) and swap the
inside to `components/primitives/toast.tsx`: call `toast.close()` then `toast.add({ title, actionProps, timeout, type })` so "one visible, new
replaces old" still holds; keep the 4000 ms default and 8000 ms with an action; map `tone: "error"` to `type: "error"` and keep the assertive live region
for errors (Base UI's viewport is `polite`; a toast added with `priority: "high"` is announced assertively). The black pill look is ours: restyle the primitive's classes in the wrapper, do not fork it.
Add the F6 hint to the help overlay.

---

## 2. Bklit UI against Next 16.4 and React 19.3

**Question.** Strategy section 2.2 marked Bklit's React, Tailwind and Next versions "not stated". Does it install, build and render on ours, and what does it cost?

**Setup.** Fresh `shadcn init -t next -b base --rtl` project (Next 16.4.2, React 19.3.1, Tailwind 4). `shadcn add @bklit/ring-chart @bklit/gauge-chart @bklit/heatmap-chart @bklit/line-chart`
(the `@bklit` registry resolves through shadcn's directory to `https://ui.bklit.com/r/{name}.json`, which redirects to `bklit.com`). One page renders the four charts with sample data.

**Versions and peers (from the registry items and npm).**

| Package | Version installed | Peer range for react |
| --- | --- | --- |
| `@visx/{curve,event,grid,group,heatmap,responsive,scale,shape}` | 4.0.0 | `^18 \|\| ^19` |
| `motion` | 14.7.1 | `^18 \|\| ^19` |
| `@number-flow/react` | 0.6.2 | `^18 \|\| ^19` |
| `d3-array`, `d3-shape` | 3.2.4, 3.2.0 | none |
| `tailwind-merge`, `clsx` | 3.7.0, 2.1.1 | none |

All peers accept React 19.3.1; the registry states no Next or Tailwind version, and the components use no Next API (they are `"use client"` SVG).

**Results.**

| Check | Result |
| --- | --- |
| `shadcn add` | 116 files, about 21,500 lines copied into `components/charts/` |
| `next build` | **Fails type-check at first**: the registry items do not declare `@types/d3-shape` or `@types/d3-array`. Passes after adding both as dev dependencies. |
| Required props | `RingChart` and `HeatmapChart` need `children` (you compose `<Ring/>`, `<RingCenter/>`, `<HeatmapCells/>`); not a drop-in single component |
| SSR | **React error #418 (hydration mismatch) on the server-rendered page**, in a production build, both LTR and RTL. Dev build says the server HTML differs from the client. Clean (no console errors or warnings) when the page loads the charts with `next/dynamic(..., { ssr: false })` |
| Render | 4 SVGs, 73 paths, 172 rects; animations run about 1.1 to 1.6 s on mount |
| JS added to a page, gzip | **+123.7 KB** (256.9 KB vs 133.2 KB baseline), raw +376 KB |
| RTL | Charts render; the time axis stays left to right (Sep 1 on the left even with `dir=rtl`), which is acceptable for time but we did not check whether the gauge and ring labels mirror (screenshot only) |
| Side effects of `add` | **Overwrote `lib/utils.ts` with `clsx` + `tailwind-merge`** (this would replace our token-aware `cn`) and appended 251 lines (75 `--chart-*` variables in `oklch`, light and dark) to `globals.css` |
| New dependencies | 7 `@visx/*`, `motion`, `@number-flow/react`, `d3-array`, `d3-shape`, `clsx`, `tailwind-merge`, plus 2 `@types/*` |

**Decision: do not adopt in v3.** It works on our versions, but for a gauge, a ring and a heatmap we would pay 124 KB gzip, 12 new
packages, a hydration workaround, and a registry that rewrites our `cn`. What we need already exists: `DensityGauge`, `Heatmap.tsx`, `PointsRing`
(kept custom), and shadcn `Chart` (Recharts 3.8.0) for line, bar and area. If workstream C still wants Bklit later:

* install with `ssr:false` wrappers only, behind `next/dynamic` in a client component;
* after `shadcn add @bklit/...`, restore `lib/utils.ts` and delete the appended CSS variables (or map them onto `--chart-1` to `--chart-5`);
* add `@types/d3-shape` and `@types/d3-array` as dev dependencies;
* re-measure; Bklit's repo is under 10 months old and moves weekly.

Not tested: Bklit's other 13 charts, its Studio package, and accessibility (the README makes no claim; the SVGs rendered with no `role` or text alternative in our page, so a table fallback would be needed, as `Charts.tsx` already does).

---

## 3. ReUI Data Grid with 10,000 rows

**Question.** Can ReUI's free Data Grid carry the Customers list (strategy section 2.3: "customers over a few hundred rows") at 10,000 rows, with sort and virtual scroll, and what budget does C get?

**Setup.** Same scratch Next project. `shadcn add @reui/data-grid @reui/data-grid-table` (free tier; the registry's `data-grid-virtualization-*` examples are Pro and returned 401, so the page was
written from the component source). 10,000 rows, 7 columns (id, name, phone, visits, points, joined, status), sortable headers, fixed layout, sticky header, dense, `DataGridTableVirtual`
with `estimateSize 40`, `overscan 12`, `height 600`. Pagination state set to one page of 10,000 for the virtual run; a second run used the plain `DataGridTable` with 100 rows per page.

**Installed (from the registry items).**

| Package | Version | Note |
| --- | --- | --- |
| `@tanstack/react-table` | 9.3.1 | v9, new `useTable({ features, ... })` API; typing needed `any` on column defs in this page |
| `@tanstack/react-virtual` | 3.14.23 | |
| `@dnd-kit/core`, `modifiers`, `sortable`, `utilities` | 6.3.1, 9.0.0, 10.0.0, 3.2.2 | **scratch project only.** The registry install pulled them for column and row drag. Not adopted: see constraint 4 below |
| shadcn primitives added | `badge` (ReUI), `checkbox`, `dropdown-menu`, `input`, `popover`, `select`, `separator`, `skeleton`, `spinner` | `dropdown-menu` was **not** in the base set; A added it to `components/primitives` |

**Numbers (production build, Chromium, 1280x900).**

| | Virtual, 1x CPU | Virtual, 4x CPU | Paged (100 rows), 1x CPU |
| --- | --- | --- | --- |
| Page load to first body row (includes generating the 10,000 rows in the page) | 393 to 587 ms | 1,587 to 1,905 ms | 627 ms |
| Body rows in the DOM (top, after scrolling) | 28, then 41 to 42 | 28, then 41 to 42 | 100 |
| DOM nodes on the page | 301 | 301 | 881 |
| JS heap | 17 MB | 17 MB | 21 MB |
| Scroll 18,000 px in 3 s (6,000 px/s, about 150 rows a second, a fast fling): average frame rate | **58 and 59.7 fps** | **25.9 and 31.7 fps** | not scrollable (page fits) |
| ... p95 frame time / worst frame | 16.8 ms / 33.4 ms | 66.6 to 83.3 ms / 83 to 100 ms | n/a |
| ... frames over 20 ms | 1 to 6 of 175 to 180 | 56 to 61 of 78 to 96 | 0 |
| Sort by Points (click to two frames later) | 120 to 138 ms | 507 to 535 ms | 166 ms |
| JS added to a page, gzip (grid + base-ui menus + dnd-kit + TanStack), scratch page | +113.8 KB (247.1 vs 133.3 KB) | | |

A stress test that scrolled the full 400,000 px in 3 s (133,000 px/s, not a human gesture) gave 51 fps at 1x and 14.6 fps at 4x; ignore it except as a worst case.
The paged run also logged a hydration warning that comes from the scratch page reading `location.search` during render, not from ReUI.

**Decision: adopt, virtualised, for Customers and CSV imports.** Rows scroll at the display's rate on a desktop-class CPU and stay usable at 4x slowdown.

**Budget for workstream C (replaces "a trace budget set by the spike").**

| Metric | Budget | Measured |
| --- | --- | --- |
| Frame rate while scrolling 10,000 rows at 6,000 px/s, 1x CPU | average >= 55 fps, p95 frame <= 20 ms | 58 to 60 fps, 16.8 ms |
| Same, 4x CPU | average >= 24 fps | 26 to 32 fps |
| Rows mounted | <= 60 | 28 to 42 |
| Sort 10,000 rows, 1x CPU | <= 250 ms | 120 to 138 ms |
| First body row after load (data already in memory) | <= 1 s at 1x | well under |
| Extra gzip JS for the Customers route | <= 120 KB | 113.8 KB (shared Base UI code already on the page lowers it) |

**Constraints C must plan for.**

1. Keep **server pagination** for real data (the API pages customers); virtualise a page of up to a few thousand rows, or use the grid's `onFetchMore` for infinite loading. A client-side 10,000-row sort is a spike result, not a product requirement.
2. TanStack Table v9 typing is strict about the feature bundle (`TFeatures` is invariant). Write one `useCustomersTable()` hook with `dataGridFeatures` and typed columns, and copy it for imports.
3. The grid files declare `"use no memo"` on purpose (they opt out of the React Compiler); do not remove it.
4. `dropdown-menu` is needed by the grid's column menu (it is in `components/primitives`). **dnd-kit is not used.** The registry install pulled it for column and row drag, but C copied only the grid files that do not import it (data-grid, table, table-virtual, column header, pagination, scroll area, i18n, column filter, column visibility) into `src/components/reui`, so `@dnd-kit/*` is not in `package.json` and nothing imports it. Column and row reordering is not offered. The +113.8 KB figure above includes dnd-kit, so the adopted grid costs less; it was not re-measured.
5. RTL: not tested in this spike. The strategy already lists Calendar, Pagination and Sidebar as manual RTL work; add the grid's pinned columns and resize handles to C's RTL check.
6. Pro blocks (virtualization examples, 44 data-grid blocks) need a paid license; use only the free components.
7. **Pinned source.** The copied files come from ReUI commit `067aa0dc7f8bbfec1cd76fc5ad31f842be5f569a` (MIT). It is recorded in `apps/web/components.json` as the `@reui` registry's `commit` param (the CLI rejects unknown keys, a registry param is accepted). Re-pin it when the copy is refreshed.

---

## Reproducing

The three scratch scripts (bundle sizing, Playwright timing, scroll measurement) live in the A workstream scratch directory, not in the repo. To redo a
number: build a scratch project with the commands above, run a production build, and drive it with Playwright 1.56.1 using `requestAnimationFrame` frame timing and
`Emulation.setCPUThrottlingRate`. If a later `shadcn` or library version changes a number materially, update this page in the same PR.
