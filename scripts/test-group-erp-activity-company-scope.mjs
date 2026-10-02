import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, companyAAudit = 'none', companyBAudit = 'none' } = {}) {
  const calls = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'audit.explorer': companyAAudit },
      'company-b': { 'audit.explorer': companyBAudit }
    },
    permissions: { 'audit.explorer': 'manage' },
    employee: { id: 'actor' }
  };
  const DB = {
    prepare(sql) {
      const table = sql.includes('FROM activity_logs') ? 'activity'
        : sql.includes('FROM audit_logs') ? 'audit'
          : sql.includes('FROM security_logs') ? 'security' : 'unknown';
      return {
        bind(...args) {
          calls.push({ table, sql, args });
          return {
            first: async () => {
              if (!sql.includes('FROM audit_logs') || !sql.includes('au.id=?')) return null;
              const authorized = !sql.includes('au.company_id IN') || args.includes('company-a');
              return authorized ? {
                sourceId: args[0], companyId: 'company-a', provenance: 'formal_audit',
                reason: 'Approved correction requested by ops@example.com with token Bearer abcdefghijklmnop; numeric reference 123456789012; cash amount 123456789012; account number 9876543210; access key 246813579024; client_secret=client-value', beforeJson: '{"status":"draft","token":"secret-value","numericReference":123456789012,"cashAmountKobo":123456789012,"quantity":123456789012,"operationalId":123456789012,"note":"contact ops@example.com using Bearer abcdefghijklmnop; 123456789012; refresh_token: refresh-value"}', afterJson: '{"status":"reviewed","accountNumber":123456789012,"credentials":"api_key=api-value"}'
              } : null;
            },
            all: async () => {
              if (sql.includes('1=0')) return { results: [] };
              const companies = ['company-a', 'company-b'].filter(companyId =>
                !sql.includes(`${table === 'activity' ? 'al' : table === 'audit' ? 'au' : 'sl'}.company_id IN`) || args.includes(companyId));
              return { results: companies.map(companyId => ({
                id: `${table}-${companyId}`,
                companyId,
                provenance: table === 'activity' ? 'client_telemetry' : table === 'audit' ? 'formal_audit' : 'formal_security',
                occurredAt: '2026-10-01 12:00:00'
              })) };
            }
          };
        }
      };
    }
  };
  return { context, env: { DB }, calls };
}

const denied = fixture();
const deniedResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), denied.env, denied.context);
check('non-Owner without company Audit Explorer authority receives neutral denial', deniedResponse.status === 404 && (await deniedResponse.json()).error === 'Audit Explorer is unavailable.');
check('no-authority denial performs no activity, audit or security query', denied.calls.length === 0);

const companyAOnly = fixture({ companyAAudit: 'view' });
const companyAResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), companyAOnly.env, companyAOnly.context);
const companyAEvents = await companyAResponse.json();
check('consolidated read queries all three sources with target-company authorization', companyAOnly.calls.length === 3 && companyAOnly.calls.every(call => call.sql.includes(`${call.table === 'activity' ? 'al' : call.table === 'audit' ? 'au' : 'sl'}.company_id IN (?)`) && call.args.includes('company-a')));
check('Company A reader receives no Company B activity, audit or security event', companyAResponse.status === 200 && companyAEvents.events.length === 3 && companyAEvents.events.every(event => event.companyId === 'company-a'));
check('consolidated events label client telemetry and formal audit/security provenance', ['client_telemetry', 'formal_audit', 'formal_security'].every(provenance => companyAEvents.events.some(event => event.provenance === provenance)));
check('consolidated events retain a canonical source record ID for bounded drill-down', companyAEvents.events.every(event => event.sourceId && event.sourceId === event.id));
check('security details blobs are excluded from the read projection', companyAOnly.calls.find(call => call.table === 'security').sql.includes('details_json') === false);

const companyBOnly = fixture({ companyBAudit: 'view' });
const companyBResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?employeeId=employee-b'), companyBOnly.env, companyBOnly.context);
const companyBEvents = await companyBResponse.json();
check('Company B permission permits Company B audit queries only', companyBResponse.status === 200 && companyBOnly.calls.length === 3 && companyBOnly.calls.every(call => call.args.includes('company-b')) && companyBEvents.events.every(event => event.companyId === 'company-b'));

