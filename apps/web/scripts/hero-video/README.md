# Hero video

The phone on the home page hero plays a short produced video (wave Y): Little Oven gets a stamp, the wallet brings up Pinecone Coffee
(a stamp), then Fix-It Phone Lab (points, 90 to 105 of 150), then Pinecone again, whose tenth stamp makes the free drink ready, and
Little Oven rises back into place for the loop. About 12 s, 60 fps, rendered frame by frame (not a screen recording).

## Re-render

From the repo root (needs ffmpeg with libx264, libvpx-vp9, libsvtav1 and libaom-av1, and Playwright's Chromium):

```sh
node apps/web/scripts/hero-video/render.mjs
```

It writes `apps/web/public/marketing/video/hero-phone.<hash>.*` (AV1 and H.264 MP4, VP9 WebM) and the
manifest `apps/web/src/components/marketing/landing/hero-video.ts` that the page reads (file names, size, cue points). The PNG frames go
to a temp folder (`--frames <dir>` to choose one), with AVIF and WebP posters of frame 0; never commit them. The page needs no
poster: it draws frame 0 in HTML under the video. `--only-frames` and `--only-encode` split the two steps.

## Files

- `scene.html`: the phone's screen at 288 x 646 CSS px (576 x 1292 in the video), built from the page's own `product.css` and
  `landing.css`, the shipped fonts and the same sample shop data as `Product.tsx`. Open it with `?t=4.2` to see one moment.
- `scene.js`: the single timeline. `HERO.render(t)` sets everything for time `t` (springs and ease-out curves computed from `t`, no CSS
  transitions or timers), so any frame can be drawn in any order. `HERO.CUES` are the moments each pass starts rising; the page's trade
  pill follows them.
- `scrub.html`: a slider over the timeline, for reviewing the motion by hand.
- `render.mjs`: frames, encodes, poster, manifest.

The first frame is the page's server-rendered phone (`HeroLive.tsx`: the bakery pass at 4/8, the same three cards stacked below), so
the hand-over from HTML to video shows no jump. If you change the pass styles or the copy, re-render.

## Fonts (wave Y)

Strata (headlines, 800 to 900) and Halden (text, 400 to 700) are from fontzz (SIL OFL 1.1, `public/marketing/fonts/fontzz-OFL.txt`),
cut down with fontTools from `site/public/fonts/{strata,halden}.woff2`:

```sh
U="U+0020-007E,U+00A0,U+00A9,U+00B7,U+00C0-00CF,U+00D1-00D7,U+00D9-00DC,U+00E0-00EF,U+00F1-00F6,U+00F9-00FC,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+202F,U+20AC,U+2192"
fonttools varLib.instancer strata.woff2 wght=800:900 -o strata.ttf
fonttools varLib.instancer halden.woff2 wght=400:700 -o halden.ttf
fonttools subset strata.ttf --unicodes="$U" --layout-features="kern,liga,ccmp,mark,mkmk" --flavor=woff2 --no-hinting --output-file=strata.woff2
fonttools subset halden.ttf --unicodes="$U" --layout-features="kern,liga,ccmp,mark,mkmk" --flavor=woff2 --no-hinting --output-file=halden.woff2
```

Strata ships as `public/marketing/fonts/strata-800-900.<first 8 of sha256>.woff2` (serif.css, serif.ts); Halden as
`src/lib/marketing/fonts/halden.woff2` (next/font, which hashes the name itself: fonts.ts).
