import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface Env extends AuthEnv { AI?: Ai }

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const themes = [
  'lagos-sunrise', 'print-neon-grid', 'digital-indigo', 'auto-showroom-night',
  'urban-property-skyline', 'cargo-flow', 'executive-boardroom', 'job-market-pulse',
  'global-operations-mesh', 'minimal-tech-white',
];
const aliases: Record<string, string> = {
  executive: 'executive-boardroom', 'executive-night': 'executive-boardroom', horizon: 'lagos-sunrise',
  midnight: 'auto-showroom-night', clean: 'minimal-tech-white', glass: 'digital-indigo',
  emerald: 'cargo-flow', azure: 'global-operations-mesh', sandstone: 'executive-boardroom',
  carbon: 'auto-showroom-night', focus: 'minimal-tech-white', contrast: 'minimal-tech-white',
  'high-contrast-dark': 'auto-showroom-night', 'system-adaptive': 'global-operations-mesh',
};

const SIGNIN_WIDGET_KINDS = ['weather', 'inspiration', 'motivation', 'news', 'status'] as const;
const SIGNIN_ZONES = ['workspace-spotlight', 'live-context', 'today', 'auxiliary'] as const;
const SIGNIN_BACKGROUND_IDS = ['unified-daylight', 'lagos-sunrise', 'urban-skyline', 'cargo-flow', 'executive-boardroom', 'job-market-pulse', 'global-operations', 'minimal-tech-white', 'global-executive-atrium', 'future-technology-campus', 'daylight-glass-skyline', 'premium-connected-workspace'] as const;
const CLOCK_ZONES = [
  'Africa/Lagos', 'America/Toronto', 'Europe/London', 'America/New_York', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney',
] as const;
const STANDARD_CLOCK_ZONES = CLOCK_ZONES.slice(0, 7);
const CLOCK_STYLES = ['minimal', 'detailed', 'neon', 'classic'] as const;
const EFFECT_LEVELS = ['calm', 'balanced', 'vivid'] as const;
const EFFECT_PRESETS = ['quiet', 'glass', 'accent', 'soft'] as const;
const LABEL_LIMITS = {
  brandEyebrow: 40, brandTitle: 48, brandTagline: 90, workspaceLabel: 48,
  workspaceHeadline: 90, workspaceDescription: 180, sectionHeading: 40, widget: 42, display: 64, support: 110,
};
const DEFAULT_LEGAL_PREFIX = 'By continuing to login, you agree to Daenem Group';
const LEGACY_LEGAL_PREFIXES = new Set([
  'By continuing to log in, you agree to Daenem Farms’',
  "By continuing to log in, you agree to Daenem Farms'",
  'By continuing to login, you agree to Daenem Farms’',
  "By continuing to login, you agree to Daenem Farms'",
  'By continuing to login, you agree to Daenem Farms',
]);

const VARIANTS: Record<string, string[]> = {
  weather: ['standard'],
  status: ['operational'],
  inspiration: ['insight-card', 'innovation-spark', 'daily-prompt', 'executive-thought'],
  motivation: ['momentum-card', 'team-boost', 'recognition-prompt', 'focus-goal'],
  news: ['headline-stack', 'executive-briefing', 'horizontal-ticker', 'top-stories-cards'],
};

