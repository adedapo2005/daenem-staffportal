import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Check, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck,
} from 'lucide-react';
import {
  applyThemeToDocument, readModePreference, readThemeId, themeById, type ModePreference, type ThemeId,
} from './theme-system';
import { SignInExperience } from './signin-experience';
import {
  WORLD_CLOCKS, WORLD_CLOCK_CATALOG, readSignInPreferences, readWorldClockPreferences,
  type PortalLocation, type WorldClockPreferences,
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
    jobTitle?: string; department?: string; status: string; preferredTheme?: string; team?: string; lastLoginAt?: string;
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

type Message = { type: 'error' | 'success' | 'info'; text: string; details?: string[] };

type PasswordCheck = { label: string; ok: boolean; required?: boolean };

type AuthMeResult = { authenticated: boolean; context?: WorkforceContext };
const AUTH_ME_CACHE_MS = 15_000;
let authMeCache: { expiresAt: number; value: AuthMeResult } | null = null;
let authMeRequest: Promise<AuthMeResult> | null = null;

export function clearPortalAuthCache() {
  authMeCache = null;
  authMeRequest = null;
}

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
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
  async function refresh() {
    try {
      const result = await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me');
      setContext(result.context || null);
    } catch {
      setContext(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);
  async function logout() {
    setContext(null);
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
  return { context, loading, refresh, logout, setContext };
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

function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: '6+ characters', ok: password.length >= 6, required: true },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Lowercase', ok: /[a-z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Symbol', ok: /[^A-Za-z0-9]/.test(password) },
  ];
}

function fieldPlaceholder(label: string, required = false) {
  return required ? `${label} • Required` : label;
}

function TextField({
  label, value, onChange, required = false, type = 'text', autoComplete, helper,
}: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean;
  type?: string; autoComplete?: string; helper?: string;
}) {
  return <label className="usp-field">
    <span className="usp-field-label">{label}{required ? ' *' : ''}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      placeholder={fieldPlaceholder(label, required)}
      aria-label={label}
      required={required}
    />
    {helper && <small className="usp-field-help">{helper}</small>}
  </label>;
}

