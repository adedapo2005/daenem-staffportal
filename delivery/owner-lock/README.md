# DAENEM StaffPortal — Owner Lock: Sign-In (24 October 2026)

**Owner directive:** Approved Sign-In is frozen indefinitely. Only a NEW, explicit Owner prompt may authorize any source, design, layout, animation, authentication UI, image, Global Operations, weather, Nigeria content widget, Ibadan clock, Create Account, Forgot Password or public widget change.

**Scope:** Public Sign-In ONLY. Post-login StaffPortal, FarmPortal and WebAdmin are separate workstreams. Do not pause, reset, clean, force-push, merge or redeploy other writers. The approved protected V115 post-login system is unaffected.

## Recovery anchors

- **Private GitHub release:** https://github.com/adedapo2005/daenem-staffportal/releases/tag/staffportal-signin-locked-2026-10-24
- **Protected Git tag:** `staffportal-signin-locked-2026-10-24`
- **Pinned SHA:** `d7907f0102e7bcf79f90a60bdc5fdc542975dd04`
- **Local redundant backups:** `C:\Users\Daenem Group\Documents\Daenem\Backups\StaffPortal\SignIn\2026-10-24-OWNER-LOCK`
- **Focused ZIP:** 197 tracked recovery files and a safe manual restore-preparation script.
- **Full source ZIP:** complete 2,079-tracked-file repo snapshot from exact tag; kept locally, and GitHub supplies an automatic full-source download for the release.
- **Frozen manifest:** `delivery/owner-lock/staffportal-signin-2026-10-24.manifest.json` hashes 128 approved Sign-In-specific files including public hero/weather/widget images.

The tag is protected by a scoped GitHub tag ruleset preventing deletion or retargeting. The repository remains private. The release ZIP has a documented SHA-256 digest, and exact file hashes are included in the manifest.

## Enforcement

1. `scripts/check-owner-signin-lock.mjs` compares all protected files and the complete tracked locked-file set against the Owner-approved SHA-256 manifest, and fails closed on additions, deletions or modifications.
2. GitHub `Staff Portal CI` runs the guard on every PR **targeting `preproduction/staffportal`**. Independent post-login PRs with no Sign-In changes continue to pass.
3. The existing protected `StaffPortal Pre-Production Deploy` runs the guard before any install, build or Cloudflare publish for the exact candidate SHA. The **schedule, triggers, release authority, environment and production gates are unchanged**.
4. `.github/CODEOWNERS` records `@adedapo2005` as the Sign-In owner for additional review visibility; the mandatory technical gate is the independent CI/deploy manifest check, not CODEOWNERS alone.
5. **There is no automatic expiry or bypass flag.** For an Owner-authorized Sign-In change, review an isolated candidate and explicitly approve a replacement baseline manifest and checker as part of the same audited PR. After live acceptance, publish a NEW pinned recovery release; never overwrite this one.

## Shared backend boundaries

`worker/index.ts`, `worker/entry.ts`, `src/main.tsx` and shared global styles also serve authenticated modules. Their entire files cannot be frozen without blocking legitimate post-login work. These shared integration files are backed up; when they change, the existing authentication/Weather/public-widget/Owner Studio and post-login browser regression checks still apply. The lock on 128 owned Sign-In files remains hard enforced.

## Restoration and data limitations

With **explicit new Owner approval**, download the private recovery ZIP and read `README_RESTORE.md`. The bundled PowerShell tool does nothing by default; it creates a new isolated candidate only with both `-PrepareRecovery` and `-ApprovedByOwner`, never modifies a live release or other agent's worktree, and never deploys automatically.

Cloudflare secret values, OAuth credentials, D1/employee records, private Owner Studio backend settings, upstream Sites configuration and dynamic news/weather/provider data are deliberately **excluded**. Restore those securely from their actual systems if ever required. The exact approved source, visual assets, public configuration and complete version-pinned repository are preserved here.
