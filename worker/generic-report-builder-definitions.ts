import type { SessionContext } from './auth';
import type {
  ReportAuthority, ReportDataset, ReportField, ReportFilter,
  ReportSelector, ReportValue,
} from './generic-report-builder';

/**
 * Private report definitions. This module has no database or route side effects.
 * Backend A must provide authoritative current grants and a transactional store:
 * createPrivate must atomically INSERT a private version-1 definition AND its
 * audit event, with scope/owner/CAS validation and a final current-grant check.
 * No store or incomplete authority means no successful operation.
 */
export interface PrivateReportDefinition {
  readonly id: string;
  readonly version: number;
  readonly ownerId: string;
  readonly companyId: string;
  readonly siteId: string | null;
  readonly datasetId: string;
  readonly title: string;
  readonly fields: readonly string[];
  readonly filters: readonly ReportFilter[];
  readonly sort: ReportSelector['sort'];
  readonly limit: number;
  readonly private: true;
}
export interface PrivateReportStore {
  /** Atomic: private insert + audit record, deny on conflict or absent grants. */
  readonly createPrivate: (context: SessionContext, definition: PrivateReportDefinition) => Promise<boolean>;
  /** MUST restrict the source query by all four keys; never return another actor's rows. */
  readonly getPrivate: (selector: {
    id: string; ownerId: string; companyId: string; siteId: string | null;
  }) => Promise<PrivateReportDefinition | null>;
}
export interface PrivateReportDependencies {
  readonly authority?: ReportAuthority;
  readonly datasets?: readonly ReportDataset[];
  readonly store?: PrivateReportStore;
}
const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const reply = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), { status, headers });
const deny = () => reply({ error: 'Report access is unavailable.' }, 403);
const invalid = () => reply({ error: 'Invalid report definition.' }, 400);
const failed = () => reply({ error: 'Report service is unavailable.' }, 503);
const id = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s);
const object = (s: unknown): s is Record<string, unknown> =>
  s !== null && typeof s === 'object' && !Array.isArray(s);
const value = (s: unknown): s is ReportValue =>
  s === null || typeof s === 'boolean' ||
  (typeof s === 'number' && Number.isFinite(s)) ||
  (typeof s === 'string' && s.length <= 160 && !/[\u0000-\u001f]/.test(s));
const methods = ['activeSession', 'company', 'site', 'dataset', 'field', 'record'] as const;
const ready = (deps: PrivateReportDependencies): deps is Required<PrivateReportDependencies> =>
  Boolean(deps.authority && deps.store && Array.isArray(deps.datasets) &&
    methods.every(name => typeof deps.authority?.[name] === 'function') &&
    typeof deps.store.createPrivate === 'function' &&
    typeof deps.store.getPrivate === 'function');

