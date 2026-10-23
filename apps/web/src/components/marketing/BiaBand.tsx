import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { MSection } from "./Section";
import { SampleReportCard } from "./SampleReportCard";

/** Landing band for the second buyer: one metric from the sample board report, labelled "Sample data". */
export function BiaBand() {
  const b = copy.landing.biaBand;
  return (
    <MSection tone="subtle" id="bias">
      <div className="grid gap-10 md:grid-cols-2 md:items-center md:gap-16">
        <div>
          <p className="text-meta-strong text-fg-muted">{b.eyebrow}</p>
          <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{b.title}</h2>
          <p className="mt-5 text-[17px] leading-[1.55] text-fg-muted">{b.sub}</p>
          <Button size="lg" variant="secondary" href="/for-bias" className="mt-8 rounded-full!">
            {b.cta}
          </Button>
        </div>
        <SampleReportCard variant="band" />
      </div>
    </MSection>
  );
}
