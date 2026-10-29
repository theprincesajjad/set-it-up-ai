"use client";
import { Eye, Minus, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { ProgramPreview } from "@/components/dashboard/ProgramPreview";
import { CategoriesEditor } from "@/components/dashboard/program/CategoriesEditor";
import { RewardCost } from "@/components/dashboard/program/RewardCost";
import { RewardsEditor } from "@/components/dashboard/program/RewardsEditor";
import { VipEditor } from "@/components/dashboard/program/VipEditor";
import { ErrorLine, PageHeader, Panel, QuietButton, Segmented, ToolbarButton } from "@/components/dashboard/kit";
import { Button, IconButton } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  MIN_EXPIRY_MONTHS, STAMP_GOAL_MAX, STAMP_GOAL_MIN, clampStampGoal, diffProgram, draftFromProgram, earnModeOf, previewModel, programSentence, raisesTheBar, rewardPresets, setEarnMode, validateProgram, weeklyRegularSentence, type EarnMode, type ProgramDraft,
} from "@/lib/dashboard/program";
import { useApi } from "@/lib/dashboard/useApi";

export default function ProgramPage() {
  const { api } = useMerchant();
  const program = useApi(() => api.program(), [api]);
  const rewards = useApi(() => api.rewards(), [api]);
  const vip = useApi(() => api.vipLevels(), [api]);
  const cats = useApi(() => api.categories(), [api]);
  if (!program.data || !rewards.data) return program.error ? (
      <div>
        <PageHeader title="Rewards" description="Your stamp card. The preview shows exactly what customers see." />
        <ErrorLine message={program.error} onRetry={program.reload} />
      </div>
    ) : (
      <PageSkeleton rows={4} />
    );
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

function intOr(v: string, fallback = 0) {
  const n = Number.parseInt(v.replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** A numbered question: black number, one sentence, the control under it. */
function Step({ n, title, children, last }: { n: number; title: string; children: ReactNode; last?: boolean }) {
  return (
    <section aria-labelledby={`step-${n}`} className={cn("flex flex-col gap-4 py-6", !last && "border-b border-line", n === 1 && "pt-0")}>
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-headline text-fg">
        <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A settings row on the "At the counter" card: title and hint left, the control right. */
function SettingRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-16 flex-col items-start justify-between gap-2 border-t border-line py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-fg">{title}</p>
        {hint ? <p className="text-[13px] text-fg-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0 max-sm:self-stretch">{children}</div>
    </div>
  );
}

/** The reward being edited in step 3: the cheapest active reward, or a new one for a shop that has none. */
interface RewardDraft {
  name: string;
  rewardType: merchantApi.Reward["rewardType"];
  value: number;
}
const rewardDraftOf = (r: merchantApi.Reward | undefined, fallback: RewardDraft): RewardDraft => (r ? { name: r.name, rewardType: r.rewardType, value: r.value } : fallback);

function Editor({ program, onSaved, rewards, setRewards, vip, setVip, categories, setCategories }: {
  program: merchantApi.LoyaltyProgram; onSaved: (p: merchantApi.LoyaltyProgram) => void; rewards: merchantApi.Reward[]; setRewards: (r: merchantApi.Reward[]) => void;
  vip: merchantApi.VipLevel[]; setVip: (l: merchantApi.VipLevel[]) => void; categories: merchantApi.Category[]; setCategories: (c: merchantApi.Category[]) => void;
}) {
  const { api, detail, setDetail, enabled } = useMerchant();
  const vertical = detail.merchant.vertical;
  const birthday = enabled("loyalty.birthday_bonus");
  // A pharmacy can't pay for a referral (O. Reg. 264/16 s. 34 para 2) and earns on front-store dollars only (docs/research/pharmacies-wellness.md).
  const pharmacy = vertical === "pharmacy";
  const referrals = enabled("loyalty.referrals") && !pharmacy;
  const vipOn = enabled("loyalty.vip_levels");
  const moreWays = birthday || referrals || vipOn;
  const toast = useToast();
  const params = useSearchParams();
  const original = useMemo(() => draftFromProgram(program), [program]);
  const primary = useMemo(() => [...rewards].filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost)[0], [rewards]);
  const presets = useMemo(() => rewardPresets(vertical), [vertical]);
  const originalReward = useMemo(() => rewardDraftOf(primary, { name: presets[0]?.name ?? "Free reward", rewardType: presets[0]?.rewardType ?? "free_item", value: presets[0]?.value ?? 0 }), [primary, presets]);
  const [draft, setDraft] = useState<ProgramDraft>(original);
  const [rewardDraft, setRewardDraft] = useState<RewardDraft>(originalReward);
  const [custom, setCustom] = useState(false);
  const [debounced, setDebounced] = useState(draft);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [allRewards, setAllRewards] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 150);
    return () => clearTimeout(t);
  }, [draft]);
  useEffect(() => {
    const tab = params.get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === "rewards") setAllRewards(true);
    if (tab) document.getElementById(tab)?.scrollIntoView({ block: "start" });
  }, [params]);

  const errors = validateProgram(draft);
  const shown = tried ? errors : {};
  const patch = diffProgram(original, draft);
  const rewardChanged = rewardDraft.name !== originalReward.name || rewardDraft.rewardType !== originalReward.rewardType || rewardDraft.value !== originalReward.value;
  // A stamp card's reward costs exactly the stamp goal; keep them in step when the goal moves.
  const costMismatch = draft.earnType === "stamps" && !!primary && primary.pointsCost !== draft.stampGoal;
  const dirty = Object.keys(patch).length > 0 || rewardChanged || costMismatch;
  const previewRewards = rewards.map((r) => (r.id === primary?.id ? { ...r, ...rewardDraft, pointsCost: draft.earnType === "stamps" ? draft.stampGoal : r.pointsCost } : r));
  const shownRewards = primary ? previewRewards : [{ ...rewardDraft, pointsCost: draft.earnType === "stamps" ? draft.stampGoal : 100, active: true }];
  const model = previewModel(debounced, shownRewards);
  const set = <K extends keyof ProgramDraft>(k: K, v: ProgramDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const term = draft.terminology;
  const mode = earnModeOf(draft);
  const stampsMode = draft.earnType !== "per_dollar";
  /** Only a true stamp card has a stamp goal; a per-visit points program (salons, repair) states what a reward costs in points. */
  const stampCard = draft.earnType === "stamps";

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const p = Object.keys(patch).length ? await api.updateProgram(patch) : program;
      if (rewardChanged || costMismatch) {
        const body = { ...(rewardChanged ? rewardDraft : {}), ...(draft.earnType === "stamps" ? { pointsCost: draft.stampGoal } : {}) };
        if (primary) {
          const r = await api.updateReward(primary.id, body);
          setRewards(rewards.map((x) => (x.id === r.id ? r : x)));
        } else if (rewardDraft.name.trim()) {
          const r = await api.createReward({ name: rewardDraft.name.trim(), rewardType: rewardDraft.rewardType, value: rewardDraft.value, pointsCost: draft.earnType === "stamps" ? draft.stampGoal : 100, active: true });
          setRewards([...rewards, r]);
        }
      }
      onSaved(p);
      setDraft(draftFromProgram(p));
      setTried(false);
      setDetail({ ...detail, program: p });
      toast({ message: "Rewards saved", tone: "success" });
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function trySave() {
    setTried(true);
    if (Object.keys(errors).length || !rewardDraft.name.trim()) {
      setSaveError("Fix the highlighted fields first.");
      return;
    }
    if (raisesTheBar(original, draft)) setConfirm(true);
    else void save();
  }

  const modeOptions: { value: EarnMode; label: string }[] = [
    ...(!pharmacy && (enabled("loyalty.visits") || enabled("loyalty.stamps")) ? [{ value: "visit" as const, label: "One per visit" }, { value: "purchase" as const, label: "One per purchase over a minimum" }] : []),
    { value: "dollar", label: pharmacy ? "Points per dollar of front-store sales" : "Points per dollar" },
  ];
  const unit = term === "points" ? "pts" : term;
  const rewardNoun = rewardDraft.name || "a reward";
  const preview = <ProgramPreview model={model} shop={detail.merchant} defaultView="pass" />;

  return (
    <div className="pb-16">
      <PageHeader
        title="Rewards"
        description={stampCard ? "Your stamp card. The preview shows exactly what customers see." : "How customers earn points and what they cost. The preview shows exactly what customers see."}
        actions={
          <>
            <ToolbarButton icon={Eye} onClick={() => setPreviewOpen(true)} className="lg:hidden">Preview</ToolbarButton>
            {dirty ? <QuietButton onClick={() => { setDraft(original); setRewardDraft(originalReward); setSaveError(null); }}>Discard</QuietButton> : null}
            <Button size="md" loading={saving} disabled={!dirty} onClick={trySave} className="h-[38px] rounded-full px-4 text-[14px] font-medium">Save changes</Button>
          </>
        }
      />
      {saveError ? <div className="mb-4"><ErrorLine message={saveError} /></div> : null}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-card bg-card shadow-card p-6" aria-label="Set up your card">
            <Step n={1} title={stampCard ? "What earns a stamp" : "What earns points"}>
              <div id="earn" className="flex flex-col gap-4">
                <Segmented label="How customers earn" value={mode} onChange={(v) => setDraft((d) => setEarnMode(d, v))} options={modeOptions} className="self-start flex-wrap" />
                {mode === "purchase" ? (
                  <TextField label="Minimum purchase" inputMode="decimal" prefix="$" hint="Stops tiny purchases from earning a stamp. Set it to your cheapest drink." value={draft.minSpendCents ? (draft.minSpendCents / 100).toFixed(2) : ""} onChange={(e) => set("minSpendCents", Math.round((Number.parseFloat(e.target.value) || 0) * 100))} error={shown.minSpendCents} />
                ) : null}
                {mode === "dollar" ? (
                  <TextField label="Points per $1" inputMode="numeric" suffix="pts" value={String(draft.pointsPerDollar)} onChange={(e) => set("pointsPerDollar", intOr(e.target.value))} error={shown.pointsPerDollar} />
                ) : null}
              </div>
            </Step>

            <Step n={2} title={stampCard ? "Stamps to earn a reward" : "Points to earn a reward"}>
              {stampCard ? (
                <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Stamp goal">
                  <IconButton icon={Minus} variant="secondary" size={40} label="Fewer stamps" disabled={draft.stampGoal <= STAMP_GOAL_MIN} onClick={() => set("stampGoal", clampStampGoal(draft.stampGoal - 1))} />
                  <output aria-label="Stamp goal" className="min-w-10 text-center font-display text-[40px] font-bold leading-none tabular-nums text-fg">{draft.stampGoal}</output>
                  <IconButton icon={Plus} variant="secondary" size={40} label="More stamps" disabled={draft.stampGoal >= STAMP_GOAL_MAX} onClick={() => set("stampGoal", clampStampGoal(draft.stampGoal + 1))} />
                  <p className="text-[14px] text-fg-muted">stamps. {weeklyRegularSentence(draft.stampGoal, draft.pointsPerVisit)}</p>
                  {shown.stampGoal ? <p className="w-full text-meta font-medium text-negative">{shown.stampGoal}</p> : null}
                </div>
              ) : (
                <p className="text-[14px] text-fg-muted">Set the cost of each reward below, in points. {programSentence(draft, primary)}</p>
              )}
            </Step>

            <Step n={3} title="The reward" last>
              <TextField id="reward-name" label="Reward name" value={rewardDraft.name} onChange={(e) => setRewardDraft((r) => ({ ...r, name: e.target.value }))} error={tried && !rewardDraft.name.trim() ? "Name the reward." : undefined} maxLength={120} />
              <div role="group" aria-label="Reward presets" className="flex flex-wrap gap-2">
                {presets.map((p) => {
                  const on = p.label === "Custom" ? custom : !custom && rewardDraft.name === p.name;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        if (p.label === "Custom") {
                          setCustom(true);
                          setRewardDraft((r) => ({ ...r, rewardType: "custom", value: 0 }));
                          document.getElementById("reward-name")?.focus();
                        } else {
                          setCustom(false);
                          setRewardDraft({ name: p.name, rewardType: p.rewardType, value: p.value });
                        }
                      }}
                      className={cn("h-9 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:focus-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <TextField
                label={`What ${rewardNoun.toLowerCase().startsWith("free ") ? `a ${rewardNoun.toLowerCase()}` : rewardNoun.toLowerCase()} costs you (optional)`}
                hint="Only used in Reports to estimate what you owe in rewards. Customers never see it."
                inputMode="decimal"
                prefix="$"
                value={draft.rewardCostCents != null ? (draft.rewardCostCents / 100).toFixed(2) : ""}
                onChange={(e) => set("rewardCostCents", e.target.value.trim() === "" ? null : Math.max(0, Math.round((Number.parseFloat(e.target.value) || 0) * 100)))}
                className="sm:max-w-60"
              />
            </Step>
          </section>

          <section className="rounded-card bg-card shadow-card px-6 pb-2 pt-5" aria-labelledby="counter-h">
            <h2 id="counter-h" className="pb-3 text-[15px] font-semibold text-fg">At the counter</h2>
            {stampsMode ? (
              <SettingRow title={`Add a ${term.replace(/s$/, "")} on scan`} hint={stampsMode ? `A scan, or four digits that match one customer, adds a ${term.replace(/s$/, "")} straight away. Undo stays for 10 seconds.` : "Not available with points per dollar: the amount has to be typed."}>
                <SwitchControl ariaLabel={`Add a ${term.replace(/s$/, "")} on scan`} checked={draft.counterAutoStamp && stampsMode} disabled={!stampsMode} onChange={(v) => set("counterAutoStamp", v)} />
              </SettingRow>
            ) : null}
            <SettingRow title="Block repeat scans" hint={`No second ${term.replace(/s$/, "")} within ${draft.visitCooldownMinutes} minutes of the last one. Stops a double scan from counting twice.`}>
              <TextField label="Minutes between awards" hideLabel inputMode="numeric" suffix="min" value={String(draft.visitCooldownMinutes)} onChange={(e) => set("visitCooldownMinutes", intOr(e.target.value))} error={shown.visitCooldownMinutes} className="w-28 text-end" />
            </SettingRow>
            <SettingRow title={`${term.charAt(0).toUpperCase() + term.slice(1)} never expire`} hint={`Recommended. Customers don't like losing ${term} without warning.`}>
              <SwitchControl ariaLabel={`${term} never expire`} checked={draft.expiryMonths === null} onChange={(v) => set("expiryMonths", v ? null : 12)} />
            </SettingRow>
            {draft.expiryMonths !== null ? (
              <div className="border-t border-line py-3" id="expiry">
                <TextField label="Months without a visit before they expire" inputMode="numeric" min={MIN_EXPIRY_MONTHS} suffix="months" value={String(draft.expiryMonths)} onChange={(e) => set("expiryMonths", intOr(e.target.value, MIN_EXPIRY_MONTHS))} error={shown.expiryMonths ?? (draft.expiryMonths < MIN_EXPIRY_MONTHS ? `At least ${MIN_EXPIRY_MONTHS} months.` : null)} hint={`At least ${MIN_EXPIRY_MONTHS} months. Customers see this next to their balance: "${model.expiry}"`} className="sm:max-w-60" />
              </div>
            ) : null}
            <SettingRow title={`Welcome ${term.replace(/s$/, "")}`} hint="Given when a customer joins from your counter QR code">
              <TextField label="Welcome bonus" hideLabel inputMode="numeric" suffix={draft.welcomeBonus === 1 ? unit.replace(/s$/, "") : unit} value={String(draft.welcomeBonus)} onChange={(e) => set("welcomeBonus", intOr(e.target.value))} className="w-36 text-end" />
            </SettingRow>
          </section>

          {moreWays ? (
            <Panel title="More ways to earn">
              <div id="bonuses" className="flex flex-col gap-5">
                {birthday || referrals ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {birthday ? <TextField label="Birthday reward" inputMode="numeric" suffix={unit} value={String(draft.birthdayBonus)} onChange={(e) => set("birthdayBonus", intOr(e.target.value))} /> : null}
                    {referrals ? <TextField label="Referral reward" hint="Both friends get this amount." inputMode="numeric" suffix={unit} value={String(draft.referralBonus)} onChange={(e) => set("referralBonus", intOr(e.target.value))} /> : null}
                  </div>
                ) : null}
                {vipOn ? (
                  <div className={birthday || referrals ? "border-t border-line pt-5" : undefined}>
                    <VipEditor levels={vip} onChange={setVip} />
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : (
            <section id="bonuses" className="rounded-card bg-bg-subtle px-6 py-5" aria-labelledby="more-h">
              <h2 id="more-h" className="text-[15px] font-semibold text-fg">More ways to earn</h2>
              <p className="mt-2 text-[14px] text-fg-muted">Birthday treat, refer a friend and VIP levels come with Pro. They show up here once you subscribe.</p>
              <p className="mt-2 text-[14px] text-fg">
                <NotifyLink keys={["loyalty.birthday_bonus", "loyalty.referrals", "loyalty.vip_levels"]} className="text-[14px] no-underline" /> when they are ready
              </p>
            </section>
          )}

          {vertical === "grocery" && draft.earnType === "per_dollar" && primary?.rewardType === "amount_off" ? <RewardCost pointsPerDollar={draft.pointsPerDollar} pointsCost={primary.pointsCost} rewardValueCents={primary.value} /> : null}

          <div id="categories" className={pharmacy || vertical === "beauty_supply" ? "order-first" : undefined}>
            <CategoriesEditor categories={categories} onChange={setCategories} />
          </div>

          <div id="rewards" className="flex flex-col gap-3">
            {allRewards || rewards.length > 1 ? (
              <RewardsEditor rewards={rewards} onChange={setRewards} />
            ) : (
              <QuietButton onClick={() => setAllRewards(true)} className="self-start">Edit all rewards</QuietButton>
            )}
          </div>
        </div>

        <aside className="hidden lg:block" aria-label="Live preview">
          <div className="sticky top-20">
            <p className="mb-3 text-[13px] text-fg-muted">Live preview</p>
            {preview}
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Customer preview" variant="sheet">
        {preview}
      </Modal>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Customers will need more to reach a reward"
        body="Customers close to a reward will need more visits or points than before. Their current balance doesn't change."
        confirmLabel="Save changes"
        onConfirm={save}
      />
    </div>
  );
}
