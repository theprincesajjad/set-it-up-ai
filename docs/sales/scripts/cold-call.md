# Cold Call Script

Last updated: Oct 21, 2026

**Goal of the call:** book a 20-minute visit. Not to explain everything. If you're talking for more than 60 seconds straight, you're losing them.

## Before you dial

- Check the lead in the rep console: vertical, current loyalty, best time to call (see the playbook for that niche).
- Call during the shop's quiet hours only. Never at rush.
- Have two visit slots ready to offer (e.g. "Tuesday at 2:30 or Wednesday at 3").
- Calling rules: say who you are and who you work for at the start. Calls to businesses are generally exempt from the National Do Not Call List, but **we keep our own do-not-call list**: if anyone says "don't call again", mark the lead `lost` with "DNC" in notes, today. Call between 9 am and 6 pm on weekdays. (CRTC rules; confirm details with the founder if unsure.)

## The script

**Opener (10 seconds)**
> "Hi, is this [Owner name]? Hi, it's [Your name] from Local Loyalty. We're a Toronto company setting up a free loyalty program for the shops on [Street]. Did I catch you at an OK time for 30 seconds?"

If no: "No problem, when's a quieter time?" Log it, call then.

**The reason (20 seconds)**
> "[BIA name] shared our note with members [only if true]. We're putting [Street] on one app: points, stamp cards, promos. It's free for you, no fee per sale, and we set it up. [Anchor shop 1] and [Anchor shop 2] are already on. Your regulars already walk this street; this lets them find you through every other shop on it."

**The question (10 seconds)**
> "How do you reward your regulars right now?"

Listen. Their answer tells you which objection is coming. Note it in `currentLoyalty`.

**The ask (10 seconds)**
> "I'd love to show you in person. It's 20 minutes, and if you like it, you leave with it running. Would Tuesday at 2:30 or Wednesday at 3 be better?"

**Confirm**
> "Great, [day] at [time]. Is this the best number to text a reminder? Thanks, [Name], see you then."

Move the lead to `visit_booked` and set `nextActionAt`.

## Quick answers on the phone

| They say | You say |
| --- | --- |
| "What's the catch?" | "Loyalty is free forever. Later we'll offer optional paid tools like order-ahead. You never have to buy them." |
| "Just email me." | "Happy to. What's the best email? And can I pencil in 20 minutes Thursday so you can see it on your counter?" |
| "I use [SoPoints / Square / paper]." | "That's great, a lot of our shops did. We'll move your members over free. That's exactly what the 20 minutes is for." |
| "Not interested." | "Totally fair. Can I ask what you use for regulars today?" (One question. If still no: "Thanks for your time.") Log `contacted`, note the reason. Revisit after launch week. |
| "Is this a scam?" | "Fair question. We're a Toronto company, I'm happy to come by in person, and nothing costs you anything. Here's our website: [URL]." |
| "Don't call me again." | "Understood, I'll take you off our list. Sorry to bother you." Mark DNC. |

## Voicemail (under 20 seconds)

> "Hi [Name], it's [Your name] from Local Loyalty. We're setting up a free loyalty program for shops on [Street]; [Anchor shop] is already on. No fees, we set it up. I'll drop by [day] afternoon, or call me at [number]. Thanks!"

Then send the first email in [cold-email-sequence.md](cold-email-sequence.md) if you have a published business email.

## Targets

- 10 dials → 5 conversations → 2 visits booked is a good hour.
- Log every dial as a `call` activity with an outcome.
