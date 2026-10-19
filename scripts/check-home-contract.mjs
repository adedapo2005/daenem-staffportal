import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

const home = read('src/post-auth-experience.tsx');
const dashboard = read('src/zip-dashboard.tsx');
const capability = read('src/dashboard-capabilities.ts');
const selfService = read('worker/employee-self-service.ts');
const runtime = read('worker/runtime.ts');

must(home.includes('function toneFor') && home.includes("'owner'") && home.includes("'manager'") && home.includes("'employee'"), 'Home must compose owner, manager and employee tones');
must(home.includes('canSeeDashboardField'), 'Home must use field-level permission checks');
must(home.includes("label: tone === 'employee' ? 'My Workspace'"), 'employees need a safe personal Home fallback');
must(dashboard.includes('PostAuthHomeBanner') && dashboard.includes('data-dashboard-field'), 'dashboard must render the permission-composed Home surface');
must(capability.includes('DASHBOARD_FIELD_PERMISSIONS') && capability.includes('visibleDashboardFields'), 'Home dashboard fields must have a shared permission registry');
must(selfService.includes('const date=today(),employeeId=context.employee.id'), 'My Day must derive identity from the authenticated session');
must(selfService.includes('WHERE employee_id=?'), 'My Day records must be employee scoped');
must(selfService.includes('return json({date,attendance'), 'My Day must return the bounded personal Home payload');
must(runtime.includes("url.pathname.startsWith('/api/ess/')"), 'Self Service routes must be recognized by the Worker');
must(runtime.includes('routeEmployeeSelfService'), 'Self Service routes must use the authenticated handler');
must(!home.includes('fixture') && !home.includes('mock'), 'Home renderer must not rely on fixture or mock data');
must(!dashboard.includes('sample data') && !dashboard.includes('placeholder data'), 'Home dashboard must not label fabricated live data');
console.log('HOME_CONTRACT=PASS');
console.log('HOME_SURFACES=employee-manager-owner-my-day-dashboard-fields');
