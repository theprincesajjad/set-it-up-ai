"use client";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useMerchant } from "../MerchantContext";

/**
 * Where the shop is: on the map, and on which street. The API pins the address and picks the street at signup; this card appears only
 * when one of the two did not work, and lets the owner fix it (try the address again, or ask for their street). Nothing shows when both are fine.
 */
export function StreetCard() {
  const { api, base, role } = useMerchant();
  const state = useApi(role === "staff" ? null : () => api.street(), [api, role]);
  const act = useAction();
  const [name, setName] = useState("");
  const s = state.data;
  if (!s || (s.onMap && s.open)) return null;
  const owner = role === "owner";
  return (
    <section aria-label="Your place on the map" className="flex flex-col gap-3 rounded-card border border-line p-5">
      <div className="flex items-start gap-3">
        <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" strokeWidth={1.75} />
        <div className="min-w-0">
          {!s.onMap ? (
            <>
              <h2 className="text-body-strong text-fg">Your shop is not on the map yet</h2>
              <p className="mt-1 text-meta text-fg-muted">We could not find your address, so shoppers cannot see a pin. Check the street address in Locations, then try again.</p>
            </>
          ) : !s.neighbourhood ? (
            <>
              <h2 className="text-body-strong text-fg">Your street is not live yet</h2>
              <p className="mt-1 text-meta text-fg-muted">Tell us your street or business area. We open a street when {s.opensAt} shops join, and we will tell you.</p>
            </>
          ) : (
            <>
              <h2 className="text-body-strong text-fg">{s.neighbourhood.name} is not live yet</h2>
              <p className="mt-1 text-meta text-fg-muted">{s.shops} of {s.opensAt} shops so far. Your shop is already on the map. We will tell you when your street opens.</p>
            </>
          )}
        </div>
      </div>
      {act.error ? <Banner tone="warning">{act.error}</Banner> : null}
      {owner && !s.onMap ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={act.busy} onClick={async () => { const r = await act.run(() => api.locateShop()); if (r) state.setData(r); }}>Find us on the map</Button>
          <Button size="sm" variant="secondary" href={`${base}/locations`}>Check the address</Button>
        </div>
      ) : null}
      {owner && s.onMap && !s.neighbourhood ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={async (e) => { e.preventDefault(); const r = await act.run(() => api.requestStreet(name)); if (r) { state.setData(r); setName(""); } }}>
          <div className="min-w-0 flex-1">
            <TextField label="Your street or business area" placeholder="Lake Shore Village" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <Button type="submit" size="md" loading={act.busy} disabled={name.trim().length < 3}>Ask for my street</Button>
        </form>
      ) : null}
    </section>
  );
}
