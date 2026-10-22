"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VERTICALS, repApi, type repApi as R } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { PageHeader } from "@/components/ui/Layout";
import { Modal } from "@/components/ui/Modal";
import { PhoneField } from "@/components/ui/PhoneField";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { formatDate } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

const STAGE_LABEL: Record<R.LeadStage, string> = { new: "New", contacted: "Contacted", visit_booked: "Visit booked", signed: "Signed", activated: "Live", lost: "Lost" };

export default function LeadsPage() {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const leads = useApi(() => browserApi.rep.leads({ q: q.trim() || undefined, limit: 200 }), [q]);
  const hoods = useNeighbourhoods();
  const [create, setCreate] = useState(false);
  const [f, setF] = useState({ businessName: "", vertical: "", address: "", contactName: "", email: "", neighbourhoodId: "", currentLoyalty: "", notes: "" });
  const [phone, setPhone] = useState<string | null>(null);
  const act = useAction();
  const items = leads.data?.items ?? [];

  const cols: Column<R.Lead>[] = [
    { key: "name", header: "Business", mobile: "title", sortValue: (l) => l.businessName, cell: (l) => <span className="font-medium">{l.businessName}</span> },
    { key: "stage", header: "Stage", mobile: "trailing", cell: (l) => <Badge>{STAGE_LABEL[l.stage]}</Badge> },
    { key: "vertical", header: "Type", mobile: "subtitle", cell: (l) => (l.vertical ? verticalLabel(l.vertical) : "–") },
    { key: "next", header: "Next action", mobile: "subtitle", sortValue: (l) => l.nextActionAt ?? "~", cell: (l) => (l.nextActionAt ? formatDate(l.nextActionAt, true) : "–") },
    { key: "acts", header: "Activity", align: "end", mobile: "hidden", cell: (l) => l.activityCount },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Leads" description="Your pipeline and unassigned leads. Touching an unassigned lead claims it." actions={<Button iconStart={Plus} onClick={() => setCreate(true)}>Add prospect</Button>} />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl label="View" value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} />
        <div className="min-w-60 flex-1">
          <TextField type="search" label="Search leads" hideLabel placeholder="Search business or contact" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {leads.error ? <Banner tone="danger">{leads.error}</Banner> : null}
      {view === "board" ? (
        leads.loading && !leads.data ? (
          <Skeleton className="h-60 rounded-card" />
        ) : (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {repApi.LEAD_STAGES.map((s) => {
              const ls = items.filter((l) => l.stage === s);
              return (
                <section key={s} aria-label={STAGE_LABEL[s]} className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-card bg-bg-subtle p-3">
                  <h2 className="flex justify-between text-label text-fg">{STAGE_LABEL[s]} <span className="tabular-nums text-fg-muted">{ls.length}</span></h2>
                  {ls.map((l) => (
                    <Link key={l.id} href={`/rep/leads/${l.id}`} className="rounded-input bg-bg p-3 hover:shadow-float focus-visible:focus-ring">
                      <p className="text-body-strong text-fg">{l.businessName}</p>
                      <p className="text-meta text-fg-muted">{[l.vertical ? verticalLabel(l.vertical) : null, l.contactName].filter(Boolean).join(" · ") || "No details yet"}</p>
                      {l.nextActionAt ? <p className="mt-1 text-caption text-fg-muted">Next: {formatDate(l.nextActionAt, true)}</p> : null}
                    </Link>
                  ))}
                </section>
              );
            })}
          </div>
        )
      ) : (
        <DataTable caption="Leads" columns={cols} rows={items} rowKey={(l) => l.id} loading={leads.loading} onRowClick={(l) => router.push(`/rep/leads/${l.id}`)} />
      )}
      <Modal open={create} onClose={() => setCreate(false)} title="Add a prospect" size="md" actions={
        <>
          <Button variant="secondary" onClick={() => setCreate(false)}>Cancel</Button>
          <Button loading={act.busy} onClick={async () => {
            if (!f.businessName.trim()) return act.setError("Add the business name.");
            const body = Object.fromEntries(Object.entries({ ...f, phone }).filter(([, v]) => v));
            const r = await act.run(() => browserApi.rep.createLead(body));
            if (r) router.push(`/rep/leads/${r.id}`);
          }}>Add prospect</Button>
        </>
      }>
        <div className="flex flex-col gap-4">
          <TextField label="Business name" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
          <Select label="Type" placeholder="Pick a type" value={f.vertical} onChange={(e) => setF({ ...f, vertical: e.target.value })} options={VERTICALS.map((v) => ({ value: v, label: verticalLabel(v) }))} />
          <TextField label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <Select label="Neighbourhood" placeholder="Pick a neighbourhood" value={f.neighbourhoodId} onChange={(e) => setF({ ...f, neighbourhoodId: e.target.value })} options={(hoods ?? []).map((h) => ({ value: h.id, label: h.name }))} />
          <TextField label="Owner or contact" optionalLabel value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <PhoneField label="Phone" onChangeE164={setPhone} />
          <TextField type="email" label="Email" optionalLabel value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <TextField label="Current loyalty" optionalLabel placeholder="Paper punch card, SoPoints, none" value={f.currentLoyalty} onChange={(e) => setF({ ...f, currentLoyalty: e.target.value })} />
          <TextField type="textarea" label="Notes" optionalLabel value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        </div>
      </Modal>
    </div>
  );
}
