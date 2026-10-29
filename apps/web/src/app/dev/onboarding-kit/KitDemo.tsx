"use client";
import { useState } from "react";
import type { Locale } from "@ll/shared";
import { AddRow, ChoiceGroup, ChoiceTile, LivePreview, PlanLine, PresetCard, ServiceRow, SetupProgress, ShareRow, StepCard, WeekStrip, type SetupStep } from "@/components/onboarding";
import { Icon3d } from "@/components/ui/Icon3d";

/** Demo copy only (this page is a dev kit, not a product screen). */
const COPY = {
  en: {
    title: "Onboarding kit", group: "Set up your shop", steps: ["Your link", "Services", "Hours", "Privacy", "Share"],
    stepTitle: "What do you offer?", stepBody: "Pick your trade and we will start you with the usual services. You can change every line.", cont: "Continue", skip: "I'll do this later",
    choices: [["Nails", "Gel, acrylic, art"], ["Barber", "Cuts and shaves"], ["Salon", "Colour and styling"]],
    svc: ["Gel manicure", "Classic cut", "Brow shape"], duration: "Minutes", price: "Price", deposit: "Deposit", add: "+ Add a service",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], dayNames: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"], opens: "Opens", closes: "Closes", same: "Same every day", daysLabel: "Days",
    preview: "Preview", frame: "Booking page preview", close: "Close", book: "Book now",
    share: [["Instagram bio", "Copy link", "Copy link"], ["Text it", "Text yourself the link", "Send"], ["QR", "For a story or a mirror sticker", "Download"]],
    presets: [["Studio", "One page, big book button"], ["Portfolio", "Photos first"], ["Shop front", "Hours, menu, reviews"]], pick: "Pick",
    plan: "Included with the annual plan, $390 a year.", see: "See the plan", empty: "Nothing yet",
  },
  ur: {
    title: "آن بورڈنگ کٹ", group: "اپنی دکان سیٹ اپ کریں", steps: ["آپ کا لنک", "خدمات", "اوقات", "پرائیویسی", "شیئر"],
    stepTitle: "آپ کیا پیش کرتے ہیں؟", stepBody: "اپنا کام منتخب کریں، ہم عام خدمات سے آغاز کر دیں گے۔ ہر سطر بدل سکتے ہیں۔", cont: "جاری رکھیں", skip: "بعد میں کروں گا",
    choices: [["ناخن", "جیل، ایکریلک، آرٹ"], ["حجام", "کٹنگ اور شیو"], ["سیلون", "رنگ اور اسٹائلنگ"]],
    svc: ["جیل مینی کیور", "کلاسک کٹ", "ابرو کی شکل"], duration: "منٹ", price: "قیمت", deposit: "ڈپازٹ", add: "+ خدمت شامل کریں",
    days: ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ", "اتوار"], dayNames: ["پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ", "اتوار"], opens: "کھلتا ہے", closes: "بند ہوتا ہے", same: "ہر دن ایک جیسا", daysLabel: "دن",
    preview: "پیش منظر", frame: "بکنگ صفحے کا پیش منظر", close: "بند کریں", book: "ابھی بک کریں",
    share: [["انسٹاگرام بائیو", "لنک کاپی کریں", "لنک کاپی کریں"], ["ٹیکسٹ کریں", "خود کو لنک بھیجیں", "بھیجیں"], ["کیو آر", "اسٹوری یا آئینے کے اسٹکر کے لیے", "ڈاؤن لوڈ"]],
    presets: [["اسٹوڈیو", "ایک صفحہ، بڑا بک بٹن"], ["پورٹ فولیو", "پہلے تصاویر"], ["دکان کا سامنا", "اوقات، مینو، جائزے"]], pick: "چنیں",
    plan: "سالانہ پلان کے ساتھ شامل، $390 سالانہ۔", see: "پلان دیکھیں", empty: "ابھی کچھ نہیں",
  },
} as const;

