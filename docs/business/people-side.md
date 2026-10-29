# The people side: audit of customers, clients, messaging, staff, notes and consent

Oct 28, 2026 · For @Sajjad Pirani · Read from code on branch `claude/local-loyalty-platform` and from `apps/web/e2e/screenshots/` (dashboard 07–09, appointments, barbers, onboarding). Two readers were held in mind throughout: **Priya, a home-based brow and lash tech with 80 regulars**, and **Marcus, who owns a four-chair barbershop with two renters**. Tags: (C) read from code, (S) seen in a screenshot, (A) assumption.

The founder asked to "reiterate and perfect the people side". This document defines it, says what exists, and ranks the gaps.

---

## 1. What "the people side" means here

| Area | Definition | Owner-facing surface | Client-facing surface |
| --- | --- | --- | --- |
| **Client list and profile** | Who comes, how often, what they had, what to remember | Customers page, customer panel and page | The client's own card and history |
| **Booking** | How a client gets a time, pays a deposit, changes it | Calendar, appointment sheet | `/shops/<slug>/book`, the app's Book tab, confirmation page |
| **Messages** | Confirmations, reminders, a reply when something changes, promos to regulars, DMs | Messages (campaigns), the inbox (new) | App push, web push, email, texts, in-app thread |
| **Staff** | Who works, when, what they can see, how they are paid | Staff page, schedule sheet, pay sheet, payouts | "with Marcus", "my barber" |
| **Notes and consent** | What the pro remembers about a person, and what the person agreed to | Notes and tags, consent lines | The consent text, STOP, the unsubscribe page |

---

## 2. What exists today

### 2.1 Client list and profile

