# StaffPortal Stage 1 - Requested versus completed ledger

**Updated:** 20 October 2026
**Scope:** Authenticated StaffPortal post-login experience only
**Current live Pre-Production source:** `be9b7d54867dc5100ebc9f5531f01743228b58d9`
**Isolated integration branch:** `feature/staffportal-stage1-ocean-integration-20261020`

## Status rules

- **Implemented in candidate** - present in the isolated integration source, but not necessarily live.
- **Verified locally** - focused automated or browser evidence exists for the exact candidate.
- **Live verified** - exercised against the exact Cloudflare Pre-Production deployment.
- **Partial** - a bounded useful implementation exists, but the complete requested experience is not delivered.
- **Not implemented** - remains design/reference work and must not be represented as complete.
- **Preserved** - existing function remains connected; this is not evidence that it was redesigned.

A successful build, a generated preview, or the presence of a component never changes an item to **Live verified**.

## Release truth

| Item | Status | Evidence / remaining work |
|---|---|---|
| Latest deployed Sign-In, Create Account, WhatsApp, weather and service-worker source retained | **Live verified, bounded** | Live `be9b7d5...` contains the newer Microsoft Organizations/account-linking lane, Sign-In refinements, fixed-city weather fallback, 4K global assets and Stage 1 additively. Public shell/network verification passed; full provider login acceptance remains required. |
| Complete Stage 1 source combined with latest auth | **Live verified, bounded** | Exact integrated SHA `be9b7d5...` is deployed. Synthetic Owner/Manager/Employee role-route and Appearance matrices pass against Cloudflare staging. Real authenticated Worker/D1 acceptance remains a separate gate. |
| Current Cloudflare Pre-Production includes complete Stage 1 | **Yes - exact integrated SHA deployed** | Deployment run `39503611681` checked out and built `be9b7d5...`; Cloudflare version `58ab70d2-9487-4cbe-828d-d8203304fc86`; runtime and 57/57 asset integrity checks passed. |
| Production changed | **No** | Production authorization remains closed. |

## Approved appearance and palette governance

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| Option 2 + Option B as default | Implemented in candidate | `Ocean Sapphire - Azure Prestige` is the single fail-closed default: Sapphire navigation, Ocean/Royal Azure action, Cloud/Ice surfaces, Graphite ink, controlled Cyan/Gold/Violet. |
| Wide variety of distinctive alternatives | Implemented in candidate | 19 coordinated palettes: 7 earlier approved directions plus 12 new editorial/architectural combinations. |
| Optional selection on authenticated Admin/Appearance page | **Live verified with synthetic auth** | `/theme` full-page gallery, preview, personal apply/reset and authorized Group controls passed the live Appearance matrix. Real authenticated persistence/API acceptance remains open. |
| Preview before applying | Implemented in candidate | Preview is session-only until explicit Apply/Group action. Cancel Preview restores the effective policy palette. |
| Active/default/preview distinction | Implemented in candidate | UI labels approved default and current effective palette separately; palette cards distinguish default, active and preview. |
| Restore approved default | Implemented in candidate | Authorized Group control restores Ocean Sapphire - Azure Prestige and clears forced selection. |
| Owner/Admin shared policy control | Implemented in candidate | Reuses `settings.access:manage` + Owner/Group Admin authority. Policy writes use existing `app_settings` and `audit_logs`; no duplicate service. |
| Personal choice governed by Group policy | Implemented in candidate | Forced Group palette takes precedence; personal selection can be disabled; per-user key is isolated by employee ID. |
| Sign-In palette unchanged | Implemented in candidate | Post-login routes/keys/components are separate from existing Sign-In theme/config keys. Full visual regression remains required. |
| Professional mixture without equal saturation | Partial | Semantic roles and restrained support colours are implemented. Page-by-page human visual acceptance is still required. |
| Opaque premium surfaces / no glass | Implemented in candidate | New Stage 1 palette and Appearance surfaces use opaque fills. Existing unrelated source glass/effect controls are preserved, not silently redefined. |
| Actual component contrast | Partial | Core text/action/navigation pairings are automatically checked. Manual actual-state contrast, high contrast, charts and disabled/hover states remain required. |

