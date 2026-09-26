import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const endpoint = source.slice(source.indexOf('async function listTemplateMappings'), source.indexOf('async function createTemplateMapping'));
assert.match(endpoint, /companyId.*useCaseId.*companyAllowed\(context,companyId\)/s);
assert.match(endpoint, /canManageEvent\(context,companyId,useCaseId,'view'\)/);
assert.match(endpoint, /WHERE company_id=\? AND use_case_id=\?/);
assert.match(endpoint, /WHERE mapping_id IN \(\$\{placeholders\}\)/);
assert.match(endpoint, /variables:variablesByMapping\.get\(row\.id\)\|\|\[\]/);
assert.doesNotMatch(endpoint, /fallback_value AS|example_value AS|UPDATE |INSERT INTO/);
assert.match(source, /\/api\/communications\/admin\/template-mappings.*method==='GET'/);
console.log('WhatsApp template mapping read boundary: PASS');
