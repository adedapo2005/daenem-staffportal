# StaffPortal Pre-Production Governance

**Official environment:** Cloudflare Staging is the StaffPortal **Pre-Production** environment.

**Official source branch:** `preproduction/staffportal`

**Cloudflare endpoint:** `https://daenem-staffportal-api-staging.adedapo2005.workers.dev/`

The existing Cloudflare Worker name, Wrangler staging config, environment variable names, and URL retain the word `staging` as technical identifiers so credentials, bindings, D1 resources, and operational integrations are not broken. In owner/reviewer-facing terminology, this environment is **Pre-Production**.

## Required release flow

1. Completed work must not remain only on the Daenem_Group laptop.
2. Every completed feature, fix, workflow, UI enhancement, database migration, API integration, or infrastructure change must be committed and pushed to GitHub.
3. A change is eligible for Pre-Production only after its focused verification passes and it is integrated into `preproduction/staffportal`.
4. A push to `preproduction/staffportal` automatically starts the GitHub **StaffPortal Pre-Production Deploy** workflow.
5. The workflow verifies that the candidate is still the current branch head, runs release contracts and production-safety gates, builds the portal, deploys the Cloudflare Worker, checks health/runtime contracts, and performs versioned asset-integrity verification.
6. If any pre-deployment verification fails, Cloudflare is not changed and the last healthy Pre-Production deployment remains available.
7. If a feature is incomplete, it must remain on an isolated branch/worktree, behind an approved feature flag, or hidden from users. Incomplete work must not be merged into the Pre-Production branch.
8. Production remains separately gated and requires explicit production authorization.

## Pre-Production quality standard

Pre-Production is production-like and must remain continuously:

- operational;
- deployable;
- review-ready;
- permission-correct;
- database/migration compatible;
- integration-capable;
- responsive and accessible;
- free from known P0/P1 regressions.

Synthetic fixtures may support focused UI validation, but they do not replace real authenticated, provider, Worker/D1, migration, and integration acceptance where those are release requirements.

## Branch and writer discipline

- One official Pre-Production integration branch: `preproduction/staffportal`.
- Isolated writer lanes may develop in separate branches/worktrees.
- No duplicate writers on the same worktree.
- No `git reset`, `git clean`, force push, or production deployment as part of normal lane work.
- Completed lane work is committed/pushed and reviewed before integration.
- One consolidated release gate is preferred after a batch of focused lane checks to avoid redundant QA.

## Terminology

Owner/reviewer-facing labels must use **Pre-Production** rather than **Development** for the official release-candidate environment.

Historical documents, third-party license text, code identifiers whose semantics genuinely mean software-development mode, and technical resource names may retain `development` or `staging` where renaming would alter behavior or break compatibility.
