export type ClockStyle = 'minimal' | 'detailed' | 'neon' | 'classic';
export type TemperatureUnit = 'F' | 'C';
export type SignInWidgetId = 'weather' | 'inspiration' | 'motivation' | 'news' | 'status';
export type SignInWidgetVariant =
  | 'standard'
  | 'operational'
  | 'insight-card'
  | 'innovation-spark'
  | 'daily-prompt'
  | 'executive-thought'
  | 'momentum-card'
  | 'team-boost'
  | 'recognition-prompt'
  | 'focus-goal'
  | 'headline-stack'
  | 'executive-briefing'
  | 'horizontal-ticker'
  | 'top-stories-cards';
export type SignInZone = 'workspace-spotlight' | 'live-context' | 'today' | 'auxiliary';
export type LogoPosition = 'left' | 'center' | 'right';
export type LogoSizePreset = 'compact' | 'standard' | 'prominent';
export type LogoAlignment = 'start' | 'center' | 'end';
export type LogoAnimation = 'none' | 'float' | 'orbit' | 'pulse';
export type EffectLevel = 'calm' | 'balanced' | 'vivid';
export type SignInThemeMode = 'day' | 'night' | 'auto';
export type SignInBackgroundOption = {
  id: string;
  name: string;
  description: string;
  src: string;
  previewSrc?: string;
  surface: string;
  line: string;
  accent: string;
  glow: string;
  shade: string;
};
export type EffectPreset = 'quiet' | 'glass' | 'accent' | 'soft';

export type PortalLocation = {
  name: string;
  region: string;
  zone: string;
  latitude: number;
  longitude: number;
};

