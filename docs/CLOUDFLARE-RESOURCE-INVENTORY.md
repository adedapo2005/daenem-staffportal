# Cloudflare resource inventory

Status: source-preparation phase; direct authorized Cloudflare inventory was
unavailable. Every exclusivity field below is therefore **NOT VERIFIED**.
No live resource was renamed, copied, deleted, migrated, or provisioned.

| Resource | Desired name | Purpose | Current source name/value | Exclusive verified? | Migration required? | Provisioning status |
|---|---|---|---|---|---|---|
| Pages | `daenem-staffportal-pages` | Staff Portal static frontend | None in migrated Worker config | NOT VERIFIED | Create/attach only during controlled cutover | NOT PROVISIONED |
| API Worker | `daenem-staffportal-api` | Staff Portal API only | `daenem-workforce-hub` | NOT VERIFIED | Dedicated Worker preparation complete; live identity still required | NOT PROVISIONED |
| D1 | `daenem-staffportal-db` | Staff Portal relational data | `daenem-workforce-hub` / current source ID retained | NOT VERIFIED | Mandatory if current D1 is shared; otherwise document verified-exclusive reuse | NOT PROVISIONED |
| R2 | `daenem-staffportal-files` | Staff Portal files/evidence | `daenem-workforce-files` | NOT VERIFIED | Mandatory if current bucket is shared | NOT PROVISIONED |
| KV | `daenem-staffportal-cache` | Staff Portal cache | `SOCIAL_CACHE` / current namespace ID retained | NOT VERIFIED | Mandatory if current namespace is shared | NOT PROVISIONED |
| Queue | `daenem-staffportal-social-jobs` | Staff Portal social/background jobs | `daenem-social-jobs` | NOT VERIFIED | Mandatory if current queue is shared | NOT PROVISIONED |
| Email | Staff Portal sender identity | Transactional Staff Portal mail | `portal@daenem.com` | NOT VERIFIED | Verify sender/domain ownership before release | NOT PROVISIONED |
| Workers AI | Staff Portal AI binding | Authorized AI runtime | `AI` binding in source config | NOT VERIFIED | Verify account/binding scope before release | NOT PROVISIONED |

## Required direct inventory

Use only direct authorized Cloudflare tooling for the live check. Resolve:

1. the Worker currently serving `staffportal.daenem.com`;
2. every route beneath `staffportal.daenem.com/*`;
3. the Worker `DB`, `FILES`, `SOCIAL_CACHE`, `SOCIAL_QUEUE`,
   `EMAIL`, and `AI` bindings;
4. the actual D1 database, R2 bucket, KV namespace, Queue, sender, and
   account identities;
5. whether the legacy `printing-admin` route is still attached to the
   Staff Portal hostname.

Do not infer live identity from repository configuration.

## Cutover blockers

- Direct Cloudflare inventory and provisioning:
  `DIRECT_CLOUDFLARE_PROVISIONING_REQUIRED`.
- Proof or replacement of every data/storage binding's exclusivity.
- Pages project creation and hostname attachment.
- Removal or relocation of every non-Staff-Portal route beneath the Staff
  Portal hostname.
- Resolution of the legacy `/properties/hostel/*` HTML compatibility route.
- A separately authorized, compatibility-matched database/API migration for
  migrations 0054–0059.
