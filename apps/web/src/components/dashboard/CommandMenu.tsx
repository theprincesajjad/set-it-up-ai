"use client";
/** ⌘K: jump to a page, or search records (customers, merchants) when the shell provides `search`. */
import { CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface CommandResult {
  id: string;
  label: string;
  meta?: string;
  href: string;
}

export interface CommandSearch {
  /** Group label ("Customers"). */
  label: string;
  run: (q: string) => Promise<CommandResult[]>;
  /** Minimum characters before searching (default 2). */
  min?: number;
}

export function CommandMenu({ open, onClose, pages, search, placeholder }: { open: boolean; onClose: () => void; pages: { label: string; href: string; icon: LucideIcon }[]; search?: CommandSearch; placeholder: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CommandResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Reset when reopened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ("");
    setResults([]);
    setCursor(0);
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!search || q.trim().length < (search.min ?? 2)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void search
        .run(q.trim())
        .then((r) => live && setResults(r.slice(0, 6)))
        .catch(() => live && setResults([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, search]);

  const matchedPages = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? pages.filter((p) => p.label.toLowerCase().includes(s)) : pages).slice(0, s ? 6 : 8);
  }, [q, pages]);

  const items: { key: string; label: string; meta?: string; href: string; group: string; icon?: LucideIcon }[] = [
    ...results.map((r) => ({ key: `r-${r.id}`, label: r.label, meta: r.meta, href: r.href, group: search?.label ?? "Results" })),
    ...matchedPages.map((p) => ({ key: `p-${p.href}`, label: p.label, href: p.href, group: "Pages", icon: p.icon })),
  ];

  if (!open) return null;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[12vh] print:hidden">
      <button type="button" aria-label="Close search" tabIndex={-1} className="absolute inset-0 cursor-default bg-overlay" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search" className="relative w-full max-w-[560px] overflow-hidden rounded-card border border-line bg-bg shadow-float motion-safe:animate-fade-in">
        <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
          <Search aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(items.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter" && items[cursor]) {
                e.preventDefault();
                go(items[cursor]!.href);
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-full flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
          />
          <kbd className="rounded-[5px] border border-line px-1.5 text-[11px] text-fg-muted">esc</kbd>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-1.5">
          {items.length === 0 ? <li className="px-3 py-6 text-meta text-fg-muted">No matches.</li> : null}
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === cursor}>
              {i === 0 || items[i - 1]!.group !== it.group ? <div className="px-2.5 pb-1 pt-2 text-caption font-medium text-fg-muted">{it.group}</div> : null}
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(it.href)}
                className={cn("flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-start text-meta", i === cursor ? "bg-bg-subtle text-fg" : "text-fg")}
              >
                {it.icon ? <it.icon aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} /> : null}
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.meta ? <span className="truncate text-fg-muted">{it.meta}</span> : null}
                {i === cursor ? <CornerDownLeft aria-hidden className="size-3.5 text-fg-muted" /> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