export const WORLD_CLOCKS: PortalLocation[] = [
  { name: 'Daenem Complex', region: 'Ibadan, Nigeria', zone: 'Africa/Lagos', latitude: 7.3775, longitude: 3.9470 },
  { name: 'Toronto', region: 'Canada', zone: 'America/Toronto', latitude: 43.6532, longitude: -79.3832 },
  { name: 'London', region: 'United Kingdom', zone: 'Europe/London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'New York', region: 'United States', zone: 'America/New_York', latitude: 40.7128, longitude: -74.0060 },
  { name: 'Moscow', region: 'Russia', zone: 'Europe/Moscow', latitude: 55.7558, longitude: 37.6173 },
  { name: 'Tokyo', region: 'Japan', zone: 'Asia/Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { name: 'Beijing / Shanghai', region: 'China', zone: 'Asia/Shanghai', latitude: 31.2304, longitude: 121.4737 },
];

export const WORLD_CLOCK_CATALOG: PortalLocation[] = [
  ...WORLD_CLOCKS,
  { name: 'Johannesburg', region: 'South Africa', zone: 'Africa/Johannesburg', latitude: -26.2041, longitude: 28.0473 },
  { name: 'Dubai', region: 'United Arab Emirates', zone: 'Asia/Dubai', latitude: 25.2048, longitude: 55.2708 },
  { name: 'Singapore', region: 'Singapore', zone: 'Asia/Singapore', latitude: 1.3521, longitude: 103.8198 },
  { name: 'Sydney', region: 'Australia', zone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 },
];

export type WorldClockPreferences = { style: ClockStyle; visibleZones: string[] };

export type SignInAuthLabels = {
  secureErpAccess: string;
  signInTitle: string;
  signInDescription: string;
  createAccountTitle: string;
  createAccountDescription: string;
  verifyEmailTitle: string;
  verifyEmailDescription: string;
  forgotPasswordTitle: string;
  forgotPasswordDescription: string;
  verifyIdentityTitle: string;
  verifyIdentityDescription: string;
  newPasswordTitle: string;
  newPasswordDescription: string;
  employeeSignInTab: string;
  createAccountTab: string;
  emailOrUsername: string;
  password: string;
  forgotPassword: string;
  rememberMe: string;
  trustedDevice: string;
  signIn: string;
  signingIn: string;
  mfaReady: string;
  microsoftSignIn: string;
  googleSignIn: string;
  microsoftCreateAccount: string;
  googleCreateAccount: string;
  backToSignIn: string;
  firstName: string;
  lastName: string;
  personalEmail: string;
  phoneWhatsApp: string;
  createUsername: string;
  usernameHelper: string;
  createPassword: string;
  confirmPassword: string;
  departmentWorkArea: string;
  jobTitle: string;
  rolePosition: string;
  preparingVerification: string;
  verificationCode: string;
  verifyEmailFinish: string;
  changeSignupDetails: string;
  sendRecoveryCode: string;
  preparingRecovery: string;
  verifyIdentity: string;
  requestAnotherCode: string;
  newPassword: string;
  confirmNewPassword: string;
  createNewPassword: string;
  securingAccount: string;
  continue: string;
  back: string;
  verifying: string;
  verificationSentTo: string;
  privateBootstrapCode: string;
  bootstrapNote: string;
  verificationCodeSent: string;
  recoveryIdentityNote: string;
  identityVerified: string;
  resetAccessNote: string;
  socialNote: string;
  legalPrefix: string;
  termsAndConditions: string;
  privacyPolicy: string;
  or: string;
  passwordStrength: string;
  passwordNotSet: string;
  passwordWeak: string;
  passwordGood: string;
  passwordStrong: string;
  passwordExcellent: string;
  showPassword: string;
  hidePassword: string;
  lockoutTitle: string;
  lockoutSummary: string;
  lockoutRecovery: string;
  identifierEmailValid: string;
  identifierUsernameValid: string;
  identifierReady: string;
  identifierInvalid: string;
  passwordRequirements: string;
  passwordMinimumLength: string;
  passwordUppercase: string;
  passwordLowercase: string;
  passwordNumber: string;
  passwordSymbol: string;
  passwordsMatch: string;
  passwordsDoNotMatch: string;
};

export type SignInLabels = {
  brandEyebrow: string;
  brandTitle: string;
  brandTagline: string;
  workspaceLabel: string;
  workspaceHeadline: string;
  workspaceDescription: string;
  liveContextHeading: string;
  todayHeading: string;
  workspaceSpotlightHeading: string;
  auxiliaryHeading: string;
  globalOperationsHeading: string;
  liveErpAccess: string;
  installApp: string;
  ibadanTime: string;
  session: string;
  protected: string;
  encryptedSession: string;
  secureService: string;
  weatherLoading: string;
  weatherLocation: string;
  weatherConnecting: string;
  weatherUpdated: string;
  liveGuidanceNote: string;
  dailyMomentumNote: string;
  rotatingLiveFeed: string;
  statusOperational: string;
  statusMaintenance: string;
  statusChecking: string;
  statusConnecting: string;
  clockSummary: string;
  inspirationSpark: string;
  promptOfTheDay: string;
  promptOfTheDayNote: string;
  teamBoost: string;
  recognition: string;
  focusGoal: string;
  recognitionNote: string;
  priorityBriefing: string;
  secureEdge: string;
  serviceTeamNotified: string;
  auth: SignInAuthLabels;
  widgetLabels: Record<SignInWidgetId, string>;
};

export type SignInWidgetInstance = {
  id: string;
  kind: SignInWidgetId;
  variant: SignInWidgetVariant;
  zone: SignInZone;
  order: number;
  visible: boolean;
  label: string;
  effectPreset: EffectPreset;
};

export type SignInEffects = {
  ambientGlow: boolean;
  glassIntensity: number;
  backgroundBreathing: boolean;
  cardFloat: boolean;
  logoMotion: boolean;
  statusPulse: boolean;
  widgetEntrance: boolean;
  shimmer: boolean;
};

export type SignInContent = {
  inspiration: string;
  motivation: string;
};

export type SignInGlobalOperations = {
  visible: boolean;
  maxClocks: number;
  showWeather: boolean;
  weatherStyle: 'detailed' | 'compact' | 'visual';
  weatherAnimation: 'none' | 'subtle' | 'expressive';
  showFeelsLike: boolean;
  showHumidity: boolean;
  showWind: boolean;
  showPrecipitation: boolean;
  showHighLow: boolean;
  showSunriseSunset: boolean;
  showAnalog: boolean;
  showDigital: boolean;
  showDate: boolean;
  showTimezone: boolean;
  showDayNight: boolean;
};

export type SignInExperiencePreferences = {
  schemaVersion: 3;
  widgetOrder: SignInWidgetId[];
  hiddenWidgets: SignInWidgetId[];
  widgetInstances: SignInWidgetInstance[];
  clockStyle: ClockStyle;
  clockZones: string[];
  temperatureUnit: TemperatureUnit;
  logoPosition: LogoPosition;
  logo: {
    position: LogoPosition;
    size: LogoSizePreset;
    alignment: LogoAlignment;
    glass: boolean;
    animation: LogoAnimation;
  };
  effectLevel: EffectLevel;
  effects: SignInEffects;
  themeMode: SignInThemeMode;
  backgroundId: string;
  darkStart: string;
  darkEnd: string;
  labels: SignInLabels;
  content: SignInContent;
  globalOperations: SignInGlobalOperations;
};

export const SIGNIN_BACKGROUND_OPTIONS: SignInBackgroundOption[] = [
  { id: 'unified-daylight', name: 'Unified Daylight', description: 'Approved campus daylight composition', src: '/reference-images/signin/daenem-unified-daylight-4k.webp', surface: 'rgba(8, 35, 67, .84)', line: 'rgba(137, 211, 255, .34)', accent: '#71d7ff', glow: 'rgba(65, 210, 255, .2)', shade: 'linear-gradient(90deg, rgba(4, 20, 43, .08), rgba(7, 30, 58, .04) 44%, rgba(3, 19, 39, .32))' },
  { id: 'global-executive-atrium', name: 'Global Executive Atrium', description: 'Luminous glass architecture and calm depth', src: '/reference-images/signin/global-executive-atrium.webp', previewSrc: '/reference-images/signin/global-executive-atrium-thumb.webp', surface: 'rgba(8, 43, 74, .78)', line: 'rgba(175, 235, 255, .42)', accent: '#70ddff', glow: 'rgba(116, 224, 255, .22)', shade: 'linear-gradient(90deg, rgba(255, 255, 255, .12), rgba(4, 28, 53, .24))' },
  { id: 'future-technology-campus', name: 'Future Technology Campus', description: 'Bright connected campus perspective', src: '/reference-images/signin/future-technology-campus.webp', previewSrc: '/reference-images/signin/future-technology-campus-thumb.webp', surface: 'rgba(7, 47, 83, .78)', line: 'rgba(139, 224, 255, .4)', accent: '#6fceff', glow: 'rgba(75, 200, 255, .22)', shade: 'linear-gradient(90deg, rgba(229, 249, 255, .1), rgba(3, 26, 58, .3))' },
  { id: 'daylight-glass-skyline', name: 'Daylight Glass Skyline', description: 'International skyline through clear glass', src: '/reference-images/signin/daylight-glass-skyline.webp', previewSrc: '/reference-images/signin/daylight-glass-skyline-thumb.webp', surface: 'rgba(8, 44, 77, .78)', line: 'rgba(133, 221, 255, .4)', accent: '#77d8ff', glow: 'rgba(63, 192, 255, .2)', shade: 'linear-gradient(90deg, rgba(255, 255, 255, .1), rgba(4, 25, 54, .26))' },
  { id: 'premium-connected-workspace', name: 'Premium Connected Workspace', description: 'Warm daylight workspace with soft technology cues', src: '/reference-images/signin/premium-connected-workspace.webp', previewSrc: '/reference-images/signin/premium-connected-workspace-thumb.webp', surface: 'rgba(13, 48, 72, .78)', line: 'rgba(173, 230, 225, .38)', accent: '#73e1d0', glow: 'rgba(85, 215, 190, .2)', shade: 'linear-gradient(90deg, rgba(255, 243, 220, .1), rgba(5, 31, 48, .24))' },
  { id: 'bright-executive-global-atrium', name: 'Bright Executive Global Atrium', description: 'Bright glass atrium with calm global depth', src: '/reference-images/signin/bright-executive-global-atrium.webp', previewSrc: '/reference-images/signin/bright-executive-global-atrium-thumb.webp', surface: 'rgba(15, 47, 73, .76)', line: 'rgba(174, 231, 255, .4)', accent: '#7edcff', glow: 'rgba(80, 203, 255, .2)', shade: 'linear-gradient(90deg, rgba(255, 255, 255, .12), rgba(4, 28, 53, .22))' },
  { id: 'daylight-technology-campus', name: 'Daylight Technology Campus', description: 'Open glass campus in clear daylight', src: '/reference-images/signin/daylight-technology-campus.webp', previewSrc: '/reference-images/signin/daylight-technology-campus-thumb.webp', surface: 'rgba(9, 48, 78, .76)', line: 'rgba(139, 224, 255, .4)', accent: '#75d4ff', glow: 'rgba(70, 194, 255, .2)', shade: 'linear-gradient(90deg, rgba(229, 249, 255, .1), rgba(3, 26, 58, .26))' },
];

export type LiveHeadline = { title: string; url?: string; category: string; source: string };

export type PublicSignInContext = {
  config: SignInExperiencePreferences;
  inspiration: string;
  motivation: string;
  news: LiveHeadline[];
  generatedAt: string;
  source: 'live' | 'fallback';
};

const WORLD_CLOCK_PREFS_KEY = 'daenem-world-clock-preferences';
const SIGNIN_PREFS_KEY = 'daenem-signin-experience-v2';
const ALL_WIDGETS: SignInWidgetId[] = ['weather', 'inspiration', 'motivation', 'news', 'status'];
export const MAX_SIGNIN_WIDGET_INSTANCES = 20;
const ALL_CLOCK_STYLES: ClockStyle[] = ['minimal', 'detailed', 'neon', 'classic'];
const ALL_LOGO_POSITIONS: LogoPosition[] = ['left', 'center', 'right'];
const ALL_LOGO_SIZES: LogoSizePreset[] = ['compact', 'standard', 'prominent'];
const ALL_LOGO_ALIGNMENTS: LogoAlignment[] = ['start', 'center', 'end'];
const ALL_LOGO_ANIMATIONS: LogoAnimation[] = ['none', 'float', 'orbit', 'pulse'];
const ALL_EFFECT_LEVELS: EffectLevel[] = ['calm', 'balanced', 'vivid'];
const ALL_THEME_MODES: SignInThemeMode[] = ['day', 'night'];
const ALL_ZONES: SignInZone[] = ['workspace-spotlight', 'live-context', 'today', 'auxiliary'];
const ALL_BACKGROUND_IDS = SIGNIN_BACKGROUND_OPTIONS.map((item) => item.id);
const ALL_EFFECT_PRESETS: EffectPreset[] = ['quiet', 'glass', 'accent', 'soft'];
const MAX_LABEL_LENGTH = 120;
const DEFAULT_LEGAL_PREFIX = 'By continuing to login, you agree to Daenem Group';
const LEGACY_LEGAL_PREFIXES = new Set([
  'By continuing to log in, you agree to Daenem Farms’',
  "By continuing to log in, you agree to Daenem Farms'",
  'By continuing to login, you agree to Daenem Farms’',
  "By continuing to login, you agree to Daenem Farms'",
  'By continuing to login, you agree to Daenem Farms',
]);

export const SIGNIN_WIDGET_VARIANTS: Record<SignInWidgetId, SignInWidgetVariant[]> = {
  weather: ['standard'],
  status: ['operational'],
  inspiration: ['insight-card', 'innovation-spark', 'daily-prompt', 'executive-thought'],
  motivation: ['momentum-card', 'team-boost', 'recognition-prompt', 'focus-goal'],
  news: ['headline-stack', 'executive-briefing', 'horizontal-ticker', 'top-stories-cards'],
};

export const SIGNIN_LABEL_LIMITS = {
  brandEyebrow: 40, brandTitle: 48, brandTagline: 90, workspaceLabel: 48,
  workspaceHeadline: 90, workspaceDescription: 180, sectionHeading: 40, widget: 42, display: 64, support: 110,
} as const;

export const DEFAULT_SIGNIN_LABELS: SignInLabels = {
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
  inspirationSpark: 'SPARK',
  promptOfTheDay: 'PROMPT OF THE DAY',
  promptOfTheDayNote: 'A question to focus the next useful action.',
  teamBoost: 'TEAM BOOST',
  recognition: 'RECOGNITION',
  focusGoal: 'FOCUS GOAL',
  recognitionNote: 'Notice one contribution worth recognizing today.',
  priorityBriefing: 'PRIORITY BRIEFING',
  secureEdge: 'secure edge',
  serviceTeamNotified: 'Service team notified',
  auth: {
    secureErpAccess: 'SECURE ERP ACCESS',
    signInTitle: 'Employee Sign-In',
    signInDescription: 'Use your employee email or username to enter the live ERP workspace.',
    createAccountTitle: 'Create Account',
    createAccountDescription: 'Create your secure employee login. Your work access remains subject to administrator approval.',
    verifyEmailTitle: 'Verify Your Email',
    verifyEmailDescription: 'Enter the one-time code sent to your email to finish creating your account.',
    forgotPasswordTitle: 'Forgot Password',
    forgotPasswordDescription: 'Enter your email or username to begin secure password recovery.',
    verifyIdentityTitle: 'Verify Your Identity',
    verifyIdentityDescription: 'Enter the one-time code sent to the email on your approved account.',
    newPasswordTitle: 'Create A New Password',
    newPasswordDescription: 'Choose a secure password, then return to employee sign-in.',
    employeeSignInTab: 'Employee Sign-In',
    createAccountTab: 'Create Account',
    emailOrUsername: 'Email or Username',
    password: 'Password',
    forgotPassword: 'Forgot Password',
    rememberMe: 'Remember Me',
    trustedDevice: 'Use only on a trusted device',
    signIn: 'Sign In',
    signingIn: 'Signing In…',
    mfaReady: 'MFA-Ready',
    microsoftSignIn: 'Sign In with Microsoft',
    googleSignIn: 'Sign In with Google',
    microsoftCreateAccount: 'Create Account with Microsoft',
    googleCreateAccount: 'Create Account with Google',
    backToSignIn: 'Back To Sign-In',
    firstName: 'First Name',
    lastName: 'Last Name',
    personalEmail: 'Personal Email',
    phoneWhatsApp: 'Phone / WhatsApp',
    createUsername: 'Create Username',
    usernameHelper: '4–32 characters: letters, numbers, dot, underscore or hyphen.',
    createPassword: 'Create Password',
    confirmPassword: 'Confirm Password',
    departmentWorkArea: 'Department / Work Area',
    jobTitle: 'Job Title',
    rolePosition: 'Role / Position Information',
    preparingVerification: 'Preparing Verification…',
    verificationCode: '6-Digit Verification Code',
    verifyEmailFinish: 'Verify Email & Finish Signup',
    changeSignupDetails: 'Change Signup Details',
    sendRecoveryCode: 'Send Recovery Code',
    preparingRecovery: 'Preparing Recovery…',
    verifyIdentity: 'Verify Identity',
    requestAnotherCode: 'Request Another Code',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    createNewPassword: 'Create Password',
    securingAccount: 'Securing Account…',
    continue: 'Continue',
    back: 'Back',
    verifying: 'Verifying…',
    verificationSentTo: 'Verification Code Sent To',
    privateBootstrapCode: 'PRIVATE BOOTSTRAP CODE',
    bootstrapNote: 'Visible only in the local bootstrap stage.',
    verificationCodeSent: 'Enter the 6-digit code sent to your email.',
    recoveryIdentityNote: 'If the details match an approved account, we’ll send a one-time code to the email on file.',
    identityVerified: 'Identity verified',
    resetAccessNote: 'Create your password to finish securing your access.',
    socialNote: 'Use your Microsoft or Google account to sign in or create an account.',
    legalPrefix: DEFAULT_LEGAL_PREFIX,
    termsAndConditions: 'Terms And Conditions',
    privacyPolicy: 'Privacy Policy',
    or: 'Or',
    passwordStrength: 'Password Strength',
    passwordNotSet: 'Not Set',
    passwordWeak: 'Weak',
    passwordGood: 'Good',
    passwordStrong: 'Strong',
    passwordExcellent: 'Excellent',
    showPassword: 'Show Password',
    hidePassword: 'Hide Password',
    lockoutTitle: 'Sign-In Temporarily Locked',
    lockoutSummary: 'Too Many Unsuccessful Attempts Were Detected.',
    lockoutRecovery: 'Wait For The Security Lock To Expire Or Use Forgot Password To Restore Access.',
    identifierEmailValid: 'Email Format Recognized',
    identifierUsernameValid: 'Username Format Recognized',
    identifierReady: 'Sign-In Identifier Ready',
    identifierInvalid: 'Enter A Valid Email Or Username',
    passwordRequirements: 'Password Requirements',
    passwordMinimumLength: 'Minimum {min} Characters',
    passwordUppercase: 'One Uppercase Letter',
    passwordLowercase: 'One Lowercase Letter',
    passwordNumber: 'One Number',
    passwordSymbol: 'One Symbol',
    passwordsMatch: 'Passwords Match',
    passwordsDoNotMatch: 'Passwords Do Not Match',
  },
  widgetLabels: {
    weather: 'LIVE WEATHER',
    inspiration: 'AI INSPIRATION',
    motivation: 'EMPLOYEE MOTIVATION',
    news: 'LIVE NEWS',
    status: 'PORTAL STATUS',
  },
};

const DEFAULT_CONTENT: SignInContent = {
  inspiration: 'Turn the clearest next step into visible progress.',
  motivation: 'Build today’s momentum with one useful, well-finished action.',
};

function defaultInstances(): SignInWidgetInstance[] {
  return [
    { id: 'weather', kind: 'weather', variant: 'standard', zone: 'live-context', order: 0, visible: true, label: DEFAULT_SIGNIN_LABELS.widgetLabels.weather, effectPreset: 'glass' },
    { id: 'status', kind: 'status', variant: 'operational', zone: 'live-context', order: 1, visible: true, label: DEFAULT_SIGNIN_LABELS.widgetLabels.status, effectPreset: 'soft' },
    { id: 'inspiration', kind: 'inspiration', variant: 'insight-card', zone: 'today', order: 2, visible: true, label: DEFAULT_SIGNIN_LABELS.widgetLabels.inspiration, effectPreset: 'accent' },
    { id: 'motivation', kind: 'motivation', variant: 'momentum-card', zone: 'today', order: 3, visible: true, label: DEFAULT_SIGNIN_LABELS.widgetLabels.motivation, effectPreset: 'soft' },
    { id: 'news', kind: 'news', variant: 'headline-stack', zone: 'today', order: 4, visible: true, label: DEFAULT_SIGNIN_LABELS.widgetLabels.news, effectPreset: 'glass' },
  ];
}

export const DEFAULT_SIGNIN_PREFERENCES: SignInExperiencePreferences = {
  schemaVersion: 3,
  widgetOrder: ['weather', 'inspiration', 'motivation', 'news', 'status'],
  hiddenWidgets: [],
  widgetInstances: defaultInstances(),
  clockStyle: 'detailed',
  clockZones: WORLD_CLOCKS.map((item) => item.zone),
  temperatureUnit: 'F',
  logoPosition: 'left',
  logo: { position: 'left', size: 'prominent', alignment: 'start', glass: true, animation: 'float' },
  effectLevel: 'balanced',
  effects: { ambientGlow: true, glassIntensity: 72, backgroundBreathing: true, cardFloat: true, logoMotion: true, statusPulse: true, widgetEntrance: true, shimmer: false },
  themeMode: 'day',
  backgroundId: 'unified-daylight',
  darkStart: '19:00',
  darkEnd: '07:00',
  labels: DEFAULT_SIGNIN_LABELS,
  content: DEFAULT_CONTENT,
  globalOperations: { visible: true, maxClocks: 7, showWeather: true, weatherStyle: 'detailed', weatherAnimation: 'subtle', showFeelsLike: true, showHumidity: true, showWind: true, showPrecipitation: true, showHighLow: true, showSunriseSunset: true, showAnalog: true, showDigital: true, showDate: true, showTimezone: true, showDayNight: true },
};

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_SIGNIN_PREFERENCES)) as SignInExperiencePreferences;
}

