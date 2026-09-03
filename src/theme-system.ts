export type ThemeId =
  | 'lagos-sunrise'
  | 'print-neon-grid'
  | 'digital-indigo'
  | 'auto-showroom-night'
  | 'urban-property-skyline'
  | 'cargo-flow'
  | 'executive-boardroom'
  | 'job-market-pulse'
  | 'global-operations-mesh'
  | 'minimal-tech-white';

export type ModePreference = 'day' | 'night' | 'auto';
export type ResolvedMode = 'day' | 'night';
export type LayoutVariant = 'split' | 'center' | 'cards' | 'mesh' | 'minimal';

export interface ThemePalette {
  canvas: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  border: string;
  shadow: string;
  heroOverlay: string;
  chart: string[];
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  focus: string;
  mood: string;
  fontHeading: string;
  fontBody: string;
  signInLayout: LayoutVariant;
  dashboardLayout: LayoutVariant;
  motion: 'calm' | 'balanced' | 'expressive';
  day: ThemePalette;
  night: ThemePalette;
}

const palette = (values: Omit<ThemePalette, 'chart'> & { chart?: string[] }): ThemePalette => ({
  ...values,
  chart: values.chart ?? [values.primary, values.secondary, values.accent, values.success, values.warning],
});

const sharedNight = (primary: string, secondary: string, accent: string): ThemePalette => palette({
  canvas: '#101827',
  surface: '#182336',
  surfaceStrong: '#22314a',
  text: '#f4f8ff',
  muted: '#aabbd0',
  primary,
  secondary,
  accent,
  success: '#49d7a8',
  warning: '#f5bd67',
  border: 'rgba(214,231,255,.16)',
  shadow: '0 22px 60px rgba(2,12,30,.32)',
  heroOverlay: 'rgba(9,19,37,.46)',
});

