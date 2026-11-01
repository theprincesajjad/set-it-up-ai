"use client";
import { BackLink, PageHeader, Panel, StatGrid, StatTile, StatusDot } from "@/components/dashboard/kit";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useParams, useRouter } from "next/navigation";
import { merchantApi, type promosApi } from "@ll/shared";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { PromoEditor } from "@/components/dashboard/PromoEditor";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/api/errors";
import { formatNumber } from "@/lib/format";
import { STATUS_ACTION, TYPE_INFO, draftFromPromo } from "@/lib/dashboard/promos";
import { useApi } from "@/lib/dashboard/useApi";
import { useState } from "react";

/** Pricing v2: a paid (Plus) section. Deep links show the "Coming soon" card when it's locked. */
export default function PromoPageGated() {
  return (
    <FeatureGate keys={["promos.basic", "promos.double_points"]} title="Promos">
      <PromoPage />
    </FeatureGate>
  );
}

type Confirm = { kind: "status"; to: merchantApi.PromoStatus } | { kind: "action"; action: promosApi.PromoAction };

const money = (cents: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(cents / 100);

function PromoPage() {
  const { promoId } = useParams<{ promoId: string }>();
  const { api, base } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const promo = useApi(() => api.promo(promoId), [api, promoId]);
  const results = useApi(() => api.promoResults(promoId), [api, promoId]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`${base}/promos`}>Promos</BackLink>
      <Async state={promo}>
        {(p) => {
          const r = results.data;
          const running = p.status === "live" || p.status === "scheduled";
          const next = merchantApi.PROMO_TRANSITIONS[p.status].filter((s) => (s !== "scheduled" || new Date(p.startsAt).getTime() > Date.now()) && !(running && s === "ended"));
          const act = async (fn: () => Promise<merchantApi.Promo>, msg: string) => {
            setBusy(true);
            try {
              const n = await fn();
              promo.setData(n);
              results.reload();
              toast({ message: msg, tone: "success" });
              return n;
            } catch (e) {
              toast({ message: errorMessage(e), tone: "error" });
            } finally {
              setBusy(false);
            }
          };
          return (
            <>
              <PageHeader
                title={p.title}
                description={
                  <span className="flex flex-wrap items-center gap-2">
                    {p.pausedAt ? <StatusDot domain="promo" status="draft" label="Paused" /> : <StatusDot domain="promo" status={p.status} />}
                    <span className="text-meta text-fg-muted">{TYPE_INFO[p.promoType]?.label}</span>
                  </span>
                }
                actions={
                  <div className="flex flex-wrap gap-2">
                    {next.map((s) => (
                      <Button size="sm" key={s} variant={s === "live" ? "primary" : "secondary"} onClick={() => setConfirm({ kind: "status", to: s })}>
                        {STATUS_ACTION[s] ?? s}
                      </Button>
                    ))}
                    {running && !p.pausedAt ? (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(() => api.promoAction(p.id, "pause"), "Paused. Customers don't see it now.")} data-testid="promo-pause">
                        Pause
                      </Button>
                    ) : null}
                    {running && p.pausedAt ? (
                      <Button size="sm" disabled={busy} onClick={() => void act(() => api.promoAction(p.id, "resume"), "Running again.")} data-testid="promo-resume">
                        Resume
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        const n = await act(() => api.duplicatePromo(p.id), "Copied as a draft.");
                        if (n) router.push(`${base}/promos/${n.id}`);
                      }}
                      data-testid="promo-duplicate"
                    >
                      Duplicate
                    </Button>
                    {running ? (
                      <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "action", action: "end_early" })} data-testid="promo-end">
                        End early
                      </Button>
                    ) : null}
                  </div>
                }
              />
              {p.pausedAt ? <Banner tone="warning">Paused: customers don't see it, no extra stamps or points are given, and no notifications go out. Resume any time.</Banner> : null}
              {p.status !== "draft" ? (
                <StatGrid>
                  <StatTile label="Sent" value={r ? formatNumber(r.sent) : null} caption={r && r.skippedByCap ? `${r.skippedByCap} held back by the weekly limit` : "Notifications delivered"} loading={results.loading} />
                  <StatTile label="Opened" value={r ? formatNumber(r.opened) : null} loading={results.loading} />
                  <StatTile label="Redeemed" value={r ? formatNumber(r.redeemed) : null} caption={r && r.claimed ? `${r.claimed} spots saved` : undefined} loading={results.loading} />
                  <StatTile label="Revenue attributed" value={r ? money(r.revenueCents) : null} caption="Sales with the promo applied" loading={results.loading} />
                  {p.quantityCap != null ? <StatTile label="Spots left" value={`${formatNumber(p.remaining ?? 0)} of ${formatNumber(p.quantityCap)}`} /> : null}
                </StatGrid>
              ) : null}
              {p.status === "live" && (p.quantityCap != null || p.kind === "offer") ? <RedeemBox promoId={p.id} onDone={() => { results.reload(); promo.reload(); }} /> : null}
              <PromoEditor key={p.id + p.status + (p.pausedAt ?? "")} initial={draftFromPromo(p)} promo={p} />
              <ConfirmDialog
                open={!!confirm}
                onClose={() => setConfirm(null)}
                title={confirm?.kind === "action" ? "End this promo now?" : confirm?.to === "live" ? "Publish this promo now?" : confirm?.to === "archived" ? "Archive this promo?" : `${STATUS_ACTION[confirm?.to ?? "draft"] ?? "Change"}?`}
                body={confirm?.kind === "action" ? "Customers stop seeing it right away. Results stay here." : confirm?.to === "live" ? "It shows to customers right away, and people who said yes to your offers get a notification." : undefined}
                confirmLabel={confirm?.kind === "action" ? "End now" : (STATUS_ACTION[confirm?.to ?? "draft"] ?? "Confirm")}
                danger={confirm?.kind === "action"}
                onConfirm={async () => {
                  try {
                    const n = confirm?.kind === "action" ? await api.promoAction(p.id, confirm.action) : await api.setPromoStatus(p.id, confirm!.to);
                    promo.setData(n);
                    results.reload();
                    toast({ message: n.status === "live" ? "Your promo is live." : "Updated", tone: "success" });
                  } catch (e) {
                    throw new Error(errorMessage(e));
                  }
                }}
              />
            </>
          );
        }}
      </Async>
    </div>
  );
}

/** At the counter: the customer's claim code (or no code for an open offer), with the sale amount for the results. */
function RedeemBox({ promoId, onDone }: { promoId: string; onDone: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Panel>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.redeemPromo(promoId, { code: code.trim().toUpperCase(), amountCents: amount ? Math.round(Number.parseFloat(amount) * 100) : null });
            toast({ message: "Redeemed.", tone: "success" });
            setCode("");
            setAmount("");
            onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField label="Customer's code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={16} required />
        <TextField label="Sale amount" optionalLabel inputMode="decimal" prefix="$" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
        <Button type="submit" loading={busy}>
          Redeem
        </Button>
      </form>
      {error ? <p role="alert" className="mt-2 text-meta text-negative">{error}</p> : null}
    </Panel>
  );
}
