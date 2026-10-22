import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LogoMark } from "./Brand";

/** Public pages: the shop is the hero; our brand only appears here, quietly. */
export function PassFooter() {
  return (
    <footer className="mx-auto mt-12 flex w-full max-w-[480px] flex-col items-center gap-2 border-t border-line px-4 pt-6 pb-10 text-center">
      <Link href="/for-shoppers" className="inline-flex items-center gap-2 text-meta text-fg-muted hover:text-fg">
        <LogoMark size={16} />
        <span>
          Part of {BRAND.name} · one card for every shop on your street
        </span>
      </Link>
      <p className="flex gap-3 text-meta text-fg-subtle">
        <Link href="/legal/terms" className="hover:text-fg">
          Terms
        </Link>
        <Link href="/legal/privacy" className="hover:text-fg">
          Privacy
        </Link>
        <Link href="/legal/rewards" className="hover:text-fg">
          Rewards terms
        </Link>
      </p>
    </footer>
  );
}
