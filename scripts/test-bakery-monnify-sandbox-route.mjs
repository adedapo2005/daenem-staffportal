import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const path=new URL('../worker/bakery-monnify-sandbox-route.ts',import.meta.url);
const source=fs.readFileSync(path,'utf8');
const router=fs.readFileSync(new URL('../worker/bakery-accountability.ts',import.meta.url),'utf8');
assert(router.includes("return routeBakeryMonnifySandbox(request,env,context)"));
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
const counters={db:0,network:0};
const loader=(name)=>{
 if(name==='./auth')return{hasPermission:(ctx,code,level,company)=>company==='company-bakery'&&ctx.grants?.includes(code)&&!(level==='edit'&&!ctx.write)};
 if(name==='./bakery-monnify-sandbox-init')return{configuredSandbox:()=>true,initializeBakeryMonnifySandbox:()=>{counters.network++;throw Error('Provider must not be called')},validCheckout:()=>false};
 if(name==='./bakery-monnify-verification')return{verifyBoundBakeryMonnifyTransaction:()=>{counters.network++;throw Error('Provider must not be called')}};
 throw Error('Unexpected module '+name);
};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({Request,Response,URL,crypto,fetch:()=>{counters.network++;throw Error('Network called')},console,JSON,Number});
const sandbox={exports};
new vm.Script('(function(require,module,exports){'+js+'\n})').runInNewContext({Request,Response,URL,crypto,fetch:()=>{counters.network++;throw Error('Network called')},console})(loader,sandbox,sandbox.exports);
const route=sandbox.exports.routeBakeryMonnifySandbox;
assert.equal(typeof route,'function');
const env={DB:{prepare(){counters.db++;throw Error('Unauthorized query')},batch(){counters.db++;throw Error('Unauthorized batch')}}};
const denied={companies:[{id:'company-printing'}],employee:{id:'a'},grants:['bakery.reconciliation','finance.receivables'],write:true};
const readOnly={companies:[{id:'company-bakery'}],employee:{id:'a'},grants:['bakery.reconciliation','finance.receivables'],write:false};
const valid={...readOnly,write:true};
const request=(path,body,method='POST')=>new Request('https://test.invalid'+path,{method,body:body===undefined?undefined:JSON.stringify(body)});
const base='/api/bakery/accountability/monnify-sandbox';
for(const u of [denied,readOnly]){
 const r=await route(request(base+'/initiate',{receivableId:'ar-123'}),env,u);
 assert.equal(r.status,403);
}
assert.equal((await route(request(base+'/unsupported',{receivableId:'ar-123'}),env,valid)).status,404);
assert.equal((await route(request(base+'/initiate',{amountNaira:100,receivableId:'ar-123'}),env,valid)).status,400);
assert.equal((await route(request(base+'/verify',{paymentReference:'forged',intentId:'intent-123'}),env,valid)).status,400);
assert.equal(counters.db,0);
assert.equal(counters.network,0);
console.log('PASS authenticated Bakery sandbox routes: permission, unknown paths, client monetary/reference injection denied before DB and provider');