export const themeList: ThemeConfig[] = [
  {
    id: 'lagos-sunrise',
    name: 'Sunlit Meridian',
    focus: 'Daylight multi-business staff portal',
    mood: 'Warm, optimistic, naturally premium',
    fontHeading: 'Manrope',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'cards',
    motion: 'balanced',
    day: palette({
      canvas: '#fff8f0',
      surface: 'rgba(255,255,255,.84)',
      surfaceStrong: '#fffdf9',
      text: '#17233d',
      muted: '#68758b',
      primary: '#155bd7',
      secondary: '#13b9b0',
      accent: '#ff7d5a',
      success: '#1b9d65',
      warning: '#d99a2b',
      border: 'rgba(23,35,61,.12)',
      shadow: '0 24px 70px rgba(57,65,89,.14)',
      heroOverlay: 'rgba(255,205,160,.26)',
    }),
    night: sharedNight('#5ea2ff', '#26d5c7', '#ff8f73'),
  },
  {
    id: 'print-neon-grid',
    name: 'Print Neon Grid',
    focus: 'Printing + large-format technology',
    mood: 'Creative, precise, energetic',
    fontHeading: 'Space Grotesk',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'cards',
    motion: 'expressive',
    day: palette({
      canvas: '#f2f8ff',
      surface: 'rgba(255,255,255,.9)',
      surfaceStrong: '#ffffff',
      text: '#121d3b',
      muted: '#62718b',
      primary: '#2857e6',
      secondary: '#00b8d9',
      accent: '#e94db9',
      success: '#1cad78',
      warning: '#f0ad38',
      border: 'rgba(40,87,230,.16)',
      shadow: '0 24px 70px rgba(48,75,145,.16)',
      heroOverlay: 'rgba(116,204,255,.2)',
      chart: ['#2857e6', '#00b8d9', '#e94db9', '#ff7c61', '#1cad78'],
    }),
    night: sharedNight('#5f85ff', '#33d6ea', '#f36fd0'),
  },
  {
    id: 'digital-indigo',
    name: 'Digital Indigo',
    focus: 'DI + technology services',
    mood: 'Analytical, intelligent, connected',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'Inter',
    signInLayout: 'center',
    dashboardLayout: 'mesh',
    motion: 'balanced',
    day: palette({
      canvas: '#f3f5ff',
      surface: 'rgba(255,255,255,.84)',
      surfaceStrong: '#ffffff',
      text: '#171b46',
      muted: '#6c7195',
      primary: '#4a43d8',
      secondary: '#3db8f6',
      accent: '#a77cff',
      success: '#26ad83',
      warning: '#e8aa42',
      border: 'rgba(74,67,216,.14)',
      shadow: '0 24px 72px rgba(67,61,150,.17)',
      heroOverlay: 'rgba(138,129,255,.18)',
      chart: ['#4a43d8', '#3db8f6', '#a77cff', '#24b994', '#ff8b72'],
    }),
    night: sharedNight('#8a80ff', '#5ad0ff', '#c79aff'),
  },
  {
    id: 'auto-showroom-night',
    name: 'Auto Showroom Night',
    focus: 'Auto dealership + workshop',
    mood: 'Focused, luxurious, precise',
    fontHeading: 'DM Sans',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'cards',
    motion: 'calm',
    day: palette({
      canvas: '#f2f7fb',
      surface: 'rgba(255,255,255,.84)',
      surfaceStrong: '#ffffff',
      text: '#15263b',
      muted: '#667589',
      primary: '#2366d1',
      secondary: '#6d88a7',
      accent: '#ec6a63',
      success: '#2aa982',
      warning: '#e6aa44',
      border: 'rgba(25,51,80,.14)',
      shadow: '0 24px 70px rgba(31,53,83,.18)',
      heroOverlay: 'rgba(67,104,152,.16)',
      chart: ['#2366d1', '#6d88a7', '#ec6a63', '#2aa982', '#e6aa44'],
    }),
    night: palette({
      canvas: '#101722',
      surface: 'rgba(25,36,52,.94)',
      surfaceStrong: '#233044',
      text: '#f5f8fc',
      muted: '#a5b4c6',
      primary: '#68a1ff',
      secondary: '#b5c5d7',
      accent: '#ff806e',
      success: '#52d4aa',
      warning: '#f6c16c',
      border: 'rgba(214,231,255,.16)',
      shadow: '0 24px 70px rgba(1,8,20,.38)',
      heroOverlay: 'rgba(8,15,26,.48)',
      chart: ['#68a1ff', '#b5c5d7', '#ff806e', '#52d4aa', '#f6c16c'],
    }),
  },
  {
    id: 'urban-property-skyline',
    name: 'Urban Property Skyline',
    focus: 'Homes + properties',
    mood: 'Aspirational, calm, architectural',
    fontHeading: 'Manrope',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'cards',
    motion: 'calm',
    day: palette({
      canvas: '#f3fbff',
      surface: 'rgba(255,255,255,.86)',
      surfaceStrong: '#ffffff',
      text: '#173047',
      muted: '#6a7e91',
      primary: '#1f6fcb',
      secondary: '#22b6a5',
      accent: '#f08a6c',
      success: '#2caa73',
      warning: '#dba13c',
      border: 'rgba(31,111,203,.14)',
      shadow: '0 24px 72px rgba(68,105,139,.15)',
      heroOverlay: 'rgba(168,225,255,.23)',
      chart: ['#1f6fcb', '#22b6a5', '#f08a6c', '#2caa73', '#dba13c'],
    }),
    night: sharedNight('#68afff', '#38dac4', '#ff9b7c'),
  },
  {
    id: 'cargo-flow',
    name: 'Cargo Flow',
    focus: 'Logistics + transport',
    mood: 'Kinetic, clear, dependable',
    fontHeading: 'Space Grotesk',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'mesh',
    motion: 'expressive',
    day: palette({
      canvas: '#eefaff',
      surface: 'rgba(255,255,255,.88)',
      surfaceStrong: '#ffffff',
      text: '#12334a',
      muted: '#617b8c',
      primary: '#0a6fd7',
      secondary: '#08b8b0',
      accent: '#f28a4c',
      success: '#27a86c',
      warning: '#efb23f',
      border: 'rgba(10,111,215,.16)',
      shadow: '0 24px 70px rgba(42,113,151,.16)',
      heroOverlay: 'rgba(122,223,240,.2)',
      chart: ['#0a6fd7', '#08b8b0', '#f28a4c', '#27a86c', '#efb23f'],
    }),
    night: sharedNight('#5fa8ff', '#35d8cb', '#ff9f64'),
  },
  {
    id: 'executive-boardroom',
    name: 'Executive Boardroom',
    focus: 'Corporate HQ + staff ERP',
    mood: 'Quiet confidence, warm precision',
    fontHeading: 'DM Sans',
    fontBody: 'Inter',
    signInLayout: 'split',
    dashboardLayout: 'cards',
    motion: 'calm',
    day: palette({
      canvas: '#faf8f2',
      surface: 'rgba(255,255,255,.88)',
      surfaceStrong: '#fffefa',
      text: '#2d2b2a',
      muted: '#7d7770',
      primary: '#315fa9',
      secondary: '#a88b55',
      accent: '#d77963',
      success: '#3f9b72',
      warning: '#c4943d',
      border: 'rgba(102,86,58,.15)',
      shadow: '0 24px 70px rgba(96,80,51,.15)',
      heroOverlay: 'rgba(236,214,177,.24)',
      chart: ['#315fa9', '#a88b55', '#d77963', '#3f9b72', '#c4943d'],
    }),
    night: palette({
      canvas: '#171a20',
      surface: 'rgba(33,37,45,.95)',
      surfaceStrong: '#2b3038',
      text: '#f6f5f1',
      muted: '#b9b3a7',
      primary: '#86adf2',
      secondary: '#d4b779',
      accent: '#f1937c',
      success: '#64c49b',
      warning: '#efc277',
      border: 'rgba(246,238,218,.15)',
      shadow: '0 24px 70px rgba(0,0,0,.35)',
      heroOverlay: 'rgba(17,19,23,.5)',
      chart: ['#86adf2', '#d4b779', '#f1937c', '#64c49b', '#efc277'],
    }),
  },
  {
    id: 'job-market-pulse',
    name: 'Job Market Pulse',
    focus: 'Jobs + recruitment',
    mood: 'Human, optimistic, energetic',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'Inter',
    signInLayout: 'cards',
    dashboardLayout: 'cards',
    motion: 'expressive',
    day: palette({
      canvas: '#fff5f2',
      surface: 'rgba(255,255,255,.9)',
      surfaceStrong: '#ffffff',
      text: '#2a2745',
      muted: '#7d7892',
      primary: '#5b58d9',
      secondary: '#35b8d3',
      accent: '#f27687',
      success: '#32ae83',
      warning: '#e8ad42',
      border: 'rgba(91,88,217,.14)',
      shadow: '0 24px 70px rgba(117,85,115,.15)',
      heroOverlay: 'rgba(255,186,187,.22)',
      chart: ['#5b58d9', '#35b8d3', '#f27687', '#32ae83', '#e8ad42'],
    }),
    night: sharedNight('#8e8aff', '#64d8ed', '#ff8798'),
  },
  {
    id: 'global-operations-mesh',
    name: 'Global Operations Mesh',
    focus: 'Multi-ERP overview',
    mood: 'Expansive, connected, intelligent',
    fontHeading: 'Space Grotesk',
    fontBody: 'Inter',
    signInLayout: 'mesh',
    dashboardLayout: 'mesh',
    motion: 'balanced',
    day: palette({
      canvas: '#f2f9ff',
      surface: 'rgba(255,255,255,.82)',
      surfaceStrong: '#ffffff',
      text: '#162e4e',
      muted: '#6b7d94',
      primary: '#176bd1',
      secondary: '#22b9c9',
      accent: '#9276ed',
      success: '#2ab482',
      warning: '#eca944',
      border: 'rgba(23,107,209,.14)',
      shadow: '0 24px 72px rgba(49,108,166,.15)',
      heroOverlay: 'rgba(152,221,255,.23)',
      chart: ['#176bd1', '#22b9c9', '#9276ed', '#2ab482', '#f17f75'],
    }),
    night: sharedNight('#66a9ff', '#3fe1df', '#b199ff'),
  },
  {
    id: 'minimal-tech-white',
    name: 'Minimal Tech White',
    focus: 'Clean enterprise workspace',
    mood: 'Quiet, exact, efficient',
    fontHeading: 'Manrope',
    fontBody: 'Inter',
    signInLayout: 'minimal',
    dashboardLayout: 'minimal',
    motion: 'calm',
    day: palette({
      canvas: '#fbfdff',
      surface: 'rgba(255,255,255,.92)',
      surfaceStrong: '#ffffff',
      text: '#17304b',
      muted: '#728096',
      primary: '#246bd7',
      secondary: '#25b9ad',
      accent: '#ef7e6d',
      success: '#2aa673',
      warning: '#e2a83d',
      border: 'rgba(23,48,75,.11)',
      shadow: '0 20px 55px rgba(29,76,121,.11)',
      heroOverlay: 'rgba(226,240,255,.32)',
      chart: ['#246bd7', '#25b9ad', '#ef7e6d', '#2aa673', '#e2a83d'],
    }),
    night: sharedNight('#73aaff', '#50dbce', '#ff9480'),
  },
];


