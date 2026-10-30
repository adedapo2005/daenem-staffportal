# DAENEM Staff Portal Autonomous Delivery Controller

This file is the durable operating contract for autonomous Staff Portal delivery.

## Mission

Recover latest durable state, choose the highest-priority incomplete requirement, implement it, test it, run reviewer gates, fix failures, record evidence, and continue.

## Authority

- Sites is retained frontend/UI/UX authority.
- GitHub/Worker/D1 is backend/API/data/auth/RBAC/security authority.
- Legacy post-sign-in UI is not visual authority.
- DAENEM Farms is excluded.

## Absolute rules

- Zero disclosure: no permission means no menu, route, data, count, search, AI, notification, favorite, recent item, breadcrumb, widget, or API disclosure.
- Human-visible time uses 12-hour format with AM/PM.
- Green is semantic-only for success/healthy/connected/completed/valid.
- Reduced Motion removes non-essential continuous motion.
- Do not fabricate provider state, business data, AI results, or permissions.
- Do not publish/deploy production, run production migrations, merge PR #2, or activate live Meta/WhatsApp without explicit Owner approval.
## Execution loop

1. Read delivery/current-state.json and delivery/requirements-index.json.
2. Verify repo path, branch, local HEAD, remote HEAD, git status, PR state.
3. Do not modify unexpected local or remote work.
4. Select the highest-priority incomplete unblocked requirement.
5. Make the smallest coherent implementation.
6. Run targeted typecheck/lint/contracts for changed scope.
7. Run security/zero-disclosure regression relevant to the change.
8. Run build/global checks when the change reaches an integration boundary.
9. If a gate fails because of the change, fix it before proceeding.
10. If a gate fails for a proven unrelated baseline defect, record it separately and do not claim PASS.
11. Commit and push only to the authorized Staff Portal feature branch unless a later bounded run explicitly names another branch.
12. Update current-state and requirement status/evidence.
13. Continue to the next unblocked requirement.

## Reviewer severity

- P0: security, privacy, data loss, cross-project contamination.
- P1: release-blocking correctness, auth, permission, build, migration, runtime defects.
- P2: requested feature incomplete or materially incorrect.
- P3: polish only.

Autonomous implementation must clear P0/P1/P2 before marking a requirement complete.
## Manual approval gates

Stop and request Owner approval only for:

- production deployment or public-pointer change
- production D1 migration
- destructive production data operation
- real Meta/WhatsApp activation or real message sending
- new/rotated production credentials
- main merge / PR merge when not already explicitly authorized
- irreversible external action

Everything else should continue without asking for copy/paste handoffs.

## Concurrency safety on Daenem_Group

- Work only in C:\Users\Daenem Group\Documents\daenem-staffportal.
- Never kill or reuse unknown processes from another project.
- Use project-specific temp paths and ports.
- Never change machine-wide git/npm/Wrangler settings.
- If local or remote HEAD changes unexpectedly, stop writes and re-verify.
- Preserve unrelated untracked acceptance artifacts unless proven disposable.

## Idle-prevention and autonomous continuation

- A successful commit, CI pass, Sites version, Reviewer pass, or milestone is a checkpoint, not the end of the task.
- After every checkpoint, immediately reread the cumulative requirement register and start the next safe unfinished requirement without waiting for Owner input.
- If one workstream is blocked, record the blocker and continue another safe unfinished workstream when available.
- If Sites is required for frontend work, explicitly invoke/recover Sites before declaring it unavailable.
- Do not treat a quiet terminal or completed test process as project completion while safe non-production backlog remains.
- Stop only at a genuine Owner approval gate, a required authentication/credential gate, or when no safe unfinished non-production requirement remains.
- Persist enough state after each bounded change for another Work room to recover and continue without manual prompt relay.

## Recovery rule

Chat history is not authority. Durable Sites/GitHub/runtime evidence wins.
