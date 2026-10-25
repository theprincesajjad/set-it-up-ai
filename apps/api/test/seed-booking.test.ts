/** Reproduction for the QA harness's failed demo booking: every slot the public availability offers on the seeded salons books. */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { merchants } from "@ll/db";
import { seedDemo } from "../src/seed.js";
import { call, customer } from "./commerce-fixtures.js";
import { createTestEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({ now: new Date() });
  await seedDemo(env.db, { customers: 30, days: 45, config: env.ctx.config });
}, 600_000);
afterAll(async () => env?.close());

const day = (n: number) => new Date(env.clock.now.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("booking on a fresh seed", () => {
  for (const slug of ["bloom-hair-studio", "rangrez-beauty-studio"]) {
    it(`${slug}: the first, middle and last offered slot of every service book for a new customer`, async () => {
      const c = await customer(env);
      const sv = (await call(env, null, "GET", `/v1/public/shops/${slug}/services`)).body.services as { id: string; name: string }[];
      const failures: string[] = [];
      for (const s of sv) {
        const av = (await call(env, null, "GET", `/v1/public/shops/${slug}/availability?serviceIds=${s.id}&staffId=any&from=${day(5)}&to=${day(12)}`)).body;
        const times = (av.days as { times: { startsAt: string }[] }[]).flatMap((d) => d.times);
        if (!times.length) failures.push(`${s.name}: no slots offered`);
        for (const t of [times[0], times[Math.floor(times.length / 2)], times[times.length - 1]]) {
          if (!t) continue;
          const r = await call(env, c.token, "POST", "/v1/me/appointments", { serviceIds: [s.id], staffId: null, startsAt: t.startsAt });
          if (r.status !== 201 && r.status !== 200) failures.push(`${s.name} @ ${t.startsAt}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
          else await call(env, c.token, "POST", `/v1/me/appointments/${r.body.appointment.id}/cancel`, {});
        }
      }
      expect(failures).toEqual([]);
      const [m] = await env.db.select({ id: merchants.id }).from(merchants).where(eq(merchants.slug, slug));
      expect(m).toBeTruthy();
    });
  }
});
