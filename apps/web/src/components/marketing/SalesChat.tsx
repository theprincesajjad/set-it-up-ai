"use client";
/**
 * The website chat (frame A4): the same assistant as our WhatsApp number. Shown only when the API says the assistant is on.
 * The first thing in the panel is the AI disclosure, before the visitor types. "Continue on WhatsApp" shows only when a number is
 * configured. When a person takes over, the widget polls for their replies.
 */
import { MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AGENT_TEXTS, WIDGET_TEXTS, type AgentLang, type salesAgentApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { afterReply, chatLang, lastRemoteAt, loadChat, mergeLines, saveChat, shouldPoll, type Line } from "@/lib/marketing/salesChat";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/** The sign-up buttons and links the launcher must never cover. The sticky bar's own button is beside it, not under it. */
const CTA = "[data-cta], .lp-btn, main a[href^='/signup']";

/** Is any sign-up button under the launcher (with an 8px margin)? What lies under the sticky bar is hidden by it, so it does not count. */
function coversCta(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const xs = [r.left - 8, r.left + r.width / 2, r.right + 8];
  const ys = [r.top - 8, r.top + r.height / 2, r.bottom + 8];
  for (const x of xs)
    for (const y of ys)
      for (const hit of document.elementsFromPoint(x, y)) {
        if (el.contains(hit)) continue;
        if (hit.closest(".lp-sticky")) break;
        if (hit.closest(CTA)) return true;
      }
  return false;
}

/**
 * Phones only: marks the launcher `data-covered` (it fades out) while a sign-up button scrolls under it, and clears it when the button
 * has passed. Checked once a frame on scroll and resize, and when the sticky bar shows or hides. Never while it has focus.
 */
function useOffCtas(ref: RefObject<HTMLButtonElement | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return;
    const phone = window.matchMedia("(max-width: 639.98px)");
    let raf = 0;
    const check = () => {
      raf = 0;
      el.toggleAttribute("data-covered", phone.matches && document.activeElement !== el && coversCta(el));
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    phone.addEventListener("change", queue);
    const sticky = document.querySelector(".lp-sticky");
    const mo = new MutationObserver(queue);
    if (sticky) mo.observe(sticky, { attributes: true, attributeFilter: ["data-hide"] });
    // The sticky bar slides for 240ms; look again once it has settled.
    sticky?.addEventListener("transitionend", queue);
    queue();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      phone.removeEventListener("change", queue);
      sticky?.removeEventListener("transitionend", queue);
      mo.disconnect();
    };
  }, [ref, on]);
}

