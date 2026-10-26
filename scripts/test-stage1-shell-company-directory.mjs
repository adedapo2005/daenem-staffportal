import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const runtime=readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const directory=readFileSync(new URL('../src/stage1-company-directory.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/stage1-company-directory.css',import.meta.url),'utf8');
const snapshot=readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');
test('host mounts a grant-derived directory without modifying snapshot',()=>{
 assert.match(runtime,/<Stage1CompanyDirectory context=\{context\}/);
 assert.match(directory,/authorisedLiveWorkspaces\(context\)/);
 assert.match(directory,/data-company-page=\{page.href\}/);
 assert.match(snapshot,/className="p-company"/);
});
test('legacy switches are hidden but truthful demo warning remains visible',()=>{
 assert.match(css,/\.p-company,/);
 assert.match(css,/\.p-demo-strip > button,/);
 assert.doesNotMatch(css,/\.p-demo-strip,/);
 assert.match(css,/Demo company/);
 assert.match(css,/Switch Company/);
 assert.match(css,/display:none!important/);
});
test('permissions denied groups cannot be invented by role titles',()=>{
 assert.doesNotMatch(directory,/roles\.some|owner\(context\)|group_admin/);
 assert.match(directory,/No company modules are assigned/);
 assert.match(directory,/aria-label="Authorised company modules and pages"/);
});
test('navigation maintains focus and constrained mobile layout',()=>{
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(directory,/type="button"/);
});
