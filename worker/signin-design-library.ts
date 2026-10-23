import { hasPermission, type AuthEnv, type SessionContext } from './auth';
import { inspectSignInDesign } from './signin-design-readiness';

/**
 * Owner-only storage for draft Sign-In concepts.
 *
 * SECURITY CONTRACT
 * - Never serves the public Sign-In, never evaluates uploaded HTML or scripts.
 * - Only authenticated owner + settings.manage can list or modify concepts.
 * - Explicit POST only; no automatic publish or active-design setting.
 * - D1 compare-and-swap revision prevents silent overwriting between sessions.
 * - Existing app_settings and audit_logs tables; no schema migration.
 */
interface Env extends AuthEnv {}
type Item = { id: string; label: string; x: number; y: number };
type Block = { id: string; kind: string; label: string; x: number; y: number; width: number; height: number; items: Item[] };
type Design = { name: string; blocks: Block[] };
type Library = { revision: number; designs: Design[] };
const KEY = 'ui.signin_design_library_v1';
const REVIEW_KEY = 'ui.signin_design_review_v1';
const READINESS_PATH = '/api/theme/signin/designs/readiness';
const REVIEW_PATH = '/api/theme/signin/designs/review';
const REHEARSAL_PATH = '/api/theme/signin/designs/rehearsal';
const REHEARSAL_KEY = 'ui.signin_design_release_rehearsal_v1';
const KINDS = new Set(['heading', 'text', 'clock', 'weather', 'brand', 'auth']);
const MAX_BODY = 240_000;
const allowed = (value: unknown, length: number) => typeof value === 'string' && value.length <= length && !/[\u0000-\u001f\u007f]/.test(value);
const finite = (value: unknown, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function validateLibrary(input: unknown): Design[] | null {
  if (!Array.isArray(input) || input.length > 20) return null;
  const designs: Design[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Record<string, unknown>;
    if (!allowed(d.name, 70) || !(d.name as string).trim() ||
      !Array.isArray(d.blocks) || d.blocks.length > 100) return null;
    const blocks: Block[] = [];
    const blockIds = new Set<string>();
    for (const rawBlock of d.blocks) {
      if (!rawBlock || typeof rawBlock !== 'object') return null;
      const b = rawBlock as Record<string, unknown>;
      if (!allowed(b.id, 80) || !(b.id as string).trim() || blockIds.has(b.id as string) ||
        typeof b.kind !== 'string' || !KINDS.has(b.kind) || !allowed(b.label, 100) ||
        !finite(b.x, 0, 3600) || !finite(b.y, 0, 2000) ||
        !finite(b.width, 80, 900) || !finite(b.height, 40, 600)) return null;
      blockIds.add(b.id as string);
      const rawItems = b.items === undefined ? [] : b.items;
      if (!Array.isArray(rawItems) || rawItems.length > 12 || (b.kind === 'auth' && rawItems.length > 0)) return null;
      const items: Item[] = [];
      const itemIds = new Set<string>();
      for (const rawItem of rawItems) {
        if (!rawItem || typeof rawItem !== 'object') return null;
        const item = rawItem as Record<string, unknown>;
        if (!allowed(item.id, 80) || !(item.id as string).trim() || itemIds.has(item.id as string) ||
          !allowed(item.label, 60) || !finite(item.x, 0, 800) || !finite(item.y, 0, 500)) return null;
        itemIds.add(item.id as string);
        items.push({ id: item.id as string, label: item.label as string, x: item.x as number, y: item.y as number });
      }
      blocks.push({
        id: b.id as string, kind: b.kind, label: b.label as string,
        x: b.x as number, y: b.y as number, width: b.width as number,
        height: b.height as number, items,
      });
    }
    designs.push({ name: d.name as string, blocks });
  }
  return designs;
}

function parsed(raw: string): Library {
  if (!raw) return { revision: 0, designs: [] };
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const designs = validateLibrary(value.designs);
    if (finite(value.revision, 0, 1_000_000_000) && Number.isInteger(value.revision) && designs) {
      return { revision: value.revision as number, designs };
    }
  } catch { /* invalid records must not be silently overwritten */ }
  throw new Error('Stored Owner Studio design library is invalid.');
}

