// Renders the home page hero video (wave Y): opens scene.html in Chromium, sets scene.js's clock to each of the 720 frames (12 s at
// 60 fps) and screenshots the phone's screen, then encodes the frames with ffmpeg (AV1, VP9 and H.264) and makes posters of frame 0.
// Deterministic: no real-time capture, so no dropped or doubled frames, and the same input gives the same frames.
//
//   node apps/web/scripts/hero-video/render.mjs            (from the repo root; needs ffmpeg with libx264, libvpx-vp9 and libsvtav1)
//
// Options: --frames <dir> (default: a temp dir, never committed), --only-frames, --only-encode, --fps 60.
// Writes public/marketing/video/hero-phone.<hash>.{av1.mp4,vp9.webm,h264.mp4} and the manifest src/components/marketing/landing/
// hero-video.ts (file names, size, length and the cue points the glow behind the phone follows). The posters (AVIF and WebP of frame 0)
// stay in the frames folder: the page draws frame 0 in HTML (HeroLive.tsx), so it never downloads a poster.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, "..", "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const has = (k) => process.argv.includes(k);
const FPS = Number(arg("--fps", 60));
const frames = arg("--frames", join(tmpdir(), "hero-video-frames"));
const outDir = join(web, "public", "marketing", "video");
const DPR = 2;

