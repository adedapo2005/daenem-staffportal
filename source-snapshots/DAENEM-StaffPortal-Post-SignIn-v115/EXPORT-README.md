# DAENEM Staff Portal QA / Review — full post-sign-in source export

Source Site: DAENEM Staff Portal QA / Review
Site project: appgprj_6ab43337da788191886fa3d18457bc30
Latest saved Site version reported at export: 115
Source commit: 09bd2051d118242bce095be012a3a763cc1f8a33

This is the full post-sign-in workspace source from the selected Site repository, not a screenshot, HTML scrape, or dashboard-only excerpt. All business workspaces, components, styles, local assets, API adapters, dependency manifest/lockfile, and supporting source notes are included. No changes were made to the hosted Site.

## Excluded Sign-In page

The public Sign-In renderer, authentication/recovery screens and their dedicated renderer files are omitted. Portal.tsx contains a plain session-integration boundary in place of the public Sign-In component. WorldClockCenter imports now reference its original technology.tsx definition directly. These are the only modified application files; the export manifest identifies them.

Owner Studio remains included in full because it is a post-sign-in administration feature. Its sign-in design configuration, reusable preview widgets, theme contracts and referenced assets remain so those administration features have their dependencies. Historical documentation can mention Sign-In; those mentions do not implement a public Sign-In page. Historical browser evidence images are excluded.

## Run and integrate

Use Node.js >=22.13.0 and pnpm 11.19.0. From this directory:

    pnpm install --frozen-lockfile
    pnpm dev

Build with `pnpm build`. Application source is under app/experience; the root and catch-all page routes mount Portal.tsx. Use /home for the dashboard route after establishing a session.

This remains the selected Site's design/review implementation. It includes fixture/demo behavior and adapter boundaries; it is not an export of the separate production backend, Cloudflare runtime secrets or databases. Connect your real authenticated session where the omitted Sign-In component previously called setSession/setSigned. Preserve server-side authorization when integrating.

The original project configuration and hosting identity are retained as reference. This archive does not publish, deploy or change the selected Site. Dependency installation and a full runtime build were not performed for this source-only export; local module dependencies and ZIP integrity were checked.

See EXPORT-MANIFEST.json for the exact source snapshot, omissions, changed files and file checksums. Original source README is retained as README.md.
