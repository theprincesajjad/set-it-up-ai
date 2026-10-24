"use client";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { VERTICALS, type Vertical, type merchantApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { verticalLabel } from "@/components/ui/VerticalIcon";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

/**
 * Two-minute signup at the counter: shop name, type, address and the owner's mobile. The shop is created from its
 * vertical template, the owner gets the invite by text, and the QR code is on screen. Everything else (staff,
 * categories, tuning the program) is finished later from the shop's page or with the full setup.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={<Skeleton className="h-60 rounded-card" />}>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const leadId = useSearchParams().get("leadId");
  const hoods = useNeighbourhoods();
  const [f, setF] = useState({ name: "", vertical: "" as Vertical | "", address: "", ownerName: "", neighbourhoodId: "" });
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ detail: merchantApi.MerchantDetail; kit: merchantApi.QrKit | null; phone: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!leadId) return;
    void browserApi.rep.lead(leadId).then((l) => {
      setF((x) => ({ ...x, name: x.name || l.businessName, address: x.address || (l.address ?? ""), ownerName: x.ownerName || (l.contactName ?? ""), neighbourhoodId: x.neighbourhoodId || (l.neighbourhoodId ?? ""), vertical: x.vertical || ((VERTICALS as readonly string[]).includes(l.vertical ?? "") ? (l.vertical as Vertical) : "") }));
      if (l.phone) setPhone(l.phone);
    }).catch(() => undefined);
  }, [leadId]);

  const ready = f.name.trim().length >= 2 && !!f.vertical && f.address.trim().length >= 3 && !!phone;
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const detail = await browserApi.rep.createMerchant({ name: f.name.trim(), vertical: f.vertical as Vertical, address: f.address.trim(), phone: phone!, neighbourhoodId: f.neighbourhoodId || undefined, owner: { name: f.ownerName.trim() || undefined, phone: phone! }, leadId: leadId ?? undefined });
      const kit = await browserApi.rep.qrKit(detail.merchant.id).catch(() => null);
      setDone({ detail, kit, phone: phone! });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const loc = done.kit?.locations[0];
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={`${done.detail.merchant.name} is live`} description={`The owner has an invite by text at ${done.phone}. They can finish the details later.`} />
        <Panel>
          <div className="flex flex-col items-center gap-3 text-center">
            {loc ? <div role="img" aria-label={`QR code for ${done.detail.merchant.name}`} className="size-52 rounded-card border border-line p-3 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: loc.qrSvg }} /> : null}
            <p className="text-meta text-fg-muted">Customers scan this at the counter to join and earn their first points.</p>
            {done.kit?.staffScript ? <p className="rounded-card bg-bg-subtle p-3 text-meta text-fg">{done.kit.staffScript}</p> : null}
          </div>
        </Panel>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button href="/rep/day" size="lg" iconStart={Check}>Back to the street day</Button>
          <Button variant="secondary" size="lg" href={`/rep/merchants/${done.detail.merchant.id}/kit`}>Print the QR kit</Button>
          <Button variant="secondary" size="lg" href={`/rep/merchants/${done.detail.merchant.id}`}>Finish details</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Sign up a shop" description="Name, type, address and the owner's mobile. About two minutes." actions={<Button size="sm" variant="secondary" href={leadId ? `/rep/new?leadId=${leadId}` : "/rep/new"}>Full setup</Button>} />
      <Panel>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void create(); }}>
          <TextField label="Shop name" value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
          <Select label="What kind of shop" placeholder="Pick one" value={f.vertical} onChange={(e) => set("vertical", e.target.value)} options={VERTICALS.map((v) => ({ value: v, label: verticalLabel(v) }))} />
          <TextField label="Street address" value={f.address} onChange={(e) => set("address", e.target.value)} autoComplete="off" />
          <PhoneField label="Owner's mobile" defaultValue={phone?.replace(/^\+1/, "") ?? ""} key={phone ?? "none"} onChangeE164={setPhone} />
          <TextField label="Owner's name" optionalLabel value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
          <Select label="Neighbourhood" placeholder="Pick the strip" value={f.neighbourhoodId} onChange={(e) => set("neighbourhoodId", e.target.value)} options={(hoods ?? []).map((h) => ({ value: h.id, label: h.name }))} />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button type="submit" size="lg" loading={busy} disabled={!ready}>Create the shop</Button>
        </form>
      </Panel>
    </div>
  );
}
