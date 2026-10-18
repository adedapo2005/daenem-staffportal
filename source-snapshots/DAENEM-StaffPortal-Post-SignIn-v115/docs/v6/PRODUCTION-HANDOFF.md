# Production engineering handoff

## Canonical source
Use the source commit named in the package CHECKPOINT-PROVENANCE.json. Preserve routes, module IDs, record relationships, central permissions, field projection, imports, handoffs and evidence guards. The project manifest identifies only the ChatGPT review Site and must not be repointed to Daenem production as an incidental step.

## Runtime boundaries
Business records, session simulations, files, draft builders and configuration publication in this application are local fictional review state. Browser storage is not a production authorization authority or durable shared ERP database. Production adapters, actual authentication, verified weather/location, notifications, chat transport, object retention and payroll/payment exports need separately authorized engineering integration.

## Existing contracts included
The complete source docs include the API operation catalog, adapter map, database mapping notes, entity catalog, record/field/permission matrices, workflow states, validation and business rules, audit and notification event catalogs, offline contract, frontend transfer map, production readiness and gap maps. These describe intended integration contracts and historical findings, not evidence of completed production integration.

## Required production implementation
1. Authenticate server-side and resolve administrator assignments, scopes and field policies on each request. Return only authorized projections. Re-check exports, AI, search, notifications and file downloads.
2. Put linked handoffs, stock receipts/transfers and financial state changes in atomic database transactions with revision checks and idempotency keys. Preserve maker/checker requirements.
3. Enforce file retention/legal hold, classification and download permission in object storage and database services. Scan uploads, validate actual file content, and preserve auditable version history.
4. Replace local drafts/configuration storage with scoped, versioned server persistence; fail closed on corrupt policy state.
5. Map the included catalogs to existing production APIs and schema. Review migrations, rollback and monitoring before requesting separate production approval.
6. Run real authentication, isolation, accessibility, browser/device and ERP scenario acceptance with production-like non-production data before rollout.

No production deployment is part of this package.
