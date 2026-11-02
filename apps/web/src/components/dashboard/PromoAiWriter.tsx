"use client";
/**
 * "Write it for me" on the new-promo screen (wave N). The owner picks a goal (and an optional hint); Claude drafts the title,
 * text, offer, schedule, audience and notification line in the shop's voice from this shop's own facts. The draft only fills
 * the editor: the owner can regenerate or change anything, and nothing goes out until they press Publish.
 */
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { promosApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip, ChipGroup } from "@/components/ui/Chip";
import { TextField } from "@/components/ui/TextField";
import { errorMessage } from "@/lib/api/errors";
import { GOAL_LABEL, draftFromAi, type PromoDraft } from "@/lib/dashboard/promos";

const HINT: Partial<Record<promosApi.PromoAiGoal, string>> = {
  new_service: "Which service? For example gel extensions",
  holiday: "Which one? For example Diwali",
  door_crasher: "What's the offer? For example free upsize",
};

export function PromoAiWriter({ onDraft }: { onDraft: (apply: (cur: PromoDraft) => PromoDraft, note: string) => void }) {
  const { api, base } = useMerchant();
  const [goal, setGoal] = useState<promosApi.PromoAiGoal>("fill_quiet_day");
  const [hint, setHint] = useState("");
  const [usage, setUsage] = useState<promosApi.PromoAiUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState(false);

  useEffect(() => {
    api.promoAiUsage().then(setUsage).catch(() => setUsage(null));
  }, [api]);

  async function write() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.promoAi({ goal, hint: hint.trim() || undefined });
      setUsage(r.usage);
      setMade(true);
      onDraft((cur) => draftFromAi(cur, r.draft, r.generationId), "Drafted for you from your shop's details. Check every field, change anything, then publish. Nothing is sent until you do.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (usage && !usage.allowed) {
    return (
      <Panel>
        <p className="flex items-center gap-2 text-body-strong text-fg">
          <Sparkles aria-hidden className="size-4" /> Write it for me
        </p>
        <p className="mt-1 text-meta text-fg-muted">Claude can draft a promo in your shop’s voice. It’s part of Pro and Studio.</p>
        <Button variant="secondary" size="sm" className="mt-3" href={`${base}/billing`}>
          See plans
        </Button>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex flex-col gap-3" data-testid="promo-ai">
        <div>
          <p className="flex items-center gap-2 text-body-strong text-fg">
            <Sparkles aria-hidden className="size-4" /> Write it for me
          </p>
          <p className="mt-1 text-meta text-fg-muted">Pick a goal. Claude drafts the whole promo from your shop’s details: offer, dates, who it’s for and the notification.</p>
        </div>
        <ChipGroup label="Goal" className="flex-wrap overflow-visible">
          {promosApi.PROMO_AI_GOALS.map((g) => (
            <Chip key={g} selected={goal === g} onClick={() => setGoal(g)}>
              {GOAL_LABEL[g]}
            </Chip>
          ))}
        </ChipGroup>
        {HINT[goal] ? <TextField label="A detail (optional)" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={200} placeholder={HINT[goal]} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button iconStart={Sparkles} loading={busy} onClick={() => void write()} disabled={usage ? !usage.available : false} data-testid="promo-ai-write">
            {made ? "Write another" : "Write it for me"}
          </Button>
          {usage ? (
            <span className="text-meta text-fg-muted">
              {usage.usedThisMonth} of {usage.limitThisMonth} drafts used this month
            </span>
          ) : null}
        </div>
        {usage && !usage.available && usage.reason !== "ok" ? (
          <p className="text-meta text-fg-muted">
            {usage.reason === "shop_quota" || usage.reason === "token_quota" ? "You've used this month's drafts. They reset on the 1st." : "The writing helper isn't available right now. You can still write your promo below."}
          </p>
        ) : null}
        {error ? <Banner tone="danger">{error}</Banner> : null}
      </div>
    </Panel>
  );
}
