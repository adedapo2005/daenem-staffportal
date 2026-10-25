import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('worker/generic-report-builder.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeGenericReportBuilder } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64')
);
const companyId = 'company-alpha';
const siteId = 'site-alpha';
const context = {
  employee: { id: 'employee-owner', status: 'active' },
  sessionId: 'session-owner',
  companies: [{ id: companyId }],
  roles: [], permissions: {}, companyPermissions: {},
};
const fields = [{ id: 'label', label: 'Display Name', sensitivity: 'standard',
  filterOperators: ['eq'], sortable: true, aggregatable: false, exportable: false }];
function harness(revoke) {
  const state = { active: true, company: true, site: true, dataset: true, field: true };
  let fetchCalls = 0;
  const dataset = {
    id: 'directory_active', label: 'Directory', module: 'directory', siteScoped: true,
    fields, maxRows: 10, timeoutMs: 2500, auditClass: 'directory',
    async fetchPreview() {
      fetchCalls++;
      state[revoke] = false;
      return [{
        recordId: 'record-employee', companyId, siteId,
        values: { label: 'PRIVATE_VISIBLE_ONLY_BEFORE_REVOKE' },
      }];
    },
  };
  const authority = {
    activeSession: async () => state.active,
    company: async () => state.company,
    site: async () => state.site,
    dataset: async () => state.dataset,
    field: async () => state.field,
    record: async () => true,
  };
  return { deps: { authority, datasets: [dataset] }, getFetchCalls: () => fetchCalls };
}
let completed = 0;
for (const revokedPermission of ['active', 'company', 'site', 'dataset', 'field']) {
  const h = harness(revokedPermission);
  const req = new Request('https://staffportal.test/api/report-builder/preview', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, siteId, datasetId: 'directory_active',
      fields: ['label'], limit: 10, filters: [] }),
  });
  const result = await routeGenericReportBuilder(req, context, h.deps);
  const response = await result.text();
  assert.equal(h.getFetchCalls(), 1, 'source had valid access only before await');
  assert.equal(result.status, 403,
    'deny after ' + revokedPermission + ' is withdrawn before returning preview');
  assert.equal(response.includes('PRIVATE_VISIBLE_ONLY_BEFORE_REVOKE'), false,
    'must not leak protected value after revocation');
  completed++;
  console.log('PASS post-fetch ' + revokedPermission + ' revocation denied');
}
// The post-fetch fence is insufficient if a per-record grant lookup itself
// observes a later policy change: recheck once more before response output.
{
  const h = harness('active');
  h.deps.datasets[0].fetchPreview = async () => [{
    recordId: 'record-employee', companyId, siteId,
    values: { label: 'PRIVATE_VISIBLE_ONLY_BEFORE_REVOKE' },
  }];
  let stillActive = true;
  h.deps.authority.activeSession = async () => stillActive;
  h.deps.authority.record = async () => {
    stillActive = false;
    return true;
  };
  const req = new Request('https://staffportal.test/api/report-builder/preview', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ companyId, siteId, datasetId: 'directory_active',
      fields: ['label'], limit: 10, filters: [] }),
  });
  const res = await routeGenericReportBuilder(req, context, h.deps);
  assert.equal(res.status, 403, 'recheck after awaited record authorization');
  assert.equal((await res.text()).includes('PRIVATE_VISIBLE_ONLY_BEFORE_REVOKE'), false);
  completed++;
  console.log('PASS authorization revocation while checking a record');
}
console.log('GENERIC_REPORT_GRANT_FENCE=' + completed + '/' + completed + ' PASS');