## Enterprise navigation and role experience

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| One continuous Enterprise Command Center | Implemented in candidate | Single hierarchy replaces nested global/context navigation inside the retained shell. |
| Complete canonical destination coverage | Implemented in candidate | Existing Stage 1 structural suite covers 141 canonical modules and 15 access profiles. Re-run on exact integrated head required. |
| Progressive disclosure and clear current route | **Implemented and browser verified** | Separate disclosure and destination controls remain distinct; current page and ancestors are clear. Targeted browser acceptance confirms route transitions open the new workspace and keep navigation stable without horizontal overflow. Touch-device breadth remains part of wider responsive QA. |
| Search deep modules with context path | Implemented in candidate | Authorized module finder is retained inside the command surface. |
| Favorites and recents | Implemented in candidate | Session-scoped stable IDs; no private record content persisted. Server/cross-device persistence was not requested or implemented. |
| Employee/Manager/Owner navigation ordering | Implemented in candidate | Presentation order uses actual current-company roles and does not grant access. |
| Role-specific workflow shortcuts | Implemented in candidate | Employee, Manager and Owner focus links are additive and permission-filtered. |
| Purpose-built role-specific home dashboards | **Implemented in Stage 1 candidate, bounded** | Home now presents distinct Employee, Manager and Owner command surfaces with role-specific purpose, copy and prioritized links drawn only from the permission-projected Enterprise Command Center. 6/6 desktop/mobile role scenarios and the 18/18 regression matrix pass. Deeper KPI/data composition remains governed by the retained role-aware V115 home. |
| Delegated/multi-role context switch | **Partial** | Company-role scoping is improved. Full explicit delegated-responsibility UX and acceptance remain open. |
| Last expanded section intelligent state | **Implemented and browser verified** | Route changes collapse the previous top-level workspace, open the new active workspace and preserve nested disclosure memory so returning restores the user's local context. The targeted rendered-browser test passes with zero page errors or horizontal overflow. |
| Desktop/tablet/mobile navigation adaptation | Partial | Existing sidebar, Sheet and mobile bottom navigation remain connected. Exact integrated responsive interaction acceptance remains open. |

## Ask DAENEM and enterprise search

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| Search authorized records beyond current page | Partial | Candidate adds server-backed sources, but it is not yet universal across every record family. |
| People lookup | Implemented in candidate | Company-scoped and requires HR permission. |
| Payroll runs | Implemented in candidate | Company-scoped, actual migrated columns, permission-checked. |
| Construction projects | Implemented in candidate | Company/permission scoped. |
| Employee's own leave/document requests | Implemented in candidate | Restricted to current employee and authorized company. |
| Employee's own form submissions | Implemented in candidate | Permission and company scoped. |
| Personal notifications | Implemented in candidate | Recipient/company/expiry constraints retained. |
| Fair permission-scoped ranking | Implemented in candidate | Candidate contains balanced ranking tests; exact integrated run pending. |
| Clear partial/unavailable source states | Implemented in candidate | A failed source is not presented as an empty dataset. |
| Record-specific deep links | Partial | Results open approved workspace destinations; complete record-specific deep linking remains open. |
| Search all existing record families | **Not implemented** | Invoice, supplier, customer, asset, inventory, recruitment and other sources require provider-by-provider authorization/freshness contracts. |
| Search performance on supported low-cost devices | Not verified | Algorithm tests do not certify full payload/device performance. |

