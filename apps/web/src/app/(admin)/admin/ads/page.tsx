"use client";
import { Check } from "lucide-react";
import { useState } from "react";
import type { adsApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Async } from "@/components/dashboard/PageStates";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Layout";
import { PromoCard } from "@/components/ui/PromoCard";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { browserApi } from "@/lib/api/browser";
import { formatDate, formatMoney } from "@/lib/format";
import { AD_STATUS_TONE, PLACEMENT_LABEL } from "@/lib/dashboard/ads";
import { useAction, useApi } from "@/lib/dashboard/useApi";

const POLICY = ["No alcohol inducement", "No promotion of pharmacy services or prescriptions", "Claims are honest and specific", "Sponsored label will show"];
const REJECT = ["Promotes alcohol consumption", "Promotes pharmacy services or prescriptions", "Misleading or unverifiable claim", "Image or text quality"];

export default function AdsReviewPage() {
  const toast = useToast();
  const [status, setStatus] = useState<adsApi.AdStatus>("pending_review");
  const list = useApi(() => browserApi.admin.ads({ status, limit: 50 }), [status]);
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
  const [reject, setReject] = useState<adsApi.AdminAdCampaign | null>(null);
  const [reason, setReason] = useState(REJECT[0]!);
  const [detail, setDetail] = useState("");
  const act = useAction();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Ads review" description="Every sponsored item is checked before it serves." />
      <Tabs label="Status" value={status} onChange={(v) => setStatus(v as adsApi.AdStatus)} items={[{ id: "pending_review", label: "Waiting" }, { id: "active", label: "Live" }, { id: "rejected", label: "Rejected" }, { id: "ended", label: "Ended" }]} />
      {act.error ? <p className="text-negative">{act.error}</p> : null}
      <Async state={list}>
        {(d) =>
          d.items.length ? (
            <ul className="flex flex-col gap-4">
              {d.items.map((a) => {
                const c = checks[a.id] ?? POLICY.map(() => false);
                return (
                  <li key={a.id}>
                    <Card padding="lg" className="grid gap-5 lg:grid-cols-[360px_1fr]">
                      <PromoCard promo={{ title: a.headline, body: a.body, kind: "offer", endsAt: a.endsAt, imageUrl: a.imageUrl }} shop={{ name: a.merchant.name, vertical: "other" }} sponsored={{ advertiser: a.merchant.name }} variant="feed" />
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-title text-fg">{a.merchant.name}</h2>
                          <Badge tone={AD_STATUS_TONE[a.status]} dot>{a.status.replace("_", " ")}</Badge>
                          <Badge tone={a.paymentStatus === "paid" ? "success" : "warning"}>{a.paymentStatus}</Badge>
                        </div>
                        <p className="text-meta text-fg-muted">{PLACEMENT_LABEL[a.placement]} · {formatDate(a.startsAt)} to {formatDate(a.endsAt)} · {formatMoney(a.budgetCents)} ({a.pricingModel === "daily" ? `${formatMoney(a.rateCents)}/day` : `${formatMoney(a.rateCents)} CPM`}){a.radiusMetres ? ` · ${a.radiusMetres} m radius` : ""} · {a.neighbourhoodIds.length} neighbourhoods</p>
                        {a.status === "pending_review" ? (
                          <>
                            <fieldset className="flex flex-col gap-1">
                              <legend className="mb-1 text-label text-fg">Policy checklist</legend>
                              {POLICY.map((p, i) => <Checkbox key={p} label={p} checked={c[i]!} onChange={(v) => setChecks({ ...checks, [a.id]: c.map((x, j) => (j === i ? v : x)) })} />)}
                            </fieldset>
                            <div className="flex flex-wrap gap-2">
                              <Button iconStart={Check} disabled={!c.every(Boolean)} loading={act.busy} onClick={async () => { const r = await act.run(() => browserApi.admin.approveAd(a.id)); if (r) { toast({ message: "Approved", tone: "success" }); await list.reload(); } }}>Approve</Button>
                              <Button variant="secondary" onClick={() => setReject(a)}>Reject</Button>
                            </div>
                          </>
                        ) : null}
                        {a.paymentStatus !== "paid" && a.paymentStatus !== "refunded" && a.status !== "rejected" ? (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={async () => { await act.run(() => browserApi.admin.markAdPaid(a.id, "paid")); await list.reload(); }}>Mark paid</Button>
                            <Button variant="ghost" size="sm" onClick={async () => { await act.run(() => browserApi.admin.markAdPaid(a.id, "invoiced")); await list.reload(); }}>Mark invoiced</Button>
                          </div>
                        ) : null}
                        {a.reviewNote ? <p className="text-meta text-fg-muted">Note: {a.reviewNote}</p> : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="Nothing here" description={status === "pending_review" ? "No ads waiting for review." : "No ads in this state."} />
          )
        }
      </Async>
      <ConfirmDialog open={!!reject} onClose={() => setReject(null)} title={`Reject ${reject?.merchant.name}'s ad?`} body="The merchant sees your reason. Card payments are refunded automatically." confirmLabel="Reject" danger onConfirm={async () => {
        await browserApi.admin.rejectAd(reject!.id, detail.trim() ? `${reason}: ${detail.trim()}` : reason);
        setDetail("");
        await list.reload();
      }}>
        <div className="flex flex-col gap-3">
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} options={REJECT.map((r) => ({ value: r, label: r }))} />
          <TextField label="Details" optionalLabel value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}
