import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('migrations/0038_guidance_broadcast_center.sql');
const backend = read('worker/broadcasts.ts');
const runtime = read('worker/runtime.ts');
const guideBackend = read('worker/ai-guide.ts');
const broadcastUi = read('src/broadcast-center.tsx');
const guideUi = read('src/guidance-center.tsx');
const navigationUi = read('src/navigation-studio-entry.tsx');
const main = read('src/main.tsx');
const assertions = [];

function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('broadcast expiry migration', migration.includes('ADD COLUMN expires_at') && migration.includes('idx_workforce_broadcasts_delivery_window'));
for (const audience of ['selected_employees', 'role', 'department', 'company', 'group']) {
  check(`audience: ${audience}`, backend.includes(`'${audience}'`) && broadcastUi.includes(`value="${audience}"`));
}
check('company-scoped departments', backend.includes('m.company_id=?') && backend.includes('lower(e.department)=lower(?)'));
check('emergency defaults enforced server-side', backend.includes('const pushNotification = emergency ||') && backend.includes('const acknowledgementRequired = emergency ||'));
check('scheduled dispatcher wired', backend.includes('dispatchDueBroadcasts') && runtime.includes('dispatchDueBroadcasts(env)'));
check('idempotent delivery', backend.includes('INSERT OR IGNORE INTO workforce_broadcast_recipients') && backend.includes('notification-${broadcast.id}-${recipient.employeeId}'));
check('read and acknowledgement receipts', backend.includes("'/api/broadcasts/read'") && backend.includes("'/api/broadcasts/acknowledge'"));
check('delivery statistics', backend.includes('AS readCount') && broadcastUi.includes('acknowledgedCount'));
check('WAT scheduling', broadcastUi.includes("timeZone: 'Africa/Lagos'") && broadcastUi.includes("+01:00"));
check('offline notice cache', broadcastUi.includes('daenem-broadcast-notices') && broadcastUi.includes('daenem-broadcast-receipts'));
check('permission-filtered guide catalog', guideBackend.includes('visibleFunctions(context,company.id,company.code)') && guideBackend.includes("'/api/ai/guide/catalog'"));
check('effective access in AI prompt', guideBackend.includes('AUTHORIZED FUNCTION CATALOG') && guideBackend.includes('[${item.accessLevel}]'));
check('required and optional onboarding', guideUi.includes("item.setup === 'required'") && guideUi.includes("item.setup === 'optional'"));
check('Access Control guidance opens audited workspace', guideUi.includes("openFunction('access-control')") && navigationUi.includes('execute(item,setStudio)'));
check('new centers wired into workspace on demand', main.includes("import('./broadcast-center')") && main.includes("import('./guidance-center')") && main.includes('<BroadcastCenter') && main.includes('<AiGuideView'));
check('no credential literals', ![backend, guideBackend, broadcastUi, guideUi].some((source) => /BEGIN (RSA|OPENSSH) PRIVATE KEY|api[_-]?key\s*[:=]\s*['"][^'"]+/i.test(source)));
check('secure identifiers retained', backend.includes('crypto.randomUUID()') && !backend.includes('Math.random()'));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Guidance/Broadcast contract assertion(s) failed.`);
else console.log(`\n${assertions.length} Guidance/Broadcast contract assertions passed.`);
