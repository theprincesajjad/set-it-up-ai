import { Bell, Check, Clock, Dog, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { cn } from "@/lib/cn";
import { SAMPLE_SLOTS, type SoloService } from "@/lib/marketing/solo";
import { moneyShort } from "@/lib/marketing/text";
import { PhoneFrame } from "./Mocks";

/**
 * Hero of the solo-pro landing pages: the promise on the left, the pro's own booking page on a phone on the right, on a flat sand
 * stage (no gradient). Every name, service and time on the phone is a sample, and the caption under it says so.
 * TODO(C): swap the two category tiles for the workstream C 3D objects once Icon3d is in the tree.
 */

export interface SoloHeroProps {
  eyebrow: string;
  title: string;
  sub: string;
  cta: string;
  ctaHref: string;
  secondaryLabel: string;
  trust: string;
  caption: string;
  trade: string;
  /** Which phone screen to show. */
  screen: "booking" | "line" | "pet";
  sampleName: string;
  services: SoloService[];
  /** Two category illustrations on pastel tiles beside the phone. */
  arts: [string, string];
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toLowerCase();
const price = (s: SoloService) => `${s.from ? "from " : ""}${moneyShort(s.priceCents)}`;

function Head({ name, line }: { name: string; line: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="display flex size-10 items-center justify-center rounded-full bg-trade-soft text-body-strong text-trade-deep">{initials(name)}</span>
      <div className="min-w-0">
        <p className="truncate text-[15px] leading-5 font-semibold">{name}</p>
        <p className="truncate text-[12px] leading-4 text-muted-foreground">{line}</p>
      </div>
    </div>
  );
}

function BookingScreen({ name, services }: { name: string; services: SoloService[] }) {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-14 pb-4">
      <Head name={name} line="By appointment · Bloor West area" />
      <ul className="divide-y divide-border rounded-card bg-card px-3 shadow-card">
        {services.slice(0, 3).map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 py-2.5">
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", i === 1 ? "border-foreground bg-foreground text-background" : "border-border")}>{i === 1 ? <Check className="size-3" strokeWidth={3} /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] leading-4 font-semibold">{s.name}</span>
              <span className="block text-[11px] leading-4 text-muted-foreground">{s.minutes} min</span>
            </span>
            <span className="text-[13px] font-semibold tabular-nums">{price(s)}</span>
          </li>
        ))}
      </ul>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">Open times</p>
        <div className="grid grid-cols-2 gap-1.5">
          {SAMPLE_SLOTS.map((s, i) => (
            <span key={s} className={cn("flex h-9 items-center justify-center rounded-full border text-[12px] font-semibold", i === 1 ? "border-foreground bg-foreground text-background" : "border-border bg-card")}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-card bg-trade-soft px-3 py-2.5 text-trade-deep">
        <p className="text-[12px] leading-4 font-semibold">$20 holds your spot</p>
        <p className="text-[11px] leading-4">Free change until 24 hours before</p>
      </div>
      <span className="mt-auto flex h-11 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">Book and pay $20</span>
    </div>
  );
}

function LineScreen({ name }: { name: string }) {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-14 pb-4">
      <Head name={name} line="Walk-ins today" />
      <div className="rounded-card bg-trade-soft px-4 py-4 text-trade-deep">
        <p className="text-[12px] font-semibold">Your place in line</p>
        <p className="display mt-1 text-[40px] leading-none tabular-nums">3rd</p>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold">
          <Clock aria-hidden className="size-4" />
          About 40 min
        </p>
      </div>
      <ul className="divide-y divide-border rounded-card bg-card px-3 shadow-card">
        {[
          ["Dre", "In the chair"],
          ["Sam", "Next, about 15 min"],
          ["You", "About 40 min"],
        ].map(([who, when], i) => (
          <li key={who} className="flex items-center gap-3 py-2.5">
            <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums", i === 2 ? "bg-foreground text-background" : "bg-muted")}>{i + 1}</span>
            <span className="flex-1 text-[13px] font-semibold">{who}</span>
            <span className="text-[12px] text-muted-foreground">{when}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 rounded-card bg-card px-3 py-2.5 text-[12px] shadow-card">
        <Bell aria-hidden className="size-4 shrink-0" />
        We&apos;ll let you know when you&apos;re up.
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-card border border-border px-3 py-2.5 text-[12px]">
        <Users aria-hidden className="size-4 shrink-0" />
        Family card: Dad, Kai
      </div>
    </div>
  );
}

function PetScreen({ name, services }: { name: string; services: SoloService[] }) {
  return (
    <div className="flex h-full flex-col gap-3 px-4 pt-14 pb-4">
      <Head name={name} line="Max · large dog" />
      <div className="rounded-card bg-trade-soft px-3 py-3 text-trade-deep">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold">
          <Dog aria-hidden className="size-4" />
          Groom due in 4 days
        </p>
        <p className="mt-1 text-[12px]">Rebook in one tap</p>
      </div>
      <ul className="divide-y divide-border rounded-card bg-card px-3 shadow-card">
        {[
          ["Rabies", "Expires Mar 14"],
          ["Bordetella", "Expires Jun 2"],
          ["Certificate", "Photo on file"],
        ].map(([k, v]) => (
          <li key={k} className="flex items-center gap-2 py-2.5">
            <Check aria-hidden className="size-4 shrink-0 text-positive-text" strokeWidth={2.5} />
            <span className="flex-1 text-[13px] font-semibold">{k}</span>
            <span className="text-[12px] text-muted-foreground">{v}</span>
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-border rounded-card bg-card px-3 shadow-card">
        {services.filter((s) => !/small/.test(s.name)).slice(0, 2).map((s) => (
          <li key={s.name} className="flex items-center justify-between py-2.5 text-[13px]">
            <span className="font-semibold">{s.name.replace(/ \(.*\)/, "")}</span>
            <span className="tabular-nums">{price(s)}</span>
          </li>
        ))}
      </ul>
      <span className="mt-auto flex h-11 items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground">Book Max</span>
    </div>
  );
}

function Tile({ art, tone, className }: { art: string; tone: string; className?: string }) {
  return (
    <div aria-hidden data-theme="light" className={cn("flex aspect-square w-24 items-center justify-center rounded-tile shadow-card", tone, className)}>
      <CategoryIcon category={art as never} size={56} />
    </div>
  );
}

export function SoloHero(p: SoloHeroProps) {
  const phone: ReactNode = p.screen === "line" ? <LineScreen name={p.sampleName} /> : p.screen === "pet" ? <PetScreen name={p.sampleName} services={p.services} /> : <BookingScreen name={p.sampleName} services={p.services} />;
  return (
    <section data-trade={p.trade} className="overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-12 pb-14 md:grid-cols-[1.1fr_1fr] md:gap-14 md:px-8 md:pt-20 md:pb-20">
        <div>
          <p className="mkt-rise inline-flex rounded-full bg-trade-soft px-4 py-2 text-meta-strong text-trade-deep">{p.eyebrow}</p>
          <h1 className="display mkt-rise mt-5 text-mkt-md text-balance [--i:1] md:text-mkt-lg">{p.title}</h1>
          <p className="mkt-rise mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-muted-foreground [--i:2]">{p.sub}</p>
          <div className="mkt-rise mt-9 flex flex-col gap-3 [--i:3] sm:flex-row">
            <Button size="lg" href={p.ctaHref}>
              {p.cta}
            </Button>
            <Button size="lg" variant="secondary" href="#plans" className="rounded-full!">
              {p.secondaryLabel}
            </Button>
          </div>
          <ul className="mkt-rise mt-6 flex flex-wrap gap-x-5 gap-y-2 text-meta text-muted-foreground [--i:4]">
            {p.trust.split(" · ").map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Check aria-hidden className="size-4 text-positive-text" strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto w-full max-w-[460px]">
          <div className="flex justify-center rounded-[36px] bg-sidebar px-4 py-8 sm:py-10 md:rounded-[44px]">
            <PhoneFrame height={540}>{phone}</PhoneFrame>
          </div>
          <Tile art={p.arts[0]} tone="bg-tile-butter" className="absolute -start-2 top-10 hidden sm:flex lg:-start-8" />
          <Tile art={p.arts[1]} tone="bg-tile-rose" className="absolute -end-2 bottom-20 hidden sm:flex lg:-end-8" />
          <p className="mt-3 text-center text-caption text-muted-foreground">{p.caption}</p>
        </div>
      </div>
    </section>
  );
}
