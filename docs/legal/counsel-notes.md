# Counsel and finance notes (not published)

Notes that used to sit inside the public pages in this folder. The pages are rendered on the website, so anything that is for counsel, finance or drafting lives here instead: "Counsel:" lines, VERIFY flags, drafting notes in brackets, checklists and the status of the French translations. A web test (`apps/web/test/legal-pages.test.ts`) fails if any of them reappears on a published page (English or French). Pages keep only the "DRAFT: not in effect" banner and the bracketed placeholders for facts we do not have yet (company name, dates, contact details, vendors).

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

## Merchant Agreement

- **1.1 "equivalent".** Scope of "equivalent" when a Free feature is replaced, and whether to commit to a minimum notice period if the whole Service is discontinued (see 11.3).
- **2.1 export.** The export now covers every kind of Merchant Customer Data, as CSV and one ZIP (Settings, Privacy, "Your data"), on paid plans and for 90 days after leaving. Counsel: confirm that exporting members' phone numbers, WhatsApp and phone-order text and review comments to the merchant is consistent with the merchant being responsible for CASL and PIPEDA (section 2.4). What we did to respect consent: each member row carries the marketing consent (when, how, exact wording), the shop mute and the STOP list for text and WhatsApp; the reviews file carries `may_follow_up` (consent on file, not muted, not STOPped); customers who deleted their account appear without personal details; links, tokens, signature IP and device and Stripe identifiers are never exported.
- **2.6 and Schedule B.** Draft Schedule B (data processing); it allocates the controller-like roles. The published Schedule B is one sentence that restates section 2; replace it with the real schedule.
- **3.2 reimbursement.** Mechanics and tax treatment (HST on reimbursed rewards). The page now says "the retail value shown" within 30 days by Stripe transfer or monthly credit. The open alternative is "the agreed reimbursement rate". Decide.
- **2.3, 10.2, bracketed numbers.** The groups of 10 for aggregate statistics, the 14 days' notice before suspension and the 30-day reimbursement were bracketed proposals; they are now printed without brackets. Confirm them.
- **8 caps.** Check the limitation-of-liability caps.
- **12 General.** Assignment; force majeure; a French-language version of the Merchant Agreement for Quebec merchants (not translated yet).
- **Schedule C.** Pharmacy addendum: drafted in full (seven points, Oct 26, 2026) and confirmed in the product on the Pharmacy rules page. Counsel to review: (a) that a fixed order-ready text is not personal health information under PHIPA; (b) whether the in-product confirmation can replace a signed addendum; (c) the 30-day removal period for pharmacy appointment details; (d) whether a front-store seniors discount card handed out at the dispensary counter is read as an inducement; (e) the pharmacy advertising rule on testimonials (O. Reg. 264/16 s. 29(1)(d)) as it applies to the public Google review link we do not offer pharmacies.
- **Delivery.** Merchants accept this as a click-through at setup, or the rep collects a signature on the tablet. The plain-language summary leads on purpose: a merchant should be able to read it in two minutes.

## Customer Terms of Service

- Confirm the age floor (16) and the parental-consent rules for 13 to 15.
- Check enforceability of the limit of liability against consumers in Ontario and Quebec.
- We intend no mandatory arbitration and no class-action waiver for consumers (stated on the page). Ontario's CPA limits these, and the Drop lesson suggests transparency is the better defence.
- Counsel checklist: age floor; Quebec carve-outs (language, Law 25, Quebec CPA); consistency with CASL consent flows; whether CPA Part IV internet-agreement disclosures apply to any paid customer feature; the limitation-of-liability wording.
- The bracketed numbers in the Rewards Terms (90, 30, 60 days) and in the Privacy Policy (3 years inactivity, 3 years consent, 6 years tax, age 16, groups of 10) were engineering proposals; they are printed without brackets. Confirm them.

## Rewards Terms: drafting note

These terms are written to avoid the problems that led to complaints and a class action against Toronto's Drop rewards app over hard-to-redeem points (PRD; https://en.wikipedia.org/wiki/Drop_(loyalty_program)). Every rule is meant to be simple, visible and honoured at the counter.

## Privacy Policy: counsel checklist (moved off the page)

- Confirm the vendor list and data locations, and the processors' contracts (Stripe, Twilio, Meta WhatsApp, Resend, Expo, the photo store).
- Inactivity deletion (3 years) versus non-expiring points: reconcile, for example by keeping a minimal balance record.
- The age floor.
- Whether precise location for nearby push needs express opt-in wording (recommended: yes).
- Retention periods for transcripts, messages, photos and feedback, and whether account deletion must reach every module in section 2 (it does; see the first list above).
- Whether storing allergy notes, phone transcripts and halal or dietary information raises sensitivity under PIPEDA and Law 25.
- A Quebec Law 25 annex (privacy impact assessments for transfers outside Quebec, privacy-by-default settings, a confidentiality incident register). The French version now exists (below).
- A cookie and tracking notice for the website.
- Uploaded photos (repair tickets) are no longer served from permanent links. Each time a photo is shown the API signs a link (HMAC, expires after 15 minutes, `UPLOAD_LINK_MINUTES` in `packages/shared/src/retention.ts`); the database keeps only the storage path. The policy says so in section 4. A hosted object store plugs in by implementing `signedUrl` on the storage provider (a presigned GET). The shopper's own data download contains photo links valid for one hour. Photos were the only uploads: menu and catering images are links the shop pastes, not uploads.

