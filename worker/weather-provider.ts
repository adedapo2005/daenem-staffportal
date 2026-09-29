import { resolveMetaCredential, type MetaCredentialEnv } from './meta-credentials';

export interface WeatherProviderEnv extends MetaCredentialEnv {
  SOCIAL_CACHE?: KVNamespace;
}

const CACHE_TTL_SECONDS = 300;
const PROVIDER_TIMEOUT_MS = 8_000;
const inFlightWeather = new Map<string, Promise<GoogleWeatherResult>>();

export type GoogleWeatherResult =
  | { data: Record<string, unknown>; providerStatus: 'fresh' | 'cached' }
  | { data: null; providerStatus: 'cache_unavailable' | 'provider_required' | 'provider_unavailable' };

/** Returns only provider data. Location labels and user/company identifiers never enter shared cache values. */
export async function readGoogleWeather(
  env: WeatherProviderEnv,
  latitude: number,
  longitude: number,
  unitsSystem: 'IMPERIAL' | 'METRIC' = 'IMPERIAL',
  forceRefresh = false,
): Promise<GoogleWeatherResult> {
  // Keep this trust boundary defensive even when callers validate coordinates.
  // Invalid values must not become cache keys or provider requests.
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (unitsSystem !== 'IMPERIAL' && unitsSystem !== 'METRIC')) {
    return { data: null, providerStatus: 'provider_unavailable' };
  }
  const cache = env.SOCIAL_CACHE;
  if (!cache) return { data: null, providerStatus: 'cache_unavailable' };

  const coordinates = `${latitude.toFixed(5)},${longitude.toFixed(5)},${unitsSystem}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(coordinates));
  const digestHex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const cacheKey = `weather:google:v1:${digestHex}`;

  if (!forceRefresh) {
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { data: null, providerStatus: 'cache_unavailable' };
        return { data: parsed as Record<string, unknown>, providerStatus: 'cached' };
      }
    } catch {
      // Without a trustworthy cache read, fail closed to avoid an uncontrolled paid refresh.
      return { data: null, providerStatus: 'cache_unavailable' };
    }
  }

  const existingRequest = inFlightWeather.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = fetchAndCacheWeather(env, latitude, longitude, unitsSystem, cacheKey, cache);
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
  cache: KVNamespace,
): Promise<GoogleWeatherResult> {
  let key: string;
  try { key = await resolveMetaCredential(env, 'google_weather_api_key'); }
  catch { return { data: null, providerStatus: 'provider_unavailable' }; }
  if (!key) return { data: null, providerStatus: 'provider_required' };

  const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
  url.searchParams.set('location.latitude', String(latitude));
  url.searchParams.set('location.longitude', String(longitude));
  url.searchParams.set('unitsSystem', unitsSystem);
  try {
    const response = await fetch(url.toString(), {
      headers: { 'X-Goog-Api-Key': key },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!response.ok) return { data: null, providerStatus: 'provider_unavailable' };
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { data: null, providerStatus: 'provider_unavailable' };
    const value = JSON.stringify(data);
    if (value.length > 64_000) return { data: null, providerStatus: 'provider_unavailable' };
    try { await cache.put(cacheKey, value, { expirationTtl: CACHE_TTL_SECONDS }); }
    catch { return { data: null, providerStatus: 'provider_unavailable' }; }
    return { data: data as Record<string, unknown>, providerStatus: 'fresh' };
  } catch {
    return { data: null, providerStatus: 'provider_unavailable' };
  }
}
