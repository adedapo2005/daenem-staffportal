# Staff Portal infrastructure boundary

## Authority and purpose

This repository is the dedicated source authority for the private internal
Staff Portal at `staffportal.daenem.com`. It is the employee, manager, and
Owner ERP hub. Public Daenem websites remain separate applications and may
only be reached through explicit authenticated HTTPS API contracts or approved
deep links.

The permanent rule is:

ONE DAENEM WEBSITE
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
build output, share its storage/database resources, or own routes under
another website's hostname.

## Staff Portal target

| Boundary | Staff Portal target |
|---|---|
| GitHub repository | `adedapo2005/daenem-staffportal` |
| Default branch | `main` |
| Internal hostname | `staffportal.daenem.com` |
| Pages project | `daenem-staffportal-pages` |
| API Worker | `daenem-staffportal-api` |
| API route | `staffportal.daenem.com/api/*` |
| Pages build command | `npm ci && npm run build:pages` |
| Pages output | `dist/client` |
| D1 target name | `daenem-staffportal-db` (not provisioned in this phase) |
| R2 target name | `daenem-staffportal-files` (not provisioned in this phase) |
| KV target name | `daenem-staffportal-cache` (not provisioned in this phase) |
| Queue target name | `daenem-staffportal-social-jobs` (not provisioned in this phase) |

The Pages build uses `vite.pages.config.ts`, which deliberately excludes
the Cloudflare Worker plugin and emits only `dist/client`. The API Worker
configuration has no assets binding and has an explicit non-API 404 guard, so
it cannot become a second frontend server.

## Data and storage isolation

The current migrated source bindings are retained in `wrangler.jsonc`
only as source-compatible placeholders pending direct live inventory. Their
exclusive use by Staff Portal is not verified in this phase. No rename,
resource creation, data migration, D1 migration, or destructive operation has
been performed.

Before production cutover, Cloudflare inventory must prove that every binding
is Staff-Portal-exclusive or replace it with a dedicated resource. Migration
0054–0059 must remain a separately controlled release with matching Worker
compatibility.

## Cross-site integrations

Staff Portal may communicate with Printing, Autos, Bakery, Homes, or
Logistics through authenticated HTTPS APIs, service credentials, or approved
deep links. It must not import their source, use their Worker/Pages project,
share their D1/KV/R2/Queues, or share their deployment workflows.

Daenem Farms is permanently excluded. No Farms source, hostname, Worker,
Pages project, D1, KV, R2, queue, business selector, or business data belongs
in this repository.

## Route ownership and compatibility gates

Before final cutover, no non-Staff-Portal Worker may own
`staffportal.daenem.com/*` or any subroute. The legacy cross-site
`printing-admin` route conflict must be removed or relocated in the
Printing-owned infrastructure; that other repository is intentionally not
modified here.

The migrated Staff Portal runtime also contains a legacy dynamic public HTML
route under `/properties/hostel/*`. Because the target Worker is API-only,
that route must be intentionally relocated to Pages or converted to an
approved API-backed route before production cutover. This phase does not
delete the route's source or change its data contract; it records the
compatibility requirement rather than silently losing it.

## Release controls

Production Pages/Worker deployment, DNS/route changes, resource provisioning,
D1 migrations, and legacy repository cleanup are out of scope for this phase.
Deployment workflows are manual and separately gated; ordinary pushes to
`main` do not deploy production.
