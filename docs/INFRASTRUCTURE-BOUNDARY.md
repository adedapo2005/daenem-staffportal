# Staff Portal infrastructure boundary

Status: Phase 1 source preparation. No production cutover has been performed.

## Authority and purpose

This private repository is the dedicated source authority for the internal
Staff Portal at `staffportal.daenem.com`. It serves the employee, manager,
and Owner ERP hub for Printing, Autos, Bakery, Homes & Properties, and
Logistics through explicit authenticated integrations.

The permanent deployment boundary is:

ONE WEBSITE
=
ONE GITHUB REPOSITORY
+
ONE DEDICATED CLOUDFLARE PAGES PROJECT
+
ONE DEDICATED CLOUDFLARE WORKER
+
DEDICATED BUILD CONFIGURATION
+
DEDICATED DEPLOYMENT WORKFLOW
+
DEDICATED DATA/STORAGE RESOURCES

No website may deploy through another website's infrastructure, share its
build output, share its data/storage resources, or own routes beneath another
website's hostname.

## Staff Portal target

| Boundary | Staff Portal target |
|---|---|
| GitHub repository | `adedapo2005/daenem-staffportal` |
| Default branch | `main` |
| Private hostname | `staffportal.daenem.com` |
| Pages project | `daenem-staffportal-pages` |
| API Worker | `daenem-staffportal-api` |
| API route | `staffportal.daenem.com/api/*` |
| Pages build command | `npm ci && npm run build` |
| Pages output | `dist/client` |
| Worker source | `worker/runtime.ts` |
| Worker assets | None; Pages owns frontend/static requests |
| D1 target | `daenem-staffportal-db` |
| R2 target | `daenem-staffportal-files` |
| KV target | `daenem-staffportal-cache` |
| Queue target | `daenem-staffportal-social-jobs` |

The Pages build uses `vite.pages.config.ts`, which excludes the Cloudflare
Worker plugin and emits only the frontend to `dist/client`. The API Worker
configuration has no assets binding and rejects every request outside
`/api/*). This prevents the API Worker from becoming a second frontend
server.

## Resource isolation

The current migrated Worker bindings are retained in `wrangler.jsonc` as
source-compatible values for traceability only:

- D1: `daenem-workforce-hub`
- R2: `daenem-workforce-files`
- KV namespace binding: `SOCIAL_CACHE`
- Queue: `daenem-social-jobs`

Direct Cloudflare inventory was unavailable in this phase. Their exclusive
Staff-Portal ownership is therefore **NOT VERIFIED**. No rename, resource
creation, data copy, deletion, or production migration has been performed.
Before cutover, each resource must either be proven Staff-Portal-exclusive or
be replaced by the dedicated target name above. The existing D1 must not be
discarded solely because its current name is legacy.

Migrations 0054 through 0059 are not applied here. Migration 0059 and its
matching Worker compatibility must be released together in a later,
explicitly authorized database/API release.

## Authenticated external integrations

Staff Portal may call Printing, Autos, Bakery, Homes & Properties, or
Logistics through authenticated HTTPS APIs, service bindings, or approved
deep links. It must not import their source, deploy through their Pages or
Worker project, share their D1/KV/R2/Queues, or reuse their deployment
workflow.

## Permanent Farms exclusion

Daenem Farms is a separate system. No Farms source, employee/customer data,
business selector, Worker, Pages project, D1, KV, R2, queue, or hostname
belongs in this repository. The platform's protected-domain denylist is a
security control, not a Farms integration.

## Route ownership and cutover gates

Before final hostname cutover, no non-Staff-Portal Worker may own
`staffportal.daenem.com/*) or any subroute. The legacy `printing-admin`
route conflict must be removed or relocated in the Printing-owned
infrastructure; that other repository is intentionally not modified here.

Printing ERP functionality inside Staff Portal must be native Staff Portal UI
calling an authenticated Printing API. It must not rely on an external
Printing Worker serving the Staff Portal hostname.

The migrated application also contains a legacy dynamic
`/properties/hostel/*` HTML compatibility route. Because the target Worker
is API-only, that route must be intentionally relocated to Pages or converted
to an approved API-backed route before production cutover. This phase records
the compatibility gate and does not delete its source.

## Release controls

- `main) is the canonical production-ready source branch.
- Pages and API deployment workflows are manual and require an explicit typed
  confirmation plus their protected GitHub environment.
- Ordinary commits do not deploy production.
- Deployment workflows never apply D1 migrations.
- DNS, hostname cutover, legacy-route cleanup, resource deletion, and database
  migration remain outside this phase.

## GitHub main protection

Desired main rules are:

- no force pushes;
- no branch deletion;
- pull-request review where practical;
- required CI success before merge;
- production deployment separated from ordinary source changes.

Current branch-protection enforcement could not be independently read or
configured through the connected GitHub capability. Status:
`GITHUB_BRANCH_PROTECTION_CONFIGURATION_REQUIRED`. See
`docs/GITHUB-BRANCH-PROTECTION.md`; no protection state is claimed here.

## Direct Cloudflare access

No direct authorized Cloudflare inventory/provisioning capability was
available for this execution. Status:
`DIRECT_CLOUDFLARE_PROVISIONING_REQUIRED`.

This document describes the target contract only. It does not assert that
Pages, Worker, DNS, routes, or data resources have been provisioned.
