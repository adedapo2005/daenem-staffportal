import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');
const expect = (file, source, needle) => {
  if (!source.includes(needle)) throw new Error(`${file} is missing required spend foundation contract: ${needle}`);
};

const runtime = read('worker/runtime.ts');
const spend = read('worker/spend.ts');
const migration = read('migrations/0055_spend_cost_profit_foundation.sql');
const offline = read('src/offline-platform.ts');
const entry = read('src/spend-entry.tsx');

expect('worker/runtime.ts', runtime, "import { routeSpend } from './spend';");
expect('worker/runtime.ts', runtime, "url.pathname.startsWith('/api/spend/')");
expect('worker/runtime.ts', runtime, 'routeSpend(request, env, context)');
for (const table of ['spend_expense_requests', 'spend_expense_allocations', 'spend_expense_evidence', 'spend_expense_approvals', 'spend_accounting_postings', 'spend_expense_events']) expect('0055 migration', migration, `CREATE TABLE IF NOT EXISTS ${table}`);
for (const endpoint of ['/api/spend/bootstrap', '/api/spend/requests', '/api/spend/approvals', '/api/spend/owner/overview', '/api/spend/owner/detail', '/api/spend/admin/master', '/api/spend/evidence/', '/api/spend/erp-context']) expect('worker/spend.ts', spend, endpoint);
for (const erp of ['printing', 'bakery', 'autos', 'logistics', 'properties', 'finance']) expect('worker/spend.ts', spend, `'${erp}'`);
for (const kind of ['expense.draft.save', 'expense.request.submit', 'expense.evidence.upload']) expect('offline-platform.ts', offline, kind);
for (const phrase of ['My Expense Requests', 'controlled', 'Submit request', 'Offline: request safely queued', 'ERP_CONTEXTS', 'Show Both', 'Network location is not GPS']) expect('spend-entry.tsx', entry, phrase);
expect('spend worker integration', read('scripts/test-spend-worker-runtime.mjs'), "runtimeEntrypoint: 'worker/runtime.ts'");

console.log('Spend foundation contract checks passed.');
