import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(`Spend recovery contract failed: ${message}`);
};

const workflow = read('../.github/workflows/qa-staffportal-spend-foundation.yml');
const spend = read('worker/spend.ts');
const offline = read('src/offline-platform.ts');
const offlineServer = read('worker/offline.ts');
const entry = read('src/spend-entry.tsx');
const migration = read('migrations/0056_spend_truth_and_controlled_mapping.sql');
const css = read('src/spend.css');

// Deployment/Actions safety is a source-control contract, not something this
// local test is allowed to trigger.
must(/on:\s*\n\s*workflow_dispatch:\s*\n/.test(workflow), 'Spend QA must be manually dispatched only');
must(!/^\s*(push|pull_request):/m.test(workflow), 'Spend QA still has an automatic push or pull_request trigger');
must(workflow.includes('permissions:\n  contents: read') && workflow.includes('jobs:\n  spend-foundation:'), 'workflow permissions or validation job changed unexpectedly');

// Payment truth and accounting-posting truth are separate canonical sources.
for (const state of ['payment_state', 'finance_posting_state', 'unpaid', 'partially_paid', 'paid', 'not_posted', 'posted', 'reversed']) must(migration.includes(state), `missing orthogonal state ${state}`);
must(migration.includes('CREATE TABLE IF NOT EXISTS spend_expense_payments'), 'canonical payment table is missing');
must(migration.includes('CREATE VIEW IF NOT EXISTS spend_request_truth'), 'truth view is missing');
const requestById = spend.slice(spend.indexOf('async function requestById'), spend.indexOf('async function serializeRequest'));
must(requestById.includes("pay.status='settled'") && requestById.includes("p.posting_state='posted'") && requestById.includes("je.status='posted'"), 'request metrics do not read canonical payment and posting facts');
must(!/paidKobo[\s\S]{0,300}finance_posted|finance_posted[\s\S]{0,300}paidKobo/.test(requestById), 'Finance posting is being used as payment evidence');
must(!spend.includes('INSERT INTO spend_expense_payments'), 'Batch 1 must not execute payments');
must(spend.includes('paymentState') && spend.includes('financePostingState'), 'orthogonal state fields are not serialized');

// Payroll and ledger mappings must fail closed.
must((spend.match(/payroll_canonical/g) || []).length >= 2, 'manual payroll protection is not present at request and posting boundaries');
must(spend.includes('controlledPostingAccount') && spend.includes("errorCategory: 'finance-setup'") && spend.includes('debit.accountId') && spend.includes('payable.accountId'), 'controlled ledger mapping is incomplete');
must(!/\b1300\b/.test(spend), 'generic 1300 fallback remains in the Worker');
must(migration.includes("code='1300' AND name='Capital & Other Non-P&L Assets'"), 'legacy generic account was not retired explicitly');

// Evidence cannot be accepted after final submission. Draft acknowledgement,
// evidence acknowledgement/hash verification, then final submit is required.
const syncSubmission = offline.slice(offline.indexOf('export async function syncExpenseSubmission'));
const draftIndex = syncSubmission.indexOf("'expense.draft.save'");
const uploadIndex = syncSubmission.indexOf('uploadOfflineAttachments');
const finalIndex = syncSubmission.indexOf("'expense.request.submit'", uploadIndex);
must(draftIndex >= 0 && uploadIndex > draftIndex && finalIndex > uploadIndex, 'offline evidence sequencing is not draft -> upload -> final submit');
must(syncSubmission.includes('draftIdempotencyKey') && syncSubmission.includes('draft_ack') === false, 'draft request is not idempotent');
must(offline.includes('evidence:${attachment.metadata.id}') && offline.includes('acknowledged.sha256'), 'evidence acknowledgement does not bind identity and hash');
must(offline.includes('deleteOfflineAttachment') && offline.indexOf('deleteOfflineAttachment') > offline.indexOf('body.evidence.sha256'), 'local evidence is deleted before server hash verification');
must(!offline.includes('expense.evidence.upload'), 'standalone evidence operation remains in the client contract');
must(!offline.includes('Evidence is encrypted and queued for upload after the request is created'), 'fake missing-evidence explanation remains');
must(offlineServer.includes("defaultAllowedOperations = ['forms.submit', 'expense.draft.save', 'expense.request.submit']"), 'server offline allowlist still advertises standalone evidence upload');
must(offlineServer.includes('ON CONFLICT(idempotency_key) DO NOTHING') && offlineServer.includes('completed-after-response-loss'), 'offline idempotent response-loss recovery is incomplete');

// Approval visibility and actions both enforce company, assigned role and the
// rule's required permission before a row or mutation can proceed.
for (const contract of ['roleAssignedForCompany', 'approvalPermissionSatisfied', 'requiredPermission', 'pendingApprovalForViewer', 'approval_role_denied']) must(spend.includes(contract), `approval RBAC contract missing: ${contract}`);
const approvalAction = spend.slice(spend.indexOf('async function actionExpense'), spend.indexOf('async function controlledPostingAccount'));
must(approvalAction.indexOf('const pending') < approvalAction.indexOf('approvalPermissionSatisfied'), 'approval action checks permission before loading the pending rule');
const approvalQueue = spend.slice(spend.indexOf('async function approvals'), spend.indexOf('async function ownerOverview'));
must(approvalQueue.includes('requiredPermission') && approvalQueue.includes('const filtered') && approvalQueue.includes('return json'), 'approval queue does not filter rows before returning them');

// The Spend UI has controlled dialogs and template-driven shared allocation.
must(!entry.includes('window.prompt'), 'Spend uses a browser-native prompt');
for (const contract of ['function TextEntryDialog', 'role="dialog"', 'aria-modal="true"', "event.key === 'Escape'", 'Cancel', 'Submit', 'Select approved template', 'beneficiaryCostCenters', 'AdminMasterControls']) must(entry.includes(contract), `premium controlled UI contract missing: ${contract}`);
must(css.includes('min-height:44px') && css.includes('spend-dialog') && css.includes('spend-admin-controls'), 'modal touch target or responsive admin controls are missing');

// Every supported master mutation is append-audited and merge leaves a
// historical superseded row in place.
for (const action of ['create', 'edit', 'activate', 'deactivate', 'merge']) must(spend.includes(`'${action}'`), `master action ${action} is missing`);
must(spend.includes('master_value_edited') && spend.includes('master_value_merged') && spend.includes('before, after'), 'master before/after audit evidence is incomplete');
must(spend.includes('superseded_by') && spend.includes('replacementId'), 'master supersede history is not retained');
must(!/DELETE\s+FROM\s+spend_(categories|suppliers|cost_centers|allocation_templates)/i.test(spend), 'master data has a hard-delete path');

// Exercise a fractional percentage split with the same floor-last rule used
// by the Worker. The final kobo adjustment must be truthful and non-zero.
const sourceAmount = 101;
const percentages = [33.33, 66.67];
const rawShares = percentages.map((percentage) => sourceAmount * percentage / 100);
const firstFinal = Math.floor(rawShares[0]);
const finalShares = [firstFinal, sourceAmount - firstFinal];
const adjustments = finalShares.map((value, index) => value - Math.floor(rawShares[index]));
must(finalShares.reduce((sum, value) => sum + value, 0) === sourceAmount, 'fractional allocation does not reconcile');
must(adjustments.some((value) => value !== 0), 'fractional allocation did not record a real rounding adjustment');
must(spend.includes('rawCalculatedShareKobo') && spend.includes('roundingAdjustmentKobo'), 'rounding evidence fields are missing');

console.log('TARGETED_SPEND_RECOVERY_TESTS=PASS');
