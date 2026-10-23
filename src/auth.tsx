import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, CheckCircle2, Download, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus, UserRound, X,
} from 'lucide-react';
import {
  readThemeId, type ThemeId,
} from './theme-system';
import { Brand, SignInExperience } from './signin-experience';
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
  return <svg viewBox="0 0 24 24" width={size} height={size} className="sp-provider-mark sp-provider-mark-whatsapp" aria-hidden="true" focusable="false">
    <path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.5 4.2 1.6 6L.2 24l6.3-1.7a11.8 11.8 0 0 0 5.6 1.4h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.2-1.2-6.2-3.5-8.4Z" fill="#25D366" />
    <path d="M17.4 14.4c-.3-.2-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-1.6-.8-2.6-1.5-3.6-3.3-.3-.5.3-.5.8-1.6.1-.2.1-.4 0-.5-.1-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.1 3 .1.2 2 3.1 4.9 4.3 1.8.8 2.2.9 3 .8.8-.1 1.5-.1 2.1-.1.6-.2 1.6-.7 1.8-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.6-.3Z" fill="#fff" />
  </svg>;
}

function MicrosoftMark() {
  return <svg viewBox="0 0 24 24" className="sp-provider-mark sp-provider-mark-microsoft" aria-hidden="true">
    <path d="M2 3h9v9H2z" fill="#F25022" /><path d="M13 3h9v9h-9z" fill="#7FBA00" />
    <path d="M2 14h9v9H2z" fill="#00A4EF" /><path d="M13 14h9v9h-9z" fill="#FFB900" />
  </svg>;
}

