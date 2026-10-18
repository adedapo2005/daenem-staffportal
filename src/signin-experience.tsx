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
    day: '/assets/global/toronto-day-v115-card.jpg',
    night: '/assets/global/toronto-night-v180-card.webp',
  },
  london: {
    day: '/assets/global/london-day-v115-card.jpg',
    night: '/assets/global/london-night-v180-card.webp',
  },
  newyork: {
    dawn: '/assets/global/newyork-dawn-v179-card.webp',
    day: '/assets/global/newyork-day-v179-card.webp',
    dusk: '/assets/global/newyork-dusk-v179-card.webp',
    night: '/assets/global/newyork-night-v179-card.webp',
  },
  moscow: {
    day: '/assets/global/moscow-day-v115-card.jpg',
    night: '/assets/global/moscow-night-v180-card.webp',
  },
  tokyo: { day: '/assets/global/tokyo-day-v115-card.jpg' },
  beijing: {
    day: '/assets/global/beijing-day-v115-card.jpg',
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

function phaseAt(now: Date, zone: string): 'dawn' | 'day' | 'dusk' | 'night' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

function resolvedMedia(cityId: string, phase: 'dawn' | 'day' | 'dusk' | 'night') {
  const media = cityMedia[cityId] || {};
  const order = phase === 'dawn' ? ['dawn', 'day', 'night'] as const : phase === 'dusk' ? ['dusk', 'night', 'day'] as const : [phase] as const;
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

const ApprovedSignInSource = memo(forwardRef<HTMLDivElement>(function ApprovedSignInSource(_, ref) {
  return <div ref={ref} className="sp-approved-signin-host" dangerouslySetInnerHTML={{ __html: approvedSignInMarkup }} />;
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
