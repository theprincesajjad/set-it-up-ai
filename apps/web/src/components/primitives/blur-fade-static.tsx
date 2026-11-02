/* Zero-JS variant of the Magic UI blur-fade (components/primitives/blur-fade.tsx), added by the visitor team (wave Q) for server-rendered
   marketing pages, where the motion version would add ~35 kB of script and keep a section hidden until it hydrates. Same look (rise,
   fade and un-blur as the block scrolls in), done with a CSS scroll-driven animation (animation-timeline: view()). Progressive: where
   the browser has no scroll timelines, or the visitor asks for reduced motion, the content simply shows. Never use it above the fold
   (the hero, the plan cards a test reads for contrast): it starts transparent at the bottom edge of the screen. */
import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils";
import "./blur-fade-static.css";

type Props<T extends ElementType> = { as?: T; className?: string } & Omit<ComponentPropsWithoutRef<T>, "as" | "className">;

export function BlurFadeStatic<T extends ElementType = "div">({ as, className, ...props }: Props<T>) {
  const Tag = (as ?? "div") as ElementType;
  return <Tag data-slot="blur-fade" className={cn("blur-fade-static", className)} {...props} />;
}
