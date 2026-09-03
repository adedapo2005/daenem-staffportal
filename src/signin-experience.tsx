import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity, Cloud, CloudLightning, CloudRain, CloudSun, Download, LockKeyhole,
  Newspaper, Radio, ShieldCheck, Sparkles, Sun, Target, Wifi 
} from 'lucide-react';
import { applyThemeToDocument, type ModePreference, type ThemeId } from './theme-system';
import {
  DEFAULT_SIGNIN_PREFERENCES,
  WORLD_CLOCK_CATALOG,
  fetchPublicSignInContext,
  isWithinDarkWindow,
  normalizeSignInPreferences,
  readSignInPreferences,
  type PortalLocation,
  type PublicSignInContext,
  type SignInExperiencePreferences,
  type SignInGlobalOperations,
  type SignInWidgetId,
  type SignInWidgetInstance,
  type TemperatureUnit,
} from './signin-preferences';

type WeatherReading = {
  state: 'loading' | 'ready' | 'unavailable';
  temperatureC: number | null;
  description: string;
  updatedAt: Date | null;
};

type HealthReading = {
  state: 'checking' | 'operational' | 'maintenance';
  latencyMs: number | null;
  checkedAt: Date | null;
};

const FALLBACK_CONTEXT: PublicSignInContext = {
  config: DEFAULT_SIGNIN_PREFERENCES,
  inspiration: 'Turn the clearest next step into visible progress.',
  motivation: 'Build today’s momentum with one useful, well-finished action.',
  news: [{ title: 'Daenem live services are connected and ready.', category: 'Portal', source: 'Daenem' }],
  generatedAt: new Date(0).toISOString(),
  source: 'fallback',
};

function timeText(zone: string, date: Date, seconds = false) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hour12: true,
  }).format(date);
}

function fullDateText(zone: string, date: Date) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long' }).format(date);
  const numeric = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, month: '2-digit', day: '2-digit', year: 'numeric',
  }).format(date);
  return weekday + ' · ' + numeric;
}

function timeZoneText(zone: string, date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'short',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || zone;
}

function dayNightText(zone: string, date: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', hour12: false,
  }).format(date));
  return hour >= 6 && hour < 18 ? 'Daylight' : 'Night';
}

function clockHands(zone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 12;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  const second = Number(parts.find((part) => part.type === 'second')?.value || 0);
  return {
    '--usp-hour-angle': (hour * 30 + minute * 0.5) + 'deg',
    '--usp-minute-angle': (minute * 6 + second * 0.1) + 'deg',
    '--usp-second-angle': (second * 6) + 'deg',
  } as CSSProperties;
}

function formatTemperature(value: number | null, unit: TemperatureUnit) {
  if (value === null) return '—°' + unit;
  const converted = unit === 'F' ? (value * 9) / 5 + 32 : value;
  return Math.round(converted) + '°' + unit;
}

function weatherKind(description: string) {
  const value = description.toLowerCase();
  if (value.includes('thunder') || value.includes('hail')) return 'storm';
  if (value.includes('rain') || value.includes('drizzle') || value.includes('shower')) return 'rain';
  if (value.includes('cloud') || value.includes('overcast') || value.includes('fog')) return 'cloud';
  return 'sun';
}

function WeatherIcon({ description, size = 20 }: { description: string; size?: number }) {
  const kind = weatherKind(description);
  const Icon = kind === 'storm' ? CloudLightning : kind === 'rain' ? CloudRain : kind === 'cloud' ? Cloud : Sun;
  return <span className={'usp-weather-glyph usp-weather-' + kind} aria-hidden="true"><Icon size={size} /></span>;
}

function AnimatedBrand({ preferences }: { preferences: SignInExperiencePreferences }) {
  const labels = preferences.labels;
  const logo = preferences.logo;
  return <div className={'usp-brand-lockup usp-logo-size-' + logo.size + ' usp-logo-align-' + logo.alignment + (logo.glass ? ' usp-brand-glass' : '')}
    style={{ '--usp-glass-intensity': String(preferences.effects.glassIntensity) } as CSSProperties}
    aria-label={labels.brandEyebrow + ' · ' + labels.brandTitle + ' · ' + labels.brandTagline}>
    <span className="usp-logo-orbit" aria-hidden="true">
      <i className="usp-logo-ring usp-logo-ring-a" />
      <i className="usp-logo-ring usp-logo-ring-b" />
      <span className="usp-logo-depth"><img src="/brand-assets/logo-mark.svg" alt="" /></span>
    </span>
    <span className="usp-brand-copy">
      <small>{labels.brandEyebrow}</small>
      <strong>{labels.brandTitle}</strong>
      <span>{labels.brandTagline}</span>
    </span>
  </div>;
}

