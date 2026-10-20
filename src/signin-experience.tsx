import { forwardRef, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeId } from './theme-system';
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
    night: '/assets/global/toronto-day-v110.jpg',
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
    night: '/assets/global/moscow-day-v110.jpg',
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
  cacheAgeSeconds: number;
  unitsSystem: 'IMPERIAL' | 'METRIC';
  location: string;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  precipitationProbability: number | null;
  windSpeed: number | null;
  description: string;
};

const SIGNIN_WEATHER_CACHE_KEY = 'daenem:staffportal:signin-weather:ibadan:v1';
const SIGNIN_WEATHER_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function optionalWeatherNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeSignInWeather(value: unknown): SignInWeatherPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.available !== true ||
      (candidate.providerStatus !== 'fresh' && candidate.providerStatus !== 'cached') ||
      typeof candidate.fetchedAt !== 'string' || !Number.isFinite(Date.parse(candidate.fetchedAt))) return null;
  return {
    available: true,
    provider: typeof candidate.provider === 'string' && candidate.provider.trim() ? candidate.provider.trim() : 'Google Weather',
    providerStatus: candidate.providerStatus,
    fetchedAt: candidate.fetchedAt,
    cacheAgeSeconds: Math.max(0, optionalWeatherNumber(candidate.cacheAgeSeconds) || 0),
    unitsSystem: candidate.unitsSystem === 'IMPERIAL' ? 'IMPERIAL' : 'METRIC',
    location: typeof candidate.location === 'string' && candidate.location.trim() ? candidate.location.trim() : 'Ibadan',
    temperature: optionalWeatherNumber(candidate.temperature),
    apparentTemperature: optionalWeatherNumber(candidate.apparentTemperature),
    humidity: optionalWeatherNumber(candidate.humidity),
    precipitationProbability: optionalWeatherNumber(candidate.precipitationProbability),
    windSpeed: optionalWeatherNumber(candidate.windSpeed),
    description: typeof candidate.description === 'string' && candidate.description.trim() ? candidate.description.trim() : 'Current conditions',
  };
}

