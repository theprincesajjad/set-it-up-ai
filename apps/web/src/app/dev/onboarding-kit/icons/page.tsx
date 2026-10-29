import type { Metadata } from "next";
import { ICON3D_SCENES, ICON3D_STEP, ICON3D_TRADE } from "@ll/design-tokens";
import { Icon3d } from "@/components/ui/Icon3d";

export const metadata: Metadata = { title: "3D icon contact sheet", robots: { index: false, follow: false } };

const groups = [
  ["Trade objects", ICON3D_TRADE],
  ["Step and concept objects", ICON3D_STEP],
] as const;

/** Every icon at 1x (48) and 2x (96) on the Clear canvas. `?theme=clear-dark` for dark, `?trade=rose` for an accent. */
export default async function IconSheet({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const trade = sp.trade ?? undefined;
  return (
    <main id="main" className="min-h-dvh bg-background px-6 py-6 text-foreground" data-trade={trade}>
      <h1 className="mb-4 text-large-title">3D icon contact sheet</h1>
      {groups.map(([title, names]) => (
        <section key={title} className="mb-6" aria-label={title}>
          <h2 className="mb-2 text-headline text-muted-foreground">{title}</h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-3">
            {names.map((n) => (
              <li key={n} className="flex flex-col items-center gap-2 rounded-r4 p-2" data-icon={n}>
                <div className="flex items-end gap-3">
                  <Icon3d name={n} size={96} trade={trade} />
                  <Icon3d name={n} size={48} trade={trade} />
                </div>
                <span className="text-meta text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-label="Spot illustrations">
        <h2 className="mb-2 text-headline text-muted-foreground">Spot illustrations (160 x 120 at 1x and 2x)</h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
          {ICON3D_SCENES.map((n) => (
            <li key={n} className="flex flex-col items-center gap-2 p-2" data-icon={n}>
              <div className="flex items-end gap-4">
                <Icon3d name={n} size={240} trade={trade} />
                <Icon3d name={n} size={120} trade={trade} />
              </div>
              <span className="text-meta text-muted-foreground">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
