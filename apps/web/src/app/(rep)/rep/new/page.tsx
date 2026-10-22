"use client";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Lock, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { VERTICALS, VERTICAL_TEMPLATES, type Vertical, type merchantApi, type networkApi } from "@ll/shared";
import { ProgramPreview } from "@/components/dashboard/ProgramPreview";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { PhoneField } from "@/components/ui/PhoneField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { VerticalGlyph, verticalLabel, verticalVar } from "@/components/ui/VerticalIcon";
import { copy } from "@/copy/en-CA";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { previewModel, programSentence, type ProgramDraft } from "@/lib/dashboard/program";
import { useNeighbourhoods } from "@/lib/dashboard/useNeighbourhoods";

const STEPS = ["Find the shop", "Owner", "Type and program", "Categories", "Staff", "Create", "QR kit", "Train", "Done"] as const;
const DRAFT_KEY = "ll.rep.newMerchant";

interface Draft {
  name: string; address: string; city: string; postalCode: string; phone: string | null; neighbourhoodId: string;
  ownerName: string; ownerPhone: string | null; ownerEmail: string; vertical: Vertical; staffName: string; staffPhone: string | null;
}
const EMPTY: Draft = { name: "", address: "", city: "Toronto", postalCode: "", phone: null, neighbourhoodId: "", ownerName: "", ownerPhone: null, ownerEmail: "", vertical: "cafe", staffName: "", staffPhone: null };

function templateDraft(v: Vertical): { draft: ProgramDraft; rewards: { name: string; pointsCost: number; rewardType: merchantApi.Reward["rewardType"]; value: number }[] } {
  const t = VERTICAL_TEMPLATES[v];
  return {
    draft: { name: `${t.label} rewards`, earnType: t.earnType, pointsPerDollar: t.pointsPerDollar, pointsPerVisit: t.pointsPerVisit, minSpendCents: 0, stampGoal: t.stampGoal, terminology: t.terminology, welcomeBonus: t.welcomeBonus, birthdayBonus: 0, referralBonus: 0, expiryMonths: null, visitCooldownMinutes: 0 },
    rewards: t.rewards,
  };
}

