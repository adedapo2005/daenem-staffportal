/**
 * Explicit Stage One routes backed by the canonical authenticated ERP APIs.
 * Everything else remains on the protected V115 reference until individually
 * integrated, verified and approved. Never treat fixture routes as live data.
 */
export type LiveErpRoute = 'forms' | 'facilities' | 'spend';

export function liveRouteForPath(path: string): LiveErpRoute | null {
  const pathRoot = path.split('?')[0].split('/').filter(Boolean)[0];
  return pathRoot === 'forms' || pathRoot === 'facilities' || pathRoot === 'spend'
    ? pathRoot : null;
}