export interface ThemePersonality {
  identity: string;
  layoutPhilosophy: string;
  heroImagery: string;
  widgetArrangement: string;
  chartStyling: string;
  animationBehavior: string;
  dashboardPersonality: string;
}

/**
 * The visual contract for each selectable direction. Components use this metadata
 * to keep the ten responsive boards recognizably different while sharing behavior,
 * accessibility, and the canonical ERP navigation.
 */
export const themePersonalities: Record<ThemeId, ThemePersonality> = {
  'lagos-sunrise': {
    identity: 'Warm sunrise operations',
    layoutPhilosophy: 'Open split composition with generous editorial breathing room',
    heroImagery: 'Golden Lagos light, bakery craft, and human-scale operations',
    widgetArrangement: 'Warm KPI ribbon followed by approachable operational cards',
    chartStyling: 'Rounded blue-teal lines with coral highlights and soft area fills',
    animationBehavior: 'Confident floating drift with gentle sunrise shimmer',
    dashboardPersonality: 'Optimistic, welcoming, and action-oriented',
  },
  'print-neon-grid': {
    identity: 'Creative production grid',
    layoutPhilosophy: 'Structured grid with deliberate alignment and high information density',
    heroImagery: 'Neon print layers, precision registration, and luminous production marks',
    widgetArrangement: 'Modular production tiles with a strong visual work queue',
    chartStyling: 'Electric stepped lines, cyan bars, and magenta alert accents',
    animationBehavior: 'Crisp hover lifts, scan-line shimmer, and expressive transitions',
    dashboardPersonality: 'Inventive, precise, and kinetic',
  },
  'digital-indigo': {
    identity: 'Intelligent digital network',
    layoutPhilosophy: 'Mesh layout that lets connected signals guide the eye across workspaces',
    heroImagery: 'Indigo interfaces, connected nodes, and deep technology gradients',
    widgetArrangement: 'Interlocking insight panels with a dominant intelligence canvas',
    chartStyling: 'Layered indigo and violet streams with signal-point emphasis',
    animationBehavior: 'Soft node pulses and balanced, responsive state transitions',
    dashboardPersonality: 'Analytical, connected, and quietly futuristic',
  },
  'auto-showroom-night': {
    identity: 'Daylight luxury showroom',
    layoutPhilosophy: 'Focused cards with strong product framing and calm executive spacing',
    heroImagery: 'Reflective vehicle forms, showroom glass, and precision highlights',
    widgetArrangement: 'Inventory and workshop cards arranged like a curated showroom',
    chartStyling: 'Fine blue telemetry lines, metallic neutral bars, and coral exceptions',
    animationBehavior: 'Measured reveal, polished hover sheen, and restrained motion',
    dashboardPersonality: 'Confident, premium, and exact',
  },
  'urban-property-skyline': {
    identity: 'Architectural city calm',
    layoutPhilosophy: 'Layered cards that create an airy property portfolio overview',
    heroImagery: 'Skyline silhouettes, daylight architecture, and quiet teal reflections',
    widgetArrangement: 'Portfolio, occupancy, maintenance, and ROI grouped in spatial layers',
    chartStyling: 'Architectural area charts with teal occupancy bands and coral markers',
    animationBehavior: 'Slow parallax ambience with soft card elevation',
    dashboardPersonality: 'Aspirational, composed, and trustworthy',
  },
  'cargo-flow': {
    identity: 'Living logistics route',
    layoutPhilosophy: 'Mesh-based flow that prioritizes movement, routes, and exceptions',
    heroImagery: 'Cargo lanes, route lines, fleet lights, and kinetic horizon energy',
    widgetArrangement: 'Dispatch queue and live status sit at the center of the workspace',
    chartStyling: 'Directional route lines, cyan throughput bars, and orange delay signals',
    animationBehavior: 'Expressive route sweeps, pulse markers, and momentum-aware movement',
    dashboardPersonality: 'Kinetic, dependable, and operationally clear',
  },
  'executive-boardroom': {
    identity: 'Warm executive command',
    layoutPhilosophy: 'Quiet card hierarchy with strong decision points and restrained ornament',
    heroImagery: 'Natural materials, boardroom light, and considered enterprise detail',
    widgetArrangement: 'Executive KPIs above focused risk, people, and decision widgets',
    chartStyling: 'Fine navy lines, brass comparison bars, and muted coral risk markers',
    animationBehavior: 'Subtle fade-through, calm lift, and deliberate status emphasis',
    dashboardPersonality: 'Authoritative, warm, and focused',
  },
  'job-market-pulse': {
    identity: 'Human talent pulse',
    layoutPhilosophy: 'Friendly cards and quick-glance clusters that keep people at the center',
    heroImagery: 'Human connection, optimistic coral light, and inclusive work moments',
    widgetArrangement: 'Candidate funnel, interviews, tasks, and announcements in lively clusters',
    chartStyling: 'Rounded violet funnels, aqua progress bars, and coral pulse points',
    animationBehavior: 'Noticeable but friendly pulse, shimmer, and celebratory completion states',
    dashboardPersonality: 'Human, energetic, and encouraging',
  },
  'global-operations-mesh': {
    identity: 'Connected enterprise command',
    layoutPhilosophy: 'Responsive mesh that balances all ERPs without creating dead zones',
    heroImagery: 'World-scale connections, atmospheric light, and global operating signals',
    widgetArrangement: 'Cross-ERP command tiles around a central intelligence canvas',
    chartStyling: 'Multi-series global lines, connected nodes, and forecast overlays',
    animationBehavior: 'Balanced ambient orbit with clear data-state transitions',
    dashboardPersonality: 'Expansive, intelligent, and unified',
  },
  'minimal-tech-white': {
    identity: 'Quiet precision workspace',
    layoutPhilosophy: 'Minimal canvas, exact spacing, and only the information needed in context',
    heroImagery: 'Bright white technology surfaces with precise blue-teal accents',
    widgetArrangement: 'Sparse but meaningful cards with disciplined quick actions',
    chartStyling: 'Hairline blue charts, restrained teal fills, and exact annotation',
    animationBehavior: 'Fast, light micro-interactions with almost no visual noise',
    dashboardPersonality: 'Clear, efficient, and effortlessly modern',
  },
};

