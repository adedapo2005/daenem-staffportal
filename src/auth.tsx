import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck,
} from 'lucide-react';
import {
  readThemeId, themeById, type ThemeId,
} from './theme-system';
import { SignInExperience } from './signin-experience';
import { mountSignInLegacyFonts } from './signin-font-loader';
import { clearOfflineActiveEmployee, readCachedAuthContext, setOfflineActiveEmployee } from './offline-platform';
import {
  WORLD_CLOCKS, WORLD_CLOCK_CATALOG, readSignInPreferences, readWorldClockPreferences,
  type PortalLocation, type SignInAuthLabels, type WorldClockPreferences,
} from './signin-preferences';
export {
  WORLD_CLOCKS, WORLD_CLOCK_CATALOG, fetchAdminSignInPreferences, readSignInPreferences,
  readWorldClockPreferences, saveSignInPreferences, saveWorldClockPreferences,
  type ClockStyle, type SignInExperiencePreferences, type WorldClockPreferences,
} from './signin-preferences';

export type AccessLevel = 'none' | 'view' | 'create' | 'edit' | 'approve' | 'manage';
export type WorkforceContext = {
  sessionId: string;
  employee: {
    id: string; employeeNo?: string; displayName: string; email?: string; phone?: string;
    jobTitle?: string; department?: string; status: string; preferredTheme?: string; timezone?: string; team?: string; lastLoginAt?: string;
  };
  companies: Array<{ id: string; code: string; name: string; locationId?: string; primary: boolean }>;
  roles: Array<{ id: string; code: string; name: string; companyId: string }>;
  permissions: Record<string, AccessLevel>;
  companyPermissions?: Record<string, Record<string, AccessLevel>>;
};

export const accessLevelRank: Record<AccessLevel, number> = {
  none: 0, view: 1, create: 2, edit: 3, approve: 4, manage: 5,
};

export function permissionLevel(context: WorkforceContext, permission: string, companyId?: string | null) {
  if (companyId) return context.companyPermissions?.[companyId]?.[permission] || 'none';
  return context.permissions[permission] || 'none';
}

export function hasWorkforcePermission(
  context: WorkforceContext,
  permission: string,
  minimum: AccessLevel = 'view',
  companyId?: string | null,
) {
  return accessLevelRank[permissionLevel(context, permission, companyId)] >= accessLevelRank[minimum];
}

type ApiError = Error & { code?: string; status?: number; passwordErrors?: string[] };
type AppInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' | string }>;
};

let deferredAppInstallPrompt: AppInstallPromptEvent | null = null;
let appInstallListenersAttached = false;

function ensureAppInstallListener() {
  if (typeof window === 'undefined' || appInstallListenersAttached) return;
  appInstallListenersAttached = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredAppInstallPrompt = event as AppInstallPromptEvent;
    window.dispatchEvent(new Event('daenem:pwa-install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    deferredAppInstallPrompt = null;
    window.dispatchEvent(new Event('daenem:pwa-installed'));
  });
}

export async function requestAppInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  ensureAppInstallListener();
  const prompt = deferredAppInstallPrompt;
  if (!prompt) return 'unavailable';
  deferredAppInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

type Message = { type: 'error' | 'success' | 'info'; text: string; details?: string[]; action?: { label: string; onClick: () => void } };

type PasswordCheck = { label: string; ok: boolean; required?: boolean };
type PasswordPolicy = {
  minimumLength: number;
  maximumLength: number;
  requiresUppercase: boolean;
  requiresLowercase: boolean;
  requiresNumber: boolean;
  requiresSymbol: boolean;
};

const FALLBACK_PASSWORD_POLICY: PasswordPolicy = {
  minimumLength: 10, maximumLength: 128, requiresUppercase: true, requiresLowercase: true,
  requiresNumber: true, requiresSymbol: true,
};

type AuthMeResult = { authenticated: boolean; context?: WorkforceContext };
const AUTH_ME_CACHE_MS = 15_000;
let authMeCache: { expiresAt: number; value: AuthMeResult } | null = null;
let authMeRequest: Promise<AuthMeResult> | null = null;

export function clearPortalAuthCache() {
  authMeCache = null;
  authMeRequest = null;
}

function WhatsAppMark({ size = 20 }: { size?: number }) {
  return <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true" focusable="false">
    <path d="M16 3.2c-7 0-12.7 5.6-12.7 12.6 0 2.2.6 4.4 1.7 6.2l-1.8 6.8 7-1.8c1.8 1 3.8 1.5 5.8 1.5 7 0 12.7-5.6 12.7-12.6S23 3.2 16 3.2Z" fill="#25D366" />
    <path d="M22.2 18.6c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.8.2-.2.3-.9 1-1.1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-1-1.6-2.1-1.8-2.4-.2-.3 0-.5.1-.7.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2.1-.4 0-.6-.1-.2-.8-1.8-1-2.5-.2-.6-.5-.5-.8-.5h-.7c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7 0 1.6 1.2 3.2 1.3 3.4.2.2 2.3 3.5 5.6 4.8.8.3 1.4.5 1.9.6.8.3 1.6.2 2.2.1.7-.1 1.9-.8 2.1-1.6.3-.8.3-1.5.2-1.6-.1-.1-.3-.2-.6-.4Z" fill="white" />
  </svg>;
}

