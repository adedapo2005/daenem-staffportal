import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0076_whatsapp_template_mappings.sql', import.meta.url), 'utf8');
for (const table of ['communication_template_mappings', 'communication_template_variable_mappings']) {
  assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
}
for (const field of [
  'use_case_id', 'provider_template_name', 'language', 'category', 'owning_module',
  'provider_template_id', 'enabled', 'status', 'component', 'position', 'variable_name',
  'source_field', 'source_module', 'data_type', 'required', 'formatter', 'max_length',
  'fallback_policy', 'fallback_value', 'sensitivity', 'example_value',
]) assert.match(migration, new RegExp(`\\b${field}\\b`));
assert.match(migration, /sensitivity != 'prohibited'/);
assert.match(migration, /fallback_policy = 'approved_value' AND fallback_value IS NOT NULL/);
assert.match(migration, /fallback_policy = 'none' AND fallback_value IS NULL/);
assert.match(migration, /enabled INTEGER NOT NULL DEFAULT 0/);
assert.match(migration, /status TEXT NOT NULL DEFAULT 'draft'/);
console.log('WhatsApp template mapping schema: PASS');
