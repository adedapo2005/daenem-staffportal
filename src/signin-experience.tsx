import { useEffect, useState, type ReactNode } from 'react';
import {
  CloudSun, Download, Globe2, HeartHandshake, MapPin, Newspaper,
  Radar, ShieldCheck, Sparkles, Wifi,
} from 'lucide-react';
import type { ThemeId } from './theme-system';

const APPROVED_SIGNIN = Object.freeze({
  project: 'appgprj_6abbab3d45848191b6344993cc010bd7',
  version: 180,
  commit: '523474f7b839919c258da85be6fcf53edd38810d',
});

const information = [
  { id: 'news', title: 'Nigeria News', eyebrow: 'LIVE NIGERIA DESK', detail: 'Current national context from connected sources.', image: '/assets/left-widgets/news/01-day.webp', icon: Newspaper },
  { id: 'intelligence', title: 'Nigerian Intelligence', eyebrow: 'EXECUTIVE BRIEFING', detail: 'A measured view across security, economy and infrastructure.', image: '/assets/left-widgets/intelligence/01-day.webp', icon: Radar },
  { id: 'spotlight', title: 'Daily Spotlight', eyebrow: 'DAENEM IN FOCUS', detail: 'The people, standards and work shaping today.', image: '/assets/left-widgets/spotlight/01-day.webp', icon: Sparkles },
  { id: 'inspiration', title: 'Employee Inspiration', eyebrow: 'ONE TEAM', detail: 'A clear thought for purposeful work and professional growth.', image: '/assets/left-widgets/inspiration/01-day.webp', icon: HeartHandshake },
];

const cities = [
  { id: 'ibadan', city: 'Ibadan', country: 'Nigeria', flag: '🇳🇬', zone: 'Africa/Lagos', image: '/assets/global/newyork-night-v179-card.webp' },
  { id: 'toronto', city: 'Toronto', country: 'Canada', flag: '🇨🇦', zone: 'America/Toronto', image: '/assets/global/toronto-day-v115-card.jpg' },
  { id: 'london', city: 'London', country: 'United Kingdom', flag: '🇬🇧', zone: 'Europe/London', image: '/assets/global/london-day-v115-card.jpg' },
  { id: 'newyork', city: 'New York', country: 'United States', flag: '🇺🇸', zone: 'America/New_York', image: '/assets/global/newyork-day-v179-card.webp' },
  { id: 'moscow', city: 'Moscow', country: 'Russia', flag: '🇷🇺', zone: 'Europe/Moscow', image: '/assets/global/moscow-day-v115-card.jpg' },
  { id: 'tokyo', city: 'Tokyo', country: 'Japan', flag: '🇯🇵', zone: 'Asia/Tokyo', image: '/assets/global/tokyo-day-v115-card.jpg' },
];

type Weather = { temperature?: number; description?: string; humidity?: number; windSpeed?: number; loading: boolean };

function timeAt(zone: string, now: Date, seconds = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }).format(now);
}

function dateAt(zone: string, now: Date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(now);
}

function localHour(zone: string, now: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(now));
}

function phaseAt(zone: string, now: Date) {
  const hour = localHour(zone, now);
  if (hour < 6) return 'Night';
  if (hour < 9) return 'Dawn';
  if (hour < 18) return 'Day';
  if (hour < 21) return 'Dusk';
  return 'Night';
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`sp-adapter-brand ${compact ? 'is-compact' : ''}`}><img src="/brand-assets/logo-mark.svg" alt="" /><span>DAENEM<small>Staff Portal</small></span></div>;
}

function InformationRail() {
  return <aside id="staff-primary-information" className="sp-information-rail" aria-label="News and staff highlights">
    {information.map(({ id, title, eyebrow, detail, image, icon: Icon }, index) => <article className="sp-adapter-information-card" data-widget={id} key={id}>
      <img src={image} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" /><span className="sp-adapter-information-scrim" aria-hidden="true" />
      <header><Icon size={17} /><span>{title}</span><em>0{index + 1}</em></header>
      <div><small>{eyebrow}</small><h2>{title}</h2><p>{detail}</p><b><i /> Live context</b></div>
    </article>)}
  </aside>;
}

