"use client";
import { Eye, Minus, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { ProgramPreview } from "@/components/dashboard/ProgramPreview";
import { CategoriesEditor } from "@/components/dashboard/program/CategoriesEditor";
import { RewardsEditor } from "@/components/dashboard/program/RewardsEditor";
import { VipEditor } from "@/components/dashboard/program/VipEditor";
import { ErrorLine, PageHeader, Panel, Segmented, ToolbarButton } from "@/components/dashboard/kit";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import {
  MIN_EXPIRY_MONTHS, STAMP_GOAL_MAX, STAMP_GOAL_MIN, changeEarnType, clampStampGoal, diffProgram, draftFromProgram, previewModel, programSentence, raisesTheBar, validateProgram, type EarnType, type ProgramDraft,
} from "@/lib/dashboard/program";
import { useApi } from "@/lib/dashboard/useApi";

export default function ProgramPage() {
  const { api } = useMerchant();
  const program = useApi(() => api.program(), [api]);
  const rewards = useApi(() => api.rewards(), [api]);
  const vip = useApi(() => api.vipLevels(), [api]);
  const cats = useApi(() => api.categories(), [api]);
  if (!program.data || !rewards.data) return program.error ? <ErrorLine message={program.error} onRetry={program.reload} /> : <PageSkeleton rows={4} />;
  return (
    <Editor
      program={program.data}
      onSaved={(p) => program.setData(p)}
      rewards={rewards.data.items}
      setRewards={(items) => rewards.setData({ items })}
      vip={vip.data?.items ?? []}
      setVip={(items) => vip.setData({ items })}
      categories={cats.data?.items ?? []}
      setCategories={(items) => cats.setData({ items })}
    />
  );
}

function NumberStepper({ label, value, onChange, min, max, error, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; error?: string; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-meta-strong text-fg" id={`${label}-l`}>
        {label}
      </span>
      <div className="flex items-center gap-2" role="group" aria-labelledby={`${label}-l`}>
        <IconButton icon={Minus} variant="secondary" size={40} label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} />
        <output className="min-w-16 text-center text-headline tabular-nums text-fg">
          {value}
          {suffix ? <span className="ms-1 text-meta text-fg-muted">{suffix}</span> : null}
        </output>
        <IconButton icon={Plus} variant="secondary" size={40} label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} />
      </div>
      {error ? <p className="text-meta font-medium text-negative">{error}</p> : null}
    </div>
  );
}

