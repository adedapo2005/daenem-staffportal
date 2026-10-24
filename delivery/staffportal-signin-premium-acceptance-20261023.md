# StaffPortal Pre-Production Sign-In: 4K Premium Acceptance (2026-10-23)

## Source and isolation
- Branch: `fix/staffportal-premium-auth-20261023`
- Draft PR: https://github.com/adedapo2005/daenem-staffportal/pull/173
- Base: `preproduction/staffportal`, includes merged Microsoft/Google OAuth stabilization from PR #169
- Owner-managed manual Stage One UI work only; no autonomous lane changes
- No production deployment, staging database mutation, credential reset, Worker route change, or Git branch reset

## Implementation
- Authentication shell focused fields use one visible outer ring, with no nested input chrome.
- Email and Password placeholders use concise wording that fits narrow rails.
- Create Account input foreground and password masking/focus clarity are corrected.
- Large-desktop (minimum 2100px wide and 1300px tall) authentication content is vertically balanced inside the existing card. No outer layout, hero, weather, clock, left widget or rail geometry changed.
- Four-kilopixel screenshot measurements: Email and Password 11.2px -> 20px, social button text 9.92px -> 17px, labels 10.88px -> 17px.

## Rendered non-destructive browser acceptance
- Real Chrome via isolated Vite QA with mocked API, no real credentials.
- 7/7 screened layouts: 3840x2160, 1920x1080, 1366x768, 1280x720, 1024x768, 820x1180, 390x844.
- Sign-In: keyboard focus, single visible focus ring, no inner chrome, no horizontal overflow or auth internal scroll, 3 providers present, show/hide Password, Remember Me.
- Forgot Password: navigable in-flow and back to Sign-In.
- Create Account: typed First Name contrast and placeholder; at 3840, 1920 and 390 validated identity -> contact -> username -> password strength + confirmation -> work step; no real signup submitted.
- Desktop viewport widths of 1280px, 1366px, 1920px and 3840px tested with no page scroll. 1024px and smaller may use tablet/mobile vertical scrolling as designed.
- Evidence saved locally under `qa-artifacts/premium-signin-acceptance-20261023/` including per-viewport screenshots and report.json.

## Release gates
- Code checks: TypeScript, 30/30 Sign-In release contracts, approved V180 experience lock, zero-disclosure, weather, staging integration and post-login integration checks (see command output).
- Pending until separately verified: actual Owner username/password login in real Pre-Production; post-merge live browser screenshot/interaction and social redirect checks.
- Read-only audit found an active Owner account and no lock; repeated stored-owner credential matches still fail password verification. Older Owner credential predates the new staging test accounts. This is consistent with (but does not prove) a secret/credential-environment discontinuity. Do NOT rotate AUTH_PEPPER, overwrite hashes, disable authentication, or retry passwords to test.
- Safe Owner route: use the already implemented verified-email Forgot Password recovery and confirm authenticated access; no recovery action has been executed by this QA run.
- Keep PR draft and Pre-Production existing deployment unchanged until required gates pass.

## October 23 continuation — visual/browser acceptance hardening

- Reproduced LIVE Pre-Production at 3840x2160, 1920x1080, 1366x768 and 390x844 in real Chrome on the authorized Daenem_Group machine. Saved separate published-site evidence in `qa-artifacts/live-staging-browser-20261023`; that browser inspection is baseline only, not an assertion that draft changes are deployed.
- Candidate 1366 and 1280 text was falsely passing earlier geometry-only gates at 9.28px input / 7.84px field label. Added size assertions. Candidate now measures 12.5px / 12px at these compact widths, with 14px / 13px at standard 1920 desktop and 20px / 17px at 4K.
- Real Chrome exposed 1366 and 1280 credential-card overflow after increasing text. Corrected multi-line tabs, shortened user-facing instructions and provider text, and relocated incorrect-credentials recovery into the existing accessible support line. Password is cleared on failed login; the existing Forgot Password control remains visible and actionable. No account enumeration or backend change.
- Real Chrome also exposed clipped Microsoft / WhatsApp names in compact provider buttons. Root cause: a two-column CSS grid overrode prior flex-direction attempts. Fixed by a centered single-column icon+label grid. Added full-label bounding-box assertions.
- Confirmed 1280x720 and 1366x768 normal and incorrect-password card states fit exactly with no internal scrolling, and no desktop page overflow.
- Added mobile quick-access Sign In / Create Account dock shown ONLY after authentication leaves view; focused and visually checked at 390x844. Clicking returns to the same protected authentication mount, and dock hides again when form is in view. There is no second auth route.
- Final local candidate full Chrome suite: 7/7 viewports passed including responsive min typography, no clipping, focus ring, simulated 401 recovery, password visibility, multi-step Create Account and shared weather/operations footprint. Logged screenshots in the QA evidence folder.
- **Still not verified:** a real Owner password login, successful recovery with actual verified email, and live PR-candidate UI after guarded Cloudflare Pre-Production integration. Keep draft PR until those are closed.

## Final source-only acceptance handoff — October 23, 2026

- The current candidate passed the final real-Chrome 7-viewport suite **7/7, zero warnings** after increasing tablet/mobile social-provider text to **13px** and adding explicit font-size gates.
- Tested viewport dimensions: **3840×2160, 1920×1080, 1366×768, 1280×720, 1024×768, 820×1180, 390×844**. 1280px and larger kept no desktop vertical scrolling, and auth mount stayed within footprint; tablet/mobile page scrolling permitted.
- Measured input/field-label/social-provider text in Chrome: 3840: **20/17/17px**; 1920: **14/13/12px**; 1366 & 1280: **12.5/12/10.5px**; 1024,820,390: **13.5/12.5/13px**.
- Screenshot `qa-artifacts/premium-signin-acceptance-20261023/signin-1366x768.jpg` visually confirms all three Microsoft, Google and WhatsApp labels fit after real CSS grid root-cause correction. Automated layout assertions verify each provider label is inside its button.
- Screenshot `qa-artifacts/premium-signin-acceptance-20261023/inline-login-error-1366x768.jpg` confirms a generic, accessible sign-in failure message and existing Forgot Password action without a modal or overflowing card. This was a **local mocked 401**, not a real credential trial.
- Screenshot `qa-artifacts/premium-signin-acceptance-20261023/mobile-sticky-dock-390x844.jpg` visually confirms the fixed mobile shortcut appears only after leaving the authentication panel; both Sign In and Create Account interactions were tested and return to the existing panel.
- Browser test reports contain no known JS page errors or horizontal overflow; normal, failed-login, recovery, Create Account, focus, and reduced-motion states were exercised without live database writes.
- This is **candidate acceptance only**: no verified Owner local password login and no published candidate/browser confirmation on Cloudflare. Keep PR **draft** and unchanged Pre-Production runtime until those gates close. Production not touched.
