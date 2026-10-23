import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { copy } from "@/copy/en-CA";

/** "Who are you?": three doors, one per buyer, so restaurants and BIAs reach their own page from the first scroll. */
export function AudienceRouter() {
  const r = copy.landing.router;
  return (
    <section aria-label={r.label} className="pb-12 md:pb-20">
      <div className="mx-auto max-w-[1200px] px-4 md:px-8">
        <ul className="grid divide-y divide-line overflow-hidden rounded-sheet border border-line md:grid-cols-3 md:divide-x md:divide-y-0">
          {r.items.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="group flex h-full flex-col gap-3 p-6 transition-colors hover:bg-bg-subtle focus-visible:focus-ring md:p-7">
                <span className="text-meta text-fg-muted">{i.eyebrow}</span>
                <span className="display text-title text-balance md:text-[24px] md:leading-7">{i.title}</span>
                <span className="mt-auto inline-flex items-center gap-2 pt-2 text-meta-strong text-fg">
                  {i.cta}
                  <ArrowRight aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" strokeWidth={1.75} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
