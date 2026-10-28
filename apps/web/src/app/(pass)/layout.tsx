import { PassFooter } from "@/components/site/PassFooter";
import { LiquidGlassLens } from "@/components/ui/LiquidGlassLens";

/**
 * Customer web pass + public transactional pages: single column, max 480, on the `paper` canvas (cards are white on it).
 * Clear: the canvas is #F2F2F7 and the glass chrome (pass card, tab bar, map sheet) gets its Chromium refraction from <LiquidGlassLens/>
 * (inert under Warm). `overflow-x-clip` keeps full-bleed pieces (the pass's brand field) from adding a horizontal scroll.
 */
export default function PassLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-paper">
      <main id="main" className="mx-auto w-full max-w-[480px] px-4 pt-4">
        {children}
      </main>
      <PassFooter />
      <LiquidGlassLens />
    </div>
  );
}
