import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const migration = read('migrations/0058_purchase_order_commitment_audit.sql');
const worker = read('worker/spend.ts');
const runtime = read('scripts/test-spend-worker-runtime.mjs');
const must = (condition, message) => {
  if (!condition) throw new Error(`Spend commitment audit contract failed: ${message}`);
};

for (const field of [
  'purchase_order_id', 'company_id', 'spend_expense_request_id', 'from_status',
  'to_status', 'amount_kobo', 'actor_employee_id', 'session_id', 'reason',
  'source_reference', 'request_id', 'idempotency_key', 'device_id', 'ip_address',
  'network_location', 'client_timezone', 'captured_at', 'server_received_at',
  'metadata_json',
]) must(migration.includes(field), `event schema field ${field} is missing`);
must(migration.includes('CREATE TRIGGER IF NOT EXISTS purchase_order_status_events_no_update'), 'update trigger is missing');
must(migration.includes('CREATE TRIGGER IF NOT EXISTS purchase_order_status_events_no_delete'), 'delete trigger is missing');
must(migration.includes("SELECT RAISE(ABORT, 'purchase_order_status_events is append-only')"), 'append-only trigger does not fail closed');
must(migration.includes("po.purchase_order_status IN ('ordered', 'partially_received')"), 'approved is not excluded from active source states');
must(!/po\.purchase_order_status IN \('approved'\s*,\s*'ordered'\s*,\s*'partially_received'\)/i.test(migration), 'approved is still mapped to active commitment');
must(migration.includes("e.to_status IN ('ordered', 'partially_received')") && migration.includes('e.amount_kobo=po.amount_kobo'), 'active commitment is not backed by matching amount-bound event evidence');
must(migration.includes("po.purchase_order_status='ordered' AND e.to_status='ordered'"), 'an ordered PO must have an ordered transition event, not merely a later partial-receipt event');
must(migration.includes('commitment_audit_state') && migration.includes('unverified_commitment_kobo'), 'missing audit evidence is not exposed separately');
must(migration.includes('e.server_received_at') && migration.includes('released_at') && migration.includes('reversed_at'), 'canonical transition timestamps are missing');
must(migration.includes("c.commitment_audit_state='verified'") && migration.includes("c.commitment_audit_state='missing_evidence'"), 'truth view does not exclude unaudited commitment amounts');

for (const contract of ['commitmentAuditState', 'unverifiedCommitmentKobo', 'commitmentAuditTimeline', 'commitmentEventId', 'releaseEventId', 'reversalEventId', 'committedUsesVerifiedProcurementStatusEvents', 'unauditedCommitmentsExcluded']) must(worker.includes(contract), `Worker commitment audit contract ${contract} is missing`);
must(worker.includes('actorEmployeeId') && worker.includes('sessionId') && worker.includes('deviceId') && worker.includes('ipAddress') && worker.includes('networkLocation') && worker.includes('clientTimezone') && worker.includes('serverReceivedAt'), 'Owner audit timeline omits required transition evidence');
must(worker.includes("pc.commitment_audit_state='verified'"), 'Owner committed metric counts unaudited active Purchase Orders');
must(runtime.includes('approved Purchase Order is not commitment') && runtime.includes('ordered Purchase Order without audit') && runtime.includes('ordered Purchase Order with audit') && runtime.includes('received Purchase Order release') && runtime.includes('cancelled Purchase Order reversal') && runtime.includes('direct SQL status change fails closed'), 'runtime matrix does not cover commitment audit boundaries');
must(runtime.includes('status-event update append-only guard') && runtime.includes('status-event delete append-only guard') && runtime.includes('duplicate Purchase Order status event retry'), 'runtime matrix does not cover append-only and idempotency boundaries');

console.log('SPEND_COMMITMENT_AUDIT_CONTRACT_TESTS=PASS');
