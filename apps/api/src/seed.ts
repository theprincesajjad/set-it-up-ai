/**
 * Seed a realistic Toronto demo: `pnpm --filter @ll/api seed`.
 * Uses DATABASE_URL (default: local PGlite at ./.pglite/dev). Safe to re-run:
 * it skips if the demo neighbourhood already exists.
 */
import { pathToFileURL } from "node:url";
import { connect } from "@ll/db";
import { loadConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { createProviders } from "./providers/index.js";
import { drainOutbox, outboxBacklog } from "./services/outbox.js";
import { DEMO_CREDENTIALS, seedDemo } from "./seed/demo.js";
import { STAFF_LOGINS } from "./seed/restaurants.js";
import { GROCER_STAFF_LOGINS } from "./seed/grocers.js";
import { SAKINA_LOGINS } from "./seed/classes.js";
import { PHARMACY_LOGINS } from "./seed/pharmacy.js";
import { BARBER_LOGINS } from "./seed/barbers.js";
import { PET_LOGINS } from "./seed/pets.js";
import { AUTO_LOGINS } from "./seed/auto.js";

export { seedDemo, DEMO_CREDENTIALS };
export type { SeedOptions, SeedResult } from "./seed/demo.js";

/** Drain the outbox until nothing is pending (the seed's background fast paths may still be finishing). Returns what is left. */
async function settleOutbox(ctx: AppContext): Promise<number> {
  await import("./app.js"); // every route and service module, so every outbox handler and listener the API has is registered
  let left = 0;
  for (let i = 0; i < 20; i++) {
    await drainOutbox(ctx);
    left = await outboxBacklog(ctx);
    if (!left) return 0;
    await new Promise((r) => setTimeout(r, 250));
  }
  return left;
}

async function main() {
  const config = loadConfig();
  const db = await connect(config.databaseUrl);
  try {
    const started = Date.now();
    const r = await seedDemo(db, { config, customers: process.env.SEED_CUSTOMERS ? Number(process.env.SEED_CUSTOMERS) : undefined, log: (m) => console.log(m) });
    if (!r.skipped) {
      console.log(`\nSeeded ${r.merchants} merchants, ${r.customers} customers, ${r.visits} visits, ${r.redemptions} redemptions, ${r.leads} leads in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    }
    // Deliver what the seed's own awards queued (wallet cards, milestones, notices) before the database closes. Left pending, the
    // first award on the API (NODE_ENV=test delivers the outbox inline) drained the whole seed backlog inside that request: 30-50 s on
    // a fresh e2e stack (wave-n final audit: dashboard.spec "web counter award ... Robin").
    const backlog = await settleOutbox({ db, config, providers: createProviders(config), now: () => new Date() });
    if (backlog) console.log(`Outbox: ${backlog} event(s) still pending after the seed (the outbox.drain job delivers them).`);
    console.log("\nPricing v2: only loyalty + reporting are free; paid features are hidden at launch.");
    console.log("Pilot shops with admin overrides (promos, discount cards, VIP, birthday/referrals, email, CSV, advanced reports):");
    for (const p of r.pilotOverrides) console.log(`  ${p.merchant} (${p.slug})`);
    console.log("Core-module demo data (orders, slots, tickets, ads, promos, discount cards, catalog) on: Pinecone Coffee, Hearth & Crumb (+ ads), Village Apothecary, Fix-It Phone Lab (service tickets, drop-off slots).");
    console.log("Other shops' seeded promos stay hidden until an admin enables the feature (Admin → Rollout → overrides).");
    console.log("\nDemo credentials");
    console.log("────────────────");
    for (const c of r.credentials) console.log(`${c.role.padEnd(6)} ${c.email.padEnd(48)} ${c.password}${c.merchant ? `   (${c.merchant})` : ""}`);
    console.log(`${"staff".padEnd(6)} ${"staff+pinecone-coffee@example.com".padEnd(48)} ${DEMO_CREDENTIALS.ownerPassword}   (Pinecone Coffee Co., counter PIN ${DEMO_CREDENTIALS.staffPin})`);
    for (const st of STAFF_LOGINS) console.log(`${"staff".padEnd(6)} ${st.email.padEnd(48)} ${DEMO_CREDENTIALS.ownerPassword}   (${st.shop}, ${st.name}, ${st.locale}${st.station ? `, ${st.station} station` : ""}, PIN ${DEMO_CREDENTIALS.staffPin})`);
    for (const st of GROCER_STAFF_LOGINS) console.log(`${"staff".padEnd(6)} ${st.email.padEnd(48)} ${DEMO_CREDENTIALS.ownerPassword}   (${st.shop}, ${st.name}, ${st.locale}, PIN ${DEMO_CREDENTIALS.staffPin})`);
    for (const l of [...SAKINA_LOGINS, ...PHARMACY_LOGINS, ...BARBER_LOGINS, ...PET_LOGINS, ...AUTO_LOGINS]) console.log(`${l.role.padEnd(6)} ${l.email.padEnd(48)} ${DEMO_CREDENTIALS.ownerPassword}   (${l.shop}, ${l.name})`);
    console.log("Customers sign in by phone OTP, e.g. +16475551000 … (console SMS provider prints the code).");
  } finally {
    await db.$close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
