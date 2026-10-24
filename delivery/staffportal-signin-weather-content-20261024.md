# DAENEM StaffPortal — Sign-In Weather, Content and Two Visual Refinements

Release scope: **public Sign-In only**. Protected V180 reference markup, Owner Studio settings, post-login V115 source, application authentication logic, production and D1 are unchanged.

## Customer-visible corrections
- Tokyo and Beijing: the fixed-city Weather endpoint previously short-circuited on a *successful HTTP 200* Google provider-unavailable JSON result. A bounded Open-Meteo forecast fallback now runs for all seven approved cities **only when Google weather is unavailable**, preserving Google Weather as first choice, live values, honest empty states and last-known-good caching. Incomplete Open-Meteo payloads are rejected rather than fabricating a forecast.
- Daily Spotlight and Employee Inspiration: existing approved public content service is connected. The default editorial texts were static; a deterministic Nigeria-local schedule now rotates seven staff-practice spotlights daily and eight inspiration messages every six hours. Content is explicitly **curated / scheduled**, never misrepresented as external AI. Any Owner Studio-authored/customized IDs or active provider take precedence untouched. Service availability, connection, cadence and expiration truth remain visible in the widget API and tooltip.
- Ibadan clock: at less than 2560px, show the full short weekday/date together, then the year, near the analog dial; preserve the approved full-date 4K version and accurate Africa/Lagos timezone.
- Create Account: center Continue and its right-arrow as one keyboard-accessible button group with an 8px gap, preserving validation and all five registration steps.

## Regression evidence in isolated Daenem_Group worktree
- Fixed-city fallback unit/contract: **6/6 PASS**.
- Public curated content adapter/security/rotation tests: **11/11 PASS**.
- Sign-In release contracts: **30/30 PASS**.
- Existing animated weather, four widgets, ticker, focus/pause and reduced-motion: **45 checks PASS**.
- Targeted real Chrome visual/geometry mock: **7/7 viewport PASS** (3840x2160; 1920x1080; 1366x768; 1280x720; 1024x768; 820x1180; 390x844). Continue arrow follows label by 8px, group center offset exactly 0; real Tokyo and Beijing mock weather render; Ibadan date and source state verified. Local mock data only, not evidence of live API success.
- Complete actual authentication Chrome mock: **7/7 PASS, zero warnings**. Sign In, Create Account 5 stages, Forgot Password, social button labels, field focus, error/no-scroll states, reduced motion, mobile dock.
- Synthetic, read-only post-login role viewport smoke: **8/8 PASS, zero observed errors**. Owner, Manager, Employee views with role disclosure guard; no post-login edits.
- Protected V180/V115 lock, Owner Studio, zero disclosure, 13/13 staging integration, TypeScript, Vite Worker/client build: **PASS**, existing chunk size advisory only.

## No-regression boundaries and release gates
- Do not alter source-snapshots/ or approved V180 HTML/CSS; do not touch post-login code, D1 migrations or credentials.
- GitHub CI must pass on exact branch head. Merge into protected `preproduction/staffportal` through GitHub only; automatic SHA-gated deployment must verify health, OAuth redirects and assets.
- **Post-deployment acceptance is mandatory:** verify two public fixed-city endpoints return a genuine available forecast, /api/staff-content rotates with connected curated status, Chrome responsive layout and live TinyFish checks for weather/card/clock/Continue button. Roll back if material regression.
- Owner authentication success remains independently unverified and must not be asserted as passed from synthetic tests.
