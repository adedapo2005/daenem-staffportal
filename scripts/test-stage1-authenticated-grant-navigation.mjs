import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const host=source('src/qa-review-v115-runtime.tsx');
const adapter=source('src/enterprise-command-center-navigation.tsx');
const navigation=source('src/stage1-grant-navigation.tsx');
const css=source('src/stage1-grant-navigation.css');
const launcher=source('src/stage1-granted-module-launch.ts');
const protectedSnapshot=source('source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx');

function extract(path,name,deps){
  const content=source(path);
  const tree=ts.createSourceFile(path,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let fn;
  for(const statement of tree.statements)
    if(ts.isFunctionDeclaration(statement)&&statement.name?.text===name)fn=statement;
  assert.ok(fn,'Actual source function '+name+' must exist in '+path);
  const js=ts.transpileModule(fn.getText(tree).replace(/^export\s+/,''),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.ReactJSX},
  }).outputText;
  return new Function(...Object.keys(deps),js+'\nreturn '+name)(...Object.values(deps));
}
const levels=['none','view','create','edit','approve','manage'];
function permissionLevel(ctx,code,companyId){
  return (companyId===null?ctx.permissions?.[code]:ctx.companyPermissions?.[companyId]?.[code])||'none';
}
function hasWorkforcePermission(ctx,code,min='view',companyId=null){
  return levels.indexOf(permissionLevel(ctx,code,companyId))>=levels.indexOf(min);
}
const visibility=extract('src/module-hub.tsx','isModuleVisible',{hasWorkforcePermission,permissionLevel});
const modules=[
 {id:'employee',label:'My Workspace',erpId:'staff'},
 {id:'profile',label:'My Profile',erpId:'staff'},
 {id:'printing',label:'Printing ERP',companyCodes:['PRINT'],permissions:['printing.access'],erpId:'printing'},
 {id:'bakery',label:'Bakery ERP',companyCodes:['BAKERY'],permissions:['bakery.access'],erpId:'bakery'},
 {id:'autos',label:'Autos ERP',companyCodes:['AUTOS'],permissions:['autos.access'],erpId:'autos'},
 {id:'finance',label:'Finance',prefixes:['finance.'],erpId:'finance'},
];
const catalog=id=>modules.find(m=>m.id===id);
const groups=extract('src/stage1-grant-navigation.tsx','grantedCompanyModuleGroups',{
  moduleDefinitions:modules,isModuleVisible:visibility,
});
const authorisedLaunch=extract('src/stage1-granted-module-launch.ts','authorisedModuleLaunch',{
  getCanonicalModule:catalog,isModuleVisible:visibility,
});

const ctx=(roles=[{code:'owner',id:'owner'}],grants={
 'printing':{'printing.access':'view','forms.access':'view'},
 'bakery':{'bakery.access':'view','finance.entry':'view'},
})=>({
 sessionId:'qa-session',employee:{id:'qa',displayName:'QA'},
 roles,
 companies:[
   {id:'printing',code:'PRINT',name:'DAENEM Printing'},
   {id:'bakery',code:'BAKERY',name:'DAENEM Bakery'},
   {id:'autos',code:'AUTOS',name:'DAENEM Autos'},
 ],
 permissions:{},companyPermissions:grants,
});

test('desktop and mobile command navigation share the real authenticated grant provider',()=>{
 assert.match(host,/Stage1AuthenticatedWorkforceContext\.Provider value=\{context\}/);
 assert.match(adapter,/useContext\(Stage1AuthenticatedWorkforceContext\)/);
 assert.match(adapter,/if\(workforce\) return <Stage1GrantNavigation context=\{workforce\}/);
 assert.match(adapter,/return <CommandCenterSession key=\{props\.sessionScopeKey\}/);
 assert.match(protectedSnapshot,/EnterpriseCommandCenterNavigation/);
});

