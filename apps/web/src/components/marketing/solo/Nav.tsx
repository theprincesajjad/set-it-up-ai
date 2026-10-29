import { Wordmark } from "@/components/site/Brand";
import { copy } from "@/copy/en-CA";
import type { SoloKey } from "@/lib/marketing/solo";

const N = copy.solo.nav;

/** The solo pages' top bar: one glass capsule with the trades and one black button. No script (the links are plain anchors). */
export function SoloNav({ current }: { current: SoloKey }) {
  return (
    <header className="sl-nav">
      <div className="sl-nav-in glass">
        <Wordmark />
        <nav aria-label={N.label} className="sl-nav-links">
          {N.links.map((l) => (
            <a key={l.href} href={l.href} aria-current={l.page === current ? "page" : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
        <a className="sl-btn" href="#start">
          {N.cta}
        </a>
      </div>
    </header>
  );
}
