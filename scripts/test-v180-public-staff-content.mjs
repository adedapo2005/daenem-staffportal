import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT UNIQUE,module TEXT,action TEXT,description TEXT,sensitive INTEGER);`);
database.exec(fs.readFileSync(path.join(root, 'migrations/0104_staffportal_staff_content_publication.sql'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'worker/staffportal-cloudflare-content.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
let context = { employee: { id: 'employee-approved', status: 'active' }, sessionId: 'session-approved', permissions: { 'staffportal.content.publish': 'manage' } };
let contextReads = 0;
const contextQueue = [];
const auth = {
  getSessionContext: async () => { contextReads++; return contextQueue.length ? contextQueue.shift() : context; },
  hasPermission: (value, code, level) => value.permissions?.[code] === level,
};
const moduleBox = { exports: {} };
new Function('exports', 'module', 'require', compiled)(moduleBox.exports, moduleBox, name => name === './auth' ? auth : require(name));
const { routeV180PublicStaffContent } = moduleBox.exports;
const db = { prepare(sql) { return { bind(...values) { const statement = database.prepare(sql); return {
  first: async () => statement.get(...values) || null,
  run: async () => { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
}; }, first: async () => database.prepare(sql).get() || null }; } };
const env = { DB: db, STAFF_PORTAL_FRONTEND_ORIGIN: 'https://staffportal.example.test' };
const req = (url, method = 'GET', body, headers = {}) => new Request(`https://staffportal.example.test${url}`, {
  method, headers: body === undefined ? headers : { 'content-type': 'application/json', origin: 'https://staffportal.example.test', ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const draft = (overrides = {}) => ({
  expectedVersion: 0, spotlightId: 'spotlight-1', spotlightTitle: 'Daily note', spotlightBody: 'A reviewed update.', spotlightCategory: 'Daily Spotlight',
  inspirationId: 'inspiration-1', inspirationMessage: 'Keep learning together.', inspirationAttribution: 'People Team', inspirationCategory: 'Employee Inspiration',
  intervalStartedAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
  reason: 'Owner approved draft content.', ...overrides,
});

try {
  assert.equal(database.prepare('SELECT code FROM permissions').get().code, 'staffportal.content.publish', 'migration registers explicit permission only');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM staffportal_staff_content_publication').get().n, 0, 'migration does not fabricate or copy content');
  let response = await routeV180PublicStaffContent(req('/api/staff-content'), env);
  assert.equal(response.status, 503, 'missing approved source fails closed');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const noGrant = { ...context, permissions: {} };
  context = noGrant;
  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content'), env);
  assert.equal(response.status, 403, 'Owner role alone has no bypass');
  context = { employee: { id: 'employee-approved', status: 'active' }, sessionId: 'session-approved', permissions: { 'staffportal.content.publish': 'manage' } };

  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content', 'PUT', { ...draft(), companyId: 'forged' }), env);
  assert.equal(response.status, 400, 'unexpected company or role fields are rejected');
  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content', 'PUT', draft(), { origin: 'https://attacker.example' }), env);
  assert.equal(response.status, 403, 'untrusted origin is rejected');

  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content', 'PUT', draft()), env);
  assert.equal(response.status, 200, 'explicitly authorized owner can save a draft');
  assert.deepEqual(await response.json(), { ok: true, status: 'draft', publicationVersion: 1 });
  assert.equal(database.prepare('SELECT status,provider,provider_connected FROM staffportal_staff_content_publication').get().provider, 'owner-authored');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM staffportal_staff_content_publication_audit').get().n, 1, 'draft creation and audit are atomic');
  response = await routeV180PublicStaffContent(req('/api/staff-content'), env);
  assert.equal(response.status, 503, 'draft is never public');

  contextQueue.push({ ...context }, noGrant);
  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content/publish', 'POST', { action: 'publish', expectedVersion: 1, reason: 'Permission revocation race.' }), env);
  assert.equal(response.status, 403, 'permission revoked during D1 read is rechecked before publication');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM staffportal_staff_content_publication_audit').get().n, 1, 'revoked permission cannot publish or audit a state change');

  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content/publish', 'POST', { action: 'publish', expectedVersion: 1, reason: 'Owner approved publication.' }), env);
  assert.equal(response.status, 200, 'authorized current owner can publish');
  response = await routeV180PublicStaffContent(req('/api/staff-content'), env);
  assert.equal(response.status, 200);
  const published = await response.json();
  assert.deepEqual(Object.keys(published), ['spotlight', 'inspiration', 'provider', 'providerConnected', 'intervalStartedAt', 'expiresAt']);
  assert.equal(published.provider, 'owner-authored');
  assert.equal(published.providerConnected, false, 'no AI/provider connection is claimed');
  assert.equal(response.headers.get('cache-control'), 'no-store', 'public content avoids stale cache after revocation');

  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content/publish', 'POST', { action: 'revoke', expectedVersion: 2, reason: 'Owner revoked publication.' }), env);
  assert.equal(response.status, 200, 'authorized owner can revoke');
  response = await routeV180PublicStaffContent(req('/api/staff-content'), env);
  assert.equal(response.status, 503, 'revoked content fails closed');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM staffportal_staff_content_publication_audit').get().n, 3, 'create, publish, revoke are all audited');

  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content/publish', 'POST', { action: 'publish', expectedVersion: 2, reason: 'stale version must fail' }), env);
  assert.equal(response.status, 409, 'stale revisions cannot overwrite newer publication state');
  response = await routeV180PublicStaffContent(req('/api/staff-content', 'POST', {}), env);
  assert.equal(response.status, 405, 'public endpoint rejects non-GET methods');
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const current = database.prepare('SELECT * FROM staffportal_staff_content_publication').get();
  const expiredDraft = draft({ expectedVersion: current.publication_version, intervalStartedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() - 60_000).toISOString() });
  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content', 'PUT', expiredDraft), env);
  assert.equal(response.status, 200, 'an expired schedule may be stored as a draft');
  response = await routeV180PublicStaffContent(req('/api/owner/studio/staff-content/publish', 'POST', { action: 'publish', expectedVersion: 4, reason: 'Expired schedule cannot be published.' }), env);
  assert.equal(response.status, 409, 'expired schedules cannot be approved');
  response = await routeV180PublicStaffContent(req('/api/staff-content'), env);
  assert.equal(response.status, 503, 'expired or draft content remains private');

  const router = fs.readFileSync(path.join(root, 'worker/entry.ts'), 'utf8');
  const staging = fs.readFileSync(path.join(root, 'worker/staffportal-staging.ts'), 'utf8');
  assert.doesNotMatch(source, /chatgpt\.site|UPSTREAM|fetch\s*\(/i, 'content module contains no external Sites/Base44 fetch');
  assert.doesNotMatch(router, /routeV180PublicStaffContent|chatgpt\.site/i, 'canonical runtime no longer invokes a Sites content proxy');
  assert.match(staging, /routeV180PublicStaffContent\(request,env\)/, 'Cloudflare staging mounts D1 public and Owner Studio content route');
  assert.ok(contextReads >= 5, 'Owner actions resolve server session context for authorization and revalidation');
  console.log('v180 Cloudflare staff content: D1 fail-closed reads, six-field projection, sensitive grant, strict input/origin, audited revision/publish/revoke: PASS');
} finally { database.close(); }
