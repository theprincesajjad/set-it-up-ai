/**
 * /offline: what the service worker (public/sw.js) shows when a pass page cannot be reached. A plain HTML page with its own styles and
 * script, so it needs nothing else from the network (no app chunks, fonts or images). It holds no one's data: the member number and QR
 * come from this browser's localStorage (lib/offlineCard.ts), so one cached copy is safe to serve to anyone.
 */
import { BRAND, LOCALES, LOCALE_CODES, translator } from "@ll/shared";
import { OFFLINE_CARD_KEY } from "@/lib/offlineCard";

const LOCALE_COOKIE = "ll_lang";

function strings() {
  const out: Record<string, Record<string, string>> = {};
  for (const l of LOCALE_CODES) {
    const t = translator(l);
    out[l] = { title: t("off.title"), body: t("off.body", { code: "{code}" }), bodyNoCode: t("off.bodyNoCode"), retry: t("off.retry"), label: t("off.numberLabel") };
  }
  return out;
}

const json = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function GET() {
  const dirs: Record<string, string> = {};
  for (const l of LOCALE_CODES) dirs[l] = LOCALES[l].dir;
  const s = strings();
  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#F2F2F7">
<title>${s.en!.title} · ${BRAND.name}</title>
<style>
:root{--bg:#F2F2F7;--card:#fff;--fg:#14141a;--muted:#5b5b66;--line:#d9d9e0;--accent:#14141a;--on:#fff;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0e0e12;--card:#1a1a20;--fg:#f4f4f7;--muted:#a9a9b4;--line:#34343c;--accent:#f4f4f7;--on:#14141a}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari","Noto Sans Gurmukhi","Noto Naskh Arabic",sans-serif;display:flex;justify-content:center}
main{width:100%;max-width:480px;padding:48px 16px 32px;display:flex;flex-direction:column;gap:20px}
.status{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;font-size:14px;font-weight:600;color:var(--muted)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}
h1{margin:0;font-size:32px;line-height:1.15;font-weight:700;letter-spacing:-.01em}
p{margin:0;color:var(--muted)}
.card{display:none;flex-direction:column;align-items:center;gap:12px;padding:24px 16px;background:var(--card);border:1px solid var(--line);border-radius:20px;text-align:center}
.card.on{display:flex}
.label{font-size:14px;color:var(--muted)}
.code{font-size:40px;line-height:1.1;font-weight:700;letter-spacing:.08em;font-variant-numeric:tabular-nums;direction:ltr;word-break:break-all;color:var(--fg)}
.qr{width:220px;height:220px;background:#fff;border-radius:12px;padding:8px;display:none}
.qr.on{display:block}
button{min-height:48px;border:0;border-radius:999px;background:var(--accent);color:var(--on);font:inherit;font-weight:600;padding:0 24px;cursor:pointer}
button:focus-visible{outline:3px solid var(--fg);outline-offset:3px}
</style>
</head>
<body>
<main id="main">
<span class="status" role="status"><span class="dot" aria-hidden="true"></span><span id="status"></span></span>
<h1 id="title" tabindex="-1">${s.en!.title}</h1>
<section class="card" id="card"><span class="label" id="label"></span><span class="code" id="code"></span><img class="qr" id="qr" alt=""></section>
<p id="body"></p>
<button type="button" id="retry"></button>
</main>
<script>
(function(){
var S=${json(s)},D=${json(dirs)},KEY=${json(OFFLINE_CARD_KEY)},COOKIE=${json(LOCALE_COOKIE)};
function pick(){
  var m=document.cookie.match(new RegExp("(?:^|; )"+COOKIE+"=([a-z]+)"));
  var c=m&&m[1],q=null;
  try{q=new URLSearchParams(location.search).get("lang")}catch(e){}
  var l=[q,c,(navigator.language||"en").slice(0,2)];
  for(var i=0;i<l.length;i++) if(l[i]&&S[l[i]]) return l[i];
  return "en";
}
var L=pick(),T=S[L];
document.documentElement.lang=L;document.documentElement.dir=D[L];
document.title=T.title;
var card=null;
try{card=JSON.parse(localStorage.getItem(KEY)||"null")}catch(e){}
var code=card&&typeof card.code==="string"&&/^[A-Za-z0-9-]{3,32}$/.test(card.code)?card.code:null;
document.getElementById("status").textContent=T.title;
document.getElementById("title").textContent=T.title;
document.getElementById("body").textContent=code?T.body.replace("{code}",code):T.bodyNoCode;
document.getElementById("retry").textContent=T.retry;
if(code){
  document.getElementById("label").textContent=T.label;
  document.getElementById("code").textContent=code;
  document.getElementById("card").className="card on";
  if(typeof card.qrSvg==="string"&&card.qrSvg.indexOf("<svg")===0){
    var q=document.getElementById("qr");q.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(card.qrSvg);q.className="qr on";
  }
}
document.getElementById("retry").onclick=function(){location.reload()};
window.addEventListener("online",function(){location.reload()});
})();
</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate", "x-robots-tag": "noindex" } });
}
