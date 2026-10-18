import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const contract=fs.readFileSync('app/experience/import-contract.ts','utf8');
const importDesk=fs.readFileSync('app/experience/import-desk.tsx','utf8');
const formBuilder=fs.readFileSync('app/experience/form-builder.tsx','utf8');
const workflow=fs.readFileSync('app/experience/workflow-canvas.tsx','utf8');
const auth=fs.readFileSync('app/experience/auth.tsx','utf8');
const helperSource=contract.slice(contract.indexOf('export function defaultImportMapping'),contract.indexOf('export function importRows'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'daenem-entry-defaults-'));
fs.writeFileSync(path.join(temp,'entry-defaults.mjs'),ts.transpileModule(helperSource,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {defaultImportMapping}=await import(pathToFileURL(path.join(temp,'entry-defaults.mjs')).href);

const mapping=defaultImportMapping(['title','AMOUNT','Supplier','Private Note'],['Title','Amount','Supplier']);
const duplicate=defaultImportMapping(['Title',' title '],['Title']);
const checks=[];
function check(name,condition){checks.push({name,pass:Boolean(condition)});assert.ok(condition,name)}

check('Import mappings match authorized fields without casing friction',mapping.title==='Title'&&mapping.AMOUNT==='Amount'&&mapping.Supplier==='Supplier');
check('Import mappings leave unauthorized columns unselected',mapping['Private Note']==='');
check('Import mappings never select the same target twice',duplicate.Title==='Title'&&duplicate[' title ']==='');
check('Import target fails closed to the first authorized option',importDesk.includes('const effectiveTarget = targets.some')&&importDesk.includes('value={effectiveTarget}'));
check('Import company aligns to a module-owned company',importDesk.includes('m?.company && m.company !== "group" ? m.company : company')&&importDesk.includes('candidate.id === preferredCompany'));
check('Import execution uses only effective target and company values',importDesk.includes('effectiveTarget,\n        effectiveCompany,'));
check('File headers receive authorized default mappings',importDesk.includes('setMapping(defaultImportMapping(rows[0], importFields))'));
check('Changing target repopulates compatible column choices',importDesk.includes('defaultImportMapping(data[0], nextFields)'));
check('Changing worksheet repopulates compatible column choices',importDesk.includes('defaultImportMapping(rows[0] || [], importFields)'));
check('Form Builder fails closed from stale target drafts',formBuilder.includes('const effectiveTarget = targets.some')&&formBuilder.includes('target: effectiveTarget')&&formBuilder.includes('value={effectiveTarget}'));
check('Workflow Builder fails closed from stale target drafts',workflow.includes('const effectiveTarget = sources.some')&&workflow.match(/target: effectiveTarget/g)?.length===2&&workflow.includes('value={effectiveTarget}'));
check('Workflow transitions still preselect valid source stages',workflow.includes('from: source?.stages[0] || ""')&&workflow.includes('to: source?.stages[1] || ""'));
check('Audit reasons remain intentional rather than inferred',formBuilder.includes('[reason, setReason] = useState("")')&&workflow.includes('[reason, setReason] = useState("")'));
check('Passwords and verification codes remain unprefilled',auth.includes("[password,setPassword]=useState('')")&&auth.includes("[otp,setOtp]=useState('')"));

console.log(JSON.stringify({total:checks.length,passed:checks.filter(item=>item.pass).length,checks},null,2));
