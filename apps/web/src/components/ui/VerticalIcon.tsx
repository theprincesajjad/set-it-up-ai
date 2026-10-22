import {
  BookOpen, Beer, Car, Coffee, Croissant, Dumbbell, Flower2, Leaf, MonitorSmartphone, PawPrint, Pill, Printer, Ruler, Scissors, Shirt,
  ShoppingBag, ShoppingBasket, Sparkles, Store, UtensilsCrossed, type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { verticalVisual } from "@ll/design-tokens";

/** lucide component per vertical (mirrors verticalVisuals[v].iconComponent in @ll/design-tokens). */
const ICONS: Record<string, LucideIcon> = {
  Coffee, UtensilsCrossed, Croissant, Beer, ShoppingBasket, Pill, ShoppingBag, BookOpen, Flower2, PawPrint, Sparkles, Scissors, Leaf, Dumbbell,
  MonitorSmartphone, Car, Ruler, Shirt, Printer, Store,
};

export function verticalIcon(vertical: string | null | undefined): LucideIcon {
  return ICONS[verticalVisual(vertical).iconComponent] ?? Store;
}

export function verticalLabel(vertical: string | null | undefined): string {
  return verticalVisual(vertical).label;
}

/** CSS variable for a vertical colour role, e.g. verticalVar("repair_auto", "tint") → var(--ll-vertical-repair-auto-tint). */
export function verticalVar(vertical: string | null | undefined, role: "accent" | "on-accent" | "tint" | "ink"): string {
  const v = verticalVisual(vertical).vertical.replace(/_/g, "-");
  return `var(--ll-vertical-${v}-${role})`;
}

/** The vertical's lucide icon as an element (static component, safe to use in render). */
export function VerticalGlyph({ vertical, className, style }: { vertical: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  return createElement(verticalIcon(vertical), { "aria-hidden": true, className, style });
}