export async function routeSignInDesignLibrary(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/theme/signin/designs' && url.pathname !== READINESS_PATH && url.pathname !== REVIEW_PATH && url.pathname !== REHEARSAL_PATH) return null;
  if (!context.roles.some(role => role.code === 'owner') || !hasPermission(context, 'settings.access', 'manage')) {
    return json({ error: 'Owner authorization is required to manage Sign-In designs.' }, 403);
  }
  // Shared browser-origin guard for Library, Readiness, Review and Rehearsal mutations.
  // Check BEFORE querying D1; a form with text/plain can otherwise send JSON-shaped
  // content across origins if the Owner's browser carries ambient session cookies.
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (request.method !== 'GET' && (
    (origin !== null && origin !== url.origin) ||
    (fetchSite !== null && fetchSite !== 'same-origin' && fetchSite !== 'none')
  )) {
    return json({ error: 'Cross-origin Owner design changes are not permitted.' }, 403);
  }
  if (url.pathname === REHEARSAL_PATH) return handleSignInDesignRehearsal(request, env, context);
  if (url.pathname === READINESS_PATH || url.pathname === REVIEW_PATH) {
    return handleDesignReleaseReview(request, env, context, url.pathname);
  }
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(KEY).first<{ setting_value: string }>();
  const old = row?.setting_value || '';
  let current: Library;
  try { current = parsed(old); } catch { return json({ error: 'Stored design library needs Owner review before any changes.' }, 409); }
  if (request.method === 'GET') return json({ ...current, canManage: true });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'Design library is too large.' }, 413);
  const content = await request.text();
  if (content.length > MAX_BODY) return json({ error: 'Design library is too large.' }, 413);
  let input: Record<string, unknown>;
  try { input = JSON.parse(content) as Record<string, unknown>; } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!input || typeof input !== 'object' ||
    !finite(input.revision, 0, 1_000_000_000) || !Number.isInteger(input.revision)) return json({ error: 'Expected library revision is required.' }, 400);
  const designs = validateLibrary(input.designs);
  if (!designs) return json({ error: 'Invalid or unsupported Sign-In design data.' }, 400);
  if (input.revision !== current.revision) return json({ error: 'Designs were changed in another session. Reload before saving.', revision: current.revision }, 409);
  const next: Library = { revision: current.revision + 1, designs };
  const nextJSON = JSON.stringify(next);
  if (nextJSON.length > MAX_BODY) return json({ error: 'Design library exceeds the storage limit.' }, 413);
  const mutation = row
    ? env.DB.prepare(`UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP
        WHERE setting_key=? AND setting_value=?`).bind(nextJSON, context.employee.id, KEY, old)
    : env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
        VALUES(?,?,'json',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO NOTHING`)
      .bind(KEY, nextJSON, context.employee.id);
  const audit = env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
    SELECT ?,?,'theme','save_signin_design_library','app_setting',?,?,'web'
    FROM app_settings WHERE setting_key=? AND setting_value=? AND changes()=1`)
    .bind('audit-'+crypto.randomUUID(), context.employee.id, KEY,
      JSON.stringify({ revision: next.revision, designCount: designs.length }), KEY, nextJSON);
  try {
    // D1 batch is a transaction: an audit failure must roll back the design mutation.
    // The audit SELECT only inserts after a successful CAS update/insert in this batch.
    const results = await env.DB.batch([mutation, audit]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      return json({ error: 'Concurrent edit detected. Reload before saving.' }, 409);
    }
  } catch {
    return json({ error: 'Design Library save and audit could not be completed safely.' }, 503);
  }
  return json({ ok: true, ...next });
}

