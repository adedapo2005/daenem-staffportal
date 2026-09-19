# Staff Portal Communications Integration 03 — Closeout Evidence

Run: `STAFFPORTAL-COMMUNICATIONS-INTEGRATION-03-CLOSEOUT`

Repository: `adedapo2005/daenem-staffportal`

Base: `839dc56a0a593fc08cc3f806daa3aa6fb0c0548f`

Review branch: `feature/staffportal-whatsapp-ai-communications-01`

Starting closeout head: `a60615bab223b54c426ef2fcbf222da47c42a6f2`

## Scope and safety

This branch is Staff Portal-only. It does not authorize production activation.

The communications implementation defaults closed:
- communications kill switch on
- WhatsApp disabled
- AI disabled
- live Meta send disabled
- AI is draft/review only
- authentication codes stay outside AI
- internal template approval and provider approval are separate
- automatic leave-draft creation requires an explicit trigger
- Staff Portal communications webhook remains separate from the shared Social Engine webhook
- explicit company guards reject identifiers containing `farm`

No production deployment, remote D1 migration, live WhatsApp send, production-data AI call, Webflow change, Sites change, or merge was performed during this run.

## Implemented

- migrations 0060–0063 for policy, contacts, consent, drafts, approvals, outbox, webhook inbox, authentication challenges, dispatch metadata and governance
- WhatsApp signup phone verification without conflating phone proof with email proof
- optional post-password WhatsApp sign-in step-up for enrolled verified contacts
- privacy-safe WhatsApp password-recovery verification
- backend AI-assisted HR draft generation with allowlisted placeholders and human review
- onboarding reminder draft path
- neutral leave-decision availability draft
- neutral incomplete-attendance reminder draft
- independent approval and content-digest invalidation
- queue/outbox path with idempotency key, bounded attempts, expiry and provider ambiguity state
- dispatch-time permission, policy, source-revision, approval, consent, contact, template and sender checks
- dedicated Staff Portal WhatsApp webhook with HMAC verification and durable inbox receipt
- global communication controls and per-use-case policy administration
- role/employee restrictions, template versions, AI instruction versions and trigger governance
- Staff Portal Communications Control frontend

## Intentional partials

- Training-due communications are not connected because an authoritative Staff Portal training record source was not verified in this branch.
- Shift/schedule-change communications are not connected because an authoritative Staff Portal scheduling record source was not verified in this branch.
- The dispatcher is production-shaped but no live provider consumer/release was activated.
- Browser QA is limited unless a safe Staff Portal-only preview is available.
- Meta sender registration, provider template submission/approval, production secrets and production release remain future controlled work.

## Verification performed

### Clean local migrations

A separate local Wrangler persistence directory was created and migrations `0001` through `0063` were replayed from a clean local state.

Result: PASS — all 63 migrations applied locally, including 0060, 0061, 0062 and 0063.

No `--remote` migration command was used.

### Targeted TypeScript

Strict targeted compilation of the communications Worker/runtime/auth/HR paths: PASS.

Targeted compilation of `src/communications-admin-entry.tsx` with frontend auth dependency: PASS.

### Contract tests

`scripts/test-communications-contracts.mjs`: 11/11 PASS.

Coverage includes:
- deny-wins policy
- environment boundary
- AI exclusion from authentication
- placeholder-only AI context
- self-approval denial
- approval invalidation after content edit
- consent recheck
- AI automatic-send denial
- authentication-template provider approval
- secure portal-link restriction
- WhatsApp webhook HMAC verification

### Existing company isolation regression

`npm run check:company-scoped-access`: 21/21 assertions PASS.

### Security diff review

- no secret-like token literals detected in added diff
- no added `console.log`
- no added live-send=true default
- one E.164 literal is the synthetic test number `+15551234567`
- Farms references in this branch are rejection/filter guards only
- `git diff --check` used as closeout gate

## Known repository baseline blockers

Global `npm run typecheck` remains blocked by the pre-existing file:

`src/canonical-postauth-v1/CanonicalDashboard.tsx`

Observed errors include:
- TS1490: file appears to be binary
- parse errors on the same file

Global `npm run build` reaches the existing sign-in configurability precheck and fails because it looks for:

`C:\Users\Daenem Group\Documents\.github\workflows\deploy-staffportal-premium-v1.yml`

outside the repository checkout.

Neither unrelated baseline issue was modified as part of this communications closeout.

## Release state

- Live Meta messages: NO
- Production data sent to AI: NO
- Remote migrations: NO
- Farms resources used or modified: NO
- Webflow modified: NO
- Sites modified: NO
- Merged: NO
- Deployed: NO

The intended next state is Draft PR review only.
