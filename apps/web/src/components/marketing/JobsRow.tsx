import { MHeading, MSection } from "./Section";

export interface SoloJob {
  eyebrow: string;
  title: string;
  body: string;
  rows: readonly string[];
}

const TONES = ["bg-tile-peach text-tile-peach-foreground", "bg-tile-mint text-tile-mint-foreground", "bg-tile-butter text-tile-butter-foreground"];

/** Three jobs as cards (book, deposit, remind; or line, family, payouts), each with a three-row example. The rows are samples; the page says so in the hero caption. */
export function JobsRow({ eyebrow, title, jobs, id = "jobs" }: { eyebrow: string; title: string; jobs: readonly SoloJob[]; id?: string }) {
  return (
    <MSection id={id}>
      <MHeading eyebrow={eyebrow} title={title} />
      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {jobs.map((j, n) => (
          <article key={j.eyebrow} className="mkt-lift flex flex-col rounded-sheet bg-card p-6 shadow-card md:p-7">
            <p className={`w-fit rounded-full px-3 py-1 text-meta-strong ${TONES[n % TONES.length]}`}>{j.eyebrow}</p>
            <h3 className="display mt-3 text-title text-balance md:text-[26px] md:leading-8">{j.title}</h3>
            <p className="mt-3 text-body text-muted-foreground">{j.body}</p>
            <ul className="mt-5 divide-y divide-border rounded-card bg-bg-subtle px-4 text-meta text-foreground">
              {j.rows.map((r) => (
                <li key={r} className="py-2.5">
                  {r}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </MSection>
  );
}
