"use client";
import { Plus, Search, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { appointmentsApi, serviceApi } from "@ll/shared";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Panel } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export interface BuilderLine {
  description: string;
  quantity: string;
  unit: string;
  kind: "labour" | "part" | "fee" | "other";
  serviceId?: string | null;
}

const blank = (kind: BuilderLine["kind"] = "part"): BuilderLine => ({ description: "", quantity: "1", unit: "", kind });

/** Lines the server will price. A negative price is only valid on a fee line (a credit such as the diagnostic fee). */
export function toInput(lines: BuilderLine[]): serviceApi.LineItemInput[] {
  return lines
    .filter((l) => l.description.trim() && l.unit.trim() !== "" && Number.isFinite(Number.parseFloat(l.unit)))
    .map((l) => ({ description: l.description.trim(), quantity: Math.max(1, Number.parseInt(l.quantity, 10) || 1), unitPriceCents: Math.round(Number.parseFloat(l.unit) * 100), kind: l.kind, ...(l.serviceId ? { serviceId: l.serviceId } : {}) }));
}

export function linesFromQuote(q: serviceApi.QuoteDto): BuilderLine[] {
  return q.lineItems.map((l) => ({ description: l.description, quantity: String(l.quantity), unit: (l.unitPriceCents / 100).toFixed(2), kind: l.kind }));
}

/**
 * Quote builder. Totals, tax and the 10% price cap come from the server (POST .../quotes/preview, 300 ms after the last
 * keystroke), so the shop sees exactly what the customer will: tax follows the shop's province, never a number in the browser.
 */
