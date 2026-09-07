# Staff Portal PR #90 Canonical V3 Checkpoint

Status: IN PROGRESS — GITHUB-PERSISTED, NO PRODUCTION RELEASE

Checkpoint branch: `checkpoint/staffportal-pr90-v3`

Frozen PR recovery base: `d1b74a89916d9b88293c780fc7fc4325fcd32ebc`

Canonical V3 ZIP SHA-256: `74f61b399ef454c5c6bdda1b7c831a6f112ce8821f2be992acaf850b89674811`

## Frozen Design Boundary

- Preserve all ten approved Staff Portal layout identities.
- Do not redesign, replace, or reinterpret the approved concepts.
- Sign-in remains frozen.
- Staff Portal only; no Farm Portal, WebAdmin, or other Daenem application design material.

## V3 Correction Scope

- Repair invalid Insight Magazine named-grid geometry without changing concept identity.
- Protect tablet KPI/value readability.
- Improve 4K vertical utilization using the supplied V3 row minimum contract.
- Eliminate authored canonical text below 9px.
- Apply canonical display-name and UI-label formatting at the authenticated shell boundary.
- Directly load deterministic Inter Variable / Manrope Variable fonts.
- Integrate live data freshness into the designed status surface.
- Expand actual-runtime QA to all ten layouts and required responsive viewports.

## Checkpoint Changes Saved So Far

- Quote-agnostic canonical layout validator.
- `FreshnessStatus.tsx` saved directly in source.
- Canonical index exports `FreshnessStatus`.
- Original V3 payload remains preserved under `staffportal/scripts/pr90-v3-pack/payload/`.

## Release Safety

No checkpoint commit authorizes or performs:

- production branch movement,
- Cloudflare deployment,
- remote D1 migration,
- PR merge,
- production release.

GitHub Actions are intentionally deferred until the complete V3 checkpoint is ready for one acceptance run.
