import { forwardRef, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeId } from './theme-system';
import { connectSignInWidgets } from './signin-widgets';
import { connectSignInWeatherMotion, hydrateSignInWeatherVisual } from './signin-weather-visuals';
import approvedSignInMarkup from './approved-signin-v180/reference-v180.html?raw';

// Presentation is copied from the approved Sites V180 source; runtime code only wires live data and real authentication into it.
const APPROVED_SIGNIN = Object.freeze({
  project: 'appgprj_6abbab3d45848191b6344993cc010bd7',
  version: 180,
  commit: '523474f7b839919c258da85be6fcf53edd38810d',
});

const cityZones: Record<string, string> = {
  toronto: 'America/Toronto',
  london: 'Europe/London',
  newyork: 'America/New_York',
  moscow: 'Europe/Moscow',
  tokyo: 'Asia/Tokyo',
  beijing: 'Asia/Shanghai',
  ibadan: 'Africa/Lagos',
};

const cityMedia: Record<string, Partial<Record<'dawn' | 'day' | 'dusk' | 'night', string>>> = {
  toronto: {
    day: '/assets/global/toronto-day-v110.jpg',
    night: '/assets/global/toronto-night-approved-v180.png',
  },
  london: {
    day: '/assets/global/london-day-v110.jpg',
    night: '/assets/global/london-day-v110.jpg',
  },
  newyork: {
    dawn: '/assets/global/newyork-dawn-v179-4k.webp',
    day: '/assets/global/newyork-day-v179-4k.webp',
    dusk: '/assets/global/newyork-dusk-v179-4k.webp',
    night: '/assets/global/newyork-night-v179-4k.webp',
  },
  moscow: {
    day: '/assets/global/moscow-day-v110.jpg',
    night: '/assets/global/moscow-night-approved-v180.png',
  },
  tokyo: { day: '/assets/global/tokyo-day-v110.jpg' },
  beijing: {
    day: '/assets/global/beijing-day-v110.jpg',
    night: '/assets/global/beijing-night-v109.jpg',
  },
  ibadan: {
    day: '/assets/staffportal-weather/ibadan-day-v125-card.webp',
    night: '/assets/staffportal-weather/ibadan-night-v125.png',
  },
};

const phaseIcons: Record<'dawn' | 'day' | 'dusk' | 'night', { className: string; paths: string }> = {
  dawn: {
    className: 'lucide lucide-sunrise h-3 w-3',
    paths: '<path d="M12 2v8"></path><path d="m4.93 10.93 1.41 1.41"></path><path d="M2 18h2"></path><path d="M20 18h2"></path><path d="m19.07 10.93-1.41 1.41"></path><path d="M22 22H2"></path><path d="m8 6 4-4 4 4"></path><path d="M16 18a4 4 0 0 0-8 0"></path>',
  },
  day: {
    className: 'lucide lucide-sun h-3 w-3',
    paths: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path>',
  },
  dusk: {
    className: 'lucide lucide-sunset h-3 w-3',
    paths: '<path d="M12 10V2"></path><path d="m4.93 10.93 1.41 1.41"></path><path d="M2 18h2"></path><path d="M20 18h2"></path><path d="m19.07 10.93-1.41 1.41"></path><path d="M22 22H2"></path><path d="m16 6-4 4-4-4"></path><path d="M16 18a4 4 0 0 0-8 0"></path>',
  },
  night: {
    className: 'lucide lucide-moon h-3 w-3',
    paths: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path>',
  },
};


type SignInWeatherPayload = {
  available: true;
  provider: string;
  providerStatus: 'fresh' | 'cached';
  fetchedAt: string;
  observedAt: string | null;
  cacheAgeSeconds: number;
  unitsSystem: 'IMPERIAL' | 'METRIC';
  location: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  recentHigh: number | null;
  recentLow: number | null;
  description: string;
  isDay: boolean | null;
};