## Purpose-built pages and reference features

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| Clear page purpose and dominant action | Partial | Existing page bodies are preserved and selected Stage 1 focus improvements exist; exhaustive page-by-page redesign is not complete. |
| Dashboard KPI hierarchy and actionable drill-down | Partial | Existing dashboards and targeted visual treatment remain; full role/page KPI audit and authoritative drill-down verification are open. |
| Charts (line/bar/stacked/donut where justified) | Partial | Existing chart functions are preserved and palette series roles are available. Page-by-page chart choice, interactions, tooltips and table alternatives remain open. |
| Finance workspace refinement | **Refined / partial** | Stage 1 now adds a bounded Finance command bar, responsive KPI metric grid, stronger analysis-versus-control hierarchy, mobile/tablet stacking, and clearer control/evidence treatment without changing Finance calculations or actions. Browser candidate checks pass at 1366, 1024 and 390 with no horizontal overflow/page errors; the full 18-scenario role/route regression plus Appearance 3/3 also passes. Real authenticated Finance data acceptance and deeper finance-family workflows remain open. |
| Construction workspace refinement | Partial | Compact command hero and density improvements are implemented; complete project page family review remains open. |
| Forms and validation system | **Refined / partial** | Stage 1 now adds a shared field/focus/error/success presentation, a more compact premium form shelf, clearer Open Form actions, responsive mobile task-card treatment, and reduced-motion/forced-colour support while retaining existing schemas, validation, submissions and permissions. Candidate browser checks pass 3/3 at 1366/1024/390 and the full role/route regression remains 18/18 plus Appearance 3/3 with zero overflow/page errors. Real authenticated form workflows, attachment/location-dependent flows and exhaustive validation-state acceptance remain open. |
| Worklists/data tables | **Refined / partial** | Existing saved views, density, grouping, column order, selection and export controls are preserved and Stage 1 now gives them a premium responsive worklist shell with a pinned record identity column, sticky table headings/totals, stronger search/filter hierarchy and dedicated mobile record cards. Candidate Finance-register checks pass at 1366/1024/390, including pinned desktop identity and mobile-card fallback, with zero overflow/page errors; full role/route regression remains 18/18 plus Appearance 3/3. Exhaustive register-by-register authenticated acceptance remains open. |
| Record review / approval workspace | **Refined / partial** | The retained dedicated record architecture now has a stronger premium identity header, explicit key facts, prioritized action/pager region, horizontally resilient ARIA tabs, clearer overview-versus-accountability hierarchy, and mobile reflow. Existing record permissions, workflow stages, evidence, approval reasons and audit/history remain authoritative. Targeted record checks pass at 1366/1024/390 including keyboard tab navigation, with zero overflow/page errors; full role/route regression remains 18/18 plus Appearance 3/3. Exhaustive module-by-module real authenticated record acceptance remains open. |
| Calendar/board patterns | Partial | Existing calendar and board functions remain. Device-specific agenda/keyboard/drag alternatives need acceptance. |
| Communications/inbox/thread relationship | **Refined / partial** | Stage 1 now strengthens the Staff Messaging master-detail hierarchy, selected/unread treatment, conversation controls, message bubbles, composer/error state, tablet split and mobile list-to-thread handoff while preserving V115 access and local-message behavior. Candidate browser checks pass at 1366, 1024 and 390 with zero horizontal overflow/page errors. Customer-channel provider delivery-state acceptance remains open. |
| Attachments/upload/preview/retry | **Refined / partial** | Stage 1 now provides clearer governed evidence rows, keyboard-focusable attachment review, a premium file selector, bounded image/PDF/text previews, drag-active dropzone treatment, and mobile evidence reflow while retaining V115 file-type/size validation, local-storage boundaries, permissions and immutability. Candidate evidence-preview checks pass 3/3 at 1366/1024/390 with zero overflow/page errors; the audit also found and fixed a mobile sticky-record-header interaction that could intercept the Documents tab. True network upload progress/failure/retry and exhaustive real authenticated cross-workflow attachment acceptance remain open. |
| Loading indicators and skeletons | Partial | Existing skeletons and Stage 1 state rules exist. Truthful long-running progress and every loading boundary remain open. |
| Empty/no-results/permission/offline/stale/conflict/error/success states | Partial | Existing boundaries are retained; shared visual grammar and recovery actions require a systematic page audit. |
| Alerts/badges/buttons/button groups | Partial | Palette roles and existing components are present; semantic consistency and action hierarchy need exhaustive visual review. |
| Tabs, dialogs, drawers, popovers and tooltips | Partial | Existing components remain connected. Focus return, stacking, touch alternatives and required-content rules need acceptance. |
| Security views: sign-in/device/session/access events | Preserved / partial | Existing authorized Security surfaces remain. No claim of new security backend behavior from visual work. |
| Login logs, device logs, session tracking, MFA, role permissions | Partial | Existing security/access systems vary by capability. Exact requested UI inventory versus backend truth still requires a separate security-page audit. |
| KPI widgets | Partial | Existing KPIs plus accessible amount adapter; full role relevance, definitions, freshness and drill-down verification remain open. |
| Loaders and spinners | Partial | Existing loading states remain; decorative loaders are rejected. Long jobs need truthful determinate/indeterminate behavior by workflow. |

