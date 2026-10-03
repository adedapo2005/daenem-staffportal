import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const executable = source.replace("import { hasPermission, type AuthEnv, type SessionContext } from './auth';", "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};").replace("import { previewAuditRetention } from './audit-retention';", "const previewAuditRetention=async()=>new Response('{}');");
const compiled = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const context = { roles: [{ code: 'employee' }], companies: [{ id: 'company-a' }, { id: 'company-b' }], companyPermissions: { 'company-a': { 'hr.access': 'view', 'finance.access': 'none' }, 'company-b': { 'finance.access': 'none' } }, permissions: {}, employee: { id: 'actor' } };
const env = { DB: { prepare() { return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };
const response = await routeGroupErp(new Request('https://staff.test/api/search/suggest?q=finance'), env, context);
const body = await response.json();
if (body.suggestions.some((item) => item.type === 'module' && item.command === 'finance')) throw new Error('FAIL unauthorized finance module was disclosed');
console.log('PASS unauthorized module suggestions are filtered by company permission');

context.companyPermissions['company-a']['finance.access'] = 'view';
const allowed = await routeGroupErp(new Request('https://staff.test/api/search/suggest?q=finance'), env, context);
const allowedBody = await allowed.json();
if (!allowedBody.suggestions.some((item) => item.type === 'module' && item.command === 'finance')) throw new Error('FAIL authorized finance module was hidden');
console.log('PASS authorized company module suggestion remains available');
