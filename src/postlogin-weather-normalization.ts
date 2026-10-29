/** Strict post-login boundary for non-production weather responses.
 * An HTTP 200 or a provider status alone must not paint a live reading.
 */
export type WeatherContext = {
  available: boolean;
  provider?: string;
  providerStatus?: string;
  fetchedAt?: string;
  location?: string;
  temperature?: number | null;
  apparentTemperature?: number | null;
  humidity?: number | null;
  description?: string;
  windSpeed?: number | null;
  precipitationProbability?: number | null;
  isDay?: boolean | null;
};

const unavailable = (): WeatherContext => ({ available: false, providerStatus: 'provider_unavailable' });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, limit: number): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= limit ? value.trim() : undefined;
const bounded = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;

/** Neither malformed server JSON nor out-of-range values can create a false
 * "connected" state. Optional readings with bad units are simply omitted.
 */
export function normalizePostLoginWeather(payload: unknown): WeatherContext {
  if (!record(payload) || payload.available !== true || payload.unitsSystem !== 'METRIC') return unavailable();
  const temperature = bounded(payload.temperature, -90, 70);
  if (temperature === null) return unavailable();
  const fetchedAt = text(payload.fetchedAt, 64);
  const validFetchedAt = fetchedAt && Number.isFinite(Date.parse(fetchedAt)) ? fetchedAt : undefined;
  return {
    available: true,
    provider: text(payload.provider, 90) ?? 'Weather service',
    providerStatus: text(payload.providerStatus, 64),
    fetchedAt: validFetchedAt,
    location: text(payload.location, 120),
    temperature,
    apparentTemperature: bounded(payload.apparentTemperature, -120, 85),
    humidity: bounded(payload.humidity, 0, 100),
    windSpeed: bounded(payload.windSpeed, 0, 500),
    precipitationProbability: bounded(payload.precipitationProbability, 0, 100),
    isDay: typeof payload.isDay === 'boolean' ? payload.isDay : null,
    description: text(payload.description, 180) ?? 'Current conditions',
  };
}
