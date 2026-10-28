"use client";
/**
 * Render one of two looks: `clear` under Clear (the default) and `warm` under Main Street Warm. For server pages whose structure differs
 * between the two (the shop page header): both are passed as elements, only the active one reaches the DOM, so text is never doubled.
 * The server renders the nearest <ThemeStyle> provider's style; a `?theme=` override switches once after hydration.
 */
import type { ReactNode } from "react";
import { usePassStyle } from "./useThemeStyle";

export function ThemeFork({ clear, warm }: { clear: ReactNode; warm: ReactNode }) {
  return <>{usePassStyle() === "clear" ? clear : warm}</>;
}
