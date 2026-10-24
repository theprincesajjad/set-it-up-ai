# Niche Playbooks

Last updated: Oct 21, 2026

One file per kind of shop. Read the one you need on the walk over (about 5 minutes each).

| Playbook | Template in product | Wave | Later plan |
| --- | --- | --- | --- |
| [cafes.md](cafes.md) | `cafe`: stamps, 10 for a free drink | 1 | Plus |
| [bakeries.md](bakeries.md) | `bakery`: stamps, 8 for a free pastry | 1 | Plus |
| [grocery-convenience.md](grocery-convenience.md) | `grocery`: 1 pt/$, $5 off at 500 | 1 | Plus |
| [barbers.md](barbers.md) | `barber`: stamps, 8 for a free cut | 2 | Pro |
| [salons-spas.md](salons-spas.md) | `salon`: 10 pts/visit; `spa`: 1 pt/$ | 2 | Pro |
| [fitness-studios.md](fitness-studios.md) | `fitness`: 10 pts/visit, free drop-in at 100 | 2 | Plus |
| [pharmacies.md](pharmacies.md) | `pharmacy`: front store only, 1 pt/$ | 2 | Plus |
| [restaurants.md](restaurants.md) | `restaurant`: 10 pts/$ | 3 | Plus |
| [bars-pubs.md](bars-pubs.md) | `bar`: 5 pts/$ on food, alcohol no-earn | 3 | Plus |
| [retail-boutiques.md](retail-boutiques.md) | `retail`: 1 pt/$ | 3 | Plus |
| [bookstores-gift.md](bookstores-gift.md) | `bookstore`: 1 pt/$, $5 off at 200 | 3 | Plus |
| [florists.md](florists.md) | `florist`: 1 pt/$, free stem at 100 | 3 | Plus |
| [pet-stores-groomers.md](pet-stores-groomers.md) | `pet`: 1 pt/$ | 3 | Pro (groomers) / Plus (stores) |
| [phone-computer-repair.md](phone-computer-repair.md) | `repair_electronics`: 1 pt/$ | 4 | Pro |
| [auto-shops.md](auto-shops.md) | `repair_auto`: 1 pt/$, welcome 100 | 4 | Pro |
| [alterations-dry-cleaning.md](alterations-dry-cleaning.md) | `alterations` / `dry_cleaning`: 1 pt/$ | 4 | Pro |
| [print-shops.md](print-shops.md) | `print_shop`: 1 pt/$ | 4 | Pro |
| [franchises-multi-location.md](franchises-multi-location.md) | Any template, unlimited locations | Founder-led | Plus/Pro |

Templates come from `packages/shared/src/verticals.ts`. Pick the vertical in the rep console and the program, rewards and categories are filled in for you. You can adjust numbers with the owner, but **never** switch on earning for a no-earn category (prescriptions, pharmacy services, alcohol, tobacco, lottery, gift cards).

---

## The universal demo (90 seconds)

Every playbook tweaks this. Have the demo merchant loaded on your phone before you walk in.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:20 | Scan the demo QR stand with your own phone. Wallet pass appears | "This is your customer. No app. Phone number or scan, done." |
| 0:20–0:35 | In the staff view, type a phone number and award a stamp/points | "This is your staff. Five seconds, any phone or tablet you already have." |
| 0:35–0:55 | Open the network map on the customer side, showing other shops on this street | "And this is why it works. Your customers see the bakery, the barber, the bookstore. Their customers see you." |
| 0:55–1:15 | Owner dashboard: members, visits, top customers, a double-points promo | "You see who your regulars are and what brings them back." |
| 1:15–1:30 | Back to the owner | "It's free. No fee per sale, no contract. I can set yours up right now in 20 minutes." |

## The universal objection bank

Each playbook has niche versions. These are the base answers.

**"What's the catch? How do you make money?"**
> "Fair question. Loyalty is free forever. That's written policy, and anything free today stays free. Later we'll offer optional paid tools for shops that want them, like order-ahead or repair approvals, and paid promos on the network for shops that want more reach. You never have to buy any of it. We only make money if the network is big, so our job is to make your program busy."

**"My customers won't download an app."**
> "They don't have to. They join with a phone number or a QR scan and get an Apple or Google Wallet card. The app is there if they want it."

**"I don't want another tablet."**
> "You don't need one. Staff use the phone or tablet you already have, or the points land automatically from your POS if it's connected. The only new thing on your counter is a small QR stand."

**"I already use paper punch cards."**
> "That means you already know it works. We keep what your customers like (the stamps, the free item) and drop the lost cards and the cheating. Bring your regulars over: if someone shows you a half-full paper card, we add those stamps to their digital card."

**"I already use SoPoints."**
> "Lots of good shops do. Two differences: we charge no fee on loyalty at all, and we do the setup for you. Their free plan listed a 5% fee when we last checked their pricing page (Oct 2026; I'll show you the page). We'll move your members over for free." Use [../scripts/sopoints-switch.md](../scripts/sopoints-switch.md).

**"I already use Square Loyalty."**
> "Keep Square. We connect to it so points land automatically, and you drop the Square Loyalty subscription, which is priced per location (from about $60/month per location when we last checked; let's look at your bill)." Use [../scripts/square-loyalty-users.md](../scripts/square-loyalty-users.md).

**"I already use Stamp Me / Loopy / a wallet stamp card."**
> "Same no-download experience your customers like. The difference is the street: your card sits next to 30 other shops on this strip, so customers find you. And it's free."

**"I don't have time."**
> "That's exactly why we do it for you. Twenty minutes today, or I come back at your quiet hour. What time works?"

**"Send me something / I'll think about it."**
> "Of course. What would you need to see to say yes? … Let me book 20 minutes Thursday at 2 so you can see it running on your own counter."

**"Pharmacy regs." (and other regulated products)**
> "Built in. Prescriptions and pharmacy services can't earn points or discounts in Ontario, so the template blocks them. Points only work on front-store items." Same idea for alcohol, tobacco, vapes and lottery: set to no-earn.

**"What about my customers' data?"**
> "Your customers are your customers. You see your members, you can export them any time, and other shops can't see your list. Customers can mute any shop. Email only goes to people who opted in."
