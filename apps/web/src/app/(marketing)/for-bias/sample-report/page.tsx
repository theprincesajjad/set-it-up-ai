import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { SampleReportCard } from "@/components/marketing/SampleReportCard";
import { MSection } from "@/components/marketing/Section";
import { copy } from "@/copy/en-CA";

export const metadata: Metadata = {
  title: copy.bia.sample.pageTitle,
  description: "A sample board report for a BIA street event. Every number is made up.",
  alternates: { canonical: "/for-bias/sample-report" },
};

/** The sample board report on its own, for printing or saving as a PDF. No email needed; the numbers are labelled "Sample data". */
export default function SampleReportPage() {
  return (
    <MSection className="md:py-16!">
      <div className="mx-auto max-w-3xl">
        <p className="text-meta-strong text-muted-foreground print:hidden">For BIAs</p>
        <h1 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{copy.bia.sample.pageTitle.toLowerCase()}.</h1>
        <p className="mt-4 text-body text-muted-foreground">{copy.bia.sample.pageNote}</p>
        <SampleReportCard variant="page" className="mt-8" />
        <Button variant="ghost" href="/for-bias#talk" className="mt-6 print:hidden">
          Plan a campaign for your street
        </Button>
      </div>
    </MSection>
  );
}
