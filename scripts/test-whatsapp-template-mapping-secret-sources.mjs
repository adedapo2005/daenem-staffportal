import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/communications-governance.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function saveTemplateVariableMapping');
const end = source.indexOf('\nasync function approveTemplateMapping', start);
const handler = source.slice(start, end);
assert.ok(start >= 0 && end > start, 'template variable mapping handler exists');
assert.match(handler, /sourceField\.toLowerCase\(\)\.split\(\/\[\^a-z0-9\]\+\/\)/);
assert.match(handler, /'password'.*'passwd'.*'passcode'.*'otp'.*'mfa'.*'secret'.*'token'.*'credential'.*'recovery'/s);
assert.match(handler, /!sourceField\|\|sourceField\.length>160\|\|prohibitedSourceField/);
assert.match(handler, /!\['public','internal','personal','sensitive'\]\.includes\(sensitivity\)/);
console.log('WhatsApp template mapping secret-source rejection: PASS');
