import type { Metadata } from "next";
import { t } from "@ll/shared";
import { DoorTablet } from "@/components/dashboard/queue/DoorTablet";
import { LocaleScope } from "@/lib/i18n/LocaleScope";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  return { title: t(await getLocale(await searchParams), "counter.door.title") };
}

/** The page reads `?lang=` itself so the language chips re-render it (a layout would stay in the old language). */
export default async function DoorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = await getLocale(await searchParams);
  return (
    <LocaleScope locale={locale} className="min-h-screen bg-paper">
      <main id="main" className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <DoorTablet />
      </main>
    </LocaleScope>
  );
}
