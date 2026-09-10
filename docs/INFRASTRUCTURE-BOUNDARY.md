# Staff Portal infrastructure boundary

Status: Phase 2 direct live inventory completed. Cloudflare isolated provisioning
is blocked by insufficient API-token permissions. No production cutover has
been performed.

## Authority and purpose

This private repository is the dedicated source authority for the internal Staff
Portal at `staffportal.daenem.com`. It serves the employee, manager, and Owner
ERP hub for Printing, Autos, Bakery, Homes & Properties, and Logistics through
explicit authenticated integrations.

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

No website may deploy through another website's infrastructure, share its build
output, share its data/storage resources, or own routes beneath another
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
`/api/*`. This prevents the API Worker from becoming a second frontend
server.

## Direct live inventory

The authorized Remote Desktop Commander device supplied an existing protected
Cloudflare API-token source. Account and zone reads passed:

- Cloudflare account: `f322585f9882be1f55d8cf6dc7e77ee1`
- Zone: `daenem.com`
- Zone ID: `f4cca8cfb0d9a750c09476cce9937fe0`

The live Workers custom-domain inventory shows
`staffportal.daenem.com` on the legacy `daenem-workforce-hub` Worker
(custom-domain ID `2e5ef36ed66815b3a63512d0f69b1dc2192b89e8`). The live legacy
Worker exposes `fetch`, `scheduled`, and `queue` handlers and retains its
existing bindings. The future API Worker has no live route or custom domain.

The zone Worker-route endpoint returned HTTP 403. Therefore route IDs and
patterns beneath `staffportal.daenem.com/*` cannot yet be independently
enumerated, and the historical `printing-admin` conflict remains unresolved.
No route was changed.

## Resource isolation

Live Worker settings were compared across all nine deployed account Workers.
The current production Staff Portal resources are not bound by the foreign
Workers observed:

- D1 `bea49ff6-e47a-486a-8f65-c3ef9670e314` is bound to
  `daenem-workforce-hub`; foreign workloads use D1
  `45cc36b2-6d75-471e-abcb-6be2c6034f96`.
- R2 `daenem-workforce-files` is bound to
  `daenem-workforce-hub); foreign workloads use
  `daenem-farms-private-files` and `daenem-farms-public-media`.
- KV `74cfc3efb9f54ac4b243a6c0fd2ffc26` is bound to
  `daenem-workforce-hub`; foreign workloads use KV
  `4dfb64dd2eff4543b4ef4e6beb7999fe`.
- Queue `daenem-social-jobs` is produced by
  `daenem-workforce-hub`; foreign workloads use
  `daenem-farms-notifications`.

Staff Portal staging uses separate D1, R2, KV, and Queue resources. The Pages
project/Functions inventory could not be read (HTTP 403), so the conservative
overall classification remains UNKNOWN until Pages read access is granted.
No resource was renamed, created, copied, migrated, rebound, or deleted.

## Authenticated external integrations

Staff Portal may call Printing, Autos, Bakery, Homes & Properties, or Logistics
through authenticated HTTPS APIs, service bindings, or approved deep links. It
must not import their source, deploy through their Pages or Worker project,
share their D1/KV/R2/Queues, or reuse their deployment workflow.

## Permanent Farms exclusion

Daenem Farms is a separate system. No Farms source, employee/customer data,
business selector, Worker, Pages project, D1, KV, R2, queue, or hostname belongs
in this repository. The platform's protected-domain denylist is a security
control, not a Farms integration.

## Route ownership and cutover gates

Before final hostname cutover, no non-Staff-Portal Worker may own
`staffportal.daenem.com/*` or any subroute. The live custom-domain check did
not show `printing-admin` on the Staff Portal hostname, but the route API was
blocked; this is not proof that the historical route conflict is gone. The
conflict must be resolved in the owning infrastructure, and this repository
must not modify another website's repository.

Printing ERP functionality inside Staff Portal must be native Staff Portal UI
calling an authenticated Printing API. It must not rely on an external Printing
Worker serving the Staff Portal hostname.

The migrated application also contains a legacy dynamic
`/properties/hostel/*` HTML compatibility route. Because the target Worker is
API-only, that route must be intentionally relocated to Pages or converted to an
approved API-backed route before production cutover. This phase records the
compatibility gate and does not delete its source.

## Release controls

- `main` is the canonical production-ready source branch.
- Pages and API deployment workflows are manual and require explicit typed
  confirmation plus their protected GitHub environments.
- Ordinary commits do not deploy production.
- Deployment workflows never apply D1 migrations.
- DNS, hostname cutover, legacy-route cleanup, resource deletion, and database
  migration remain outside this phase.
- The target Worker must not receive cron, queue consumers, email, production
  data bindings, or a production route during provisioning.

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

## Cloudflare provisioning status

The effective token could read account, zone, Worker scripts/domains, and
Queues. It could not read routes, Pages, D1, R2, or KV, and a one-time inert
Worker upload for `daenem-staffportal-api` returned HTTP 403 / Cloudflare
error 10000. The target Worker and Pages project therefore remain absent.

Minimum additional effective permissions are:

- Workers Scripts/Services edit;
- Pages read/edit;
- D1 read/edit;
- R2 read/edit;
- KV read/edit;
- Queues read/edit;
- Workers Routes read now and edit only during a separately authorized cutover.

DNS write is not required for this phase. The API-token value is not stored in
this repository or its metadata.

## Safety state

- Production traffic: unchanged.
- DNS: unchanged.
- Legacy `staffportal.daenem.com` origin: unchanged.
- Production D1 and all legacy resources: unchanged.
- Migrations 0054–0059: none applied.
- Queue consumers and cron: not enabled on the new target.
- Legacy repository: unchanged.
- PR #90: unchanged.
- Layouts 06–10: deferred.
