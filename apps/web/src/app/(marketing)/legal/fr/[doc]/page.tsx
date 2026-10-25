/**
 * The French (fr-CA) legal pages for Law 25. Visitors reach them at /legal/<doc>?lang=fr: next.config.ts rewrites that
 * to this static route, so the pages stay statically generated and the address bar keeps the ?lang=fr form.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocView } from "@/components/site/LegalDocView";
import { LEGAL_DOCS_FR, hasFrench, loadLegalDoc } from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS_FR).map((doc) => ({ doc }));
}

type Props = { params: Promise<{ doc: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!hasFrench(doc)) return {};
  return { title: LEGAL_DOCS_FR[doc].title, robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}?lang=fr`, languages: { "en-CA": `/legal/${doc}` } } };
}

export default async function LegalPageFr({ params }: Props) {
  const { doc } = await params;
  if (!hasFrench(doc)) notFound();
  const { html, isDraft } = await loadLegalDoc(doc, "fr");
  return <LegalDocView html={html} isDraft={isDraft} lang="fr" otherHref={`/legal/${doc}`} />;
}
