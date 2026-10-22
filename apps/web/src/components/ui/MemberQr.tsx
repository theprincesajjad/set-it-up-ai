import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { groupCode } from "@/lib/format";

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
 * "My card" QR: black on white inside a white rounded card even in dark mode,
 * >= 220 px, member number grouped underneath (system.md §5 MemberQr).
 */
export function MemberQr({ memberCode, svg, children, size = 260, caption = "Show this at the counter", className }: MemberQrProps) {
  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <div className="rounded-xl bg-qr-bg p-4 shadow-sm" style={{ width: "min(100%, " + (size + 32) + "px)" }}>
        {svg ? (
          <div role="img" aria-label={`Member QR code ${memberCode}`} className="aspect-square w-full [&>svg]:block [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="aspect-square w-full [&>svg]:size-full">{children}</div>
        )}
      </div>
      <figcaption className="flex flex-col items-center">
        <span className="font-mono text-[28px] font-bold leading-8 tracking-[0.12em] text-fg tabular-nums">{groupCode(memberCode)}</span>
        <span className="text-body-sm text-fg-muted">{caption}</span>
      </figcaption>
    </figure>
  );
}
