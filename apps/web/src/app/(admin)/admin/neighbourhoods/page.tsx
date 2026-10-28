"use client";
import { PageHeader, Section, Dot } from "@/components/dashboard/kit";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { DensityBar } from "@/components/dashboard/NetworkGauges";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatNumber } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type NDraft = { id?: string; slug: string; name: string; city: string; status: adminApi.AdminNeighbourhood["status"]; biaName: string; biaContactName: string; biaContactEmail: string; storefrontEstimate: string; biaMemberCount: string; centerLat: string; centerLng: string; notes: string; opensOn: string; streetDayOn: string; streetDayRepId: string; targetShops: string };
type PDraft = { id?: string; name: string; neighbourhoodId: string; threshold: string; windowDays: string; bonusPoints: string; description: string };

export default function NeighbourhoodsPage() {
  const hoods = useApi(() => browserApi.admin.neighbourhoods(), []);
  const perks = useApi(() => browserApi.admin.perks(), []);
  const team = useApi(async () => {
    const [reps, admins] = await Promise.all([browserApi.admin.users({ platformRole: "rep", limit: 100 }), browserApi.admin.users({ platformRole: "admin", limit: 100 })]);
    return [...reps.items, ...admins.items];
  }, []);
  const [n, setN] = useState<NDraft | null>(null);
  const [p, setP] = useState<PDraft | null>(null);
  const [delN, setDelN] = useState<adminApi.AdminNeighbourhood | null>(null);
  const act = useAction();
  const blankN = (): NDraft => ({ slug: "", name: "", city: "Toronto", status: "scouting", biaName: "", biaContactName: "", biaContactEmail: "", storefrontEstimate: "", biaMemberCount: "", centerLat: "", centerLng: "", notes: "", opensOn: "", streetDayOn: "", streetDayRepId: "", targetShops: "30" });
  const nul = (v: string) => (v.trim() ? v.trim() : null);
  const num = (v: string) => (v.trim() ? Number(v) : null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Areas & perks" description="The launch calendar (opens, street day, who walks it), BIA details and network-funded perks." actions={<Button size="sm" iconStart={Plus} onClick={() => setN(blankN())}>Add neighbourhood</Button>} />
      <ListAsync state={hoods} errorTitle="We could not load the neighbourhoods.">
        {(d) => (
          <ul className="grid gap-px overflow-hidden rounded-card border border-line md:grid-cols-2 xl:grid-cols-3 [&>li]:bg-bg md:[&>li]:shadow-[0_0_0_1px_var(--ll-color-line)]">
            {d.items.map((h) => (
              <li key={h.id}>
                <div className="flex h-full flex-col gap-4 bg-bg p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-body-strong text-fg">{h.name}</h2>
                      <p className="text-meta text-fg-muted">{h.biaName ?? "No BIA on file"} · {h.city}</p>
                    </div>
                    <Dot tone={h.status === "live" ? "positive" : h.status === "pilot" ? "info" : "neutral"}>{h.status[0]!.toUpperCase() + h.status.slice(1)}</Dot>
                  </div>
                  <DensityBar label="Shops live" value={h.merchants} target={h.storefrontEstimate ?? 40} unit="shops" />
                  <p className="text-meta text-fg-muted">{formatNumber(h.activatedMerchants)} activated{h.biaContactName ? ` · BIA: ${h.biaContactName}` : ""}</p>
                  {h.opensOn || h.streetDayOn ? (
                    <p className="text-meta text-fg-muted">
                      {h.opensOn ? `Opens ${formatDate(`${h.opensOn}T12:00:00`, true)}` : null}{h.opensOn && h.streetDayOn ? " · " : null}
                      {h.streetDayOn ? <>Street day {formatDate(`${h.streetDayOn}T12:00:00`, true)} · {h.streetDayRepName ?? <span className="text-points-text">no one assigned</span>}</> : null}
                    </p>
                  ) : null}
                  <div className="mt-auto flex gap-2">
                    <Button variant="secondary" size="sm" aria-label={`Edit ${h.name}`} onClick={() => setN({ id: h.id, slug: h.slug, name: h.name, city: h.city, status: h.status, biaName: h.biaName ?? "", biaContactName: h.biaContactName ?? "", biaContactEmail: h.biaContactEmail ?? "", storefrontEstimate: h.storefrontEstimate?.toString() ?? "", biaMemberCount: h.biaMemberCount?.toString() ?? "", centerLat: h.centerLat?.toString() ?? "", centerLng: h.centerLng?.toString() ?? "", notes: h.notes ?? "", opensOn: h.opensOn ?? "", streetDayOn: h.streetDayOn ?? "", streetDayRepId: h.streetDayRepId ?? "", targetShops: String(h.targetShops) })}>Edit</Button>
                    {h.merchants === 0 ? <Button variant="ghost" size="sm" onClick={() => setDelN(h)}>Delete</Button> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ListAsync>
      <Section title="Network perks" action={<Button variant="secondary" size="sm" iconStart={Plus} onClick={() => setP({ name: "", neighbourhoodId: "", threshold: "3", windowDays: "30", bonusPoints: "50", description: "" })}>Add perk</Button>}>
        <div>
          <ul className="divide-y divide-line border-y border-line">
            {(perks.data?.items ?? []).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-meta-strong text-fg">{x.name}</p>
                  <p className="text-meta text-fg-muted">Visit {x.threshold} shops in {x.windowDays} days → +{x.bonusPoints} pts · {hoods.data?.items.find((h) => h.id === x.neighbourhoodId)?.name ?? "Network-wide"} · {formatNumber(x.awards)} awarded</p>
                </div>
                <div className="w-32"><Switch label="Active" checked={x.active} onChange={async (v) => { await act.run(() => browserApi.admin.updatePerk(x.id, { active: v })); await perks.reload(); }} /></div>
                <IconButton icon={Pencil} size={40} label={`Edit ${x.name}`} onClick={() => setP({ id: x.id, name: x.name, neighbourhoodId: x.neighbourhoodId ?? "", threshold: String(x.threshold), windowDays: String(x.windowDays), bonusPoints: String(x.bonusPoints), description: x.description ?? "" })} />
                <IconButton icon={Trash2} size={40} label={`Delete ${x.name}`} onClick={async () => { await act.run(() => browserApi.admin.deletePerk(x.id)); await perks.reload(); }} />
              </li>
            ))}
            {perks.data && !perks.data.items.length ? <li className="p-3 text-meta text-fg-muted">No perks yet.</li> : null}
          </ul>
        </div>
      </Section>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Modal open={!!n} onClose={() => setN(null)} title={n?.id ? "Edit neighbourhood" : "Add neighbourhood"} size="md" actions={
        <>
          <Button variant="secondary" onClick={() => setN(null)}>Cancel</Button>
          <Button loading={act.busy} onClick={async () => {
            if (!n) return;
            const body = { slug: n.slug.trim(), name: n.name.trim(), city: n.city.trim(), status: n.status, biaName: nul(n.biaName), biaContactName: nul(n.biaContactName), biaContactEmail: nul(n.biaContactEmail), storefrontEstimate: num(n.storefrontEstimate), biaMemberCount: num(n.biaMemberCount), centerLat: num(n.centerLat), centerLng: num(n.centerLng), notes: nul(n.notes), opensOn: nul(n.opensOn), streetDayOn: nul(n.streetDayOn), streetDayRepId: nul(n.streetDayRepId), targetShops: Number(n.targetShops) || 30 };
            const r = await act.run(() => (n.id ? browserApi.admin.updateNeighbourhood(n.id, body) : browserApi.admin.createNeighbourhood(body)));
            if (r) { setN(null); await hoods.reload(); }
          }}>Save</Button>
        </>
      }>
        {n ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value, slug: n.id ? n.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} />
            <TextField label="Slug" value={n.slug} onChange={(e) => setN({ ...n, slug: e.target.value })} />
            <TextField label="City" value={n.city} onChange={(e) => setN({ ...n, city: e.target.value })} />
            <Select label="Status" value={n.status} onChange={(e) => setN({ ...n, status: e.target.value as NDraft["status"] })} options={[{ value: "scouting", label: "Scouting" }, { value: "pilot", label: "Pilot" }, { value: "live", label: "Live" }]} />
            <TextField label="BIA name" optionalLabel value={n.biaName} onChange={(e) => setN({ ...n, biaName: e.target.value })} />
            <TextField label="BIA contact" optionalLabel value={n.biaContactName} onChange={(e) => setN({ ...n, biaContactName: e.target.value })} />
            <TextField type="email" label="BIA email" optionalLabel value={n.biaContactEmail} onChange={(e) => setN({ ...n, biaContactEmail: e.target.value })} />
            <TextField label="Storefronts" optionalLabel inputMode="numeric" value={n.storefrontEstimate} onChange={(e) => setN({ ...n, storefrontEstimate: e.target.value.replace(/\D/g, "") })} />
            <TextField label="BIA members" optionalLabel inputMode="numeric" hint="The “of 74” on the BIA overview" value={n.biaMemberCount} onChange={(e) => setN({ ...n, biaMemberCount: e.target.value.replace(/\D/g, "") })} />
            <TextField label="Centre latitude" optionalLabel inputMode="decimal" value={n.centerLat} onChange={(e) => setN({ ...n, centerLat: e.target.value })} />
            <TextField label="Centre longitude" optionalLabel inputMode="decimal" value={n.centerLng} onChange={(e) => setN({ ...n, centerLng: e.target.value })} />
            <TextField type="date" label="Opens on" optionalLabel value={n.opensOn} onChange={(e) => setN({ ...n, opensOn: e.target.value })} />
            <TextField type="date" label="Street day" optionalLabel hint="The day one person walks every shop" value={n.streetDayOn} onChange={(e) => setN({ ...n, streetDayOn: e.target.value })} />
            <Select label="Who walks it" placeholder="No one yet" value={n.streetDayRepId} onChange={(e) => setN({ ...n, streetDayRepId: e.target.value })} options={(team.data ?? []).map((u) => ({ value: u.id, label: u.name ?? u.email ?? "User" }))} />
            <TextField label="Shop target" inputMode="numeric" hint="About 30 per area" value={n.targetShops} onChange={(e) => setN({ ...n, targetShops: e.target.value.replace(/\D/g, "") })} />
            <div className="sm:col-span-2"><TextField type="textarea" label="Notes" optionalLabel value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} /></div>
          </div>
        ) : null}
      </Modal>
      <Modal open={!!p} onClose={() => setP(null)} title={p?.id ? "Edit perk" : "Add perk"} actions={
        <>
          <Button variant="secondary" onClick={() => setP(null)}>Cancel</Button>
          <Button loading={act.busy} onClick={async () => {
            if (!p) return;
            const body = { name: p.name.trim(), neighbourhoodId: p.neighbourhoodId || null, threshold: Number(p.threshold), windowDays: Number(p.windowDays), bonusPoints: Number(p.bonusPoints), description: p.description.trim() || null };
            const r = await act.run(() => (p.id ? browserApi.admin.updatePerk(p.id, body) : browserApi.admin.createPerk(body)));
            if (r) { setP(null); await perks.reload(); }
          }}>Save perk</Button>
        </>
      }>
        {p ? (
          <div className="flex flex-col gap-4">
            <TextField label="Name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Strip explorer" />
            <Select label="Where" value={p.neighbourhoodId} onChange={(e) => setP({ ...p, neighbourhoodId: e.target.value })} options={[{ value: "", label: "Network-wide" }, ...(hoods.data?.items ?? []).map((h) => ({ value: h.id, label: h.name }))]} />
            <div className="grid grid-cols-3 gap-3">
              <TextField label="Shops" inputMode="numeric" value={p.threshold} onChange={(e) => setP({ ...p, threshold: e.target.value.replace(/\D/g, "") })} />
              <TextField label="Within" inputMode="numeric" suffix="days" value={p.windowDays} onChange={(e) => setP({ ...p, windowDays: e.target.value.replace(/\D/g, "") })} />
              <TextField label="Bonus" inputMode="numeric" suffix="pts" value={p.bonusPoints} onChange={(e) => setP({ ...p, bonusPoints: e.target.value.replace(/\D/g, "") })} />
            </div>
            <TextField type="textarea" label="Description" optionalLabel value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
          </div>
        ) : null}
      </Modal>
      <ConfirmDialog open={!!delN} onClose={() => setDelN(null)} title={`Delete ${delN?.name}?`} confirmLabel="Delete" danger onConfirm={async () => { await browserApi.admin.deleteNeighbourhood(delN!.id); await hoods.reload(); }} />
    </div>
  );
}
