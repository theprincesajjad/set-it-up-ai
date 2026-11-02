"use client";
/**
 * The wave Q kit, every component in its states. Demo copy only (this is a dev page, not a product screen): English and Urdu here, the
 * components' own strings (buttons, labels, errors) come from the catalogue in all four languages.
 */
import { CalendarCheck, Gift, MessageSquareHeart, ScanLine, Sparkles as SparkIcon, Star, Ticket, UserPlus, Users } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import type { DateRange } from "react-day-picker";
import type { Locale } from "@ll/shared";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion";
import { AnimatedList } from "@/components/primitives/animated-list";
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/primitives/avatar";
import { BentoCard, BentoGrid } from "@/components/primitives/bento-grid";
import { BlurFade } from "@/components/primitives/blur-fade";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/primitives/drawer";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/primitives/empty";
import { Marquee } from "@/components/primitives/marquee";
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from "@/components/primitives/meter";
import { Rating } from "@/components/primitives/rating";
import { Slider } from "@/components/primitives/slider";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/primitives/timeline";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip";
import { Badge as ReuiBadge } from "@/components/reui/badge";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button, buttonClasses } from "@/components/ui/Button";
import { celebrate } from "@/components/ui/Celebrate";
import { StatCardShell, StatChip } from "@/components/ui/ClearKit";
import { ColorField } from "@/components/ui/ColorField";
import { DatePicker, DayCalendar } from "@/components/ui/DatePicker";
import { FileDrop } from "@/components/ui/FileDrop";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { StepProgress } from "@/components/ui/StepProgress";
import { useToast } from "@/components/ui/Toast";
import { useLocaleOrEnglish } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The carousel is lazy (embla in its own chunk), the way public pages should load it below the fold.
const CardCarousel = dynamic(() => import("@/components/ui/CardCarousel").then((m) => m.CardCarousel), { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> });

