import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/postlogin-context-normalization.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
}).outputText;
const module = { exports: {} };
new Function('module','exports',compiled)(module,module.exports);
const { normalizePostLoginContext } = module.exports;

const current = {
  generatedAt: '2026-10-22T17:00:00.000Z', status: 'live',
  activeSourceCount: 2, configuredSourceCount: 8, successfulFeedCount: 2,
  news: [{id:'a',title:'Nigeria agriculture update',url:'https://news.example.test/story',
    source:'Nigeria feed',category:'Agriculture',publishedAt:'2026-10-22T16:00:00Z'}],
  intelligence: [], inspiration: {title:'A clear start',message:'Do the right work.',action:'Review approvals.'},
};
let passes=0;
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);console.log('PASS '+name);passes++;};
check('empty successful response has no invented counters', normalizePostLoginContext({}), null);
check('null response fails closed', normalizePostLoginContext(null), null);
check('missing numerical status field fails closed', normalizePostLoginContext({...current,activeSourceCount:undefined}), null);
check('undefined count string fails closed', normalizePostLoginContext({...current,successfulFeedCount:'undefined'}),null);
check('non-integer source count fails closed',normalizePostLoginContext({...current,configuredSourceCount:1.5}),null);
check('negative count fails closed',normalizePostLoginContext({...current,activeSourceCount:-1}),null);
check('unrecognized status fails closed',normalizePostLoginContext({...current,status:'connected'}),null);
check('invalid generation time fails closed',normalizePostLoginContext({...current,generatedAt:'not-a-date'}),null);
check('malformed headline arrays fail closed',normalizePostLoginContext({...current,news:{}}),null);
check('valid response retains verified counts', normalizePostLoginContext(current)?.activeSourceCount,2);
check('valid response keeps safely bounded HTTPS headlines',normalizePostLoginContext(current)?.news.length,1);
check('missing inspiration never prints undefined',normalizePostLoginContext({...current,inspiration:null})?.inspiration.title,'A clear start');
const withHeadline=(url)=>({...current,news:[{...current.news[0],url}]});
check('javascript headline links are excluded',normalizePostLoginContext(withHeadline('javascript:alert(1)'))?.news.length,0);
check('HTTP headline links are excluded',normalizePostLoginContext(withHeadline('http://unsafe.example.test'))?.news.length,0);
check('protocol-relative headline links are excluded',normalizePostLoginContext(withHeadline('//unsafe.example.test'))?.news.length,0);
check('credentialed external HTTPS headline links are excluded',normalizePostLoginContext(withHeadline('https://user:pass@unsafe.example.test/story'))?.news.length,0);
check('bad published date is removed, not invented',normalizePostLoginContext({...current,news:[{...current.news[0],publishedAt:'invalid'}]})?.news[0].publishedAt,null);
check('unavailable status with zero sources remains accurate',normalizePostLoginContext({...current,status:'unavailable',activeSourceCount:0,successfulFeedCount:0,news:[]})?.activeSourceCount,0);
const view = readFileSync(new URL('../src/postlogin-live-widgets-v116.tsx',import.meta.url),'utf8');
assert.ok(view.includes('setContext(normalizePostLoginContext(payload))'),'Component must validate 200 JSON payloads');
assert.ok(view.includes('News sources currently unavailable'),'News fallback must be truthful');
assert.ok(view.includes('Intelligence feeds currently unavailable'),'Intelligence fallback must be truthful');
console.log('PASS validated Home UI integration');
passes++;
console.log('POSTLOGIN_CONTEXT_RUNTIME '+passes+'/'+passes+' PASS');
