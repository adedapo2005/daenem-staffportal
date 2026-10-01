import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=()=>false;"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

let insertedMetadata;
let insertedArgs;
let insertCount = 0;
const env = {
  DB: {
    prepare(sql) {
      assert.match(sql, /INSERT INTO activity_logs/);
      return {
        bind(...args) {
          insertCount += 1;
          insertedArgs = args;
          insertedMetadata = JSON.parse(args.at(-1));
          return { run: async () => ({ success: true }) };
        }
      };
    }
  }
};
const context = { employee: { id: 'employee-a' }, sessionId: 'session-a', companies: [{ id: 'company-a' }], roles: [], companyPermissions: {} };
const request = new Request('https://staffportal.test/api/activity/record', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': 'request-a' },
  body: JSON.stringify({
    module: 'payroll',
    action: 'bank_payment_draft_created',
    path: '/admin/payroll',
    companyId: 'company-a',
    metadata: {
      control: 'Create Payment Draft',
      tag: 'button',
      runId: 'run-a',
      id: {
        command: 'View Employee',
        token: 'private-token-value',
        innocentParent: { otp: '123456', accountNumber: '1234567890123456', note: 'private nested value' }
      },
      form: 'person@example.com',
      credentials: { accessToken: 'Bearer private-token-value', accountNumber: '1234567890123456' },
      details: { innocent: { otp: '123456', value: 'private nested value' } },
      nested: { command: 'Should not be retained', token: 'private-token-value' },
      secret: 'private-secret-value'
    }
  })
});

const response = await routeGroupErp(request, env, context);
assert.equal(response.status, 201, 'valid activity telemetry is still recorded');
assert.equal(insertedArgs[3], 'company-a', 'activity telemetry records the resolved target company');
assert.equal(insertedArgs[4], 'request-a', 'activity telemetry preserves inbound request correlation');
assert.deepEqual(insertedMetadata, {
  control: 'Create Payment Draft',
  tag: 'button',
  runId: 'run-a',
  id: { command: 'View Employee' }
}, 'known useful telemetry survives while nested sensitive and unknown metadata is omitted');
const serialized = JSON.stringify(insertedMetadata);
for (const value of ['private-token-value', '1234567890123456', '123456', 'private nested value', 'private-secret-value', 'person@example.com']) {
  assert.equal(serialized.includes(value), false, `sensitive value ${value} is absent from stored metadata`);
}
const foreignRequest = new Request('https://staffportal.test/api/activity/record', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': 'request-b' },
  body: JSON.stringify({ module: 'payroll', action: 'interaction', companyId: 'company-b' })
});
const foreignResponse = await routeGroupErp(foreignRequest, env, context);
assert.equal(foreignResponse.status, 404, 'company attribution outside the authenticated session is neutrally denied');
assert.equal(insertCount, 1, 'unauthorized company attribution creates no activity row');
console.log('PASS: client activity metadata allowlist and recursive secret minimization');
