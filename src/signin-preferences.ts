export type ClockStyle = 'minimal' | 'detailed' | 'neon' | 'classic';
export type TemperatureUnit = 'F' | 'C';
export type SignInWidgetId = 'weather' | 'inspiration' | 'motivation' | 'news' | 'status';
export type LogoPosition = 'left' | 'center' | 'right';
export type EffectLevel = 'calm' | 'balanced' | 'vivid';
export type SignInThemeMode = 'day' | 'night' | 'auto';

export type PortalLocation = {
  name: string;
  region: string;
  zone: string;
  latitude: number;
  longitude: number;
};

export const WORLD_CLOCKS: PortalLocation[] = [
  { name: 'Daenem Complex', region: 'Ibadan, Nigeria', zone: 'Africa/Lagos', latitude: 7.3775, longitude: 3.9470 },
  { name: 'Toronto', region: 'Canada', zone: 'America/Toronto', latitude: 43.6532, longitude: -79.3832 },
  { name: 'London', region: 'United Kingdom', zone: 'Europe/London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'New York', region: 'United States', zone: 'America/New_York', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Moscow', region: 'Russia', zone: 'Europe/Moscow', latitude: 55.7558, longitude: 37.6173 },
  { name: 'Tokyo', region: 'Japan', zone: 'Asia/Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Beijing / Shanghai', region: 'China', zone: 'Asia/Shanghai', latitude: 31.2304, longitude: 121.4737 },
];

export const WORLD_CLOCK_CATALOG: PortalLocation[] = [
  ...WORLD_CLOCKS,
  { name: 'Johannesburg', region: 'South Africa', zone: 'Africa/Johannesburg', latitude: -26.2041, longitude: 28.0473 },
  { name: 'Dubai', region: 'United Arab Emirates', zone: 'Asia/Dubai', latitude: 25.2048, longitude: 55.2708 },
  { name: 'Singapore', region: 'Singapore', zone: 'Asia/Singapore', latitude: 1.3521, longitude: 103.8198 },
  { name: 'Sydney', region: 'Australia', zone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 },
];

export type WorldClockPreferences = { style: ClockStyle; visibleZones: string[] };

export type SignInExperiencePreferences = {
  widgetOrder: SignInWidgetId[];
  hiddenWidgets: SignInWidgetId[];
  clockStyle: ClockStyle;
  clockZones: string[];
  temperatureUnit: TemperatureUnit;
  logoPosition: LogoPosition;
  effectLevel: EffectLevel;
  themeMode: SignInThemeMode;
  darkStart: string;
  darkEnd: string;
};

export type LiveHeadline = { title: string; url?: string; category: string; source: string };

export type PublicSignInContext = {
  config: SignInExperiencePreferences;
  inspiration: string;
  motivation: string;
  news: LiveHeadline[];
  generatedAt: string;
  source: 'live' | 'fallback';
};

const WORLD_CLOCK_PREFS_KEY = 'daenem-world-clock-preferences';
const SIGNIN_PREFS_KEY = 'daenem-signin-experience-v2';
const ALL_WIDGETS: SignInWidgetId[] = ['weather', 'inspiration', 'motivation', 'news', 'status'];
const ALL_CLOCK_STYLES: ClockStyle[] = ['minimal', 'detailed', 'neon', 'classic'];
const ALL_LOGO_POSITIONS: LogoPosition[] = ['left', 'center', 'right'];
const ALL_EFFECT_LEVELS: EffectLevel[] = ['calm', 'balanced', 'vivid'];
const ALL_THEME_MODES: SignInThemeMode[] = ['day', 'night', 'auto'];

export const DEFAULT_SIGNIN_PREFERENCES: SignInExperiencePreferences = {
  widgetOrder: [...ALL_WIDGETS],
  hiddenWidgets: [],
  clockStyle: 'detailed',
  clockZones: WORLD_CLOCKS.map((item) => item.zone),
  temperatureUnit: 'F',
  logoPosition: 'left',
  effectLevel: 'balanced',
  themeMode: 'auto',
  darkStart: '19:00',
  darkEnd: '07:00',
};

function uniqueValues<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is T => typeof value === 'string' && allowed.includes(value as T)))];
}