const owner = fixture({ owner: true });
const ownerResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), owner.env, owner.context);
const ownerEvents = await ownerResponse.json();
check('Owner retains group-wide audit visibility across all three sources', ownerResponse.status === 200 && ownerEvents.events.length === 6 && owner.calls.length === 3 && owner.calls.every(call => !call.sql.includes('.company_id IN')));

const auditOnly = fixture({ companyAAudit: 'view' });
const auditOnlyResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?provenance=formal_audit'), auditOnly.env, auditOnly.context);
const auditOnlyEvents = await auditOnlyResponse.json();
check('provenance filter returns only formal audit events', auditOnlyResponse.status === 200 && auditOnlyEvents.events.length === 1 && auditOnlyEvents.events[0].provenance === 'formal_audit' && auditOnly.calls.find(call => call.table === 'activity').sql.includes('1=0') && auditOnly.calls.find(call => call.table === 'security').sql.includes('1=0'));
check('formal audit projection preserves the approved reason field', auditOnly.calls.find(call => call.table === 'audit').sql.includes('au.reason reason'));
const sourceIdFixture = fixture({ companyAAudit: 'view' });
const sourceIdResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?provenance=formal_audit&sourceId=audit-company-a'), sourceIdFixture.env, sourceIdFixture.context);
const sourceIdEvents = await sourceIdResponse.json();
check('formal audit drill-down filters by canonical source row ID within authorized company scope', sourceIdResponse.status === 200 && sourceIdEvents.events.length === 1 && sourceIdEvents.events[0].companyId === 'company-a' && sourceIdFixture.calls.find(call => call.table === 'audit').sql.includes('au.id=?') && sourceIdFixture.calls.find(call => call.table === 'audit').args.includes('audit-company-a'));
const invalidFixture = fixture({ companyAAudit: 'view' });
const invalidProvenance = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?provenance=internal'), invalidFixture.env, invalidFixture.context);
check('invalid provenance is rejected before source queries', invalidProvenance.status === 400 && invalidFixture.calls.length === 0);
check('formal audit projection includes before and after fields only on the audit source', auditOnly.calls.find(call => call.table === 'audit').sql.includes('before_json beforeJson') && auditOnly.calls.find(call => call.table === 'audit').sql.includes('after_json afterJson') && auditOnly.calls.find(call => call.table === 'security').sql.includes('details_json') === false);

const auditDetail = fixture({ companyAAudit: 'view' });
const auditDetailResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity/detail?provenance=formal_audit&sourceId=audit-company-a'), auditDetail.env, auditDetail.context);
const auditDetailBody = await auditDetailResponse.json();
check('formal audit detail applies policy-aware numeric text masking while preserving authorized business numbers within company scope', auditDetailResponse.status === 200 && auditDetail.calls.length === 1 && auditDetail.calls[0].sql.includes('au.company_id IN (?)') && auditDetail.calls[0].args.includes('company-a') && auditDetailBody.event.sourceId === 'audit-company-a' && auditDetailBody.event.reason.includes('Approved correction') && auditDetailBody.event.reason.includes('numeric reference [redacted]') && auditDetailBody.event.reason.includes('account number [redacted]') && auditDetailBody.event.reason.includes('access key [redacted]') && auditDetailBody.event.reason.includes('cash amount 123456789012') && !auditDetailBody.event.reason.includes('ops@example.com') && !auditDetailBody.event.reason.includes('abcdefghijklmnop') && auditDetailBody.event.reason.includes('123456789012') && !auditDetailBody.event.reason.includes('client-value') && auditDetailBody.event.beforeJson.includes('draft') && auditDetailBody.event.afterJson.includes('reviewed') && auditDetailBody.event.beforeJson.includes('[redacted]') && auditDetailBody.event.afterJson.includes('[redacted]') && !auditDetailBody.event.beforeJson.includes('secret-value') && !auditDetailBody.event.beforeJson.includes('refresh-value') && !auditDetailBody.event.beforeJson.includes('ops@example.com') && !auditDetailBody.event.beforeJson.includes('abcdefghijklmnop') && auditDetailBody.event.beforeJson.includes('"numericReference":"[redacted]"') && auditDetailBody.event.beforeJson.includes('"cashAmountKobo":123456789012') && auditDetailBody.event.beforeJson.includes('"quantity":123456789012') && auditDetailBody.event.beforeJson.includes('"operationalId":123456789012') && auditDetailBody.event.beforeJson.includes('123456789012; refresh_token') && auditDetailBody.event.afterJson.includes('"accountNumber":"[redacted]"') && !auditDetailBody.event.afterJson.includes('api-value'));

