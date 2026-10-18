import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const source=fs.readFileSync('app/experience/form-prefill.ts','utf8');
const editor=fs.readFileSync('app/experience/smart-forms.tsx','utf8');
const ui=fs.readFileSync('app/experience/ui.tsx','utf8');
const formBuilder=fs.readFileSync('app/experience/form-builder.tsx','utf8');
const configuredForms=fs.readFileSync('app/experience/config-consumers.tsx','utf8');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'daenem-prefill-'));
fs.writeFileSync(path.join(temp,'form-prefill.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const {buildAuthorizedFieldOptions,buildConfiguredFormValues,buildRecordPrefill,configuredPrefillOrigin,prefillOrigin}=await import(pathToFileURL(path.join(temp,'form-prefill.mjs')).href);

const row={id:'EXP-1',module:'expenses',title:'New Request',subtitle:'',company:'printing',status:'Draft',owner:'Daniel Obi',amount:0,due:'',fields:{Category:'',Supplier:'',Purpose:''},evidence:[],history:[]};
const authorizedRows=[
 {...row,id:'EXP-2',fields:{Category:'Materials',Supplier:'Meridian Supplies',Purpose:'Authorized purpose'}},
 {...row,id:'EXP-3',fields:{Category:'Travel',Supplier:'Authorized Transport',Purpose:'Another authorized purpose'}},
];
const known={Requester:'Daniel Obi',Company:'Daenem Printing & Technology','Cost Centre':'Printing Operations'};
const fields=['Requester','Company','Cost Centre','Category','Supplier','Purpose','Request Date'];
const options=buildAuthorizedFieldOptions(fields,row,authorizedRows,known);
const prefill=buildRecordPrefill(fields,row,known,'2026-10-01');
const configuredFields=[
 {id:'requester',prefill:'Current user',defaultValue:'Fallback user'},
 {id:'date',prefill:'Current date',defaultValue:''},
 {id:'purpose',prefill:'None',defaultValue:'General request'},
];
const mappedContext={'Current user':'Daniel Obi','Current date':'2026-10-01'};
const configuredValues=buildConfiguredFormValues(configuredFields,mappedContext);

const checks=[];
function check(name,condition){checks.push({name,pass:Boolean(condition)});assert.ok(condition,name)}

check('Authorized context prefills identity and organization fields',prefill.Requester==='Daniel Obi'&&prefill.Company==='Daenem Printing & Technology'&&prefill['Cost Centre']==='Printing Operations');
check('Current date prefills date fields',prefill['Request Date']==='2026-10-01');
check('Transactional choices are populated from authorized rows',assert.deepEqual(options.Category,['Materials','Travel'])===undefined&&assert.deepEqual(options.Supplier,['Meridian Supplies','Authorized Transport'])===undefined);
check('Free-text fields remain free text',options.Purpose===undefined);
check('Known contextual choices remain selectable',assert.deepEqual(options.Company,['Daenem Printing & Technology'])===undefined);
check('Prefill origin distinguishes context and date',prefillOrigin('Requester',prefill.Requester,row,known)==='Authorized Context'&&prefillOrigin('Request Date',prefill['Request Date'],row,known)==='Current Date');
check('Stored record values are never labelled as inferred prefill',prefillOrigin('Category','Materials',{...row,fields:{Category:'Materials'}},known)==='');
check('Editor permission-projects records before deriving context or options',editor.includes("recordsFor(records,peopleModule,session)")&&editor.includes('const authorizedModuleRows=recordsFor(records,module,session)'));
check('Editor renders evidence-backed choices as selectors',editor.includes("kind={options.length?'select':undefined}")&&editor.includes('options={options}'));
check('Selectors never render Radix empty-value items',ui.includes("emptyOption='__daenem_empty_option__'")&&ui.includes("value={raw||emptyOption}")&&!editor.includes("options={['',...options]}"));
check('Governed blank choices remain reversible',/value:\s*["']["'],\s*label:\s*["']Always/.test(formBuilder)&&ui.includes("onValueChange={next=>onChange(next===emptyOption?'':next)}")&&ui.includes("value={value===''&&hasEmpty?emptyOption:value}"));
check('Required selectors expose semantics and participate in validation',ui.includes('aria-required={required||undefined}')&&editor.includes('fieldError(name,value,required)')&&editor.includes("fieldError(f,fields[f]||'',module.required===f)"));
check('Editor exposes a reviewable prefill summary',editor.includes('data-prefill-count={prefilledNames.length}')&&editor.includes('Authorized Details Prefilled')&&editor.includes('Review before saving.'));
check('Duplicate detection is limited to authorized module rows',editor.includes('const duplicate=authorizedModuleRows.some'));
check('Raw records are not searched for a person profile',!editor.includes("records.find(r=>r.module==='people'"));
check('Configured forms prefer authorized mappings over static defaults',configuredValues.requester==='Daniel Obi'&&configuredValues.date==='2026-10-01');
check('Configured forms retain explicit defaults when no mapping exists',configuredValues.purpose==='General request');
check('Configured prefill origin is truthful after edits',configuredPrefillOrigin(configuredFields[0],configuredValues.requester,mappedContext)==='Current user'&&configuredPrefillOrigin(configuredFields[0],'Edited user',mappedContext)==='');
check('Form Builder previews mapped authorized values',/const previewDefaults\s*=\s*buildConfiguredFormValues/.test(formBuilder)&&formBuilder.includes("value={previewValue}")&&/["']Current date["']/.test(formBuilder));
check('Form Builder permission-projects profile context',/recordsFor\(records,\s*peopleModule,\s*session\)/.test(formBuilder)&&!/records\.find\([^)]*module\s*===\s*["']people["']/.test(formBuilder));
check('Published configured forms permission-project profile context',configuredForms.includes('recordsFor(records,peopleModule,session)')&&!configuredForms.includes("records.find(r=>r.module==='people'"));
check('Successful responses restore authorized defaults for the next response',configuredForms.includes('setValues(initialValues);close()')&&!configuredForms.includes('setValues({});close()'));
check('Legacy empty response drafts receive missing authorized defaults',configuredForms.includes('const resolvedValues={...initialValues,...values}')&&configuredForms.includes('value={fieldValue}'));

console.log(JSON.stringify({total:checks.length,passed:checks.filter(item=>item.pass).length,checks},null,2));
