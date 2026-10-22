import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LogoMark } from "./Brand";

/** Public pages: the shop is the hero; our brand only appears here. */
export function PassFooter() {
  return (
    <footer className="mx-auto mt-10 flex w-full max-w-[480px] flex-col items-center gap-2 px-4 pb-10 text-center">
      <Link href="/for-shoppers" className="inline-flex items-center gap-2 text-caption text-fg-muted hover:text-fg">
        <LogoMark size={20} />
        <span>
          Part of {BRAND.name} · One card for every shop on your street
        </span>
      </Link>
      <p className="text-caption text-fg-muted">
        <Link href="/legal/terms" className="underline">
          Terms
        </Link>{" "}
        ·{" "}
        <Link href="/legal/privacy" className="underline">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/legal/rewards" className="underline">
          Rewards terms
        </Link>
      </p>
    </footer>
  );
}
