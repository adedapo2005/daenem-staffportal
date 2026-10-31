/**
 * Explicit Stage One routes backed by the canonical authenticated ERP APIs.
 * Everything else remains on the protected V115 reference until individually
 * integrated, verified and approved. Never treat fixture routes as live data.
 */
export type LiveErpRoute = 'forms' | 'facilities' | 'spend';

export function liveRouteForPath(path: string): LiveErpRoute | null {
  const pathname = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  const segments = pathname.split('/').filter(Boolean);
  const root = segments[0];
  const route = root === 'forms' || root === 'facilities' || root === 'spend'
    ? root : null;
  if (!route) return null;
  if (segments.length === 1) return route;
  if (segments.length === 2 && segments[1] === 'group') return route;
  if (segments.length === 3 && segments[1] === 'company' && segments[2]) return route;
  // Record-detail and unsupported nested routes belong to the preserved shell.
  // The authenticated bridge must not hide a surface that it cannot render.
  return null;
}
