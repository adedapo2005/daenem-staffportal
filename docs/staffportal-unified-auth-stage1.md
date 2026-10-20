# StaffPortal Unified Authentication — Stage 1 additive alignment

## Exact baseline and authority

- Project: **StaffPortal only**. No FarmPortal Stage 21 or WebAdmin source is used.
- Authoritative Cloudflare staging: `https://daenem-staffportal-api-staging.adedapo2005.workers.dev/`.
- Existing staging-source checkpoint: `2a9b93a5f89a624c7ae10983fbfbe8b33ec55810` (not mutated by this change).
- Baseline for this work: combined StaffPortal PR #43 at `62159f5bcf1c1387f8a6f657975a79df1ba25eb0`. Work is carried out on that existing isolated PR branch, **no additional writer**.
- Approved V180 four information widgets, six Global Operations locations, weather, Brand hero, 4K compositions, Owner Studio, layout density and post-login workspace are **not redesigned**. CSS has not been changed for this stage.
- Policy source: owner-approved October 19 unified authentication directive; follow StaffPortal-specific rules only.

## Implemented additions

1. **Company-free public Forgot Password.** The frontend asks for an email or username, then email or WhatsApp delivery preference. There is no company chooser and no public company directory request. Both backend channels resolve a single canonical active/provisional StaffPortal employee internally through existing credentials and active non-FarmPortal memberships; disabled/inactive companies and revoked memberships are ineligible. When an identifier ambiguously matches two employee records, it **fails closed**. Each eligible company's existing scoped recovery settings are honored. Unknown/ambiguous/disallowed identities receive generic non-disclosing responses; legacy company-scoped API callers retain the existing policy rules.
2. **Approved password-policy alignment.** The UI now respects the backend's six-character minimum if the live policy endpoint advertises six (existing migration `0049_password_policy_min6.sql`). No server password hashing, policy or account secret is bypassed. Additional composition requirements remain server-enforced if configured.
3. **New provider account recognition.** If Google/Microsoft authentication succeeds but the account lacks StaffPortal authorization, the return screen offers **Create or complete your account**. This opens the existing verified progressive employee registration flow; it never manufactures sessions, links by email, grants employee roles, or approves an account.
4. **Numeric six-digit OTP input.** Progressive Create Account and recovery code fields use numeric mobile input and enforce six entered characters. Paste and browser one-time-code autofill remain supported. Server remains authoritative for expiry, replay protection, resend and attempt limits; no success message occurs before verified API response.
5. **CI regression gates.** `test-identity-only-recovery.mjs` uses SQLite and real source-loaded company-resolution logic to assert revoked memberships, inactive companies, duplicates, cross-portal isolation and per-company email/WhatsApp authorization. `test-unified-auth-browser.cjs` tests email and WhatsApp forgot flows, no company field, six-character policy acceptance, provider-not-authorized onboarding, desktop/tablet/mobile/4K and screenshot evidence; existing V180 layout browser QA remains active.

## Feature preservation and known gaps

| Area | Status |
|---|---|
| Username/email and password | Existing backend and session unchanged; six-character UI policy aligned |
| Create Account → email OTP → provisional employee | Existing StaffPortal verified flow preserved; no roles granted automatically |
| Google | Existing OAuth provider preserved, but the current callback still matches verified Google email directly to a StaffPortal employee rather than requiring an explicit immutable-provider identity link. **This conflicts with the new directive and must be remediated before final unified-auth acceptance.** Actual live provider session still requires staging verification |
| Microsoft external work/school | PR #42 source and security tests preserved in combined branch; **not staged** until Entra, isolated D1 migrations and protected release gates |
| WhatsApp Sign-In | Existing password-plus-WhatsApp step-up remains functional. **Not equivalent to passwordless WhatsApp-first**; must not be labeled as such until authorized backend and provider QA exists |
| Forgot Password | Company-free UI/email/WhatsApp routing implemented and source/browser tested; genuine delivery needs staging QA |
| Canonical session / roles / company access | No new DB, provider or cross-portal SSO introduced; existing authorization rules retained |
| Security notifications | Requirements inventoried, but delivery hooks/mandatory notifications are **not falsely claimed as completed** |
| Pending account approval | Existing HR/Owner invitation/approval rules retained; live pending-state UI enhancement remains for subsequent review |
| 4K V180 images and premium shell | Unchanged; approved imagery retained |

## Release, verification and rollback

- Tests: typecheck, existing Sign-In/browser gates, identity-only recovery SQLite, password reset/WhatsApp/sign-up regressions, security suite, and build must pass for the exact commit.
- Browser screenshot evidence: CI artifact `staffportal-unified-auth-screenstates` at 390x844, 430x932, 820x1180, 1366x768, 1920x1080 and 3840x2160.
- Real staging verification requires authorized employee test accounts and actual non-production Email, WhatsApp, Google, Microsoft configurations and receipt status. Mock browser API responses **do not** constitute delivered messages or authenticated sessions.
- PR #43 only. Protected staging merge and exact SHA Owner release approval in Issue #5 remain enforced. Remote Cloudflare D1 availability/migration checkpoint and Entra organizational account types must be confirmed before Microsoft activation.
- Roll back by reverting only this isolated commit if any regression arises. Do not clean/reset active Git checkouts or change production.
