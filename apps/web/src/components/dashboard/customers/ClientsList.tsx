"use client";
/**
 * The Customers list for a shop that takes appointments (docs/business/people-side.md gap 12): Name · Last visit (service, with
 * whom) · Next visit · Visits (12 months) · Stamps, with the segments Booked, Due for a visit, No-show twice, New this month, and a
 * staff filter. A chair renter who keeps their clients private gets their own clients, always (gap 8).
 */
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { inboxApi } from "@ll/shared";
import { Capsules } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { PLANS } from "@ll/shared"; // phase-pro: p3
import { PlanLine } from "@/components/onboarding/PlanLine"; // phase-pro: p3
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SurfaceCard } from "@/components/ui/ClearKit";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function ClientsList({ openId, onOpen }: { openId: string | null; onOpen: (memberId: string) => void }) {
  const { api, role, base, enabled } = useMerchant();
  const { t, date } = useLocaleOrEnglish();
  const [segment, setSegment] = useState<inboxApi.ClientSegment>("all");
  const [staffId, setStaffId] = useState("");
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [extra, setExtra] = useState<inboxApi.ClientRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);
  const list = useApi(() => api.people.clients({ segment, ...(staffId ? { staffId } : {}), ...(debounced ? { q: debounced } : {}), limit: 50 }), [api, segment, staffId, debounced]);
  const staff = useApi(role !== "staff" ? () => api.appointments.staff() : null, [api, role]);
  useEffect(() => {
    // A new filter starts the list again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExtra([]);
    setCursor(list.data?.nextCursor ?? null);
  }, [list.data]);
  const d = list.data;
  const rows = [...(d?.items ?? []), ...extra];
  const visit = (v: inboxApi.ClientRow["lastVisit"]) => (v ? `${date(v.at, { month: "short", day: "numeric" })} · ${v.services}${v.staffName ? ` · ${t("people.with", { name: v.staffName })}` : ""}` : "—");
  const segs = (["all", "upcoming", "due", "no_show_twice", "new"] as const).map((s) => ({ value: s, label: t(`people.seg.${s}`), count: d?.counts[s] ?? null }));

  return (
    <div className="flex flex-col gap-4" data-testid="clients-list">
      <div className="cust-tools flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Capsules label={t("people.col.name")} options={segs} value={segment} onChange={setSegment} />
        <div className="flex flex-wrap items-end gap-2">
          <label className="relative block">
            <span className="sr-only">{t("inbox.search")}</span>
            <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("people.col.name")} className="h-11 w-56 rounded-r2 border border-input bg-card ps-9 pe-3 text-body text-fg outline-none focus-visible:focus-ring md:h-8" />
          </label>
          {d?.staffLocked ? (
            <p className="text-meta text-fg-muted">{t("people.staffMine")}</p>
          ) : staff.data && staff.data.items.length > 1 ? (
            <Select
              label={t("people.staffFilter")}
              hideLabel
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              options={[{ value: "", label: t("people.staffAll") }, ...staff.data.items.map((s) => ({ value: s.userId, label: s.name }))]}
            />
          ) : null}
        </div>
      </div>

      {/* phase-pro: p3 -- Free: who is due, and what Pro does about it */}
      {!enabled("service.rebooking") && (d?.counts.due ?? 0) > 0 ? (
        <PlanLine href={`${base}/billing`} linkLabel={t("rb.planCta", { plan: PLANS.plus.name })} className="text-meta">
          {t("rb.customers.due", { n: d!.counts.due })}
        </PlanLine>
      ) : null}
      {list.error ? <p className="text-meta text-negative">{list.error}</p> : null}
      {!d && !list.error ? <div className="h-60 animate-pulse rounded-r4 bg-bg-subtle" aria-hidden /> : null}
      {d && !rows.length ? <SurfaceCard padded><p className="text-meta text-fg-muted">{t("people.empty")}</p></SurfaceCard> : null}
      {rows.length ? (
        <SurfaceCard className="overflow-hidden">
          <table className="w-full table-fixed text-start">
            <thead className="max-md:sr-only">
              <tr className="text-caption text-fg-muted">
                <th scope="col" className="w-[28%] px-4 py-2.5 text-start font-medium">{t("people.col.name")}</th>
                <th scope="col" className="w-[30%] px-4 py-2.5 text-start font-medium">{t("people.col.lastVisit")}</th>
                <th scope="col" className="w-[22%] px-4 py-2.5 text-start font-medium">{t("people.col.nextVisit")}</th>
                <th scope="col" className="w-[10%] px-4 py-2.5 text-end font-medium">{t("people.col.visits")}</th>
                <th scope="col" className="w-[10%] px-4 py-2.5 text-end font-medium">{t("people.col.stamps")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.memberId}
                  tabIndex={0}
                  onClick={() => onOpen(r.memberId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(r.memberId);
                    }
                  }}
                  aria-selected={openId === r.memberId}
                  className={cn("cursor-pointer border-t border-border align-top focus-visible:focus-ring max-md:flex max-md:flex-col max-md:px-4 max-md:py-3", openId === r.memberId ? "bg-row-sel" : "hover:bg-bg-subtle")}
                >
                  <td className="px-4 py-3 max-md:p-0">
                    <span className="flex items-center gap-3">
                      <Avatar name={r.name ?? "?"} id={r.userId} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-body-strong text-fg">{r.name ? <bdi>{r.name}</bdi> : <bdi dir="ltr">{r.phone ?? "—"}</bdi>}</span>
                        <span className="block truncate text-caption text-fg-muted tabular">
                          <bdi dir="ltr">{r.phone}</bdi>
                          {r.dueForVisit ? ` · ${t("people.seg.due")}` : ""}
                          {r.noShows12m >= 2 ? ` · ${t("people.seg.no_show_twice")}` : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="truncate px-4 py-3 text-meta text-fg max-md:p-0 max-md:ps-11"><span className="md:hidden text-fg-muted">{t("people.col.lastVisit")}: </span>{visit(r.lastVisit)}</td>
                  <td className="truncate px-4 py-3 text-meta text-fg max-md:p-0 max-md:ps-11"><span className="md:hidden text-fg-muted">{t("people.col.nextVisit")}: </span>{visit(r.nextVisit)}</td>
                  <td className="px-4 py-3 text-end text-meta tabular text-fg max-md:hidden">{formatNumber(r.visits12m)}</td>
                  <td className="px-4 py-3 text-end text-meta tabular text-fg max-md:hidden">{formatNumber(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SurfaceCard>
      ) : null}
      {d ? (
        <div className="flex items-center justify-between text-meta text-fg-muted">
          <span className="tabular">{`${formatNumber(rows.length)} / ${formatNumber(d.total)}`}</span>
          {cursor ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const r = await api.people.clients({ segment, ...(staffId ? { staffId } : {}), ...(debounced ? { q: debounced } : {}), cursor, limit: 50 });
                setExtra((x) => [...x, ...r.items]);
                setCursor(r.nextCursor);
              }}
            >
              {t("people.more")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
