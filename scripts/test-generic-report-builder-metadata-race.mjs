import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// New distinct race: a dataset/field metadata enumeration may outlive its
// authorization. This is NOT a replay of the preview/record race harness.
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
function makeHarness(toRevoke) {
  const live = { session: true, company: true, site: true, dataset: true, field: true };
  let fetchCount = 0;
  const dataset = {
    id: 'directory_active', label: 'TOP_SECRET_DATASET_METADATA', module: 'directory',
    siteScoped: true, maxRows: 5, timeoutMs: 2000, auditClass: 'directory',
    fields: [{
      id: 'displayName', label: 'TOP_SECRET_FIELD_LABEL', sensitivity: 'standard',
      filterOperators: ['eq'], sortable: true, aggregatable: false, exportable: false,
    }],
    fetchPreview: async () => { fetchCount++; return []; },
  };
  const authority = {
    activeSession: async () => live.session,
    company: async () => live.company,
    site: async () => live.site,
    dataset: async () => live.dataset,
    field: async () => {
      // Current grants were valid at enumeration start. While waiting for
      // the server's final field-grant answer, policy changes elsewhere.
      if (toRevoke && live[toRevoke]) live[toRevoke] = false;
      return toRevoke === 'field' ? false : true;
    },
    record: async () => true,
  };
  return { deps: { authority, datasets: [dataset] }, fetchCount: () => fetchCount };
}
let passed = 0;
for (const revoked of ['session', 'company', 'site', 'dataset']) {
  const h = makeHarness(revoked);
  const req = new Request(
    'https://staffportal.test/api/report-builder/datasets?companyId=' +
    companyId + '&siteId=' + siteId
  );
  const response = await routeGenericReportBuilder(req, context, h.deps);
  const body = await response.text();
  assert.equal(response.status, 403, 'metadata must fail closed when ' + revoked + ' becomes revoked');
  assert.equal(body.includes('TOP_SECRET_DATASET_METADATA'), false, 'dataset hidden after revoke');
  assert.equal(body.includes('TOP_SECRET_FIELD_LABEL'), false, 'field hidden after revoke');
  assert.equal(h.fetchCount(), 0, 'metadata does not fetch protected records');
  passed++;
  console.log('PASS metadata ' + revoked + ' revoked while enumerating');
}
console.log('GENERIC_REPORT_METADATA_REVALIDATION=' + passed + '/' + passed + ' PASS');
