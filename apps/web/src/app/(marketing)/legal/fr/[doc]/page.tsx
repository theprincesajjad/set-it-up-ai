/**
 * The French (fr-CA) legal pages for Law 25. Visitors reach them at /legal/<doc>?lang=fr: next.config.ts rewrites that
 * to this static route, so the pages stay statically generated and the address bar keeps the ?lang=fr form.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocView } from "@/components/site/LegalDocView";
import { BRAND } from "@ll/shared";
import { LEGAL_DOCS_FR, hasFrench, loadLegalDoc, type LegalFrSlug } from "@/lib/legal";
import { preloadInter } from "@/lib/fonts/inter";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS_FR).map((doc) => ({ doc }));
}

type Props = { params: Promise<{ doc: string }> };

/** The French pages' own line for search results and link previews (the layout's default is the English site description). */
const DESCRIPTIONS: Record<LegalFrSlug, string> = {
  privacy: `Ce que ${BRAND.name} recueille, comment c’est utilisé, qui y a accès, combien de temps c’est conservé et vos choix sur vos renseignements.`,
  rewards: `Le fonctionnement des points, des timbres et des récompenses sur ${BRAND.name} : qui les émet, comment les gagner et les échanger, et ce qui arrive si un commerce part.`,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params;
  if (!hasFrench(doc)) return {};
  return { title: LEGAL_DOCS_FR[doc].title, description: DESCRIPTIONS[doc], robots: { index: false, follow: true }, alternates: { canonical: `/legal/${doc}?lang=fr`, languages: { "en-CA": `/legal/${doc}` } } };
}

export default async function LegalPageFr({ params }: Props) {
  preloadInter();
  const { doc } = await params;
  if (!hasFrench(doc)) notFound();
  const { html, isDraft } = await loadLegalDoc(doc, "fr");
  return <LegalDocView html={html} isDraft={isDraft} lang="fr" otherHref={`/legal/${doc}`} />;
}
