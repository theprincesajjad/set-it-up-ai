# Web motion — purposeful, reference-driven

## Pick motions from Mobbin cues

| Cue in still | Allowed motion |
|---|---|
| Play button on product visual | Fade/scale play control; optional subtle UI parallax — not autoplay sound |
| Logo/proof row | Static or gentle marquee only if refs show continuous motion |
| Carousel arrows / dots | Transform-based slide, snap points, keyboardable |
| Sticky CTA / nav | Pin without bounce; shadow appears on scroll past threshold |
| Modal / sheet checkout step | 200–280ms ease-out enter; faster exit; focus trap |
| Dashboard charts | Draw-once on first view; no perpetual shimmer after load |
| Button press | 100–150ms opacity or 0.98 scale; list rows highlight, don’t scale |

## Orchestration recipe (marketing hero)

```
0ms     brand stable
40ms    headline fade-up 8–12px, 220ms ease-out
120ms   support line fade-up
180ms   CTA group fade-up
220ms   visual / atmosphere fade or soft scale 0.98→1
```

Cap total choreography under ~500ms. If reduced motion: show final state.

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Prefer feature-detecting and swapping to opacity-only variants rather than
only the nuclear stylesheet hammer — but always respect the preference.

## Performance bar

- No layout thrash on scroll listeners (use CSS `animation-timeline` or
  IntersectionObserver with rAF batching)
- 60fps on mid-tier laptop for hero + nav
- Do not animate large `box-shadow` or `filter` on scroll
- Prefer `will-change` only for the duration of an active animation
