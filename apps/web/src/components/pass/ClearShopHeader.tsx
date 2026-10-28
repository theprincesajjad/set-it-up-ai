"use client";
/**
 * The shop page header in Clear: flat on the canvas (no tinted band, no illustration), the cover photo when there is one, the shop's logo
 * (its own colour stays inside it), the name as the 28/36 phone title in ink and one muted line. Warm keeps <ShopTile variant="hero">.
 */
import { useState } from "react";
import { ShopLogo, type ShopTileProps } from "@/components/ui/ShopTile";

export function ClearShopHeader({ shop, subtitle }: { shop: ShopTileProps["shop"]; subtitle?: string }) {
  const [coverFailed, setCoverFailed] = useState(false);
  const hasCover = !!shop.coverUrl && !coverFailed;
  return (
    <div className="flex flex-col gap-4">
      {hasCover ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-r6 bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shop.coverUrl!} alt="" className="size-full object-cover" onError={() => setCoverFailed(true)} />
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <ShopLogo shop={shop} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-9 tracking-[-0.022em] text-foreground"><bdi>{shop.name}</bdi></h1>
          {subtitle ? <p className="text-body text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
