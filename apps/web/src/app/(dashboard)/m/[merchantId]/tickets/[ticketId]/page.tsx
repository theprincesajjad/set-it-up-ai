"use client";
import { Phone, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { LOCALES, type Locale, type serviceApi as S } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { BackLink, PageHeader, StatusDot } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { ApproveByPhoneDialog } from "@/components/dashboard/service/ApproveByPhoneDialog";
import { CustomerPanel } from "@/components/dashboard/service/CustomerPanel";
import { IntakePanel } from "@/components/dashboard/service/IntakePanel";
import { InvoicePanel } from "@/components/dashboard/service/InvoicePanel";
import { QuoteBuilder, linesFromQuote } from "@/components/dashboard/service/QuoteBuilder";
import { QuotePanel } from "@/components/dashboard/service/QuotePanel";
import { VehiclePanel } from "@/components/dashboard/service/VehiclePanel";
import { StatusPanel } from "@/components/dashboard/service/StatusPanel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { copy } from "@/copy/en-CA";
import { isApiError } from "@/lib/api/errors";
import { deviceTitle, dueText } from "@/lib/dashboard/tickets";
import { useAction, useApi, useNow } from "@/lib/dashboard/useApi";
import { formatMoney } from "@/lib/format";

export default function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.ticket(ticketId), [api, ticketId]);
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <div className="flex flex-col gap-4">
        <BackLink href={`${base}/tickets`}>Tickets</BackLink>
        <Async state={state}>{(d) => <Ticket d={d} onChange={(n) => state.setData(n)} reload={state.reload} />}</Async>
      </div>
    </FeatureGate>
  );
}

function printTag(t: S.TicketDto, shop: string) {
  const w = window.open("", "_blank", "width=420,height=520");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><title>Tag #${t.number}</title><body style="font-family:system-ui;padding:24px"><p style="margin:0;color:#666">${esc(shop)}</p><h1 style="font-size:64px;margin:4px 0">#${t.number}</h1><p style="font-size:22px;margin:0">${esc(deviceTitle(t))}</p><p style="margin:8px 0">${esc(t.customer?.name ?? "")} ${esc(t.customer?.phone ?? "")}</p><p style="margin:0;color:#666">${esc(t.issue)}</p>${t.shelfLocation ? `<p style="font-size:28px;margin-top:16px">Shelf ${esc(t.shelfLocation)}</p>` : ""}</body>`);
  w.document.close();
  w.focus();
  w.print();
}

