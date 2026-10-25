import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocView } from "@/components/site/LegalDocView";
import { LEGAL_DOCS, hasFrench, loadLegalDoc, type LegalSlug } from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

type Props = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  const meta = LEGAL_DOCS[doc as LegalSlug];
  // Drafts are not ready to publish: keep them out of search results.
  return meta
    ? { title: meta.title, robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}`, ...(hasFrench(doc) ? { languages: { "fr-CA": `/legal/${doc}?lang=fr` } } : {}) } }
    : {};
}

export default async function LegalPage({ params }: Props) {
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) notFound();
  const { html, isDraft } = await loadLegalDoc(doc as LegalSlug);
  return <LegalDocView html={html} isDraft={isDraft} lang="en" otherHref={hasFrench(doc) ? `/legal/${doc}?lang=fr` : undefined} />;
}
