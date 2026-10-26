import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorisedLiveWorkspaces, liveRouteCompanyScope } from '../src/authorised-live-workspaces.ts';

const company=(id,code,name,primary=false)=>({id,code,name,primary});
const base={
  sessionId:'session-qa',employee:{id:'staff-qa',status:'active',displayName:'QA'},
  roles:[{id:'role',code:'owner',name:'Owner',companyId:'printing'}],
  companies:[company('printing','PRINT','DAENEM Printing',true),
             company('bakery','BAKERY','DAENEM Bakery'),
             company('autos','AUTOS','DAENEM Autos')],
  permissions:{},
  companyPermissions:{
    printing:{'forms.access':'view','facilities.access':'edit','expense.requests':'create'},
    bakery:{'forms.access':'view','expense.approve':'view'},
    autos:{'forms.access':'none','facilities.access':'none','expense.requests':'none'},
  },
};

test('permissions automatically populate company -> accessible ERP pages for all companies',()=>{
  const workspaces=authorisedLiveWorkspaces(base);
  assert.deepEqual(workspaces.map(w=>w.scopeName),['DAENEM Printing','DAENEM Bakery']);
  assert.deepEqual(workspaces[0].pages.map(p=>p.route),['forms','facilities','spend']);
  assert.deepEqual(workspaces[1].pages.map(p=>p.route),['forms','spend']);
  assert.equal(workspaces[0].pages[0].href,'/forms/company/printing');
  assert.equal(workspaces[1].pages[0].href,'/forms/company/bakery');
  assert.equal(workspaces.some(w=>w.scopeId==='autos'),false);
});

test('Owner and Admin roles do not bypass absent company/page permission grants',()=>{
  const noGrants={...base,permissions:{},companyPermissions:{},roles:[
    {id:'owner',code:'owner',name:'Owner',companyId:'printing'},
    {id:'admin',code:'company_admin',name:'Admin',companyId:'bakery'},
  ]};
  assert.deepEqual(authorisedLiveWorkspaces(noGrants),[]);
});

test('global Group forms are independent of real company IDs and require explicit grant',()=>{
  const context={...base,companies:[...base.companies,company('group','GROUP-LTD','Real company named group')],
    permissions:{'forms.access':'view'},companyPermissions:{
      ...base.companyPermissions,group:{'forms.access':'view'},
    }};
  const workspaces=authorisedLiveWorkspaces(context);
  assert.ok(workspaces.some(w=>w.scopeId===null&&w.pages[0].href==='/forms/group'));
  assert.ok(workspaces.some(w=>w.scopeId==='group'&&w.pages[0].href==='/forms/company/group'));
  assert.equal(liveRouteCompanyScope('/forms/group','forms',workspaces).workspace?.scopeId,null);
  assert.equal(liveRouteCompanyScope('/forms/company/group','forms',workspaces).workspace?.scopeId,'group');
  assert.deepEqual(authorisedLiveWorkspaces({...base,permissions:{}}).filter(w=>w.scopeId===null),[]);
});

test('no company selection or arbitrary first-company fallback is needed on base routes',()=>{
  const workspaces=authorisedLiveWorkspaces(base);
  const baseScope=liveRouteCompanyScope('/forms','forms',workspaces);
  assert.equal(baseScope.explicit,false);
  assert.equal(baseScope.workspace,null);
  assert.equal(baseScope.denied,false);
  assert.equal(workspaces.filter(w=>w.pages.some(p=>p.route==='forms')).length,2);
});

test('direct and guessed URLs are rechecked against exact company/page grants',()=>{
  const workspaces=authorisedLiveWorkspaces(base);
  assert.equal(liveRouteCompanyScope('/forms/company/bakery','forms',workspaces).workspace?.scopeId,'bakery');
  assert.equal(liveRouteCompanyScope('/facilities/company/bakery','facilities',workspaces).denied,true);
  assert.equal(liveRouteCompanyScope('/forms/company/autos','forms',workspaces).denied,true);
  assert.equal(liveRouteCompanyScope('/forms/company/%ZZ','forms',workspaces).denied,true);
  assert.equal(liveRouteCompanyScope('/spend/company/printing','spend',workspaces).workspace?.scopeId,'printing');
  assert.equal(liveRouteCompanyScope('/forms/company/printing','spend',workspaces).explicit,false);
});

test('no interactive company picker remains on live Forms, Facilities or Spend routes',()=>{
  const bridge=readFileSync(new URL('../src/stage1-live-erp-route-bridge.tsx',import.meta.url),'utf8');
  const spend=readFileSync(new URL('../src/spend-entry.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(bridge,/selectedCompanyId|setSelectedCompanyId|id="daenem-live-company"/);
  assert.match(bridge,/authorisedLiveWorkspaces\(context\)/);
  assert.match(bridge,/data-authorised-company-workspace=\{entry.scopeId \|\| 'group'\}/);
  assert.match(bridge,/aria-label="Company modules and authorised pages"/);
  assert.match(bridge,/contextFor\(entry.scopeId\)/);
  assert.match(bridge,/scope.denied/);
  assert.match(spend,/fixedCompanyId\?: string/);
  assert.doesNotMatch(spend,/setSelectedCompany\(/);
  assert.doesNotMatch(spend,/aria-label="Working company"/);
});

test('each rendered Forms page filters assignments by server-assigned company, Group separately',()=>{
  const forms=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
  assert.match(forms,/const assignments=\(mineResult.assignments\|\|\[\]\).filter\(\(item\)=>companyId/);
  assert.match(forms,/item.companyId===companyId : !item.companyId/);
  assert.match(forms,/assignedFormDraftCompany\(item\)/);
});
