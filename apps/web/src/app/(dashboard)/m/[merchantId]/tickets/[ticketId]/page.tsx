"use client";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { serviceApi, type serviceApi as S } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { StatusBadge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { PageHeader } from "@/components/ui/Layout";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { Timeline, ticketSteps } from "@/components/ui/Timeline";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Line = { description: string; quantity: string; unit: string; kind: "labour" | "part" | "fee" | "other" };
const HST = 0.13;

export default function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.ticket(ticketId), [api, ticketId]);
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/tickets`} className="self-start">
          Tickets
        </Button>
        <Async state={state}>{(d) => <Ticket d={d} onChange={(n) => state.setData(n)} reload={state.reload} />}</Async>
      </div>
    </FeatureGate>
  );
}

function Ticket({ d, onChange, reload }: { d: S.TicketDetailResponse; onChange: (d: S.TicketDetailResponse) => void; reload: () => Promise<void> }) {
  const { api, enabled } = useMerchant();
  const toast = useToast();
  const t = d.ticket;
  const act = useAction();
  const [status, setStatus] = useState<string>("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ description: "", quantity: "1", unit: "", kind: "part" }, { description: "Labour", quantity: "1", unit: "", kind: "labour" }]);
  const [diagnosis, setDiagnosis] = useState("");
  const [deposit, setDeposit] = useState("0");
  const [internal, setInternal] = useState("");
  const [visible, setVisible] = useState(false);
  const subtotal = lines.reduce((s, l) => s + Math.round((Number.parseFloat(l.unit) || 0) * 100) * (Number.parseInt(l.quantity, 10) || 0), 0);
  const tax = Math.round(subtotal * HST);
  const total = subtotal + tax;
  const latest = d.quotes[0];
  const openInvoice = d.invoices.find((i) => i.status === "open" || i.status === "draft");
  const closed = t.status === "picked_up" || t.status === "cancelled";

  return (
    <>
      <PageHeader title={`#${t.number} · ${[t.itemDetails.make, t.itemDetails.model].filter(Boolean).join(" ") || t.itemKind}`} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge domain="ticket" status={t.status} label={copy.ticketStatus[t.status]} />{t.customer?.name ?? "Customer"}{t.customer?.phone ? ` · ${t.customer.phone}` : ""}</span>} />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card padding="lg">
            <CardHeader title="Issue" />
            <p className="text-body text-fg">{t.issue}</p>
            {t.intakeNotes ? <p className="mt-2 border-s-[3px] border-line ps-3 text-meta text-fg-muted">{t.intakeNotes}</p> : null}
            {Object.keys(t.itemDetails).length ? <p className="mt-2 text-meta text-fg-muted">{Object.entries(t.itemDetails).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p> : null}
          </Card>

          {!closed && enabled("service.quote_approval") ? (
            <Card padding="lg">
              <CardHeader title={latest && latest.status !== "superseded" ? "New quote (replaces the current one)" : "Quote"} subtitle="Totals are recalculated by the server. Customers approve on their phone with a typed signature." />
              <TextField type="textarea" label="Diagnosis" optionalLabel value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
              <div className="mt-4 flex flex-col gap-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[1fr_64px_96px_40px] items-end gap-2 sm:grid-cols-[1fr_120px_64px_96px_40px]">
                    <TextField label={i === 0 ? "Description" : `Line ${i + 1}`} hideLabel={i > 0} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                    <div className="hidden sm:block">
                      <Select hideLabel={i > 0} label="Type" value={l.kind} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, kind: e.target.value as Line["kind"] } : x)))} options={[{ value: "part", label: "Part" }, { value: "labour", label: "Labour" }, { value: "fee", label: "Fee" }, { value: "other", label: "Other" }]} />
                    </div>
                    <TextField label="Qty" hideLabel={i > 0} inputMode="numeric" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x)))} />
                    <TextField label="Price" hideLabel={i > 0} inputMode="decimal" prefix="$" value={l.unit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                    <IconButton icon={Trash2} label={`Remove line ${i + 1}`} size={40} onClick={() => setLines(lines.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button variant="ghost" size="sm" iconStart={Plus} className="self-start" onClick={() => setLines([...lines, { description: "", quantity: "1", unit: "", kind: "part" }])}>
                  Add line
                </Button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-meta">
                <dt className="text-fg-muted">Subtotal</dt><dd className="text-end tabular-nums">{formatMoney(subtotal)}</dd>
                <dt className="text-fg-muted">HST 13% (estimate)</dt><dd className="text-end tabular-nums">{formatMoney(tax)}</dd>
                <dt className="text-body-strong">Total</dt><dd className="text-end text-body-strong tabular-nums">{formatMoney(total)}</dd>
              </dl>
              {enabled("service.deposits") ? (
                <Select label="Deposit on approval" className="mt-3" value={deposit} onChange={(e) => setDeposit(e.target.value)} options={[{ value: "0", label: "No deposit" }, { value: "25", label: `25% (${formatMoney(Math.round(total * 0.25))})` }, { value: "50", label: `50% (${formatMoney(Math.round(total * 0.5))})` }]} />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button iconStart={Send} loading={act.busy} onClick={async () => {
                  const li = lines.filter((l) => l.description.trim() && l.unit).map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity) || 1, unitPriceCents: Math.round(Number.parseFloat(l.unit) * 100), kind: l.kind }));
                  if (!li.length) return act.setError("Add at least one priced line.");
                  const q = await act.run(() => api.createQuote(t.id, { diagnosis: diagnosis.trim() || null, lineItems: li, depositPercent: Number(deposit) || undefined, send: true }));
                  if (q) {
                    toast({ message: "Quote sent by text", tone: "success" });
                    await reload();
                  }
                }}>
                  Send quote
                </Button>
              </div>
            </Card>
          ) : null}

          {d.quotes.length ? (
            <Card padding="lg">
              <CardHeader title="Quotes" />
              <ul className="divide-y divide-line">
                {d.quotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 py-2 text-meta">
                    <StatusBadge domain="quote" status={q.status} />
                    <span className="flex-1 tabular-nums text-fg">{formatMoney(q.totalCents)}{q.depositCents ? ` · ${formatMoney(q.depositCents)} deposit${q.depositPaidAt ? " paid" : ""}` : ""}</span>
                    <span className="text-fg-muted">{q.signatureName ? `Signed by ${q.signatureName}` : q.sentAt ? `Sent ${formatDateTime(q.sentAt)}` : "Draft"}</span>
                    {q.status === "draft" ? <Button size="sm" variant="secondary" onClick={async () => { await act.run(() => api.sendQuote(q.id)); await reload(); }}>Send</Button> : null}
                    {q.approvalUrl ? <a href={q.approvalUrl} className="text-fg underline" target="_blank" rel="noreferrer">Customer link</a> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {enabled("service.invoices") ? (
            <Card padding="lg">
              <CardHeader title="Invoice" />
              {d.invoices.length ? (
                <ul className="divide-y divide-line">
                  {d.invoices.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-meta">
                      <StatusBadge domain="invoice" status={i.status} />
                      <span className="flex-1 tabular-nums">#{i.number} · {formatMoney(i.totalCents)}{i.depositAppliedCents ? ` (deposit ${formatMoney(i.depositAppliedCents)})` : ""} · due {formatMoney(i.amountDueCents)}</span>
                      {i.status === "open" ? <Button size="sm" variant="secondary" onClick={async () => { await act.run(() => api.markInvoicePaid(i.id, "card_terminal")); await reload(); }}>Paid at counter</Button> : null}
                      {i.payUrl ? <a href={i.payUrl} className="text-fg underline" target="_blank" rel="noreferrer">Pay link</a> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {!openInvoice && d.quotes.some((q) => q.status === "approved") ? (
                <Button className="mt-3" loading={act.busy} onClick={async () => {
                  const r = await act.run(() => api.createInvoice(t.id, { fromQuote: true, send: true }));
                  if (r) {
                    toast({ message: "Invoice sent", tone: "success" });
                    await reload();
                  }
                }}>
                  Send invoice from quote
                </Button>
              ) : !d.invoices.length ? <p className="text-meta text-fg-muted">Invoice once the quote is approved.</p> : null}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card padding="lg">
            <CardHeader title="Timeline" />
            <Timeline steps={ticketSteps(t.status, copy.ticketStatus, d.events)} />
            {!closed ? (
              <div className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
                <Select label="Update status" placeholder="Pick a status" value={status} onChange={(e) => setStatus(e.target.value)} options={serviceApi.MANUAL_TICKET_STATUSES.filter((s) => s !== t.status).map((s) => ({ value: s, label: copy.ticketStatus[s] ?? s }))} />
                <TextField label="Note for the customer" optionalLabel value={note} onChange={(e) => setNote(e.target.value)} />
                <Button disabled={!status} loading={act.busy} onClick={async () => {
                  const r = await act.run(() => api.setTicketStatus(t.id, { status: status as S.TicketStatusBody["status"], note: note.trim() || null, allowUnpaid: false }));
                  if (r) {
                    onChange(r);
                    setStatus("");
                    setNote("");
                    toast({ message: "Updated. The customer was notified.", tone: "success" });
                  }
                }}>
                  Update
                </Button>
              </div>
            ) : null}
          </Card>
          <Card padding="lg">
            <CardHeader title="Notes" />
            <ul className="flex flex-col gap-2 text-meta">
              {d.events.filter((e) => e.note).map((e) => (
                <li key={e.id}>
                  <span className="text-fg">{e.note}</span>
                  <span className="block text-caption text-fg-muted">{formatDateTime(e.createdAt)}{e.visibleToCustomer ? " · customer can see" : " · internal"}</span>
                </li>
              ))}
            </ul>
            <form className="mt-3 flex flex-col gap-2" onSubmit={async (e) => {
              e.preventDefault();
              if (!internal.trim()) return;
              await act.run(() => api.addTicketEvent(t.id, { note: internal.trim(), visibleToCustomer: visible }));
              setInternal("");
              await reload();
            }}>
              <TextField label="Add a note" hideLabel placeholder="Add a note" value={internal} onChange={(e) => setInternal(e.target.value)} />
              <Checkbox label="Customer can see this" checked={visible} onChange={setVisible} />
              <Button type="submit" variant="secondary" className="self-start">Add note</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
