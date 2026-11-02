import type { ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion";
import { cn } from "@/lib/cn";

/**
 * Questions and answers on the kit Accordion (Base UI, wave Q): one card, hairline rows, 64px triggers, the chevron turns. Every answer
 * stays in the HTML (`hiddenUntilFound`, which keeps the panels mounted), so search engines see it and find-in-page opens it; several can be open at once.
 */
export function Faq({ items, className }: { items: { q: string; a: ReactNode }[]; className?: string }) {
  return (
    <Accordion multiple hiddenUntilFound className={cn("card-clear px-5 md:px-6", className)} data-faq>
      {items.map((i) => (
        <AccordionItem key={i.q} value={i.q} className="border-border">
          <AccordionTrigger className="min-h-16 items-center gap-6 py-4 text-[17px] leading-6 font-[650] text-foreground hover:no-underline focus-visible:ring-offset-0 **:data-[slot=accordion-trigger-icon]:size-5">
            {i.q}
          </AccordionTrigger>
          <AccordionContent keepMounted className="max-w-2xl pb-5 text-body leading-relaxed text-muted-foreground">
            {i.a}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
