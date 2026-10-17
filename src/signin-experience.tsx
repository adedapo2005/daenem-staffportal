import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ThemeId } from './theme-system';
import approvedSignInMarkup from './approved-signin-v180/reference-v180.html?raw';

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

function updateReferenceClocks(root: HTMLElement, now: Date) {
  root.querySelectorAll<HTMLElement>('[data-city-id]').forEach((card) => {
    const zone = cityZones[card.dataset.cityId || ''];
    if (!zone) return;
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
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [authMount, setAuthMount] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!root) return;
    const mount = root.querySelector<HTMLElement>('#staffportal-auth-mount');
    setAuthMount(mount);
    updateReferenceClocks(root, new Date());
  }, [root]);

  useEffect(() => {
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
  }, [root, onInstall]);

  useEffect(() => {
    if (!authMount) return;
    authMount.classList.remove('sp-auth-mode-signin', 'sp-auth-mode-create', 'sp-auth-mode-forgot');
    authMount.classList.add(`sp-auth-mode-${authMode === 'signup' ? 'create' : authMode}`);
    authMount.dataset.authGateway = 'cloudflare-worker';
    authMount.dataset.approvedProject = APPROVED_SIGNIN.project;
    authMount.dataset.approvedVersion = String(APPROVED_SIGNIN.version);
    authMount.dataset.sourceCommit = APPROVED_SIGNIN.commit;
  }, [authMount, authMode]);

  return <>
    <link rel="stylesheet" href="/approved-signin-v180.css" />
    <div ref={setRoot} className="sp-approved-signin-host" dangerouslySetInnerHTML={{ __html: approvedSignInMarkup }} />
    {authMount ? createPortal(authPanel, authMount) : null}
  </>;
}
