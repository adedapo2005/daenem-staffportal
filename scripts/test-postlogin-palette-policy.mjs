import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../worker/theme-preferences.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
const levels = ['none', 'view', 'create', 'edit', 'approve', 'manage'];
function hasPermission(context, permission, minimum, companyId) {
  const candidates = companyId
    ? [context.companyPermissions?.[companyId]?.[permission]]
    : Object.values(context.companyPermissions || {}).map((matrix) => matrix?.[permission]);
  return candidates.some((value) => levels.indexOf(value || 'none') >= levels.indexOf(minimum));
}
new Function('require', 'exports', compiled)((id) => {
  if (id === './auth') return { hasPermission };
  throw new Error(`Unexpected import ${id}`);
}, exports);
const route = exports.routeThemePreferences;

class FakeDB {
  settings = new Map();
  audits = [];
  statements = [];
  prepare(sql) {
    return {
      bind: (...args) => ({
        sql,
        args,
        first: async () => {
          if (sql.includes('SELECT setting_value FROM app_settings')) {
            const value = this.settings.get(args[0]);
            return value === undefined ? null : { setting_value: value };
          }
          return null;
        },
        all: async () => ({ results: [] }),
        run: async () => ({ success: true }),
      }),
    };
  }
  async batch(statements) {
    for (const statement of statements) {
      this.statements.push(statement);
      const { sql, args } = statement;
      if (sql.includes('INSERT INTO app_settings')) this.settings.set(args[0], String(args[1]));
      if (sql.includes('DELETE FROM app_settings')) this.settings.delete(args[0]);
      if (sql.includes('INSERT INTO audit_logs')) this.audits.push({ sql, args });
    }
    return statements.map(() => ({ success: true }));
  }
}

const context = ({ owner = false, employeeId = 'employee-a' } = {}) => ({
  employee: { id: employeeId },
  roles: [{ code: owner ? 'owner' : 'employee', companyId: 'company-a' }],
  companies: [{ id: 'company-a' }],
  companyPermissions: {
    'company-a': owner ? { 'settings.access': 'manage' } : {},
  },
});

