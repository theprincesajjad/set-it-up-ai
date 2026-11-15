"use client"
import { cn } from "@/lib/utils"
import { useLocaleOrEnglish } from "@/lib/i18n/client"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const { t } = useLocaleOrEnglish()
  return (
    <Loader2Icon data-slot="spinner" role="status" aria-label={t("ui.skeleton.loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