function PasswordField({
  label, value, onChange, autoComplete, show, setShow, required = true,
}: {
  label: string; value: string; onChange: (value: string) => void; autoComplete: string;
  show: boolean; setShow: (value: boolean) => void; required?: boolean;
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
      <button type="button" className="usp-password-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  </label>;
}

function PasswordStatus({ checks }: { checks: PasswordCheck[] }) {
  return <div className="usp-password-status" aria-label="Password strength">
    {checks.map((check) => <span key={check.label} className={check.ok ? 'pass' : 'wait'}>
      <i aria-hidden="true">{check.ok ? '✓' : '×'}</i>
      <b>{check.label}</b>
    </span>)}
  </div>;
}

function PasswordStrengthMeter({ checks, password }: { checks: PasswordCheck[]; password: string }) {
  const passed = checks.filter((check) => check.ok).length;
  const percent = Math.round((passed / checks.length) * 100);
  const label = !password ? 'Not set' : passed <= 1 ? 'Weak' : passed <= 3 ? 'Good' : passed < checks.length ? 'Strong' : 'Excellent';
  const state = !password ? 'empty' : passed <= 1 ? 'weak' : passed <= 3 ? 'good' : passed < checks.length ? 'strong' : 'excellent';
  return <div className={`usp-password-meter ${state}`} aria-label={`Password strength: ${label}`} aria-live="polite">
    <div className="usp-password-meter-meta"><span>Password strength</span><strong>{label}</strong></div>
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [themeId] = useState<ThemeId>(() => readThemeId());
  const [modePreference] = useState<ModePreference>(() => readModePreference());

  const [signupStep, setSignupStep] = useState<'form' | 'verify'>('form');
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

  const signupChecks = passwordChecks(signup.password);
  const resetChecks = passwordChecks(newPassword);

  useEffect(() => {
    ensureAppInstallListener();
  }, []);

  useEffect(() => {
    const theme = themeById(themeId);
    applyThemeToDocument(theme.id, modePreference);
    document.title = `Daenem Unified ERP Portal · ${theme.name}`;
  }, [modePreference, themeId]);

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
    setMode(next);
    setMessage(null);
    if (next === 'signup') { setSignupStep('form'); setSignupCode(''); }
    if (next === 'forgot') {
      setRecoveryStep('identity'); setRecoveryCode(''); setResetToken(''); setRecoveryIdentity(identity);
    }
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
      onAuthenticated(me.context);
    } catch (error) {
      const authError = error as ApiError;
      if (authError.code === 'LOCATION_REQUIRED' || authError.code === 'OUTSIDE_LOGIN_GEOFENCE') {
        setMessage({ type: 'error', text: 'Your sign-in could not be completed. Please contact your administrator if this continues.' });
      } else {
        setMessage({ type: 'error', text: authError.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function startSignup(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (signup.password !== signup.confirmPassword) {
      setMessage({ type: 'error', text: 'The two passwords do not match.' });
      return;
    }
    if (signup.password.length < 6) {
      setMessage({ type: 'error', text: 'Your password must contain at least 6 characters.' });
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
      setIdentity(result.username || signup.email);
      setPassword('');
      setMode('signin');
      setSignupStep('form');
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
    if (newPassword !== confirmNewPassword) {
      setMessage({ type: 'error', text: 'The two new passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Your new password must contain at least 6 characters.' });
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ username?: string; message: string }>('/api/auth/password/reset', {
        method: 'POST', body: JSON.stringify({ resetToken, newPassword }),
      });
      setIdentity(result.username || recoveryIdentity);
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
    ? { title: 'Employee sign-in', body: 'Use your employee email or username to enter the live ERP workspace.' }
    : mode === 'signup'
      ? {
          title: signupStep === 'verify' ? 'Verify your email' : 'Create account',
          body: signupStep === 'verify'
            ? 'Enter the one-time code sent to your email to finish creating your account.'
            : 'Create your secure employee login. Your work access remains subject to administrator approval.',
        }
      : {
          title: recoveryStep === 'reset' ? 'Create a new password' : recoveryStep === 'verify' ? 'Verify your identity' : 'Forgot password',
          body: recoveryStep === 'reset'
            ? 'Choose a secure password, then return to employee sign-in.'
            : recoveryStep === 'verify'
              ? 'Enter the one-time code sent to the email on your approved account.'
              : 'Enter your email or username to begin secure password recovery.',
        };

  const authPanel = (
    <section ref={panelRef} aria-label="Employee authentication" className={`usp-auth-panel usp-auth-panel-${mode}`}>
      <div className="usp-panel-heading">
        <div>
          <span className="usp-panel-eyebrow"><LockKeyhole size={14} /> SECURE ERP ACCESS</span>
          <h1>{heading.title}</h1>
          <p>{heading.body}</p>
        </div>
        {mode === 'forgot'
          ? <button type="button" className="usp-back-link" onClick={() => switchMode('signin')}>Back to sign-in</button>
          : <span className="usp-mfa-chip"><ShieldCheck size={14} /> MFA-ready</span>}
      </div>

      {mode !== 'forgot' && <div className="usp-tabs" role="tablist" aria-label="Authentication options">
        <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} role="tab" aria-selected={mode === 'signin'}>Employee Sign-In</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} role="tab" aria-selected={mode === 'signup'}>Create Account</button>
      </div>}

      {message && <div className={`usp-auth-message ${message.type}`} role="alert">
        <span>{message.text}</span>
        {message.details?.length ? <ul>{message.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
      </div>}

      {mode === 'signin' && <form className="usp-auth-form" onSubmit={signIn}>
        <TextField label="Email or Username" value={identity} onChange={setIdentity} required autoComplete="username" />
        <div className="usp-password-block">
          <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" show={showPassword} setShow={setShowPassword} />
          <button type="button" className="usp-forgot-link" onClick={() => switchMode('forgot')}>Forgot password?</button>
        </div>
        <label className="usp-remember-row">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span className="usp-check-ui"><Check size={12} /></span>
          <span>Remember Me<small>Use only on a trusted device</small></span>
        </label>
        <button className="usp-primary-button" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign In'}<ArrowRight size={17} />
        </button>
      </form>}

      {mode === 'signup' && signupStep === 'form' && <form className="usp-auth-form usp-signup-form" onSubmit={startSignup}>
        <div className="usp-two"><TextField label="First Name" value={signup.firstName} onChange={(value) => setSignup({ ...signup, firstName: value })} required autoComplete="given-name" /><TextField label="Last Name" value={signup.lastName} onChange={(value) => setSignup({ ...signup, lastName: value })} required autoComplete="family-name" /></div>
        <TextField label="Personal Email" type="email" value={signup.email} onChange={(value) => setSignup({ ...signup, email: value })} required autoComplete="email" />
        <TextField label="Phone / WhatsApp" value={signup.phone} onChange={(value) => setSignup({ ...signup, phone: value })} autoComplete="tel" />
        <TextField label="Create Username" value={signup.username} onChange={(value) => setSignup({ ...signup, username: value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required autoComplete="username" helper="4–32 characters: letters, numbers, dot, underscore or hyphen." />
        <div className="usp-two usp-password-pair"><PasswordField label="Create Password" value={signup.password} onChange={(value) => setSignup({ ...signup, password: value })} autoComplete="new-password" show={showSignupPassword} setShow={setShowSignupPassword} /><PasswordField label="Confirm Password" value={signup.confirmPassword} onChange={(value) => setSignup({ ...signup, confirmPassword: value })} autoComplete="new-password" show={showSignupConfirm} setShow={setShowSignupConfirm} /></div>
        <PasswordStrengthMeter checks={signupChecks} password={signup.password} />
        <PasswordStatus checks={signupChecks} />
        <div className="usp-two"><TextField label="Department / Work Area" value={signup.department} onChange={(value) => setSignup({ ...signup, department: value })} /><TextField label="Job Title" value={signup.jobTitle} onChange={(value) => setSignup({ ...signup, jobTitle: value })} /></div>
        <TextField label="Role / Position Information" value={signup.requestedRole} onChange={(value) => setSignup({ ...signup, requestedRole: value })} />
        <button className="usp-primary-button" disabled={busy} type="submit">{busy ? 'Preparing verification…' : 'Create Account'}<ArrowRight size={17} /></button>
      </form>}

      {mode === 'signup' && signupStep === 'verify' && <form className="usp-auth-form" onSubmit={verifySignup}>
        <div className="usp-auth-destination"><Mail size={18} /><span>Verification code sent to <b>{signupDestination}</b></span></div>
        {signupBootstrapCode && <div className="usp-bootstrap-code"><span>PRIVATE BOOTSTRAP CODE</span><strong>{signupBootstrapCode}</strong><small>Visible only in the local bootstrap stage.</small></div>}
        <TextField label="6-digit verification code" value={signupCode} onChange={(value) => setSignupCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
        <button className="usp-primary-button" disabled={busy || signupCode.length !== 6} type="submit">{busy ? 'Verifying…' : 'Verify email & finish signup'}<CheckCircle2 size={17} /></button>
        <button type="button" className="usp-secondary-button" onClick={() => { setSignupStep('form'); setSignupCode(''); setMessage(null); }}>Change signup details</button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'identity' && <form className="usp-auth-form" onSubmit={startRecovery}>
        <TextField label="Email or Username" value={recoveryIdentity} onChange={setRecoveryIdentity} required autoComplete="username" />
        <div className="usp-positive-note"><Mail size={16} /><span>If the details match an approved account, we’ll send a one-time code to the email on file.</span></div>
        <button className="usp-primary-button" disabled={busy} type="submit">{busy ? 'Preparing recovery…' : 'Send recovery code'}<ArrowRight size={17} /></button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'verify' && <form className="usp-auth-form" onSubmit={verifyRecovery}>
        <div className="usp-auth-destination"><Mail size={18} /><span>Enter the 6-digit code sent to your email.</span></div>
        {recoveryBootstrapCode && <div className="usp-bootstrap-code"><span>PRIVATE BOOTSTRAP CODE</span><strong>{recoveryBootstrapCode}</strong><small>Visible only in the local bootstrap stage.</small></div>}
        <TextField label="6-digit verification code" value={recoveryCode} onChange={(value) => setRecoveryCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
        <button className="usp-primary-button" disabled={busy || recoveryCode.length !== 6} type="submit">{busy ? 'Verifying…' : 'Verify identity'}<CheckCircle2 size={17} /></button>
        <button type="button" className="usp-secondary-button" onClick={() => { setRecoveryStep('identity'); setRecoveryCode(''); setMessage(null); }}>Request another code</button>
      </form>}

      {mode === 'forgot' && recoveryStep === 'reset' && <form className="usp-auth-form" onSubmit={resetPassword}>
        <div className="usp-reset-unlocked"><CheckCircle2 size={20} /><div><strong>Identity verified</strong><span>Create your password to finish securing your access.</span></div></div>
        <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" show={showNewPassword} setShow={setShowNewPassword} />
        <PasswordField label="Confirm New Password" value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" show={showNewConfirm} setShow={setShowNewConfirm} />
        <PasswordStrengthMeter checks={resetChecks} password={newPassword} />
        <PasswordStatus checks={resetChecks} />
        <button className="usp-primary-button" disabled={busy} type="submit">{busy ? 'Securing account…' : 'Create password'}<KeyRound size={17} /></button>
      </form>}

      {mode !== 'forgot' && <>
        <div className="usp-or-divider"><span />or<span /></div>
        <div className="usp-social-buttons">
          <button type="button" onClick={() => unavailableOAuth('Microsoft')}><span className="usp-microsoft-mark"><i /><i /><i /><i /></span>{mode === 'signup' ? 'Create Account with Microsoft' : 'Sign In with Microsoft'}</button>
          <button type="button" onClick={() => unavailableOAuth('Google')}><b className="usp-google-mark">G</b>{mode === 'signup' ? 'Create Account with Google' : 'Sign In with Google'}</button>
        </div>
        <p className="usp-social-note">Use your Microsoft or Google account to sign in or create an account.</p>
      </>}

      <p className="usp-legal-copy">
        By continuing to log in, you agree to Daenem Farms’ <a href="/terms-and-conditions.html" target="_blank" rel="noopener noreferrer">Terms and Conditions</a>. <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
      </p>
      <div className="usp-panel-footer">
        <span className="usp-operational-pill"><i /> {readSignInPreferences().labels.secureService}</span>
      </div>
    </section>
  );

  return <SignInExperience authPanel={authPanel} themeId={themeId} modePreference={modePreference} onInstall={() => void installApp()} />;
}
