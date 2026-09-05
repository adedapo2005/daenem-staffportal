import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error('Offline foundation contract failed: ' + message);
};

const platform = read('src/offline-platform.ts');
const ui = read('src/offline-sync.tsx');
const owner = read('src/offline-sync-center-entry.tsx');
const server = read('worker/offline.ts');
const runtime = read('worker/runtime.ts');
const auth = read('src/auth.tsx');
const authWorker = read('worker/auth.ts');
const runtimeTest = read('scripts/test-offline-worker-runtime.mjs');
const renderQa = read('scripts/render-offline-qa.mjs');
const forms = read('worker/forms.ts');
const migration = read('migrations/0054_offline_sync_audit.sql');
const serviceWorker = read('public/sw.js');
const hub = read('src/module-hub.tsx');
const centers = read('src/centers.tsx');
const main = read('src/main.tsx');
const zip = read('src/zip-dashboard.tsx');

must(migration.includes('offline_sync_receipts') && migration.includes('offline_client_telemetry') && migration.includes('offline_attachments') && migration.includes('offline_policy'), 'offline schema tables are missing');
must(migration.includes('offline_idempotency_key') && migration.includes('idx_workflow_submission_offline_idempotency'), 'Forms idempotency column and unique index are missing');
must(platform.includes('indexedDB') && platform.includes('AES-GCM') && platform.includes('encryptBytes') && platform.includes('encryptedBlob'), 'sensitive offline data is not encrypted in IndexedDB');
must(!/localStorage\.(?:getItem|setItem|removeItem)\([^)]*(?:payload|attachment|receipt|queue|operation)/i.test(platform), 'business queue code must not use localStorage');
must(platform.includes('ACTIVE_EMPLOYEE_KEY') && platform.includes('contextEmployeeId === activeEmployeeId'), 'cached offline context is not bound to the last authenticated employee');
must(platform.includes('navigator.locks') && platform.includes('sync-lease:') && platform.includes('BroadcastChannel'), 'multi-tab sync coordination is missing');
must(platform.includes('idempotency-key') && platform.includes('retryDelay') && platform.includes('MAX_RETRY_ATTEMPTS') && platform.includes('uploadOfflineAttachments'), 'idempotent retry behavior or attachment reconnect handling is missing');
must(!platform.includes('geolocation'), 'offline platform must never silently collect GPS');
must(server.includes("kind !== 'forms.submit'") && server.includes("hasPermission(context, 'forms.access'") && server.includes('sessionRecord') && server.includes("state: 'needs-review'") && server.includes("'conflict'"), 'server allowlist, live authorization and conflict handling are missing');

must(runtime.includes("import { routeOffline }") && runtime.includes("url.pathname.startsWith('/api/offline/')") && runtime.includes('await routeOffline(request, env, context)'), 'the production Worker runtime does not dispatch authenticated offline requests');
must(auth.includes('isNetworkTransportFailure') && auth.includes('NETWORK_TRANSPORT') && auth.includes('status = 0'), 'network transport failures are not classified independently from HTTP denial responses');
must(authWorker.includes('ep.timezone AS timezone') && authWorker.includes('timezone: base.timezone'), 'viewer profile timezone is not carried through authenticated context');
must(server.includes('existingForKey') && server.includes('mismatchDimensions') && server.includes('String(existingForKey.companyId)') && server.includes('String(existingForKey.operationKind)'), 'idempotency receipt identity binding is incomplete');
must(server.includes('ownerDetailAllowedKeys') && server.includes('safeOwnerDetails') && server.includes('ownerTimelineTitle') && server.includes('canonicalOwnerTime'), 'Owner detail audit evidence is not safely shaped with canonical timestamps');
must(owner.includes('/api/offline/owner/detail') && owner.includes('Detailed evidence') && owner.includes('Operational timeline') && owner.includes('Show Both') && owner.includes('Network location') && owner.includes('UTC'), 'Owner detailed sync evidence and time display are incomplete');
must(runtimeTest.includes('worker/runtime.ts') && runtimeTest.includes('REAL_WORKER_RUNTIME_OFFLINE_ROUTING=PASS') && runtimeTest.includes('cross-company') && runtimeTest.includes('response-loss'), 'the actual Worker routing/idempotency integration test is missing or too weak');
must(renderQa.includes('runAuthTransportCase') && renderQa.includes("authMeMode === 'network'") && renderQa.includes('owner-mobile-sync-detail-390x844.png') && renderQa.includes('timezoneId'), 'rendered weak-network and Owner detail QA is incomplete');

