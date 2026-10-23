# DAENEM StaffPortal — Unified Owner Studio Acceptance Board

**Date:** 22 October 2026
**Development branch:** `feature/staffportal-owner-studio-pro-20261021`
**Release-review PR:** [#99](https://github.com/adedapo2005/daenem-staffportal/pull/99) — **DRAFT / NOT APPROVED FOR DEPLOYMENT**
**Authoritative Pre-Production:** https://daenem-staffportal-api-staging.adedapo2005.workers.dev/

## Locked release position

The **current approved V180 Sign-In page** remains the baseline. The existing protected React authentication system, Social/WhatsApp authentication, Cloudflare routes, and production release controls must not be replaced or bypassed by a conceptual canvas. Saving or requesting review of an alternative design **never publishes** it. Pre-Production and Production are unchanged by this work.

## Verified development gates

| Gate | Evidence / status |
| --- | --- |
| Approved Sign-In source unchanged | `scripts/check-approved-experience-lock.mjs` — PASS |
| Unified Owner Studio and live protected Sign-In preview | Isolated Playwright suite — PASS; PR #99 draft |
| Element picking, movement, per-viewport changes, Undo/Redo, color, typography and clock presets | Isolated Playwright suite — PASS |
| Nested weather/clock item edits and drag, alternative blank canvas | Isolated Playwright suite — PASS |
| Blank-canvas design import/export and session recovery | Isolated Playwright suite — PASS |
| No glass UI controls or legacy glass config | `qa/owner-studio/test-no-glass.cjs` — PASS; PR #125 merged |
| 32-inch 4K editor viewport and approved-preview display | 3840×2160 visual and dimension checks — PASS; PR #115 merged |
| Owner-only persistent D1 draft library; optimistic revision checks | `qa/owner-studio/test-design-library.cjs` — PASS |
| Atomic D1 save + audit transaction, rollback and no false audits | `qa/owner-studio/test-design-library-sql.cjs` — PASS; PR #128 merged |
| Owner-only release preflight, audited pending review and withdrawal | `qa/owner-studio/test-design-readiness.cjs` — PASS; PR #124 merged |
| Authentication-change clearing of private Studio state | `qa/owner-studio/test-owner-studio.cjs` — PASS; PR #127 merged |
| GitHub non-production verification for merged changes | PASS on source PRs (review PR #99 remains draft) |

## Actual Cloudflare Pre-Production read-only responsive audit

Run on the authorized DAENEM test computer with Playwright installed:

```sh
node qa/owner-studio/live-preproduction-responsive-audit.cjs
```

The script only permits GET/HEAD network requests, uses a headless browser, and exits nonzero on a layout violation. It makes **no production or staging edits**. The URL may be changed via `DAENEM_STAFFPORTAL_PREPRODUCTION_URL`.

| Tested viewport | Horizontal overflow | Global clock-card overlap | Vertical scrolling acceptance |
| --- | --- | --- | --- |
| 390×844 mobile | None | None | Long scrolling; permitted for mobile |
| 768×1024 tablet | None | None | Long scrolling; permitted for tablet |
| **1024×768 compact desktop** | None | None | **FAIL / NEEDS REVIEW:** content height about 2539px on a 768px viewport |
| 1280×720 desktop | None | None | PASS — no desktop scrolling |
| 1366×768 laptop | None | None | PASS — no desktop scrolling |
| 1920×1080 desktop | None | None | PASS — no desktop scrolling |
| 2560×1440 wide desktop | None | None | PASS — no desktop scrolling |
| 3840×2160 32-inch master | None | None | PASS — no desktop scrolling |

There were **zero JavaScript page errors** in this read-only run. This audit measures geometry, not complete visual and functional acceptance.

## Mandatory remaining release gates

- [ ] **Resolve or formally classify the 1024×768 overflow** without altering the approved 32-inch master composition or disguising clipping.
- [ ] **Authenticated Owner acceptance on actual Cloudflare Pre-Production:** verify Owner role, read/write restrictions, D1 persistence across fresh devices, and audit records end-to-end. Isolated mocked tests do **not** replace this.
- [ ] **Build a real supported renderer for alternative Sign-In designs** using the existing protected React authentication panel. The current new-design canvas is a concept, **not** a functioning replacement.
- [ ] **Run authentic provider/integration tests** for Sign-In, Create Account, password recovery, social authentication, WhatsApp, Install App, weather and Global Operations. Do not claim them tested merely because the visual mock passes.
- [ ] **Complete accessible and responsive visual acceptance:** keyboard focus, screen readers, reduced motion, mobile touch, tablet, 1366px laptop, 1920px desktop, 3840px 4K, and 1024px compact behavior.
- [ ] **Add an Owner-approved activation + immediate rollback mechanism** that preserves approved V180 as the always-working fallback, with an auditable release decision and failed-activation reversal.
- [ ] **Reverify protected staging deployment gates** and secure explicit Owner visual approval before merging PR #99 into the Pre-Production release branch.

**Current conclusion:** The Owner Studio editing and review work is substantially implemented and CI-tested, but **an alternative blank-canvas Sign-In must not be promoted or marked complete** until those acceptance gates are verified. Keep all other frontend/backend lanes within their authorized file ownership.

## Owner-mandated visual QA standard — 22 October 2026

**Do not mark any Studio task COMPLETE from a green CI check, implemented code, or a mock alone.** Inspect the actual rendered candidate, record discovered defects, fix them, rerun visual and behavioral tests, and separately validate the authenticated Cloudflare release candidate. This is a standing internal QA requirement; routine visual decisions must not be redirected back to the Owner. Production activation remains subject to its explicit release authorization.

### Reproducible isolated browser inspection

```sh
node qa/owner-studio/test-owner-studio.cjs
node qa/owner-studio/visual-acceptance-audit.cjs
```

The second command records screenshot evidence at 390, 430, 768, 1024, 1280, 1366, 1920, 2560 and 3840px in the local uncommitted `qa/owner-studio/visual-acceptance/` folder. It includes an explicit full-size preview, checks for runtime design-width mismatch and horizontal clipping, and reports desktop auth panels extending below their canvas. This is **not** a substitute for authenticated Pre-Production acceptance.

| Visual finding | Parent/root cause | Local candidate remedy | Release status |
| --- | --- | --- | --- |
| Mobile alternative Sign-In cropped and partly unstyled | Concept runtime fixed at 1366px; missing isolated authentication presentation | Responsive canvas dimensions, viewport-fit/full-size modes, scoped solid auth controls | Development QA only |
| 4K preview rendered as 1366px miniature | Fixed runtime width and small Owner controls | Actual 3840px canvas; scalable layout, typography, controls | Development QA only |
| Auth input placeholder truncated | Global `.owner-builder input` max-width leaked into nested actual auth input | Selector scoped to editor toolbar and inspector | Development QA only |
| Create Account tabs/buttons lacked consistent presentation | The alternative React auth state did not inherit approved V180 card CSS | Explicit non-glass, emerald/champagne scoped design for signup/recovery | Development QA only |
| Blank starter produced huge empty desktop space and overflowed vertically | Mobile-stack coordinates reused unconditionally on desktop | Untouched starter alone uses split responsive presentation; manually edited layouts retain Owner coordinates | Development QA only |
| Private preview accidentally allowed authentication actions | Actual React auth forms/providers mounted interactively | Capture unsafe submits, provider actions and redirects; permit only safe local mode changes | Development QA only |
| Native 4K control readability, keyboard contrast | Static 11px controls and low-contrast secondary copy | Scale Owner tools at 2400px+ and raise copy/focus contrast | Development QA only |

**Unchanged release blockers:** Actual Pre-Production 1024px Sign-In vertical overflow, authenticated Owner Library/D1 and session acceptance, production-like provider/weather/Install App integration acceptance, exact approved branding and fully editable per-viewport alternatives, audited activation with tested instant rollback, plus final verified release-candidate visuals and accessibility. None may be marked complete on the basis of this isolated preview.
