import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface Env extends AuthEnv {}

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
  executive: 'executive-boardroom',
  'executive-night': 'executive-boardroom',
  horizon: 'lagos-sunrise',
  midnight: 'auto-showroom-night',
  clean: 'minimal-tech-white',
  glass: 'digital-indigo',
  emerald: 'cargo-flow',
  azure: 'global-operations-mesh',
  sandstone: 'executive-boardroom',
  carbon: 'auto-showroom-night',
  focus: 'minimal-tech-white',
  contrast: 'minimal-tech-white',
  'high-contrast-dark': 'auto-showroom-night',
  'system-adaptive': 'global-operations-mesh',
};

const defaultSignInConfig = {
  widgetOrder: ['weather', 'inspiration', 'motivation', 'news', 'status'],
  hiddenWidgets: [] as string[],
  clockStyle: 'detailed',
  clockZones: ['Africa/Lagos', 'America/Toronto', 'Europe/London', 'America/New_York', 'Europe/Moscow', 'Asia/Tokyo', 'Asia/Shanghai'],
  temperatureUnit: 'F',
  logoPosition: 'left',
  effectLevel: 'balanced',
  themeMode: 'auto',
  darkStart: '19:00',
  darkEnd: '07:00',
};

const signInWidgets = ['weather', 'inspiration', 'motivation', 'news', 'status'];
const signInZones = ['Africa/Lagos', 'America/Toronto', 'Europe/London', 'America/New_York', 'Europe/Moscow', 'Asia/Tokyo', 'Asia/Shanghai', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Singapore', 'Australia/Sydney'];

const normalize = (value: unknown, allowBlank = false) => {
  const id = String(value || '');
  if (!id && allowBlank) return '';
  return aliases[id] || id;
};

const valid = (value: unknown, allowBlank = false) => {
  const id = normalize(value, allowBlank);
  return (allowBlank && id === '') || themes.includes(id);
};

async function setting(env: Env, key: string, fallback: string) {
  const row = await env.DB.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?')
    .bind(key)
    .first<{ setting_value: string }>();
  return row?.setting_value ?? fallback;
}

async function policy(env: Env, context: SessionContext) {
  const forcedTheme = normalize(await setting(env, 'ui.forced_theme', ''), true);
  const defaultTheme = normalize(await setting(env, 'ui.default_theme', 'lagos-sunrise'));
  const allowEmployeeChoice = (await setting(env, 'ui.allow_employee_theme_choice', 'true')) === 'true';
  const preference = await env.DB.prepare(`SELECT COALESCE(ep.theme,e.preferred_theme) AS theme
    FROM employees e LEFT JOIN employee_preferences ep ON ep.employee_id=e.id WHERE e.id=?`)
    .bind(context.employee.id)
    .first<{ theme?: string }>();
  const preferredTheme = normalize(preference?.theme || '');
  return {
    forcedTheme,
    defaultTheme,
    allowEmployeeChoice,
    preferredTheme,
    effectiveTheme: forcedTheme || preferredTheme || defaultTheme,
    canManage: hasPermission(context, 'settings.access', 'manage'),
    themes,
  };
}

function cleanStringList(value: unknown, allowed: string[], fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const values = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
  return values.length ? values : [...fallback];
}

function cleanSignInConfig(value: unknown) {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const widgetOrder = cleanStringList(candidate.widgetOrder, signInWidgets, defaultSignInConfig.widgetOrder);
  const hiddenWidgets = Array.isArray(candidate.hiddenWidgets)
    ? [...new Set(candidate.hiddenWidgets.filter((item): item is string => typeof item === 'string' && signInWidgets.includes(item)))]
    : [];
  const validTime = (time: unknown, fallback: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || '')) ? String(time) : fallback;
  return {
    widgetOrder: [...widgetOrder, ...signInWidgets.filter((item) => !widgetOrder.includes(item))],
    hiddenWidgets,
    clockStyle: ['minimal', 'detailed', 'neon', 'classic'].includes(String(candidate.clockStyle)) ? String(candidate.clockStyle) : defaultSignInConfig.clockStyle,
    clockZones: cleanStringList(candidate.clockZones, signInZones, defaultSignInConfig.clockZones).slice(0, 7),
    temperatureUnit: candidate.temperatureUnit === 'C' ? 'C' : 'F',
    logoPosition: ['left', 'center', 'right'].includes(String(candidate.logoPosition)) ? String(candidate.logoPosition) : defaultSignInConfig.logoPosition,
    effectLevel: ['calm', 'balanced', 'vivid'].includes(String(candidate.effectLevel)) ? String(candidate.effectLevel) : defaultSignInConfig.effectLevel,
    themeMode: ['day', 'night', 'auto'].includes(String(candidate.themeMode)) ? String(candidate.themeMode) : defaultSignInConfig.themeMode,
    darkStart: validTime(candidate.darkStart, defaultSignInConfig.darkStart),
    darkEnd: validTime(candidate.darkEnd, defaultSignInConfig.darkEnd),
  };
}

