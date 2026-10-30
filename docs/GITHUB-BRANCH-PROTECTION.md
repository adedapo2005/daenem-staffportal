# GitHub main branch protection

Status: `GITHUB_BRANCH_PROTECTION_CONFIGURATION_REQUIRED`.

The connected GitHub capability could read repository metadata and refs, but
the branch-protection endpoint was not accessible for independent verification
and no branch-protection write was attempted. Do not treat this document as
proof that the rules are active.

## Desired rules for `main`

- deny force pushes;
- deny branch deletion;
- require pull-request review where practical;
- require the Staff Portal CI workflow to pass before merge;
- keep production Pages and API deployment in separate protected environments;
- do not allow ordinary commits to deploy or apply database migrations.

An Owner/admin must apply and verify these rules through an authorized
repository-administration path before relying on them for production safety.