function candidateRecord(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, fallback: string, max: number) {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  return (text || fallback).slice(0, max);
}

function normalizeLegalPrefix(value: unknown) {
  const text = cleanText(value, DEFAULT_LEGAL_PREFIX, SIGNIN_LABEL_LIMITS.support);
  return LEGACY_LEGAL_PREFIXES.has(text) ? DEFAULT_LEGAL_PREFIX : text;
}

function uniqueValues<T extends string>(values: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is T => typeof value === 'string' && allowed.includes(value as T)))];
}

function validTime(value: unknown, fallback: string) {
  const text = String(value || '');
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
}

function normalizeLabels(value: unknown): SignInLabels {
  const source = candidateRecord(value);
  const widgetSource = candidateRecord(source.widgetLabels);
  const authSource = candidateRecord(source.auth);
  const auth = Object.fromEntries(Object.keys(DEFAULT_SIGNIN_LABELS.auth).map((key) => [key, cleanText(authSource[key], DEFAULT_SIGNIN_LABELS.auth[key as keyof SignInAuthLabels], SIGNIN_LABEL_LIMITS.support)]));
  const socialNote = String(auth.socialNote || '').toLowerCase();
  const stalePreviewCopy = socialNote.includes('frontend') && socialNote.includes('preview')
    || socialNote.includes('credentials') && socialNote.includes('session') && socialNote.includes('created');
  if (stalePreviewCopy) auth.socialNote = DEFAULT_SIGNIN_LABELS.auth.socialNote;
  return {
    brandEyebrow: cleanText(source.brandEyebrow, DEFAULT_SIGNIN_LABELS.brandEyebrow, SIGNIN_LABEL_LIMITS.brandEyebrow),
    brandTitle: cleanText(source.brandTitle, DEFAULT_SIGNIN_LABELS.brandTitle, SIGNIN_LABEL_LIMITS.brandTitle),
    brandTagline: cleanText(source.brandTagline, DEFAULT_SIGNIN_LABELS.brandTagline, SIGNIN_LABEL_LIMITS.brandTagline),
    workspaceLabel: cleanText(source.workspaceLabel, DEFAULT_SIGNIN_LABELS.workspaceLabel, SIGNIN_LABEL_LIMITS.workspaceLabel),
    workspaceHeadline: cleanText(source.workspaceHeadline, DEFAULT_SIGNIN_LABELS.workspaceHeadline, SIGNIN_LABEL_LIMITS.workspaceHeadline),
    workspaceDescription: cleanText(source.workspaceDescription, DEFAULT_SIGNIN_LABELS.workspaceDescription, SIGNIN_LABEL_LIMITS.workspaceDescription),
    liveContextHeading: cleanText(source.liveContextHeading, DEFAULT_SIGNIN_LABELS.liveContextHeading, SIGNIN_LABEL_LIMITS.sectionHeading),
    todayHeading: cleanText(source.todayHeading, DEFAULT_SIGNIN_LABELS.todayHeading, SIGNIN_LABEL_LIMITS.sectionHeading),
    workspaceSpotlightHeading: cleanText(source.workspaceSpotlightHeading, DEFAULT_SIGNIN_LABELS.workspaceSpotlightHeading, SIGNIN_LABEL_LIMITS.sectionHeading),
    auxiliaryHeading: cleanText(source.auxiliaryHeading, DEFAULT_SIGNIN_LABELS.auxiliaryHeading, SIGNIN_LABEL_LIMITS.sectionHeading),
    globalOperationsHeading: cleanText(source.globalOperationsHeading, DEFAULT_SIGNIN_LABELS.globalOperationsHeading, SIGNIN_LABEL_LIMITS.sectionHeading),
    liveErpAccess: cleanText(source.liveErpAccess, DEFAULT_SIGNIN_LABELS.liveErpAccess, SIGNIN_LABEL_LIMITS.display),
    installApp: cleanText(source.installApp, DEFAULT_SIGNIN_LABELS.installApp, SIGNIN_LABEL_LIMITS.display),
    ibadanTime: cleanText(source.ibadanTime, DEFAULT_SIGNIN_LABELS.ibadanTime, SIGNIN_LABEL_LIMITS.display),
    session: cleanText(source.session, DEFAULT_SIGNIN_LABELS.session, SIGNIN_LABEL_LIMITS.display),
    protected: cleanText(source.protected, DEFAULT_SIGNIN_LABELS.protected, SIGNIN_LABEL_LIMITS.display),
    encryptedSession: cleanText(source.encryptedSession, DEFAULT_SIGNIN_LABELS.encryptedSession, SIGNIN_LABEL_LIMITS.support),
    secureService: cleanText(source.secureService, DEFAULT_SIGNIN_LABELS.secureService, SIGNIN_LABEL_LIMITS.display),
    weatherLoading: cleanText(source.weatherLoading, DEFAULT_SIGNIN_LABELS.weatherLoading, SIGNIN_LABEL_LIMITS.support),
    weatherLocation: cleanText(source.weatherLocation, DEFAULT_SIGNIN_LABELS.weatherLocation, SIGNIN_LABEL_LIMITS.display),
    weatherConnecting: cleanText(source.weatherConnecting, DEFAULT_SIGNIN_LABELS.weatherConnecting, SIGNIN_LABEL_LIMITS.support),
    weatherUpdated: cleanText(source.weatherUpdated, DEFAULT_SIGNIN_LABELS.weatherUpdated, SIGNIN_LABEL_LIMITS.display),
    liveGuidanceNote: cleanText(source.liveGuidanceNote, DEFAULT_SIGNIN_LABELS.liveGuidanceNote, SIGNIN_LABEL_LIMITS.support),
    dailyMomentumNote: cleanText(source.dailyMomentumNote, DEFAULT_SIGNIN_LABELS.dailyMomentumNote, SIGNIN_LABEL_LIMITS.support),
    rotatingLiveFeed: cleanText(source.rotatingLiveFeed, DEFAULT_SIGNIN_LABELS.rotatingLiveFeed, SIGNIN_LABEL_LIMITS.display),
    statusOperational: cleanText(source.statusOperational, DEFAULT_SIGNIN_LABELS.statusOperational, SIGNIN_LABEL_LIMITS.display),
    statusMaintenance: cleanText(source.statusMaintenance, DEFAULT_SIGNIN_LABELS.statusMaintenance, SIGNIN_LABEL_LIMITS.display),
    statusChecking: cleanText(source.statusChecking, DEFAULT_SIGNIN_LABELS.statusChecking, SIGNIN_LABEL_LIMITS.display),
    statusConnecting: cleanText(source.statusConnecting, DEFAULT_SIGNIN_LABELS.statusConnecting, SIGNIN_LABEL_LIMITS.support),
    clockSummary: cleanText(source.clockSummary, DEFAULT_SIGNIN_LABELS.clockSummary, SIGNIN_LABEL_LIMITS.support),
    inspirationSpark: cleanText(source.inspirationSpark, DEFAULT_SIGNIN_LABELS.inspirationSpark, SIGNIN_LABEL_LIMITS.display),
    promptOfTheDay: cleanText(source.promptOfTheDay, DEFAULT_SIGNIN_LABELS.promptOfTheDay, SIGNIN_LABEL_LIMITS.display),
    promptOfTheDayNote: cleanText(source.promptOfTheDayNote, DEFAULT_SIGNIN_LABELS.promptOfTheDayNote, SIGNIN_LABEL_LIMITS.support),
    teamBoost: cleanText(source.teamBoost, DEFAULT_SIGNIN_LABELS.teamBoost, SIGNIN_LABEL_LIMITS.display),
    recognition: cleanText(source.recognition, DEFAULT_SIGNIN_LABELS.recognition, SIGNIN_LABEL_LIMITS.display),
    focusGoal: cleanText(source.focusGoal, DEFAULT_SIGNIN_LABELS.focusGoal, SIGNIN_LABEL_LIMITS.display),
    recognitionNote: cleanText(source.recognitionNote, DEFAULT_SIGNIN_LABELS.recognitionNote, SIGNIN_LABEL_LIMITS.support),
    priorityBriefing: cleanText(source.priorityBriefing, DEFAULT_SIGNIN_LABELS.priorityBriefing, SIGNIN_LABEL_LIMITS.display),
    secureEdge: cleanText(source.secureEdge, DEFAULT_SIGNIN_LABELS.secureEdge, SIGNIN_LABEL_LIMITS.display),
    serviceTeamNotified: cleanText(source.serviceTeamNotified, DEFAULT_SIGNIN_LABELS.serviceTeamNotified, SIGNIN_LABEL_LIMITS.display),
    auth: { ...auth, legalPrefix: normalizeLegalPrefix(authSource.legalPrefix) } as SignInAuthLabels,
    widgetLabels: {
      weather: cleanText(widgetSource.weather, DEFAULT_SIGNIN_LABELS.widgetLabels.weather, SIGNIN_LABEL_LIMITS.widget),
      inspiration: cleanText(widgetSource.inspiration, DEFAULT_SIGNIN_LABELS.widgetLabels.inspiration, SIGNIN_LABEL_LIMITS.widget),
      motivation: cleanText(widgetSource.motivation, DEFAULT_SIGNIN_LABELS.widgetLabels.motivation, SIGNIN_LABEL_LIMITS.widget),
      news: cleanText(widgetSource.news, DEFAULT_SIGNIN_LABELS.widgetLabels.news, SIGNIN_LABEL_LIMITS.widget),
      status: cleanText(widgetSource.status, DEFAULT_SIGNIN_LABELS.widgetLabels.status, SIGNIN_LABEL_LIMITS.widget),
    },
  };
}

