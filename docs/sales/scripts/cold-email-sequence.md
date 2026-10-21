# Cold Email Sequence (4 touches, CASL compliant)

Last updated: Oct 21, 2026

Plain text only. No images, no tracking pixels, no attachments. Short enough to read on a phone between customers.

## CASL checklist (every email, no exceptions)

Canada's Anti-Spam Legislation applies to business-to-business email too. Before you send:

1. **Consent basis.** We only email addresses that the business has **published conspicuously** (their website, Google Business profile, BIA directory) **without** a "no unsolicited email" statement, and only about something relevant to their role as owner. That is implied consent under CASL. Record where and when you found the address in the lead's notes (e.g. "email from website contact page, Oct 21, 2026"). No bought lists, no guessed addresses (`info@` is fine only if published).
2. **Identification.** Every email names the sender, says it's from Local Loyalty, and includes our mailing address and a phone number or web address.
3. **Unsubscribe.** Every email has a working way to opt out ("reply STOP" plus a link). Honour it **immediately** and never later than 10 business days. Mark the lead "No email" in notes.
4. **Honest subject lines.** No "Re:" or "Fwd:" on a first email. No fake urgency.
5. **Stop the sequence** as soon as they reply, book, or opt out.

This is our practice, not legal advice. The founder should have counsel confirm the template once.

## Footer (paste on every email)

```
--
[Your name], Local Loyalty
[Mailing address, Toronto, ON]
[Phone] · [website]
You're getting this because your email is listed on [source] for [Business name].
Not interested? Reply STOP or unsubscribe here: [link]. We'll remove you right away.
```

## Touch 1 — Day 0 · The intro

**Subject:** Free loyalty program for [Street] shops

> Hi [Name],
>
> I'm [Your name] with Local Loyalty, a Toronto company putting the shops on [Street] on one loyalty app.
>
> For you it's free: no monthly fee, no fee per sale, and we set it up in about 20 minutes. Your customers join with their phone number, no app download needed. [Anchor shop 1] and [Anchor shop 2] are already on.
>
> Could I drop by [day] at [time] to show you? If another time is better, just reply with it.
>
> Thanks,
> [Your name]
>
> [footer]

## Touch 2 — Day 3 · The specific angle

Use one line from the niche playbook ("pitch angle").

**Subject:** [Business name] + [Street] regulars

> Hi [Name],
>
> Quick follow-up. Most [cafés / barbers / repair shops] we talk to use [paper punch cards / nothing / a paid app] today. We turn that into a digital card your customers can't lose, and every member on [Street] sees your shop on the map.
>
> [If they use a competitor:] If you're on [SoPoints / Square Loyalty], we move your members over for free.
>
> 20 minutes, in person, whenever's quiet for you. [day] at [time]?
>
> [Your name]
>
> [footer]

## Touch 3 — Day 7 · Social proof

**Subject:** [Number] shops on [Street] are now on Local Loyalty

> Hi [Name],
>
> [Number] shops on [Street] have joined, including [Shop A] and [Shop B]. Launch week is [date]: double points across the street, and we're promoting it with [BIA name, if true].
>
> I'd like [Business name] to be on the map before then. I'll be on [Street] [day]; can I stop in for 20 minutes?
>
> [Your name]
>
> [footer]

## Touch 4 — Day 14 · The breakup

**Subject:** Should I close your file?

> Hi [Name],
>
> I haven't heard back, so I'll assume now isn't the right time. No problem at all.
>
> If you want in before launch week on [date], reply "yes" and I'll come by. Otherwise I won't email again about this.
>
> Thanks for your time,
> [Your name]
>
> [footer]

After touch 4: mark the lead `contacted` with "sequence done, no reply". A rep may still walk in during launch week (walking in is not email; CASL doesn't apply to it).

## Logging

Every email = one `email` activity in the rep console with the touch number. Replies move the lead: booked → `visit_booked`; "no" → `lost` with reason; STOP → `lost` + "No email" in notes.
