"use client";
import { useMemo, useState } from "react";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Capsules, Dot, EmptyState, ErrorLine, PageHeader, SidePanel, SkeletonRows, StatBlock, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { InvoiceDetail } from "@/components/dashboard/service/InvoiceDetail";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Filter = "all" | "open" | "overdue" | "paid";

export default function InvoicesPage() {
  return (
    <FeatureGate keys={["service.invoices"]} title="Invoices">
      <Invoices />
    </FeatureGate>
  );
}

function Invoices() {
  const { api, base, role } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const query = useMemo(() => ({ ...(filter === "open" ? { status: "open" } : filter === "paid" ? { status: "paid" } : filter === "overdue" ? { filter: "overdue" } : {}), ...(q.trim() ? { q: q.trim() } : {}), limit: 100 }), [filter, q]);
  const list = useApi(() => api.serviceOps.invoices(query), [api, query], { pollMs: 30_000 });
  const summary = useApi(() => api.serviceOps.invoiceSummary(), [api], { pollMs: 30_000 });
  const s = summary.data;
  const rows = list.data?.items ?? [];
  const row = rows.find((r) => r.id === selected) ?? null;
  const reloadAll = async () => {
    await Promise.all([list.reload(), summary.reload()]);
  };
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Invoices" description="Every invoice comes from an approved quote. Customers pay by link, or you take payment at the counter." actions={<Capsules label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "overdue", label: "Overdue", count: s?.overdueCount || null, tone: "negative" }, { value: "paid", label: "Paid" }]} />} />
      <StatBlock
        label="Invoices at a glance"
        cols={5}
        loading={summary.loading && !s}
        items={[
          { label: "Open", dot: "info", value: formatMoney(s?.openCents ?? 0).replace(/\.00$/, ""), caption: `${n(s?.openCount ?? 0, "invoice", "invoices")}${s?.openReadyTickets ? `, ${s.openReadyTickets} ready ${s.openReadyTickets === 1 ? "ticket" : "tickets"}` : ""}` },
          { label: "Overdue", dot: "negative", value: formatMoney(s?.overdueCents ?? 0).replace(/\.00$/, ""), caption: s?.overdueCount ? `${n(s.overdueCount, "invoice", "invoices")}, oldest ${s.oldestOverdueDays} days` : "Nothing overdue" },
          { label: "Paid this month", dot: "neutral", value: formatMoney(s?.paidThisMonthCents ?? 0).replace(/\.00$/, ""), caption: n(s?.paidThisMonthCount ?? 0, "invoice", "invoices") },
          { label: "Deposits held", dot: "neutral", value: formatMoney(s?.depositsHeldCents ?? 0).replace(/\.00$/, ""), caption: `On ${n(s?.depositsHeldQuotes ?? 0, "approved quote", "approved quotes")}` },
          { label: "Average time to pay", dot: "neutral", value: s?.avgDaysToPay == null ? "None yet" : `${s.avgDaysToPay} days`, caption: "From sent to paid" },
        ]}
      />
      <TextField type="search" label="Search invoices" hideLabel placeholder="Customer, phone, invoice or ticket number" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.error && !list.data ? (
        <ErrorLine message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={6} />
      ) : rows.length ? (
        <TableWrap>
          <Table label="Invoices">
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Customer</Th>
                <Th>For</Th>
                <Th align="end">Amount</Th>
                <Th>Status</Th>
                <Th className="hidden lg:table-cell">Last activity</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id} onOpen={() => { setSelected(r.id); setCopied(false); act.setError(null); }} selected={r.id === selected}>
                  <Td className="tabular">#{r.number}</Td>
                  <Td className="max-w-[140px] truncate">{r.customerName ?? "Customer"}</Td>
                  <Td className="max-w-[160px] truncate text-fg-muted">{r.ticketNumber ? `#${r.ticketNumber} ${r.itemLabel ?? ""}` : "Direct"}</Td>
                  <Td align="end">{formatMoney(r.totalCents)}</Td>
                  <Td>
                    <Dot tone={r.status === "paid" ? "positive" : r.overdue ? "negative" : r.status === "open" ? "info" : "neutral"}>
                      {r.status === "open" ? (r.overdue ? "Overdue" : "Open") : r.status === "paid" ? "Paid" : r.status === "draft" ? "Draft" : "Void"}
                    </Dot>
                  </Td>
                  <Td className="hidden text-fg-muted lg:table-cell">{r.lastActivity}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <EmptyState title={filter === "all" && !q ? "No invoices yet" : "No invoices match"} description={filter === "all" && !q ? "Send an invoice from an approved quote on a ticket and it shows up here." : "Try another filter or search."} />
      )}
      <SidePanel open={!!row} onClose={() => setSelected(null)} title={row ? `Invoice #${row.number}` : ""} subtitle={row ? `${row.customerName ?? "Customer"} · ${formatDate(row.createdAt)}` : undefined} label="Invoice detail" width={420}>
        {row ? (
          <InvoiceDetail
            row={row}
            canVoid={role === "owner" || role === "manager"}
            busy={act.busy}
            error={act.error}
            copied={copied}
            ticketHref={row.ticketId ? `${base}/tickets/${row.ticketId}` : null}
            onPay={async (m) => {
              const r = await act.run(() => api.serviceOps.markPaid(row.id, m));
              if (r) {
                toast({ message: `Recorded, ${formatMoney(row.amountDueCents)}`, tone: "success" });
                await reloadAll();
              }
            }}
            onCopy={async () => {
              if (row.payUrl) {
                try {
                  await navigator.clipboard.writeText(row.payUrl);
                  setCopied(true);
                } catch {
                  act.setError("Copy didn't work. Select the link from the ticket instead.");
                }
              }
            }}
            onText={async () => {
              const r = await act.run(() => api.serviceOps.sendInvoice(row.id));
              if (r) {
                toast({ message: "Texted to the customer", tone: "success" });
                await reloadAll();
              }
            }}
            onVoid={async () => {
              await api.serviceOps.voidInvoice(row.id);
              setSelected(null);
              await reloadAll();
            }}
          />
        ) : null}
      </SidePanel>
    </div>
  );
}

