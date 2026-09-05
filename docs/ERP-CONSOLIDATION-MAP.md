# Staff Portal ERP Consolidation Map

This is the persistent Batch 1 map. It is the working source of truth for
canonical functions, reused engines, permission boundaries and layout
adapters. Theme and Layout are intentionally independent settings.

## Governing rules

- One canonical function has one route/data/API owner.
- A layout profile changes composition, not business ownership or permission.
- The existing Worker/API permission checks remain authoritative.
- Unauthorized functions are filtered before navigation, search, counts or
  deep-link disclosure.
- Layout Studio preview is non-destructive; Apply and policy changes are
  audited and reversible.
- Forms Center and Smart Help remain shared systems; this Batch does not
  create replacements.
- Autos is vehicle sales only. Historical workshop evidence remains
  auditable/read-only; Workshop retirement is a later surgical phase.

## Canonical functions

| Canonical function | Existing component/API | Reused engine | Layout support | Permission | Migration | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Employee Home | ZipDashboard + DashboardWidgets | summary API, widget registry | all ten adapters | dashboard.access | none | Batch 1 foundation |
| Manager Home | ZipDashboard summary + scoped ERP modules | summary API, module hub | command, cockpit, bento, board | role/company scoped | none | Batch 1 foundation |
| Owner Command Center | OwnerCommandCenter + GroupExecutiveDashboard | owner intelligence APIs | command, horizon, insight, bento | dashboard.access manage | none | Batch 1 foundation |
| Forms Center | FormsCenter in centers.tsx | existing forms engine | studio, master-detail, focus | forms.access | none | reused |
| Smart Help | AiGuideView in guidance-center.tsx | Guidance Center APIs | focus, insight, command | ai_guide.access | none | reused |
| ERP Module Hub | ModuleHub in module-hub.tsx | canonical hierarchy + lazy modules | all ten navigation adapters | per module | none | extended |
| Layout Studio | layout-studio-entry.tsx | Module Hub + app_settings + audit logs | studio and command | policy/personal scoped | compatibility keys | implemented |
| Feature pages | PostAuthFeatureFrame | existing module content/API | all ten region strategies | inherited module permission | none | implemented |
| Record pages | existing module record surfaces | existing APIs | master-detail/horizon/studio/board | inherited record permission | none | adapter-ready |
| Analytics/reports | existing executive/ERP surfaces | existing data sources | insight/horizon/command | inherited report permission | none | adapter-ready |
| Admin Center | admin-entry.tsx, admin-setup.tsx | existing settings APIs | studio/command | existing admin checks | none | integrated |

## Layout adapters

| Profile | Navigation | Home composition | Feature/record composition | Mobile |
| --- | --- | --- | --- | --- |
| Daenem Executive Command | expanded sidebar + command bar | KPI + actions + intelligence rail | sectioned workspace + context rail | drawer + bottom context |
| Workspace Canvas | icon rail + expandable canvas | modular canvas | canvas + tool regions | stacked canvas |
| Operational Cockpit | operations rail | queues + exceptions | live controls + action drawer | prioritized queue |
| Insight Magazine | top command | story-led intelligence | evidence alongside narrative | linear story flow |
| Master–Detail Workspace | expanded sidebar | list + selected work | master list + detail pane | list then detail route |
| Horizon Wide | top command | broad KPI ribbon | maximum-width table/data canvas | priority columns + controlled scroll |
| Adaptive Bento | expanded sidebar | priority block + support blocks | size-aware modules | ordered priority list |
| Focus & Flow | contextual navigation | My Day + next action | focused task/detail surface | task drawer |
| Enterprise Studio | icon rail | workbench summary | canvas + inspector + audit | inspector below canvas |
| Board & Pulse | operations rail | pulse + workstreams | board/table/timeline + drawer | prioritized list + view switch |

## Experience precedence

forced layout -> permitted personal preference -> role default -> ERP
default -> organization default -> Executive Command fallback.

comfortable, standard, and compact density affect rhythm but never remove
required controls. Motion presets are off, calm, balanced, and expressive;
every layout honors prefers-reduced-motion.

## Security and data boundaries

The canonical Module Hub filters modules through the existing company and
permission checks before display. Every specialized Worker route continues
to require a session and its own permission checks. The new experience
routes only expose normalized layout policy/preference metadata; they do not
expose business records. Search and deep-links should use the existing
filtered module list rather than an unfiltered registry.

## Autos surgical retirement note

Current Autos code still contains historical Workshop, repair/status,
mechanic/technician, waiting-parts and bodywork references. They are not
expanded by Batch 1. The next Autos sales-only phase should remove those
presentation/workflow paths while preserving shared Logistics maintenance
infrastructure and keeping historical Auto records read-only/auditable.

## Test and migration ledger

- check-postauth-layout.mjs — ten IDs, default, precedence, gallery, preview,
  apply, rollback, reduced motion, and protected existing engines.
- Layout settings use namespaced app_settings keys and preserve prior
  navigation/theme settings; no D1 migration is required.
- Focused authenticated browser coverage remains a release gate before merge:
  home by role, feature page, master-detail, form/admin, Layout Studio, four
  layouts, tablet/mobile, keyboard, and reduced-motion.
