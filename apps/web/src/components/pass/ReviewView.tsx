"use client";
import { Star } from "lucide-react";
import { useRef, useState } from "react";
import type { whatsappApi } from "@ll/shared";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ShopLogo } from "@/components/ui/ShopTile";
import { TextField } from "@/components/ui/TextField";
import { browserApi } from "@/lib/api/browser";
import { isApiError } from "@/lib/api/errors";
import { useLocale } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * /r/<token>: one-tap rating, optional private note, then the Google review link. The link is always
 * offered when the shop has one (Google's policy: never gate reviews on the rating) and leads for 4 and 5 stars.
 */
export function ReviewView({ token, initial }: { token: string; initial: whatsappApi.PublicReviewView }) {
  const { number, t, rich } = useLocale();
  const shop = initial.merchant;
  const [rating, setRating] = useState<number>(initial.rating ?? 0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<whatsappApi.ReviewSubmitResponse | null>(null);
  const url = done?.googleReviewUrl ?? initial.googleReviewUrl;
  const answered = done !== null || initial.alreadyResponded;
  const finalRating = done?.rating ?? initial.rating ?? rating;
  const lead = finalRating >= 4;

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

  const google = url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: lead ? "primary" : "secondary", size: "lg", fullWidth: true })}>
      {lead ? t("review.googleLead") : t("review.googleAlso")}
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
          <h1 className="text-title text-fg [text-wrap:balance]">{done ? rich(lead ? "review.thanksHigh" : "review.thanksLow", { shop: shop.name }) : t("review.alreadyRated", { n: number(finalRating) })}</h1>
          {google}
        </section>
      ) : (
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-title text-fg [text-wrap:balance]">{rich("review.title", { shop: shop.name })}</h1>
            <p className="mt-1 text-body text-fg-muted">{t("review.sub")}</p>
          </div>
          <Stars value={rating} onChange={setRating} label={(n) => t("review.stars", { n: number(n) })} />
          {rating ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <TextField type="textarea" label={t("review.feedbackLabel")} hint={rich("review.feedbackHint", { shop: shop.name })} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={2000} optionalLabel={false} autoFocus />
              {error ? <Banner tone="danger">{error}</Banner> : null}
              <Button type="submit" size="lg" fullWidth loading={busy}>
                {t("review.send")}
              </Button>
            </form>
          ) : null}
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