/** Done-for-you setup (rep-console.md §2): the 20-minute visit, saved as a draft at every step. */
export default function NewMerchantPage() {
  const params = useSearchParams();
  const leadId = params.get("leadId");
  const toast = useToast();
  const hoods = useNeighbourhoods();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(EMPTY);
  const [dupes, setDupes] = useState<networkApi.ShopsResponse["items"]>([]);
  const [created, setCreated] = useState<merchantApi.MerchantDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trained, setTrained] = useState<boolean[]>([false, false, false]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setD({ ...EMPTY, ...(JSON.parse(saved) as Partial<Draft>) });
    } catch {
      /* ignore */
    }
    if (leadId)
      void browserApi.rep.lead(leadId).then((l) => setD((x) => ({ ...x, name: x.name || l.businessName, address: x.address || (l.address ?? ""), ownerName: x.ownerName || (l.contactName ?? ""), ownerEmail: x.ownerEmail || (l.email ?? ""), neighbourhoodId: x.neighbourhoodId || (l.neighbourhoodId ?? ""), vertical: (VERTICALS as readonly string[]).includes(l.vertical ?? "") ? (l.vertical as Vertical) : x.vertical }))).catch(() => undefined);
  }, [leadId]);
  useEffect(() => {
    if (created) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  }, [d, created]);
  useEffect(() => {
    if (d.name.trim().length < 3) return;
    const t = setTimeout(() => {
      browserApi.network.shops({ q: d.name.trim(), limit: 5 }).then((r) => setDupes(r.items)).catch(() => setDupes([]));
    }, 300);
    return () => clearTimeout(t);
  }, [d.name]);

  const tmpl = useMemo(() => templateDraft(d.vertical), [d.vertical]);
  const exact = dupes.find((s) => s.merchant.name.trim().toLowerCase() === d.name.trim().toLowerCase());
  const canNext = [
    !!d.name.trim() && d.address.trim().length >= 3 && !!d.phone && !exact,
    !!d.ownerPhone || !!d.ownerEmail.trim(),
    true, true, true, !!created, true, true, true,
  ][step];

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await browserApi.rep.createMerchant({
        name: d.name.trim(), vertical: d.vertical, address: d.address.trim(), city: d.city.trim() || undefined, postalCode: d.postalCode.trim() || undefined, phone: d.phone!,
        neighbourhoodId: d.neighbourhoodId || undefined, owner: { name: d.ownerName.trim() || undefined, phone: d.ownerPhone ?? undefined, email: d.ownerEmail.trim() || undefined }, leadId: leadId ?? undefined,
      });
      if (d.staffPhone) await browserApi.merchant(r.merchant.id).invite({ name: d.staffName.trim() || undefined, phone: d.staffPhone, role: "staff" }).catch(() => undefined);
      setCreated(r);
      localStorage.removeItem(DRAFT_KEY);
      toast({ message: `${r.merchant.name} is set up. The owner got an invite.`, tone: "success" });
      setStep(6);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const joinUrl = created?.locations[0]?.joinUrl;
  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      <PageHeader title="Set up a merchant" description="About 20 minutes with the owner. Every step saves on this device." />
      <ProgressBar value={step + 1} max={STEPS.length} label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`} valueText={STEPS[step]} />
      {error ? <Banner tone="danger">{error}</Banner> : null}

      <Panel className="flex flex-col gap-4">
        {step === 0 ? (
          <>
            <h2 className="text-body-strong text-fg">Find the shop</h2>
            <TextField label="Shop name" value={d.name} onChange={(e) => set("name", e.target.value)} autoComplete="organization" />
            {exact ? <Banner tone="danger">Already on the network: {exact.merchant.name}. Open it from My merchants instead.</Banner> : dupes.length ? <Banner tone="info">Similar names on the network: {dupes.map((s) => s.merchant.name).join(", ")}. Make sure this is a different shop.</Banner> : null}
            <TextField label="Street address" value={d.address} onChange={(e) => set("address", e.target.value)} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="City" value={d.city} onChange={(e) => set("city", e.target.value)} />
              <TextField label="Postal code" optionalLabel value={d.postalCode} onChange={(e) => set("postalCode", e.target.value.toUpperCase())} />
            </div>
            <PhoneField label="Shop phone" defaultValue={d.phone?.replace(/^\+1/, "") ?? ""} onChangeE164={(p) => set("phone", p)} />
            <Select label="Neighbourhood" placeholder="Pick the strip" value={d.neighbourhoodId} onChange={(e) => set("neighbourhoodId", e.target.value)} options={(hoods ?? []).map((h) => ({ value: h.id, label: h.name }))} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <h2 className="text-body-strong text-fg">The owner</h2>
            <p className="text-meta text-fg-muted">They get a text and an email to claim the account. Transactional only, no marketing.</p>
            <TextField label="Owner's name" value={d.ownerName} onChange={(e) => set("ownerName", e.target.value)} />
            <PhoneField label="Owner's mobile" defaultValue={d.ownerPhone?.replace(/^\+1/, "") ?? ""} onChangeE164={(p) => set("ownerPhone", p)} />
            <TextField type="email" label="Owner's email" optionalLabel value={d.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} />
          </>
        ) : null}
        {step === 2 ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex flex-col gap-4">
              <h2 className="text-body-strong text-fg">Type of shop</h2>
              <div role="radiogroup" aria-label="Type of shop" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {VERTICALS.map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={d.vertical === v} onClick={() => set("vertical", v)} className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-input border p-2 text-center text-label focus-visible:focus-ring", d.vertical === v ? "border-brand bg-bg-subtle text-fg" : "border-line-strong text-fg hover:bg-bg-subtle")}>
                    <span className="flex size-9 items-center justify-center rounded-input" style={{ background: verticalVar(v, "tint"), color: verticalVar(v, "accent") }}>
                      <VerticalGlyph vertical={v} className="size-5" />
                    </span>
                    {verticalLabel(v)}
                  </button>
                ))}
              </div>
              <p className="rounded-input bg-bg-subtle px-4 py-3 text-body text-fg">{programSentence(tmpl.draft, tmpl.rewards[0])}</p>
              <p className="text-meta text-fg-muted">The owner can tweak this any time in Program & rewards.</p>
            </div>
            <ProgramPreview model={previewModel(tmpl.draft, tmpl.rewards)} shop={{ name: d.name || "The shop", vertical: d.vertical, logoUrl: null }} />
          </div>
        ) : null}
        {step === 3 ? (
          <>
            <h2 className="text-body-strong text-fg">Categories</h2>
            <p className="text-meta text-fg-muted">From the {verticalLabel(d.vertical)} template. Regulated ones never earn.</p>
            <ul className="divide-y divide-line">
              {VERTICAL_TEMPLATES[d.vertical].categories.map((c) => (
                <li key={c.name} className="flex min-h-12 items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-body text-fg">{!c.earnEligible ? <Lock aria-hidden className="size-4 text-fg-muted" /> : null}{c.name}</span>
                  <span className="text-meta text-fg-muted">{c.earnEligible ? "Earns" : "Doesn't earn"}</span>
                </li>
              ))}
            </ul>
            {d.vertical === "pharmacy" ? <Banner tone="info">{copy.misc.pharmacyRule} Required by Ontario pharmacy rules.</Banner> : null}
          </>
        ) : null}
        {step === 4 ? (
          <>
            <h2 className="text-body-strong text-fg">Staff you&apos;re training today</h2>
            <TextField label="Name" optionalLabel value={d.staffName} onChange={(e) => set("staffName", e.target.value)} />
            <PhoneField label="Mobile" defaultValue={d.staffPhone?.replace(/^\+1/, "") ?? ""} onChangeE164={(p) => set("staffPhone", p)} hint="Optional. They get a text to sign in to counter mode." />
          </>
        ) : null}
        {step === 5 ? (
          <>
            <h2 className="text-body-strong text-fg">Ready to create</h2>
            <dl className="grid grid-cols-[140px_1fr] gap-2 text-body">
              <dt className="text-fg-muted">Shop</dt><dd>{d.name}, {d.address}</dd>
              <dt className="text-fg-muted">Type</dt><dd>{verticalLabel(d.vertical)} · {programSentence(tmpl.draft, tmpl.rewards[0])}</dd>
              <dt className="text-fg-muted">Owner</dt><dd>{[d.ownerName, d.ownerEmail, d.ownerPhone].filter(Boolean).join(" · ")}</dd>
              <dt className="text-fg-muted">Staff</dt><dd>{d.staffPhone ? d.staffName || d.staffPhone : "None yet"}</dd>
            </dl>
            {created ? <Banner tone="success">Created.</Banner> : <Button size="lg" loading={busy} onClick={create} className="self-start">Create merchant</Button>}
          </>
        ) : null}
        {step === 6 && created ? (
          <>
            <h2 className="text-body-strong text-fg">QR kit</h2>
            <p className="text-body text-fg-muted">Print the stand now and set it next to the till.</p>
            <div className="flex flex-wrap gap-2">
              <Button iconStart={Printer} href={`/rep/merchants/${created.merchant.id}/kit`}>Print QR kit</Button>
              <Button variant="secondary" onClick={async () => {
                await browserApi.merchant(created.merchant.id).completeStep("qr_kit").catch(() => undefined);
                toast("Marked as delivered");
                setStep(7);
              }}>Mark as delivered</Button>
            </div>
          </>
        ) : null}
        {step === 7 ? (
          <>
            <h2 className="text-body-strong text-fg">Train the staff</h2>
            {["Find a customer: type their number or scan their card", "Add a stamp: one tap after they pay", "Undo: tap Undo right away if it was a mistake"].map((t, i) => (
              <Checkbox key={t} label={t} checked={trained[i]!} onChange={(v) => setTrained(trained.map((x, j) => (j === i ? v : x)))} />
            ))}
            {created ? <Button variant="secondary" className="self-start" href={`/m/${created.merchant.id}/counter`}>Open their counter</Button> : null}
          </>
        ) : null}
        {step === 8 && created ? (
          <div className="flex flex-col items-start gap-4">
            <CheckCircle2 aria-hidden className="size-10 text-positive" />
            <h2 className="text-title text-fg">{created.merchant.name} is live.</h2>
            {joinUrl ? (
              <div className="flex w-full max-w-md items-center gap-2 rounded-input bg-bg-subtle px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-meta">{joinUrl.replace(/^https?:\/\//, "")}</span>
                <Button size="sm" variant="ghost" iconStart={Copy} onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copy</Button>
              </div>
            ) : null}
            <p className="text-body text-fg">Activation goal: 25 active members in 30 days. You earn the activation bonus when they get there.</p>
            <div className="flex flex-wrap gap-2">
              <Button href={`/rep/merchants/${created.merchant.id}`}>Open merchant</Button>
              <Button variant="secondary" href="/rep/new" onClick={() => { setCreated(null); setD(EMPTY); setStep(0); }}>Set up another</Button>
            </div>
          </div>
        ) : null}
      </Panel>

      {step < 8 ? (
        <div className="flex justify-between gap-3">
          <Button variant="secondary" iconStart={ArrowLeft} disabled={step === 0 || (step <= 5 && !!created) || step === 6} onClick={() => setStep(step - 1)}>Back</Button>
          {step !== 5 ? <Button iconEnd={ArrowRight} disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
