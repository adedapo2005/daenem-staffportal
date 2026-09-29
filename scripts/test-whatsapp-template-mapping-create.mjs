import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const endpoint = source.slice(source.indexOf('async function createTemplateMapping'), source.indexOf('export async function routeCommunicationGovernance'));
assert.match(endpoint, /companyAllowed\(context,companyId\)/);
assert.match(endpoint, /canManageEvent\(context,companyId,template\.eventId,'manage'\)/);
assert.match(endpoint, /template\.channel!=='whatsapp'\|\|template\.internalStatus!=='approved'\|\|template\.providerStatus!=='approved'/);
assert.match(endpoint, /provider_template_id AS providerTemplateId/);
assert.match(endpoint, /template\.providerTemplateId&&providerTemplateId!==template\.providerTemplateId/);
assert.match(endpoint, /Provider template identity must match the approved WhatsApp template/);
assert.match(endpoint, /enabled,\s*status,revision,created_by,updated_by/);
assert.match(endpoint, /0,'draft'/);
assert.match(endpoint, /create_template_mapping/);
assert.match(endpoint, /enabled:false,status:'draft'/);
assert.match(source, /template-mappings'&&method==='POST'\)return createTemplateMapping/);
console.log('WhatsApp template mapping creation boundary: PASS');