function locationForZone(zone: string) {
  return WORLD_CLOCK_CATALOG.find((location) => location.zone === zone);
}

async function loadWeather(location: PortalLocation): Promise<WeatherReading> {
  try {
    const response = await fetch('/api/context/weather?lat=' + encodeURIComponent(location.latitude) + '&lon=' + encodeURIComponent(location.longitude), {
      credentials: 'include', cache: 'no-store',
    });
    const result = await response.json().catch(() => ({})) as { temperature?: number; description?: string };
    if (!response.ok || typeof result.temperature !== 'number') throw new Error('Weather unavailable');
    return {
      state: 'ready',
      temperatureC: result.temperature,
      description: result.description || 'Current conditions',
      updatedAt: new Date(),
    };
  } catch {
    return {
      state: 'unavailable',
      temperatureC: null,
      description: 'Weather temporarily unavailable',
      updatedAt: new Date(),
    };
  }
}

function ClockCard({ location, now, weather, unit, display }: {
  location: PortalLocation;
  now: Date;
  weather: WeatherReading | undefined;
  unit: TemperatureUnit;
  display: SignInGlobalOperations;
}) {
  const description = weather?.description || 'Loading live weather';
  const state = dayNightText(location.zone, now);
  return <article className="usp-clock-card" tabIndex={0} aria-label={location.name + ' local time and weather'}>
    {display.showAnalog && <div className="usp-analog-clock" style={clockHands(location.zone, now)} aria-hidden="true">
      {Array.from({ length: 12 }, (_, tick) => <i key={tick} style={{ transform: 'rotate(' + tick * 30 + 'deg)' }} />)}
      <span className="usp-clock-hand usp-clock-hour" />
      <span className="usp-clock-hand usp-clock-minute" />
      <span className="usp-clock-hand usp-clock-second" />
      <span className="usp-clock-pin" />
    </div>}
    <div className={'usp-clock-copy' + (display.showAnalog ? '' : ' usp-clock-copy-wide')}>
      <div className="usp-clock-location"><strong>{location.name}</strong><small>{location.region}</small></div>
      {display.showDigital && <b>{timeText(location.zone, now, true)}</b>}
      {display.showDate && <span>{fullDateText(location.zone, now)}</span>}
      {(display.showTimezone || display.showDayNight) && <div className="usp-clock-meta">
        {display.showTimezone && <small>{timeZoneText(location.zone, now)}</small>}
        {display.showDayNight && <small className={'usp-day-state ' + state.toLowerCase()}><i />{state}</small>}
      </div>}
      {display.showWeather && <div className={'usp-clock-weather ' + weatherKind(description)}>
        <WeatherIcon description={description} size={15} />
        <span>{weather?.state === 'ready' ? formatTemperature(weather.temperatureC, unit) : '—°' + unit}</span>
        <small>{description}</small>
      </div>}
    </div>
  </article>;
}