export function SalesChat() {
  const [info, setInfo] = useState<salesAgentApi.SalesAgentStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<AgentLang>("en");
  const [lines, setLines] = useState<Line[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<salesAgentApi.ConversationStatus>("open");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const linesRef = useRef<Line[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  });

  // Browser-only state (the page language, the tab's saved chat) can only be read after mount: reading it during render would mismatch the server HTML.
  useEffect(() => {
    let live = true;
    // ?lang= first (the same switch the legal pages use), then the browser's languages in order, then the page's own. Only the widget changes language.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(chatLang(new URLSearchParams(window.location.search).get("lang"), ...(navigator.languages?.length ? navigator.languages : [navigator.language]), document.documentElement.lang));
    const saved = loadChat(store());
    if (saved) {
      setToken(saved.token);
      setLines(saved.lines);
      setStatus(saved.status);
    }
    browserApi.salesAgent.status().then((s) => live && setInfo(s)).catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length, open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  // A person has the chat: look for their replies.
  useEffect(() => {
    if (!token || !open || !shouldPoll(status)) return;
    const t = setInterval(() => {
      browserApi.salesAgent
        .poll(token, lastRemoteAt(linesRef.current))
        .then((r) => {
          setStatus(r.status);
          if (r.lines.length) setLines((cur) => mergeLines(cur, r.lines));
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(t);
  }, [token, open, status]);

  const send = useCallback(
    async (raw: string) => {
      const body = raw.trim();
      if (!body || busy) return;
      setBusy(true);
      setError(false);
      setText("");
      const mine: Line = { id: `local-${Date.now()}`, role: "user", text: body, at: new Date().toISOString() };
      setLines((cur) => [...cur, mine]);
      try {
        const r = await browserApi.salesAgent.send({ text: body, sessionToken: token ?? undefined, language: lang, page: window.location.pathname });
        setToken(r.sessionToken);
        setStatus(r.status);
        setLang(r.language);
        setLines((cur) => {
          const next = afterReply(cur, mine, r.lines);
          saveChat(store(), { token: r.sessionToken, lines: next, status: r.status });
          return next;
        });
      } catch {
        setError(true);
      } finally {
        setBusy(false);
      }
    },
    [busy, token, lang],
  );

  useOffCtas(launcher, Boolean(info?.enabled) && !open);

  if (!info?.enabled) return null;
  const T = WIDGET_TEXTS[lang];
  const wa = whatsappUrl(undefined, info.whatsappNumber ?? undefined);
  // Before the first message the panel already says what this is.
  const shown: Line[] = lines.length ? lines : [{ id: "preview-disclosure", role: "assistant", text: AGENT_TEXTS[lang].disclosure({ whatsapp: false }), at: "" }];
  const fresh = lines.length === 0;

  return (
    <>
      {!open ? (
        // Phones (under 640px, max-sm): a 48px round icon in the sticky bar's end slot (landing.css keeps that slot free), hidden while
        // it would sit over a sign-up button (useOffCtas). Wider screens keep the labelled pill. The label is in the marketing sans the
        // page already loaded, so the home page never fetches Inter for two words.
        <button
          ref={launcher}
          type="button"
          onClick={() => setOpen(true)}
          aria-label={T.launcher}
          data-chat-launcher=""
          className={`mkt ${marketingFontVars} fixed bottom-4 end-4 z-50 inline-flex h-11 items-center gap-2 rounded-r2 bg-primary px-4 text-meta-strong text-primary-foreground shadow-float transition-[opacity,visibility] duration-200 hover:bg-primary/90 focus-visible:focus-ring data-covered:invisible data-covered:opacity-0 max-sm:bottom-[calc(6px+env(safe-area-inset-bottom))] max-sm:size-12 max-sm:justify-center max-sm:rounded-full max-sm:px-0 max-sm:ring-1 max-sm:ring-white/20 motion-reduce:transition-none font-mkt-sans`}
        >
          <MessageCircle aria-hidden className="size-4 max-sm:size-5" />
          <span className="max-sm:hidden">{T.launcher}</span>
        </button>
      ) : null}
      {open ? (
        <section role="dialog" aria-label={T.title} lang={lang === "en" ? undefined : lang === "fr" ? "fr-CA" : lang} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} className="fixed inset-x-2 bottom-2 z-50 flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-sheet border border-border bg-background shadow-xl md:inset-x-auto md:bottom-4 md:end-4 md:w-[380px]">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-body font-semibold text-foreground">{T.title}</h2>
              <p className="truncate text-caption text-muted-foreground">{status === "human" ? T.human : T.subtitle}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={T.close} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-muted focus-visible:focus-ring">
              <X aria-hidden className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted px-3 py-3" aria-live="polite">
            <ol className="flex flex-col gap-2">
              {shown.map((l) => (
                <li key={l.id} className={cn("flex flex-col", l.role === "user" ? "items-end" : "items-start")}>
                  {l.role === "human" ? <span className="mb-0.5 px-1 text-caption text-muted-foreground">{T.human}</span> : null}
                  <p dir="auto" className={cn("max-w-[85%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-meta", l.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground")}>
                    {l.text}
                  </p>
                </li>
              ))}
            </ol>
            {fresh ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {T.chips.map((c) => (
                  <button key={c} type="button" onClick={() => void send(c)} className="min-h-11 rounded-full border border-border bg-background px-3.5 text-meta-strong text-foreground hover:bg-hover focus-visible:focus-ring">
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? <p className="mt-2 px-1 text-caption text-muted-foreground" role="status">{T.typing}…</p> : null}
            {error ? <p role="alert" className="mt-2 px-1 text-meta text-destructive">{T.error}</p> : null}
            <div ref={end} />
          </div>
          <form
            className="flex flex-col gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor="sales-chat-input" className="sr-only">{T.placeholder}</label>
              <input id="sales-chat-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={T.placeholder} dir="auto" className="h-11 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-body text-foreground placeholder:text-muted-foreground focus-visible:focus-ring" />
              <button type="submit" disabled={busy || !text.trim()} aria-label={T.send} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:focus-ring disabled:opacity-40">
                <Send aria-hidden className="size-4 rtl:-scale-x-100" />
              </button>
            </div>
            <p className="px-1 text-caption text-muted-foreground">
              {wa ? <><a href={wa} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground underline underline-offset-2">{T.whatsapp}</a>{" · "}</> : null}
              {T.retention}{" "}
              <Link href={lang === "fr" ? "/legal/privacy?lang=fr" : "/legal/privacy"} className="underline underline-offset-2">{T.privacy}</Link>
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}
