"use client";
import { useEffect } from "react";

/**
 * The last resort: an error in the root layout itself, where there is no theme, no catalogue and no router. It brings its own <html> and
 * inline styles, says what happened, and offers Reload and a link home. English with the same sentence in Hindi, Urdu and Punjabi (the
 * language is read from the ?lang= parameter, the ll_lang cookie or the browser). Keep it dependency-free: if this file imports the
 * app, it can fail the same way the layout did.
 */
const COPY = {
  en: { lang: "en-CA", dir: "ltr", title: "Local Loyalty didn’t load", body: "Something went wrong on our side. Nothing you saved was lost. Reload the page, or go back to the home page.", reload: "Reload", home: "Home", ref: "Reference" },
  hi: { lang: "hi", dir: "ltr", title: "Local Loyalty लोड नहीं हुआ", body: "हमारी तरफ़ से कुछ गड़बड़ हो गई। आपका सहेजा हुआ कुछ भी नहीं गया। पेज रीलोड करें, या होम पेज पर लौटें।", reload: "रीलोड करें", home: "होम", ref: "संदर्भ" },
  ur: { lang: "ur", dir: "rtl", title: "Local Loyalty لوڈ نہیں ہوا", body: "ہماری طرف سے کچھ خرابی ہو گئی۔ آپ کا محفوظ کیا ہوا کچھ ضائع نہیں ہوا۔ صفحہ ری لوڈ کریں، یا ہوم صفحے پر واپس جائیں۔", reload: "ری لوڈ کریں", home: "ہوم", ref: "حوالہ" },
  pa: { lang: "pa", dir: "ltr", title: "Local Loyalty ਲੋਡ ਨਹੀਂ ਹੋਇਆ", body: "ਸਾਡੇ ਵੱਲੋਂ ਕੁਝ ਗੜਬੜ ਹੋ ਗਈ। ਤੁਹਾਡਾ ਸੰਭਾਲਿਆ ਹੋਇਆ ਕੁਝ ਵੀ ਨਹੀਂ ਗਿਆ। ਪੰਨਾ ਰੀਲੋਡ ਕਰੋ, ਜਾਂ ਹੋਮ ਪੰਨੇ ’ਤੇ ਵਾਪਸ ਜਾਓ।", reload: "ਰੀਲੋਡ ਕਰੋ", home: "ਹੋਮ", ref: "ਹਵਾਲਾ" },
} as const;
type Lang = keyof typeof COPY;

function pickLang(): Lang {
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    const c = /(?:^|;\s*)ll_lang=([^;]+)/.exec(document.cookie)?.[1];
    const first = (q ?? c ?? navigator.language ?? "en").toLowerCase().slice(0, 2);
    return first === "hi" || first === "ur" || first === "pa" ? first : "en";
  } catch {
    return "en";
  }
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Server HTML is English; the browser then switches to the visitor's language. suppressHydrationWarning on the text covers the one-frame change.
  const lang: Lang = typeof window === "undefined" ? "en" : pickLang();
  const c = COPY[lang];
  const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "0 22px", borderRadius: 999, fontSize: 16, fontWeight: 600, textDecoration: "none", cursor: "pointer", border: "1px solid #1d1d1f" } as const;
  return (
    <html lang={c.lang} dir={c.dir} suppressHydrationWarning>
      <body style={{ margin: 0, background: "#f2f2f7", color: "#1d1d1f", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', sans-serif" }}>
        <main id="main" style={{ maxWidth: 480, margin: "0 auto", padding: "72px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, lineHeight: 1.25, margin: "0 0 12px" }} suppressHydrationWarning>
            {c.title}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: "0 0 28px", color: "#4a4a4f" }} suppressHydrationWarning>
            {c.body}
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={() => window.location.reload()} style={{ ...button, background: "#1d1d1f", color: "#ffffff" }} suppressHydrationWarning>
              {c.reload}
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router may be what failed: a plain link */}
            <a href="/" style={{ ...button, background: "transparent", color: "#1d1d1f" }} suppressHydrationWarning>
              {c.home}
            </a>
          </div>
          {error.digest ? (
            <p style={{ fontSize: 12, margin: "28px 0 0", color: "#6e6e73" }} suppressHydrationWarning>
              {c.ref}: {error.digest.slice(0, 8)}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
