/**
 * Expo web only. Text fields draw their own focus border (TextField, PhoneField,
 * OtpField), so drop the browser outline that would double it; no grey tap flash. Map pin label halo.
 */
export function installWebStyles(): void {
  if (typeof document === "undefined" || document.getElementById("ll-web-styles")) return;
  const el = document.createElement("style");
  el.id = "ll-web-styles";
  el.textContent = "*:focus,*:focus-visible{outline:none!important}*{-webkit-tap-highlight-color:transparent}.maplibregl-ctrl-attrib{font-size:10px}" +
    // Pin labels get a real halo (stacked shadows; RN-web emits only one) so road names never read through (M10).
    ".maplibregl-marker div[dir=auto]{text-shadow:0 0 1px #fff,0 0 2px #fff,0 0 4px #fff,0 0 8px #fff,0 0 12px #fff!important}" +
    "@media (prefers-color-scheme:dark){.maplibregl-marker div[dir=auto]{text-shadow:0 0 1px #0B0B0C,0 0 2px #0B0B0C,0 0 4px #0B0B0C,0 0 8px #0B0B0C,0 0 12px #0B0B0C!important}}";
  document.head.appendChild(el);
}