const COPY = {
  en: {
    title: "Component kit",
    intro: "Library components themed to Clear: shadcn (base-nova on Base UI), ReUI, coss / Origin UI, Magic UI, NumberFlow, embla, react-day-picker, canvas-confetti.",
    s: { numbers: "Animated numbers and KPI tiles", steps: "Step progress", celebrate: "Celebration", stepper: "Number stepper", dates: "Dates", carousel: "Card carousel", file: "File and logo upload", color: "Brand colour", accordion: "Accordion (FAQ)", timeline: "Timeline (history)", meter: "Meter, slider, rating", marketing: "Marketing: marquee, bento, reveal", feed: "Live feed", existing: "Already in primitives (use these)" },
    visits: "Visits today", stamps: "Stamps given", rewards: "Rewards redeemed", members: "New customers", vsWed: "+16 vs last Wed", waiting: "5 waiting",
    add: "Add a visit", sales: "Sales this week", rate: "Return rate",
    burst: "Burst", sides: "Big moment", rewardUnlocked: "Reward unlocked",
    points: "How many points?", pointsHint: "10 points each visit.", guests: "Guests", tooMany: "Pick 12 or fewer.",
    promoEnds: "Promo ends", range: "Report dates",
    cards: ["Pinecone Coffee", "Amara Nails", "Fade Lab", "Studio Verde", "Arch & Thread"], cardSub: "3 of 10 stamps",
    logo: "Your logo", cover: "Cover photo", brand: "Card colour",
    faq: [["Do customers need an app?", "No. They join with their phone number and the card lives in Apple or Google Wallet."], ["Can I change my reward later?", "Yes, any time. Customers keep the points they have."], ["What does Pro cost?", "$29 a month or $290 a year, $199 the first year."]],
    history: [["Joined", "Oct 3"], ["First reward", "Oct 21"], ["Gold member", "Nov 1"]],
    texts: "Texts this month", smsUsed: "41 of 100", reach: "Reach", stars: "Rating",
    quotes: ["“Half my regulars joined in the first week.”", "“The counter takes two taps.”", "“My Sunday report is the best email I get.”", "“Customers love the wallet card.”"],
    bento: [["Stamp card", "A digital card in Apple and Google Wallet."], ["Promos", "Slow Tuesday? Send one in two taps."], ["Weekly report", "Your week every Sunday."], ["Bookings", "Clients book from your link."]], more: "Learn more",
    feed: [["Maya earned a stamp", "2 min ago"], ["Arjun redeemed a free coffee", "6 min ago"], ["Sofia joined", "11 min ago"], ["Lee booked a cut", "20 min ago"]],
    toast: "Show a toast", saved: "Saved", undo: "Undo", tip: "Hover or focus me", tipBody: "Tooltips: short, never the only way to learn something.",
    drawer: "Open a bottom sheet", drawerTitle: "Customer", drawerBody: "Phone sheets swipe down to close.", empty: "No promos yet", emptyBody: "Your first promo takes two minutes.", emptyCta: "New promo",
    seg: [["day", "Day"], ["week", "Week"], ["month", "Month"]], segLabel: "Range", badge: ["New", "Pro", "Waiting", "Overdue"], loading: "Loading",
  },
  ur: {
    title: "اجزاء کی کٹ",
    intro: "Clear تھیم میں لائبریری کے اجزاء۔",
    s: { numbers: "متحرک نمبر اور KPI ٹائلیں", steps: "مراحل کی پیش رفت", celebrate: "جشن", stepper: "نمبر اسٹیپر", dates: "تاریخیں", carousel: "کارڈ کیروسل", file: "فائل اور لوگو اپ لوڈ", color: "برانڈ رنگ", accordion: "سوال و جواب", timeline: "ٹائم لائن", meter: "میٹر، سلائیڈر، ریٹنگ", marketing: "مارکیٹنگ", feed: "تازہ سرگرمی", existing: "پہلے سے موجود" },
    visits: "آج کے وزٹ", stamps: "دیے گئے اسٹیمپ", rewards: "انعامات", members: "نئے گاہک", vsWed: "+16 پچھلے بدھ سے", waiting: "5 منتظر",
    add: "وزٹ شامل کریں", sales: "اس ہفتے کی فروخت", rate: "واپسی کی شرح",
    burst: "دھماکا", sides: "بڑا لمحہ", rewardUnlocked: "انعام کھل گیا",
    points: "کتنے پوائنٹس؟", pointsHint: "ہر وزٹ پر 10 پوائنٹس۔", guests: "مہمان", tooMany: "12 یا کم چنیں۔",
    promoEnds: "پرومو ختم", range: "رپورٹ کی تاریخیں",
    cards: ["پائن کون کافی", "امارا نیلز", "فیڈ لیب", "اسٹوڈیو ویردے", "آرچ اینڈ تھریڈ"], cardSub: "10 میں سے 3 اسٹیمپ",
    logo: "آپ کا لوگو", cover: "کور تصویر", brand: "کارڈ کا رنگ",
    faq: [["کیا گاہکوں کو ایپ چاہیے؟", "نہیں۔ وہ فون نمبر سے شامل ہوتے ہیں۔"], ["کیا میں بعد میں انعام بدل سکتا ہوں؟", "جی ہاں، کسی بھی وقت۔"], ["Pro کی قیمت؟", "$29 ماہانہ یا $290 سالانہ، پہلا سال $199۔"]],
    history: [["شامل ہوئے", "3 اکتوبر"], ["پہلا انعام", "21 اکتوبر"], ["گولڈ ممبر", "1 نومبر"]],
    texts: "اس ماہ کے ٹیکسٹ", smsUsed: "100 میں سے 41", reach: "رسائی", stars: "ریٹنگ",
    quotes: ["“پہلے ہفتے میں آدھے گاہک شامل ہو گئے۔”", "“کاؤنٹر پر دو ٹیپ۔”", "“اتوار کی رپورٹ بہترین ہے۔”", "“گاہکوں کو والیٹ کارڈ پسند ہے۔”"],
    bento: [["اسٹیمپ کارڈ", "Apple اور Google والیٹ میں۔"], ["پرومو", "دو ٹیپ میں بھیجیں۔"], ["ہفتہ وار رپورٹ", "ہر اتوار۔"], ["بکنگ", "آپ کے لنک سے۔"]], more: "مزید",
    feed: [["مایا کو اسٹیمپ ملا", "2 منٹ پہلے"], ["ارجن نے مفت کافی لی", "6 منٹ پہلے"], ["صوفیہ شامل ہوئیں", "11 منٹ پہلے"], ["لی نے کٹ بک کی", "20 منٹ پہلے"]],
    toast: "ٹوسٹ دکھائیں", saved: "محفوظ ہو گیا", undo: "واپس", tip: "یہاں رکیں", tipBody: "مختصر اشارہ۔",
    drawer: "نیچے کی شیٹ کھولیں", drawerTitle: "گاہک", drawerBody: "بند کرنے کے لیے نیچے کھینچیں۔", empty: "ابھی کوئی پرومو نہیں", emptyBody: "پہلا پرومو دو منٹ میں۔", emptyCta: "نیا پرومو",
    seg: [["day", "دن"], ["week", "ہفتہ"], ["month", "مہینہ"]], segLabel: "مدت", badge: ["نیا", "Pro", "منتظر", "تاخیر"], loading: "لوڈ ہو رہا ہے",
  },
} as const;