## Accessibility, responsiveness and resilience

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| One authoritative Stage 1 contrast layer | Implemented in candidate | Conflicting `stage1-accessibility.css` was removed; semantic `stage1-a11y-contrast.css` is authoritative. |
| KPI accessible final values | Implemented in candidate | Adapter preserves visible animation and exposes stable final labels; focused tests pass. |
| Visible keyboard focus | Implemented in candidate | Palette-aware focus roles are applied. Real keyboard path acceptance remains open. |
| Reduced motion | Implemented in candidate | New palette/Appearance interactions respect reduced motion; full application motion inventory remains open. |
| Forced-colour support | Partial | Navigation/palette/Appearance fallbacks exist. Complete Windows high-contrast review is open. |
| Desktop 3840/1920/1366 | **Live verified with synthetic auth** | Home role matrix and selected operational routes pass at required desktop widths; broader page-family visual inspection remains open. |
| Tablet 1024 and narrow desktop | **Live verified with synthetic auth, bounded** | 1024 Home scenario passes without horizontal overflow; broader tablet interactions remain open. |
| Mobile 390 and other supported phones | **Live verified with synthetic auth, bounded** | 390 role/route, selected operational routes, Appearance and palette scenarios pass; on-screen keyboard and wider device inventory remain open. |
| Large text/zoom/long names | **Partial - 200% text + long-name stress verified locally** | Home and Appearance pass 200% root text at 1366 and 390 with zero horizontal overflow; long employee/company/job/department strings also pass the 8-scenario stress matrix. Browser-zoom-engine-specific and broader page-family acceptance remain open. |
| No horizontal overflow | **Live verified for recorded matrix** | 18/18 live synthetic role/route scenarios reported zero horizontal overflow. This is not exhaustive across every module. |
| Performance/bundle | Partial / build verified | Production build passes; existing >500 KB chunk advisory remains and measured browser/device performance is still required. |
| Offline/interrupted connectivity | Partial | Existing behavior preserved; palette policy fallback is fail-safe, but end-to-end recovery needs live tests. |
| Rollback to retained interface | Implemented in candidate | Release Details switch remains. Exact candidate browser rollback and style cleanup must pass before promotion. |

## Acceptance evidence required before "complete"

1. Exact integrated head passes preservation checks, focused tests, TypeScript, build and diff hygiene.
2. Browser visual audit of Home, Appearance, People, Finance, Construction, Payroll, Forms, Notifications and representative record/worklist pages.
3. Owner, Manager and Employee synthetic UI checks, followed by real authenticated Worker/D1 acceptance.
4. Keyboard focus, screen-reader spot checks, reduced motion, high contrast, zoom/large text and actual rendered contrast.
5. Desktop, tablet, mobile and 4K screenshots with no clipping, overlap or horizontal overflow.
6. Appearance policy persistence: refresh, new session, personal apply/reset, Group default, force/clear, denied write, audit and API failure.
7. Exact-SHA Cloudflare promotion and live fingerprint verification.
8. Production remains untouched until final release gates are explicitly satisfied.

## Exact integrated-candidate local verification - 20 October 2026