async function call(db, path, { method = 'GET', body, actor = context() } = {}) {
  const response = await route(new Request(`https://example.test${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { DB: db }, actor);
  return { status: response.status, body: await response.json() };
}

test('policy defaults to approved Ocean Sapphire - Azure Prestige', async () => {
  const db = new FakeDB();
  const result = await call(db, '/api/theme/postlogin/policy');
  assert.equal(result.status, 200);
  assert.equal(result.body.defaultPalette, 'ocean-azure-prestige');
  assert.equal(result.body.effectivePalette, 'ocean-azure-prestige');
  assert.equal(result.body.forcedPalette, '');
  assert.equal(result.body.preferredPalette, '');
  assert.equal(result.body.allowEmployeeChoice, true);
  assert.equal(result.body.canManage, false);
  assert.equal(result.body.palettes.length, 19);
});

test('employee can save and clear only their own approved post-login preference', async () => {
  const db = new FakeDB();
  let result = await call(db, '/api/theme/postlogin/preference', {
    method: 'POST', body: { palette: 'oxblood-opal' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.preferredPalette, 'oxblood-opal');
  assert.equal(result.body.effectivePalette, 'oxblood-opal');
  assert.equal(db.settings.get('ui.postlogin_palette.employee-a'), 'oxblood-opal');
  assert.equal(db.audits.length, 1);
  assert.ok(db.audits[0].args.includes('update_postlogin_palette_preference'));

  result = await call(db, '/api/theme/postlogin/preference', {
    method: 'POST', body: { palette: '' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.preferredPalette, '');
  assert.equal(result.body.effectivePalette, 'ocean-azure-prestige');
  assert.equal(db.settings.has('ui.postlogin_palette.employee-a'), false);
  assert.ok(db.audits.at(-1).args.includes('clear_postlogin_palette_preference'));
});

test('invalid and invented palettes fail closed', async () => {
  const db = new FakeDB();
  const result = await call(db, '/api/theme/postlogin/preference', {
    method: 'POST', body: { palette: 'rainbow-admin-bypass' },
  });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /approved StaffPortal palette/);
  assert.equal(db.settings.size, 0);
  assert.equal(db.audits.length, 0);
});

test('forced Group palette takes precedence and blocks personal writes', async () => {
  const db = new FakeDB();
  db.settings.set('ui.postlogin_forced_palette', 'midnight-jade');
  db.settings.set('ui.postlogin_palette.employee-a', 'royal-orchid');
  const policy = await call(db, '/api/theme/postlogin/policy');
  assert.equal(policy.body.effectivePalette, 'midnight-jade');
  const result = await call(db, '/api/theme/postlogin/preference', {
    method: 'POST', body: { palette: 'plum-glacier' },
  });
  assert.equal(result.status, 409);
  assert.equal(db.settings.get('ui.postlogin_palette.employee-a'), 'royal-orchid');
});

test('disabled personal selection blocks preference changes', async () => {
  const db = new FakeDB();
  db.settings.set('ui.allow_employee_postlogin_palette_choice', 'false');
  const result = await call(db, '/api/theme/postlogin/preference', {
    method: 'POST', body: { palette: 'teal-pearl' },
  });
  assert.equal(result.status, 403);
  assert.equal(db.audits.length, 0);
});

test('only an Owner or Group Admin with settings manage can change shared policy', async () => {
  const db = new FakeDB();
  const denied = await call(db, '/api/theme/postlogin/policy', {
    method: 'POST', body: { defaultPalette: 'emerald-luxe' },
  });
  assert.equal(denied.status, 403);

  const allowed = await call(db, '/api/theme/postlogin/policy', {
    method: 'POST',
    body: { defaultPalette: 'emerald-luxe', forcedPalette: 'ink-saffron', allowEmployeeChoice: false },
    actor: context({ owner: true }),
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.defaultPalette, 'emerald-luxe');
  assert.equal(allowed.body.forcedPalette, 'ink-saffron');
  assert.equal(allowed.body.allowEmployeeChoice, false);
  assert.equal(allowed.body.effectivePalette, 'ink-saffron');
  assert.equal(db.settings.get('ui.postlogin_default_palette'), 'emerald-luxe');
  assert.equal(db.settings.get('ui.postlogin_forced_palette'), 'ink-saffron');
  assert.equal(db.settings.get('ui.allow_employee_postlogin_palette_choice'), 'false');
  assert.ok(db.audits.at(-1).sql.includes("'update_postlogin_palette_policy'"));
});

test('restore approved default and clear force are atomic and audited', async () => {
  const db = new FakeDB();
  db.settings.set('ui.postlogin_default_palette', 'royal-orchid');
  db.settings.set('ui.postlogin_forced_palette', 'oxblood-opal');
  const result = await call(db, '/api/theme/postlogin/policy', {
    method: 'POST',
    body: { defaultPalette: 'ocean-azure-prestige', forcedPalette: '' },
    actor: context({ owner: true }),
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.defaultPalette, 'ocean-azure-prestige');
  assert.equal(result.body.forcedPalette, '');
  assert.equal(result.body.effectivePalette, 'ocean-azure-prestige');
  assert.equal(db.audits.length, 1);
  const batchTail = db.statements.at(-1);
  assert.ok(batchTail.sql.includes('INSERT INTO audit_logs'));
});

test('post-login settings never mutate existing Sign-In theme keys', async () => {
  const db = new FakeDB();
  db.settings.set('ui.default_theme', 'lagos-sunrise');
  db.settings.set('ui.signin_config_v3', '{"schemaVersion":3}');
  await call(db, '/api/theme/postlogin/policy', {
    method: 'POST', body: { defaultPalette: 'cobalt-persimmon' }, actor: context({ owner: true }),
  });
  assert.equal(db.settings.get('ui.default_theme'), 'lagos-sunrise');
  assert.equal(db.settings.get('ui.signin_config_v3'), '{"schemaVersion":3}');
  assert.equal([...db.settings.keys()].some((key) => key.startsWith('ui.postlogin_')), true);
});