| Built (C, S) | Where |
| --- | --- |
| Customers index: name, masked phone, stamps or points, visits in 30 days, last visit; segments All / Regulars / Slipping away / Reward ready / New this month / Birthday this month / Can text / VIP (paid); search; CSV export (paid); import wizard (paid or rep) | `(dashboard)/m/[merchantId]/customers/page.tsx`, `services/merchant-customers.ts` (`listCustomers`, `segmentCounts`) |
| Customer panel (side sheet) and full page: balance bar, Add stamp / Redeem / Adjust, Joined (date and source), Visits in 30 days, "Usually comes in" (weekday and hour pattern), Email, Texts consent line ("Agreed Sep 3 at the counter") with the exact consent text shown, recent ledger with undo, rewards redeemed, **Notes and tags** (free text, 5,000 chars, placeholder "Allergic to nuts. Likes oat milk.") | `components/dashboard/customers/CustomerView.tsx`; screenshot `dashboard/09-customer-detail.png` |
| Phone reveal is logged per reveal (audit) | `revealCustomerPhone` |
| Preferred staff is set automatically from the last appointment and can be chosen by the client ("my barber") | `services/preferred-staff.ts`, `preferred_staff` |
| Family members under one card (kids' cuts) | `family_members` (barbers research) |
| Pets under the owner with vaccines and groom cadence | `pets.*` |

**What Priya sees:** a loyalty ledger. The columns are stamps and visits. Nothing on the profile says "Lash fill, classic, 75 min, with a $20 deposit, last Tuesday" or "next appointment Nov 12". The notes box is the only place for "sensitive to the adhesive, use the sensitive glue" and it is one blob.

**What Marcus sees:** the same, plus staff pay. He cannot see "Dev's regulars" as a list, or which renter a client belongs to, from the Customers page (renter privacy exists on the calendar and payouts, C: `barber.ts`, not as a filter here).

### 2.2 Client booking

| Built (C, S) | Where |
| --- | --- |
| Public booking: pick a stylist or "any", services, a time (15-minute steps computed from staff hours, time off and overlaps), a note (400 chars), the policy card (free change until N hours, no-show fee), deposit or card on file through Stripe, a 10-minute hold, confirmation with "Add to calendar" (ICS), "Change or cancel", reminders "24 hours and 2 hours before" | `components/pass/BookFlow.tsx`, `services/appointments-booking.ts`; screenshot `appointments/booked-390.png` |
| Reschedule and cancel by the client within the window; fee charged to the saved card after the window or on no-show | `cancelMine`, `rescheduleMine`, `chargeFee` |
| Pharmacy variant: no name, no note, no price (privacy) | same file |
| A rebooking nudge from a service's `rebookAfterDays` (paid) and `?service=&staff=` deep links into the booking page | `service.rebooking`, `rebooking_nudges` |
| The client's "My appointments" in the app and on the web pass | `listMine`, `apps/mobile/src/app/appointments`, `book` |
| Walk-in line with text-when-next, family under one card, "my barber" | `walkin_queues`, `queue_entries` |

**Gaps a client feels:** the confirmation shows the **full address** (`finished.merchant.address`, C) with no notion of a hidden home address; there is no "Add to home screen / turn on notifications" moment on the confirmation, so the free push channel is never offered on the web; no waitlist for a full day; no "book again" shortcut from the last visit on the client's card.

### 2.3 Messages and reminders

| Built (C) | Where |
| --- | --- |
| Confirmation, 24-hour and 2-hour reminders through `notifyCustomer`: push to app tokens, and a text with a STOP line | `appointments-booking.ts` `sendReminders`, `services/notifications.ts` |
| Campaigns (email free, texts paid, push), segments (all, lapsed, VIP, reward ready, tag), scheduling, quiet hours, test-send, CASL consent and footer, one-click unsubscribe headers, inbound STOP and START, a beauty claims guard in the composer | `services/messaging.ts`, `opt-out.ts`, `beauty-guard.ts`, `messages/*` pages |
| Automations: win-back, reward-ready, birthday, welcome (paid) | `listAutomations`, `runAutomations` |
| WhatsApp inbox for restaurants and grocers (sessions, messages, takeover by a person, allergy note) | `whatsapp_sessions`, `whatsapp_messages`, `restaurant/whatsapp/Inbox.tsx`, `grocery/whatsapp` |
| Onboarding nudges to the owner | `runOnboardingNudges` |

**Gaps:** there is **no 1:1 thread with a client** anywhere outside WhatsApp for restaurants. Priya cannot say "running 10 minutes late" from the calendar; Marcus cannot answer "can you do 4:30 instead?". Reminders go by push and **text on every plan**, including Free (`notifyCustomer` sends `smsBody` whenever the user has a phone, C), so the "no SMS on Free" assumption in `unit-economics.md` is wrong today, and the reminder body plus the STOP line can exceed one segment. There is no web push and no in-app message centre for a client who booked on the web. There is no promo template per trade and no counted allowance; a promo is a campaign in a composer.

### 2.4 Staff

| Built (C, S) | Where |
| --- | --- |
| Roles owner / manager / staff / instructor, PIN for the counter, language per staff, kitchen station, invite by email or phone | `staff/page.tsx`, `services/merchant-staff.ts` |
| Per-staff hours and time off, services each staff member performs with price and duration overrides, bookable flag through `listBookableStaff` | `StaffScheduleSheet`, `putStaffHours`, `putStaffServices` |
| Pay model (employee, commission, chair rent), payouts report, a renter sees only their own clients on the calendar and payouts | `PaySheet`, `staff_pay`, `barber.ts` |
| Granular permissions on the Service plan | `staff.permissions` |

**Gaps:** no per-staff booking link ("book with Dev"); the Customers page has no "theirs" filter for a renter; a solo pro is forced through a "Staff" concept at all (she is the one calendar); no staff view of "my day" on a phone beyond the calendar's one-column mode.

### 2.5 Notes and consent

| Built (C, S) | Where |
| --- | --- |
| Free-text notes and tags per member, internal only, with "Your staff can see these; the customer can't" | `CustomerView.tsx` |
| Client note per appointment (`clientNote`) and staff note (`notes`), shown in the appointment sheet with the last visits | `AppointmentSheet.tsx` |
| Allergy note captured in WhatsApp sessions (restaurants) | `whatsapp_sessions.allergyNote` |
| CASL consent with timestamp, source and the exact text; muted per shop; STOP per phone and channel; one-click unsubscribe; data export and account deletion; privacy scrub | `merchant_members.marketingConsent*`, `comm_opt_outs`, `data-export.ts`, `privacy-scrub.ts` |

**Gaps:** no structured "last visit details" (what was done, the formula or lash map, the price paid), so the pro keeps that on paper; no intake note at booking for things a lash or brow tech asks every new client (sensitivities, a photo of the current set), and no way for the pro to ask one question of a new client before the visit; no per-client channel preference ("texts only", "app only").

---

## 3. Gaps ranked by impact, with the fix

Impact is judged by how often Priya or Marcus hits it in a week, and by whether it decides a signup or an upgrade (`solo-pro-launch.md`).

| # | Gap | Who feels it | Fix | Size | Plan |
| --- | --- | --- | --- | --- | --- |
| 1 | **The client profile has no appointment history.** Stamps and ledger only | Priya daily, Marcus daily | A **Visits** section on the profile: a timeline of appointments (date, services, staff, price, deposit, status) merged with stamps and redemptions, newest first; **Next visit** pinned at the top with Reschedule and Message; **Book again** (prefilled from the last visit) | M | Free |
| 2 | **No 1:1 thread with a client** | Both, several times a week | The **inbox** (`conversations`, `conversation_messages`, channel `in_app` / `sms` / `whatsapp` / `instagram` / `email`): a thread per client, opened from the profile, the calendar sheet and the inbox page; outgoing goes to the client's best channel (app push with the in-app thread, else web push, else email, else text inside the plan's cap); inbound SMS replies land in the thread (the STOP handler already parses inbound). The Instagram connector reads into the same table (read-only) | L | Free (text cap applies) |
| 3 | **Reminders by text on Free, and no web push** | The business | Reminder channel ladder: app push → web push (the PWA, prompted on the confirmation page) → email → text only when the client has none of the others, capped at 30 a month on Free; one-segment reminder copy; a per-client channel preference on the profile | M | Free |
| 4 | **The home address shows on the confirmation and in the listing** | Priya (a signup blocker) | `locations.addressVisibility` (`exact` / `area` / `city`), area pins on the map, the address only on the confirmation after the deposit or card step and in the day-before reminder; scrubbed from the shop page, OG image, sitemap, exports (`solo-pro-launch.md` §2.3) | M | Free |
| 5 | **No "last visit details"** (the formula, the lash map, the set) | Priya every visit | A **visit note** on the appointment at checkout ("What did you do? Anything for next time?") with an optional photo, shown on the profile timeline and prefilled into the next booking's staff note. Internal only, same wording as notes today | S | Free |
| 6 | **Promos to regulars are a composer, not a product** | The upgrade decision | **Promo templates per trade and season** (Valentine's nails, Eid brows, back-to-school cuts, holiday gel, spring pedicure, Father's Day cuts…), a picker with the regulars segment preselected, app push and email only, a counter "3 of 4 this month"; the first promo's result on Home ("12 booked from this") | M | Pro (4/month), Annual (48/year) |
| 7 | **No intake question for a new client** | Priya, every new client | An optional one-question intake per service ("Any sensitivities or a current set? Add a photo") on the booking page after the time step; stored on the appointment as `clientNote` and a photo URL; the pro sees it in the sheet. No medical framing, no forms library | S | Free |
| 8 | **No per-staff booking link and no "theirs" filter** | Marcus and his renters weekly | `/shops/<slug>/book?staff=<id>` is live (C); give it a copyable link on the staff row ("Dev's link") and a staff filter on Customers that renters see as their default | S | Free |
| 9 | **No waitlist for a full day** | Priya on Saturdays | "Tell me if a spot opens" on a full day: a `waitlist` row; when a cancellation frees a matching slot, notify the first in line by their best channel with a 2-hour hold link | M | Pro |
| 10 | **The client has no "book again" and no notification prompt on the web** | Clients | On the confirmation page and the web pass card: "Add to home screen to get reminders" (web push), and "Book again" from the last visit on the card | S | Free |
| 11 | **Solo pros meet a "Staff" page they do not need** | Priya | When the shop has one bookable calendar and no other staff, hide Staff from the sidebar and show "Add a second chair" as a `PlanLine` on Settings | S | Free |
| 12 | **Customers index is loyalty-first for an appointment-led shop** | Priya, Marcus | An appointment-led mode of the same index when `booking.appointments` is on: columns Name · Last visit (service, with whom) · Next visit · Visits (12 months) · Stamps; segments add "Due for a visit" (from `rebookAfterDays`) and "No-show twice" | M | Free |
| 13 | **Channel preference and language per client** | Both | Two fields on the profile: channel (best available / app / email / text) and language (en, hi, ur, pa), used by reminders and promos | S | Free |

