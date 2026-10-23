"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { ServiceEditor } from "@/components/dashboard/calendar/ServiceEditor";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { PageHeader, Segmented, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { duration, money } from "@/lib/dashboard/calendar";
import { useApi } from "@/lib/dashboard/useApi";

type Service = appointmentsApi.ServiceDto;

export default function ServicesPage() {
  return (
    <FeatureGate keys={["booking.appointments", "service.tickets"]} title="Services & prices">
      <Services />
    </FeatureGate>
  );
}

function Services() {
  const { api, enabled, role } = useMerchant();
  const both = enabled("booking.appointments") && enabled("service.tickets");
  // Repair shops see the same table as their price list.
  const [kind, setKind] = useState<appointmentsApi.ServiceKind>(enabled("booking.appointments") ? "appointment" : "repair_line");
  const repair = kind === "repair_line";
  const list = useApi(() => api.appointments.services(kind), [api, kind]);
  const staff = useApi(enabled("booking.appointments") && !repair ? () => api.appointments.staff() : null, [api, repair]);
  const cats = useApi(() => api.categories(), [api]);
  const [edit, setEdit] = useState<Service | "new" | null>(null);
  const manager = role !== "staff";
  const people = staff.data?.items ?? [];
  const nameOf = (id: string) => people.find((p) => p.userId === id)?.name.split(" ")[0] ?? "";

  const columns: Column<Service>[] = [
    { key: "name", header: "Name", mobile: "title", sortValue: (s) => s.name.toLowerCase(), cell: (s) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-body text-fg">{s.name}</span>
        {!s.active ? <Tag>Hidden</Tag> : null}
      </span>
    ) },
    ...(!repair ? [{ key: "duration", header: "Length", mobile: "subtitle" as const, sortValue: (s: Service) => s.durationMin, cell: (s: Service) => <span className="tabular text-fg-muted">{duration(s.durationMin)}</span> }] : []),
    { key: "price", header: "Price", align: "end", mobile: "trailing", sortValue: (s) => s.priceCents, cell: (s) => <span className="tabular">{s.priceFrom ? "from " : ""}{money(s.priceCents)}</span> },
    ...(!repair ? [{ key: "deposit", header: "Deposit", align: "end" as const, mobile: "hidden" as const, sortValue: (s: Service) => s.depositCents, cell: (s: Service) => <span className="tabular text-fg-muted">{s.depositCents ? money(s.depositCents) : "None"}</span> }] : []),
    ...(!repair ? [{ key: "staff", header: "Who", mobile: "subtitle" as const, cell: (s: Service) => <span className="truncate text-fg-muted">{s.staffIds.length ? s.staffIds.map(nameOf).filter(Boolean).join(", ") : "Anyone"}</span> }] : []),
    { key: "rebook", header: "Rebook after", align: "end", mobile: "hidden", sortValue: (s) => s.rebookAfterDays ?? 0, cell: (s) => <span className="tabular text-fg-muted">{s.rebookAfterDays ? `${s.rebookAfterDays} days` : "Not set"}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title={repair ? "Price list" : "Services & prices"}
        description={repair ? "Canned lines for quotes and invoices. Pick them when you write a quote." : "What clients can book online and at the desk, how long it takes and what it costs."}
        actions={
          <>
            {both ? <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "appointment", label: "Services" }, { value: "repair_line", label: "Price list" }]} /> : null}
            {manager ? <Button size="sm" iconStart={Plus} onClick={() => setEdit("new")}>{repair ? "Add a line" : "Add a service"}</Button> : null}
          </>
        }
      />
      <DataTable
        caption={repair ? "Price list" : "Services"}
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(s) => s.id}
        loading={list.loading && !list.data}
        error={list.error}
        onRetry={list.reload}
        onRowClick={manager ? (s) => setEdit(s) : undefined}
        empty={<span className="text-fg-muted">{repair ? "No lines yet. Add the jobs you quote most." : "No services yet. Add what you offer, with how long it takes and the price."}</span>}
      />
      {manager ? (
        <ServiceEditor
          open={!!edit}
          onClose={() => setEdit(null)}
          service={edit && edit !== "new" ? edit : null}
          kind={kind}
          staff={people}
          categories={cats.data?.items ?? []}
          onSaved={async () => {
            await list.reload();
          }}
        />
      ) : null}
    </div>
  );
}