test('all assigned companies are displayed automatically, without first-company fallback',()=>{
 const result=groups(ctx());
 assert.deepEqual(result.map(x=>x.id),['printing','bakery']);
 assert.deepEqual(result.map(x=>x.modules.map(m=>m.id)),[['printing'],['bakery','finance']]);
 assert.doesNotMatch(navigation,/selectedCompanyId|setSelectedCompanyId|companyPicker|onChange=\{.*setCompany/);
 assert.match(navigation,/context\.companies\.flatMap\(company=>/);
});

test('role-only Owner and Admin cannot manufacture a company or finance page',()=>{
 for(const role of ['owner','group_admin']){
  const c=ctx([{id:role,code:role}],{});
  assert.deepEqual(groups(c),[]);
  assert.equal(authorisedLaunch(c,{scopeId:'printing',moduleId:'printing'}),null);
  assert.equal(authorisedLaunch(c,{scopeId:'bakery',moduleId:'finance'}),null);
 }
});

test('cross-company, unassigned and self-service-based launches fail closed',()=>{
 const c=ctx();
 assert.equal(authorisedLaunch(c,{scopeId:'bakery',moduleId:'printing'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'autos',moduleId:'autos'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'unknown',moduleId:'finance'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'printing',moduleId:'employee'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'printing',moduleId:'profile'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'printing',moduleId:'nonexistent'}),null);
 assert.equal(authorisedLaunch(c,{scopeId:'printing',moduleId:'printing'})?.company.id,'printing');
 assert.equal(authorisedLaunch(c,{scopeId:'bakery',moduleId:'finance'})?.company.id,'bakery');
});

test('host suppresses legacy company and demo role-selection controls',()=>{
 assert.match(css,/\.p-company,/);
 assert.match(css,/\.p-demo-strip button,/);
 assert.match(css,/aria-label="Switch Company"/);
 assert.match(css,/aria-label="Demo company"/);
 assert.match(css,/aria-label="Demo role"/);
 assert.match(css,/aria-label="Acceptance profile"/);
 assert.match(css,/\.p-workspace-scope/);
 assert.match(css,/display:none!important/);
 assert.match(navigation,/data-grant-navigation="true"/);
 assert.match(navigation,/aria-label="Authorised company and module pages"/);
});

test('all granted company pages and group-only forms use routed links',()=>{
 assert.match(navigation,/authorisedLiveWorkspaces\(context\)/);
 assert.match(navigation,/company\.pages\.map\(page=>/);
 assert.match(navigation,/company\.modules\.map\(module=>/);
 assert.match(navigation,/workspaces\.find\(w=>w\.scopeId===null\)/);
 assert.match(navigation,/groupPages\.map\(page=>/);
 assert.match(navigation,/data-authorised-company=\{company\.id\}/);
});

test('module launches reuse canonical entries, company scope and disclose failure',()=>{
 assert.match(launcher,/await module\.load\(\)/);
 assert.match(launcher,/authorisedModuleLaunch\(context,request\)/);
 assert.match(launcher,/daenem:active-company-changed/);
 assert.match(launcher,/companyId:company\.id,companyCode:company\.code/);
 assert.match(launcher,/module\.event\.name/);
 assert.match(navigation,/setError\(cause instanceof Error/);
 assert.match(navigation,/aria-live="polite"/);
});

test('responsive keyboard controls and reduced motion remain available',()=>{
 assert.match(css,/@media\(max-width:1024px\)/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(navigation,/type="search"/);
 assert.match(navigation,/disabled=\{Boolean\(busy\)\}/);
 assert.match(navigation,/Expand authorised company navigation/);
});


test('permission revocation during lazy import never opens an obsolete company module',async()=>{
 const selected=catalog('printing'),originalLoad=selected.load;
 let started,release;
 const began=new Promise(resolve=>{started=resolve;});
 const barrier=new Promise(resolve=>{release=resolve;});
 selected.load=async()=>{started();await barrier;};
 const events=[];
 const previousWindow=globalThis.window,previousCustomEvent=globalThis.CustomEvent;
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true;}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 const action=extract('src/stage1-granted-module-launch.ts','launchGrantedModule',{
   authorisedModuleLaunch:authorisedLaunch,afterRender:async()=>{},
 });
 const initial=ctx(),request={scopeId:'printing',moduleId:'printing'};
 let latest=initial;
 try{
   const pending=action(initial,request,()=>latest);
   await began;
   latest=ctx(initial.roles,{'bakery':{'bakery.access':'view'}});
   release();
   await assert.rejects(pending,/company access changed/);
   assert.ok(!events.includes('daenem:active-company-changed'));
 }finally{
   selected.load=originalLoad;
   globalThis.window=previousWindow;globalThis.CustomEvent=previousCustomEvent;
 }
});

test('changing authenticated employee while a module chunk loads cancels activation',async()=>{
 const selected=catalog('printing'),originalLoad=selected.load;
 let started,release;
 const began=new Promise(resolve=>{started=resolve;});
 const barrier=new Promise(resolve=>{release=resolve;});
 selected.load=async()=>{started();await barrier;};
 const previousWindow=globalThis.window,previousCustomEvent=globalThis.CustomEvent;
 const events=[];
 globalThis.window={dispatchEvent:event=>{events.push(event.type);return true;}};
 globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 const action=extract('src/stage1-granted-module-launch.ts','launchGrantedModule',{
   authorisedModuleLaunch:authorisedLaunch,afterRender:async()=>{},
 });
 const initial=ctx(),request={scopeId:'printing',moduleId:'printing'};
 let latest=initial;
 try{
   const pending=action(initial,request,()=>latest);
   await began;
   latest={...initial,sessionId:'different-session',employee:{id:'different-employee',displayName:'Other'}};
   release();
   await assert.rejects(pending,/company access changed/);
   assert.ok(!events.includes('daenem:active-company-changed'));
 }finally{
   selected.load=originalLoad;
   globalThis.window=previousWindow;globalThis.CustomEvent=previousCustomEvent;
 }
});
