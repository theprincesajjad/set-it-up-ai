"use client";
import { useEffect, useState } from "react";
import type { barberApi } from "@ll/shared";
import { Heading, ShopHead, useFmt } from "@/components/restaurant/ui";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

/** /line/<token>: where you are in the line (Figma M2). Refreshes every 10 seconds; leaving is one tap. */
export function LineStatus({ initial, shop }: { initial: barberApi.QueueStatusResponse; shop: { logoUrl: string | null; brandColor: string | null } }) {
  const { t } = useFmt();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const live = s.state === "waiting" || s.state === "called" || s.state === "in_service";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      void browserApi.public.queueStatus(s.token).then(setS).catch(() => undefined);
    }, 10_000);
    return () => clearInterval(id);
  }, [live, s.token]);

  const total = Math.max(5, s.ahead + 1);
  const done = total - (s.position ?? 1);
  const head =
    s.state === "waiting" ? (s.position === 1 ? t("q.next") : t("q.position", { n: s.position ?? 1 })) : s.state === "called" ? t("q.calledAny") : s.state === "in_service" ? t("q.inService") : s.state === "done" ? t("q.done") : s.state === "no_show" ? t("q.noShow") : t("q.left");
  const sub =
    s.state === "waiting"
      ? [s.estimateMin === null ? null : s.estimateMin <= 0 ? t("q.noWait") : t("q.estimate", { min: s.estimateMin }), s.barberName ? t("q.withBarber", { name: s.barberName }) : null, s.serviceName].filter(Boolean).join(" · ")
      : s.state === "called" && s.calledBarberName
        ? t("q.called", { name: s.calledBarberName })
        : "";
  return (
    <div className="flex flex-col gap-5">
      <ShopHead shop={{ name: s.shop.name, logoUrl: shop.logoUrl, brandColor: shop.brandColor }} href={`/shops/${s.shop.slug}`} />
      <div className="flex flex-col gap-2 pt-2" aria-live="polite">
        <Heading plain className={cn(s.state === "called" && "text-accent-text")}>{head}</Heading>
        {sub ? <p className="text-body text-fg-muted">{sub}</p> : null}
      </div>
      {s.state === "waiting" ? (
        <>
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-pill", i < done ? "bg-accent" : "bg-bg-muted")} />
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-line border-y border-line text-body">
            <li className="flex justify-between gap-3 py-3"><span>{t("q.ahead", { n: s.ahead })}</span></li>
            {s.party.length ? <li className="flex justify-between gap-3 py-3"><span>{t("q.party", { names: s.party.map((p) => p.name).join(", ") })}</span></li> : null}
            <li className="py-3 text-fg-muted">{t("q.textNote")}</li>
          </ul>
        </>
      ) : null}
      {s.state === "called" ? <Banner tone="info">{t("q.calledAny")}</Banner> : null}
      {s.state === "waiting" || s.state === "called" ? (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setS(await browserApi.public.leaveQueue(s.token));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("q.leave")}
        </Button>
      ) : (
        <Button variant="secondary" size="lg" fullWidth href={`/shops/${s.shop.slug}`}>
          {t("q.back", { shop: s.shop.name })}
        </Button>
      )}
    </div>
  );
}