## Class studios and memberships (booking.classes, memberships.recurring): counsel checklist

Built in `apps/api/src/services/class-memberships.ts`; rules and sources in `docs/research/fitness-studios.md` section 2. Not yet read by a lawyer. All of this is unverified against the statute text: we could not open e-Laws in the build session and worked from the Ontario government page (dated Aug 12, 2021) and legal-information summaries.

- **Ontario Consumer Protection Act, 2002, "personal development services" agreements** (gyms, studios, martial arts, dance; $50 or more in advance). What the product does: stores the agreement text and acceptance time as the written copy; 10-day cooling-off with a full refund; no term or pack validity over a year; fixed terms get a renewal notice 30 to 90 days before the end and only renew after one; no initiation fee exists. Questions: (1) does a month-to-month membership need a renewal notice every month, or is cancel-any-time enough; (2) cancellation rights for relocation, disability and death (we only offer cooling-off, end of month, and a studio decision to end now and refund the last payment); (3) the refund deadline (15 or 30 days; we refund at once through Stripe); (4) whether a class pack is an agreement under the Act; (5) the Consumer Protection Act, 2023 (Royal Assent Dec 6, 2023, not proclaimed in the sources we found) and its regulations.
- **Agreement wording** is English only and generated from the offer (`buildAgreement`). Counsel should approve the template before launch, then translate (hi, ur, pa, fr).
- **HST**: tax is added only when the studio says it is registered; late-cancel and no-show fees carry no tax in our model; no children's recreation exemption is modelled.
- **Women-only classes**: a studio's own rule, stated on the class and the booking sheet; we do not collect or verify gender or religion. Confirm the Human Rights Code footing (special programs, s. 14) and the wording a studio should use.
- **Late-cancel and no-show fees** are charged to a saved card off-session; confirm the disclosure (it is on the booking sheet and in the agreement) is enough under the Act and card-network rules.
- **Account deletion** removes the member's name from the stored agreement and ends the membership; money records stay with amounts only (same approach as the other modules).

## French versions (Quebec, Law 25): Traduction — à faire réviser

All of the following are machine-assisted translations written by engineering and have not been read by a lawyer or a translator. Each needs a review by a Quebec lawyer or a certified translator before the policy is relied on for Quebec shoppers. The pages carry the same DRAFT banner as the English ones (in French) and no mention of this status.

- **Traduction — à faire réviser: Politique de confidentialité** (`docs/legal/fr/privacy-policy.md`, published at `/legal/privacy?lang=fr`). Check the terms of art: "renseignements personnels", "responsable de la protection des renseignements personnels", "incident de confidentialité", "facteurs relatifs à la vie privée", "format technologique structuré et couramment utilisé", "LCAP". Section 8 names the Loi 25 by its short name; counsel should confirm the full citation.
- **Traduction — à faire réviser: Conditions des récompenses** (`docs/legal/fr/rewards-terms.md`, published at `/legal/rewards?lang=fr`). Check "Récompenses du réseau", "SDC" (Business Improvement Area), "points de commerçant", "laissez-passer numérique" (wallet pass).
- **Traduction — à faire réviser: avis de transcription téléphonique** (`TRANSCRIPT_NOTICE.fr` in `apps/api/src/services/phone.ts`, spoken in fr-CA after the shop's own language and English, before the order prompt, on every call). The notice is French only; callers still order in the shop's four languages.
- **Traduction — à faire réviser: assistant de vente et de soutien (clavardage et WhatsApp)** (`AGENT_TEXTS.fr` and `WIDGET_TEXTS.fr` in `packages/shared/src/sales-agent.ts`, the French rules in `SYSTEM_PROMPT` in `apps/api/src/services/sales-agent/prompt.ts`, the French pre-written answers and eval questions in `apps/api/src/services/sales-agent/eval-cases.ts`). Quebec visitors are served in French by the assistant: the disclosure that it is an AI ("assistant IA"), the HUMAN / STOP / START instructions, the hand-off, offline, text-only, rate-limit and too-long notices, the guardrail replacement, the SMS code text and every widget label are fixed French text, and the model answers in French from the English FAQ and plan data. These are machine-assisted translations written by engineering. A Quebec translator or lawyer should check: the wording of the AI disclosure and of the promise to "vérifier auprès de l'équipe"; "clavardage" for chat; "assistant IA" against the OQLF's preferred "assistant d'intelligence artificielle"; "caisse" for a POS; "avant TPS/TVH" (the assistant is told to say it wherever the English says "before HST"; it does not yet say which of the GST, HST or QST applies to a Quebec merchant, so counsel should say whether it must); amounts as "199 $" and "1,5 %" with a no-break space; whether answers translated on the fly by the model from English knowledge are acceptable for a Charter of the French language "commercial publication" or need pre-approved French answers; and that the French privacy policy the widget links to (`/legal/privacy?lang=fr`) is the reviewed one. The marketing site itself is still English: only the widget and its disclosure switch to French (for a French browser or `?lang=fr`).
- The Customer Terms of Service and the Merchant Agreement are not translated. Counsel to decide whether Quebec requires French versions of those before launch (Charter of the French language: contracts of adhesion).
- A native speaker should check that the placeholders ([date], [courriel], [nom] ...) are filled in both languages when the English ones are.
