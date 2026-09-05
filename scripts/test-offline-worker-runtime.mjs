
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const root = process.cwd();
const repositoryConfig = path.join(root, 'wrangler.jsonc');
const testConfig = path.join(root, '.wrangler-offline-runtime-test.jsonc');
const databaseName = 'daenem-offline-runtime-test';
const pepper = 'offline-runtime-test-pepper';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function quote(value) {
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runWrangler(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(npx, ['--no-install', 'wrangler', ...args], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) resolve(result);
      else reject(new Error('wrangler ' + args.join(' ') + ' failed (' + code + '):\n' + stdout + '\n' + stderr));
    });
  });
}

async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

function requestHeaders(token, extra) {
  const headers = new Headers(extra || {});
  headers.set('cookie', 'daenem_workforce_session=' + token);
  return headers;
}

async function request(baseUrl, token, endpoint, init = {}) {
  const response = await fetch(baseUrl + endpoint, {
    ...init,
    headers: requestHeaders(token, init.headers),
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return {
    status: response.status,
    body,
    cacheControl: response.headers.get('cache-control') || '',
    frame: response.headers.get('x-frame-options') || '',
  };
}

function expect(label, result, status) {
  if (result.status !== status) {
    throw new Error(label + ': expected HTTP ' + status + ', received ' + result.status + ' ' + JSON.stringify(result.body));
  }
  if (!result.cacheControl.toLowerCase().includes('no-store')) {
    throw new Error(label + ': response did not include cache-control: no-store');
  }
  if (result.frame !== 'DENY') throw new Error(label + ': security wrapper did not set x-frame-options');
}

function expectBody(label, condition, result) {
  if (!condition) throw new Error(label + ': unexpected body ' + JSON.stringify(result.body));
}

function syncBody(operationId, idempotencyKey, kind, employeeId, companyId, assignmentId) {
  return {
    operationId,
    idempotencyKey,
    kind,
    employeeId,
    companyId,
    entityType: 'workflow_form_assignment',
    entityId: assignmentId,
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    clientTimezone: 'Africa/Lagos',
    payload: {
      assignmentId,
      responses: { handover: 'Actual Worker runtime integration' },
    },
  };
}

async function main() {
  const original = JSON.parse(await fs.readFile(repositoryConfig, 'utf8'));
  const ownerToken = 'qa-runtime-owner-token';
  const managerToken = 'qa-runtime-manager-token';
  const employeeToken = 'qa-runtime-employee-token';
  const ownerHash = sha256(ownerToken + ':' + pepper);
  const managerHash = sha256(managerToken + ':' + pepper);
  const employeeHash = sha256(employeeToken + ':' + pepper);
  const config = {
    $schema: original.$schema,
    name: 'daenem-offline-runtime-test',
    workers_dev: true,
    preview_urls: false,
    compatibility_date: original.compatibility_date,
    main: original.main,
    limits: original.limits,
    assets: original.assets,
    d1_databases: [{
      binding: 'DB',
      database_name: databaseName,
      database_id: '00000000-0000-0000-0000-000000000054',
      migrations_dir: 'migrations',
    }],
    r2_buckets: [{ binding: 'FILES', bucket_name: 'daenem-offline-runtime-test-files' }],
    vars: {
      APP_NAME: 'Daenem Workforce Hub',
      APP_STAGE: 'test',
      AUTH_PEPPER: pepper,
      APP_VERSION: 'offline-runtime-test',
      TIMEZONE: 'Africa/Lagos',
    },
  };
  const seed = [
    "INSERT OR IGNORE INTO employees(id,employee_no,display_name,email,job_title,department,employment_status) VALUES ('qa-runtime-manager','QA-M-001','Runtime Manager','qa-runtime-manager@example.invalid','Operations Manager','Operations','active');",
    "INSERT OR IGNORE INTO employees(id,employee_no,display_name,email,job_title,department,employment_status) VALUES ('qa-runtime-employee','QA-E-001','Runtime Employee','qa-runtime-employee@example.invalid','Portal Employee','Operations','active');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('employee-owner-bootstrap','America/New_York');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('qa-runtime-manager','Africa/Lagos');",
    "INSERT OR IGNORE INTO employee_preferences(employee_id,timezone) VALUES ('qa-runtime-employee','Africa/Lagos');",
    "INSERT OR IGNORE INTO company_locations(id,company_id,name,timezone) VALUES ('qa-runtime-print-location','company-printing','QA Printing Location','Africa/Lagos');",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,location_id,is_primary,active) VALUES ('qa-runtime-manager-print','qa-runtime-manager','company-printing','qa-runtime-print-location',1,1);",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES ('qa-runtime-manager-bakery','qa-runtime-manager','company-bakery',NULL,0,1);",
    "INSERT OR IGNORE INTO employee_company_memberships(id,employee_id,company_id,is_primary,active) VALUES ('qa-runtime-employee-print','qa-runtime-employee','company-printing',NULL,1,1);",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-runtime-manager-print-role','qa-runtime-manager','company-printing','role-print-manager');",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-runtime-manager-bakery-role','qa-runtime-manager','company-bakery','role-bakery-manager');",
    "INSERT OR IGNORE INTO employee_roles(id,employee_id,company_id,role_id) VALUES ('qa-runtime-employee-role','qa-runtime-employee','company-printing','role-print-designer');",
    "INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT 'qa-runtime-print-forms','role-print-manager',id,'manage' FROM permissions WHERE code='forms.access';",
    "INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) SELECT 'qa-runtime-bakery-forms','role-bakery-manager',id,'manage' FROM permissions WHERE code='forms.access';",
    "INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-runtime-owner-session','employee-owner-bootstrap'," + quote(ownerHash) + ",'qa-runtime-owner-device','QA Owner Browser','offline-runtime-test','198.51.100.10','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');",
    "INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-runtime-manager-session','qa-runtime-manager'," + quote(managerHash) + ",'qa-runtime-manager-device','QA Manager Browser','offline-runtime-test','198.51.100.11','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');",
    "INSERT OR IGNORE INTO auth_sessions(id,employee_id,token_hash,device_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES ('qa-runtime-employee-session','qa-runtime-employee'," + quote(employeeHash) + ",'qa-runtime-employee-device','QA Employee Browser','offline-runtime-test','198.51.100.12','2026-09-05T08:00:00.000Z','2026-09-05T14:40:00.000Z','2999-01-01T00:00:00.000Z');",
    "INSERT OR IGNORE INTO workflow_forms(id,company_id,title,description,form_type,schema_json,created_by,active) VALUES ('qa-runtime-form','company-printing','Runtime Forms Proof','Used only by the actual Worker integration test','daily_report','[{\"key\":\"handover\",\"label\":\"Handover note\",\"type\":\"textarea\",\"required\":true}]','employee-owner-bootstrap',1);",
    "INSERT OR IGNORE INTO workflow_form_assignments(id,form_id,company_id,employee_id,audience_type,required,blocking,assigned_by,active) VALUES ('qa-runtime-assignment','qa-runtime-form','company-printing','qa-runtime-manager','employee',1,0,'employee-owner-bootstrap',1);",
    "INSERT OR IGNORE INTO workflow_form_assignments(id,form_id,company_id,employee_id,audience_type,required,blocking,assigned_by,active) VALUES ('qa-runtime-reconcile-assignment','qa-runtime-form','company-printing','qa-runtime-manager','employee',1,0,'employee-owner-bootstrap',1);",
    "INSERT OR IGNORE INTO workflow_form_submissions(id,assignment_id,form_id,employee_id,company_id,status,response_json,offline_idempotency_key,submitted_at) VALUES ('qa-runtime-reconciled-submission','qa-runtime-reconcile-assignment','qa-runtime-form','qa-runtime-manager','company-printing','submitted','{\"handover\":\"already written before response loss\"}','qa-runtime-loss-key','2026-09-05T14:48:00.000Z');",
    "INSERT OR IGNORE INTO offline_sync_receipts(id,operation_id,idempotency_key,employee_id,company_id,session_id,operation_kind,entity_type,entity_id,state,attempt_count,result_json,server_received_at,started_at) VALUES ('qa-runtime-processing-receipt','qa-runtime-loss-op','qa-runtime-loss-key','qa-runtime-manager','company-printing','qa-runtime-manager-session','forms.submit','workflow_form_assignment','qa-runtime-reconcile-assignment','processing',1,NULL,'2026-09-05T14:48:00.000Z','2026-09-05T14:47:00.000Z');",
    "INSERT OR IGNORE INTO offline_sync_receipts(id,operation_id,idempotency_key,employee_id,company_id,session_id,operation_kind,entity_type,entity_id,state,attempt_count,result_json,server_received_at,started_at,completed_at) VALUES ('qa-runtime-detail-receipt','qa-runtime-detail-op','qa-runtime-detail-key','qa-runtime-manager','company-printing','qa-runtime-manager-session','forms.submit','workflow_form_assignment','qa-runtime-assignment','completed',2,'{\"outcome\":\"accepted\",\"submissionId\":\"qa-runtime-detail-submission\",\"status\":\"submitted\"}','2026-09-05T14:48:00.000Z','2026-09-05T14:47:00.000Z','2026-09-05T14:48:04.000Z');",
    "INSERT OR IGNORE INTO offline_client_telemetry(id,employee_id,company_id,session_id,device_id,device_name,platform,app_version,client_timezone,pending_count,sync_status,last_successful_sync_at,last_reported_at,ip_address,network_location) VALUES ('qa-runtime-telemetry','qa-runtime-manager','company-printing','qa-runtime-manager-session','qa-runtime-manager-device','QA Manager Browser','Linux','offline-runtime-test','Africa/Lagos',0,'synced','2026-09-05T14:48:04.000Z','2026-09-05T14:48:10.000Z','198.51.100.11','Lagos, NG');",
    "INSERT OR IGNORE INTO offline_attachments(id,employee_id,company_id,operation_id,r2_key,original_name,mime_type,size_bytes,sha256,status,created_at,uploaded_at) VALUES ('qa-runtime-attachment','qa-runtime-manager','company-printing','qa-runtime-detail-op','offline/qa-runtime-manager/qa-runtime-detail-op/qa-runtime-attachment-hash','handover.pdf','application/pdf',2048,'" + "a".repeat(64) + "','uploaded','2026-09-05T14:47:30.000Z','2026-09-05T14:48:02.000Z');",
    "INSERT OR IGNORE INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id,occurred_at) VALUES ('qa-runtime-audit-start','qa-runtime-manager','company-printing','offline_sync','sync_started','offline_sync_receipt','qa-runtime-detail-receipt','{\"operationId\":\"qa-runtime-detail-op\",\"idempotencyKey\":\"qa-runtime-detail-key\",\"operationKind\":\"forms.submit\",\"sessionId\":\"qa-runtime-manager-session\",\"deviceId\":\"qa-runtime-manager-device\",\"clientTimezone\":\"Africa/Lagos\",\"capturedAt\":\"2026-09-05T14:01:00.000Z\",\"serverReceivedAt\":\"2026-09-05T14:48:00.000Z\",\"applicationVersion\":\"offline-runtime-test\"}','offline-runtime-test','qa-runtime-request-1','2026-09-05T14:48:01.000Z');",
    "INSERT OR IGNORE INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id,occurred_at) VALUES ('qa-runtime-audit-accepted','qa-runtime-manager','company-printing','offline_sync','operation_accepted','offline_sync_receipt','qa-runtime-detail-receipt','{\"operationId\":\"qa-runtime-detail-op\",\"idempotencyKey\":\"qa-runtime-detail-key\",\"operationKind\":\"forms.submit\",\"sessionId\":\"qa-runtime-manager-session\",\"deviceId\":\"qa-runtime-manager-device\",\"outcome\":\"accepted\",\"attemptCount\":2,\"clientTimezone\":\"Africa/Lagos\",\"capturedAt\":\"2026-09-05T14:01:00.000Z\",\"serverReceivedAt\":\"2026-09-05T14:48:00.000Z\",\"applicationVersion\":\"offline-runtime-test\"}','offline-runtime-test','qa-runtime-request-2','2026-09-05T14:48:04.000Z');",
  ].join('\n');

  let runtime;
  let persistDir;
  const port = await freePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  try {
    persistDir = await fs.mkdtemp(path.join(os.tmpdir(), 'daenem-offline-runtime-'));
    await fs.writeFile(testConfig, JSON.stringify(config, null, 2) + '\n');
    await runWrangler(['d1', 'migrations', 'apply', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir]);
    await runWrangler(['d1', 'execute', databaseName, '--local', '--config', testConfig, '--persist-to', persistDir, '--command', seed]);

    runtime = spawn(npx, ['--no-install', 'wrangler', 'dev', '--local', '--config', testConfig, '--persist-to', persistDir, '--ip', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let runtimeOutput = '';
    runtime.stdout.on('data', (chunk) => { runtimeOutput += chunk; });
    runtime.stderr.on('data', (chunk) => { runtimeOutput += chunk; });
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch(baseUrl + '/api/offline/bootstrap');
        if ([200, 401, 403, 404, 500].includes(response.status)) break;
      } catch {}
      if (runtime.exitCode !== null) throw new Error('Worker runtime exited before serving:\n' + runtimeOutput);
      await sleep(500);
    }
    const matrix = [];
    const unauth = await request(baseUrl, '', '/api/offline/bootstrap');
    expect('unauthenticated bootstrap', unauth, 401);
    matrix.push(['GET /api/offline/bootstrap', 'unauthenticated', unauth.status]);

    const bootstrap = await request(baseUrl, ownerToken, '/api/offline/bootstrap');
    expect('authenticated bootstrap', bootstrap, 200);
    expectBody('authenticated bootstrap route', bootstrap.body && bootstrap.body.ok === true, bootstrap);
    matrix.push(['GET /api/offline/bootstrap', 'owner', bootstrap.status]);

    const invalidSync = await request(baseUrl, ownerToken, '/api/offline/sync', { method: 'POST', body: JSON.stringify({}) });
    expect('invalid sync route', invalidSync, 400);
    matrix.push(['POST /api/offline/sync', 'owner invalid metadata', invalidSync.status]);

    const activity = await request(baseUrl, ownerToken, '/api/offline/activity');
    expect('activity route', activity, 200);
    matrix.push(['GET /api/offline/activity', 'owner', activity.status]);

    const telemetry = await request(baseUrl, ownerToken, '/api/offline/telemetry', {
      method: 'POST',
      body: JSON.stringify({ companyId: 'company-printing', deviceId: 'qa-runtime-owner-device', syncStatus: 'online', pendingCount: 0, clientTimezone: 'America/New_York' }),
    });
    expect('telemetry route', telemetry, 200);
    matrix.push(['POST /api/offline/telemetry', 'owner', telemetry.status]);

    const overview = await request(baseUrl, ownerToken, '/api/offline/owner/overview');
    expect('owner overview route', overview, 200);
    expectBody('owner overview route', Array.isArray(overview.body.sessions), overview);
    matrix.push(['GET /api/offline/owner/overview', 'owner', overview.status]);

    const detail = await request(baseUrl, ownerToken, '/api/offline/owner/detail?employeeId=qa-runtime-manager&deviceId=qa-runtime-manager-device&sessionId=qa-runtime-manager-session&companyId=company-printing&eventType=sync_started&from=2026-09-05T00:00:00.000Z&to=2026-09-06T00:00:00.000Z');
    expect('owner detail route', detail, 200);
    expectBody('owner detail evidence', Array.isArray(detail.body.timeline) && detail.body.employee?.id === 'qa-runtime-manager', detail);
    expectBody('owner detail safe evidence', !JSON.stringify(detail.body).includes('response_json') && !JSON.stringify(detail.body).match(/password|oauth|access[_-]?token|mfa/i), detail);
    matrix.push(['GET /api/offline/owner/detail', 'owner filtered detail', detail.status]);

    const policy = await request(baseUrl, ownerToken, '/api/offline/owner/policy', {
      method: 'POST',
      body: JSON.stringify({ enabled: true, maxOfflineAgeMinutes: 720, maxQueueCount: 50, attachmentMaxBytes: 10485760, automaticSync: true, manualRetry: true, retentionDays: 30, allowedOperations: ['forms.submit'] }),
    });
    expect('owner policy route', policy, 200);
    matrix.push(['POST /api/offline/owner/policy', 'owner', policy.status]);

    const invalidAttachment = await request(baseUrl, ownerToken, '/api/offline/attachments/qa-runtime-invalid', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain', 'x-offline-operation-id': 'qa-runtime-detail-op', 'x-offline-company-id': 'company-printing' },
      body: 'not an attachment',
    });
    expect('attachment route', invalidAttachment, 415);
    matrix.push(['PUT /api/offline/attachments/:id', 'owner invalid MIME', invalidAttachment.status]);

    const managerOwner = await request(baseUrl, managerToken, '/api/offline/owner/overview');
    expect('manager owner overview denial', managerOwner, 403);
    const managerDetail = await request(baseUrl, managerToken, '/api/offline/owner/detail?employeeId=qa-runtime-manager');
    expect('manager owner detail denial', managerDetail, 403);
    const employeeOwner = await request(baseUrl, employeeToken, '/api/offline/owner/detail?employeeId=qa-runtime-manager');
    expect('employee owner detail denial', employeeOwner, 403);
    matrix.push(['owner endpoints', 'manager and employee', '403/403']);

    const operation = syncBody('qa-runtime-same-op', 'qa-runtime-same-key', 'forms.submit', 'qa-runtime-manager', 'company-printing', 'qa-runtime-assignment');
    const first = await request(baseUrl, managerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': operation.idempotencyKey }, body: JSON.stringify(operation) });
    expect('same-scope first sync', first, 200);
    expectBody('same-scope first sync effect', first.body.ok === true && first.body.receipt?.deduplicated === false, first);
    const retry = await request(baseUrl, managerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': operation.idempotencyKey }, body: JSON.stringify(operation) });
    expect('same-scope retry', retry, 200);
    expectBody('same-scope deduplication', retry.body.ok === true && retry.body.receipt?.deduplicated === true, retry);

    const crossCompany = { ...operation, companyId: 'company-bakery' };
    const crossCompanyResult = await request(baseUrl, managerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': operation.idempotencyKey }, body: JSON.stringify(crossCompany) });
    expect('cross-company replay', crossCompanyResult, 409);
    expectBody('cross-company scope mismatch', crossCompanyResult.body.errorCategory === 'idempotency-mismatch' && !crossCompanyResult.body.receipt, crossCompanyResult);

    const crossKind = { ...operation, kind: 'forms.approve' };
    const crossKindResult = await request(baseUrl, managerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': operation.idempotencyKey }, body: JSON.stringify(crossKind) });
    expect('cross-kind replay', crossKindResult, 409);
    expectBody('cross-kind scope mismatch', crossKindResult.body.errorCategory === 'idempotency-mismatch' && !crossKindResult.body.receipt, crossKindResult);

    const crossEmployee = { ...operation, employeeId: 'qa-runtime-manager' };
    const crossEmployeeResult = await request(baseUrl, ownerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': operation.idempotencyKey }, body: JSON.stringify(crossEmployee) });
    expect('cross-employee replay', crossEmployeeResult, 409);
    expectBody('cross-employee scope mismatch', crossEmployeeResult.body.errorCategory === 'idempotency-mismatch' && !crossEmployeeResult.body.receipt, crossEmployeeResult);

    const responseLoss = syncBody('qa-runtime-loss-op', 'qa-runtime-loss-key', 'forms.submit', 'qa-runtime-manager', 'company-printing', 'qa-runtime-reconcile-assignment');
    const responseLossResult = await request(baseUrl, managerToken, '/api/offline/sync', { method: 'POST', headers: { 'idempotency-key': responseLoss.idempotencyKey }, body: JSON.stringify(responseLoss) });
    expect('response-loss reconciliation', responseLossResult, 200);
    expectBody('response-loss reconciliation deduplication', responseLossResult.body.ok === true && responseLossResult.body.receipt?.deduplicated === true, responseLossResult);

    const unknown = await request(baseUrl, ownerToken, '/api/offline/not-a-real-endpoint');
    expect('unknown authenticated offline endpoint', unknown, 404);
    expectBody('unknown authenticated offline endpoint', unknown.body?.error === 'API route not found.', unknown);
    matrix.push(['GET /api/offline/unknown', 'authenticated owner', unknown.status]);

    const revoked = await request(baseUrl, ownerToken, '/api/offline/owner/revoke', {
      method: 'POST',
      body: JSON.stringify({ companyId: 'company-printing', employeeId: 'qa-runtime-manager', sessionId: 'qa-runtime-manager-session', action: 'revoke_session', reason: 'Worker routing integration test cleanup' }),
    });
    expect('owner revoke route', revoked, 200);
    matrix.push(['POST /api/offline/owner/revoke', 'owner', revoked.status]);

    console.log(JSON.stringify({
      runtimeEntrypoint: 'worker/runtime.ts',
      routeTarget: 'routeOffline',
      endpointMatrix: matrix,
      security: {
        unauthenticated401: true,
        managerOwner403: true,
        employeeOwner403: true,
        ownerDetailSecretsExcluded: true,
        allResponsesNoStore: true,
      },
      idempotency: {
        sameScopeRetry: 'deduplicated',
        crossCompany: '409 idempotency-mismatch',
        crossKind: '409 idempotency-mismatch',
        crossEmployee: '409 idempotency-mismatch',
        responseLoss: 'reconciled',
      },
      integration: 'REAL_WORKER_RUNTIME_OFFLINE_ROUTING=PASS',
    }, null, 2));
  } finally {
    if (runtime) {
      runtime.kill('SIGTERM');
      await sleep(500);
    }
    await fs.rm(testConfig, { force: true });
    if (persistDir) await fs.rm(persistDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