export function normalizeThemeId(value: unknown): ThemeId {
  const id = String(value || '');
  if (themeList.some((theme) => theme.id === id)) return id as ThemeId;
  return 'lagos-sunrise';
}

export function isThemeId(value: unknown): value is ThemeId {
  return themeList.some((theme) => theme.id === String(value));
}

export function themeById(value: unknown): ThemeConfig {
  const id = normalizeThemeId(value);
  return themeList.find((theme) => theme.id === id) || themeList[0];
}

export function themePersonalityById(value: unknown): ThemePersonality {
  return themePersonalities[normalizeThemeId(value)];
}

export function resolveMode(preference: ModePreference, date = new Date()): ResolvedMode {
  if (preference !== 'auto') return preference;
  const hour = date.getHours();
  return hour >= 19 || hour < 7 ? 'night' : 'day';
}

export function readModePreference(): ModePreference {
  if (typeof window === 'undefined') return 'day';
  const stored = window.localStorage.getItem('daenem-mode');
  return stored === 'night' || stored === 'auto' ? stored : 'day';
}

export function readThemeId(value?: unknown): ThemeId {
  if (value) return normalizeThemeId(value);
  if (typeof window !== 'undefined') return normalizeThemeId(window.localStorage.getItem('workforce-theme'));
  return 'lagos-sunrise';
}