function Ticket({ d, onChange, reload }: { d: S.TicketDetailResponse; onChange: (d: S.TicketDetailResponse) => void; reload: () => Promise<void> }) {
  const { api, enabled, detail } = useMerchant();
  const toast = useToast();
  const t = d.ticket;
  const act = useAction();
  const phoneAct = useAction();
  const now = new Date(useNow());
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [revising, setRevising] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const latest = d.quotes.find((q) => q.status !== "superseded") ?? null;
  const approved = d.quotes.find((q) => q.status === "approved") ?? null;
  const closed = t.status === "picked_up" || t.status === "cancelled";
  const canQuote = !closed && enabled("service.quote_approval");
  const showBuilder = canQuote && (!latest || latest.status === "declined" || latest.status === "expired" || revising);
  const first = t.customer?.name?.trim().split(/\s+/)[0] ?? "customer";
  const lang = (t.customer?.language ?? "en") as Locale;
  const checkedIn = d.events.find((e) => e.status === "intake")?.createdAt ?? t.createdAt;
  const due = dueText(t, now);
  const sub = [t.customer?.name ?? "Customer", t.customer?.phone, lang !== "en" ? `speaks ${LOCALES[lang].englishName}` : null, d.customerSummary ? `${d.customerSummary.visits} ${d.customerSummary.visits === 1 ? "visit" : "visits"}` : null, due].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        title={`#${t.number} ${deviceTitle(t)}`}
        description={
          <span className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2"><StatusDot domain="ticket" status={t.status} label={copy.ticketStatus[t.status]} /></span>
            <span>{sub}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" iconStart={Printer} onClick={() => printTag(t, detail.merchant.name)}>Print tag</Button>
            {t.customer?.phone ? <Button variant="secondary" size="sm" iconStart={Phone} href={`tel:${t.customer.phone}`}>Call {first}</Button> : null}
            {!closed && t.status !== "ready" ? (
              <Button
                size="sm"
                loading={act.busy}
                onClick={async () => {
                  const r = await act.run(() => api.setTicketStatus(t.id, { status: "ready", notify: true, allowUnpaid: false }));
                  if (r) {
                    onChange(r);
                    toast({ message: `Marked ready. ${first} was texted.`, tone: "success" });
                  }
                }}
              >
                Mark ready
              </Button>
            ) : null}
          </div>
        }
      />
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      {t.lienEligible && t.status === "ready" ? (
        <Banner tone="info" title="Ready for 60 days or more">
          {t.lienNoticeSentAt ? "You recorded a notice before sale on this ticket." : "You can start your notice before sale under the Repair and Storage Liens Act. We have not sent anything and we never sell on your behalf. Ask your lawyer which steps apply."}
        </Banner>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <IntakePanel ticket={t} checkedInAt={checkedIn} />
          {t.itemKind === "vehicle" ? <VehiclePanel ticket={t} quote={approved ?? latest} closed={closed} onSaved={onChange} /> : null}
          {latest && !revising && latest.status !== "declined" && latest.status !== "expired" ? (
            <QuotePanel
              quote={latest}
              customerName={t.customer?.name ?? ""}
              now={now}
              busy={act.busy}
              canAct={!closed}
              onResend={async () => {
                const r = await act.run(() => api.sendQuote(latest.id));
                if (r) {
                  toast({ message: `Quote texted to ${first}`, tone: "success" });
                  await reload();
                }
              }}
              onApproveByPhone={() => setPhoneOpen(true)}
              onPreview={() => window.open(`${latest.approvalUrl}?preview=1`, "_blank", "noopener")}
              onRevise={() => setRevising(true)}
            />
          ) : null}
          {latest && (latest.status === "declined" || latest.status === "expired") && !revising ? (
            <QuotePanel quote={latest} customerName={t.customer?.name ?? ""} now={now} busy={act.busy} canAct={!closed} onResend={() => undefined} onApproveByPhone={() => setPhoneOpen(true)} onPreview={() => undefined} onRevise={() => setRevising(true)} />
          ) : null}
          {showBuilder ? (
            <QuoteBuilder
              key={revising ? latest?.id : "new"}
              ticketId={t.id}
              vehicle={t.itemKind === "vehicle"}
              revising={revising || !!latest}
              initialLines={revising && latest ? linesFromQuote(latest) : undefined}
              initialDiagnosis={revising ? (latest?.diagnosis ?? "") : undefined}
              onCancel={revising ? () => setRevising(false) : undefined}
              onSent={async () => {
                setRevising(false);
                await reload();
              }}
            />
          ) : null}
          {enabled("service.invoices") ? (
            <InvoicePanel
              invoices={d.invoices}
              hasApprovedQuote={!!approved}
              busy={act.busy}
              error={capError}
              canAct={!closed || t.status === "ready"}
              onCreate={async () => {
                setCapError(null);
                const r = await act.run(async () => {
                  try {
                    return await api.createInvoice(t.id, { fromQuote: true, send: true });
                  } catch (e) {
                    // Over the approved quote by more than 10%: say so next to the invoice, not as a generic error.
                    if (isApiError(e) && e.code === "over_estimate") {
                      setCapError(e.message);
                      return undefined;
                    }
                    throw e;
                  }
                });
                if (r) {
                  toast({ message: "Invoice sent", tone: "success" });
                  await reload();
                }
              }}
              onMarkPaid={async (id) => {
                await act.run(() => api.markInvoicePaid(id, "card_terminal"));
                await reload();
              }}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-6">
          <StatusPanel
            ticket={t}
            events={d.events}
            busy={act.busy}
            onUpdate={async (v) => {
              const r = await act.run(() => api.setTicketStatus(t.id, { status: v.status as S.TicketStatusBody["status"], note: v.note, notify: v.notify, allowUnpaid: false }));
              if (r) {
                onChange(r);
                toast({ message: v.notify ? "Updated. The customer was notified." : "Updated.", tone: "success" });
              }
              return !!r;
            }}
            onNote={async (note, visible) => {
              await act.run(() => api.addTicketEvent(t.id, { note, visibleToCustomer: visible }));
              await reload();
            }}
          />
          <CustomerPanel ticket={t} summary={d.customerSummary} quote={latest} />
        </div>
      </div>
      {latest ? (
        <ApproveByPhoneDialog
          open={phoneOpen}
          onClose={() => setPhoneOpen(false)}
          defaultName={t.customer?.name ?? ""}
          defaultPhone={t.customer?.phone ?? ""}
          totalLabel={formatMoney(latest.totalCents)}
          busy={phoneAct.busy}
          error={phoneAct.error}
          onConfirm={async (v) => {
            const r = await phoneAct.run(() => api.serviceOps.authorizeByPhone(latest.id, { name: v.name, phone: v.phone || null, note: v.note || null }));
            if (r) {
              setPhoneOpen(false);
              toast({ message: `Approved by phone, ${v.name}`, tone: "success" });
              await reload();
            }
          }}
        />
      ) : null}
    </>
  );
}
