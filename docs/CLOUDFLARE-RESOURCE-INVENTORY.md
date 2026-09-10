# Cloudflare resource inventory

Status: Phase 2 direct live inventory completed on 2026-09-10. Isolated provisioning is
blocked by the effective Cloudflare API-token permissions. No production cutover,
DNS change, route change, data migration, or production deployment was performed.

## Account and authentication

| Item | Verified value |
|---|---|
| Cloudflare account | `f322585f9882be1f55d8cf6dc7e77ee1` |
| Zone | `daenem.com` |
| Zone ID | `f4cca8cfb0d9a750c09476cce9937fe0` |
| Credential source | Existing protected Remote Desktop Commander credential source; token value not stored |
| Account/zone read | PASS |
| Worker scripts/domains/queues read | PASS |
| Pages/D1/R2/KV/Worker-routes read | BLOCKED by token permissions |

The token was loaded only into the provisioning process. No credential value is
stored in this repository, PR metadata, logs, screenshots, or artifacts.

## Resource inventory

| Resource | Desired name | Purpose | Current source name/value | Exclusive verified? | Migration required? | Provisioning status |
|---|---|---|---|---|---|---|
| Pages | `daenem-staffportal-pages` | Staff Portal static frontend | No Pages inventory available | UNKNOWN | Create dedicated project when Pages access is available | BLOCKED — Pages endpoint returned HTTP 403 |
| API Worker | `daenem-staffportal-api` | Staff Portal API only | Legacy `daenem-workforce-hub` | NOT APPLICABLE | Create dedicated inert identity | BLOCKED — target upload returned HTTP 403 / Cloudflare 10000; target absent |
| D1 | `daenem-staffportal-db` | Staff Portal relational data | `daenem-workforce-hub` / `bea49ff6-e47a-486a-8f65-c3ef9670e314` | UNKNOWN* | Replacement required if UNKNOWN remains; no data migration authorized | NOT CREATED — live D1 unchanged |
| R2 | `daenem-staffportal-files` | Staff Portal files/evidence | `daenem-workforce-files` | UNKNOWN* | Replacement required if UNKNOWN remains; no data migration authorized | NOT CREATED — live bucket unchanged |
| KV | `daenem-staffportal-cache` | Staff Portal cache | `SOCIAL_CACHE` / `74cfc3efb9f54ac4b243a6c0fd2ffc26` | UNKNOWN* | Replacement required if UNKNOWN remains; no data migration authorized | NOT CREATED — live namespace unchanged |
| Queue | `daenem-staffportal-social-jobs` | Staff Portal social/background jobs | `daenem-social-jobs` / `77a446d57774434a8f6155852514a8bb` | UNKNOWN* | Replacement required if UNKNOWN remains; no data migration authorized | NOT CREATED — live queue unchanged |
| Email | Staff Portal sender identity | Transactional Staff Portal mail | `portal@daenem.com` | UNKNOWN | Verify separately before release | UNCHANGED |
| Workers AI | Staff Portal AI binding | Authorized AI runtime | `AI` binding | UNKNOWN | Verify separately before release | UNCHANGED |

* Direct Worker-binding forensics found no foreign Worker using these four
production resources. The Pages project/Functions inventory returned HTTP 403,
so the overall classification remains **UNKNOWN** under the conservative Phase 2
rule. The existing resources were not renamed or abandoned.

## Live legacy Staff Portal Worker

| Item | Evidence |
|---|---|
| Script | `daenem-workforce-hub` |
| Handlers | `fetch`, `scheduled`, `queue` |
| Custom domain ID | `2e5ef36ed66815b3a63512d0f69b1dc2192b89e8` |
| Custom domain | `staffportal.daenem.com` |
| D1 binding | `DB` → `bea49ff6-e47a-486a-8f65-c3ef9670e314` |
| R2 binding | `FILES` → `daenem-workforce-files` |
| KV binding | `SOCIAL_CACHE` → `74cfc3efb9f54ac4b243a6c0fd2ffc26` |
| Queue producer | `SOCIAL_QUEUE` → `daenem-social-jobs` |
| Email binding | `EMAIL` → `portal@daenem.com` |
| AI binding | `AI` |
| Assets binding | Present on legacy Worker; prohibited on the future API-only Worker |
| Secret metadata | `AUTH_PEPPER`, `SOCIAL_TOKEN_KEY`, `SOCIAL_WEBHOOK_VERIFY_TOKEN`; values not exposed |
| Schedule endpoint | Read returned no cron rows; deployed script still advertises a `scheduled` handler |
| Queue consumer | No consumer was attached to the new target; legacy queue state was not changed |

