import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/communications-whatsapp-outbound.ts', import.meta.url), 'utf8');
const start = source.indexOf('function normalizeRecipient');
const end = source.indexOf('\n}', start);
const normalize = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'WhatsApp recipient normalizer exists');
assert.match(normalize, /const trimmed=value\.trim\(\)/);
assert.match(normalize, /!\/\^\\\+\?\[0-9\(\)\.\\s-\]\+\$\/.test\(trimmed\)/);
assert.match(normalize, /const digits=trimmed\.replace\(\/\\D\/g,''\)/);
assert.match(normalize, /digits\.length>=8&&digits\.length<=15\?digits:''/);
assert.match(source, /if\(!normalizeRecipient\(row\.customerWaId\)\)throw new Error\('WHATSAPP_RECIPIENT_INVALID'\)/);

console.log('WhatsApp recipient validation boundary: PASS');