const SIGNIN_WEATHER_CACHE_KEY = 'daenem:staffportal:signin-weather:ibadan:v1';
const SIGNIN_WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SIGNIN_WEATHER_REFRESH_MS = 5 * 60 * 1000;
const SIGNIN_LAYOUT_STABILITY_CSS = `
@media (min-width: 721px) {
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 {
    grid-template-columns: minmax(0, var(--sp-weather-column-fr, 16fr)) minmax(0, var(--sp-auth-column-fr, 20fr)) !important;
    grid-template-areas: "weather auth" !important;
  }
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-create,
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-forgot {
    grid-area: auth !important;
    position: relative !important; inset: auto !important; transform: none !important;
    align-self: stretch !important;
    width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    height: 100% !important; min-height: 0 !important; max-height: 100% !important;
    margin: 0 !important; z-index: auto !important;
  }
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staff-local-weather {
    display: grid !important; grid-area: weather !important; align-self: stretch !important;
    width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    height: 100% !important; min-height: 0 !important; max-height: 100% !important;
  }
}
@media (max-width: 720px) {
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 {
    grid-template-columns: minmax(0, 1fr) !important;
    grid-template-rows: minmax(680px, auto) minmax(410px, auto) !important;
    grid-template-areas: "auth" "weather" !important;
    gap: 10px !important;
  }
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-create,
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-forgot {
    grid-area: auth !important;
    position: relative !important; inset: auto !important; transform: none !important;
    align-self: stretch !important;
    width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    height: 680px !important; min-height: 680px !important; max-height: 680px !important;
    margin: 0 !important; z-index: auto !important;
  }
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staff-local-weather {
    display: grid !important; grid-area: weather !important; align-self: stretch !important;
    width: 100% !important; max-width: 100% !important; min-width: 0 !important;
    height: 410px !important; min-height: 410px !important; max-height: 410px !important;
  }
}
@media (max-width: 520px) {
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 { min-height: 1100px !important; }
}
@media (min-width: 521px) and (max-width: 720px) {
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 {
    grid-template-rows: minmax(697px, auto) minmax(410px, auto) !important;
    min-height: 1117px !important;
  }
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-create,
  #root .sp-root .sp-reference-layout > .sp-lower-right-rail-v86 > #staffportal-auth-mount.sp-auth-mode-forgot {
    height: 697px !important; min-height: 697px !important; max-height: 697px !important;
  }
}
@media (min-width: 1024px) and (max-width: 1919px) {
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-city-weather {
    position: absolute !important; top: auto !important;
    left: calc(clamp(74px, 5.3vw, 84px) + 18px) !important; right: 8px !important;
    bottom: 48px !important; width: auto !important; height: 27px !important;
    margin: 0 !important; padding: 0 !important; display: flex !important;
    align-items: center !important; justify-content: flex-start !important; gap: 4px !important;
    overflow: hidden !important; z-index: 7 !important;
  }
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-visual {
    position: relative !important; left: 0 !important; top: 0 !important;
    flex: 0 0 22px !important; width: 22px !important; height: 22px !important;
  }
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-values {
    display: flex !important; flex: 1 1 auto !important; flex-direction: column !important;
    justify-content: center !important; align-items: flex-start !important;
    min-width: 0 !important; max-width: none !important; gap: 1px !important;
  }
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-readings { display: none !important; }
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-condition {
    display: block !important; max-width: 100% !important; overflow: hidden !important;
    text-overflow: ellipsis !important; white-space: nowrap !important;
    font-size: clamp(9px, .65vw, 12px) !important; line-height: 1.08 !important; font-weight: 750 !important;
  }
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-freshness {
    display: block !important; max-width: 100% !important; overflow: hidden !important;
    text-overflow: ellipsis !important; white-space: nowrap !important;
    font-size: clamp(8px, .52vw, 10px) !important; line-height: 1.05 !important;
  }
  #root .sp-root #staff-local-weather .sp-live-weather-saved { display: none !important; }
  @container global-weather-card (max-width: 260px) {
    #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-weather-freshness { display: none !important; }
    #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-city-weather { left: 68px !important; right: 5px !important; gap: 3px !important; }
  }
}
@media (min-width: 1024px) and (max-width: 1279px) {
  #root .sp-root #staff-global-operations article.sp-live-weather-city .sp-live-city-weather { top: 65px !important; bottom: auto !important; }
}
`;

const SIGNIN_REQUEST_TIMEOUT_MS = 15_000;

function weatherCacheKey(cityId: string) {
  return cityId === 'ibadan' ? SIGNIN_WEATHER_CACHE_KEY : `daenem:staffportal:signin-weather:${cityId}:v1`;
}

function optionalWeatherNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeWeatherCondition(value: unknown) {
  if (typeof value !== 'string') return 'Condition unavailable';
  const condition = value.replace(/^(?:saved|cached)(?:\s*·\s*|\s+)/i, '').trim().replace(/\s+/g, ' ');
  if (!condition || /^(unknown|unavailable|unclear|current conditions|weather unavailable|not available)$/i.test(condition)) {
    return 'Condition unavailable';
  }
  return condition[0].toLocaleUpperCase() + condition.slice(1);
}

