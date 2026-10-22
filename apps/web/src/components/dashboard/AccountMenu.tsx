"use client";
import { CircleHelp, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sessionApi } from "@/lib/api/browser";

function initials(s: string | null) {
  return (
    (s ?? "?")
      .trim()
      .split(/[\s@.]+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Sidebar footer: help + extra links + signed-in user with sign out. */
export function AccountMenu({ name, email, links = [] }: { name: string | null; email: string | null; links?: { href: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const row = "flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[14px] text-fg hover:bg-bg-muted/60 focus-visible:focus-ring";
  return (
    <div className="flex flex-col gap-px">
      <a href="mailto:help@localloyalty.example" className={row}>
        <CircleHelp aria-hidden className="size-4 text-fg-muted" strokeWidth={1.75} /> Help
      </a>
      {links.map((l) => (
        <a key={l.href} href={l.href} className={row}>
          <span aria-hidden className="inline-flex size-4 items-center justify-center text-fg-muted">
            ↗
          </span>
          {l.label}
        </a>
      ))}
      <div className="mt-2 flex items-center gap-2.5 px-2">
        <span aria-hidden className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-muted text-caption font-semibold text-fg">
          {initials(name ?? email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-meta font-medium text-fg">{name ?? "Signed in"}</p>
          {email ? <p className="truncate text-caption font-normal text-fg-muted">{email}</p> : null}
        </div>
        <button
          type="button"
          aria-label="Sign out"
          title="Sign out"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await sessionApi.logout().catch(() => undefined);
            router.push("/login");
            router.refresh();
          }}
          className="inline-flex size-8 items-center justify-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg focus-visible:focus-ring"
        >
          <LogOut aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
