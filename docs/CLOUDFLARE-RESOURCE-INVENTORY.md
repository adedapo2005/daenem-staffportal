# Cloudflare resource inventory

Status date: source-preparation phase; direct Cloudflare inventory was not
available to this execution.

All rows marked `NOT VERIFIED` require live Cloudflare inspection before
cutover. Existing source values are recorded for traceability only and must
not be treated as proof of exclusivity.

| Resource | Desired name | Purpose | Current source name/value | Exclusive verified? | Migration required? | Provisioning status |
|---|---|---|---|---|---|---|
| Pages | `daenem-staffportal-pages` | Staff Portal static frontend | Not present in migrated source | NOT VERIFIED | Pages project/domain setup pending | NOT PROVISIONED |
| Worker | `daenem-staffportal-api` | Staff Portal API only | `daenem-workforce-hub` | NOT VERIFIED | Worker route/config separation prepared | NOT PROVISIONED |
| D1 | `daenem-staffportal-db` | Staff Portal relational data | `daenem-workforce-hub` / source ID retained in config | NOT VERIFIED | Required if current D1 is shared; otherwise controlled reuse decision | NOT PROVISIONED |
| R2 | `daenem-staffportal-files` | Staff Portal files | `daenem-workforce-files` | NOT VERIFIED | Required if current bucket is shared | NOT PROVISIONED |
| KV | `daenem-staffportal-cache` | Staff Portal cache | binding `SOCIAL_CACHE`, source namespace ID retained in config | NOT VERIFIED | Required if current namespace is shared | NOT PROVISIONED |
| Queue | `daenem-staffportal-social-jobs` | Staff Portal social/background jobs | `daenem-social-jobs` | NOT VERIFIED | Required if current queue is shared | NOT PROVISIONED |
| Email | Staff Portal sender identity | Transactional Staff Portal mail | `portal@daenem.com` | NOT VERIFIED | Verify sender/domain ownership | NOT PROVISIONED |
| AI | Staff Portal account binding | Authorized AI runtime | source binding `AI` | NOT VERIFIED | Verify account/binding scope | NOT PROVISIONED |

## Required live inventory

Use direct authorized Cloudflare tooling only. Resolve the Worker serving
`staffportal.daenem.com`, its `DB` binding, and the actual D1/R2/KV/Queue
identities. Do not infer live identity from this file or from repository
configuration.

## Cutover blockers

- Prove or replace every data/storage binding's exclusivity.
- Provision the Pages project and attach the hostname only during an explicit
  cutover.
- Relocate the legacy `printing-admin` route from the Staff Portal hostname.
- Resolve the legacy `/properties/hostel/*` dynamic HTML compatibility route.
- Apply database migrations only in a separately authorized release.
