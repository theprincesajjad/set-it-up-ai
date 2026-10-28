"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { RETENTION, SERVICE_STARTERS, type appointmentsApi } from "@ll/shared";
import { PolicyCard } from "@/components/dashboard/calendar/PolicyCard";
import { ServiceEditor } from "@/components/dashboard/calendar/ServiceEditor";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { PageHeader, Segmented, Tag } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { duration, money } from "@/lib/dashboard/calendar";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Service = appointmentsApi.ServiceDto;

export default function ServicesPage() {
  return (
    <FeatureGate keys={["booking.appointments", "service.tickets"]} title="Services & prices">
      <Services />
    </FeatureGate>
  );
}

function Services() {
  const { api, enabled, role, detail } = useMerchant();
  // Pharmacist appointments (flu shot, vaccine, medication review): no price, no deposit, no points, no rebooking (docs/research/pharmacies-wellness.md).
  const pharmacy = detail.merchant.vertical === "pharmacy";
  const both = enabled("booking.appointments") && enabled("service.tickets");
  // Repair shops see the same table as their price list.
  const [kind, setKind] = useState<appointmentsApi.ServiceKind>(enabled("booking.appointments") ? "appointment" : "repair_line");
  const repair = kind === "repair_line";
  const list = useApi(() => api.appointments.services(kind), [api, kind]);
  const staff = useApi(enabled("booking.appointments") && !repair ? () => api.appointments.staff() : null, [api, repair]);
  const cats = useApi(() => api.categories(), [api]);
  const [edit, setEdit] = useState<Service | "new" | null>(null);
  const manager = role !== "staff";
  const act = useAction();
  // A new shop with no services yet gets the usual list for its trade in one tap (a groomer's is priced by dog size).
  const starters = SERVICE_STARTERS[detail.merchant.vertical as keyof typeof SERVICE_STARTERS] ?? [];
  const noServices = !repair && !!list.data && list.data.items.length === 0;
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
    { key: "price", header: "Price", align: "end", mobile: "trailing", sortValue: (s) => s.priceCents, cell: (s) => (pharmacy ? <span className="text-fg-muted">Not charged here</span> : <span className="tabular">{s.priceFrom ? "from " : ""}{money(s.priceCents)}</span>) },
    ...(pharmacy ? [{ key: "points", header: "Points", align: "end" as const, mobile: "hidden" as const, cell: () => <span className="text-fg-muted">None</span> }] : []),
    ...(!repair && !pharmacy ? [{ key: "deposit", header: "Deposit", align: "end" as const, mobile: "hidden" as const, sortValue: (s: Service) => s.depositCents, cell: (s: Service) => <span className="tabular text-fg-muted">{s.depositCents ? money(s.depositCents) : "None"}</span> }] : []),
    ...(!repair ? [{ key: "staff", header: "Who", mobile: "subtitle" as const, cell: (s: Service) => <span className="truncate text-fg-muted">{s.staffIds.length ? s.staffIds.map(nameOf).filter(Boolean).join(", ") : "Anyone"}</span> }] : []),
    ...(pharmacy ? [] : [{ key: "rebook", header: "Rebook after", align: "end" as const, mobile: "hidden" as const, sortValue: (s: Service) => s.rebookAfterDays ?? 0, cell: (s: Service) => <span className="tabular text-fg-muted">{s.rebookAfterDays ? `${s.rebookAfterDays} days` : "Not set"}</span> }]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        flush
        title={repair ? "Price list" : pharmacy ? "Pharmacist appointments" : "Services & prices"}
        description={repair ? "Canned lines for quotes and invoices. Pick them when you write a quote." : pharmacy ? "Types people can book online. We keep that a booking exists, not why." : "What clients can book online and at the desk, how long it takes and what it costs."}
        actions={
          <>
            {both ? <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "appointment", label: "Services" }, { value: "repair_line", label: "Price list" }]} /> : null}
            {manager ? <Button size="sm" iconStart={Plus} onClick={() => setEdit("new")}>{repair ? "Add a line" : pharmacy ? "Add appointment type" : "Add a service"}</Button> : null}
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
        empty={
          <span className="flex flex-col items-start gap-2 text-fg-muted">
            {repair ? "No lines yet. Add the jobs you quote most." : "No services yet. Add what you offer, with how long it takes and the price."}
            {noServices && manager && starters.length ? (
              <Button size="sm" loading={act.busy} onClick={async () => { const r = await act.run(() => api.appointments.addStarterServices()); if (r) await list.reload(); }}>
                Add the usual {detail.merchant.vertical === "pet" ? "groomer services, priced by dog size" : "services"}
              </Button>
            ) : null}
          </span>
        }
      />
      {!repair && !pharmacy && enabled("booking.appointments") && manager ? <PolicyCard /> : null}
      {pharmacy ? (
        <div className="grid gap-6 md:grid-cols-2" data-testid="pharmacy-keep">
          <PharmacyKeep title="What we keep about a booking" tone="keep" items={["The day, time and length", "The appointment type you named", "The customer's first name and phone, to send a reminder", `After ${RETENTION.pharmacyAppointmentDays} days the name, phone and type are removed. Only a count stays.`]} />
          <PharmacyKeep title="What we never ask for or keep" tone="never" items={["Health card number, medication, condition or reason for the visit", "Notes on the booking", "Payment, deposits or no-show fees", "Points or discounts on a pharmacy service"]} />
        </div>
      ) : null}
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

function PharmacyKeep({ title, items, tone }: { title: string; items: string[]; tone: "keep" | "never" }) {
  return (
    <section className="rounded-card bg-card shadow-card p-5">
      <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((t) => (
          <li key={t} className="flex gap-2.5 text-[13px] text-fg">
            <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full ${tone === "keep" ? "bg-positive" : "bg-negative"}`} />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}
