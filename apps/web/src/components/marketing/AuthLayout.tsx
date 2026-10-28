import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/copy/en-CA";
import { ArtTiles } from "./HeroArt";

/**
 * Sign-in and sign-up: the form sits on a white card (the one thing to do on the page), with the warm picture and the three
 * promises beside it on wide screens. The picture is decorative and drops away on phones, so the form comes first.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const promises = copy.landing.heroTrust.split(" · ");
  return (
    <div className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 py-10 md:grid-cols-[1fr_1.05fr] md:gap-14 md:px-8 md:py-16">
      <aside className="max-md:hidden md:sticky md:top-24">
        <ArtTiles />
        <ul className="mt-6 flex flex-col gap-3">
          {promises.map((p) => (
            <li key={p} className="flex items-center gap-3 text-body text-foreground">
              <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-forest text-forest-foreground">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </aside>
      <div className="rounded-sheet bg-card p-6 shadow-card md:p-10">{children}</div>
    </div>
  );
}
