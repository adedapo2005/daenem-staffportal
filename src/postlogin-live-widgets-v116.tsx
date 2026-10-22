import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BriefcaseBusiness,
  Cloud,
  CloudRain,
  CloudSun,
  Droplets,
  Globe2,
  Lightbulb,
  MapPin,
  Newspaper,
  RefreshCw,
  Sparkles,
  Sun,
  Wind,
} from 'lucide-react';
import './postlogin-live-widgets-v116.css';
import { normalizePostLoginContext, type Headline, type PostLoginContext } from './postlogin-context-normalization';

type WeatherContext = {
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

type MountTargets = {
  dashboard: HTMLElement | null;
  weather: HTMLElement | null;
  constructionToolbar: HTMLElement | null;
  constructionMain: HTMLElement | null;
};

const IBADAN_WEATHER_QUERY = 'lat=7.3775&lon=3.9470&unitsSystem=METRIC';

function useMountTargets() {
  const [targets, setTargets] = useState<MountTargets>({ dashboard: null, weather: null, constructionToolbar: null, constructionMain: null });

  useEffect(() => {
    const locate = () => {
      const dashboard = document.querySelector<HTMLElement>('.tech-dashboard-grid');
      const weather = document.querySelector<HTMLElement>('.home-weather');
      const constructionToolbar = document.querySelector<HTMLElement>('#main-content .c16-toolbar');
      const constructionMain = constructionToolbar?.closest<HTMLElement>('#main-content') || null;
      setTargets((current) => current.dashboard === dashboard && current.weather === weather &&
        current.constructionToolbar === constructionToolbar && current.constructionMain === constructionMain
        ? current
        : { dashboard, weather, constructionToolbar, constructionMain });
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', locate);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', locate);
    };
  }, []);

  return targets;
}

