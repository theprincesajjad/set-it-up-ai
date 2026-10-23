"use client";
import { useState } from "react";
import type { serviceApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { BackLink, PageHeader, Panel, SaveBar } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { NoAccess } from "@/components/dashboard/PageStates";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function ServiceSettingsPage() {
  const { api, base, role } = useMerchant();
  const state = useApi(() => api.serviceOps.settings(), [api]);
  if (role === "staff") return <NoAccess />;
  return (
    <FeatureGate keys={["service.tickets"]} title="Service tickets">
      <div className="flex max-w-[720px] flex-col gap-4">
        <BackLink href={`${base}/tickets`}>Tickets</BackLink>
        <PageHeader title="Terms, warranty and tips" description="What customers accept at drop-off, what the status page says about warranty, and whether the pay page asks for a tip." />
        <Async state={state}>{(s) => <Form s={s} />}</Async>
      </div>
    </FeatureGate>
  );
}

function Form({ s }: { s: serviceApi.ServiceSettingsDto }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [terms, setTerms] = useState(s.intakeTerms ?? "");
  const [warranty, setWarranty] = useState(s.warrantyDays ? String(s.warrantyDays) : "");
  const [tips, setTips] = useState(s.tipsEnabled === null ? "default" : s.tipsEnabled ? "on" : "off");
  const [presets, setPresets] = useState(s.tipPresets.join(", "));
  const parsed = presets.split(/[,\s]+/).map((x) => Number.parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  const dirty = terms.trim() !== (s.intakeTerms ?? "") || warranty !== (s.warrantyDays ? String(s.warrantyDays) : "") || tips !== (s.tipsEnabled === null ? "default" : s.tipsEnabled ? "on" : "off") || presets !== s.tipPresets.join(", ");
  return (
    <>
      <Panel title="Drop-off terms" description="Shown at check-in and on the customer's quote. Write them in your own words and check them with your lawyer: we show them, we do not draft them.">
        <TextField type="textarea" label="Terms" optionalLabel value={terms} onChange={(e) => setTerms(e.target.value)} hint="For example: data is not backed up, items left over 60 days are handled under the Repair and Storage Liens Act." />
      </Panel>
      <Panel title="Warranty" description="Shown on the customer's status page. Say what it covers in your terms; we only show the number of days.">
        <TextField label="Warranty days" optionalLabel inputMode="numeric" value={warranty} onChange={(e) => setWarranty(e.target.value.replace(/\D/g, ""))} hint="Leave empty to show nothing." />
      </Panel>
      <Panel title="Tips" description="Tips are never taxed and never earn points. Repair shops usually leave this off.">
        <div className="flex flex-col gap-4">
          <Select label="Ask for a tip on the pay page" value={tips} onChange={(e) => setTips(e.target.value)} options={[{ value: "default", label: `By kind of shop (${s.tipsDefault ? "on" : "off"} for you)` }, { value: "on", label: "Yes" }, { value: "off", label: "No" }]} />
          <TextField label="Tip choices, in percent" value={presets} onChange={(e) => setPresets(e.target.value)} hint="Up to four, like 15, 20, 25." />
        </div>
      </Panel>
      <SaveBar dirty={dirty} error={act.error} onDiscard={() => { setTerms(s.intakeTerms ?? ""); setWarranty(s.warrantyDays ? String(s.warrantyDays) : ""); setTips(s.tipsEnabled === null ? "default" : s.tipsEnabled ? "on" : "off"); setPresets(s.tipPresets.join(", ")); }}>
        <Button
          loading={act.busy}
          disabled={!parsed.length}
          onClick={async () => {
            const r = await act.run(() => api.serviceOps.saveSettings({ intakeTerms: terms.trim() || null, warrantyDays: warranty ? Number(warranty) : null, tipsEnabled: tips === "default" ? null : tips === "on", tipPresets: parsed.slice(0, 4) }));
            if (r) toast({ message: "Saved", tone: "success" });
          }}
        >
          Save
        </Button>
      </SaveBar>
    </>
  );
}
