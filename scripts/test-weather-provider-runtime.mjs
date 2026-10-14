import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/weather-provider.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials';",
  `const resolveMetaCredential = async (env, key) => key === 'google_weather_api_key' ? env.testCredential : '';`,
);
assert.notEqual(executable, source, 'only the encrypted credential resolver is replaced by an in-memory test adapter');
const { outputText } = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { readGoogleWeather } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const setting = (enabled, defaultUnits = 'IMPERIAL', refreshIntervalSeconds = 300) => ({
  DB: { prepare: () => ({ first: async () => ({ value: JSON.stringify({ enabled, defaultUnits, refreshIntervalSeconds }) }) }) },
});

function makeCache({ failGet = false } = {}) {
  const values = new Map();
  const ttls = [];
  return {
    values,
    ttls,
    async get(key) {
      if (failGet) throw new Error('cache unavailable');
      return values.get(key) ?? null;
    },
    async put(key, value, options) {
      values.set(key, value);
      ttls.push(options.expirationTtl);
    },
  };
}

const originalFetch = globalThis.fetch;
const testCredential = 'in-memory-weather-test-credential';
let providerCalls = 0;
let lastUrl;
let lastHeaders;
let providerResponse = { temperature: { degrees: 68 }, weatherCondition: { description: { text: 'Clear' } } };
globalThis.fetch = async (input, init) => {
  providerCalls += 1;
  lastUrl = new URL(String(input));
  lastHeaders = new Headers(init?.headers);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return new Response(JSON.stringify(providerResponse), { status: 200, headers: { 'content-type': 'application/json' } });
};

try {
  const disabledCache = makeCache();
  const disabled = await readGoogleWeather({ ...setting(false), SOCIAL_CACHE: disabledCache, testCredential }, 40, -74);
  assert.deepEqual(disabled, { data: null, providerStatus: 'provider_required' });
  assert.equal(providerCalls, 0, 'disabled weather never calls the provider');

  const enabledConfig = setting(true, 'METRIC', 1200);
  const cache = makeCache();
  const enabled = { ...enabledConfig, SOCIAL_CACHE: cache, testCredential };
  const invalid = await readGoogleWeather(enabled, 91, 0);
  assert.deepEqual(invalid, { data: null, providerStatus: 'provider_unavailable' });
  assert.equal(providerCalls, 0, 'invalid coordinates never call the provider');

  const [fresh, joined] = await Promise.all([
    readGoogleWeather(enabled, 40, -74),
    readGoogleWeather(enabled, 40, -74),
  ]);
  assert.equal(fresh.providerStatus, 'fresh');
  assert.deepEqual(fresh.data, providerResponse);
  assert.equal(joined.providerStatus, 'fresh', 'concurrent identical requests share one provider result');
  assert.equal(providerCalls, 1, 'single-flight prevents duplicate provider calls');
  assert.equal(lastUrl.origin, 'https://weather.googleapis.com');
  assert.equal(lastUrl.pathname, '/v1/currentConditions:lookup');
  assert.equal(lastUrl.searchParams.get('unitsSystem'), 'METRIC');
  assert.equal([...lastUrl.searchParams.keys()].some((name) => /key|credential|token/i.test(name)), false);
  assert.equal(lastHeaders.get('X-Goog-Api-Key'), testCredential, 'credential is sent only in the provider header');
  assert.deepEqual(cache.ttls, [1200], 'configured refresh interval bounds the cache lifetime');
  assert.equal(JSON.stringify(fresh).includes(testCredential), false, 'credential is absent from the returned data');
  assert.equal([...cache.values.values()].some((value) => value.includes(testCredential)), false, 'credential is absent from cached data');

  const cached = await readGoogleWeather(enabled, 40, -74);
  assert.equal(cached.providerStatus, 'cached');
  assert.deepEqual(cached.data, providerResponse);
  assert.equal(providerCalls, 1, 'cache hit avoids another provider call');

  const failClosedCache = makeCache({ failGet: true });
  const cacheFailure = await readGoogleWeather({ ...enabled, SOCIAL_CACHE: failClosedCache }, 41, -73);
  assert.deepEqual(cacheFailure, { data: null, providerStatus: 'cache_unavailable' });
  assert.equal(providerCalls, 1, 'cache read failure fails closed before a provider call');

  providerResponse = 'not an object';
  const malformed = await readGoogleWeather(enabled, 42, -72);
  assert.deepEqual(malformed, { data: null, providerStatus: 'provider_unavailable' });
  assert.equal(providerCalls, 2);
  console.log('Google Weather provider isolated runtime: 23 assertions PASS (mock provider; no network or secret access)');
} finally {
  globalThis.fetch = originalFetch;
}
