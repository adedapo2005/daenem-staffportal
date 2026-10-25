# DAENEM Staff Portal Design References

This file defines durable reference sources used while building, reviewing, and refining the DAENEM Staff Portal.

These references inform quality and interaction standards. They do **not** authorize replacing the established DAENEM visual identity, approved layouts, brand language, security requirements, accessibility rules, or no-regression baselines.

## Approved reference sources

### Material Design 3
- Source: https://m3.material.io/
- Role: Additional UI/UX and design-system reference.
- Use it to inform:
  - component anatomy and behavior
  - visual hierarchy
  - layout and spacing discipline
  - interaction, hover, focus, pressed, selected, disabled, loading, error, and success states
  - iconography and icon consistency
  - motion principles and reduced-motion behavior
  - responsive/adaptive composition
  - accessibility and touch-target quality
  - form patterns and validation
  - navigation and information architecture
  - consistency across related surfaces

Material Design 3 is a **reference, not a skin**. DAENEM components should remain consistent with the Staff Portal's established enterprise design language, brand identity, approved chrome, information density, and existing component system.

### Microsoft Fluent 2 — approved enterprise design system
- Official design system: https://fluent2.microsoft.design/
- Official React components: https://fluent2.microsoft.design/components/web/react
- React demos: https://react.fluentui.dev/
- Use as primary inspiration for navigation, page hierarchy, Cards, DataGrid patterns, Tabs, Toolbars, Badges, Tooltips, Popovers, Dialogs, typography, accessibility, focus, density, motion, skeleton loading and feedback.
- Preserve DAENEM approved visual identity and no-glass foundation; this is a component design reference, not Microsoft branding.

### Advanced analytical dashboard design references
- shadcn/ui Recharts gallery: https://ui.shadcn.com/charts
- Recharts: https://recharts.org/
- Tailwind CSS responsive layout: https://tailwindcss.com/docs
- Radix UI accessibility: https://www.radix-ui.com/primitives
- Material Design 3: https://m3.material.io/
- StaffPortal premium-lab approved visual baseline: https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site/ (visual reference only; fictional preview is not accepted live data evidence)

### Required StaffPortal Owner Dashboard and module dashboard standard
- Replace generic counters with premium, role-permitted KPI cards: totals, units, current and comparison period, absolute delta, valid percentage delta, meaningful favorable/unfavorable semantics, trend arrow and mini-sparkline when real historical values exist.
- Add coherent date controls (7d/30d/90d/YTD/custom), visible scope, currency, data source, refresh and last-success time across analytic sections.
- Select visualizations for legitimate questions and available data: real multi-series line and area charts; stacked bars; interactive donut/pie; scatter, radar, heatmap and map only when those dimensions exist; rankings, goals, operational alerts, audit timelines and accessible sortable tables.
- Charts require axes, labels, units, timeframe, accessible legend and tooltip, keyboard support, table equivalent, drill-down to canonical records and role/company field-level permission filtering.
- No invented time series, growth rate, zero denominators, predictions or geographic data. Forecast/predictive widgets require a defensible model, horizon and uncertainty. Distinguish genuine zero from missing, unauthorized, stale and disconnected.
- Existing fixed SVG attendance curve cannot be presented as a time trend generated from actual records; replace with true dated attendance data or a truthful current snapshot/empty state.
- Use approved brand colors as foundation with rich complementary sapphire, indigo, teal, plum, coral, amber, champagne gradients and semantic highlights where appropriate. Green remains success/healthy/completed, not generic decoration.
- Maintain scaled 32-inch 4K premium legibility, 1920/1366 desktop, tablet/mobile reflow, contrast, reduced motion, no clipping, and intentional module-specific analytical hierarchy.
- Require deployed authenticated Cloudflare Pre-Production and independent TinyFish/browser acceptance. Passing source tests or fictional Sites preview alone does not close release acceptance.

## System-wide enterprise component standard (Owner approved, 23 October 2026)