export function isNetworkTransportFailure(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (typeof status === 'number') return status === 0;
  return error instanceof TypeError || (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'NetworkError');
}

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let response: Response;
  try {
    response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  } catch (cause) {
    const error = new Error(cause instanceof Error ? cause.message : 'Network transport failed.') as ApiError;
    error.code = 'NETWORK_TRANSPORT';
    error.status = 0;
    throw error;
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(String(data.error || `Request failed (${response.status})`)) as ApiError;
    error.code = data.code ? String(data.code) : undefined;
    error.status = response.status;
    error.passwordErrors = Array.isArray(data.passwordErrors) ? data.passwordErrors.map(String) : undefined;
    throw error;
  }
  return data as T;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  if (path === '/api/auth/me' && method === 'GET') {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden' && authMeCache) return authMeCache.value as T;
    if (authMeCache && authMeCache.expiresAt > Date.now()) return authMeCache.value as T;
    if (!authMeRequest) {
      authMeRequest = requestJson<AuthMeResult>(path, options)
        .then((value) => {
          authMeCache = { value, expiresAt: Date.now() + AUTH_ME_CACHE_MS };
          return value;
        })
        .finally(() => { authMeRequest = null; });
    }
    return authMeRequest as Promise<T>;
  }

  if (path.startsWith('/api/auth/') && method !== 'GET') clearPortalAuthCache();
  return requestJson<T>(path, options);
}

export function useAuth() {
  const [context, setContext] = useState<WorkforceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const setAuthenticatedContext = (next: WorkforceContext | null) => {
    setContext(next);
    if (next) setOfflineActiveEmployee(next.employee.id);
    else clearOfflineActiveEmployee();
  };
  async function refresh() {
    try {
      const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
      setAuthenticatedContext(result.context || null);
    } catch (error) {
      const offline = isNetworkTransportFailure(error);
      if (offline) {
        const cached = await readCachedAuthContext();
        if (cached && typeof cached === 'object') {
          setAuthenticatedContext(cached as WorkforceContext);
          return;
        }
      }
      setAuthenticatedContext(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  async function logout() {
    setAuthenticatedContext(null);
    clearPortalAuthCache();
    window.dispatchEvent(new Event('daenem-auth-changed'));

    let timeout = 0;
    try {
      await Promise.race([
        api('/api/auth/logout', { method: 'POST', keepalive: true }).catch(() => undefined),
        new Promise<void>((resolve) => { timeout = window.setTimeout(resolve, 2500); }),
      ]);
    } finally {
      window.clearTimeout(timeout);
      window.location.replace('/');
    }
  }
  return { context, loading, refresh, logout, setContext: setAuthenticatedContext };
}
function deviceIdentity() {
  let id = localStorage.getItem('daenem-workforce-device-id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('daenem-workforce-device-id', id);
  }
  return {
    deviceFingerprint: id,
    deviceName: `${navigator.platform || 'Device'} · ${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Browser'}`,
    platform: navigator.platform || 'web',
  };
}

function passwordChecks(password: string, policy: PasswordPolicy, labels: SignInAuthLabels): PasswordCheck[] {
  return [
    { label: labels.passwordMinimumLength.replace('{min}', String(policy.minimumLength)), ok: password.length >= policy.minimumLength, required: true },
    { label: labels.passwordUppercase, ok: !policy.requiresUppercase || /[A-Z]/.test(password), required: policy.requiresUppercase },
    { label: labels.passwordLowercase, ok: !policy.requiresLowercase || /[a-z]/.test(password), required: policy.requiresLowercase },
    { label: labels.passwordNumber, ok: !policy.requiresNumber || /[0-9]/.test(password), required: policy.requiresNumber },
    { label: labels.passwordSymbol, ok: !policy.requiresSymbol || /[^A-Za-z0-9]/.test(password), required: policy.requiresSymbol },
  ];
}

function passwordPolicySatisfied(checks: PasswordCheck[]) {
  return checks.every((check) => !check.required || check.ok);
}

function identifierState(value: string): 'empty' | 'email' | 'username' | 'invalid' {
  const identifier = value.trim();
  if (!identifier) return 'empty';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) return 'email';
  if (/^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/i.test(identifier)) return 'username';
  return 'invalid';
}

function fieldPlaceholder(label: string, required = false) {
  return required ? `${label} • Required` : label;
}

function TextField({
  label, value, onChange, required = false, type = 'text', autoComplete, helper, statusText, statusTone, onBlur,
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean;
  type?: string; autoComplete?: string; helper?: string; statusText?: string; statusTone?: 'valid' | 'invalid'; onBlur?: () => void;
}) {
  return <label className="usp-field">
    <span className="usp-field-label">{label}{required ? ' *' : ''}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      autoComplete={autoComplete}
      placeholder={fieldPlaceholder(label, required)}
      aria-label={label}
      required={required}
    />
    {helper && <small className="usp-field-help">{helper}</small>}
    {statusText && <small className={`usp-identifier-status ${statusTone || 'neutral'}`} aria-live="polite"><i aria-hidden="true">{statusTone === 'valid' ? '✓' : '×'}</i>{statusText}</small>}
  </label>;
}

function PasswordField({
  label, value, onChange, autoComplete, show, setShow, showLabel, hideLabel, required = true,
}: {
  label: string; value: string; onChange: (value: string) => void; autoComplete: string;
  show: boolean; setShow: (value: boolean) => void; showLabel: string; hideLabel: string; required?: boolean;
}) {
  return <label className="usp-field">
    <span className="usp-field-label">{label}{required ? ' *' : ''}</span>
    <div className="usp-password-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={fieldPlaceholder(label, required)}
        aria-label={label}
        required={required}
      />
      <button type="button" className="usp-password-toggle" aria-label={show ? hideLabel : showLabel} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  </label>;
}

function PasswordStatus({ checks, password, label }: { checks: PasswordCheck[]; password: string; label: string }) {
  return <div className="usp-password-requirements" aria-label={label}>
    <strong>{label}</strong>
    <div className="usp-password-status">
      {checks.map((check) => <span key={check.label} className={!password ? 'neutral' : check.ok ? 'pass' : 'fail'}>
        <i aria-hidden="true">{!password ? '○' : check.ok ? '✓' : '×'}</i>
        <b>{check.label}</b>
      </span>)}
    </div>
  </div>;
}

function ConfirmPasswordStatus({ value, matches, labels }: { value: string; matches: boolean; labels: SignInAuthLabels }) {
  if (!value) return <small className="usp-confirm-status neutral" aria-live="polite"><i aria-hidden="true">○</i>{labels.confirmPassword}</small>;
  return <small className={`usp-confirm-status ${matches ? 'valid' : 'invalid'}`} aria-live="polite"><i aria-hidden="true">{matches ? '✓' : '×'}</i>{matches ? labels.passwordsMatch : labels.passwordsDoNotMatch}</small>;
}

function PasswordStrengthMeter({ checks, password, labels }: { checks: PasswordCheck[]; password: string; labels: SignInAuthLabels }) {
  const passed = checks.filter((check) => check.ok).length;
  const percent = Math.round((passed / checks.length) * 100);
  const label = !password ? labels.passwordNotSet : passed <= 1 ? labels.passwordWeak : passed <= 3 ? labels.passwordGood : passed < checks.length ? labels.passwordStrong : labels.passwordExcellent;
  const state = !password ? 'empty' : passed <= 1 ? 'weak' : passed <= 3 ? 'good' : passed < checks.length ? 'strong' : 'excellent';
  return <div className={`usp-password-meter ${state}`} aria-label={`${labels.passwordStrength}: ${label}`} aria-live="polite">
    <div className="usp-password-meter-meta"><span>{labels.passwordStrength}</span><strong>{label}</strong></div>
    <div className="usp-password-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label}><span className="usp-password-meter-fill" style={{ width: `${percent}%` }} /></div>
  </div>;
}


function timeText(zone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date());
}

function dateText(zone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date());
}

