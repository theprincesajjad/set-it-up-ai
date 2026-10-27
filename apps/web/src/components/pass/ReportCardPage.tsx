import Image from "next/image";
import type { petApi, translator } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Heading, ShopHead } from "@/components/restaurant/ui";

/** /visit/<token> (docs/research/pet-care.md, Figma M3): one visit, the way the shop texted it. A private link, no sign-in, gone after 30 days. */
export function ReportCardPage({ v, t, brand, when }: { v: petApi.PublicVisitResponse; t: ReturnType<typeof translator>; brand: { logoUrl: string | null; brandColor: string | null }; when: string }) {
  return (
    <div className="flex flex-col gap-5">
      <ShopHead shop={{ name: v.shop.name, logoUrl: brand.logoUrl, brandColor: brand.brandColor }} kicker={t("pet.visit.from", { shop: v.shop.name })} />
      <div className="flex flex-col gap-1">
        <Heading plain>{t("pet.visit.title", { pet: v.pet.name })}</Heading>
        <p className="text-meta text-fg-muted">{when}</p>
      </div>
      {v.photoUrl ? (
        // The photo is a short-lived signed link from the API, so it is not optimised through the image loader.
        <Image src={v.photoUrl} alt={v.pet.name} width={720} height={540} unoptimized className="h-auto w-full rounded-card object-cover" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {v.mood ? <span className="inline-flex h-8 items-center rounded-full border border-line px-3 text-meta-strong text-fg">{t(`pet.moodLabel.${v.mood}` as never)}</span> : null}
        {v.did.map((d) => (
          <span key={d} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-meta text-fg">{t(`pet.did.${d}` as never)}</span>
        ))}
      </div>
      {v.note ? <p className="text-body text-fg"><bdi>{v.note}</bdi></p> : null}
      <Button size="lg" fullWidth href={v.bookUrl ?? `/shops/${v.shop.slug}`}>{t("pet.visit.bookNext")}</Button>
    </div>
  );
}
