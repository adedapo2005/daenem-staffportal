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
const env = {
  DB: {
    prepare(sql) {
      assert.match(sql, /INSERT INTO activity_logs/);
      return {
        bind(...args) {
          insertedMetadata = JSON.parse(args.at(-1));
          return { run: async () => ({ success: true }) };
        }
      };
    }
  }
};
const context = { employee: { id: 'employee-a' }, sessionId: 'session-a', companies: [], roles: [] };
const request = new Request('https://staffportal.test/api/activity/record', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    module: 'payroll',
    action: 'bank_payment_draft_created',
    path: '/admin/payroll',
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
console.log('PASS: client activity metadata allowlist and recursive secret minimization');
