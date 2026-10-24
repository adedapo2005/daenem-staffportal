import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8');
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'approved weather source anchors remain stable');
  return source.slice(a, b);
};
const cities = between('const PUBLIC_SIGNIN_WEATHER_CITIES = {', 'async function fixedCityWeatherFallback');
const policy = between('async function signInWeather(', 'async function weather(');
const sample = ts.transpileModule(cities + '\n' + policy + '\nexport { signInWeather };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const checks = [];
const check = async (label, test) => { await test(); checks.push(label); console.log('PASS: ' + label); };
const json = (value, status = 200) => Response.json(value, { status });
let upstream = null, fallback = null, upstreamCalls = [], fallbackCalls = [];
const loaded = { exports: {} };
new Function('module','exports','json','weatherResponse','fixedCityWeatherFallback',sample)(
  loaded, loaded.exports, json,
  async (_env,lat,lon,unit,location) => { upstreamCalls.push({lat,lon,unit,location}); return upstream.clone(); },
  async (lat,lon,location) => { fallbackCalls.push({lat,lon,location}); return fallback?.clone() || null; },
);
const run = (city) => loaded.exports.signInWeather({}, city);
const reset = (primary, alternate) => { upstream=json(primary.body,primary.status); fallback=alternate && json(alternate); upstreamCalls=[]; fallbackCalls=[]; };

await check('valid Google response stays primary, no fallback or city change', async () => {
  reset({status:200,body:{available:true,provider:'Google Weather',temperature:22}},{available:true,provider:'Open-Meteo fallback',temperature:25});
  const result=await run('tokyo');
  assert.equal((await result.json()).provider,'Google Weather');
  assert.equal(fallbackCalls.length,0);
  assert.equal(upstreamCalls[0].unit,'METRIC');
});
await check('Google coverage unavailable via HTTP 200 uses actual bounded fallback', async () => {
  reset({status:200,body:{available:false,providerStatus:'provider_required'}},{available:true,provider:'Open-Meteo fallback',temperature:24});
  const result=await run('beijing');
  assert.equal((await result.json()).provider,'Open-Meteo fallback');
  assert.equal(fallbackCalls.length,1);
  assert.equal(fallbackCalls[0].lat,39.9042);
});
await check('provider 502 uses fallback and does not display a fabricated value', async () => {
  reset({status:502,body:{available:false,providerStatus:'unavailable'}},{available:true,provider:'Open-Meteo fallback',temperature:18});
  assert.equal((await (await run('tokyo')).json()).temperature,18);
});
await check('both providers missing preserves an honest unavailable response', async () => {
  reset({status:200,body:{available:false,providerStatus:'provider_required'}},null);
  const res=await run('tokyo');
  assert.deepEqual(await res.json(),{available:false,providerStatus:'provider_required'});
});
await check('unsupported cities never fetch providers', async () => {
  reset({status:200,body:{available:false,providerStatus:'provider_required'}},null);
  const res=await run('unknown');
  assert.equal(res.status,400);
  assert.equal(upstreamCalls.length,0);
  assert.equal(fallbackCalls.length,0);
});
await check('fixed-city fallback rejects incomplete Open-Meteo payloads', async () => {
  const fallbackSource = between('async function fixedCityWeatherFallback(', 'async function signInWeather(');
  const compiled = ts.transpileModule(fallbackSource + '\nexport { fixedCityWeatherFallback };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let responseValue={current:{time:'2026-10-24T11:45',temperature_2m:null}};
  const helper={exports:{}};
  new Function('module','exports','json','openMeteoDescription','fetch',compiled)(
    helper,helper.exports,json,()=>'Conditions unavailable',
    async ()=>json(responseValue));
  assert.equal(await helper.exports.fixedCityWeatherFallback(35,139,'Tokyo, Japan'),null);
  responseValue={current:{time:'2026-10-24T11:45',temperature_2m:22.5,weather_code:3}};
  const good=await helper.exports.fixedCityWeatherFallback(35,139,'Tokyo, Japan');
  assert.equal((await good.json()).temperature,22.5);
});
console.log('Public Sign-In fixed-city fallback: '+checks.length+'/'+checks.length+' PASS');
