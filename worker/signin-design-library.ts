import { hasPermission, type AuthEnv, type SessionContext } from './auth';

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
  if (url.pathname !== '/api/theme/signin/designs') return null;
  if (!context.roles.some(role => role.code === 'owner') || !hasPermission(context, 'settings.access', 'manage')) {
    return json({ error: 'Owner authorization is required to manage Sign-In designs.' }, 403);
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
  const result = row
    ? await env.DB.prepare(`UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP
        WHERE setting_key=? AND setting_value=?`).bind(nextJSON, context.employee.id, KEY, old).run()
    : await env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
        VALUES(?,?,'json',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO NOTHING`)
      .bind(KEY, nextJSON, context.employee.id).run();
  if (result.meta.changes !== 1) return json({ error: 'Concurrent edit detected. Reload before saving.' }, 409);
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)
     VALUES(?,?,'theme','save_signin_design_library','app_setting',?,?,'web')`)
    .bind('audit-'+crypto.randomUUID(), context.employee.id, KEY, JSON.stringify({ revision: next.revision, designCount: designs.length }))
    .run();
  return json({ ok: true, ...next });
}