function normalizeWidgetVariant(kind: SignInWidgetId, value: unknown): SignInWidgetVariant {
  const variants = SIGNIN_WIDGET_VARIANTS[kind];
  return variants.includes(value as SignInWidgetVariant) ? value as SignInWidgetVariant : variants[0];
}

function normalizeInstances(value: unknown, hiddenWidgets: SignInWidgetId[], labels: SignInLabels, legacyOrder: SignInWidgetId[]): SignInWidgetInstance[] {
  const supplied = Array.isArray(value);
  const source = (supplied ? value as Array<unknown> : legacyOrder.map((kind) => ({ kind }))).slice(0, MAX_SIGNIN_WIDGET_INSTANCES);
  const instances: SignInWidgetInstance[] = [];
  const usedIds = new Set<string>();
  source.forEach((item, index) => {
    const raw = candidateRecord(item);
    const kind = (ALL_WIDGETS.includes(raw.kind as SignInWidgetId) ? raw.kind : typeof item === 'string' ? item : '') as SignInWidgetId;
    if (!ALL_WIDGETS.includes(kind)) return;
    const baseId = String(raw.id || kind).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || kind;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = kind + '-' + suffix;
      suffix += 1;
    }
    usedIds.add(id);
    const defaultZone: SignInZone = kind === 'weather' || kind === 'status' ? 'live-context' : 'today';
    const zone = ALL_ZONES.includes(raw.zone as SignInZone) ? raw.zone as SignInZone : defaultZone;
    const visible = typeof raw.visible === 'boolean' ? raw.visible : !hiddenWidgets.includes(kind);
    const label = cleanText(raw.label, labels.widgetLabels[kind], SIGNIN_LABEL_LIMITS.widget);
    const effectPreset = ALL_EFFECT_PRESETS.includes(raw.effectPreset as EffectPreset) ? raw.effectPreset as EffectPreset : 'glass';
    instances.push({
      id, kind, zone, visible, label, effectPreset,
      variant: normalizeWidgetVariant(kind, raw.variant),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
    });
  });
  return instances.sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index }));
}