The final integrated Stage 1 source is live on Cloudflare Pre-Production at `be9b7d54867dc5100ebc9f5531f01743228b58d9`. It reconciles the Stage 1/Appearance work with the newer Microsoft Organizations/account-linking, Sign-In, 4K media and fixed-city weather lane. Deployment run `39503611681` verified the exact SHA, release contracts, production safety gates, runtime health and 57/57 asset integrity.

| Evidence | Result | Limit |
|---|---|---|
| Protected V115 export and bounded navigation overlay | PASS | 683 files, pinned manifest, 682 baseline checksums and verified overlay. |
| Current approved V180 Sign-In source lock | PASS | Latest Sign-In CSS hashes and Worker-auth source remain protected. |
| Enterprise Command Center structure | PASS | 20 cases, 141 canonical modules and 15 access profiles. |
| Stage 1 search, ranking and payroll schema suites | PASS | Focused source/SQLite evidence; not universal search coverage. |
| Palette catalogue and readable core pairings | PASS | 19 unique palettes; Ocean Sapphire - Azure Prestige is the only fail-closed default. |
| Personal and Group appearance policy | PASS | Preference, default, force/clear, allow-choice, denial, audit and Sign-In-key isolation tests. |
| Built browser role and route matrix | **18/18 PASS** | Owner, Manager and Employee presentation; 3840, 1920, 1366, 1024 and 390 widths; selected operational routes; synthetic authenticated context. |
| Appearance workflows | **3/3 PASS** | Owner desktop/mobile and Employee desktop; preview, cancel, personal persistence/reset, Group default, force/clear and approved-default restore. |
| Optional palette browser matrix | **2/2 PASS, 19 palettes per viewport** | Every palette previewed at 1366 and 390 with semantic roles, selected state, no overflow and no page errors. |
| Browser overflow and runtime exceptions | **0 horizontal overflows, 0 uncaught page errors** | Applies to the recorded synthetic candidate matrix. |
| Axe WCAG A/AA automated scan | **16/16 scenarios, 0 confirmed violation groups, 0 page errors** | Home, People, Finance, Construction, Payroll, Forms, Notifications and Appearance at 1366 and 390. Axe incomplete/manual cases remain; this is not blanket accessibility certification. |
| Production build | PASS | Server and client built; existing large-chunk advisory remains and still requires measured optimization. |
| Human visual review | PASS for recorded candidate screenshots | Ocean anchor, opaque surfaces, single-line mobile Notifications label and desktop/mobile Appearance were inspected. Broader authenticated live acceptance remains open. |

**Still not complete:** Stage 1 is now on Cloudflare Pre-Production, but the authenticated browser matrix uses synthetic session fixtures. Real Worker/D1 user journeys, cross-company isolation/revocation acceptance, actual Google/Microsoft/WhatsApp provider login completion, assistive-technology review, manual contrast/zoom/large-text review, measured performance and the broader page-family work in this ledger remain open. Production remains untouched.

## Final Pre-Production verification after integrated promotion

- Exact promoted SHA: `be9b7d54867dc5100ebc9f5531f01743228b58d9` via staging run `39503611681`.
- Cloudflare Worker version: `58ab70d2-9487-4cbe-828d-d8203304fc86`.
- Workflow gates: exact-SHA checkout, release contracts, communications contracts, production-safety gates, build, legacy-shell rejection, approved post-login runtime, health, runtime/auth contract and **57/57 asset integrity PASS**.
- Live synthetic Stage 1 role/route matrix: **18/18 PASS**; Appearance workflows: **3/3 PASS**; zero horizontal overflow; zero uncaught page errors.
- Live palette matrix: **19/19 palettes** at 1366 and 390; both scenarios PASS with zero page errors.
- Live Axe WCAG A/AA automated matrix: **16/16 scenarios**, zero confirmed violation groups and zero page errors. Automated incomplete/manual checks remain open.
- Public Sign-In network: no CSP request failures after final promotion. Expected anonymous 401 responses remain on protected session/temporary-password status endpoints.
- Public weather: Tokyo **200** and Beijing **200** through the bounded fixed-city Open-Meteo fallback; Ibadan **200** from Google Weather/cache. Arbitrary-coordinate weather remains authenticated.
- Deployed CSP allows only the approved Google Fonts stylesheet/font origins while retaining `script-src 'self'`, `object-src 'none'` and `frame-ancestors 'none'`.
- The previously cancelled deployment run `39502362517` had already reached Worker upload before cancellation; the final exact integrated promotion above supersedes it and includes both Stage 1 and the newer Microsoft Organizations lane.

