const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../worker/weather-condition-code.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
new Function('exports', 'require', 'module', compiled)(compiledModule.exports, require, compiledModule);
const describe = compiledModule.exports.openMeteoDescription;

const expected = new Map([
  [0, 'Clear'], [1, 'Mostly clear'], [2, 'Partly cloudy'], [3, 'Overcast'],
  [45, 'Fog'], [48, 'Freezing fog'], [51, 'Light drizzle'], [53, 'Drizzle'],
  [55, 'Heavy drizzle'], [56, 'Light freezing drizzle'], [57, 'Heavy freezing drizzle'],
  [61, 'Light rain'], [63, 'Rain'], [65, 'Heavy rain'], [66, 'Light freezing rain'],
  [67, 'Heavy freezing rain'], [71, 'Light snow'], [73, 'Snow'], [75, 'Heavy snow'],
  [77, 'Snow grains'], [80, 'Light rain showers'], [81, 'Rain showers'],
  [82, 'Heavy rain showers'], [85, 'Light snow showers'], [86, 'Heavy snow showers'],
  [95, 'Thunderstorms'], [96, 'Thunderstorms with hail'], [99, 'Severe thunderstorms with hail'],
]);
for (const [code, label] of expected) assert.equal(describe(code), label, 'WMO code ' + code);
for (const invalid of [null, -1, 4, 49, 58, 68, 78, 83, 87, 97, 100, 1.5, Number.NaN]) {
  assert.equal(describe(invalid), 'Condition unavailable', 'unknown weather code ' + invalid);
}
console.log('Open-Meteo condition mapping passed: ' + expected.size + ' WMO codes and 13 unknown inputs.');
