import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function previewTemplateMapping');
const end = source.indexOf('\nasync function ', start + 1);
const endpoint = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'template mapping preview endpoint exists');
assert.match(endpoint, /companyAllowed\(context,companyId\)/);
assert.match(endpoint, /WHERE id=\? AND company_id=\?/);
assert.match(endpoint, /canManageEvent\(context,companyId,mapping\.useCaseId,'manage'\)/);
assert.match(endpoint, /example_value AS exampleValue/);
assert.match(endpoint, /fallbackPolicy==='approved_value'/);
assert.match(endpoint, /REQUIRED_EXAMPLE_MISSING/);
assert.match(endpoint, /EXAMPLE_VALUE_TOO_LONG/);
assert.match(endpoint, /\['header','body','footer','button'\]/);
assert.match(endpoint, /providerCallMade:false/);
assert.match(endpoint, /providerPayloadGenerated:false/);
assert.doesNotMatch(endpoint, /fetch\(|UPDATE |INSERT INTO|provider_item_id|token|password|secret/i);
assert.match(source, /template-mappings\/preview'&&method==='GET'\)return previewTemplateMapping/);

console.log('WhatsApp template mapping preview boundary: 12/12 PASS');
