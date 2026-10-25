import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/ui/Layout";

const COPY = {
  en: { banner: "DRAFT: not reviewed by a lawyer and not in effect.", legal: "Legal", draft: "Draft", other: "Français", otherLang: "fr-CA" },
  fr: { banner: "BROUILLON : non révisé par un juriste et non en vigueur.", legal: "Juridique", draft: "Brouillon", other: "English", otherLang: "en-CA" },
} as const;

/** A legal page: the DRAFT banner (when the source is a draft), the language switch (when there is another language) and the article. */
export function LegalDocView({ html, isDraft, lang, otherHref }: { html: string; isDraft: boolean; lang: "en" | "fr"; otherHref?: string }) {
  const c = COPY[lang];
  return (
    <>
      {isDraft ? (
        <div role="note" className="sticky top-16 z-banner border-b border-line bg-bg-subtle text-fg">
          <p className="mx-auto flex max-w-[720px] items-center gap-2 px-4 py-2.5 text-meta-strong md:px-6">
            <TriangleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {c.banner}
          </p>
        </div>
      ) : null}
      <Container size="prose" className="py-12 md:py-16">
        <div className="mb-6 flex items-center justify-between gap-4">
          <p className="text-meta-strong text-fg-muted">
            {c.legal}
            {isDraft ? ` · ${c.draft}` : ""}
          </p>
          {otherHref ? (
            <Link href={otherHref} lang={c.otherLang} hrefLang={c.otherLang} prefetch={false} className="text-meta-strong text-fg underline underline-offset-4 focus-visible:focus-ring">
              {c.other}
            </Link>
          ) : null}
        </div>
        <article lang={lang === "fr" ? "fr-CA" : undefined} className="prose-ll" dangerouslySetInnerHTML={{ __html: html }} />
      </Container>
    </>
  );
}
