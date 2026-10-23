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