let meta;
if (!has("--only-encode")) {
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 320, height: 680 }, deviceScaleFactor: DPR, reducedMotion: "no-preference" });
  p.on("pageerror", (e) => console.error("scene error:", e.message));
  await p.goto(pathToFileURL(join(here, "scene.html")).href);
  await p.evaluate(() => window.sceneReady);
  meta = await p.evaluate(() => {
    const r = document.querySelector("[data-screen]").getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, T: window.HERO.T, cues: window.HERO.CUES };
  });
  const n = Math.round(meta.T * FPS);
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await p.evaluate((t) => window.HERO.render(t), f / FPS);
    await p.screenshot({ path: join(frames, `f${String(f).padStart(4, "0")}.png`), clip: { x: meta.x, y: meta.y, width: meta.w, height: meta.h }, animations: "disabled", caret: "hide" });
    if (f % 120 === 0) console.log(`frame ${f}/${n} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
  // t = T must be frame 0 again (the loop seam): both drawn after a late frame, shot the same way, compared byte for byte.
  const clip = { x: meta.x, y: meta.y, width: meta.w, height: meta.h };
  const at = async (t) => {
    await p.evaluate((t) => window.HERO.render(t), t);
    return p.screenshot({ clip });
  };
  await at(meta.T - 1 / FPS);
  const seam = await at(meta.T);
  await at(meta.T - 1 / FPS);
  const same = Buffer.compare(seam, await at(0)) === 0;
  console.log(`loop seam: t=${meta.T} ${same ? "is identical to" : "DIFFERS from"} frame 0`);
  writeFileSync(join(frames, "meta.json"), JSON.stringify(meta));
  await b.close();
} else meta = JSON.parse(readFileSync(join(frames, "meta.json"), "utf8"));
if (has("--only-frames")) process.exit(0);

const W = Math.round(meta.w * DPR), H = Math.round(meta.h * DPR);
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...a], { stdio: "inherit" });
const input = ["-framerate", String(FPS), "-i", join(frames, "f%04d.png")];
// The frames are sRGB PNGs; tag the video BT.709 so browsers draw the colours the page draws.
const color = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];
const vf = ["-vf", `scale=${W}:${H}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`];
const tmp = join(frames, "enc");
mkdirSync(tmp, { recursive: true });
const enc = {
  "av1.mp4": () => ff(...input, ...vf, "-c:v", "libsvtav1", "-preset", "3", "-crf", "46", "-g", "240", "-svtav1-params", "tune=0", ...color, "-movflags", "+faststart", "-an", join(tmp, "av1.mp4")),
  "vp9.webm": () => {
    const common = [...input, ...vf, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "44", "-row-mt", "1", "-tile-columns", "1", "-g", "240", "-deadline", "good", ...color, "-an"];
    ff(...common, "-pass", "1", "-cpu-used", "4", "-passlogfile", join(tmp, "vp9"), "-f", "webm", "/dev/null");
    ff(...common, "-pass", "2", "-cpu-used", "1", "-passlogfile", join(tmp, "vp9"), join(tmp, "vp9.webm"));
  },
  "h264.mp4": () => ff(...input, ...vf, "-c:v", "libx264", "-preset", "veryslow", "-tune", "animation", "-crf", "29", "-profile:v", "high", "-level", "4.0", "-g", "240", "-bf", "3", ...color, "-movflags", "+faststart", "-an", join(tmp, "h264.mp4")),
  "poster.webp": () => ff("-i", join(frames, "f0000.png"), "-vf", `scale=${W}:${H}`, "-c:v", "libwebp", "-quality", "86", "-compression_level", "6", join(tmp, "poster.webp")),
  "poster.avif": () => ff("-i", join(frames, "f0000.png"), "-vf", `scale=${W}:${H},format=yuv444p`, "-c:v", "libaom-av1", "-still-picture", "1", "-crf", "26", "-cpu-used", "4", join(tmp, "poster.avif")),
};
for (const [k, run] of Object.entries(enc)) {
  const t = Date.now();
  run();
  console.log(`${k}: ${statSync(join(tmp, k)).size} B (${Math.round((Date.now() - t) / 1000)} s)`);
}
// One content hash for the set (the files are cached for a year: next.config.ts), from the frames' encodes.
const hash = createHash("sha256");
for (const k of Object.keys(enc)) hash.update(readFileSync(join(tmp, k)));
const h = hash.digest("hex").slice(0, 8);
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.startsWith("hero-phone.")) rmSync(join(outDir, f));
const files = {};
for (const k of Object.keys(enc)) {
  const name = `hero-phone.${h}.${k}`;
  const dest = k.startsWith("poster") ? join(frames, name) : join(outDir, name);
  renameSync(join(tmp, k), dest);
  files[k] = { src: k.startsWith("poster") ? dest : `/marketing/video/${name}`, bytes: statSync(dest).size };
}
const codecs = (f) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,profile,level", "-of", "json", join(outDir, f)]).toString();
console.log(codecs(`hero-phone.${h}.av1.mp4`), codecs(`hero-phone.${h}.h264.mp4`));
const manifest = `/**
 * The hero video (generated by scripts/hero-video/render.mjs, do not edit by hand): the phone's screen, ${W} x ${H}, ${meta.T} s at ${FPS} fps,
 * looping. Sources in the order a browser should try them (AV1, VP9, H.264), each with its size in bytes. No poster: the page draws
 * frame 0 in HTML under the video (HeroLive.tsx).
 * CUES: when each pass starts rising into view (seconds), so the glow behind the phone follows the video.
 */
export const HERO_VIDEO = {
  width: ${W},
  height: ${H},
  seconds: ${meta.T},
  sources: [
    { src: "${files["av1.mp4"].src}", type: 'video/mp4; codecs="av01.0.08M.08"', bytes: ${files["av1.mp4"].bytes} },
    { src: "${files["vp9.webm"].src}", type: 'video/webm; codecs="vp9"', bytes: ${files["vp9.webm"].bytes} },
    { src: "${files["h264.mp4"].src}", type: 'video/mp4; codecs="avc1.640028"', bytes: ${files["h264.mp4"].bytes} },
  ],
  cues: ${JSON.stringify(meta.cues).replaceAll(",", ", ")} as ReadonlyArray<readonly [number, "bakery" | "cafe" | "repair"]>,
} as const;
`;
writeFileSync(join(web, "src", "components", "marketing", "landing", "hero-video.ts"), manifest);
if (!existsSync(join(frames, "keep"))) console.log(`frames kept in ${frames} (delete when done)`);
console.log(JSON.stringify(files, null, 2));