function intOr(v: string, fallback = 0) {
  const n = Number.parseInt(v.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function Editor({ program, onSaved, rewards, setRewards, vip, setVip, categories, setCategories }: {
  program: merchantApi.LoyaltyProgram; onSaved: (p: merchantApi.LoyaltyProgram) => void; rewards: merchantApi.Reward[]; setRewards: (r: merchantApi.Reward[]) => void;
  vip: merchantApi.VipLevel[]; setVip: (l: merchantApi.VipLevel[]) => void; categories: merchantApi.Category[]; setCategories: (c: merchantApi.Category[]) => void;
}) {
  const { api, detail, setDetail, enabled } = useMerchant();
  const birthday = enabled("loyalty.birthday_bonus");
  const referrals = enabled("loyalty.referrals");
  const toast = useToast();
  const params = useSearchParams();
  const original = useMemo(() => draftFromProgram(program), [program]);
  const [draft, setDraft] = useState<ProgramDraft>(original);
  const [debounced, setDebounced] = useState(draft);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 150);
    return () => clearTimeout(t);
  }, [draft]);
  useEffect(() => {
    const tab = params.get("tab");
    if (tab) document.getElementById(tab)?.scrollIntoView({ block: "start" });
  }, [params]);

  const errors = validateProgram(draft);
  const shown = tried ? errors : {};
  const patch = diffProgram(original, draft);
  const dirty = Object.keys(patch).length > 0;
  const model = previewModel(debounced, rewards);
  const set = <K extends keyof ProgramDraft>(k: K, v: ProgramDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const term = draft.terminology;

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const p = await api.updateProgram(patch);
      onSaved(p);
      setDraft(draftFromProgram(p));
      setTried(false);
      setDetail({ ...detail, program: p });
      toast({ message: "Program saved", tone: "success" });
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const earnOptions: { value: EarnType; label: string }[] = [
    { value: "per_dollar", label: "Points per $" },
    ...(enabled("loyalty.visits") ? [{ value: "per_visit" as const, label: "Per visit" }] : []),
    ...(enabled("loyalty.stamps") ? [{ value: "stamps" as const, label: "Stamps" }] : []),
  ];

  const preview = <ProgramPreview model={model} shop={detail.merchant} />;
  const unit = term === "points" ? "pts" : term;

  return (
    <div className="pb-24">
      <PageHeader title="Program & rewards" description="How customers earn and what they get. The preview shows exactly what they'll see." actions={<ToolbarButton icon={Eye} onClick={() => setPreviewOpen(true)} className="lg:hidden">Preview</ToolbarButton>} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="How customers earn" as="section">
            <div id="earn" className="flex flex-col gap-4">
              <Segmented label="Earn type" value={draft.earnType} onChange={(v) => setDraft((d) => changeEarnType(d, v))} options={earnOptions} className="self-start" />
              <TextField label="Program name" value={draft.name} onChange={(e) => set("name", e.target.value)} error={shown.name} maxLength={120} />
              <div className="grid gap-4 sm:grid-cols-2">
                {draft.earnType === "per_dollar" ? (
                  <TextField label="Points per $1" inputMode="numeric" suffix="pts" value={String(draft.pointsPerDollar)} onChange={(e) => set("pointsPerDollar", intOr(e.target.value))} error={shown.pointsPerDollar} />
                ) : (
                  <TextField label={draft.earnType === "stamps" ? "Stamps per visit" : "Points per visit"} inputMode="numeric" value={String(draft.pointsPerVisit)} onChange={(e) => set("pointsPerVisit", intOr(e.target.value))} error={shown.pointsPerVisit} />
                )}
                {draft.earnType === "stamps" ? <NumberStepper label="Stamp goal" value={draft.stampGoal} min={STAMP_GOAL_MIN} max={STAMP_GOAL_MAX} onChange={(n) => set("stampGoal", clampStampGoal(n))} error={shown.stampGoal} suffix="stamps" /> : null}
                {draft.earnType !== "per_dollar" ? <TextField label="Minimum purchase to earn" optionalLabel inputMode="decimal" prefix="$" value={draft.minSpendCents ? String(draft.minSpendCents / 100) : ""} onChange={(e) => set("minSpendCents", Math.round((Number.parseFloat(e.target.value) || 0) * 100))} /> : null}
                <Select label="What you call them" value={draft.terminology} onChange={(e) => set("terminology", e.target.value as ProgramDraft["terminology"])} options={[{ value: "points", label: "Points" }, { value: "stamps", label: "Stamps" }, { value: "stars", label: "Stars" }]} />
              </div>
              <TextField label="Cooldown between visits" hint="Stops the same customer being awarded twice in a row by mistake." inputMode="numeric" suffix="min" value={String(draft.visitCooldownMinutes)} onChange={(e) => set("visitCooldownMinutes", intOr(e.target.value))} error={shown.visitCooldownMinutes} />
              <p role="status" className="border-t border-line pt-4 text-meta text-fg">
                {programSentence(draft, rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost)[0])}
              </p>
            </div>
          </Panel>

          <div id="rewards">
            <RewardsEditor rewards={rewards} onChange={setRewards} />
          </div>

          <Panel title="Bonuses" description={birthday || referrals ? undefined : "A welcome bonus gets a new member to their second visit."}>
            <div id="bonuses" className="grid gap-4 sm:grid-cols-3">
              <TextField label="Welcome bonus" inputMode="numeric" suffix={unit} value={String(draft.welcomeBonus)} onChange={(e) => set("welcomeBonus", intOr(e.target.value))} />
              {birthday ? <TextField label="Birthday reward" inputMode="numeric" suffix={unit} value={String(draft.birthdayBonus)} onChange={(e) => set("birthdayBonus", intOr(e.target.value))} /> : null}
              {referrals ? <TextField label="Referral (each)" hint="Both friends get this." inputMode="numeric" suffix={unit} value={String(draft.referralBonus)} onChange={(e) => set("referralBonus", intOr(e.target.value))} /> : null}
            </div>
            {enabled("loyalty.vip_levels") ? (
              <div className="mt-6 border-t border-line pt-5">
                <VipEditor levels={vip} onChange={setVip} />
              </div>
            ) : null}
          </Panel>

          <div id="categories">
            <CategoriesEditor categories={categories} onChange={setCategories} />
          </div>

          <Panel title="Expiry">
            <fieldset id="expiry" className="flex flex-col divide-y divide-line rounded-input border border-line">
              <legend className="sr-only">When {term} expire</legend>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="radio" name="expiry" checked={draft.expiryMonths === null} onChange={() => set("expiryMonths", null)} className="mt-0.5 size-4 accent-[var(--ll-color-fg)]" />
                <span className="flex flex-wrap items-center gap-2 text-meta-strong text-fg">
                  {term.charAt(0).toUpperCase() + term.slice(1)} never expire <span className="font-normal text-fg-muted">Recommended</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="radio" name="expiry" checked={draft.expiryMonths !== null} onChange={() => set("expiryMonths", draft.expiryMonths ?? 12)} className="mt-0.5 size-4 accent-[var(--ll-color-fg)]" />
                <span className="flex flex-1 flex-col gap-3">
                  <span className="text-meta-strong text-fg">Expire after a stretch without a visit</span>
                  {draft.expiryMonths !== null ? (
                    <TextField label="Months without a visit" inputMode="numeric" min={MIN_EXPIRY_MONTHS} suffix="months" value={String(draft.expiryMonths)} onChange={(e) => set("expiryMonths", intOr(e.target.value, MIN_EXPIRY_MONTHS))} error={shown.expiryMonths ?? (draft.expiryMonths < MIN_EXPIRY_MONTHS ? `At least ${MIN_EXPIRY_MONTHS} months.` : null)} hint={`At least ${MIN_EXPIRY_MONTHS} months.`} />
                  ) : null}
                </span>
              </label>
            </fieldset>
            {draft.expiryMonths !== null ? <p className="mt-3 text-meta text-fg-muted">Customers will see this rule next to their balance everywhere: &quot;{model.expiry}&quot;</p> : null}
          </Panel>
        </div>

        <aside className="hidden lg:block" aria-label="Live preview">
          <div className="sticky top-20">
            <p className="mb-3 text-meta text-fg-muted">Live preview</p>
            {preview}
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Customer preview" variant="sheet">
        {preview}
      </Modal>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-bg px-4 py-3 md:px-8 lg:start-[240px]">
          <div className="mx-auto flex max-w-[1136px] flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-fg">{saveError ? <span className="text-negative">{saveError}</span> : "You have unsaved changes"}</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(original)}>
                Discard
              </Button>
              <Button
                size="sm"
                loading={saving}
                onClick={() => {
                  setTried(true);
                  if (Object.keys(errors).length) {
                    setSaveError("Fix the highlighted fields first.");
                    return;
                  }
                  if (raisesTheBar(original, draft)) setConfirm(true);
                  else void save();
                }}
              >
                Save program
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Customers will need more to reach a reward"
        body="Customers close to a reward will need more visits or points than before. Their current balance doesn't change."
        confirmLabel="Save program"
        onConfirm={save}
      />
    </div>
  );
}
