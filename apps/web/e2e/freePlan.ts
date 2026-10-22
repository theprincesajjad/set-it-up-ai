/**
 * The demo seed gives Pinecone Coffee pilot overrides (paid features on) so the
 * customer demos show promos. The dashboard specs check the free plan on that
 * shop, so they remove its overrides for the run and put them back afterwards.
 */
import { API } from "./fixtures";

type Creds = { email: string; password: string };
const ADMIN: Creds = { email: "admin@localloyalty.example", password: "localloyalty-admin" };

async function token(who: Creds): Promise<string> {
  const r = await fetch(`${API}/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(who) });
  return ((await r.json()) as { accessToken: string }).accessToken;
}

/** Remove the shop's paid-feature overrides; returns a function that restores them. */
export async function useFreePlan(owner: Creds): Promise<() => Promise<void>> {
  const ownerToken = await token(owner);
  const list = (await (await fetch(`${API}/v1/merchants`, { headers: { authorization: `Bearer ${ownerToken}` } })).json()) as { items: { id: string }[] };
  const id = list.items[0]!.id;
  const feats = (await (await fetch(`${API}/v1/merchants/${id}/features`, { headers: { authorization: `Bearer ${ownerToken}` } })).json()) as {
    features: { key: string; enabled: boolean; minPlan: string }[];
  };
  const removed = feats.features.filter((f) => f.enabled && f.minPlan !== "free").map((f) => f.key);
  const admin = await token(ADMIN);
  const call = (key: string, on: boolean) =>
    on
      ? fetch(`${API}/v1/admin/features/${key}/overrides`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${admin}` }, body: JSON.stringify({ merchantId: id, enabled: true, reason: "demo pilot" }) })
      : fetch(`${API}/v1/admin/features/${key}/overrides/${id}`, { method: "DELETE", headers: { authorization: `Bearer ${admin}` } });
  await Promise.all(removed.map((k) => call(k, false)));
  return async () => {
    await Promise.all(removed.map((k) => call(k, true)));
  };
}