function normalizeSignInWeather(value: unknown): SignInWeatherPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.available !== true ||
      (candidate.providerStatus !== 'fresh' && candidate.providerStatus !== 'cached') ||
      typeof candidate.fetchedAt !== 'string' || !Number.isFinite(Date.parse(candidate.fetchedAt))) return null;
  const age = Date.now() - Date.parse(candidate.fetchedAt);
  if (age < -60_000 || age > SIGNIN_WEATHER_CACHE_MAX_AGE_MS) return null;
  if (candidate.unitsSystem !== 'IMPERIAL' && candidate.unitsSystem !== 'METRIC') return null;
  const recent = candidate.today && typeof candidate.today === 'object' ? candidate.today as Record<string, unknown> : {};
  return {
    available: true,
    provider: typeof candidate.provider === 'string' && candidate.provider.trim() ? candidate.provider.trim() : 'Google Weather',
    providerStatus: candidate.providerStatus,
    fetchedAt: candidate.fetchedAt,
    observedAt: typeof candidate.observedAt === 'string' && Number.isFinite(Date.parse(candidate.observedAt)) ? candidate.observedAt : null,
    cacheAgeSeconds: Math.max(0, optionalWeatherNumber(candidate.cacheAgeSeconds) || 0),
    unitsSystem: candidate.unitsSystem === 'IMPERIAL' ? 'IMPERIAL' : 'METRIC',
    location: typeof candidate.location === 'string' && candidate.location.trim() ? candidate.location.trim() : 'Ibadan',
    temperature: optionalWeatherNumber(candidate.temperature),
    apparentTemperature: optionalWeatherNumber(candidate.apparentTemperature),
    humidity: optionalWeatherNumber(candidate.humidity),
    precipitationProbability: optionalWeatherNumber(candidate.precipitationProbability),
    windSpeed: optionalWeatherNumber(candidate.windSpeed),
    windDirection: optionalWeatherNumber(candidate.windDirection),
    windGust: optionalWeatherNumber(candidate.windGust),
    recentHigh: optionalWeatherNumber(candidate.recentHigh ?? recent.high),
    recentLow: optionalWeatherNumber(candidate.recentLow ?? recent.low),
    isDay: typeof candidate.isDay === 'boolean' ? candidate.isDay : null,
    description: normalizeWeatherCondition(candidate.description),
  };
}

function weatherMatchesCity(payload: SignInWeatherPayload, cityId: string) {
  return payload.location.split(',')[0].replace(/\s+/g, '').toLowerCase() === cityId;
}

