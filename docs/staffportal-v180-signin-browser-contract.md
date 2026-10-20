# V180 StaffPortal Sign-In / Create Account responsive regression

Only StaffPortal public Sign-In and Create Account. No FarmPortal, WebAdmin,
post-login redesign, protected branch migration or production deployment.

## Browser test

`node scripts/test-signin-browser.cjs` uses a real Chromium browser with the
actual React AuthScreen. The test opens at
`/qa/signin/index.html` via an isolated Vite QA config, mocks only API responses
and never creates a real employee or calls the Cloudflare Worker.

Seven viewports:
`390x844`, `820x1180`, `1025x600`, `1280x720`,
`1366x768`, `1920x1080`, `3840x2160`.

Assertions:
- Sign-In is horizontally inside the viewport and never overlaps the approved
  hero, four information widgets, six clocks or Ibadan weather.
- No internal Sign-In scroll; no missing or clipped input/button positions.
- On normal desktop (1280px+), the approved page has no vertical scrolling.
- On compact 1025x600, controlled **document-level** scrolling is permitted;
  shrinking every label below accessible typography to force 600px total height
  is prohibited.
- Create Account dialog traps keyboard focus and responds to Escape and Close.
- Complete identity/contact/username/password/work/verification simulated
  registration at representative small, compact and standard resolutions.
- No horizontal overflow, browser JavaScript exceptions or public API writes.

## Review and deployment

This is test-only validation, not an authorization to merge protected source
or deploy. Release reviewer must accept the exact PR head and Owner must post
the required exact-SHA Issue #5 approval before protected Cloudflare staging
controller deploys. Preserve approved V180 images and 32-inch 4K master.
