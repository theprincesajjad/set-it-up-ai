"use client";
import { Star } from "lucide-react";
import { useRef, useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { TextField } from "@/components/ui/TextField";
import { browserApi, browserClient } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { restaurantCustomerApi } from "@/lib/restaurant/api";

const restaurantApi = restaurantCustomerApi(browserClient);

/**
 * /r/<token>: one-tap rating, an optional private note, and two equal buttons: send to the restaurant, or leave a public Google
 * review. Both show at every rating, in the same place and weight (Google's policy: ask every guest the same way, never gate by rating).
 */
export function ReviewView({ token, initial }: { token: string; initial: whatsappApi.PublicReviewView }) {
  const { number, t, rich } = useLocaleOrEnglish();
  const shop = initial.merchant;
  const [rating, setRating] = useState<number>(initial.rating ?? 0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<whatsappApi.ReviewSubmitResponse | null>(null);
  const url = done?.googleReviewUrl ?? initial.googleReviewUrl;
  const answered = done !== null || initial.alreadyResponded;
  const finalRating = done?.rating ?? initial.rating ?? rating;

  async function submit() {
    if (!rating) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await browserApi.public.submitReview(token, { rating, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) }));
    } catch (e) {
      setError(isApiError(e) && !e.isNetwork && e.status < 500 && e.status !== 404 ? e.message : t("review.error"));
    } finally {
      setBusy(false);
    }
  }

  // Same button, same weight, whatever the rating. Opening it is counted once so the owner can see how many guests used it.
  const google = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" onClick={() => void restaurantApi.reviewGoogleOpened(token).catch(() => undefined)} className={buttonClasses({ variant: "secondary", size: "lg", fullWidth: true })}>
      {t("review.google")}
    </a>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-3 pt-2">
        <ShopLogo shop={{ name: shop.name, vertical: "other", logoUrl: shop.logoUrl }} size={40} />
        <p className="min-w-0 flex-1 truncate text-body-strong text-fg"><bdi>{shop.name}</bdi></p>
      </header>

      {answered ? (
        <section aria-live="polite" className="flex flex-col gap-4">
          <Stars value={finalRating} readOnly label={(n) => t("review.stars", { n: number(n) })} />
          <h1 className="text-title text-fg [text-wrap:balance]">{done ? rich("review.thanks", { shop: shop.name }) : t("review.alreadyRated", { n: number(finalRating) })}</h1>
          {google}
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-title text-fg [text-wrap:balance]">{rich("review.title", { shop: shop.name })}</h1>
            <p className="mt-1 text-body text-fg-muted">{t("review.sub")}</p>
          </div>
          <Stars value={rating} onChange={setRating} label={(n) => t("review.stars", { n: number(n) })} />
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <TextField type="textarea" label={t("review.feedbackLabel")} hint={rich("review.feedbackHint", { shop: shop.name })} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} optionalLabel={false} rows={3} />
            {error ? <Banner tone="danger">{error}</Banner> : null}
            <Button type="submit" size="lg" fullWidth loading={busy} disabled={!rating}>
              {initial.kind === "appointment" ? t("review.sendPrivateVisit", { shop: shop.name }) : t("review.sendPrivate")}{/* phase-pro: p4 */}
            </Button>
            {google}
          </form>
        </section>
      )}
    </div>
  );
}

/** 1 to 5 star picker (radio group, arrow keys move it) or a read-only row. */
function Stars({ value, onChange, readOnly, label }: { value: number; onChange?: (n: number) => void; readOnly?: boolean; label: (n: number) => string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (readOnly)
    return (
      <div role="img" aria-label={label(value)} className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} aria-hidden className={cn("size-8", i <= value ? "fill-fg text-fg" : "text-line-strong")} strokeWidth={1.5} />
        ))}
      </div>
    );
  const move = (to: number) => {
    const n = Math.min(5, Math.max(1, to));
    onChange?.(n);
    refs.current[n - 1]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label(value || 0)} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          ref={(el) => {
            refs.current[i - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={label(i)}
          tabIndex={value === i || (!value && i === 1) ? 0 : -1}
          onClick={() => onChange?.(i)}
          onKeyDown={(e) => {
            const rtl = typeof document !== "undefined" && document.dir === "rtl";
            const next = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
            if (!next) return;
            e.preventDefault();
            move((value || (next > 0 ? 0 : 2)) + next);
          }}
          className="inline-flex size-12 items-center justify-center rounded-full focus-visible:focus-ring"
        >
          <Star aria-hidden className={cn("size-9 transition-colors", i <= value ? "fill-fg text-fg" : "text-line-strong hover:text-fg-subtle")} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
