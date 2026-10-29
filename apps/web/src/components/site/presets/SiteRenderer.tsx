"use client";
/**
 * The three website presets (studio, portfolio, shopfront) rendered from one data shape (@ll/shared siteApi.PublicSiteResponse):
 * the owner's words plus the shop's live services, booking, rewards, promos, ratings, hours and map pin. Used by the public
 * page (/s/<slug> and a custom domain) and by the builder's live preview, where `onPick` makes every line selectable.
 *
 * Rules: Book, Join and Message are the real flows (the booking page, the join form on the shop page, the shop's own channel);
 * an "area" or "city" shop shows the area label and the offset pin, never a street address; colours are Clear tokens and the
 * trade accent only (no raw colours), glass only on the sticky action bar.
 */
import { AtSign, CalendarCheck, Clock, MapPin, MessageCircle, Phone, Star } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { formatCurrency, type SiteCopyField, type SiteSection, type siteApi } from "@ll/shared";
import { PromoCard } from "@/components/ui/PromoCard";
import { cn } from "@/lib/cn";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { howYouEarnL, weekRowsL } from "@/lib/i18n/formatL";
import { unitsText } from "@/lib/units";

export interface SiteLinks {
  /** Where the shop's own pages live: "" on our host, the absolute site URL on a custom domain. */
  base: string;
}

export interface SiteRendererProps {
  data: siteApi.PublicSiteResponse;
  links: SiteLinks;
  /** Builder preview: click or Enter on a line selects it for editing. */
  onPick?: (field: SiteCopyField) => void;
  activeField?: SiteCopyField | null;
  /** Narrow frame (the builder's phone preview): single column regardless of the viewport. */
  compact?: boolean;
}

type Ctx = SiteRendererProps & { t: ReturnType<typeof useLocaleOrEnglish>["t"]; locale: ReturnType<typeof useLocaleOrEnglish>["locale"] };

/** A line of the owner's words; selectable in the builder. */
function Line({ ctx, field, as: As = "span", className, children }: { ctx: Ctx; field: SiteCopyField; as?: "span" | "p" | "h1" | "h2"; className?: string; children: ReactNode }) {
  if (!ctx.onPick)
    return (
      <As dir="auto" className={className}>
        {children}
      </As>
    );
  const pick = () => ctx.onPick!(field);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick();
    }
  };
  return (
    <As dir="auto" className={className}>
      <span
        role="button"
        tabIndex={0}
        data-field={field}
        aria-pressed={ctx.activeField === field}
        onClick={pick}
        onKeyDown={onKeyDown}
        className={cn("cursor-text rounded-r1 outline-offset-2 hover:outline hover:outline-1 hover:outline-border-strong focus-visible:focus-ring", ctx.activeField === field && "outline outline-2 outline-ring")}
      >
        {children}
      </span>
    </As>
  );
}

function Section({ id, children, className, labelledBy }: { id: SiteSection; children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section id={`site-${id}`} aria-labelledby={labelledBy} data-section={id} className={cn("scroll-mt-20", className)}>
      {children}
    </section>
  );
}

function SectionTitle({ ctx, field, id, children }: { ctx: Ctx; field: SiteCopyField; id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-title font-[650] text-foreground">
      <Line ctx={ctx} field={field}>
        {children}
      </Line>
    </h2>
  );
}

const pillBase = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-body font-[550] transition-colors focus-visible:focus-ring";
const pillPrimary = `${pillBase} bg-primary text-primary-foreground hover:bg-primary-hover`;
const pillSecondary = `${pillBase} bg-card text-foreground hairline-inset hover:bg-muted`;

