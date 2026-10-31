import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/provisional-shell-projection.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../src/qa-review-v115-runtime.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/provisional-profile-workspace.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, () => {
  throw new Error('Unexpected runtime dependency');
});
const { isProvisionalEmployee, projectProvisionalShellSession } = loaded.exports;

const context = {
  sessionId: 'session-pending',
  employee: { id: 'employee-pending', displayName: 'Ada Applicant', status: 'provisional', timezone: 'Africa/Lagos' },
  companies: [{ id: 'company-print', code: 'PRINT', name: 'Printing', primary: true }],
  roles: [{ id: 'owner-role', code: 'owner', name: 'Owner / Super Admin', companyId: 'company-print' }],
  permissions: { 'profile.access': 'edit', 'finance.access': 'manage', 'payroll.access': 'manage', 'users.access': 'manage' },
};
const base = {
  role: 'Owner', company: 'group', personId: 'original-owner', profile: 'Owner',
  assignments: [
    { module: 'finance', level: 'Manage', companies: ['group'], scope: 'GROUP', capabilities: ['approvePayments'] },
    { module: 'payroll', level: 'Manage', companies: ['group'], scope: 'GROUP', capabilities: ['executePayroll'] },
  ],
  overrides: { finance: 'Manage', payroll: 'Manage' },
  capabilities: { '*': ['issuePassword', 'override'] },
};
assert.equal(isProvisionalEmployee(context), true);
const projected = projectProvisionalShellSession(base, context, 'printing');
assert.equal(projected.role, 'Employee');
assert.deepEqual(projected.roles, ['Employee'], 'pending Owner roles cannot leak into shell navigation');
assert.equal(projected.profile, 'Provisional');
assert.equal(projected.provisional, false, 'the shell grants exactly the explicit profile assignment');
assert.equal(projected.personId, context.employee.id);
assert.deepEqual(projected.assignments.map(({ module }) => module), ['profile']);
assert.deepEqual(projected.assignments[0], {
  module: 'profile', level: 'Edit', companies: ['printing'], scope: 'OWN', capabilities: [],
});
assert.deepEqual(projected.overrides, {});
assert.deepEqual(projected.capabilities, {});
assert.deepEqual(projected.fieldRules, {});
assert.deepEqual(projected.timedOverrides, {});
assert.equal(projected.assignments.some(({ module }) => ['finance', 'payroll', 'admin', 'access'].includes(module)), false);
const readOnly = projectProvisionalShellSession(base, {
  ...context, permissions: { ...context.permissions, 'profile.access': 'view' },
}, 'printing');
assert.equal(readOnly.assignments[0].level, 'View', 'view-only profile grants cannot become edit access');
const noProfile = projectProvisionalShellSession(base, {
  ...context, permissions: { ...context.permissions, 'profile.access': 'none' },
}, 'printing');
assert.deepEqual(noProfile.assignments, [], 'missing profile permission fails closed');
const createOnly = projectProvisionalShellSession(base, {
  ...context, permissions: { ...context.permissions, 'profile.access': 'create' },
}, 'printing');
assert.deepEqual(createOnly.assignments, [], 'create permission cannot be promoted into profile editing');
const noCompany = projectProvisionalShellSession(base, context, 'group');
assert.equal(noCompany.company, 'printing');
assert.deepEqual(noCompany.assignments[0].companies, ['printing'], 'missing company context retains only the own-profile shell');
assert.equal(isProvisionalEmployee({ employee: { ...context.employee, status: 'active' } }), false);
assert.match(runtime, /if \(isProvisionalEmployee\(context\)\) \{\s*return projectProvisionalShellSession/);
assert.match(runtime, /return projectProvisionalShellSession\(approved, context, company\);\s*\}\s*return \{/);
assert.match(runtime, /ProvisionalProfileMount context=\{context\} onLogout=\{onLogout\} onRefresh=\{onRefresh\}/);
assert.match(runtime, /createPortal\([\s\S]*ProvisionalProfileWorkspace[\s\S]*target/);
assert.match(runtime, /isProvisional \? 'Employee' : companyNavigationRole/);
assert.match(runtime, /const provisionalRouteBlocked = isProvisional && routePathname !== '\/profile'/);
assert.match(runtime, /if \(provisionalRouteBlocked\) return/);
assert.match(runtime, /if \(routePathname === '\/review\/viewports'/);
assert.match(runtime, /\.p-app\[data-workspace="profile"\]/);
assert.match(main, /replaceState\(window\.history\.state, '', '\/profile'\)/);
assert.doesNotMatch(main, /<ProvisionalProfileWorkspace/);
assert.match(component, /embedded \? 'Your Profile Setup'/);
assert.equal((runtime.match(/<Stage1LiveErpRouteBridge context=\{context\} \/>/g) || []).length, 1);
console.log('PROVISIONAL_SHELL_PROFILE_ONLY assertions passed');