function Hero({ onInstall }: { onInstall: () => void }) {
  return <section className="sp-hero" aria-label="DAENEM Staff Portal" data-hero-mode="day">
    <div className="sp-hero-scene sp-adapter-hero-scene" style={{ backgroundImage: 'url("/assets/staffportal-hero/executive-headquarters-day.webp")' }} />
    <div className="sp-hero-grid" /><div className="sp-hero-scrim" />
    <button type="button" className="sp-install-app sp-install-app-hero" onClick={onInstall}><Download size={19} /><span><b>Install StaffPortal</b><small>Fast Access From Your Home Screen</small></span><em>SHORTCUT</em></button>
    <div className="sp-hero-content">
      <div className="sp-hero-brand-stage"><Brand /></div>
      <p className="sp-hero-kicker"><Wifi size={14} /> DAENEM · LIVE WORKSPACE</p>
      <h1>One Secure Workspace.<br /><span>Live On Every Device.</span></h1>
      <p className="sp-hero-summary">Real-Time Access, Global Context, And Role-Protected ERP Tools, Connected Through One Premium Employee Portal.</p>
      <div className="sp-hero-trust"><span><ShieldCheck size={15} /> Protected Access</span><span><Globe2 size={15} /> Role-Aware ERP</span><span><MapPin size={15} /> Ibadan Daenem Office Complex</span></div>
    </div>
    <div className="sp-hero-pagination" aria-label="Hero Scene Selector">{Array.from({ length: 5 }, (_, index) => <button type="button" className={index === 0 ? 'is-active' : ''} aria-label={`Hero scene ${index + 1}`} key={index} />)}</div>
  </section>;
}

function AnalogClock({ zone, now }: { zone: string; now: Date }) {
  const hour = localHour(zone, now) % 12;
  const minute = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, minute: '2-digit' }).format(now));
  const second = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, second: '2-digit' }).format(now));
  return <svg viewBox="0 0 120 120" className="sp-adapter-clock" aria-hidden="true"><circle cx="60" cy="60" r="56" className="clock-face" />{Array.from({ length: 12 }, (_, index) => <line key={index} x1="60" x2="60" y1="8" y2="15" transform={`rotate(${index * 30} 60 60)`} />)}<line x1="60" y1="63" x2="60" y2="34" className="hour" transform={`rotate(${hour * 30 + minute / 2} 60 60)`} /><line x1="60" y1="66" x2="60" y2="23" className="minute" transform={`rotate(${minute * 6} 60 60)`} /><line x1="60" y1="69" x2="60" y2="18" className="second" transform={`rotate(${second * 6} 60 60)`} /><circle cx="60" cy="60" r="4" /></svg>;
}

function GlobalOperations({ now }: { now: Date }) {
  return <section id="staff-global-operations" className="sp-global-panel sp-global-v82 sp-global-v83" aria-labelledby="sp-global-heading">
    <header className="sp-section-heading"><h2 id="sp-global-heading"><Globe2 size={17} /> Global Operations</h2><span className="sp-section-count">06 <small>Locations</small></span></header>
    <div className="sp-global-grid sp-global-grid-locations">{cities.map((city) => <article className="sp-adapter-city-card" key={city.id} style={{ backgroundImage: `linear-gradient(180deg,rgba(2,12,21,.08),rgba(2,12,21,.9)),url("${city.image}")` }}><header><span>{city.flag}</span><div><b>{city.city}</b><small>{city.country}</small></div><em>{phaseAt(city.zone, now)}</em></header><div className="sp-adapter-city-time"><AnalogClock zone={city.zone} now={now} /><div><strong>{timeAt(city.zone, now, true)}</strong><span>{dateAt(city.zone, now)}</span><small>{city.zone}</small></div></div><footer><CloudSun size={16} /><span>Local conditions</span><b>Provider context</b></footer></article>)}</div>
  </section>;
}

