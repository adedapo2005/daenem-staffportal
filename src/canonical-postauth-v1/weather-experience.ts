/**
 * Shared Staff Portal weather truth/visual normalization.
 *
 * This module deliberately normalizes provider copy without inventing a
 * condition. Unknown and unavailable values remain neutral states.
 */
export type WeatherCondition =
  | 'CLEAR_DAY'
  | 'CLEAR_NIGHT'
  | 'PARTLY_CLOUDY_DAY'
  | 'PARTLY_CLOUDY_NIGHT'
  | 'CLOUDY'
  | 'OVERCAST'
  | 'DRIZZLE'
  | 'LIGHT_RAIN'
  | 'RAIN'
  | 'HEAVY_RAIN'
  | 'THUNDERSTORM'
  | 'SNOW'
  | 'FOG'
  | 'MIST'
  | 'WINDY'
  | 'UNKNOWN'
  | 'UNAVAILABLE';

export type WeatherIconKind =
  | 'sunny'
  | 'night'
  | 'partly-cloudy'
  | 'cloudy'
  | 'overcast'
  | 'light-rain'
  | 'rain'
  | 'heavy-rain'
  | 'thunderstorm'
  | 'snow'
  | 'fog'
  | 'wind'
  | 'unknown'
  | 'unavailable';

const clean = (value?: string | null) => (value ?? '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');

const isNight = (value: string) => value.includes('night') || value.includes('clear evening') || value.includes('evening');
const isUnavailable = (value: string) => ['unavailable', 'not available', 'n/a', 'na', 'missing', 'provider error', 'offline'].includes(value);
const isUnknown = (value: string) => !value || ['unknown', 'unclear', 'invalid', 'unsupported'].includes(value);

export function normalizeWeatherCondition(value?: string | null): WeatherCondition {
  const normalized = clean(value);
  if (isUnavailable(normalized)) return 'UNAVAILABLE';
  if (isUnknown(normalized)) return 'UNKNOWN';
  if (normalized.includes('thunder') || normalized.includes('storm')) return 'THUNDERSTORM';
  if (normalized.includes('heavy rain') || normalized.includes('heavy shower')) return 'HEAVY_RAIN';
  if (normalized.includes('drizzle') || normalized.includes('light rain') || normalized.includes('light shower')) return 'DRIZZLE';
  if (normalized === 'rain' || normalized.includes(' rain') || normalized.includes('shower')) return 'RAIN';
  if (normalized.includes('snow') || normalized.includes('sleet')) return 'SNOW';
  if (normalized.includes('fog')) return 'FOG';
  if (normalized.includes('mist')) return 'MIST';
  if (normalized.includes('wind')) return 'WINDY';
  if (normalized.includes('partly cloudy') || normalized.includes('partly cloud')) return isNight(normalized) ? 'PARTLY_CLOUDY_NIGHT' : 'PARTLY_CLOUDY_DAY';
  if (normalized.includes('overcast')) return 'OVERCAST';
  if (normalized.includes('cloud') || normalized === 'cloudy') return 'CLOUDY';
  if (normalized.includes('clear') || normalized.includes('sunny')) return isNight(normalized) ? 'CLEAR_NIGHT' : 'CLEAR_DAY';
  return 'UNKNOWN';
}

export function weatherIconKind(condition: WeatherCondition): WeatherIconKind {
  switch (condition) {
    case 'CLEAR_NIGHT': return 'night';
    case 'PARTLY_CLOUDY_DAY':
    case 'PARTLY_CLOUDY_NIGHT': return 'partly-cloudy';
    case 'CLOUDY': return 'cloudy';
    case 'OVERCAST': return 'overcast';
    case 'DRIZZLE':
    case 'LIGHT_RAIN': return 'light-rain';
    case 'RAIN': return 'rain';
    case 'HEAVY_RAIN': return 'heavy-rain';
    case 'THUNDERSTORM': return 'thunderstorm';
    case 'SNOW': return 'snow';
    case 'FOG':
    case 'MIST': return 'fog';
    case 'WINDY': return 'wind';
    case 'UNKNOWN': return 'unknown';
    case 'UNAVAILABLE': return 'unavailable';
    case 'CLEAR_DAY': return 'sunny';
  }
}

export function weatherConditionLabel(condition: WeatherCondition): string {
  switch (condition) {
    case 'CLEAR_DAY': return 'Clear day';
    case 'CLEAR_NIGHT': return 'Clear night';
    case 'PARTLY_CLOUDY_DAY': return 'Partly cloudy day';
    case 'PARTLY_CLOUDY_NIGHT': return 'Partly cloudy night';
    case 'CLOUDY': return 'Cloudy';
    case 'OVERCAST': return 'Overcast';
    case 'DRIZZLE':
    case 'LIGHT_RAIN': return 'Light rain';
    case 'RAIN': return 'Rain';
    case 'HEAVY_RAIN': return 'Heavy rain';
    case 'THUNDERSTORM': return 'Thunderstorm';
    case 'SNOW': return 'Snow';
    case 'FOG': return 'Fog';
    case 'MIST': return 'Mist';
    case 'WINDY': return 'Windy';
    case 'UNAVAILABLE': return 'Weather unavailable';
    case 'UNKNOWN': return 'Weather condition unknown';
  }
}

export function weatherMotionEnabled(condition: WeatherCondition): boolean {
  return condition !== 'UNKNOWN' && condition !== 'UNAVAILABLE';
}


export type WeatherTruthState = 'READY' | 'UNKNOWN' | 'UNAVAILABLE';

export function normalizeWeatherTruthState(value?: string | null): WeatherTruthState {
  const condition = normalizeWeatherCondition(value);
  if (condition === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (condition === 'UNKNOWN') return 'UNKNOWN';
  return 'READY';
}

export function resolveWeatherVisualState(
  value?: string | null,
  truthState?: WeatherTruthState,
): { condition: WeatherCondition; state: WeatherTruthState } {
  const condition = normalizeWeatherCondition(value);
  const state = truthState ?? normalizeWeatherTruthState(value);
  if (state === 'UNAVAILABLE') return { condition: 'UNAVAILABLE', state };
  if (state === 'UNKNOWN') return { condition: 'UNKNOWN', state };
  return { condition, state: 'READY' };
}
