# StaffPortal Restoration Candidate

The historical Finance navigation omitted five existing workflows. This candidate adds company-bound destinations for Receivables, Budgets, Financial Reports, Expense Approvals and Cost Administration. Each requires its exact existing company grant; navigation projection adds only View entries and no server permission. Owner labels and cross-company permission unions do not supply a missing grant. Company-specific links open the named workflow directly inside the approved shell, without a modal/glass backdrop or a portal-entry picker.

Budgets no longer requests Chart of Accounts for a user without that separate grant. Fixed Approvals and Administration destinations do not request own-expense bootstrap, expose other Spend tabs or expose Group Intelligence. Financial Reports discards stale/cancelled results, verifies company/period and safe-integer accounting totals, and does not display fabricated zero balances while a report is unavailable.

The same review candidate retains the earlier nullable Profile-display correction. The compatibility overlay now allows View-only Profile access to reach the existing protected Profile renderer; previously it fell through to a generic table and never requested the own-profile service. A normal synthetic employee's own-profile GET returned 200 and its actual approved Edit personal details control remained disabled.

Apply the previously preserved candidate/ Profile files first, then finance-restoration.patch onto that isolated reconstructed source. The new Finance changes are carried by the patch, not duplicated under candidate/. Before changing a file, verify the recorded preimage SHA-256. Source hashes and the exact eleven patchPaths are in FINANCE-RESTORATION.json. After applying the text patch in an isolated checkout, normalize ONLY those eleven files from CRLF to LF and verify their complete SHA-256 values. Do not normalize the frozen snapshot, Worker or own-profile loader. A disposable Windows reverse/forward roundtrip verified every preimage and all eleven tested after-images with this procedure. It has NOT been copied to main's application root, packaged into a successor application ZIP, uploaded or activated. Keep the original public/assets/role-home/horizon.svg deletion and identical-byte relocation recorded in REVIEW.json. Do not overwrite an existing checkout or apply this onto a source with mismatched preimage hashes.

Validation:
- 41 permission/navigation/report-contract cases passed.
- Current TypeScript, Vite, static restoration, experience lock and Sign-In lock passed.
- All 158 Worker files and all 683 frozen V115 snapshot files remain byte-identical. The own-profile session/employee/authority loader remains SHA-256 ea0ac570e4b430a78cd23545f8926e468f58bc2095c6cebcd4959c40e587bab2.
- Actual unchanged Worker, local D1 and normal synthetic authentication were used. No API response was mocked, no jobs.access was invented, and all data/fixture writes were confined to a disposable local database.
- Finance's nine successful route/viewport cases are retained from the first run. Its six unnecessary bootstrap failures and View-only Profile timeout are preserved. After those actual defects were corrected, all six Spend route/viewport cases passed; that run retained a failing Profile test locator using a label absent from the approved UI.
- The focused Profile rerun proved the actual read and disabled approved control. Its zero-external-attempt assertion remains false because Home attempted one configured staging-origin /api/ess/my-day request from the loopback fixture; the runner aborted it. The original failed report is preserved. No Home-service acceptance is claimed. The composed evidence explicitly records this fixture limit; it does not relabel a failed original run as green.
- Browser verification covers these existing reads and layout containment, not business-write acceptance or a full visual acceptance of all modules. Local compatibility is 2026-08-01 versus hosted 2026-08-18.

The prior 160-route inventory remains the full restoration scope. These five mappings are progress, not total restoration. Do not silently reduce scope to Profile or these Finance destinations, force a recalled module count, invent grants for old prototypes, or release a held feature to fill navigation.

Existing pre-production URL:
https://daenem-staffportal-api-staging.adedapo2005.workers.dev/

Last verified serving version: 47927e3c-827a-4b7a-842c-8bdd6e88883e, deployment b2009248-b0b6-4019-9ae6-812569fde8fb. The rejected company-entry gate belongs to that returned version. No hosted request was made during this integration step. PR 288 stays unmerged and GET-only; never rerun its old one-shot deployment jobs. The old release executor pins the obsolete deployment 678dde9e-e03f-49f1-9dd0-882b2a84c938 and the old ZIP. The prior uploaded/activated/returned candidate and held journals remain preserved.

Next integration work needs no fresh Owner decision: continue source-backed mappings and prepare one exact successor. Before a hosted-write proposal, reconcile the source baseline and all completed upload/activation/return histories and resolve the recorded observability.issues.enabled discrepancy. Existing credentials, all recovery holds and StaffPortal-only scope persist.
