import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Layout";
import { LEGAL_DOCS, loadLegalDoc, type LegalSlug } from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

type Props = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  const meta = LEGAL_DOCS[doc as LegalSlug];
  // Drafts are not ready to publish: keep them out of search results.
  return meta ? { title: meta.title, robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}` } } : {};
}

export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) notFound();
  const { html, isDraft } = await loadLegalDoc(doc as LegalSlug);
  return (
    <>
      {isDraft ? (
        <div role="note" className="sticky top-16 z-banner border-b border-warning bg-warning text-on-warning">
          <p className="mx-auto flex max-w-[720px] items-center gap-2 px-4 py-2 text-label md:px-6">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            DRAFT: not reviewed by a lawyer and not in effect.
          </p>
        </div>
      ) : null}
      <Container size="prose" className="py-10">
        <p className="text-overline uppercase text-fg-muted">Legal{isDraft ? " · Draft" : ""}</p>
        <article className="prose-ll" dangerouslySetInnerHTML={{ __html: html }} />
      </Container>
    </>
  );
}
