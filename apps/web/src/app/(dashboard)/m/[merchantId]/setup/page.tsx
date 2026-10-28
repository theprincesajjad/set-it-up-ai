"use client";
import { ArrowLeft, ArrowRight, Check, Copy, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ONBOARDING_STEPS_UI } from "./steps";
import { STEP_COPY } from "@/components/dashboard/Checklist";
import { Dot, Meter, PageHeader, Panel, SkeletonRows } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { TaxStatus } from "@/components/dashboard/TaxStatus";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { PhoneField } from "@/components/ui/PhoneField";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { QrCode } from "@/components/ui/QrCode";
import { SubscribeButton } from "@/components/dashboard/SubscribeButton";
import { TRADE_COPY, TradeSetup } from "@/components/dashboard/onboarding/TradeSetup";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatPoints } from "@/lib/format";
import { draftFromProgram, programSentence } from "@/lib/dashboard/program";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { PLANS, tradeSetupFor, type merchantApi } from "@ll/shared";

/** Setup guide (merchant-dashboard.md §1): profile → program → rewards → staff → QR kit → first 25 members. */
export default function SetupPage() {
  const { api, base } = useMerchant();
  const state = useApi(() => api.onboarding(), [api], { pollMs: 8000 });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Set up your shop" description="A few steps to live on the street. Each saves as you go." />
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>{(c) => <Wizard checklist={c} onChange={(n) => state.setData(n)} base={base} />}</Async>
    </div>
  );
}