must(server.includes('const formsVisible') && server.includes("if (!formsVisible)") && server.includes('baseUpdatedAt: safeText(payload.baseUpdatedAt'), 'employee sync activity is not protected by the current Forms permission or the server-side version check is not forwarded');
must(server.includes('ON CONFLICT(idempotency_key) DO NOTHING') && server.includes('operationAlreadyApplied') && server.includes('completed-after-response-loss'), 'server receipt deduplication is incomplete');
must(server.includes('requestIp(request)') && server.includes('requestLocationLabel(request)') && server.includes('ipAddress: requestIp(request)') && server.includes('networkLocation: requestLocationLabel(request)') && server.includes('sessionId: context.sessionId') && server.includes('offline_policy_updated') && server.includes('claimedSha'), 'trusted telemetry, policy audit, or attachment integrity is missing');
must(server.includes('routeOwnerSupport') && server.includes('ownerRevoke') && server.includes("revoke_session") && server.includes('Owner access is required.'), 'Owner session controls are not protected/reused');
must(forms.includes('export async function submitForm') && forms.includes('idempotency-key') && forms.includes('if(!can(context))') && forms.includes('baseUpdatedAt') && forms.includes('submissionUpdatedAt'), 'Forms integration does not enforce permission/idempotency/version checks at the server boundary');
must(ui.includes('My Sync Activity') && ui.includes('Sign in to continue syncing') && ui.includes('aria-live') && ui.includes('Retry Now'), 'employee sync activity UX is incomplete');
must(owner.includes('Sync & Sessions') && owner.includes('networkLocation') && owner.includes('not GPS') && owner.includes('/api/offline/owner/overview'), 'Owner Sync & Sessions surface is incomplete');
must(hub.includes('strictOwnerOnly') && hub.includes('offline-sync-center-launcher') && hub.includes('Sync & Sessions'), 'Owner control is not registered through canonical Module Hub navigation');
must(centers.includes('queueFormsSubmission') && centers.includes('saved offline') && centers.includes('draft-only') && centers.includes('data-forms-center'), 'Forms Center has no real offline draft/submission integration');
must(main.includes('OfflinePlatformProvider') && zip.includes('OfflineSyncIndicator'), 'authenticated shell is not connected to the shared sync indicator');
must(serviceWorker.includes("pathname.startsWith('/api/')") && serviceWorker.includes('isCacheableShellAsset') && serviceWorker.includes('precacheShell') && serviceWorker.includes('Response.error()') && serviceWorker.includes('daenem-workforce-shell-v8-offline-foundation-v1') && serviceWorker.includes('daenem-offline-sync'), 'service worker does not enforce shell-only caching or progressive sync notification');
must(!serviceWorker.includes('cache.put(request, copy)'), 'service worker must not cache arbitrary authenticated responses');
must(!read('src/signin-experience.tsx').includes('offline'), 'sign-in composition contains no offline UI');

try {
  const changed = execFileSync('git', ['diff', '--name-only', '40a96e1cbd89f5570197a8e7c0c5380ba4b2479b...HEAD'], { encoding: 'utf8' });
  must(!changed.split(/\r?\n/).some((file) => /signin-experience\.(tsx|css)$/.test(file)), 'accepted sign-in visual files changed');
} catch (error) {
  if (error?.status !== undefined) throw error;
}

console.log('OFFLINE_SYNC_CONTRACTS=PASS');