export function QuoteBuilder({ ticketId, initialLines, initialDiagnosis, onSent, onCancel, revising }: { ticketId: string; initialLines?: BuilderLine[]; initialDiagnosis?: string; onSent: () => Promise<void> | void; onCancel?: () => void; revising?: boolean }) {
  const { api, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [lines, setLines] = useState<BuilderLine[]>(initialLines?.length ? initialLines : [blank("part"), { ...blank("labour"), description: "Labour" }]);
  const [diagnosis, setDiagnosis] = useState(initialDiagnosis ?? "");
  const [deposit, setDeposit] = useState("0");
  const [search, setSearch] = useState("");
  const list = useApi(() => api.appointments.services("repair_line").catch(() => ({ items: [] as appointmentsApi.ServiceDto[] })), [api]);
  const priceList = useMemo(() => (list.data?.items ?? []).filter((s) => s.active), [list.data]);
  const matches = search.trim() ? priceList.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [];

  const input = useMemo(() => toInput(lines), [lines]);
  const key = JSON.stringify([input, deposit]);
  const [preview, setPreview] = useState<serviceApi.QuotePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.serviceOps.previewQuote(ticketId, { lineItems: input, depositPercent: Number(deposit) || undefined });
        if (my === seq.current) {
          setPreview(r);
          setPreviewError(null);
        }
      } catch (e) {
        if (my === seq.current) setPreviewError(e instanceof Error ? e.message : "Couldn't price this quote.");
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, api, ticketId]);

  const set = (i: number, patch: Partial<BuilderLine>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const subtotal = preview?.subtotalCents ?? 0;
  return (
    <Panel title={revising ? "Revise quote" : "Quote"} description="Totals are worked out by the server, with tax for your province. Customers approve on their phone with a typed signature.">
      <TextField type="textarea" label="What we found" optionalLabel hint="The customer sees this above the price." value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
      {priceList.length ? (
        <div className="relative mt-4">
          <TextField label="Add from your price list" type="search" placeholder="Search your price list" value={search} onChange={(e) => setSearch(e.target.value)} />
          {matches.length ? (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-card border border-line bg-bg shadow-sm" role="listbox" aria-label="Price list matches">
              {matches.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-body hover:bg-bg-subtle focus-visible:focus-ring"
                    onClick={() => {
                      setLines([...lines.filter((l) => l.description.trim() || l.unit), { description: s.name, quantity: "1", unit: (s.priceCents / 100).toFixed(2), kind: "part", serviceId: s.id }]);
                      setSearch("");
                    }}
                  >
                    <span className="flex items-center gap-2"><Search aria-hidden className="size-4 text-fg-subtle" />{s.name}</span>
                    <span className="tabular text-fg-muted">{formatMoney(s.priceCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_64px_96px_40px] items-end gap-2 sm:grid-cols-[1fr_120px_64px_96px_40px]">
            <TextField label={i === 0 ? "Description" : `Line ${i + 1}`} hideLabel={i > 0} value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
            <div className="hidden sm:block">
              <Select hideLabel={i > 0} label="Type" value={l.kind} onChange={(e) => set(i, { kind: e.target.value as BuilderLine["kind"] })} options={[{ value: "part", label: "Part" }, { value: "labour", label: "Labour" }, { value: "fee", label: "Fee or credit" }, { value: "other", label: "Other" }]} />
            </div>
            <TextField label="Qty" hideLabel={i > 0} inputMode="numeric" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, "") })} />
            <TextField label="Price" hideLabel={i > 0} inputMode="decimal" prefix="$" value={l.unit} onChange={(e) => set(i, { unit: e.target.value.replace(/[^\d.-]/g, "") })} />
            <IconButton icon={Trash2} label={`Remove line ${i + 1}`} size={40} onClick={() => setLines(lines.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" iconStart={Plus} onClick={() => setLines([...lines, blank()])}>Add line</Button>
          <Button variant="ghost" size="sm" onClick={() => setLines([...lines, { description: "Diagnostic fee (credited)", quantity: "1", unit: "-30.00", kind: "fee" }])}>Credit the diagnostic fee</Button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-1 text-meta" aria-live="polite">
        <dt className="text-fg-muted">Subtotal</dt><dd className="text-end tabular">{formatMoney(subtotal)}</dd>
        {preview && preview.taxCents > 0 ? (<><dt className="text-fg-muted">{preview.taxLabel}</dt><dd className="text-end tabular">{formatMoney(preview.taxCents)}</dd></>) : null}
        <dt className="text-body-strong">Total</dt><dd className="text-end text-body-strong tabular">{formatMoney(preview?.totalCents ?? 0)}</dd>
      </dl>
      {previewError ? <p className="mt-2 text-meta text-negative">{previewError}</p> : null}
      {preview && preview.totalCents > 0 ? (
        <p className="mt-3 rounded-card bg-bg-subtle px-3 py-2.5 text-meta text-fg-muted">
          Customer sees: the final price will not be more than {formatMoney(preview.maxAuthorizedCents)}, 10% above this quote. Anything beyond that needs a new approval. We hold invoices to this, for every kind of repair.
        </p>
      ) : null}
      {enabled("service.deposits") ? (
        <Select label="Deposit on approval" className="mt-3" value={deposit} onChange={(e) => setDeposit(e.target.value)} options={[{ value: "0", label: "No deposit" }, { value: "25", label: `25%${preview ? ` (${formatMoney(Math.round((preview.totalCents * 25) / 100))})` : ""}` }, { value: "50", label: `50%${preview ? ` (${formatMoney(Math.round((preview.totalCents * 50) / 100))})` : ""}` }]} />
      ) : null}
      {act.error ? <div className="mt-3"><Banner tone="danger">{act.error}</Banner></div> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          iconStart={Send}
          loading={act.busy}
          disabled={!input.length || !preview || preview.totalCents <= 0}
          onClick={async () => {
            const q = await act.run(() => api.createQuote(ticketId, { diagnosis: diagnosis.trim() || null, lineItems: input, depositPercent: Number(deposit) || undefined, send: true }));
            if (q) {
              toast({ message: "Quote sent by text", tone: "success" });
              await onSent();
            }
          }}
        >
          {revising ? "Send revised quote" : "Send quote"}
        </Button>
        {onCancel ? <Button variant="secondary" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </Panel>
  );
}
