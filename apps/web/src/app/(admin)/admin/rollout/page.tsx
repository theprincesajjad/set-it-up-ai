"use client";
import { Dot, PageHeader, Section, Segmented, StatusDot, Table, TableWrap, Td, Th } from "@/components/dashboard/kit";
import { Lock } from "lucide-react";
import { useState } from "react";
import type { adminApi } from "@ll/shared";
import { NetworkGauges } from "@/components/dashboard/NetworkGauges";
import { ListAsync } from "@/components/dashboard/ListStates";
import { OverridesSheet } from "@/components/dashboard/admin/OverridesSheet";
import { StageDialog } from "@/components/dashboard/admin/StageDialog";
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
      <PageHeader flush title="Rollout control" description="Decide when paid features switch on. Free-forever features are locked to Live." />
      <NetworkGauges activeMerchants={active} multiShopPct={dash.data?.multiShopPct ?? null} />
      <ListAsync state={features} errorTitle="We could not load the rollout.">
        {(d) => (
          <>
            {groupFeatures(d.items).map((g) => (
              <Section key={g.id} title={g.title}>
                <TableWrap>
                  <Table label={g.title} className="max-md:block md:min-w-[960px] md:table-fixed">
                    <thead className="max-md:hidden">
                      <tr>
                        <Th className="w-[240px]">Feature</Th>
                        <Th className="w-[110px]">Plan</Th>
                        <Th className="w-[180px]">Stage</Th>
                        <Th className="w-[200px]">Unlock target</Th>
                        <Th align="end" className="w-[100px]">Asked for it</Th>
                        <Th className="w-[100px]">Overrides</Th>
                        <Th className="w-[160px]">Last changed</Th>
                      </tr>
                    </thead>
                    <tbody className="max-md:block">
                      {g.items.map((f) => (
                        <tr key={f.key} className="[&:last-child>td]:border-b-0 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:border-b max-md:border-line max-md:px-4 max-md:py-4 max-md:last:border-b-0" data-feature={f.key}>
                          <Td className="py-2 max-md:col-span-2 max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0">
                            <p className="font-medium text-fg">{f.name}</p>
                            <p className="truncate font-mono text-[11px] text-fg-muted">{f.key}</p>
                          </Td>
                          <Td data-label="Plan" className="text-fg-muted max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)]">{f.freeForever ? "Free forever" : f.minPlan === "free" ? "Network" : f.minPlan[0]!.toUpperCase() + f.minPlan.slice(1)}</Td>
                          <Td data-label="Stage" className="max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)] max-md:col-span-2">
                            {stageLocked(f) ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Lock aria-hidden className="size-3.5 text-fg-subtle" />
                                <StatusDot domain="rollout" status="ga" />
                              </span>
                            ) : (
                              <Segmented label={`Stage for ${f.name}`} value={f.stage} onChange={(to) => to !== f.stage && setChange({ f, to })} options={[{ value: "hidden", label: "Hidden" }, { value: "beta", label: "Beta" }, { value: "ga", label: "GA" }]} />
                            )}
                          </Td>
                          <Td data-label="Unlock target" className="max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)] max-md:col-span-2">
                            {f.unlockAtMerchants ? (
                              <div className="flex items-center gap-3">
                                <div className="h-1 w-20 overflow-hidden rounded-full bg-bg-muted" aria-hidden>
                                  <div className={f.readyToUnlock ? "h-full bg-positive" : "h-full bg-fg"} style={{ width: `${Math.max(2, Math.min(100, (f.activeMerchants / f.unlockAtMerchants) * 100))}%` }} />
                                </div>
                                <span className="tabular text-fg-muted">
                                  <span className="text-fg">{formatNumber(f.activeMerchants)}</span> / {formatNumber(f.unlockAtMerchants)}
                                  {f.readyToUnlock ? <span className="text-positive-text"> · met</span> : null}
                                </span>
                              </div>
                            ) : (
                              <span className="text-fg-subtle">–</span>
                            )}
                          </Td>
                          <Td align="end" data-label="Asked for it" className="max-md:text-start max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)]">{f.freeForever ? <span className="text-fg-subtle">–</span> : formatNumber(f.interestCount ?? 0)}</Td>
                          <Td data-label="Overrides" className="max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)]">
                            {f.freeForever ? (
                              <span className="text-fg-subtle">–</span>
                            ) : (
                              <button type="button" onClick={() => setOverrides(f)} className="rounded-sm text-meta text-fg hover:underline">
                                {f.overrides.enabled + f.overrides.disabled ? `${f.overrides.enabled} on${f.overrides.disabled ? ` · ${f.overrides.disabled} off` : ""}` : "Add"}
                              </button>
                            )}
                          </Td>
                          <Td data-label="Last changed" className="text-fg-muted max-md:h-auto max-md:whitespace-normal max-md:border-0 max-md:p-0 max-md:first:ps-0 max-md:last:pe-0 max-md:before:mb-1 max-md:before:block max-md:before:text-caption max-md:before:text-fg-muted max-md:before:content-[attr(data-label)]">
                            {f.updatedAt ? `${f.updatedByName ?? "Admin"}, ${formatDate(f.updatedAt)}` : "Default"}
                            {f.note ? <span className="block max-w-[200px] truncate text-caption font-normal max-md:max-w-full">{f.note}</span> : null}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </Section>
            ))}
          </>
        )}
      </ListAsync>
      <Section title="Plans">
        <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-3">
          {(plans.data?.items ?? []).map((p) => (
            <div key={p.id} className="bg-bg px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-meta-strong text-fg">{p.name}</h3>
                <Dot tone={p.available ? "positive" : "neutral"}>{p.available ? "Purchasable" : "Not yet"}</Dot>
              </div>
              <p className="mt-1 text-meta text-fg-muted">{p.id === "free" ? "Free forever, always available" : `${p.features.filter((x) => x.stage !== "hidden").length} of ${p.features.length} features out of Hidden`}</p>
            </div>
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
