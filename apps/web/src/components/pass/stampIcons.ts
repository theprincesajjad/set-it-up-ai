import { Droplets, Flame, Wrench, type LucideIcon } from "lucide-react";
import { verticalIcon } from "@/components/ui/VerticalIcon";

/** The glyph a trade stamps with: the vertical's own icon (cup for a café, scissors for a salon, fork and knife for a restaurant...), with a few trades given a more specific one. */
const OVERRIDES: Record<string, LucideIcon> = { fitness: Flame, repair_electronics: Wrench, car_wash: Droplets };

export function stampIcon(vertical: string | null | undefined): LucideIcon {
  return (vertical && OVERRIDES[vertical]) || verticalIcon(vertical);
}