async function signInConfig(env: Env) {
  const value = await setting(env, 'ui.signin_config_v2', '');
  if (!value) return cleanSignInConfig(defaultSignInConfig);
  try {
    return cleanSignInConfig(JSON.parse(value));
  } catch {
    return cleanSignInConfig(defaultSignInConfig);
  }
}

export async function routeThemePreferences(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/theme/')) return null;

  if (url.pathname === '/api/theme/policy' && request.method === 'GET') {
    return json(await policy(env, context));
  }

  if (url.pathname === '/api/theme/preference' && request.method === 'POST') {
    let body: { theme?: string };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid theme request.' }, 400);
    }
    const currentPolicy = await policy(env, context);
    if (currentPolicy.forcedTheme) return json({ error: 'The Owner has currently selected a Group-wide theme.', forcedTheme: currentPolicy.forcedTheme }, 409);
    if (!currentPolicy.allowEmployeeChoice) return json({ error: 'Personal theme selection is currently disabled.' }, 403);
    if (!valid(body.theme)) return json({ error: 'Select an approved Daenem theme.' }, 400);
    const theme = normalize(body.theme);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO employee_preferences(employee_id,theme,updated_at)
        VALUES(?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(employee_id) DO UPDATE SET theme=excluded.theme,updated_at=CURRENT_TIMESTAMP`).bind(context.employee.id, theme),
      env.DB.prepare('UPDATE employees SET preferred_theme=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(theme, context.employee.id),
    ]);
    return json({ ok: true, theme });
  }

  if (url.pathname === '/api/theme/signin' && request.method === 'GET') {
    return json({
      config: await signInConfig(env),
      canManage: hasPermission(context, 'settings.access', 'manage'),
    });
  }

  if (url.pathname === '/api/theme/signin' && request.method === 'POST') {
    if (!hasPermission(context, 'settings.access', 'manage')) {
      return json({ error: 'Manage Settings permission is required.' }, 403);
    }
    let body: { config?: unknown };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid sign-in configuration request.' }, 400);
    }
    const config = cleanSignInConfig(body.config);
    await env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
      VALUES('ui.signin_config_v2',?,'json',?,CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value=excluded.setting_value,
        value_type=excluded.value_type,
        updated_by=excluded.updated_by,
        updated_at=CURRENT_TIMESTAMP`)
      .bind(JSON.stringify(config), context.employee.id)
      .run();
    return json({ ok: true, config });
  }

  if (url.pathname === '/api/theme/policy' && request.method === 'POST') {
    if (!hasPermission(context, 'settings.access', 'manage')) {
      return json({ error: 'Manage Settings permission is required.' }, 403);
    }
    let body: { defaultTheme?: string; forcedTheme?: string; allowEmployeeChoice?: boolean };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid theme policy request.' }, 400);
    }
    if (body.defaultTheme !== undefined && !valid(body.defaultTheme)) return json({ error: 'Invalid default theme.' }, 400);
    if (body.forcedTheme !== undefined && !valid(body.forcedTheme, true)) return json({ error: 'Invalid forced theme.' }, 400);
    const statements: D1PreparedStatement[] = [];
    if (body.defaultTheme !== undefined) {
      statements.push(env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
        VALUES('ui.default_theme',?,'string',?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
        .bind(normalize(body.defaultTheme), context.employee.id));
    }
    if (body.forcedTheme !== undefined) {
      statements.push(env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
        VALUES('ui.forced_theme',?,'string',?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
        .bind(normalize(body.forcedTheme, true), context.employee.id));
    }
    if (body.allowEmployeeChoice !== undefined) {
      statements.push(env.DB.prepare(`INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)
        VALUES('ui.allow_employee_theme_choice',?,'boolean',?,CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
        .bind(body.allowEmployeeChoice ? 'true' : 'false', context.employee.id));
    }
    if (!statements.length) return json({ error: 'No theme policy changes supplied.' }, 400);
    await env.DB.batch(statements);
    return json({ ok: true, ...await policy(env, context) });
  }

  return json({ error: 'Theme API route not found.' }, 404);
}