export function KitDemo({ locale, trade }: { locale: Locale; trade: string }) {
  const c = locale === "ur" ? COPY.ur : COPY.en;
  const [choice, setChoice] = useState<string | null>("1");
  const [day, setDay] = useState(0);
  const [hours, setHours] = useState({ start: "09:00", end: "17:30" });
  const [deposit, setDeposit] = useState(true);
  const [checked, setChecked] = useState([true, true, false]);
  const [picked, setPicked] = useState(1);
  const steps: SetupStep[] = c.steps.map((title, i) => ({ id: String(i), title, time: i === 4 ? undefined : `${20 + i * 10} s`, state: i < 1 ? "done" : i === 1 ? "current" : "todo", href: i < 1 ? "#" : undefined }));
  return (
    <div className="mx-auto max-w-[1160px]">
      <h1 className="mb-6 text-large-title">{c.title}</h1>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <SetupProgress title={c.group} steps={steps} className="lg:sticky lg:top-6 lg:self-start" />
        <div className="flex min-w-0 flex-1 flex-col gap-6" data-kit-main>
          <StepCard icon="price_tag" trade={trade} title={c.stepTitle} body={c.stepBody} headingId="kit-step" primary={{ label: c.cont }} secondary={{ label: c.skip }}>
            <ChoiceGroup value={choice} onValueChange={setChoice} aria-labelledby="kit-step">
              {c.choices.map(([label, hint], i) => (
                <ChoiceTile key={label} value={String(i)} label={label} hint={hint} icon={(["nails", "barber", "salon"] as const)[i]!} trade={trade} />
              ))}
            </ChoiceGroup>
            <div className="mt-4">
              {c.svc.map((name, i) => (
                <ServiceRow key={name} checked={checked[i]!} onCheckedChange={(v) => setChecked((a) => a.map((x, j) => (j === i ? v : x)))} name={name} duration={String(45 + i * 15)} price={String(35 + i * 10)} labels={{ duration: c.duration, price: c.price }} deposit={{ on: i === 0 ? deposit : false, onChange: setDeposit, label: c.deposit, amount: "$15" }} />
              ))}
              <AddRow label={c.add} onClick={() => {}} />
            </div>
          </StepCard>
          <StepCard icon="calendar_week" trade={trade} title={c.steps[2]!} body={c.stepBody} primary={{ label: c.cont }}>
            <WeekStrip days={c.days.map((label, id) => ({ id, label, name: c.dayNames[id]! }))} selected={day} onSelect={setDay} hours={hours} onHoursChange={setHours} labels={{ start: c.opens, end: c.closes, sameEveryDay: c.same, days: c.daysLabel }} onSameEveryDay={() => {}} />
          </StepCard>
          <section className="rounded-r4 border border-border bg-card px-4 shadow-card" aria-label={c.steps[4]}>
            <ShareRow icon="link" trade={trade} title={c.share[0]![0]!} hint={c.share[0]![1]} actionLabel={c.share[0]![2]!} />
            <ShareRow icon="phone_message" trade={trade} title={c.share[1]![0]!} hint={c.share[1]![1]} actionLabel={c.share[1]![2]!} />
            <ShareRow icon="qr_stand" trade={trade} title={c.share[2]![0]!} hint={c.share[2]![1]} actionLabel={c.share[2]![2]!} />
          </section>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {c.presets.map(([name, hint], i) => (
              <PresetCard key={name} name={name} hint={hint} pickLabel={c.pick} onPick={() => setPicked(i)} selected={picked === i}>
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6"><Icon3d name={(["site", "domain", "shops"] as const)[i]!} size={96} trade={trade} /></div>
              </PresetCard>
            ))}
          </div>
          <PlanLine linkLabel={c.see} href="#">{c.plan}</PlanLine>
        </div>
        <LivePreview pillLabel={c.preview} frameLabel={c.frame} closeLabel={c.close} version={`${choice}-${hours.start}-${day}`}>
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-card p-6 text-center">
            <Icon3d name="live" size={160} trade={trade} />
            <p className="text-headline">{c.choices[Number(choice ?? 0)]![0]}</p>
            <span className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-body-strong text-primary-foreground">{c.book}</span>
          </div>
        </LivePreview>
      </div>
    </div>
  );
}
