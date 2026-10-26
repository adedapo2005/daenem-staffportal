import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/module-hub.tsx',import.meta.url),'utf8');
const block=source.slice(source.indexOf('export function isModuleVisible'),source.indexOf('function nextFrame'));

test('Owner and Admin role alone never returns all modules',()=>{
 assert.doesNotMatch(block,/if\s*\(owner\(context\)\)\s*return true/);
 assert.match(block,/module.strictOwnerOnly/);
 assert.match(block,/module.ownerOnly/);
});
test('unknown company must not be treated as an authorised scope',()=>{
 assert.match(block,/context\.companies\.some\(\(company\) => company\.id === companyId\)/);
 assert.match(block,/:\s*\[\]/);
});
test('unselected workspaces evaluate actual assigned company permissions',()=>{
 assert.match(block,/context\.companies\.filter\(\(company\)/);
 assert.match(block,/context\.companyPermissions\?\.\[scopeId\]/);
 assert.match(block,/hasWorkforcePermission\(context, permission, module.minimum \|\| 'view', scopeId\)/);
});
test('owner only and unprivileged presentation modules are explicitly handled',()=>{
 assert.match(block,/\['employee','profile','themes','navigation'\]/);
 assert.doesNotMatch(block,/if \(!module.permissions\?\.length && !module.prefixes\?\.length\) return true/);
});
