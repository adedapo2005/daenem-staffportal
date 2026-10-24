# DAENEM StaffPortal Guided Data Entry — System-Wide Standard

Owner-approved requirement, 23 October 2026. Applies to all StaffPortal business modules, dashboards with input controls, forms, record detail workflows, Owner Studio, mobile and desktop experiences. Do not apply by copying backend ownership across FarmPortal or WebAdmin.

## Selection before typing

1. Prefer a permission-filtered, authenticated master-data selector for companies, employees, customers, suppliers, categories, cost centres, inventory items, projects, properties, products, departments, roles, and other canonical records. Persist canonical IDs, not free-text labels.
2. Search/combobox controls may filter only authorised values. No matching item must not cause invented records to be submitted. Offer approved new-value proposal workflows when supported.
3. Choose predefined options and validated typeahead for established taxonomies and statuses; free text only when needed for real context.
4. Autocomplete and recommendations must use existing approved records. Auto-generate reference numbers and final transaction identities server-side; never fabricate references client-side.
5. Prefill related fields from verified selected records, company scope, employee profile or controlled templates. Do not override user edits; explain why a value was suggested and allow correction.
6. Allow optional employee description/title suggestions constructed from factual canonical fields; never silently write AI guesses into legally or financially material statements. Distinguish suggestions from submitted records.
7. Support keyboard navigation, focus, labels, screen readers, responsive density, reduced motion, solid premium surfaces and offline fallback. Avoid leaking previously cached data across company/role/session boundaries.

## Authority and quality guarantees

- Server is final authority for field permissions, company scope, object existence, active status, approval, idempotency, audit and lifecycle. A client dropdown is not authorization.
- Normalize identifiers, spacing and case where semantics are safe. Do not autocorrect personal names, bank information, amounts, legal data or other material values without explicit review.
- Preserve dependencies: changing company, category or related record must invalidate stale selected IDs and revalidate suggestions.
- The UI must differentiate an empty authorised list from a fetch failure or permission denial. Sensitive historical data cannot be used as a recommendation without permission.
- Reuse existing GitHub/Cloudflare D1 master-data APIs. Avoid duplicating ERP data sources and changing autonomous backend-writer leases.
- Each workflow needs a narrow implementation test and deployed authenticated Pre-Production verification before calling it complete.

## Initial implementation

Shared `src/smart-master-select.tsx` offers exact-ID selection, optional search, keyboard-compatible native select, and a bounded visible matching list. `src/spend-entry.tsx` uses existing `/api/spend/bootstrap` D1 master lists for categories, cost centres, suppliers and project references. Purpose suggestions are assembled from approved category/ERP/project/supplier fields, and can be overridden. The existing server-side spend master validation and audit remain mandatory.

Further rollout: Forms (schema-defined select choices and server validation), Payroll/HR, Procurement, Printing, Logistics, Properties, Autos, Recruitment and all remaining data-entry workflows. Track field coverage, keystroke reduction, correction frequency, and invalid-submit rates once verified; do not invent metrics.
