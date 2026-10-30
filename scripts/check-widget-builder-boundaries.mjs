import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../worker/theme-preferences.ts', import.meta.url), 'utf8');
const preferences = readFileSync(new URL('../src/signin-preferences.ts', import.meta.url), 'utf8');
const studio = readFileSync(new URL('../src/theme-studio-entry.ts', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/zip-dashboard.tsx', import.meta.url), 'utf8');
const signInWrite = worker.slice(worker.indexOf("if (url.pathname === '/api/theme/signin' && request.method === 'POST')"), worker.indexOf("if (url.pathname === '/api/theme/signin/ai/generate'"));
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Widget administration requires explicit Group authority and Settings manage', worker.includes("isGroupAdmin(context) && hasPermission(context, 'settings.access', 'manage')"));
check('Unauthorized widget configuration writes fail before body processing', worker.indexOf("if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403)") < worker.indexOf("const config = cleanSignInConfig(body.config)"));
check('Widget configuration is normalized before persistence', worker.includes('const config = cleanSignInConfig(body.config)'));
check('Widget configuration and audit evidence persist atomically', signInWrite.includes("'update_signin_config'") && signInWrite.includes('await env.DB.batch(['));
check('Backend widget instances have an explicit safety ceiling', worker.includes('const MAX_SIGNIN_WIDGET_INSTANCES = 20;') && worker.includes('.slice(0, MAX_SIGNIN_WIDGET_INSTANCES)'));
check('Shared preference normalization enforces the same safety ceiling', preferences.includes('export const MAX_SIGNIN_WIDGET_INSTANCES = 20;') && preferences.includes('.slice(0, MAX_SIGNIN_WIDGET_INSTANCES)'));
check('Widget kinds are allowlisted at both trust boundaries', worker.includes('SIGNIN_WIDGET_KINDS.includes') && preferences.includes('ALL_WIDGETS.includes(kind)'));
check('Widget zones are allowlisted at both trust boundaries', worker.includes('SIGNIN_ZONES.includes') && preferences.includes('ALL_ZONES.includes'));
check('Widget variants fall back to the approved kind catalogue', worker.includes('available.includes(String(value))') && preferences.includes('normalizeWidgetVariant(kind, raw.variant)'));
check('Widget effects are restricted to approved presets', worker.includes('EFFECT_PRESETS.includes') && preferences.includes('ALL_EFFECT_PRESETS.includes'));
check('Widget identifiers are sanitized, bounded and deduplicated', worker.includes("replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)") && preferences.includes('while (usedIds.has(id))'));
check('Widget labels use the bounded sign-in label policy', worker.includes('LABEL_LIMITS.widget') && preferences.includes('SIGNIN_LABEL_LIMITS.widget'));
check('The studio exposes add, remove, visibility, ordering, zone and variant controls', studio.includes('data-widget-add') && studio.includes('data-widget-remove') && studio.includes('data-widget-visible') && studio.includes('data-widget-move') && studio.includes('data-widget-zone') && studio.includes('data-widget-variant'));
check('Dashboard widget fields are permission-composed before render', dashboard.includes('definition.fields.every((field) => canSeeDashboardField(context, field, companyId))'));
check('Dashboard widgets with feature permissions are filtered before render', dashboard.includes('widgets.filter((widget) => canRenderDashboardWidget(widget, context, company.id))'));
check('Stored dashboard choices cannot restore an unauthorized widget', dashboard.includes('allowedWidgets.includes(item)'));
check('Action-queue rows repeat field authorization', dashboard.includes('queueItems.filter((item) => canSeeDashboardField(context, item.field, company.id))'));
check('Administrator widget controls require an Owner or Group Admin role', dashboard.includes("['owner', 'group_admin'].includes(role.code)") && dashboard.includes('customizing && canManageWidgets'));
check('Dashboard rearrangement is available only in explicit customization mode', dashboard.includes('draggable={customizing}') && dashboard.includes('if (customizing) setDragged(widget)'));
check('Human-visible widget status time uses a 12-hour locale format', dashboard.includes("toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })"));
check('AI widget copy remains limited to non-news approved kinds', worker.includes("body.kind !== 'inspiration' && body.kind !== 'motivation'"));
check('All widget configuration responses disable caching', worker.includes("'cache-control': 'no-store'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Widget builder boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Widget builder boundary assertions passed.`);
