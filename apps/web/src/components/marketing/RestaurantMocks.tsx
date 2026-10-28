import { LocaleScope } from "@/lib/i18n";
import { copy } from "@/copy/en-CA";
import { PhoneFrame } from "./Mocks";

const ITEMS = [
  { name: "Chicken biryani", meta: "halal · spice 2", price: "$16" },
  { name: "Lamb karahi", meta: "halal · serves 2", price: "$24" },
  { name: "Veg thali", meta: "vegetarian · Jain option", price: "$14" },
];

/** The ordering page as a customer sees it on a phone. Static example data (aria-hidden by PhoneFrame), labelled under the phone. */
export function RestaurantPhone() {
  const p = copy.restaurants.phone;
  return (
    <figure lang="en-CA" dir="ltr" className="flex flex-col items-center gap-3">
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
            {ITEMS.map((i) => (
              <li key={i.name} className="flex items-center gap-3 py-3">
                <span className="size-12 shrink-0 rounded-input bg-hover" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-foreground">{i.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{i.meta}</span>
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{i.price}</span>
              </li>
            ))}
          </ul>
          <span className="mt-auto mb-6 flex h-11 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">{p.cart}</span>
        </div>
      </PhoneFrame>
      <figcaption className="text-caption text-muted-foreground">{p.note}</figcaption>
    </figure>
  );
}

/** A kitchen ticket in Urdu, right to left. A cook sees this on the Pro kitchen display; the text is an example. */
export function KitchenTicket() {
  return (
    <figure>
      <LocaleScope locale="ur" className="rounded-sheet border border-border bg-background p-5 md:p-6">
        <div data-testid="kitchen-ticket" className="flex flex-col gap-3">
          <p className="text-body-strong text-foreground">مطبخ · آرڈر 112</p>
          <p className="rounded-input bg-muted px-4 py-3 text-body text-foreground">2 × چکن بریانی</p>
          <p className="rounded-input bg-muted px-4 py-3 text-body text-foreground">1 × لیمب کڑاہی · کم مرچ</p>
          <span className="flex h-12 items-center justify-center rounded-full bg-primary text-body-strong text-primary-foreground">تیار ہے</span>
        </div>
      </LocaleScope>
      <figcaption className="mt-2 text-caption text-muted-foreground">{copy.restaurants.kitchenNote}</figcaption>
    </figure>
  );
}
