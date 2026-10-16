import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';

globalThis.crypto ??= webcrypto;
const source = await readFile(new URL('../worker/weather-provider.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials';",
  "const resolveMetaCredential = async () => 'test-only-weather-key';",
);
assert.notEqual(executable, source);
const { outputText } = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { readGoogleWeather } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const cached = new Map();
const providerCalls = [];
const env = {
  DB: { prepare: () => ({ first: async () => ({
    value: JSON.stringify({ enabled: true, defaultUnits: 'IMPERIAL', refreshIntervalSeconds: 300 }),
  }) }) },
  SOCIAL_CACHE: {
    async get(key) { return cached.get(key) ?? null; },
    async put(key, value) { cached.set(key, value); },
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  providerCalls.push({ url: String(url), headers: init.headers });
  return Response.json({ temperature: { degrees: 24 }, weatherCondition: { description: { text: 'Clear' } } });
};

try {
  const fresh = await readGoogleWeather(env, 6.5244, 3.3792);
  assert.equal(fresh.providerStatus, 'fresh');
  assert.equal(fresh.data.temperature.degrees, 24);
  assert.match(fresh.fetchedAt, /^\d{4}-\d\d-\d\dT/);
  assert.equal(fresh.cacheAgeSeconds, 0);
  assert.equal(providerCalls.length, 1);
  assert.equal(new URL(providerCalls[0].url).searchParams.has('key'), false);
  assert.equal(providerCalls[0].headers['X-Goog-Api-Key'], 'test-only-weather-key');

  const cacheKey = [...cached.keys()][0];
  assert.match(cacheKey, /^weather:google:v2:[a-f0-9]{64}$/);
  assert.equal(cacheKey.includes('6.5244'), false);
  const cachedResult = await readGoogleWeather(env, 6.5244, 3.3792);
  assert.equal(cachedResult.providerStatus, 'cached');
  assert.equal(cachedResult.fetchedAt, fresh.fetchedAt);
  assert.equal(Number.isInteger(cachedResult.cacheAgeSeconds), true);
  assert.equal(cachedResult.cacheAgeSeconds >= 0, true);
  assert.equal(providerCalls.length, 1, 'cache hit must not call the paid provider again');

  cached.set(cacheKey, JSON.stringify({ data: { temperature: 99 }, fetchedAtMs: Date.now() + 60_000 }));
  const invalidCache = await readGoogleWeather(env, 6.5244, 3.3792);
  assert.deepEqual(invalidCache, { data: null, providerStatus: 'cache_unavailable' });
  assert.equal(providerCalls.length, 1, 'invalid cache must fail closed without an extra provider call');

  const disabledEnv = {
    ...env,
    DB: { prepare: () => ({ first: async () => ({ value: JSON.stringify({ enabled: false }) }) }) },
  };
  const disabled = await readGoogleWeather(disabledEnv, 6.5244, 3.3792);
  assert.deepEqual(disabled, { data: null, providerStatus: 'provider_required' });
  assert.equal(providerCalls.length, 1, 'disabled weather must not call the provider');
  console.log('Google Weather cache freshness: 5/5 PASS (mock provider; no live call)');
} finally {
  globalThis.fetch = originalFetch;
}
