import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const runtime=readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const workbench=readFileSync(new URL('../src/stage1-responsive-review.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/stage1-responsive-review.css',import.meta.url),'utf8');
const snapshot=readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');

test('existing Owner responsive-review link resolves to an authenticated application route',()=>{
  assert.match(snapshot,/href="\/review\/viewports"/);
  assert.match(runtime,/const routePathname = usePathname\(\)/);
  assert.match(runtime,/if \(routePathname === '\/review\/viewports'/);
  assert.match(runtime,/return <Stage1ResponsiveReview context=\{context\} \/>/);
});

test('responsive preview has all requested viewport presets without claiming physical-device acceptance',()=>{
  for(const dimensions of ['3840,height:2160','1920,height:1080','1024,height:768','390,height:844'])
    assert.ok(workbench.includes(dimensions),dimensions);
  assert.match(workbench,/does not replace testing on real devices/);
  assert.match(workbench,/unmerged PR changes are not included/);
});

test('review route is read-only and requires explicit permissions, never role title',()=>{
  assert.match(workbench,/hasWorkforcePermission\(context,'navigation\.studio','view'\)/);
  assert.match(workbench,/hasWorkforcePermission\(context,'settings\.access','view'\)/);
  assert.doesNotMatch(workbench,/roles\.some|isOwner|role\.code === 'owner'/);
  assert.doesNotMatch(workbench,/<iframe/);
  assert.match(workbench,/window\.open\(route,'_blank'/);
  assert.match(workbench,/noopener,noreferrer,popup=yes/);
  assert.match(workbench,/frame-ancestors 'none'/);
  assert.match(workbench,/X-Frame-Options: DENY/);
  assert.doesNotMatch(workbench,/method:'POST'|api\(.*method|onSubmit|onClick=\{.*save/);
});

test('review workbench is opaque, responsive, readable and keyboard reachable',()=>{
  assert.match(css,/background:#fff/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(workbench,/aria-pressed=\{presetIndex===i\}/);
});


test('security headers are never weakened to implement responsive review',()=>{
 const worker=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
 const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
 assert.match(config,/single-page-application/);
 assert.doesNotMatch(workbench,/allow-same-origin|allow-scripts|iframe/);
 assert.doesNotMatch(workbench,/document\.write|innerHTML|Content-Security-Policy.*frame-ancestors\s+\*/);
 assert.ok(worker.includes('securityHeaders'), 'Existing Worker security-header handler remains');
});