export function SignInExperience({ authPanel, themeId, modePreference, onInstall }: {
  authPanel: ReactNode;
  themeId: ThemeId;
  modePreference: ModePreference;
  onInstall: () => void;
}) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [preferences, setPreferences] = useState<SignInExperiencePreferences>(() => readSignInPreferences());
  const [context, setContext] = useState<PublicSignInContext>(() => ({ ...FALLBACK_CONTEXT, config: readSignInPreferences() }));
  const [weather, setWeather] = useState<Record<string, WeatherReading>>({});
  const [health, setHealth] = useState<HealthReading>({ state: 'checking', latencyMs: null, checkedAt: null });

  const locations = useMemo(() => {
    const values = preferences.clockZones.map(locationForZone).filter((item): item is PortalLocation => Boolean(item));
    const fallback = values.length ? values : WORLD_CLOCK_CATALOG.slice(0, 7);
    return fallback.slice(0, preferences.globalOperations.maxClocks);
  }, [preferences.clockZones, preferences.globalOperations.maxClocks]);

  useEffect(() => {
    let timer = 0;
    const start = () => {
      window.clearInterval(timer);
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), 1000);
    };
    document.addEventListener('visibilitychange', start);
    start();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    async function refresh() {
      try {
        const result = await fetchPublicSignInContext();
        if (!active) return;
        const config = normalizeSignInPreferences(result.config);
        setContext({ ...result, config });
        setPreferences(config);
      } catch {
        if (active) setContext((current) => ({ ...current, source: 'fallback' }));
      }
    }
    refresh();
    timer = window.setInterval(refresh, 900_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onPreferences = (event: Event) => {
      const detail = (event as CustomEvent<SignInExperiencePreferences>).detail;
      if (detail) setPreferences(normalizeSignInPreferences(detail));
    };
    window.addEventListener('daenem:signin-preferences', onPreferences);
    return () => window.removeEventListener('daenem:signin-preferences', onPreferences);
  }, []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    async function refreshWeather() {
      const entries = await Promise.all(locations.map(async (location) => [location.zone, await loadWeather(location)] as const));
      if (active) setWeather(Object.fromEntries(entries));
    }
    refreshWeather();
    timer = window.setInterval(refreshWeather, 600_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [locations]);

  useEffect(() => {
    let active = true;
    let timer = 0;
    async function refreshHealth() {
      const startedAt = Date.now();
      try {
        const response = await fetch('/api/health', { credentials: 'include', cache: 'no-store' });
        const result = await response.json().catch(() => ({})) as { ok?: boolean };
        if (!active) return;
        setHealth({
          state: response.ok && result.ok !== false ? 'operational' : 'maintenance',
          latencyMs: Math.max(1, Date.now() - startedAt),
          checkedAt: new Date(),
        });
      } catch {
        if (active) setHealth({ state: 'maintenance', latencyMs: null, checkedAt: new Date() });
      }
    }
    refreshHealth();
    timer = window.setInterval(refreshHealth, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let timer = 0;
    const apply = () => {
      const selectedMode = preferences.themeMode === 'auto'
        ? (isWithinDarkWindow(new Date(), preferences.darkStart, preferences.darkEnd) ? 'night' : 'day')
        : preferences.themeMode;
      applyThemeToDocument(themeId, selectedMode || modePreference);
    };
    apply();
    timer = window.setInterval(apply, 60_000);
    return () => window.clearInterval(timer);
  }, [modePreference, preferences.darkEnd, preferences.darkStart, preferences.themeMode, themeId]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    const move = (event: PointerEvent) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 12;
        const y = (event.clientY / window.innerHeight - 0.5) * 8;
        scene.style.setProperty('--usp-parallax-x', x.toFixed(2) + 'px');
        scene.style.setProperty('--usp-parallax-y', y.toFixed(2) + 'px');
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  const ibadan = locationForZone('Africa/Lagos') || locations[0];
  const ibadanWeather = ibadan ? weather[ibadan.zone] : undefined;
  const activeNews = context.news.length
    ? context.news[Math.floor(now.getTime() / 12_000) % context.news.length]
    : FALLBACK_CONTEXT.news[0];
  const healthLabel = health.state === 'operational' ? 'Operational' : health.state === 'maintenance' ? 'Maintenance' : 'Checking';
  const healthDetail = health.state === 'operational'
    ? (health.latencyMs || '—') + ' ms secure edge'
    : health.state === 'maintenance' ? 'Service team notified' : 'Connecting securely';

  function renderWidget(instance: SignInWidgetInstance) {
    if (!instance.visible) return null;
    const widget = instance.kind;
    const variantClass = 'usp-widget-variant-' + instance.variant;
    if (widget === 'weather') {
      const description = ibadanWeather?.description || 'Loading current conditions';
      return <article className={'usp-live-card usp-weather-card ' + variantClass} key={instance.id} data-widget={widget} data-widget-id={instance.id}>
        <div className="usp-widget-label"><span><CloudSun size={15} /> {instance.label}</span><b>IBADAN</b></div>
        <div className="usp-weather-main"><WeatherIcon description={description} size={34} /><strong>{formatTemperature(ibadanWeather?.temperatureC ?? null, preferences.temperatureUnit)}</strong></div>
        <p>{description}</p>
        <small>{ibadanWeather?.updatedAt ? 'Updated ' + timeText('Africa/Lagos', ibadanWeather.updatedAt) : 'Connecting to live weather'}</small>
      </article>;
    }
    if (widget === 'inspiration') {
      return <article className={'usp-live-card usp-copy-card usp-inspiration-card ' + variantClass} key={instance.id} data-widget={widget} data-widget-id={instance.id}>
        <div className="usp-widget-label"><span><Sparkles size={14} /> {instance.label}</span><i className="usp-live-pulse" /></div>
        <strong>{context.inspiration || preferences.content.inspiration}</strong><small>Live guidance · refreshed automatically</small>
      </article>;
    }
    if (widget === 'motivation') {
      return <article className={'usp-live-card usp-copy-card usp-motivation-card ' + variantClass} key={instance.id} data-widget={widget} data-widget-id={instance.id}>
        <div className="usp-widget-label"><span><Target size={14} /> {instance.label}</span><i className="usp-live-pulse" /></div>
        <strong>{context.motivation || preferences.content.motivation}</strong><small>Daily momentum for every business unit</small>
      </article>;
    }
    if (widget === 'news') {
      return <article className={'usp-live-card usp-copy-card usp-news-card ' + variantClass} key={instance.id} data-widget={widget} data-widget-id={instance.id}>
        <div className="usp-widget-label"><span><Newspaper size={14} /> {instance.label}</span><b>{activeNews.category}</b></div>
        {activeNews.url ? <a href={activeNews.url} target="_blank" rel="noopener noreferrer">{activeNews.title}</a> : <strong>{activeNews.title}</strong>}
        <small>{activeNews.source} · rotating live feed</small>
      </article>;
    }
    return <article className={'usp-live-card usp-status-card ' + health.state + ' ' + variantClass} key={instance.id} data-widget={widget} data-widget-id={instance.id}>
      <div className="usp-widget-label"><span><Activity size={14} /> {instance.label}</span><i className="usp-live-pulse" /></div>
      <strong>{healthLabel}</strong><small>{healthDetail}</small>
    </article>;
  }

  function renderWidgetGroup(title: string, zones: string[]) {
    const instances = preferences.widgetInstances.filter((instance) => instance.visible && zones.includes(instance.zone)).sort((a, b) => a.order - b.order);
    if (!instances.length) return null;
    return <section className="usp-widget-group" aria-label={title}><h3 className="usp-widget-group-title">{title}</h3>{instances.map(renderWidget)}</section>;
  }

  const labels = preferences.labels;
  return <main
    ref={sceneRef}
    className={'usp-page usp-effects-' + preferences.effectLevel + ' usp-logo-' + preferences.logoPosition}
    data-testid="unified-signin-page"
  >
    <div className="usp-background" aria-hidden="true" />
    <div className="usp-background-shade" aria-hidden="true" />
    <div className="usp-ambient usp-ambient-a" aria-hidden="true" />
    <div className="usp-ambient usp-ambient-b" aria-hidden="true" />

    <div className="usp-shell">
      <header className="usp-topbar">
        <AnimatedBrand preferences={preferences} />
        <div className="usp-top-actions">
          <span className="usp-top-chip"><i /> LIVE ERP ACCESS</span>
          <button className="usp-top-install" type="button" data-pwa-install onClick={onInstall} aria-label="Install Daenem ERP app">
            <Download size={16} /><span>Install App</span>
          </button>
        </div>
      </header>

      <section className="usp-stage" aria-label={labels.workspaceLabel}>
        <div className="usp-scene-caption">
          <div className="usp-scene-title">
            <span><Radio size={13} /> {labels.workspaceLabel}</span>
            <h2>{labels.workspaceHeadline}</h2>
            <p>{labels.workspaceDescription}</p>
          </div>
          <div className="usp-signal-row">
            <span className="usp-signal"><span><Radio size={12} /> IBADAN TIME</span><strong>{timeText('Africa/Lagos', now, true)}</strong><small>{fullDateText('Africa/Lagos', now)}</small></span>
            <span className="usp-signal"><span><LockKeyhole size={12} /> SESSION</span><strong>Protected</strong><small>Encrypted employee access</small></span>
          </div>
        </div>

        <div className="usp-form-column">{authPanel}</div>

        <aside className="usp-live-stack" aria-label="Live portal widgets">
          {renderWidgetGroup(labels.liveContextHeading, ['live-context'])}
          {renderWidgetGroup(labels.todayHeading, ['today', 'auxiliary'])}
        </aside>
      </section>

      {preferences.globalOperations.visible && <section className={'usp-clock-dock clock-style-' + preferences.clockStyle} aria-label="Global time and weather">
        <header className="usp-clock-heading">
          <span><Wifi size={12} /> {labels.globalOperationsHeading}</span>
          <small>{locations.length} locations · 12-hour time · automatic updates</small>
        </header>
        <div className="usp-clock-grid">
          {locations.map((location) => <ClockCard
            key={location.name + location.zone}
            location={location}
            now={now}
            weather={weather[location.zone]}
            unit={preferences.temperatureUnit}
            display={preferences.globalOperations}
          />)}
        </div>
      </section>}
    </div>
  </main>;
}