function validTime(value: unknown, fallback: string) {
  const text = String(value || '');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

export function normalizeSignInPreferences(value: unknown): SignInExperiencePreferences {
  const candidate = value && typeof value === 'object' ? value as Partial<SignInExperiencePreferences> : {};
  const widgetOrder = uniqueValues(candidate.widgetOrder, ALL_WIDGETS);
  const hiddenWidgets = uniqueValues(candidate.hiddenWidgets, ALL_WIDGETS);
  const availableZones = WORLD_CLOCK_CATALOG.map((item) => item.zone);
  const clockZones = uniqueValues(candidate.clockZones, availableZones);
  return {
    widgetOrder: widgetOrder.length ? [...widgetOrder, ...ALL_WIDGETS.filter((widget) => !widgetOrder.includes(widget))] : [...DEFAULT_SIGNIN_PREFERENCES.widgetOrder],
    hiddenWidgets,
    clockStyle: ALL_CLOCK_STYLES.includes(candidate.clockStyle as ClockStyle) ? candidate.clockStyle as ClockStyle : DEFAULT_SIGNIN_PREFERENCES.clockStyle,
    clockZones: clockZones.length ? clockZones.slice(0, 7) : [...DEFAULT_SIGNIN_PREFERENCES.clockZones],
    temperatureUnit: candidate.temperatureUnit === 'C' ? 'C' : 'F',
    logoPosition: ALL_LOGO_POSITIONS.includes(candidate.logoPosition as LogoPosition) ? candidate.logoPosition as LogoPosition : DEFAULT_SIGNIN_PREFERENCES.logoPosition,
    effectLevel: ALL_EFFECT_LEVELS.includes(candidate.effectLevel as EffectLevel) ? candidate.effectLevel as EffectLevel : DEFAULT_SIGNIN_PREFERENCES.effectLevel,
    themeMode: ALL_THEME_MODES.includes(candidate.themeMode as SignInThemeMode) ? candidate.themeMode as SignInThemeMode : DEFAULT_SIGNIN_PREFERENCES.themeMode,
    darkStart: validTime(candidate.darkStart, DEFAULT_SIGNIN_PREFERENCES.darkStart),
    darkEnd: validTime(candidate.darkEnd, DEFAULT_SIGNIN_PREFERENCES.darkEnd),
  };
}

export function readSignInPreferences() {
  if (typeof window === 'undefined') return DEFAULT_SIGNIN_PREFERENCES;
  try {
    return normalizeSignInPreferences(JSON.parse(localStorage.getItem(SIGNIN_PREFS_KEY) || 'null'));
  } catch {
    return DEFAULT_SIGNIN_PREFERENCES;
  }
}

export function storeSignInPreferences(value: unknown) {
  const next = normalizeSignInPreferences(value);
  if (typeof window !== 'undefined') {
    localStorage.setItem(SIGNIN_PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(WORLD_CLOCK_PREFS_KEY, JSON.stringify({ style: next.clockStyle, visibleZones: next.clockZones }));
    window.dispatchEvent(new CustomEvent<SignInExperiencePreferences>('daenem:signin-preferences', { detail: next }));
    window.dispatchEvent(new CustomEvent<WorldClockPreferences>('daenem:world-clock-preferences', { detail: { style: next.clockStyle, visibleZones: next.clockZones } }));
  }
  return next;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || 'The preference service could not complete this request.'));
  return body as T;
}

export async function fetchPublicSignInContext(): Promise<PublicSignInContext> {
  const result = await requestJson<PublicSignInContext>('/api/context/signin');
  result.config = storeSignInPreferences(result.config);
  return result;
}

export async function fetchAdminSignInPreferences(): Promise<{ config: SignInExperiencePreferences; canManage: boolean }> {
  const result = await requestJson<{ config: SignInExperiencePreferences; canManage: boolean }>('/api/theme/signin');
  result.config = storeSignInPreferences(result.config);
  return result;
}

export async function saveSignInPreferences(value: unknown): Promise<SignInExperiencePreferences> {
  const config = normalizeSignInPreferences(value);
  const result = await requestJson<{ config: SignInExperiencePreferences }>('/api/theme/signin', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  return storeSignInPreferences(result.config);
}

export function readWorldClockPreferences(): WorldClockPreferences {
  if (typeof window === 'undefined') return { style: DEFAULT_SIGNIN_PREFERENCES.clockStyle, visibleZones: DEFAULT_SIGNIN_PREFERENCES.clockZones };
  try {
    const parsed = JSON.parse(localStorage.getItem(WORLD_CLOCK_PREFS_KEY) || 'null') as Partial<WorldClockPreferences> | null;
    const visibleZones = uniqueValues(parsed?.visibleZones, WORLD_CLOCK_CATALOG.map((item) => item.zone));
    const style = ALL_CLOCK_STYLES.includes(parsed?.style as ClockStyle) ? parsed?.style as ClockStyle : DEFAULT_SIGNIN_PREFERENCES.clockStyle;
    return { style, visibleZones: visibleZones.length ? visibleZones.slice(0, 7) : [...DEFAULT_SIGNIN_PREFERENCES.clockZones] };
  } catch {
    return { style: DEFAULT_SIGNIN_PREFERENCES.clockStyle, visibleZones: [...DEFAULT_SIGNIN_PREFERENCES.clockZones] };
  }
}

export function saveWorldClockPreferences(preferences: WorldClockPreferences) {
  if (typeof window === 'undefined') return;
  const next = {
    style: ALL_CLOCK_STYLES.includes(preferences.style) ? preferences.style : DEFAULT_SIGNIN_PREFERENCES.clockStyle,
    visibleZones: uniqueValues(preferences.visibleZones, WORLD_CLOCK_CATALOG.map((item) => item.zone)).slice(0, 7),
  };
  if (!next.visibleZones.length) next.visibleZones = [...DEFAULT_SIGNIN_PREFERENCES.clockZones];
  localStorage.setItem(WORLD_CLOCK_PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<WorldClockPreferences>('daenem:world-clock-preferences', { detail: next }));
}

export function isWithinDarkWindow(now: Date, start: string, end: string) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = validTime(start, '19:00').split(':').map(Number);
  const [endHour, endMinute] = validTime(end, '07:00').split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return startMinutes > endMinutes
    ? minutes >= startMinutes || minutes < endMinutes
    : minutes >= startMinutes && minutes < endMinutes;
}