export function applyThemeToDocument(value: unknown, preference: ModePreference = readModePreference()): ThemeId {
  if (typeof document === 'undefined') return normalizeThemeId(value);
  const theme = themeById(value);
  const mode = resolveMode(preference);
  const selected = theme[mode];
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.dataset.mode = mode;
  root.dataset.layout = theme.dashboardLayout;
  root.dataset.signInLayout = theme.signInLayout;
  root.dataset.motion = theme.motion;
  root.style.colorScheme = mode === 'night' ? 'dark' : 'light';
  root.style.setProperty('--canvas', selected.canvas);
  root.style.setProperty('--surface', selected.surface);
  root.style.setProperty('--surface-strong', selected.surfaceStrong);
  root.style.setProperty('--text', selected.text);
  root.style.setProperty('--muted', selected.muted);
  root.style.setProperty('--primary', selected.primary);
  root.style.setProperty('--secondary', selected.secondary);
  root.style.setProperty('--accent', selected.accent);
  root.style.setProperty('--success', selected.success);
  root.style.setProperty('--warning', selected.warning);
  root.style.setProperty('--border', selected.border);
  root.style.setProperty('--shadow', selected.shadow);
  root.style.setProperty('--hero-overlay', selected.heroOverlay);
  root.style.setProperty('--glow-intensity', theme.motion === 'expressive' ? '1' : theme.motion === 'balanced' ? '.78' : '.58');
  root.style.setProperty('--font-heading', `"${theme.fontHeading}"`);
  root.style.setProperty('--font-body', `"${theme.fontBody}"`);
  // All sign-in themes use the new native 4K campus background; palette and blend
  // variables create the approved daylight/night variants without baked-in UI.
  root.style.setProperty('--hero-image', 'url("/reference-images/signin/daenem-unified-daylight-4k.webp")');
  // The authenticated dashboard remains live UI and never receives composite artwork.
  root.style.setProperty('--dashboard-image', 'none');
  return theme.id;
}