const DEFAULT_LABELS = {
  brandEyebrow: 'DAENEM UNIFIED ERP',
  brandTitle: 'Employee Portal',
  brandTagline: 'Technology That Transforms Tomorrow.',
  workspaceLabel: 'DAENEM LIVE WORKSPACE',
  workspaceHeadline: 'One secure workspace. Live on every device.',
  workspaceDescription: 'Real-time access, global context, and role-protected ERP tools—connected through one premium employee portal.',
  liveContextHeading: 'LIVE CONTEXT',
  todayHeading: 'TODAY',
  workspaceSpotlightHeading: 'WORKSPACE SPOTLIGHT',
  auxiliaryHeading: 'AUXILIARY',
  globalOperationsHeading: 'GLOBAL OPERATIONS · LIVE TIME & WEATHER',
  liveErpAccess: 'LIVE ERP ACCESS',
  installApp: 'Install App',
  ibadanTime: 'IBADAN TIME',
  session: 'SESSION',
  protected: 'Protected',
  encryptedSession: 'Encrypted employee access',
  secureService: 'Secure service',
  weatherLoading: 'Loading current conditions',
  weatherLocation: 'IBADAN',
  weatherConnecting: 'Connecting to live weather',
  weatherUpdated: 'Updated',
  liveGuidanceNote: 'Live guidance · refreshed automatically',
  dailyMomentumNote: 'Daily momentum for every business unit',
  rotatingLiveFeed: 'rotating live feed',
  statusOperational: 'Operational',
  statusMaintenance: 'Maintenance',
  statusChecking: 'Checking',
  statusConnecting: 'Connecting securely',
  clockSummary: 'locations · 12-hour time · automatic updates',
  inspirationSpark: 'SPARK', promptOfTheDay: 'PROMPT OF THE DAY', promptOfTheDayNote: 'A question to focus the next useful action.',
  teamBoost: 'TEAM BOOST', recognition: 'RECOGNITION', focusGoal: 'FOCUS GOAL', recognitionNote: 'Notice one contribution worth recognizing today.',
  priorityBriefing: 'PRIORITY BRIEFING', secureEdge: 'secure edge', serviceTeamNotified: 'Service team notified',
  auth: {
    secureErpAccess: 'SECURE ERP ACCESS', signInTitle: 'Employee sign-in',
    signInDescription: 'Use your employee email or username to enter the live ERP workspace.',
    createAccountTitle: 'Create account', createAccountDescription: 'Create your secure employee login. Your work access remains subject to administrator approval.',
    verifyEmailTitle: 'Verify your email', verifyEmailDescription: 'Enter the one-time code sent to your email to finish creating your account.',
    forgotPasswordTitle: 'Forgot password', forgotPasswordDescription: 'Enter your email or username to begin secure password recovery.',
    verifyIdentityTitle: 'Verify your identity', verifyIdentityDescription: 'Enter the one-time code sent to the email on your approved account.',
    newPasswordTitle: 'Create a new password', newPasswordDescription: 'Choose a secure password, then return to employee sign-in.',
    employeeSignInTab: 'Employee Sign-In', createAccountTab: 'Create Account', emailOrUsername: 'Email or Username', password: 'Password',
    forgotPassword: 'Forgot password?', rememberMe: 'Remember Me', trustedDevice: 'Use only on a trusted device', signIn: 'Sign In', signingIn: 'Signing in…', mfaReady: 'MFA-ready',
    microsoftSignIn: 'Sign In with Microsoft', googleSignIn: 'Sign In with Google', microsoftCreateAccount: 'Create Account with Microsoft', googleCreateAccount: 'Create Account with Google',
    backToSignIn: 'Back to sign-in', firstName: 'First Name', lastName: 'Last Name', personalEmail: 'Personal Email', phoneWhatsApp: 'Phone / WhatsApp', createUsername: 'Create Username',
    usernameHelper: '4–32 characters: letters, numbers, dot, underscore or hyphen.', createPassword: 'Create Password', confirmPassword: 'Confirm Password', departmentWorkArea: 'Department / Work Area', jobTitle: 'Job Title', rolePosition: 'Role / Position Information',
    preparingVerification: 'Preparing verification…', verificationCode: '6-digit verification code', verifyEmailFinish: 'Verify email & finish signup', changeSignupDetails: 'Change signup details', sendRecoveryCode: 'Send recovery code', preparingRecovery: 'Preparing recovery…', verifyIdentity: 'Verify identity', requestAnotherCode: 'Request another code', newPassword: 'New Password', confirmNewPassword: 'Confirm New Password', createNewPassword: 'Create password', securingAccount: 'Securing account…',
    continue: 'Continue', back: 'Back', verifying: 'Verifying…', verificationSentTo: 'Verification code sent to', privateBootstrapCode: 'PRIVATE BOOTSTRAP CODE', bootstrapNote: 'Visible only in the local bootstrap stage.', verificationCodeSent: 'Enter the 6-digit code sent to your email.', recoveryIdentityNote: 'If the details match an approved account, we’ll send a one-time code to the email on file.', identityVerified: 'Identity verified', resetAccessNote: 'Create your password to finish securing your access.', socialNote: 'Use your Microsoft or Google account to sign in or create an account.', legalPrefix: DEFAULT_LEGAL_PREFIX, termsAndConditions: 'Terms and Conditions', privacyPolicy: 'Privacy Policy', or: 'or', passwordStrength: 'Password strength', passwordNotSet: 'Not set', passwordWeak: 'Weak', passwordGood: 'Good', passwordStrong: 'Strong', passwordExcellent: 'Excellent', showPassword: 'Show password', hidePassword: 'Hide password',
  },
  widgetLabels: { weather: 'LIVE WEATHER', inspiration: 'AI INSPIRATION', motivation: 'EMPLOYEE MOTIVATION', news: 'LIVE NEWS', status: 'PORTAL STATUS' },
};

