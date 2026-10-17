"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Activity,
  Boxes,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Globe2,
  ShieldCheck,
  SunMedium,
  Sunrise,
  Sunset,
  Thermometer,
  Users,
  Wind,
} from "lucide-react";
import {
  currentActiveVisualMode,
  type UnifiedSignInThemeRecord,
} from "./signin-unified-registry";
import { publishedLabel } from "./deployment-metadata";
import "./webflow-home-signin.css";
import "./premium-daylight-signin-v1.css";

type City = {
  name: string;
  country: string;
  code: string;
  zone: string;
  temp: string;
  condition: string;
  feels: string;
  humidity: string;
  wind: string;
};

const cities: City[] = [
  {
    name: "Toronto",
    country: "Canada",
    code: "CA",
    zone: "America/Toronto",
    temp: "72°F",
    condition: "Mostly Sunny",
    feels: "70°",
    humidity: "58%",
    wind: "9 mph W",
  },
  {
    name: "London",
    country: "United Kingdom",
    code: "GB",
    zone: "Europe/London",
    temp: "66°F",
    condition: "Partly Cloudy",
    feels: "64°",
    humidity: "67%",
    wind: "11 mph SW",
  },
  {
    name: "New York",
    country: "United States",
    code: "US",
    zone: "America/New_York",
    temp: "75°F",
    condition: "Sunny",
    feels: "73°",
    humidity: "60%",
    wind: "8 mph NW",
  },
  {
    name: "Moscow",
    country: "Russia",
    code: "RU",
    zone: "Europe/Moscow",
    temp: "34°F",
    condition: "Light Snow",
    feels: "28°",
    humidity: "84%",
    wind: "6 mph E",
  },
  {
    name: "Tokyo",
    country: "Japan",
    code: "JP",
    zone: "Asia/Tokyo",
    temp: "54°F",
    condition: "Clear",
    feels: "52°",
    humidity: "63%",
    wind: "7 mph N",
  },
  {
    name: "Shanghai",
    country: "China",
    code: "CN",
    zone: "Asia/Shanghai",
    temp: "57°F",
    condition: "Clear",
    feels: "55°",
    humidity: "68%",
    wind: "6 mph NE",
  },
];

const weatherMetrics = [
  { label: "Feels Like", value: "—", Icon: Thermometer },
  { label: "Humidity", value: "—", Icon: Droplets },
  { label: "Wind", value: "—", Icon: Wind },
  { label: "Pressure", value: "—", Icon: Gauge },
  { label: "Visibility", value: "—", Icon: Eye },
  { label: "UV Index", value: "—", Icon: SunMedium },
  { label: "Air Quality", value: "—", Icon: Activity },
  { label: "Sunrise", value: "—", Icon: Sunrise },
  { label: "Sunset", value: "—", Icon: Sunset },
] as const;

function clock(now: Date, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);
}

function date(now: Date, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "long",
  }).format(now);
}

function compactDate(now: Date, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(now)
    .toUpperCase();
}

function isDay(now: Date, zone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= 6 && hour < 18;
}

function clockAngles(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return {
    hour: ((hour % 12) + minute / 60) * 30,
    minute: minute * 6,
  };
}

function Flag({ city }: { city: City }) {
  return (
    <span
      className="country-flag-pro"
      aria-label={`${city.country} flag`}
      data-country-code={city.code}
    >
      <span aria-hidden="true">{city.code}</span>
    </span>
  );
}

