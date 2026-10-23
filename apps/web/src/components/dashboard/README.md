# Dashboard primitives

Import from one place: `import { PageHeader, StatBlock, EmptyState } from "@/components/dashboard"`.
Everything is monochrome, hairline, one accent (points, plus the "New" order dot, the only status that needs the shop to act now; waiting-on-customer states are info blue). Source of truth: `docs/design/canvas/Dashboard.dc.html`
and `docs/design/foundations.md` ("Merchant dashboard"). Do not create look-alikes; extend `kit.tsx`.

| Primitive | Use |
| --- | --- |
| `PageHeader` | Title (22 semibold), one-line description, primary action pill top right (`actions`). One black primary per page. `back` for detail pages. |
| `Section`, `Panel` | Small heading row over content; `Panel` is a hairline 16px-radius box for forms (`footer` slot for actions). |
| `StatBlock` (+ `StatItem`) | One bordered block of numbers split by hairlines: label, 30px tabular value, small delta (`good: true/false/null`). `bare` inside another box. |
| `StatTile` / `StatGrid` | Same look, one cell at a time, for custom grids. |
| `DataTable` | Sortable, sticky header, 44px rows, collapses to list rows below md; has `loading`, `error`+`onRetry` and `empty`. For hand-built tables: `TableWrap`, `Table`, `Th`, `Td`, `Tr`. |
| `RowList`, `Row`, `DefList` | Hairline list rows (title, meta line, right-aligned trailing); definition rows for detail panels. |
| `EmptyState` | One sentence + one action, left-aligned, hairline rows. `Empty` is the inline one-liner. |
| `SkeletonRows`, `PageSkeleton`, `Async` | Loading skeletons (never full-page spinners); `Async` renders skeleton / error + retry / data. `ErrorLine` for inline errors. |
| `StatusDot` / `StatusPill` / `Dot` / `Tag` | Dot + word for lists (`StatusDot domain="order" status=...`); filled capsule `StatusPill tone=...` for dense tables. |
| `SegmentedControl` | Compact h-8 switch for ranges and views (`options`, `value`, `onChange`, `label`). `Capsules` for filters, `Tabs`/`PageTabs` for in-page views. |
| `Sheet` / `Drawer` | Right-side detail panel, full screen on phones, Esc closes, restores focus. Props: `open`, `onClose`, `title`, `subtitle`, `footer`, `label`. |
| `FormField` | Label, hint, inline error wired with aria-describedby. `TextField`, `Select`, `Switch` already use it; pass `error` after first submit attempt. |
| `SaveBar` | Sticky bottom bar shown while a form is `dirty` ("You have unsaved changes", Discard, your Save button). |
| `FeatureGate`, `ConfirmDialog`, `NoAccess`, `useMerchant` | Paid-page gate, confirmation, 403 state, merchant context (`api`, `base`, `role`, `enabled(key)`). |

Restaurant pages live under `/m/[id]/restaurant/<slug>`; `restaurant/layout.tsx` already gates and adds the section tab strip,
so a page only renders `PageHeader` + content.
