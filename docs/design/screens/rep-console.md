# Rep console (web)

For internal onboarding reps who set up merchants on-site (20-minute visit) or by phone. Route
`/rep/...`, API `rep` area, `requirePlatformRole(req, "rep")`. Reps use it **on a phone or tablet
standing at a counter**, so it is mobile-first like the dashboard.

Shell: same as merchant dashboard with a 4 px `info` top strip and "Rep" Badge next to the logo.
Nav: Today · My merchants · New merchant · Neighbourhoods · Kits · Earnings.

## 1. Today

- Header "Today on Roncesvalles" (rep's assigned neighbourhood), date.
- **Visits planned** list (from the rep's pipeline): shop name, time, status Badge (planned, visited,
  signed, live), "Navigate" and "Start setup".
- **Follow-ups due** (day 7 / day 30 calls from the playbook): ListRow with phone tap-to-call,
  activation progress mini bar ("18 / 25"), "Log call" action (Sheet: outcome Select + note).
- **Street density** compact DensityGauge for the assigned BIA ("28 / 40 shops").

## 2. New merchant (the 20-minute setup)

Stepper optimised for doing it together with the owner, on the rep's phone or handed to the owner:

1. **Find the shop:** search Google Places by name near the rep's location → prefill name, address,
   phone, hours. Duplicate check: "Already on the network: Sorauren Coffee (live)" blocks creation.
2. **Owner:** name, mobile (PhoneField), email. Owner gets an SMS + email invite to claim the
   account (transactional).
3. **Vertical and template:** vertical tile grid → template summary with the same live preview as
   the merchant program editor; one-tap "Use this", or tweak.
4. **Categories:** auto from template; pharmacy no-earn rows locked.
5. **Staff:** add the staff member being trained (name + phone + role Staff).
6. **QR kit:** print now (Bluetooth/AirPrint to the rep's portable printer) or "Mark as delivered".
7. **Train:** a 3-card checklist the rep walks through with staff: "Find a customer", "Add a
   stamp", "Undo". "Practice award" uses a sandbox member that never hits reports.
8. **Done:** success screen with the merchant's join link, "Send owner the welcome email", and
   activation goal "25 active members in 30 days" with the rep's bonus status.

Saved as draft at every step (resume from My merchants). Offline-tolerant: steps 1-5 queue if the
shop's Wi-Fi is weak; final "Create" needs a connection.

## 3. My merchants

DataTable: Shop (logo + name), Vertical, Status Badge (onboarding/active/paused/closed), Signed
date, Active members (ProgressBar to 25), Days since signed, Next follow-up, Activation bonus
(Badge: Earned / Pending / Missed). Filters: status, activation state, neighbourhood. Row → merchant
summary (read-mostly view of the merchant's Home KPIs, program, staff, last 10 transactions, notes,
"Open as merchant" impersonation with a sticky danger Banner "Viewing as Sorauren Coffee. Changes
are logged." and "Exit").

## 4. Neighbourhoods

Per neighbourhood the rep covers: map with signed (pine pins), in pipeline (marigold), not yet
contacted (stone outline) shops; list of storefronts by type; density gauge; "Add prospect" quick
form (name, vertical, address, notes, owner present? Y/N).

## 5. Kits

Inventory of QR stands/decals the rep carries, reorder button, print queue for merchants.

## 6. Earnings

Hourly shifts logged + activation bonuses (merchant reached 25 active members within 30 days).
Table by week; never commission-only language (see PRD legal note). Copy: "Shifts", "Activation
bonuses", "Paid on {date}".

## States

- Empty My merchants: "No merchants yet", "Your first setup takes about 20 minutes.", primary "Set up
  a merchant".
- Permission error (not a rep): full-page "This area is for the onboarding team." + "Go to your
  dashboard".
