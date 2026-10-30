/**
 * Authenticated handoff after the Owner-locked V180 Create Account email OTP.
 *
 * V180 already sends POST /api/auth/signup/verify but intentionally remains on
 * the Sign-In panel. The backend now issues a provisional HttpOnly session on
 * successful verification. We observe ONLY that specific form submission and
 * independently verify the canonical /api/auth/me result before opening the
 * workspace. No protected Sign-In sources, cookie values or OTPs are read here.
 */
import type { WorkforceContext } from './auth';

export type ProvisionalWorkspaceContext = WorkforceContext;

export interface ProvisionalHandoffOptions {
  probe?: (signal: AbortSignal) => Promise<ProvisionalWorkspaceContext | null>;
  attempts?: number;
  intervalMs?: number;
}

async function currentProvisionalContext(signal: AbortSignal): Promise<ProvisionalWorkspaceContext | null> {
  const response = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return null;
  const result = await response.json() as {
    authenticated?: boolean; context?: ProvisionalWorkspaceContext;
  };
  if (!result.authenticated) return null;
  return result.context || null;
}

export function observeProvisionalSignupHandoff(
  openWorkspace: (context: ProvisionalWorkspaceContext) => void,
  options: ProvisionalHandoffOptions = {},
): () => void {
  const probe = options.probe || currentProvisionalContext;
  const attempts = Math.max(1, Math.min(40, options.attempts ?? 20));
  const intervalMs = Math.max(0, Math.min(2500, options.intervalMs ?? 700));
  let disposed = false;
  let checking = false;
  let controller: AbortController | null = null;
  let delay: ReturnType<typeof setTimeout> | undefined;

  const onSubmit = (event: Event) => {
    const form = event.target;
    if (disposed || checking || !(form instanceof HTMLFormElement)) return;
    // Only the V180 email-OTP completion form qualifies. Password sign-in,
    // recovery, and optional WhatsApp phone-OTP actions must not trigger this.
    if (!form.classList.contains('usp-auth-form') ||
        !form.querySelector('.usp-auth-destination') ||
        !form.querySelector('input[autocomplete="one-time-code"]')) return;

    checking = true;
    controller = new AbortController();
    const signal = controller.signal;
    void (async () => {
      try {
        for (let i = 0; i < attempts && !disposed && !signal.aborted; i++) {
          await new Promise<void>(resolve => { delay = setTimeout(resolve, intervalMs); });
          if (disposed || signal.aborted) break;
          let context: ProvisionalWorkspaceContext | null = null;
          try { context = await probe(signal); } catch { /* retry boundedly */ }
          if (!context || context.employee?.status !== 'provisional') continue;
          const hasProvisionalRole = context.roles?.some(role => role.code === 'provisional');
          const profileLevel = context.permissions?.['profile.access'];
          if (!hasProvisionalRole || !['edit', 'approve', 'manage'].includes(profileLevel)) continue;
          if (disposed || signal.aborted) break;
          openWorkspace(context);
          break;
        }
      } finally {
        checking = false;
      }
    })();
  };

  document.addEventListener('submit', onSubmit, true);
  return () => {
    disposed = true;
    controller?.abort();
    if (delay !== undefined) clearTimeout(delay);
    document.removeEventListener('submit', onSubmit, true);
  };
}
