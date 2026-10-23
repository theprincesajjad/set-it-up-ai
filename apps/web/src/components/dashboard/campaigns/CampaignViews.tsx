"use client";
import { EmptyState, PageHeader, Panel, StatusDot } from "@/components/dashboard/kit";
import { ArrowLeft, Download, Plus, Printer, Trash2, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { campaignsApi, type campaignsApi as C, type networkApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { ReportSummary } from "@/components/marketing/ReportMock";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { downloadCsv } from "@/lib/dashboard/download";
import { campaignReportRows } from "@/lib/reportCsv";
import { addDays, fromLocalInput, toLocalInput } from "@/lib/dashboard/time";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";

const KIND_LABEL: Record<C.CampaignKind, string> = { passport: "Passport week", points_weekend: "Points weekend", multiplier: "Street multiplier" };

/** "+38% visits" — the proof that street events drive visits. */
export function liftText(r: Pick<C.CampaignReport, "visitLiftPct" | "visits" | "baselineVisits">): string {
  if (r.visitLiftPct == null) return r.visits ? `${formatNumber(r.visits)} visits (no baseline yet)` : "No visits yet";
  return `${r.visitLiftPct >= 0 ? "+" : ""}${r.visitLiftPct.toFixed(1)}% visits vs the same days before`;
}

export function CampaignList({ base, neighbourhoods, isAdmin, neighbourhoodId }: { base: string; neighbourhoods: networkApi.NeighbourhoodDto[]; isAdmin: boolean; /** Show one street's campaigns (the BIA console's selected street). */ neighbourhoodId?: string }) {
  const list = useApi(() => browserApi.campaigns.list({ limit: 100, neighbourhoodId }), [neighbourhoodId]);
  // "New campaign" from the overview lands here with ?new=1 and opens the form.
  const [create, setCreate] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("new") === "1");
  const hoodName = (id: string) => neighbourhoods.find((n) => n.id === id)?.name ?? "Neighbourhood";
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Neighbourhood campaigns" description="Street-wide events: customers visit participating shops to earn bonus points and enter a prize draw." actions={<Button size="sm" iconStart={Plus} onClick={() => setCreate(true)}>New campaign</Button>} />
      <Async state={list}>
        {(d) =>
          d.items.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {d.items.map((c) => (
                <li key={c.id}>
                  <Link href={`${base}/${c.id}`} className="flex flex-col gap-1 py-3 hover:bg-bg-subtle sm:flex-row sm:items-center sm:gap-6 sm:px-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-meta-strong text-fg">{c.name}</h2>
                      <p className="truncate text-meta text-fg-muted">{hoodName(c.neighbourhoodId)} · {KIND_LABEL[c.kind]} · {formatDate(c.startsAt)} to {formatDate(c.endsAt)}</p>
                    </div>
                    <p className="shrink-0 text-meta text-fg-muted tabular">{c.merchants.length} shops · visit {c.goalVisits}{c.bonusPoints ? ` · +${c.bonusPoints} pts` : ""}</p>
                    {isAdmin || c.priceCents ? <span className="w-16 shrink-0 text-meta text-fg-muted">{c.paid ? "Paid" : c.priceCents ? "Unpaid" : "Free"}</span> : null}
                    <span className="w-24 shrink-0"><StatusDot domain="campaign" status={c.status} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No campaigns yet" description="A passport week is the easiest way to show the street that events bring people in." action={<Button variant="secondary" size="sm" onClick={() => setCreate(true)}>New campaign</Button>} />
          )
        }
      </Async>
      <CampaignForm open={create} onClose={() => setCreate(false)} neighbourhoods={neighbourhoods} isAdmin={isAdmin} onSaved={() => void list.reload()} base={base} defaultNeighbourhoodId={neighbourhoodId} />
    </div>
  );
}

function CampaignForm({ open, onClose, neighbourhoods, isAdmin, onSaved, base, campaign, defaultNeighbourhoodId }: { open: boolean; onClose: () => void; neighbourhoods: networkApi.NeighbourhoodDto[]; isAdmin: boolean; onSaved: (c: C.Campaign) => void; base: string; campaign?: C.Campaign; defaultNeighbourhoodId?: string }) {
  const pkg = campaignsApi.CAMPAIGN_PACKAGES;
  const [kind, setKind] = useState<C.CampaignKind>(campaign?.kind ?? "passport");
  const [f, setF] = useState(() => ({
    neighbourhoodId: campaign?.neighbourhoodId ?? defaultNeighbourhoodId ?? neighbourhoods[0]?.id ?? "",
    name: campaign?.name ?? "",
    description: campaign?.description ?? "",
    start: toLocalInput(campaign?.startsAt ?? addDays(new Date().toISOString(), 7)),
    end: toLocalInput(campaign?.endsAt ?? addDays(new Date().toISOString(), 14)),
    goalVisits: String(campaign?.goalVisits ?? pkg.passport.goalVisits),
    bonusPoints: String(campaign?.bonusPoints ?? 25),
    multiplier: campaign?.multiplierPct ? String(campaign.multiplierPct / 100) : "2",
    prize: campaign?.prize ?? "",
    price: campaign ? String(campaign.priceCents / 100) : String(pkg.passport.priceCents / 100),
  }));
  const act = useAction();
  const router = useRouter();
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} size="md" title={campaign ? "Edit campaign" : "New campaign"} actions={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={act.busy} onClick={async () => {
          if (f.name.trim().length < 3) return act.setError("Give it a name.");
          const body: Record<string, unknown> = {
            name: f.name.trim(), description: f.description.trim() || undefined, startsAt: fromLocalInput(f.start), endsAt: fromLocalInput(f.end), goalVisits: Number(f.goalVisits) || undefined,
            bonusPoints: Number(f.bonusPoints) || 0, multiplierPct: kind === "multiplier" || (kind === "points_weekend" && Number(f.multiplier) > 1) ? Math.round(Number(f.multiplier) * 100) : undefined, prize: f.prize.trim() || undefined,
            ...(isAdmin ? { priceCents: Math.round(Number(f.price) * 100) } : {}),
          };
          const r = await act.run(() => (campaign ? browserApi.campaigns.update(campaign.id, body) : browserApi.campaigns.create({ ...body, neighbourhoodId: f.neighbourhoodId, kind })));
          if (r) {
            onSaved(r);
            onClose();
            if (!campaign) router.push(`${base}/${r.id}`);
          }
        }}>{campaign ? "Save" : "Create draft"}</Button>
      </>
    }>
      <div className="grid gap-4 sm:grid-cols-2">
        {!campaign ? <Select label="Neighbourhood" value={f.neighbourhoodId} onChange={(e) => set("neighbourhoodId", e.target.value)} options={neighbourhoods.map((n) => ({ value: n.id, label: n.name }))} /> : null}
        {!campaign ? <Select label="Package" value={kind} onChange={(e) => { const k = e.target.value as C.CampaignKind; setKind(k); set("goalVisits", String(pkg[k].goalVisits)); set("price", String(pkg[k].priceCents / 100)); set("end", toLocalInput(addDays(fromLocalInput(f.start)!, pkg[k].days))); }} options={(Object.keys(pkg) as C.CampaignKind[]).map((k) => ({ value: k, label: `${pkg[k].name} · ${formatMoney(pkg[k].priceCents)}` }))} /> : null}
        <div className="sm:col-span-2"><TextField label="Name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Roncy Passport Week" /></div>
        <TextField type="datetime-local" label="Starts" value={f.start} onChange={(e) => set("start", e.target.value)} />
        <TextField type="datetime-local" label="Ends" hint="31 days at most" value={f.end} onChange={(e) => set("end", e.target.value)} />
        <TextField label="Shops to visit" inputMode="numeric" value={f.goalVisits} onChange={(e) => set("goalVisits", e.target.value.replace(/\D/g, ""))} />
        <TextField label="Bonus per shop" inputMode="numeric" suffix="pts" hint="Funded by the network" value={f.bonusPoints} onChange={(e) => set("bonusPoints", e.target.value.replace(/\D/g, ""))} />
        {kind !== "passport" ? <TextField label="Points multiplier" inputMode="decimal" suffix="x" value={f.multiplier} onChange={(e) => set("multiplier", e.target.value)} /> : null}
        <TextField label="Prize" optionalLabel value={f.prize} onChange={(e) => set("prize", e.target.value)} placeholder="$200 in gift cards from the strip" />
        {isAdmin ? <TextField label="Price" inputMode="decimal" prefix="$" value={f.price} onChange={(e) => set("price", e.target.value)} /> : null}
        <div className="sm:col-span-2"><TextField type="textarea" label="Description" optionalLabel value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        {act.error ? <div className="sm:col-span-2"><Banner tone="danger">{act.error}</Banner></div> : null}
      </div>
    </Modal>
  );
}

