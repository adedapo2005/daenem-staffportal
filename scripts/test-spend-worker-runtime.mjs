import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const root = process.cwd();
const sourceConfig = path.join(root, 'wrangler.jsonc');
const testConfig = path.join(root, '.wrangler-spend-runtime-test.jsonc');
const databaseName = 'daenem-spend-runtime-test';
const pepper = 'spend-runtime-test-pepper';
const wrangler = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function quote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function uid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

function runWrangler(args, label = 'wrangler') {
  return new Promise((resolve, reject) => {
    const child = spawn(wrangler, args, { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`wrangler timed out:\n${output}`)); }, 60_000);
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timeout); if (code === 0) resolve(output); else reject(new Error(`${label} failed (${code}):\n${output}`)); });
  });
}

async function expectWranglerFailure(args, label, expectedText) {
  try {
    await runWrangler(args, label);
    throw new Error(`${label} unexpectedly succeeded`);
  } catch (error) {
    if (String(error).includes('unexpectedly succeeded')) throw error;
    if (expectedText && !String(error).includes(expectedText)) throw error;
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function request(baseUrl, token, endpoint, init = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('cookie', `daenem_workforce_session=${token}`);
  const response = await fetch(baseUrl + endpoint, { ...init, headers, cache: 'no-store' });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  return { status: response.status, body, cache: response.headers.get('cache-control') || '', frame: response.headers.get('x-frame-options') || '' };
}

function expect(label, result, status) {
  if (result.status !== status) throw new Error(`${label}: expected ${status}, received ${result.status} ${JSON.stringify(result.body)}`);
  if (!result.cache.toLowerCase().includes('no-store')) throw new Error(`${label}: missing cache-control no-store`);
  if (result.frame !== 'DENY') throw new Error(`${label}: missing security wrapper`);
}
function assert(label, condition, value) { if (!condition) throw new Error(`${label}: ${JSON.stringify(value)}`); }

function expensePayload(requestId, overrides = {}) {
  return {
    requestId,
    companyId: 'company-printing',
    categoryId: 'spend-category-office-supplies',
    costCenterId: 'spend-cc-PRINT-general',
    purpose: 'Offline stationery request',
    businessReason: 'Required for an authorized production handover.',
    totalKobo: 125000,
    directShared: 'direct',
    evidenceCount: 1,
    lines: [{ description: 'Stationery', amountKobo: 125000, categoryId: 'spend-category-office-supplies', directShared: 'direct' }],
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    clientTimezone: 'Africa/Lagos',
    ...overrides,
  };
}

function syncBody(operationId, idempotencyKey, payload, overrides = {}) {
  return {
    operationId, idempotencyKey, kind: 'expense.request.submit', employeeId: 'qa-spend-employee', companyId: 'company-printing',
    entityType: 'spend_expense_request', entityId: payload.requestId, capturedAt: payload.capturedAt, clientTimezone: payload.clientTimezone,
    payload: { ...payload, submit: true }, ...overrides,
  };
}

function purchaseOrderFixture({ id, poNo, requestId, amountKobo, status, companyId = 'company-printing' }) {
  return `INSERT OR IGNORE INTO purchase_orders(id,company_id,po_no,order_date,status,currency,subtotal_kobo,tax_kobo,total_kobo,created_by,approved_by,approved_at,spend_expense_request_id) VALUES (${quote(id)},${quote(companyId)},${quote(poNo)},'2026-09-05',${quote(status)},'NGN',${amountKobo},0,${amountKobo},'qa-spend-manager','qa-spend-manager',CURRENT_TIMESTAMP,${quote(requestId)});`;
}

function purchaseOrderStatusEventFixture({ id, purchaseOrderId, requestId, amountKobo, fromStatus, toStatus, companyId = 'company-printing', idempotencyKey = id, actorId = 'qa-spend-manager', sessionId = 'qa-spend-manager-session', requestIdHeader = `qa-po-request-${id}`, reason = '', serverReceivedAt = '2026-09-05T14:30:00.000Z', capturedAt = '2026-09-05T14:29:59.000Z' }) {
  const metadata = JSON.stringify({ source: 'commitment-audit-runtime', actorEmployeeId: actorId, sessionId, requestId: requestIdHeader, deviceId: 'qa-spend-manager-device', ipAddress: '198.51.100.21', networkLocation: 'Ibadan, NG (approximate)', clientTimezone: 'Africa/Lagos', capturedAt, serverReceivedAt });
  return `INSERT OR IGNORE INTO purchase_order_status_events(id,purchase_order_id,company_id,spend_expense_request_id,from_status,to_status,amount_kobo,actor_employee_id,session_id,reason,source_reference,request_id,idempotency_key,device_id,ip_address,network_location,client_timezone,captured_at,server_received_at,metadata_json,created_at) VALUES (${quote(id)},${quote(purchaseOrderId)},${quote(companyId)},${quote(requestId)},${fromStatus ? quote(fromStatus) : 'NULL'},${quote(toStatus)},${amountKobo},${quote(actorId)},${quote(sessionId)},${reason ? quote(reason) : 'NULL'},${quote(`PO-${purchaseOrderId}`)},${quote(requestIdHeader)},${quote(idempotencyKey)},'qa-spend-manager-device','198.51.100.21','Ibadan, NG (approximate)','Africa/Lagos',${quote(capturedAt)},${quote(serverReceivedAt)},${quote(metadata)},${quote(serverReceivedAt)});`;
}

async function main() {
  const original = JSON.parse(await fs.readFile(sourceConfig, 'utf8'));
  const ownerToken = 'qa-spend-owner-token';
  const managerToken = 'qa-spend-manager-token';
  const managerBToken = 'qa-spend-manager-b-token';
  const employeeToken = 'qa-spend-employee-token';
  const ownerHash = sha256(ownerToken + ':' + pepper);
  const managerHash = sha256(managerToken + ':' + pepper);
  const managerBHash = sha256(managerBToken + ':' + pepper);
  const employeeHash = sha256(employeeToken + ':' + pepper);
  const config = {
    $schema: original.$schema,
    name: 'daenem-spend-runtime-test', workers_dev: true, preview_urls: false,
    compatibility_date: '2026-08-08', main: original.main, limits: original.limits, assets: original.assets,
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: '00000000-0000-0000-0000-000000000055', migrations_dir: 'migrations' }],
    r2_buckets: [{ binding: 'FILES', bucket_name: 'daenem-spend-runtime-test-files' }],
    vars: { APP_NAME: 'Daenem Workforce Hub', APP_STAGE: 'test', AUTH_PEPPER: pepper, APP_VERSION: 'spend-runtime-test', TIMEZONE: 'Africa/Lagos' },
  };
  const managerRolePermissions = [
    "INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT 'qa-spend-manager-'||p.id,'role-print-manager',p.id,CASE WHEN p.code='expense.approve' THEN 'approve' ELSE 'view' END FROM permissions p WHERE p.code IN ('expense.approve','expense.review');",
  ].join('\n');
  const employeeRolePermissions = [
    "INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT 'qa-spend-employee-'||p.id,'role-print-designer',p.id,CASE WHEN p.code='expense.requests' THEN 'create' ELSE 'view' END FROM permissions p WHERE p.code IN ('expense.requests','expense.own');",
  ].join('\n');
  const seed = [
    "INSERT OR IGNORE INTO employees(id,employee_no,display_name,email,job_title,department,employment_status) VALUES ('qa-spend-manager','QA-SM-001','Spend Manager','qa-spend-manager@example.invalid','Operations Manager','Operations','active');",
    "INSERT OR IGNORE INTO employees(id,employee_no,display_name,email,job_title,department,employment_status) VALUES ('qa-spend-manager-b','QA-SM-002','Role B Manager','qa-spend-manager-b@example.invalid','Special Approval Manager','Operations','active');",
    "INSERT OR IGNORE INTO employees(id,employee_no,display_name,email,job_title,department,employment_status) VALUES ('qa-spend-employee','QA-SE-001','Spend Employee','qa-spend-employee@example.invalid','Portal Employee','Operations','active');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('employee-owner-bootstrap','America/Los_Angeles');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('qa-spend-manager','Africa/Lagos');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('qa-spend-manager-b','Africa/Lagos');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('qa-spend-employee','Africa/Lagos');",
    "INSERT OR IGNORE INTO company_locations(id,company_id,name,timezone) VALUES ('qa-spend-print-location','company-printing','Spend QA Printing Location','Africa/Lagos');",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,location_id,is_primary,active) VALUES ('qa-spend-manager-print','qa-spend-manager','company-printing','qa-spend-print-location',1,1);",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,location_id,is_primary,active) VALUES ('qa-spend-manager-b-print','qa-spend-manager-b','company-printing','qa-spend-print-location',1,1);",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,location_id,is_primary,active) VALUES ('qa-spend-employee-print','qa-spend-employee','company-printing','qa-spend-print-location',1,1);",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-spend-manager-print-role','qa-spend-manager','company-printing','role-print-manager');",
    "INSERT OR IGNORE INTO roles(id,company_id,code,name,description,is_system) VALUES ('qa-spend-role-manager-b','company-printing','qa_manager_b','Role B Approval Manager','Scoped role for approval RBAC runtime verification',0);",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-spend-manager-b-print-role','qa-spend-manager-b','company-printing','qa-spend-role-manager-b');",
    "INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES ('qa-perm-spend-special','qa.expense.approve.special','expense','approve','Runtime-only narrower approval permission',1);",
    "INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT 'qa-spend-manager-b-'||p.id,'qa-spend-role-manager-b',p.id,'approve' FROM permissions p WHERE p.code IN ('expense.approve','qa.expense.approve.special');",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-spend-employee-role','qa-spend-employee','company-printing','role-print-designer');",
    "INSERT OR IGNORE INTO spend_suppliers(id,company_id,name,normalized_name,source) VALUES ('qa-spend-supplier-a','company-printing','Supplier A','supplier a','admin');",
    "INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,default_cost_center_id,allowed_erp_json,source) VALUES ('qa-spend-capex-category','company-printing','QA_CAPEX','QA capital equipment','qa capital equipment','spend-treatment-capex',1,0,'direct','spend-cc-PRINT-general','[\"finance\"]','system');",
    "INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,default_cost_center_id,allowed_erp_json,source) VALUES ('qa-spend-payroll-category','company-printing','QA_PAYROLL','QA canonical payroll category','qa canonical payroll category','spend-treatment-payroll',1,0,'direct','spend-cc-PRINT-general','[\"finance\"]','system');",
    "INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,default_cost_center_id,allowed_erp_json,source) VALUES ('qa-spend-role-b-category','company-printing','QA_ROLE_B','QA Role B approval category','qa role b approval category','spend-treatment-opex',1,0,'direct','spend-cc-PRINT-general','[\"finance\"]','system');",
    "INSERT OR IGNORE INTO spend_approval_rules(id,company_id,category_id,min_amount_kobo,max_amount_kobo,step_no,approver_role_code,required_permission) VALUES ('qa-spend-role-b-rule','company-printing','qa-spend-role-b-category',0,NULL,1,'qa_manager_b','qa.expense.approve.special');",
    managerRolePermissions, employeeRolePermissions,
    `INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-spend-owner-session','employee-owner-bootstrap',${quote(ownerHash)},'qa-spend-owner-device','Spend QA Owner','spend-runtime-test','198.51.100.20','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');`,
    `INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-spend-manager-session','qa-spend-manager',${quote(managerHash)},'qa-spend-manager-device','Spend QA Manager','spend-runtime-test','198.51.100.21','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');`,
    `INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-spend-manager-b-session','qa-spend-manager-b',${quote(managerBHash)},'qa-spend-manager-b-device','Spend QA Role B Manager','spend-runtime-test','198.51.100.23','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');`,
    `INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-spend-employee-session','qa-spend-employee',${quote(employeeHash)},'qa-spend-employee-device','Spend QA Employee','spend-runtime-test','198.51.100.22','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');`,
    "INSERT OR IGNORE INTO spend_expense_requests(id,request_no,requester_employee_id,company_id,cost_center_id,category_id,currency,purpose,business_reason,total_kobo,direct_shared,accounting_treatment_id,status,captured_at) VALUES ('qa-spend-loss-request','EXP-2026-0099','qa-spend-employee','company-printing','spend-cc-PRINT-general','spend-category-office-supplies','NGN','Response-loss reconciliation seed','A server-side write exists even when its response is lost.',125000,'direct','spend-treatment-opex','draft','2026-09-05T13:00:00.000Z');",
    "INSERT OR IGNORE INTO offline_sync_receipts(id,operation_id,idempotency_key,employee_id,company_id,session_id,operation_kind,entity_type,entity_id,state,attempt_count,started_at) VALUES ('qa-spend-loss-receipt','qa-spend-loss-op','qa-spend-loss-key','qa-spend-employee','company-printing','qa-spend-employee-session','expense.request.submit','spend_expense_request','qa-spend-loss-request','processing',1,'2026-09-05T13:00:00.000Z');",
  ].join('\n');
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let runtime;
  let persistDir;
  const matrix = [];
  try {
    persistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daenem-spend-runtime-'));
    await fs.writeFile(testConfig, JSON.stringify(config, null, 2) + '\n');
    await runWrangler(['d1', 'migrations', 'apply', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir], 'spend migration setup');
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', seed], 'spend fixture seed');
    runtime = spawn(wrangler, ['dev', '--local', '--config', testConfig, '--persist-to', persistDir, '--ip', '127.0.0.1', '--port', String(port)], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let output = '';
    runtime.stdout.on('data', (chunk) => { output += chunk; }); runtime.stderr.on('data', (chunk) => { output += chunk; });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      try { const probe = await fetch(baseUrl + '/api/spend/bootstrap'); if ([200, 401, 404, 500].includes(probe.status)) break; } catch {}
      if (runtime.exitCode !== null) throw new Error(`Worker exited before readiness:\n${output}`);
      await sleep(500);
    }
    if (runtime.exitCode !== null) throw new Error(`Worker exited before readiness:\n${output}`);

    let result = await request(baseUrl, '', '/api/spend/bootstrap'); expect('unauthenticated spend bootstrap', result, 401); matrix.push(['GET /api/spend/bootstrap', 'unauthenticated', 401]);
    result = await request(baseUrl, ownerToken, '/api/spend/bootstrap?companyId=company-printing'); expect('owner spend bootstrap', result, 200); assert('owner master categories', result.body.masterData?.categories?.length > 0, result.body); matrix.push(['GET /api/spend/bootstrap', 'owner', 200]);
    result = await request(baseUrl, employeeToken, '/api/spend/bootstrap?companyId=company-printing'); expect('employee spend bootstrap', result, 200); matrix.push(['GET /api/spend/bootstrap', 'employee', 200]);
    result = await request(baseUrl, employeeToken, '/api/offline/bootstrap?companyId=company-printing'); expect('employee offline bootstrap', result, 200); assert('expense operations are visible only with the employee permission', result.body.operations?.some((item) => item.kind === 'expense.request.submit'), result.body); matrix.push(['GET /api/offline/bootstrap', 'employee expense allowlist', 200]);
    result = await request(baseUrl, employeeToken, '/api/offline/activity?companyId=company-printing'); expect('employee offline activity', result, 200); assert('offline activity remains own-scope', Array.isArray(result.body.operations) && !JSON.stringify(result.body).includes('qa-spend-manager'), result.body); matrix.push(['GET /api/offline/activity', 'employee own scope', 200]);
    result = await request(baseUrl, employeeToken, '/api/spend/requests?companyId=company-printing'); expect('employee request list', result, 200); matrix.push(['GET /api/spend/requests', 'employee own scope', 200]);
    result = await request(baseUrl, managerToken, '/api/spend/approvals?companyId=company-printing'); expect('manager approvals', result, 200); matrix.push(['GET /api/spend/approvals', 'manager', 200]);
    result = await request(baseUrl, ownerToken, '/api/spend/admin/master?companyId=company-printing'); expect('owner admin master', result, 200); assert('admin cost centres are returned from the cost-centre master', result.body.costCenters?.some((row) => row.code === 'GENERAL'), result.body); matrix.push(['GET /api/spend/admin/master', 'owner', 200]);
    result = await request(baseUrl, employeeToken, '/api/spend/master/proposals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'supplier', companyId: 'company-printing', proposedName: 'Supplier A Ltd.' }) }); expect('employee proposes an unlisted supplier', result, 201); assert('duplicate warning is deterministic and proposal is not authoritative', result.body.status === 'proposed' && result.body.duplicateWarning === true, result.body); const proposalId = result.body.proposalId;
    result = await request(baseUrl, ownerToken, `/api/spend/admin/proposals/${encodeURIComponent(proposalId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: 'Likely duplicate of the controlled Supplier A master.' }) }); expect('owner resolves proposed supplier', result, 200);
    result = await request(baseUrl, ownerToken, '/api/spend/owner/overview'); expect('owner spend overview', result, 200); matrix.push(['GET /api/spend/owner/overview', 'owner', 200]);
    result = await request(baseUrl, employeeToken, '/api/spend/owner/overview'); expect('employee owner overview denial', result, 403);
    result = await request(baseUrl, managerToken, '/api/spend/owner/detail?employeeId=qa-spend-employee'); expect('manager owner detail denial', result, 403);

    const payroll = expensePayload('qa-spend-payroll-request', { categoryId: 'qa-spend-payroll-category', purpose: 'Duplicate payroll-like expense', businessReason: 'This must remain sourced from the canonical payroll ledger.', lines: [{ description: 'Payroll-like line', amountKobo: 125000, categoryId: 'qa-spend-payroll-category', directShared: 'direct' }] });
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payroll) }); expect('manual payroll posting is rejected', result, 422); assert('manual payroll rejection category', result.body.errorCategory === 'accounting', result.body); matrix.push(['manual payroll request', 'canonical payroll protected', 'PASS']);

    const direct = expensePayload('qa-spend-direct-request');
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(direct) }); expect('employee create draft', result, 201); const directId = result.body.request?.id;
    assert('draft request ID', Boolean(directId), result.body);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(directId)}`); expect('employee own request detail', result, 200);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(directId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('employee cannot approve own request', result, 403);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(directId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit' }) }); expect('server-side evidence requirement', result, 422);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(directId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', missingEvidenceReason: 'Evidence will be attached after the controlled purchase step.' }) }); expect('employee submit request', result, 200);
    const evidenceBytes = Buffer.from('%PDF-1.7\n% Daenem QA evidence\n', 'utf8');
    const evidenceDigest = crypto.createHash('sha256').update(evidenceBytes).digest('hex');
    result = await request(baseUrl, employeeToken, `/api/spend/evidence/qa-spend-evidence-invalid-mime`, { method: 'PUT', headers: { 'content-type': 'text/plain', 'x-expense-request-id': directId }, body: Buffer.from('not evidence', 'utf8') }); expect('invalid evidence MIME rejected', result, 415);
    result = await request(baseUrl, employeeToken, `/api/spend/evidence/qa-spend-evidence-pdf`, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-expense-request-id': directId, 'x-evidence-sha256': evidenceDigest, 'x-evidence-name': 'receipt.pdf', 'x-evidence-type': 'receipt', 'x-evidence-timezone': 'Africa/Lagos', 'x-evidence-captured-at': '2026-09-05T14:19:00.000Z' }, body: evidenceBytes }); expect('valid PDF evidence upload', result, 201); assert('evidence integrity acknowledgement', result.body.evidence?.sha256 === evidenceDigest && result.body.evidence?.status === 'uploaded', result.body);
    result = await request(baseUrl, employeeToken, `/api/spend/evidence/qa-spend-evidence-pdf`, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-expense-request-id': directId, 'x-evidence-sha256': evidenceDigest }, body: evidenceBytes }); expect('duplicate evidence retry', result, 200); assert('duplicate evidence is acknowledged without a second object', result.body.deduplicated === true, result.body);
    result = await request(baseUrl, employeeToken, `/api/spend/evidence/qa-spend-evidence-too-large`, { method: 'PUT', headers: { 'content-type': 'application/pdf', 'x-expense-request-id': directId }, body: Buffer.alloc(10 * 1024 * 1024 + 1, 65) }); expect('oversize evidence rejected', result, 413);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(directId)}/post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect('employee cannot finance post', result, 403);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(directId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('manager approve request', result, 200);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(directId)}`); expect('approved request before Finance posting', result, 200); assert('approval does not imply payment or commitment', Number(result.body.request?.paidKobo) === 0 && Number(result.body.request?.committedKobo) === 0 && result.body.request?.paymentState === 'unpaid' && result.body.request?.financePostingState === 'not_posted' && result.body.request?.commitmentState === 'uncommitted', result.body);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(directId)}/post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect('owner finance post', result, 201); assert('posted operating expense recognized', Number(result.body.recognizedKobo) === 125000, result.body);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(directId)}`); expect('posted request remains unpaid and uncommitted', result, 200); assert('Finance posting does not imply payment or commitment', Number(result.body.request?.paidKobo) === 0 && Number(result.body.request?.committedKobo) === 0 && result.body.request?.paymentState === 'unpaid' && result.body.request?.financePostingState === 'posted' && result.body.request?.commitmentState === 'uncommitted', result.body);
    result = await request(baseUrl, ownerToken, '/api/spend/owner/overview'); expect('owner metrics after Finance posting', result, 200); assert('owner paid and committed metrics exclude posted unpaid request', Number(result.body.metrics?.paidKobo) === 0 && Number(result.body.metrics?.committedKobo) === 0 && Number(result.body.metrics?.postedOperatingExpenseKobo) >= 125000, result.body);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(directId)}/post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect('duplicate Finance post retry', result, 200); assert('duplicate Finance post is acknowledged without a second posting', result.body.deduplicated === true, result.body);
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `INSERT OR IGNORE INTO spend_expense_payments(id,expense_request_id,company_id,amount_kobo,status,payment_reference,source,idempotency_key,paid_at,created_by) VALUES ('qa-spend-payment',${quote(directId)},'company-printing',125000,'settled','QA-CANONICAL-PAYMENT-001','canonical_payment','qa-spend-payment-key',CURRENT_TIMESTAMP,'employee-owner-bootstrap');`], 'canonical payment fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(directId)}`); expect('canonical payment truth', result, 200); assert('settled payment establishes Paid without changing posting or commitment truth', Number(result.body.request?.paidKobo) === 125000 && Number(result.body.request?.committedKobo) === 0 && result.body.request?.paymentState === 'paid' && result.body.request?.financePostingState === 'posted' && result.body.request?.commitmentState === 'uncommitted', result.body);
    matrix.push(['request → approval → posting → canonical payment', 'orthogonal state truth', 'PASS']);

    const commitment = expensePayload('qa-spend-commitment-request', {
      totalKobo: 1_000_000,
      purpose: 'Canonical commitment truth request',
      businessReason: 'Commitment must be established only by an authoritative purchase order.',
      lines: [{ description: 'Commitment truth fixture', amountKobo: 1_000_000, categoryId: 'spend-category-office-supplies', directShared: 'direct' }],
    });
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(commitment) }); expect('employee creates commitment truth request', result, 201); const commitmentId = result.body.request?.id;
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', missingEvidenceReason: 'The controlled purchase-order record is retained by Procurement.' }) }); expect('commitment truth request submit', result, 200);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('commitment truth request approval', result, 200);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('approved request has no commitment source', result, 200); assert('approved-only truth is independent', result.body.request?.status === 'approved' && Number(result.body.request?.totalKobo) === 1_000_000 && Number(result.body.request?.committedKobo) === 0 && Number(result.body.request?.paidKobo) === 0 && Number(result.body.request?.recognizedKobo) === 0 && result.body.request?.commitmentState === 'uncommitted', result.body); matrix.push(['approved-only commitment truth', 'approved=1,000,000; committed=0; paid=0; recognized=0', 'PASS']);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}/post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect('commitment truth Finance post', result, 201); assert('commitment truth posting amount', Number(result.body.recognizedKobo) === 1_000_000, result.body);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('Finance posted request has no commitment source', result, 200); assert('Finance Posted is not Committed', result.body.request?.financePostingState === 'posted' && Number(result.body.request?.recognizedKobo) === 1_000_000 && Number(result.body.request?.committedKobo) === 0 && result.body.request?.commitmentState === 'uncommitted', result.body); matrix.push(['finance-posted without commitment', 'financePostingState=posted; committed=0', 'PASS']); matrix.push(['finance posting regression', 'posted recognition remains independent', 'PASS']);
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `INSERT OR IGNORE INTO spend_expense_payments(id,expense_request_id,company_id,amount_kobo,status,payment_reference,source,idempotency_key,paid_at,created_by) VALUES ('qa-spend-commitment-payment',${quote(commitmentId)},'company-printing',400000,'settled','QA-CANONICAL-PAYMENT-002','canonical_payment','qa-spend-commitment-payment-key',CURRENT_TIMESTAMP,'employee-owner-bootstrap');`], 'commitment payment fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('payment without commitment', result, 200); assert('Paid is not Committed', Number(result.body.request?.paidKobo) === 400000 && result.body.request?.paymentState === 'partially_paid' && Number(result.body.request?.committedKobo) === 0 && result.body.request?.financePostingState === 'posted', result.body); matrix.push(['payment without commitment', 'paid=400,000; committed=0', 'PASS']); matrix.push(['payment regression', 'settled payment remains independent', 'PASS']);

    const approvedPoId = 'qa-spend-po-approved';
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderFixture({ id: approvedPoId, poNo: 'PO-QA-APPROVED', requestId: commitmentId, amountKobo: 600000, status: 'approved' })], 'approved Purchase Order fixture');
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderStatusEventFixture({ id: 'qa-spend-po-approved-event', purchaseOrderId: approvedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'submitted', toStatus: 'approved', idempotencyKey: 'qa-spend-po-approved-event-key', serverReceivedAt: '2026-09-05T14:29:00.000Z' })], 'approved Purchase Order audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('approved Purchase Order is not commitment', result, 200); assert('approved PO remains exposure only', Number(result.body.request?.committedKobo) === 0 && Number(result.body.request?.unverifiedCommitmentKobo) === 0 && result.body.request?.commitmentState === 'uncommitted' && result.body.request?.commitmentAuditState === 'not_applicable', result.body); matrix.push(['approved PO is not committed', 'approved=600,000; committed=0', 'PASS']);
    matrix.push(['finance-posted without commitment', 'Finance posting remains independent', 'PASS']);
    matrix.push(['payment without commitment', 'settled payment remains independent', 'PASS']);

    // This direct SQL status change has no ordered event. It must be exposed
    // as an exception and must not become verified committed spend.
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `UPDATE purchase_orders SET status='ordered',updated_at=CURRENT_TIMESTAMP WHERE id=${quote(approvedPoId)};`], 'unaudited direct SQL Purchase Order status change');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('ordered Purchase Order without audit', result, 200); assert('unaudited ordered PO fails closed', Number(result.body.request?.committedKobo) === 0 && Number(result.body.request?.unverifiedCommitmentKobo) === 600000 && result.body.request?.commitmentAuditState === 'missing_evidence' && result.body.request?.commitmentState === 'uncommitted' && result.body.request?.commitments?.some((row) => row.id === approvedPoId && row.state === 'active' && row.commitmentAuditState === 'missing_evidence'), result.body); matrix.push(['ordered PO without audit', 'committed=0; unverified=600,000; missing_evidence', 'PASS']); matrix.push(['direct SQL status change fails closed', 'no audit event; no verified commitment', 'PASS']);

    const orderedEventId = 'qa-spend-po-approved-ordered-event';
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderStatusEventFixture({ id: orderedEventId, purchaseOrderId: approvedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'approved', toStatus: 'ordered', idempotencyKey: 'qa-spend-po-approved-ordered-key', requestIdHeader: 'qa-po-ordered-request', serverReceivedAt: '2026-09-05T14:31:00.000Z', capturedAt: '2026-09-05T14:30:59.000Z' })], 'verified ordered Purchase Order audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('ordered Purchase Order with audit', result, 200); assert('verified ordered PO establishes exact partial commitment', Number(result.body.request?.committedKobo) === 600000 && Number(result.body.request?.unverifiedCommitmentKobo) === 0 && result.body.request?.commitmentState === 'committed' && result.body.request?.commitmentAuditState === 'verified' && result.body.request?.committedAt === '2026-09-05T14:31:00.000Z' && result.body.request?.commitments?.some((row) => row.id === approvedPoId && row.commitmentEventId === orderedEventId && row.createdBy === 'qa-spend-manager'), result.body); matrix.push(['ordered PO with verified audit', 'committed=600,000 from event time', 'PASS']); matrix.push(['explicit partial commitment', 'committed=600,000, not request total', 'PASS']);

    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `UPDATE purchase_orders SET status='partially_received',updated_at=CURRENT_TIMESTAMP WHERE id=${quote(approvedPoId)};` + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-partial-event', purchaseOrderId: approvedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'ordered', toStatus: 'partially_received', idempotencyKey: 'qa-spend-po-partial-key', requestIdHeader: 'qa-po-partial-request', serverReceivedAt: '2026-09-05T14:32:00.000Z' })], 'partially received Purchase Order audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('partially received Purchase Order', result, 200); assert('partially received retains total-value active commitment', Number(result.body.request?.committedKobo) === 600000 && result.body.request?.commitmentState === 'committed', result.body); matrix.push(['partially received mapping', 'active remaining total-value commitment', 'PASS']);

    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `UPDATE purchase_orders SET status='received',updated_at=CURRENT_TIMESTAMP WHERE id=${quote(approvedPoId)};` + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-received-event', purchaseOrderId: approvedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'partially_received', toStatus: 'received', idempotencyKey: 'qa-spend-po-received-key', requestIdHeader: 'qa-po-received-request', serverReceivedAt: '2026-09-05T14:33:00.000Z', reason: 'All ordered goods were received and reconciled.' })], 'received Purchase Order audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('received Purchase Order release', result, 200); assert('received PO releases current commitment with event evidence', Number(result.body.request?.committedKobo) === 0 && result.body.request?.commitmentState === 'uncommitted' && result.body.request?.commitments?.some((row) => row.id === approvedPoId && row.state === 'released' && row.releaseEventId === 'qa-spend-po-received-event' && row.releasedAt === '2026-09-05T14:33:00.000Z') && result.body.request?.commitmentAuditTimeline?.filter((item) => item.purchaseOrderId === approvedPoId).some((item) => item.toStatus === 'ordered') && result.body.request?.commitmentAuditTimeline?.some((item) => item.toStatus === 'received'), result.body); matrix.push(['received release', 'committed=0; release event retained', 'PASS']);

    const reversedPoId = 'qa-spend-po-reversed';
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderFixture({ id: reversedPoId, poNo: 'PO-QA-REVERSED', requestId: commitmentId, amountKobo: 600000, status: 'ordered' }) + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-reversed-ordered-event', purchaseOrderId: reversedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'approved', toStatus: 'ordered', idempotencyKey: 'qa-spend-po-reversed-ordered-key', serverReceivedAt: '2026-09-05T14:34:00.000Z' })], 'reversal Purchase Order fixture');
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', `UPDATE purchase_orders SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=${quote(reversedPoId)};` + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-reversed-cancel-event', purchaseOrderId: reversedPoId, requestId: commitmentId, amountKobo: 600000, fromStatus: 'ordered', toStatus: 'cancelled', idempotencyKey: 'qa-spend-po-reversed-cancel-key', requestIdHeader: 'qa-po-cancel-request', serverReceivedAt: '2026-09-05T14:35:00.000Z', reason: 'Supplier cancellation was authorized by Procurement.' })], 'cancelled Purchase Order audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('cancelled Purchase Order reversal', result, 200); assert('cancelled PO reverses current commitment with retained evidence', Number(result.body.request?.committedKobo) === 0 && result.body.request?.commitmentState === 'uncommitted' && result.body.request?.commitments?.some((row) => row.id === reversedPoId && row.state === 'reversed' && row.reversalEventId === 'qa-spend-po-reversed-cancel-event' && row.reversedAt === '2026-09-05T14:35:00.000Z') && result.body.request?.commitmentAuditTimeline?.some((item) => item.purchaseOrderId === reversedPoId && item.toStatus === 'cancelled' && item.reason === 'Supplier cancellation was authorized by Procurement.'), result.body); matrix.push(['cancelled reversal', 'committed=0; actor/reason/time retained', 'PASS']); matrix.push(['release/reverse audit evidence retention', 'transition events prove terminal state changes', 'PASS']);

    const multipleFixture = purchaseOrderFixture({ id: 'qa-spend-po-multiple-a', poNo: 'PO-QA-MULTI-A', requestId: commitmentId, amountKobo: 300000, status: 'ordered' }) + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-multiple-a-event', purchaseOrderId: 'qa-spend-po-multiple-a', requestId: commitmentId, amountKobo: 300000, fromStatus: 'approved', toStatus: 'ordered', idempotencyKey: 'qa-spend-po-multiple-a-key', requestIdHeader: 'qa-po-multi-a-request', serverReceivedAt: '2026-09-05T14:36:00.000Z' }) + purchaseOrderFixture({ id: 'qa-spend-po-multiple-b', poNo: 'PO-QA-MULTI-B', requestId: commitmentId, amountKobo: 200000, status: 'partially_received' }) + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-multiple-b-event', purchaseOrderId: 'qa-spend-po-multiple-b', requestId: commitmentId, amountKobo: 200000, fromStatus: 'approved', toStatus: 'partially_received', idempotencyKey: 'qa-spend-po-multiple-b-key', requestIdHeader: 'qa-po-multi-b-request', serverReceivedAt: '2026-09-05T14:37:00.000Z' });
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', multipleFixture], 'multiple verified canonical commitments');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('multiple active commitments', result, 200); assert('multiple active commitments sum independently', Number(result.body.request?.committedKobo) === 500000 && result.body.request?.commitmentAuditState === 'verified' && result.body.request?.commitments?.filter((row) => row.state === 'active' && row.commitmentAuditState === 'verified').length === 2, result.body); matrix.push(['multiple active commitments', '300,000 + 200,000 = 500,000', 'PASS']);

    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderStatusEventFixture({ id: 'qa-spend-po-multiple-a-duplicate-event', purchaseOrderId: 'qa-spend-po-multiple-a', requestId: commitmentId, amountKobo: 300000, fromStatus: 'approved', toStatus: 'ordered', idempotencyKey: 'qa-spend-po-multiple-a-key', requestIdHeader: 'qa-po-multi-a-retry', serverReceivedAt: '2026-09-05T14:38:00.000Z' })], 'duplicate Purchase Order status event retry');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('idempotent Purchase Order audit retry', result, 200); assert('same status-event idempotency key produces one event and one effect', Number(result.body.request?.committedKobo) === 500000 && result.body.request?.commitmentAuditTimeline?.filter((item) => item.idempotencyKey === 'qa-spend-po-multiple-a-key').length === 1, result.body); matrix.push(['status-event idempotency', 'one event; no duplicate commitment effect', 'PASS']);

    await expectWranglerFailure(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', "UPDATE purchase_order_status_events SET reason='tampered' WHERE id='qa-spend-po-multiple-a-event';"], 'status-event update append-only guard', 'append-only');
    await expectWranglerFailure(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', "DELETE FROM purchase_order_status_events WHERE id='qa-spend-po-multiple-a-event';"], 'status-event delete append-only guard', 'append-only');
    matrix.push(['append-only update', 'rejected by database trigger', 'PASS']); matrix.push(['append-only delete', 'rejected by database trigger', 'PASS']);

    result = await request(baseUrl, ownerToken, '/api/spend/owner/overview'); expect('owner committed spend metric', result, 200); assert('Owner committed metric uses verified active Procurement rows and exposes exceptions separately', Number(result.body.metrics?.committedKobo) === 500000 && Number(result.body.metrics?.unverifiedCommitmentKobo) === 0, result.body); matrix.push(['Owner committed spend metric', 'verified active rows only; exceptions separate', 'PASS']);
    result = await request(baseUrl, ownerToken, `/api/spend/owner/detail?companyId=company-printing&employeeId=qa-spend-employee`); expect('owner commitment evidence detail', result, 200); const ownerCommitmentRow = result.body.requests?.find((row) => row.id === commitmentId); assert('Owner receives safe commitment audit timeline', ownerCommitmentRow?.commitmentAuditTimeline?.some((item) => item.toStatus === 'ordered' && item.actorEmployeeId === 'qa-spend-manager' && item.sessionId === 'qa-spend-manager-session' && item.deviceId === 'qa-spend-manager-device' && item.ipAddress === '198.51.100.21' && item.networkLocation === 'Ibadan, NG (approximate)' && item.clientTimezone === 'Africa/Lagos' && item.capturedAt === '2026-09-05T14:30:59.000Z' && item.serverReceivedAt === '2026-09-05T14:31:00.000Z' && item.requestId === 'qa-po-ordered-request' && item.auditState === 'verified'), ownerCommitmentRow); matrix.push(['Owner commitment audit timeline', 'actor/transition/amount/session/network/time evidence', 'PASS']);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(commitmentId)}`); expect('employee own commitment request', result, 200); assert('employee does not receive Owner commitment audit history', !Array.isArray(result.body.request?.commitments) && !Array.isArray(result.body.request?.commitmentAuditTimeline), result.body); matrix.push(['employee commitment audit negative', 'Owner-only commitment history', 'PASS']);
    const capex = expensePayload('qa-spend-capex-request', { categoryId: 'qa-spend-capex-category', purpose: 'Capital equipment for the production floor', businessReason: 'A controlled capital purchase must not be treated as operating expense.', directShared: 'direct', erpModule: 'finance', lines: [{ description: 'Capital equipment', amountKobo: 125000, categoryId: 'qa-spend-capex-category', directShared: 'direct' }] });
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capex) }); expect('employee creates CapEx request', result, 201); const capexId = result.body.request?.id;
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(capexId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', missingEvidenceReason: 'Capital quotation is retained in the procurement file.' }) }); expect('employee submits CapEx request', result, 200);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(capexId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('manager approves CapEx request', result, 200);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(capexId)}/post`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); expect('owner CapEx posting fails closed without a mapped asset account', result, 503); assert('CapEx missing controlled mapping', result.body.errorCategory === 'finance-setup' && result.body.posted !== true, result.body); matrix.push(['CapEx posting', '503 finance-setup until mapped', 'PASS']);
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(capexId)}`); expect('unmapped CapEx remains unposted', result, 200); assert('unmapped CapEx has no recognized or paid spend', Number(result.body.request?.recognizedKobo) === 0 && Number(result.body.request?.paidKobo) === 0 && result.body.request?.financePostingState === 'not_posted', result.body);
    const foreign = expensePayload('qa-spend-foreign-request', { companyId: 'company-bakery', costCenterId: 'spend-cc-BAKERY-general', purpose: 'Bakery-only test request', businessReason: 'Manager scope filtering must not reveal this to the printing manager.' });
    result = await request(baseUrl, ownerToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(foreign) }); expect('owner creates unrelated-company request', result, 201); const foreignId = result.body.request?.id; assert('foreign request id', Boolean(foreignId), result.body);
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', purchaseOrderFixture({ id: 'qa-spend-po-foreign', poNo: 'PO-QA-FOREIGN', requestId: foreignId, amountKobo: 250000, status: 'ordered', companyId: 'company-bakery' }) + purchaseOrderStatusEventFixture({ id: 'qa-spend-po-foreign-event', purchaseOrderId: 'qa-spend-po-foreign', requestId: foreignId, amountKobo: 250000, fromStatus: 'approved', toStatus: 'ordered', companyId: 'company-bakery', idempotencyKey: 'qa-spend-po-foreign-key', serverReceivedAt: '2026-09-05T14:40:00.000Z' })], 'foreign-company commitment audit fixture');
    result = await request(baseUrl, ownerToken, `/api/spend/requests/${encodeURIComponent(foreignId)}`); expect('Owner can inspect foreign-company commitment evidence', result, 200); assert('foreign-company source is real and audited', result.body.request?.commitmentAuditTimeline?.some((item) => item.toStatus === 'ordered' && item.companyId === 'company-bakery') && Number(result.body.request?.committedKobo) === 250000, result.body);
    result = await request(baseUrl, managerToken, '/api/spend/requests?companyId=company-bakery'); expect('manager unrelated-company request list', result, 403); assert('manager cannot see an unrelated company request', !result.body.requests, result.body);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(foreignId)}`); expect('manager unrelated-company commitment detail', result, 404); assert('manager cannot retrieve another company commitment audit evidence', !result.body.request, result.body); matrix.push(['company commitment isolation', 'Company A manager cannot retrieve Company B audit evidence', 'PASS']);

    const shared = expensePayload('qa-spend-shared-request', { companyId: 'company-printing', categoryId: 'spend-category-fuel-utilities', costCenterId: 'spend-cc-PRINT-general', purpose: 'Daenem Complex shared generator fuel', businessReason: 'Shared headquarters operating utility.', totalKobo: 100000000, directShared: 'shared', allocationMethod: 'percentage', allocations: [
      { companyId: 'company-printing', percentage: 40, costCenterId: 'spend-cc-PRINT-general' },
      { companyId: 'company-bakery', percentage: 35, costCenterId: 'spend-cc-BAKERY-general' },
      { companyId: 'company-logistics', percentage: 15, costCenterId: 'spend-cc-LOGISTICS-general' },
      { companyId: 'company-properties', percentage: 10, costCenterId: 'spend-cc-PROPERTIES-general' },
    ], lines: [{ description: 'Generator fuel', amountKobo: 100000000, categoryId: 'spend-category-fuel-utilities', directShared: 'shared' }] });
    result = await request(baseUrl, ownerToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(shared) }); expect('shared expense', result, 201); const sharedId = result.body.request?.id; const allocations = result.body.request?.allocations || []; assert('shared allocation count', allocations.length === 4, allocations); assert('shared allocation exact reconciliation', allocations.reduce((sum, row) => sum + Number(row.allocatedAmountKobo || 0), 0) === 100000000, allocations); assert('printing share', Number(allocations.find((row) => row.companyId === 'company-printing')?.allocatedAmountKobo) === 40000000, allocations); assert('bakery share', Number(allocations.find((row) => row.companyId === 'company-bakery')?.allocatedAmountKobo) === 35000000, allocations); assert('logistics share', Number(allocations.find((row) => row.companyId === 'company-logistics')?.allocatedAmountKobo) === 15000000, allocations); assert('properties share', Number(allocations.find((row) => row.companyId === 'company-properties')?.allocatedAmountKobo) === 10000000, allocations);
    const templated = expensePayload('qa-spend-template-request', { categoryId: 'spend-category-fuel-utilities', costCenterId: 'spend-cc-PRINT-general', purpose: 'Template-backed generator fuel', businessReason: 'Use the approved headquarters allocation instead of recreating the split.', totalKobo: 100000000, directShared: 'shared', allocationMethod: 'percentage', allocationTemplateId: 'spend-template-complex-generator-fuel', lines: [{ description: 'Template-backed generator fuel', amountKobo: 100000000, categoryId: 'spend-category-fuel-utilities', directShared: 'shared' }] });
    result = await request(baseUrl, ownerToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(templated) }); expect('approved allocation template', result, 201); const templatedAllocations = result.body.request?.allocations || []; assert('template populates all approved beneficiaries', templatedAllocations.length === 4 && templatedAllocations.every((row) => row.basis?.allocationTemplateId === 'spend-template-complex-generator-fuel'), templatedAllocations); assert('template allocation remains exact', templatedAllocations.reduce((sum, row) => sum + Number(row.allocatedAmountKobo || 0), 0) === 100000000, templatedAllocations); matrix.push(['approved allocation template', 'beneficiaries/method/cost centres populated', 'PASS']);
    const fractional = expensePayload('qa-spend-fractional-request', { categoryId: 'spend-category-fuel-utilities', costCenterId: 'spend-cc-PRINT-general', purpose: 'Fractional allocation rounding test', businessReason: 'A fractional percentage split must preserve the actual final-kobo adjustment.', totalKobo: 101, directShared: 'shared', allocationMethod: 'percentage', allocations: [{ companyId: 'company-printing', percentage: 33.33, costCenterId: 'spend-cc-PRINT-general' }, { companyId: 'company-bakery', percentage: 66.67, costCenterId: 'spend-cc-BAKERY-general' }], lines: [{ description: 'Fractional allocation line', amountKobo: 101, categoryId: 'spend-category-fuel-utilities', directShared: 'shared' }] });
    result = await request(baseUrl, ownerToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fractional) }); expect('fractional allocation rounding', result, 201); const fractionalAllocations = result.body.request?.allocations || []; const bakeryFraction = fractionalAllocations.find((row) => row.companyId === 'company-bakery'); assert('fractional split records raw share, final share and actual adjustment', fractionalAllocations.reduce((sum, row) => sum + Number(row.allocatedAmountKobo || 0), 0) === 101 && Number(bakeryFraction?.basis?.rawCalculatedShareKobo) > 67 && Number(bakeryFraction?.basis?.finalAllocatedKobo) === 68 && Number(bakeryFraction?.basis?.roundingAdjustmentKobo) === 1 && Number(bakeryFraction?.roundingAdjustmentKobo) === 1, fractionalAllocations); matrix.push(['fractional allocation', 'truthful rounding evidence', 'PASS']);
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(sharedId)}`); expect('employee cannot inspect owner shared request', result, 404);
    result = await request(baseUrl, ownerToken, `/api/spend/owner/detail?companyId=company-printing&directShared=shared`); expect('owner filtered detail', result, 200); assert('group source appears once', result.body.requests?.filter((row) => row.id === sharedId).length === 1, result.body); assert('owner spend detail has timeline', Array.isArray(result.body.requests?.find((row) => row.id === sharedId)?.events), result.body); assert('owner detail does not expose payload secrets', !JSON.stringify(result.body).match(/password|oauth|access[_-]?token|mfa|raw_payload/i), result.body); matrix.push(['GET /api/spend/owner/detail', 'owner filtered shared evidence', 200]);

    const offline = expensePayload('qa-spend-offline-request');
    const offlineBody = syncBody('qa-spend-offline-op', 'qa-spend-offline-key', offline, { payload: { ...offline, submit: true, missingEvidenceReason: 'The supplier has not issued the receipt yet; Finance can follow up from the request record.' } });
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': offlineBody.idempotencyKey }, body: JSON.stringify(offlineBody) }); expect('offline expense first sync through runtime', result, 200); assert('offline expense accepted', result.body.ok === true && result.body.state === 'synced', result.body);
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': offlineBody.idempotencyKey }, body: JSON.stringify(offlineBody) }); expect('offline expense retry', result, 200); assert('offline expense deduplicated', result.body.receipt?.deduplicated === true, result.body);
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': offlineBody.idempotencyKey }, body: JSON.stringify({ ...offlineBody, companyId: 'company-bakery' }) }); expect('cross-company idempotency rejection', result, 409); assert('cross-company mismatch', result.body.errorCategory === 'idempotency-mismatch', result.body);
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': offlineBody.idempotencyKey }, body: JSON.stringify({ ...offlineBody, kind: 'expense.draft.save' }) }); expect('cross-kind idempotency rejection', result, 409); assert('cross-kind mismatch', result.body.errorCategory === 'idempotency-mismatch', result.body);
    result = await request(baseUrl, ownerToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': offlineBody.idempotencyKey }, body: JSON.stringify({ ...offlineBody, employeeId: 'qa-spend-employee' }) }); expect('cross-employee idempotency rejection', result, 409); assert('cross-employee mismatch', result.body.errorCategory === 'idempotency-mismatch', result.body);
    const privilegedOffline = syncBody('qa-spend-privileged-offline-op', 'qa-spend-privileged-offline-key', offline, { kind: 'expense.approve', payload: { action: 'approve', requestId: offline.requestId } });
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': privilegedOffline.idempotencyKey }, body: JSON.stringify(privilegedOffline) }); expect('offline approval is not allow-listed', result, 403);

    const loss = expensePayload('qa-spend-loss-request');
    const lossBody = syncBody('qa-spend-loss-op', 'qa-spend-loss-key', loss);
    result = await request(baseUrl, employeeToken, '/api/offline/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': lossBody.idempotencyKey }, body: JSON.stringify(lossBody) }); expect('response-loss reconciliation', result, 200); assert('response-loss deduplicated', result.body.receipt?.deduplicated === true, result.body);

    const tooHigh = { ...expensePayload('qa-spend-high-allocation'), directShared: 'shared', allocationMethod: 'percentage', allocations: [{ companyId: 'company-printing', percentage: 70, costCenterId: 'spend-cc-PRINT-general' }, { companyId: 'company-bakery', percentage: 20, costCenterId: 'spend-cc-BAKERY-general' }] };
    result = await request(baseUrl, ownerToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(tooHigh) }); expect('allocation below total rejection', result, 422);
    const roleScoped = expensePayload('qa-spend-role-b-request', { categoryId: 'qa-spend-role-b-category', purpose: 'Role B approval request', businessReason: 'Only the explicitly assigned approval role and required permission may act on this request.', evidenceCount: 0, lines: [{ description: 'Role B approval line', amountKobo: 125000, categoryId: 'qa-spend-role-b-category', directShared: 'direct' }] });
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(roleScoped) }); expect('role-scoped request draft', result, 201); const roleScopedId = result.body.request?.id; const roleScopedRequestNo = result.body.request?.requestNo;
    result = await request(baseUrl, employeeToken, `/api/spend/requests/${encodeURIComponent(roleScopedId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', missingEvidenceReason: 'The controlled supplier receipt is still pending and Finance will follow up.' }) }); expect('role-scoped request submit', result, 200);
    result = await request(baseUrl, managerToken, '/api/spend/approvals?companyId=company-printing'); expect('role A approval queue', result, 200); assert('manager role A receives no role B row', !result.body.approvals?.some((row) => row.id === roleScopedId || row.requestNo === roleScopedRequestNo), result.body);
    result = await request(baseUrl, managerToken, '/api/spend/requests?companyId=company-printing'); expect('role A request search', result, 200); assert('manager role A receives no role B pending request in search', !result.body.requests?.some((row) => row.id === roleScopedId || row.requestNo === roleScopedRequestNo), result.body);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(roleScopedId)}`); expect('manager role A cannot fetch role B request', result, 404);
    result = await request(baseUrl, managerToken, `/api/spend/requests/${encodeURIComponent(roleScopedId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('manager role A cannot approve role B request', result, 404);
    result = await request(baseUrl, managerBToken, '/api/spend/approvals?companyId=company-printing'); expect('role B approval queue', result, 200); const roleBRow = result.body.approvals?.find((row) => row.id === roleScopedId); assert('role B queue enforces assigned role and required_permission', roleBRow?.approverRoleCode === 'qa_manager_b' && roleBRow?.requiredPermission === 'qa.expense.approve.special', roleBRow);
    result = await request(baseUrl, ownerToken, '/api/spend/approvals?companyId=company-printing'); expect('Owner approval queue', result, 200); assert('Owner policy can inspect role B queue', result.body.approvals?.some((row) => row.id === roleScopedId), result.body);
    result = await request(baseUrl, managerBToken, `/api/spend/requests/${encodeURIComponent(roleScopedId)}/action`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) }); expect('role B approval action', result, 200); matrix.push(['approval queue + action', 'role and required_permission enforced', 'PASS']);
    const unknown = await request(baseUrl, ownerToken, '/api/spend/not-a-real-endpoint'); expect('authenticated spend unknown endpoint', unknown, 404); assert('authenticated API 404', unknown.body?.error === 'API route not found.', unknown.body);
    result = await request(baseUrl, ownerToken, '/api/spend/admin/master', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'deactivate', kind: 'category', id: 'spend-category-office-supplies', companyId: 'company-printing', reason: 'Retired during controlled master-data review.' }) }); expect('admin deactivates category', result, 200);
    result = await request(baseUrl, employeeToken, '/api/spend/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(expensePayload('qa-spend-deactivated-category')) }); expect('deactivated category rejected', result, 422);
    const erpContext = await request(baseUrl, employeeToken, '/api/spend/erp-context'); expect('shared ERP context', erpContext, 200); assert('all six ERP contexts resolve through one shared engine', JSON.stringify(erpContext.body.erps) === JSON.stringify(['printing', 'bakery', 'autos', 'logistics', 'properties', 'finance']) && erpContext.body.contexts?.length === 6, erpContext.body); assert('Autos Workshop remains truthful', erpContext.body.autos?.workshopRetained === true && String(erpContext.body.autos?.truth).includes('Workshop'), erpContext.body);

    const timestamp = new Date('2026-09-05T14:48:18.000Z');
    const utc = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'long' }).format(timestamp);
    const business = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'long' }).format(timestamp);
    const viewer = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'long' }).format(timestamp);
    assert('timezone UTC evidence', utc.includes('2:48:18 PM') && utc.includes('UTC'), utc);
    assert('timezone Daenem business evidence', business.includes('3:48:18 PM') && (business.includes('GMT+1') || business.includes('WAT')), business);
    assert('timezone viewer evidence', viewer.includes('7:48:18 AM') && (viewer.includes('PDT') || viewer.includes('GMT-7')), viewer);

    console.log(JSON.stringify({ runtimeEntrypoint: 'worker/runtime.ts', routeTarget: 'routeSpend', endpointMatrix: matrix, security: { unauthenticated401: true, employeeOwner403: true, managerOwner403: true, ownRequestOnly: true, makerChecker: true, financePostingBlockedForEmployee: true, allResponsesNoStore: true }, idempotency: { sameScopeRetry: 'deduplicated', crossCompany: '409 idempotency-mismatch', crossKind: '409 idempotency-mismatch', crossEmployee: '409 idempotency-mismatch', responseLoss: 'reconciled' }, allocation: { sourceKobo: 100000000, printing: 40000000, bakery: 35000000, logistics: 15000000, properties: 10000000, total: 100000000, groupCountedOnce: true }, timezone: { utc, business, viewer }, integration: 'REAL_WORKER_RUNTIME_SPEND_ROUTING=PASS' }, null, 2));
  } finally {
    if (runtime) {
      try { if (process.platform !== 'win32' && runtime.pid) process.kill(-runtime.pid, 'SIGTERM'); else runtime.kill('SIGTERM'); } catch {}
      await sleep(1_000);
    }
    await fs.rm(testConfig, { force: true });
    if (persistDir) await fs.rm(persistDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
