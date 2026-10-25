import type { SessionContext } from './auth';

/**
 * Backend B: data-neutral report execution boundary.
 *
 * This module intentionally registers NO production dataset. A source-module
 * owner must provide an allowlisted adapter AND authoritative per-operation
 * company/site/record/field grants before Backend A may mount this route.
 * No request-controlled SQL, raw database connector, provider, or cached grants.
 */
export type ReportOperation = 'view' | 'filter' | 'sort' | 'aggregate' | 'export';
export type ReportFilterOperator = 'eq' | 'startsWith' | 'before' | 'after';
export type ReportValue = string | number | boolean | null;
export interface ReportField {
  id: string;
  label: string;
  sensitivity: 'standard' | 'restricted';
  filterOperators: readonly ReportFilterOperator[];
  sortable: boolean;
  aggregatable: boolean;
  exportable: boolean;
}
export interface ReportFilter {
  field: string;
  operator: ReportFilterOperator;
  value: ReportValue;
}
export interface ReportSelector {
  companyId: string;
  siteId: string | null;
  fields: readonly string[];
  filters: readonly ReportFilter[];
  sort: { field: string; direction: 'asc' | 'desc' } | null;
  limit: number;
  actorId: string;
}
export interface ReportSourceRow {
  recordId: string;
  companyId: string;
  siteId: string | null;
  values: Record<string, unknown>;
}
export interface ReportDataset {
  id: string;
  label: string;
  module: string;
  siteScoped: boolean;
  fields: readonly ReportField[];
  maxRows: number;
  timeoutMs: number;
  auditClass: string;
  /** Must enforce current company/site/record scope in underlying source query. */
  fetchPreview: (selector: ReportSelector) => Promise<readonly ReportSourceRow[]>;
}
export interface ReportAuthority {
  /** Each function must evaluate CURRENT authoritative server-side grants, not UI claims. */
  activeSession: (context: SessionContext) => Promise<boolean>;
  company: (context: SessionContext, companyId: string) => Promise<boolean>;
  site: (context: SessionContext, companyId: string, siteId: string) => Promise<boolean>;
  dataset: (context: SessionContext, companyId: string, dataset: ReportDataset) => Promise<boolean>;
  field: (context: SessionContext, companyId: string, dataset: ReportDataset, field: ReportField, operation: ReportOperation) => Promise<boolean>;
  record: (context: SessionContext, companyId: string, dataset: ReportDataset, row: ReportSourceRow) => Promise<boolean>;
}
export interface ReportBuilderDependencies {
  readonly datasets: readonly ReportDataset[];
  readonly authority?: ReportAuthority;
}
const noStore = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};
const json = (value: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: noStore });
const denied = () => json({ error: 'Report access is unavailable.' }, 403);
const failed = () => json({ error: 'Report service is unavailable.' }, 503);
const malformed = () => json({ error: 'Invalid report request.' }, 400);
const safeId = (x: unknown): x is string =>
  typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x);
const object = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const primitive = (x: unknown): x is ReportValue =>
  x === null || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 200) ||
    (typeof x === 'number' && Number.isFinite(x));
const safeAuthority = (a: ReportAuthority | undefined): a is ReportAuthority =>
  Boolean(a && ['activeSession', 'company', 'site', 'dataset', 'field', 'record']
    .every(key => typeof a[key as keyof ReportAuthority] === 'function'));

