# Marketing site (web)

Next.js static pages, same token system, Fraunces allowed for display headlines. Max content
width 1200, generous whitespace (sections 80-96 px vertical on desktop, 48-64 on mobile).
Photography per brand.md section 6. Every page: top nav (wordmark · For shops · For shoppers · For
BIAs · Pricing · Sign in · primary "Get started free"), footer (links, "Made in Toronto", contact
`BRAND.supportEmail`, Terms, Privacy, "Accessibility"), cookie-free analytics (no consent banner needed).

Pages: `/` (merchants), `/shoppers`, `/bia`, `/pricing`, `/neighbourhoods` (where we are), `/legal/*`.

## 1. `/` Landing for merchants

1. **Hero:** left: overline "FOR INDEPENDENT SHOPS IN TORONTO", `hero` Fraunces 56 "Your regulars
   already walk this street.", body-lg "A free loyalty program for your shop, shared with every
   shop on your block. We set it up for you in 20 minutes." Primary lg "Get started free", secondary
   "Book a 20-minute visit". Trust line `caption`: "Free forever · No fee on loyalty · Unlimited
   locations". Right: photo of an owner at the counter with the QR stand visible, and a floating
   phone showing the counter success card ("Added 1 stamp · 9 / 10").
2. **Three-up "How it works":** 1. "We set you up" (rep visit, template for your type of shop). 2.
   "Customers join at the counter" (scan the stand, no app, 30 seconds). 3. "They come back" (rewards
   at your shop, discovery across the street). Each with an illustration.
3. **Counter speed proof:** short looping video/GIF (muted, poster image, respects reduced motion:
   static image) of the 3-second award + "Phone number, tap, done. Under 5 seconds, even when the
   Wi-Fi isn't."
4. **The network:** illustrated street map with 8 shop pins; copy "One card for the whole street.
   When someone joins at the café, they discover the bakery and the repair shop too."
5. **Built for your kind of shop:** tabs/chips by vertical (Cafés, Bakeries, Pharmacies, Repair,
   Auto, Salons) showing the default template ("10 stamps = free drink"; pharmacy: "Front-store points
   only. Prescriptions never earn, as Ontario rules require.").
6. **Free means free:** comparison table (us vs "typical loyalty apps"): monthly fee $0 vs $49-299,
   transaction fee 0% vs up to 5%, locations unlimited vs per location, setup done for you vs DIY. Do
   not name competitors.
7. **Testimonial** (pilot shop quote + photo + shop name/street) when available; until then omit
   the section (never fake quotes).
8. **FAQ** (accordion): "Is it really free?", "How do you make money?" (honest: optional paid tools
   later, like order-ahead and repair approvals, plus sponsored spots shops can choose to buy),
   "Do I need a POS integration?", "What about my customers' data?", "Can I leave?" (yes, export
   everything as CSV).
9. **Final CTA band** (pine bg, `onBrand` text, wordmark-inverse): "Get your shop on the street's
   card." Primary (white fill, pine text) "Get started free".

## 2. `/shoppers` Landing for customers

- Hero: `hero` "One card for every shop on your street." body "Earn rewards at the local places you
  already love. Free, and your points never expire." Primary "Find shops near me" (→ `/neighbourhoods`),
  App Store / Google Play badges, caption "Or just scan the QR at any participating shop."
- How it works (3 steps: scan or give your number, earn, get rewards), Map preview of the live
  neighbourhood, "Your data" trust block ("Shops see only their own customers. We never sell your
  data. Offers only if you say yes."), FAQ.

## 3. `/bia` For BIAs

- Hero: "Proof that your street events bring people in." Sub: "Run a neighbourhood points weekend
  or passport through one app your shops already use."
- Blocks: Passport week example (visual of the passport grid), the report a BIA gets (mock chart:
  visits per shop per day, redemptions, new members during the event), pricing "$1,500-3,000 per
  campaign" (from the business plan, labelled "Typical campaign"), "We do the setup with your shops",
  CTA "Talk to us" (contact form: name, BIA, email, phone, message).

## 4. `/pricing`

Above the fold, centred: `display` "Free forever. No fee on loyalty. Unlimited locations." Sub:
"Every loyalty feature, for every shop. Paid tools come later, and only if you want them."

Plan cards (3 columns lg, stacked mobile, Free first and visually primary):

| | Free | Plus | Pro |
| --- | --- | --- | --- |
| Badge | "Every shop" (brand) | "Coming soon" (neutral, lucide:sprout) | "Coming soon" (neutral, lucide:sprout) |
| Price | `$0` `display` + "forever" | `$39` /month (fgMuted) "Planned price" | `$79` /month (fgMuted) "Planned price" |
| Blurb | `PLANS.free.blurb` | `PLANS.plus.blurb` | `PLANS.pro.blurb` |
| Best for | Every merchant | Cafés, Restaurants, Bakeries, Retail | Repair, Auto, Alterations, Print shops |
| CTA | primary "Get started free" | tonal "Notify me" | tonal "Notify me" |
| Card style | 2 px `brand` border, `shadow.md` | 1 px dashed `borderStrong`, no shadow | same as Plus |

- Free feature list = all `FREE_FOREVER` features grouped (Loyalty, Promos, Network, Customers,
  Integrations, Team) with leaf checks.
- Plus/Pro feature lists from `FEATURES` by `minPlan`, prefixed "Includes everything in Free, plus:".
- Under the cards: "Paid tools switch on once enough shops are on the network, so every feature
  launches with customers already using the app." + progress bar "112 of 150 shops" (live from a
  public endpoint; hide the bar if unavailable).
- "Payments" line: "In-app payments (Plus and Pro): Stripe's standard fee plus 0.75%. The Free plan
  has no payments and no fees."
- **Promise box** (`brandSubtle`, lucide:shield-check): "Our promise: a feature that's free today
  stays free. Loyalty will never move to a paid plan."
- When a plan becomes available (`isPlanAvailable`), its badge disappears, price turns `fg`, CTA
  becomes primary "Start Plus" and the annual toggle appears ("2 months free").
- FAQ: same as billing page + "Do you take a cut of my sales?" "No. Zero transaction fees on Free."

## Shared

- Lighthouse >= 95 performance/accessibility on mobile. Images `next/image`, AVIF/WebP, lazy below
  the fold. No carousels that auto-advance.
- Forms: "Get started free" → merchant sign-up (phone OTP → wizard); "Book a visit" → form (shop
  name, address, owner name, phone, best time) → confirmation "A rep will call you within 1 business
  day."
- Bilingual-ready (fr-CA later): no text baked into images.
