import React, { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowRight, Check, CheckCircle2, Clock3, Download, Eye, EyeOff,
  KeyRound, LockKeyhole, Mail, Radio, ShieldCheck, Sparkles, Sun,
} from 'lucide-react';
import {
  applyThemeToDocument, readModePreference, readThemeId, themeById, type ModePreference, type ThemeId,
} from './theme-system';

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
  return <label className="auth-field">
    <span className="field-label-text">{label}{required ? ' *' : ''}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      placeholder={fieldPlaceholder(label, required)}
      aria-label={label}
      required={required}
    />
    {helper && <small className="field-help">{helper}</small>}
  </label>;
}

function PasswordField({
  label, value, onChange, autoComplete, show, setShow, required = true,
}: {
  label: string; value: string; onChange: (value: string) => void; autoComplete: string;
  show: boolean; setShow: (value: boolean) => void; required?: boolean;
}) {
  return <label className="auth-field">
    <span className="field-label-text">{label}{required ? ' *' : ''}</span>
    <div className="password-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={fieldPlaceholder(label, required)}
        aria-label={label}
        required={required}
      />
      <button type="button" className="password-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  </label>;
}

function PasswordStatus({ checks }: { checks: PasswordCheck[] }) {
  return <div className="password-status" aria-label="Password strength">
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
  return <div className={`password-meter ${state}`} aria-label={`Password strength: ${label}`} aria-live="polite">
    <div className="password-meter-meta"><span>Password strength</span><strong>{label}</strong></div>
    <div className="password-meter-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={label}><span className="password-meter-fill" style={{ width: `${percent}%` }} /></div>
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

export const WORLD_CLOCKS = [
  { name: 'Daenem Complex', region: 'Ibadan, Nigeria', zone: 'Africa/Lagos', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'Toronto', region: 'Canada', zone: 'America/Toronto', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'London', region: 'United Kingdom', zone: 'Europe/London', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'New York', region: 'United States', zone: 'America/New_York', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'Moscow', region: 'Russia', zone: 'Europe/Moscow', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'Tokyo', region: 'Japan', zone: 'Asia/Tokyo', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
  { name: 'Beijing / Shanghai', region: 'China', zone: 'Asia/Shanghai', weather: 'Local snapshot', temperature: '—', weatherIcon: '✦' },
] as const;

export function WorldClocks() {
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
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', start); };
  }, []);
  return <div className="world-clocks" aria-label="Daenem seven-city world clock">
    <div className="world-clocks-heading"><span className="eyebrow">GLOBAL OPERATIONS CLOCK</span><strong>Seven locations · live local time</strong></div>
    <div className="world-clocks-grid">
      {WORLD_CLOCKS.map((item) => <article className="world-clock" key={item.zone} tabIndex={0}>
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
          <span className="clock-weather"><span aria-hidden="true">{item.weatherIcon}</span>{item.weather} · {item.temperature}</span>
        </div>
      </article>)}
    </div>
  </div>;
}


type LiveHealthState = {
  state: 'checking' | 'operational' | 'attention';
  latencyMs: number | null;
  version: string;
  checkedAt: Date | null;
};

type LiveWeatherState = {
  state: 'loading' | 'ready' | 'unavailable';
  temperatureF: number | null;
  description: string;
  location: string;
  updatedAt: Date | null;
};

function liveTimeText(zone: string, date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
  }).format(date);
}

function liveDateText(zone: string, date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, month: 'short', day: 'numeric', year: 'numeric',
  }).format(date);
}

function liveTimeZoneText(zone: string, date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone, timeZoneName: 'short',
  }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || zone;
}

function liveClockHands(zone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0) % 12;
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return {
    '--hour-angle': (hour * 30 + minute * 0.5) + 'deg',
    '--minute-angle': (minute * 6) + 'deg',
  } as React.CSSProperties;
}

