# Merchant onboarding and activation

From "heard about it" to "first stamp given", and on to 25 members. Written by the onboarding team (slug `merchant-onboarding`).
Figma file: <https://www.figma.com/design/HiEm7SKLAdqZ0sOM7slxZZ> ("Local Loyalty — Merchant onboarding"). PNG exports:
`/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/merchant-onboarding/`.

## 1. Who this is for

**The owner.** An independent GTA shop with one to three locations: café, bakery, restaurant (a large share South Asian), tiffin
kitchen, retail, pharmacy front store, salon or barber, repair. The owner is usually also the cashier, the cook or the stylist.
Setup happens in the gaps: before opening, at 3 p.m., on a phone at the till. They have no IT person, a POS from another company
(Square, Clover, Lightspeed, Toast, or a cash drawer), and they have tried "a stamp card" before. A large share of owners work in
English as a second or third language (South Asian Canadians are 19% of the GTA, 2021 Census, so Urdu, Hindi and Punjabi matter
at the counter even when the owner reads English) (A: the share of owners who prefer another language is not measured by
anything we found).

**The founder.** The launch plan (`docs/finance/launch-plan-economics.md`, Part A) has one person selling by phone and an
"in-product setup wizard plus automated follow-ups" doing the setup, 400 shops by month 3, and 60% of them reaching 25 members
within 30 days. The founder cannot watch 400 shops. The product has to say who to phone this morning.

**The customer** only matters here as the thing the owner needs 25 of. What gets the 25 is the owner's staff asking at the till
(see §4).

## 2. Evidence

What we could and could not find. We were not able to find a rigorous, primary-source benchmark for SMB setup abandonment or
time to value, so we did not borrow one. Instead we define our own activation, measure it from day 1 and compare against the
launch plan's targets.

