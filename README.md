# Local Loyalty

A free, shared loyalty network for independent neighbourhood businesses,
starting in Toronto. One customer identity (phone number, wallet pass or app)
works at every shop on the street.

- **Merchants pay nothing for loyalty, forever.** No transaction fees,
  unlimited locations, unlimited staff, unlimited members. We set it up for them.
- **The network is the product.** Every shop on one app, so customers who join
  at the café see the bakery and the repair shop on day one.
- **Money comes later**, once the network has density: Plus ($39/mo) and Pro
  ($79/mo) operations add-ons, a 0.75% fee on in-app payments, sponsored
  placements, and paid BIA neighbourhood campaigns. Paid features ship
  **hidden** and an admin switches them on (`hidden → beta → ga`) when the
  network is ready. Free features can never move to a paid plan.

"Local Loyalty" is a working name; change it in `packages/shared/src/brand.ts`.

## What's in the repo

| Path | What it is |
| --- | --- |
| `apps/api` | Fastify + Drizzle API: auth, double-entry points ledger, counter ops, merchant management, messaging (CASL), reports, rep console, admin rollout control, orders, service tickets/quotes/invoices, billing (Stripe), POS connectors (Square, Clover, Shopify, Lightspeed, Toast), Apple/Google Wallet passes, ads and BIA campaigns, background jobs |
| `apps/web` | Next.js: marketing site, no-download web pass (join from the counter QR), public shop/quote/invoice pages, merchant dashboard, web counter, rep console, admin, BIA tools |
| `apps/mobile` | Expo app: customer app (wallet, Corner-style map explore, my card, rewards, passport, orders/tickets) and staff counter mode (offline queue, kiosk) |
| `packages/shared` | Domain logic shared by everything: plans & feature gating, vertical templates, points math, API contracts (zod) |
| `packages/db` | Drizzle schema + migrations; Postgres in production, in-process PGlite for dev and tests |
| `packages/design-tokens` | Colours, type, spacing, motion; CSS + Tailwind theme for web, JS tokens for mobile |
| `docs/business` | Business plan / PRD, network monetization spec |
| `docs/engineering` | Conventions (read first), API reference per area, connectors setup, web and mobile guides |
| `docs/design` | Brand, design system, screen specs, UX copy, Mobbin references |
| `docs/finance` | Financial model (`model.py` + `.xlsx`), unit economics, bootstrap & fundraising |
| `docs/legal` | Compliance checklist and DRAFT customer/merchant documents (need a lawyer's review) |
| `docs/sales` | Niche playbooks for 18 verticals, scripts, BIA partnership, launch plan, rep program, battlecards |

## Run it locally

Requires Node 22 and pnpm 10. No accounts or credentials needed: the API uses
an in-process Postgres (PGlite) and console providers that log SMS, email and push.

```bash
pnpm install
pnpm --filter @ll/api seed     # demo Toronto data (Roncesvalles, Leslieville, the Danforth) + Ridgeway Plaza restaurant corridor
pnpm dev:api                    # http://localhost:4000
pnpm dev:web                    # http://localhost:3000
pnpm dev:mobile                 # Expo; set EXPO_PUBLIC_API_URL to your machine's IP
```

Demo logins (seed):

| Who | Login |
| --- | --- |
| Admin | `admin@localloyalty.example` / `localloyalty-admin` |
| Rep | `rep@localloyalty.example` / `localloyalty-rep` |
| Shop owner | `owner+<shop-slug>@example.com` / `localloyalty-demo` (e.g. `owner+pinecone-coffee@example.com`) |
| Counter staff | `staff+pinecone-coffee@example.com` / `localloyalty-demo`, PIN `1234` |
| Restaurant pack (Ridgeway Plaza, Mississauga) | `owner+<slug>@example.com` / `localloyalty-demo` for `nawab-biryani-house` (Pro), `lahori-karahi-and-bbq`, `shree-thali-and-tiffin`, `zeenat-catering` (Growth), `sarson-dhaba`, `meethi-mithai-and-chai`, `padma-bangladeshi-kitchen`, `jaffna-kottu-house`, `kabul-garden-grill` (Starter), `rangrez-beauty-studio` (salon, network only) |
| Restaurant staff | `staff+nawab-biryani-house-tandoor@example.com` (Punjabi, tandoor station), `staff+nawab-biryani-house-manager@example.com` (Urdu), also `-curry`, `-rice`; `staff+sarson-dhaba-counter@example.com`, `staff+shree-thali-and-tiffin-kitchen@example.com`, `staff+zeenat-catering-manager@example.com`, `staff+lahori-karahi-and-bbq-manager@example.com`. All `localloyalty-demo`, PIN `1234` |
| Customer | any seeded phone (e.g. `+16475551000`) — the code is printed by the API and auto-filled in dev |

To run against a real Postgres, set `DATABASE_URL=postgres://…` and run
`pnpm db:migrate`. All configuration is in `apps/api/.env.example`.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm --filter @ll/web build
pnpm --filter @ll/web e2e                         # Playwright against a seeded API
cd apps/mobile && npx expo export --platform ios  # native bundle
```

## Going live checklist

1. Postgres (Canadian region), `JWT_SECRET`, `ENCRYPTION_KEY`.
2. Twilio (SMS + inbound STOP webhook), Resend (email), Expo (push, `EAS_PROJECT_ID`).
3. Stripe: platform account, Connect Express, Plus/Pro prices, webhook secret.
4. Apple Pass Type ID certificate and Google Wallet issuer for wallet passes.
5. POS app registrations (Square first) — see `docs/engineering/connectors.md`.
6. Lawyer review of everything in `docs/legal/` and the rep agreements.
7. Pick the first strip (`docs/sales/neighbourhood-launch-plan.md`) and keep paid
   features hidden until the gates in `docs/finance/unit-economics.md` are met.