/** A real link on the site; in the builder preview a plain span, so a selectable line inside it is not nested in a link. */
function Act({ ctx, href, className, action, children, label }: { ctx: Ctx; href: string; className: string; action?: string; children: ReactNode; label?: string }) {
  if (ctx.onPick) {
    return (
      <span className={className} data-action={action}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} className={className} data-action={action} aria-label={label} {...(/^https?:/.test(href) ? { rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

function Actions({ ctx, align = "start" }: { ctx: Ctx; align?: "start" | "center" }) {
  const { data, links, t } = ctx;
  const shopBase = `${links.base}/shops/${encodeURIComponent(data.slug)}`;
  return (
    <div className={cn("flex flex-wrap gap-2", align === "center" && "justify-center")}>
      <Act ctx={ctx} href={data.booking.enabled ? `${shopBase}/book` : `${shopBase}#join`} className={pillPrimary} action={data.booking.enabled ? "book" : "join"}>
        {data.booking.enabled ? <CalendarCheck aria-hidden className="size-4" strokeWidth={1.75} /> : null}
        <Line ctx={ctx} field="hero.cta">
          {data.content.copy.hero.cta}
        </Line>
      </Act>
      {data.booking.enabled && data.loyalty && data.content.copy.hero.cta.trim().toLowerCase() !== t("site.join").toLowerCase() ? (
        <Act ctx={ctx} href={`${shopBase}#join`} className={pillSecondary} action="join">
          {t("site.join")}
        </Act>
      ) : null}
      {data.message ? (
        <Act ctx={ctx} href={data.message.href} className={pillSecondary} action="message">
          <MessageCircle aria-hidden className="size-4" strokeWidth={1.75} />
          {t("site.message")}
        </Act>
      ) : null}
    </div>
  );
}

function Mark({ data, size = "lg" }: { data: siteApi.PublicSiteResponse; size?: "lg" | "sm" }) {
  const cls = size === "lg" ? "size-16 rounded-r5 text-large-title" : "size-10 rounded-r3 text-body-strong";
  return data.shop.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={data.shop.logoUrl} alt="" className={cn(cls, "object-cover")} />
  ) : (
    <span aria-hidden className={cn(cls, "inline-flex items-center justify-center bg-trade-tint font-[650] text-trade")}>
      {data.shop.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Hero({ ctx }: { ctx: Ctx }) {
  const { data, compact } = ctx;
  const c = data.content.copy.hero;
  const layout = data.content.preset === "studio" ? "split" : data.content.preset === "portfolio" ? "centred" : "banner";
  const where = data.location?.areaLabel ?? data.location?.city;
  if (layout === "centred") {
    return (
      <Section id="hero" className="flex flex-col items-center gap-4 py-10 text-center" labelledBy="site-hero-h">
        <Mark data={data} />
        <Line ctx={ctx} field="hero.headline" as="h1" className="text-4xl font-bold leading-10 text-foreground">
          <span id="site-hero-h">{c.headline}</span>
        </Line>
        <Line ctx={ctx} field="hero.subhead" as="p" className="max-w-140 text-title text-muted-foreground">
          {c.subhead}
        </Line>
        <Actions ctx={ctx} align="center" />
      </Section>
    );
  }
  if (layout === "banner") {
    return (
      <Section id="hero" className="overflow-hidden rounded-r6 bg-trade-tint" labelledBy="site-hero-h">
        <div className="flex flex-col gap-4 px-6 py-10 md:px-10 md:py-14">
          <div className="flex items-center gap-3">
            <Mark data={data} size="sm" />
            {where ? <span className="text-meta font-[550] text-foreground">{where}</span> : null}
          </div>
          <Line ctx={ctx} field="hero.headline" as="h1" className="text-4xl font-bold leading-10 text-foreground md:text-hero md:leading-13">
            <span id="site-hero-h">{c.headline}</span>
          </Line>
          <Line ctx={ctx} field="hero.subhead" as="p" className="max-w-140 text-title text-foreground">
            {c.subhead}
          </Line>
          <Actions ctx={ctx} />
        </div>
      </Section>
    );
  }
  return (
    <Section id="hero" className={cn("grid items-center gap-6 py-8", !compact && "md:grid-cols-2 md:py-12")} labelledBy="site-hero-h">
      <div className="flex flex-col gap-4">
        {where ? <span className="text-meta font-[550] text-muted-foreground">{where}</span> : null}
        <Line ctx={ctx} field="hero.headline" as="h1" className={cn("text-4xl font-bold leading-10 text-foreground", !compact && "md:text-hero md:leading-13")}>
          <span id="site-hero-h">{c.headline}</span>
        </Line>
        <Line ctx={ctx} field="hero.subhead" as="p" className="max-w-130 text-title text-muted-foreground">
          {c.subhead}
        </Line>
        <Actions ctx={ctx} />
      </div>
      <div className={cn("card-clear flex flex-col gap-3 p-5", compact && "hidden")}>
        <div className="flex items-center gap-3">
          <Mark data={data} size="sm" />
          <p className="text-body-strong text-foreground">{data.shop.name}</p>
        </div>
        {data.services.slice(0, 3).map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 text-body">
            <span className="min-w-0 truncate text-foreground">{s.name}</span>
            <bdi className="shrink-0 tabular-nums text-muted-foreground">{priceText(ctx, s)}</bdi>
          </div>
        ))}
        {data.reviews ? (
          <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
            <Star aria-hidden className="size-4 text-trade" strokeWidth={1.75} />
            {ctx.t("site.rating", { avg: data.reviews.average.toFixed(1) })} · {ctx.t("site.ratingFrom", { n: data.reviews.count })}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function priceText(ctx: Ctx, s: siteApi.PublicSiteService): string {
  const p = formatCurrency(ctx.locale, s.priceCents);
  return s.priceFrom ? ctx.t("site.priceFrom", { price: p }) : p;
}

function Services({ ctx }: { ctx: Ctx }) {
  const { data, links, t } = ctx;
  const c = data.content.copy.services;
  const shopBase = `${links.base}/shops/${encodeURIComponent(data.slug)}`;
  return (
    <Section id="services" className="flex flex-col gap-3" labelledBy="site-services-h">
      <SectionTitle ctx={ctx} field="services.title" id="site-services-h">
        {c.title}
      </SectionTitle>
      <Line ctx={ctx} field="services.intro" as="p" className="text-body text-muted-foreground">
        {c.intro}
      </Line>
      {data.services.length ? (
        <ul className="card-clear divide-overlay">
          {data.services.map((s) => (
            <li key={s.id} className="relative flex min-h-16 items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p dir="auto" className="text-body-strong text-foreground">{s.name}</p>
                <p className="text-body text-muted-foreground">
                  <bdi>{t("site.minutes", { n: s.durationMin })}</bdi> · <bdi className="tabular-nums">{priceText(ctx, s)}</bdi>
                </p>
              </div>
              {data.booking.enabled ? (
                <Act ctx={ctx} href={`${shopBase}/book?service=${encodeURIComponent(s.id)}`} className={cn(pillSecondary, "min-h-11 px-4")} label={`${t("site.bookService")}: ${s.name}`} action="book-service">
                  {t("site.bookService")}
                </Act>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted-foreground">{t("site.noServices")}</p>
      )}
    </Section>
  );
}

function Reviews({ ctx }: { ctx: Ctx }) {
  const { data, t } = ctx;
  if (!data.reviews) return null;
  return (
    <Section id="reviews" className="flex flex-col gap-3" labelledBy="site-reviews-h">
      <SectionTitle ctx={ctx} field="reviews.title" id="site-reviews-h">
        {data.content.copy.reviews.title}
      </SectionTitle>
      <div className="card-clear flex items-center gap-4 p-5">
        <span className="inline-flex size-12 items-center justify-center rounded-r4 bg-trade-tint text-trade">
          <Star aria-hidden className="size-6" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-display-number tabular-nums text-foreground">{data.reviews.average.toFixed(1)}</p>
          <p className="text-body text-muted-foreground">
            {t("site.rating", { avg: data.reviews.average.toFixed(1) })} · {t("site.ratingFrom", { n: data.reviews.count })}
          </p>
        </div>
      </div>
    </Section>
  );
}

function Loyalty({ ctx }: { ctx: Ctx }) {
  const { data, links, t, locale } = ctx;
  if (!data.loyalty) return null;
  const c = data.content.copy.loyalty;
  const p = data.loyalty.program;
  const shopBase = `${links.base}/shops/${encodeURIComponent(data.slug)}`;
  return (
    <Section id="loyalty" className="flex flex-col gap-3" labelledBy="site-loyalty-h">
      <SectionTitle ctx={ctx} field="loyalty.title" id="site-loyalty-h">
        {c.title}
      </SectionTitle>
      <div className="card-clear flex flex-col gap-3 p-5">
        <Line ctx={ctx} field="loyalty.body" as="p" className="text-body text-foreground">
          {c.body}
        </Line>
        <p dir="auto" className="text-body-strong text-foreground">
          {howYouEarnL({ locale, t }, p, formatCurrency(locale, 100))}
        </p>
        {data.loyalty.rewards.length ? (
          <ul aria-label={t("site.rewardsList")} className="flex flex-col gap-1">
            {data.loyalty.rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-body">
                <span className="min-w-0 truncate text-foreground">{r.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{unitsText(locale, r.pointsCost, p.terminology, false)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <Act ctx={ctx} href={`${shopBase}#join`} className={pillPrimary} action="join">
            {t("site.join")}
          </Act>
        </div>
      </div>
    </Section>
  );
}

function Promos({ ctx }: { ctx: Ctx }) {
  const { data, t } = ctx;
  const c = data.content.copy.promos;
  const terminology = data.loyalty?.program.terminology ?? "points";
  return (
    <Section id="promos" className="flex flex-col gap-3" labelledBy="site-promos-h">
      <SectionTitle ctx={ctx} field="promos.title" id="site-promos-h">
        {c.title}
      </SectionTitle>
      <Line ctx={ctx} field="promos.intro" as="p" className="text-body text-muted-foreground">
        {c.intro}
      </Line>
      {data.promos.length ? (
        <div className="flex flex-col gap-3">
          {data.promos.map((p) => (
            <PromoCard key={p.id} variant="compact" promo={p} terminology={terminology} showShop={false} shop={{ name: data.shop.name, vertical: data.shop.vertical, logoUrl: data.shop.logoUrl, brandColor: data.shop.brandColor }} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted-foreground">{t("site.noPromos")}</p>
      )}
    </Section>
  );
}

function About({ ctx }: { ctx: Ctx }) {
  const c = ctx.data.content.copy.about;
  return (
    <Section id="about" className="flex flex-col gap-3" labelledBy="site-about-h">
      <SectionTitle ctx={ctx} field="about.title" id="site-about-h">
        {c.title}
      </SectionTitle>
      <Line ctx={ctx} field="about.body" as="p" className="max-w-160 whitespace-pre-line text-body text-foreground">
        {c.body}
      </Line>
    </Section>
  );
}

function Hours({ ctx }: { ctx: Ctx }) {
  const { data, t, locale } = ctx;
  const rows = weekRowsL({ locale, t }, data.location?.hours ?? null);
  return (
    <Section id="hours" className="flex flex-col gap-3" labelledBy="site-hours-h">
      <SectionTitle ctx={ctx} field="hours.title" id="site-hours-h">
        {data.content.copy.hours.title}
      </SectionTitle>
      {rows.length ? (
        <div className="card-clear p-4">
          <table className="w-full text-body">
            <caption className="sr-only">{data.content.copy.hours.title}</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}>
                  <th scope="row" className="py-1.5 text-start font-normal text-muted-foreground">
                    {r.day}
                  </th>
                  <td className="py-1.5 text-end tabular-nums text-foreground">{r.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-body text-muted-foreground">
          <Clock aria-hidden className="size-4" strokeWidth={1.75} />
          {t("site.noHours")}
        </p>
      )}
    </Section>
  );
}

function MapBlock({ ctx }: { ctx: Ctx }) {
  const { data, t } = ctx;
  const loc = data.location;
  const c = data.content.copy.map;
  if (!loc) return null;
  const exact = loc.visibility === "exact" && loc.address;
  const pin = loc.pin;
  const mapHref = exact
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(pin ? `${pin.lat},${pin.lng}` : `${loc.address}, ${loc.city ?? ""}`)}`
    : pin
      ? `https://www.openstreetmap.org/?mlat=${pin.lat.toFixed(4)}&mlon=${pin.lng.toFixed(4)}#map=15/${pin.lat.toFixed(4)}/${pin.lng.toFixed(4)}`
      : null;
  return (
    <Section id="map" className="flex flex-col gap-3" labelledBy="site-map-h">
      <SectionTitle ctx={ctx} field="map.title" id="site-map-h">
        {c.title}
      </SectionTitle>
      <div className="card-clear flex items-start gap-4 p-5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-r4 bg-trade-tint text-trade">
          <MapPin aria-hidden className="size-6" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {exact ? (
            <p dir="auto" className="text-body-strong text-foreground">
              {loc.address}
              {loc.city ? `, ${loc.city}` : ""}
              {loc.postalCode ? ` ${loc.postalCode}` : ""}
            </p>
          ) : (
            <p className="text-body-strong text-foreground">{[loc.areaLabel, loc.city].filter(Boolean).join(", ")}</p>
          )}
          {!exact ? (
            <Line ctx={ctx} field="map.note" as="p" className="text-body text-muted-foreground">
              {c.note}
            </Line>
          ) : null}
          {mapHref ? (
            <a href={mapHref} rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-body font-[550] text-link hover:underline focus-visible:focus-ring">
              {exact ? t("shop.directions") : t("site.openMap")}
            </a>
          ) : null}
          {!exact && pin ? <p className="text-meta text-muted-foreground">{t("site.areaPin")}</p> : null}
        </div>
      </div>
    </Section>
  );
}

function Contact({ ctx }: { ctx: Ctx }) {
  const { data, t } = ctx;
  const c = data.content.copy.contact;
  const ig = data.shop.instagram?.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/^@/, "").replace(/\/.*$/, "");
  return (
    <Section id="contact" className="flex flex-col gap-3" labelledBy="site-contact-h">
      <SectionTitle ctx={ctx} field="contact.title" id="site-contact-h">
        {c.title}
      </SectionTitle>
      <Line ctx={ctx} field="contact.body" as="p" className="text-body text-muted-foreground">
        {c.body}
      </Line>
      <div className="flex flex-wrap gap-2">
        {data.message ? (
          <a href={data.message.href} rel="noopener noreferrer" className={pillPrimary} data-action="message">
            <MessageCircle aria-hidden className="size-4" strokeWidth={1.75} />
            {t("site.message")}
          </a>
        ) : null}
        {data.shop.phone ? (
          <a href={`tel:${data.shop.phone}`} className={pillSecondary}>
            <Phone aria-hidden className="size-4" strokeWidth={1.75} />
            {t("site.call")}
          </a>
        ) : null}
        {ig ? (
          <a href={`https://instagram.com/${encodeURIComponent(ig)}`} rel="noopener noreferrer" className={pillSecondary}>
            <AtSign aria-hidden className="size-4" strokeWidth={1.75} />
            <bdi dir="ltr">@{ig}</bdi>
          </a>
        ) : null}
      </div>
    </Section>
  );
}

const SECTIONS: Record<SiteSection, (p: { ctx: Ctx }) => ReactNode> = {
  hero: Hero,
  services: Services,
  reviews: Reviews,
  loyalty: Loyalty,
  promos: Promos,
  about: About,
  hours: Hours,
  map: MapBlock,
  contact: Contact,
};

export function SiteRenderer(props: SiteRendererProps) {
  const { t, locale } = useLocaleOrEnglish();
  const ctx: Ctx = { ...props, t, locale };
  const { data } = props;
  const hidden = new Set(data.content.hidden);
  const order = data.content.order.filter((s) => !hidden.has(s));
  return (
    <div className="flex flex-col gap-10" data-preset={data.content.preset}>
      {order.map((s) => {
        const Cmp = SECTIONS[s];
        return <Cmp key={s} ctx={ctx} />;
      })}
    </div>
  );
}
