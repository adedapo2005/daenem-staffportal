# Database mapping boundary

PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION. domain-entity-catalog.csv contains 20 logical concepts and relationship/query/retention needs. It is not a discovered database schema.

RecordData is a lab display envelope with string-valued fields. Do not migrate that envelope wholesale into production tables. Map typed money, quantities, identifiers, dates, revisions and immutable events to existing normalized domain entities.

Company scope must be carried and enforced in every query. Review indexes for tenant/scope, opaque ID, event time, state and assignment expiry against actual production workloads. Establish retention and evidence/audit linkage by domain.

No table name, index, D1 migration, SQL statement or production schema change is asserted or authored. Migration risk remains unknown until read-only backend inspection.
