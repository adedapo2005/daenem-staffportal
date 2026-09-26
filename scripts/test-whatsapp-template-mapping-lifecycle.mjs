import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function setTemplateMappingEnabled');
const end = source.indexOf('\nexport async function routeCommunicationGovernance', start);
assert.notEqual(start, -1, 'mapping lifecycle handler exists');
const handler = source.slice(start, end);
assert.match(handler, /typeof body\.enabled!=='boolean'/);
assert.match(handler, /companyAllowed\(context,companyId\)/);
assert.match(handler, /canManageEvent\(context,companyId,mapping\.useCaseId,'manage'\)/);
assert.match(handler, /mapping\.status!=='approved'.*mapping\.channel!=='whatsapp'.*mapping\.internalStatus!=='approved'.*mapping\.providerStatus!=='approved'/s);
assert.match(handler, /COUNT\(\*\).*communication_template_variable_mappings/s);
assert.match(handler, /WHERE id=\? AND company_id=\? AND enabled=\? AND status=\?/);
assert.match(handler, /'enable_template_mapping':'disable_template_mapping'/);
assert.match(handler, /changes\(\)=1/);
assert.match(handler, /liveSend:false/);
assert.match(source, /template-mappings\/enabled.*setTemplateMappingEnabled/);
console.log('WhatsApp template mapping lifecycle boundary: PASS');
