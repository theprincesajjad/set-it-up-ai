"use client";
import { MemberQr } from "@/components/ui/MemberQr";
import { QrCode } from "@/components/ui/QrCode";
import { PhoneFrame } from "./Mocks";

/**
 * The one picture on /for-shoppers: what the shopper will actually hold, their card, in the page's language.
 * A sample card (not a real member); decorative like every mock on the marketing site.
 */
export function ShopperCardPhone({ title, headline, caption, walletLabel, className }: { title: string; headline: string; caption: string; walletLabel: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <div className="absolute inset-0 bg-hover">
        <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col items-center gap-4 rounded-t-[28px] bg-background px-5 pt-3">
          <span className="h-[5px] w-9 rounded-full bg-hover" />
          <span className="display self-start text-[22px] leading-7 text-foreground">{title}</span>
          <span className="-mt-3 self-start text-[13px] text-muted-foreground">{headline}</span>
          <MemberQr memberCode="LL4K7Q2M" size={190} caption={caption}>
            <QrCode value="https://localloyalty.example/c/LL4K7Q2M" size={190} />
          </MemberQr>
          <span className="mt-auto mb-8 flex h-12 w-full items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">{walletLabel}</span>
        </div>
      </div>
    </PhoneFrame>
  );
}
