import assert from 'node:assert/strict';

const normalize = (value) => {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
  if (['unavailable', 'not available', 'n/a', 'na', 'missing', 'provider error', 'offline'].includes(normalized)) return 'UNAVAILABLE';
  if (!normalized || ['unknown', 'unclear', 'invalid', 'unsupported'].includes(normalized)) return 'UNKNOWN';
  if (normalized.includes('thunder') || normalized.includes('storm')) return 'THUNDERSTORM';
  if (normalized.includes('heavy rain') || normalized.includes('heavy shower')) return 'HEAVY_RAIN';
  if (normalized.includes('drizzle') || normalized.includes('light rain') || normalized.includes('light shower')) return 'DRIZZLE';
  if (normalized === 'rain' || normalized.includes(' rain') || normalized.includes('shower')) return 'RAIN';
  if (normalized.includes('snow') || normalized.includes('sleet')) return 'SNOW';
  if (normalized.includes('fog')) return 'FOG';
  if (normalized.includes('mist')) return 'MIST';
  if (normalized.includes('wind')) return 'WINDY';
  if (normalized.includes('partly cloudy') || normalized.includes('partly cloud')) return normalized.includes('night') ? 'PARTLY_CLOUDY_NIGHT' : 'PARTLY_CLOUDY_DAY';
  if (normalized.includes('overcast')) return 'OVERCAST';
  if (normalized.includes('cloud') || normalized === 'cloudy') return 'CLOUDY';
  if (normalized.includes('clear') || normalized.includes('sunny')) return normalized.includes('night') ? 'CLEAR_NIGHT' : 'CLEAR_DAY';
  return 'UNKNOWN';
};

const cases = new Map([
  ['', 'UNKNOWN'], ['Unknown', 'UNKNOWN'], ['unsupported', 'UNKNOWN'], ['Not Available', 'UNAVAILABLE'], ['Offline', 'UNAVAILABLE'],
  ['Sunny', 'CLEAR_DAY'], ['Clear night', 'CLEAR_NIGHT'], ['Partly Cloudy', 'PARTLY_CLOUDY_DAY'], ['Partly cloudy night', 'PARTLY_CLOUDY_NIGHT'],
  ['Cloudy', 'CLOUDY'], ['Overcast', 'OVERCAST'], ['Drizzle', 'DRIZZLE'], ['Light rain', 'DRIZZLE'], ['Light showers', 'DRIZZLE'],
  ['Rain', 'RAIN'], ['Heavy rain', 'HEAVY_RAIN'], ['Thunderstorm', 'THUNDERSTORM'], ['Snow', 'SNOW'], ['Fog', 'FOG'], ['Mist', 'MIST'], ['Windy', 'WINDY'],
]);
for (const [input, expected] of cases) assert.equal(normalize(input), expected, `${input} should normalize to ${expected}`);
assert.notEqual(normalize(''), 'CLEAR_DAY');
assert.notEqual(normalize('Not Available'), 'CLEAR_DAY');
console.log(`PASS ${cases.size} deterministic weather normalization cases`);
