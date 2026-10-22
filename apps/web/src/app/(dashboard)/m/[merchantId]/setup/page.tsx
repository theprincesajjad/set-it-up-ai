"use client";
import { ArrowLeft, ArrowRight, Check, Leaf, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ONBOARDING_STEPS_UI } from "./steps";
import { STEP_COPY } from "@/components/dashboard/Checklist";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { PhoneField } from "@/components/ui/PhoneField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/format";
import { draftFromProgram, programSentence } from "@/lib/dashboard/program";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import type { merchantApi } from "@ll/shared";

/** Setup guide (merchant-dashboard.md §1): profile → program → rewards → staff → QR kit → first 25 members. */
export default function SetupPage() {
  const { api, base } = useMerchant();
  const state = useApi(() => api.onboarding(), [api]);
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="Set up your shop" description="Each step saves as you go. You can come back any time." />
      <Async state={state}>{(c) => <Wizard checklist={c} onChange={(n) => state.setData(n)} base={base} />}</Async>
    </div>
  );
}

function Wizard({ checklist, onChange, base }: { checklist: merchantApi.OnboardingChecklist; onChange: (c: merchantApi.OnboardingChecklist) => void; base: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const steps = checklist.steps;
  const initial = Math.max(0, steps.findIndex((s) => s.key === (params.get("step") ?? checklist.currentStep)));
  const [i, setI] = useState(initial === -1 ? 0 : initial);
  const step = steps[i] ?? steps[0]!;
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = checklist.currentStep === "done" || doneCount === steps.length;
  const go = (n: number) => {
    setI(n);
    router.replace(`${base}/setup?step=${steps[n]!.key}`, { scroll: false });
  };

  return (
    <>
      <div>
        <ProgressBar value={i + 1} max={steps.length} label={`Step ${i + 1} of ${steps.length}`} valueText={`${doneCount} of ${steps.length} done`} />
        <ol className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Setup steps">
          {steps.map((s, n) => (
            <li key={s.key}>
              <button type="button" onClick={() => go(n)} aria-current={n === i ? "step" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-label", n === i ? "border-brand bg-bg-subtle text-fg" : "border-line-strong text-fg")}>
                {s.done ? <Leaf aria-hidden className="size-4 text-positive" /> : <span className="tabular-nums text-fg-muted">{n + 1}</span>}
                {STEP_COPY[s.key].label}
              </button>
            </li>
          ))}
        </ol>
      </div>
      {allDone ? <Banner tone="success" title="You're live.">Your first customer can join right now.</Banner> : null}
      <Card padding="lg">
        <StepBody step={step} checklist={checklist} onChange={onChange} base={base} next={() => i < steps.length - 1 && go(i + 1)} />
      </Card>
      <div className="flex justify-between gap-3">
        <Button variant="secondary" iconStart={ArrowLeft} disabled={i === 0} onClick={() => go(i - 1)}>
          Back
        </Button>
        {i < steps.length - 1 ? (
          <Button variant="secondary" iconEnd={ArrowRight} onClick={() => go(i + 1)}>
            Next
          </Button>
        ) : (
          <Button href={base}>Go to Home</Button>
        )}
      </div>
    </>
  );
}

function StepBody({ step, checklist, onChange, base, next }: { step: merchantApi.OnboardingStep; checklist: merchantApi.OnboardingChecklist; onChange: (c: merchantApi.OnboardingChecklist) => void; base: string; next: () => void }) {
  const { api, detail, setDetail } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const copy = ONBOARDING_STEPS_UI[step.key];
  const complete = async (key: Exclude<merchantApi.OnboardingStepKey, "first_members">) => {
    const r = await act.run(() => api.completeStep(key));
    if (r) {
      onChange(r);
      toast({ message: "Saved", tone: "success" });
      next();
    }
  };

  const [desc, setDesc] = useState(detail.merchant.description ?? "");
  const [logo, setLogo] = useState(detail.merchant.logoUrl ?? "");
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<"staff" | "manager">("staff");
  const rewards = useApi(step.key === "rewards" || step.key === "program" ? () => api.rewards() : null, [api, step.key]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-title text-fg">{copy.title}</h2>
          <p className="mt-1 text-body text-fg-muted">{copy.body}</p>
        </div>
        {step.done ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-subtle px-3 py-1 text-label text-on-success-subtle">
            <Check aria-hidden className="size-4" /> Done
          </span>
        ) : null}
      </div>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      {step.key === "profile" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await act.run(() => api.update({ description: desc.trim() || null, logoUrl: logo.trim() || null }));
            if (d) {
              setDetail(d);
              await complete("profile");
            }
          }}
        >
          <TextField type="textarea" label="About your shop" hint="One or two sentences customers see on your shop page." maxLength={2000} showCount value={desc} onChange={(e) => setDesc(e.target.value)} />
          <TextField type="url" label="Logo URL" optionalLabel hint="A square image works best. Leave empty to use your initials." value={logo} onChange={(e) => setLogo(e.target.value)} />
          <div>
            <Button type="submit" loading={act.busy}>
              Save details
            </Button>
          </div>
        </form>
      ) : null}

      {step.key === "program" ? (
        <>
          {detail.program ? <p className="rounded-input bg-bg-subtle p-4 text-body text-fg">{programSentence(draftFromProgram(detail.program), rewards.data?.items[0])}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button loading={act.busy} onClick={() => complete("program")}>
              Looks good
            </Button>
            <Button variant="secondary" href={`${base}/program`}>
              Change
            </Button>
          </div>
        </>
      ) : null}

      {step.key === "rewards" ? (
        <>
          <ul className="flex flex-col gap-2">
            {(rewards.data?.items ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-input border border-line p-3">
                <span className="text-body text-fg">{r.name}</span>
                <span className="tabular-nums text-meta text-fg-muted">{formatPoints(r.pointsCost, detail.program?.terminology)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button loading={act.busy} onClick={() => complete("rewards")}>
              Rewards are ready
            </Button>
            <Button variant="secondary" href={`${base}/program?tab=rewards`}>
              Edit rewards
            </Button>
          </div>
        </>
      ) : null}

      {step.key === "staff" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!staffPhone) return act.setError("Enter a 10-digit mobile number.");
            const r = await act.run(() => api.invite({ name: staffName.trim() || undefined, phone: staffPhone, role: staffRole }));
            if (r) {
              toast({ message: `${staffName || "Staff"} invited by text`, tone: "success" });
              await complete("staff");
            }
          }}
        >
          <TextField label="Name" value={staffName} onChange={(e) => setStaffName(e.target.value)} autoComplete="off" />
          <PhoneField label="Mobile number" onChangeE164={setStaffPhone} />
          <Select label="Role" value={staffRole} onChange={(e) => setStaffRole(e.target.value as "staff" | "manager")} options={[{ value: "staff", label: "Staff: counter only" }, { value: "manager", label: "Manager: everything but billing" }]} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={act.busy}>
              Invite staff
            </Button>
            <Button variant="ghost" onClick={() => complete("staff")}>
              It&apos;s just me for now
            </Button>
          </div>
          <p className="text-caption text-fg-muted">Unlimited staff, always free.</p>
        </form>
      ) : null}

      {step.key === "qr_kit" ? (
        <div className="flex flex-wrap gap-2">
          <Button iconStart={Printer} href={`${base}/locations/kit${detail.locations[0] ? `?location=${detail.locations[0].id}` : ""}`}>
            Print QR kit
          </Button>
          <Button variant="secondary" loading={act.busy} onClick={() => complete("qr_kit")}>
            I printed it
          </Button>
        </div>
      ) : null}

      {step.key === "first_members" ? (
        <>
          <ProgressBar value={checklist.activeMembers} max={checklist.activationTarget} label="Active members" valueText={`${checklist.activeMembers} of ${checklist.activationTarget} active members`} />
          <ul className="list-disc ps-5 text-body text-fg">
            <li>Ask every customer: &quot;Are you on the card? It&apos;s free, here and on the whole street.&quot;</li>
            <li>Put the QR stand right next to the till.</li>
            <li>Add the stamp or points before they pay, so they see it work.</li>
          </ul>
          <div>
            <Button href={`${base}/counter`}>Open counter</Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
