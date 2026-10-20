# StaffPortal Stage 1 - Requested versus completed ledger

**Updated:** 20 October 2026
**Scope:** Authenticated StaffPortal post-login experience only
**Current live Pre-Production source:** `e270c0a1902b563dbc2ab5413c81fc85e8181dab`
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
| Latest deployed Sign-In, Create Account, WhatsApp, weather and service-worker source retained | Implemented in candidate | Candidate includes live source `e270c0a...`; Stage 1 is applied additively. Full auth/provider acceptance remains required. |
| Complete Stage 1 source combined with latest auth | Implemented in candidate | Enterprise navigation, Stage 1 search, workflow focus, palette, accessibility and page refinements are present in the isolated branch. |
| Current Cloudflare Pre-Production includes complete Stage 1 | **No** | Live is still `e270c0a...`; do not describe Stage 1 as restored until exact integrated candidate promotion and fingerprint verification. |
| Production changed | **No** | Production authorization remains closed. |

## Approved appearance and palette governance

| Requested item | Status | Evidence / remaining work |
|---|---|---|
| Option 2 + Option B as default | Implemented in candidate | `Ocean Sapphire - Azure Prestige` is the single fail-closed default: Sapphire navigation, Ocean/Royal Azure action, Cloud/Ice surfaces, Graphite ink, controlled Cyan/Gold/Violet. |
| Wide variety of distinctive alternatives | Implemented in candidate | 19 coordinated palettes: 7 earlier approved directions plus 12 new editorial/architectural combinations. |
| Optional selection on authenticated Admin/Appearance page | Implemented in candidate | `/theme` receives a dedicated full-page gallery with preview, personal apply/reset and authorized Group controls. Browser acceptance pending. |
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
| Progressive disclosure and clear current route | Implemented in candidate | Separate disclosure and destination controls; current page and ancestors are distinct. Browser keyboard/touch acceptance pending. |
| Search deep modules with context path | Implemented in candidate | Authorized module finder is retained inside the command surface. |
| Favorites and recents | Implemented in candidate | Session-scoped stable IDs; no private record content persisted. Server/cross-device persistence was not requested or implemented. |
| Employee/Manager/Owner navigation ordering | Implemented in candidate | Presentation order uses actual current-company roles and does not grant access. |
| Role-specific workflow shortcuts | Implemented in candidate | Employee, Manager and Owner focus links are additive and permission-filtered. |
| Purpose-built role-specific home dashboards | **Partial** | Role ordering and shortcuts exist; the complete Employee/Manager/Owner dashboard information architecture is not yet redesigned page by page. |
| Delegated/multi-role context switch | **Partial** | Company-role scoping is improved. Full explicit delegated-responsibility UX and acceptance remain open. |
| Last expanded section intelligent state | Partial | In-session disclosure memory and active ancestor expansion exist. The exact approved auto-collapse behavior still needs browser review against owner expectations. |
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
| Finance workspace refinement | Partial | KPI ribbon contrast/visibility and palette treatment are implemented; complete Finance workbench composition and authenticated data acceptance remain open. |
| Construction workspace refinement | Partial | Compact command hero and density improvements are implemented; complete project page family review remains open. |
| Forms and validation system | Partial | Existing forms are preserved. Full shared label/help/error/summary anatomy and all requested workflows are not yet complete. |
| Worklists/data tables | Partial | Existing semantic tables are preserved. Saved views, density, pinned identity, mobile rows and every register require page-family acceptance. |
| Record review / approval workspace | Partial | Existing record architecture remains; stable identity/state/facts/evidence/activity/action order is not verified across all modules. |
| Calendar/board patterns | Partial | Existing calendar and board functions remain. Device-specific agenda/keyboard/drag alternatives need acceptance. |
| Communications/inbox/thread relationship | Partial | Existing communication systems are preserved; complete desktop split/mobile thread refinement and delivery-state audit remain open. |
| Attachments/upload/preview/retry | Partial | Existing attachment functions remain. Unified progress/failure/retry treatment is not complete across workflows. |
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
| Desktop 3840/1920/1366 | Not yet verified on exact candidate | Required browser screenshots and interaction evidence pending. |
| Tablet 1024 and narrow desktop | Not yet verified on exact candidate | Required. |
| Mobile 390 and other supported phones | Not yet verified on exact candidate | Required; on-screen keyboard and label wrapping included. |
| Large text/zoom/long names | Not yet verified | Required. |
| No horizontal overflow | Not yet verified on exact candidate | Previous Stage 1 evidence is not automatically evidence for this integrated palette candidate. |
| Performance/bundle | Not yet verified | Existing >500 KB advisory remains known; build and measured browser performance required. |
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

The isolated candidate retains the current Pre-Production source `e270c0a1902b563dbc2ab5413c81fc85e8181dab`. Stage 1 and Appearance were implemented at `83878f63067e452de4e1f875a48764fba85c3401`, with the latest deployed Sign-In/weather/service-worker lane merged at `4654c3903547196cdcddab4094a1c2b624491094`. The final review head may include documentation-only evidence above those commits. Verification is rerun after integration before promotion.

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

**Still not complete:** this is local exact-source evidence using synthetic authenticated fixtures. Cloudflare Pre-Production still serves the earlier source until an exact committed SHA is reviewed and promoted. Real Worker/D1 login, company isolation, revocation, actual providers, assistive-technology review, manual contrast review, performance measurement and the broader page-family work in this ledger remain open. Production remains untouched.
