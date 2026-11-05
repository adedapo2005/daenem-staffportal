import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import vm from 'node:vm';
const code=buildSync({entryPoints:['src/own-profile-display-shape.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports});
const valid=mod.exports.isOwnProfileDisplayShape;
const optional=['displayName','firstName','lastName','phone','email','jobTitle','department'];
const base={id:'synthetic-employee',displayName:'Test Employee',firstName:'Test',lastName:'Employee',phone:'',email:'test@example.invalid',jobTitle:'',department:'',status:'active'};
const oldValid=p=>[...optional,'status'].every(k=>p[k]===undefined||typeof p[k]==='string');
let assertions=0;const check=(value)=>{assert.ok(value);assertions++};
check(valid(base));
for(const field of optional){const p={...base,[field]:null};check(!oldValid(p));check(valid(p));}
for(const field of optional)for(const value of [1,false,{},[]])check(!valid({...base,[field]:value}));
for(const value of [null,undefined,1,'text',[]])check(!valid(value));
check(!valid({...base,status:null}));check(!valid({...base,status:1}));
check(valid({id:base.id,status:'active'}));
const p={...base,phone:null,jobTitle:null,department:null};const before=JSON.stringify(p);valid(p);check(JSON.stringify(p)===before);
console.log(JSON.stringify({state:'PASS',assertions,nullableServerValuesAccepted:7,invalidDisplayTypesRejected:28,invalidStatusRejected:true,inputUnchanged:true,liveRootCauseConfirmed:false}));
