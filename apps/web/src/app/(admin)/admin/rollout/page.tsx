"use client";
import { CircleCheck, CircleDashed, Lock, Users } from "lucide-react";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { NetworkGauges } from "@/components/dashboard/NetworkGauges";
import { Async } from "@/components/dashboard/PageStates";
import { OverridesSheet } from "@/components/dashboard/admin/OverridesSheet";
import { StageDialog } from "@/components/dashboard/admin/StageDialog";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader, Section } from "@/components/ui/Layout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatNumber } from "@/lib/format";
import { groupFeatures, stageLocked, type Stage } from "@/lib/dashboard/rollout";
import { useApi } from "@/lib/dashboard/useApi";

export default function RolloutPage() {
  const toast = useToast();
  const features = useApi(() => browserApi.admin.features(), []);
  const plans = useApi(() => browserApi.admin.plans(), []);
  const dash = useApi(() => browserApi.admin.dashboard(), []);
  const [change, setChange] = useState<{ f: adminApi.AdminFeature; to: Stage } | null>(null);
  const [overrides, setOverrides] = useState<adminApi.AdminFeature | null>(null);
  const active = features.data?.items[0]?.activeMerchants ?? dash.data?.merchants.byStatus.active ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rollout control" description="Decide when paid features switch on. Free-forever features are locked to Live." />
      <NetworkGauges activeMerchants={active} multiShopPct={dash.data?.multiShopPct ?? null} />
      <Async state={features}>
        {(d) => (
          <>
            {groupFeatures(d.items).map((g) => (
              <Section key={g.id} title={g.title}>
                <Card padding="none" className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-meta">
                    <caption className="sr-only">{g.title}</caption>
                    <thead className="bg-bg-subtle text-label text-fg-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-start">Feature</th>
                        <th scope="col" className="px-4 py-3 text-start">Plan</th>
                        <th scope="col" className="px-4 py-3 text-start">Stage</th>
                        <th scope="col" className="px-4 py-3 text-start">Unlock target</th>
                        <th scope="col" className="px-4 py-3 text-end">Asked for it</th>
                        <th scope="col" className="px-4 py-3 text-start">Overrides</th>
                        <th scope="col" className="px-4 py-3 text-start">Last changed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((f) => (
                        <tr key={f.key} className="border-t border-line" data-feature={f.key}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-fg">{f.name}</p>
                            <p className="font-mono text-caption text-fg-muted">{f.key}</p>
                          </td>
                          <td className="px-4 py-3">{f.freeForever ? <Badge tone="success">Free forever</Badge> : <Badge tone="brand">{f.minPlan === "free" ? "Network" : f.minPlan[0]!.toUpperCase() + f.minPlan.slice(1)}</Badge>}</td>
                          <td className="px-4 py-3">
                            {stageLocked(f) ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Lock aria-hidden className="size-4 text-fg-muted" />
                                <StatusBadge domain="rollout" status="ga" />
                              </span>
                            ) : (
                              <SegmentedControl label={`Stage for ${f.name}`} value={f.stage} onChange={(to) => to !== f.stage && setChange({ f, to })} options={[{ value: "hidden", label: "Hidden" }, { value: "beta", label: "Beta" }, { value: "ga", label: "GA" }]} />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {f.unlockAtMerchants ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                {f.readyToUnlock ? <CircleCheck aria-hidden className="size-4 text-positive" /> : <CircleDashed aria-hidden className="size-4 text-fg-muted" />}
                                {formatNumber(f.unlockAtMerchants)} merchants <span className="text-fg-muted">({f.readyToUnlock ? "met" : `${formatNumber(f.activeMerchants)} now`})</span>
                              </span>
                            ) : (
                              <span className="text-fg-muted">–</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end tabular-nums">{f.freeForever ? "–" : formatNumber(f.interestCount ?? 0)}</td>
                          <td className="px-4 py-3">
                            {f.freeForever ? <span className="text-fg-muted">–</span> : <Button variant="ghost" size="sm" iconStart={Users} onClick={() => setOverrides(f)}>
                              {f.overrides.enabled + f.overrides.disabled ? `${f.overrides.enabled} on${f.overrides.disabled ? ` · ${f.overrides.disabled} off` : ""}` : "Add"}
                            </Button>}
                          </td>
                          <td className="px-4 py-3 text-fg-muted">{f.updatedAt ? `${f.updatedByName ?? "Admin"}, ${formatDate(f.updatedAt)}` : "Default"}{f.note ? <span className="block text-caption">{f.note}</span> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Section>
            ))}
          </>
        )}
      </Async>
      <Section title="Plans">
        <div className="grid gap-3 md:grid-cols-3">
          {(plans.data?.items ?? []).map((p) => (
            <Card key={p.id} padding="lg">
              <CardHeader title={p.name} action={<Badge tone={p.available ? "success" : "neutral"}>{p.available ? "Purchasable" : "Not yet"}</Badge>} />
              <p className="text-meta text-fg-muted">{p.id === "free" ? "Free forever, always available" : `${p.features.filter((x) => x.stage !== "hidden").length} of ${p.features.length} features out of Hidden`}</p>
            </Card>
          ))}
        </div>
      </Section>
      <StageDialog feature={change?.f ?? null} to={change?.to ?? null} onClose={() => setChange(null)} onConfirm={async (stage, note) => {
        const r = await browserApi.admin.setStage(change!.f.key, { stage, note: note || undefined });
        features.setData((d) => (d ? { items: d.items.map((x) => (x.key === r.key ? r : x)) } : d));
        await plans.reload();
        toast({ message: `${r.name} is now ${stage === "ga" ? "Live" : stage === "beta" ? "in Beta" : "Hidden"}`, tone: "success" });
      }} />
      <OverridesSheet feature={overrides} onClose={() => setOverrides(null)} onChanged={() => void features.reload()} />
    </div>
  );
}
