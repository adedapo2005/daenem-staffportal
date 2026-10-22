const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('typescript');
const compiled=filepath=>ts.transpileModule(fs.readFileSync(path.resolve(filepath),'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
function load(filepath,dependencies={}){
 const module={exports:{}};
 vm.runInNewContext(compiled(filepath),{module,exports:module.exports,require(name){
  if(Object.prototype.hasOwnProperty.call(dependencies,name))return dependencies[name];
  throw Error('Unexpected dependency '+name);
 },URL,Date,Intl,console});
 return module.exports;
}
const frontend=load('src/signin-preferences.ts');
const backend=load('worker/theme-preferences.ts',{
 './auth':{hasPermission:()=>false},
 './signin-design-library':{routeSignInDesignLibrary:async()=>null},
});
const legacy={logo:{glass:true},effects:{glassIntensity:98},widgetInstances:[
 {id:'news',kind:'news',effectPreset:'glass',label:'Nigeria News',visible:true,variant:'headline-stack',zone:'today',order:0},
]};
const client=frontend.normalizeSignInPreferences(legacy);
const server=backend.cleanSignInConfig(legacy);
for(const [name,config] of [['Client',client],['Server',server]]){
 assert.equal(config.logo.glass,false,name+' must disable glass backing');
 assert.equal(config.effects.glassIntensity,0,name+' must neutralize legacy glass intensity');
 assert.equal(config.widgetInstances[0].effectPreset,'soft',name+' must migrate glass widget effects to solid');
}
assert.equal(frontend.DEFAULT_SIGNIN_PREFERENCES.logo.glass,false);
assert.equal(frontend.DEFAULT_SIGNIN_PREFERENCES.effects.glassIntensity,0);
assert.equal(backend.cleanSignInConfig(null).logo.glass,false);
const studio=fs.readFileSync('src/theme-studio-entry.ts','utf8');
assert.ok(!studio.includes('data-signin-field="logo.glass"'),'Studio must not expose glass backing');
assert.ok(!studio.includes('data-signin-field="effects.glassIntensity"'),'Studio must not expose glass intensity');
assert.ok(!studio.includes("['quiet', 'glass', 'accent', 'soft']"),'Studio must not offer glass presets');
console.log('PASS: solid, no-glass Owner Studio defaults, legacy migration and UI controls');
