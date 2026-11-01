"use client";
import { Eye } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { merchantApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { EarnScopePicker, EarnUnitPicker, GoalStepper, selectedNames, type UnitOption } from "@/components/dashboard/program/EarnRules";
import { ChangeHistory, TiersEditor } from "@/components/dashboard/program/TiersAndHistory";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PageSkeleton } from "@/components/dashboard/PageStates";
import { ProgramPreview } from "@/components/dashboard/ProgramPreview";
import { CategoriesEditor } from "@/components/dashboard/program/CategoriesEditor";
import { RewardCost } from "@/components/dashboard/program/RewardCost";
import { RewardsEditor } from "@/components/dashboard/program/RewardsEditor";
import { VipEditor } from "@/components/dashboard/program/VipEditor";
import { ErrorLine, PageHeader, Panel, QuietButton, Segmented, ToolbarButton } from "@/components/dashboard/kit";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SwitchControl } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import {
  MAX_STAMPS_PER_DAY_LIMIT, MIN_EXPIRY_MONTHS, STAMP_GOAL_MAX, STAMP_GOAL_MIN, diffProgram, draftFromProgram, earnModeOf, goalMoves, plainRules, previewModel, programSentence, raisesTheBar, rewardPresets, setEarnMode, validateProgram, validateTiers, weeklyRegularSentence, type ProgramDraft, type TierDraft,
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

/** The stamp card's own reward: the one costing the goal, else the dearest one (a points program: the cheapest). */
function cardRewardOf(rewards: merchantApi.Reward[], program: Pick<merchantApi.LoyaltyProgram, "earnType" | "stampGoal">): merchantApi.Reward | undefined {
  const active = rewards.filter((r) => r.active).sort((a, b) => a.pointsCost - b.pointsCost);
  if (program.earnType !== "stamps") return active[0];
  return active.find((r) => r.pointsCost === program.stampGoal) ?? active.filter((r) => r.pointsCost <= program.stampGoal).at(-1) ?? active.at(-1);
}

const tiersOf = (rewards: merchantApi.Reward[], program: Pick<merchantApi.LoyaltyProgram, "earnType" | "stampGoal">, card: merchantApi.Reward | undefined): TierDraft[] =>
  program.earnType !== "stamps"
    ? []
    : rewards
        .filter((r) => r.active && r.id !== card?.id && r.pointsCost < program.stampGoal)
        .sort((a, b) => a.pointsCost - b.pointsCost)
        .map((r) => ({ id: r.id, pointsCost: r.pointsCost, name: r.name }));

function Editor({ program, onSaved, rewards, setRewards, vip, setVip, categories, setCategories }: {
  program: merchantApi.LoyaltyProgram; onSaved: (p: merchantApi.LoyaltyProgram) => void; rewards: merchantApi.Reward[]; setRewards: (r: merchantApi.Reward[]) => void;
  vip: merchantApi.VipLevel[]; setVip: (l: merchantApi.VipLevel[]) => void; categories: merchantApi.Category[]; setCategories: (c: merchantApi.Category[]) => void;
}) {
  const { api, detail, setDetail, enabled, role, viewingAs } = useMerchant();
  // Only an owner or a manager changes the rules (the API checks too); everyone else sees them read-only.
  const canEdit = role === "owner" || role === "manager" || viewingAs === "admin";
  const vertical = detail.merchant.vertical;
  const birthday = enabled("loyalty.birthday_bonus");
  // A pharmacy can't pay for a referral (O. Reg. 264/16 s. 34 para 2) and earns on front-store dollars only (docs/research/pharmacies-wellness.md).
  const pharmacy = vertical === "pharmacy";
  const referrals = enabled("loyalty.referrals") && !pharmacy;
  const vipOn = enabled("loyalty.vip_levels");
  const tiersOn = enabled("loyalty.rewards_catalog");
  const moreWays = birthday || referrals || vipOn;
  const toast = useToast();
  const params = useSearchParams();
  const earnOpts = useApi(() => api.earnOptions(), [api]);
  const history = useApi(canEdit ? () => api.programHistory() : null, [api, canEdit]);
  const original = useMemo(() => draftFromProgram(program), [program]);
  const primary = useMemo(() => cardRewardOf(rewards, program), [rewards, program]);
  const originalTiers = useMemo(() => tiersOf(rewards, program, primary), [rewards, program, primary]);
  const presets = useMemo(() => rewardPresets(vertical), [vertical]);
  const originalReward = useMemo(() => rewardDraftOf(primary, { name: presets[0]?.name ?? "Free reward", rewardType: presets[0]?.rewardType ?? "free_item", value: presets[0]?.value ?? 0 }), [primary, presets]);
  const [draft, setDraft] = useState<ProgramDraft>(original);
  const [rewardDraft, setRewardDraft] = useState<RewardDraft>(originalReward);
  const [tiers, setTiers] = useState<TierDraft[]>(originalTiers);
  const [custom, setCustom] = useState(false);
  const [debounced, setDebounced] = useState(draft);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { impact: merchantApi.ProgramImpact | null }>(null);
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
  const stampCard = draft.earnType === "stamps";
  const tierError = stampCard ? validateTiers(tiers, draft.stampGoal) : null;
  const patch = diffProgram(original, draft);
  const rewardChanged = rewardDraft.name !== originalReward.name || rewardDraft.rewardType !== originalReward.rewardType || rewardDraft.value !== originalReward.value;
  const tiersChanged = JSON.stringify(tiers) !== JSON.stringify(originalTiers);
  // A stamp card's reward costs exactly the stamp goal; keep them in step when the goal moves.
  const costMismatch = stampCard && !!primary && primary.pointsCost !== draft.stampGoal;
  const dirty = Object.keys(patch).length > 0 || rewardChanged || costMismatch || tiersChanged;
  const tierRewards = stampCard ? tiers.filter((t) => t.name.trim() && t.pointsCost > 0).map((t) => ({ name: t.name, pointsCost: t.pointsCost, rewardType: "free_item" as const, value: 0, active: true })) : [];
  const previewRewards = [
    ...(primary ? [{ ...primary, ...rewardDraft, pointsCost: stampCard ? draft.stampGoal : primary.pointsCost }] : [{ ...rewardDraft, pointsCost: stampCard ? draft.stampGoal : 100, active: true }]),
    ...(stampCard ? tierRewards : rewards.filter((r) => r.id !== primary?.id)),
  ];
  const model = previewModel(debounced, previewRewards);
  const rules = plainRules(debounced, rewardDraft.name.trim() ? rewardDraft : null, stampCard ? tiers : [], selectedNames(debounced, earnOpts.data));
  const set = <K extends keyof ProgramDraft>(k: K, v: ProgramDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const term = draft.terminology;
  const one = term.replace(/s$/, "");
  const mode = earnModeOf(draft);
  const stampsMode = draft.earnType !== "per_dollar";

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      // 1. The rules. The API moves the card reward's cost with the goal and carries stamps over on a raised goal.
      const p = Object.keys(patch).length ? await api.updateProgram(patch) : program;
      // 2. The card's own reward (fresh list: the goal move may have changed costs).
      let list = Object.keys(patch).length ? (await api.rewards()).items : rewards;
      const card = cardRewardOf(list, p);
      const needCost = p.earnType === "stamps" && card && card.pointsCost !== p.stampGoal;
      if (card && (rewardChanged || needCost)) {
        const r = await api.updateReward(card.id, { ...(rewardChanged ? rewardDraft : {}), ...(needCost ? { pointsCost: p.stampGoal } : {}) });
        list = list.map((x) => (x.id === r.id ? r : x));
      } else if (!card && rewardDraft.name.trim()) {
        const r = await api.createReward({ name: rewardDraft.name.trim(), rewardType: rewardDraft.rewardType, value: rewardDraft.value, pointsCost: p.earnType === "stamps" ? p.stampGoal : 100, active: true });
        list = [...list, r];
      }
      // 3. Rewards on the way (tiers): add, change, remove.
      if (tiersChanged && p.earnType === "stamps") {
        const keep = new Set(tiers.map((t) => t.id).filter(Boolean));
        for (const old of originalTiers) if (old.id && !keep.has(old.id)) {
          await api.deleteReward(old.id);
          list = list.filter((x) => x.id !== old.id);
        }
        for (const t of tiers) {
          const was = originalTiers.find((o) => o.id === t.id);
          if (t.id && was && (was.name !== t.name || was.pointsCost !== t.pointsCost)) {
            const r = await api.updateReward(t.id, { name: t.name.trim(), pointsCost: t.pointsCost });
            list = list.map((x) => (x.id === r.id ? r : x));
          } else if (!t.id) {
            const r = await api.createReward({ name: t.name.trim(), rewardType: "free_item", value: 0, pointsCost: t.pointsCost, active: true });
            list = [...list, r];
          }
        }
      }
      setRewards(list);
      onSaved(p);
      setDraft(draftFromProgram(p));
      const nextCard = cardRewardOf(list, p);
      setTiers(tiersOf(list, p, nextCard));
      setTried(false);
      setDetail({ ...detail, program: p });
      void history.reload();
      toast({ message: "Rewards saved. Customer cards update in a minute.", tone: "success" });
    } catch (e) {
      setSaveError(errorMessage(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }

  async function trySave() {
    setTried(true);
    if (Object.keys(errors).length || !rewardDraft.name.trim() || tierError) {
      setSaveError("Fix the highlighted fields first.");
      return;
    }
    if (goalMoves(original, draft)) {
      setConfirm({ impact: null });
      try {
        setConfirm({ impact: await api.programImpact(patch) });
      } catch (e) {
        setConfirm(null);
        setSaveError(errorMessage(e));
      }
      return;
    }
    if (raisesTheBar(original, draft)) setConfirm({ impact: null });
    else void save().catch(() => undefined);
  }

  const modeOptions: UnitOption[] = [
    ...(!pharmacy && (enabled("loyalty.visits") || enabled("loyalty.stamps"))
      ? [
          { value: "visit" as const, title: "One visit", hint: `Every check-in or purchase gets a ${one}.` },
          { value: "purchase" as const, title: "One purchase", hint: "Only a sale counts. You can set a minimum." },
          ...(enabled("orders.order_ahead") || mode === "pickup" ? [{ value: "pickup" as const, title: "One pickup", hint: `An online order gets a ${one} when it's marked picked up.` }] : []),
        ]
      : []),
    { value: "dollar", title: pharmacy ? "Points per dollar of front-store sales" : "Points per dollar", hint: "The more they spend, the more they earn." },
  ];
  const unit = term === "points" ? "pts" : term;
  const rewardNoun = rewardDraft.name || "a reward";
  const plain = (
    <div className="mb-4 rounded-card bg-card p-4 shadow-card" aria-live="polite">
      <p className="mb-2 text-[13px] font-semibold text-fg-muted">In plain words</p>
      <ul className="flex flex-col gap-1">
        {rules.map((l) => (
          <li key={l} className="text-[14px] text-fg">{l}</li>
        ))}
      </ul>
    </div>
  );
  const preview = <ProgramPreview model={model} shop={detail.merchant} defaultView="pass" />;
  const impact = confirm?.impact;
  const people = impact ? impact.membersWithProgress : null;

  return (
    <div className="pb-16">
      <PageHeader
        title="Rewards"
        description={stampCard ? "Your stamp card. The preview shows exactly what customers see." : "How customers earn points and what they cost. The preview shows exactly what customers see."}
        actions={
          <>
            <ToolbarButton icon={Eye} onClick={() => setPreviewOpen(true)} className="lg:hidden">Preview</ToolbarButton>
            {canEdit && dirty ? <QuietButton onClick={() => { setDraft(original); setRewardDraft(originalReward); setTiers(originalTiers); setSaveError(null); }}>Discard</QuietButton> : null}
            {canEdit ? <Button size="md" loading={saving} disabled={!dirty} onClick={() => void trySave()} className="h-[38px] rounded-full px-4 text-[14px] font-medium">Save changes</Button> : null}
          </>
        }
      />
      {!canEdit ? (
        <div className="mb-4">
          <Banner tone="neutral" title="View only">Only the owner or a manager can change the rewards. Ask them if something should change.</Banner>
        </div>
      ) : null}
      {saveError ? <div className="mb-4"><ErrorLine message={saveError} /></div> : null}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={!canEdit} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <section className="rounded-card bg-card shadow-card p-6" aria-label="Set up your card">
            <Step n={1} title={stampCard ? "What one stamp is worth" : "What earns points"}>
              <div id="earn" className="flex flex-col gap-4">
                <EarnUnitPicker options={modeOptions} value={mode} onChange={(v) => setDraft((d) => setEarnMode(d, v))} disabled={!canEdit} />
                {mode === "purchase" ? (
                  <TextField label="Minimum purchase (optional)" inputMode="decimal" prefix="$" hint="Leave it empty and any purchase counts. Set it to your cheapest item to stop tiny purchases from earning." value={draft.minSpendCents ? (draft.minSpendCents / 100).toFixed(2) : ""} onChange={(e) => set("minSpendCents", Math.max(0, Math.round((Number.parseFloat(e.target.value) || 0) * 100)))} error={shown.minSpendCents} className="sm:max-w-60" />
                ) : null}
                {mode === "pickup" ? <p className="text-[14px] text-fg-muted">Each order gets its {one} once, automatically, when your team marks it picked up. A {one} at the counter needs a reason from staff.</p> : null}
                {mode === "dollar" ? (
                  <TextField label="Points per $1" inputMode="numeric" suffix="pts" value={String(draft.pointsPerDollar)} onChange={(e) => set("pointsPerDollar", intOr(e.target.value))} error={shown.pointsPerDollar} className="sm:max-w-60" />
                ) : null}
              </div>
            </Step>

            <Step n={2} title={`What earns ${term}`}>
              <div id="what-earns">
                <EarnScopePicker draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} options={earnOpts.data} error={shown.earnScope} disabled={!canEdit} term={term} />
              </div>
            </Step>

            <Step n={3} title={stampCard ? "The prize" : "Points to earn a reward"} last>
              {stampCard ? (
                <div className="flex flex-col gap-2">
                  <p className="text-[15px] font-medium text-fg">Stamps to earn the reward</p>
                  <GoalStepper value={draft.stampGoal} min={STAMP_GOAL_MIN} max={STAMP_GOAL_MAX} onChange={(n) => set("stampGoal", n)} error={shown.stampGoal ?? errors.stampGoal} disabled={!canEdit} />
                  {errors.stampGoal ? <p className="text-meta font-medium text-negative">{errors.stampGoal}</p> : <p className="text-[14px] text-fg-muted">{weeklyRegularSentence(draft.stampGoal, draft.pointsPerVisit)}</p>}
                </div>
              ) : (
                <p className="text-[14px] text-fg-muted">Set the cost of each reward below, in points. {programSentence(draft, primary)}</p>
              )}
              <TextField id="reward-name" label={stampCard ? `The reward after ${draft.stampGoal} ${term}` : "Reward name"} value={rewardDraft.name} onChange={(e) => setRewardDraft((r) => ({ ...r, name: e.target.value }))} error={tried && !rewardDraft.name.trim() ? "Name the reward." : undefined} maxLength={120} />
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
                      className={cn("h-11 rounded-full border px-4 text-[13px] font-medium transition-colors focus-visible:focus-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-bg text-fg hover:bg-bg-subtle")}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {stampCard ? (
                <div id="tiers" className="flex flex-col gap-2 border-t border-line pt-4">
                  <p className="text-[15px] font-medium text-fg">Rewards on the way (optional)</p>
                  <TiersEditor tiers={tiers} goal={draft.stampGoal} onChange={setTiers} error={tried || tiers.some((t) => t.name) ? tierError : null} disabled={!canEdit} locked={!tiersOn} />
                </div>
              ) : null}
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
            {stampsMode && mode !== "pickup" ? (
              <SettingRow title={`Add a ${one} on scan`} hint={`A scan, or four digits that match one customer, adds a ${one} straight away. Undo stays for 10 seconds.`}>
                <SwitchControl ariaLabel={`Add a ${one} on scan`} checked={draft.counterAutoStamp && stampsMode} disabled={!stampsMode || !canEdit} onChange={(v) => set("counterAutoStamp", v)} />
              </SettingRow>
            ) : null}
            <SettingRow title="Block repeat scans" hint={`No second ${one} within ${draft.visitCooldownMinutes} minutes of the last one. Stops a double scan from counting twice.`}>
              <TextField label="Minutes between awards" hideLabel inputMode="numeric" suffix="min" value={String(draft.visitCooldownMinutes)} onChange={(e) => set("visitCooldownMinutes", intOr(e.target.value))} error={shown.visitCooldownMinutes} className="w-28 text-end" />
            </SettingRow>
            {stampsMode ? (
              <SettingRow title={`Limit ${term} per day`} hint={draft.maxStampsPerDay ? `A customer gets at most ${draft.maxStampsPerDay} ${draft.maxStampsPerDay === 1 ? one : term} a day, promos included.` : `No daily limit. Turn it on to stop one customer collecting a whole card in a day.`}>
                <div className="flex items-center gap-3">
                  {draft.maxStampsPerDay !== null ? (
                    <TextField label={`Most ${term} per day`} hideLabel inputMode="numeric" suffix="a day" value={String(draft.maxStampsPerDay || "")} onChange={(e) => set("maxStampsPerDay", intOr(e.target.value))} error={shown.maxStampsPerDay} className="w-32 text-end" />
                  ) : null}
                  <SwitchControl ariaLabel={`Limit ${term} per day`} checked={draft.maxStampsPerDay !== null} disabled={!canEdit} onChange={(v) => set("maxStampsPerDay", v ? Math.min(MAX_STAMPS_PER_DAY_LIMIT, 2 * Math.max(1, draft.pointsPerVisit)) : null)} />
                </div>
              </SettingRow>
            ) : null}
            <SettingRow title={`${term.charAt(0).toUpperCase() + term.slice(1)} never expire`} hint={`Recommended. Customers don't like losing ${term} without warning.`}>
              <SwitchControl ariaLabel={`${term} never expire`} checked={draft.expiryMonths === null} disabled={!canEdit} onChange={(v) => set("expiryMonths", v ? null : 12)} />
            </SettingRow>
            {draft.expiryMonths !== null ? (
              <div className="border-t border-line py-3" id="expiry">
                <TextField label="Months without a visit before they expire" inputMode="numeric" min={MIN_EXPIRY_MONTHS} suffix="months" value={String(draft.expiryMonths)} onChange={(e) => set("expiryMonths", intOr(e.target.value, MIN_EXPIRY_MONTHS))} error={shown.expiryMonths ?? (draft.expiryMonths < MIN_EXPIRY_MONTHS ? `At least ${MIN_EXPIRY_MONTHS} months.` : null)} hint={`At least ${MIN_EXPIRY_MONTHS} months. Customers see this next to their balance: "${model.expiry}"`} className="sm:max-w-60" />
              </div>
            ) : null}
            <SettingRow title={`Welcome ${one}`} hint="Given when a customer joins from your counter QR code">
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

          {canEdit ? (
            <Panel title="Change history" description="Every change to your rules and rewards, who made it, and what it was before.">
              <div id="history">
                <ChangeHistory items={history.data?.items ?? null} loading={history.loading} />
              </div>
            </Panel>
          ) : null}
        </fieldset>

        <aside className="hidden lg:block" aria-label="Live preview">
          <div className="sticky top-20">
            <p className="mb-3 text-[13px] text-fg-muted">Live preview</p>
            {plain}
            {preview}
          </div>
        </aside>
      </div>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Customer preview" variant="sheet">
        {plain}
        {preview}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={goalMoves(original, draft) ? `Change the card to ${draft.stampGoal} stamps?` : "Customers will need more to reach a reward"}
        body={
          goalMoves(original, draft) ? (
            impact ? (
              <span className="flex flex-col gap-2">
                <span className="font-medium text-fg">{people === 0 ? "No customer has stamps yet." : `This affects ${people!.toLocaleString("en-CA")} ${people === 1 ? "customer" : "customers"} with stamps.`}</span>
                {impact.lines.map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </span>
            ) : (
              "Counting the customers this affects…"
            )
          ) : (
            "Customers close to a reward will need more visits or points than before. Their current balance doesn't change."
          )
        }
        confirmLabel="Save changes"
        disabled={goalMoves(original, draft) && !impact}
        onConfirm={save}
      />
    </div>
  );
}
