/**
 * Seed a realistic Toronto demo: `pnpm --filter @ll/api seed`.
 * Uses DATABASE_URL (default: local PGlite at ./.pglite/dev). Safe to re-run:
 * it skips if the demo neighbourhood already exists.
 */
import { pathToFileURL } from "node:url";
import { connect } from "@ll/db";
import { loadConfig } from "./config.js";
import { DEMO_CREDENTIALS, seedDemo } from "./seed/demo.js";
import { STAFF_LOGINS } from "./seed/restaurants.js";
import { GROCER_STAFF_LOGINS } from "./seed/grocers.js";
import { SAKINA_LOGINS } from "./seed/classes.js";
import { PHARMACY_LOGINS } from "./seed/pharmacy.js";

export { seedDemo, DEMO_CREDENTIALS };
export type { SeedOptions, SeedResult } from "./seed/demo.js";

async function main() {
  const config = loadConfig();
  const db = await connect(config.databaseUrl);
  try {
    const started = Date.now();
    const r = await seedDemo(db, { config, customers: process.env.SEED_CUSTOMERS ? Number(process.env.SEED_CUSTOMERS) : undefined, log: (m) => console.log(m) });
    if (!r.skipped) {
      console.log(`\nSeeded ${r.merchants} merchants, ${r.customers} customers, ${r.visits} visits, ${r.redemptions} redemptions, ${r.leads} leads in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    }
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
    for (const l of [...SAKINA_LOGINS, ...PHARMACY_LOGINS]) console.log(`${l.role.padEnd(6)} ${l.email.padEnd(48)} ${DEMO_CREDENTIALS.ownerPassword}   (${l.shop}, ${l.name})`);
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
