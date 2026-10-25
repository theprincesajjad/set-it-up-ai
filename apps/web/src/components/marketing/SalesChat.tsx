"use client";
/**
 * The website chat (frame A4): the same assistant as our WhatsApp number. Shown only when the API says the assistant is on.
 * The first thing in the panel is the AI disclosure, before the visitor types. "Continue on WhatsApp" shows only when a number is
 * configured. When a person takes over, the widget polls for their replies.
 */
import { MessageCircle, Send, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_TEXTS, WIDGET_TEXTS, type AgentLang, type salesAgentApi } from "@ll/shared";
import { browserApi } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { afterReply, chatLang, lastRemoteAt, loadChat, mergeLines, saveChat, shouldPoll, type Line } from "@/lib/marketing/salesChat";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

const store = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

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
  const linesRef = useRef<Line[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  });

  // Browser-only state (the page language, the tab's saved chat) can only be read after mount: reading it during render would mismatch the server HTML.
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(chatLang(document.documentElement.lang, navigator.language));
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

  if (!info?.enabled) return null;
  const T = WIDGET_TEXTS[lang];
  const wa = whatsappUrl(undefined, info.whatsappNumber ?? undefined);
  // Before the first message the panel already says what this is.
  const shown: Line[] = lines.length ? lines : [{ id: "preview-disclosure", role: "assistant", text: AGENT_TEXTS[lang].disclosure({ whatsapp: false }), at: "" }];
  const fresh = lines.length === 0;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={T.launcher}
          className="fixed bottom-4 end-4 z-50 inline-flex h-12 items-center gap-2 rounded-full bg-fg px-5 text-meta-strong text-bg shadow-lg hover:bg-brand-hover focus-visible:focus-ring"
        >
          <MessageCircle aria-hidden className="size-4" />
          {T.launcher}
        </button>
      ) : null}
      {open ? (
        <section role="dialog" aria-label={T.title} onKeyDown={(e) => e.key === "Escape" && setOpen(false)} className="fixed inset-x-2 bottom-2 z-50 flex h-[min(640px,calc(100dvh-1rem))] flex-col overflow-hidden rounded-sheet border border-line bg-bg shadow-xl md:inset-x-auto md:bottom-4 md:end-4 md:w-[380px]">
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-body font-semibold text-fg">{T.title}</h2>
              <p className="truncate text-caption text-fg-muted">{status === "human" ? T.human : T.subtitle}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={T.close} className="inline-flex size-11 items-center justify-center rounded-full hover:bg-bg-subtle focus-visible:focus-ring">
              <X aria-hidden className="size-4" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg-subtle px-3 py-3" aria-live="polite">
            <ol className="flex flex-col gap-2">
              {shown.map((l) => (
                <li key={l.id} className={cn("flex flex-col", l.role === "user" ? "items-end" : "items-start")}>
                  {l.role === "human" ? <span className="mb-0.5 px-1 text-caption text-fg-muted">{T.human}</span> : null}
                  <p dir="auto" className={cn("max-w-[85%] whitespace-pre-wrap rounded-[16px] px-3.5 py-2.5 text-meta", l.role === "user" ? "bg-fg text-bg" : "border border-line bg-bg text-fg")}>
                    {l.text}
                  </p>
                </li>
              ))}
            </ol>
            {fresh ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {T.chips.map((c) => (
                  <button key={c} type="button" onClick={() => void send(c)} className="min-h-11 rounded-full border border-line bg-bg px-3.5 text-meta-strong text-fg hover:bg-bg-muted focus-visible:focus-ring">
                    {c}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? <p className="mt-2 px-1 text-caption text-fg-muted" role="status">{T.typing}…</p> : null}
            {error ? <p role="alert" className="mt-2 px-1 text-meta text-negative">{T.error}</p> : null}
            <div ref={end} />
          </div>
          <form
            className="flex flex-col gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <div className="flex items-center gap-2">
              <label htmlFor="sales-chat-input" className="sr-only">{T.placeholder}</label>
              <input id="sales-chat-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={T.placeholder} dir="auto" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-body text-fg placeholder:text-fg-subtle focus-visible:focus-ring" />
              <button type="submit" disabled={busy || !text.trim()} aria-label={T.send} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-fg text-bg hover:bg-brand-hover focus-visible:focus-ring disabled:opacity-40">
                <Send aria-hidden className="size-4 rtl:-scale-x-100" />
              </button>
            </div>
            <p className="px-1 text-caption text-fg-muted">
              {wa ? <><a href={wa} target="_blank" rel="noopener noreferrer" className="font-medium text-fg underline underline-offset-2">{T.whatsapp}</a>{" · "}</> : null}
              {T.retention}{" "}
              <Link href="/legal/privacy" className="underline underline-offset-2">{T.privacy}</Link>
            </p>
          </form>
        </section>
      ) : null}
    </>
  );
}
