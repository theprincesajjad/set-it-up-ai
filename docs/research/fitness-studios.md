# Fitness and wellness studios: yoga, pilates, boxing and martial arts, dance and bhangra, women-only gyms, small gyms

Market slug: `fitness-studios`. Written Oct 26, 2026 by the fitness-studios team (phase 3: research, Figma, build and verify in one pass).

Figma file: https://www.figma.com/design/jRTThq3slIQvZOGiBGU1SZ ("Local Loyalty — Fitness studios"). Frame screenshots (PNG): `/tmp/claude-0/-home-user-set-it-up-ai/5a1e2619-40bd-5f60-81fb-50d449557f59/scratchpad/figma/fitness-studios/`. Build screenshots beside them: `.../scratchpad/shots/fit-build/`.

Evidence tags: (S) sourced with a link, (C) read from our code, (E) estimate or practice we could not source, validate in pilot, (V) legal, tax or vendor-price point to verify with counsel, the CRA or the vendor before relying on it.

## 1. Who this is for

**The businesses.** One to three rooms and five to fifteen instructors, many of them contractors paid per class. The owner is usually also the head instructor, and the front desk is the owner, a part-timer or nobody. The product is a room at a time: a yoga or pilates studio (12 to 20 mats or reformers), a boxing or martial arts gym (10 to 30 students), a dance studio (bhangra, Bollywood, Zumba, kids' classes), a women-only gym or studio (small, often one room and a changeroom), and the independent gym that sells a membership and a few classes. Chains (Orangetheory, F45, GoodLife, Anytime, Club Pilates) are not the customer. In the GTA a large share of the independent studios serve South Asian and Muslim communities: bhangra and Bollywood fitness, women-only hours, Ramadan schedules, and members who need a room without men and without cameras (S: [Sister Fit](https://www.blogto.com/sports_play/2020/02/gym-muslim-women-toronto/) in Scarborough was opened as a women-only gym for Muslim women, non-Muslim women welcome; Mahila in Brampton and The Good Core in Scarborough are women-only studios listed on [Wellhub](https://wellhub.com/en-ca/search/partners/mahila-womens-only-gym/); the University of Toronto runs [women's-only gym hours daily](https://thevarsity.ca/2010/11/01/muslim-women-in-sports/) so that women can train in regular gear without headscarves).

**What they use and pay today** (US dollars, vendor pages move, re-check before quoting to a merchant) (V):

| Tool | Software price | Payment fee | Notes |
| --- | --- | --- | --- |
| Mindbody | Starter US$99 to $139 a month per location (sources disagree), Accelerate about $259 to $279, Ultimate about $499 to $699 (S: [Capterra](https://www.capterra.com/p/40229/MINDBODY/pricing/), [SchedulingKit](https://www.schedulingkit.com/pricing-guides/mindbody-pricing), [Koalendar](https://koalendar.com/blog/mindbody-pricing-costs)) | 2.99% + $0.30 card present, 3.6% + $0.30 online, a marketplace commission reported at 20% capped at $30 (FitBudd, third party) | 12 to 24 month contracts reported (S: [FitBudd](https://content.fitbudd.com/post/how-much-does-mindbody-cost)) |
| Momence | Basic about $20, Pro $60, no published list (S: [Capterra listing](https://www.capterra.co.uk/software/1011898/ribbon), [Findstack](https://findstack.com/products/momence/pricing)) | 1% per ticket on Basic, none on Pro; online card 3.9% + $0.30 (S: [OfferingTree](https://www.offeringtree.com/?p=39071)) | Built for yoga and pilates; sources disagree |
| Walla | from $320 flat per location, $599 Pro, unlimited users (S: [Capterra](https://capterra.com/p/265361/Walla/), [Walla vs Arketa](https://www.hellowalla.com/compare/arketa-2)) | Stripe on top | Branded app $149 a month plus $500 to build |
| Arketa | quote only, a solo plan at $49 reported, $300 to $600+ estimated; a 3% platform fee claimed by a competitor | | Verify |
| Glofox | "from $99", real all-in $110 to $600+ (S: [Recess](https://www.recess.tv/blog-posts/glofox-alternatives), [Vibefam](https://vibefam.com/glofox-pricing-2026/)) | | Pages do not publish tiers |
| ClassPass (as a channel) | no software fee; floor of 40% of the 10-pack rate by default in the experiences terms, the actual rate is confidential (S: [ClassPass partner terms](https://classpass.com/terms/experiences-partners), [Gymdesk](https://gymdesk.com/blog/classpass-for-business)) | Studio is paid monthly; late-cancel mirrors the studio's own window up to 12 hours; "One Spot, One Payment" if the freed spot is rebooked (S: [ClassPass](https://classpass.com/partners/blog/classpass-payouts-pricing-policies-rates)) | Every partner must take the free trial program |

Our reading: a studio with 40 to 100 members pays US$100 to $330 a month for software before processing, and a small independent that cannot justify that runs on a spreadsheet, a Stripe payment link and WhatsApp groups (E). That is the gap.

**GTA prices** (indicative; no official 2026 rate sheets found) (S, E): drop-ins $20 to $35, a 10-class pack $180 to $270, unlimited monthly $120 to $190 at mainstream yoga studios (S: [Toronto guide](https://thalira.com/blogs/quantum-codex/yoga-studios-toronto-complete-guide), a blog; [Yoga Tree listing](https://blogto.com/fitness/yoga-tree-dundas-toronto): $30 drop-in, $240 for 10, $150 unlimited, an older BlogTO line says $17.70). Mainstream community gyms: YMCA adult membership $53 to $61 a month on two location pages (S: [Scarborough Y](https://www.ymcagta.org/find-a-y/scarborough-ymca)). Women-only studios list $15 midday classes (The Good Core) and, through Wellhub, bundles at CA$159.99 to $329.99 a month for Sister Fit tiers (S: [Wellhub](https://wellhub.com/en-ca/search/partners/sister-fit-scarborough/)). Our demo prices (drop-in $25, 10-pack $180, intro 3 for $39, unlimited $129, four a month on a 3-month term $69) are inside these ranges and are editable.

**How classes are sold** (S, E): a drop-in for the curious, a class pack (5, 10, 20) with an expiry for the occasional member, an unlimited or limited monthly membership billed automatically for the regular, and an intro offer for new students (first class free, 3 classes for $39, or a 30-day unlimited), often limited to new clients and sometimes rolling into a membership (S: one studio's terms say intro offers auto-enrol into a membership: [Body Alive terms](https://bodyalivefitness.ipstudio.co/?p=11334)). We found no conversion benchmark for first-class-free offers; do not claim one (E).

**Retention.** Churn is early and fast. Sources agree half of cancellations come in the first 60 to 90 days; Zenoti says members who attend fewer than four times in their first month have an 80% probability of cancelling; boutique yoga and pilates annual churn is quoted at 20 to 40%, with monthly churn of 2% for the best and 3 to 5% on average (S, all vendor blogs, directional only: [Zenoti](https://www.zenoti.com/blog/hidden-revenue-leaks-fitness-center-ai-business-advisor), [JeriCommerce](https://blog.jericommerce.com/resources/yoga-pilates-studios-retention-statistics), [Loop](https://loop.fans/blog/boutique-gym-reduce-churn), [Uptivo](https://uptivo.fit/blog/gym-member-retention-statistics)). Product reading: the first month is the whole game, so the studio needs to see who has not come back, and the member needs an easy way to pause instead of cancel.

## 2. Evidence

### 2.1 Waitlists, late-cancel and no-show fees

- Software vendors suggest a late-cancel window of 2 to 24 hours, a smaller fee for a late cancel and a larger one for a no-show; waitlists promote automatically when a spot opens, because manual enforcement is inconsistent (S: [Glofox on cancellation policy](https://www.glofox.com/blog/fitness-class-cancellation-policy/)).
- Examples: a $20 no-show fee inside 12 hours; $15 late cancel and $20 no-show with a 12-hour window for membership and pack holders; $12 with a 12-hour rule, justified as protecting the waitlist (S: [NYC fees roundup](https://crinthecityy.substack.com/p/nyc-fitness-class-cancelation-fees), [Body by Simone FAQ](https://www.bodybysimone.com/la-faq)). 12 hours is the convention (ClassPass also caps its mirrored window at 12).
- Product reading: free cancel until N hours before (default 12), after that the credit is used; a fee only for a member with a saved card (an unlimited member loses nothing else by skipping), default $0 so a new studio is never harsh by accident; the studio can excuse a late cancel (ClassPass does the same for illness and accidental bookings); nobody is promoted into a class inside the last two hours, because a text two minutes before class is not a booking.

### 2.2 Ontario: gym, studio and "personal development services" contracts

Everything in this section needs counsel before launch (V). We could not open the statute text from e-Laws in this session (the pages did not render for our fetch tool), so the rules below come from the Ontario government's consumer page and law-firm and legal-information summaries. Sources: [Ontario.ca, Joining a gym or fitness club](https://www.ontario.ca/page/joining-gym-or-fitness-club) (page dated Aug 12, 2021), [Consumer Protection Act, 2002](https://www.ontario.ca/laws/statute/02c30) and [O. Reg. 17/05](https://www.ontario.ca/laws/regulation/050017), [LEGAL GUIDE: Personal Development Services](http://www.isthatlegal.ca/index.php?name=personal_development_services.consumer_law).

What the government page says (S):
- The Act covers gyms, sports clubs, martial arts, dance classes and similar "personal development services" when the contract requires $50 or more in advance. It does not cover not-for-profit or charitable clubs (the YMCA is the example), member-owned or co-operative clubs, clubs run or funded by a municipality or the Province, or services incidental to other services.
- A 10-day cooling-off right to cancel without a reason, counted from receiving a written copy of the contract (a legal guide adds: from the later of the copy and the day all services are available); the member can use the facility meanwhile; cancel in writing if possible; the contract cannot waive it.
- Initiation fees may not exceed twice the annual membership fee; the club must offer monthly instalments, which may cost up to 25% more than paying up front; money for a club that has not opened must be held in trust.
- The contract must include the member's name, the club's name and address, a full description of the services, cancellation and renewal conditions, the total amount, the number and amount of payments and any other charges, and start and end dates for each service and for the contract. If required information is missing the member can cancel within one year.
- A contract must end after one year. Renewal needs a notice sent 30 to 90 days before expiry with a copy showing all changes; a proper notice that is ignored lets the club renew and bill; a renewal without notice is not valid and the member can cancel and demand money paid after the original contract ended.
- A minimum service quality warranty applies.

Not confirmed from a primary source (V): cancellation rights for relocation, disability and death; the exact refund deadline (one guide says 15 days, a business summary says 30); whether a month-to-month "continuing" membership needs a renewal notice every month; whether a pack of classes is itself a "personal development services agreement" (we assume yes above $50 and cap its validity at a year); whether the Consumer Protection Act, 2023 (Bill 142, Royal Assent Dec 6, 2023, in force on a date to be proclaimed) is in force by launch ([Gowling WLG](https://gowlingwlg.com/en/insights-resources/articles/2023/ontario-s-new-consumer-protection-act), [Cassels](https://cassels.com/insights/ontario-introduces-new-consumer-protection-act/)), and what its regulations say for these services.

What the product does with it:
- A membership stores the exact agreement text the member read (studio, services, price, tax, payments, dates, term, how to cancel, renewal, freezes, late-cancel rule, the studio's own terms) and the time they accepted it. It is the "written copy": shown on the join screen, notified on payment, and readable any time under Passes. The join call must echo the hash of the text the member saw, so an offer cannot change under them.
- The 10-day cooling-off right is built: inside the window the member cancels in one tap and every paid period is refunded to the card. The end date is shown on the Passes screen.
- No term and no pack longer than a year (the API refuses; the form caps it).
- Fixed terms (3, 6, 12 months): a renewal notice is sent `renewalNoticeDays` (default 60, allowed 30 to 90) before the end; the membership renews only if a notice went out at least 30 days before the end and the member did not decline; otherwise it expires. The notice and the decline are in the app.
- Month to month: cancel any time in the app; it ends after the month already paid, no refund of the paid month, no further charge. This is our reading of how studios run monthly plans; whether it satisfies the Act without a renewal notice each month is the main question for counsel.
- Initiation fees do not exist in the product, so the 2x cap cannot be broken.

### 2.3 HST on memberships (V)

General fitness classes and gym memberships are taxable supplies in Canada, 13% in Ontario; instructors under the $30,000 small-supplier threshold need not register; genuine physiotherapy is exempt (S, secondary: [Lawyerinfo guide](https://lawyerinfo.ca/guides/money-taxes-ip/cra-tax-disputes/cra-gst-hst-audits-on-yoga-instructors-and-pilates-studios-in-canada/)). We found no primary CRA source and no confirmation of a children's recreation exemption; do not claim one. Product: tax is added only when the studio says it is registered (`merchants.taxRegistered`, the same switch tiffin and appointments use), per product `taxable` flag, on the price before the platform fee; late fees carry no tax in our model (counsel to confirm); the agreement shows price + HST = total.

### 2.4 Women-only rooms, privacy, photos, instructor gender

- Demand is real and specific: women who train without headscarves or covered windows, with women instructors, and no photos (S: Sister Fit, U of T hours above). Mixed institutions have refused it elsewhere (McGill declined women-only gym hours, S: [CTV](https://montreal.ctvnews.ca/mcgill-rejects-request-for-women-only-gym-hours-1.2289498)), so this is a studio's own decision, not a given.
- Legal footing (V): the Ontario Human Rights Code lets organizations run "special programs" for groups facing disadvantage without OHRC permission (s. 14, S: [OHRC guide](https://www.ohrc.on.ca/en/your-guide-special-programs-and-human-rights-code/why-are-special-programs-protected)); an older provincial report to the UN says the Code allows female-only services where needed for public decency or protection from abuse (S, dated: [CEDAW report](https://www.bayefsky.com/reports/canada/cedaw5/on_e.html)). We found no tribunal decision about a women-only gym. Counsel should confirm the wording a studio uses.
- Product: women-only is a property of a class (and a class type default), shown as a purple "Women only" capsule and a plain sentence on the booking sheet before the tap ("women instructor and members only, no photos or video in the room"). We do not collect or verify anyone's gender: the studio's rule is stated, the studio enforces it at the door. No member photos exist anywhere in the product (the roster, the door screen and the card show names, never pictures). The phone number is masked to the last four digits on every staff screen. Class photos or video are out of scope.

### 2.5 How a shared street loyalty card fits

Our network is one member card across every shop on the street (C: `docs/business/prd.md`). For a studio that means three things we already have and one we do not:
- The member card QR is the door check-in. Scanning it at the studio is the same gesture as at the café next door, and check-in awards the visit through the loyalty ledger (C: visit program, `awardOnCheckIn`).
- Network perks run network-wide and need no studio work (C: "visit 3 shops on the strip" bonuses, configured by the BIA/admin): a class counts as a shop visit, so "studio + juice bar + pharmacy" is a trail.
- The studio's free loyalty program (10 points a visit, a free drop-in at 100) is unchanged and free forever.
- Not built: a partner offer that crosses merchants ("checked in today, 10% off at the juice bar next door"). It needs cross-merchant promo logic and consent for the juice bar to see attendance; listed as an open item.

### 2.6 Current build, read against the market (audit)

| Existing piece | Verdict | Reason |
| --- | --- | --- |
| Appointments: staff calendar, services, deposits, card on file, no-show fee (`services/appointments*.ts`) | **Keep as is** | Right for personal training and 1:1 sessions; classes are a different shape (many people, one slot, a pass pays) so they get their own tables rather than bending appointments |
| Stripe saved method, off-session charge, SetupIntent, webhook dispatch by `ll_kind`, fake provider (`services/payments.ts`, tiffin) | **Reuse** | Same recurring-billing mechanics as tiffin: one charge row per period, advance on paid, retry, card change. `class` and `class_setup` kinds added to the dispatcher (two lines) |
| `notifyCustomer` / outbox / quiet hours / customer prefs | **Reuse** | All class messages go through it; push by default, SMS only for a waitlist spot and a failed payment |
| `computeFees`, legal fee tokens, `FEES` | **Change** | New kind `class` at 1%; legal table and token tests updated |
| Member card QR and counter lookup (`staff.ts`, `QR_PAYLOAD_PREFIX`) | **Reuse** | Door check-in resolves the same `LL:` code, member code or phone |
| `awardPurchase` (visit/stamp programs) | **Reuse** | Check-in awards the visit with an idempotency key per booking |
| `fitness` vertical template (per-visit 10 points, free drop-in reward at 100) | **Keep** | Already matches; upsell plan `plus` already says so |
| Dashboard nav and feature gating (`nav.ts`) | **Change** | A fitness studio's sidebar shows Class schedule, Memberships & passes, Door check-in; Orders, Menu, Pickup slots and Discount cards are hidden for it (Tickets only if it bought them) |
| Pickup and drop-off slots, order-ahead, tickets for a studio | **Cut from the studio sidebar** | No job; still available to shops that buy them |
| Tiffin subscription tables | **Not reused as data** | A membership has terms, freezes, a cooling-off right and an agreement; forcing it into tiffin plans would hide both products' rules |

## 3. Jobs to be done

Ranked by frequency times pain.

1. **Owner: "Fill the room and not overbook it."** Spots left per class, a waitlist that fills itself, one place to see who is coming. (Daily, high pain: WhatsApp groups and spreadsheets.)
2. **Member: "Book tonight's class on the bus and know what it costs me."** Spots left, women-only, the pass in use and the cancel rule above the button. (Daily.)
3. **Owner: "Get paid every month without chasing."** Memberships that bill the card on file, retry, tell the member, and show me who failed. (Monthly, high pain.)
4. **Instructor/front desk: "Get 16 people in at 6:25 without 'am I on the list?'".** Scan the card, see the pass, mark attendance, handle the exceptions in one line. (Every class.)
5. **Owner: "Stop late cancels and no-shows from killing a class."** A window, a small fee for members, the credit forfeited for pack holders, excuse in a tap. (Weekly.)
6. **Owner: "Convert the curious."** An intro offer for new students that cannot be reused, and a free first class if wanted. (Weekly, growth.)
7. **Member: "Pause instead of cancelling"** for travel, injury, Ramadan or a baby, and cancel by myself without calling. (Monthly, retention.)
8. **Owner: "Be lawful without a lawyer on every sign-up."** The agreement, the cooling-off refund, the renewal notice, stored. (Every sign-up.)
9. **Women-only studio: "Say it clearly and keep it private."** The rule on the class, no pictures, masked numbers. (Every booking.)
10. **Owner: "See whether it is working."** Active members, monthly recurring, cancels in 30 days, fill, waitlist, late cancels. (Weekly.)

## 4. What we build and why

Every piece maps to a job above. Anything that maps to none is in section 5.

| Piece | Job | Where |
| --- | --- | --- |
| Class schedule: class types, weekly repeats, capacity, women-only, instructor, week view with fill and waitlist | 1, 9, 10 | Frame 01, dashboard `/classes` |
| Roster: who is booked and how each paid, check-in, no-show, excuse, add a member or a guest, waitlist with Move up, cancel the class (credits back) | 1, 4, 5 | Frame 02, `/classes/[sessionId]` |
| Waitlist that promotes automatically (first with a usable pass, never inside 2 hours, no one promoted who has nothing to use) | 1, 2 | `promoteWaitlist` |
| Offers: drop-in, class packs (expiry at most a year), intro offers (new students only, once), memberships (unlimited or N a month, month to month or a 3, 6, 12 month term) | 3, 6 | Frame 03, `/classes/offers` |
| Membership billing: first payment with the agreement, saved card, monthly off-session charge, retries on day 2 and 5, past due blocks booking, card change retries at once, Pay now | 3 | `class-memberships.ts` |
| Freeze (up to N days, M times a year, dates move, nothing billed) | 7 | Passes screen, studio can also freeze |
| Cancel: cooling-off full refund; otherwise end of paid month (term: end of term); keep my membership; do not renew; renewal notice job | 7, 8 | Frames 07 and 08 |
| Late-cancel rule and fee, excuse | 5 | Settings (Class rules), roster |
| Door check-in by card, code or phone; outcomes for not booked, no pass, class full, past due; visit points | 4 | Frame 04, `/classes/door` |
| Desk sale of a pack or intro offer by hand (cash, e-transfer, card reader), 0% fee | 3, 6 | `Record a desk sale` |
| Customer schedule, booking sheet, waitlist, packs, join with agreement, Passes | 2, 7, 8, 9 | Frames 05 to 08, `/shops/[slug]/classes`, `/me/classes` |
| Studio numbers | 10 | Stat blocks on schedule and offers pages |
| Seed: Sakina Studio (women-only, Ridgeway Plaza) and Rise Yoga Studio | demo | `seed/classes.ts` |

**Pricing decision (follows the founder's decision to keep today's plan structure).** Classes and memberships go inside **Café & Retail ($39 a month, $390 a year), as two feature keys, `booking.classes` and `memberships.recurring`**, both Plus, both shipping hidden like every paid feature, unlocked for pilot studios with an admin override (the demo seed does this). No new plan, no Studio pack, no add-on.

- Why Plus: appointments are already there (salons, barbers, studios); a studio's cost to serve is the same shape (push reminders, Stripe fees), and the 500 included texts are enough because class reminders are push and only a waitlist spot and a failed payment send a text (E).
- Why not Pro ($99): tickets, quotes, deposits and invoices are repair features a studio does not need.
- Why not an add-on: the add-on system exists for the restaurant subscription (`merchant_add_ons` need a live restaurant plan, C); building a second add-on path for one module costs more than it earns. A per-seat or per-room charge would punish the owner for growing.
- Why two keys: classes can be sold without memberships (a studio that only sells packs) and rollout can flip them separately.
- **Fee: 1% on online class money** (`FEES.classBps = 100`): drop-ins, packs and intro offers paid by card, every membership charge, and late-cancel or no-show fees on a saved card; card processing at cost on top. **Nothing on money taken by hand at the desk** (cash, e-transfer, card reader; kind `manual`, 0%). It is the same rate as tiffin and for the same reason: recurring billing, retries and cancellations are work we do, and it is the only place we earn beyond the $39.
- What it costs a studio (E, before Stripe): $39 + 1% of online sales. A studio taking $3,000 a month online pays about $69; at $9,420 of recurring revenue about $133. Against the table in section 1 that is below Mindbody and Walla throughout, near Momence Pro at the top end and well under Glofox's all-in estimate; it is meant to win the small independent first. Check the competitors' pages before publishing any comparison.
- Updated: `packages/shared/src/plans.ts` (two features, `FEES.classBps`, Plus blurb and "bestFor"), `packages/shared/src/legal-tokens.ts` (`{{fee.classes}}` and the row in `{{table.fees}}`, so the merchant agreement shows it), `apps/api/src/services/fees.ts` (kind `class`), `apps/api/test/legal-fees.test.ts`, `docs/business/pricing.md`.

## 5. What we deliberately don't build

- **Waivers and liability forms.** Every studio has one, but the legal text is the studio's and a wrong template is worse than none. Open item; the agreement screen shows the studio's extra terms.
- **Equipment or spot selection** (reformer 7, bike 12). Valuable for pilates and cycling; a second booking dimension. Open item.
- **Instructor pay, payroll, substitutions, a marketplace listing, ClassPass or Wellhub integration.** Different customers and contracts.
- **Gender verification, face or photo checks.** We state the rule and the studio enforces it; checking sex or religion is not something we should hold.
- **Class photos, video-on-demand, streaming.** Privacy-first; no job in the research.
- **Initiation fees, family plans, kids' classes, prorated joins, pay-as-you-go credits that roll over.** Each is a rule set of its own (and kids' recreation has its own tax question); add after the pilot shows who asks.
- **SMS class reminders for everyone.** Push is free; texts are for a waitlist spot and a failed payment.
- **Pre-open memberships and the trust-account rule.** If a studio sells before it opens, Ontario requires the money be held by a trust corporation (S, Ontario.ca). We do not support pre-opening sales; the studio should sell once it is open.
- **A cross-merchant partner offer** (see 2.5). Open item.
- **Customer mobile app screens.** The web pages work at 390 and are linked from the app's shop page later; the mobile counter already scans member cards. Open item.

## 6. Design

Figma file: https://www.figma.com/design/jRTThq3slIQvZOGiBGU1SZ. Dashboard frames at 1440 (monochrome, one accent, hairlines, Bricolage Grotesque and Inter, the existing dashboard primitives), customer frames at 390. Each has a yellow "Why this exists" note beside it that maps it to a job.

| # | Frame | Job | PNG |
| --- | --- | --- | --- |
| 01 | Class schedule (week, capacity bars, waitlist, women-only) | 1, 9, 10 | `01-schedule-v2.png` |
| 02 | Class roster (how each person paid, check-in, waitlist with Move up) | 1, 4, 5 | `02-roster-v1.png` |
| 03 | Memberships and passes (offers, numbers, needs attention) | 3, 6, 10 | `03-memberships-v1.png` |
| 04 | Door check-in (scan result, the exceptions list, arrivals) | 4 | `04-door-checkin-v1.png` |
| 05 | Customer: studio schedule | 2, 9 | `05-schedule-m-v1.png` |
| 06 | Customer: book a class (what you will use, the cancel rule, women-only note) | 2, 5, 9 | `06-book-m-v1.png` |
| 07 | Customer: passes and membership (price, next payment, contract, cooling-off, freeze, cancel) | 7, 8 | `07-passes-m-v1.png` |
| 08 | Customer: join a membership (the agreement before the card) | 8 | `08-agreement-m-v1.png` |

Iterations: frames 1 and 2 were rebuilt once after the first screenshots showed collapsed auto-layout rows; the instructor lines and the sidebar labels were fixed in a second pass; the address was changed to a fictional one.

### Mobbin references

Mobbin search returned fitness and subscription screens from other categories; we cite what taught us something.
- WHOOP "Downgrade membership": https://mobbin.com/screens/94d55e74-7fa2-41aa-bd76-0fdae58207f9. A plain sentence under the buttons states when the membership renews and at what price; "Keep" is the loud button, "Downgrade" the quiet one. We put the renewal date and price on the membership card and keep Cancel as quiet red text.
- Public "Billing plan": https://mobbin.com/screens/c77d253b-e7e7-43fa-996b-f9061d7ce7ab. A small card with price, next billing date and a red "Cancel Premium" link. Our membership card has the same three facts in the same order.
- Google Health (Fitbit) "Cancel membership": https://mobbin.com/screens/b84fff39-a02f-44aa-84ab-bf7531d54213. Billing details and a destructive row at the end of a settings list. We kept cancel one tap deep, not buried.
- Fresha "Join the waitlist": https://mobbin.com/screens/f0d70080-560a-45b4-92d0-36b906228356, Luma "Joined Waitlist": https://mobbin.com/screens/a1c672f9-d4d3-4326-bc8d-26f867e223b3, Monzo "You're on the list": https://mobbin.com/screens/33422f88-6005-4d3c-9c7f-53c065022821. Waitlist confirmations that say what happens next and let you leave. Ours says "You are number 3. We book you automatically if a spot opens", and the card has "Leave waitlist".
- Nike Training Club "Scheduled": https://mobbin.com/screens/39948017-3572-4085-a412-e9e923b3c303 and Insight Timer "Reserve now / Only 4 spots": https://mobbin.com/screens/db876189-00ce-45ea-9c27-714317cba4a7. Date and time first, then the title, then the remaining spots at the bottom next to the primary action. Our class card: time in accent, name, instructor, spots left and the button on one row.
- No result showed a gym check-in desk screen; frame 04 is our own, from the counter's lookup pattern.

## 7. Build spec (what was built)

Built in this pass. Migration `packages/db/migrations/0024_fit.sql` (eight tables: `class_settings`, `class_types`, `class_sessions`, `class_products`, `class_passes`, `class_memberships`, `class_bookings`, `class_charges`; no changes to existing tables). Generated in isolation so it holds only these tables.

### 7.1 Shared

- `packages/shared/src/plans.ts`: features `booking.classes` and `memberships.recurring` (Plus, phase 2, unlock at 100 merchants, hidden), `FEES.classBps = 100`, Plus blurb and `bestFor`. `packages/shared/src/legal-tokens.ts`: `fee.classes`, a row in `table.fees`.
- `packages/shared/src/api/classes.ts` (`classesApi`): every request schema and response type; constants `COOLING_OFF_DAYS = 10`, `MAX_TERM_MONTHS = 12`, `MAX_PACK_VALID_DAYS = 365`, renewal notice 30 to 90 days, hold 10 minutes, default window 12 hours.
- Messages: `cl.msg.*` (15 notifications) and `cl.ui.*` (107 customer strings) in en, hi, ur, pa.
- `customerApi.DataExportModules`: optional `classBookings`, `classPasses`, `classMemberships`, `classCharges`.

### 7.2 API (`apps/api/src`)

- `services/classes.ts`: settings, types, sessions (weekly series on the same wall-clock time), capacity under a row lock, credit choice (membership that covers the day and has classes left, then the pass that expires first, else a held drop-in), waitlist promotion, cancel rule, late fee, roster, move waitlist, excuse, door check-in, reminders, public page.
- `services/class-memberships.ts`: offers, agreement text and hash, pack purchase, desk sale, join, webhook entries (`onClassPayment`, `onClassSetup`), billing roll, freeze, cancel (cooling-off, end of month, end of term), keep, decline renewal, pay now, card change, studio members list and numbers.
- `routes/classes/index.ts`; jobs `classes.reminders` (5 min), `classes.hold_expiry` (1 min), `classes.memberships` (10 min); `services/payments.ts` dispatches `ll_kind` `class` and `class_setup`; `services/fees.ts` kind `class`; `services/privacy-scrub.ts` and `services/data-export.ts` reach the new tables; `services/notifications.ts` maps `class_reminder` to the booking reminder type.
- Endpoints (all under `/v1`): merchant `GET|PUT /merchants/:id/classes/settings`, `GET|POST /types`, `PATCH /types/:id`, `GET|POST /sessions`, `PATCH /sessions/:id`, `POST /sessions/:id/cancel`, `GET /sessions/:id/roster`, `POST /sessions/:id/bookings`, `POST /bookings/:id/check-in|mark|move`, `POST /check-in`, `GET /door`, `GET|POST /products`, `PATCH /products/:id`, `POST /sales`, `GET /summary`, `GET /members`, `POST /memberships/:id/cancel|freeze`; public `GET /public/shops/:slug/classes`; customer `GET /me/classes`, `POST /me/classes/bookings`, `POST /me/classes/bookings/:id/cancel`, `POST /me/classes/purchases`, `GET /me/classes/products/:id/agreement`, `POST /me/classes/memberships`, `POST /me/classes/memberships/:id/freeze|cancel|keep|decline-renewal|pay|card`. Documented in `docs/engineering/api/classes.md`.

### 7.3 Web

- Dashboard: `/m/[id]/classes` (schedule), `/classes/[sessionId]` (roster), `/classes/offers` (offers, members, billing issues), `/classes/door` (check-in); components in `components/dashboard/classes/`; logic in `lib/dashboard/classes.ts`; nav keys `classes`, `class-offers`, `class-door` (`lib/dashboard/nav.ts`), front-desk staff get the schedule and the door.
- Customer: `/shops/[slug]/classes` (`components/pass/ClassSchedule.tsx`), `/me/classes` (`components/pass/ClassPasses.tsx`); all strings through `t()`.

### 7.4 Acceptance checks (all automated, see the report for counts)

API tests (`apps/api/test/classes.test.ts`): pricing and gating; weekly series across the clock change; offer validation (a pack needs classes and days, an intro offer must be a pack, nothing longer than a year); pack credit used, returned on an early cancel, forfeited on a late one, restored on excuse; drop-in hold, payment, lapse, the 1% fee; HST only when registered; intro offer once; no pass; reminders once; four people racing for two spots; waitlist skip and cutoff; staff move up, guest above capacity, class cancel gives every credit back; agreement shown and hash required; first payment activates; classes per month limit; renewal off-session and idempotent; a declined renewal makes it past due, blocks booking, retries on day 2, a new card fixes it; cooling-off refund; month-to-month cancel; fixed term notice, renew and expire; no notice means expire; freeze moves the dates and releases classes, limits; late fee charged once, refunded on excuse, no-show; door check-in outcomes; desk sale with no fee; permissions.

## 8. Open items for the founder, counsel and the pilot

1. **Counsel:** the whole of section 2.2 (renewal notices on month-to-month plans, relocation, disability and death, refund deadline, whether packs are agreements, the Consumer Protection Act, 2023), the HST treatment of late fees and children's programs, and the women-only wording. The agreement text is English only until counsel signs off the wording.
2. **Pilot three studios** (a yoga studio, a women-only studio, a bhangra or boxing studio) before flipping `booking.classes` to beta. Measure: first-month attendance of new members, intro-offer conversion to a membership, failed-payment recovery, late-cancel fee complaints.
3. Customer mobile screens, merchant CSV export of class data, equipment or spot booking, waivers, a cross-merchant partner offer, translating the agreement.
4. The default late fee is $0 and the default window 12 hours: confirm with pilot owners.
