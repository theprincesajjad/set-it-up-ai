"use client";
import { CircleCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { appointmentsApi } from "@ll/shared";
import { SidePanel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { cn } from "@/lib/cn";
import { duePreview, money, tipChoices } from "@/lib/dashboard/calendar";
import { formatDate, formatPoints } from "@/lib/format";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Appt = appointmentsApi.AppointmentDto;
type Item = appointmentsApi.AppointmentItem;

const METHODS = [
  { value: "card_terminal", label: "Card or tap on your terminal" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Something else" },
];

/**
 * Check out (Figma frame 3, "Check out, $140 + tip"): add or remove services, apply a reward, take a tip for the
 * stylist, and either record the payment at the counter or text the pay link. Tips never earn points.
 */
export function CheckoutSheet({
  open,
  onClose,
  appt,
  services,
  staff,
  settings,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  appt: Appt;
  services: appointmentsApi.ServiceDto[];
  staff: appointmentsApi.BookableStaffDto[];
  settings: appointmentsApi.AppointmentSettingsDto | null;
  onDone: () => void | Promise<void>;
}) {
  const { api, base, detail } = useMerchant();
  const act = useAction();
  const [nextWeeks, setNextWeeks] = useState("");
  const [items, setItems] = useState<Item[]>(appt.items);
  const [mode, setMode] = useState<"counter" | "link">("counter");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("card_terminal");
  const [tip, setTip] = useState<number>(0);
  const [customTip, setCustomTip] = useState("");
  const [tipStaff, setTipStaff] = useState(appt.staffId ?? "");
  const [rewardId, setRewardId] = useState("");
  const [addId, setAddId] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<appointmentsApi.CheckoutResponse | null>(null);
  useEffect(() => {
    if (!open) return;
    // Fresh numbers each time the sheet opens for an appointment.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(appt.items);
    setTip(0);
    setCustomTip("");
    setRewardId("");
    setResult(null);
    setTipStaff(appt.staffId ?? "");
    setNextWeeks(appt.pet ? String(appt.pet.groomEveryWeeks) : "");
    act.setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appt.id]);
  const rewards = useApi(open && appt.customer.id ? () => api.rewards() : null, [api, open, appt.customer.id]);
  const due = useMemo(() => duePreview(items, appt.depositPaidAt ? appt.depositCents : 0), [items, appt.depositPaidAt, appt.depositCents]);
  const presets = settings?.tipPresets ?? [15, 20, 25];
  const choices = tipChoices(due.subtotalCents, presets);
  const tipsOn = settings?.tipsOn ?? true;
  const needsPhone = !appt.customer.id;

  const addService = (id: string) => {
    const s = services.find((x) => x.id === id);
    if (!s) return;
    setItems((cur) => [...cur, { serviceId: s.id, name: s.name, durationMin: s.durationMin, priceCents: s.priceCents }]);
    setAddId("");
  };

  async function submit() {
    if (needsPhone && !phone.replace(/\D/g, "")) return act.setError("Add the client's phone number. They earn points and get the receipt.");
    const r = await act.run(() =>
      api.appointments.checkout(appt.id, {
        items: items.length ? items : undefined,
        mode,
        counterMethod: method as "cash" | "card_terminal" | "other",
        tipCents: mode === "counter" ? tip : 0,
        tipStaffId: tipStaff || null,
        rewardId: rewardId || null,
        nextGroomWeeks: appt.pet && nextWeeks ? Number(nextWeeks) : null,
        customer: needsPhone ? { phone: `+1${phone.replace(/\D/g, "").slice(-10)}`, name: appt.customer.name } : undefined,
      }),
    );
    if (r) {
      setResult(r);
      await onDone();
    }
  }

  const inv = result?.invoice;
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Check out"
      title={result ? "Checked out" : `Check out ${appt.customer.name}`}
      subtitle={result ? undefined : appt.items.map((i) => i.name).join(", ")}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Back</Button>
            <Button loading={act.busy} disabled={!items.length} onClick={submit}>
              {mode === "counter" ? `Take ${money(due.dueCents + (tipsOn ? tip : 0))}` : "Text the pay link"}
            </Button>
          </>
        )
      }
    >
      {result && inv ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <CircleCheck aria-hidden className="mt-0.5 size-6 shrink-0 text-positive" strokeWidth={1.5} />
            <div>
              <p className="text-body-strong text-fg">{inv.status === "paid" ? `Paid, invoice #${inv.number}` : `Pay link sent, invoice #${inv.number}`}</p>
              <p className="text-meta text-fg-muted">{inv.status === "paid" ? `${formatPoints(inv.pointsEarned, detail.program?.terminology, false)} earned.` : "They get the link by text and push."}</p>
              {result.pet ? <p className="mt-1 text-meta text-fg">{result.pet.name}&apos;s groom is logged. Next one is due {formatDate(result.pet.nextDueOn)} (every {result.pet.groomEveryWeeks} weeks).</p> : null}
            </div>
          </div>
          <dl className="divide-y divide-line border-y border-line text-meta">
            <Line label="Services" value={money(inv.subtotalCents + inv.discountCents)} />
            {inv.discountCents ? <Line label="Reward" value={`-${money(inv.discountCents)}`} tone="positive" /> : null}
            {inv.taxCents > 0 ? <Line label={settings?.tax.name ?? "Tax"} value={money(inv.taxCents)} /> : settings?.taxStatus === "unset" ? <Line label="Tax" value="Not added: tax status not set" /> : settings?.taxStatus === "small" ? <Line label="Tax" value="None (small supplier)" /> : null}
            {inv.depositAppliedCents ? <Line label="Deposit paid online" value={`-${money(inv.depositAppliedCents)}`} tone="positive" /> : null}
            <Line label="Balance" value={money(inv.amountDueCents)} strong />
            {inv.tipCents ? <Line label="Tip" value={money(inv.tipCents)} /> : null}
          </dl>
          {result.payUrl ? <p className="break-all text-meta text-fg-muted">{result.payUrl}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="Lines">
            <ul className="divide-y divide-line border-y border-line">
              {items.map((i, idx) => (
                <li key={`${i.name}${idx}`} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-body text-fg">{i.name}</span>
                  <span className="shrink-0 text-body tabular text-fg">{money(i.priceCents)}</span>
                  <button type="button" aria-label={`Remove ${i.name}`} onClick={() => setItems((cur) => cur.filter((_, k) => k !== idx))} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-bg-subtle hover:text-fg focus-visible:focus-ring">
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Select hideLabel label="Add a service" value={addId} placeholder="Add a service" onChange={(e) => addService(e.target.value)} options={services.filter((s) => s.active).map((s) => ({ value: s.id, label: `${s.name} · ${money(s.priceCents)}` }))} className="mt-2" />
          </section>

          {settings?.taxStatus === "unset" ? (
            <Banner tone="warning" title="No tax will be added">
              Your GST/HST status is not set, so this bill has no tax line. <a className="underline underline-offset-2" href={`${base}/settings?tab=tax`}>Set it in Settings</a> if you charge HST.
            </Banner>
          ) : null}
          {appt.pet ? (
            <Select label={`Next groom for ${appt.pet.name}`} hint="Logs today's groom and sets when the reminder goes out." value={nextWeeks} onChange={(e) => setNextWeeks(e.target.value)} options={[...new Set([2, 4, 6, 8, 10, 12, appt.pet.groomEveryWeeks])].sort((a, b) => a - b).map((w) => ({ value: String(w), label: `In ${w} weeks` }))} />
          ) : null}
          {appt.customer.id && rewards.data?.items.some((r) => r.active) ? (
            <Select label="Reward" hint="Takes the points off their balance and the value off the bill." value={rewardId} onChange={(e) => setRewardId(e.target.value)} options={[{ value: "", label: "No reward" }, ...rewards.data.items.filter((r) => r.active).map((r) => ({ value: r.id, label: `${r.name} (${r.pointsCost} pts)` }))]} />
          ) : null}

          <div className="inline-flex h-8 w-fit items-center rounded-input bg-bg-subtle p-0.5" role="radiogroup" aria-label="How they pay">
            {([["counter", "Take payment here"], ["link", "Text a pay link"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={cn("h-7 rounded-[8px] px-3 text-meta focus-visible:focus-ring", mode === v ? "bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--ll-color-line)]" : "text-fg-muted hover:text-fg")}>
                {l}
              </button>
            ))}
          </div>

          {mode === "counter" ? (
            <>
              <Select label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} options={METHODS} />
              {tipsOn ? (
                <fieldset>
                  <legend className="mb-1.5 text-meta-strong text-fg">Tip</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {[{ label: "No tip", cents: 0, key: "none" }, ...choices.map((c) => ({ label: `${c.percent}% · ${money(c.cents)}`, cents: c.cents, key: `p${c.percent}` }))].map((c) => (
                      <button key={c.key} type="button" aria-pressed={tip === c.cents && !customTip} onClick={() => { setTip(c.cents); setCustomTip(""); }} className={cn("inline-flex h-8 items-center rounded-full border px-3 text-meta focus-visible:focus-ring", tip === c.cents && !customTip ? "border-fg bg-fg font-medium text-bg" : "border-line bg-bg text-fg hover:bg-bg-subtle")}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <TextField className="mt-2" label="Other amount" hideLabel placeholder="Other amount" inputMode="decimal" prefix="$" value={customTip} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setCustomTip(v); setTip(Math.min(due.subtotalCents, Math.round(Number(v || 0) * 100))); }} />
                  <p className="mt-1 text-caption text-fg-muted">Goes to the stylist. Not taxed, and it doesn&apos;t earn points.</p>
                </fieldset>
              ) : null}
              {tipsOn && tip > 0 ? (
                <Select label="Tip goes to" value={tipStaff} onChange={(e) => setTipStaff(e.target.value)} options={[{ value: "", label: "Nobody in particular" }, ...staff.map((s) => ({ value: s.userId, label: s.name }))]} />
              ) : null}
            </>
          ) : (
            <p className="text-meta text-fg-muted">They get a text with a link to pay and pick their tip for {staff.find((s) => s.userId === (tipStaff || appt.staffId))?.name ?? "their stylist"}.</p>
          )}

          {needsPhone ? <TextField label="Client phone" hint="Walk-in: add a number to pay, earn points and get a receipt." inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /> : null}

          <dl className="divide-y divide-line border-y border-line text-meta">
            <Line label="Services" value={money(due.subtotalCents)} />
            {due.depositCents ? <Line label="Deposit paid online" value={`-${money(due.depositCents)}`} tone="positive" /> : null}
            <Line label={settings?.taxStatus === "registered" ? "Balance before tax" : "Balance"} value={money(due.dueCents)} strong />
            {mode === "counter" && tipsOn && tip > 0 ? <Line label="Tip" value={money(tip)} /> : null}
          </dl>
          {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        </div>
      )}
    </SidePanel>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "positive" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={cn(strong ? "text-body-strong text-fg" : "text-fg-muted")}>{label}</dt>
      <dd className={cn("tabular", strong ? "text-body-strong text-fg" : tone === "positive" ? "text-positive-text" : "text-fg")}>{value}</dd>
    </div>
  );
}
