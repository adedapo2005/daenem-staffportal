import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials';

export interface WeatherProviderEnv extends MetaCredentialEnv {
  SOCIAL_CACHE?: KVNamespace;
  WEATHER_PROVIDER_ENABLED?: string;
}

const CACHE_TTL_SECONDS = 300;
const STALE_CACHE_TTL_SECONDS = 86_400;
const PROVIDER_TIMEOUT_MS = 8_000;
const inFlightWeather = new Map<string, Promise<GoogleWeatherResult>>();

type WeatherCacheEntry = { data: Record<string, unknown>; fetchedAtMs: number };

export type GoogleWeatherResult =
  | { data: Record<string, unknown>; providerStatus: 'fresh' | 'cached'; fetchedAt: string; cacheAgeSeconds: number }
  | { data: null; providerStatus: 'cache_unavailable' | 'provider_required' | 'provider_unavailable' };

export type WeatherConfiguration = {
  enabled: boolean;
  defaultUnits: 'IMPERIAL' | 'METRIC';
  refreshIntervalSeconds: number;
};

export async function readWeatherConfiguration(env: WeatherProviderEnv): Promise<WeatherConfiguration> {
  try {
    const row = await env.DB.prepare("SELECT setting_value AS value FROM app_settings WHERE setting_key='experience.weather.organization' LIMIT 1")
      .first<{ value: string }>();
    if (!row?.value) return { enabled: env.WEATHER_PROVIDER_ENABLED === 'true', defaultUnits: 'IMPERIAL', refreshIntervalSeconds: CACHE_TTL_SECONDS };
    const settings: unknown = JSON.parse(row.value);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { enabled: env.WEATHER_PROVIDER_ENABLED === 'true', defaultUnits: 'IMPERIAL', refreshIntervalSeconds: CACHE_TTL_SECONDS };
    const value = settings as Record<string, unknown>;
    return {
      enabled: env.WEATHER_PROVIDER_ENABLED === 'true' || value.enabled === true,
      defaultUnits: value.defaultUnits === 'METRIC' ? 'METRIC' : 'IMPERIAL',
      refreshIntervalSeconds: Number.isInteger(value.refreshIntervalSeconds) && Number(value.refreshIntervalSeconds) >= CACHE_TTL_SECONDS && Number(value.refreshIntervalSeconds) <= 86_400
        ? Number(value.refreshIntervalSeconds) : CACHE_TTL_SECONDS,
    };
  } catch { return { enabled: env.WEATHER_PROVIDER_ENABLED === 'true', defaultUnits: 'IMPERIAL', refreshIntervalSeconds: CACHE_TTL_SECONDS }; }
}

function cachedWeather(entry: WeatherCacheEntry): GoogleWeatherResult {
  const now = Date.now();
  return {
    data: entry.data,
    providerStatus: 'cached',
    fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
    cacheAgeSeconds: Math.max(0, Math.floor((now - entry.fetchedAtMs) / 1000)),
  };
}

async function readWeatherCache(cache: KVNamespace, key: string): Promise<WeatherCacheEntry | null> {
  const cached = await cache.get(key);
  if (!cached) return null;
  if (cached.length > 64_000) throw new Error('Weather cache entry exceeds the size limit.');
  const parsed: unknown = JSON.parse(cached);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Weather cache entry is invalid.');
  const entry = parsed as { data?: unknown; fetchedAtMs?: unknown };
  const now = Date.now();
  if (!entry.data || typeof entry.data !== 'object' || Array.isArray(entry.data) ||
      typeof entry.fetchedAtMs !== 'number' || !Number.isSafeInteger(entry.fetchedAtMs) ||
      entry.fetchedAtMs <= 0 || entry.fetchedAtMs > now) {
    throw new Error('Weather cache entry is invalid.');
  }
  return { data: entry.data as Record<string, unknown>, fetchedAtMs: entry.fetchedAtMs };
}

function staleWeatherOr(status: 'provider_required' | 'provider_unavailable', stale: WeatherCacheEntry | null): GoogleWeatherResult {
  return stale ? cachedWeather(stale) : { data: null, providerStatus: status };
}