The staging Worker is separate for Staff Portal purposes:
`daenem-workforce-hub-staging` uses D1
`c01a73f7-cf90-48ef-a724-bfc6be144163`, R2
`daenem-workforce-files-staging`, KV
`2ccafe56f3df4ab6a27639bc943e2c4c`, and queue
`daenem-social-jobs-staging`.

## Worker-binding exclusivity evidence

All nine deployed account Workers were inspected through their live settings:
`daenem-farms-admin`, `daenem-farms-platform`,
`daenem-farms-portal`, `daenem-farms-portal-reference-preview`,
`daenem-printing`, `daenem-printing-admin`, `daenem-webadmin`, and the
two Workforce Hub Workers.

The foreign Worker bindings observed were distinct:

- D1 `45cc36b2-6d75-471e-abcb-6be2c6034f96`: Farms Platform, Farms Portal,
  Printing, and Printing Admin.
- KV `4dfb64dd2eff4543b4ef4e6beb7999fe`: the same foreign workloads.
- R2 `daenem-farms-private-files` and
  `daenem-farms-public-media`: foreign workloads.
- Queue `daenem-farms-notifications`: Farms Platform, Farms Portal, and
  Printing.
- Staff Portal staging uses separate staging resources listed above.

No Farms resource is used by the Staff Portal source or future target. No
resource was deleted, copied, migrated, or rebound.

## Hostname and route ownership

The direct Workers custom-domain inventory returned:

| Domain | Owner | ID |
|---|---|---|
| `staffportal.daenem.com` | `daenem-workforce-hub` | `2e5ef36ed66815b3a63512d0f69b1dc2192b89e8` |
| `printing.daenem.com` | `daenem-printing` | `f0a677def2052917481e6eae6af186191a17c911` |
| `farms.daenem.com` | `daenem-farms-platform` | `1760f3116db11dd49446b51ba559af3c634e44fe` |
| `admin.farms.daenem.com` | `daenem-farms-admin` | `5fadbcd0bfe6cfaf0dbc7da1755b7cf95e01b071` |
| `portal.farms.daenem.com` | `daenem-farms-portal` | `3bc04da2416991698548ed424448732279319201` |

The zone Workers-route endpoint returned HTTP 403, so route IDs/patterns beneath
`staffportal.daenem.com/*` could not be enumerated. Therefore:

- Foreign Staff Portal routes: **NOT INDEPENDENTLY VERIFIABLE**.
- Historical `printing-admin` conflict: **UNRESOLVED**; no direct evidence was
  used to claim that it is gone.
- No route was removed, added, or modified.
- The future route remains source-only:
  `staffportal.daenem.com/api/*`.

## Cloudflare API capability evidence

| Operation | Result |
|---|---|
| Account read | HTTP 200 |
| `daenem.com` zone read | HTTP 200 |
| Worker script list/settings/secrets/schedules | HTTP 200 |
| Worker custom-domain inventory | HTTP 200 |
| Queue inventory | HTTP 200 |
| Zone Worker-route inventory | HTTP 403 |
| Pages project inventory | HTTP 403 |
| D1 inventory | HTTP 401 |
| R2 inventory | HTTP 403 |
| KV inventory | HTTP 401 |
| Inert `daenem-staffportal-api` upload | HTTP 403 / error 10000 |

Minimum effective permissions still required for automated continuation:

- Workers Scripts/Services edit for the inert Worker upload;
- Pages read and edit;
- D1 read and edit;
- R2 read and edit;
- KV read and edit;
- Queues read and edit;
- Workers Routes read now and edit only during a separately authorized cutover.

DNS write is not required for this phase.

## Phase 2 safety state

- Pages project: not created.
- `daenem-staffportal-api`: not created.
- Production custom domain: remains on legacy Worker.
- Production API route: not attached.
- DNS: unchanged.
- D1 data: unchanged.
- Migrations 0054–0059: none applied.
- Cron and Queue consumer: not enabled on the new target.
- Legacy repository: unchanged.
- PR #90: unchanged.
- Layouts 06–10: deferred.

## Remaining cutover blockers

- Restore the minimum Cloudflare API-token permissions above.
- Re-run Pages/D1/R2/KV inventory and create only the resources that remain
  non-exclusive.
- Enumerate all zone routes and resolve any non-Staff-Portal ownership,
  including the historical `printing-admin` conflict.
- Create the inert Pages project and API Worker without attaching production
  hostname/routes.
- Resolve the legacy `/properties/hostel/*` compatibility path before any
  API-only cutover.
- Keep database migration 0059 and the matching Worker release in one later,
  explicitly authorized release.
