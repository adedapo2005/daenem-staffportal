/**
 * Exact post-login paths intercepted by the authenticated Stage One bridge.
 * Forms detail links are captured only to show a safe unavailable state until
 * live detail rendering is integrated; a fixture record must never appear live.
 */
export type LiveErpRoute = 'forms' | 'facilities' | 'spend' | 'sync';

function pathnameFor(path: string) {
  return path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
}

export function liveRouteForPath(path: string): LiveErpRoute | null {
  const pathname = pathnameFor(path);
  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0];
  if (root === 'sync') return segments.length === 1 ? 'sync' : null;
  const route = root === 'forms' || root === 'facilities' || root === 'spend'
    ? root : null;
  if (!route) return null;
  if (segments.length === 1) return route;
  if (segments.length === 2 && segments[1] === 'group') return route;
  if (segments.length === 3 && segments[1] === 'company' && segments[2]) return route;
  // Forms details are intercepted so a legacy demo record cannot masquerade
  // as live data. The bridge presents a truthful link state until detail APIs
  // are integrated. Other unsupported nested routes remain on the snapshot.
  if (route === 'forms' && segments.length === 2
      && segments[1] !== 'company' && segments[1] !== 'group') return route;
  return null;
}

export function isLiveFormDetailPath(path: string): boolean {
  const segments = pathnameFor(path).split('/').filter(Boolean);
  return segments.length === 2 && segments[0] === 'forms'
    && segments[1] !== 'company' && segments[1] !== 'group';
}
