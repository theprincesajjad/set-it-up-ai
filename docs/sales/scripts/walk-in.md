# Walk-In Scripts

Last updated: Oct 21, 2026

Two parts: the **60-second door script** (get a yes or a booked visit) and the **20-minute setup visit** (leave the shop live).

---

## Part 1: The 60-second door script

### Before you open the door

- Check the niche playbook's "best time". If there's a line, walk past and come back.
- Phone charged, demo merchant loaded, a QR counter stand and the one-pager in your bag.
- Smile. You are a neighbour, not a salesperson.

### The script

**0–10 s: Be a customer, then ask**
Buy something small if it's a café or bakery. Then:
> "Hi! Is the owner in by any chance?"

If not: "When's a good time to catch them? What's their name?" Log it. Leave the one-pager. Go.

**10–25 s: Who you are and why it matters to them**
> "Hi [Name], I'm [Your name] with Local Loyalty. We're putting the shops on [Street] on one free loyalty app. [Anchor shop] across the street joined [last week]."

**25–45 s: The pitch**
> "It's free, there's no fee per sale, and I set it up for you. Your customers join with a phone number, no app. And because the whole street is on it, people who join at the bakery see you too."

**45–60 s: The ask**
> "I can set it up right now in about 20 minutes, or come back at a quieter time. Which works better?"

- **Yes, now** → go to Part 2. Move lead to `signed` once they agree.
- **Later** → book a specific time. Lead to `visit_booked`.
- **Need to think** → "What would you want to see to decide?" Show the 90-second demo from the playbook.
- **No** → "No problem. Can I leave this? Launch week is [date] if you change your mind." Lead to `contacted` with the reason.

### Door don'ts

- Don't pitch during a rush, in front of a queue, or to a customer.
- Don't badmouth a competitor's sticker on the door.
- Don't promise Plus/Pro features or dates.
- Don't take a "yes" from someone who isn't the owner or a manager who can sign.

---

## Part 2: The 20-minute setup visit

**Goal:** the shop leaves the visit **live**: program set, QR stand on the counter, one staff member trained, first member joined.

Bring: phone with rep console, QR counter stand (printed from the rep console's QR kit), launch-week sign, receipt/bag stuffers, staff one-liner card.

| Minute | Do | Notes |
| --- | --- | --- |
| 0–2 | Confirm the owner's goals: "What would make this worth it in a month?" | Write it in the lead notes; use it on day 30 |
| 2–6 | **Create the merchant** in the rep console. Pick the vertical. The template fills earn rules, rewards and categories | Check: no-earn categories correct (prescriptions, alcohol, tobacco, lottery, gift cards) |
| 6–9 | **Adjust with the owner:** reward, goal, welcome bonus, minimum spend | Keep changes small; defaults are tested |
| 9–11 | **Agreements:** owner accepts merchant terms in the app; confirm business details and the contact for day 7 | Free, no contract term |
| 11–13 | **POS:** if their POS is live for auto-award (Square, Clover, Shopify, Lightspeed, Toast: check this week's list), start the connection. If not, set staff up for phone-number entry | Never leave a half-finished connection; if it fails, schedule a follow-up |
| 13–16 | **Train one staff member:** award, redeem, look up a member. They do it twice themselves | Give them the staff card (counter script below) |
| 16–18 | **Place the QR stand:** at the till, at eye level, facing the customer, next to the payment terminal | Not behind the register, not by the door |
| 18–19 | **First member:** the owner or a customer in the shop joins. Celebrate it | The owner seeing a real member join is the moment |
| 19–20 | **Launch-week reminder** and book the **day 7 call**; ask for the referral (see [referral-ask.md](referral-ask.md)) | Move lead to `signed`; set `nextActionAt` to day 7 |

### Staff counter card (leave one at the till)

> **Ask everyone:** "Do you have points with us? It's free, just your phone number."
> **Award:** open app → type number → tap +1 / enter amount.
> **Redeem:** reward shows on screen → tap Redeem.
> **Launch week:** "It's double points this week!"

### After the visit (same day)

- Log a `visit` activity with outcome "live" or what's left.
- Photo of the QR stand in place (helps coaching).
- If the owner had another location, flag "multi-location" for the founder.
