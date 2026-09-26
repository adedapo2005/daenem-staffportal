import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function saveTemplateVariableMapping');
const end = source.indexOf('export async function routeCommunicationGovernance', start);
const endpoint = source.slice(start, end);
assert.ok(start >= 0 && end > start);
assert.match(endpoint, /companyAllowed\(context,mapping\.companyId\)/);
assert.match(endpoint, /canManageEvent\(context,mapping\.companyId,mapping\.useCaseId,'manage'\)/);
assert.match(endpoint, /mapping\.enabled!==0\|\|mapping\.status!=='draft'/);
assert.match(endpoint, /\['header','body','footer','button'\]/);
assert.match(endpoint, /maxLength<1\|\|maxLength>4096/);
assert.match(endpoint, /\['public','internal','personal','sensitive'\]/);
assert.match(endpoint, /fallbackPolicy==='approved_value'.*!fallbackValue/s);
assert.match(endpoint, /'map_template_variable'/);
assert.match(source, /template-variable-mappings'&&method==='POST'\)return saveTemplateVariableMapping/);
console.log('WhatsApp template variable mapping write boundary: 10/10 PASS');
