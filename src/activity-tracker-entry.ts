// A deliberately small, privacy-preserving signal. Formal business/security audit
// events belong to the authenticated server-side write that performs the action.
type AuthMe = { authenticated?: boolean; context?: { employee?: { id?: string } } };
type RouteScope = '/staff' | '/workspace' | '/app';
type SafeControl = 'save' | 'download' | 'export' | 'approve' | 'reject' | 'publish';

const APPROVED_CONTROLS = new Set<SafeControl>([
  'save', 'download', 'export', 'approve', 'reject', 'publish',
]);

let authenticated = false;
let authorityGeneration = 0;
let lastSent = '';
let lastSentAt = 0;

function invalidateAuthority() {
  authorityGeneration += 1;
  authenticated = false;
  lastSent = '';
  lastSentAt = 0;
}

// Never send a raw URL, query, record ID or tenant path. Unknown and public
// routes have no client telemetry at all.
function routeScope(pathname: string): RouteScope | null {
  if (pathname === '/app.html') return '/app';
  const firstSegment = pathname.split('/')[1]?.toLowerCase();
  if (firstSegment === 'staff') return '/staff';
  if (firstSegment === 'workspace') return '/workspace';
  if (firstSegment === 'app') return '/app';
  return null;
}

// This read MUST NOT use the shared 15-second /api/auth/me client cache.
// Each refresh invalidates earlier responses; a late successful response cannot
// re-enable collection after logout, scope change or a newer auth check.
async function refreshAuth() {
  invalidateAuthority();
  const generation = authorityGeneration;
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET', cache: 'no-store', credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return;
    const result = await response.json() as AuthMe;
    if (generation !== authorityGeneration) return;
    authenticated = result.authenticated === true
      && typeof result.context?.employee?.id === 'string'
      && result.context.employee.id.length > 0;
  } catch {
    // Fail closed on unavailable/revoked auth. Offline cached identity is
    // never sufficient authority to create an activity event.
  }
}

function send(control: SafeControl, tag: 'button' | 'a') {
  if (!authenticated) return;
  const path = routeScope(window.location.pathname);
  if (!path) return;
  const metadata = { control, tag };
  const signature = `${path}:${control}:${tag}`;
  const now = Date.now();
  if (signature === lastSent && now - lastSentAt < 1200) return;
  lastSent = signature;
  lastSentAt = now;
  // Only fixed tokens leave the browser. The Worker MUST independently
  // revalidate the live session/permission and reject unapproved values.
  void fetch('/api/activity/record', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    keepalive: false,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ module: 'portal', action: 'click', path, metadata }),
  }).catch(() => undefined);
}

function onApprovedClick(event: MouseEvent) {
  if (!authenticated || !(event.target instanceof Element)) return;
  const target = event.target.closest('button,a,[role="button"]');
  if (!target || target.closest('.signin-page,.owner-change-card,.temporary-password-change-card')) return;
  const form = target.closest('form');
  if (form?.querySelector('input[type="password"],input[type="hidden"],input[autocomplete="one-time-code"],textarea')) return;

  const tag = target.tagName.toLowerCase();
  if (tag !== 'button' && tag !== 'a') return;
  // Read labels locally only to select an exact, finite action token.
  // Never transmit free text, label/title content, IDs, classes or form values.
  const label = (target.getAttribute('aria-label') || target.getAttribute('title') || target.textContent || '')
    .trim().toLowerCase();
  if (!APPROVED_CONTROLS.has(label as SafeControl)) return;
  send(label as SafeControl, tag);
}

void refreshAuth();
window.addEventListener('focus', () => { void refreshAuth(); });
window.addEventListener('pageshow', () => { void refreshAuth(); });
window.addEventListener('pagehide', invalidateAuthority);
window.addEventListener('daenem-auth-changed', invalidateAuthority);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') invalidateAuthority();
  else void refreshAuth();
});
document.addEventListener('click', onApprovedClick, true);
// No global form-submit, raw page-view, online/offline or arbitrary clickstream
// capture. Sensitive record/workflow audit is server-owned and role-scoped.
