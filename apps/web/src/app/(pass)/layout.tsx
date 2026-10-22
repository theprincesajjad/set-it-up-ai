import { PassFooter } from "@/components/site/PassFooter";

/** Customer web pass + public transactional pages: single column, max 480, paper canvas. */
export default function PassLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main" className="mx-auto w-full max-w-[480px] px-4 pt-4">
        {children}
      </main>
      <PassFooter />
    </>
  );
}