const DEFAULT_CONTENT = {
  inspiration: 'Turn the clearest next step into visible progress.',
  motivation: 'Build today’s momentum with one useful, well-finished action.',
};

const defaultSignInConfig = {
  schemaVersion: 3,
  widgetOrder: ['weather', 'inspiration', 'motivation', 'news', 'status'],
  hiddenWidgets: [] as string[],
  widgetInstances: [
    { id: 'weather', kind: 'weather', variant: 'standard', zone: 'live-context', order: 0, visible: true, label: DEFAULT_LABELS.widgetLabels.weather, effectPreset: 'glass' },
    { id: 'status', kind: 'status', variant: 'operational', zone: 'live-context', order: 1, visible: true, label: DEFAULT_LABELS.widgetLabels.status, effectPreset: 'soft' },
    { id: 'inspiration', kind: 'inspiration', variant: 'insight-card', zone: 'today', order: 2, visible: true, label: DEFAULT_LABELS.widgetLabels.inspiration, effectPreset: 'accent' },
    { id: 'motivation', kind: 'motivation', variant: 'momentum-card', zone: 'today', order: 3, visible: true, label: DEFAULT_LABELS.widgetLabels.motivation, effectPreset: 'soft' },
    { id: 'news', kind: 'news', variant: 'headline-stack', zone: 'today', order: 4, visible: true, label: DEFAULT_LABELS.widgetLabels.news, effectPreset: 'glass' },
  ],
  clockStyle: 'detailed',
  clockZones: [...STANDARD_CLOCK_ZONES],
  temperatureUnit: 'F',
  logoPosition: 'left',
  logo: { position: 'left', size: 'prominent', alignment: 'start', glass: true, animation: 'float' },
  effectLevel: 'balanced',
  effects: { ambientGlow: true, glassIntensity: 72, backgroundBreathing: true, cardFloat: true, logoMotion: true, statusPulse: true, widgetEntrance: true, shimmer: false },
  themeMode: 'auto',
  backgroundId: 'unified-daylight',
  darkStart: '19:00',
  darkEnd: '07:00',
  labels: DEFAULT_LABELS,
  content: DEFAULT_CONTENT,
  globalOperations: { visible: true, maxClocks: 7, showWeather: true, weatherStyle: 'detailed', weatherAnimation: 'subtle', showFeelsLike: true, showHumidity: true, showWind: true, showPrecipitation: true, showHighLow: true, showSunriseSunset: true, showAnalog: true, showDigital: true, showDate: true, showTimezone: true, showDayNight: true },
};

const fallbackAiOptions: Record<string, string[]> = {
  inspiration: [
    'Connect the right information to the right action.',
    'Good systems turn careful work into repeatable progress.',
    'Let today’s best decision create tomorrow’s momentum.',
  ],
  motivation: [
    'Recognize progress, resolve the blocker, and move forward.',
    'Your consistent effort keeps the whole operation moving.',
    'Finish one meaningful task well, then build from there.',
  ],
};

function record(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function cleanText(value: unknown, fallback: string, max: number) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return (text || fallback).slice(0, max);
}
function normalizeLegalPrefix(value: unknown) {
  const text = cleanText(value, DEFAULT_LEGAL_PREFIX, LABEL_LIMITS.support);
  return LEGACY_LEGAL_PREFIXES.has(text) ? DEFAULT_LEGAL_PREFIX : text;
}
function list(value: unknown, allowed: readonly string[], fallback: readonly string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const result = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
  return result.length ? result : [...fallback];
}
function safeTime(value: unknown, fallback: string) {
  const text = String(value || '');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}