Sizes: S about a week, M two to four weeks, L a month or more for one developer with AI tooling (A).

---

## 4. What stays as it is

- The consent model (CASL text, timestamp, source, STOP and START, one-click unsubscribe) is better than most of the market and is not touched. The inbox must reuse it: a promo is marketing (consent required); a reminder or a reply to a client's message is transactional.
- The phone-masking and reveal log stay.
- The calendar, availability, deposits, holds, fees and the walk-in line stay. The people-side work adds views over them, not new booking logic.
- "Customer" remains the shared word; "client" appears only inside the appointment tools (`ux-copy.md` glossary).

## 5. Acceptance checks for the fleet

1. Priya opens a client and sees next visit, last three visits with services and notes, and a message thread, in under two taps.
2. A client who booked on the web gets the 24-hour reminder by web push if they accepted it, else email; a text goes out only if they have neither, and the free shop's count moves.
3. A confirmation for a home-based shop shows the address; the shop page, the map and the OG image never do.
4. Marcus's renter sees only his own clients on Customers by default and can copy his own booking link.
5. A paid shop picks "Valentine's nails", sees "Sent to 112 regulars by app and email", and the counter reads "1 of 4 this month"; a free shop sees the template picker with the plan line and cannot send.
6. The Instagram card on Settings reads as "coming" until the connector is enabled; with the stub enabled in dev, a seeded DM shows in the inbox and "Create booking" opens the sheet prefilled with the handle and the message as the client note.
