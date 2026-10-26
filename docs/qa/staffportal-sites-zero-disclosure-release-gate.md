# StaffPortal — Legacy Sites Zero Disclosure release gate

**Scope:** DAENEM StaffPortal only. The current protected Owner-approved Sign-In V180, FarmPortal, WebAdmin, Backend A's lease, Cloudflare deployment and task schedules are untouched.

## Why this gate is necessary

The existing `scripts/check-zero-disclosure.mjs` checks internal permissions and Worker source contracts, but does not examine the external legacy ChatGPT Sites `GET /api/assets` endpoint or direct media URLs. That gap allowed internal checks to pass while unpublished artwork remained publicly accessible. This QA addition is a read-only release gate, not a fix for the server-side leak.

Issue: [P0 #207](https://github.com/adedapo2005/daenem-staffportal/issues/207).

## Run fixture tests without network or credentials

```sh
node --test scripts/test-staffportal-sites-zero-disclosure.mjs
```

The 18 synthetic tests cover the expected 50-approved-only public listing, 32 draft/pending disclosures, forbidden internal fields, fail-closed responses, invalid URLs, revoked/disabled states, key set mismatch versus the official Worker, duplicate keys, anonymous direct-image media HTTP 200, redirects/timeouts and HEAD-only concurrency.

## Run external public API audit (read-only, incomplete release gate)

```sh
node scripts/check-staffportal-sites-zero-disclosure-live.mjs --api-only --expected-public 50
```

This never logs raw records, keys, URLs, prompts, creator identities or media bytes. If public API filtering is correct it can print `API_ONLY_PASS_MEDIA_UNVERIFIED`; this **does not** clear the release security hold.

## Run full historical P0 audit with Owner-only local URL inventory

The **Owner-only** list must be a private local JSON file with exactly 24 historical unpublished media URLs:

```json
{ "urls": ["https://REDACTED..."] }
```

Do **not** commit, upload, print, screenshot or attach the actual list. The literal example above is a placeholder only. Its 24 historical URLs correspond to 16 API-listed Site static files, four unlisted Site-hosted byte-identical aliases, and four Base44-hosted files.

```sh
node scripts/check-staffportal-sites-zero-disclosure-live.mjs \
  --expected-public 50 \
  --media-manifest /AUTHORIZED/OWNER-PRIVATE-24-URL-LIST.json \
  --report /AUTHORIZED/QA-REPORT-DIR/sites-zero-disclosure-receipt.json
```

Both live public APIs are accessed by **anonymous HTTPS GET**. Historical unpublished media are tested by **anonymous HEAD only**, without fetching bodies. A media URL returning any HTTP 2xx—including generic `application/octet-stream`—is treated as accessible and **fails**. Only 401/403/404/410 count as denied. Redirects, timeouts and unrecognized responses fail closed. A stale cached-default catalogue, any pending/draft record, internal review field, disabled item, unsafe URL, or mismatch against the approved Worker keys also fails.

All logs and JSON receipts contain only aggregate counts and fixed violation codes. No private media mapping is included in this repository.

**Exit codes:** `0` means the requested checks passed; `1` means verified disclosure/failure; `2` means an incomplete or unverifiable release gate. Running without a media manifest, and without `--api-only`, intentionally exits 2.

## As of October 25, 2026, 8 PM ET

A verified local run using the Owner-only historical 24-URL inventory returned **exit 1**, as it should:

- Legacy Sites: 82 anonymously visible records, 32 unapproved, 82 containing QA status fields.
- Cloudflare StaffPortal public list: 50 records.
- Unpublished direct media paths: 24/24 returned HTTP 200, zero denied.

**This code is a release QA candidate only.** The real remediation remains the guarded public-data publication filter in the **current authenticated Sites source**, authenticated Owner Studio preview backed by private R2, exclusion of all 20 Site-hosted unpublished static paths and revocation of four provider-side public URLs. Restore and recheck all 50 approved V180 assets and responsive Sign-In before considering a release. Production remains unchanged.

## Authority and limits

- This PR must remain **draft** and must **not be merged or deployed** merely because fixture tests pass.
- This script is a **historical URL test**, not a complete discoverer of future aliases. Manual media inventory, current Sites source/code acceptance, private R2 and Owner Studio permission checks, and an authenticated browser audit remain mandatory.
- No new scheduler or recurring workflow. The live gate is manually invoked during release acceptance.
- No passwords, cookies, R2 credentials or private media are required for fixture tests or public API-only checks.