export function CampaignDetail({ id, base, isAdmin, neighbourhoods }: { id: string; base: string; isAdmin: boolean; neighbourhoods: networkApi.NeighbourhoodDto[] }) {
  const toast = useToast();
  const c = useApi(() => browserApi.campaigns.get(id), [id]);
  const report = useApi(() => browserApi.campaigns.report(id), [id]);
  const hood = neighbourhoods.find((n) => n.id === c.data?.neighbourhoodId);
  const hoodId = c.data?.neighbourhoodId;
  const shops = useApi(hoodId ? () => browserApi.campaigns.neighbourhoodMerchants(hoodId) : null, [hoodId]);
  const [add, setAdd] = useState("");
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [draw, setDraw] = useState<C.DrawResult | null>(null);
  const act = useAction();
  const now = useNow();
  return (
    <Async state={c}>
      {(x) => {
        const ended = new Date(x.endsAt).getTime() < now;
        const started = new Date(x.startsAt).getTime() <= now;
        const editable = x.status === "draft" || x.status === "scheduled";
        const notIn = (shops.data?.items ?? []).filter((s) => s.status !== "closed" && !x.merchants.some((m) => m.id === s.id));
        const r = report.data;
        return (
          <div className="flex flex-col gap-5">
            <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={base} className="self-start print:hidden">All campaigns</Button>
            <PageHeader title={x.name} description={<span className="flex flex-wrap items-center gap-2"><StatusDot domain="campaign" status={x.status} />{hood?.name} · {KIND_LABEL[x.kind]} · {formatDate(x.startsAt)} to {formatDate(x.endsAt)}</span>} actions={
              <div className="flex flex-wrap gap-2 print:hidden">
                {x.status === "draft" ? <Button size="sm" loading={act.busy} onClick={async () => { const n = await act.run(() => browserApi.campaigns.schedule(x.id)); if (n) { c.setData(n); toast({ message: "Scheduled", tone: "success" }); } }}>Schedule</Button> : null}
                {editable ? <Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Edit</Button> : null}
                {isAdmin ? <Button size="sm" variant="secondary" onClick={async () => { const n = await act.run(() => browserApi.admin.markCampaignPaid(x.id, !x.paid)); if (n) c.setData(n); }}>{x.paid ? "Mark unpaid" : "Mark paid"}</Button> : null}
                {isAdmin && ended && x.status !== "cancelled" ? <Button size="sm" variant="accent" iconStart={Trophy} onClick={async () => { const d = await act.run(() => browserApi.admin.drawCampaign(x.id, !!x.drawnAt)); if (d) setDraw(d); }}>{x.drawnAt ? "Redraw" : "Prize draw"}</Button> : null}
                {x.status !== "ended" && x.status !== "cancelled" ? <Button size="sm" variant="ghost" onClick={() => setCancel(true)}>Cancel</Button> : null}
              </div>
            } />
            {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
            {x.status === "draft" && !x.paid && x.priceCents > 0 && !isAdmin ? <Banner tone="info">Price {formatMoney(x.priceCents)}. We&apos;ll invoice the BIA; you can schedule once it&apos;s paid.</Banner> : null}
            {draw ? <Banner tone="success" title="Winner drawn">{draw.winner.firstName ?? "Customer"} · {draw.winner.maskedPhone} (from {formatNumber(draw.eligibleCount)} who completed). Contact them through the shop where they last visited.</Banner> : null}

            <Panel className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <TrendingUp aria-hidden className="mt-1 size-7 shrink-0 text-fg" />
                <div>
                  <p className="text-meta text-fg-muted text-fg-muted">Visit lift</p>
                  <p className="text-title text-fg">{!started ? `Starts ${formatDate(x.startsAt, true)}` : r ? liftText(r) : "..."}</p>
                  {!started ? <p className="text-meta text-fg-muted">Visit lift against the same days before shows here once the campaign is live.</p> : null}
                  {r && started ? <p className="text-meta text-fg-muted">{formatNumber(r.visits)} visits at participating shops vs {formatNumber(r.baselineVisits)} in the {formatDate(r.baselineWindow.startsAt)}–{formatDate(r.baselineWindow.endsAt)} baseline.</p> : null}
                </div>
              </div>
              {r ? <ReportSummary report={r} goal={x.goalVisits} tiles="full" /> : null}
              {r ? (
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button variant="secondary" iconStart={Download} onClick={() => downloadCsv(`${x.name}-report.csv`, campaignReportRows(r))}>Export CSV</Button>
                  <Button variant="ghost" iconStart={Printer} onClick={() => window.print()}>Print or save PDF</Button>
                </div>
              ) : null}
              <p className="text-caption text-fg-muted">Aggregates only. No customer is identified in this report. “Came back within 30 days” counts customers who visited a participating shop during the campaign and visit any shop on the street in the 30 days after it ends.</p>
            </Panel>

            <Panel title={`Participating shops (${x.merchants.length})`}>
              <ul className="divide-y divide-line">
                {x.merchants.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/shops/${m.slug}`} className="text-body text-fg hover:underline">{m.name}</Link>
                    {editable || isAdmin ? <IconButton icon={Trash2} label={`Remove ${m.name}`} size={40} onClick={async () => { const n = await act.run(() => browserApi.campaigns.removeMerchant(x.id, m.id)); if (n) c.setData(n); }} /> : null}
                  </li>
                ))}
              </ul>
              {(editable || isAdmin) && notIn.length ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 print:hidden">
                  <div className="min-w-60 flex-1"><Select label="Add a shop" placeholder="Pick a shop on the strip" value={add} onChange={(e) => setAdd(e.target.value)} options={notIn.map((s) => ({ value: s.id, label: `${s.name}${s.status === "active" ? "" : ` (${s.status})`}${s.activated ? "" : " · not activated yet"}` }))} /></div>
                  <Button variant="secondary" disabled={!add} onClick={async () => { const n = await act.run(() => browserApi.campaigns.addMerchant(x.id, add)); if (n) { c.setData(n); setAdd(""); } }}>Add shop</Button>
                </div>
              ) : null}
            </Panel>
            {edit ? <CampaignForm open onClose={() => setEdit(false)} neighbourhoods={neighbourhoods} isAdmin={isAdmin} onSaved={(n) => c.setData(n)} base={base} campaign={x} /> : null}
            <ConfirmDialog open={cancel} onClose={() => setCancel(false)} title={`Cancel ${x.name}?`} body="Customers stop seeing it. Points already earned stay." confirmLabel="Cancel campaign" danger onConfirm={async () => { c.setData(await browserApi.campaigns.cancel(x.id)); }} />
          </div>
        );
      }}
    </Async>
  );
}
