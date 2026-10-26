// DAENEM StaffPortal external publication release gate.
// Read-only security assertions: never print or persist asset keys, private URLs,
// prompts, author IDs, image content, credentials, or unpublished record bodies.
// Separate from the protected Owner-approved Sign-In implementation.
export const LEGACY_ORIGIN = 'https://daenem-staffportal-sites-migration-v1.daenem-group-9873.chatgpt.site';
export const OFFICIAL_ORIGIN = 'https://daenem-staffportal-api-staging.adedapo2005.workers.dev';
const TRUSTED_IMAGE_HOSTS = new Set([
  new URL(LEGACY_ORIGIN).hostname,
  new URL(OFFICIAL_ORIGIN).hostname,
  'media.base44.com',
]);
const PUBLIC_FIELDS = new Set([
  'asset_key', 'image_url', 'default_image_url', 'display_enabled',
  'category', 'purpose', 'id', 'label', 'phase', 'sort_order', 'fit_mode',
  'is_virtual', 'zoom', 'focal_x', 'focal_y', 'opacity', 'overlay_strength',
  'blur', 'master_width', 'master_height', 'width', 'height',
]);
const STATUSES = new Set(['approved', 'approved_v179']);
const has = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const finite = n => Number.isSafeInteger(n) && n >= 1 && n <= 500;
const KEY = /^[a-z0-9][a-z0-9._-]{0,120}$/i;
const safeCount = (items, test) => items.filter(test).length;

// A known public-field name is not a safe publication contract by itself:
// hidden/private objects must never be smuggled inside visual metadata.
const TEXT_LIMITS = {id:255, category:80, purpose:180, label:150, phase:16, fit_mode:16};
const NUMBER_BOUNDS = {
  zoom:[1,2], focal_x:[0,1], focal_y:[0,1],
  opacity:[0,1], overlay_strength:[0,1], blur:[0,16],
  sort_order:[0,10000], master_width:[0,100000], master_height:[0,100000],
  width:[0,100000], height:[0,100000],
};
const INTEGER_VISUAL_FIELDS = new Set(['sort_order','master_width','master_height','width','height']);
const PHASES = new Set(['day','dawn','dusk','night']);
const FIT_MODES = new Set(['cover','contain','fill']);
function invalidPublicVisualShape(row) {
  for(const [field, max] of Object.entries(TEXT_LIMITS)) {
    if(!has(row,field))continue;
    const value=row[field];
    if(typeof value!=='string'||value.length>max)return true;
    if(field==='phase'&&!PHASES.has(value))return true;
    if(field==='fit_mode'&&!FIT_MODES.has(value))return true;
  }
  if(has(row,'is_virtual')&&typeof row.is_virtual!=='boolean')return true;
  for(const [field,[min,max]] of Object.entries(NUMBER_BOUNDS)) {
    if(!has(row,field))continue;
    const value=row[field];
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max
       ||(INTEGER_VISUAL_FIELDS.has(field)&&!Number.isSafeInteger(value)))return true;
  }
  return false;
}
function unexpectedEnvelopeFields(payload) {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return 0;
  return Object.keys(payload).filter(key=>key!=='assets').length;
}