function LiveHeroSurface({ onFocusAccess }: { onFocusAccess: () => void }) {
  const [now, setNow] = useState(() => new Date());
  const [health, setHealth] = useState<LiveHealthState>({
    state: 'checking', latencyMs: null, version: '', checkedAt: null,
  });
  const [weather, setWeather] = useState<LiveWeatherState>({
    state: 'loading', temperatureF: null, description: 'Checking current conditions',
    location: 'Ibadan, Nigeria', updatedAt: null,
  });

  useEffect(() => {
    let timer = 0;
    const stop = () => { if (timer) window.clearInterval(timer); timer = 0; };
    const start = () => {
      stop();
      if (document.visibilityState !== 'visible') return;
      setNow(new Date());
      timer = window.setInterval(() => setNow(new Date()), 1000);
    };
    document.addEventListener('visibilitychange', start);
    start();
    return () => { stop(); document.removeEventListener('visibilitychange', start); };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshHealth() {
      const startedAt = Date.now();
      try {
        const result = await api<{ ok?: boolean; version?: string }>('/api/health');
        if (!active) return;
        setHealth({
          state: result.ok === false ? 'attention' : 'operational',
          latencyMs: Math.max(1, Date.now() - startedAt),
          version: result.version || 'production',
          checkedAt: new Date(),
        });
      } catch {
        if (active) setHealth({ state: 'attention', latencyMs: null, version: '', checkedAt: new Date() });
      }
    }
    refreshHealth();
    const timer = window.setInterval(refreshHealth, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshWeather() {
      try {
        const result = await api<{ temperature?: number; description?: string }>('/api/context/weather?lat=7.3775&lon=3.9470');
        if (!active) return;
        const temperatureC = typeof result.temperature === 'number' ? result.temperature : null;
        setWeather({
          state: temperatureC === null ? 'unavailable' : 'ready',
          temperatureF: temperatureC === null ? null : Math.round((temperatureC * 9) / 5 + 32),
          description: result.description || 'Current conditions',
          location: 'Ibadan, Nigeria',
          updatedAt: new Date(),
        });
      } catch {
        if (active) setWeather((current) => ({ ...current, state: 'unavailable', updatedAt: new Date() }));
      }
    }
    refreshWeather();
    const timer = window.setInterval(refreshWeather, 600_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const lagosTime = liveTimeText('Africa/Lagos', now);
  const lagosDate = liveDateText('Africa/Lagos', now);
  const healthLabel = health.state === 'operational' ? 'Operational' : health.state === 'attention' ? 'Attention' : 'Checking';
  const healthDetail = health.state === 'operational'
    ? (health.latencyMs || '—') + ' ms edge response'
    : health.state === 'attention' ? 'Retrying edge status' : 'Connecting to edge status';
  const weatherTemp = weather.temperatureF === null ? '—' : weather.temperatureF + '°F';
  const weatherDetail = weather.state === 'loading'
    ? 'Loading current conditions'
    : weather.state === 'unavailable' ? 'Weather temporarily unavailable' : weather.description;
  const updatedLabel = weather.updatedAt
    ? 'Updated ' + liveTimeText('Africa/Lagos', weather.updatedAt)
    : 'Waiting for live reading';

  return <div className="hero-live-surface" data-testid="live-hero-surface" aria-label="Live Sunlit Meridian portal surface">
    <div className="hero-live-board">
      <div className="hero-live-light-sweep" aria-hidden="true" />
      <div className="hero-live-board-badge"><span className="hero-live-orb" /><span>LIVE WORKSPACE</span><b>{lagosTime}</b></div>

      <section className="hero-live-auth-card" aria-label="Live employee sign-in preview">
        <div className="hero-live-card-label"><span><LockKeyhole size={11} /> LIVE ACCESS</span><span className={'hero-live-card-state ' + health.state}><i />{health.state === 'operational' ? 'READY' : 'SYNCING'}</span></div>
        <div className="hero-live-auth-brand"><img src="/brand-assets/logo-mark.svg" alt="" /><span><strong>Daenem</strong><small>Employee Portal</small></span></div>
        <h3>Employee sign-in</h3>
        <p>Production authentication is connected to the secure form.</p>
        <button type="button" onClick={onFocusAccess}>Open live sign-in <ArrowRight size={12} /></button>
        <span className="hero-live-card-foot"><ShieldCheck size={11} /> Session protected</span>
      </section>

      <section className="hero-live-weather-card" aria-label="Live Ibadan weather">
        <div className="hero-live-weather-icon" aria-hidden="true"><Sun size={23} /></div>
        <div className="hero-live-card-label"><span>LIVE WEATHER</span><b>IBADAN</b></div>
        <strong>{weatherTemp}</strong>
        <span>{weatherDetail}</span>
        <small>{updatedLabel}</small>
      </section>

      <section className="hero-live-insights" aria-label="Live portal widgets">
        <article className="hero-live-insight hero-live-insight-ai"><span><Sparkles size={10} /> AI INSPIRATION</span><strong>Make the next task obvious.</strong><small>Guidance layer ready.</small></article>
        <article className="hero-live-insight hero-live-insight-health"><span><Activity size={10} /> PORTAL STATUS</span><strong>{healthLabel}</strong><small>{healthDetail}</small></article>
        <article className="hero-live-insight hero-live-insight-update"><span><Radio size={10} /> LIVE UPDATE</span><strong>Workspace refreshed</strong><small>{health.checkedAt ? 'Checked ' + liveTimeText('Africa/Lagos', health.checkedAt) : 'Checking edge…'}</small></article>
      </section>

      <section className="hero-live-status-row" aria-label="Live portal signals">
        <span className="hero-live-status-item"><i className={'hero-live-status-dot ' + health.state} /><strong>{healthLabel}</strong><small>{healthDetail}</small></span>
        <span className="hero-live-status-item"><Clock3 size={12} /><strong>{lagosTime}</strong><small>Ibadan · {lagosDate}</small></span>
        <span className="hero-live-status-item"><LockKeyhole size={12} /><strong>Secure session</strong><small>Employee access protected</small></span>
      </section>

      <section className="hero-live-clock-rail" aria-label="Seven live world clocks">
        {WORLD_CLOCKS.map((item) => <article className="hero-live-mini-clock-card" key={item.zone} tabIndex={0} aria-label={item.name + ' live time'}>
          <div className="hero-live-mini-clock" style={liveClockHands(item.zone, now)} aria-hidden="true"><span className="hero-live-clock-hand hero-live-clock-hand-hour" /><span className="hero-live-clock-hand hero-live-clock-hand-minute" /><span className="hero-live-clock-center" /></div>
          <div className="hero-live-mini-clock-info"><strong>{item.name}</strong><b>{liveTimeText(item.zone, now)}</b><small>{liveDateText(item.zone, now)} · {liveTimeZoneText(item.zone, now)}</small><span><i />{dayNightText(item.zone)}</span></div>
        </article>)}
      </section>
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
    const theme = themeById(themeId);
    applyThemeToDocument(theme.id, modePreference);
    document.title = `${theme.name} · Daenem Staff Portal`;
  }, [modePreference, themeId]);

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [mode, signupStep, recoveryStep]);

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
      const me = await api<{ authenticated: boolean; context: WorkforceContext }>('/api/auth/me');
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
    ? { title: 'Sign in', body: 'Access your account securely.' }
    : mode === 'signup'
      ? { title: signupStep === 'verify' ? 'Verify your email' : 'Sign up', body: signupStep === 'verify' ? 'Enter the one-time code sent to your email to finish creating your account.' : 'Create your employee login now. You can complete the rest of your work profile after sign-in.' }
      : { title: recoveryStep === 'reset' ? 'Create your password' : recoveryStep === 'verify' ? 'Verify your identity' : 'Recover your account', body: recoveryStep === 'reset' ? 'Choose your password, then return to sign in.' : recoveryStep === 'verify' ? 'Enter the one-time code sent to your email.' : 'Enter your username or email. This also activates approved first-time employee access.' };

  const theme = themeById(themeId);

  function focusSigninPanel() {
    const input = panelRef.current?.querySelector<HTMLInputElement>('input[aria-label="Email or Username"]');
    input?.focus();
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return <main className={`signin-page signin-${theme.signInLayout}`}>
    <div className="signin-surface">
      <section className="signin-hero">
        <div className="hero-brand"><div className="brand-lockup"><span className="brand-mark"><img className="brand-mark-image" src="/brand-assets/logo-mark.svg" alt="" /></span><span className="brand-copy"><strong>Daenem</strong><span>Staff Portal</span></span></div></div>
        <div className="hero-topline"><span className="status-dot" /> Private workspace <span className="hero-secure-label"><ShieldCheck size={14} /> Secure employee access</span></div>
        <div className="hero-content">
          <h2 className="hero-title">Staff Portal</h2>
          <p className="hero-tagline">Technology That Transforms Tomorrow</p>
          <p className="hero-supporting-copy">A secure gateway to the work, insight, and collaboration your role unlocks.</p>
          <section className="hero-widgets" aria-label="Staff portal inspiration and updates">
            <article className="hero-widget hero-widget-ai"><span>AI INSPIRATION</span><strong>Make the next task feel obvious.</strong><small>Role-aware guidance across your authorized ERPs.</small></article>
            <article className="hero-widget hero-widget-motivation"><span>EMPLOYEE MOTIVATION</span><strong>Progress compounds into momentum.</strong><small>See what matters, then move one useful thing forward.</small></article>
            <article className="hero-widget hero-widget-news"><span>DAENEM NEWS</span><strong>One connected staff experience.</strong><small>People, production, properties, mobility, and operations in one secure portal.</small></article>
          </section>
        </div>
        <div className="hero-footer"><ShieldCheck size={16} /> Secure enterprise access <span>•</span> Designed for web, tablet and mobile</div>
        {theme.id === 'lagos-sunrise' && <LiveHeroSurface onFocusAccess={focusSigninPanel} />}
      </section>

      <section className="signin-panel-wrap">
      <section ref={panelRef} className={`signin-panel signin-panel-${mode}`}>
          <div className="panel-heading"><div><span className="eyebrow">Welcome back</span><h1>{heading.title}</h1><p>{heading.body}</p></div><div className="panel-security"><LockKeyhole size={15} /> MFA-ready</div></div>
          <div className="signin-tabs" role="tablist" aria-label="Sign-in options">
            <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} role="tab" aria-selected={mode === 'signin'}>Employee Sign-In</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} role="tab" aria-selected={mode === 'signup'}>Create Account</button>
            <button className={mode === 'forgot' ? 'active' : ''} onClick={() => switchMode('forgot')} role="tab" aria-selected={mode === 'forgot'}>Forgot Password</button>
          </div>

          {message && <div className={`auth-message ${message.type}`} role="alert"><span>{message.text}</span>{message.details?.length ? <ul>{message.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}</div>}

          {mode === 'signin' && <form className="signin-form" onSubmit={signIn}>
            <TextField label="Email or Username" value={identity} onChange={setIdentity} required autoComplete="username" helper="Use the employee identity assigned to your account." />
            <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" show={showPassword} setShow={setShowPassword} />
            <label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span className="check-ui"><Check size={12} /></span>Remember Me <small>Use only on a trusted device</small></label>
            <button type="button" className="auth-link forgot-link" onClick={() => switchMode('forgot')}>Forgot password?</button>
            <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign In'}<ArrowRight size={17} /></button>
          </form>}

          {mode === 'signup' && signupStep === 'form' && <form className="signin-form auth-signup-form" onSubmit={startSignup}>
            <div className="auth-two"><TextField label="First Name" value={signup.firstName} onChange={(value) => setSignup({ ...signup, firstName: value })} required autoComplete="given-name" /><TextField label="Last Name" value={signup.lastName} onChange={(value) => setSignup({ ...signup, lastName: value })} required autoComplete="family-name" /></div>
            <TextField label="Personal Email" type="email" value={signup.email} onChange={(value) => setSignup({ ...signup, email: value })} required autoComplete="email" />
            <TextField label="Phone / WhatsApp" value={signup.phone} onChange={(value) => setSignup({ ...signup, phone: value })} autoComplete="tel" />
            <TextField label="Create Username" value={signup.username} onChange={(value) => setSignup({ ...signup, username: value.toLowerCase().replace(/[^a-z0-9._-]/g, '') })} required autoComplete="username" helper="4–32 characters. Letters, numbers, dot, underscore or hyphen." />
            <div className="auth-two password-pair"><PasswordField label="Create Password" value={signup.password} onChange={(value) => setSignup({ ...signup, password: value })} autoComplete="new-password" show={showSignupPassword} setShow={setShowSignupPassword} /><PasswordField label="Confirm Password" value={signup.confirmPassword} onChange={(value) => setSignup({ ...signup, confirmPassword: value })} autoComplete="new-password" show={showSignupConfirm} setShow={setShowSignupConfirm} /></div>
            <PasswordStrengthMeter checks={signupChecks} password={signup.password} />
            <PasswordStatus checks={signupChecks} />
            <div className="auth-two"><TextField label="Department / Work Area" value={signup.department} onChange={(value) => setSignup({ ...signup, department: value })} /><TextField label="Job Title" value={signup.jobTitle} onChange={(value) => setSignup({ ...signup, jobTitle: value })} /></div>
            <TextField label="Role / Position Information" value={signup.requestedRole} onChange={(value) => setSignup({ ...signup, requestedRole: value })} />
            <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Preparing verification…' : 'Create account'}<ArrowRight size={17} /></button>
          </form>}

          {mode === 'signup' && signupStep === 'verify' && <form className="signin-form" onSubmit={verifySignup}>
            <div className="auth-destination"><Mail size={18} /><span>Verification code sent to <b>{signupDestination}</b></span></div>
            {signupBootstrapCode && <div className="bootstrap-code"><span>PRIVATE BOOTSTRAP CODE</span><strong>{signupBootstrapCode}</strong><small>Visible only in the local bootstrap stage.</small></div>}
            <TextField label="6-digit verification code" value={signupCode} onChange={(value) => setSignupCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
            <button className="primary-button submit-button" disabled={busy || signupCode.length !== 6} type="submit">{busy ? 'Verifying…' : 'Verify email & finish signup'}<CheckCircle2 size={17} /></button>
            <button type="button" className="secondary-button" onClick={() => { setSignupStep('form'); setSignupCode(''); setMessage(null); }}>Change signup details</button>
          </form>}

          {mode === 'forgot' && recoveryStep === 'identity' && <form className="signin-form" onSubmit={startRecovery}>
            <TextField label="Email or Username" value={recoveryIdentity} onChange={setRecoveryIdentity} required autoComplete="username" />
            <div className="positive-note"><Mail size={16} /><span>If the details match an approved account, we’ll send a one-time code to the email on file.</span></div>
            <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Preparing recovery…' : 'Send recovery link'}<ArrowRight size={17} /></button>
          </form>}

          {mode === 'forgot' && recoveryStep === 'verify' && <form className="signin-form" onSubmit={verifyRecovery}>
            <div className="auth-destination"><Mail size={18} /><span>Enter the 6-digit code sent to your email.</span></div>
            {recoveryBootstrapCode && <div className="bootstrap-code"><span>PRIVATE BOOTSTRAP CODE</span><strong>{recoveryBootstrapCode}</strong><small>Visible only in the local bootstrap stage.</small></div>}
            <TextField label="6-digit verification code" value={recoveryCode} onChange={(value) => setRecoveryCode(value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
            <button className="primary-button submit-button" disabled={busy || recoveryCode.length !== 6} type="submit">{busy ? 'Verifying…' : 'Verify identity'}<CheckCircle2 size={17} /></button>
            <button type="button" className="secondary-button" onClick={() => { setRecoveryStep('identity'); setRecoveryCode(''); setMessage(null); }}>Request another code</button>
          </form>}

          {mode === 'forgot' && recoveryStep === 'reset' && <form className="signin-form" onSubmit={resetPassword}>
            <div className="reset-unlocked"><CheckCircle2 size={20} /><div><strong>Identity verified</strong><span>Create your password to finish securing your access.</span></div></div>
            <PasswordField label="New Password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" show={showNewPassword} setShow={setShowNewPassword} />
            <PasswordField label="Confirm New Password" value={confirmNewPassword} onChange={setConfirmNewPassword} autoComplete="new-password" show={showNewConfirm} setShow={setShowNewConfirm} />
            <PasswordStrengthMeter checks={resetChecks} password={newPassword} />
            <PasswordStatus checks={resetChecks} />
            <button className="primary-button submit-button" disabled={busy} type="submit">{busy ? 'Securing account…' : 'Create password'}<KeyRound size={17} /></button>
          </form>}

          {mode !== 'forgot' && <><div className="or-divider"><span /> or <span /></div><div className="social-buttons"><button type="button" onClick={() => unavailableOAuth('Microsoft')}><span className="microsoft-mark"><i /><i /><i /><i /></span> {mode === 'signup' ? 'Create Account with Microsoft' : 'Sign In with Microsoft'}</button><button type="button" onClick={() => unavailableOAuth('Google')}><b className="google-mark">G</b> {mode === 'signup' ? 'Create Account with Google' : 'Sign In with Google'}</button></div><p className="social-note">Use your Microsoft or Google account to sign in or create an account.</p></>}

          <div className="legal-copy">By continuing to log in, you agree to Daenem’s <a href="#terms">Terms and Conditions</a>. <a href="#privacy">Privacy Policy</a>.</div>
          <div className="panel-footer-actions"><span className="operational-pill"><i /> Operational</span><button className="install-button" type="button" onClick={() => setMessage({ type: 'info', text: 'Install instructions are available from App & GPS after you sign in.' })}><Download size={16} /> Install Daenem ERP App</button></div>
        </section>
      </section>
    </div>
    <div className="signin-bottom-note"><ShieldCheck size={14} /> Private workspace · MFA-ready · Employee-neutral by design</div>
    <WorldClocks />
  </main>;
}
