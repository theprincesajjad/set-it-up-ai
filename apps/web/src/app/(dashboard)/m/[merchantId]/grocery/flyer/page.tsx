"use client";
/**
 * Weekly flyer (grocery.flyer), docs/research/grocers.md frame D4: this week's deals typed once and used four places (the shop page,
 * a text to members who agreed, WhatsApp copy and the pass), with the festival strip that says when the stock-up flyer should go out.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { groceryApi } from "@ll/shared";
import { Capsules, DataTable, EmptyState, ErrorLine, FeatureGate, PageHeader, Tag, useMerchant, type Column } from "@/components/dashboard";
import { DealSheet, type DealDraft } from "@/components/dashboard/grocery/DealSheet";
import { CopyButton } from "@/components/dashboard/restaurant/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { dealDates, dealPerUnitLine, dealPriceLabel, daysWords, seasonFlyerLine } from "@/lib/grocery";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function FlyerPage() {
  return (
    <FeatureGate keys={["grocery.flyer"]} title="Weekly flyer">
      <Flyer />
    </FeatureGate>
  );
}

type Filter = "now" | "upcoming" | "ended";

function Flyer() {
  const { api, base, role } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const act = useAction();
  const state = useApi(() => api.grocery.deals(), [api]);
  const [filter, setFilter] = useState<Filter>("now");
  const [sheet, setSheet] = useState<{ deal: groceryApi.DealDto | null; draft?: DealDraft | null } | null>(null);
  const canEdit = role === "owner" || role === "manager";
  const d = state.data;
  const rows = (d?.deals ?? []).filter((x) => (filter === "now" ? x.state === "live" : filter === "upcoming" ? x.state === "upcoming" : x.state === "ended"));
  const count = (s: groceryApi.DealDto["state"]) => (d?.deals ?? []).filter((x) => x.state === s).length;

  async function remove(x: groceryApi.DealDto) {
    const r = await act.run(() => api.grocery.deleteDeal(x.id));
    if (r) {
      toast({ message: `${x.title} removed`, tone: "success" });
      void state.reload();
    }
  }
  async function textMembers() {
    const r = await act.run(() => api.grocery.draftFlyerText());
    if (r) {
      toast({ message: `Draft ready for ${r.audience} ${r.audience === 1 ? "member" : "members"}. Check it, then send.`, tone: "success" });
      router.push(`${base}/messages/${r.messageId}`);
    }
  }

  const cols: Column<groceryApi.DealDto>[] = [
    { key: "title", header: "Deal", mobile: "title", cell: (x) => <span className="font-medium">{x.title}</span> },
    {
      key: "price",
      header: "Price",
      mobile: "trailing",
      cell: (x) => (
        <span className="block">
          <span className="font-semibold tabular text-accent-text">{dealPriceLabel(x)}</span>
          {x.wasPriceCents ? <span className="block text-caption text-fg-muted">was {formatMoney(x.wasPriceCents)}</span> : null}
        </span>
      ),
    },
    { key: "per", header: "Per unit", mobile: "hidden", cell: (x) => <span className="text-fg-muted tabular">{dealPerUnitLine(x) ?? "–"}</span> },
    { key: "dates", header: "Dates", mobile: "subtitle", cell: (x) => <span className="text-fg-muted">{dealDates(x.startsOn, x.endsOn)}</span> },
    {
      key: "for",
      header: "For",
      mobile: "subtitle",
      cell: (x) => (
        <span className="flex flex-wrap gap-1.5">
          <Tag tone={x.memberOnly ? "accent" : "neutral"}>{x.memberOnly ? "Members" : "Everyone"}</Tag>
          {x.seasonId ? <Tag>{d?.seasons.find((s) => s.id === x.seasonId)?.name ?? x.seasonId.replace(/_/g, " ")}</Tag> : null}
          {!x.active ? <Tag>Off</Tag> : null}
        </span>
      ),
    },
    {
      key: "act",
      header: "",
      align: "end",
      mobile: "hidden",
      cell: (x) =>
        canEdit ? (
          <span className="inline-flex gap-1">
            <Button size="sm" variant="ghost" iconStart={Pencil} aria-label={`Edit ${x.title}`} onClick={() => setSheet({ deal: x })}>Edit</Button>
            <Button size="sm" variant="ghost" iconStart={Trash2} aria-label={`Remove ${x.title}`} onClick={() => void remove(x)}>Remove</Button>
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title="Weekly flyer"
        description="Type this week's deals once. They show on your shop page, go out as a text to members who agreed, and copy into WhatsApp."
        actions={
          canEdit ? (
            <>
              {d?.whatsappText ? <CopyButton text={d.whatsappText} label="Copy for WhatsApp" className="h-[38px] rounded-full px-4" /> : null}
              <Button size="md" variant="secondary" disabled={!d?.whatsappText || !d.textable} loading={act.busy} onClick={() => void textMembers()}>Text members</Button>
              <Button size="md" onClick={() => setSheet({ deal: null })}>Add a deal</Button>
            </>
          ) : null
        }
      />
      {state.error && !d ? <ErrorLine message={state.error} onRetry={() => void state.reload()} /> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      {d && d.seasons.length ? (
        <section aria-label="Coming up" className="grid gap-3 md:grid-cols-3">
          {d.seasons.slice(0, 3).map((s) => (
            <div key={s.id} className="flex flex-col gap-2 rounded-card border border-line px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-semibold text-fg">{s.name}</p>
                <Tag tone={s.flyerDue ? "accent" : "neutral"}>{daysWords(s.daysUntil)}</Tag>
              </div>
              <p className="text-meta text-fg-muted">{seasonFlyerLine(s)}</p>
              <p className="text-caption text-fg-muted">{s.ideas.slice(0, 3).join(" · ")}</p>
              {s.approximate ? <p className="text-caption text-fg-muted">Approximate, confirm locally.</p> : null}
              {canEdit ? (
                s.qurbani ? (
                  <Button size="sm" variant="secondary" className="self-start" href={`${base}/grocery/butcher?tab=eid`}>Plan qurbani</Button>
                ) : (
                  <Button size="sm" variant="secondary" className="self-start" onClick={() => setSheet({ deal: null, draft: { seasonId: s.id, startsOn: s.flyerFrom > d.today ? s.flyerFrom : d.today, endsOn: s.start } })}>Start a {s.name} flyer</Button>
                )
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <Capsules
        label="Which deals"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "now", label: "Running now", count: count("live") },
          { value: "upcoming", label: "Coming up", count: count("upcoming") },
          { value: "ended", label: "Ended", count: count("ended") },
        ]}
      />
      <DataTable
        caption="Deals"
        columns={cols}
        rows={rows}
        rowKey={(x) => x.id}
        loading={state.loading && !d}
        empty={
          <EmptyState
            title={filter === "now" ? "No deals running today" : filter === "upcoming" ? "Nothing scheduled" : "No ended deals"}
            description={filter === "now" ? "Add this week's deals. Customers see them on your shop page." : undefined}
            action={canEdit && filter !== "ended" ? <Button size="md" onClick={() => setSheet({ deal: null })}>Add a deal</Button> : undefined}
          />
        }
      />
      {d && d.textable === 0 ? <p className="text-caption text-fg-muted">No members have agreed to texts yet. Ask at the counter when you add someone.</p> : null}
      {sheet ? <DealSheet deal={sheet.deal} draft={sheet.draft} today={d?.today ?? ""} onClose={() => setSheet(null)} onSaved={() => void state.reload()} /> : null}
    </div>
  );
}
