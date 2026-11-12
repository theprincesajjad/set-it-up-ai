import { NotFoundCard } from "@/components/errors/NotFoundCard";
import { PassFooter } from "@/components/site/PassFooter";

/**
 * The root 404 (a URL that matches no area at all). One card with the message, the shopper's way on (the map) and Home, and under a hairline
 * the owner's way on (pricing, sign in). Marketing, pass and the shop consoles have their own not-found.tsx that keep their own chrome.
 * Server-rendered, translated, mirrors in Urdu.
 */
export default function NotFound() {
  return (
    <>
      <main id="main" className="mx-auto max-w-[520px] px-4 py-12 md:py-20">
        <NotFoundCard />
      </main>
      <PassFooter lazyCatalog />
    </>
  );
}