export function safeImageURL(input, base = LEGACY_ORIGIN) {
  if (typeof input !== 'string' || input.length > 1500 || !input.trim()
      || input.trim() !== input || /[\u0000-\u001f\u007f\\]/.test(input)) return null;
  const decoded = (() => { try { return decodeURIComponent(input); } catch { return null; } })();
  if (decoded === null || /[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
  if (decoded.startsWith('//') || decoded.split('/').some(x => x === '..' || x === '.')) return null;
  let url;
  try {
    if (input.startsWith('/')) {
      if (!input.startsWith('/assets/') && !input.startsWith('/api/assets/images/')) return null;
      url = new URL(input, base);
    } else url = new URL(input);
  } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash || url.port || !TRUSTED_IMAGE_HOSTS.has(url.hostname)) return null;
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  if (/[\u0000-\u001f\u007f\\]/.test(path) || path.includes('//')
      || path.split('/').some(x => x === '..' || x === '.')) return null;
  const isLegacy = url.hostname === new URL(LEGACY_ORIGIN).hostname;
  const isOfficial = url.hostname === new URL(OFFICIAL_ORIGIN).hostname;
  const allowed = isLegacy
    ? /^\/assets\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)$/i.test(path)
    : isOfficial
      ? /^\/(?:assets\/[A-Za-z0-9._/-]+\.(png|jpe?g|webp)|api\/assets\/images\/[A-Za-z0-9._/-]+)$/i.test(path)
      : /^\/images\/public\/[a-f0-9]{24}\/[A-Za-z0-9._~/-]+\.(png|jpe?g|webp)$/i.test(path);
  return allowed ? url.href : null;
}
function recordKeyValid(row) {
  return typeof row.asset_key === 'string' && KEY.test(row.asset_key)
    && !row.asset_key.includes('..');
}
function duplicates(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row && typeof row === 'object' ? row.asset_key : null;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter(n => n > 1).reduce((n, c) => n + c, 0);
}
function failFinding(code, count, violations) {
  if (count > 0) violations.push({ code, count }); // fixed labels only
}
function validPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray(payload.assets) || payload.assets.length > 500) return false;
  return payload.assets.every(row => row && typeof row === 'object' && !Array.isArray(row));
}
export function evaluatePublication(legacy, official, options = {}) {
  const expected = options.expected ?? 50;
  if (!finite(expected)) throw new TypeError('Expected public count must be between 1 and 500');
  const violations = [];
  const legacyValid = validPayload(legacy), officialValid = validPayload(official);
  if (!legacyValid) violations.push({code: 'LEGACY_RESPONSE_INVALID', count: 1});
  if (!officialValid) violations.push({code: 'OFFICIAL_RESPONSE_INVALID', count: 1});
  const raw = legacyValid ? legacy.assets : [];
  const worker = officialValid ? official.assets : [];
  const unapproved = safeCount(raw, row =>
    has(row, 'qa_status') && !STATUSES.has(row.qa_status));
  const statusesExposed = safeCount(raw, row => has(row, 'qa_status'));
  const disabled = safeCount(raw, row => row.display_enabled !== true);
  const privateFields = safeCount(raw, row =>
    Object.keys(row).some(field => !PUBLIC_FIELDS.has(field)));
  const invalidKeys = safeCount(raw, row => !recordKeyValid(row));
  const invalidImages = safeCount(raw, row => !safeImageURL(row.image_url, LEGACY_ORIGIN)
    || (row.default_image_url && !safeImageURL(row.default_image_url, LEGACY_ORIGIN)));
  const workerInvalid = safeCount(worker, row => !recordKeyValid(row)
    || row.display_enabled !== true || !safeImageURL(row.image_url, OFFICIAL_ORIGIN));
  const workerPrivateFields = safeCount(worker, row => Object.keys(row).some(field => !PUBLIC_FIELDS.has(field)));
  const legacyDuplicates = duplicates(raw);
  const workerDuplicates = duplicates(worker);
  const publicWorkerSet = new Set(worker.filter(recordKeyValid).map(x => x.asset_key));
  const publicLegacySet = new Set(raw.filter(recordKeyValid).map(x => x.asset_key));
  const missing = [...publicWorkerSet].filter(x => !publicLegacySet.has(x)).length;
  const unexpected = [...publicLegacySet].filter(x => !publicWorkerSet.has(x)).length;
  // Matching key counts do not prove the same approved artwork is delivered.
  // Reject silently swapped primary or fallback media until an explicitly
  // reviewed same-origin/private-proxy migration updates this contract.
  const workerByKey = new Map(worker.filter(recordKeyValid).map(row => [row.asset_key, row]));
  const matching = raw.filter(row => recordKeyValid(row) && workerByKey.has(row.asset_key));
  const sourceMismatches = safeCount(matching, row =>
    safeImageURL(row.image_url, LEGACY_ORIGIN)
    !== safeImageURL(workerByKey.get(row.asset_key).image_url, OFFICIAL_ORIGIN));
  const fallbackSource = row => row.default_image_url || row.image_url;
  const fallbackMismatches = safeCount(matching, row =>
    safeImageURL(fallbackSource(row), LEGACY_ORIGIN)
    !== safeImageURL(fallbackSource(workerByKey.get(row.asset_key)), OFFICIAL_ORIGIN));
  const fallback = legacy?.state === 'cached_default' ? 1 : 0;
  const invalidLegacyVisual = safeCount(raw, invalidPublicVisualShape);
  const invalidOfficialVisual = safeCount(worker, invalidPublicVisualShape);

  failFinding('LEGACY_UNEXPECTED_ENVELOPE_FIELDS', unexpectedEnvelopeFields(legacy), violations);
  failFinding('OFFICIAL_UNEXPECTED_ENVELOPE_FIELDS', unexpectedEnvelopeFields(official), violations);
  failFinding('INVALID_LEGACY_VISUAL_FIELD_VALUES', invalidLegacyVisual, violations);
  failFinding('INVALID_OFFICIAL_VISUAL_FIELD_VALUES', invalidOfficialVisual, violations);
  failFinding('LEGACY_COUNT_MISMATCH', Math.abs(raw.length - expected), violations);
  failFinding('OFFICIAL_COUNT_MISMATCH', Math.abs(worker.length - expected), violations);
  failFinding('UNAPPROVED_EXPOSED', unapproved, violations);
  failFinding('QA_STATUSES_EXPOSED', statusesExposed, violations);
  failFinding('DISABLED_EXPOSED', disabled, violations);
  failFinding('PRIVATE_OR_UNKNOWN_FIELDS_EXPOSED', privateFields, violations);
  failFinding('INVALID_PUBLIC_KEYS', invalidKeys, violations);
  failFinding('INVALID_PUBLIC_IMAGE_URLS', invalidImages, violations);
  failFinding('INVALID_OFFICIAL_ASSETS', workerInvalid, violations);
  failFinding('INVALID_OFFICIAL_FIELDS', workerPrivateFields, violations);
  failFinding('DUPLICATE_LEGACY_KEYS', legacyDuplicates, violations);
  failFinding('DUPLICATE_OFFICIAL_KEYS', workerDuplicates, violations);
  failFinding('MISSING_APPROVED_PUBLIC_KEYS', missing, violations);
  failFinding('EXTRA_PUBLIC_KEYS', unexpected, violations);
  failFinding('APPROVED_IMAGE_SOURCE_MISMATCH', sourceMismatches, violations);
  failFinding('APPROVED_FALLBACK_IMAGE_MISMATCH', fallbackMismatches, violations);
  failFinding('UNVERIFIED_STALE_FALLBACK', fallback, violations);

  return Object.freeze({
    status: violations.length ? 'FAIL' : 'PASS',
    expectedPublicCount: expected,
    legacyRecords: raw.length,
    officialRecords: worker.length,
    unapprovedRecords: unapproved,
    statusMetadataRows: statusesExposed,
    unpublishedMediaLeakChecks: 'NOT_COVERED_BY_JSON_ONLY',
    violations,
  });
}

