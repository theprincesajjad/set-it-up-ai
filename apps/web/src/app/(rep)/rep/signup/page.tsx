"use client";
import { Meter, PageHeader, Panel, QuietLink } from "@/components/dashboard/kit";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
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
  const [step, setStep] = useState<1 | 2>(1);
  // Today's street-day area: a scouting area is not in the public list yet, but the rep is signing shops on it.
  const [today, setToday] = useState<{ id: string; name: string } | null>(null);
  const areaOptions = [...(today && !(hoods ?? []).some((h) => h.id === today.id) ? [{ value: today.id, label: `${today.name} (today's street day)` }] : []), ...(hoods ?? []).map((h) => ({ value: h.id, label: h.id === today?.id ? `${h.name} (today's street day)` : h.name }))];
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ detail: merchantApi.MerchantDetail; kit: merchantApi.QrKit | null; phone: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  // On a street day the shop is almost always on today's strip: start there.
  useEffect(() => {
    if (leadId) return;
    void browserApi.rep.today().then((t) => {
      if (!t.streetDay?.isToday) return;
      setToday({ id: t.streetDay.areaId, name: t.streetDay.areaName });
      setF((x) => ({ ...x, neighbourhoodId: x.neighbourhoodId || t.streetDay!.areaId }));
    }).catch(() => undefined);
  }, [leadId]);

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

  const shopReady = f.name.trim().length >= 2 && !!f.vertical && f.address.trim().length >= 3;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <PageHeader
        title="Sign up a shop"
        description={step === 1 ? "The shop first, then the owner's mobile. About two minutes." : `${f.name.trim()} · ${f.address.trim()}`}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-meta">
          <span className="font-medium text-fg">Step {step} of 2: {step === 1 ? "The shop" : "The owner"}</span>
          <QuietLink href={leadId ? `/rep/new?leadId=${leadId}` : "/rep/new"}>Full setup instead</QuietLink>
        </div>
        <Meter value={step} max={2} label={`Step ${step} of 2`} />
      </div>
      <Panel>
        {step === 1 ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (shopReady) setStep(2);
            }}
          >
            <TextField label="Shop name" value={f.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
            <Select label="What kind of shop" placeholder="Pick one" value={f.vertical} onChange={(e) => set("vertical", e.target.value)} options={VERTICALS.map((v) => ({ value: v, label: verticalLabel(v) }))} />
            <TextField label="Street address" value={f.address} onChange={(e) => set("address", e.target.value)} autoComplete="off" />
            <Select label="Neighbourhood" hint="Optional. The strip the shop is on." placeholder="Pick the strip" value={f.neighbourhoodId} onChange={(e) => set("neighbourhoodId", e.target.value)} options={areaOptions} />
            <Button type="submit" size="lg" disabled={!shopReady} iconEnd={ArrowRight}>
              Next
            </Button>
            {!shopReady ? <p className="text-center text-meta text-fg-muted">Add the shop&apos;s name, kind and street address.</p> : null}
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (ready && !busy) void create(); }}>
            <PhoneField autoFocus label="Owner's mobile" hint="We text the owner an invite to finish their details." defaultValue={phone?.replace(/^\+1/, "") ?? ""} key={phone ?? "none"} onChangeE164={setPhone} />
            <TextField label="Owner's name" optionalLabel value={f.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <Button type="submit" size="lg" loading={busy} disabled={!ready}>Create the shop</Button>
            <Button type="button" variant="ghost" iconStart={ArrowLeft} onClick={() => setStep(1)}>
              Back to the shop
            </Button>
          </form>
        )}
      </Panel>
    </div>
  );
}
