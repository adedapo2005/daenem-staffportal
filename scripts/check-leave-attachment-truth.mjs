import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/employee-center.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/employee-center.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../worker/employee-self-service.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0021_employee_self_service.sql', import.meta.url), 'utf8');
const requestLeave = backend.slice(backend.indexOf('async function requestLeave'), backend.indexOf('async function leaveQueue'));

const checks = [
  [backend.includes('requires_attachment AS requiresAttachment'), 'leave type bootstrap exposes requiresAttachment'],
  [migration.includes('requires_attachment INTEGER NOT NULL DEFAULT 0'), 'leave type schema governs required evidence'],
  [migration.includes('attachment_key TEXT'), 'leave request schema has evidence linkage field'],
  [!requestLeave.includes('requires_attachment') && !requestLeave.includes('attachment_key'), 'backend submission still lacks required-evidence enforcement/linkage'],
  [ui.includes('requiresAttachment:number'), 'frontend consumes authoritative requiresAttachment truth'],
  [ui.includes('const selectedType=types.find'), 'frontend derives selected leave type truth'],
  [ui.includes("t.requiresAttachment?' · Document required':''"), 'required-evidence leave types are labelled'],
  [ui.includes('Supporting document required'), 'required-evidence notice is shown'],
  [ui.includes("if(selectedType?.requiresAttachment){setMessage("), 'required-evidence submit path fails closed'],
  [ui.includes('disabled={busy||Boolean(selectedType?.requiresAttachment)}'), 'submit button is disabled for required-evidence leave'],
  [!ui.includes('type="file"'), 'frontend does not fabricate an unsupported leave upload control'],
  [css.includes('.ess-evidence-note') && css.includes('.ess-primary:disabled'), 'required-evidence state has explicit accessible styling'],
];

let passed = 0;
for (const [ok, message] of checks) {
  assert.ok(ok, message);
  passed += 1;
}
console.log(`PASS ${passed}/${checks.length} HR Leave attachment-truth assertions`);
