# Backend mapping notes

PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION. No production repository, Worker route, D1 schema, R2 bucket or external identity contract was changed or assumed.

Treat api-operation-catalog.csv as semantic command/read concepts. Before integration, map each to existing production contracts and preserve verified Daenem behavior. Authorize tenant, module, record, field and specialized action on the server before metadata or bytes leave it. A client projection is not an authorization boundary.

Use durable transactional semantics for PO receipt/inventory, ledger posting, payment and custody reconciliation. Validate expected revisions and operation IDs; record before/after, reason, actor, correlation and side effects. Define explicit state transitions instead of deriving permission from display order.

Builders must publish governed definitions with scope, version, validation, simulation, approval, rollback and an actual runtime consumer. Their present local UI does not provide that complete engine.

Investigate existing schema and services before classifying a gap as new capability or new migration. No production migration is included.
