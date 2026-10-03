import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const selectorStart = source.indexOf('type AlertRecipientSelector');
const selectorEnd = source.indexOf('\nconst json', selectorStart);
const resolverStart = source.indexOf('async function resolveRecipients');
const resolverEnd = source.indexOf('\nasync function createRecipientDeliveries', resolverStart);
assert.ok(selectorStart >= 0 && selectorEnd > selectorStart && resolverStart > selectorEnd && resolverEnd > resolverStart);
const moduleSource = `type PlatformEventInput = { recipientTarget?: { employeeId: string; permission: string } };\n` +
  source.slice(selectorStart, selectorEnd) + '\n' +
  source.slice(resolverStart, resolverEnd).replace('async function resolveRecipients(', 'export async function resolveRecipients(');
const javascript = ts.transpileModule(moduleSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { resolveRecipients } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

function env({ targetAuthorized = true, authorizedCompany = 'company-a', audience = ['employee-assignee', 'employee-other'] } = {}) {
  return { DB: { prepare(sql) {
    return { sql, values: [], bind(...values) { this.values = values; return this; },
      async first() {
        if (sql.includes('AND p.code=? AND rp.access_level IN')) {
          return targetAuthorized && this.values[0] === authorizedCompany ? { id: this.values[1] } : null;
        }
        if (sql.includes('WHERE e.id=?')) return audience.includes(this.values[0]) ? { id: this.values[0] } : null;
        return null;
      },
      async all() { return { results: audience.map((id) => ({ id })) }; },
    };
  } } };
}

const target = { employeeId: 'employee-assignee', permission: 'communications.support.inbox.view' };
const positive = await resolveRecipients(env(), null, 'company-a', 'communications', target);
assert.deepEqual(positive.employeeIds, ['employee-assignee'], 'only the assigned, authorized employee receives this assignment alert');

const noInboxAccess = await resolveRecipients(env({ targetAuthorized: false }), null, 'company-a', 'communications', target);
assert.deepEqual(noInboxAccess.employeeIds, [], 'no inbox permission means no alert recipient or delivery');

const otherCompanyOnly = await resolveRecipients(env({ authorizedCompany: 'company-b' }), null, 'company-a', 'communications', target);
assert.deepEqual(otherCompanyOnly.employeeIds, [], 'membership and inbox permission in another company do not authorize delivery');

const differentRuleAudience = await resolveRecipients(env(), { recipientsJson: '[{"type":"user","id":"employee-other"}]', channelsJson: '["in_app"]' },
  'company-a', 'communications', target);
assert.deepEqual(differentRuleAudience.employeeIds, [], 'configured audience is intersected with the assigned employee');

console.log('Alerting recipient target and permission runtime: PASS 4/4');
