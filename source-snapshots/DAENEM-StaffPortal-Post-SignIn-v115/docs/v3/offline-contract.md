# Offline contract

The lab represents Offline, Stale, Sync Conflict and unavailable-provider states. Local records/preferences/drafts may persist in browser storage, with storage-unavailable warnings. This is not a durable production synchronization engine.

Required integration semantics: reauthorize each queued command at replay; carry an operation ID and expected revision; preserve event time separately from receipt time; reject forbidden or expired actions; surface conflicts with original and current values; deduplicate accepted work; never display a pending attendance event as accepted Present.

PWA installation depends on browser support. Native background GPS, push delivery, robust install/offline behavior and operating-system certification are not implemented or proven. PRODUCTION CONTRACT TO BE MAPPED DURING INTEGRATION.
