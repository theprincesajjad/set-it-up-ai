# Local Loyalty

A free, shared loyalty network for independent neighbourhood businesses,
starting in Toronto. One customer identity (phone number, wallet pass or app)
works at every shop on the street.

- **Merchants pay nothing for loyalty, forever.** No fee on loyalty,
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
| BIA manager (Roncesvalles, with campaign data) | `bia+roncesvalles@example.com` / `localloyalty-demo` |
| Shop owner | `owner+<shop-slug>@example.com` / `localloyalty-demo` (e.g. `owner+pinecone-coffee@example.com`) |
| Counter staff | `staff+pinecone-coffee@example.com` / `localloyalty-demo`, PIN `1234` |
| Restaurant pack (Ridgeway Plaza, Mississauga) | `owner+<slug>@example.com` / `localloyalty-demo` for `nawab-biryani-house` (Pro), `lahori-karahi-and-bbq`, `shree-thali-and-tiffin`, `zeenat-catering` (Growth), `sarson-dhaba`, `meethi-mithai-and-chai`, `padma-bangladeshi-kitchen`, `jaffna-kottu-house`, `kabul-garden-grill` (Starter), `rangrez-beauty-studio` (salon, network only) |
| Restaurant staff | `staff+nawab-biryani-house-tandoor@example.com` (Punjabi, tandoor station), `staff+nawab-biryani-house-manager@example.com` (Urdu), also `-curry`, `-rice`; `staff+sarson-dhaba-counter@example.com`, `staff+shree-thali-and-tiffin-kitchen@example.com`, `staff+zeenat-catering-manager@example.com`, `staff+lahori-karahi-and-bbq-manager@example.com`. All `localloyalty-demo`, PIN `1234` |
| Grocer and halal butcher (Ridgeway Plaza) | `owner+annapurna-grocers-and-spices@example.com` (grocer: flyer, pantry reminders, WhatsApp), `owner+al-noor-halal-meats@example.com` (halal butcher: pre-orders, weigh-in, Eid plan) / `localloyalty-demo`; counter `staff+annapurna-grocers-and-spices-counter@example.com` (Punjabi), `staff+al-noor-halal-meats-counter@example.com` (Urdu), PIN `1234` |
| Fitness studios | `owner+rise-yoga-studio@example.com` (Rise Yoga, Roncesvalles), `owner+sakina-studio@example.com` (Sakina Studio, women-only, Ridgeway Plaza), desk `staff+sakina-studio-desk@example.com` / `localloyalty-demo` |
| Pharmacy | `owner+village-apothecary@example.com` (Village Apothecary: Rules page, front-store counter, flu-shot booking) and pharmacist `staff+village-apothecary-amira@example.com` / `localloyalty-demo` |
| Customer | any seeded phone (e.g. `+16475551000`) — the code is printed by the API and auto-filled in dev |

To run against a real Postgres, set `DATABASE_URL=postgres://…` and run
`pnpm db:migrate`. All configuration is in `apps/api/.env.example`.

### Sales and support assistant (our own AI agent)

The marketing site's chat widget and our own WhatsApp number talk to one assistant (`apps/api/src/services/sales-agent`) that answers
prospective and existing shop owners' questions and starts sign-ups. Admin console: `/admin/sales-agent`. Docs:
`docs/engineering/api/sales-agent.md`, evals: `docs/engineering/sales-agent-evals.md`.

| Variable | Where | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | API | Turns the assistant on. Without it the chat still opens, says it is an AI and hands every message to the admin queue. Model `SALES_AGENT_MODEL` (default `claude-opus-5-5`), `SALES_AGENT_EFFORT` (`low` default), `SALES_AGENT_FALLBACKS=0` to turn the server-side safety fallback off. |
| `SALES_AGENT_WHATSAPP_NUMBER` | API | The platform WhatsApp number prospects message (display number). Unset: no WhatsApp door and the widget hides its WhatsApp link. |
| `SALES_AGENT_WHATSAPP_PHONE_NUMBER_ID` | API | That number's Meta phone number id, used to match inbound webhooks and to send. Needs the usual `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. |
| `SALES_AGENT_ENABLED=0` | API | Switches the whole assistant off (widget hidden, platform number ignored). |
| `SALES_AGENT_ADMIN_EMAIL` | API | Who is emailed on a hand-off or a founder-call request (default the support address). |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Web | Digits, international format, behind every "Message us on WhatsApp" button. **Unset: the button is hidden.** Set it to the same number as `SALES_AGENT_WHATSAPP_NUMBER`. |
| `DOCS_DIR` | API | Only if the API is deployed without the repo's `docs/` folder: where the assistant reads `sales/agent-faq.md` and `legal/*.md` from. |

Try it with no key: `pnpm dev:api`, open the site, ask a question: you get the AI disclosure and the message lands in `/admin/sales-agent`. With a key:
`ANTHROPIC_API_KEY=… pnpm --filter @ll/api eval:sales-agent` runs the 40-question eval against the real model.

## Checks

```bash
pnpm typecheck
pnpm test
pnpm --filter @ll/web build
pnpm --filter web e2e:full                        # EVERY Playwright spec in one run: fresh seed, API, production build, next start, then stops them
cd apps/mobile && npx expo export --platform ios  # native bundle
```

`pnpm --filter web e2e:full` (apps/web/e2e/run-all.sh) seeds a throw-away PGlite database, starts the API (`NODE_ENV=test`),
builds the web app for production, runs every spec in `apps/web/e2e` against `next start`, and stops both servers. A fresh
database per run keeps the one-time review links and shared plan/override state repeatable. Options: `API_PORT`, `WEB_PORT`,
`NEXT_DIST_DIR`, `PW_ARGS="e2e/web-pass.spec.ts"` (some specs), `SKIP_BUILD=1`. The specs rewrite the tracked images in
`apps/web/e2e/screenshots`; restore them with `git checkout -- apps/web/e2e/screenshots` unless you meant to update them.
The landing page's "network today" strip is statically rendered and refreshed every 5 minutes, so start the API before the build.

## Going live checklist

Docker Compose deploy (Postgres, migrations, API, web): `docs/engineering/deploy.md`, config in `.env.example`.

1. Postgres (Canadian region), `JWT_SECRET`, `ENCRYPTION_KEY`.
2. Twilio (SMS + inbound STOP webhook), Resend (email), Expo (push, `EAS_PROJECT_ID`).
3. Stripe: platform account, Connect Express, Plus/Pro prices, webhook secret.
4. Apple Pass Type ID certificate and Google Wallet issuer for wallet passes.
5. POS app registrations (Square first) — see `docs/engineering/connectors.md`.
6. Lawyer review of everything in `docs/legal/` and the rep agreements.
7. Pick the first strip (`docs/sales/neighbourhood-launch-plan.md`) and keep paid
   features hidden until the gates in `docs/finance/unit-economics.md` are met.
