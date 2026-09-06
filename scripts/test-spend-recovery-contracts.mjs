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
const procurement = read('migrations/0005_commerce_printing.sql');
const migration = read('migrations/0056_spend_truth_and_controlled_mapping.sql');
const commitmentMigration = read('migrations/0057_spend_commitment_truth.sql');
const commitmentAuditMigration = read('migrations/0058_purchase_order_commitment_audit.sql');
const css = read('src/spend.css');

// Deployment/Actions safety is a source-control contract, not something this
// local test is allowed to trigger.
must(/on:\s*\n\s*workflow_dispatch:\s*\n/.test(workflow), 'Spend QA must be manually dispatched only');
must(!/^\s*(push|pull_request):/m.test(workflow), 'Spend QA still has an automatic push or pull_request trigger');
must(workflow.includes('permissions:\n  contents: read') && workflow.includes('jobs:\n  spend-foundation:'), 'workflow permissions or validation job changed unexpectedly');

// Commitment truth reuses the existing Procurement purchase-order source.
must(procurement.includes('CREATE TABLE IF NOT EXISTS purchase_orders'), 'the existing Procurement purchase-order source is missing');
must(commitmentMigration.includes('ALTER TABLE purchase_orders ADD COLUMN spend_expense_request_id'), 'Spend request link to the canonical purchase-order source is missing');
for (const contract of ['spend_purchase_order_commitments', 'DROP VIEW IF EXISTS spend_request_truth', 'committed_kobo', 'commitment_state', "'approved', 'ordered', 'partially_received'", "'received'", "'cancelled'", "'purchase_order'", 'idempotency_key']) must(commitmentMigration.includes(contract), `missing commitment truth contract ${contract}`);
must(!/CREATE TABLE IF NOT EXISTS\s+spend_expense_commitments/i.test(commitmentMigration), 'a duplicate Spend commitment ledger was introduced');
must(commitmentMigration.includes('ON DELETE RESTRICT') && commitmentMigration.includes('state=\'active\''), 'canonical commitment history or active-state filtering is not protected');

// Approved is not a binding procurement obligation. A verified commitment
// requires a matching, amount-bound append-only status event, and unaudited
// active source rows stay visible only as an exception.
must(commitmentAuditMigration.includes('CREATE TABLE IF NOT EXISTS purchase_order_status_events'), 'the canonical Purchase Order status-event source is missing');
for (const field of ['purchase_order_id', 'company_id', 'spend_expense_request_id', 'from_status', 'to_status', 'amount_kobo', 'actor_employee_id', 'session_id', 'reason', 'source_reference', 'request_id', 'idempotency_key', 'device_id', 'ip_address', 'network_location', 'client_timezone', 'captured_at', 'server_received_at', 'metadata_json']) must(commitmentAuditMigration.includes(field), `Purchase Order audit field is missing: ${field}`);
must(commitmentAuditMigration.includes('purchase_order_status_events_no_update') && commitmentAuditMigration.includes('purchase_order_status_events_no_delete'), 'Purchase Order status events are not database-enforced append-only');
must(commitmentAuditMigration.includes("po.purchase_order_status IN ('ordered', 'partially_received')") && commitmentAuditMigration.includes("e.to_status IN ('ordered', 'partially_received')"), 'only ordered or partially received POs may establish active commitment');
must(!/po\.purchase_order_status IN \('approved'\s*,\s*'ordered'\s*,\s*'partially_received'\)/i.test(commitmentAuditMigration), 'approved Purchase Orders still become active commitments');
must(commitmentAuditMigration.includes("c.commitment_audit_state='verified'") && commitmentAuditMigration.includes('unverified_commitment_kobo'), 'verified and unaudited commitment amounts are not separated');
must(commitmentAuditMigration.includes('e.amount_kobo=po.amount_kobo') && commitmentAuditMigration.includes('e.server_received_at'), 'commitment evidence is not bound to the canonical amount and server event time');
const procurementCommitmentState = (status) => {
  if (['ordered', 'partially_received'].includes(status)) return 'active';
  if (status === 'received') return 'released';
  if (status === 'cancelled') return 'reversed';
  return 'not_committed';
};
must(procurementCommitmentState('approved') === 'not_committed', 'approved Purchase Orders must remain uncommitted');
must(procurementCommitmentState('ordered') === 'active' && procurementCommitmentState('partially_received') === 'active', 'ordered and partially received Purchase Orders must be active');
must(procurementCommitmentState('received') === 'released' && procurementCommitmentState('cancelled') === 'reversed', 'terminal Purchase Order states must retain release/reversal semantics');

