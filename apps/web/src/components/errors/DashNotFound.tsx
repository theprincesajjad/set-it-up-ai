"use client";
import { SearchX } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { FailScreen } from "./FailScreen";
import { GoBackButton } from "./actions";

/**
 * The 404 INSIDE the shop dashboard (rendered by `m/[merchantId]/not-found.tsx`, so the shell and its navigation stay): "We couldn't
 * find that page", with Back to Today and Go back. Also used for the admin, rep and BIA consoles with their own home.
 */
export function ConsoleNotFound({ home, title, description }: { home: { href: string; label: string }; title?: string; description?: string }) {
  const { t } = useLocaleOrEnglish();
  return (
    <FailScreen
      title={title ?? t("err.dash.notFound.title")}
      description={description ?? t("err.dash.notFound.body")}
      icon={SearchX}
      primary={<Button href={home.href}>{home.label}</Button>}
      secondary={<GoBackButton label={t("err.action.back")} fallbackHref={home.href} variant="ghost" />}
    />
  );
}

/** The shop dashboard's 404: home is `/m/<id>` (from the route params). */
export function DashNotFound() {
  const { t } = useLocaleOrEnglish();
  const params = useParams<{ merchantId?: string }>();
  const path = usePathname();
  const id = params?.merchantId ?? /^\/m\/([^/]+)/.exec(path ?? "")?.[1];
  return <ConsoleNotFound home={{ href: id ? `/m/${id}` : "/m", label: id ? t("err.action.today") : t("err.action.dashboard") }} />;
}
