import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0092_central_audit_immutability.sql', import.meta.url), 'utf8');
const tables = ['audit_logs', 'access_control_changes'];

for (const table of tables) {
  for (const operation of ['UPDATE', 'DELETE']) {
    const trigger = new RegExp(
      `CREATE TRIGGER IF NOT EXISTS ${table}_no_${operation.toLowerCase()}\\s+BEFORE ${operation} ON ${table}\\s+BEGIN\\s+SELECT RAISE\\(ABORT, '[^']+immutable'\\);\\s+END;`,
      'i',
    );
    assert.match(migration, trigger, `${table} ${operation} must abort in the database`);
  }
}

assert.equal((migration.match(/CREATE TRIGGER IF NOT EXISTS/g) || []).length, 4, 'only the four central formal audit protections are installed');
console.log('Central formal audit immutability migration: 4/4 trigger assertions PASS');
