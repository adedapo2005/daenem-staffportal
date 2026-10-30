import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const [source, scopeSource, coreMigration] = await Promise.all([
  readFile(new URL('worker/password-auth.ts', root), 'utf8'),
  readFile(new URL('worker/staffportal-account-scope.ts', root), 'utf8'),
  readFile(new URL('migrations/0001_core.sql', root), 'utf8'),
]);
const compile = (text) => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const scopeModule = { exports: {} };
new Function('module', 'exports', compile(scopeSource))(scopeModule, scopeModule.exports);
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compile(source))(loaded, loaded.exports, (specifier) => {
  if (specifier === './auth') return { sessionCookie: () => '' };
  if (specifier === './whatsapp-auth') return { startWhatsAppChallenge: async () => null, verifyWhatsAppChallenge: async () => null };
  if (specifier === './whatsapp-recovery') return { startPasswordRecoveryWhatsApp: async () => null, verifyPasswordRecoveryWhatsApp: async () => null };
  if (specifier === './scoped-settings') return {
    RECOVERY_SETTING_KEY: 'security.password_recovery_methods',
    recoveryMethods: () => ['email'],
    resolveScopedSetting: async () => ({ value: { methods: ['email'] }, source: 'default' }),
  };
  if (specifier === './staffportal-account-scope') return scopeModule.exports;
  throw new Error(`Unexpected password-auth dependency: ${specifier}`);
});

const database = new DatabaseSync(':memory:');
database.exec(coreMigration);
database.exec("INSERT INTO companies(id,code,name,business_type) VALUES('company-outsider','OUT','Daenem Bakery','bakery')");
const env = { DB: { prepare: (sql) => ({ bind: (...values) => ({ first: async () => database.prepare(sql).get(...values) }) }) } };
const requestFor = (code) => new Request(`https://staffportal.test/api/auth/password/recovery-options?company=${code}`);
const allowed = await loaded.exports.routePasswordAuth(requestFor('BAKERY'), env);
assert.equal(allowed.status, 200, 'canonical StaffPortal company remains available');
const denied = await loaded.exports.routePasswordAuth(requestFor('OUT'), env);
assert.equal(denied.status, 400, 'a non-StaffPortal company is denied even when its display name resembles a business');
console.log('PASS: recovery-option lookup uses canonical StaffPortal company IDs against the real core SQLite schema');
database.close();
