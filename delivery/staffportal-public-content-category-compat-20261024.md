# StaffPortal Pre-Production — Public Employee Inspiration Category Compatibility

## Observed live problem after the Oct 24 Sign-In clock release
- Official Cloudflare Pre-Production `GET /api/staff-content`: **HTTP 503**, even while protected Worker health, OAuth and weather endpoints returned healthy results.
- Approved fixed upstream `https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site/api/staff-content`: **HTTP 200**, valid `spotlight` and `inspiration`, `provider: curated`, `providerConnected: false`, valid interval timestamps.
- Upstream rotated to Owner-curated inspiration `staff-portal-welcome-inspiration` with `id`, `message`, `attribution`, `active`, **but no `category`**. Our public projection previously required a category, so one display-only omission blocked both left-lower widgets.

## Smallest safe correction
- Keep required `id`, `message` and `attribution` with existing strict size/type checks, and retain all existing bounded upstream, fixed-origin, no-credential, no-open-redirect, no-private-field security controls.
- Treat only inspiration `category` as optional; supply the neutral **Employee Inspiration** display label if absent, malformed or too long.
- Preserve legitimate category text if present, Owner-authored IDs/messages, `provider` and `providerConnected` truth. Do not infer any external AI connection, synthesize messages or change the Owner Studio source.
- No frontend CSS, approved V180 page, authentication, post-login ERP, D1, production or scheduler changes.

## Verification and release gates
- Focused public content adapter: **14/14 PASS**, including missing category, nonstring/oversized category, fail-closed missing attribution, field projection security and curated provider truth.
- Exact-source TypeScript/build and CI, protected Cloudflare Pre-Production SHA gate.
- Mandatory post-deploy acceptance: live /api/staff-content HTTP 200 and both approved Owner-curated messages render in Daily Spotlight and Employee Inspiration. Confirm two global weather city APIs and prior Ibadan clock alignment remain intact.
- Production unchanged. No unverified Owner login or external generative AI claims.
