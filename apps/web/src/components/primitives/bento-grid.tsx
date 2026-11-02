/* Magic UI (MIT, magicui.design) registry item bento-grid, adapted by the kit team (wave Q): tokens instead of neutral-* and rgba shadows
   (card-clear surface), lucide ArrowRight instead of @radix-ui/react-icons, a plain link instead of Button asChild (Base UI has no asChild),
   the whole card is the link target (44px+) and the CTA is always shown (no hover-only reveal: touch and keyboard), a 4px hover lift that is off for reduced motion, RTL-safe. Vendored: not linted. */
/* eslint-disable */
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string
  className?: string
  background?: ReactNode
  Icon?: ElementType
  description: string
  href?: string
  cta?: string
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div className={cn("grid w-full auto-rows-[18rem] grid-cols-3 gap-4", className)} {...props}>
      {children}
    </div>
  )
}

const BentoCard = ({ name, className, background, Icon, description, href, cta, ...props }: BentoCardProps) => (
  <div
    className={cn(
      "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-card bg-card text-card-foreground card-clear",
      className
    )}
    {...props}
  >
    <div className="pointer-events-none absolute inset-0 overflow-hidden">{background}</div>
    <div className="relative z-10 mt-auto flex flex-col gap-1 px-5 pt-5 pb-1 transition-transform duration-300 motion-reduce:transition-none lg:group-hover:-translate-y-1 motion-reduce:lg:group-hover:translate-y-0">
      {Icon ? (
        <span aria-hidden className="mb-2 grid size-11 place-items-center rounded-r3 bg-trade-soft text-trade-deep">
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
      ) : null}
      <h3 className="text-headline font-[650] text-foreground">{name}</h3>
      <p className="max-w-lg text-body text-muted-foreground">{description}</p>
    </div>
    {href && cta ? (
      <a
        href={href}
        className="relative z-10 inline-flex min-h-11 items-center gap-1.5 px-5 pb-3 text-body font-[600] text-link after:absolute after:inset-0 after:content-[''] focus-visible:focus-ring"
      >
        {cta}
        <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
      </a>
    ) : null}
    <div className="pointer-events-none absolute inset-0 transition-colors duration-300 group-hover:bg-hover/40" />
  </div>
)

export { BentoCard, BentoGrid }