async function boundedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > 8192)) return null;
  const stream = request.body;
  if (!stream) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let index = 0;
    for (const chunk of chunks) { bytes.set(chunk, index); index += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

interface Submission {
  companyId: string; siteId: string | null; datasetId: string;
  title: string; fields: string[]; filters: ReportFilter[];
  sort: ReportSelector['sort']; limit: number;
}
function parseSubmission(input: unknown): Submission | null {
  const allowed = new Set(['companyId', 'siteId', 'datasetId', 'title',
    'fields', 'filters', 'sort', 'limit']);
  if (!object(input) || Object.keys(input).some(key => !allowed.has(key)) ||
    !id(input.companyId) || !id(input.datasetId) ||
    !(input.siteId === null || input.siteId === undefined || id(input.siteId)) ||
    typeof input.title !== 'string' || !input.title.trim() ||
    input.title.length > 96 || /[\u0000-\u001f<>]/.test(input.title) ||
    !Array.isArray(input.fields) || input.fields.length < 1 || input.fields.length > 16 ||
    !input.fields.every(id) || new Set(input.fields).size !== input.fields.length ||
    !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 ||
    (input.limit as number) > 50) return null;
  const filters = input.filters ?? [];
  if (!Array.isArray(filters) || filters.length > 8) return null;
  const parsedFilters: ReportFilter[] = [];
  for (const item of filters) {
    if (!object(item) || Object.keys(item).some(key => !['field', 'operator', 'value'].includes(key)) ||
      !id(item.field) || !['eq', 'startsWith', 'before', 'after'].includes(String(item.operator)) ||
      !value(item.value)) return null;
    parsedFilters.push({
      field: item.field, operator: item.operator as ReportFilter['operator'], value: item.value,
    });
  }
  let sort: ReportSelector['sort'] = null;
  if (input.sort !== undefined && input.sort !== null) {
    if (!object(input.sort) || Object.keys(input.sort).some(key => !['field', 'direction'].includes(key)) ||
      !id(input.sort.field) ||
      (input.sort.direction !== 'asc' && input.sort.direction !== 'desc')) return null;
    sort = { field: input.sort.field, direction: input.sort.direction };
  }
  return {
    companyId: input.companyId, siteId: input.siteId ?? null,
    datasetId: input.datasetId, title: input.title.trim(),
    fields: [...input.fields] as string[], filters: parsedFilters, sort,
    limit: input.limit as number,
  };
}

async function allowed(
  context: SessionContext, data: Submission, deps: Required<PrivateReportDependencies>,
): Promise<boolean> {
  const authority = deps.authority;
  if (!context.companies.some(company => company.id === data.companyId) ||
    !(await authority.activeSession(context)) ||
    !(await authority.company(context, data.companyId))) return false;
  if (data.siteId !== null && !(await authority.site(context, data.companyId, data.siteId))) return false;
  const dataset = deps.datasets.find(item => item.id === data.datasetId);
  if (!dataset || (dataset.siteScoped && data.siteId === null) ||
    !Number.isSafeInteger(dataset.maxRows) || data.limit > dataset.maxRows ||
    !(await authority.dataset(context, data.companyId, dataset))) return false;
  const fields = new Map<string, ReportField>(dataset.fields.map(field => [field.id, field]));
  const check = async (name: string, operation: 'view' | 'filter' | 'sort') => {
    const field = fields.get(name);
    // Restricted source columns are deliberately unavailable to saved V1 definitions.
    if (!field || field.sensitivity !== 'standard') return false;
    return authority.field(context, data.companyId, dataset, field, operation);
  };
  for (const field of data.fields) if (!(await check(field, 'view'))) return false;
  for (const filter of data.filters) {
    const field = fields.get(filter.field);
    if (!field || !field.filterOperators.includes(filter.operator) ||
      !(await check(filter.field, 'filter'))) return false;
  }
  if (data.sort) {
    const field = fields.get(data.sort.field);
    if (!field || !field.sortable || !(await check(data.sort.field, 'sort'))) return false;
  }
  // The final per-field grant may await while the actor is revoked. Recheck
  // current actor, tenant, site and dataset before any metadata is exposed.
  if (!(await authority.activeSession(context)) ||
    !(await authority.company(context, data.companyId)) ||
    (data.siteId !== null && !(await authority.site(context, data.companyId, data.siteId))) ||
    !(await authority.dataset(context, data.companyId, dataset))) return false;
  return true;
}

/** Private create/get only; no sharing, SQL execution, export or scheduling. */
export async function routePrivateReportDefinitions(
  request: Request, context: SessionContext | null, deps: PrivateReportDependencies,
): Promise<Response> {
  const url = new URL(request.url);
  const creating = request.method === 'POST' && url.pathname === '/api/report-builder/definitions';
  const idMatch = /^\/api\/report-builder\/definitions\/([a-zA-Z0-9_-]{1,80})$/.exec(url.pathname);
  const reading = request.method === 'GET' && idMatch !== null;
  if (!creating && !reading) return reply({ error: 'Report operation not available.' }, 404);
  if (!ready(deps) || !context || !id(context.employee?.id) || !id(context.sessionId)) return deny();
  try {
    if (creating) {
      if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return invalid();
      const submitted = parseSubmission(await boundedJson(request));
      if (!submitted) return invalid();
      if (!(await allowed(context, submitted, deps))) return deny();
      const definition: PrivateReportDefinition = {
        ...submitted, id: crypto.randomUUID(), version: 1,
        ownerId: context.employee.id, private: true,
      };
      // Authorization can expire while validating a field: check again before
      // handing an insert to a canonical atomic store.
      if (!(await allowed(context, submitted, deps))) return deny();
      if (!(await deps.store.createPrivate(context, definition))) return failed();
      if (!(await allowed(context, submitted, deps))) return deny();
      return reply({ id: definition.id, version: 1, private: true }, 201);
    }
    const companyId = url.searchParams.get('companyId');
    const siteId = url.searchParams.get('siteId');
    if (!id(companyId) || (siteId !== null && !id(siteId))) return invalid();
    const scope = { id: idMatch![1], ownerId: context.employee.id, companyId, siteId };
    if (!context.companies.some(company => company.id === companyId) ||
      !(await deps.authority.activeSession(context)) ||
      !(await deps.authority.company(context, companyId)) ||
      (siteId !== null && !(await deps.authority.site(context, companyId, siteId)))) return deny();
    const stored = await deps.store.getPrivate(scope);
    if (!stored || stored.id !== scope.id || stored.ownerId !== scope.ownerId ||
      stored.companyId !== scope.companyId || stored.siteId !== scope.siteId ||
      stored.private !== true || !Number.isSafeInteger(stored.version) ||
      stored.version < 1) return deny();
    const submission = parseSubmission({
      companyId: stored.companyId, siteId: stored.siteId,
      datasetId: stored.datasetId, title: stored.title, fields: stored.fields,
      filters: stored.filters, sort: stored.sort, limit: stored.limit,
    });
    // Existing records may have been created before an employee's permission
    // changed. Never return hidden titles, metadata or existence information.
    if (!submission || !(await allowed(context, submission, deps))) return deny();
    return reply({ definition: { ...submission, id: stored.id,
      version: stored.version, private: true } }, 200);
  } catch {
    return failed();
  }
}
