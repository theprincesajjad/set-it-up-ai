import { Star } from "lucide-react";
import { MHeading, MSection } from "./Section";

/**
 * The built-in website, shown as three presets with a sample pro's data. Flat colour blocks only (no gradient), tokens for every
 * colour. TODO(G): use the real preset names and renders when the site builder lands.
 */
const PRESETS = [
  { key: "clean", name: "Clean", page: "bg-card text-foreground", band: "bg-tile-mint text-tile-mint-foreground", button: "bg-primary text-primary-foreground", radius: "rounded-card" },
  { key: "bold", name: "Bold", page: "bg-forest text-forest-foreground", band: "bg-tile-butter text-tile-butter-foreground", button: "bg-card text-foreground", radius: "rounded-[6px]" },
  { key: "soft", name: "Soft", page: "bg-tile-rose text-tile-rose-foreground", band: "bg-card text-foreground", button: "bg-foreground text-background", radius: "rounded-[24px]" },
] as const;

const SERVICES: [string, string][] = [
  ["Gel manicure", "$55"],
  ["Gel fill", "$65"],
  ["Nail art", "from $15"],
];

export function PresetsBand({ eyebrow, title, sub, sample, siteName, book, reviews }: { eyebrow: string; title: string; sub: string; sample: string; siteName: string; book: string; reviews: string }) {
  return (
    <MSection id="site">
      <MHeading eyebrow={eyebrow} title={title} sub={sub} />
      <ul className="grid gap-5 md:grid-cols-3">
        {PRESETS.map((p) => (
          <li key={p.key}>
            <div aria-hidden inert data-theme="light" className="overflow-hidden rounded-sheet border border-border bg-card shadow-card">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted px-3 py-2">
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="ms-2 truncate text-[11px] text-muted-foreground">mira.ca</span>
              </div>
              <div className={`flex flex-col gap-3 p-5 ${p.page}`}>
                <p className="display text-title">{siteName}</p>
                <span className={`inline-flex h-9 w-fit items-center rounded-full px-4 text-[13px] font-semibold ${p.button}`}>{book}</span>
                <ul className={`divide-y divide-border px-3 text-[13px] ${p.band} ${p.radius}`}>
                  {SERVICES.map(([n, pr]) => (
                    <li key={n} className="flex justify-between py-2.5">
                      <span>{n}</span>
                      <span className="tabular-nums">{pr}</span>
                    </li>
                  ))}
                </ul>
                <p className="flex items-center gap-1 text-[12px]">
                  <Star className="size-3.5" fill="currentColor" />
                  {reviews}
                </p>
              </div>
            </div>
            <p className="mt-3 text-meta-strong text-foreground">{p.name}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-caption text-muted-foreground">{sample}</p>
    </MSection>
  );
}
