import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {authorisedLiveWorkspaces} from '../src/authorised-live-workspaces.ts';

const source=readFileSync(new URL('../src/stage1-granted-company-navigation.ts',import.meta.url),'utf8');
const modules=[
 {id:'employee',label:'My Workspace'},
 {id:'profile',label:'My Profile'},
 {id:'printing',label:'Printing ERP',erpId:'printing',permissions:['printing.access'],companyCodes:['PRINT']},
 {id:'bakery',label:'Bakery ERP',erpId:'bakery',permissions:['bakery.access'],companyCodes:['BAKERY']},
 {id:'payroll',label:'Payroll',erpId:'staff',permissions:['payroll.access']},
 {id:'owner-intelligence',label:'Owner Intelligence',erpId:'controls',permissions:['owner.intelligence'],ownerOnly:true},
];
const visible=(context,mod,companyId,companyCode)=>{
 if(['employee','profile'].includes(mod.id))return true;
 if(mod.companyCodes?.length && !mod.companyCodes.includes(companyCode))return false;
 if(mod.ownerOnly&&!context.roles.some(role=>role.code==='owner'))return false;
 const granted=companyId?context.companyPermissions?.[companyId]||{}:context.permissions||{};
 return mod.permissions?.some(permission=>granted[permission]&&granted[permission]!=='none')||false;
};
const transpiled=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const loaded={exports:{}};
new Function('require','module','exports',transpiled)((name)=>{
 if(name==='./module-hub')return {moduleDefinitions:modules,isModuleVisible:visible};
 if(name==='./authorised-live-workspaces')return {authorisedLiveWorkspaces};
 throw Error('Unexpected import: '+name);
},loaded,loaded.exports);
const {buildGrantedCompanyNavigation}=loaded.exports;
const companies=[
 {id:'printing-01',code:'PRINT',name:'DAENEM Printing',primary:true},
 {id:'bakery-02',code:'BAKERY',name:'DAENEM Bakery'},
 {id:'__group__',code:'GROUP',name:'Registered Group Company'},
];
const auth=(overrides={})=>({
 sessionId:'session-qa',
 employee:{id:'employee-qa',displayName:'QA Employee'},
 roles:[],
 companies,
 permissions:{},
 companyPermissions:{
  'printing-01':{'printing.access':'view','forms.access':'view','payroll.access':'view'},
  'bakery-02':{'bakery.access':'view','forms.access':'view'},
 },
 ...overrides,
});
test('all granted companies and supported pages appear without selecting a company',()=>{
 const groups=buildGrantedCompanyNavigation(auth());
 assert.deepEqual(groups.map(x=>x.companyId),['printing-01','bakery-02']);
 assert.deepEqual(groups.map(x=>x.pages.map(p=>p.href)),[
  ['/forms/company/printing-01'],['/forms/company/bakery-02'],
 ]);
 assert.ok(groups[0].pending.some(p=>p.id==='printing'));
 assert.ok(groups[0].pending.some(p=>p.id==='payroll'));
 assert.ok(groups[1].pending.some(p=>p.id==='bakery'));
 assert.ok(groups.every(g=>g.pending.every(p=>p.href===null)));
});
test('Owner and Admin titles do not grant any company module without explicit assignments',()=>{
 for(const roles of [[{code:'owner'}],[{code:'group_admin'}],[]]){
  const groups=buildGrantedCompanyNavigation(auth({roles,permissions:{},companyPermissions:{}}));
  assert.deepEqual(groups,[]);
 }
});
test('company permissions are not inherited between Printing and Bakery',()=>{
 const groups=buildGrantedCompanyNavigation(auth());
 assert.equal(groups[0].pending.some(p=>p.id==='bakery'),false);
 assert.equal(groups[1].pending.some(p=>p.id==='printing'),false);
 assert.equal(groups[1].pending.some(p=>p.id==='payroll'),false);
});
test('revoking grants removes the company and its pages on the next projection',()=>{
 const before=buildGrantedCompanyNavigation(auth());
 assert.equal(before.length,2);
 const after=buildGrantedCompanyNavigation(auth({companyPermissions:{
  'printing-01':{'forms.access':'none'},
  'bakery-02':{'bakery.access':'view'},
 }}));
 assert.equal(after.length,1);
 assert.equal(after[0].companyId,'bakery-02');
 assert.deepEqual(after[0].pages,[]);
});
test('Group authority does not inherit per-company permissions',()=>{
 const groups=buildGrantedCompanyNavigation(auth());
 assert.equal(groups.some(x=>x.companyId===null),false);
 const withGroup=buildGrantedCompanyNavigation(auth({permissions:{'forms.access':'view','owner.intelligence':'view'},roles:[{code:'owner'}]}));
 const group=withGroup.find(x=>x.companyId===null);
 assert.ok(group);
 assert.equal(group.id,'__group__');
 assert.deepEqual(group.pages.map(x=>x.href),['/forms/group']);
 assert.ok(group.pending.some(x=>x.id==='owner-intelligence'));
});
test('a legitimate company ID cannot collide with Group navigation identity',()=>{
 const groups=buildGrantedCompanyNavigation(auth({companyPermissions:{
  'printing-01':{'printing.access':'view'},
  '__group__':{'forms.access':'view'},
 },permissions:{'forms.access':'view'}}));
 const company=groups.find(x=>x.companyId==='__group__');
 const group=groups.find(x=>x.companyId===null);
 assert.ok(company&&group);
 assert.notEqual(company.id,group.id);
 assert.equal(company.pages[0].href,'/forms/company/__group__');
 assert.equal(group.pages[0].href,'/forms/group');
});
test('duplicate company records cannot duplicate modules or read other grants',()=>{
 const c=auth({companies:[companies[0],companies[0],companies[1]]});
 assert.equal(buildGrantedCompanyNavigation(c).length,2);
});
test('authenticated UI adapter bypasses old simulated session, without weakening backend permissions',()=>{
 const ecc=readFileSync(new URL('../src/enterprise-command-center-navigation.tsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
 const nav=readFileSync(new URL('../src/stage1-granted-command-navigation.tsx',import.meta.url),'utf8');
 assert.match(ecc,/runtime\.authenticatedContext/);
 assert.match(ecc,/<Stage1GrantedCommandNavigation/);
 assert.match(runtime,/authenticatedContext: context/);
 assert.match(runtime,/isLegacyCompanyOrRolePreview\(event\)/);
 assert.match(runtime,/event\.stopPropagation\(\)/);
 assert.match(nav,/router\.push\(href\)/);
 assert.match(nav,/data-navigation-source="authenticated-company-grants"/);
 assert.doesNotMatch(nav,/sessionForProfile|changeSession|setCompany|selectedCompany|onClick=\{.*goRoute/);
});
test('legacy interactive company and demo profile selectors are suppressed outside protected snapshot',()=>{
 const css=readFileSync(new URL('../src/stage1-granted-command-navigation.css',import.meta.url),'utf8');
 const protectedSnapshot=readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');
 assert.match(css,/\[data-approved-postlogin="qa-review-v115"\] \.p-company/);
 assert.match(css,/\.p-responsive-navigation-sheet \.p-company/);
 assert.match(css,/\.p-modal \.p-field:has\(\[aria-label="Switch Company"\]\)/);
 assert.match(css,/\.p-modal \.p-field:has\(\[aria-label="Acceptance profile"\]\)/);
 for(const label of ['Switch Company','Demo company','Demo role','Acceptance profile'])
  assert.ok(css.includes('[aria-label="'+label+'"]'));
 assert.match(protectedSnapshot,/className="p-company"/);
 assert.match(protectedSnapshot,/Switch Company/);
});