function readCachedSignInWeather() {
  try {
    const raw = window.localStorage.getItem(SIGNIN_WEATHER_CACHE_KEY);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const record = stored as { savedAt?: unknown; payload?: unknown };
    if (typeof record.savedAt !== 'number' || !Number.isSafeInteger(record.savedAt) || record.savedAt <= 0) return null;
    const payload = normalizeSignInWeather(record.payload);
    if (!payload || Date.now() - Date.parse(payload.fetchedAt) > SIGNIN_WEATHER_CACHE_MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeCachedSignInWeather(payload: SignInWeatherPayload) {
  try {
    window.localStorage.setItem(SIGNIN_WEATHER_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch {
    // The live response remains usable when browser storage is unavailable.
  }
}

function setTrailingText(element: HTMLElement | null, value: string) {
  if (!element) return;
  const textNode = [...element.childNodes].reverse().find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = ` ${value}`;
  else element.insertAdjacentText('beforeend', ` ${value}`);
}

function weatherFreshness(payload: SignInWeatherPayload) {
  const ageSeconds = Math.max(payload.cacheAgeSeconds, Math.floor((Date.now() - Date.parse(payload.fetchedAt)) / 1000));
  if (ageSeconds < 60) return 'Updated just now';
  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`;
}

function applySignInWeather(root: HTMLElement, payload: SignInWeatherPayload, browserCached = false) {
  const card = root.querySelector<HTMLElement>('article[data-city-id="ibadan"]');
  const unit = payload.unitsSystem === 'IMPERIAL' ? '°F' : '°C';
  const speedUnit = payload.unitsSystem === 'IMPERIAL' ? 'mph' : 'km/h';
  const temperature = payload.temperature === null ? null : Math.round(payload.temperature);
  const summary = [...(card?.querySelectorAll<HTMLElement>('div, p, span') || [])]
    .find((node) => node.childElementCount === 0 && node.textContent?.trim() === 'Connecting to weather…');
  const summaryParts = [payload.description, temperature === null ? null : `${temperature}${unit}`, payload.humidity === null ? null : `Humidity ${Math.round(payload.humidity)}%`].filter(Boolean);
  if (summary) summary.textContent = summaryParts.join(' · ');
  if (card) {
    card.dataset.weather = 'available';
    card.dataset.weatherCondition = payload.description;
  }

  const cached = browserCached || payload.providerStatus === 'cached';
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-provider'), `${payload.provider} · ${cached ? 'Cached' : 'Live'}`);
  const intelligence = root.querySelector<HTMLElement>('.sp-weather-v145-intelligence-body');
  const intelligenceLine = [
    temperature === null ? payload.description : `${payload.description}, ${temperature}${unit}`,
    payload.apparentTemperature === null ? null : `feels like ${Math.round(payload.apparentTemperature)}${unit}`,
    payload.precipitationProbability === null ? null : `rain ${Math.round(payload.precipitationProbability)}%`,
    payload.windSpeed === null ? null : `wind ${Math.round(payload.windSpeed)} ${speedUnit}`,
  ].filter(Boolean).join(' · ');
  const intelligenceText = intelligence?.firstElementChild as HTMLElement | null;
  if (intelligenceText) intelligenceText.textContent = intelligenceLine;
  else if (intelligence) intelligence.textContent = intelligenceLine;

  const footerItems = root.querySelectorAll<HTMLElement>('.sp-weather-v145-footer > span');
  setTrailingText(footerItems[0] || null, `${payload.provider} · ${cached ? 'Cached' : 'Live'}`);
  if (footerItems[1]) footerItems[1].textContent = weatherFreshness(payload);

  const statusItem = [...root.querySelectorAll<HTMLElement>('.sp-status-rail > span')]
    .find((item) => item.querySelector('b')?.textContent?.trim() === 'Weather Data');
  const statusIndicator = statusItem?.querySelector<HTMLElement>('i') || null;
  if (statusIndicator) statusIndicator.className = cached ? 'is-warn' : 'is-good';
  setTrailingText(statusItem || null, cached ? 'Cached · refresh pending' : 'Live');
}

function applyUnavailableSignInWeather(root: HTMLElement) {
  setTrailingText(root.querySelector<HTMLElement>('.sp-weather-v175-provider'), 'Weather data unavailable');
  const statusItem = [...root.querySelectorAll<HTMLElement>('.sp-status-rail > span')]
    .find((item) => item.querySelector('b')?.textContent?.trim() === 'Weather Data');
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
    inner.replaceChildren(image);
    outer.replaceChildren(inner);
    imageLayer.replaceChildren(outer);
  } else {
    image = imageLayer.querySelector<HTMLImageElement>(':scope > img') || document.createElement('img');
    image.className = 'block h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.025]';
    imageLayer.replaceChildren(image);
  }
  image.loading = 'eager';
  image.decoding = 'async';
  if (image.getAttribute('src') !== media.src) image.src = media.src;
  const city = card.querySelector<HTMLElement>('.gw-city-name')?.textContent?.trim() || cityId;
  image.alt = `${city} at ${phase} (${media.mediaPhase} media)`;
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
    const date = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now);
    const comma = date.indexOf(',');
    const timeNode = card.querySelector<HTMLElement>('.gw-city-local-time');
    const dateNodes = card.querySelectorAll<HTMLElement>('.gw-city-digital > p');
    if (timeNode) timeNode.textContent = time;
    if (dateNodes[1]) dateNodes[1].textContent = date.slice(0, comma + 1);
    if (dateNodes[2]) dateNodes[2].textContent = date.slice(comma + 2);
    if (dateNodes[3]) {
      const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(now)
        .find((part) => part.type === 'timeZoneName')?.value || '';
      dateNodes[3].textContent = `${zone} · ${zoneName}`;
    }

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
    setAuthMount(mount);
    settleReferenceMotion(root);
    updateReferenceClocks(root, new Date());
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
    const cached = readCachedSignInWeather();
    if (cached) applySignInWeather(root, cached, true);

    const controller = new AbortController();
    // Six explicitly allowlisted global cities share the existing Google Weather
    // Worker provider/cache; stale or missing results are never fabricated.
    for (const cityId of ['toronto','london','newyork','moscow','tokyo','beijing']) {
      const card = root.querySelector<HTMLElement>(`[data-city-id="${cityId}"]`);
      if (!card) continue;
      const summary = [...card.querySelectorAll<HTMLElement>('div,p,span')]
        .find(node => node.childElementCount === 0 && /Connecting to weather/i.test(node.textContent || ''));
      if (!summary) continue;
      summary.textContent = 'Checking live weather…';
      void fetch(`/api/context/signin/weather?city=${cityId}`, { signal: controller.signal, headers: {accept:'application/json'} })
        .then(async response => {
          if (!response.ok) throw new Error('Weather provider unavailable');
          const payload = normalizeSignInWeather(await response.json());
          if (!payload) throw new Error('No usable weather data');
          const parts = [payload.description, payload.temperature === null ? null : `${Math.round(payload.temperature)}°C`, payload.humidity === null ? null : `Humidity ${Math.round(payload.humidity)}%`].filter(Boolean);
          summary.textContent = parts.join(' · ');
          card.dataset.weather = 'available';
        }).catch((error:unknown) => {
          if ((error as {name?:string})?.name !== 'AbortError') summary.textContent = 'Weather temporarily unavailable';
        });
    }
    void fetch('/api/context/signin/weather', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Sign-In weather is unavailable.');
      const payload = normalizeSignInWeather(await response.json());
      if (!payload) throw new Error('Sign-In weather response is invalid.');
      writeCachedSignInWeather(payload);
      applySignInWeather(root, payload);
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name !== 'AbortError' && !cached) applyUnavailableSignInWeather(root);
    });
    return () => controller.abort();
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
