"use client";
import { ChevronRight, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { MessageKey } from "@ll/shared";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface OpenOrder {
  id: string;
  number: number;
  status: string;
  merchantName: string;
}

/** An order that is still on its way, at the top of the wallet: the way back to its tracker without the text message. */
export function OpenOrders({ orders }: { orders: OpenOrder[] }) {
  const { t, number } = useLocaleOrEnglish();
  if (!orders.length) return null;
  return (
    <section aria-label={t("cust.me.yourOrder")} className="flex flex-col gap-2" data-testid="open-orders">
      {orders.map((o) => (
        <Link key={o.id} href={`/o/${encodeURIComponent(o.id)}`} className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-card px-4 py-3 hover:bg-hover focus-visible:focus-ring press-soft">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-r4 bg-trade-soft text-trade-deep">
            <ShoppingBag className="size-5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-meta-strong text-trade-deep">{t("cust.me.yourOrder")} · <bdi>#{number(o.number)}</bdi></span>
            <span className="block truncate text-body-strong text-fg">{t(`ui.order.${o.status}` as MessageKey)}</span>
            <span className="block truncate text-meta text-fg-muted"><bdi>{o.merchantName}</bdi></span>
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-fg-muted rtl:rotate-180" />
        </Link>
      ))}
    </section>
  );
}
