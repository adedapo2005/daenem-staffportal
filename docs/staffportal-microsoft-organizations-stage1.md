# StaffPortal Microsoft organizations sign-in — Stage 1 (reversible)

Scope: **StaffPortal staging only**. Does not authorize production changes, migrations or deployment.

## Purpose and boundaries

Already-authorized StaffPortal employees may connect existing Microsoft **work/school accounts from other organizations** without DAENEM Entra guest invitations. Personal Microsoft accounts are excluded.

A Microsoft login **does not create employees or grant roles**. Identity authorization uses signed (tenant ID, Microsoft object ID), **not** email/UPN/preferred_username. Existing employee approval, company memberships, status and roles remain the authorization source.

## Configuration and rollback

The staging Worker is single-tenant by default. Enable only after migration and checks:

- Existing Worker: `daenem-staffportal-api-staging`
- `APP_STAGE=staging`
- `MICROSOFT_AUTH_MODE=organizations`, explicitly on the staging Worker only

Other values, or non-staging environments, retain existing tenant-specific OAuth. To roll back, set `MICROSOFT_AUTH_MODE=single_tenant` or remove it. Retain history in the identity-link table.

In the **existing Entra application registration** (no new app), select supported account types **Accounts in any organizational directory**. Preserve its client ID, encrypted Secret Value and approved staging callback:
`https://daenem-staffportal-api-staging.adedapo2005.workers.dev/api/auth/oauth/microsoft/callback`

An external organization's administrator may need to grant application consent under its own security policy, but DAENEM need not invite employees into the DAENEM tenant.

## Existing-account linking

1. Employee has a real, authorized StaffPortal account and active company membership.
2. Unlinked Microsoft sign-in fails closed with `microsoft_link_required` (never maps mutable email to employee).
3. The employee chooses **Connect after StaffPortal Sign-In**, signs in with existing StaffPortal credentials, then opens the staged connection page.
4. A **recent (15-minute) StaffPortal session** is required; the link form requires same-origin POST and then explicit Microsoft account selection.
5. PKCE, nonce, signed one-time state, token audience, tenant-bound issuer and signing key issuer are verified. Personal-account and app-only tokens are denied.
6. An immutable identity mapping links provider, tenant ID and object ID to the existing employee. Conflicting or revoked mappings never auto-reassign.
7. Subsequent Microsoft sign-in checks this mapping, live employee status and company membership before creating the normal StaffPortal session. No new roles or permissions are issued.

## Release gates

- Draft PR, isolated source review, locked dependency install, TypeScript and Sign-In contract checks.
- Run `node scripts/test-microsoft-organizations.mjs` and `npm run build`.
- Apply/verify additive `0101_staffportal_external_identity_links.sql` **only on isolated Cloudflare staging D1**, through approved migration controls.
- Configure the existing Entra application for organizational multi-tenancy.
- Obtain owner-approved exact SHA; use the protected staging controller; never deploy to production as a test.
- Verify real linked callback/session, cross-company isolation, denied unlinked/inactive users and Google/password/WhatsApp/Create Account regression.
- Test desktop, tablet, mobile and 4K, and record rollback evidence on Issue #5.

Microsoft references:
https://learn.microsoft.com/en-us/security/zero-trust/develop/identity-supported-account-types
https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
