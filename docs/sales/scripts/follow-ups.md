# Follow-Ups: Day 7 and Day 30

Last updated: Oct 21, 2026

Activation means **25 members with at least one visit**. Most programs fail because staff stop asking in week two. These two calls stop that.

Before every call, open the merchant in the rep console and check: members, visits this week, redemptions, and whether staff are awarding (visits by staff member).

---

## Day 7 check-in (phone, 5 minutes; visit if under 10 members)

**Where they should be:** 15–25 members for cafés, bakeries and grocers; 8–15 for services.

**Script**
> "Hi [Name], it's [Your name] from Local Loyalty. Quick one-week check-in. I can see you've got [X] members and [Y] visits. [Compliment: 'That's one of the best starts on the street.' / 'Nice start.']
>
> Two quick questions: Are staff finding it quick at the counter? And is anything annoying?"

**Then, by situation:**

| What you see | What to do |
| --- | --- |
| 25+ members | Congratulate. "You're activated." Ask for the referral (shop next door). Suggest a slow-day promo |
| 10–24 members | "To hit 25 by day 14, the one thing that works is asking every customer. Can I drop off another counter card for your staff?" |
| Under 10 members | **Visit this week.** Usually: the QR stand is hidden, a staff member wasn't trained, or the POS connection isn't awarding. Fix it on site |
| Only one staff member awarding | "Looks like [Staff] is your star. Can I show the others for 5 minutes on [day]?" |
| Complaint about speed | Check that they're using phone-number entry, not searching by name. Escalate POS issues to product with details |

Log a `call` activity with member count. Set `nextActionAt` to day 30.

---

## Day 30 check-in (phone or visit, 10 minutes)

**Where they should be:** activated (25+), heading for 75 members by month 6.

**Script**
> "Hi [Name], it's been a month. You've got [X] members, [Y] repeat visits, and [Z] rewards redeemed. On day one you said success would be [their goal from the setup visit]. How does that feel?"

**Then:**

1. **Show one number they care about:** "Your top 10 members visited [N] times this month."
2. **Suggest one thing:** a slow-day double-points promo, a birthday reward, or a network perk.
3. **Ask for a referral** if you haven't: [referral-ask.md](referral-ask.md).
4. **Listen for upsell signals** (order-ahead, approvals, texting customers) and log them in notes as "Plus candidate" or "Pro candidate". Don't sell; Plus/Pro aren't open yet.
5. **Ask for a quote** for the BIA report or our website: "Would you say a sentence about it we could share?"

**If not activated by day 30:** visit in person within the week. If they're still under 25 by day 45, log the reason honestly (staff turnover, owner lost interest, wrong fit) so we learn. Don't chase forever.

Move the lead to `activated` when the product shows the merchant activated (the system sets this at 25 active members).
