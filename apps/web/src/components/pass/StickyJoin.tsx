"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/** Floating "Join {shop}" bar for the shop page; hides while the join form itself is on screen (one black action at a time). */
export function StickyJoin({ label, target = "join" }: { label: string; target?: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHidden(!!e?.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  return (
    <div className={`chrome sticky bottom-0 z-sticky -mx-4 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-none! transition-opacity duration-150 ease-out ${hidden ? "pointer-events-none opacity-0" : ""}`}>
      <Button href={`#${target}`} fullWidth size="lg">
        {label}
      </Button>
    </div>
  );
}
