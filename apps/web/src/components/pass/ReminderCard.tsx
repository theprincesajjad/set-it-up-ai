"use client";
import { useFmt } from "@/components/restaurant/ui";

/**
 * Pharmacy booked screen (docs/research/pharmacies-wellness.md, frame 05b): "Reminder we will send" with the exact text. The server
 * builds the words (no service, no health details, the STOP line) so the card and the phone can never differ.
 */
export function ReminderCard({ text }: { text: string | undefined }) {
  const { t } = useFmt();
  if (!text) return null;
  return (
    <section aria-label={t("rx.book.reminderTitle")} data-testid="pharmacy-reminder" className="flex flex-col gap-1 rounded-card bg-bg-subtle p-4">
      <h2 className="text-caption font-semibold uppercase tracking-wide text-fg-muted">{t("rx.book.reminderTitle")}</h2>
      <p dir="auto" className="break-words text-body text-fg">{text}</p>
    </section>
  );
}
