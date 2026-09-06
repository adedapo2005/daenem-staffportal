import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (file) => readFileSync(join(root, file), 'utf8');
const migration = read('migrations/0058_purchase_order_commitment_audit.sql');
const transitionMigration = read('migrations/0059_purchase_order_transition_enforcement.sql');
const worker = read('worker/spend.ts');
const procurementWorker = read('worker/procurement.ts');
const runtimeWorker = read('worker/runtime.ts');
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

for (const contract of [
  'ALTER TABLE purchase_orders ADD COLUMN last_status_event_id',
  'purchase_orders_spend_insert_requires_transition',
  'purchase_order_status_events_validate_transition',
  'purchase_orders_spend_status_requires_event',
  "NEW.from_status='approved' AND NEW.to_status IN ('ordered', 'cancelled')",
  "NEW.from_status='ordered' AND NEW.to_status IN ('partially_received', 'received', 'cancelled')",
  "NEW.from_status='partially_received' AND NEW.to_status IN ('received', 'cancelled')",
  'NEW.actor_employee_id IS NULL',
  'NEW.session_id IS NULL',
  "length(trim(COALESCE(NEW.request_id, ''))) = 0",
  'po.spend_expense_request_id=NEW.spend_expense_request_id',
  'po.po_no=NEW.source_reference',
  'e.source_reference=po.po_no',
  'e.from_status=OLD.status',
  'e.to_status=NEW.status',
  'NEW.last_status_event_id',
]) must(transitionMigration.includes(contract), `transition enforcement contract ${contract} is missing`);
must(procurementWorker.includes('/api/procurement/purchase-orders/') && procurementWorker.includes("hasPermission(context, 'procurement.access', 'approve'"), 'authenticated Procurement transition route or permission is missing');
must(procurementWorker.includes('await env.DB.batch([') && procurementWorker.includes('INSERT INTO purchase_order_status_events') && procurementWorker.includes('UPDATE purchase_orders'), 'PO mutation and audit append are not implemented in one batch');
must(/const\s*\[eventResult,\s*updateResult,\s*auditResult\]\s*=\s*await\s+env\.DB\.batch\(\[/s.test(procurementWorker), 'D1 batch result metadata is not captured for event/update/audit statements');
must(procurementWorker.includes('FROM purchase_order_status_events e') && procurementWorker.includes('JOIN purchase_orders po ON po.id=e.purchase_order_id') && procurementWorker.includes('po.last_status_event_id=e.id') && procurementWorker.includes('po.status=e.to_status'), 'success audit is not conditionally bound to the canonical event and final Purchase Order state');
must(!/INSERT INTO audit_logs[\s\S]*?\)\s*VALUES\s*\(/s.test(procurementWorker), 'canonical Procurement success audit regressed to an unconditional VALUES insert');
must(runtimeWorker.includes("import { routeProcurement } from './procurement';") && runtimeWorker.includes("url.pathname.startsWith('/api/procurement/')"), 'Procurement route is not authenticated/routed by the Worker');

for (const contract of ['commitmentAuditState', 'unverifiedCommitmentKobo', 'commitmentAuditTimeline', 'commitmentEventId', 'releaseEventId', 'reversalEventId', 'committedUsesVerifiedProcurementStatusEvents', 'unauditedCommitmentsExcluded']) must(worker.includes(contract), `Worker commitment audit contract ${contract} is missing`);
must(worker.includes('actorEmployeeId') && worker.includes('sessionId') && worker.includes('deviceId') && worker.includes('ipAddress') && worker.includes('networkLocation') && worker.includes('clientTimezone') && worker.includes('serverReceivedAt'), 'Owner audit timeline omits required transition evidence');
must(worker.includes("pc.commitment_audit_state='verified'"), 'Owner committed metric counts unaudited active Purchase Orders');
must(runtime.includes('approved Purchase Order is not commitment') && runtime.includes('real HTTP approved to ordered') && runtime.includes('real HTTP received release') && runtime.includes('real HTTP cancelled reversal') && runtime.includes('legacy missing-evidence read model') && runtime.includes('direct SQL Purchase Order status rejection'), 'runtime matrix does not cover commitment audit boundaries');
must(runtime.includes('status-event update append-only guard') && runtime.includes('status-event delete append-only guard') && runtime.includes('idempotent Procurement transition retry'), 'runtime matrix does not cover append-only and idempotency boundaries');
for (const label of ['real HTTP approved to ordered', 'employee Procurement transition', 'company-isolated Procurement transition', 'invalid backward Procurement transition', 'sparse status event rejection', 'direct SQL Purchase Order status rejection', 'real HTTP received release', 'real HTTP cancelled reversal', 'approved to cancelled Procurement transition', 'idempotency conflict']) must(runtime.includes(label), `runtime matrix does not cover ${label}`);
must(runtime.includes('concurrent different-key Procurement transitions') && runtime.includes('Promise.all'), 'runtime matrix does not cover concurrent different-key stale requests');

console.log('SPEND_COMMITMENT_AUDIT_CONTRACT_TESTS=PASS');
