import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/postlogin-weather-normalization.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', compiled)(module, module.exports);
const { normalizePostLoginWeather } = module.exports;
const reading = {
  available: true, provider: 'Google Weather', providerStatus: 'fresh',
  fetchedAt: '2026-10-25T12:00:00Z', unitsSystem: 'METRIC',
  temperature: 28.6, apparentTemperature: 30, humidity: 72, windSpeed: 10,
  precipitationProbability: 15, isDay: true, description: 'Partly cloudy'
};
let pass = 0;
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  console.log('PASS ' + name);
  pass++;
}
const unavailable = value => normalizePostLoginWeather(value).available;
check('valid METRIC provider result retained', normalizePostLoginWeather(reading).temperature, 28.6);
check('no provider result means unavailable', unavailable(null), false);
check('HTTP error body without available flag is not a weather success', unavailable({ error: 'Upstream denied' }), false);
check('successful-looking result without temperature denied', unavailable({ ...reading, temperature: null }), false);
check('NaN temperature denied', unavailable({ ...reading, temperature: NaN }), false);
check('implausible temperature denied', unavailable({ ...reading, temperature: 9999 }), false);
check('nonmetric reading denied', unavailable({ ...reading, unitsSystem: 'IMPERIAL' }), false);
check('unavailable provider stays unavailable', unavailable({ available: false, providerStatus: 'provider_required' }), false);
check('invalid humidity not printed', normalizePostLoginWeather({ ...reading, humidity: 200 }).humidity, null);
check('invalid rain percentage not printed', normalizePostLoginWeather({ ...reading, precipitationProbability: -10 }).precipitationProbability, null);
check('invalid wind not printed', normalizePostLoginWeather({ ...reading, windSpeed: Infinity }).windSpeed, null);
check('invalid timestamp cannot be presented as current', normalizePostLoginWeather({ ...reading, fetchedAt: 'not-a-date' }).fetchedAt, undefined);
const component = readFileSync(new URL('../src/postlogin-live-widgets-v116.tsx', import.meta.url), 'utf8');
assert.match(component, /if \(!response\.ok\) throw new Error\('Weather request failed'\)/, 'Non-2xx weather responses must fail closed');
assert.match(component, /normalizePostLoginWeather\(payload\)/, '200 responses need actual contract validation');
assert.match(component, /weatherAbortRef\.current\?\.abort\(\)/, 'New request/unmount must cancel stale requests');
assert.match(component, /return \(\) => \{[\s\S]*button\.setAttribute\('aria-label', previousLabel\)/, 'Topbar must restore its original status on provider failure or unmount');
console.log('PASS lifecycle, HTTP, and original DOM restoration guards');
pass++;
console.log('STAGE1_WEATHER_TRUTH ' + pass + '/' + pass + ' PASS');