function Wizard({ checklist, onChange, base }: { checklist: merchantApi.OnboardingChecklist; onChange: (c: merchantApi.OnboardingChecklist) => void; base: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const core = checklist.steps;
  const steps = [...core, ...checklist.later];
  const initial = steps.findIndex((s) => s.key === (params.get("step") ?? checklist.currentStep));
  const [i, setI] = useState(initial === -1 ? 0 : initial);
  const step = steps[i] ?? steps[0]!;
  const doneCount = core.filter((s) => s.done).length;
  const allDone = checklist.currentStep === "done" || doneCount === core.length;
  const go = (n: number) => {
    setI(n);
    router.replace(`${base}/setup?step=${steps[n]!.key}`, { scroll: false });
  };

  return (
    <>
      {allDone ? <Banner tone="success" title="You're live.">Your first customer can join right now.</Banner> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between text-meta">
            <span className="text-fg">
              {doneCount} of {core.length} done
            </span>
            <span className="tabular text-fg-muted">{Math.round((doneCount / core.length) * 100)}%</span>
          </div>
          <Meter value={doneCount} max={core.length} label="Setup progress" />
          <ol className="relative mt-4 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Setup steps">
            {steps.map((s, n) => (
              <li key={s.key} className={cn(n === core.length && "lg:mt-4 lg:border-t lg:border-line lg:pt-3")}>
                {n === core.length ? <span className="mb-1 hidden px-2 text-caption font-semibold uppercase tracking-wide text-fg-muted lg:block">Later, optional</span> : null}
                <button type="button" onClick={() => go(n)} aria-current={n === i ? "step" : undefined} className={cn("flex h-9 w-full items-center gap-2.5 whitespace-nowrap rounded-[8px] px-2 text-start text-meta", n === i ? "bg-bg-muted font-medium text-fg" : "text-fg hover:bg-bg-subtle")}>
                  <span aria-hidden className={cn("inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-[10px] tabular", s.done ? "bg-fg text-bg" : "border border-line-strong text-fg-muted")}>
                    {s.done ? <Check className="size-3" strokeWidth={2.5} /> : n + 1}
                  </span>
                  <span className="sr-only">{s.done ? "Done: " : ""}</span>
                  <span className={cn(n >= core.length && !s.done && "text-fg-muted")}>{s.key === "trade_setup" || s.key === "first_members" ? s.label : STEP_COPY[s.key].label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <StepBody step={step} checklist={checklist} onChange={onChange} base={base} next={() => i < core.length - 1 && go(i + 1)} />
          </Panel>
          <div className="flex justify-between gap-3">
            {i > 0 ? (
              <Button variant="ghost" size="sm" iconStart={ArrowLeft} onClick={() => go(i - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {i < core.length - 1 ? (
              <Button variant="ghost" size="sm" iconEnd={ArrowRight} onClick={() => go(i + 1)}>
                Next
              </Button>
            ) : (
              <Button variant="secondary" size="sm" href={base}>Go to Home</Button>
            )}
          </div>
          <NudgeToggle checklist={checklist} onChange={onChange} />
        </div>
      </div>
    </>
  );
}

function NudgeToggle({ checklist, onChange }: { checklist: merchantApi.OnboardingChecklist; onChange: (c: merchantApi.OnboardingChecklist) => void }) {
  const { api, role } = useMerchant();
  const act = useAction();
  if (role !== "owner" || checklist.activatedAt) return null;
  return (
    <p className="text-caption text-fg-muted">
      Setup reminders by text: {checklist.nudgesOn ? "on" : "off"}.{" "}
      <button
        type="button"
        disabled={act.busy}
        className="rounded-sm text-fg underline underline-offset-2 focus-visible:focus-ring"
        onClick={async () => {
          const r = await act.run(() => api.setNudges(!checklist.nudgesOn));
          if (r) onChange(r);
        }}
      >
        {checklist.nudgesOn ? "Stop reminders" : "Turn on"}
      </button>
    </p>
  );
}

function StepBody({ step, checklist, onChange, base, next }: { step: merchantApi.OnboardingStep; checklist: merchantApi.OnboardingChecklist; onChange: (c: merchantApi.OnboardingChecklist) => void; base: string; next: () => void }) {
  const { api, detail, setDetail, enabled } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const rx = detail.merchant.vertical === "pharmacy";
  // A pharmacy gives points on front-store dollars only, so its first step is a sale, not a stamp.
  const family = tradeSetupFor(detail.merchant.vertical);
  const a = checklist.activation;
  const copy =
    rx && step.key === "first_stamp"
      ? { title: "Record your first front-store sale", body: "Nothing helps more than seeing points work. It takes about three minutes." }
      : step.key === "trade_setup" && family
        ? { title: TRADE_COPY[family].title, body: TRADE_COPY[family].body }
        : step.key === "first_members"
          ? { title: `Your first ${checklist.activationTarget} members`, body: `Activation goal: ${checklist.activationTarget} members who have visited within ${a.windowDays} days. ${a.leadingMembers} by day ${a.leadingByDay} is the pace that gets you there.` }
          : ONBOARDING_STEPS_UI[step.key];
  const pb = checklist.playbook;
  const complete = async (key: Exclude<merchantApi.OnboardingStepKey, "first_members" | "first_stamp" | "pharmacy_rules" | "trade_setup">, advance = true) => {
    const r = await act.run(() => api.completeStep(key));
    if (r) {
      onChange(r);
      toast({ message: "Saved", tone: "success" });
      if (advance) next();
    }
  };

  const [desc, setDesc] = useState(detail.merchant.description ?? "");
  const [logo, setLogo] = useState(detail.merchant.logoUrl ?? "");
  const [staffName, setStaffName] = useState("");
  const [staffPhone, setStaffPhone] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<"staff" | "manager">("staff");
  const [copied, setCopied] = useState(false);
  const rewards = useApi(step.key === "program" ? () => api.rewards() : null, [api, step.key]);
  const loc = detail.locations[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-headline text-fg">{copy.title}</h2>
          <p className="mt-1 text-meta text-fg-muted">{copy.body}</p>
        </div>
        {step.done ? <Dot tone="positive">Done</Dot> : null}
      </div>
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}

      {step.key === "program" ? (
        <>
          {detail.program ? <p className="border-y border-line py-3 text-body text-fg">{programSentence(draftFromProgram(detail.program), rewards.data?.items[0])}</p> : null}
          {rewards.data?.items.length ? (
            <ul className="divide-y divide-line border-b border-line">
              {rewards.data.items.map((r) => (
                <li key={r.id} className="flex min-h-11 items-center justify-between">
                  <span className="text-body text-fg">{r.name}</span>
                  <span className="tabular-nums text-meta text-fg-muted">{formatPoints(r.pointsCost, detail.program?.terminology)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-meta text-fg-muted">Set up for: {pb.label}. At the till, staff say: &ldquo;{pb.tillLine}&rdquo;</p>
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

      {step.key === "trade_setup" && family ? <TradeSetup family={family} done={step.done} /> : null}

      {step.key === "pharmacy_rules" ? (
        step.done ? (
          <Banner tone="success" title="Rules confirmed.">{step.detail ? `Confirmed by ${step.detail}.` : ""} Points can now be given on front-store sales.</Banner>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button href={`${base}/pharmacy`}>Open pharmacy rules</Button>
            <p className="text-meta text-fg-muted">The owner confirms it. You will need the OCP accreditation number.</p>
          </div>
        )
      ) : null}

      {step.key === "first_stamp" ? (
        step.done ? (
          <>
            <Banner tone="success" title={rx ? "First sale recorded." : "First stamp given."}>
              {checklist.activation.firstStampMinutes !== null ? `${Math.max(1, Math.round(checklist.activation.firstStampMinutes))} ${Math.max(1, Math.round(checklist.activation.firstStampMinutes)) === 1 ? "minute" : "minutes"} after you signed up. ` : ""}
              Now you know exactly what your customers see. Next: print the QR stand.
            </Banner>
            <div>
              <Button href={`${base}/counter`}>Open counter</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body text-fg">{pb.firstStampHint}</p>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              {loc ? (
                <div className="w-[200px] shrink-0 rounded-card border border-line bg-qr-bg p-3">
                  <QrCode value={loc.joinUrl} size={176} label={`QR code to join ${detail.merchant.name}`} />
                </div>
              ) : null}
              <ol className="flex flex-col gap-2.5 text-body text-fg">
                <li>
                  <span className="me-2 font-semibold text-points-text">1</span>Scan with your phone camera. No app.
                </li>
                <li>
                  <span className="me-2 font-semibold text-points-text">2</span>Enter your name and number. 30 seconds.
                </li>
                <li>
                  <span className="me-2 font-semibold text-points-text">3</span>{rx ? "Open the counter, find yourself, enter an amount, tick the front-store box and tap Award." : "Open the counter, scan your own card or type the last 4 digits of your phone."}
                </li>
                <li>
                  <Dot tone="accent" className="max-w-full items-start !whitespace-normal rounded-2xl bg-bg-subtle px-3 py-1.5">
                    {rx ? "Waiting for your first sale." : "Waiting for your first stamp."} This page updates by itself.
                  </Dot>
                </li>
              </ol>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button href={`${base}/counter`}>Open counter</Button>
              {loc ? (
                <Button
                  variant="secondary"
                  iconStart={copied ? Check : Copy}
                  onClick={() => {
                    void navigator.clipboard?.writeText(loc.joinUrl).then(() => setCopied(true)).catch(() => undefined);
                  }}
                >
                  {copied ? "Link copied" : "Copy join link"}
                </Button>
              ) : null}
            </div>
            <p className="text-caption text-fg-muted">
              Rather have a hand? <Link className="underline underline-offset-2" href="/#book">Book a free 20-minute call</Link> and we set it up with you.
            </p>
          </>
        )
      ) : null}

      {step.key === "profile" ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await act.run(() => api.update({ description: desc.trim() || null, logoUrl: logo.trim() || null }));
            if (d) {
              setDetail(d);
              await complete("profile", false);
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

      {step.key === "profile" ? (
        <section aria-label="Tax" className="flex flex-col gap-3 border-t border-line pt-4">
          <div>
            <h3 className="text-body-strong text-fg">Charging GST/HST?</h3>
            <p className="mt-0.5 text-meta text-fg-muted">Pick one now so invoices, appointments and tiffin bills are right from the first sale. You can change it in Settings.</p>
          </div>
          <TaxStatus owner={detail.role === "owner"} compact />
        </section>
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
          <p className="text-meta text-fg-muted">They get a text with the sign-in link. On their phone they open Counter and add it to the home screen, and it works like an app.</p>
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
          <Button iconStart={Printer} href={`${base}/locations/kit${loc ? `?location=${loc.id}` : ""}`}>
            Print QR kit
          </Button>
          <Button variant="secondary" loading={act.busy} onClick={() => complete("qr_kit")}>
            I printed it
          </Button>
        </div>
      ) : null}

      {step.key === "pos" ? (
        enabled("integrations.pos_auto_award") ? (
          <div className="flex flex-wrap gap-2">
            <Button href={`${base}/integrations`}>Choose your POS</Button>
            <Button variant="ghost" loading={act.busy} onClick={() => complete("pos", false)}>
              Skip for now
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-body text-fg">
              POS sync is part of {PLANS.plus.name}, ${PLANS.plus.priceCents / 100} a month. Stamps from the counter work the same way in the meantime.
            </p>
            <SubscribeButton offer={{ kind: "plan", plan: "plus", name: PLANS.plus.name, priceCents: PLANS.plus.priceCents }} />
          </div>
        )
      ) : null}

      {step.key === "first_members" ? (
        <>
          <ProgressBar value={checklist.activeMembers} max={checklist.activationTarget} label="Active members" valueText={`${checklist.activeMembers} of ${checklist.activationTarget} active members`} />
          <p className="text-meta text-fg-muted">
            {checklist.activation.paceLabel} · {checklist.activation.members >= checklist.activation.leadingMembers ? "past" : "aiming for"} {checklist.activation.leadingMembers} by day {checklist.activation.leadingByDay}
          </p>
          <p className="text-body text-fg">{pb.tactic}</p>
          <ul className="list-disc ps-5 text-meta text-fg">
            {pb.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button href={`${base}/counter`}>Open counter</Button>
            <Button variant="secondary" href={`${base}/locations/kit?print=script`}>
              Print the staff script
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
