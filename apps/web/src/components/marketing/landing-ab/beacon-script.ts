/**
 * The landing pages' only measurement code (ab-spec §4.1): an inline script, no bundle, under 1 KB. It runs only when the proxy set
 * `ll_aid` (not `off`) and the browser does not send Global Privacy Control, and sends five first-party events to our own API with
 * navigator.sendBeacon (one beacon per event, so nothing waits for pagehide): view, scroll_50, scroll_90, cta_click (hero, nav, plans)
 * and start_submit, each at most once per page load.
 * It also puts the `ll_v` value into the start form as a hidden `v` field, so /signup?…&v= carries the variant like `src`.
 * CTAs are found by `data-cta` when a page sets it, else by place (the hero's and the nav's button, any link in #plans).
 * `p` is the visible URL: a visit to an internal variant path is not counted (the API knows only the three public paths).
 */
export const BEACON_ENDPOINT = "/api/public/landing-events";

export const BEACON_SCRIPT = `(function(){var d=document,n=navigator,L=location,g=function(k){var m=RegExp("(^|; )"+k+"=([^;]+)").exec(d.cookie);return m&&decodeURIComponent(m[2])},a=g("ll_aid"),v=g("ll_v"),s=d.querySelector("[data-solo-trade]"),o={},F=d.querySelector("form.sl-form"),i;if(!s||!a||a=="off"||n.globalPrivacyControl)return;function e(k,x){o[k]||(o[k]=n.sendBeacon("${BEACON_ENDPOINT}",JSON.stringify({aid:a,v:v,p:L.pathname,q:L.search,tr:s.dataset.soloTrade,ev:[{k:k,d:x}]})))}e("view");addEventListener("scroll",function(){var r=(scrollY+innerHeight)/d.body.scrollHeight;r>.5&&e("scroll_50");r>.9&&e("scroll_90")},{passive:1});d.addEventListener("click",function(t){var l=t.target.closest&&t.target.closest("[data-cta],a.sl-btn,#plans a"),c=l&&(l.dataset.cta||(l.closest(".sl-hero")?"hero":l.closest(".sl-nav")?"nav":l.closest("#plans")&&"plans"));c&&e("cta_click",c)});if(F){if(v){i=d.createElement("input");i.type="hidden";i.name="v";i.value=v;F.appendChild(i)}F.addEventListener("submit",function(){e("start_submit")})}})();`;