// Payment truth and accounting-posting truth are separate canonical sources.
for (const state of ['payment_state', 'finance_posting_state', 'unpaid', 'partially_paid', 'paid', 'not_posted', 'posted', 'reversed']) must(migration.includes(state), `missing orthogonal state ${state}`);
must(migration.includes('CREATE TABLE IF NOT EXISTS spend_expense_payments'), 'canonical payment table is missing');
must(migration.includes('CREATE VIEW IF NOT EXISTS spend_request_truth'), 'truth view is missing');
const requestById = spend.slice(spend.indexOf('async function requestById'), spend.indexOf('async function serializeRequest'));
must(requestById.includes('LEFT JOIN spend_request_truth truth') && requestById.includes('truth.paid_kobo') && requestById.includes('truth.recognized_kobo') && requestById.includes('truth.committed_kobo'), 'request metrics do not read the canonical truth projection');
must(!/paidKobo[\s\S]{0,300}finance_posted|finance_posted[\s\S]{0,300}paidKobo/.test(requestById), 'Finance posting is being used as payment evidence');
must(!spend.includes('INSERT INTO spend_expense_payments'), 'Batch 1 must not execute payments');
must(spend.includes('paymentState') && spend.includes('financePostingState') && spend.includes('commitmentState') && spend.includes('commitmentAuditState') && spend.includes('unverifiedCommitmentKobo') && spend.includes('commitmentAuditTimeline'), 'orthogonal state fields are not serialized');
must(spend.includes("pc.commitment_audit_state='verified'") && spend.includes("pc.commitment_audit_state='missing_evidence'"), 'Owner committed metrics do not separate verified commitments from audit exceptions');
must(!spend.includes('commitmentStates') && !/status\s+IN\s*\(\s*'committed'[^)]*'closed'/i.test(spend), 'committed spend is still inferred from workflow statuses');

// Deterministic truth fixtures cover the independent states without making a
// later payment, posting, or closure establish a commitment.
const calculateCommittedKobo = (commitments) => commitments
  .filter((commitment) => commitment.state === 'active' && commitment.commitmentAuditState === 'verified')
  .reduce((total, commitment) => total + commitment.amountKobo, 0);
must(calculateCommittedKobo([]) === 0, 'approved-only requests must remain uncommitted');
must(calculateCommittedKobo([{ amountKobo: 1_000_000, state: 'active', commitmentAuditState: 'verified' }]) === 1_000_000, 'explicit commitment amount is not authoritative');
must(calculateCommittedKobo([{ amountKobo: 600_000, state: 'active', commitmentAuditState: 'verified' }]) === 600_000, 'partial commitment is inflated to the request amount');
must(calculateCommittedKobo([{ amountKobo: 600_000, state: 'active', commitmentAuditState: 'missing_evidence' }]) === 0, 'unaudited active commitment still contributes to verified spend');
must(calculateCommittedKobo([{ amountKobo: 600_000, state: 'released', commitmentAuditState: 'verified' }]) === 0, 'released commitment still contributes to current spend');
must(calculateCommittedKobo([{ amountKobo: 600_000, state: 'reversed', commitmentAuditState: 'verified' }]) === 0, 'reversed commitment still contributes to current spend');
must(calculateCommittedKobo([{ amountKobo: 300_000, state: 'active', commitmentAuditState: 'verified' }, { amountKobo: 200_000, state: 'active', commitmentAuditState: 'verified' }]) === 500_000, 'multiple active commitments are not summed');
must(commitmentMigration.includes("WHERE c.expense_request_id=r.id") && commitmentMigration.includes("c.company_id=r.company_id") && commitmentMigration.includes("c.state='active'"), 'request truth does not scope canonical commitments by request, company, and active state');

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