function normalizeSelector(
  payload: unknown, dataset: ReportDataset,
): ReportSelector | null {
  if (!object(payload) || !safeId(payload.companyId) || !safeId(payload.datasetId)) return null;
  const siteId = payload.siteId == null ? null : payload.siteId;
  if (siteId !== null && !safeId(siteId)) return null;
  if (dataset.siteScoped && siteId === null) return null;
  if (!Array.isArray(payload.fields) || !payload.fields.length || payload.fields.length > 24 ||
    !payload.fields.every(safeId) || new Set(payload.fields).size !== payload.fields.length) return null;
  const limit = payload.limit ?? 25;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 ||
    limit > Math.min(100, dataset.maxRows)) return null;
  const filters = payload.filters ?? [];
  if (!Array.isArray(filters) || filters.length > 8) return null;
  const parsedFilters: ReportFilter[] = [];
  for (const filter of filters) {
    if (!object(filter) || !safeId(filter.field) ||
      !['eq', 'startsWith', 'before', 'after'].includes(String(filter.operator)) ||
      !primitive(filter.value)) return null;
    parsedFilters.push({
      field: filter.field,
      operator: filter.operator as ReportFilterOperator,
      value: filter.value,
    });
  }
  const rawSort = payload.sort;
  let sort: ReportSelector['sort'] = null;
  if (rawSort !== undefined && rawSort !== null) {
    if (!object(rawSort) || !safeId(rawSort.field) ||
      (rawSort.direction !== 'asc' && rawSort.direction !== 'desc')) return null;
    sort = { field: rawSort.field, direction: rawSort.direction };
  }
  // No grouping/calculation/aggregate/count/export/schedule path is exposed by
  // this bounded preview endpoint until the governed source contract exists.
  if (['groupBy', 'aggregate', 'count', 'export', 'schedule', 'sql', 'query']
    .some(key => key in payload)) return null;
  return {
    companyId: payload.companyId, siteId,
    fields: payload.fields, filters: parsedFilters, sort, limit,
    actorId: '', // filled from the authenticated server context only
  };
}