| Finding | Source | How we use it |
| --- | --- | --- |
| Toast's typical implementation takes **four to six weeks**: kickoff call, menu build, 60-minute staff training, hardware, go-live readiness call, first-day support. Hardware alone ships in 7 to 14 business days. | [Toast onboarding guide](https://intercom.help/toast-central/en/articles/13716157-remote-onsite-onboarding-guide) | We have no hardware, so the whole path can be minutes. We copy the human parts: a go-live moment and a person who checks in during the first days (our founder call list). |
| Fresha's own launch lessons start with the account, business details, **the first service**, team members and shifts. Its app keeps a persistent "Complete Setup" pill with a percent in the header. | [Fresha Academy, Launch your workspace](https://www.fresha.com/help-center/academy/launch-your-workspace/getting-started/lessons/100242) (page text was a title only); the pill is visible in the Mobbin flow below | Persistent progress that never blocks work. We keep the sidebar "Complete your setup" meter. |
| Shopify's setup guide is one collapsible checklist per goal (11 tasks), the first task open with **one primary button** and an optional secondary one, a counter ("1 / 11 completed"), and an upfront "which describes you" question that tailors the list. | Mobbin, below | One open step at a time; our vertical question at signup tailors the program and the playbook. |
| In the Shopify-app and onboarding literature, the most repeated cause of early churn is that the merchant never reaches a first meaningful win; best practice is to pick **one activation event** and track time to it. (Vendor blogs, not primary research.) | [AppJubilee on Shopify app onboarding](https://blog.appjubilee.io/improve-shopify-app-onboarding-flow/), [Shopify App Founders newsletter](https://shopifyappfounders.beehiiv.com/p/shopify-app-founders-edition-issue-08) | Our first win is the first stamp, and it is now the second step. |
| Commonly quoted SaaS figures: average activation about 37.5%, small-business range 25% to 35%, average time to value about 1.5 days. Sources disagree on sample and vintage and several trace to a single vendor dataset. | [Artisan Growth Strategies](https://www.artisangrowthstrategies.com/blog/saas-onboarding-benchmarks-2026-activation-rates-company-size-vertical), [Valuecase](https://www.valuecase.com/articles/customer-onboarding-metrics-kpis) (secondary, estimate) | Only as context: the launch plan's 60% is well above the quoted SMB range, which is why we show a leading signal and a call list instead of waiting for day 30. |
| CASL: emails or texts to a person with an **existing business relationship** (a purchase, contract or inquiry in the last two years) rest on implied consent; the separate business-to-business exemption is narrower than people assume. Keep dated records. | [Torys on the Federal Court of Appeal's CASL ruling](https://www.torys.com/our-latest-thinking/publications/2020/06/fca-confirms-casl-is-constitutional-but-limits-business-communications-exemption), [Electrofed on implied consent](https://www.electrofed.com/?p=21474) (secondary, not legal advice) | Setup nudges go only to the owner who signed up, at most five in 25 days, 9:00 to 20:00 Toronto time, and carry a stop link. Each send is recorded as a dated milestone. A lawyer should confirm before launch. |
| 2021 Census: South Asian Canadians are 1,182,485 people, 19% of the GTA. | [Wikipedia summary of the 2021 Census](https://en.wikipedia.org/wiki/South_Asian_Canadians_in_the_Greater_Toronto_Area) | South Asian restaurant and tiffin kitchen are first-class shop types at signup, with a printed till line in Hindi, Urdu and Punjabi. |
| Launch plan assumptions: 60% activation within 30 days (25+ active members), 12 members by day 14 as the leading signal, phone-onboarded shops possibly activating lower, 400 shops needs about 6 to 8 signed shops a working day. | `docs/finance/launch-plan-economics.md` §A1, §A3 | The activation definition and the funnel's "stuck" and "behind at day 14" lists. |

### Mobbin references

| Reference | What it taught us |
| --- | --- |
| [Shopify, "Using a setup guide"](https://mobbin.com/flows/2513bddc-2b15-4e3e-8ba3-39b637ccc85a) | One checklist, current task expanded with one primary button, quiet counter. Our setup page keeps one open panel with one primary action. |
| [Shopify, "Setting up an account"](https://mobbin.com/flows/7b650617-2f38-4d99-a854-b53f839a8d55) | Ask one or two tailoring questions first, with a visible "skip setup help". Our type chips do the tailoring. |
| [Fresha, "Team members" (Complete Setup pill)](https://mobbin.com/flows/b945aa5a-a06a-44fa-b380-cd0b91b295ee) and [Adding a team member](https://mobbin.com/flows/354dbb82-56fa-4889-9f0b-9ecd923679a3) | A setup percent pinned to the header while the owner works elsewhere; team invites as a normal list action. We keep the sidebar meter; staff invite stays a single small form. |
| [Circle, setup checklist](https://mobbin.com/screens/509ed183-a8b9-4613-a2a4-0164192e5aba) | Master-detail: steps in a left list, detail on the right. This is our rail plus panel. |
| [Slite, setup 71% and trial countdown](https://mobbin.com/screens/6747d7cc-44b3-4671-a2de-b0e60d0c8d8d) | A percent and a clock side by side. Our activation card pairs "14 of 25" with "day 9 of 30". |
| [Hootsuite, Getting started 4/6](https://mobbin.com/screens/678aa914-5611-432d-ba41-f01049932d28) | Segmented progress with Done tags. We avoided the illustrated tiles: heavier than a hairline list. |
| [Uvodo, welcome checklist with upgrade strip](https://mobbin.com/screens/d1e35f61-e3b8-482e-8f1d-99e4a9ccc611) | The upgrade line sits below the checklist and stays quiet. This shaped the 10-member restaurant preview: one muted line, no button. |
| [Square Go, onboarding (customer app)](https://mobbin.com/flows/29d5c7f7-ef6b-4b52-a1e9-705fff5fde60) | Phone number first, one question per screen. Used for structure only (it is a customer app). Our signup asks for the mobile number before the address. |

## 3. Jobs to be done (owner, ranked by frequency and pain)

1. **"Show me it works before I commit time."** Seeing one stamp land on a real phone. *Pain: highest. Nothing in the old guide made this happen.*
2. **"Don't make me fill in things I don't care about."** Name, type, address, number. Nothing else before the first stamp.
3. **"Tell me what to say to customers."** The till line, in the language of the staff, and the one tactic that works for my kind of shop.
4. **"Get me the first 25 without a lot of thinking."** A pace line that says whether I am on track, and one next move.
5. **"Put it where people pay."** A printed stand and a staff script, in minutes, not a design project.
6. **"Let my staff do it."** Add a cashier by phone number; counter on their phone.
7. **"Don't nag me, but don't let me forget."** Reminders that stop when I act, at sane hours, that I can turn off.
8. **"Connect my till later."** POS sync when I have time, after the card has proven itself.
9. **"Tell me when paying is worth it."** Once my regulars are on the card, not before.

Founder jobs: **"Who do I phone this morning?"** and **"Is the 60% in 30 days on track?"**

## 4. What we build and why, and the audit of what existed

Activation is defined as **25 members who have visited, within 30 days of signup** (leading signal: 12 by day 14, a straight line
to 25 in 30 days). The first stamp is the time-to-value event. Both are recorded as milestones from the first day.

### Audit of the build before this work

| Piece | Verdict | Reason |
| --- | --- | --- |
| Signup: two screens, 8+ fields (postal code, shop email, neighbourhood, address, phone, type picker of 20 types as a dropdown) | **Change** | Jobs 1 and 2. One screen, 6 required fields, type chips, South Asian restaurant and tiffin kitchen added. Postal code and shop email cut (profile/settings can hold them). |
| "You're live" screen with QR after signup | **Change** | Replaced by landing on "Give your first stamp" in the setup guide, where the QR is the same thing plus the next action. |
| Setup guide, 6 steps: profile (logo URL, about text, GST/HST), program, rewards, staff, QR kit, first 25 | **Change** | Job 1: the first stamp was not a step at all and logo URL came first. Now 5 core steps: program (rewards merged in, the template already sets both), **first stamp**, QR stand, staff and counter app, first 25. Profile and POS moved to "Later, optional". |
| Rewards step | **Cut** | Duplicate of the program step: templates always create the reward. Still editable on the program page. |
| `activatedAt` set at 25 members, lifetime | **Change** | Not time-bound and no history. Window and pace added; milestone rows give timing. |
| Home strip "Your first 25 members", bar, "N days left" | **Change** | Could not say whether the owner was on pace and gave no next move (job 4). Replaced by the activation card. |
| Sidebar "Complete your setup" meter | **Keep** | Persistent, never blocks (Fresha, Slite). Now counts the 5 core steps. |
| Staff step with phone invite | **Keep**, add counter-app line | Job 6. |
| QR kit with A6 stand, A4 poster, staff script | **Keep**, add the shop-type till line and Hindi/Urdu/Punjabi lines for the two South Asian types | Job 3 and 5. |
| Rep console day 7 and day 30 check-ins and activation bonus | **Keep** | Unchanged; it reads the same `activatedAt`. |
| Admin "activation rate" (activated / not closed, lifetime) | **Keep**, add the funnel page | The founder needs per-step counts, median time to first stamp and a call list. |
| First-week activation nudges | **Did not exist** | The launch plan assumes "automated follow-ups". Built: day 1, 3, 7, 14, 25. |
| Restaurant-tier upsell | **Did not exist at the right moment** | Built: preview at 10 members (restaurants, on pace), offer at activation, never before the first stamp or while behind pace. |

### Each new piece mapped to a job

| Component | Job |
| --- | --- |
| `merchant_milestones` table (signed up, first stamp, 10 members, activated, QR printed, staff added, upsell seen or dismissed, nudges off, needs call, and each nudge sent) | Founder jobs, 7 |
| One-screen signup with type chips and starter-program line | 2, 3 |
| Setup guide with "Give your first stamp" (QR, polling status, "Copy join link") | 1 |
| Playbooks per shop type (till line, tactic, three tips, first-stamp hint, upsell copy) | 3, 4 |
| Activation card on Home (members, pace, four milestones, where members came from, next move, setup left) | 4 |
| Next move rules (first stamp, then QR stand, then add a cashier, else tactic with real source counts, after activation: connect POS) | 4, 5, 6, 8 |
| Setup nudges job with quiet hours, opt-out and "needs call" flag | 7, founder |
| Upsell card and 10-member preview line; "Not now" hides for 14 days | 9 |
| Admin activation funnel (steps, median minutes to first stamp, stuck, behind at day 14, by type, call list) | Founder |
| Staff script with Hindi, Urdu and Punjabi till lines | 3 |
| POS step (optional, after activation) | 8 |

### Per-vertical onboarding (the playbooks)

| Shop type | Starts on | Till line | First-25 tactic | Paid tier and when |
| --- | --- | --- | --- | --- |
| Café, bakery | 1 stamp per visit, 10 (8 bakery) = a free item | "Want a stamp on that today?" | Stamp before they pay, QR beside the card machine | Café & Retail, once active |
| Restaurant, bar | 10 points per $1, alcohol never earns (AGCO) | "Are you on the card? You get points on this bill." | Ask at payment, table tents | **Restaurant Starter** $99: preview at 10 members, offer when active |
| South Asian restaurant (new) | 10 points per $1, free masala chai at 150, $10 off at 500 | Same, printed also in Hindi, Urdu, Punjabi | Families on Friday and weekend evenings; join link on WhatsApp | **Restaurant Growth** $199 (tiffin, degh, festival campaigns) |
| Tiffin kitchen (new) | 1 stamp per delivered box, 10 = a free box | "Your tenth box is on us. Scan the sticker once..." (Hindi, Urdu, Punjabi too) | QR sticker on every box in week one; start with subscribers | **Restaurant Growth** |
| Retail, grocery, pet, florist, bookstore | 1 point per $1 | "Do you have points with us?" | Receipt line, stand where people wait | Café & Retail |
| Pharmacy front store | Front store only, prescriptions never earn (existing no-earn category) | "Do you collect points on front-store items?" | Front till only | Café & Retail |
| Salon, barber, spa | 1 stamp or points per visit | "Want to book your next one before you go?" | Ask at checkout, rebook then | Café & Retail (booking) |
| Repair, tailor, dry cleaner, print | Points per $ | "Join and your next repair earns points." | QR on the pickup ticket | **Service** $99 |

The founding offer (first 20 restaurants per corridor, 50% off 12 months then 25% off for life, from `FOUNDING_OFFER`) is shown on
the restaurant offer with the number of spots left on the shop's street.

## 5. What we deliberately don't build

- **A 4-to-6 week implementation program** (Toast). No hardware, no menu build. The path is minutes plus a call when the funnel says so.
- **A rich profile before the first stamp** (logo upload, hours, photos). Those live under Later.
- **Interactive product tours, confetti, badges.** One checklist is enough; every extra element has to map to a job.
- **Texting the join link from the setup page.** "Copy join link" does the job without a new SMS endpoint (open item below).
- **Automatic upgrade or card-on-file at signup.** Paid plans switch on in month 4; the card only ever offers the founding offer.
- **A separate "onboarding" CRM.** The founder's call list is the admin funnel page.
- **More than five nudges, or any nudge to customers or staff.** Setup nudges go to the signing owner only.
- **Translated owner dashboard.** The dashboard is English-only today (shop-facing); only the printed till lines are in Hindi, Urdu and Punjabi, and those need a native speaker's review.

## 6. Design

Figma: <https://www.figma.com/design/HiEm7SKLAdqZ0sOM7slxZZ>. Built in the existing visual language (monochrome, one accent
`#FF5A1F`, Bricolage Grotesque display, Inter body, hairlines, pill buttons). Every frame has a "why this exists" note beside it.

| Frame | Size | Node |
| --- | --- | --- |
| 01 Signup | 390 | `2:59` |
| 02 Setup guide, first stamp | 1440 | `2:114` |
| 03 Home, activation view | 1440 | `3:2` |
| 04 Vertical playbooks | 1440 | `3:87` |
| 05 Restaurant upsell at activation | 1440 | `3:141` |
| 06 Admin activation funnel | 1440 | `3:180` |

Known deviations of the build from the frames: "Text me the join link" became "Copy join link" (no new SMS endpoint); the playbooks
table is data (code), not a page; the first-stamp rail marks Program as done from the start (the template sets it).

## 7. Build spec (as built)

**Shared** (`packages/shared`)
- `src/onboarding.ts` (new): `ACTIVATION` (target 25, window 30 days, leading 12 by day 14, stuck after 48 h, restaurant preview at 10), `paceFor`, `expectedMembers`, `playbookFor`, `upsellMoment`, `dueNudge`, `nudgeText`, milestone and nudge keys.
- `src/verticals.ts`: new verticals `restaurant_south_asian`, `tiffin` with templates. `design-tokens/src/verticals.ts` visual seeds, regenerated css.
- `src/api/merchant.ts`: `ONBOARDING_STEPS` = program, first_stamp, qr_kit, staff, first_members; `ONBOARDING_LATER_STEPS` = profile, pos; `OnboardingChecklist` gains `later`, `activation`, `playbook`, `upsell`, `nudgesOn`; `setNudgesBody`. `src/api/admin.ts`: `OnboardingFunnel`.

**DB** (`packages/db`): table `merchant_milestones (merchant_id, key, reached_at, data)`, unique on (merchant, key). Migration `0016_onb.sql`
(includes a backfill of signed up, first stamp and activated for existing shops).

**API** (`apps/api`)
- `services/onboarding.ts` (new): milestones, `getOnboardingChecklist` (moved from merchant.ts), next-move rules, upsell inputs, `runOnboardingNudges`, `onboardingFunnel`, `backfillMilestones`.
- `services/ledger.ts`: `maybeActivateMerchant` records first stamp, 10 members and activation.
- `services/merchant.ts`: `signed_up` on create, qr/staff/pos milestones on `onboarding/complete`. `services/merchant-staff.ts`: `staff_added` on invite.
- Routes: `POST /v1/merchants/:id/onboarding/upsell/dismiss` (owner), `PUT /v1/merchants/:id/onboarding/nudges` (owner), `GET /v1/admin/onboarding/funnel?days=` (admin). `GET .../onboarding` response extended.
- Job `onboarding.nudges` (hourly): day 1 (no first stamp), 3 (<5), 7 (<10), 14 (<12, flags `needs_call`), 25 (<25). 9:00 to 20:00 Toronto, once each, a late shop gets one message not a pile.
- Seed: `backfillMilestones` at the end of `seedDemo`.

**Web** (`apps/web`)
- `components/auth/SignupWizard.tsx` (one screen, chips), `(marketing)/signup/page.tsx` copy.
- `(dashboard)/m/[merchantId]/setup/page.tsx` and `steps.ts`, `components/dashboard/Checklist.tsx`.
- `components/dashboard/onboarding/ActivationCard.tsx`, `UpsellCard.tsx`; Home (`m/[merchantId]/page.tsx`).
- `components/dashboard/QrKitPrint.tsx` (script with local till lines, `?print=script`), `locations/kit/page.tsx`.
- `(admin)/admin/onboarding/page.tsx`, admin nav entry, `lib/api/endpoints.ts`.

**Acceptance checks** (all automated): API `test/onboarding.test.ts` (17), `test/merchant.test.ts`; shared `test/onboarding.test.ts`; web `src/lib/dashboard/onboarding.test.ts`; e2e `e2e/onboarding.spec.ts`
(signup to first stamp to activation card, South Asian restaurant offer and Not now, café copy and reminder opt-out, admin funnel, 390px signup).

**Open items**
- Native-speaker review of the Hindi, Urdu and Punjabi till lines (same status as the existing catalogs).
- Lawyer review of the setup nudges under CASL; add inbound STOP handling for SMS if reminders move to a shared sender number.
- Owner dashboard and nudge texts are English-only.
- "Text me the join link" from the setup page needs an SMS endpoint.
- The founding-offer spots counter counts shops with `founding_offer` in the same neighbourhood; the corridor concept is not a column yet.
- Measure after launch: median minutes to first stamp (target under a day), share stuck at 48 hours, share behind at day 14, activation by shop type. Revisit the 12-by-14 signal with real data.
