"use client"
/* Magic UI (MIT) registry item animated-list (motion/react). Copied by the kit team (wave Q) with the shadcn CLI transforms (icons -> lucide-react, cn -> @/lib/utils, ui -> primitives); LOCAL PATCH marks our token/RTL/44px edits. Vendored: not linted. LOCAL PATCH: reduced motion shows all items without the spring. */
/* eslint-disable */

import React, {
  useEffect,
  useMemo,
  useState,
  type ComponentPropsWithoutRef,
} from "react"
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react"

import { cn } from "@/lib/utils"

export function AnimatedListItem({ children }: { children: React.ReactNode }) {
  const animations: MotionProps = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1, originY: 0 },
    exit: { scale: 0, opacity: 0 },
    transition: { type: "spring", stiffness: 350, damping: 40 },
  }

  return (
    <motion.div {...animations} layout className="mx-auto w-full">
      {children}
    </motion.div>
  )
}

export interface AnimatedListProps extends ComponentPropsWithoutRef<"div"> {
  children: React.ReactNode
  delay?: number
}

export const AnimatedList = React.memo(
  ({ children, className, delay = 1000, ...props }: AnimatedListProps) => {
    const [index, setIndex] = useState(0)
    // LOCAL PATCH: reduced motion shows every item at once, newest first, without the spring.
    const reduce = useReducedMotion()
    const childrenArray = useMemo(
      () => React.Children.toArray(children),
      [children]
    )

    useEffect(() => {
      let timeout: ReturnType<typeof setTimeout> | null = null

      if (index < childrenArray.length - 1) {
        timeout = setTimeout(() => {
          setIndex((prevIndex) => (prevIndex + 1) % childrenArray.length)
        }, delay)
      }

      return () => {
        if (timeout !== null) {
          clearTimeout(timeout)
        }
      }
    }, [index, delay, childrenArray.length])

    const itemsToShow = useMemo(() => {
      const result = childrenArray.slice(0, reduce ? childrenArray.length : index + 1).reverse()
      return result
    }, [index, childrenArray, reduce])

    return (
      <div
        className={cn(`flex flex-col items-center gap-4`, className)}
        {...props}
      >
        <AnimatePresence>
          {itemsToShow.map((item) =>
            reduce ? (
              <div key={(item as React.ReactElement).key} className="mx-auto w-full">
                {item}
              </div>
            ) : (
              <AnimatedListItem key={(item as React.ReactElement).key}>
                {item}
              </AnimatedListItem>
            )
          )}
        </AnimatePresence>
      </div>
    )
  }
)

AnimatedList.displayName = "AnimatedList"
