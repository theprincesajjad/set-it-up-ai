"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { groupCode } from "@/lib/format";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface MemberQrProps {
  memberCode: string;
  /** Pre-rendered SVG from GET /v1/me/card (`qrSvg`). Zero client JS. */
  svg?: string;
  /** Or a QR element, e.g. <QrCode value={qrPayload} /> on the server. */
  children?: ReactNode;
  size?: number;
  caption?: string;
  className?: string;
}

/**
 * "My card" QR (foundations.md "My card"): black on white inside a white 16-radius block even in
 * dark mode, >= 220 px, member number in mono underneath. No card art.
 */
export function MemberQr({ memberCode, svg, children, size = 260, caption, className }: MemberQrProps) {
  const { t } = useLocaleOrEnglish();
  return (
    <figure className={cn("flex flex-col items-center gap-4", className)}>
      <div className="rounded-card border border-line bg-qr-bg p-4 dark:border-transparent" style={{ width: "min(100%, " + (size + 32) + "px)" }}>
        {svg ? (
          <div role="img" aria-label={`${t("ms.qr.label")} ${memberCode}`} className="aspect-square w-full [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="aspect-square w-full [&>svg]:size-full">{children}</div>
        )}
      </div>
      <figcaption className="flex flex-col items-center">
        <span className="font-mono text-[22px] font-semibold leading-7 tracking-[0.14em] text-fg tabular-nums">{groupCode(memberCode)}</span>
        <span className="mt-0.5 text-meta text-fg-muted">{caption ?? t("ui.order.showAtCounter")}</span>
      </figcaption>
    </figure>
  );
}