/** Returns only provider data. Location labels and user/company identifiers never enter shared cache values. */
export async function readGoogleWeather(
  env: WeatherProviderEnv,
  latitude: number,
  longitude: number,
  unitsSystem?: 'IMPERIAL' | 'METRIC',
  forceRefresh = false,
): Promise<GoogleWeatherResult> {
  const configuration = await readWeatherConfiguration(env);
  const selectedUnitsSystem = unitsSystem || configuration.defaultUnits;
  // Keep this trust boundary defensive even when callers validate coordinates.
  // Invalid values must not become cache keys or provider requests.
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (selectedUnitsSystem !== 'IMPERIAL' && selectedUnitsSystem !== 'METRIC')) {
    return { data: null, providerStatus: 'provider_unavailable' };
  }
  if (!forceRefresh && !configuration.enabled) return { data: null, providerStatus: 'provider_required' };
  const cache = env.SOCIAL_CACHE;
  if (!cache) return { data: null, providerStatus: 'cache_unavailable' };

  const coordinates = `${latitude.toFixed(5)},${longitude.toFixed(5)},${selectedUnitsSystem}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(coordinates));
  const digestHex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const cacheKey = `weather:google:v2:${digestHex}`;
  const staleCacheKey = `weather:google:v2-stale:${digestHex}`;
  let staleEntry: WeatherCacheEntry | null = null;

  try {
    if (!forceRefresh) {
      const cached = await readWeatherCache(cache, cacheKey);
      if (cached) return cachedWeather(cached);
    }
    staleEntry = await readWeatherCache(cache, staleCacheKey);
  } catch {
    // Without a trustworthy cache read, fail closed to avoid an uncontrolled paid refresh.
    return { data: null, providerStatus: 'cache_unavailable' };
  }

  const existingRequest = inFlightWeather.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchAndCacheWeather(
    env,
    latitude,
    longitude,
    selectedUnitsSystem,
    cacheKey,
    staleCacheKey,
    cache,
    configuration.refreshIntervalSeconds,
    staleEntry,
  );
  inFlightWeather.set(cacheKey, request);
  try { return await request; }
  finally {
    if (inFlightWeather.get(cacheKey) === request) inFlightWeather.delete(cacheKey);
  }
}

async function fetchAndCacheWeather(
  env: WeatherProviderEnv,
  latitude: number,
  longitude: number,
  unitsSystem: 'IMPERIAL' | 'METRIC',
  cacheKey: string,
  staleCacheKey: string,
  cache: KVNamespace,
  cacheTtlSeconds: number,
  staleEntry: WeatherCacheEntry | null,
): Promise<GoogleWeatherResult> {
  let key: string;
  try { key = await resolveMetaCredential(env, 'google_weather_api_key'); }
  catch { return staleWeatherOr('provider_unavailable', staleEntry); }
  if (!key) return staleWeatherOr('provider_required', staleEntry);

  const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
  url.searchParams.set('location.latitude', String(latitude));
  url.searchParams.set('location.longitude', String(longitude));
  url.searchParams.set('unitsSystem', unitsSystem);
  try {
    const response = await fetch(url.toString(), {
      headers: { 'X-Goog-Api-Key': key },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) return staleWeatherOr('provider_unavailable', staleEntry);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return staleWeatherOr('provider_unavailable', staleEntry);
    const fetchedAtMs = Date.now();
    const value = JSON.stringify({ data, fetchedAtMs });
    if (value.length > 64_000) return staleWeatherOr('provider_unavailable', staleEntry);
    try {
      await Promise.all([
        cache.put(cacheKey, value, { expirationTtl: cacheTtlSeconds }),
        cache.put(staleCacheKey, value, { expirationTtl: STALE_CACHE_TTL_SECONDS }),
      ]);
    } catch {
      return staleWeatherOr('provider_unavailable', staleEntry);
    }
    return {
      data: data as Record<string, unknown>,
      providerStatus: 'fresh',
      fetchedAt: new Date(fetchedAtMs).toISOString(),
      cacheAgeSeconds: 0,
    };
  } catch {
    return staleWeatherOr('provider_unavailable', staleEntry);
  }
}
