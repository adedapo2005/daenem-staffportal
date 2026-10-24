import fs from 'node:fs';
import ts from '../node_modules/typescript/lib/typescript.js';
for(const [path,kind] of [['worker/bakery.ts',ts.ScriptKind.TS],['src/bakery-v2.tsx',ts.ScriptKind.TSX],['worker/bakery-accountability.ts',ts.ScriptKind.TS],['src/bakery-intelligence-metrics.ts',ts.ScriptKind.TS],['src/bakery-kpi-strip.tsx',ts.ScriptKind.TSX]]){
 const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,kind);
 if(file.parseDiagnostics.length){for(const d of file.parseDiagnostics)console.error(path,ts.flattenDiagnosticMessageText(d.messageText,' '));process.exitCode=1;}
 else console.log('PASS syntax',path);
}
