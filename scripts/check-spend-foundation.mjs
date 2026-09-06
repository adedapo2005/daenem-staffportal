import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), 'utf8');
const expect = (file, source, needle) => {
  if (!source.includes(needle)) throw new Error(`${file} is missing required spend foundation contract: ${needle}`);
};

const runtime = read('worker/runtime.ts');
const spend = read('worker/spend.ts');
const procurement = read('migrations/0005_commerce_printing.sql');
const migration = read('migrations/0055_spend_cost_profit_foundation.sql');
const truthMigration = read('migrations/0056_spend_truth_and_controlled_mapping.sql');
const commitmentMigration = read('migrations/0057_spend_commitment_truth.sql');
const offline = read('src/offline-platform.ts');
const entry = read('src/spend-entry.tsx');

expect('worker/runtime.ts', runtime, "import { routeSpend } from './spend';");
expect('worker/runtime.ts', runtime, "url.pathname.startsWith('/api/spend/')");
expect('worker/runtime.ts', runtime, 'routeSpend(request, env, context)');
for (const table of ['spend_expense_requests', 'spend_expense_allocations', 'spend_expense_evidence', 'spend_expense_approvals', 'spend_accounting_postings', 'spend_expense_events']) expect('0055 migration', migration, `CREATE TABLE IF NOT EXISTS ${table}`);
expect('0005 procurement migration', procurement, 'CREATE TABLE IF NOT EXISTS purchase_orders');
for (const contract of ['payment_state', 'finance_posting_state', 'spend_expense_payments', 'spend_accounting_account_mappings', 'spend_request_truth', "status='settled'", "posting_state='posted'"]) expect('0056 migration', truthMigration, contract);
for (const contract of ['ALTER TABLE purchase_orders ADD COLUMN spend_expense_request_id', 'spend_purchase_order_commitments', 'DROP VIEW IF EXISTS spend_request_truth', 'committed_kobo', 'commitment_state', "state='active'", "'purchase_order'", "'released'", "'reversed'"]) expect('0057 commitment migration', commitmentMigration, contract);
if (/CREATE TABLE IF NOT EXISTS\s+spend_expense_commitments/i.test(commitmentMigration)) throw new Error('0057 must reuse Procurement purchase_orders, not create a duplicate commitment ledger.');
for (const endpoint of ['/api/spend/bootstrap', '/api/spend/requests', '/api/spend/approvals', '/api/spend/owner/overview', '/api/spend/owner/detail', '/api/spend/admin/master', '/api/spend/erp-context']) expect('worker/spend.ts', spend, endpoint);
expect('worker/spend.ts', spend, 'evidenceMatch && request.method === \'PUT\'');
for (const erp of ['printing', 'bakery', 'autos', 'logistics', 'properties', 'finance']) expect('worker/spend.ts', spend, `'${erp}'`);
for (const kind of ['expense.draft.save', 'expense.request.submit', 'syncExpenseSubmission', 'evidence:${attachment.metadata.id}']) expect('offline-platform.ts', offline, kind);
for (const forbidden of ['expense.evidence.upload', 'Evidence is encrypted and queued for upload after the request is created']) if (offline.includes(forbidden)) throw new Error(`offline-platform.ts must not contain standalone evidence submission contract: ${forbidden}`);
for (const contract of ['paymentState', 'financePostingState', 'spend_request_truth', 'spend_purchase_order_commitments', 'committedKobo', 'commitmentState', 'spend_expense_payments', "status='settled'", 'payroll_canonical', 'controlledPostingAccount', 'finance-setup', 'posting_state']) expect('worker/spend.ts', spend, contract);
if (spend.includes('commitmentStates') || /status\s+IN\s*\(\s*'committed'[^)]*'closed'/i.test(spend)) throw new Error('worker/spend.ts must not infer committed spend from workflow statuses.');
for (const contract of ['roleAssignedForCompany', 'requiredPermission', 'approvalPermissionSatisfied', 'master_value_edited', 'master_value_merged', 'before', 'after']) expect('worker/spend.ts', spend, contract);
for (const contract of ['allocationTemplateId', 'Select approved template', 'beneficiaryCostCenters', 'rawCalculatedShareKobo', 'roundingAdjustmentKobo']) expect('spend-entry.tsx', entry + spend, contract);
if (entry.includes('window.prompt')) throw new Error('Spend UI must use controlled modal/sheet input, not window.prompt.');
for (const phrase of ['My Expense Requests', 'controlled', 'Submit request', 'Offline: request safely queued', 'ERP_CONTEXTS', 'Show Both', 'Network location is not GPS']) expect('spend-entry.tsx', entry, phrase);
expect('spend-entry.tsx', entry, "import { OfflinePlatformProvider, useOfflinePlatform } from './offline-sync';");
expect('spend-entry.tsx', entry, '<OfflinePlatformProvider context={context}>');
expect('spend-entry.tsx', entry, 'isNetworkTransportFailure(error)');
expect('spend-entry.tsx', entry, 'setContext(null)');
expect('spend worker integration', read('scripts/test-spend-worker-runtime.mjs'), "runtimeEntrypoint: 'worker/runtime.ts'");

console.log('Spend foundation contract checks passed.');
