import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectAllAuthorisedCompanyModules } from '../src/stage1-all-company-navigation-model.ts';

const companies=[
 {id:'printing',code:'PRINT',name:'Printing & Technology',primary:true},
 {id:'bakery',code:'BAKERY',name:'Bakery',primary:false},
 {id:'autos',code:'AUTOS',name:'Autos',primary:false},
];
const modules=[
 {id:'employee',label:'My Workspace',detail:'Employee',group:'My work'},
 {id:'profile',label:'My Profile',detail:'Own record',group:'My work'},
 {id:'printing',label:'Printing ERP',detail:'Jobs',group:'Operations',companyCodes:['PRINT'],permissions:['printing.access']},
 {id:'bakery',label:'Bakery ERP',detail:'Production',group:'Operations',companyCodes:['BAKERY'],permissions:['bakery.access']},
 {id:'forms',label:'Forms',detail:'Forms',group:'My work',permissions:['forms.access']},
 {id:'admin',label:'Access Control',detail:'Permissions',group:'Management',permissions:['access.control']},
 {id:'studio',label:'Studio',detail:'Design settings',group:'Management',strictOwnerOnly:true},
];
const workspace=(id,name,pages)=>({scopeId:id,scopeName:name,scopeCode:id||'GROUP',pages});
const page=(route,id)=>({route,label:route,href:id===null?'/'+route+'/group':'/'+route+'/company/'+id});
const ctx=(grants={},roles=[{code:'owner',name:'Owner'}])=>({
 employee:{id:'qa'},roles,companies,companyPermissions:grants,permissions:{},
});
const canSee=(c,m,id,code)=>{
 if(['employee','profile'].includes(m.id))return true;
 if(m.strictOwnerOnly)return false;
 if(!id)return false;
 if(m.companyCodes?.length&&!m.companyCodes.includes(code))return false;
 return m.permissions?.some(k=>['view','edit','manage'].includes(c.companyPermissions?.[id]?.[k]))||false;
};
const project=(c,workspaces=[])=>projectAllAuthorisedCompanyModules(c,modules,workspaces,canSee);

test('all granted companies appear automatically without an active/primary company',()=>{
 const p=project(ctx({printing:{'printing.access':'view','forms.access':'view'},bakery:{'bakery.access':'edit'}}),[
  workspace('printing','Printing',[page('forms','printing')]),workspace('bakery','Bakery',[page('forms','bakery')]),
 ]);
 assert.deepEqual(p.companies.map(x=>x.companyId),['printing','bakery']);
 assert.deepEqual(p.companies[0].modules.map(x=>x.id),['printing','forms']);
 assert.deepEqual(p.companies[1].modules.map(x=>x.id),['bakery']);
 assert.equal(p.companies[0].pages[0].href,'/forms/company/printing');
 assert.equal(p.companies.some(x=>x.companyId==='autos'),false);
});
test('Owner and Admin titles do not reveal companies with no grants',()=>{
 for(const code of ['owner','group_admin','company_admin'])
  assert.equal(project(ctx({},[{code,name:code}])).companies.length,0);
});
test('revoked grant removes the company and its names at next projection',()=>{
 const c=ctx({printing:{'printing.access':'view'}});
 assert.deepEqual(project(c).companies.map(x=>x.companyId),['printing']);
 const revoked={...c,companyPermissions:{printing:{'printing.access':'none'}}};
 assert.deepEqual(project(revoked).companies,[]);
});
test('group pages appear once only with explicitly projected group entitlement',()=>{
 const c=ctx();
 const scopes=[workspace(null,'DAENEM Group',[page('forms',null)])];
 assert.deepEqual(project(c,scopes).groupPages.map(x=>x.href),['/forms/group']);
 assert.equal(project(c,scopes).companies.length,0);
 assert.deepEqual(project(c).groupPages,[]);
});
test('an actual company named group is not confused with group-wide pages',()=>{
 const c=ctx({group:{'forms.access':'view'}});c.companies.push({id:'group',code:'GROUP-REAL',name:'Real Group Ltd'});
 const scopes=[workspace('group','Real Group Ltd',[page('forms','group')]),workspace(null,'DAENEM Group',[page('forms',null)])];
 const p=project(c,scopes);
 assert.equal(p.companies.length,1);
 assert.equal(p.companies[0].companyId,'group');
 assert.equal(p.companies[0].pages[0].href,'/forms/company/group');
 assert.equal(p.groupPages[0].href,'/forms/group');
});
test('duplicate and zero-grant companies do not leak as navigation choices',()=>{
 const c=ctx({'printing':{'printing.access':'view'}});
 c.companies.push({...companies[0]});
 assert.equal(project(c).companies.length,1);
 assert.deepEqual(project(c).companies.map(x=>x.companyName),['Printing & Technology']);
});
test('personal module navigation is listed once rather than repeated for every company',()=>{
 const p=project(ctx({printing:{'forms.access':'view'},bakery:{'forms.access':'view'}}));
 assert.deepEqual(p.personal.map(x=>x.id),['employee','profile']);
 assert.ok(p.companies.every(x=>x.modules.every(m=>m.id!=='employee'&&m.id!=='profile')));
});
test('navigation projection never uses selected/primary company as access authority',()=>{
 const code=readFileSync(new URL('../src/stage1-all-company-navigation-model.ts',import.meta.url),'utf8');
 assert.doesNotMatch(code,/selectedCompany|setSelectedCompany|\.primary\b|owner\(context\)/);
 assert.match(code,/context\.companies/);
 assert.match(code,/canSee\(context, m, company\.id, company\.code\)/);
});
test('UI provides direct grant-scoped company pages and module callback, not a selector',()=>{
 const ui=readFileSync(new URL('../src/stage1-all-company-navigation.tsx',import.meta.url),'utf8');
 assert.match(ui,/projectAllAuthorisedCompanyModules\(context,moduleDefinitions,authorisedLiveWorkspaces\(context\),isModuleVisible\)/);
 assert.match(ui,/href=\{page\.href\}/);
 assert.match(ui,/onOpenModule\(module\.id,company\.companyId,company\.companyCode\)/);
 assert.doesNotMatch(ui,/<select|<option|Switch Company|selectedCompany|setCompany|onChange=\{/i);
});
test('accessible 44px links, keyboard focus, opaque surfaces and reduced motion',()=>{
 const css=readFileSync(new URL('../src/stage1-all-company-navigation.css',import.meta.url),'utf8');
 assert.match(css,/min-height:44px/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/background:#fff/);
 assert.doesNotMatch(css,/backdrop-filter|filter:blur/);
});
