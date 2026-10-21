import { it } from "vitest";
import { awardPurchase } from "../../src/services/ledger.js";
import { createMerchant, createTestEnv } from "../helpers.js";
it("dbg", async () => {
  const env = await createTestEnv();
  const { merchant, ownerToken } = await createMerchant(env);
  await awardPurchase(env.ctx, { merchantId: merchant.id, phone: "+14165551234", customerName: "Alice", source: "staff_app", amountCents: 6000 });
  for (const qs of ["q=alice", "phoneLast4=1234", "tag=x", "lapsedDays=3", "rewardAvailable=true", "sort=name"]) {
    const r = await env.app.inject({ method: "GET", url: `/v1/merchants/${merchant.id}/customers?${qs}`, headers: { authorization: `Bearer ${ownerToken}` } });
    console.log(qs, r.statusCode, r.body.slice(0, 300));
  }
});