function readCachedSignInWeather(cityId = 'ibadan') {
  try {
    const raw = window.localStorage.getItem(weatherCacheKey(cityId));
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const record = stored as { savedAt?: unknown; payload?: unknown };
    if (typeof record.savedAt !== 'number' || !Number.isSafeInteger(record.savedAt) || record.savedAt <= 0) return null;
    const payload = normalizeSignInWeather(record.payload);
    if (!payload || !weatherMatchesCity(payload, cityId) || Date.now() - Date.parse(payload.fetchedAt) > SIGNIN_WEATHER_CACHE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeCachedSignInWeather(payload: SignInWeatherPayload, cityId = 'ibadan') {
  try {
    window.localStorage.setItem(weatherCacheKey(cityId), JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // The live response remains usable when browser storage is unavailable.
  }
}

function setTrailingText(element: HTMLElement | null, value: string) {
  if (!element) return;
  const textNodes = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
  const textNode = textNodes[textNodes.length - 1];
  textNodes.forEach((node) => { node.textContent = ''; });
  if (textNode) textNode.textContent = ` ${value}`;
  else element.insertAdjacentText('beforeend', ` ${value}`);
}

function weatherFreshness(payload: SignInWeatherPayload) {
  const fetchedAge = Math.max(0, Math.floor((Date.now() - Date.parse(payload.fetchedAt)) / 1000));
  const observedAge = payload.observedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(payload.observedAt)) / 1000)) : 0;
  const ageSeconds = Math.max(payload.cacheAgeSeconds, fetchedAge, observedAge);
  if (ageSeconds < 60) return 'Updated just now';
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`;
}

function prepareWeatherCards(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('article[data-city-id]').forEach((card) => {
    const instrument = card.querySelector<HTMLElement>('.gw-city-instrument');
    const summary = instrument?.nextElementSibling;
    if (!(summary instanceof HTMLElement)) return;
    card.classList.add('sp-live-weather-city');
    instrument?.parentElement?.classList.add('sp-live-city-content');
    summary.classList.add('sp-live-city-weather');
    summary.dataset.signinWeatherSummary = card.dataset.cityId;
    summary.setAttribute('aria-live', card.dataset.cityId === 'ibadan' ? 'polite' : 'off');
    summary.setAttribute('aria-atomic', 'true');
  });
}

function weatherText(tag: string, className: string, text: string) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function applyCityWeather(root: HTMLElement, cityId: string, payload: SignInWeatherPayload, saved = false) {
  const card = root.querySelector<HTMLElement>(`article[data-city-id="${cityId}"]`);
  const summary = card?.querySelector<HTMLElement>('[data-signin-weather-summary]');
  if (!card || !summary) return;
  saved ||= Math.max(payload.cacheAgeSeconds * 1000, Date.now() - Date.parse(payload.fetchedAt)) > SIGNIN_WEATHER_REFRESH_MS;
  const cached = saved || payload.providerStatus === 'cached';
  const unit = payload.unitsSystem === 'IMPERIAL' ? '°F' : '°C';
  const condition = normalizeWeatherCondition(payload.description);
  const values = weatherText('span', 'sp-live-weather-values', '');
  values.appendChild(weatherText('span', 'sp-live-weather-condition', condition));
  const freshness = cached ? `Cached · ${weatherFreshness(payload)}` : '';
  if (freshness) values.appendChild(weatherText('span', 'sp-live-weather-freshness', freshness));
  const summaryText = freshness ? `${condition} · ${freshness}` : condition;
  if (summary.dataset.weatherText !== summaryText) {
    const existing = summary.querySelector('.sp-live-weather-values');
    if (existing) existing.replaceWith(values); else summary.replaceChildren(values);
    summary.dataset.weatherText = summaryText;
    summary.setAttribute('aria-label', summaryText);
  }

  if (cityId !== 'ibadan') {
    let detail = card.querySelector<HTMLElement>('.sp-global-weather-details');
    if (!detail) {
      detail = weatherText('dl', 'sp-global-weather-details', '');
      summary.parentElement?.appendChild(detail);
    }
    const speedUnit = payload.unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';
    const metrics: Array<[string, string, string]> = [
      ['Temperature', payload.temperature === null ? '—' : Math.round(payload.temperature) + unit, 'temp'],
      ['Feels like', payload.apparentTemperature === null ? '—' : Math.round(payload.apparentTemperature) + unit, 'feels'],
      ['Humidity', payload.humidity === null ? '—' : Math.round(payload.humidity) + '%', 'humidity'],
      ['Rain chance', payload.precipitationProbability === null ? '—' : Math.round(payload.precipitationProbability) + '%', 'rain'],
      ['Wind', payload.windSpeed === null ? '—' : Math.round(payload.windSpeed) + ' ' + speedUnit, 'wind'],
      ['Gusts', payload.windGust === null ? '—' : Math.round(payload.windGust) + ' ' + speedUnit, 'gusts'],
    ];
    const fingerprint = JSON.stringify(metrics);
    if (detail.dataset.metricsFingerprint !== fingerprint) {
      const rows = metrics.map(([label, value, key]) => {
        const row = weatherText('div', 'sp-global-weather-metric', '');
        row.dataset.metric = key;
        row.appendChild(weatherText('dt', '', label));
        row.appendChild(weatherText('dd', '', value));
        return row;
      });
      detail.replaceChildren(...rows);
      detail.dataset.metricsFingerprint = fingerprint;
      detail.setAttribute('aria-label', metrics.map(([label, value]) => label + ': ' + value).join(', '));
    }
    detail.dataset.cached = cached ? 'true' : 'false';
  }
  card.dataset.weatherDaylight = payload.isDay === null ? '' : String(payload.isDay);
  summary.title = `${payload.provider} · ${cached ? 'Cached' : 'Live'} · ${weatherFreshness(payload)}`;
  card.dataset.weather = cached ? 'cached' : 'available';
  card.dataset.weatherCondition = condition;
  hydrateSignInWeatherVisual(card);
}

function applySignInWeather(root: HTMLElement, payload: SignInWeatherPayload, browserCached = false, refreshFailed = false) {
  browserCached ||= Math.max(payload.cacheAgeSeconds * 1000, Date.now() - Date.parse(payload.fetchedAt)) > SIGNIN_WEATHER_REFRESH_MS;
  applyCityWeather(root, 'ibadan', payload, browserCached);
  const unit = payload.unitsSystem === 'IMPERIAL' ? '°F' : '°C';
  const speedUnit = payload.unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';
  const measure = (value: number | null, suffix: string) => value === null ? '—' : `${Math.round(value)}${suffix}`;
  const direction = payload.windDirection === null ? '' : ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(payload.windDirection / 22.5) % 16];
  const cached = browserCached || payload.providerStatus === 'cached';
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-live-label'), browserCached ? 'CACHED WEATHER' : 'CURRENT WEATHER');
  const heading = root.querySelector<HTMLElement>('.sp-weather-v145-intelligence-header b');
  if (heading) heading.textContent = 'Ibadan conditions';
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-provider'), `${payload.provider} · ${cached ? 'Cached' : 'Live'}`);
  const intelligence = root.querySelector<HTMLElement>('.sp-weather-v145-intelligence-body');
  if (intelligence) {
    const metrics = weatherText('dl', 'sp-weather-v145-metrics sp-live-weather-metrics', '');
    const entries = [
      ['Temperature', measure(payload.temperature, unit)],
      ['Feels like', measure(payload.apparentTemperature, unit)],
      ['Humidity', measure(payload.humidity, '%')],
      ['Rain chance', measure(payload.precipitationProbability, '%')],
      ['Wind', measure(payload.windSpeed, ` ${speedUnit}`)],
      ['Gusts', measure(payload.windGust, ` ${speedUnit}`)],
    ];
    for (const [label, value] of entries) {
      const metric = weatherText('div', 'sp-weather-v145-metric sp-live-weather-metric', '');
      metric.dataset.weatherMetric = label.toLowerCase().replace(/ /g, '-');
      metric.appendChild(weatherText('dt', '', label === 'Wind' && direction ? `Wind · ${direction}` : label));
      const reading = weatherText('dd', '', value);
      if (value === '—') reading.setAttribute('aria-label', 'Unavailable');
      metric.appendChild(reading);
      metrics.appendChild(metric);
    }
    // This endpoint exposes current-condition history, not a multi-day forecast.
    const recent = weatherText('p', 'sp-live-weather-range', '');
    if (payload.recentHigh !== null || payload.recentLow !== null) {
      recent.appendChild(weatherText('span', '', 'Recent high / low'));
      recent.appendChild(weatherText('b', '', `${measure(payload.recentHigh, unit)} / ${measure(payload.recentLow, unit)}`));
    }
    intelligence.classList.add('sp-live-weather-details');
    intelligence.replaceChildren(metrics, ...(recent.hasChildNodes() ? [recent] : []));
  }
  const footerItems = root.querySelectorAll<HTMLElement>('.sp-weather-v145-footer > span');
  setTrailingText(footerItems[0] || null, payload.provider);
  if (footerItems[1]) footerItems[1].textContent = `${weatherFreshness(payload)}${refreshFailed ? ' · Refresh unavailable' : ''}`;
  const statusItem = [...root.querySelectorAll<HTMLElement>('.sp-status-rail > span')]
    .find((item) => item.querySelector('b')?.textContent?.trim() === 'Weather Data');
  const statusIndicator = statusItem?.querySelector<HTMLElement>('i') || null;
  if (statusIndicator) statusIndicator.className = refreshFailed ? 'is-warn' : 'is-good';
  setTrailingText(statusItem || null, refreshFailed ? 'Cached update' : cached ? 'Cached' : 'Live');
}

function applyUnavailableSignInWeather(root: HTMLElement, cityId = 'ibadan') {
  const card = root.querySelector<HTMLElement>(`article[data-city-id="${cityId}"]`);
  const summary = card?.querySelector<HTMLElement>('[data-signin-weather-summary]');
  if (summary) {
    summary.textContent = 'Weather temporarily unavailable';
    summary.title = '';
    delete summary.dataset.weatherText;
    summary.setAttribute('aria-label', 'Weather temporarily unavailable');
  }
  if (card) { card.querySelector('.sp-global-weather-details')?.remove(); card.dataset.weather = 'unavailable'; card.dataset.weatherCondition = 'Unavailable'; hydrateSignInWeatherVisual(card); }
  if (cityId !== 'ibadan') return;
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-live-label'), 'WEATHER UPDATE');
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-provider'), 'Weather data unavailable');
  const intelligence = root.querySelector<HTMLElement>('.sp-weather-v145-intelligence-body');
  if (intelligence) intelligence.replaceChildren(weatherText('p', 'sp-live-weather-unavailable', 'Current conditions are temporarily unavailable. Updates resume automatically.'));
  const footerItems = root.querySelectorAll<HTMLElement>('.sp-weather-v145-footer > span');
  setTrailingText(footerItems[0] || null, 'Weather unavailable');
  if (footerItems[1]) footerItems[1].textContent = 'Waiting for next update';
  const statusItem = [...root.querySelectorAll<HTMLElement>('.sp-status-rail > span')]
    .find((item) => item.querySelector('b')?.textContent?.trim() === 'Weather Data');
  const indicator = statusItem?.querySelector<HTMLElement>('i');
  if (indicator) indicator.className = 'is-warn';
  setTrailingText(statusItem || null, 'Unavailable');
}

function phaseAt(now: Date, zone: string): 'dawn' | 'day' | 'dusk' | 'night' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

function resolvedMedia(cityId: string, phase: 'dawn' | 'day' | 'dusk' | 'night') {
  const media = cityMedia[cityId] || {};
  const order = phase === 'dawn' ? ['dawn', 'day', 'night'] as const : phase === 'dusk' ? ['dusk', 'night', 'day'] as const : phase === 'night' ? ['night', 'day'] as const : ['day', 'night'] as const;
  const mediaPhase = order.find((item) => media[item]);
  return mediaPhase ? { src: media[mediaPhase] || '', mediaPhase } : { src: '', mediaPhase: 'none' };
}

function settleReferenceMotion(root: HTMLElement) {
  const hero = root.querySelector<HTMLElement>('.sp-hero-content');
  if (!hero) return;
  [hero, ...hero.querySelectorAll<HTMLElement>('[style*="opacity:0"]')].forEach((element) => {
    element.style.opacity = '1';
    if (element.style.transform) element.style.transform = 'none';
    if (element.style.clipPath) element.style.clipPath = 'inset(0 0 0 0)';
  });
}

function updateCityPhase(card: HTMLElement, cityId: string, zone: string, now: Date) {
  const previousPhase = card.dataset.phase;
  const phase = phaseAt(now, zone);
  const localNight = phase === 'night' || phase === 'dusk';
  const media = resolvedMedia(cityId, phase);
  const phaseNode = card.querySelector<HTMLElement>('.gw-city-phase');
  if (phaseNode) {
    const textNodes = [...phaseNode.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE);
    textNodes.forEach((node, index) => { node.textContent = index === textNodes.length - 1 ? phase : ' '; });
    const icon = phaseNode.querySelector<SVGElement>('svg');
    if (icon) {
      icon.setAttribute('class', phaseIcons[phase].className);
      icon.innerHTML = phaseIcons[phase].paths;
    }
  }

  card.dataset.phase = phase;
  card.dataset.livePhase = phase;
  card.dataset.resolvedPhase = phase;
  card.dataset.mediaRequested = phase;
  card.dataset.mediaPhase = media.mediaPhase;
  card.dataset.mediaSelected = media.mediaPhase;
  card.dataset.material = localNight ? 'night' : 'day';
  card.dataset.localMaterial = localNight ? 'night' : 'day';
  card.className = card.className
    .replace(/gw-city-phase-(?:dawn|day|dusk|night)/g, `gw-city-phase-${phase}`)
    .replace(/gw-city-(?:day|night)-(?:bright_glass|precision)/g, `gw-city-${localNight ? 'night-precision' : 'day-bright_glass'}`);
  const atmosphere = card.querySelector<HTMLElement>('.gw-city-atmosphere');
  if (atmosphere) atmosphere.className = atmosphere.className.replace(/gw-city-atmosphere-phase-(?:dawn|day|dusk|night)/g, `gw-city-atmosphere-phase-${phase}`);

  const mediaContainer = card.firstElementChild;
  let imageLayer = mediaContainer?.querySelector<HTMLElement>('.gw-city-image-layer') || null;
  if (!media.src) {
    imageLayer?.remove();
    return;
  }
  if (!imageLayer && mediaContainer) {
    imageLayer = document.createElement('div');
    imageLayer.className = `absolute inset-0 gw-city-image-layer gw-city-image-phase-${phase} [&_img]:block`;
    imageLayer.style.opacity = '1';
    mediaContainer.insertBefore(imageLayer, mediaContainer.firstChild);
  }
  if (!imageLayer) return;
  imageLayer.className = imageLayer.className.replace(/gw-city-image-phase-(?:dawn|day|dusk|night)/g, `gw-city-image-phase-${phase}`);
  const usesApprovedImageWrapper = cityId === 'toronto' || cityId === 'london' || cityId === 'moscow';
  let image: HTMLImageElement;
  if (usesApprovedImageWrapper) {
    let outer = imageLayer.querySelector<HTMLElement>('span[data-base44-image]');
    if (!outer) outer = document.createElement('span');
    outer.className = 'relative block h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.025]';
    outer.dataset.base44Image = '';
    outer.dataset.base44ImageSrc = media.src;
    let inner = outer.querySelector<HTMLElement>('span');
    if (!inner) inner = document.createElement('span');
    inner.className = 'block relative w-full h-full overflow-hidden';
    image = inner.querySelector<HTMLImageElement>('img') || document.createElement('img');
    image.className = 'w-full h-full inset-0 absolute object-cover';
    if (inner.firstElementChild !== image) inner.replaceChildren(image);
    if (outer.firstElementChild !== inner) outer.replaceChildren(inner);
    if (imageLayer.firstElementChild !== outer) imageLayer.replaceChildren(outer);
  } else {
    image = imageLayer.querySelector<HTMLImageElement>(':scope > img') || document.createElement('img');
    image.className = 'block h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.025]';
    if (imageLayer.firstElementChild !== image) imageLayer.replaceChildren(image);
  }
  image.loading = 'eager';
  image.decoding = 'async';
  if (image.getAttribute('src') !== media.src) image.src = media.src;
  const city = card.querySelector<HTMLElement>('.gw-city-name')?.textContent?.trim() || cityId;
  image.alt = `${city} at ${phase} (${media.mediaPhase} media)`;
  if (previousPhase !== phase) hydrateSignInWeatherVisual(card);
}

function removePublicOwnerStudioLauncher(markup: string) {
  return markup.replace(/<a\b[^>]*data-owner-studio-launcher="sign-in"[^>]*>[\s\S]*?<\/a>/, '');
}
const runtimeApprovedSignInMarkup = removePublicOwnerStudioLauncher(approvedSignInMarkup);

const ApprovedSignInSource = memo(forwardRef<HTMLDivElement>(function ApprovedSignInSource(_, ref) {
  return <div ref={ref} className="sp-approved-signin-host" dangerouslySetInnerHTML={{ __html: runtimeApprovedSignInMarkup }} />;
}));

function updateReferenceClocks(root: HTMLElement, now: Date) {
  root.querySelectorAll<HTMLElement>('[data-city-id]').forEach((card) => {
    const zone = cityZones[card.dataset.cityId || ''];
    if (!zone) return;
    updateCityPhase(card, card.dataset.cityId || '', zone, now);
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);
    const compactDate = window.innerWidth < 2560;
    const compactGlobal = compactDate && card.dataset.cityId !== 'ibadan';
    card.classList.toggle('sp-compact-clock-date', compactGlobal);
    const date = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: compactDate ? 'short' : 'long',
      month: compactDate ? 'short' : 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now);
    const comma = date.indexOf(',');
    const timeNode = card.querySelector<HTMLElement>('.gw-city-local-time');
    const dateNodes = card.querySelectorAll<HTMLElement>('.gw-city-digital > p');
    if (timeNode) timeNode.textContent = time;
    const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(now).find((part) => part.type === 'timeZoneName')?.value || '';
    if (dateNodes[1]) dateNodes[1].textContent = compactGlobal ? `${date} · ${zoneName}` : date.slice(0, comma + 1);
    if (dateNodes[2]) dateNodes[2].textContent = compactGlobal ? '' : date.slice(comma + 2);
    if (dateNodes[3]) dateNodes[3].textContent = compactGlobal ? '' : `${zone} · ${zoneName}`;
    const digital = card.querySelector<HTMLElement>('.gw-city-digital');
    if (digital) { digital.title = `${time} · ${date} · ${zone} (${zoneName})`; digital.setAttribute('aria-label', digital.title); }


    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 12;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
    const second = Number(parts.find((part) => part.type === 'second')?.value || 0);
    const hands = [...card.querySelectorAll<SVGGElement>('.gw-city-clock svg > g[transform^="rotate("]')].slice(-3);
    if (hands[0]) hands[0].setAttribute('transform', `rotate(${hour * 30 + minute * .5} 100 100)`);
    if (hands[1]) hands[1].setAttribute('transform', `rotate(${minute * 6 + second * .1} 100 100)`);
    if (hands[2]) hands[2].setAttribute('transform', `rotate(${second * 6} 100 100)`);
  });
}

export function Brand({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const target = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const source = document.querySelector<HTMLElement>('.sp-approved-signin-host .sp-hero-brand');
    if (!source || !target.current) return;
    const clone = source.cloneNode(true) as HTMLElement;
    const idMap = new Map<string, string>();
    clone.querySelectorAll<HTMLElement>('[id]').forEach((node) => {
      const previous = node.id;
      const next = `${previous}-auth`;
      idMap.set(previous, next);
      node.id = next;
    });
    clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
      for (const attribute of ['fill', 'stroke', 'filter', 'clip-path', 'mask']) {
        const value = node.getAttribute(attribute);
        if (!value) continue;
        let next = value;
        idMap.forEach((replacement, previous) => { next = next.replace(`#${previous}`, `#${replacement}`); });
        if (next !== value) node.setAttribute(attribute, next);
      }
    });
    target.current.replaceChildren(...Array.from(clone.childNodes));
  }, []);
  return <div ref={target} className={`sp-brand sp-brand-v172 ${compact ? 'sp-brand-compact' : ''} sp-brand-depth ${className}`} aria-label="DAENEM Staff Portal" />;
}

