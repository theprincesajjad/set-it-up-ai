# Square Loyalty Users: "Keep Square, drop the fee"

Last updated: Oct 21, 2026 · **Competitor facts last checked: Oct 21, 2026 (from the PRD's research). Re-verify on [Square Loyalty Canada](https://square.com/ca/en/software/loyalty) before every use.**

Square is a great POS, and many shops on our strips use it. **We don't compete with Square POS. We connect to it.** The pitch is simple: keep everything you like about Square, and stop paying per location for loyalty.

## Before you pitch: confirm two things

1. **Our Square connector is live** for auto-award this week (ask your lead). If not, the pitch changes to phone-number entry until it is. Don't promise auto-award that isn't live.
2. **Their actual Square Loyalty bill.** Square Loyalty pricing has been listed "from $60/month per location" in Canada, and Square has used tiered pricing in the past. Ask the owner to open their Square Dashboard billing page and look together. Use their number, not ours.

## Side by side (as of Oct 21, 2026; re-verify)

| | Local Loyalty | Square Loyalty (checked Oct 21, 2026) |
| --- | --- | --- |
| Price | **$0**, any number of locations | From ~$60/mo **per location** (CAD), per Square's Canadian page; check current tiers |
| Transaction fee on loyalty | **0%** | No separate loyalty transaction fee as far as we know; normal Square processing fees apply to payments either way |
| Works with Square POS | Yes: points auto-award from Square sales (confirm live) | Native |
| Customer join | Phone number, QR scan, Apple/Google Wallet pass | Phone number at checkout, built into Square hardware |
| Program types | Points per $, per visit, stamps, item bonuses, rewards catalogue, VIP levels | Visits, spend, or items; rewards tiers |
| Birthday, referrals, double-points promos | Included, free | Check current features (some marketing tools are a separate Square Marketing subscription) |
| Text messages to customers | Not on Free (SMS comes with Plus later) | Square Loyalty sends text notifications to enrolled customers (a real strength) |
| Shared network with other shops on the street | **Yes** | No, single merchant |
| Works with other POS too | Yes (multi-POS strips) | Square only |
| Setup | Done for you | Self-serve |

**Be honest about Square's strengths:** enrolment on the Square customer display and automatic text messages are smooth. If the owner loves those, say so. Our case is the price and the network, not that Square is bad.

## Worked example (illustrative; use their bill)

> 1 location at $60/month = **$720/year**. 3 locations = **$2,160/year**. With us: **$0**, and your customers also see you on the street's map.

## The pitch

> "Keep your Square, it's great. We plug into it, so points land automatically when you ring up the sale. You get the same kind of program, plus the whole street's network, and you can cancel the Square Loyalty add-on. On [their number] a month, that's [annual] a year back in your pocket."

## Objections

**"I don't want to mess up my Square setup."**
> "We don't change your POS. We read your sales to award points. You can disconnect us any time from Square."

**"My customers already have points in Square."**
> "We bring them over. Export your customers and balances from Square (I'll show you where), we import them, and their points carry over. Same phone number, same balance."

**"Square texts my customers their points."**
> "That's a real plus of Square. With us, customers see their balance in Apple or Google Wallet, and texting comes with our Plus plan later. If texts matter most to you, you'll want to weigh that."

**"I don't want another tablet."**
> "None. Points come from your Square sales. Staff only use our app to redeem, on the same iPad."

**"What's the catch?"**
> "Loyalty is free forever. Later we'll offer optional order-ahead or service tools. That's how we make money."

## Migration steps

1. Confirm the Square connector is live; connect the merchant's Square account during the setup visit (owner logs in themselves; never ask for their password).
2. Map Square locations to our locations (unlimited, free).
3. Export customer directory and loyalty balances from Square (check what Square's export currently includes), import with `customers.csv_import`. Don't email imported customers without the merchant's record of consent.
4. Match the reward thresholds so customers notice no change.
5. Run both for one day, check that auto-award is working, then the owner cancels Square Loyalty in their own Square Dashboard.
6. Launch-week double points to celebrate the switch.

Tag `currentLoyalty` = "Square Loyalty" in the lead.
