import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/theme-preferences.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Group theme management requires an explicit group role', source.includes("['owner', 'group_admin'].includes(role.code)"));
check('Group theme management also requires Settings manage permission', source.includes("isGroupAdmin(context) && hasPermission(context, 'settings.access', 'manage')"));
check('Theme policy advertises the same group authority used by writes', source.includes('canManage: canManageGroupTheme(context)') && source.includes('const canManage = canManageGroupTheme(context)'));
check('Personal theme changes respect forced Group policy', source.includes('if (currentPolicy.forcedTheme)'));
check('Personal theme changes respect employee-choice policy', source.includes('if (!currentPolicy.allowEmployeeChoice)'));
check('Personal themes are restricted to the approved catalogue', source.includes('if (!validTheme(body.theme))'));
check('Personal theme changes are audited', source.includes("'update_personal_preference'") && source.includes("JSON.stringify({ theme })"));
check('Sign-in configuration is normalized before persistence', source.includes('const config = cleanSignInConfig(body.config)'));
check('Sign-in configuration changes are audited', source.includes("'update_signin_config'") && source.includes('schemaVersion: config.schemaVersion'));
check('AI copy generation is restricted to approved widget kinds', source.includes("body.kind !== 'inspiration' && body.kind !== 'motivation'"));
check('AI copy generation is audited without prompt content', source.includes("'generate_signin_copy_options'") && source.includes('candidateCount: result.candidates.length'));
check('Theme policy accepts only approved themes', source.includes('!validTheme(body.defaultTheme)') && source.includes('!validTheme(body.forcedTheme, true)'));
check('Theme policy rejects empty mutations', source.includes("No theme policy changes supplied."));
check('Theme policy and audit persist atomically', source.includes("'update_group_policy'") && source.includes("JSON.stringify(planned)") && source.indexOf("'update_group_policy'") < source.lastIndexOf('await env.DB.batch(statements)'));
check('Post-login appearance keeps an explicit Ocean Azure default', source.includes("const POSTLOGIN_DEFAULT_PALETTE = 'ocean-azure-prestige'"));
check('Post-login palette writes use separate keys from Sign-In theme settings', source.includes("ui.postlogin_default_palette") && source.includes('postLoginPreferenceKey(context.employee.id)'));
check('Personal post-login palettes respect force and choice policies', source.includes('if (current.forcedPalette)') && source.includes('if (!current.allowEmployeeChoice)'));
check('Shared post-login policy requires the existing group theme authority', source.includes("/api/theme/postlogin/policy") && source.includes("if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403)"));
check('Post-login palette preference and policy changes are audited', source.includes("update_postlogin_palette_preference") && source.includes("update_postlogin_palette_policy"));
check('All theme responses disable caching', source.includes("'cache-control': 'no-store'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Theme builder boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Theme builder boundary assertions passed.`);
