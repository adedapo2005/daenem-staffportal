import { derivePasswordHash, randomSaltHex, WORKER_SAFE_PASSWORD_ITERATIONS } from './credential-security';

/** Only the staging entry point registers this route. No credentials in bodies or responses.
 * Install the administrative and three persona passwords as Worker secrets separately.
 * Contacts are deliberately NULL: these identities have no delivery destination.
 * D1 batch supplies the transaction; collision and postcondition checks run INSIDE it.
 */
export interface StagingQaEnv {
  APP_STAGE?: string;
  STAFFPORTAL_DATABASE_NAME?: string;
  STAFFPORTAL_QA_ADMIN_SECRET?: string;
  STAFFPORTAL_QA_OWNER_PASSWORD?: string;
  STAFFPORTAL_QA_MANAGER_PASSWORD?: string;
  STAFFPORTAL_QA_EMPLOYEE_PASSWORD?: string;
  AUTH_PEPPER?: string;
  DB: D1Database;
}

const namespace = 'qa-staging-v1';
const id = (label: string) => `${namespace}-${label}`;
const personas = ['owner', 'manager', 'employee'] as const;
const scopes = ['a', 'b'] as const;
type Value = string | number | null;
type Row = { table: string; key?: string; fixed: Record<string, Value>; live?: Record<string, Value> };
const reply = (status: number, body: Record<string, unknown> = { error: 'QA operation unavailable.' }) =>
  new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  } });
const failureClass = (error: unknown) => {
  const message = error instanceof Error ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message
    : typeof error === 'string' ? error : '';
  if (/queries per invocation|too many quer|query limit|subrequest/i.test(message)) return 'query-limit';
  if (/too many sql variables|bound parameter/i.test(message)) return 'parameter-limit';
  if (/foreign key/i.test(message)) return 'foreign-key';
  if (/unique/i.test(message)) return 'unique';
  if (/check constraint/i.test(message)) return 'check';
  if (/not null/i.test(message)) return 'not-null';
  if (/no such table|no such column/i.test(message)) return 'schema';
  if (/malformed json|qa invariant/i.test(message)) return 'invariant';
  if (/timeout|timed out|cpu time/i.test(message)) return 'timeout';
  if (/unavailable/i.test(message)) return 'configuration';
  if (/d1|sqlite/i.test(message)) return 'd1-other';
  return 'runtime-other';
};

