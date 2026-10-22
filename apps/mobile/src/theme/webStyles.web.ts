/**
 * Expo web only. Text fields draw their own focus border (TextField, PhoneField,
 * OtpField), so drop the browser outline that would double it; no grey tap flash.
 */
export function installWebStyles(): void {
  if (typeof document === "undefined" || document.getElementById("ll-web-styles")) return;
  const el = document.createElement("style");
  el.id = "ll-web-styles";
  el.textContent = "input,textarea{outline:none!important}*{-webkit-tap-highlight-color:transparent}";
  document.head.appendChild(el);
}
