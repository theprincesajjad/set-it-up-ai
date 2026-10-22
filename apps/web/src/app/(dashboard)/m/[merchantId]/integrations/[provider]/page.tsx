"use client";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { integrationsApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { StatusBadge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Layout";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { relativeTime } from "@/lib/dashboard/time";
import { useAction, useApi } from "@/lib/dashboard/useApi";

type Ext = { id: string; name: string; detail?: string };

export default function IntegrationDetailPage() {
  const { provider } = useParams<{ provider: string }>();
  const { api, base } = useMerchant();
  const state = useApi(() => api.integrations.get(provider), [api, provider]);
  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" iconStart={ArrowLeft} href={`${base}/integrations`} className="self-start">
        Integrations
      </Button>
      <Async state={state}>{(d) => <Settings d={d} onChange={(n) => state.setData(n)} />}</Async>
    </div>
  );
}

function Settings({ d, onChange }: { d: integrationsApi.IntegrationDetail; onChange: (d: integrationsApi.IntegrationDetail) => void }) {
  const { api, base, detail } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const cats = useApi(() => api.categories(), [api]);
  const act = useAction();
  const [locMap, setLocMap] = useState(d.mapping.locationMap);
  const [catMap, setCatMap] = useState(d.mapping.categoryMap);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocMap(d.mapping.locationMap);
    setCatMap(d.mapping.categoryMap);
  }, [d]);
  const extLocs = (d.settings.externalLocations as Ext[] | undefined) ?? [];
  const extCats = (d.settings.externalCategories as Ext[] | undefined) ?? [];
  const autoAward = d.settings.autoAward !== false;
  const autoEnroll = d.settings.autoEnroll !== false;
  const patch = async (body: integrationsApi.UpdateSettingsBody) => {
    const r = await act.run(() => api.integrations.update(d.provider, body));
    if (r) {
      onChange(r);
      toast({ message: "Saved", tone: "success" });
    }
  };
  const noEarn = (id: string) => cats.data?.items.find((c) => c.id === id && !c.earnEligible);

  return (
    <>
      <PageHeader title={d.name} description={<span className="flex flex-wrap items-center gap-2"><StatusBadge domain="integration" status={d.status} />{d.lastSyncAt ? `Last sync ${relativeTime(d.lastSyncAt)}` : null}</span>} actions={
        <>
          <Button variant="secondary" iconStart={RefreshCw} loading={act.busy} onClick={async () => {
            const r = await act.run(() => api.integrations.sync(d.provider));
            if (r) {
              onChange({ ...r.integration, mapping: r.mapping });
              toast({ message: "Synced", tone: "success" });
            }
          }}>
            Sync now
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Disconnect
          </Button>
        </>
      } />
      {d.lastError ? <Banner tone="danger">{d.lastError}</Banner> : null}
      {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
      <Card padding="lg">
        <CardHeader title="Awarding" />
        <Switch label="Award points on every paid sale" description="Off: only when the customer is identified at the till." checked={autoAward} onChange={(v) => patch({ autoAward: v })} />
        <Switch label="Add POS customers with a phone as members" checked={autoEnroll} onChange={(v) => patch({ autoEnroll: v })} />
      </Card>
      {extLocs.length ? (
        <Card padding="lg">
          <CardHeader title={`Match ${d.name} locations to your locations`} />
          <div className="flex flex-col gap-3">
            {extLocs.map((x) => (
              <Select key={x.id} label={`${x.name}${x.detail ? ` (${x.detail})` : ""}`} placeholder="Not matched" value={locMap[x.id] ?? ""} onChange={(e) => setLocMap({ ...locMap, [x.id]: e.target.value })} options={detail.locations.map((l) => ({ value: l.id, label: l.name }))} />
            ))}
            <Button className="self-start" loading={act.busy} onClick={() => patch({ locationMap: Object.fromEntries(extLocs.map((x) => [x.id, locMap[x.id] || null])) })}>
              Save locations
            </Button>
          </div>
        </Card>
      ) : null}
      {extCats.length ? (
        <Card padding="lg">
          <CardHeader title="Category mapping" subtitle="Map POS categories like Rx to Prescriptions so they never earn." />
          <div className="flex flex-col gap-3">
            {extCats.map((x) => (
              <div key={x.id}>
                <Select label={x.name} placeholder="Earns normally" value={catMap[x.id] ?? ""} onChange={(e) => setCatMap({ ...catMap, [x.id]: e.target.value })} options={(cats.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.name}${c.earnEligible ? "" : " (doesn't earn)"}` }))} />
                {catMap[x.id] && noEarn(catMap[x.id]!) ? (
                  <p className="mt-1 flex items-center gap-1 text-body-sm text-fg-muted">
                    <Lock aria-hidden className="size-3.5" /> Sales in {x.name} won&apos;t earn points.
                  </p>
                ) : null}
              </div>
            ))}
            <Button className="self-start" loading={act.busy} onClick={() => patch({ categoryMap: Object.fromEntries(extCats.map((x) => [x.id, catMap[x.id] || null])) })}>
              Save categories
            </Button>
          </div>
        </Card>
      ) : (
        <Card tone="flat">
          <p className="text-body-sm text-fg-muted">Locations and categories appear here after the first sync.</p>
        </Card>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Disconnect ${d.name}?`} body="Sales stop earning points automatically. Points already awarded stay." confirmLabel="Disconnect" danger onConfirm={async () => {
        await api.integrations.disconnect(d.provider);
        router.push(`${base}/integrations`);
      }} />
    </>
  );
}