function timeZoneText(zone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'short',
  }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value || zone;
}

function dayNightText(zone: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', hour12: false,
  }).format(new Date()));
  return hour >= 6 && hour < 18 ? 'Daylight' : 'Night';
}

function clockHands(zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 12;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return {
    '--hour-angle': `${hour * 30 + minute * 0.5}deg`,
    '--minute-angle': `${minute * 6}deg`,
  } as React.CSSProperties;
}

export function WorldClocks() {
  const [preferences, setPreferences] = useState<WorldClockPreferences>(() => readWorldClockPreferences());
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer = 0;
    const stop = () => { if (timer) window.clearInterval(timer); timer = 0; };
    const start = () => {
      stop();
      if (document.visibilityState !== 'visible') return;
      setTick((value) => value + 1);
      timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    };
    document.addEventListener('visibilitychange', start);
    const onPreferences = (event: Event) => {
      const detail = (event as CustomEvent<WorldClockPreferences>).detail;
      if (detail) setPreferences(detail);
    };
    window.addEventListener('daenem:world-clock-preferences', onPreferences);
    start();
    return () => {
      stop();
      document.removeEventListener('visibilitychange', start);
      window.removeEventListener('daenem:world-clock-preferences', onPreferences);
    };
  }, []);
  const selected = preferences.visibleZones
    .map((zone) => WORLD_CLOCK_CATALOG.find((item) => item.zone === zone))
    .filter((item): item is PortalLocation => Boolean(item));
  const clocks = selected.length ? selected : WORLD_CLOCKS;
  return <div className={`world-clocks clock-style-${preferences.style}`} aria-label="Daenem global operations clock">
    <div className="world-clocks-heading"><span className="eyebrow">GLOBAL OPERATIONS CLOCK</span><strong>{clocks.length} locations · live local time</strong></div>
    <div className="world-clocks-grid">
      {clocks.map((item) => <article className="world-clock" key={item.name + item.zone} tabIndex={0}>
        <div className="analog-clock" style={clockHands(item.zone)} aria-hidden="true">
          <span className="clock-hand clock-hand-hour" />
          <span className="clock-hand clock-hand-minute" />
          <span className="clock-center" />
          {[0, 1, 2, 3, 4, 5].map((tick) => <i key={tick} style={{ transform: `rotate(${tick * 60}deg)` }} />)}
        </div>
        <div className="clock-info">
          <div className="clock-location"><strong>{item.name}</strong><span>{item.region}</span></div>
          <b className="clock-time">{timeText(item.zone)}</b>
          <small className="clock-date">{dateText(item.zone)}</small>
          <small className="clock-timezone">{timeZoneText(item.zone)}</small>
          <span className={`clock-day-state ${dayNightText(item.zone).toLowerCase()}`}><i />{dayNightText(item.zone)}</span>
          <span className="clock-weather"><span aria-hidden="true">✦</span>Live weather on sign-in</span>
        </div>
      </article>)}
    </div>
  </div>;
}

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (context: WorkforceContext) => void }) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const panelRef = useRef<HTMLElement | null>(null);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [whatsAppSignInChallenge, setWhatsAppSignInChallenge] = useState('');
  const [whatsAppSignInDestination, setWhatsAppSignInDestination] = useState('');
  const [whatsAppSignInCode, setWhatsAppSignInCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [themeId] = useState<ThemeId>(() => readThemeId());
  const [secureServiceLabel, setSecureServiceLabel] = useState(() => readSignInPreferences().labels.secureService);
  const [authLabels, setAuthLabels] = useState(() => readSignInPreferences().labels.auth);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(FALLBACK_PASSWORD_POLICY);
  const [compactDesktop, setCompactDesktop] = useState(false);
  const [identityTouched, setIdentityTouched] = useState(false);
  const compactAuthRef = useRef(false);

  const [signupStep, setSignupStep] = useState<'identity' | 'account' | 'work' | 'verify'>('identity');
  const [signupChallenge, setSignupChallenge] = useState('');
  const [signupDestination, setSignupDestination] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [signupBootstrapCode, setSignupBootstrapCode] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [signup, setSignup] = useState({
    firstName: '', lastName: '', email: '', phone: '', username: '', password: '', confirmPassword: '',
    jobTitle: '', department: '', requestedRole: '',
  });

  const [recoveryStep, setRecoveryStep] = useState<'identity' | 'verify' | 'reset'>('identity');
  const [recoveryIdentity, setRecoveryIdentity] = useState('');
  const [recoveryChallenge, setRecoveryChallenge] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryBootstrapCode, setRecoveryBootstrapCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);

  const signupChecks = passwordChecks(signup.password, passwordPolicy, authLabels);
  const resetChecks = passwordChecks(newPassword, passwordPolicy, authLabels);
  const identityStatus = identifierState(identity);
  const showIdentityStatus = identity.trim().length >= 3 || identityTouched;

  useEffect(() => mountSignInLegacyFonts(), []);

  useEffect(() => {
    ensureAppInstallListener();
  }, []);

  useEffect(() => {
    let active = true;
    api<PasswordPolicy>('/api/auth/password-policy').then((value) => {
      if (!active || !value || typeof value.minimumLength !== 'number') return;
      setPasswordPolicy({
        minimumLength: Math.max(8, Math.min(128, Math.round(value.minimumLength))),
        maximumLength: Math.max(32, Math.min(256, Math.round(value.maximumLength || 128))),
        requiresUppercase: value.requiresUppercase !== false,
        requiresLowercase: value.requiresLowercase !== false,
        requiresNumber: value.requiresNumber !== false,
        requiresSymbol: value.requiresSymbol !== false,
      });
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onSignInPreferences = (event: Event) => {
      const config = (event as CustomEvent<{ labels?: { secureService?: string; auth?: typeof authLabels } }>).detail;
      if (config?.labels?.secureService) setSecureServiceLabel(config.labels.secureService);
      if (config?.labels?.auth) setAuthLabels(config.labels.auth);
    };
    window.addEventListener('daenem:signin-preferences', onSignInPreferences);
    return () => window.removeEventListener('daenem:signin-preferences', onSignInPreferences);
  }, []);

  useEffect(() => {
    const panel = panelRef.current;
    const column = panel?.closest<HTMLElement>('.usp-form-column');
    if (!panel || !column) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const query = window.matchMedia('(min-width: 821px) and (max-height: 959px)');
        const measuredOverflow = window.innerWidth >= 821 && panel.scrollHeight > column.clientHeight + 1;
        if (measuredOverflow) compactAuthRef.current = true;
        if (mode !== 'signup' && !query.matches) compactAuthRef.current = false;
        setCompactDesktop((current) => {
          const next = query.matches || measuredOverflow || compactAuthRef.current;
          return current === next ? current : next;
        });
      });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(panel);
    observer.observe(column);
    window.addEventListener('resize', sync, { passive: true });
    window.visualViewport?.addEventListener('resize', sync, { passive: true });
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('resize', sync);
    };
  }, [mode, signupStep, recoveryStep, message, passwordPolicy, authLabels]);

  useEffect(() => {
    const theme = themeById(themeId);
    document.title = `Daenem Unified ERP Portal · ${theme.name}`;
  }, [themeId]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [mode, signupStep, recoveryStep]);

  async function installApp() {
    try {
      const outcome = await requestAppInstall();
      if (outcome === 'accepted') {
        setMessage({ type: 'success', text: 'Daenem Staff Portal was installed on this device.' });
      } else if (outcome === 'dismissed') {
        setMessage({ type: 'info', text: 'Installation was cancelled. You can install the portal later from your browser menu.' });
      } else {
        setMessage({ type: 'info', text: 'Use your browser menu or address-bar install icon to add the Staff Portal to this device.' });
      }
    } catch {
      setMessage({ type: 'info', text: 'The browser could not open the install prompt. Use the browser menu to install the Staff Portal.' });
    }
  }

  function unavailableOAuth(provider: 'Microsoft' | 'Google') {
    setMessage({ type: 'info', text: `${provider} access is not enabled for this Staff Portal deployment. Use your employee username or email and password, or ask your administrator to enable it.` });
  }

  function switchMode(next: 'signin' | 'signup' | 'forgot') {
    compactAuthRef.current = false;
    setMode(next);
    setMessage(null);
    setPassword('');
    setShowPassword(false);
    setRemember(false);
    setWhatsAppSignInChallenge('');
    setWhatsAppSignInDestination('');
    setWhatsAppSignInCode('');
    setSignup((current) => ({ ...current, password: '', confirmPassword: '' }));
    if (next === 'signup') { setIdentity(''); setIdentityTouched(false); setSignupStep('identity'); setSignupCode(''); }
    if (next === 'forgot') {
      setRecoveryStep('identity'); setRecoveryCode(''); setResetToken(''); setRecoveryIdentity(identity);
    }
  }

  function continueSignupIdentity(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSignupStep('account');
  }

  function continueSignupAccount(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!passwordPolicySatisfied(signupChecks)) {
      setMessage({ type: 'error', text: authLabels.passwordRequirements, details: signupChecks.filter((check) => check.required && !check.ok).map((check) => check.label) });
      return;
    }
    if (signup.password !== signup.confirmPassword) {
      setMessage({ type: 'error', text: authLabels.passwordsDoNotMatch });
      return;
    }
    setSignupStep('work');
  }

  function backSignupStep(step: 'identity' | 'account') {
    setMessage(null);
    setSignupStep(step);
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier: identity, password, ...deviceIdentity() }) });
      const me = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
      if (!me.authenticated || !me.context) {
        throw new Error('Your sign-in session could not be established. Please try again.');
      }
      setPassword('');
      setShowPassword(false);
      setRemember(false);
      onAuthenticated(me.context);
    } catch (error) {
      const authError = error as ApiError;
      if (authError.status === 428 || authError.code === 'OWNER_RECOVERY_REQUIRED') {
        setMessage({
          type: 'error',
          text: 'Owner Access Requires Secure Password Recovery.',
          details: ['Use Forgot Password to restore access securely.'],
          action: { label: authLabels.forgotPassword, onClick: () => switchMode('forgot') },
        });
      } else if (authError.status === 423 || authError.code === 'PASSWORD_TEMPORARILY_LOCKED') {
        setMessage({
          type: 'error',
          text: authLabels.lockoutTitle,
          details: [authLabels.lockoutSummary, authLabels.lockoutRecovery],
          action: { label: authLabels.forgotPassword, onClick: () => switchMode('forgot') },
        });
      } else if (authError.code === 'LOCATION_REQUIRED' || authError.code === 'OUTSIDE_LOGIN_GEOFENCE') {
        setMessage({ type: 'error', text: 'Your sign-in could not be completed. Please contact your administrator if this continues.' });
      } else {
        setMessage({ type: 'error', text: authError.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function startWhatsAppSignIn() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{stepUpRequired:boolean;challengeId:string;destination:string;message:string}>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ identifier: identity, password, verificationChannel: 'whatsapp', ...deviceIdentity() }),
      });
      if (!result.stepUpRequired || !result.challengeId) throw new Error('WhatsApp verification could not be started.');
      setWhatsAppSignInChallenge(result.challengeId);
      setWhatsAppSignInDestination(result.destination || 'your enrolled WhatsApp contact');
      setWhatsAppSignInCode('');
      setMessage({ type: 'info', text: result.message });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function verifyWhatsAppSignIn() {
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/auth/login/verify-whatsapp', {
        method: 'POST', body: JSON.stringify({ challengeId: whatsAppSignInChallenge, code: whatsAppSignInCode }),
      });
      const me = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
      if (!me.authenticated || !me.context) throw new Error('Your sign-in session could not be established. Please try again.');
      setPassword('');
      setWhatsAppSignInChallenge('');
      setWhatsAppSignInDestination('');
      setWhatsAppSignInCode('');
      onAuthenticated(me.context);
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function startSignup(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!passwordPolicySatisfied(signupChecks)) {
      setMessage({ type: 'error', text: authLabels.passwordRequirements, details: signupChecks.filter((check) => check.required && !check.ok).map((check) => check.label) });
      return;
    }
    if (signup.password !== signup.confirmPassword) {
      setMessage({ type: 'error', text: authLabels.passwordsDoNotMatch });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ challengeId: string; destination: string; bootstrapCode?: string; message: string }>('/api/auth/signup/start', {
        method: 'POST', body: JSON.stringify({ ...signup, confirmPassword: undefined }),
      });
      setSignupChallenge(result.challengeId);
      setSignupDestination(result.destination);
      setSignupBootstrapCode(result.bootstrapCode || '');
      setSignupCode('');
      setSignupStep('verify');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      const authError = error as ApiError;
      setMessage({ type: 'error', text: authError.message, details: authError.passwordErrors });
    } finally {
      setBusy(false);
    }
  }

  async function verifySignup(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ username: string; message: string }>('/api/auth/signup/verify', {
        method: 'POST', body: JSON.stringify({ challengeId: signupChallenge, code: signupCode }),
      });
      setIdentity('');
      setPassword('');
      setSignup((current) => ({ ...current, password: '', confirmPassword: '' }));
      setMode('signin');
      setSignupStep('identity');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function startRecovery(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ challengeId: string; bootstrapCode?: string; message: string }>('/api/auth/password/forgot', {
        method: 'POST', body: JSON.stringify({ identifier: recoveryIdentity }),
      });
      setRecoveryChallenge(result.challengeId);
      setRecoveryBootstrapCode(result.bootstrapCode || '');
      setRecoveryCode('');
      setRecoveryStep('verify');
      setMessage({ type: 'info', text: result.message });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecovery(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ resetToken: string; message: string }>('/api/auth/password/verify-reset', {
        method: 'POST', body: JSON.stringify({ challengeId: recoveryChallenge, code: recoveryCode }),
      });
      setResetToken(result.resetToken);
      setRecoveryStep('reset');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!passwordPolicySatisfied(resetChecks)) {
      setMessage({ type: 'error', text: authLabels.passwordRequirements, details: resetChecks.filter((check) => check.required && !check.ok).map((check) => check.label) });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setMessage({ type: 'error', text: authLabels.passwordsDoNotMatch });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ username?: string; message: string }>('/api/auth/password/reset', {
        method: 'POST', body: JSON.stringify({ resetToken, newPassword }),
      });
      setIdentity('');
      setPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMode('signin');
      setRecoveryStep('identity');
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      const authError = error as ApiError;
      setMessage({ type: 'error', text: authError.message, details: authError.passwordErrors });
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === 'signin'
    ? { title: authLabels.signInTitle, body: authLabels.signInDescription }
    : mode === 'signup'
      ? {
          title: signupStep === 'verify' ? authLabels.verifyEmailTitle : authLabels.createAccountTitle,
          body: signupStep === 'verify'
            ? authLabels.verifyEmailDescription
            : authLabels.createAccountDescription,
        }
      : {
          title: recoveryStep === 'reset' ? authLabels.newPasswordTitle : recoveryStep === 'verify' ? authLabels.verifyIdentityTitle : authLabels.forgotPasswordTitle,
          body: recoveryStep === 'reset'
            ? authLabels.newPasswordDescription
            : recoveryStep === 'verify'
              ? authLabels.verifyIdentityDescription
              : authLabels.forgotPasswordDescription,
        };

  const authPanel = (
    <section ref={panelRef} aria-label="Employee authentication" data-auth-mode={mode === 'signup' ? `signup-${signupStep}` : mode === 'forgot' ? `forgot-${recoveryStep}` : mode} className={`usp-auth-panel usp-auth-panel-${mode} ${compactDesktop ? 'usp-auth-density-compact' : 'usp-auth-density-comfortable'}`}>
      <div className="usp-panel-heading">
        <div>
          <span className="usp-panel-eyebrow"><LockKeyhole size={14} /> {authLabels.secureErpAccess}</span>
          <h1>{heading.title}</h1>
          <p>{heading.body}</p>
        </div>
        {mode === 'forgot'
          ? <button type="button" className="usp-back-link" onClick={() => switchMode('signin')}>{authLabels.backToSignIn}</button>
          : <span className="usp-mfa-chip"><ShieldCheck size={14} /> {authLabels.mfaReady}</span>}
      </div>

      {mode !== 'forgot' && <div className={`usp-tabs usp-tabs-${mode}`} role="tablist" aria-label="Authentication options">
        <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} role="tab" aria-selected={mode === 'signin'}>{authLabels.employeeSignInTab}</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} role="tab" aria-selected={mode === 'signup'}>{authLabels.createAccountTab}</button>
      </div>}

      {message && <div className={`usp-auth-message ${message.type}`} role="alert">
        <span>{message.text}</span>
        {message.details?.length ? <ul>{message.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
        {message.action && <button type="button" className="usp-auth-message-action" onClick={message.action.onClick}>{message.action.label}</button>}
      </div>}

      {mode === 'signin' && <form className="usp-auth-form" autoComplete="off" onSubmit={signIn}>
        <TextField
          label={authLabels.emailOrUsername}
          value={identity}
          onChange={setIdentity}
          onBlur={() => setIdentityTouched(true)}
          required
          autoComplete="off"
          statusText={showIdentityStatus && identityStatus !== 'empty'
            ? identityStatus === 'email' ? authLabels.identifierEmailValid
              : identityStatus === 'username' ? authLabels.identifierUsernameValid
                : authLabels.identifierInvalid
            : undefined}
          statusTone={identityStatus === 'invalid' ? 'invalid' : 'valid'}
        />
        <div className="usp-password-block">
          <PasswordField label={authLabels.password} value={password} onChange={setPassword} autoComplete="off" show={showPassword} setShow={setShowPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
          <button type="button" className="usp-forgot-link" onClick={() => switchMode('forgot')}>{authLabels.forgotPassword}</button>
        </div>
        <label className="usp-remember-row">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span className="usp-check-ui"><Check size={12} /></span>
          <span>{authLabels.rememberMe}<small>{authLabels.trustedDevice}</small></span>
        </label>
        <button className="usp-primary-button" disabled={busy} type="submit">
          {busy ? authLabels.signingIn : authLabels.signIn}<ArrowRight size={17} />
        </button>
        <button className="usp-whatsapp-button" disabled={busy || !identity.trim() || !password} type="button" onClick={() => void startWhatsAppSignIn()}>
          <span className="usp-whatsapp-button-icon"><WhatsAppMark size={20} /></span>
          <span className="usp-whatsapp-button-copy"><strong>Verify sign-in with WhatsApp</strong><small>Use your enrolled WhatsApp contact for secure step-up verification</small></span>
        </button>
        <small className="usp-whatsapp-auth-note">Your password is still required. WhatsApp verification is available only for an enrolled and previously verified contact.</small>
        {whatsAppSignInChallenge && <div className="usp-whatsapp-stepup">
          <div className="usp-auth-destination usp-whatsapp-destination"><span className="usp-whatsapp-button-icon compact"><WhatsAppMark size={17} /></span><span>Verification sent to <b>{whatsAppSignInDestination}</b></span></div>
          <TextField label="WhatsApp verification code" value={whatsAppSignInCode} onChange={(value) => setWhatsAppSignInCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
          <button className="usp-primary-button" disabled={busy || whatsAppSignInCode.length !== 6} type="button" onClick={() => void verifyWhatsAppSignIn()}>
            {busy ? 'Verifying…' : 'Verify WhatsApp code'}<ArrowRight size={17} />
          </button>
        </div>}
      </form>}

      {mode === 'signup' && compactDesktop && signupStep === 'identity' && <form className="usp-auth-form usp-signup-form" autoComplete="off" onSubmit={continueSignupIdentity}>
        <div className="usp-two"><TextField label={authLabels.firstName} value={signup.firstName} onChange={(value) => setSignup({ ...signup, firstName: value })} required autoComplete="given-name" /><TextField label={authLabels.lastName} value={signup.lastName} onChange={(value) => setSignup({ ...signup, lastName: value })} required autoComplete="family-name" /></div>
        <TextField label={authLabels.personalEmail} type="email" value={signup.email} onChange={(value) => setSignup({ ...signup, email: value })} required autoComplete="email" />
        <TextField label={authLabels.phoneWhatsApp} value={signup.phone} onChange={(value) => setSignup({ ...signup, phone: value })} autoComplete="tel" />
        <button className="usp-primary-button" type="submit">{authLabels.continue}<ArrowRight size={17} /></button>
      </form>}

      {mode === 'signup' && compactDesktop && signupStep === 'account' && <form className="usp-auth-form usp-signup-form" autoComplete="off" onSubmit={continueSignupAccount}>
        <TextField label={authLabels.createUsername} value={signup.username} onChange={(value) => setSignup({ ...signup, username: value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required autoComplete="off" helper={authLabels.usernameHelper} />
        <div className="usp-two usp-password-pair"><PasswordField label={authLabels.createPassword} value={signup.password} onChange={(value) => setSignup({ ...signup, password: value })} autoComplete="new-password" show={showSignupPassword} setShow={setShowSignupPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} /><PasswordField label={authLabels.confirmPassword} value={signup.confirmPassword} onChange={(value) => setSignup({ ...signup, confirmPassword: value })} autoComplete="new-password" show={showSignupConfirm} setShow={setShowSignupConfirm} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} /></div>
        <PasswordStrengthMeter checks={signupChecks} password={signup.password} labels={authLabels} />
        <PasswordStatus checks={signupChecks} password={signup.password} label={authLabels.passwordRequirements} />
        <ConfirmPasswordStatus value={signup.confirmPassword} matches={signup.password === signup.confirmPassword} labels={authLabels} />
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('identity')}>{authLabels.back}</button><button className="usp-primary-button" type="submit" disabled={!passwordPolicySatisfied(signupChecks) || signup.password !== signup.confirmPassword}>{authLabels.continue}<ArrowRight size={17} /></button></div>
      </form>}

      {mode === 'signup' && compactDesktop && signupStep === 'work' && <form className="usp-auth-form usp-signup-form" autoComplete="off" onSubmit={startSignup}>
        <div className="usp-two"><TextField label={authLabels.departmentWorkArea} value={signup.department} onChange={(value) => setSignup({ ...signup, department: value })} /><TextField label={authLabels.jobTitle} value={signup.jobTitle} onChange={(value) => setSignup({ ...signup, jobTitle: value })} /></div>
        <TextField label={authLabels.rolePosition} value={signup.requestedRole} onChange={(value) => setSignup({ ...signup, requestedRole: value })} />
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('account')}>{authLabels.back}</button><button className="usp-primary-button" disabled={busy} type="submit">{busy ? authLabels.preparingVerification : authLabels.createAccountTab}<ArrowRight size={17} /></button></div>
      </form>}

      {mode === 'signup' && !compactDesktop && signupStep !== 'verify' && <form className="usp-auth-form usp-signup-form" autoComplete="off" onSubmit={startSignup}>
        <div className="usp-two"><TextField label={authLabels.firstName} value={signup.firstName} onChange={(value) => setSignup({ ...signup, firstName: value })} required autoComplete="given-name" /><TextField label={authLabels.lastName} value={signup.lastName} onChange={(value) => setSignup({ ...signup, lastName: value })} required autoComplete="family-name" /></div>
        <TextField label={authLabels.personalEmail} type="email" value={signup.email} onChange={(value) => setSignup({ ...signup, email: value })} required autoComplete="email" />
        <TextField label={authLabels.phoneWhatsApp} value={signup.phone} onChange={(value) => setSignup({ ...signup, phone: value })} autoComplete="tel" />
        <TextField label={authLabels.createUsername} value={signup.username} onChange={(value) => setSignup({ ...signup, username: value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required autoComplete="off" helper={authLabels.usernameHelper} />
        <div className="usp-two usp-password-pair"><PasswordField label={authLabels.createPassword} value={signup.password} onChange={(value) => setSignup({ ...signup, password: value })} autoComplete="new-password" show={showSignupPassword} setShow={setShowSignupPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} /><PasswordField label={authLabels.confirmPassword} value={signup.confirmPassword} onChange={(value) => setSignup({ ...signup, confirmPassword: value })} autoComplete="new-password" show={showSignupConfirm} setShow={setShowSignupConfirm} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} /></div>
        <PasswordStrengthMeter checks={signupChecks} password={signup.password} labels={authLabels} />
        <PasswordStatus checks={signupChecks} password={signup.password} label={authLabels.passwordRequirements} />
        <ConfirmPasswordStatus value={signup.confirmPassword} matches={signup.password === signup.confirmPassword} labels={authLabels} />
        <div className="usp-two"><TextField label={authLabels.departmentWorkArea} value={signup.department} onChange={(value) => setSignup({ ...signup, department: value })} /><TextField label={authLabels.jobTitle} value={signup.jobTitle} onChange={(value) => setSignup({ ...signup, jobTitle: value })} /></div>
        <TextField label={authLabels.rolePosition} value={signup.requestedRole} onChange={(value) => setSignup({ ...signup, requestedRole: value })} />
        <button className="usp-primary-button" disabled={busy} type="submit">{busy ? authLabels.preparingVerification : authLabels.createAccountTab}<ArrowRight size={17} /></button>
      </form>}

      {mode === 'signup' && signupStep === 'verify' && <form className="usp-auth-form" autoComplete="off" onSubmit={verifySignup}>
        <div className="usp-auth-destination"><Mail size={18} /><span>{authLabels.verificationSentTo} <b>{signupDestination}</b></span></div>
        {signupBootstrapCode && <div className="usp-bootstrap-code"><span>{authLabels.privateBootstrapCode}</span><strong>{signupBootstrapCode}</strong><small>{authLabels.bootstrapNote}</small></div>}
        <TextField label={authLabels.verificationCode} value={signupCode} onChange={(value) => setSignupCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
        <button className="usp-primary-button" disabled={busy || signupCode.length !== 6} type="submit">{busy ? authLabels.verifying : authLabels.verifyEmailFinish}<CheckCircle2 size={17} /></button>
        <button type="button" className="usp-secondary-button" onClick={() => { setSignupStep('identity'); setSignupCode(''); setMessage(null); }}>{authLabels.changeSignupDetails}</button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'identity' && <form className="usp-auth-form" autoComplete="off" onSubmit={startRecovery}>
        <TextField label={authLabels.emailOrUsername} value={recoveryIdentity} onChange={setRecoveryIdentity} required autoComplete="off" />
        <div className="usp-positive-note"><Mail size={16} /><span>{authLabels.recoveryIdentityNote}</span></div>
        <button className="usp-primary-button" disabled={busy} type="submit">{busy ? authLabels.preparingRecovery : authLabels.sendRecoveryCode}<ArrowRight size={17} /></button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'verify' && <form className="usp-auth-form" autoComplete="off" onSubmit={verifyRecovery}>
        <div className="usp-auth-destination"><Mail size={18} /><span>{authLabels.verificationCodeSent}</span></div>
        {recoveryBootstrapCode && <div className="usp-bootstrap-code"><span>{authLabels.privateBootstrapCode}</span><strong>{recoveryBootstrapCode}</strong><small>{authLabels.bootstrapNote}</small></div>}
        <TextField label={authLabels.verificationCode} value={recoveryCode} onChange={(value) => setRecoveryCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
        <button className="usp-primary-button" disabled={busy || recoveryCode.length !== 6} type="submit">{busy ? authLabels.verifying : authLabels.verifyIdentity}<CheckCircle2 size={17} /></button>
        <button type="button" className="usp-secondary-button" onClick={() => { setRecoveryStep('identity'); setRecoveryCode(''); setMessage(null); }}>{authLabels.requestAnotherCode}</button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'reset' && <form className="usp-auth-form" autoComplete="off" onSubmit={resetPassword}>
        <div className="usp-reset-unlocked"><CheckCircle2 size={20} /><div><strong>{authLabels.identityVerified}</strong><span>{authLabels.resetAccessNote}</span></div></div>
        <PasswordField label={authLabels.newPassword} value={newPassword} onChange={setNewPassword} autoComplete="new-password" show={showNewPassword} setShow={setShowNewPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
        <PasswordField label={authLabels.confirmNewPassword} value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" show={showNewConfirm} setShow={setShowNewConfirm} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
        <PasswordStrengthMeter checks={resetChecks} password={newPassword} labels={authLabels} />
        <PasswordStatus checks={resetChecks} password={newPassword} label={authLabels.passwordRequirements} />
        <ConfirmPasswordStatus value={confirmNewPassword} matches={newPassword === confirmNewPassword} labels={authLabels} />
        <button className="usp-primary-button" disabled={busy || !passwordPolicySatisfied(resetChecks) || newPassword !== confirmNewPassword} type="submit">{busy ? authLabels.securingAccount : authLabels.createNewPassword}<KeyRound size={17} /></button>
      </form>}

      {mode !== 'forgot' && <>
        <div className="usp-or-divider"><span />{authLabels.or}<span /></div>
        <div className="usp-social-buttons">
          <button type="button" onClick={() => unavailableOAuth('Microsoft')}><span className="usp-microsoft-mark"><i /><i /><i /><i /></span>{mode === 'signup' ? authLabels.microsoftCreateAccount : authLabels.microsoftSignIn}</button>
          <button type="button" onClick={() => unavailableOAuth('Google')}><b className="usp-google-mark">G</b>{mode === 'signup' ? authLabels.googleCreateAccount : authLabels.googleSignIn}</button>
        </div>
        <p className="usp-social-note">{authLabels.socialNote}</p>
      </>}

      <p className="usp-legal-copy">
        {authLabels.legalPrefix} <a href="/terms-and-conditions.html" target="_blank" rel="noopener noreferrer">{authLabels.termsAndConditions}</a>. <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">{authLabels.privacyPolicy}</a>.
      </p>
      <div className="usp-panel-footer">
        <span className="usp-operational-pill"><i /> {secureServiceLabel}</span>
      </div>
    </section>
  );

  return <SignInExperience authPanel={authPanel} themeId={themeId} onInstall={() => void installApp()} />;
}
