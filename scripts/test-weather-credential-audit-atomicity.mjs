import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../worker/weather-credential-mutations.ts', import.meta.url), 'utf8');
const executable = source
  .replace("import { encryptSocialSecret } from './social-crypto.js';", 'const encryptSocialSecret = async (_env, value) => `encrypted:${value}`;')
  .replace("import { validateMetaCredential, type MetaCredentialEnv } from './meta-credentials.js';", 'const validateMetaCredential = () => null;');
assert.notEqual(executable, source);
const { outputText } = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { recordGoogleWeatherProviderTestWithAudit, replaceGoogleWeatherCredentialWithAudit, revokeGoogleWeatherCredentialWithAudit, runGoogleWeatherProviderTestWithAudit } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE meta_credentials_vault(
    credential_key TEXT PRIMARY KEY NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT
  );
  CREATE TABLE audit_logs(
    id TEXT PRIMARY KEY,
    actor_employee_id TEXT,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    after_json TEXT,
    source TEXT NOT NULL
  );
`);

const env = {
  DB: {
    prepare(sql) {
      return {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return db.prepare(this.sql).get(...this.values); },
        async run() { return { meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } }; },
      };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(({ sql, values }) => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }));
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

try {
  await replaceGoogleWeatherCredentialWithAudit(env, 'test-weather-credential-one', 'owner-1', 'audit-1');
  assert.equal(db.prepare("SELECT ciphertext FROM meta_credentials_vault WHERE credential_key='google_weather_api_key'").get().ciphertext, 'encrypted:test-weather-credential-one');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-1' AND action='replace_weather_provider_credential'").get().n, 1);

  db.exec(`CREATE TRIGGER ignore_weather_audit BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-2' BEGIN SELECT RAISE(IGNORE); END;`);
  await assert.rejects(
    replaceGoogleWeatherCredentialWithAudit(env, 'test-weather-credential-two', 'owner-1', 'audit-2'),
  );
  assert.equal(db.prepare("SELECT ciphertext FROM meta_credentials_vault WHERE credential_key='google_weather_api_key'").get().ciphertext, 'encrypted:test-weather-credential-one');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-2'").get().n, 0);
  db.exec('DROP TRIGGER ignore_weather_audit');

  await revokeGoogleWeatherCredentialWithAudit(env, 'owner-1', 'audit-3');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM meta_credentials_vault WHERE credential_key='google_weather_api_key'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-3' AND action='revoke_weather_provider_credential'").get().n, 1);
  await revokeGoogleWeatherCredentialWithAudit(env, 'owner-1', 'audit-3-retry');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-3-retry'").get().n, 0);

  db.prepare("INSERT INTO meta_credentials_vault(credential_key,ciphertext,updated_by) VALUES('google_weather_api_key','encrypted:keep-me','owner-1')").run();
  db.exec(`CREATE TRIGGER ignore_weather_revoke_audit BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-4' BEGIN SELECT RAISE(IGNORE); END;`);
  await assert.rejects(revokeGoogleWeatherCredentialWithAudit(env, 'owner-1', 'audit-4'));
  assert.equal(db.prepare("SELECT ciphertext FROM meta_credentials_vault WHERE credential_key='google_weather_api_key'").get().ciphertext, 'encrypted:keep-me');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-4'").get().n, 0);
  assert.equal(JSON.stringify(db.prepare('SELECT after_json FROM audit_logs').all()).includes('test-weather-credential'), false);

  await recordGoogleWeatherProviderTestWithAudit(env, 'owner-1', 'audit-weather-start', {
    phase: 'started', providerStatus: 'pending', ok: null,
  });
  await recordGoogleWeatherProviderTestWithAudit(env, 'owner-1', 'audit-weather-result', {
    phase: 'completed', providerStatus: 'fresh', ok: true,
  });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('test_weather_provider_connection_started','test_weather_provider_connection')").get().n, 2);
  assert.equal(JSON.stringify(db.prepare("SELECT after_json FROM audit_logs WHERE action LIKE 'test_weather_provider_connection%'").all()).includes('latitude'), false);

  let providerCalls = 0;
  await runGoogleWeatherProviderTestWithAudit(env, 'owner-1', () => `audit-weather-flow-${providerCalls === 0 ? 'start' : 'result'}`, async () => {
    providerCalls += 1;
    return { data: { temperature: 20 }, providerStatus: 'fresh' };
  });
  assert.equal(providerCalls, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id IN ('audit-weather-flow-start','audit-weather-flow-result')").get().n, 2);

  db.exec(`CREATE TRIGGER ignore_weather_test_start BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-weather-ignored' BEGIN SELECT RAISE(IGNORE); END;`);
  providerCalls = 0;
  await assert.rejects(runGoogleWeatherProviderTestWithAudit(env, 'owner-1', () => 'audit-weather-ignored', async () => {
    providerCalls += 1;
    return { data: { temperature: 20 }, providerStatus: 'fresh' };
  }));
  assert.equal(providerCalls, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-weather-ignored'").get().n, 0);
  db.exec('DROP TRIGGER ignore_weather_test_start');

  db.exec(`CREATE TRIGGER ignore_weather_test_result BEFORE INSERT ON audit_logs
    WHEN NEW.id='audit-weather-result-ignored' BEGIN SELECT RAISE(IGNORE); END;`);
  providerCalls = 0;
  await assert.rejects(runGoogleWeatherProviderTestWithAudit(env, 'owner-1', () =>
    providerCalls === 0 ? 'audit-weather-result-start' : 'audit-weather-result-ignored', async () => {
      providerCalls += 1;
      return { data: { temperature: 20 }, providerStatus: 'fresh' };
    }));
  assert.equal(providerCalls, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE id='audit-weather-result-start' AND action='test_weather_provider_connection_started'").get().n, 1);
  db.exec('DROP TRIGGER ignore_weather_test_result');

  console.log('Google Weather credential and provider-test audit checks PASS (isolated SQLite; no provider or key access)');
} finally {
  db.close();
}