async function authorized(supplied: string, expected: string) {
  // Compare fixed-size digests, including for unequal input lengths.
  const digest = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const [left, right] = await Promise.all([digest(supplied), digest(expected)]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function anchors(): Row[] {
  const rows: Row[] = [];
  for (const scope of scopes) {
    rows.push({ table: 'companies', fixed: { id: id(`company-${scope}`), code: `QA-STAGING-${scope.toUpperCase()}`,
      name: `QA Staging ${scope.toUpperCase()}`, business_type: 'qa', phone: null, whatsapp: null }, live: { active: 1 } });
    rows.push({ table: 'company_locations', fixed: { id: id(`site-${scope}`), company_id: id(`company-${scope}`),
      name: `QA Site ${scope.toUpperCase()}` }, live: { active: 1 } });
  }
  for (const persona of personas) {
    rows.push({ table: 'employees', fixed: { id: id(persona), employee_no: id(persona),
      display_name: `QA ${persona}`, department: namespace, email: null, phone: null, whatsapp: null },
      live: { employment_status: 'active' } });
    rows.push({ table: 'roles', fixed: { id: id(`role-${persona}`), code: persona,
      company_id: persona === 'owner' ? null : id(`company-${persona === 'manager' ? 'a' : 'b'}`),
      name: `QA ${persona}`, description: namespace, is_system: 0 }, live: { active: 1 } });
    for (const scope of persona === 'owner' ? scopes : [persona === 'manager' ? 'a' : 'b']) {
      rows.push({ table: 'employee_company_memberships', fixed: { id: id(`membership-${persona}-${scope}`),
        employee_id: id(persona), company_id: id(`company-${scope}`), location_id: id(`site-${scope}`),
        is_primary: scope === 'a' || persona === 'employee' ? 1 : 0 }, live: { active: 1 } });
      rows.push({ table: 'employee_roles', fixed: { id: id(`assignment-${persona}-${scope}`), employee_id: id(persona),
        company_id: id(`company-${scope}`), role_id: id(`role-${persona}`) } });
    }
  }
  return rows;
}

function financialRows(): Row[] {
  return scopes.flatMap(scope => {
    const rows: Row[] = [
      { table: 'payroll_runs', fixed: { id: id(`payroll-${scope}`), company_id: id(`company-${scope}`),
        period_start: '2000-01-01', period_end: '2000-01-31', prepared_by: id('owner'), currency: 'NGN' },
        live: { status: 'draft', gross_total_kobo: 100, net_total_kobo: 100, deduction_total_kobo: 0 } },
      { table: 'payroll_items', fixed: { id: id(`payroll-item-${scope}`), payroll_run_id: id(`payroll-${scope}`),
        employee_id: id(scope === 'a' ? 'manager' : 'employee'), calculation_json: '{"fixture":"QA Staging","synthetic":true}' },
        live: { base_kobo: 100, gross_kobo: 100, net_kobo: 100 } },
      { table: 'finance_receivables', fixed: { id: id(`receivable-${scope}`), company_id: id(`company-${scope}`),
        customer_name: 'QA Synthetic Customer', invoice_no: id(`invoice-${scope}`), invoice_date: '2000-01-01',
        source_module: namespace, source_id: id(`receivable-${scope}`), notes: 'QA synthetic fixture; no payment or provider activity.',
        created_by: id('owner'), amount_kobo: 100 }, live: { status: 'open', balance_kobo: 100, paid_kobo: 0 } },
    ];
    return rows;
  });
}

function transaction(env: StagingQaEnv) {
  const statements: D1PreparedStatement[] = [];
  const sql = (text: string, ...values: Value[]) => env.DB.prepare(text).bind(...values);
  const add = (text: string, ...values: Value[]) => { statements.push(sql(text, ...values)); };
  const check = (condition: string, values: Value[] = []) => {
    // SQLite evaluates only the selected CASE branch. A failed invariant aborts the
    // entire D1 batch, including every earlier write, without a schema migration.
    add(`SELECT CASE WHEN (${condition}) THEN 1 ELSE json('QA invariant failed') END`, ...values);
  };
  const where = (fields: Record<string, Value>) => Object.keys(fields).map(key => `${key} IS ?`).join(' AND ');
  const groups = (rows: Row[], reactivate?: boolean) => {
    const result = new Map<string, Row[]>();
    for (const row of rows) {
      const fields = { ...row.fixed, ...row.live };
      const signature = [row.table, row.key || 'id', ...Object.keys(fields),
        ...(reactivate && row.live ? Object.keys(row.live) : [])].join('|');
      result.set(signature, [...(result.get(signature) || []), row]);
    }
    return result.values();
  };
  const collisionMany = (rows: Row[]) => {
    for (const group of groups(rows)) {
      const conditions: string[] = [], values: Value[] = [];
      for (const row of group) {
        const key = row.key || 'id';
        conditions.push(`(${key}=? AND NOT (${where(row.fixed)}))`);
        values.push(row.fixed[key], ...Object.values(row.fixed));
      }
      check(`NOT EXISTS(SELECT 1 FROM ${group[0].table} WHERE ${conditions.join(' OR ')})`, values);
    }
  };
  const ensureMany = (rows: Row[], reactivate = true) => {
    for (const group of groups(rows, reactivate)) {
      const sample = group[0], fields = { ...sample.fixed, ...sample.live };
      const columns = Object.keys(fields), key = sample.key || 'id';
      const values = group.flatMap(row => Object.values({ ...row.fixed, ...row.live }));
      add(`INSERT INTO ${sample.table}(${columns.join(',')}) VALUES
        ${group.map(() => `(${columns.map(() => '?').join(',')})`).join(',')}
        ON CONFLICT(${key}) DO ${reactivate && sample.live ? `UPDATE SET ${Object.keys(sample.live).map(column => `${column}=excluded.${column}`).join(',')}` : 'NOTHING'}`,
      ...values);
      const expected = group.map(row => reactivate ? { ...row.fixed, ...row.live } : row.fixed);
      check(expected.map(item => `EXISTS(SELECT 1 FROM ${sample.table} WHERE ${where(item)})`).join(' AND '),
        expected.flatMap(item => Object.values(item)));
    }
  };
  return { statements, add, check, collisionMany, ensureMany };
}

type FailurePhase = 'request' | 'fixture-configuration' | 'credential-derivation' | 'database-batch';

async function apply(env: StagingQaEnv, action: 'seed' | 'reset', setPhase: (phase: FailurePhase) => void) {
  setPhase('fixture-configuration');
  const tx = transaction(env), rows = anchors(), financial = financialRows();
  const employees = personas.map(persona => id(persona));
  const companies = scopes.map(scope => id(`company-${scope}`));
  const employeeSql = employees.map(() => '?').join(',');
  const companySql = companies.map(() => '?').join(',');
  tx.collisionMany([...rows, ...financial]);
  tx.collisionMany(personas.map(persona => ({ table: 'employee_credentials', key: 'employee_id',
    fixed: { employee_id: id(persona), username: id(persona) } })));
  // Do not take over another principal, assignment, financial child or progressed
  // payment merely because it refers to a deterministic QA ID.
  tx.check(`NOT EXISTS(SELECT 1 FROM employee_company_memberships WHERE company_id IN (${companySql}) AND employee_id NOT IN (${employeeSql}))`, [...companies, ...employees]);
  tx.check(`NOT EXISTS(SELECT 1 FROM employee_roles WHERE role_id IN (?,?,?) AND employee_id NOT IN (${employeeSql}))`, [...personas.map(p => id(`role-${p}`)), ...employees]);
  for (const scope of scopes) {
    tx.check(`NOT EXISTS(SELECT 1 FROM payroll_runs WHERE id=? AND (status NOT IN ('draft','cancelled') OR approved_at IS NOT NULL OR paid_at IS NOT NULL))
      AND NOT EXISTS(SELECT 1 FROM payroll_payment_batches WHERE payroll_run_id=?)
      AND NOT EXISTS(SELECT 1 FROM payroll_items WHERE payroll_run_id=? AND id<>?)
      AND NOT EXISTS(SELECT 1 FROM payroll_item_breakdown WHERE payroll_item_id=?)
      AND NOT EXISTS(SELECT 1 FROM payroll_adjustments WHERE payroll_run_id=?)
      AND NOT EXISTS(SELECT 1 FROM finance_receivables WHERE id=? AND (status NOT IN ('open','cancelled') OR paid_kobo<>0))
      AND NOT EXISTS(SELECT 1 FROM finance_receivable_payments WHERE receivable_id=?)
      AND NOT EXISTS(SELECT 1 FROM finance_source_postings WHERE receivable_id=?)`,
    [id(`payroll-${scope}`), id(`payroll-${scope}`), id(`payroll-${scope}`), id(`payroll-item-${scope}`),
      id(`payroll-item-${scope}`), id(`payroll-${scope}`), id(`receivable-${scope}`), id(`receivable-${scope}`), id(`receivable-${scope}`)]);
  }
  const audit: Row = { table: 'audit_logs', fixed: { id: id(`audit-${action}`), actor_employee_id: id('owner'),
    company_id: id('company-a'), module: namespace, action: `qa_${action}`, entity_type: 'qa_fixture',
    entity_id: namespace, reason: 'QA synthetic fixture lifecycle; no external activity.', source: 'system' } };
  const accessAudit: Row = { table: 'access_control_changes', fixed: { id: id('access-evidence'), actor_employee_id: id('owner'),
    company_id: id('company-a'), target_type: 'role', target_id: id('role-manager'), reason: 'QA synthetic role fixture.' } };
  tx.collisionMany([audit, accessAudit]);

  if (action === 'seed') {
    const passwords = [env.STAFFPORTAL_QA_OWNER_PASSWORD, env.STAFFPORTAL_QA_MANAGER_PASSWORD, env.STAFFPORTAL_QA_EMPLOYEE_PASSWORD];
    if (!env.AUTH_PEPPER || passwords.some(value => typeof value !== 'string' || value.length < 16 || value.length > 128)) throw new Error('Unavailable');
    setPhase('credential-derivation');
    tx.ensureMany(rows);
    const credentials: Row[] = [];
    const grants: Array<{ grantId: string; roleId: string; code: string; level: string }> = [];
    for (let i = 0; i < personas.length; i++) {
      const salt = randomSaltHex();
      const hash = await derivePasswordHash(env, passwords[i]!, salt, WORKER_SAFE_PASSWORD_ITERATIONS);
      credentials.push({ table: 'employee_credentials', key: 'employee_id',
        fixed: { employee_id: employees[i], username: employees[i] },
        live: { password_hash: hash, password_salt: salt, password_algorithm: 'PBKDF2-SHA256',
          password_iterations: WORKER_SAFE_PASSWORD_ITERATIONS } });
      // Compose existing permission definitions; do not manufacture a second permission catalogue.
      const codes = personas[i] === 'employee' ? ['profile.access', 'attendance.access', 'facilities.access']
        : ['profile.access', 'attendance.access', 'payroll.access', 'finance.receivables', 'facilities.access'];
      const level = personas[i] === 'owner' ? 'manage' : personas[i] === 'manager' ? 'edit' : 'view';
      for (const code of codes) grants.push({ grantId: id(`grant-${personas[i]}-${code}`),
        roleId: id(`role-${personas[i]}`), code, level });
    }
    tx.ensureMany(credentials, false);
    const permissionCodes = ['profile.access', 'attendance.access', 'payroll.access', 'finance.receivables', 'facilities.access'];
    const permissionSlots = permissionCodes.map(() => '?').join(',');
    tx.check(`(SELECT COUNT(DISTINCT code) FROM permissions WHERE code IN (${permissionSlots}))=?`,
      [...permissionCodes, permissionCodes.length]);
    const permissionId = `SELECT id FROM permissions WHERE code=?`;
    tx.check(grants.map(() => `NOT EXISTS(SELECT 1 FROM role_permissions
      WHERE id=? AND NOT(role_id=? AND permission_id=(${permissionId}) AND access_level=?))`).join(' AND '),
    grants.flatMap(grant => [grant.grantId, grant.roleId, grant.code, grant.level]));
    tx.add(`INSERT INTO role_permissions(id,role_id,permission_id,access_level) VALUES
      ${grants.map(() => `(?,?,(${permissionId}),?)`).join(',')}
      ON CONFLICT(id) DO NOTHING`,
    ...grants.flatMap(grant => [grant.grantId, grant.roleId, grant.code, grant.level]));
    tx.check(grants.map(() => `EXISTS(SELECT 1 FROM role_permissions
      WHERE id=? AND role_id=? AND permission_id=(${permissionId}) AND access_level=?)`).join(' AND '),
    grants.flatMap(grant => [grant.grantId, grant.roleId, grant.code, grant.level]));
    tx.ensureMany(financial);
    tx.ensureMany([accessAudit, audit]);
  } else {
    // Refuse a logical reset while any synthetic Facilities transaction is present.
    // Preserve audit evidence and avoid deactivating companies that still own records.
    const qaTables = ['facilities','assets','asset_readings','maintenance_work_orders',
      'preventive_maintenance_schedules','facility_inspections'];
    tx.check(qaTables.map(table=>`NOT EXISTS(SELECT 1 FROM ${table} WHERE company_id IN (${companySql}))`)
      .concat(`NOT EXISTS(SELECT 1 FROM audit_logs WHERE module='facilities' AND company_id IN (${companySql}))`)
      .join(' AND '), [...qaTables.flatMap(()=>companies), ...companies]);
    // A reset of an absent fixture is a no-op, without manufacturing identities.
    tx.add(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE employee_id IN (${employeeSql})`, ...employees);
    tx.add(`DELETE FROM employee_credentials WHERE employee_id IN (${employeeSql})`, ...employees);
    for (const table of ['auth_challenges', 'password_reset_challenges', 'whatsapp_auth_challenges'])
      tx.add(`UPDATE ${table} SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE employee_id IN (${employeeSql})`, ...employees);
    tx.add(`UPDATE signup_verifications SET consumed_at=COALESCE(consumed_at,CURRENT_TIMESTAMP) WHERE existing_employee_id IN (${employeeSql})`, ...employees);
    for (const table of ['employee_devices', 'employee_temporary_passwords', 'employee_verified_contacts', 'staffportal_external_identity_links'])
      tx.add(`UPDATE ${table} SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE employee_id IN (${employeeSql})`, ...employees);
    tx.add(`UPDATE employee_login_access_requests SET status='cancelled' WHERE employee_id IN (${employeeSql}) AND status='ready'`, ...employees);
    tx.add(`UPDATE employee_company_memberships SET active=0 WHERE employee_id IN (${employeeSql})`, ...employees);
    tx.add(`DELETE FROM employee_roles WHERE employee_id IN (${employeeSql})`, ...employees);
    for (const table of ['employee_permission_overrides', 'employee_permission_overrides_v2'])
      tx.add(`DELETE FROM ${table} WHERE employee_id IN (${employeeSql})`, ...employees);
    tx.add(`DELETE FROM role_permissions WHERE role_id IN (?,?,?)`, ...personas.map(p => id(`role-${p}`)));
    tx.add(`UPDATE roles SET active=0 WHERE id IN (?,?,?)`, ...personas.map(p => id(`role-${p}`)));
    tx.add(`UPDATE employees SET employment_status='inactive' WHERE id IN (${employeeSql})`, ...employees);
    tx.add(`UPDATE company_locations SET active=0 WHERE id IN (?,?)`, ...scopes.map(scope => id(`site-${scope}`)));
    tx.add(`UPDATE companies SET active=0 WHERE id IN (${companySql})`, ...companies);
    for (const scope of scopes) {
      tx.add(`DELETE FROM payroll_items WHERE id=?`, id(`payroll-item-${scope}`));
      tx.add(`UPDATE payroll_runs SET status='cancelled',gross_total_kobo=0,net_total_kobo=0,deduction_total_kobo=0 WHERE id=?`, id(`payroll-${scope}`));
      tx.add(`UPDATE finance_receivables SET status='cancelled',balance_kobo=0 WHERE id=?`, id(`receivable-${scope}`));
    }
    tx.add(`INSERT INTO audit_logs(${Object.keys(audit.fixed).join(',')}) SELECT ${Object.keys(audit.fixed).map(() => '?').join(',')}
      WHERE EXISTS(SELECT 1 FROM employees WHERE id=?) AND EXISTS(SELECT 1 FROM companies WHERE id=?) ON CONFLICT(id) DO NOTHING`,
    ...Object.values(audit.fixed), id('owner'), id('company-a'));
    const resetFinancial = scopes.flatMap(scope => [id(`payroll-item-${scope}`), id(`payroll-${scope}`), id(`receivable-${scope}`)]);
    tx.check(`NOT EXISTS(SELECT 1 FROM employees WHERE id IN (${employeeSql}) AND employment_status<>'inactive')
      AND NOT EXISTS(SELECT 1 FROM auth_sessions WHERE employee_id IN (${employeeSql}) AND revoked_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM employee_credentials WHERE employee_id IN (${employeeSql}))
      AND NOT EXISTS(SELECT 1 FROM employee_company_memberships WHERE employee_id IN (${employeeSql}) AND active=1)
      AND NOT EXISTS(SELECT 1 FROM employee_roles WHERE employee_id IN (${employeeSql}))
      AND NOT EXISTS(SELECT 1 FROM roles WHERE id IN (?,?,?) AND active<>0)
      AND NOT EXISTS(SELECT 1 FROM companies WHERE id IN (${companySql}) AND active<>0)
      AND NOT EXISTS(SELECT 1 FROM company_locations WHERE id IN (?,?) AND active<>0)
      AND NOT EXISTS(SELECT 1 FROM payroll_items WHERE id=?)
      AND NOT EXISTS(SELECT 1 FROM payroll_runs WHERE id=? AND (status<>'cancelled' OR gross_total_kobo<>0 OR net_total_kobo<>0 OR deduction_total_kobo<>0))
      AND NOT EXISTS(SELECT 1 FROM finance_receivables WHERE id=? AND (status<>'cancelled' OR balance_kobo<>0))
      AND NOT EXISTS(SELECT 1 FROM payroll_items WHERE id=?)
      AND NOT EXISTS(SELECT 1 FROM payroll_runs WHERE id=? AND (status<>'cancelled' OR gross_total_kobo<>0 OR net_total_kobo<>0 OR deduction_total_kobo<>0))
      AND NOT EXISTS(SELECT 1 FROM finance_receivables WHERE id=? AND (status<>'cancelled' OR balance_kobo<>0))
      AND (NOT EXISTS(SELECT 1 FROM employees WHERE id=?) OR EXISTS(SELECT 1 FROM audit_logs WHERE id=?))`,
    [...employees, ...employees, ...employees, ...employees, ...employees, ...personas.map(p => id(`role-${p}`)),
      ...companies, ...scopes.map(scope => id(`site-${scope}`)), ...resetFinancial, id('owner'), id('audit-reset')]);
  }
  setPhase('database-batch');
  await env.DB.batch(tx.statements);
}

export async function routeStagingQaSeeder(request: Request, env: StagingQaEnv): Promise<Response | null> {
  if (new URL(request.url).pathname !== '/api/staging/qa-fixture') return null;
  // Must precede headers/body, every secret lookup, and DB access (including prepare).
  if (env.APP_STAGE !== 'staging' || env.STAFFPORTAL_DATABASE_NAME !== 'daenem-staffportal-staging-db') return reply(404);
  let phase: FailurePhase = 'request';
  try {
    if (request.method !== 'POST' || request.headers.has('origin')) return reply(404);
    const expected = env.STAFFPORTAL_QA_ADMIN_SECRET;
    const header = request.headers.get('authorization') || '';
    if (typeof expected !== 'string' || expected.length < 32 || expected.length > 256 ||
        header.length > 263 || !header.startsWith('Bearer ') || !await authorized(header.slice(7), expected)) return reply(404);
    // The only accepted body is a bounded action label. Streaming avoids trusting Content-Length.
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    let bytes = 0, text = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 64) { await reader.cancel(); return reply(400); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('action' in body) ||
        (body.action !== 'seed' && body.action !== 'reset')) return reply(400);
    await apply(env, body.action, next => { phase = next; });
    return reply(200, { ok: true, fixture: namespace, action: body.action });
  } catch (error) {
    const response = reply(503);
    response.headers.set('x-qa-error-class', failureClass(error));
    response.headers.set('x-qa-error-phase', phase);
    return response;
  }
}