These checks establish the current Pre-Production baseline; they do **not** close the remaining real-account/provider, page-family, assistive-technology, zoom/large-text, or measured-performance acceptance items listed above.

## Large-text resilience increment - 20 October 2026

A Stage 1 audit exposed horizontal overflow at 200% root text on Home and Appearance. The remediation is additive: retained QA Review V115 source remains byte-pinned while `stage1-large-text-reflow.css` and runtime large-text detection adapt the authenticated shell.

| Evidence | Result | Limit |
|---|---|---|
| Normal role/route regression matrix | **18/18 PASS on tested candidate** | Owner/Manager/Employee representative routes; 3840, 1920, 1366, 1024 and 390. Re-run on this rebased head before promotion. |
| Appearance workflows | **3/3 PASS on tested candidate** | Preview/apply/reset and authorized Group policy flows under synthetic authenticated context. Re-run on this rebased head before promotion. |
| Reduced motion | **PASS on tested candidate** | Desktop smoke; visible keyboard focus, no horizontal overflow. |
| Forced colours | **PASS on tested candidate** | Desktop smoke; visible keyboard focus, no horizontal overflow. |
| 200% root text - Home | **PASS on tested candidate** | Runtime detects 32px root text, switches to reflow mode, `scrollWidth == innerWidth`. |
| 200% root text - Appearance | **PASS on tested candidate** | Gallery, policy controls and preview collapse to bounded columns, `scrollWidth == innerWidth`. |
| Long-name stress at normal + 200% text | **8/8 PASS on current candidate** | Home and Appearance at 1366 and 390; intentionally long employee, company, job-title and department values; zero overflow/offenders/page errors. |
| TypeScript / production build / diff hygiene | **PASS on tested candidate** | Re-run required on this rebased head; existing >500 kB chunk advisory remains. |

This increment does not claim real account/provider acceptance, screen-reader certification, all browser zoom modes, long-name stress completion, or universal page-family completion.

## Role-specific home increment - 20 October 2026

The Stage 1 Home surface now differentiates Employee, Manager and Owner intent without creating a second authorization system. Priority destinations are selected only from the currently rendered, permission-projected Enterprise Command Center links for the active company role.

| Evidence | Result | Limit |
|---|---|---|
| Role-home source contract | **5/5 PASS** | Distinct role IA, permission-projected destinations, no second fetch/persistence authority, landing-route scope, opaque/mobile/large-text treatment. |
| Owner desktop/mobile | **2/2 PASS** | Owner Command Center exposes only authorized priority workspaces; zero horizontal overflow/offenders/page errors. |
| Manager desktop/mobile | **2/2 PASS** | Manager Home prioritizes authorized team workspaces; zero horizontal overflow/offenders/page errors. |
| Employee desktop/mobile | **2/2 PASS** | Employee Home prioritizes self-service/personal work without management-only labels; zero horizontal overflow/offenders/page errors. |
| Full role/route regression | **18/18 PASS + Appearance 3/3** | Representative Owner/Manager/Employee routes at 3840, 1920, 1366, 1024 and 390; zero uncaught page errors and horizontal overflow. |
| Preservation/security gates | **PASS** | V115 export/lock, zero disclosure, staging integration 13/13, Sign-In blockers 15/15, post-auth integration and navigation overlay remain green. |
| TypeScript / production build | **PASS** | Existing large-chunk advisory remains; measured device performance is still open. |

This increment does not broaden role permissions or replace the retained role-aware dashboard data model. Real authenticated Worker/D1 role acceptance remains open before final release.