export function nextSignInWidgetId(kind: SignInWidgetId, instances: Pick<SignInWidgetInstance, 'id'>[]) {
  const used = new Set(instances.map((item) => item.id));
  if (!used.has(kind)) return kind;
  let suffix = 2;
  while (used.has(kind + '-' + suffix)) suffix += 1;
  return kind + '-' + suffix;
}

function normalizeEffects(value: unknown): SignInEffects {
  const source = candidateRecord(value);
  const number = Number(source.glassIntensity);
  return {
    ambientGlow: source.ambientGlow !== false,
    glassIntensity: Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : DEFAULT_SIGNIN_PREFERENCES.effects.glassIntensity,
    backgroundBreathing: source.backgroundBreathing !== false,
    cardFloat: source.cardFloat !== false,
    logoMotion: source.logoMotion !== false,
    statusPulse: source.statusPulse !== false,
    widgetEntrance: source.widgetEntrance !== false,
    shimmer: source.shimmer === true,
  };
}

export function normalizeSignInPreferences(value: unknown): SignInExperiencePreferences {
  const candidate = candidateRecord(value);
  const labels = normalizeLabels(candidate.labels);
  const hiddenWidgets = uniqueValues(candidate.hiddenWidgets, ALL_WIDGETS);
  const legacyOrder = uniqueValues(candidate.widgetOrder, ALL_WIDGETS);
  const instances = normalizeInstances(candidate.widgetInstances, hiddenWidgets, labels, legacyOrder.length ? legacyOrder : DEFAULT_SIGNIN_PREFERENCES.widgetOrder);
  const safeInstances = Array.isArray(candidate.widgetInstances) ? instances : (instances.length ? instances : cloneDefault().widgetInstances);
  const logoSource = candidateRecord(candidate.logo);
  const position = ALL_LOGO_POSITIONS.includes(logoSource.position as LogoPosition) ? logoSource.position as LogoPosition : ALL_LOGO_POSITIONS.includes(candidate.logoPosition as LogoPosition) ? candidate.logoPosition as LogoPosition : 'left';
  const maxClocksValue = Number(candidateRecord(candidate.globalOperations).maxClocks);
  const maxClocks = Number.isFinite(maxClocksValue) ? Math.max(1, Math.min(7, Math.round(maxClocksValue))) : 7;
  const availableZones = WORLD_CLOCK_CATALOG.map((item) => item.zone);
  const requestedZones = uniqueValues(candidate.clockZones, availableZones);
  const clockZones = (requestedZones.length ? requestedZones : [...DEFAULT_SIGNIN_PREFERENCES.clockZones]).slice(0, maxClocks);
  const globalSource = candidateRecord(candidate.globalOperations);
  const contentSource = candidateRecord(candidate.content);
  const normalizedInstances = safeInstances.map((item, index) => ({ ...item, order: index }));
  const backgroundId = ALL_BACKGROUND_IDS.includes(String(candidate.backgroundId)) ? String(candidate.backgroundId) : DEFAULT_SIGNIN_PREFERENCES.backgroundId;
  const widgetOrder = [...new Set(normalizedInstances.map((item) => item.kind))];
  return {
    schemaVersion: 3,
    widgetOrder: widgetOrder.length ? widgetOrder : [...DEFAULT_SIGNIN_PREFERENCES.widgetOrder],
    hiddenWidgets: [...new Set(normalizedInstances.filter((item) => !item.visible).map((item) => item.kind))],
    widgetInstances: normalizedInstances,
    clockStyle: ALL_CLOCK_STYLES.includes(candidate.clockStyle as ClockStyle) ? candidate.clockStyle as ClockStyle : DEFAULT_SIGNIN_PREFERENCES.clockStyle,
    clockZones,
    temperatureUnit: candidate.temperatureUnit === 'C' ? 'C' : 'F',
    logoPosition: position,
    logo: {
      position,
      size: ALL_LOGO_SIZES.includes(logoSource.size as LogoSizePreset) ? logoSource.size as LogoSizePreset : DEFAULT_SIGNIN_PREFERENCES.logo.size,
      alignment: ALL_LOGO_ALIGNMENTS.includes(logoSource.alignment as LogoAlignment) ? logoSource.alignment as LogoAlignment : DEFAULT_SIGNIN_PREFERENCES.logo.alignment,
      glass: logoSource.glass !== false,
      animation: ALL_LOGO_ANIMATIONS.includes(logoSource.animation as LogoAnimation) ? logoSource.animation as LogoAnimation : DEFAULT_SIGNIN_PREFERENCES.logo.animation,
    },
    effectLevel: ALL_EFFECT_LEVELS.includes(candidate.effectLevel as EffectLevel) ? candidate.effectLevel as EffectLevel : DEFAULT_SIGNIN_PREFERENCES.effectLevel,
    effects: normalizeEffects(candidate.effects),
    themeMode: candidate.themeMode === 'night' ? 'night' : 'day',
    backgroundId,
    darkStart: validTime(candidate.darkStart, DEFAULT_SIGNIN_PREFERENCES.darkStart),
    darkEnd: validTime(candidate.darkEnd, DEFAULT_SIGNIN_PREFERENCES.darkEnd),
    labels,
    content: {
      inspiration: cleanText(contentSource.inspiration, DEFAULT_CONTENT.inspiration, 180),
      motivation: cleanText(contentSource.motivation, DEFAULT_CONTENT.motivation, 180),
    },
    globalOperations: {
      visible: globalSource.visible !== false,
      maxClocks,
      showWeather: globalSource.showWeather !== false,
      weatherStyle: ['detailed', 'compact', 'visual'].includes(String(globalSource.weatherStyle)) ? String(globalSource.weatherStyle) as SignInGlobalOperations['weatherStyle'] : 'detailed',
      weatherAnimation: ['none', 'subtle', 'expressive'].includes(String(globalSource.weatherAnimation)) ? String(globalSource.weatherAnimation) as SignInGlobalOperations['weatherAnimation'] : 'subtle',
      showFeelsLike: globalSource.showFeelsLike !== false,
      showHumidity: globalSource.showHumidity !== false,
      showWind: globalSource.showWind !== false,
      showPrecipitation: globalSource.showPrecipitation !== false,
      showHighLow: globalSource.showHighLow !== false,
      showSunriseSunset: globalSource.showSunriseSunset !== false,
      showAnalog: globalSource.showAnalog !== false,
      showDigital: globalSource.showDigital !== false,
      showDate: globalSource.showDate !== false,
      showTimezone: globalSource.showTimezone !== false,
      showDayNight: globalSource.showDayNight !== false,
    },
  };
}

