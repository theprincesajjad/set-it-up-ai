import type { ReactNode } from "react";
import { LiquidGlassLens } from "@/components/ui/LiquidGlassLens";

/** Shop websites (workstream G): full width, no pass chrome; each page sets the shop's style and language itself. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      {children}
      <LiquidGlassLens />
    </div>
  );
}
