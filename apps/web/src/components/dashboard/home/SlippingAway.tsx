"use client";
import type { reportsApi } from "@ll/shared";
import { NotifyLink } from "@/components/dashboard/FeatureTeaser";
import { Button } from "@/components/ui/Button";
import { shortDay, slippingFooter, slippingMeta } from "@/lib/dashboard/home";
import { ListSection } from "./ListSection";

/** Regulars overdue against their own rhythm. Only people who agreed to texts count towards "Text the N". */
export function SlippingAway({ data, base, canMessage, loading }: { data: reportsApi.TodayReportDto["slipping"] | null; base: string; canMessage: boolean; loading?: boolean }) {
  return (
    <ListSection
      title="Slipping away"
      right={data ? slippingMeta(data.count) : null}
      loading={loading && !data}
      empty="No regulars are overdue. Anyone who drifts will show up here."
      rows={(data?.members ?? []).map((m) => ({
        key: m.memberId,
        href: `${base}/customers?member=${m.memberId}`,
        title: m.name ?? "No name",
        meta: `${m.usually ?? "No pattern yet"} · last in ${shortDay(m.lastVisitAt)}`,
        trailing: m.canText ? <span className="text-positive">Can text</span> : <span className="text-fg-subtle">No consent</span>,
      }))}
      footer={
        data && data.count > 0 ? (
          canMessage ? (
            <>
              <span>{slippingFooter(data.canText, data.count)}</span>
              {data.canText > 0 ? (
                <Button size="sm" href={`${base}/messages/new?segment=slipping`} className="h-9 rounded-full px-4 text-[13px] font-medium">
                  Text the {data.canText}
                </Button>
              ) : null}
            </>
          ) : (
            <span>
              Texts to slipping regulars come with Plus · <NotifyLink keys={["marketing.sms", "marketing.email"]} className="text-[12px] no-underline" />
            </span>
          )
        ) : null
      }
    />
  );
}