export function SignInExperience({ authPanel, authMode, onInstall }: {
  authPanel: ReactNode;
  authMode: 'signin' | 'signup' | 'forgot';
  themeId: ThemeId;
  onInstall: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [authMount, setAuthMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const mount = root.querySelector<HTMLElement>('#staffportal-auth-mount');
    if (!mount) return;
    const layoutStyle = document.createElement('style');
    layoutStyle.dataset.signinLayoutStability = 'true';
    layoutStyle.textContent = SIGNIN_LAYOUT_STABILITY_CSS;
    document.head.appendChild(layoutStyle);
    setAuthMount(mount);
    settleReferenceMotion(root);
    updateReferenceClocks(root, new Date());
    return () => layoutStyle.remove();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const tick = () => updateReferenceClocks(root, new Date());
    const timer = window.setInterval(tick, 1000);
    const onClick = (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest('.sp-install-card, .sp-hero-install-app')) onInstall();
    };
    root.addEventListener('click', onClick);
    return () => {
      window.clearInterval(timer);
      root.removeEventListener('click', onClick);
    };
  }, [onInstall]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    prepareWeatherCards(root);
    let active = true;
    const requests = new Map<string, AbortController>();
    const lastAttempt = new Map<string, number>();
    const lastGood = new Map<string, SignInWeatherPayload>();
    const cityIds = ['ibadan', 'toronto', 'london', 'newyork', 'moscow', 'tokyo', 'beijing'];
    for (const cityId of cityIds) {
      const cached = readCachedSignInWeather(cityId);
      if (!cached) continue;
      lastGood.set(cityId, cached);
      if (cityId === 'ibadan') applySignInWeather(root, cached, true);
      else applyCityWeather(root, cityId, cached, true);
    }

    const refreshCity = async (cityId: string) => {
      if (!active || requests.has(cityId) || Date.now() - (lastAttempt.get(cityId) || 0) < SIGNIN_WEATHER_REFRESH_MS) return;
      lastAttempt.set(cityId, Date.now());
      const controller = new AbortController();
      requests.set(cityId, controller);
      const timeout = window.setTimeout(() => controller.abort(new DOMException('Weather request timed out', 'TimeoutError')), SIGNIN_REQUEST_TIMEOUT_MS);
      try {
        const options = { method: 'GET', headers: { accept: 'application/json' }, signal: controller.signal };
        const response = await (cityId === 'ibadan' ? fetch('/api/context/signin/weather', options) : fetch(`/api/context/signin/weather?city=${cityId}`, options));
        if (!response.ok) throw new Error('Weather unavailable');
        const payload = normalizeSignInWeather(await response.json());
        if (!payload || !weatherMatchesCity(payload, cityId)) throw new Error('No usable city weather');
        if (!active || controller.signal.aborted) return;
        lastGood.set(cityId, payload);
        writeCachedSignInWeather(payload, cityId);
        if (cityId === 'ibadan') applySignInWeather(root, payload);
        else applyCityWeather(root, cityId, payload);
      } catch (failure: unknown) {
        if (!active) return;
        // Cleanup is inactive; any remaining abort belongs to this request's timeout.
        const error = (failure as { name?: string })?.name === 'AbortError' ? new Error('Weather request timed out') : failure;
        const previous = lastGood.get(cityId);
        const cached = previous && normalizeSignInWeather(previous);
        if ((error as { name?: string })?.name !== 'AbortError' && !cached) applyUnavailableSignInWeather(root, cityId);
        else if (cached) {
          if (cityId === 'ibadan') applySignInWeather(root, cached, true, true);
          else applyCityWeather(root, cityId, cached, true);
        }
      } finally {
        window.clearTimeout(timeout);
        if (requests.get(cityId) === controller) requests.delete(cityId);
      }
    };
    const refresh = () => { if (document.visibilityState !== 'hidden') cityIds.forEach((cityId) => { void refreshCity(cityId); }); };
    refresh();
    const timer = window.setInterval(refresh, SIGNIN_WEATHER_REFRESH_MS);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      requests.forEach((controller) => controller.abort());
      window.clearInterval(timer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const disconnectWidgets = connectSignInWidgets(root);
    const disconnectMotion = connectSignInWeatherMotion(root);
    return () => { disconnectWidgets(); disconnectMotion(); };
  }, []);

  useEffect(() => {
    const authMount = rootRef.current?.querySelector<HTMLElement>('#staffportal-auth-mount');
    if (!authMount) return;
    authMount.classList.remove('sp-auth-mode-signin', 'sp-auth-mode-create', 'sp-auth-mode-forgot');
    authMount.classList.add(`sp-auth-mode-${authMode === 'signup' ? 'create' : authMode}`);
    authMount.dataset.authGateway = 'cloudflare-worker';
    authMount.dataset.approvedProject = APPROVED_SIGNIN.project;
    authMount.dataset.approvedVersion = String(APPROVED_SIGNIN.version);
    authMount.dataset.sourceCommit = APPROVED_SIGNIN.commit;
  }, [authMode]);

  return <>
    <link rel="stylesheet" href="/approved-signin-v180.css" />
    <ApprovedSignInSource ref={rootRef} />
    {authMount ? createPortal(authPanel, authMount) : null}
  </>;
}