const crossCompanyDetail = fixture({ companyBAudit: 'view' });
const crossCompanyDetailResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity/detail?provenance=formal_audit&sourceId=audit-company-a'), crossCompanyDetail.env, crossCompanyDetail.context);
check('cross-company audit detail receives neutral not-found with company predicate bound before disclosure', crossCompanyDetailResponse.status === 404 && (await crossCompanyDetailResponse.json()).error === 'Audit record is unavailable.' && crossCompanyDetail.calls.length === 1 && crossCompanyDetail.calls[0].sql.includes('au.company_id IN (?)') && crossCompanyDetail.calls[0].args.includes('company-b'));

const ownerDetail = fixture({ owner: true });
const ownerDetailResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity/detail?provenance=formal_audit&sourceId=audit-company-a'), ownerDetail.env, ownerDetail.context);
check('Owner retains group-wide formal audit detail access', ownerDetailResponse.status === 200 && ownerDetail.calls.length === 1 && !ownerDetail.calls[0].sql.includes('au.company_id IN'));

const unsupportedDetail = fixture({ companyAAudit: 'view' });
const unsupportedDetailResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity/detail?provenance=formal_security&sourceId=security-company-a'), unsupportedDetail.env, unsupportedDetail.context);
check('detail endpoint fails closed for non-formal-audit provenance without querying security details', unsupportedDetailResponse.status === 404 && unsupportedDetail.calls.length === 0);

const crossCompanyFilter = fixture({ companyAAudit: 'view' });
const crossCompanyFilterResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?companyId=company-b'), crossCompanyFilter.env, crossCompanyFilter.context);
check('explicit company filter outside authorized scope gets neutral denial before all source queries', crossCompanyFilterResponse.status === 404 && (await crossCompanyFilterResponse.json()).error === 'Audit Explorer is unavailable.' && crossCompanyFilter.calls.length === 0);

const filtered = fixture({ companyAAudit: 'view' });
const filteredResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?companyId=company-a&action=record.update&recordId=record-7&from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z&outcome=denied&riskLevel=high&sessionId=session-2&device=Chrome'), filtered.env, filtered.context);
const filteredEvents = await filteredResponse.json();
check('business, action, record, time, outcome, risk, session and device filters reach only authorized company queries', filteredResponse.status === 200 && filtered.calls.length === 3 && filtered.calls.every(call => call.args.includes('company-a') && call.args.includes('record.update') && call.args.includes('record-7') && call.args.includes('2026-10-01T00:00:00Z') && call.args.includes('2026-10-02T00:00:00Z') && call.args.includes('session-2') && call.args.includes('%Chrome%')) && filtered.calls[0].args.includes('denied') && filtered.calls[2].args.includes('high') && filteredEvents.events.every(event => event.companyId === 'company-a'));

const invalidRange = fixture({ companyAAudit: 'view' });
const invalidRangeResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?from=2026-10-02&to=2026-10-01'), invalidRange.env, invalidRange.context);
check('reversed or malformed time ranges are rejected before source queries', invalidRangeResponse.status === 400 && invalidRange.calls.length === 0);

const invalidRisk = fixture({ companyAAudit: 'view' });
const invalidRiskResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?riskLevel=secret'), invalidRisk.env, invalidRisk.context);
check('invalid risk levels are rejected before source queries', invalidRiskResponse.status === 400 && invalidRisk.calls.length === 0);

const invalidLimit = fixture({ companyAAudit: 'view' });
const invalidLimitResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?limit=not-a-number'), invalidLimit.env, invalidLimit.context);
check('malformed result limits use the bounded default instead of reaching D1', invalidLimitResponse.status === 200 && invalidLimit.calls.length === 3 && invalidLimit.calls.every(call => call.args.at(-1) === 100));
