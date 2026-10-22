# Restaurant pack build brief

Shared brief for every team building the restaurant pack (the "Desi" modules). Read this first, then
`docs/business/combined-strategy.md`, `docs/business/pricing.md`, `apps/web/AGENTS.md` (web) and
`docs/design/foundations.md` + `docs/design/canvas/*.dc.html` (design source of truth).

## What exists already

- **Data model**: `packages/db/src/schema.ts` and migration `0006_restaurant_pack.sql`. Tables:
  `tiffin_plans`, `tiffin_routes`, `tiffin_subscriptions`, `tiffin_menus`, `tiffin_skips`,
  `tiffin_deliveries`, `tiffin_charges`, `catering_events`, `halls`, `hall_bookings`,
  `whatsapp_sessions`, `review_requests`, `phone_calls`, `order_splits`, `merchant_add_ons`.
  New columns: `merchants.restaurantTier / foundingOffer / languages / cashDiscountBps / chargeMode /
  whatsappNumber / whatsappCreditsUsed / whatsappCreditsExtra / googleReviewUrl`,
  `merchant_staff.locale / station`, `catalog_items.dietary / translations / preorderOnly /
  leadTimeHours / serves / station / depositBps`, `orders.kind / channel / depositCents /
  depositPaidAt / customerFeeCents / cashDiscountCents / firedAt / bumpedAt`,
  `order_items.station / kitchenStatus / notes`, `quotes.cateringEventId / hallBookingId`,
  `subscriptions.restaurantTier`. Do **not** generate new migrations without telling the lead; if a
  column is truly missing, add it to `schema.ts` and say so in your report.
- **Gating**: `packages/shared/src/plans.ts`. Restaurant features are `restaurant.*` keys with
  `pack: "restaurant"` and a `packTier` (starter / growth / pro). Gate every route with the
  existing `requireFeature` helper; `services/features.ts` already passes `merchant.restaurantTier`.
  Fees live in `FEES`, add-ons in `ADD_ONS`, tiers in `RESTAURANT_PLANS`.
- **Contracts**: zod schemas live in `packages/shared/src/api/<area>.ts` and are exported from
  `packages/shared/src/api/index.ts` (`tiffinApi`, `restaurantApi`, `whatsappApi`, `i18nApi`
  stubs exist — replace the placeholder export).
- **Points** only move through `apps/api/src/services/ledger.ts`. Money is integer cents. Times are
  stored UTC and shown in America/Toronto. Use `ctx.now()` for the clock so tests can fake it.

## Rules for every team

- Stay inside the files you own (listed in your task). When you must touch a shared file
  (`routes/index.ts`, `jobs/index.ts`, `api/index.ts`, `seed.ts`, nav config), make the smallest
  additive edit — another team edits the same file at the same time. Re-read it right before editing.
- Do not commit, push, or run `git checkout`/`git stash`/`git reset`. The lead commits.
- Follow the surrounding code's idiom, naming and comment density. No new dependencies unless
  unavoidable; say why in your report.
- Every API module ships with vitest tests in `apps/api/test/` using the existing PGlite harness.
  Run `pnpm --filter @ll/api test -- <your test files>` and `pnpm -r typecheck` before you finish.
- UI follows the canvas: monochrome, one accent (#FF5A1F, text #C2410C), Bricolage Grotesque for
  display, Inter/system for body, pill buttons, hairline dividers, no gradients, no emoji icons, no
  card-in-card. Lowercase display headings like the canvas. Plain words, Canadian spelling.
- Copy for Desi restaurants must be respectful and specific: biryani, nihari, haleem, karahi, chai,
  mithai, tiffin, degh (pot), walima, mehndi, aqiqah, Eid, Ramadan/iftar, Diwali, Vaisakhi.
  Halal claims are the shop's own; show the certifier when given and never claim it for them.
- Report back: what you built (files), what you tested and the result, anything left undone.
