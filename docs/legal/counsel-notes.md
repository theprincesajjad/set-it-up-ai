# Counsel and finance notes (not published)

Notes that used to sit inside the public pages in this folder. The pages are rendered on the website, so anything that is for counsel or for finance lives here instead. A web test (`apps/web/test/legal-pages.test.ts`) fails if a "Finance note" or a "Counsel" note reappears in the Rewards Terms.

## Rewards Terms

**Section 6, shop closes without notice.** Decide whether the platform offers goodwill conversion, for example converting balances above [X] points into Network Rewards at [rate]. Recommended for trust but carries cost. Model cost: not included.

**Counsel checklist**

- Ontario CPA rules on rewards-point expiry, including treatment under the Consumer Protection Act, 2023 once it is in force;
- the gift-card regulation, which does not apply because points cannot be purchased; confirm;
- whether a negative balance is permissible;
- goodwill conversion on merchant closure;
- the Quebec version;
- consistency with OCP and AGCO restrictions.

**Finance note.** The model books platform-funded Network Rewards at **earn x expected redemption** (assumption: 60%). Merchant-issued points are a merchant liability and never appear on our balance sheet. Report the outstanding Network Rewards liability monthly.

## Privacy Policy: what is built and what is not

- Account deletion reaches every module in section 2 (appointments, tiffin, catering, hall bookings, WhatsApp, calls, review feedback, repair tickets and quote signatures, orders and allergy notes, wait lists, referrals, consents, wallet passes, push tokens). Tests: `apps/api/test/privacy-deletion.test.ts`.
- The retention periods in section 6 are set in `packages/shared/src/retention.ts` and run by the `privacy.retention` job. Tests: `apps/api/test/retention.test.ts`.
- The do-not-contact list (`comm_opt_outs`) survives account deletion on purpose. Counsel: confirm that keeping a phone number for that single purpose is acceptable under PIPEDA and Law 25, or whether it should be stored hashed.
- Counsel: the periods are engineering's proposals (90 days, 24 months, 12 months, 30 days, 7 days, 30 days); confirm them, and the Quebec position on allergy notes as sensitive information.
