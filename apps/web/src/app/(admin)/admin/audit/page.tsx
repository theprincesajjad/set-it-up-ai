"use client";
/**
 * Audit log: every admin, rep, rollout, consent and money action. Wave Q (kit): a day-grouped timeline (ReUI Timeline) instead of a wide
 * table, an icon per area, the actor and target on one muted line, the raw entry under Details, a skeleton while loading and an empty state.
 */
import { BadgeDollarSign, Building2, Download, Flag, Handshake, LifeBuoy, Megaphone, ScrollText, ShieldCheck, Sparkles, Store, User, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { adminApi } from "@ll/shared";
import { PageHeader, Panel, QuietButton } from "@/components/dashboard/kit";
import { PanelEmpty } from "@/components/dashboard/admin/AdminKit";
import { HistoryTimeline } from "@/components/dashboard/admin/AdminTimeline";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/errors";
import { downloadCsv } from "@/lib/dashboard/download";

const PREFIXES = ["", "feature.", "merchant.", "billing.", "support.", "user.", "lead.", "rep.", "neighbourhood.", "perk.", "campaign.", "ad.", "member.", "consent."];
const AREA_ICON: Record<string, LucideIcon> = {
  feature: Flag,
  merchant: Store,
  billing: BadgeDollarSign,
  support: LifeBuoy,
  user: User,
  lead: Handshake,
  rep: Users,
  neighbourhood: Building2,
  perk: Sparkles,
  campaign: Megaphone,
  ad: Megaphone,
  member: User,
  consent: ShieldCheck,
};
const AREA_LABEL: Record<string, string> = { neighbourhood: "Area", ad: "Ads", perk: "Perks" };

/** "support.session_started" → "Session started"; "merchant.plan_changed" → "Plan changed". */
const humanize = (action: string) => {
  const rest = action.split(".").slice(1).join(" ") || action;
  const s = rest.replace(/[._]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const areaOf = (action: string) => action.split(".")[0] ?? "";

function Skeletons() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the audit log" className="flex flex-col gap-5 p-5">
      <span className="sr-only">Loading the audit log</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="mt-1 h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [custom, setCustom] = useState("");
  const [rows, setRows] = useState<adminApi.AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = custom.trim() || action;
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      browserApi.admin.audit({ action: a || undefined, limit: 50 }).then((r) => { if (live) { setRows(r.items); setCursor(r.nextCursor); setError(null); } }).catch((e) => live && setError(errorMessage(e))).finally(() => live && setLoading(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [a]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" description="Every admin, rep, rollout, consent and money action, newest first." actions={<Button size="sm" variant="secondary" iconStart={Download} disabled={!rows.length} onClick={() => downloadCsv("audit.csv", [["time", "actor", "action", "entity", "entity_id", "merchant_id", "ip", "data"], ...rows.map((r) => [r.createdAt, r.actorName ?? "", r.action, r.entity ?? "", r.entityId ?? "", r.merchantId ?? "", r.ip ?? "", JSON.stringify(r.data)])])}>Export CSV</Button>} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Area" value={action} onChange={(e) => setAction(e.target.value)} options={PREFIXES.map((p) => ({ value: p, label: p ? (AREA_LABEL[p.slice(0, -1)] ?? p.slice(0, -1).replace(/^./, (c) => c.toUpperCase())) : "Everything" }))} />
        <TextField label="Exact action" optionalLabel placeholder="feature.stage_changed" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </div>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Panel padded={false} className={loading && rows.length ? "opacity-60 transition-opacity" : undefined}>
        {loading && !rows.length ? (
          <Skeletons />
        ) : rows.length ? (
          <div className="p-4 md:p-5">
            <HistoryTimeline
              label="Audit entries"
              entries={rows.map((r) => {
                const area = areaOf(r.action);
                return {
                  id: r.id,
                  at: r.createdAt,
                  icon: AREA_ICON[area] ?? ScrollText,
                  state: /failed|refused|denied|deleted|revoked/.test(r.action) ? ("alert" as const) : ("done" as const),
                  title: humanize(r.action),
                  meta: (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-fg">{r.actorName ?? "System"}</span>
                      <span aria-hidden>·</span>
                      <code className="rounded-r2 bg-muted px-1.5 py-px font-mono text-caption text-fg">{r.action}</code>
                      {r.entity ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{[r.entity, r.entityId?.slice(0, 8)].filter(Boolean).join(" ")}</span>
                        </>
                      ) : null}
                    </span>
                  ),
                  details: (
                    <>
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-caption text-fg">{JSON.stringify(r.data, null, 2)}</pre>
                      {r.ip ? <p className="mt-1 text-caption text-fg-muted">IP {r.ip}</p> : null}
                    </>
                  ),
                };
              })}
            />
          </div>
        ) : (
          <PanelEmpty icon={ScrollText} title={a ? `Nothing logged for “${a}”` : "Nothing logged yet"} description="Admin, rep, rollout, consent and money actions show here the moment they happen." action={a ? <QuietButton onClick={() => { setAction(""); setCustom(""); }}>Show everything</QuietButton> : undefined} />
        )}
      </Panel>
      {cursor ? (
        <Button
          variant="secondary"
          className="self-start"
          loading={more}
          onClick={async () => {
            setMore(true);
            try {
              const r = await browserApi.admin.audit({ action: a || undefined, limit: 50, cursor });
              setRows((x) => [...x, ...r.items]);
              setCursor(r.nextCursor);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setMore(false);
            }
          }}
        >
          Load 50 more
        </Button>
      ) : null}
    </div>
  );
}