function normalizeLabels(value: unknown) {
  const source = record(value);
  const widgets = record(source.widgetLabels);
  const auth = record(source.auth);
  return {
    brandEyebrow: cleanText(source.brandEyebrow, DEFAULT_LABELS.brandEyebrow, LABEL_LIMITS.brandEyebrow),
    brandTitle: cleanText(source.brandTitle, DEFAULT_LABELS.brandTitle, LABEL_LIMITS.brandTitle),
    brandTagline: cleanText(source.brandTagline, DEFAULT_LABELS.brandTagline, LABEL_LIMITS.brandTagline),
    workspaceLabel: cleanText(source.workspaceLabel, DEFAULT_LABELS.workspaceLabel, LABEL_LIMITS.workspaceLabel),
    workspaceHeadline: cleanText(source.workspaceHeadline, DEFAULT_LABELS.workspaceHeadline, LABEL_LIMITS.workspaceHeadline),
    workspaceDescription: cleanText(source.workspaceDescription, DEFAULT_LABELS.workspaceDescription, LABEL_LIMITS.workspaceDescription),
    liveContextHeading: cleanText(source.liveContextHeading, DEFAULT_LABELS.liveContextHeading, LABEL_LIMITS.sectionHeading),
    todayHeading: cleanText(source.todayHeading, DEFAULT_LABELS.todayHeading, LABEL_LIMITS.sectionHeading),
    workspaceSpotlightHeading: cleanText(source.workspaceSpotlightHeading, DEFAULT_LABELS.workspaceSpotlightHeading, LABEL_LIMITS.sectionHeading),
    auxiliaryHeading: cleanText(source.auxiliaryHeading, DEFAULT_LABELS.auxiliaryHeading, LABEL_LIMITS.sectionHeading),
    globalOperationsHeading: cleanText(source.globalOperationsHeading, DEFAULT_LABELS.globalOperationsHeading, LABEL_LIMITS.sectionHeading),
    liveErpAccess: cleanText(source.liveErpAccess, DEFAULT_LABELS.liveErpAccess, LABEL_LIMITS.display),
    installApp: cleanText(source.installApp, DEFAULT_LABELS.installApp, LABEL_LIMITS.display),
    ibadanTime: cleanText(source.ibadanTime, DEFAULT_LABELS.ibadanTime, LABEL_LIMITS.display),
    session: cleanText(source.session, DEFAULT_LABELS.session, LABEL_LIMITS.display),
    protected: cleanText(source.protected, DEFAULT_LABELS.protected, LABEL_LIMITS.display),
    encryptedSession: cleanText(source.encryptedSession, DEFAULT_LABELS.encryptedSession, LABEL_LIMITS.support),
    secureService: cleanText(source.secureService, DEFAULT_LABELS.secureService, LABEL_LIMITS.display),
    weatherLoading: cleanText(source.weatherLoading, DEFAULT_LABELS.weatherLoading, LABEL_LIMITS.support),
    weatherLocation: cleanText(source.weatherLocation, DEFAULT_LABELS.weatherLocation, LABEL_LIMITS.display),
    weatherConnecting: cleanText(source.weatherConnecting, DEFAULT_LABELS.weatherConnecting, LABEL_LIMITS.support),
    weatherUpdated: cleanText(source.weatherUpdated, DEFAULT_LABELS.weatherUpdated, LABEL_LIMITS.display),
    liveGuidanceNote: cleanText(source.liveGuidanceNote, DEFAULT_LABELS.liveGuidanceNote, LABEL_LIMITS.support),
    dailyMomentumNote: cleanText(source.dailyMomentumNote, DEFAULT_LABELS.dailyMomentumNote, LABEL_LIMITS.support),
    rotatingLiveFeed: cleanText(source.rotatingLiveFeed, DEFAULT_LABELS.rotatingLiveFeed, LABEL_LIMITS.display),
    statusOperational: cleanText(source.statusOperational, DEFAULT_LABELS.statusOperational, LABEL_LIMITS.display),
    statusMaintenance: cleanText(source.statusMaintenance, DEFAULT_LABELS.statusMaintenance, LABEL_LIMITS.display),
    statusChecking: cleanText(source.statusChecking, DEFAULT_LABELS.statusChecking, LABEL_LIMITS.display),
    statusConnecting: cleanText(source.statusConnecting, DEFAULT_LABELS.statusConnecting, LABEL_LIMITS.support),
    clockSummary: cleanText(source.clockSummary, DEFAULT_LABELS.clockSummary, LABEL_LIMITS.support),
    inspirationSpark: cleanText(source.inspirationSpark, DEFAULT_LABELS.inspirationSpark, LABEL_LIMITS.display),
    promptOfTheDay: cleanText(source.promptOfTheDay, DEFAULT_LABELS.promptOfTheDay, LABEL_LIMITS.display),
    promptOfTheDayNote: cleanText(source.promptOfTheDayNote, DEFAULT_LABELS.promptOfTheDayNote, LABEL_LIMITS.support),
    teamBoost: cleanText(source.teamBoost, DEFAULT_LABELS.teamBoost, LABEL_LIMITS.display),
    recognition: cleanText(source.recognition, DEFAULT_LABELS.recognition, LABEL_LIMITS.display),
    focusGoal: cleanText(source.focusGoal, DEFAULT_LABELS.focusGoal, LABEL_LIMITS.display),
    recognitionNote: cleanText(source.recognitionNote, DEFAULT_LABELS.recognitionNote, LABEL_LIMITS.support),
    priorityBriefing: cleanText(source.priorityBriefing, DEFAULT_LABELS.priorityBriefing, LABEL_LIMITS.display),
    secureEdge: cleanText(source.secureEdge, DEFAULT_LABELS.secureEdge, LABEL_LIMITS.display),
    serviceTeamNotified: cleanText(source.serviceTeamNotified, DEFAULT_LABELS.serviceTeamNotified, LABEL_LIMITS.display),
    auth: { ...Object.fromEntries(Object.keys(DEFAULT_LABELS.auth).map((key) => [key, cleanText(auth[key], DEFAULT_LABELS.auth[key as keyof typeof DEFAULT_LABELS.auth], LABEL_LIMITS.support)])), legalPrefix: normalizeLegalPrefix(auth.legalPrefix) },
    widgetLabels: {
      weather: cleanText(widgets.weather, DEFAULT_LABELS.widgetLabels.weather, LABEL_LIMITS.widget),
      inspiration: cleanText(widgets.inspiration, DEFAULT_LABELS.widgetLabels.inspiration, LABEL_LIMITS.widget),
      motivation: cleanText(widgets.motivation, DEFAULT_LABELS.widgetLabels.motivation, LABEL_LIMITS.widget),
      news: cleanText(widgets.news, DEFAULT_LABELS.widgetLabels.news, LABEL_LIMITS.widget),
      status: cleanText(widgets.status, DEFAULT_LABELS.widgetLabels.status, LABEL_LIMITS.widget),
    },
  };
}
function variant(kind: string, value: unknown) {
  const available = VARIANTS[kind] || [];
  return available.includes(String(value)) ? String(value) : available[0] || 'standard';
}
function cleanInstances(value: unknown, hidden: string[], labels: ReturnType<typeof normalizeLabels>, legacyOrder: string[]) {
  const source = Array.isArray(value) ? value : legacyOrder.map((kind) => ({ kind }));
  const result: Array<Record<string, unknown>> = [];
  source.forEach((item, index) => {
    const raw = record(item);
    const kind = SIGNIN_WIDGET_KINDS.includes((raw.kind || (typeof item === 'string' ? item : '')) as typeof SIGNIN_WIDGET_KINDS[number])
      ? String(raw.kind || item) : '';
    if (!kind) return;
    const baseId = String(raw.id || kind).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || kind;
    let id = baseId;
    let suffix = 2;
    while (result.some((entry) => entry.id === id)) {
      id = kind + '-' + suffix;
      suffix += 1;
    }
    const defaultZone = kind === 'weather' || kind === 'status' ? 'live-context' : 'today';
    const zone = SIGNIN_ZONES.includes(raw.zone as typeof SIGNIN_ZONES[number]) ? String(raw.zone) : defaultZone;
    const label = cleanText(raw.label, labels.widgetLabels[kind as keyof typeof labels.widgetLabels], LABEL_LIMITS.widget);
    result.push({
      id, kind, variant: variant(kind, raw.variant), zone, order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
      visible: typeof raw.visible === 'boolean' ? raw.visible : !hidden.includes(kind),
      label, effectPreset: EFFECT_PRESETS.includes(raw.effectPreset as typeof EFFECT_PRESETS[number]) ? String(raw.effectPreset) : 'glass',
    });
  });
  return result.sort((a, b) => Number(a.order) - Number(b.order)).map((item, index) => ({ ...item, order: index }));
}
export function cleanSignInConfig(value: unknown) {
  const candidate = record(value);
  const labels = normalizeLabels(candidate.labels);
  const hidden = list(candidate.hiddenWidgets, SIGNIN_WIDGET_KINDS, []);
  const legacy = list(candidate.widgetOrder, SIGNIN_WIDGET_KINDS, defaultSignInConfig.widgetOrder);
  const instances = cleanInstances(candidate.widgetInstances, hidden, labels, legacy);
  const global = record(candidate.globalOperations);
  const maxValue = Number(global.maxClocks);
  const maxClocks = Number.isFinite(maxValue) ? Math.max(1, Math.min(7, Math.round(maxValue))) : 7;
  const zones = list(candidate.clockZones, CLOCK_ZONES, STANDARD_CLOCK_ZONES).slice(0, maxClocks);
  const logo = record(candidate.logo);
  const position = ['left', 'center', 'right'].includes(String(logo.position || candidate.logoPosition)) ? String(logo.position || candidate.logoPosition) : 'left';
  const backgroundId = SIGNIN_BACKGROUND_IDS.includes(String(candidate.backgroundId) as typeof SIGNIN_BACKGROUND_IDS[number]) ? String(candidate.backgroundId) : defaultSignInConfig.backgroundId;
  const safeInstances: Array<Record<string, unknown>> = Array.isArray(candidate.widgetInstances) ? instances : instances.length ? instances : defaultSignInConfig.widgetInstances as Array<Record<string, unknown>>;
  const widgetOrder = [...new Set(safeInstances.map((item) => String(item.kind) as string))];
  return {
    schemaVersion: 3,
    widgetOrder: widgetOrder.length ? widgetOrder : [...defaultSignInConfig.widgetOrder],
    hiddenWidgets: [...new Set(safeInstances.filter((item) => item.visible !== true).map((item) => String(item.kind)))],
    widgetInstances: safeInstances,
    clockStyle: CLOCK_STYLES.includes(candidate.clockStyle as typeof CLOCK_STYLES[number]) ? String(candidate.clockStyle) : defaultSignInConfig.clockStyle,
    clockZones: zones.length ? zones : [...STANDARD_CLOCK_ZONES],
    temperatureUnit: candidate.temperatureUnit === 'C' ? 'C' : 'F',
    logoPosition: position,
    logo: {
      position,
      size: ['compact', 'standard', 'prominent'].includes(String(logo.size)) ? String(logo.size) : 'prominent',
      alignment: ['start', 'center', 'end'].includes(String(logo.alignment)) ? String(logo.alignment) : 'start',
      glass: logo.glass !== false,
      animation: ['none', 'float', 'orbit', 'pulse'].includes(String(logo.animation)) ? String(logo.animation) : 'float',
    },
    effectLevel: EFFECT_LEVELS.includes(candidate.effectLevel as typeof EFFECT_LEVELS[number]) ? String(candidate.effectLevel) : 'balanced',
    effects: {
      ambientGlow: record(candidate.effects).ambientGlow !== false,
      glassIntensity: Math.max(0, Math.min(100, Math.round(Number(record(candidate.effects).glassIntensity) || 72))),
      backgroundBreathing: record(candidate.effects).backgroundBreathing !== false,
      cardFloat: record(candidate.effects).cardFloat !== false,
      logoMotion: record(candidate.effects).logoMotion !== false,
      statusPulse: record(candidate.effects).statusPulse !== false,
      widgetEntrance: record(candidate.effects).widgetEntrance !== false,
      shimmer: record(candidate.effects).shimmer === true,
    },
    themeMode: ['day', 'night', 'auto'].includes(String(candidate.themeMode)) ? String(candidate.themeMode) : 'auto',
    backgroundId,
    darkStart: safeTime(candidate.darkStart, '19:00'),
    darkEnd: safeTime(candidate.darkEnd, '07:00'),
    labels,
    content: {
      inspiration: cleanText(record(candidate.content).inspiration, DEFAULT_CONTENT.inspiration, 180),
      motivation: cleanText(record(candidate.content).motivation, DEFAULT_CONTENT.motivation, 180),
    },
    globalOperations: {
      visible: global.visible !== false,
      maxClocks,
      showWeather: global.showWeather !== false,
      weatherStyle: ['detailed', 'compact', 'visual'].includes(String(global.weatherStyle)) ? String(global.weatherStyle) : 'detailed',
      weatherAnimation: ['none', 'subtle', 'expressive'].includes(String(global.weatherAnimation)) ? String(global.weatherAnimation) : 'subtle',
      showFeelsLike: global.showFeelsLike !== false,
      showHumidity: global.showHumidity !== false,
      showWind: global.showWind !== false,
      showPrecipitation: global.showPrecipitation !== false,
      showHighLow: global.showHighLow !== false,
      showSunriseSunset: global.showSunriseSunset !== false,
      showAnalog: global.showAnalog !== false,
      showDigital: global.showDigital !== false,
      showDate: global.showDate !== false,
      showTimezone: global.showTimezone !== false,
      showDayNight: global.showDayNight !== false,
    },
  };
}
async function setting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?').bind(key).first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}
export async function readSignInConfig(env: Env) {
  const v3 = await setting(env, 'ui.signin_config_v3', '');
  if (v3) {
    try { return cleanSignInConfig(JSON.parse(v3)); } catch { /* fall through to V2 */ }
  }
  const v2 = await setting(env, 'ui.signin_config_v2', '');
  if (!v2) return cleanSignInConfig(defaultSignInConfig);
  try { return cleanSignInConfig(JSON.parse(v2)); } catch { return cleanSignInConfig(defaultSignInConfig); }
}
async function policy(env: Env, context: SessionContext) {
  const forcedTheme = normalize(await setting(env, 'ui.forced_theme', ''), true);
  const defaultTheme = normalize(await setting(env, 'ui.default_theme', 'lagos-sunrise'));
  const allowEmployeeChoice = (await setting(env, 'ui.allow_employee_theme_choice', 'true')) === 'true';
  const preference = await env.DB.prepare('SELECT COALESCE(ep.theme,e.preferred_theme) AS theme FROM employees e LEFT JOIN employee_preferences ep ON ep.employee_id=e.id WHERE e.id=?').bind(context.employee.id).first<{ theme?: string }>();
  const preferredTheme = normalize(preference?.theme || '');
  return { forcedTheme, defaultTheme, allowEmployeeChoice, preferredTheme, effectiveTheme: forcedTheme || preferredTheme || defaultTheme, canManage: hasPermission(context, 'settings.access', 'manage'), themes };
}
const normalize = (value: unknown, allowBlank = false) => {
  const id = String(value || '');
  if (!id && allowBlank) return '';
  return aliases[id] || id;
};
const validTheme = (value: unknown, allowBlank = false) => {
  const id = normalize(value, allowBlank);
  return (allowBlank && id === '') || themes.includes(id);
};
function candidateOptions(kind: 'inspiration' | 'motivation', text: string | undefined) {
  const values = (text || '').split(/\r?\n|\d+[\.)]\s+/).map((item) => item.replace(/^[-*]\s+/, '').trim()).filter((item) => item.length >= 12 && item.length <= 180);
  return [...new Set(values)].slice(0, 3);
}
async function generateAiOptions(env: Env, kind: 'inspiration' | 'motivation') {
  const fallback = fallbackAiOptions[kind];
  if (!env.AI) return { candidates: fallback, source: 'fallback' };
  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'Return exactly three concise professional workplace options, one per line. Do not use numbering, quotes, claims about current events, or sensitive employee data.' },
        { role: 'user', content: 'Create three original options for the Staff Portal ' + kind + ' widget. Each option must be under 160 characters and suitable for a neutral employee sign-in page.' },
      ],
    }) as { response?: string };
    const candidates = candidateOptions(kind, result.response);
    return { candidates: candidates.length ? candidates : fallback, source: candidates.length ? 'workers-ai' : 'fallback' };
  } catch {
    return { candidates: fallback, source: 'fallback' };
  }
}