type ReviewCandidate = {
  requestId: string; index: number; libraryRevision: number; designName: string;
  requestedAt: string; requestedBy: string; status: 'awaiting-authenticated-acceptance';
  design: Design;
};
type ReviewState = { revision: number; candidate: ReviewCandidate | null };
const defaultReview = (): ReviewState => ({ revision: 0, candidate: null });
function parseReview(raw: string): ReviewState {
  if (!raw) return defaultReview();
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!Number.isInteger(value.revision) || !finite(value.revision, 0, 1_000_000_000)) throw Error('Invalid review revision');
  if (value.candidate !== null && (!value.candidate || typeof value.candidate !== 'object')) throw Error('Invalid review candidate');
  return { revision: value.revision as number, candidate: value.candidate as ReviewCandidate | null };
}
async function handleDesignReleaseReview(
  request: Request, env: Env, context: SessionContext, pathname: string,
): Promise<Response> {
  if (pathname === READINESS_PATH && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (pathname === REVIEW_PATH && !['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const libraryRow = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(KEY).first<{ setting_value: string }>();
  let library: Library;
  try { library = parsed(libraryRow?.setting_value || ''); }
  catch { return json({ error: 'Saved designs must be repaired before release review.' }, 409); }
  const reviewRow = pathname === REVIEW_PATH
    ? await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
      .bind(REVIEW_KEY).first<{ setting_value: string }>() : null;
  const oldReview = reviewRow?.setting_value || '';
  let review: ReviewState;
  try { review = parseReview(oldReview); }
  catch { return json({ error: 'The existing review record requires Owner investigation.' }, 409); }

  if (request.method === 'GET') {
    return json({
      ...review, stale: Boolean(review.candidate && review.candidate.libraryRevision !== library.revision),
      published: false, currentPublicDesign: 'Approved V180 Sign-In',
      note: 'Review records cannot activate or replace the public Sign-In.',
    });
  }
  if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Review request too large.' }, 413);
  const text = await request.text();
  if (text.length > 4096) return json({ error: 'Review request too large.' }, 413);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(text) as Record<string, unknown>; } catch { return json({ error: 'Invalid review request.' }, 400); }
  if (!payload || typeof payload !== 'object') return json({ error: 'Invalid review request.' }, 400);
  if (pathname === REVIEW_PATH && (!Number.isInteger(payload.reviewRevision) || !finite(payload.reviewRevision, 0, 1_000_000_000))) {
    return json({ error: 'Expected review revision is required.' }, 400);
  }
  if (pathname === REVIEW_PATH && payload.reviewRevision !== review.revision) return json({
    error: 'A different Owner session changed the release review. Reload before proceeding.',
    revision: review.revision,
  }, 409);
  let candidate: ReviewCandidate | null = null;
  let preflight: ReturnType<typeof inspectSignInDesign> | null = null;
  if (request.method !== 'DELETE') {
    if (!Number.isInteger(payload.libraryRevision) || payload.libraryRevision !== library.revision) {
      return json({ error: 'Saved designs changed. Reload the Owner Library before requesting review.', revision: library.revision }, 409);
    }
    if (!Number.isInteger(payload.designIndex) ||
        !finite(payload.designIndex, 0, Math.max(0, library.designs.length-1))) {
      return json({ error: 'Choose a saved design for review.' }, 400);
    }
    const index = payload.designIndex as number;
    const design = library.designs[index];
    if (!design) return json({ error: 'The selected saved design no longer exists.' }, 404);
    preflight = inspectSignInDesign(design);
    if (pathname === READINESS_PATH) return json({ designName: design.name, libraryRevision: library.revision, ...preflight });
    if (!preflight.structuralPass) {
      return json({ error: 'Design requires corrections before release review.', designName: design.name, ...preflight }, 422);
    }
    candidate = {
      requestId: crypto.randomUUID(), index, libraryRevision: library.revision,
      designName: design.name, requestedAt: new Date().toISOString(),
      requestedBy: context.employee.id, status: 'awaiting-authenticated-acceptance', design,
    };
  }
  const next: ReviewState = { revision: review.revision + 1, candidate };
  const nextJSON = JSON.stringify(next);
  const action = request.method === 'DELETE' ? 'withdraw_signin_design_review' : 'request_signin_design_review';
  const write = reviewRow
    ? env.DB.prepare(`UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP
      WHERE setting_key=? AND setting_value=?`).bind(nextJSON,context.employee.id,REVIEW_KEY,oldReview)
    : env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
      VALUES(?,?,'json',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO NOTHING`)
      .bind(REVIEW_KEY,nextJSON,context.employee.id);
  const audit = env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
    SELECT ?,?,'theme',?,'app_setting',?,?,'web' FROM app_settings WHERE setting_key=? AND setting_value=?`)
    .bind('audit-'+crypto.randomUUID(),context.employee.id,action,REVIEW_KEY,JSON.stringify({
      revision: next.revision, libraryRevision: candidate?.libraryRevision,
      requestId: candidate?.requestId, designName: candidate?.designName,
      publicDesignChanged: false,
    }),REVIEW_KEY,nextJSON);
  try {
    // D1 batch uses an atomic transaction: audit failure rolls back the review state.
    const results = await env.DB.batch([write,audit]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      return json({ error: 'Concurrent review update or missing audit. Reload before proceeding.' }, 409);
    }
  } catch { return json({ error: 'Release review could not be stored and audited.' }, 503); }
  return json({
    ok: true, ...next, published: false, currentPublicDesign: 'Approved V180 Sign-In',
    preflight, note: 'Review submitted. No public Sign-In change has occurred.',
  });
}


/**
 * Safe release rehearsal checkpoint.
 *
 * This state is NOT consulted by the public Sign-In renderer and CANNOT publish
 * a design. It rehearses the Owner's guarded prepare -> rollback transaction,
 * with optimistic concurrency and audit evidence before release activation exists.
 */
type RehearsalEntry = {
  rehearsalId: string; reviewRequestId: string; libraryRevision: number;
  reviewRevision: number; designIndex: number; designName: string;
  preparedBy: string; preparedAt: string; designFingerprint: string;
  status: 'prepared-not-published';
};
type RehearsalState = { revision: number; entry: RehearsalEntry | null };
const emptyRehearsal = (): RehearsalState => ({ revision: 0, entry: null });

function parseRehearsal(raw: string): RehearsalState {
  if (!raw) return emptyRehearsal();
  const value = JSON.parse(raw) as Record<string, unknown>;
  if (!Number.isInteger(value.revision) || !finite(value.revision, 0, 1_000_000_000)) {
    throw Error('Invalid rehearsal revision');
  }
  if (value.entry !== null) {
    if (!value.entry || typeof value.entry !== 'object') throw Error('Invalid rehearsal entry');
    const entry = value.entry as Record<string, unknown>;
    if (!allowed(entry.rehearsalId, 80) || !(entry.rehearsalId as string).trim() ||
      !allowed(entry.reviewRequestId, 80) || !(entry.reviewRequestId as string).trim() ||
      !allowed(entry.designName, 70) || !(entry.designName as string).trim() ||
      !allowed(entry.preparedBy, 80) || !allowed(entry.preparedAt, 80) ||
      !allowed(entry.designFingerprint, 64) || !/^[a-f0-9]{64}$/.test(entry.designFingerprint as string) ||
      !Number.isInteger(entry.libraryRevision) || !finite(entry.libraryRevision, 0, 1_000_000_000) ||
      !Number.isInteger(entry.reviewRevision) || !finite(entry.reviewRevision, 0, 1_000_000_000) ||
      !Number.isInteger(entry.designIndex) || !finite(entry.designIndex, 0, 19) ||
      entry.status !== 'prepared-not-published') throw Error('Invalid stored rehearsal checkpoint');
  }
  return { revision: value.revision as number, entry: value.entry as RehearsalEntry | null };
}

async function fingerprintDesign(design: Design, libraryRevision: number, reviewRequestId: string) {
  const input = JSON.stringify({ design, libraryRevision, reviewRequestId });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

async function handleSignInDesignRehearsal(
  request: Request, env: Env, context: SessionContext,
): Promise<Response> {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (request.method !== 'GET' && origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Cross-origin release rehearsal changes are not permitted.' }, 403);
  }
  const read = async (key: string) => env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(key).first<{ setting_value: string }>();
  const [libraryRow, reviewRow, row] = await Promise.all([read(KEY), read(REVIEW_KEY), read(REHEARSAL_KEY)]);
  const oldRehearsal = row?.setting_value || '';
  let library: Library;
  let review: ReviewState;
  let current: RehearsalState;
  try {
    library = parsed(libraryRow?.setting_value || '');
    review = parseReview(reviewRow?.setting_value || '');
    current = parseRehearsal(oldRehearsal);
  } catch {
    return json({ error: 'Saved design, review or rehearsal records require investigation before changes.' }, 409);
  }

  const entry = current.entry;
  const reviewedDesign = entry ? library.designs[entry.designIndex] : null;
  const fingerprintMatches = Boolean(entry && reviewedDesign && review.candidate &&
    JSON.stringify(reviewedDesign) === JSON.stringify(review.candidate.design) &&
    await fingerprintDesign(reviewedDesign, entry.libraryRevision, entry.reviewRequestId) === entry.designFingerprint);
  const stale = Boolean(entry && (
    !fingerprintMatches || library.revision !== entry.libraryRevision ||
    review.revision !== entry.reviewRevision ||
    review.candidate?.status !== 'awaiting-authenticated-acceptance' ||
    review.candidate?.requestId !== entry.reviewRequestId ||
    review.candidate?.libraryRevision !== entry.libraryRevision ||
    review.candidate?.index !== entry.designIndex
  ));
  const envelope = {
    ...current, stale, published: false, readyToPublish: false,
    currentPublicDesign: 'Approved V180 Sign-In', activationAvailable: false,
  };
  if (request.method === 'GET') return json({
    ...envelope, note: 'Release rehearsal only. No public Sign-In is activated by this record.',
  });

  if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Rehearsal request too large.' }, 413);
  const text = await request.text();
  if (text.length > 4096) return json({ error: 'Rehearsal request too large.' }, 413);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(text) as Record<string, unknown>; }
  catch { return json({ error: 'Invalid rehearsal request.' }, 400); }
  if (!payload || typeof payload !== 'object' ||
      !Number.isInteger(payload.rehearsalRevision) ||
      !finite(payload.rehearsalRevision, 0, 1_000_000_000)) {
    return json({ error: 'Expected rehearsal revision is required.' }, 400);
  }
  if (payload.rehearsalRevision !== current.revision) return json({
    error: 'Another Owner session updated the rehearsal. Refresh before continuing.',
    revision: current.revision,
  }, 409);

  let nextEntry: RehearsalEntry | null = null;
  if (request.method === 'DELETE') {
    if (!entry || payload.rehearsalId !== entry.rehearsalId) {
      return json({ error: 'That rehearsal is no longer current. Refresh before rollback.' }, 409);
    }
  } else {
    if (entry) return json({ error: 'Roll back the existing rehearsal before preparing another.' }, 409);
    const candidate = review.candidate;
    if (!candidate || candidate.status !== 'awaiting-authenticated-acceptance' ||
      !allowed(payload.reviewRequestId, 80) || payload.reviewRequestId !== candidate.requestId ||
      payload.reviewRevision !== review.revision ||
      payload.libraryRevision !== library.revision ||
      payload.libraryRevision !== candidate.libraryRevision ||
      payload.designIndex !== candidate.index) {
      return json({ error: 'A current saved Owner review is required for release rehearsal.' }, 409);
    }
    const design = library.designs[candidate.index];
    if (!design || JSON.stringify(design) !== JSON.stringify(candidate.design) ||
      !inspectSignInDesign(design).structuralPass) {
      return json({ error: 'The reviewed design changed or failed structural validation.' }, 422);
    }
    nextEntry = {
      rehearsalId: crypto.randomUUID(), reviewRequestId: candidate.requestId,
      libraryRevision: library.revision, reviewRevision: review.revision,
      designIndex: candidate.index, designName: design.name,
      preparedAt: new Date().toISOString(), preparedBy: context.employee.id,
      designFingerprint: await fingerprintDesign(design, library.revision, candidate.requestId),
      status: 'prepared-not-published',
    };
  }

  const next: RehearsalState = { revision: current.revision + 1, entry: nextEntry };
  const nextJSON = JSON.stringify(next);
  // Preparing a rehearsal also compares the exact saved review and library rows
  // INSIDE the D1 write transaction. A concurrent withdrawal/save cannot arm stale data.
  const sourceReview = reviewRow?.setting_value || '';
  const sourceLibrary = libraryRow?.setting_value || '';
  const mutation = request.method === 'POST'
    ? row
      ? env.DB.prepare(`UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP
          WHERE setting_key=? AND setting_value=?
          AND (SELECT setting_value FROM app_settings WHERE setting_key=?)=?
          AND (SELECT setting_value FROM app_settings WHERE setting_key=?)=?`)
        .bind(nextJSON, context.employee.id, REHEARSAL_KEY, oldRehearsal,
          REVIEW_KEY, sourceReview, KEY, sourceLibrary)
      : env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
          SELECT ?,?,'json',?,CURRENT_TIMESTAMP
          WHERE (SELECT setting_value FROM app_settings WHERE setting_key=?)=?
          AND (SELECT setting_value FROM app_settings WHERE setting_key=?)=?
          ON CONFLICT(setting_key) DO NOTHING`)
        .bind(REHEARSAL_KEY, nextJSON, context.employee.id,
          REVIEW_KEY, sourceReview, KEY, sourceLibrary)
    : env.DB.prepare(`UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP
        WHERE setting_key=? AND setting_value=?`)
      .bind(nextJSON, context.employee.id, REHEARSAL_KEY, oldRehearsal);
  const audit = env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
      SELECT ?,?,'theme',?,'app_setting',?,?,'web'
      FROM app_settings WHERE setting_key=? AND setting_value=? AND changes()=1`)
    .bind('audit-'+crypto.randomUUID(), context.employee.id,
      request.method === 'DELETE' ? 'rollback_signin_design_rehearsal' : 'prepare_signin_design_rehearsal',
      REHEARSAL_KEY, JSON.stringify({
        revision: next.revision, rehearsalId: entry?.rehearsalId || nextEntry?.rehearsalId,
        reviewRequestId: entry?.reviewRequestId || nextEntry?.reviewRequestId,
        designFingerprint: entry?.designFingerprint || nextEntry?.designFingerprint,
        publicDesignChanged: false,
      }), REHEARSAL_KEY, nextJSON);
  try {
    // D1 batch is transactional. An audit constraint error rolls back the checkpoint write.
    const results = await env.DB.batch([mutation, audit]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      return json({ error: 'Rehearsal conflict or missing audit. Refresh before proceeding.' }, 409);
    }
  } catch {
    return json({ error: 'Release rehearsal and audit could not be saved atomically.' }, 503);
  }
  return json({
    ...next, published: false, readyToPublish: false, activationAvailable: false,
    currentPublicDesign: 'Approved V180 Sign-In',
    note: request.method === 'DELETE'
      ? 'Rehearsal rolled back. Approved V180 was never replaced.'
      : 'Non-public release rehearsal prepared. Authentication and publication gates remain outstanding.',
  });
}