function LocalWeather({ now, weather }: { now: Date; weather: Weather }) {
  return <section className="sp-weather-card sp-staff-local-weather is-day" aria-label="Ibadan local weather"><div className="sp-staff-weather-bg sp-adapter-weather-bg" aria-hidden="true" /><div className="sp-staff-weather-scrim" aria-hidden="true" /><header className="sp-staff-weather-head"><div><p className="sp-eyebrow"><MapPin size={14} /> Nigeria Local Time</p><h2>Ibadan Office Complex</h2><span>Ibadan, Oyo State · Africa/Lagos</span></div><b>🇳🇬</b></header><div className="sp-staff-weather-main"><AnalogClock zone="Africa/Lagos" now={now} /><div className="sp-staff-weather-condition"><CloudSun size={44} /><div><span>Current Condition</span><b>{weather.loading ? 'Connecting…' : weather.description || 'Provider unavailable'}</b><strong>{typeof weather.temperature === 'number' ? `${Math.round(weather.temperature)}°C` : '—'}</strong></div></div><div className="sp-staff-weather-time"><strong>{timeAt('Africa/Lagos', now, true)}</strong><span>{dateAt('Africa/Lagos', now)}</span><b>Nigeria · West Africa Time</b><small>Africa/Lagos (GMT +1)</small></div></div><div className="sp-staff-weather-intel-title"><span>Live Weather Intelligence</span><small>StaffPortal provider</small></div><div className="sp-staff-weather-stats"><div className="sp-staff-weather-stat"><span>Humidity</span><strong>{typeof weather.humidity === 'number' ? `${Math.round(weather.humidity)}%` : '—'}</strong></div><div className="sp-staff-weather-stat"><span>Wind</span><strong>{typeof weather.windSpeed === 'number' ? `${Math.round(weather.windSpeed)} km/h` : '—'}</strong></div><div className="sp-staff-weather-stat"><span>Local phase</span><strong>{phaseAt('Africa/Lagos', now)}</strong></div></div><div className="sp-staff-weather-credit">Provider-backed live context · No invented readings</div></section>;
}

export function SignInExperience({ authPanel, onInstall }: { authPanel: ReactNode; themeId: ThemeId; onInstall: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Weather>({ loading: true });
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { ['/assets/staffportal-hero/executive-headquarters-day.webp', ...information.map((item) => item.image)].forEach((src) => { const image = new Image(); image.decoding = 'async'; image.src = src; }); }, []);
  useEffect(() => { const controller = new AbortController(); fetch('/api/context/weather?lat=7.3775&lon=3.9470', { credentials: 'include', cache: 'no-store', signal: controller.signal }).then(async (response): Promise<Omit<Weather, 'loading'>> => response.ok ? response.json() as Promise<Omit<Weather, 'loading'>> : Promise.reject(new Error('Weather unavailable'))).then((value) => setWeather({ ...value, loading: false })).catch(() => { if (!controller.signal.aborted) setWeather({ loading: false }); }); return () => controller.abort(); }, []);
  return <div className="sp-root sp-day sp-mode-day sp-accent-ocean sp-density-standard sp-auth-style-executive_frost" data-approved-signin="sites-v180" data-approved-project={APPROVED_SIGNIN.project} data-approved-version={APPROVED_SIGNIN.version} data-source-commit={APPROVED_SIGNIN.commit} data-sp-palette="day"><div className="sp-page-backdrop sp-page-backdrop-day" aria-hidden="true" /><div className="sp-page-backdrop-scrim" aria-hidden="true" /><main className="sp-layout sp-reference-layout"><InformationRail /><Hero onInstall={onInstall} /><GlobalOperations now={now} /><section className="sp-lower-right-rail sp-lower-right-rail-v86" aria-label="Ibadan weather and staff access"><div className="sp-auth-card sp-auth-v86 sp-auth-card-public sp-auth-gateway sp-adapter-auth-card" data-auth-gateway="cloudflare-worker"><div className="sp-auth-topline"><Brand compact /><span className="sp-secure-chip"><ShieldCheck size={14} /> Private Staff Access</span></div><div className="sp-adapter-real-auth" data-approved-auth-placement="true">{authPanel}</div></div><LocalWeather now={now} weather={weather} /></section></main><footer className="sp-system-status"><span><i /> LIVE</span><span>StaffPortal · Approved V180</span><span>Secure employee workspace</span><span>Cloudflare staging</span></footer></div>;
}
