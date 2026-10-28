import { PassFooter } from "@/components/site/PassFooter";

/** Customer web pass + public transactional pages: single column, max 480, on the `paper` canvas (cards are white on it). */
export default function PassLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <main id="main" className="mx-auto w-full max-w-[480px] px-4 pt-4">
        {children}
      </main>
      <PassFooter />
    </div>
  );
}
