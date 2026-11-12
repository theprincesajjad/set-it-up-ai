import { CloudOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The shell of every full-page failure (the fail-screen standard): an h1 that says what happened in plain words, one line of why with
 * reassurance where true, ONE primary action, a way out, and who to contact. Server-safe (no hooks): callers pass translated text.
 *
 *   <FailScreen title={t("err.network.title")} description={t("err.network.body")} primary={<RetryButton label={t("err.action.retry")} />}
 *               secondary={<Button variant="ghost" href="/">{t("err.action.home")}</Button>} help={t("err.help.customer")} />
 *
 * For a screen built from a thrown error use `<ErrorScreen error={e} />`; for a route boundary use `<RouteError />`.
 */
export interface FailScreenProps {
  title: string;
  /** Why, in one or two sentences, with reassurance where it is true ("Nothing was lost"). */
  description?: ReactNode;
  /** Who to contact ("If it keeps happening, email …"). Smaller text under the description. */
  help?: ReactNode;
  /** A short code support can trace (the error digest). Shown as "Reference: 3fa9c2d1". */
  reference?: ReactNode;
  icon?: LucideIcon;
  /** The one thing that most likely fixes it. */
  primary?: ReactNode;
  /** A way out, so nobody is stranded. */
  secondary?: ReactNode;
  /** Heading level of the title. 1 when this is the whole page (default), 2 when it sits inside a page that has its own h1. */
  level?: 1 | 2;
  className?: string;
}

export function FailScreen({ title, description, help, reference, icon = CloudOff, primary, secondary, level = 1, className }: FailScreenProps) {
  const body =
    description || help || reference ? (
      <>
        {description}
        {help ? <span className="mt-2 block text-meta text-fg-muted">{help}</span> : null}
        {reference ? <span className="mt-3 block text-caption tabular-nums text-fg-subtle">{reference}</span> : null}
      </>
    ) : undefined;
  return (
    <div data-state="error" data-fail-screen className={className}>
      <EmptyState icon={icon} tone="danger" title={title} description={body} headingLevel={level} action={primary} secondaryAction={secondary} />
    </div>
  );
}
