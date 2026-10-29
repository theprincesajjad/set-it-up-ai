"use client";
/**
 * "Get your reminder on this phone" (docs/business/people-side.md gaps 3 and 10): on the booking confirmation and the web pass.
 * Turns on web push (free, no app, no text). On an iPhone it first asks to add the page to the home screen, where iOS allows it.
 * Hidden once on, and after "Not now" for this browser.
 */
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { currentWebPush, notificationPermission, turnOnWebPush, webPushSupport, type WebPushSupport } from "@/lib/webpush";

const LATER_KEY = "ll-webpush-later";

export function NotifyPrompt({ className, compact }: { className?: string; compact?: boolean }) {
  const { t } = useLocaleOrEnglish();
  const [support, setSupport] = useState<WebPushSupport | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "on" | "denied" | "failed" | "hidden">("idle");
  useEffect(() => {
    let live = true;
    const s = webPushSupport();
    let later = false;
    try {
      later = window.localStorage.getItem(LATER_KEY) === "1";
    } catch {
      later = false;
    }
    void (async () => {
      const sub = s === "supported" ? await currentWebPush().catch(() => null) : null;
      if (!live) return;
      setSupport(s);
      if (sub) setState("on");
      else if (notificationPermission() === "denied") setState("denied");
      else if (later && compact) setState("hidden");
    })();
    return () => {
      live = false;
    };
  }, [compact]);

  if (!support || state === "hidden" || (support === "unsupported" && compact)) return null;
  if (state === "on" && compact) return null;

  const later = () => {
    try {
      window.localStorage.setItem(LATER_KEY, "1");
    } catch {
      /* private window: nothing to remember */
    }
    setState("hidden");
  };

  return (
    <section aria-labelledby="notify-h" className={`flex flex-col gap-3 rounded-card bg-bg-subtle p-4 ${className ?? ""}`} data-testid="notify-prompt">
      <div className="flex items-start gap-3">
        <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-fg">
          <BellRing className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="notify-h" className="text-body-strong text-fg">{support === "ios_install" ? t("webpush.prompt.iosTitle") : t("webpush.prompt.title")}</h2>
          <p className="text-meta text-fg-muted" aria-live="polite">
            {state === "on"
              ? t("webpush.prompt.on")
              : state === "denied"
                ? t("webpush.prompt.denied")
                : state === "failed"
                  ? t("webpush.prompt.failed")
                  : support === "ios_install"
                    ? t("webpush.prompt.ios")
                    : support === "unsupported"
                      ? t("webpush.prompt.unsupported")
                      : t("webpush.prompt.body")}
          </p>
        </div>
      </div>
      {support === "supported" && state !== "on" && state !== "denied" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="md"
            loading={state === "busy"}
            onClick={async () => {
              setState("busy");
              setState(await turnOnWebPush());
            }}
          >
            {t("webpush.prompt.cta")}
          </Button>
          {compact ? <Button size="md" variant="ghost" onClick={later}>{t("webpush.prompt.later")}</Button> : null}
        </div>
      ) : null}
    </section>
  );
}