export function WebflowHomeSignIn({
  now,
  auth,
  record,
  onInstall,
}: {
  now: Date;
  auth: ReactNode;
  record: UnifiedSignInThemeRecord;
  onInstall: () => void;
}) {
  // Public Home rendering reads the approved project configuration only. V36
  // has no safe shared persistence binding, so the registry returns the
  // immutable daytime fallback and browser preview storage is ignored here.
  const mode = currentActiveVisualMode();
  const ibadanTime = useMemo(() => clock(now, "Africa/Lagos"), [now]);
  const dayAsset = record.BACKGROUND.src;
  const nightAsset =
    record.NIGHT_BACKGROUND?.src || "/assets/webflow-home/night-4k.jpg";

  return (
    <main
      className={`erp-shell ${mode === "night" ? "is-night" : "is-day"}`}
      data-login-theme="webflow-home-default"
      data-default-signin="webflow-home"
      data-visual-mode={mode}
      data-webflow-source-site="6aa97ee8b7b32e580617b181"
      data-webflow-source-page="6aa97ee9b7b32e580617b18e"
      data-webflow-home-day-asset={record.BACKGROUND.assetId}
      data-webflow-home-night-asset={record.NIGHT_BACKGROUND?.assetId}
    >
      <img
        className="erp-bg"
        src={dayAsset}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
      />
      <img
        className="erp-bg-night"
        src={nightAsset}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
      <div className="erp-tint" aria-hidden="true" />

      <header className="erp-header">
        <div className="brand-card">
          <img className="brand-mark" src="/brand-assets/logo-mark.svg" alt="" />
          <div className="brand-core">
            <span className="brand-title-1">DAENEM GROUP</span>
            <span className="brand-subtitle">STAFF PORTAL</span>
            <span className="brand-tagline-1">
              Technology That Transforms Tomorrow.
            </span>
          </div>
        </div>
        <div className="header-actions">
          <span className="status-pill">
            <i aria-hidden="true" /> Staff Access
          </span>
          <button className="install-pill" type="button" onClick={onInstall}>
            ⇩ Install App
          </button>
        </div>
      </header>

      <section className="hero-grid" aria-label="Staff Portal sign-in overview">
        <article className="weather-card">
          <div className="weather-head">
            <span className="weather-place">
              <CloudSun size={17} aria-hidden="true" />⌖ Ibadan, Nigeria
            </span>
            <span className="day-chip">
              <SunMedium size={14} aria-hidden="true" /> Local Time
            </span>
          </div>
          <div className="weather-main-1">
            <div className="weather-time-block">
              <span className="ibadan-time">{ibadanTime}</span>
              <span className="ibadan-date">{date(now, "Africa/Lagos")}</span>
            </div>
            <div className="weather-temp">
              <span className="temp-value">—°F</span>
              <span className="temp-row">
                <CloudSun className="weather-icon" size={22} aria-hidden="true" />
                <span className="temp-condition">Weather unavailable</span>
              </span>
              <span className="weather-viz" aria-hidden="true">
                <svg viewBox="0 0 120 64" role="presentation">
                  <path d="M10 48h100" />
                  <path d="M22 48c8-19 18-28 30-28 10 0 17 5 22 14 3-3 7-5 12-5 9 0 15 7 16 19" />
                  <circle cx="39" cy="20" r="9" />
                  <path d="M39 6v-4M39 38v-4M25 20h-4M57 20h-4M29 10l-3-3M49 30l-3-3M49 10l3-3M29 30l-3 3" />
                </svg>
              </span>
            </div>
          </div>
          <div className="weather-metrics-1">
            {weatherMetrics.map(({ label, value, Icon }) => (
              <span className="metric-1" key={label}>
                <span className="metric-icon" aria-hidden="true">
                  <Icon size={15} strokeWidth={1.7} />
                </span>
                <span className="metric-label-1">{label}</span>
                <span className="metric-value-1-2">{value}</span>
              </span>
            ))}
          </div>
        </article>

        <section className="hero-copy">
          <span className="hero-kicker">
            PEOPLE · OPERATIONS · PLACES · A SMARTER TOMORROW
          </span>
          <h1 className="hero-title">DAENEM GLOBAL BUSINESS OS</h1>
          <span className="hero-subtitle">ONE LOGIN. A UNIFIED WORLD.</span>
          <p className="hero-text">
            Secure access to applications, data and intelligent workflows anywhere
            in the world.
          </p>
          <div className="hero-pillars">
            <span className="pillar">
              <Globe2 className="pillar-icon-v2" aria-hidden="true" />
              <span className="pillar-copy">GLOBAL<br />OPERATIONS</span>
            </span>
            <span className="pillar">
              <Users className="pillar-icon-v2" aria-hidden="true" />
              <span className="pillar-copy">SMART<br />PEOPLE</span>
            </span>
            <span className="pillar">
              <Boxes className="pillar-icon-v2" aria-hidden="true" />
              <span className="pillar-copy">INTEGRATED<br />SYSTEMS</span>
            </span>
            <span className="pillar">
              <ShieldCheck className="pillar-icon-v2" aria-hidden="true" />
              <span className="pillar-copy">SECURE<br />BY DESIGN</span>
            </span>
          </div>
          <svg className="hero-globe" viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <radialGradient id="hero-globe-gradient" cx="35%" cy="30%">
                <stop offset="0" stopColor="#e7f5ff" stopOpacity=".55" />
                <stop offset=".35" stopColor="#6fb8ff" stopOpacity=".28" />
                <stop offset="1" stopColor="#2d61c9" stopOpacity=".05" />
              </radialGradient>
            </defs>
            <circle cx="60" cy="60" r="45" fill="url(#hero-globe-gradient)" />
            <g fill="none" stroke="#2e73c7" strokeOpacity=".46" strokeWidth="1">
              <ellipse cx="60" cy="60" rx="45" ry="17" />
              <ellipse cx="60" cy="60" rx="45" ry="30" />
              <ellipse cx="60" cy="60" rx="17" ry="45" />
              <ellipse cx="60" cy="60" rx="30" ry="45" />
              <path d="M21 60h78M60 15v90" />
            </g>
            <circle cx="34" cy="48" r="2.2" fill="#2d83d4" />
            <circle cx="77" cy="73" r="2.4" fill="#2d83d4" />
            <circle cx="68" cy="35" r="1.8" fill="#7aa6ff" />
          </svg>
        </section>

        <aside className="auth-card" data-home-auth-card="true">
          {auth}
        </aside>
      </section>

      <section className="global-ribbon" aria-label="Global Operations">
        <header className="global-head-1">
          <span className="global-title-1">GLOBAL OPERATIONS · LIVE TIME · WEATHER · CONDITIONS</span>
          <span className="global-note-1">6 REGIONS · LIVE LOCAL CONTEXT</span>
        </header>
        <div className="city-grid-1">
          {cities.map((city) => {
            const day = isDay(now, city.zone);
            const angles = clockAngles(now, city.zone);
            return (
              <article
                className={`city-card-1 ${day ? "day-city" : "night-city"}`}
                data-city={city.name}
                data-country={city.code}
                data-timezone={city.zone}
                aria-label={`${city.name}, ${city.country} live local time and weather`}
                key={city.name}
              >
                <div
                  className={`clock-face ${day ? "clock-day" : "clock-night"}`}
                  aria-hidden="true"
                  style={{
                    "--city-hour-angle": `${angles.hour}deg`,
                    "--city-minute-angle": `${angles.minute}deg`,
                  } as CSSProperties}
                >
                  <span className="clock-12-1">12</span>
                  <span className="clock-3-1">3</span>
                  <span className="clock-6-1">6</span>
                  <span className="clock-9-1">9</span>
                  <span className="clock-hand-hour" />
                  <span className="clock-hand-minute" />
                  <span className="clock-pin-1-2" />
                </div>
                <div className="city-info-1">
                  <div className="city-top">
                    <span className="city-place">
                      <Flag city={city} />
                      <span className="city-name">{city.name}, {city.country}</span>
                    </span>
                    <span className={day ? "time-chip-day" : "time-chip-night"}>
                      {day ? "☀ Daytime" : "☾ Nighttime"}
                    </span>
                  </div>
                  <span className="city-time-1-2">{clock(now, city.zone)}</span>
                  <span className="city-date">{compactDate(now, city.zone)}</span>
                  <span className="city-weather-1">
                    {day ? "☀" : "☾"} {city.temp} <span className="city-condition">{city.condition}</span>
                  </span>
                  <span className="city-stats">Feels {city.feels} · Hum {city.humidity} · Wind {city.wind}</span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="erp-footer">
        <span>© 2026 Daenem Group. All rights reserved.</span>
        <span>{publishedLabel()}</span>
        <span>Privacy · Terms · Support · Technology That Transforms Tomorrow.</span>
      </footer>
    </main>
  );
}
