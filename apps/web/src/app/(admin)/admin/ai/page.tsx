"use client";
/**
 * /admin/ai (wave N, promo team): the platform's Claude key and the AI limits. The key is pasted once, checked with a cheap call,
 * stored encrypted (AES-256-GCM under APP_ENCRYPTION_KEY) and only ever shown masked. Every change is in the audit log.
 * Also: the model (from the configured list), the global monthly spend cap, per-shop quotas, the Free taste, and usage by shop.
 */
import { useState } from "react";
import type { promosApi } from "@ll/shared";
import { PageHeader, Panel, StatBlock } from "@/components/dashboard/kit";
import { ListAsync } from "@/components/dashboard/ListStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney, formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";

const PLAN_NAME: Record<string, string> = { free: "Free", plus: "Pro", studio: "Studio", pro: "Service", trial: "Trial" };

export default function AdminAiPage() {
  const s = useApi(() => browserApi.admin.ai.settings(), []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="AI" description="The Claude key every AI feature uses (promo writer, website copy, sales agent), the limits, and who is using it." />
      <ListAsync state={s} errorTitle="We could not load the AI settings.">
        {(d) => <Body d={d} onChange={(n) => s.setData(n)} />}
      </ListAsync>
    </div>
  );
}

function Body({ d, onChange }: { d: promosApi.AiAdminSettings; onChange: (n: promosApi.AiAdminSettings) => void }) {
  const toast = useToast();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limits, setLimits] = useState({
    model: d.model,
    cap: String(d.monthlySpendCapCents / 100),
    gens: String(d.shopGenerationsPerMonth),
    tokens: String(d.shopTokensPerMonth),
    free: String(d.freeGenerationsPerMonth),
  });

  async function run(name: string, fn: () => Promise<promosApi.AiAdminSettings>, ok: string) {
    setBusy(name);
    setError(null);
    try {
      onChange(await fn());
      toast({ message: ok, tone: "success" });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const cols: Column<promosApi.AiAdminSettings["topShops"][number]>[] = [
    { key: "name", header: "Shop", mobile: "title", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "plan", header: "Plan", mobile: "subtitle", cell: (r) => PLAN_NAME[r.plan] ?? r.plan },
    { key: "gens", header: "Promo drafts", align: "end", mobile: "hidden", sortValue: (r) => r.generations, cell: (r) => formatNumber(r.generations) },
    { key: "tokens", header: "Tokens", align: "end", mobile: "hidden", sortValue: (r) => r.tokens, cell: (r) => formatNumber(r.tokens) },
    { key: "spend", header: "Spend", align: "end", mobile: "trailing", sortValue: (r) => r.spendCents, cell: (r) => formatMoney(r.spendCents) },
  ];

  return (
    <>
      <StatBlock
        label="This month"
        items={[
          { label: "Spend", value: formatMoney(d.month.spendCents), caption: `of a ${formatMoney(d.monthlySpendCapCents)} cap` },
          { label: "Calls", value: formatNumber(d.month.calls) },
          { label: "Tokens in", value: formatNumber(d.month.inputTokens) },
          { label: "Tokens out", value: formatNumber(d.month.outputTokens) },
        ]}
      />

      <Panel title="Claude API key" description="Paste a key from the Claude Console. We check it with a quick call, store it encrypted and never show it again.">
        <div className="flex flex-col gap-4" data-testid="ai-key">
          <p className="text-body text-fg">
            {d.key.source === "admin" ? (
              <>
                In use: <span className="font-mono">{d.key.masked}</span>
                {d.key.setAt ? <span className="text-fg-muted"> · saved {new Date(d.key.setAt).toLocaleDateString("en-CA")}</span> : null}
              </>
            ) : d.key.source === "env" ? (
              "In use: the server's ANTHROPIC_API_KEY. Save a key here to replace it."
            ) : (
              "No key yet. AI features are off until you add one."
            )}
          </p>
          {d.fake ? <Banner tone="info">Test mode: PROMO_AI_FAKE is on, so drafts come from a stand-in and no real calls are made.</Banner> : null}
          {!d.canStore ? <Banner tone="warning">Set APP_ENCRYPTION_KEY on the server before saving a key. Keys are never stored without encryption.</Banner> : null}
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("save", () => browserApi.admin.ai.setKey(key.trim()), d.key.source === "admin" ? "Key rotated." : "Key saved.")) setKey("");
            }}
          >
            <TextField label={d.key.source === "admin" ? "New key (rotate)" : "API key"} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" className="sm:min-w-[360px]" disabled={!d.canStore} />
            <Button type="submit" loading={busy === "save"} disabled={!d.canStore || key.trim().length < 20}>
              {d.key.source === "admin" ? "Check and rotate" : "Check and save"}
            </Button>
            {d.key.source === "admin" ? (
              <Button type="button" variant="secondary" loading={busy === "delete"} onClick={() => void run("delete", () => browserApi.admin.ai.deleteKey(), "Key deleted.")}>
                Delete key
              </Button>
            ) : null}
          </form>
          {error ? <p role="alert" className="text-meta text-negative">{error}</p> : null}
        </div>
      </Panel>

      <Panel title="Limits" description="Shops on Pro, Studio and the trial get the monthly quota; Free shops get the small taste. When the global cap is reached, AI pauses for everyone until the 1st.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              "limits",
              () =>
                browserApi.admin.ai.update({
                  model: limits.model,
                  monthlySpendCapCents: Math.round(Number.parseFloat(limits.cap || "0") * 100),
                  shopGenerationsPerMonth: Number.parseInt(limits.gens || "0", 10),
                  shopTokensPerMonth: Number.parseInt(limits.tokens || "0", 10),
                  freeGenerationsPerMonth: Number.parseInt(limits.free || "0", 10),
                }),
              "Limits saved.",
            );
          }}
        >
          <Select label="Model" value={limits.model} onChange={(e) => setLimits({ ...limits, model: e.target.value })} options={d.models.map((m) => ({ value: m, label: m }))} />
          <TextField label="Monthly spend cap (all shops)" inputMode="decimal" prefix="$" value={limits.cap} onChange={(e) => setLimits({ ...limits, cap: e.target.value.replace(/[^\d.]/g, "") })} />
          <TextField label="Promo drafts per shop per month" inputMode="numeric" value={limits.gens} onChange={(e) => setLimits({ ...limits, gens: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Tokens per shop per month" inputMode="numeric" value={limits.tokens} onChange={(e) => setLimits({ ...limits, tokens: e.target.value.replace(/\D/g, "") })} />
          <TextField label="Free plan: drafts per month" hint="0 turns it off on Free." inputMode="numeric" value={limits.free} onChange={(e) => setLimits({ ...limits, free: e.target.value.replace(/\D/g, "") })} />
          <div className="flex items-end">
            <Button type="submit" loading={busy === "limits"}>
              Save limits
            </Button>
          </div>
          <p className="text-meta text-fg-muted sm:col-span-2">Open to: {d.plans.map((p) => PLAN_NAME[p] ?? p).join(", ")} (set by PROMO_AI_PLANS on the server).</p>
        </form>
      </Panel>

      <Panel padded={false} title="Top shops this month" description="Each shop's AI calls only ever use that shop's own details.">
        <DataTable caption="AI usage by shop" columns={cols} rows={d.topShops} rowKey={(r) => r.merchantId} empty="No AI use yet this month." />
      </Panel>
    </>
  );
}