export function readSignInPreferences() {
  if (typeof window === 'undefined') return DEFAULT_SIGNIN_PREFERENCES;
  try {
    return normalizeSignInPreferences(JSON.parse(localStorage.getItem(SIGNIN_PREFS_KEY) || 'null'));
  } catch {
    return DEFAULT_SIGNIN_PREFERENCES;
  }
}

export function storeSignInPreferences(value: unknown) {
  const next = normalizeSignInPreferences(value);
  if (typeof window !== 'undefined') {
    localStorage.setItem(SIGNIN_PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(WORLD_CLOCK_PREFS_KEY, JSON.stringify({ style: next.clockStyle, visibleZones: next.clockZones }));
    window.dispatchEvent(new CustomEvent<SignInExperiencePreferences>('daenem:signin-preferences', { detail: next }));
    window.dispatchEvent(new CustomEvent<WorldClockPreferences>('daenem:world-clock-preferences', { detail: { style: next.clockStyle, visibleZones: next.clockZones } }));
  }
  return next;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.error || 'The preference service could not complete this request.'));
  return body as T;
}

export async function fetchPublicSignInContext(): Promise<PublicSignInContext> {
  const payload = await requestJson<unknown>('/api/context/signin');
  const unavailable = () => new Error('Sign-In information is temporarily unavailable.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw unavailable();
  const result = payload as Partial<PublicSignInContext>;
  if (
    !result.config || typeof result.config !== 'object' || Array.isArray(result.config)
    || typeof result.inspiration !== 'string'
    || typeof result.motivation !== 'string'
    || typeof result.generatedAt !== 'string'
    || (result.source !== 'live' && result.source !== 'fallback')
    || !Array.isArray(result.news)
    || !result.news.every((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
      && typeof item.title === 'string'
      && typeof item.category === 'string'
      && typeof item.source === 'string'
      && (item.url === undefined || typeof item.url === 'string'))
  ) throw unavailable();
  return { ...result, config: storeSignInPreferences(result.config) } as PublicSignInContext;
}

export async function fetchAdminSignInPreferences(): Promise<{ config: SignInExperiencePreferences; canManage: boolean }> {
  const result = await requestJson<{ config: SignInExperiencePreferences; canManage: boolean }>('/api/theme/signin');
  result.config = storeSignInPreferences(result.config);
  return result;
}

export async function saveSignInPreferences(value: unknown): Promise<SignInExperiencePreferences> {
  const config = normalizeSignInPreferences(value);
  const result = await requestJson<{ config: SignInExperiencePreferences }>('/api/theme/signin', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });
  return storeSignInPreferences(result.config);
}

export function readWorldClockPreferences(): WorldClockPreferences {
  if (typeof window === 'undefined') return { style: DEFAULT_SIGNIN_PREFERENCES.clockStyle, visibleZones: DEFAULT_SIGNIN_PREFERENCES.clockZones };
  try {
    const parsed = JSON.parse(localStorage.getItem(WORLD_CLOCK_PREFS_KEY) || 'null') as Partial<WorldClockPreferences> | null;
    const visibleZones = uniqueValues(parsed?.visibleZones, WORLD_CLOCK_CATALOG.map((item) => item.zone));
    const style = ALL_CLOCK_STYLES.includes(parsed?.style as ClockStyle) ? parsed?.style as ClockStyle : DEFAULT_SIGNIN_PREFERENCES.clockStyle;
    return { style, visibleZones: visibleZones.length ? visibleZones.slice(0, 7) : [...DEFAULT_SIGNIN_PREFERENCES.clockZones] };
  } catch {
    return { style: DEFAULT_SIGNIN_PREFERENCES.clockStyle, visibleZones: [...DEFAULT_SIGNIN_PREFERENCES.clockZones] };
  }
}

export function saveWorldClockPreferences(preferences: WorldClockPreferences) {
  if (typeof window === 'undefined') return;
  const next = {
    style: ALL_CLOCK_STYLES.includes(preferences.style) ? preferences.style : DEFAULT_SIGNIN_PREFERENCES.clockStyle,
    visibleZones: uniqueValues(preferences.visibleZones, WORLD_CLOCK_CATALOG.map((item) => item.zone)).slice(0, 7),
  };
  if (!next.visibleZones.length) next.visibleZones = [...DEFAULT_SIGNIN_PREFERENCES.clockZones];
  localStorage.setItem(WORLD_CLOCK_PREFS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<WorldClockPreferences>('daenem:world-clock-preferences', { detail: next }));
}

export function isWithinDarkWindow(now: Date, start: string, end: string) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [startHour, startMinute] = validTime(start, '19:00').split(':').map(Number);
  const [endHour, endMinute] = validTime(end, '07:00').split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;
  return startMinutes > endMinutes
    ? minutes >= startMinutes || minutes < endMinutes
    : minutes >= startMinutes && minutes < endMinutes;
}
