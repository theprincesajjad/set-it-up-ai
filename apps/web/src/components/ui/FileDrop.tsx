"use client";
/**
 * Kit (wave Q): pick one image (a shop logo, a cover photo, a service photo). Drag and drop on desktop, the photo picker on phones, an
 * instant preview, Replace and Remove, and a plain-words error for a wrong type or a file that is too big. Modelled on the Origin UI /
 * coss file-upload pattern (that registry has no Base UI build of it yet, so this is ours, on our tokens).
 *
 *   <FileDrop label="Your logo" accept={["image/png", "image/jpeg", "image/svg+xml"]} maxMb={2} value={logoUrl} onFile={upload} onClear={clear} />
 *   <FileDrop label="Cover photo" shape="wide" ... />
 *
 * It never uploads by itself: `onFile(file)` hands you the File (resize, then send). `value` is the current image URL (or a data URL).
 * 44px targets, keyboard (Enter / Space opens the picker), RTL safe, no animation beyond a 150 ms colour change.
 */
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export interface FileDropProps {
  label: string;
  /** MIME types; shown to the person as short names (PNG, JPG, SVG, WebP). */
  accept?: string[];
  maxMb?: number;
  value?: string | null;
  onFile: (file: File) => void;
  onClear?: () => void;
  /** square (logo, default), wide (cover 16:9). */
  shape?: "square" | "wide";
  disabled?: boolean;
  /** An error from your upload (shown in place of the type/size error). */
  error?: string | null;
  className?: string;
}

const SHORT: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG", "image/svg+xml": "SVG", "image/webp": "WebP", "image/gif": "GIF", "application/pdf": "PDF" };

export function FileDrop({ label, accept = ["image/png", "image/jpeg", "image/webp"], maxMb = 5, value, onFile, onClear, shape = "square", disabled, error, className }: FileDropProps) {
  const { t } = useLocaleOrEnglish();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [local, setLocal] = useState<string | null>(null);
  const types = accept.map((a) => SHORT[a] ?? a.split("/")[1]?.toUpperCase() ?? a).join(", ");
  const take = (f: File | undefined | null) => {
    if (!f) return;
    if (accept.length && !accept.includes(f.type)) return setLocal(t("kit.file.wrongType", { types }));
    if (f.size > maxMb * 1024 * 1024) return setLocal(t("kit.file.tooBig", { mb: maxMb }));
    setLocal(null);
    onFile(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files?.[0]);
  };
  const msg = error ?? local;
  const open = () => input.current?.click();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={`${id}-label`} className="text-body font-[550] text-foreground">
        {label}
      </span>
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={cn("shrink-0 rounded-card border border-border bg-card object-cover", shape === "wide" ? "aspect-video w-48" : "size-20")} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={open} disabled={disabled} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-body font-[550] text-foreground hover:bg-hover focus-visible:focus-ring disabled:opacity-50">
              <RefreshCw aria-hidden className="size-4" strokeWidth={1.8} />
              {t("kit.file.replace")}
            </button>
            {onClear ? (
              <button type="button" onClick={onClear} disabled={disabled} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-body font-[550] text-destructive-text hover:bg-destructive-soft focus-visible:focus-ring disabled:opacity-50">
                <Trash2 aria-hidden className="size-4" strokeWidth={1.8} />
                {t("kit.file.remove")}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-labelledby={`${id}-label ${id}-cta`}
          aria-describedby={`${id}-types${msg ? ` ${id}-error` : ""}`}
          aria-invalid={msg ? true : undefined}
          disabled={disabled}
          onClick={open}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          data-over={over || undefined}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border-strong bg-card px-4 py-6 text-center transition-colors duration-150 hover:bg-hover focus-visible:focus-ring disabled:opacity-50 data-over:border-trade data-over:bg-trade-soft aria-invalid:border-destructive",
            shape === "wide" ? "min-h-40" : "min-h-32",
          )}
        >
          <span aria-hidden className="grid size-11 place-items-center rounded-full bg-trade-soft text-trade-deep">
            <ImagePlus className="size-5" strokeWidth={1.8} />
          </span>
          <span id={`${id}-cta`} className="text-body text-foreground">
            <span className="pointer-coarse:hidden">
              {t("kit.file.drop")} <span className="font-[600] text-link underline underline-offset-2">{t("kit.file.browse")}</span>
            </span>
            <span className="hidden font-[600] pointer-coarse:inline">{t("kit.file.tap")}</span>
          </span>
          <span id={`${id}-types`} className="text-meta text-muted-foreground">
            {t("kit.file.types", { types, mb: maxMb })}
          </span>
        </button>
      )}
      {msg ? (
        <p id={`${id}-error`} role="alert" className="text-meta font-medium text-destructive-text">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
