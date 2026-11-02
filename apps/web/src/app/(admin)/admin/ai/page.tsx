"use client";
/**
 * /admin/ai (wave N, promo team): the platform's Claude key and the AI limits. The key is pasted once, checked with a cheap call,
 * stored encrypted (AES-256-GCM under APP_ENCRYPTION_KEY) and only ever shown masked. Every change is in the audit log.
 * Also: the model (from the configured list), the global monthly spend cap, per-shop quotas, the Free taste, and usage by shop.
 * Wave Q (kit): the key state is a status pill, spend against the cap and each shop's drafts against its quota are meters (Base UI Meter,
 * warning from 80%), the month's numbers roll in, and the usage table has a real empty state.
 */
import { useState } from "react";
import type { promosApi } from "@ll/shared";
import { Bot, KeyRound } from "lucide-react";
import { PageHeader, Panel } from "@/components/dashboard/kit";
import { HealthPill, KpiGrid, PanelEmpty, UsageMeter, moneyNum } from "@/components/dashboard/admin/AdminKit";
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
      <ListAsync state={s} errorTitle="Couldn't load the AI settings.">
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

  const quotaOf = (plan: string) => (plan === "free" ? d.freeGenerationsPerMonth : d.shopGenerationsPerMonth);
  const capPct = d.monthlySpendCapCents ? Math.round((d.month.spendCents / d.monthlySpendCapCents) * 100) : 0;
  const cols: Column<promosApi.AiAdminSettings["topShops"][number]>[] = [
    { key: "name", header: "Shop", mobile: "title", sortValue: (r) => r.name, cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "plan", header: "Plan", mobile: "subtitle", cell: (r) => PLAN_NAME[r.plan] ?? r.plan },
    {
      key: "gens",
      header: "Drafts of quota",
      mobile: "hidden",
      sortValue: (r) => r.generations,
      cell: (r) => {
        const q = quotaOf(r.plan);
        return q > 0 ? (
          <span className="flex w-44 flex-col gap-1">
            <UsageMeter size="sm" label={`${r.name}: promo drafts this month`} value={r.generations} max={q} valueText={`${formatNumber(r.generations)} of ${formatNumber(q)}`} />
          </span>
        ) : (
          <span className="text-fg-muted">{formatNumber(r.generations)} · no quota</span>
        );
      },
    },
    { key: "tokens", header: "Tokens", align: "end", mobile: "hidden", sortValue: (r) => r.tokens, cell: (r) => formatNumber(r.tokens) },
    { key: "spend", header: "Spend", align: "end", mobile: "trailing", sortValue: (r) => r.spendCents, cell: (r) => formatMoney(r.spendCents) },
  ];

  return (
    <>
      <Panel
        title="Claude API key"
        description="Every AI feature uses this one key. It is checked with a quick call, stored encrypted and never shown again."
        action={
          <HealthPill tone={d.key.source === "admin" ? "ok" : d.key.source === "env" ? "info" : "neutral"} live={d.key.source === "admin"}>
            {d.key.source === "admin" ? "Connected" : d.key.source === "env" ? "Server key" : "Not connected"}
          </HealthPill>
        }
      >
        <div className="flex flex-col gap-4" data-testid="ai-key">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body text-fg">
            <KeyRound aria-hidden className="size-4 shrink-0 text-fg-muted" />
            {d.key.source === "admin" ? (
              <>
                In use: <span className="rounded-r2 bg-muted px-1.5 py-0.5 font-mono text-meta">{d.key.masked}</span>
                {d.key.setAt ? <span className="text-fg-muted"> · saved {new Date(d.key.setAt).toLocaleDateString("en-CA")}</span> : null}
              </>
            ) : d.key.source === "env" ? (
              "Using the key set on the server (ANTHROPIC_API_KEY). Save a key here to replace it."
            ) : (
              "No key yet. AI features are off until you add one."
            )}
          </p>
          {d.key.source !== "admin" ? (
            <ol className="flex list-decimal flex-col gap-1 ps-5 text-meta text-fg-muted">
              <li>
                Open the{" "}
                <a className="text-fg underline underline-offset-2" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  Claude Console
                </a>{" "}
                and choose Create key.
              </li>
              <li>Copy the key. It starts with sk-ant-.</li>
              <li>Paste it below and press Check and save.</li>
            </ol>
          ) : null}
          {d.fake ? <Banner tone="info">Test mode: PROMO_AI_FAKE is on, so drafts come from a stand-in and no real calls are made.</Banner> : null}
          {!d.canStore ? <Banner tone="warning">Set APP_ENCRYPTION_KEY on the server before saving a key. Keys are never stored without encryption.</Banner> : null}
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("save", () => browserApi.admin.ai.setKey(key.trim()), d.key.source === "admin" ? "Key rotated." : "Key saved.")) setKey("");
            }}
          >
            <TextField label={d.key.source === "admin" ? "New key (rotate)" : "API key"} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" className="sm:min-w-[360px] sm:flex-1" disabled={!d.canStore} />
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

      <Panel
        title="This month"
        description={d.monthlySpendCapCents ? `AI pauses for every shop when spend reaches the cap, until the 1st.` : "No spend cap is set: AI never pauses for cost."}
        action={d.monthlySpendCapCents ? <HealthPill tone={capPct >= 100 ? "down" : capPct >= 80 ? "warn" : "ok"}>{capPct >= 100 ? "Paused: cap reached" : `${capPct}% of the cap`}</HealthPill> : null}
      >
        <div className="flex flex-col gap-5">
          {d.monthlySpendCapCents ? (
            <UsageMeter
              label="Spent against the monthly cap"
              value={d.month.spendCents}
              max={d.monthlySpendCapCents}
              valueText={`${formatMoney(d.month.spendCents)} of ${formatMoney(d.monthlySpendCapCents)}`}
              caption={capPct >= 80 && capPct < 100 ? "Close to the cap. Raise it below, or AI pauses for every shop when it is reached." : undefined}
            />
          ) : null}
          <KpiGrid
            label="This month"
            size="sm"
            items={[
              { label: "Spent this month", value: formatMoney(d.month.spendCents), ...moneyNum(d.month.spendCents), caption: d.monthlySpendCapCents ? `of a ${formatMoney(d.monthlySpendCapCents)} cap · ${capPct}% used` : "No cap", alert: d.monthlySpendCapCents && d.month.spendCents >= d.monthlySpendCapCents * 0.8 ? "warning" : undefined },
              { label: "Calls", value: formatNumber(d.month.calls), num: d.month.calls },
              { label: "Tokens in", value: formatNumber(d.month.inputTokens), num: d.month.inputTokens },
              { label: "Tokens out", value: formatNumber(d.month.outputTokens), num: d.month.outputTokens },
            ]}
          />
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
        <DataTable caption="AI usage by shop" columns={cols} rows={d.topShops} rowKey={(r) => r.merchantId} empty={<PanelEmpty icon={Bot} title="No AI use yet this month" description={d.key.source === "none" ? "Add the Claude key above to turn on the promo writer, website copy and the sales agent." : "Shops show here once they draft a promo or website copy."} />} />
      </Panel>
    </>
  );
}
