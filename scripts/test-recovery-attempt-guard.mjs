import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['worker/recovery-attempt-guard.ts'],
  bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  write: false, logLevel: 'silent',
});
const uri = 'data:text/javascript;base64,' +
  Buffer.from(compiled.outputFiles[0].contents).toString('base64');
const { reservePublicRecoveryAttempt } = await import(uri);
const emailSource = readFileSync('worker/password-auth.ts', 'utf8');
const whatsAppSource = readFileSync('worker/whatsapp-recovery.ts', 'utf8');
const forgot = emailSource.split('async function forgotPassword(')[1]?.split('async function verifyReset(')[0];
const whatsapp = whatsAppSource.split('export async function startPasswordRecoveryWhatsApp(')[1]?.split('export async function verifyPasswordRecoveryWhatsApp(')[0];
assert.ok(forgot && whatsapp, 'Both public recovery entry points must exist');
assert.ok(forgot.includes("reservePublicRecoveryAttempt(env, request, identifier, 'email')"), 'Email recovery uses shared guard');
assert.ok(whatsapp.includes("reservePublicRecoveryAttempt(env, request, identifier, 'whatsapp')"), 'WhatsApp recovery uses shared guard');
assert.ok(forgot.indexOf('reservePublicRecoveryAttempt') < forgot.indexOf('resolveRecoveryCompanyForIdentifier'), 'Email guard precedes account lookup');
assert.ok(whatsapp.indexOf('reservePublicRecoveryAttempt') < whatsapp.indexOf('resolveRecoveryCompanyForIdentifier'), 'WhatsApp guard precedes account lookup');

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE security_logs (
  id TEXT PRIMARY KEY, employee_id TEXT, company_id TEXT,
  event_type TEXT NOT NULL, severity TEXT, result TEXT,
  ip_address TEXT, user_agent TEXT, details_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);
let failedAudit = false;
const env = {
  APP_STAGE: 'staging', AUTH_PEPPER: 'unit-only-credential-pepper',
  DB: { prepare(sql) {
    const statement = db.prepare(sql);
    return { bind(...values) { return {
      async first() { if (failedAudit) throw Error('audit unavailable'); return statement.get(...values) || null; },
      async run() { if (failedAudit) throw Error('audit unavailable'); return statement.run(...values); },
    }; } };
  } },
};
const req = (ip) => new Request('https://example.org/api/auth/recover', {
  headers: { 'cf-connecting-ip': ip, 'user-agent': 'security-qa' },
});
const gate = (who, channel = 'email', ip = '203.0.113.1') =>
  reservePublicRecoveryAttempt(env, req(ip), who, channel);
const rows = (sql) => db.prepare(sql).all();
let tests = 0;
async function check(label, fn) { await fn(); tests++; console.log(`PASS ${label}`); }
await check('identity budget shared across email and WhatsApp with normalized case', async () => {
  assert.equal(await gate('ADA@EXAMPLE.COM'), true);
  assert.equal(await gate('ada@example.com', 'whatsapp'), true);
  assert.equal(await gate('Ada@example.com'), true);
  assert.equal(await gate('ada@example.com', 'whatsapp'), false);
  assert.equal(rows("SELECT COUNT(*) AS c FROM security_logs WHERE event_type='account_recovery_rate_gate'")[0].c, 3);
});
await check('IP budget shared across different identifiers and delivery channels', async () => {
  assert.equal(await gate('bob@example.com'), true);
  assert.equal(await gate('clara@example.com', 'whatsapp'), true);
  assert.equal(await gate('dan@example.com'), false);
  assert.equal(rows("SELECT COUNT(*) AS c FROM security_logs WHERE event_type='account_recovery_rate_gate'")[0].c, 5);
});
await check('other IP cannot evade an exhausted identifier budget', async () => {
  assert.equal(await gate('ada@example.com', 'email', '203.0.113.2'), false);
  assert.equal(await gate('eve@example.com', 'email', '203.0.113.2'), true);
});
await check('rate-limit denial audits are capped without additional recovery', async () => {
  for (let i = 0; i < 8; i++) assert.equal(await gate(`bulk${i}@example.com`), false);
  assert.equal(rows("SELECT COUNT(*) AS c FROM security_logs WHERE event_type='account_recovery_rate_limited' AND ip_address='203.0.113.1'")[0].c, 3);
});
await check('audit has only keyed identity hash and channel, never raw identifier', async () => {
  for (const log of rows('SELECT * FROM security_logs')) {
    assert.ok(!JSON.stringify(log).includes('ada@example.com'));
    const details = JSON.parse(log.details_json);
    assert.match(details.identifierHash, /^[a-f0-9]{64}$/);
    assert.ok(details.channel === 'email' || details.channel === 'whatsapp');
  }
});
await check('audit-write fault fails closed before any delivery can be sent', async () => {
  failedAudit = true;
  await assert.rejects(gate('new@example.com', 'email', '203.0.113.9'), /audit unavailable/);
  failedAudit = false;
});
await check('expired reservations permit a new request', async () => {
  db.prepare("UPDATE security_logs SET occurred_at=datetime('now','-16 minutes') WHERE event_type='account_recovery_rate_gate' AND ip_address=?").run('203.0.113.1');
  assert.equal(await gate('ada@example.com'), true);
});
await check('production rejects missing security secret', async () => {
  env.APP_STAGE = 'production';
  env.AUTH_PEPPER = undefined;
  await assert.rejects(gate('safe@example.com', 'email', '203.0.113.19'), /secret is unavailable/);
  env.APP_STAGE = 'staging';
  env.AUTH_PEPPER = 'unit-only-credential-pepper';
});
await check('malformed identifiers cannot trigger code delivery', async () => {
  assert.equal(await gate(''), false);
  assert.equal(await gate('x'.repeat(255)), false);
});
db.close();
console.log(`STAFFPORTAL_RECOVERY_RATE_AUDIT_PASS ${tests}/${tests}`);
