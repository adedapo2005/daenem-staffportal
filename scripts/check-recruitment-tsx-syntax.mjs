import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const compilerPath=process.argv[2];
assert.ok(compilerPath,'Pass the path to the existing StaffPortal TypeScript compiler.');
const ts=createRequire(import.meta.url)(compilerPath);
const files=['jobs-entry.tsx','jobs-recruitment-workspace.tsx',
  'jobs-recruitment-actions.tsx','jobs-recruitment-scheduler.tsx'];
let passed=0;
for(const file of files){
  const input=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  const result=ts.transpileModule(input,{
    fileName:file,reportDiagnostics:true,
    compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,
      module:ts.ModuleKind.ESNext,isolatedModules:true}
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,file+': '+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
  assert.ok(result.outputText,file+': no output');
  console.log('PASS syntax transpile:',file);passed++;
}
console.log('RECRUITMENT TSX SYNTAX:',passed+'/'+files.length,'PASS; not a typecheck or browser result');
