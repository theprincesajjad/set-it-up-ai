import { CookingPot, Salad, Soup } from "lucide-react";
import { LOCALES, type Locale } from "@ll/shared";
import { copy } from "@/copy/en-CA";
import { PhoneFrame } from "./Mocks";

const ITEMS = [
  { name: "Chicken biryani", meta: "halal · spice 2", price: "$16" },
  { name: "Lamb karahi", meta: "halal · serves 2", price: "$24" },
  { name: "Veg thali", meta: "vegetarian · Jain option", price: "$14" },
];

/** Each dish's picture: a drawn tile in the marketing tints (no photo of a dish we do not sell). */
const THUMBS = [
  { Icon: CookingPot, tone: "bg-tile-butter text-tile-butter-foreground" },
  { Icon: Soup, tone: "bg-tile-peach text-tile-peach-foreground" },
  { Icon: Salad, tone: "bg-tile-mint text-tile-mint-foreground" },
];

/** The mock's own words on the translated pages (the page's promise is the menu in four languages; the dish names come from the page's copy). */
const PHONE_WORDS: Partial<Record<Locale, { sub: string; chips: [string, string, string]; cart: string }>> = {
  hi: { sub: "हलाल · 20 मिनट में पिकअप · सीधे ऑर्डर करें", chips: ["बिरयानी", "कड़ाही", "टिफ़िन"], cart: "ऑर्डर देखें · $16" },
  ur: { sub: "حلال · 20 منٹ میں پک اپ · براہِ راست آرڈر کریں", chips: ["بریانی", "کڑاہی", "ٹفن"], cart: "آرڈر دیکھیں · \u2066$16\u2069" },
  pa: { sub: "ਹਲਾਲ · 20 ਮਿੰਟ ਵਿੱਚ ਪਿਕਅੱਪ · ਸਿੱਧਾ ਆਰਡਰ ਕਰੋ", chips: ["ਬਿਰਯਾਨੀ", "ਕੜਾਹੀ", "ਟਿਫ਼ਨ"], cart: "ਆਰਡਰ ਵੇਖੋ · $16" },
};

/**
 * The ordering page as a customer sees it on a phone, in the page's language: `dishes` are the page's translated dish lines
 * ("Chicken biryani · halal"). Static example data (aria-hidden by PhoneFrame), labelled under the phone (`note`).
 */
export function RestaurantPhone({ note, locale = "en", dishes }: { note?: string; locale?: Locale; dishes?: readonly string[] } = {}) {
  const words = PHONE_WORDS[locale];
  const p = { ...copy.restaurants.phone, ...(words ?? {}) };
  const items = words && dishes ? ITEMS.map((it, i) => {
    const [name = it.name, ...meta] = (dishes[i] ?? "").split(" · ");
    return { ...it, name, meta: meta.join(" · ") };
  }) : ITEMS;
  const info = LOCALES[words ? locale : "en"];
  return (
    <figure lang={info.bcp47} dir={info.dir} className="flex min-w-0 max-w-full flex-col items-center gap-3">
      <PhoneFrame height={480}>
        <div className="absolute inset-0 flex flex-col gap-3 px-5 pt-14">
          <div>
            <p className="display text-[26px] leading-8 text-foreground">{p.name}</p>
            <p className="text-[12px] text-muted-foreground">{p.sub}</p>
          </div>
          <div className="flex gap-1.5">
            {p.chips.map((c, i) => (
              <span key={c} className={i === 0 ? "inline-flex h-7 items-center rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground" : "inline-flex h-7 items-center rounded-full border border-border px-3 text-[12px] font-semibold text-foreground"}>
                {c}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {items.map((i, n) => {
              const { Icon, tone } = THUMBS[n % THUMBS.length]!;
              return (
              <li key={i.price} className="flex items-center gap-3 py-3">
                <span className={`flex size-12 shrink-0 items-center justify-center rounded-input ${tone}`}>
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">{i.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{i.meta}</span>
                </span>
                <span dir="ltr" className="text-[13px] font-semibold tabular-nums text-foreground">{i.price}</span>
              </li>
              );
            })}
          </ul>
          <span className="mt-auto mb-6 flex h-11 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">{p.cart}</span>
        </div>
      </PhoneFrame>
      <figcaption lang={LOCALES[locale].bcp47} dir={LOCALES[locale].dir} className="text-caption text-muted-foreground">
        {note ?? p.note}
      </figcaption>
    </figure>
  );
}

/** A kitchen ticket in Urdu, right to left. A cook sees this on the Pro kitchen display; the text is an example. */
export function KitchenTicket({ note = copy.restaurants.kitchenNote }: { note?: string } = {}) {
  return (
    <figure>
      {/* A plain lang/dir box, not a LocaleScope: a scope also writes lang and dir onto <html>, and this always-Urdu ticket sits inside
          the page's own scope, so on unmount it left <html> right to left in Urdu for the next page reached by a client-side link. */}
      <div lang={LOCALES.ur.bcp47} dir="rtl" className="rounded-sheet border border-border bg-background p-5 leading-loose md:p-6">
        <div data-testid="kitchen-ticket" className="flex flex-col gap-3">
          <p className="text-body-strong text-foreground">مطبخ · آرڈر 112</p>
          <p className="rounded-input bg-muted px-4 py-3 text-body text-foreground">2 × چکن بریانی</p>
          <p className="rounded-input bg-muted px-4 py-3 text-body text-foreground">1 × لیمب کڑاہی · کم مرچ</p>
          <span className="flex h-12 items-center justify-center rounded-full bg-primary text-body-strong text-primary-foreground">تیار ہے</span>
        </div>
      </div>
      <figcaption className="mt-2 text-caption text-muted-foreground">{note}</figcaption>
    </figure>
  );
}
