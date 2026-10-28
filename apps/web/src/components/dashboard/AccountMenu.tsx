"use client";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/primitives/dropdown-menu";
import { sessionApi } from "@/lib/api/browser";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

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

/** The signed-in person in the top bar: initials in a circle that opens Settings, the other consoles they can reach, and sign out. */
export function AccountMenu({ name, email, links = [] }: { name: string | null; email: string | null; links?: { href: string; label: string; icon?: ReactNode }[] }) {
  const router = useRouter();
  const { t, dir } = useLocaleOrEnglish();
  const [busy, setBusy] = useState(false);
  const label = name ?? email ?? t("shell.account.signedIn");
  const item = "min-h-11 gap-2.5 text-body md:min-h-9";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:focus-ring">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-meta-strong text-primary-foreground">{initials(name ?? email)}</span>
        <span className="sr-only">{t("shell.account.menu", { name: label })}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" dir={dir} className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
            <span className="truncate text-body font-medium text-foreground">{label}</span>
            {name && email ? <span className="truncate text-meta text-muted-foreground">{email}</span> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {links.length ? <DropdownMenuSeparator /> : null}
        {links.map((l) => (
          <DropdownMenuItem key={l.href} className={item} render={<Link href={l.href} />}>
            {l.icon ? <span aria-hidden className="inline-flex size-4 items-center justify-center text-muted-foreground">{l.icon}</span> : null}
            {l.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className={item}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await sessionApi.logout().catch(() => undefined);
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut aria-hidden className="text-muted-foreground" strokeWidth={1.75} />
          {t("shell.account.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
