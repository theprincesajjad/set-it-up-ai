"use client";
import { useState } from "react";
import type { pharmacyApi } from "@ll/shared";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { useApi } from "@/lib/dashboard/useApi";

const CONFIRM_TEXT = "I am the pharmacist-owner or designated manager. I confirm no prescriptions or pharmacy services earn points or discounts, and no health information is entered into Local Loyalty.";
const SOURCES = ["O. Reg. 264/16 s. 34 (Drug and Pharmacies Regulation Act)", "O. Reg. 130/17 s. 6 (Pharmacy Act, 1991)", "Ontario College of Pharmacists loyalty points policy", "PHIPA s. 33 on marketing"];

/** Pharmacy rules (docs/research/pharmacies-wellness.md frame 07): what is locked, the pharmacist-owner confirmation, how long we keep things. */
export default function PharmacyRulesPage() {
  const { api, detail, role } = useMerchant();
  const rules = useApi(() => api.pharmacy.rules(), [api]);
  if (detail.merchant.vertical !== "pharmacy") {
    return (
      <div>
        <PageHeader title="Pharmacy rules" />
        <Banner tone="info">These rules apply to pharmacies only.</Banner>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader title="Pharmacy rules" description="What is switched on for your pharmacy, and who confirmed it." />
      <Async state={rules}>{(r) => <Rules r={r} canConfirm={role === "owner"} onConfirmed={() => rules.reload?.()} />}</Async>
    </div>
  );
}

function Rules({ r, canConfirm, onConfirmed }: { r: pharmacyApi.PharmacyRulesResponse; canConfirm: boolean; onConfirmed: () => void }) {
  const { api } = useMerchant();
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [ocp, setOcp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<pharmacyApi.PharmacyRulesResponse["confirmation"]>(r.confirmation);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.pharmacy.confirm({ name: name.trim(), ocpNumber: ocp.trim(), agree: true });
      setDone(res.confirmation);
      onConfirmed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel title="Pharmacist-owner confirmation" description="Required once, before the first point is given. An admin can see it.">
        <div className="mt-4" data-testid="pharmacy-confirmation">
          {done ? (
            <p className="flex items-center gap-2 text-[14px] text-fg" role="status">
              <span aria-hidden className="size-2 rounded-full bg-positive" />
              Confirmed {new Date(done.confirmedAt).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })} by {done.confirmedByName}{done.ocpNumber ? `, OCP accreditation ${done.ocpNumber}` : ""}
            </p>
          ) : canConfirm ? (
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_320px]">
              <Checkbox checked={agree} onChange={setAgree} label={CONFIRM_TEXT} />
              <div className="flex flex-col gap-3">
                <TextField label="Your full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <TextField label="OCP accreditation number" hint="The pharmacy's number from the Ontario College of Pharmacists. Digits only." inputMode="numeric" value={ocp} onChange={(e) => setOcp(e.target.value)} maxLength={14} />
                {error ? <Banner tone="danger">{error}</Banner> : null}
                <div>
                  <Button onClick={confirm} loading={busy} disabled={!agree || name.trim().length < 3 || !/^\d{4,10}$/.test(ocp.replace(/[\s#-]/g, ""))}>Confirm</Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-fg-muted">The owner has not confirmed yet. Only the owner can.</p>
          )}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-card bg-card shadow-card" aria-labelledby="rules-h">
          <h2 id="rules-h" className="bg-bg-subtle px-5 py-2.5 text-meta font-medium text-fg-muted">Rules we enforce for you</h2>
          <ul>
            {r.rules.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-[14px] text-fg" data-testid="pharmacy-rule">
                <span>{x.text}</span>
                <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Always on</span>
              </li>
            ))}
          </ul>
        </section>
        <div className="flex flex-col gap-6">
          <Panel title="How long we keep things">
            <dl className="mt-3 divide-y divide-line text-[13px]">
              {[
                ["Appointment name, phone and type", `${r.retention.appointmentDays} days`],
                ["Order-ready and reminder texts", `${r.retention.messageDays} days`],
                ["Reports", "Counts only, no names"],
                ["Points and visit history", "Until the customer leaves"],
              ].map(([a, b]) => (
                <div key={a} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-fg">{a}</dt>
                  <dd className="shrink-0 font-medium text-fg">{b}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Locked categories">
            <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-fg">
              {r.lockedCategories.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          </Panel>
          <Panel title="Where the rules come from">
            <ul className="mt-3 list-disc space-y-1.5 ps-5 text-[13px] text-fg-muted">
              {SOURCES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
