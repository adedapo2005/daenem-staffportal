# Profile And Direct Entry Verification

The approved frontend reproduces Profile Unavailable against the unchanged compiled Worker. The corrected frontend renders the same actual response. This is a disposable, local Miniflare/D1 test with normal synthetic password authentication; no API response is mocked.

Result: 17/17 checks passed; 4K 3840x2160, desktop 1440x900 and mobile 390x844. Direct entry has no company gate, picker or default-company URL. No browser runtime error, business-write attempt or external browser request occurred. The Worker blocks external calls in the fixture.

The Owner role and catalog are seeded by the existing source migrations. Five existing company assignments are inserted only into the disposable database. The harness does not invent jobs.access. Other fixture actors are synthetic boundary-test users; they are not evidence of live grants.

Expected Worker SHA-256: d63750041287fa412066ec4509b08bfa21dc7632dc61ae1458201a5023ee0b41.
Source path: D:\DAENEM-QA\staffportal-profile-display-candidate-20261105
Runner path: D:\DAENEM-QA\staffportal-full-module-review-20261105
The runner uses the preserved compatible-dispatch-worker.mjs and worker-build-result.json alongside it. Approved baseline assets are read from the original immutable release evidence directory.

Command on Daenem_Group:
node D:\DAENEM-QA\staffportal-full-module-review-20261105\test-profile-browser-real-worker.mjs

The full 160-route matrix was not repeated. It remains a gap inventory, not an acceptance pass: 48 shell-rendered routes and 112 unavailable/permission-held routes. Two early Profile snapshots in that run preceded lazy mounting; the matrix's later Profile row rendered correctly. This focused test now waits for the terminal Profile UI. The original matrix report and runner remain preserved, and future matrix runs set a failing exit code when checks fail.

Limits: local compatibility date 2026-08-01, hosted target 2026-08-18. The correction leaves the Worker and own-profile authority loader byte-identical. Actual hosted Profile failure detail and full restoration acceptance remain unverified. No new application ZIP, hosted upload, activation, settings change or administrative database operation is included.
