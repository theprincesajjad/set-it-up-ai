import { preload } from "react-dom";
import { photoSrcSet, type NailTrade, type SoloPageId } from "@/lib/marketing/solo";
import { soloView } from "@/lib/marketing/solo-view";
import { DmToBooking, Facts, Jobs, PriceBlock, Regulars } from "./solo/Blocks";
import { Hero, WORK_SIZES } from "./solo/Hero";
import { SoloNav } from "./solo/Nav";
import { Start } from "./solo/Start";
import "./solo/solo.css";

/**
 * One solo-pro landing page, direction B (product-led; docs/marketing/landing-pages.md): seven blocks, hook and phone, facts, three
 * live jobs, the DM that becomes a booking, regulars, price, and the three-field start. Server-rendered and static: English copy
 * from copy.solo, the trade's photos from public/marketing, and no script except the start form's source field.
 * `trade` only applies to the nail page (`?trade=brows|lashes|makeup`, served by the static /for-nail-techs/[trade] route).
 */
export function SoloLanding({ id, trade = "nails", variant }: { id: SoloPageId; trade?: NailTrade; /** A LANDING_VARIANTS id (copy/en-CA.ts) for an A/B test; control by default. */ variant?: string }) {
  const v = soloView(id, trade, variant);
  // The hero photo is the largest image above the fold where the stage is wide (300 px beside the phone): ask for it with the HTML.
  // On a phone the headline and lede are the LCP and the photo is a 112 px thumbnail, so it is not preloaded there.
  preload(`/marketing/${v.photos.work.stem}-${v.photos.work.widths[0]}.avif`, { as: "image", type: "image/avif", imageSrcSet: photoSrcSet(v.photos.work, "avif"), imageSizes: WORK_SIZES, fetchPriority: "high", media: "(min-width: 572px)" });
  return (
    <div className="sl" data-trade={v.vertical} data-solo-page={id} data-solo-trade={v.key} data-variant={v.variant}>
      <SoloNav current={v.key} />
      <main id="main">
        <Hero v={v} />
        <Facts v={v} />
        <Jobs v={v} />
        <DmToBooking v={v} />
        <Regulars v={v} />
        <PriceBlock v={v} />
        <Start v={v} />
      </main>
    </div>
  );
}