export async function routeThemePreferences(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/theme/')) return null;
  const canManage = hasPermission(context, 'settings.access', 'manage');
  if (url.pathname === '/api/theme/policy' && request.method === 'GET') return json(await policy(env, context));
  if (url.pathname === '/api/theme/preference' && request.method === 'POST') {
    let body: { theme?: string };
    try { body = await request.json(); } catch { return json({ error: 'Invalid theme request.' }, 400); }
    const currentPolicy = await policy(env, context);
    if (currentPolicy.forcedTheme) return json({ error: 'The Owner has currently selected a Group-wide theme.', forcedTheme: currentPolicy.forcedTheme }, 409);
    if (!currentPolicy.allowEmployeeChoice) return json({ error: 'Personal theme selection is currently disabled.' }, 403);
    if (!validTheme(body.theme)) return json({ error: 'Select an approved Daenem theme.' }, 400);
    const theme = normalize(body.theme);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO employee_preferences(employee_id,theme,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(employee_id) DO UPDATE SET theme=excluded.theme,updated_at=CURRENT_TIMESTAMP').bind(context.employee.id, theme),
      env.DB.prepare('UPDATE employees SET preferred_theme=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(theme, context.employee.id),
    ]);
    return json({ ok: true, theme });
  }
  if (url.pathname === '/api/theme/signin' && request.method === 'GET') {
    return json({ config: await readSignInConfig(env), canManage });
  }
  if (url.pathname === '/api/theme/signin' && request.method === 'POST') {
    if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403);
    let body: { config?: unknown };
    try { body = await request.json(); } catch { return json({ error: 'Invalid sign-in configuration request.' }, 400); }
    const config = cleanSignInConfig(body.config);
    await env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at) VALUES(\'ui.signin_config_v3\',?,\'json\',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,value_type=excluded.value_type,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP')
      .bind(JSON.stringify(config), context.employee.id).run();
    return json({ ok: true, config });
  }
  if (url.pathname === '/api/theme/signin/ai/generate' && request.method === 'POST') {
    if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403);
    let body: { kind?: string };
    try { body = await request.json(); } catch { return json({ error: 'Invalid AI content request.' }, 400); }
    if (body.kind !== 'inspiration' && body.kind !== 'motivation') return json({ error: 'Only inspiration and motivation can use AI options.' }, 400);
    return json({ kind: body.kind, ...await generateAiOptions(env, body.kind) });
  }
  if (url.pathname === '/api/theme/policy' && request.method === 'POST') {
    if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403);
    let body: { defaultTheme?: string; forcedTheme?: string; allowEmployeeChoice?: boolean };
    try { body = await request.json(); } catch { return json({ error: 'Invalid theme policy request.' }, 400); }
    if (body.defaultTheme !== undefined && !validTheme(body.defaultTheme)) return json({ error: 'Invalid default theme.' }, 400);
    if (body.forcedTheme !== undefined && !validTheme(body.forcedTheme, true)) return json({ error: 'Invalid forced theme.' }, 400);
    const statements: D1PreparedStatement[] = [];
    if (body.defaultTheme !== undefined) statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at) VALUES(\'ui.default_theme\',?,\'string\',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(normalize(body.defaultTheme), context.employee.id));
    if (body.forcedTheme !== undefined) statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at) VALUES(\'ui.forced_theme\',?,\'string\',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(normalize(body.forcedTheme, true), context.employee.id));
    if (body.allowEmployeeChoice !== undefined) statements.push(env.DB.prepare('INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at) VALUES(\'ui.allow_employee_theme_choice\',?,\'boolean\',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP').bind(body.allowEmployeeChoice ? 'true' : 'false', context.employee.id));
    if (!statements.length) return json({ error: 'No theme policy changes supplied.' }, 400);
    await env.DB.batch(statements);
    return json({ ok: true, ...await policy(env, context) });
  }
  return json({ error: 'Theme API route not found.' }, 404);
}
