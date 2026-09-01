import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0039_owner_support_access.sql');
const support=read('worker/owner-support.ts');
const access=read('worker/access-control.ts');
const profile=read('worker/profile-management.ts');
const runtime=read('worker/runtime.ts');
const client=read('src/owner-support.tsx');
const inbox=read('src/support-inbox.tsx');
const moduleHub=read('src/module-hub.tsx');
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

check('support commands are allow-listed',migration.includes("CHECK (action IN")&&support.includes('commandActions.includes'));
check('support commands expire and are acknowledged',migration.includes("status IN ('pending','acknowledged','failed','expired')")&&support.includes('/api/support/command/ack'));
check('support actions are business scoped',support.includes("hasPermission(context, 'support.manage', 'manage', companyId)")&&support.includes('targetInCompany'));
check('session tokens and passwords are never selected',!support.includes('token_hash')&&!support.toLowerCase().includes('password credential'));
check('assistance requires employee consent',migration.includes("'awaiting_consent'")&&support.includes('/api/support/assistance/respond')&&client.includes('Request Employee Consent'));
check('assistance is time limited and read only by default',migration.includes("datetime('now','+30 minutes')")&&migration.includes("DEFAULT 'read_only'"));
check('remote cache affects only portal caches',inbox.includes("key.startsWith('daenem-')||key.includes('workforce')")&&inbox.includes("key!=='daenem-workforce-device-id'"));
check('remote sign-out can target one or all sessions',support.includes("action === 'revoke_session'")&&support.includes("action === 'revoke_all_sessions'"));
check('support module loads on demand',moduleHub.includes("load: () => import('./owner-support-entry')")&&moduleHub.includes("permissions: ['support.access']"));
check('general roles require dedicated permission',access.includes("roles.general','manage'")&&access.includes("scope==='general'"));
check('business assignments require dedicated permission',access.includes("users.business_assignments','manage'")&&access.includes('/api/access-control/business-assignment'));
check('new admin-created employees are provisional',profile.includes("'provisional',?,CASE")&&profile.includes("'role-provisional'"));
check('employee administration list is company scoped',profile.includes('m.company_id IN (${placeholders})')&&profile.includes("hasPermission(c,'users.access','view',company.id)"));
check('runtime protects support routes with authentication',runtime.includes("url.pathname.startsWith('/api/support/')")&&runtime.includes('routeOwnerSupport(request, env, context)'));
check('every remote action has a plain description',client.includes('Remove only cached Daenem Staff Portal files')&&client.includes('Immediately revoke every active Staff Portal session'));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} owner-support contract assertion(s) failed.`);
else console.log(`\n${assertions.length} owner-support contract assertions passed.`);