function GoogleMark() {
  return <svg viewBox="0 0 24 24" className="sp-provider-mark" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
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
  label, value, onChange, required = false, type = 'text', autoComplete, inputMode, helper, statusText, statusTone, onBlur,
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean;
  type?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; helper?: string; statusText?: string; statusTone?: 'valid' | 'invalid'; onBlur?: () => void;
}) {
  return <label className="usp-field">
    <span className="usp-field-label">{label}{required ? ' *' : ''}</span>
    <input
      type={type}
      value={value}
      inputMode={inputMode}
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
  return <div className="usp-password-requirements" aria-label={label} aria-live="polite">
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
  const returnSignupFocusRef = useRef(false);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [whatsAppSignInChallenge, setWhatsAppSignInChallenge] = useState('');
  const [whatsAppSignInDestination, setWhatsAppSignInDestination] = useState('');
  const [whatsAppSignInCode, setWhatsAppSignInCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [linkMicrosoftAfterPassword, setLinkMicrosoftAfterPassword] = useState(false);
  const [themeId] = useState<ThemeId>(() => readThemeId());
  const [secureServiceLabel, setSecureServiceLabel] = useState(() => readSignInPreferences().labels.secureService);
  const [authLabels, setAuthLabels] = useState(() => readSignInPreferences().labels.auth);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(FALLBACK_PASSWORD_POLICY);
  const [compactDesktop, setCompactDesktop] = useState(false);
  const [identityTouched, setIdentityTouched] = useState(false);
  const compactAuthRef = useRef(false);

  const [signupStep, setSignupStep] = useState<'identity' | 'contact' | 'username' | 'account' | 'work' | 'verify'>('identity');
  const [signupChallenge, setSignupChallenge] = useState('');
  const [signupWhatsAppRequested, setSignupWhatsAppRequested] = useState(false);
  const [signupWhatsAppChallenge, setSignupWhatsAppChallenge] = useState('');
  const [signupWhatsAppDestination, setSignupWhatsAppDestination] = useState('');
  const [signupWhatsAppCode, setSignupWhatsAppCode] = useState('');
  const [signupWhatsAppVerified, setSignupWhatsAppVerified] = useState(false);
  const [signupDestination, setSignupDestination] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [signupBootstrapCode, setSignupBootstrapCode] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);
  const [signup, setSignup] = useState({
    firstName: '', lastName: '', email: '', phone: '', username: '', password: '', confirmPassword: '',
    jobTitle: '', department: '',
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
    const code = new URLSearchParams(window.location.search).get('auth_error');
    if (!code) return;
    const messages: Record<string, string> = {
      provider_denied: 'Sign-in was cancelled. You can try again or use your employee username or email and password.',
      invalid_oauth_response: 'The sign-in response was incomplete. Please try again.',
      invalid_oauth_state: 'The sign-in session expired or could not be verified. Please try again.',
      provider_token_missing: 'The identity provider did not return a usable sign-in token. Please try again.',
      provider_email_missing: 'The identity provider did not return an email address for this account.',
      provider_email_unverified: 'The identity provider email must be verified before Staff Portal access is allowed.',
      employee_not_authorized: 'This account is not authorized for Staff Portal access. Contact your administrator.',
      oauth_not_configured: 'This social sign-in method is not configured for this Staff Portal deployment.',
      oauth_state_storage_unavailable: 'The sign-in service is temporarily unavailable. Please try again shortly.',
      invalid_provider_identity: 'The identity provider response could not be verified. Please try again.',
      provider_exchange_failed: 'The identity provider could not complete sign-in. Please try again.',
      microsoft_link_required: 'This Microsoft account has not been connected to your approved StaffPortal employee account. Sign in with your existing StaffPortal credentials first.',
      microsoft_link_requires_signin: 'Sign in with your existing StaffPortal username and password to connect Microsoft.',
      microsoft_links_unavailable: 'Microsoft account linking is temporarily unavailable. Continue with your existing StaffPortal credentials.',
    };
    if (code === 'microsoft_link_required' || code === 'microsoft_link_requires_signin') {
      setMessage({
        type: 'error', text: messages[code],
        action: { label: 'Connect after StaffPortal Sign-In', onClick: () => {
          setLinkMicrosoftAfterPassword(true);
          setMessage({ type: 'info', text: 'Enter your existing StaffPortal username and password. You will then securely connect your Microsoft account.' });
        } },
      });
    } else {
      setMessage({ type: 'error', text: messages[code] || 'Social sign-in could not be completed. Please try again.' });
    }
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('auth_error');
    cleanUrl.searchParams.delete('auth_provider');
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
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
    const column = panel?.closest<HTMLElement>('.usp-form-column') || panel?.parentElement;
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
          const next = mode === 'signup' || query.matches || measuredOverflow || compactAuthRef.current;
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
    if (mode !== 'signin' || !returnSignupFocusRef.current) return;
    returnSignupFocusRef.current = false;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('#staffportal-auth-mount .sp-auth-tabs button:nth-child(2)')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  useEffect(() => { document.title = 'DAENEM Staff Portal'; }, [themeId]);

  useEffect(() => {
    if (mode !== 'forgot') return;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>(`#staffportal-auth-mount .sp-auth-recovery [data-recovery-step="${recoveryStep}"] input:not([disabled])`)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, recoveryStep]);

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

  function startOAuth(provider: 'google' | 'microsoft') {
    setMessage(null);
    window.location.assign(`/api/auth/oauth/${provider}/start`);
  }

  function switchMode(next: 'signin' | 'signup' | 'forgot') {
    if (mode === 'signup' && next === 'signin') returnSignupFocusRef.current = true;
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
    if (next === 'signup') { setIdentity(''); setIdentityTouched(false); setSignupStep('identity'); setSignupCode(''); setSignupWhatsAppRequested(false); setSignupWhatsAppChallenge(''); setSignupWhatsAppVerified(false); setSignupWhatsAppCode(''); }
    if (next === 'forgot') {
      setRecoveryStep('identity');
      setRecoveryChallenge('');
      setRecoveryCode('');
      setRecoveryBootstrapCode('');
      setResetToken('');
      setRecoveryIdentity(identity);
      setNewPassword('');
      setConfirmNewPassword('');
      setShowNewPassword(false);
      setShowNewConfirm(false);
    }
  }

  // The Create Account surface is a focused registration dialog, not a hidden
  // scrollable form. Keep focus within the dialog and restore it on exit.
  useEffect(() => {
    if (mode !== 'signup') return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    const initial = panel.querySelector<HTMLElement>('.usp-auth-form input:not([disabled])') || focusable()[0];
    initial?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        switchMode('signin');
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [mode, signupStep]);

  function validateSignupIdentity() {
    const missing = [
      !signup.firstName.trim() ? authLabels.firstName : '',
      !signup.lastName.trim() ? authLabels.lastName : '',
      !signup.email.trim() ? authLabels.personalEmail : '',
    ].filter(Boolean);
    if (missing.length) {
      setMessage({ type: 'error', text: 'Complete the required account details to continue.', details: missing });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signup.email.trim())) {
      setMessage({ type: 'error', text: 'Enter a valid personal email address before continuing.' });
      return false;
    }
    return true;
  }

  function validateSignupUsername() {
    if (signup.username.trim()) return true;
    setMessage({
      type: 'error',
      text: 'Complete the required account details to continue.',
      details: [authLabels.createUsername],
    });
    return false;
  }

  function continueSignupIdentity(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validateSignupIdentity()) return;
    setSignupStep('contact');
  }

  function continueSignupContact(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validateSignupIdentity()) return;
    setSignupStep('username');
  }

  function continueSignupUsername(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validateSignupUsername()) return;
    setSignupStep('account');
  }

  function continueSignupAccount(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (!validateSignupUsername()) return;
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

  function backSignupStep(step: 'identity' | 'contact' | 'username' | 'account') {
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
      if (linkMicrosoftAfterPassword) {
        window.location.assign('/api/auth/oauth/microsoft/link');
        return;
      }
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
      if (linkMicrosoftAfterPassword) {
        window.location.assign('/api/auth/oauth/microsoft/link');
        return;
      }
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
    if (!validateSignupIdentity()) return;
    if (!validateSignupUsername()) return;
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
      setSignupWhatsAppChallenge('');
      setSignupWhatsAppVerified(false);
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

  async function startSignupWhatsAppVerification() {
    if (!signupChallenge || !signup.phone.trim()) {
      setMessage({ type: 'error', text: 'Add your WhatsApp phone number in Contact Details to verify it.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ challengeId: string; destination: string }>('/api/auth/signup/whatsapp/start', {
        method: 'POST', body: JSON.stringify({ signupChallengeId: signupChallenge }),
      });
      setSignupWhatsAppChallenge(result.challengeId);
      setSignupWhatsAppDestination(result.destination);
      setSignupWhatsAppCode('');
      setMessage({ type: 'info', text: 'A WhatsApp verification code was sent. Email verification is still required.' });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function verifySignupWhatsAppCode() {
    if (!signupWhatsAppChallenge || signupWhatsAppCode.length !== 6) return;
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/auth/signup/whatsapp/verify', {
        method: 'POST', body: JSON.stringify({ challengeId: signupWhatsAppChallenge, code: signupWhatsAppCode }),
      });
      setSignupWhatsAppVerified(true);
      setSignupWhatsAppChallenge('');
      setSignupWhatsAppCode('');
      setMessage({ type: 'success', text: 'WhatsApp contact verified. Enter your email verification code to complete account creation.' });
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
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

  async function startRecovery(event?: React.FormEvent) {
    event?.preventDefault();
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
      setMessage(null);
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

  const approvedSignInPanel = (
    <div ref={(node) => { panelRef.current = node; }} className="sp-auth-runtime" data-approved-auth-placement="sites-v180">
      <div className="sp-auth-topline"><Brand compact className="sp-auth-logo-v101" /><span className="sp-secure-chip"><ShieldCheck size={14} /> Private Staff Access</span></div>
      <div className="sp-auth-copy"><p className="sp-eyebrow">DAENEM Staff Portal</p><h2 id="sp-auth-heading">Welcome Back</h2><p>Sign in to continue to your assigned workspace.</p></div>
      <div className="sp-auth-tabs" role="tablist" aria-label="Staff access mode"><button type="button" className="is-active" role="tab" aria-selected="true"><UserRound size={16} /> Sign In</button><button type="button" role="tab" aria-selected="false" onClick={() => switchMode('signup')}><UserPlus size={16} /> Create Account</button></div>
      {message && <div className={`sp-auth-notice ${message.type === 'error' ? 'is-error' : message.type === 'success' ? 'is-success' : ''}`} role="alert"><span>{message.text}</span>{message.details?.length ? <ul>{message.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}{message.action && <button type="button" className="sp-text-button" onClick={message.action.onClick}>{message.action.label}</button>}</div>}
      <form className="sp-auth-form" autoComplete="off" onSubmit={signIn} noValidate>
        <label><span className="sp-field-label">Email Or Username</span><span className={`sp-input-shell sp-credential-shell is-${identityStatus === 'invalid' && showIdentityStatus ? 'error' : identity ? 'success' : 'idle'}`} data-credential-state={identityStatus}><UserRound size={16} /><input type="text" autoComplete="username" value={identity} onChange={(event) => setIdentity(event.target.value)} onBlur={() => setIdentityTouched(true)} placeholder="Enter Your Email Or Username" aria-invalid={identityStatus === 'invalid' && showIdentityStatus} /></span>{showIdentityStatus && identityStatus !== 'empty' ? <span className={`sp-field-status sp-credential-status is-${identityStatus === 'invalid' ? 'error' : 'success'}`}>{identityStatus === 'invalid' ? authLabels.identifierInvalid : identityStatus === 'email' ? authLabels.identifierEmailValid : authLabels.identifierUsernameValid}</span> : null}</label>
        <label><span className="sp-field-label">Password</span><span className="sp-input-shell sp-credential-shell"><KeyRound size={16} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter Your Password" /><button type="button" className="sp-show-password" aria-label={showPassword ? authLabels.hidePassword : authLabels.showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}<span className="sp-show-password-label">{showPassword ? 'Hide' : 'Show'}</span></button></span></label>
        <div className="sp-auth-options"><label className="sp-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember Me</span></label><button type="button" className="sp-forgot" onClick={() => switchMode('forgot')}><KeyRound size={14} /> Forgot Password?</button></div>
        <button type="submit" className={`sp-primary-button ${busy ? 'is-loading' : 'is-idle'}`} disabled={busy}><span>{busy ? 'Connecting…' : 'Sign In'}</span><ArrowRight size={16} /></button>
      </form>
      {whatsAppSignInChallenge && <div className="sp-provider-flow-panel is-verify" role="status"><div className="sp-provider-flow-head"><span className="sp-provider-flow-icon"><WhatsAppMark size={17} /></span><span><b>WhatsApp Verification</b><small>Code sent to {whatsAppSignInDestination}</small></span></div><label><span className="sp-field-label">Verification Code</span><span className="sp-input-shell"><KeyRound size={16} /><input value={whatsAppSignInCode} onChange={(event) => setWhatsAppSignInCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="Enter 6-digit code" /></span></label><button type="button" className="sp-provider-flow-action" disabled={busy || whatsAppSignInCode.length !== 6} onClick={() => void verifyWhatsAppSignIn()}>Verify WhatsApp Code <ArrowRight size={14} /></button></div>}
      <div className="sp-auth-divider"><span /><b>Or Continue With</b><span /></div>
      <div className="sp-social-grid sp-auth-provider-list sp-auth-provider-signin" aria-label="Sign in with another provider">
        <button type="button" className="sp-social-button" onClick={() => startOAuth('microsoft')}><span className="sp-social-icon"><MicrosoftMark /></span><span className="sp-social-label">Microsoft</span></button>
        <button type="button" className="sp-social-button" onClick={() => startOAuth('google')}><span className="sp-social-icon"><GoogleMark /></span><span className="sp-social-label">Google</span></button>
        <button type="button" className="sp-social-button" onClick={() => void startWhatsAppSignIn()}><span className="sp-social-icon"><WhatsAppMark size={19} /></span><span className="sp-social-label">WhatsApp</span></button>
        <p className="sp-auth-provider-status"><LockKeyhole size={12} /> Secure provider connections use the configured Cloudflare staging environment.</p>
      </div>
      <button type="button" className="sp-install-card sp-install-card-v101" onClick={() => void installApp()}><span className="sp-install-icon"><Download size={16} /></span><span className="sp-install-copy"><b>Install StaffPortal App</b><small>Fast Access From Your Home Screen</small></span><span className="sp-install-state">Shortcut</span></button>
      <div className="sp-auth-policy"><p>By Continuing, You Agree To The DAENEM Staff Portal <a href="/terms-and-conditions.html" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> And <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p><small>{secureServiceLabel}</small></div>
    </div>
  );

  const recoverySteps: Array<{ id: 'identity' | 'verify' | 'reset'; label: string }> = [
    { id: 'identity', label: 'Account' },
    { id: 'verify', label: 'Verify' },
    { id: 'reset', label: 'New Password' },
  ];
  const recoveryStepIndex = recoverySteps.findIndex((step) => step.id === recoveryStep);

  const approvedForgotPanel = (
    <section
      ref={panelRef}
      className="sp-auth-runtime sp-auth-recovery"
      aria-labelledby="sp-recovery-heading"
      data-auth-mode={`forgot-${recoveryStep}`}
    >
      <div className="sp-auth-topline">
        <Brand compact className="sp-auth-logo-v101" />
        <span className="sp-secure-chip"><ShieldCheck size={14} /> Secure Recovery</span>
      </div>
      <div className="sp-auth-copy">
        <p className="sp-eyebrow">ACCOUNT ACCESS</p>
        <h2 id="sp-recovery-heading">{heading.title}</h2>
        <p>{heading.body}</p>
      </div>
      <button type="button" className="sp-recovery-back" onClick={() => switchMode('signin')}>
        <ArrowRight size={14} aria-hidden="true" /> {authLabels.backToSignIn}
      </button>
      <nav className="sp-recovery-progress" aria-label={`Password recovery, step ${recoveryStepIndex + 1} of 3`}>
        {recoverySteps.map((step, index) => {
          const current = step.id === recoveryStep;
          const complete = index < recoveryStepIndex;
          return (
            <div
              className={`sp-recovery-progress-step ${current ? 'is-current' : ''} ${complete ? 'is-complete' : ''}`}
              key={step.id}
              aria-current={current ? 'step' : undefined}
            >
              <span className="sp-recovery-step-number">{complete ? <Check size={13} /> : `0${index + 1}`}</span>
              <span>{step.label}</span>
            </div>
          );
        })}
      </nav>
      {message && (
        <div
          className={`sp-auth-notice ${message.type === 'error' ? 'is-error' : message.type === 'success' ? 'is-success' : ''}`}
          role={message.type === 'error' ? 'alert' : 'status'}
          aria-live={message.type === 'error' ? 'assertive' : 'polite'}
        >
          <span>{message.text}</span>
          {message.details?.length ? <ul>{message.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
        </div>
      )}

      {recoveryStep === 'identity' && (
        <form className="sp-auth-form sp-recovery-form" data-recovery-step="identity" autoComplete="off" onSubmit={startRecovery}>
          <TextField
            label={authLabels.emailOrUsername}
            value={recoveryIdentity}
            onChange={setRecoveryIdentity}
            required
            autoComplete="username"
          />
          <p className="sp-recovery-note"><LockKeyhole size={15} /> We’ll use the verified recovery contact already connected to your account.</p>
          <button type="submit" className={`sp-primary-button ${busy ? 'is-loading' : 'is-idle'}`} disabled={busy || !recoveryIdentity.trim()}>
            <span>{busy ? authLabels.preparingRecovery : authLabels.sendRecoveryCode}</span><ArrowRight size={16} />
          </button>
        </form>
      )}

      {recoveryStep === 'verify' && (
        <form className="sp-auth-form sp-recovery-form" data-recovery-step="verify" autoComplete="off" onSubmit={verifyRecovery}>
          <div className="sp-recovery-delivery" role="status">
            <ShieldCheck size={17} />
            <span>Enter the six-digit code for this recovery request. You can request a new code or update the email or username below.</span>
          </div>
          {recoveryBootstrapCode && (
            <div className="usp-bootstrap-code">
              <span>{authLabels.privateBootstrapCode}</span><strong>{recoveryBootstrapCode}</strong><small>{authLabels.bootstrapNote}</small>
            </div>
          )}
          <TextField
            label={authLabels.verificationCode}
            value={recoveryCode}
            onChange={(value) => setRecoveryCode(value.replace(/\D/g, '').slice(0, 6))}
            required
            autoComplete="one-time-code"
            inputMode="numeric"
          />
          <button type="submit" className={`sp-primary-button ${busy ? 'is-loading' : 'is-idle'}`} disabled={busy || recoveryCode.length !== 6}>
            <span>{busy ? authLabels.verifying : authLabels.verifyIdentity}</span><CheckCircle2 size={16} />
          </button>
          <div className="sp-recovery-secondary-actions">
            <button type="button" className="sp-text-button" disabled={busy} onClick={() => void startRecovery()}>Resend code</button>
            <button type="button" className="sp-text-button" onClick={() => { setRecoveryStep('identity'); setRecoveryCode(''); setMessage(null); }}>Change email or username</button>
          </div>
        </form>
      )}

      {recoveryStep === 'reset' && (
        <form className="sp-auth-form sp-recovery-form" data-recovery-step="reset" autoComplete="off" onSubmit={resetPassword}>
          <div className="sp-recovery-delivery is-verified" role="status">
            <CheckCircle2 size={17} />
            <span>Choose a strong, unique password to secure your account.</span>
          </div>
          <PasswordField label={authLabels.newPassword} value={newPassword} onChange={setNewPassword} autoComplete="new-password" show={showNewPassword} setShow={setShowNewPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
          <PasswordField label={authLabels.confirmNewPassword} value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" show={showNewConfirm} setShow={setShowNewConfirm} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
          <PasswordStrengthMeter checks={resetChecks} password={newPassword} labels={authLabels} />
          <PasswordStatus checks={resetChecks} password={newPassword} label={authLabels.passwordRequirements} />
          <ConfirmPasswordStatus value={confirmNewPassword} matches={newPassword === confirmNewPassword} labels={authLabels} />
          <button type="submit" className={`sp-primary-button ${busy ? 'is-loading' : 'is-idle'}`} disabled={busy || !passwordPolicySatisfied(resetChecks) || newPassword !== confirmNewPassword}>
            <span>{busy ? authLabels.securingAccount : authLabels.createNewPassword}</span><KeyRound size={16} />
          </button>
        </form>
      )}
      <div className="sp-auth-policy sp-recovery-policy">
        <p>Workspace access, company membership, and permissions remain managed by your Staff Portal administrator.</p>
        <small>{secureServiceLabel}</small>
      </div>
    </section>
  );

  const legacyAuthPanel = (
    <section ref={panelRef} role={mode === 'signup' ? 'dialog' : undefined} aria-modal={mode === 'signup' ? true : undefined} aria-labelledby={mode === 'signup' ? 'usp-account-dialog-title' : undefined} aria-label={mode !== 'signup' ? 'Employee authentication' : undefined} data-auth-mode={mode === 'signup' ? `signup-${signupStep}` : mode === 'forgot' ? `forgot-${recoveryStep}` : mode} className={`usp-auth-panel usp-auth-panel-${mode} ${compactDesktop ? 'usp-auth-density-compact' : 'usp-auth-density-comfortable'}`}>
      <div className="usp-panel-heading sp-signup-heading">
        <div>
          <span className="usp-panel-eyebrow"><LockKeyhole size={14} /> {authLabels.secureErpAccess}</span>
          <h1 id={mode === 'signup' ? 'usp-account-dialog-title' : undefined}>{heading.title}</h1>
          <p>{heading.body}</p>
        </div>
        {mode === 'signup' && <button type="button" className="sp-signup-close" aria-label="Close Create Account and return to Sign In" onClick={() => switchMode('signin')}><X size={16} /></button>}
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

      {mode === 'signup' && signupStep !== 'verify' && <nav className="sp-signup-progress" aria-label="Account setup progress">
        <span>Step {(['identity', 'contact', 'username', 'account', 'work'].indexOf(signupStep) + 1)} of 5</span>
        <div className="sp-signup-progress-track"><i style={{ width: `${(['identity', 'contact', 'username', 'account', 'work'].indexOf(signupStep) + 1) * 20}%` }} /></div>
      </nav>}
      {mode === 'signup' && signupStep === 'identity' && <form className="usp-auth-form usp-signup-form" autoComplete="off" noValidate onSubmit={(event) => { event.preventDefault(); setMessage(null); if (!signup.firstName.trim() || !signup.lastName.trim()) { setMessage({type:'error',text:'Enter your first and last name to continue.'}); return; } setSignupStep('contact'); }}>
        <TextField label={authLabels.firstName} value={signup.firstName} onChange={(value) => setSignup({ ...signup, firstName: value })} required autoComplete="given-name" />
        <TextField label={authLabels.lastName} value={signup.lastName} onChange={(value) => setSignup({ ...signup, lastName: value })} required autoComplete="family-name" />
        <button className="usp-primary-button" type="submit">{authLabels.continue}<ArrowRight size={17} /></button>
      </form>}
      {mode === 'signup' && signupStep === 'contact' && <form className="usp-auth-form usp-signup-form" autoComplete="off" noValidate onSubmit={continueSignupContact}>
        <TextField label={authLabels.personalEmail} type="email" value={signup.email} onChange={(value) => setSignup({ ...signup, email: value })} required autoComplete="email" />
        <TextField label={authLabels.phoneWhatsApp} value={signup.phone} onChange={(value) => setSignup({ ...signup, phone: value })} autoComplete="tel" />
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('identity')}>{authLabels.back}</button><button className="usp-primary-button" type="submit">{authLabels.continue}<ArrowRight size={17} /></button></div>
      </form>}
      {mode === 'signup' && signupStep === 'username' && <form className="usp-auth-form usp-signup-form" autoComplete="off" noValidate onSubmit={continueSignupUsername}>
        <TextField label={authLabels.createUsername} value={signup.username} onChange={(value) => setSignup({ ...signup, username: value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required autoComplete="username" helper={authLabels.usernameHelper} />
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('contact')}>{authLabels.back}</button><button className="usp-primary-button" type="submit">{authLabels.continue}<ArrowRight size={17} /></button></div>
      </form>}
      {mode === 'signup' && signupStep === 'account' && <form className="usp-auth-form usp-signup-form" autoComplete="off" noValidate onSubmit={continueSignupAccount}>
        <PasswordField label={authLabels.createPassword} value={signup.password} onChange={(value) => setSignup({ ...signup, password: value })} autoComplete="new-password" show={showSignupPassword} setShow={setShowSignupPassword} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
        <PasswordField label={authLabels.confirmPassword} value={signup.confirmPassword} onChange={(value) => setSignup({ ...signup, confirmPassword: value })} autoComplete="new-password" show={showSignupConfirm} setShow={setShowSignupConfirm} showLabel={authLabels.showPassword} hideLabel={authLabels.hidePassword} />
        <PasswordStrengthMeter checks={signupChecks} password={signup.password} labels={authLabels} />
        <PasswordStatus checks={signupChecks} password={signup.password} label={authLabels.passwordRequirements} />
        <ConfirmPasswordStatus value={signup.confirmPassword} matches={signup.password === signup.confirmPassword} labels={authLabels} />
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('username')}>{authLabels.back}</button><button className="usp-primary-button" type="submit" disabled={!passwordPolicySatisfied(signupChecks) || signup.password !== signup.confirmPassword}>{authLabels.continue}<ArrowRight size={17} /></button></div>
      </form>}
      {mode === 'signup' && signupStep === 'work' && <form className="usp-auth-form usp-signup-form" autoComplete="off" noValidate onSubmit={startSignup}>
        <TextField label={authLabels.departmentWorkArea} value={signup.department} onChange={(value) => setSignup({ ...signup, department: value })} />
        <TextField label={authLabels.jobTitle} value={signup.jobTitle} onChange={(value) => setSignup({ ...signup, jobTitle: value })} />
        <p className="usp-signup-admin-note">Workspace membership, roles, and permissions are assigned by your administrator after account verification.</p>
        <div className="usp-step-actions"><button type="button" className="usp-secondary-button" onClick={() => backSignupStep('account')}>{authLabels.back}</button><button className="usp-primary-button" disabled={busy} type="submit">{busy ? authLabels.preparingVerification : authLabels.createAccountTab}<ArrowRight size={17} /></button></div>
      </form>}

      {mode === 'signup' && signupStep === 'verify' && <form className="usp-auth-form" autoComplete="off" onSubmit={verifySignup}>
        <div className="usp-auth-destination"><Mail size={18} /><span>{authLabels.verificationSentTo} <b>{signupDestination}</b></span></div>
        {signupBootstrapCode && <div className="usp-bootstrap-code"><span>{authLabels.privateBootstrapCode}</span><strong>{signupBootstrapCode}</strong><small>{authLabels.bootstrapNote}</small></div>}
        {signupWhatsAppRequested && <div className="usp-signup-whatsapp-verify" aria-label="Optional WhatsApp contact verification">
          <span className="usp-signup-whatsapp-caption"><WhatsAppMark size={15} /> Optional contact verification</span>
          {signupWhatsAppVerified
            ? <span className="usp-signup-whatsapp-success"><CheckCircle2 size={15}/> WhatsApp contact verified</span>
            : signupWhatsAppChallenge
              ? <div className="usp-signup-whatsapp-code">
                  <span>Code sent to {signupWhatsAppDestination}</span>
                  <TextField label="WhatsApp code" value={signupWhatsAppCode} onChange={(value) => setSignupWhatsAppCode(value.replace(/\D/g, '').slice(0, 6))} autoComplete="one-time-code" />
                  <button type="button" className="usp-secondary-button" disabled={busy || signupWhatsAppCode.length !== 6} onClick={() => void verifySignupWhatsAppCode()}>Verify WhatsApp</button>
                </div>
              : <button type="button" className="usp-secondary-button usp-whatsapp-start" disabled={busy || !signup.phone.trim()} onClick={() => void startSignupWhatsAppVerification()}><WhatsAppMark size={15}/> Send WhatsApp code</button>}
          <small>WhatsApp verification does not replace required email verification or administrator approval.</small>
        </div>}
        <TextField label={authLabels.verificationCode} value={signupCode} onChange={(value) => setSignupCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
        <button className="usp-primary-button" disabled={busy || signupCode.length !== 6} type="submit">{busy ? authLabels.verifying : authLabels.verifyEmailFinish}<CheckCircle2 size={17} /></button>
        <button type="button" className="usp-secondary-button" onClick={() => { setSignupStep('identity'); setSignupCode(''); setMessage(null); }}>{authLabels.changeSignupDetails}</button>
      </form>}

      {mode !== 'forgot' && (mode !== 'signup' || signupStep === 'identity') && <>
        <div className="usp-or-divider"><span />{authLabels.or}<span /></div>
        <div className="usp-social-buttons">
          <button type="button" aria-label="Continue with Microsoft" onClick={() => startOAuth('microsoft')}><span className="sp-social-icon"><MicrosoftMark /></span><span className="sp-social-label">Microsoft</span></button>
          <button type="button" aria-label="Continue with Google" onClick={() => startOAuth('google')}><span className="sp-social-icon"><GoogleMark /></span><span className="sp-social-label">Google</span></button>
          {mode === 'signup' && <button type="button" aria-label="Add optional WhatsApp verification during account creation" className={signupWhatsAppRequested ? 'usp-social-whatsapp is-selected' : 'usp-social-whatsapp'} aria-pressed={signupWhatsAppRequested} onClick={() => setSignupWhatsAppRequested((current) => !current)}><span className="sp-social-icon"><WhatsAppMark size={15} /></span><span className="sp-social-label">WhatsApp verification</span><span className="usp-social-whatsapp-check">{signupWhatsAppRequested ? 'Selected' : 'Optional'}</span></button>}
        </div>
        <p className="usp-social-note">{mode === 'signup' ? 'Microsoft and Google use your existing staff identity. WhatsApp verifies a contact during registration; email and approval are still required.' : authLabels.socialNote}</p>
      </>}

      <p className="usp-legal-copy">
        {authLabels.legalPrefix} <a href="/terms-and-conditions.html" target="_blank" rel="noopener noreferrer">{authLabels.termsAndConditions}</a>. <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">{authLabels.privacyPolicy}</a>.
      </p>
      <div className="usp-panel-footer">
        <span className="usp-operational-pill"><i /> {secureServiceLabel}</span>
      </div>
    </section>
  );

  const authPanel = mode === 'signin'
    ? approvedSignInPanel
    : mode === 'forgot'
      ? approvedForgotPanel
      : legacyAuthPanel;
  return <SignInExperience authPanel={authPanel} authMode={mode} themeId={themeId} onInstall={() => void installApp()} />;
}
