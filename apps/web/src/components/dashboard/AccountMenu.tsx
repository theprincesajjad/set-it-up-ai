"use client";
import { CircleHelp, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { sessionApi } from "@/lib/api/browser";

/** Sidebar footer: help + signed-in user + sign out. */
export function AccountMenu({ name, email, links = [] }: { name: string | null; email: string | null; links?: { href: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <a href="mailto:help@localloyalty.example" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-label text-fg-muted hover:bg-surface-sunken hover:text-fg">
        <CircleHelp aria-hidden className="size-5" /> Help
      </a>
      {links.map((l) => (
        <a key={l.href} href={l.href} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-label text-fg-muted hover:bg-surface-sunken hover:text-fg">
          {l.label}
        </a>
      ))}
      <div className="flex items-center gap-3 px-1">
        <Avatar name={name ?? email} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg">{name ?? "Signed in"}</p>
          {email ? <p className="truncate text-caption text-fg-muted">{email}</p> : null}
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
          className="inline-flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-sunken focus-visible:focus-ring"
        >
          <LogOut aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  );
}