function Section({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section aria-labelledby={`kit-${id}`} className="flex flex-col gap-4 border-t border-border pt-8" data-kit-section={id}>
      <div>
        <h2 id={`kit-${id}`} className="text-title font-[700] text-foreground">
          {title}
        </h2>
        {note ? <p className="mt-1 font-mono text-caption text-muted-foreground" dir="ltr">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Demo({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("card-clear flex min-w-0 flex-col gap-3 p-4", className)}>
      <p className="font-mono text-caption text-muted-foreground" dir="ltr">
        {label}
      </p>
      {children}
    </div>
  );
}

export function KitShowcase({ locale }: { locale: Locale; trade: string }) {
  const c = locale === "ur" ? COPY.ur : COPY.en;
  const { t } = useLocaleOrEnglish();
  const toast = useToast();
  const [visits, setVisits] = useState(32);
  const [step, setStep] = useState(2);
  const [goal, setGoal] = useState(60);
  const [guests, setGuests] = useState(13);
  const [day, setDay] = useState<Date | undefined>(() => new Date(2026, 10, 6));
  const [range, setRange] = useState<DateRange | undefined>(() => ({ from: new Date(2026, 10, 2), to: new Date(2026, 10, 8) }));
  const [ends, setEnds] = useState<Date | undefined>(undefined);
  const [logo, setLogo] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>("#B83A64");
  const [seg, setSeg] = useState<"day" | "week" | "month">("week");
  const [reach, setReach] = useState([40]);
  const [loading, setLoading] = useState(false);
  const icons = [Users, Ticket, Gift, UserPlus];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10" data-kit>
      <header className="flex flex-col gap-2">
        <h1 className="text-large-title font-[700] text-foreground">{c.title}</h1>
        <p className="max-w-3xl text-body text-muted-foreground">{c.intro}</p>
        <p className="font-mono text-caption text-muted-foreground" dir="ltr">
          ?lang=en|ur|hi|pa · ?theme=clear|clear-dark · ?trade=nails|cafe|barber · ?brand=%23RRGGBB
        </p>
      </header>

      <Section id="numbers" title={c.s.numbers} note="@/components/ui/AnimatedNumber · StatCardShell value={<AnimatedNumber/>} · @number-flow/react 0.6.2">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            [c.visits, visits, <StatChip key="c" tone="up">{c.vsWed}</StatChip>],
            [c.stamps, 51, undefined],
            [c.rewards, 2, <StatChip key="w">{c.waiting}</StatChip>],
            [c.members, 7, undefined],
          ].map(([label, n, chip], i) => (
            <StatCardShell key={String(label)} icon={icons[i]!} label={label as string} value={loading ? <Skeleton className="h-9 w-16" /> : <AnimatedNumber value={n as number} trendTint />} chip={chip as ReactNode} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => setVisits((v) => v + 1)}>
            {c.add}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setVisits((v) => Math.max(0, v - 5))}>
            −5
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setLoading((l) => !l)}>
            {c.loading}
          </Button>
          <span className="text-body text-muted-foreground">
            {c.sales}: <AnimatedNumber value={1290.5} format={{ style: "currency", currency: "CAD" }} className="font-[650] text-foreground" />
          </span>
          <span className="text-body text-muted-foreground">
            {c.rate}: <AnimatedNumber value={0.42} format={{ style: "percent" }} className="font-[650] text-foreground" />
          </span>
        </div>
      </Section>

      <Section id="steps" title={c.s.steps} note="@/components/ui/StepProgress (ReUI Stepper)">
        <div className="grid gap-4 md:grid-cols-2">
          <Demo label={`step=${step} total=6 tone="trade"`}>
            <p className="text-meta font-[550] text-muted-foreground">{t("sf.progress", { n: step, total: 6 })}</p>
            <StepProgress step={step} total={6} label={t("sf.progress", { n: step, total: 6 })} />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(1, s - 1))}>
                {t("kit.prev")}
              </Button>
              <Button size="sm" onClick={() => setStep((s) => Math.min(6, s + 1))}>
                {t("kit.next")}
              </Button>
            </div>
          </Demo>
          <Demo label='labels tone="ink"'>
            <StepProgress step={3} total={4} tone="ink" labels={locale === "ur" ? ["خدمت", "وقت", "تفصیل", "تصدیق"] : ["Service", "Time", "Details", "Confirm"]} label="3 / 4" />
          </Demo>
          <Demo label="step={null} (done)">
            <StepProgress step={null} total={6} label="6 / 6" />
          </Demo>
          <Demo label='variant="line"'>
            <StepProgress step={4} total={6} variant="line" label="4 / 6" />
          </Demo>
        </div>
      </Section>

      <Section id="celebrate" title={c.s.celebrate} note="celebrate() / <Celebration when /> · canvas-confetti 1.9.4, lazy · no-op under reduced motion">
        <div className="flex flex-wrap gap-3">
          <Button iconStart={SparkIcon} onClick={(e) => void celebrate({ origin: e.currentTarget })}>
            {c.burst}
          </Button>
          <Button variant="secondary" onClick={() => void celebrate({ kind: "sides" })}>
            {c.sides}
          </Button>
          <Button
            variant="secondary"
            iconStart={Gift}
            onClick={(e) => {
              void celebrate({ origin: e.currentTarget, tokens: ["--points", "--points-soft", "--trade"] });
              toast({ message: c.rewardUnlocked, tone: "success" });
            }}
          >
            {c.rewardUnlocked}
          </Button>
        </div>
      </Section>

      <Section id="stepper" title={c.s.stepper} note="@/components/ui/NumberStepper (ReUI NumberField / Base UI)">
        <div className="grid gap-4 md:grid-cols-3">
          <Demo label='size="md"'>
            <NumberStepper label={c.points} value={goal} onChange={setGoal} min={10} max={500} step={10} hint={c.pointsHint} />
          </Demo>
          <Demo label='size="lg" error'>
            <NumberStepper label={c.guests} value={guests} onChange={setGuests} min={1} max={20} size="lg" error={guests > 12 ? c.tooMany : undefined} />
          </Demo>
          <Demo label="disabled">
            <NumberStepper label={c.guests} value={2} onChange={() => undefined} disabled />
          </Demo>
        </div>
      </Section>

      <Section id="dates" title={c.s.dates} note="@/components/ui/DatePicker: DayCalendar, DatePicker · react-day-picker 10.0.2">
        <div className="grid gap-4 lg:grid-cols-3">
          <Demo label='DayCalendar tone="trade" disabled past'>
            <DayCalendar mode="single" selected={day} onSelect={setDay} tone="trade" defaultMonth={new Date(2026, 10, 1)} disabled={{ before: new Date(2026, 10, 3) }} />
          </Demo>
          <Demo label='mode="range"' className="lg:col-span-2">
            <DayCalendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} defaultMonth={new Date(2026, 10, 1)} />
          </Demo>
          <Demo label="DatePicker (popover)">
            <DatePicker label={c.promoEnds} value={ends} onChange={setEnds} tone="trade" />
          </Demo>
        </div>
      </Section>

      <Section id="carousel" title={c.s.carousel} note="@/components/ui/CardCarousel (lazy) · embla-carousel-react 8.6.0">
        <CardCarousel
          label={c.s.carousel}
          items={c.cards.map((name) => (
            <div key={name} className="flex h-40 flex-col justify-between rounded-card bg-trade p-5 text-trade-foreground">
              <span className="text-headline font-[650]">{name}</span>
              <span className="text-meta">{c.cardSub}</span>
            </div>
          ))}
        />
      </Section>

      <Section id="file" title={c.s.file} note="@/components/ui/FileDrop">
        <div className="grid gap-4 md:grid-cols-3">
          <Demo label="empty">
            <FileDrop label={c.logo} accept={["image/png", "image/jpeg", "image/svg+xml"]} maxMb={2} value={logo} onFile={(f) => setLogo(URL.createObjectURL(f))} onClear={() => setLogo(null)} />
          </Demo>
          <Demo label="with value">
            <FileDrop label={c.logo} value="/icon.svg" onFile={() => undefined} onClear={() => undefined} />
          </Demo>
          <Demo label='shape="wide" error'>
            <FileDrop label={c.cover} shape="wide" onFile={() => undefined} error={t("kit.file.tooBig", { mb: 5 })} />
          </Demo>
        </div>
      </Section>

      <Section id="color" title={c.s.color} note="@/components/ui/ColorField · resolveShopColors">
        <Demo label="ColorField">
          <ColorField label={c.brand} value={brand} onChange={setBrand} vertical="nails" />
        </Demo>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section id="accordion" title={c.s.accordion} note="@/components/primitives/accordion (shadcn, Base UI)">
          <Accordion className="card-clear px-4">
            {c.faq.map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-body font-[600]">{q}</AccordionTrigger>
                <AccordionContent className="text-body text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Section>

        <Section id="timeline" title={c.s.timeline} note="@/components/primitives/timeline (ReUI)">
          <div className="card-clear p-5">
            <Timeline defaultValue={2}>
              {c.history.map(([title, date], i) => (
                <TimelineItem key={title} step={i + 1}>
                  <TimelineHeader>
                    <TimelineSeparator />
                    <TimelineDate>{date}</TimelineDate>
                    <TimelineTitle>{title}</TimelineTitle>
                    <TimelineIndicator />
                  </TimelineHeader>
                  <TimelineContent>{i === 1 ? <Star aria-hidden className="size-4 text-points" /> : null}</TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          </div>
        </Section>
      </div>

      <Section id="meter" title={c.s.meter} note="primitives/meter (coss) · primitives/slider (shadcn) · primitives/rating (ReUI)">
        <div className="grid gap-4 md:grid-cols-3">
          <Demo label="Meter">
            <Meter value={41} max={100} aria-label={c.texts}>
              <div className="flex items-center justify-between">
                <MeterLabel className="text-body">{c.texts}</MeterLabel>
                <MeterValue className="text-meta tabular-nums text-muted-foreground">{() => c.smsUsed}</MeterValue>
              </div>
              <MeterTrack className="h-2 rounded-full bg-lg-seg-track">
                <MeterIndicator className="rounded-full bg-trade" />
              </MeterTrack>
            </Meter>
          </Demo>
          <Demo label="Slider">
            <span className="text-body">{c.reach}</span>
            <Slider value={reach} onValueChange={(v) => setReach(Array.isArray(v) ? [...v] : [v])} max={100} aria-label={c.reach} />
          </Demo>
          <Demo label="Rating">
            <span role="img" aria-label={t("kit.rating", { n: 4.5, max: 5 })} className="inline-flex">
              <Rating rating={4.5} showValue size="lg" />
            </span>
          </Demo>
        </div>
      </Section>

      <Section id="marketing" title={c.s.marketing} note="primitives/marquee, bento-grid, blur-fade (Magic UI) · lazy-load below the fold">
        <Marquee pauseOnHover className="[--duration:30s]">
          {c.quotes.map((q) => (
            <figure key={q} className="card-clear w-72 shrink-0 p-4 text-body text-foreground">
              {q}
            </figure>
          ))}
        </Marquee>
        <BentoGrid className="auto-rows-[12rem] grid-cols-1 md:grid-cols-3">
          {c.bento.map(([name, description], i) => (
            <BentoCard key={name} name={name} description={description} Icon={[Ticket, MessageSquareHeart, ScanLine, CalendarCheck][i]} href="#" cta={c.more} className={i === 0 || i === 3 ? "md:col-span-2" : "md:col-span-1"} />
          ))}
        </BentoGrid>
        <div className="grid gap-4 md:grid-cols-3">
          {c.bento.slice(0, 3).map(([name], i) => (
            <BlurFade key={name} inView delay={0.08 * i}>
              <div className="card-clear p-5 text-headline font-[650]">{name}</div>
            </BlurFade>
          ))}
        </div>
      </Section>

      <Section id="feed" title={c.s.feed} note="primitives/animated-list (Magic UI)">
        <div className="card-clear max-w-md p-4">
          <AnimatedList delay={1200} className="gap-2">
            {c.feed.map(([what, when]) => (
              <div key={what} className="flex items-center gap-3 rounded-r3 bg-muted px-3 py-2.5">
                <span aria-hidden className="grid size-9 place-items-center rounded-full bg-trade-soft text-trade-deep">
                  <Ticket className="size-4" />
                </span>
                <span className="min-w-0 flex-1 text-body">{what}</span>
                <span className="text-meta text-muted-foreground">{when}</span>
              </div>
            ))}
          </AnimatedList>
        </div>
      </Section>

      <Section id="existing" title={c.s.existing} note="ui/Toast (Base UI) · primitives/tooltip · drawer · empty · avatar · reui/badge · ui/SegmentedControl · ui/Skeleton">
        <div className="grid gap-4 md:grid-cols-3">
          <Demo label="useToast()">
            <Button variant="secondary" onClick={() => toast({ message: c.saved, tone: "success", action: { label: c.undo, onClick: () => undefined } })}>
              {c.toast}
            </Button>
          </Demo>
          <Demo label="Tooltip">
            <Tooltip>
              <TooltipTrigger render={<button type="button" className={buttonClasses({ variant: "secondary", size: "md" })} />}>{c.tip}</TooltipTrigger>
              <TooltipContent>{c.tipBody}</TooltipContent>
            </Tooltip>
          </Demo>
          <Demo label="Drawer (bottom sheet)">
            <Drawer>
              <DrawerTrigger render={<button type="button" className={buttonClasses({ variant: "secondary", size: "md" })} />}>{c.drawer}</DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>{c.drawerTitle}</DrawerTitle>
                  <DrawerDescription>{c.drawerBody}</DrawerDescription>
                </DrawerHeader>
                <div className="h-40" />
              </DrawerContent>
            </Drawer>
          </Demo>
          <Demo label="AvatarGroup + Badge (ReUI)">
            <AvatarGroup>
              {["M", "A", "S", "J"].map((i) => (
                <Avatar key={i}>
                  <AvatarFallback>{i}</AvatarFallback>
                </Avatar>
              ))}
              <AvatarGroupCount>+8</AvatarGroupCount>
            </AvatarGroup>
            <div className="flex flex-wrap gap-2">
              <ReuiBadge variant="success-light">{c.badge[0]}</ReuiBadge>
              <ReuiBadge variant="default">{c.badge[1]}</ReuiBadge>
              <ReuiBadge variant="info-light">{c.badge[2]}</ReuiBadge>
              <ReuiBadge variant="destructive-light">{c.badge[3]}</ReuiBadge>
            </div>
          </Demo>
          <Demo label="SegmentedControl + Skeleton">
            <SegmentedControl label={c.segLabel} value={seg} onChange={setSeg} options={c.seg.map(([value, label]) => ({ value, label }))} />
            <div className="flex items-center gap-3">
              <Skeleton circle className="size-10" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </Demo>
          <Demo label="Empty">
            <Empty className="border border-dashed border-border p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareHeart aria-hidden />
                </EmptyMedia>
                <EmptyTitle>{c.empty}</EmptyTitle>
                <EmptyDescription>{c.emptyBody}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm">{c.emptyCta}</Button>
              </EmptyContent>
            </Empty>
          </Demo>
        </div>
      </Section>
    </div>
  );
}
