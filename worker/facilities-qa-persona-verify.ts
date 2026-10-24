import { getSessionContext, hasPermission, type SessionContext } from './auth';
import { routePasswordAuth, type PasswordAuthEnv } from './password-auth';
import { derivePasswordHash, WORKER_SAFE_PASSWORD_ITERATIONS } from './credential-security';
import { inspectFacilitiesQaReadiness } from './facilities-qa-readiness';

/**
 * Only the exact staging Owner may invoke this from the separately gated route.
 * The manager and employee passwords remain in Worker secrets. A successful
 * run uses the real password auth and real Facilities permissions, then revokes
 * only the two synthetic sessions created by the run.
 *
 * No production customer, transaction, facilities record, or auth secrets are
 * read or returned. Password hashes are validated before login to avoid
 * accidentally incrementing the synthetic identities' lockout counters.
 */
export interface QaPersonaEnv extends PasswordAuthEnv {
  STAFFPORTAL_DATABASE_NAME?: string;
  STAFFPORTAL_QA_MANAGER_PASSWORD?: string;
  STAFFPORTAL_QA_EMPLOYEE_PASSWORD?: string;
}
type Route = (request: Request, env: QaPersonaEnv, context: SessionContext) => Promise<Response | null>;
type Identity = 'manager' | 'employee';
type Result = { ok: true; scope: 'qa-staging-v1'; companyIsolation: true;
  managerCompanyA: true; managerDeniedCompanyB: true;
  employeeCompanyB: true; employeeDeniedCompanyA: true;
  employeeWriteDenied: true; credentialsUnchanged: true;
  facilitiesEvidence: 0; temporarySessionsRevoked: true };

export class QaPersonaFailure extends Error {
  constructor(public readonly code: string) { super('QA persona acceptance unavailable'); }
}
const qa = 'qa-staging-v1';
const a = qa + '-company-a', b = qa + '-company-b';
const personas: Identity[] = ['manager','employee'];
const evidenceKeys = ['facilities','equipment','readings','workOrders','schedules','inspections','auditEvents'] as const;
const expected = (data: Awaited<ReturnType<typeof inspectFacilitiesQaReadiness>>) =>
  data.scope === qa && data.state === 'ready' &&
  data.syntheticCompanies === 2 && data.syntheticSites === 2 &&
  data.syntheticEmployees === 3 && data.activeMemberships === 4 &&
  data.credentials === 3 && data.facilitiesGrants === 3 &&
  data.safeToReset && evidenceKeys.every(key => data.evidence[key] === 0);

function constantTimeEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyQaPersonaAuthentication(
  env: QaPersonaEnv, origin: string, route: Route,
): Promise<Result> {
  if (env.APP_STAGE !== 'staging' ||
      env.STAFFPORTAL_DATABASE_NAME !== 'daenem-staffportal-staging-db')
    throw new QaPersonaFailure('QA_PERSONA_STAGE');
  if (!expected(await inspectFacilitiesQaReadiness(env.DB)))
    throw new QaPersonaFailure('QA_PERSONA_FIXTURE_NOT_READY');

  const passwords: Record<Identity, string | undefined> = {
    manager: env.STAFFPORTAL_QA_MANAGER_PASSWORD,
    employee: env.STAFFPORTAL_QA_EMPLOYEE_PASSWORD,
  };
  if (!env.AUTH_PEPPER || personas.some(p => typeof passwords[p] !== 'string' ||
     passwords[p]!.length < 16 || passwords[p]!.length > 128))
    throw new QaPersonaFailure('QA_PERSONA_SECRET_UNAVAILABLE');

  // Never intentionally attempt a wrong login: synthetic credentials may
  // have been rotated independently from their sealed Worker environment.
  const fingerprints: string[] = [];
  for (const persona of personas) {
    const identity = qa + '-' + persona;
    const row = await env.DB.prepare(`
      SELECT c.password_hash AS hash,c.password_salt AS salt,
        c.password_iterations AS iterations
      FROM employee_credentials c JOIN employees e ON e.id=c.employee_id
      WHERE c.employee_id=? AND c.username=? AND e.employment_status='active'
    `).bind(identity, identity).first<{ hash: string; salt: string; iterations: number }>();
    if (!row || Number(row.iterations) !== WORKER_SAFE_PASSWORD_ITERATIONS)
      throw new QaPersonaFailure('QA_PERSONA_CREDENTIAL_INCOMPATIBLE');
    const current = await derivePasswordHash(env, passwords[persona]!, row.salt, Number(row.iterations));
    if (!constantTimeEquals(current, row.hash))
      throw new QaPersonaFailure('QA_PERSONA_SECRET_MISMATCH');
    fingerprints.push(row.hash);
  }

  const activeSessionIds: string[] = [];
  const contexts = {} as Record<Identity, SessionContext>;
  let completed = false;
  try {
    for (const persona of personas) {
      // Canonical password login occurs inside this Worker; no credentials or
      // synthetic session cookies are passed back to the browser.
      const response = await routePasswordAuth(new Request(origin + '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type':'application/json' },
        body: JSON.stringify({ identifier: qa + '-' + persona, password: passwords[persona] }),
      }), env);
      if (response?.status !== 200) throw new QaPersonaFailure('QA_PERSONA_LOGIN_UNAVAILABLE');
      const cookie = response.headers.get('set-cookie')?.split(';')[0];
      if (!cookie?.startsWith('daenem_workforce_session='))
        throw new QaPersonaFailure('QA_PERSONA_SESSION_MISSING');
      const context = await getSessionContext(
        new Request(origin + '/api/auth/me', { headers: { cookie } }), env);
      if (!context || context.employee.id !== qa + '-' + persona || !context.sessionId)
        throw new QaPersonaFailure('QA_PERSONA_CONTEXT_UNAVAILABLE');
      activeSessionIds.push(context.sessionId);
      contexts[persona] = context;
    }
    const manager = contexts.manager, employee = contexts.employee;
    if (!manager.roles.some(role => role.code==='manager' && role.companyId===a) ||
        manager.companies.length!==1 || manager.companies[0].id!==a ||
        !hasPermission(manager,'facilities.access','edit',a) ||
        hasPermission(manager,'facilities.access','view',b) ||
        !employee.roles.some(role => role.code==='employee' && role.companyId===b) ||
        employee.companies.length!==1 || employee.companies[0].id!==b ||
        !hasPermission(employee,'facilities.access','view',b) ||
        hasPermission(employee,'facilities.access','create',b) ||
        hasPermission(employee,'facilities.access','view',a))
      throw new QaPersonaFailure('QA_PERSONA_RBAC_MISMATCH');

    const call = async (persona: Identity, path: string, body?: Record<string,string>) => {
      const request = new Request(origin + path, body ? {
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),
      }:undefined);
      const response = await route(request, env, contexts[persona]);
      if (!response) throw new QaPersonaFailure('QA_PERSONA_ROUTE_UNAVAILABLE');
      return response.status;
    };
    if (await call('manager', '/api/facilities/overview?companyId='+a)!==200 ||
        await call('manager', '/api/facilities/overview?companyId='+b)!==403 ||
        await call('employee', '/api/facilities/overview?companyId='+b)!==200 ||
        await call('employee', '/api/facilities/overview?companyId='+a)!==403 ||
        await call('employee', '/api/facilities', {
          companyId:b,locationId:qa+'-site-b',name:'QA MUST NOT PERSIST',
          facilityType:'office',
        })!==403 ||
        await call('manager', '/api/facilities', {
          companyId:b,locationId:qa+'-site-b',name:'QA FOREIGN MUST NOT PERSIST',
          facilityType:'office',
        })!==403)
      throw new QaPersonaFailure('QA_PERSONA_COMPANY_DENIAL_MISMATCH');

    // Checking actual credential hashes excludes a silent password rotation.
    for (let i = 0; i < personas.length; i++) {
      const row = await env.DB.prepare(
        'SELECT password_hash AS hash FROM employee_credentials WHERE employee_id=?',
      ).bind(qa+'-'+personas[i]).first<{hash:string}>();
      if (!row || !constantTimeEquals(row.hash, fingerprints[i]))
        throw new QaPersonaFailure('QA_PERSONA_PASSWORD_MUTATED');
    }
    if (!expected(await inspectFacilitiesQaReadiness(env.DB)))
      throw new QaPersonaFailure('QA_PERSONA_UNEXPECTED_FACILITIES_MUTATION');
    completed = true;
  } finally {
    // Revocation is unconditional on success and error. Never revoke the real
    // Owner session or an existing synthetic session not created above.
    for (const id of activeSessionIds) {
      await env.DB.prepare(
        'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=? AND employee_id IN (?,?)',
      ).bind(id,qa+'-manager',qa+'-employee').run();
    }
  }
  if (!completed) throw new QaPersonaFailure('QA_PERSONA_INCOMPLETE');
  return { ok:true,scope:qa,companyIsolation:true,
    managerCompanyA:true,managerDeniedCompanyB:true,
    employeeCompanyB:true,employeeDeniedCompanyA:true,
    employeeWriteDenied:true,credentialsUnchanged:true,
    facilitiesEvidence:0,temporarySessionsRevoked:true };
}
