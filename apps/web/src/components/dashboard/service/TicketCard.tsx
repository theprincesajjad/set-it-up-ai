import Link from "next/link";
import { Dot } from "@/components/dashboard/kit";
import { cn } from "@/lib/cn";
import type { CardModel, Tone } from "@/lib/dashboard/tickets";

const TEXT: Record<Tone, string> = { accent: "text-fg", info: "text-location", positive: "text-fg", negative: "text-negative", neutral: "text-fg-muted" };

/** One ticket on the board: number and status top row, device, issue, who and when, one money or state line. */
export function TicketCard({ model: m, href }: { model: CardModel; href: string }) {
  return (
    <Link href={href} className="block rounded-card bg-hover bg-card px-4 py-3.5 transition-colors hover:bg-bg-subtle focus-visible:focus-ring">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta-strong text-fg tabular">#{m.number}</span>
        <Dot tone={m.tone === "neutral" ? "neutral" : m.tone}>{m.statusLabel}</Dot>
      </div>
      <p className="mt-1.5 truncate text-body-strong text-fg">{m.title}</p>
      <p className="truncate text-meta text-fg-muted">{m.issue}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className={cn("min-w-0 truncate text-meta", m.overdue ? "text-negative" : "text-fg-muted")}>{m.who}</p>
        {m.initials ? (
          <span aria-label={`Assigned to ${m.initials}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-muted text-caption font-semibold text-fg-muted">
            {m.initials}
          </span>
        ) : null}
      </div>
      {m.note ? <p className={cn("mt-1.5 truncate text-meta", TEXT[m.note.tone])}>{m.note.text}</p> : null}
    </Link>
  );
}
