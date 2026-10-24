"use client";
/**
 * GST/HST status: the one answer every shop gives once. "Registered" charges tax (and prints the number on quotes and
 * invoices); "small supplier" charges none. Until it is answered a shop is "not set": appointments and tiffin add no tax
 * and catering quotes show the provincial rate marked "tax status not set", so this prompts for the answer in setup, in Settings and across the restaurant pages.
 * Owners edit; everyone else sees what is set.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isValidGstHstNumber, type paymentsManualApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Loader } from "@/components/dashboard/restaurant/common";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

/** What "not set" means for the shop's bills, in words. */
export const TAX_NOT_SET_NOTE = "Until you answer, tiffin plans and appointments add no tax, and catering quotes add your province's rate marked \"tax status not set\".";

/** The saved status, loaded for one screen. `compact` drops the panel frame (setup step). */
export function TaxStatus({ owner, compact = false, onSaved }: { owner: boolean; compact?: boolean; onSaved?: () => void }) {
  const { api } = useMerchant();
  const state = useApi(() => api.settings.tax(), [api]);
  return (
    <Loader state={state} rows={2}>
      {(d) => <TaxForm d={d} owner={owner} compact={compact} api={api} reload={() => { void state.reload(); onSaved?.(); }} />}
    </Loader>
  );
}

function TaxForm({ d, owner, compact, reload, api }: { d: paymentsManualApi.TaxSettingsDto; owner: boolean; compact: boolean; reload: () => void; api: ReturnType<typeof useMerchant>["api"] }) {
  const toast = useToast();
  const act = useAction();
  const [reg, setReg] = useState<"yes" | "no" | "">(d.taxRegistered === null ? "" : d.taxRegistered ? "yes" : "no");
  const [num, setNum] = useState(d.taxNumber ?? "");
  const [small, setSmall] = useState(d.taxSmallSupplierNote);
  const numBad = reg === "yes" && !!num.trim() && !isValidGstHstNumber(num);
  const dirty = reg === "" ? false : (reg === "yes") !== d.taxRegistered || num.trim().toUpperCase().replace(/\s/g, "") !== (d.taxNumber ?? "") || small !== d.taxSmallSupplierNote;
  const save = (
    <Button loading={act.busy} disabled={!dirty || numBad || reg === ""} onClick={async () => {
      const r = await act.run(() => api.settings.saveTax({ taxRegistered: reg === "yes", taxNumber: reg === "yes" ? num.trim() || null : null, taxSmallSupplierNote: small }));
      if (r) {
        toast({ message: "Tax status saved", tone: "success" });
        reload();
      }
    }}>
      Save
    </Button>
  );
  const body = (
    <div className="flex flex-col gap-4">
      {d.taxRegistered === null ? <Banner tone="warning" title="Set your tax status">{TAX_NOT_SET_NOTE}</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <div role="radiogroup" aria-label="Registered for GST/HST" className="flex flex-wrap gap-2">
        {([["yes", "Yes, I'm registered"], ["no", "No, I'm a small supplier"]] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={reg === v} disabled={!owner} onClick={() => setReg(v)} className={`inline-flex h-9 items-center rounded-full border px-4 text-meta focus-visible:focus-ring ${reg === v ? "border-fg bg-fg font-medium text-bg" : "border-line text-fg hover:bg-bg-subtle"}`}>
            {label}
          </button>
        ))}
      </div>
      {reg === "yes" ? <TextField label="GST/HST number" placeholder="123456789 RT0001" value={num} readOnly={!owner} onChange={(e) => setNum(e.target.value)} error={numBad ? "A GST/HST number is 9 digits followed by RT0001" : null} hint="We check the format only, not with the CRA. It prints on quotes and invoices." /> : null}
      {reg === "no" ? <p className="text-meta text-fg-muted">Quotes and invoices say &quot;No HST charged (small supplier)&quot; and add no tax. If your sales go over $30,000 in four quarters in a row, you must register.</p> : null}
      <p className="text-meta text-fg-muted">
        More at the CRA: <a className="underline underline-offset-4" href="https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4022.html" target="_blank" rel="noreferrer">General information for GST/HST registrants (RC4022)</a>. Ask your accountant about meals, they are generally taxable.
      </p>
      {reg === "no" ? <Switch label="Show the small supplier note on customer pages" checked={small} disabled={!owner} onChange={setSmall} /> : null}
      <p className="text-meta text-fg-muted">Province: {d.province}. Rate now: {d.rateBps / 100}%.</p>
      {compact && owner ? <div>{save}</div> : null}
    </div>
  );
  if (compact) return body;
  return (
    <Panel title="GST/HST" description="Are you registered for GST/HST? Registered shops charge tax and show their number. Small suppliers under $30,000 a year in sales don't have to register." footer={owner ? save : undefined}>
      {body}
    </Panel>
  );
}

/** A thin banner for the owner while the status is unanswered. Says nothing once it is set, or to anyone but the owner. */
export function TaxNotSetBanner() {
  const { api, base, role } = useMerchant();
  const owner = role === "owner";
  const pathname = usePathname();
  const state = useApi(owner ? () => api.settings.tax() : null, [api, owner]);
  // The payments page carries the question itself; a second banner above it says the same thing twice.
  if (pathname.endsWith("/restaurant/payments")) return null;
  if (!owner || !state.data || state.data.taxRegistered !== null) return null;
  return (
    <Banner tone="warning" title="Set your tax status">
      {TAX_NOT_SET_NOTE}{" "}
      <Link href={`${base}/settings?tab=tax`} className="font-medium underline underline-offset-4">Answer in Settings</Link>
    </Banner>
  );
}
