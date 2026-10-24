# StaffPortal Stage One — Ibadan Weather Clock Precision Closure

**Scope:** Public Sign-In only. No V180 approved HTML or source snapshots edited, no post-login source modifications, no D1/migrations, no production deployment, no change to form logic, weather provider, widgets, clocks for the other six Global Operations locations or Owner Studio.

**Root-cause matrix**

| Element | Parent | Observed cause | Surgical solution |
|---|---|---|---|
| Digital time/weekday/date/timezone | `.gw-city-instrument` inside `#staff-local-weather` | Historical `.gw-city-digital {display: contents}` flattened the four labels into independent grid rows. At 3840px those rows expanded, leaving about 66–68px between text glyph boxes; weekday, date and timezone appeared disconnected from the analog dial. | Make the existing `.gw-city-digital` one flex-column grid child centered adjacent to the clock, retaining V180 DOM and exact text and functionality. |
| Analog dial vs. date/time | Same parent | Old short-desktop row allocation placed analog dial center 11.3px below the center of the digital time/date group at 1366px. | Center the two columns within the original instrument with responsive gaps. |
| Timezone label | Same parent | A compact media rule rendered the timezone at approximately 10px. | Improve compact 721–1439px timezone to 12px without changing provider or timezone. |

**Before and after measurements from genuine deployed baseline vs. local candidate**

- 3840×2160 baseline text gaps were approximately 66px; revised candidate groups time, weekday, full date and timezone within one visual column. Maximum vertical dial-to-label-group center offset in seven screens: **0.8px**.
- 1366×768 baseline analog center deviation: **11.3px**; revised candidate **0.8px**.
- All seven tested sizes: **3840×2160, 1920×1080, 1366×768, 1280×720, 1024×768, 820×1180, 390×844**.
- Browser test asserts that clock hands match the digital time, labels do not overlap or exit the card, document has no horizontal overflow and no JS errors. No fake live API data is used for final deployment acceptance; local browser tests use mock weather only to protect the visual state.

**No-regression release gates**

1. 45 existing widget/weather behavior checks and all 7 full Sign-In/Create Account/Forgot Password Chrome viewports.
2. Owner Studio, exact V180 and V115 preserved design, zero disclosure, release blocker contracts, TypeScript and production-like Vite build.
3. Read-only synthetic Owner/Manager/Employee post-login shell smoke (no credentials/real login asserted).
4. GitHub PR CI success on exact branch SHA. Protected Pre-Production merge/deploy only, not Production.
5. **After deployment:** genuine Cloudflare health + fixed-city weather endpoints, content source truth, real browser visual of 4K/1366/mobile and independent TinyFish default viewport. Do not claim success without verification.

**Completed focused evidence (same candidate source):**
- Clock geometry, time-hand synchronization, timezone/date containment, no horizontal overflow and zero browser errors: **7/7 night/real-clock viewport mocks PASS**, plus **3/3 simulated daytime viewports PASS**. Contrast refinement uses text shadow on the labels only, no overlays.
- Existing Sign-In widgets, weather artwork, clock animation, ticker, rotation and reduced-motion: **45 checks PASS**.
- Full Sign-In/Create Account five-stage/Forgot Password/WhatsApp/Microsoft/Google responsive Chrome mock acceptance: **7/7 PASS, zero warnings**.
- Read-only synthetic Owner/Manager/Employee post-login role viewport smoke: **8/8 PASS, zero observed JS errors**.
- Genuine live StaffPortal Owner authentication remains an independent acceptance requirement; these synthetic checks do **not** establish it.
