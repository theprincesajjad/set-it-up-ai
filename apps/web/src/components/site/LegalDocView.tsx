import { TriangleAlert } from "lucide-react";
import Link from "next/link";

const COPY = {
  en: { banner: "DRAFT: not reviewed by a lawyer and not in effect.", legal: "Legal", draft: "Draft", other: "Français", otherLang: "fr-CA", toc: "On this page" },
  fr: { banner: "BROUILLON : non révisé par un juriste et non en vigueur.", legal: "Juridique", draft: "Brouillon", other: "English", otherLang: "en-CA", toc: "Sur cette page" },
} as const;

/** "1. What Local Loyalty is" -> "s1-what-local-loyalty-is": a stable anchor per section heading. */
const slug = (text: string, i: number) =>
  `s${i + 1}-${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)}`;

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

/** Gives every <h2> of the rendered markdown an id and returns the list for the contents rail (wave Q). */
function withSectionIds(html: string): { html: string; sections: { id: string; label: string }[] } {
  const sections: { id: string; label: string }[] = [];
  const out = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
    const label = plain(inner);
    const id = slug(label, sections.length);
    sections.push({ id, label });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, sections };
}

/**
 * A legal page: the DRAFT banner (when the source is a draft), the language switch (when there is another language) and the article.
 * Wave Q: on wide screens a sticky "On this page" rail lists the sections (anchors on each h2), so a long policy is easy to move around.
 */
export function LegalDocView({ html, isDraft, lang, otherHref }: { html: string; isDraft: boolean; lang: "en" | "fr"; otherHref?: string }) {
  const c = COPY[lang];
  const doc = withSectionIds(html);
  return (
    <>
      {isDraft ? (
        <div role="note" className="sticky top-16 z-banner border-b border-line bg-bg-subtle text-fg">
          <p className="mx-auto flex max-w-[1080px] items-center gap-2 px-4 py-2.5 text-meta-strong md:px-6">
            <TriangleAlert aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            {c.banner}
          </p>
        </div>
      ) : null}
      <div className="mx-auto grid max-w-[1080px] gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        {doc.sections.length > 2 ? (
          <nav aria-label={c.toc} className="max-lg:hidden">
            <div className="sticky top-32">
              <p className="text-meta-strong text-fg">{c.toc}</p>
              <ol className="mt-3 flex flex-col border-s border-line">
                {doc.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="-ms-px block border-s border-transparent py-1.5 ps-4 text-meta text-fg-muted transition-colors hover:border-fg hover:text-fg focus-visible:focus-ring">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : (
          <span className="max-lg:hidden" />
        )}
        <div className="min-w-0 max-w-[720px]">
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
          <article lang={lang === "fr" ? "fr-CA" : undefined} className="prose-ll [&_h2]:scroll-mt-32" dangerouslySetInnerHTML={{ __html: doc.html }} />
        </div>
      </div>
    </>
  );
}
