import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BRAND } from "@ll/shared";
import { LegalDocView } from "@/components/site/LegalDocView";
import { LEGAL_DOCS, hasFrench, loadLegalDoc, type LegalSlug } from "@/lib/legal";
import { preloadInter } from "@/lib/fonts/inter";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

type Props = { params: Promise<{ doc: string }> };

/** One line per document for search results and link previews: what the document covers, in its own section names. */
const DESCRIPTIONS: Record<LegalSlug, string> = {
  terms: `The customer terms for ${BRAND.name}: your account, messages, orders and payments, ending your account and how disputes are handled.`,
  privacy: `What ${BRAND.name} collects, how it is used, who sees it, how long it is kept and the choices you have over your information.`,
  rewards: `How points, stamps and rewards work on ${BRAND.name}: who issues them, earning, redeeming and what happens if a shop leaves.`,
  merchants: `The agreement between ${BRAND.name} and the shops that use it: plans, data and customer relationships, fees and ending the service.`,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  const meta = LEGAL_DOCS[doc as LegalSlug];
  // Drafts are not ready to publish: keep them out of search results.
  return meta
    ? { title: meta.title, description: DESCRIPTIONS[doc as LegalSlug], robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}`, ...(hasFrench(doc) ? { languages: { "fr-CA": `/legal/${doc}?lang=fr` } } : {}) } }
    : {};
}

export default async function LegalPage({ params }: Props) {
  preloadInter();
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) notFound();
  const { html, isDraft } = await loadLegalDoc(doc as LegalSlug);
  return <LegalDocView html={html} isDraft={isDraft} lang="en" otherHref={hasFrench(doc) ? `/legal/${doc}?lang=fr` : undefined} />;
}