/** Backend A must call with its freshly authenticated canonical session. */
export async function routeGenericReportBuilder(
  request: Request,
  context: SessionContext | null,
  deps: ReportBuilderDependencies,
): Promise<Response> {
  if (!context || !safeId(context.employee?.id) ||
    !safeId(context.sessionId) || !safeAuthority(deps.authority)) return denied();
  const authority = deps.authority;
  const url = new URL(request.url);
  const path = url.pathname;
  const isMetadata = request.method === 'GET' && path.endsWith('/datasets');
  const isPreview = request.method === 'POST' && path.endsWith('/preview');
  if (!isMetadata && !isPreview) return json({ error: 'Report operation not available.' }, 404);
  try {
    // Ignore caller-provided role/session headers; refresh effective policy.
    if (!(await authority.activeSession(context))) return denied();
    let companyId: string;
    let siteId: string | null;
    let selector: ReportSelector | null = null;
    let dataset: ReportDataset | undefined;
    if (isMetadata) {
      companyId = url.searchParams.get('companyId') || '';
      siteId = url.searchParams.get('siteId');
      if (!safeId(companyId) || (siteId !== null && !safeId(siteId))) return malformed();
    } else {
      const payload: unknown = await request.json().catch(() => null);
      if (!object(payload) || !safeId(payload.datasetId)) return malformed();
      dataset = deps.datasets.find(d => d.id === payload.datasetId);
      // The same denial for unknown and inaccessible datasets prevents metadata oracles.
      if (!dataset) return denied();
      selector = normalizeSelector(payload, dataset);
      if (!selector) return malformed();
      companyId = selector.companyId;
      siteId = selector.siteId;
    }
    // A membership hint is NOT sufficient authority; it only adds a deny gate.
    if (!context.companies.some(c => c.id === companyId) ||
      !(await authority.company(context, companyId))) return denied();
    if (siteId !== null && !(await authority.site(context, companyId, siteId))) return denied();
    if (isMetadata) {
      const visible = [];
      for (const d of deps.datasets) {
        if (d.siteScoped && siteId === null) continue;
        if (!(await authority.dataset(context, companyId, d))) continue;
        const fields = [];
        for (const f of d.fields) {
          if (await authority.field(context, companyId, d, f, 'view')) {
            fields.push({ id: f.id, label: f.label, sensitivity: f.sensitivity });
          }
        }
        if (fields.length) visible.push({ id: d.id, label: d.label, fields });
      }
      // Permission changes during awaited field enumeration must not disclose
      // formerly visible metadata. Check the current actor and every included
      // dataset and field again before building the response.
      if (!(await authority.activeSession(context)) ||
        !(await authority.company(context, companyId)) ||
        (siteId !== null && !(await authority.site(context, companyId, siteId)))) return denied();
      for (const entry of visible) {
        const source = deps.datasets.find(item => item.id === entry.id);
        if (!source || !(await authority.dataset(context, companyId, source))) return denied();
        for (const exposed of entry.fields) {
          const field = source.fields.find(item => item.id === exposed.id);
          if (!field || !(await authority.field(context, companyId, source, field, 'view'))) return denied();
        }
      }
      if (!(await authority.activeSession(context)) ||
        !(await authority.company(context, companyId)) ||
        (siteId !== null && !(await authority.site(context, companyId, siteId)))) return denied();
      // No row counts, hidden fields, unauthorized datasets, export capabilities,
      // filter values, or source-module existence diagnostics.
      return json({ datasets: visible });
    }
    if (!dataset || !selector || !await authority.dataset(context, companyId, dataset)) return denied();
    const columns = new Map(dataset.fields.map(field => [field.id, field]));
    for (const id of selector.fields) {
      const field = columns.get(id);
      if (!field || !await authority.field(context, companyId, dataset, field, 'view')) return denied();
    }
    for (const filter of selector.filters) {
      const field = columns.get(filter.field);
      if (!field || !field.filterOperators.includes(filter.operator) ||
        !await authority.field(context, companyId, dataset, field, 'filter')) return denied();
    }
    if (selector.sort) {
      const field = columns.get(selector.sort.field);
      if (!field || !field.sortable ||
        !await authority.field(context, companyId, dataset, field, 'sort')) return denied();
    }
    // A slow source query must not carry an old authorization decision across
    // an awaited database operation. All effective grants are checked again
    // before any protected values leave this route. Backend A must supply
    // canonical, fresh server-side policy readers (not a client cache).
    const currentGrants = async (): Promise<boolean> => {
      if (!(await authority.activeSession(context)) ||
        !(await authority.company(context, companyId)) ||
        (siteId !== null && !(await authority.site(context, companyId, siteId))) ||
        !(await authority.dataset(context, companyId, dataset))) return false;
      for (const id of selector.fields) {
        const field = columns.get(id);
        if (!field || !(await authority.field(context, companyId, dataset, field, 'view'))) return false;
      }
      for (const filter of selector.filters) {
        const field = columns.get(filter.field);
        if (!field || !(await authority.field(context, companyId, dataset, field, 'filter'))) return false;
      }
      if (selector.sort) {
        const field = columns.get(selector.sort.field);
        if (!field || !(await authority.field(context, companyId, dataset, field, 'sort'))) return false;
      }
      return true;
    };
    const approved: ReportSelector = { ...selector, actorId: context.employee.id };
    const rawRows = await dataset.fetchPreview(approved);
    if (!await currentGrants()) return denied();
    if (!Array.isArray(rawRows) || rawRows.length > selector.limit) return failed();
    const rows: Array<Record<string, ReportValue>> = [];
    for (const row of rawRows) {
      if (!safeId(row.recordId) || row.companyId !== companyId ||
        (siteId !== null && row.siteId !== siteId) ||
        !object(row.values)) return failed(); // never partially expose mixed scopes
      if (!(await authority.record(context, companyId, dataset, row))) continue;
      const projected: Record<string, ReportValue> = {};
      for (const key of selector.fields) {
        const value = row.values[key] ?? null;
        if (!primitive(value)) return failed();
        projected[key] = value;
      }
      rows.push(projected);
    }
    // Record checks may themselves await; revalidate again before responding.
    if (!await currentGrants()) return denied();
    return json({ rows, columns: selector.fields, limit: selector.limit, previewOnly: true });
  } catch {
    // Do not return SQL errors, schema names, hidden record details or counts.
    return failed();
  }
}
