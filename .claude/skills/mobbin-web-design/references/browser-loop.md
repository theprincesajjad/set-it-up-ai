# Browser verification loop

## Per page / route

1. Boot the real dev server (not only Storybook if the page is routed).
2. Capture **desktop (~1280–1440)** and **mobile (~390)**.
3. Check against Mobbin shortlist images side by side:
   - Hierarchy match?
   - CTA gravity match?
   - Type drama match?
   - Spacing rhythm match?
4. Keyboard: tab order, focus rings, Escape closes overlays.
5. `prefers-reduced-motion` emulation — no broken layout.
6. Long content, empty, loading, error states.
7. Light/dark if the product supports both.

## Per multi-step flow

Screen-record:

- Happy path end-to-end
- Back/forward browser buttons at each step
- Validation failure path
- One-way door after success (cannot casually re-enter unpaid state)

Watch once for feel, once scrubbing for one-frame flashes and layout jumps.

## Definition of “cannot find a flaw”

- No unintended horizontal scroll at common breakpoints
- No competing accents
- No lorem
- No unlabeled icon buttons
- Primary action always clear within 1 second of landing
- Matches the *skeleton* of the shortlist without cloning brand assets
