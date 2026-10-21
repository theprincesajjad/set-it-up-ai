# Admin (web): rollout control centre

Route `/admin/...`, API `admin` area, `requirePlatformRole(req, "admin")`. Desktop-first (lg+),
usable on tablet. Shell: dashboard shell with a 4 px `danger` top strip and "Admin" Badge, so no
one confuses it with a merchant view.

Nav: Rollout · Neighbourhoods · Merchants · Members · Campaigns · Ads review · Messages · Audit log ·
Settings.

## 1. Rollout (home)

The page that decides when paid features switch on. Data: `featureRollouts`, `featureOverrides`,
`FEATURES` (shared), `neighbourhoods`, active merchant counts.

**Top: network density gauges.** Row of DensityGauges (system.md), one per gate:

| Gauge | Value | Target | Source |
| --- | --- | --- | --- |
| Active network merchants | 112 | 150 (Plus/Pro unlock) | merchants with >= 25 active members |
| Ads & sponsored | 112 | 400 | `unlockAtMerchants` of `ads.*` |
| Neighbourhood campaigns | 112 | 100 | `campaigns.neighbourhood` |
| Customers holding 2+ shops | 27% | 30% | PRD success metric |

Each gauge: arc + `stat` value + "28 to go" + status text (Low / Building / Ready), colour from
`chartColors.status`. Ready gauges get a success Badge "Ready to unlock".

**Neighbourhood table** (below gauges): Neighbourhood, Status Badge (scouting/pilot/live), Shops
live / storefronts (with mini gauge), Active members, 2+ shop members %, Redemption rate, Rep.
Row click → neighbourhood detail.

**Feature rollout table** (the control): grouped by phase (Phase 2 Plus, Phase 2 Pro, Phase 3
Network). Columns:

- Feature (name + key in `caption mono`), Plan Badge, **Stage** (SegmentedControl Hidden / Beta /
  GA, colours: neutral / info / success), Unlock target ("150 merchants") with met/not met icon,
  Beta merchants count, Overrides count, Last changed (who, when).
- Changing a stage opens a confirm Modal stating the effect in plain words: "Turn **Order-ahead** to
  **Beta**? 14 merchants who opted into betas and are on Plus will see it. Customers of those shops
  will see Order ahead on their shop pages." Requires typing the feature key for GA changes.
  Free Phase 1 features are shown read-only with a lock and "Free forever" Badge (cannot be changed
  here; enforced by `FREE_FOREVER`).
- Overrides drawer: per-merchant grant/deny (search merchant, toggle, reason, expiry date).

## 2. Neighbourhoods

Map + list. Detail: boundary polygon, BIA contact, storefront count by vertical (stacked bar),
signed vs target, SoPoints-presence notes, campaign history, pipeline from reps, gate checklist
("80+ storefronts", "BIA manager engaged", "Mix of daily and service shops").

## 3. Merchants / Members

- Merchants DataTable with filters (status, plan, neighbourhood, activation, integration errors),
  detail with impersonation (danger Banner while active), plan and override controls, audit trail.
- Members: lookup by phone (exact only, masked results), support actions (resend OTP, merge
  duplicate, export data on request, delete account), every action reason-logged. No browsing lists
  of members (privacy).

## 4. Campaigns

BIA campaigns: create (name, neighbourhood, dates, participating shops multi-select, rule "visit N
shops", prize, bonus points), status, live progress (participants, completions, visits per shop per
day chart), export report for the BIA (PDF with charts).

## 5. Ads review (Phase 3)

Queue of `pending_review` sponsored items: preview exactly as customers see it (with the
"Sponsored" label), advertiser, placement, budget, targeting radius, policy checklist (no alcohol
inducement, no pharmacy service promotion, honest claims), Approve / Reject with reason template.

## 6. Messages

Platform-level view of messages (counts by status, failures by provider), suppression list, STOP
keyword log, consent audit lookup by member.

## 7. Audit log

Filterable table: actor, role, action, target, before/after diff (expandable JSON), IP/device,
timestamp. Export CSV.

## States

- Every destructive or rollout change: confirm Modal + toast with Undo (30 s) where reversible.
- Loading: skeleton gauges and table rows. Errors: Banner danger with retry; never silent.
