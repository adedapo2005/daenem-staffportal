# Backend implementation notes

PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION

The client fixture authority is for demonstration only. Bind Daenem credentials to a Daenem session; derive assignments server-side. Never accept role, company or person identity from browser state. Require one qualifying grant for every record/action and field patch; deny by default. Return neutral missing/unauthorized responses. Build a minimal authorized projection before delivering metadata, fields, file bytes, search, AI, notifications, reports or exports.

Keep raw stored records separate from projections. Apply explicit authorized patches to canonical state; preserve hidden fields and history. Never merge a redacted record over storage. Use transactions.ts as a bounded behavioral reference, not a database implementation.
