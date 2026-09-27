import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../migrations/0079_financial_provider_cost_events.sql', import.meta.url), 'utf8');
const moduleMigration = await readFile(new URL('../migrations/0081_financial_provider_cost_event_module.sql', import.meta.url), 'utf8');

assert.match(source, /CREATE TABLE IF NOT EXISTS financial_provider_cost_events/);
assert.match(source, /company_id IN \('company-printing','company-bakery','company-autos','company-properties','company-logistics'\)/);
assert.doesNotMatch(source, /company-farms/);
for (const field of [
  'actor_employee_id', 'actor_role_code', 'action', 'amount_minor', 'currency', 'provider',
  'estimated_cost_minor', 'actual_cost_minor', 'cost_currency', 'pricing_id', 'pricing_verified_at',
  'approval_id', 'maker_employee_id', 'checker_employee_id', 'provider_reference', 'provider_result',
  'retry_of_event_id', 'reversal_of_event_id', 'occurred_at', 'evidence_reference',
]) assert.match(source, new RegExp(`\\b${field}\\b`));
assert.match(source, /FOREIGN KEY|REFERENCES financial_provider_pricing\(id\)/);
assert.match(source, /CREATE TRIGGER IF NOT EXISTS financial_provider_cost_events_no_update[\s\S]*?RAISE\(ABORT/);
assert.match(source, /CREATE TRIGGER IF NOT EXISTS financial_provider_cost_events_no_delete[\s\S]*?RAISE\(ABORT/);
assert.match(source, /CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_company_time/);
assert.match(source, /CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_provider_time/);
assert.doesNotMatch(source, /access_token|refresh_token|client_secret|api_key/i);
assert.match(moduleMigration, /ADD COLUMN requesting_module TEXT/);
assert.match(moduleMigration, /requesting_module IS NULL OR length\(requesting_module\) BETWEEN 1 AND 80/);
assert.match(moduleMigration, /idx_financial_provider_cost_module_time/);
assert.doesNotMatch(moduleMigration, /UPDATE financial_provider_cost_events|SET requesting_module/);
assert.match(moduleMigration, /Existing rows remain NULL because their requesting module is not recoverable/);

console.log('Financial provider-cost event model and module scope: PASS');
