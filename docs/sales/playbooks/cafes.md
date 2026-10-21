# Playbook: Cafés

Template: `cafe` · Wave 1 (traffic anchor) · Later plan: Plus · Last updated: Oct 21, 2026

**Why they matter:** cafés are the heartbeat of the network. Same people, every day. A busy café can hit 25 active members in two or three days, and every one of those members then sees the rest of the street in their wallet. **Sign the best café on the strip first.**

## Who to talk to & when

- **Decision maker:** the owner. Often works the bar on weekends or opens early on weekdays. The shift lead can't sign but can tell you when the owner is in. Get their name.
- **Best time:** weekdays **2:00–4:00 pm**. The after-lunch lull.
- **Never:** 7:00–10:00 am (morning rush) or 12:00–1:30 pm. Saturday mornings are the worst.
- **Tip:** buy a drink. Pay, tip, then ask "Is the owner around?" You're a customer first.

## Their world & pains

- Margins are thin; a $5 latte leaves little room for discounts.
- Third-wave cafés compete with chains that have big app programs (Tim Hortons, Starbucks).
- Paper punch cards get lost, faked, or stuffed in a wallet and forgotten.
- They know their regulars by face and drink, not by name or phone number. They have no way to reach them.
- Staff turnover is high; anything new has to be learnable in one shift.

## Current tools they use

- POS: Square (very common), Toast, Lightspeed, Clover, TouchBistro, Shopify POS.
- Loyalty: paper punch cards (most common), Square Loyalty, SoPoints, wallet stamp cards (Loopy, Stamp Me-type), sometimes nothing.
- Order-ahead: Ritual, Uber Eats/DoorDash/Skip for delivery.

## Pitch angle

> "Your regulars come in every day. Right now you know their drink but not their name, and you can't reach them on a slow Tuesday. This turns your punch card into a digital one, for free, and puts you on the map every other shop on this street is on."

Lead with: **free, no fee per sale, set up in 20 minutes, no app for customers.** Then the network.

## 90-second demo

1. Scan the demo café QR stand. Wallet pass shows "1 of 10 stamps" (the welcome stamp). *"Your customer's first stamp is free when they join."*
2. Staff view: type a phone number, tap **+1 stamp**. *"Five seconds. Faster than finding a paper card."*
3. Show the card at 9/10, then redeem **Free drink**. *"The reward pops up on its own. No arguing about stamps."*
4. Network map: other shops on the street. *"Someone who joins at the bakery next door sees you here."*
5. Dashboard: "Members this week", "Top regulars". Post a "Double stamps Tuesday 2–5 pm" promo. *"Fill your slowest hours."*

## Objections & answers

**"I already use paper punch cards."**
> "Keep the idea, lose the paper. Customers with a half-full card get those stamps added on the spot. Tell people 'last week for paper cards' and you've moved them in a week."

**"I already use SoPoints."**
> "On a $5 latte, a percentage fee adds up fast. We charge no fee at all and move your members over for free." Use [../scripts/sopoints-switch.md](../scripts/sopoints-switch.md). Re-verify their current fee first.

**"I already use Square Loyalty."**
> "Keep your Square. We connect to it, so stamps land when you ring up the sale, and you can cancel the Square Loyalty add-on." Use [../scripts/square-loyalty-users.md](../scripts/square-loyalty-users.md). Confirm the Square connector is live first.

**"I use Stamp Me / Loopy."**
> "Same no-download card. The difference is that yours sits next to the bakery, the barber and 30 other shops, so new people find you."

**"I don't want another tablet."**
> "No tablet. Use the iPad your Square runs on, a staff phone, or let it award from the POS. All that's new is a small QR stand by the register."

**"My customers won't download an app."**
> "They won't have to. Phone number or QR scan, and the card lives in Apple or Google Wallet."

**"What's the catch?"**
> "No catch on loyalty. It's free forever. Later we'll offer optional order-ahead for cafés that want it. You never have to buy it."

**"Free drinks will cost me money."**
> "One free drink after ten paid ones is a 10% thank-you to your best customers, and it's the same thing your paper card does now. You can set it to 12 if you like."

**"My staff will forget to ask."**
> "That's the most common reason programs fail, so we fix it in launch week: a one-line script, double stamps for customers, and I check in on day 7."

## Recommended program

| Setting | Template default | Notes |
| --- | --- | --- |
| Earn type | Stamps, 1 per visit | Matches the mental model of a punch card |
| Goal | 10 stamps → **Free drink** | 8 for a premium café with a $6+ average; 12 if margins are tight |
| Welcome bonus | 1 stamp | Customer starts at 1/10. Feels like progress |
| Categories | Drinks, Food (both earn) | |
| Optional | Birthday reward (free pastry), VIP level at 50 visits (double stamps) | Both free features |
| Minimum spend | Consider $3 | Stops "one stamp per drip coffee refill" games |

## Launch-week promo

- **Double stamps all launch week** (street-wide double points).
- "Bring your paper card, we'll transfer it." Plus 1 bonus stamp for transferring.
- Counter sign: "Join in 10 seconds, get your first stamp free."
- Target: **25 members by day 3, 75 by day 30.**

## Future upsell (Plus, when it opens)

Watch for these signals and note them in the rep console:

- Line out the door at 8 am; customers leaving the line.
- They pay commission to Ritual or a delivery app for pickup orders.
- They ask "can people order ahead?" or "can I text my regulars?"

Plus pitch (later): order-ahead and pickup with "Ready" alerts, SMS to opted-in members, and push promos to network members nearby. No per-order commission; card payments carry the Stripe fee plus a small platform fee.