This design direction applies to **every StaffPortal page, feature, module, role-specific workspace, and reusable component**, not just dashboards. Every new or revised surface should actively consult the reference library and implement the appropriate interaction and information-design patterns; a collection of generic cards is not sufficient.

- **Navigation and workspace structure:** Fluent 2-inspired command hierarchy, accessible responsive side navigation, clear groupings, breadcrumbs, context actions, quick search, keyboard navigation, selection and focus treatment. Do not replace the approved Sign-In or post-login foundation solely to mimic Microsoft.
- **Data-entry and operational workflows:** polished and fully functional form fields, validation, inline help, steppers, filters, date pickers, file uploads, data grids, detail panes, role-gated actions, review and approval states, dialogs, drawers, menus, tabs, modals, toasts and confirmation patterns. Preserve actual backend integration and the established data-entry workflows.
- **Analytics and reporting:** visually rich, properly sourced KPI/delta cards, real series charts, comparisons, tables, timelines, operational alerts, rankings, progress and maps only where relevant permission-scoped datasets exist. Mini sparklines require dated series; no fabricated charts, trends, model forecasts or percentages against a zero/missing baseline.
- **StaffPortal module coverage:** Executive/Owner Dashboard, Payroll, Finance, HR/Attendance/Leave, Recruitment, Forms, Properties, Printing, Bakery, Autos, Logistics, Inventory, Communications, Security, Audit, Settings and Owner Studio. The same component quality applies to error, empty, loading, disabled, hover, focus, success, offline and permission-denied states.
- **Color and visual depth:** the approved DAENEM palette is a foundation, **not a creativity ceiling**. Add tasteful sapphire, indigo, plum, teal, amber, champagne, coral and other complementary supporting tones, semantic accents, restrained gradients, edge highlights, carefully composed shadows and meaningful data-series colors. Preserve legibility and contrast. Green still denotes success/healthy status, not generic navigation or decoration.
- **Premium composition:** refined typography, meaningful hierarchy, intentional use of open space, high information density without clutter, polished control geometry and iconography, tasteful state transitions, 32-inch 4K scaling, smaller desktop no-clipping behavior and tablet/mobile adaptive layouts. No glass, fake transparent overlays or excessive motion. Support keyboard, screen readers, touch and reduced motion.
- **Operational truth and integration:** the canonical GitHub StaffPortal frontend and Cloudflare Worker/D1 backend must be connected. Use authenticated, permission-scoped ERP records and show data source, scope, period and freshness. Explicitly distinguish recorded zero, missing data, unauthorized data, offline snapshots and mock/demo previews. Do not treat Sites reference content as authoritative Pre-Production ERP data.
- **Release requirement:** changes are validated against the current approved baseline; completed work flows through a normal PR and controlled Cloudflare **Pre-Production** deployment, with independent authenticated browser verification before claiming acceptance. Protect Production, other active worktrees and existing ownership leases.

This requirement is StaffPortal-wide in this repository. DAENEM-wide visual principles may inform the separate FarmPortal and WebAdmin projects, but their codebases and release gates remain separately owned.

## DAENEM-specific precedence

When references conflict with an accepted Staff Portal requirement, the Staff Portal requirement wins. In particular:

- Zero disclosure remains mandatory.
- Green remains reserved for success, healthy, connected, completed, or valid states; it must not become generic navigation, active-state, button, or decorative chrome.
- Human-visible time remains 12-hour with AM/PM.
- Reduced Motion must remove non-essential continuous motion.
- Existing accepted layouts and no-regression baselines must not be redesigned merely to resemble an external design system.
- Multi-company administration should use clear scope, inheritance, and selection patterns, including Select All where settings apply across multiple companies or other applicable groups.

## Review expectation

Future UI refinement and QA should consider Material Design 3 alongside other established DAENEM references when evaluating:
- component quality
- interaction states
- visual hierarchy
- accessibility
- motion
- responsiveness
- consistency
- clarity of system feedback

The target remains a DAENEM-specific enterprise experience, informed by strong external systems rather than visually copied from them.