export function validatePrivateMediaList(urls, {approvedURLs = []} = {}) {
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > 100)
    throw new TypeError('The Owner-only media audit requires 1–100 URLs');
  const approved = new Set(approvedURLs.map(u => safeImageURL(u, LEGACY_ORIGIN)).filter(Boolean));
  const seen = new Set(), normalized = [];
  for (const item of urls) {
    const url = safeImageURL(item, LEGACY_ORIGIN);
    if (!url || approved.has(url) || seen.has(url))
      throw new TypeError('Untrusted, approved, or duplicate owner-private media input');
    seen.add(url); normalized.push(url);
  }
  return normalized;
}

// A HEAD-only 403/404 is NOT proof that GET denies the same media.
// On a HEAD denial, verify status with a one-byte-range GET adapter too.
export async function evaluateDirectMedia(urls, { head, get, approvedURLs = [], concurrency = 4 } = {}) {
  if (typeof head !== 'function' || typeof get !== 'function')
    throw new TypeError('Both HEAD and status-only GET adapters are required');
  const targets = validatePrivateMediaList(urls, {approvedURLs});
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new TypeError('Concurrency must be between 1 and 8');
  const deniedStatus = value => [401,403,404,410].includes(value);
  const accessibleStatus = value => Number.isInteger(value) && value >= 200 && value < 300;
  const summary = {
    checked:targets.length, denied:0, anonymouslyAccessible:0, unknown:0,
    headAccessible:0, getAccessible:0, headDenied:0, getDenied:0,
    statusOnlyGetRequests:0,
  };
  let index = 0;
  const workers = Array.from({length:Math.min(concurrency, targets.length)},async () => {
    while (index < targets.length) {
      const url = targets[index++];
      let headStatus;
      try { headStatus = await head(url); } catch { summary.unknown++; continue; }
      if (accessibleStatus(headStatus)) {
        summary.headAccessible++;
        summary.anonymouslyAccessible++;
        // Already a definite failure. Do not request any private body.
        continue;
      }
      if (!deniedStatus(headStatus)) {
        summary.unknown++; // Redirects, 405, 5xx and timeouts are never passing evidence.
        continue;
      }
      summary.headDenied++;
      summary.statusOnlyGetRequests++;
      let getStatus;
      try { getStatus = await get(url); } catch { summary.unknown++; continue; }
      if (deniedStatus(getStatus)) {
        summary.getDenied++;
        summary.denied++;
      } else if (accessibleStatus(getStatus)) {
        summary.getAccessible++;
        summary.anonymouslyAccessible++;
      } else summary.unknown++;
    }
  });
  await Promise.all(workers);
  return Object.freeze({...summary,
    status:summary.denied===targets.length ? 'PASS' : 'FAIL',
    rawURLsRecorded:false,
    finding:'HEAD_AND_RANGE_GET_STATUS_NO_BODY_SAVED',
  });
}


/**
 * Status-only GET, used after an already denied HEAD response.
 * Request only byte 0, capture the status and cancel immediately.
 * Do NOT read, persist, print or return the body of any unpublished image.
 * If the CDN ignores Range, the 2xx status itself still blocks the release.
 */
export async function rangeGetStatusOnly(url, {fetchImpl = globalThis.fetch, timeoutMs = 13000} = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1000 || timeoutMs > 30000)
    throw new TypeError('Invalid status-only GET transport');
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
  try {
    const response = await fetchImpl(url,{
      method:'GET', redirect:'manual',signal,
      headers:{range:'bytes=0-0','cache-control':'no-cache',
        accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.1'},
    });
    const status = response.status;
    controller.abort();
    try { await response.body?.cancel(); } catch { /* cancelled after abort */ }
    return status;
  } finally { controller.abort(); }
}