function timeAgo(value: string | null) {
  if (!value) return 'Latest update';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Latest update';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 60) return minutes < 2 ? 'Just now' : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

function WidgetHeader({ icon, kicker, title, detail, onRefresh, busy }: {
  icon: ReactNode;
  kicker: string;
  title: string;
  detail: string;
  onRefresh?: () => void;
  busy?: boolean;
}) {
  return (
    <header className="v116-widget-header">
      <span className="v116-widget-icon" aria-hidden="true">{icon}</span>
      <div>
        <span className="p-kicker">{kicker}</span>
        <h3>{title}</h3>
        <small>{detail}</small>
      </div>
      {onRefresh ? (
        <button className="v116-icon-button" type="button" onClick={onRefresh} disabled={busy} aria-label={`Refresh ${title}`}>
          <RefreshCw size={16} className={busy ? 'v116-spinning' : undefined} />
        </button>
      ) : null}
    </header>
  );
}

function HeadlineList({ items, emptyMessage }: { items: Headline[]; emptyMessage: string }) {
  if (!items.length) return <p className="v116-empty">{emptyMessage}</p>;
  return (
    <ol className="v116-headlines">
      {items.slice(0, 8).map((item) => (
        <li key={item.id}>
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <span>{item.title}</span>
            <small><strong>{item.source}</strong> · {item.category} · {timeAgo(item.publishedAt)}</small>
          </a>
        </li>
      ))}
    </ol>
  );
}

function NewsWidget({ context, loading, onRefresh }: {
  context: PostLoginContext | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const detail = loading ? 'Checking verified news sources'
    : !context ? 'News sources currently unavailable'
    : context.status === 'unavailable' ? 'No verified news feeds available'
    : `${context.activeSourceCount} verified sources · updated ${timeAgo(context.generatedAt)}`;
  return (
    <section className="tech-widget size-wide v116-widget" data-widget-id="live-news-v116" aria-label="News">
      <WidgetHeader icon={<Newspaper size={19} />} kicker="LIVE NEWSROOM" title="News" detail={detail} onRefresh={onRefresh} busy={loading} />
      <HeadlineList items={context?.news || []} emptyMessage={loading ? 'Loading current headlines…' : 'News feeds are temporarily unavailable.'} />
    </section>
  );
}

function IntelligenceWidget({ context, loading, onRefresh }: {
  context: PostLoginContext | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const detail = loading ? 'Checking intelligence feeds'
    : !context ? 'Intelligence feeds currently unavailable'
    : context.status === 'unavailable' ? 'No verified intelligence feeds available'
    : `${context.successfulFeedCount} feeds responding · ${context.status === 'partial' ? 'Limited coverage' : 'Live coverage'}`;
  return (
    <section className="tech-widget size-wide v116-widget" data-widget-id="live-intelligence-v116" aria-label="Business intelligence">
      <WidgetHeader
        icon={<Globe2 size={19} />}
        kicker="LOCAL + INTERNATIONAL"
        title="Business intelligence"
        detail={detail}
        onRefresh={onRefresh}
        busy={loading}
      />
      <HeadlineList items={context?.intelligence || []} emptyMessage={loading ? 'Loading intelligence feeds…' : 'Intelligence feeds are temporarily unavailable.'} />
    </section>
  );
}

function InspirationWidget({ context }: { context: PostLoginContext | null }) {
  const copy = context?.inspiration;
  return (
    <section className="tech-widget size-standard v116-widget v116-inspiration" data-widget-id="daily-inspiration-v116" aria-label="Daily inspiration">
      <WidgetHeader icon={<Sparkles size={19} />} kicker="DAILY FOCUS" title={copy?.title || 'A clear start'} detail="Refreshed daily" />
      <blockquote>{copy?.message || 'Start with the work that removes the biggest obstacle for the team.'}</blockquote>
      <div className="v116-focus-action"><Lightbulb size={16} aria-hidden="true" /><span>{copy?.action || 'Choose one measurable outcome for today.'}</span></div>
    </section>
  );
}

function WeatherGlyph({ description, isDay }: { description?: string; isDay?: boolean | null }) {
  const value = (description || '').toLowerCase();
  if (/rain|shower|storm|drizzle/.test(value)) return <CloudRain size={42} strokeWidth={1.6} />;
  if (/cloud|overcast|haze|mist|fog/.test(value)) return isDay === false ? <Cloud size={42} strokeWidth={1.6} /> : <CloudSun size={42} strokeWidth={1.6} />;
  return isDay === false ? <Cloud size={42} strokeWidth={1.6} /> : <Sun size={42} strokeWidth={1.6} />;
}

function WeatherWidget({ weather, loading, onRefresh }: {
  weather: WeatherContext | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const available = weather?.available === true;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const currentTime = new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(now);
  const currentDate = new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long',
  }).format(now);
  return (
    <section className="tech-weather compact v116-weather" aria-label="Current Ibadan weather">
      <header>
        <span className="p-kicker"><MapPin size={13} /> IBADAN</span>
        <button className="v116-icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh weather">
          <RefreshCw size={15} className={loading ? 'v116-spinning' : undefined} />
        </button>
      </header>
      <h2>{currentTime} <small>Africa/Lagos</small></h2>
      <p>{currentDate}</p>
      <div className="tech-temperature v116-temperature">
        <span className="v116-weather-glyph" aria-hidden="true"><WeatherGlyph description={weather?.description} isDay={weather?.isDay} /></span>
        <strong>{available && weather.temperature != null ? `${Math.round(weather.temperature)}°` : '—'}</strong>
        <span>{available ? weather.description || 'Current conditions' : loading ? 'Loading current weather' : 'Weather provider not connected'}
          <small>{available && weather.apparentTemperature != null ? `Feels like ${Math.round(weather.apparentTemperature)}°C` : 'No estimated reading'}</small>
        </span>
      </div>
      <div className="tech-weather-facts v116-weather-facts">
        <span><Droplets size={16} />{available && weather.humidity != null ? `${Math.round(weather.humidity)}% humidity` : 'Humidity —'}</span>
        <span><Wind size={16} />{available && weather.windSpeed != null ? `${Math.round(weather.windSpeed)} km/h` : 'Wind —'}</span>
        <span><CloudRain size={16} />{available && weather.precipitationProbability != null ? `${Math.round(weather.precipitationProbability)}% rain` : 'Rain —'}</span>
      </div>
      <small className="v116-provider-state">{available ? `${weather.provider || 'Weather service'} · ${timeAgo(weather.fetchedAt || null)}` : 'Live readings appear when the configured provider is available.'}</small>
    </section>
  );
}

function ConstructionViewToggle({ simple, onToggle }: { simple: boolean; onToggle: () => void }) {
  return (
    <button
      className="v116-construction-view-toggle"
      type="button"
      aria-pressed={simple}
      aria-label={simple ? 'Show full Construction detail' : 'Use simplified Construction view'}
      onClick={onToggle}
    >
      <BriefcaseBusiness size={15} aria-hidden="true" />
      <span>{simple ? 'Full detail' : 'Simple view'}</span>
    </button>
  );
}

export default function LivePostLoginEnhancementsV116() {
  const targets = useMountTargets();
  const [context, setContext] = useState<PostLoginContext | null>(null);
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [constructionSimple, setConstructionSimple] = useState(true);

  const loadContext = useCallback(async () => {
    setLoadingContext(true);
    try {
      const response = await fetch('/api/context/postlogin', { credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Post-login context request failed: ${response.status}`);
      const payload: unknown = await response.json();
      setContext(normalizePostLoginContext(payload));
    } catch { setContext(null); }
    finally { setLoadingContext(false); }
  }, []);

  const loadWeather = useCallback(async () => {
    setLoadingWeather(true);
    try {
      const response = await fetch(`/api/context/weather?${IBADAN_WEATHER_QUERY}`, { credentials: 'same-origin', headers: { accept: 'application/json' } });
      setWeather(await response.json() as WeatherContext);
    } catch { setWeather({ available: false, providerStatus: 'provider_unavailable' }); }
    finally { setLoadingWeather(false); }
  }, []);

  useEffect(() => {
    void loadContext();
    void loadWeather();
    const contextTimer = window.setInterval(() => { if (!document.hidden) void loadContext(); }, 10 * 60_000);
    const weatherTimer = window.setInterval(() => { if (!document.hidden) void loadWeather(); }, 5 * 60_000);
    return () => { window.clearInterval(contextTimer); window.clearInterval(weatherTimer); };
  }, [loadContext, loadWeather]);

  useEffect(() => {
    const main = targets.constructionMain;
    if (!main) return;
    main.dataset.constructionView = constructionSimple ? 'simple' : 'full';
    return () => { delete main.dataset.constructionView; };
  }, [targets.constructionMain, constructionSimple]);

  useEffect(() => {
    const button = document.querySelector<HTMLButtonElement>('button.p-weather-chip[aria-label^="Open Weather status"]');
    if (!button || weather?.available !== true || weather.temperature == null) return;
    const temperature = Math.round(weather.temperature);
    const description = weather.description || 'Current conditions';
    button.setAttribute('aria-label', `Open Weather status, ${description}, ${temperature} degrees Celsius`);
    button.dataset.providerState = 'connected';
    button.dataset.weatherUnit = 'C';
    const reading = button.querySelector<HTMLSpanElement>('span');
    if (reading) reading.textContent = `${temperature}°C`;
  }, [weather]);

  const dashboardWidgets = useMemo(() => (
    <>
      <NewsWidget context={context} loading={loadingContext} onRefresh={loadContext} />
      <IntelligenceWidget context={context} loading={loadingContext} onRefresh={loadContext} />
      <InspirationWidget context={context} />
    </>
  ), [context, loadingContext, loadContext]);

  return (
    <>
      {targets.dashboard ? createPortal(dashboardWidgets, targets.dashboard) : null}
      {targets.weather ? createPortal(<WeatherWidget weather={weather} loading={loadingWeather} onRefresh={loadWeather} />, targets.weather) : null}
      {targets.constructionToolbar ? createPortal(
        <ConstructionViewToggle simple={constructionSimple} onToggle={() => setConstructionSimple((value) => !value)} />,
        targets.constructionToolbar,
      ) : null}
    </>
  );
}
