# DAENEM STAFF PORTAL — PREMIUM EXPERIENCE LAB

Status: READY_FOR_OWNER_DESIGN_REVIEW

This Site is a private design and interaction workshop. It uses fixture labels and unavailable-state copy only. It does not connect to production credentials, Staff Portal APIs, storage, domains, or Cloudflare infrastructure.

## Source authority

- Repository: adedapo2005/daenem-staffportal
- Audited base: main at 839dc56a0a593fc08cc3f806daa3aa6fb0c0548f
- Audited head: infra/staffportal-dedicated-cloudflare-v1 at 274c3165da552e5b30895973dc15a96eb004c616
- Source modified: no
- GitHub writes: none
- Cloudflare / production modified: no
- Phase 2K infrastructure: untouched

The visual lab follows the source hierarchy: business logic, routes, RBAC, auth/security, API semantics, data ownership, offline/sync rules, and business truth remain authoritative.

## Forensic inventory

The source is a single-path SPA with server-derived auth and a permission-filtered workspace shell. It contains seven global views, fifty authorized module workspaces, a development-only canonical baseline route, and conditional auth continuation surfaces.

The audited inventory covers:

- Auth: sign in, sign up, forgot password, trusted-device/session behavior, and server-derived password policy.
- Global shell: Overview, People & Payroll, Forms Center, Facilities, Broadcast Center, Security Center, and AI Guide.
- Shared interaction contracts: command palette, company scope, notifications, weather/context, profile/session, sync activity, offline draft/retry/review states, and contextual AI guidance.
- Business workspaces: Printing & Technology, Bakery, Autos, Logistics, and Homes & Properties.
- Control workspaces: Finance, HR workflows, access control, admin setup, audit, monitoring, integrations, themes, navigation, layout, support, and owner intelligence.
- Source-defined layouts: Executive Command, Workspace Canvas, Operational Cockpit, Insight Magazine, Master–Detail Workspace, Horizon Wide, Adaptive Bento, Focus & Flow, Enterprise Studio, and Board Pulse.

## Page Uniqueness Matrix

The complete matrix is rendered in the Design Contract view and is backed by `app/contracts.ts`.

- Route surfaces: 61
- Major pages: 60
- Auth surfaces: 3
- Global views: 7
- Module workspaces: 50
- Development-only canonical baseline: /__canonical_baseline

Every row contains route, page, scope, authorization, purpose, functional requirements, primary and secondary actions, required data, empty/loading/error/offline/permission/integration states, unique archetype, hero, information structure, visualization, interaction signature, techie goodie, and mobile/tablet/4K composition.

## Representative batch

| Route surface | Sites archetype | Unique signature | Existing logic preserved |
| --- | --- | --- | --- |
| view:overview | Executive Command | Priority orbit to evidence rail | Canonical adapter, summary, weather/context, widget and permission contracts |
| module:employee | Focus & Flow | Next-action runway | ESS, tasks, forms, profile, documents, notifications, offline-approved drafts |
| module:expense-approvals | Master–Detail Approval Desk | Queue to evidence to decision | Maker-checker permissions, evidence, audit, approve/return/reject actions |
| module:hr-master | People Operations Atlas | Roster horizon to record drawer | HR fields, scoped visibility, sensitive detail gating |
| module:owner-intelligence | Insight Magazine | Briefing story to source path | Owner-only exposure, source availability, deep links |
| module:printing | Board Pulse Production Desk | Stage flow with WIP pulse | Jobs, stages, artwork/proof, materials, QC, delivery, margin contracts |
| module:bakery | Reconciliation Desk | Batch to dispatch to remittance | Ingredients, batches, yield, waste, custody, POS, accountability, close guard |
| module:autos | Workshop Floor | Bay panorama to work order | Vehicles, landed cost, workshop, mechanics, spares, fleet history |
| module:logistics | Map + Operations Feed | Route node to dispatch feed | Shipments, trips, fleet, drivers, route events, expenses, POD |
| module:admin | Enterprise Studio | Policy canvas to inspector | Settings, tracking, geofence, offline guardrails, appearance, reminders, audit |

Homes & Properties remains represented in the matrix and shell as a source-backed workspace. The module detail still requires Owner definition; this lab does not fabricate additional property workflows.

## Current versus Sites refined

| Current experience | Sites refined direction | Why it improves usability |
| --- | --- | --- |
| Shared post-auth frame across modules | Purpose-built page archetypes inside one daylight system | Users can recognize the job from the spatial model, not just the title |
| Overview widget stack | Executive Command orbit plus evidence rail | Priority and provenance become the first interaction |
| Employee module entry | Focus & Flow runway | Personal next action stays clear while secondary work remains reachable |
| Approval queue/detail | Evidence-first master/detail with decision bar | Reviewers keep request context while deciding |
| Printing module | Stage-led Board Pulse | Production flow and evidence gates are visible in one scan |
| Bakery module | Batch-to-money reconciliation spine | Yield, waste, custody, remittance, and close are connected |
| Autos module | Workshop bay panorama | Vehicle/service/parts relationships become spatially inspectable |
| Logistics module | Route corridor plus event feed | Map, trip chronology, and POD are a single dispatch story |
| Admin module | Policy precedence canvas plus inspector | Effective scope and rollback are legible before a change |
| AI entry point | Contextual sidecar in the active workflow | Guidance is useful without becoming a second source of truth |
| Offline indicator | Sync Activity Center drawer | Cached, queued, needs-review, and source-owned retry states are understandable |

## Design system

- Daylight-only visual identity: sky, pearl, white, mint, turquoise, cobalt, coral, controlled apricot/gold.
- Typography direction: Inter Variable body, Manrope Variable headings.
- Accessible focus states, semantic headings, touch-sized controls, reduced-motion media query.
- No screenshot backgrounds; visuals are CSS, SVG, and real component structures.
- No fabricated authoritative business values; fixture values are labeled and unavailable states stay explicit.
- No business context outside the five source-supported workspaces is shown in the prototype.

## Review state

The Site is ready for Owner design review. Implementation is intentionally not started. An Owner-approved page can later receive a route-specific handoff package and a separate implementation branch; this first cycle does not create that branch.
