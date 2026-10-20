import { getSessionContext, hasPermission, routeAuth, type AccessLevel, type AuthEnv, type SessionContext } from './auth';
import { readSignInConfig } from './theme-preferences';
import { DASHBOARD_FIELD_PERMISSIONS, type DashboardAggregateField } from '../src/dashboard-capabilities';
import { readGoogleWeather, readWeatherConfiguration } from './weather-provider';
import { routeIncidentResponse } from './incident-response';
import { routeWorkspaceShell } from './workspace-route';
import { postLoginContext } from './postlogin-context';

interface Env extends AuthEnv {
  FILES: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  TIMEZONE: string;
  WEATHER_PROVIDER_ENABLED?: string;
  SOCIAL_CACHE?: KVNamespace;
}

type JsonValue = Record<string, unknown> | unknown[];

const json = (body: JsonValue, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  },
});

function securityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('x-frame-options', 'DENY');
  headers.set('x-permitted-cross-domain-policies', 'none');
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(self), geolocation=(self), microphone=()');
  headers.set('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' https://weather.googleapis.com; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function weatherResponse(
  env: Env,
  latitude: number,
  longitude: number,
  unitsSystem: 'IMPERIAL' | 'METRIC',
  location: string,
) {
  const result = await readGoogleWeather(env, latitude, longitude, unitsSystem);
  if (!result.data) {
    return json(
      { available: false, providerStatus: result.providerStatus },
      result.providerStatus === 'provider_required' ? 200 : 502,
    );
  }
  const weatherData = result.data as {
    currentTime?: unknown; isDaytime?: unknown;
    weatherCondition?: { description?: { text?: unknown } };
    temperature?: unknown; feelsLikeTemperature?: unknown; relativeHumidity?: unknown;
    precipitation?: { probability?: { percent?: unknown }; qpf?: unknown };
    wind?: { speed?: unknown; direction?: { degrees?: unknown }; gust?: unknown };
    currentConditionsHistory?: { maxTemperature?: unknown; minTemperature?: unknown };
  };
  const numberValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const number = (value: unknown) => numberValue((value as { degrees?: unknown; value?: unknown; quantity?: unknown } | null)?.degrees ?? (value as { value?: unknown; quantity?: unknown } | null)?.value ?? (value as { quantity?: unknown } | null)?.quantity);
  const current = weatherData.currentConditionsHistory || {};
  const condition = weatherData.weatherCondition?.description?.text;

  return json({
    available: true,
    provider: 'Google Weather',
    providerStatus: result.providerStatus,
    fetchedAt: result.fetchedAt,
    cacheAgeSeconds: result.cacheAgeSeconds,
    unitsSystem,
    location,
    temperature: number(weatherData.temperature),
    apparentTemperature: number(weatherData.feelsLikeTemperature),
    humidity: numberValue(weatherData.relativeHumidity),
    isDay: typeof weatherData.isDaytime === 'boolean' ? weatherData.isDaytime : null,
    precipitationProbability: numberValue(weatherData.precipitation?.probability?.percent),
    precipitation: number(weatherData.precipitation?.qpf),
    windSpeed: number(weatherData.wind?.speed),
    windDirection: numberValue(weatherData.wind?.direction?.degrees),
    windGust: number(weatherData.wind?.gust),
    today: { high: number(current.maxTemperature), low: number(current.minTemperature) },
    description: typeof condition === 'string' ? condition : 'Current conditions',
    observedAt: typeof weatherData.currentTime === 'string' ? weatherData.currentTime : null,
  });
}

// Only these public sign-in clocks may use the weather provider.
const PUBLIC_SIGNIN_WEATHER_CITIES = {
  ibadan: [7.3775, 3.9470, 'Ibadan, Oyo State'],
  toronto: [43.6532, -79.3832, 'Toronto, Canada'],
  london: [51.5074, -0.1278, 'London, United Kingdom'],
  newyork: [40.7128, -74.0060, 'New York, United States'],
  moscow: [55.7558, 37.6173, 'Moscow, Russia'],
  tokyo: [35.6762, 139.6503, 'Tokyo, Japan'],
  beijing: [39.9042, 116.4074, 'Beijing, China'],
} as const;

function openMeteoDescription(code: number) {
  if (code === 0) return 'Clear';
  if (code <= 3) return code === 1 ? 'Mostly clear' : 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Current conditions';
}

async function fixedCityWeatherFallback(latitude: number, longitude: number, location: string) {
  try {
    const endpoint = new URL('https://api.open-meteo.com/v1/forecast');
    endpoint.searchParams.set('latitude', String(latitude));
    endpoint.searchParams.set('longitude', String(longitude));
    endpoint.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,wind_speed_10m,weather_code,is_day');
    endpoint.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
    endpoint.searchParams.set('forecast_days', '1');
    endpoint.searchParams.set('timezone', 'auto');
    const response = await fetch(endpoint, { headers: { accept: 'application/json' }, cf: { cacheEverything: true, cacheTtl: 300 } });
    if (!response.ok) return null;
    const payload = await response.json() as {
      current?: Record<string, unknown>;
      daily?: { temperature_2m_max?: unknown[]; temperature_2m_min?: unknown[] };
    };
    const current = payload.current || {};
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    const code = number(current.weather_code);
    return json({
      available: true,
      provider: 'Open-Meteo fallback',
      providerStatus: 'fresh',
      fetchedAt: new Date().toISOString(),
      cacheAgeSeconds: 0,
      unitsSystem: 'METRIC',
      location,
      temperature: number(current.temperature_2m),
      apparentTemperature: number(current.apparent_temperature),
      humidity: number(current.relative_humidity_2m),
      isDay: number(current.is_day) === null ? null : number(current.is_day) === 1,
      precipitationProbability: number(current.precipitation_probability),
      precipitation: null,
      windSpeed: number(current.wind_speed_10m),
      windDirection: null,
      windGust: null,
      today: {
        high: number(payload.daily?.temperature_2m_max?.[0]),
        low: number(payload.daily?.temperature_2m_min?.[0]),
      },
      description: openMeteoDescription(code === null ? -1 : code),
      observedAt: typeof current.time === 'string' ? current.time : null,
    });
  } catch {
    return null;
  }
}

async function signInWeather(env: Env, cityName: string | null = null) {
  // No arbitrary latitude/longitude or user-provided location is accepted.
  const city = (cityName || 'ibadan').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_SIGNIN_WEATHER_CITIES, city)) {
    return json({ error: 'Unsupported public weather city.' }, 400);
  }
  const [lat, lon, label] = PUBLIC_SIGNIN_WEATHER_CITIES[city as keyof typeof PUBLIC_SIGNIN_WEATHER_CITIES];
  const primary = await weatherResponse(env, lat, lon, 'METRIC', label);
  if (primary.status < 500) return primary;
  return await fixedCityWeatherFallback(lat, lon, label) || primary;
}

async function weather(request: Request, env: Env) {
  if (env.WEATHER_PROVIDER_ENABLED !== 'true' || env.APP_STAGE === 'production') {
    return json({ available: false, providerStatus: 'provider_required' });
  }
  const url = new URL(request.url);
  const rawLat = url.searchParams.get('lat');
  const rawLon = url.searchParams.get('lon');
  const rawUnitsSystem = url.searchParams.get('unitsSystem');
  if (rawLat === null || rawLon === null || !rawLat.trim() || !rawLon.trim()) {
    return json({ error: 'Valid latitude and longitude are required.' }, 400);
  }
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return json({ error: 'Valid latitude and longitude are required.' }, 400);
  }
  if (rawUnitsSystem !== null && rawUnitsSystem !== 'IMPERIAL' && rawUnitsSystem !== 'METRIC') {
    return json({ error: 'Choose IMPERIAL or METRIC weather units.' }, 400);
  }

  const unitsSystem = rawUnitsSystem === 'METRIC' ? 'METRIC' : rawUnitsSystem === 'IMPERIAL'
    ? 'IMPERIAL' : (await readWeatherConfiguration(env)).defaultUnits;
  return weatherResponse(env, lat, lon, unitsSystem, 'Current work location');
}

async function readPublicSignInConfig(env: Env) {
  return readSignInConfig(env);
}

function decodeFeedText(value: string) {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function feedTag(item: string, tag: string) {
  const match = item.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? decodeFeedText(match[1]) : '';
}

async function liveHeadlines(feedUrl: string, category: string) {
  try {
    const response = await fetch(feedUrl, {
      headers: { accept: 'application/rss+xml, application/xml;q=0.9' },
      cf: { cacheTtl: 900, cacheEverything: true },
    });
    if (!response.ok) return [] as Array<{ title: string; url?: string; category: string; source: string }>;
    const xml = await response.text();
    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 3).map((match) => {
      const title = feedTag(match[0], 'title').slice(0, 180);
      const link = feedTag(match[0], 'link');
      const source = feedTag(match[0], 'source') || (feedUrl.includes('bbc') ? 'BBC News' : 'Google News');
      return {
        title,
        url: /^https?:\/\//i.test(link) ? link : undefined,
        category,
        source: source.slice(0, 60),
      };
    }).filter((item) => item.title);
  } catch {
    return [] as Array<{ title: string; url?: string; category: string; source: string }>;
  }
}

async function publicSignInContext(env: Env) {
  const config = await readPublicSignInConfig(env);
  const hourIndex = Math.floor(Date.now() / 3_600_000);
  const inspirations = [
    'Make the next useful action unmistakably clear.',
    'Good systems turn careful work into repeatable progress.',
    'Let today’s best decision create tomorrow’s momentum.',
    'Precision, service, and follow-through transform daily work.',
    'Connect the right information to the right action.',
  ];
  const motivations = [
    'Finish one meaningful task well, then build from there.',
    'Your consistent effort keeps the whole operation moving.',
    'Clear ownership today creates stronger results tomorrow.',
    'Small improvements become powerful when the team repeats them.',
    'Recognize progress, resolve the blocker, and move forward.',
  ];

  const sectorQuery = encodeURIComponent('(bakery OR printing OR automotive OR logistics OR property OR technology) Nigeria business');
  const nigeriaQuery = encodeURIComponent('Nigeria business economy technology');
  const [world, nigeria, sectors] = await Promise.all([
    liveHeadlines('https://feeds.bbci.co.uk/news/world/rss.xml', 'World'),
    liveHeadlines('https://news.google.com/rss/search?q=' + nigeriaQuery + '&hl=en-NG&gl=NG&ceid=NG:en', 'Nigeria'),
    liveHeadlines('https://news.google.com/rss/search?q=' + sectorQuery + '&hl=en-NG&gl=NG&ceid=NG:en', 'Industry'),
  ]);
  const news = [...world.slice(0, 2), ...nigeria.slice(0, 2), ...sectors.slice(0, 3)];
  const fallbackNews = [
    { title: 'Daenem secure services are live and ready.', category: 'Portal', source: 'Daenem' },
    { title: 'Global time and local weather are updating automatically.', category: 'Operations', source: 'Daenem' },
  ];

  return json({
    config,
    inspiration: config.content?.inspiration || inspirations[hourIndex % inspirations.length],
    motivation: config.content?.motivation || motivations[Math.floor(hourIndex / 6) % motivations.length],
    news: news.length ? news : fallbackNews,
    generatedAt: new Date().toISOString(),
    source: news.length ? 'live' : 'fallback',
  });
}

function allowedModules(context: SessionContext) {
  return Object.entries(context.permissions)
    .filter(([, level]) => level !== 'none')
    .map(([code]) => code.replace(/\.access$/, ''));
}

const guideModules = [
  { id: 'dashboard', title: 'Group Overview', permission: 'dashboard.access', setup: 'required', summary: 'See authorized workforce, attendance, approval and operational signals.', steps: ['Choose a company or Group view.', 'Review the live indicators.', 'Open the source module before acting on an alert.'] },
  { id: 'users', title: 'People & Approvals', permission: 'users.access', setup: 'required', summary: 'Review provisional signups and maintain authorized employee records.', steps: ['Open People & Payroll.', 'Review the employee identity and company.', 'Assign only the approved role and record the decision.'] },
  { id: 'roles', title: 'Roles & Access Control', permission: 'roles.access', setup: 'required', summary: 'Assign audited access levels, View Only overrides and temporary access expiry.', steps: ['Open Access Control.', 'Choose the employee or role.', 'Set the least access needed, add expiry where temporary, then save.'] },
  { id: 'attendance', title: 'Attendance & GPS', permission: 'attendance.access', setup: 'required', summary: 'Clock in and out under the assigned evidence and geofence policy.', steps: ['Allow location or photo evidence when policy requires it.', 'Clock in at the approved work location.', 'Clock out to complete the work day.'] },
  { id: 'forms', title: 'Forms Center', permission: 'forms.access', setup: 'optional', summary: 'Create, assign, submit or review forms according to access level.', steps: ['Choose a form template.', 'Select a valid audience and due date.', 'Publish or submit, then monitor completion.'] },
  { id: 'broadcasts', title: 'Broadcast Center', permission: 'broadcasts.access', setup: 'optional', summary: 'Send targeted notices, scheduled updates, Daily Word and emergency alerts.', steps: ['Choose company and audience.', 'Write the notice, schedule and expiry.', 'Submit for approval or publish when authorized.'] },
  { id: 'finance', title: 'Finance', permission: 'finance.access', setup: 'optional', summary: 'Work with authorized ledger, receivable, budget and reporting records.', steps: ['Choose the correct company.', 'Open the required transaction or report.', 'Follow approval and audit controls before posting.'] },
  { id: 'payroll', title: 'Payroll', permission: 'payroll.access', setup: 'optional', summary: 'Prepare, review, approve and record payroll at the assigned access level.', steps: ['Select company and pay period.', 'Resolve attendance and payroll exceptions.', 'Submit, approve or record only when your level permits.'] },
  { id: 'inventory', title: 'Inventory & Procurement', permission: 'inventory.access', setup: 'optional', summary: 'Manage authorized catalog, stock and movement workflows.', steps: ['Choose the company and stock location.', 'Record the source document and quantity.', 'Complete the required review or approval.'] },
  { id: 'facilities', title: 'Facilities', permission: 'facilities.access', setup: 'optional', summary: 'Track assets, utilities, work orders and maintenance evidence.', steps: ['Select the facility or asset.', 'Record the issue, priority and evidence.', 'Assign, complete and verify the work order.'] },
  { id: 'security', title: 'Security Center', permission: 'security.access', setup: 'required', summary: 'Investigate login, device, geofence and denied-access events.', steps: ['Review severity and identity.', 'Check the event evidence and audit trail.', 'Escalate or close according to security policy.'] },
  { id: 'tracking', title: 'Location Tracking', permission: 'tracking.access', setup: 'optional', summary: 'View or configure authorized mobile tracking under policy controls.', steps: ['Confirm the employee policy and consent basis.', 'Select the permitted tracking window.', 'Review only the location data your role allows.'] },
  { id: 'printing', title: 'Daenem Printing', permission: 'printing.access', setup: 'optional', summary: 'Follow printing quotations, jobs, production and delivery workflows.', steps: ['Open the customer job.', 'Update the authorized production stage.', 'Record completion and delivery evidence.'] },
  { id: 'bakery', title: 'Daenem Bakery', permission: 'bakery.access', setup: 'optional', summary: 'Manage bakery production, batches, stock and sales workflows.', steps: ['Select the production day or batch.', 'Record ingredients and output.', 'Complete authorized stock or sales actions.'] },
  { id: 'autos', title: 'Daenem Autos', permission: 'autos.access', setup: 'optional', summary: 'Manage vehicle inventory, enquiries, deals and documentation.', steps: ['Open the vehicle or customer record.', 'Update the authorized deal stage.', 'Attach evidence and complete approvals.'] },
  { id: 'logistics', title: 'Daenem Logistics', permission: 'logistics.access', setup: 'optional', summary: 'Plan dispatch, vehicles, drivers and proof of delivery.', steps: ['Open the shipment or trip.', 'Assign permitted vehicle and driver.', 'Record movement and delivery evidence.'] },
  { id: 'properties', title: 'Homes & Properties', permission: 'properties.access', setup: 'optional', summary: 'Manage property inventory, leads, inspections and transactions.', steps: ['Open the property or lead.', 'Schedule and record the next activity.', 'Complete the authorized approval or closing step.'] },
  { id: 'construction', title: 'Construction & Projects', permission: 'construction.access', setup: 'optional', summary: 'Track projects, milestones, cost control and site activity.', steps: ['Choose the project and work package.', 'Update progress, cost or site evidence.', 'Submit changes through the approval path.'] },
  { id: 'social', title: 'Daenem Social', permission: 'social.access', setup: 'optional', summary: 'Plan, approve and publish authorized brand content.', steps: ['Choose the company and connected channel.', 'Prepare content and schedule.', 'Complete approval before provider dispatch.'] },
] as const;

function permissionGuide(context: SessionContext) {
  return guideModules
    .filter((module) => hasPermission(context, module.permission, 'view'))
    .map((module) => ({ ...module, accessLevel: context.permissions[module.permission] || 'none' }));
}

async function aiGuideCatalog(context: SessionContext) {
  if (!hasPermission(context, 'ai_guide.access', 'view')) return json({ error: 'AI Guide access is not assigned to this employee.' }, 403);
  return json({
    employee: context.employee.displayName,
    roles: context.roles.map((role) => role.name),
    modules: permissionGuide(context),
    accessControlAvailable: hasPermission(context, 'roles.access', 'manage') || hasPermission(context, 'users.access', 'manage'),
    guidance: {
      required: 'Required items protect identity, access, attendance and security. Complete them before optional workflows.',
      optional: 'Optional modules appear only when your role includes them and should be configured for your assigned duties.',
    },
  });
}

async function aiHelp(request: Request, env: Env, context: SessionContext) {
  if (!hasPermission(context, 'ai_guide.access', 'view')) return json({ error: 'AI Guide access is not assigned to this employee.' }, 403);
  let payload: { question?: string };
  try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  const question = String(payload.question || '').trim();
  if (!question) return json({ error: 'A question is required.' }, 400);

  const roleText = context.roles.map((role) => role.name).join(', ') || 'Provisional Employee';
  const companyText = context.companies.map((company) => company.name).join(', ') || 'Daenem Group';
  const modules = allowedModules(context);
  const moduleAccess = permissionGuide(context).map((module) => `${module.title}: ${module.accessLevel}`);
  const system = [
    'You are the built-in Daenem Workforce Hub user guide.',
    'Explain only functions the requesting employee is authorized to access.',
    'Never tell an employee how to bypass permissions, geofencing, attendance evidence, approvals or audit controls.',
    'Never claim an action was completed unless the application API confirms it.',
    'Give concise step-by-step guidance and use Nigerian workplace context when useful.',
    'For Owner/Admin configuration, explain the operational and security impact before suggesting changes.',
    `Employee: ${context.employee.displayName}.`,
    `Role(s): ${roleText}.`,
    `Company access: ${companyText}.`,
    `Allowed modules: ${modules.join(', ') || 'onboarding only'}.`,
    `Effective access levels: ${moduleAccess.join('; ') || 'No module access assigned'}.`,
  ].join('\n');

  const answer = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
    max_tokens: 700,
  }) as { response?: string };

  await env.DB.prepare(`
    INSERT INTO ai_activity_logs (id, employee_id, company_id, feature, prompt_category, input_redacted, output_redacted)
    VALUES (?, ?, ?, 'user_guide', 'help', ?, ?)
  `).bind(
    `ai-${crypto.randomUUID()}`, context.employee.id, context.companies[0]?.id || null,
    question.slice(0, 500), String(answer.response || '').slice(0, 1200),
  ).run();

  return json({ answer: answer.response || 'The AI guide did not return an answer.' });
}

function nigeriaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function permittedCompanyIds(context: SessionContext, permission: string, minimum: AccessLevel = 'view') {
  return context.companies
    .filter((company) => hasPermission(context, permission, minimum, company.id))
    .map((company) => company.id);
}

function sqlList(values: string[]) {
  return values.map(() => '?').join(',');
}

function permittedDashboardCompanyIds(context: SessionContext, companyIds: string[], field: DashboardAggregateField) {
  return companyIds.filter((companyId) =>
    DASHBOARD_FIELD_PERMISSIONS[field].some((permission) => hasPermission(context, permission, 'view', companyId)),
  );
}

async function dashboardSummary(request: Request, env: Env, context: SessionContext) {
  const url = new URL(request.url);
  const requestedCompany = url.searchParams.get('companyId');
  const dashboardCompanyIds = permittedCompanyIds(context, 'dashboard.access');
  if (!dashboardCompanyIds.length) return json({ error: 'Dashboard access is not assigned.' }, 403);
  if (requestedCompany && !dashboardCompanyIds.includes(requestedCompany)) {
    return json({ error: 'Dashboard access is not assigned for this business.' }, 403);
  }
  const companyId = requestedCompany || null;
  const companyIds = companyId ? [companyId] : dashboardCompanyIds;
  const workDate = nigeriaDate();
  const result: Record<string, unknown> = { refreshedAt: new Date().toISOString(), workDate, companyId, scope: 'aggregate' };

  const employeeCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'employees');
  const attendanceCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'present');
  const incompleteCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'incompleteAttendance');
  const approvalCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'pendingApprovals');
  const securityCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'securityAlerts');
  const overdueCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'overdueRequirements');
  const facilitiesCompanyIds = permittedDashboardCompanyIds(context, companyIds, 'maintenanceAlerts');

  if (![employeeCompanyIds, attendanceCompanyIds, incompleteCompanyIds, approvalCompanyIds, securityCompanyIds, overdueCompanyIds, facilitiesCompanyIds].some((ids) => ids.length)) result.scope = 'personal';

  if (employeeCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(DISTINCT employee_id) AS count FROM employee_company_memberships WHERE active = 1 AND company_id IN (${sqlList(employeeCompanyIds)})`).bind(...employeeCompanyIds).first<{ count: number }>();
    result.employees = Number(row?.count || 0);
  }
  if (attendanceCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM attendance_days WHERE work_date = ? AND status = 'present' AND company_id IN (${sqlList(attendanceCompanyIds)})`).bind(workDate, ...attendanceCompanyIds).first<{ count: number }>();
    result.present = Number(row?.count || 0);
  }
  if (incompleteCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM attendance_days WHERE work_date = ? AND status = 'incomplete' AND company_id IN (${sqlList(incompleteCompanyIds)})`).bind(workDate, ...incompleteCompanyIds).first<{ count: number }>();
    result.incompleteAttendance = Number(row?.count || 0);
  }
  if (approvalCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM signup_requests WHERE status = 'pending' AND requested_company_id IN (${sqlList(approvalCompanyIds)})`).bind(...approvalCompanyIds).first<{ count: number }>();
    result.pendingApprovals = Number(row?.count || 0);
  }
  if (securityCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM security_logs WHERE reviewed_at IS NULL AND severity IN ('high','critical') AND company_id IN (${sqlList(securityCompanyIds)})`).bind(...securityCompanyIds).first<{ count: number }>();
    result.securityAlerts = Number(row?.count || 0);
  }
  if (overdueCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM requirement_completions WHERE status = 'overdue' AND company_id IN (${sqlList(overdueCompanyIds)})`).bind(...overdueCompanyIds).first<{ count: number }>();
    result.overdueRequirements = Number(row?.count || 0);
  }
  if (facilitiesCompanyIds.length) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM maintenance_work_orders WHERE status NOT IN ('completed','verified','cancelled') AND priority IN ('high','critical') AND company_id IN (${sqlList(facilitiesCompanyIds)})`).bind(...facilitiesCompanyIds).first<{ count: number }>();
    result.maintenanceAlerts = Number(row?.count || 0);
  }
  result.attendanceRule = attendanceCompanyIds.length || incompleteCompanyIds.length
    ? 'Present requires a policy-valid clock-in and clock-out. An incomplete day does not count as worked.'
    : 'Only aggregates covered by your current permissions are included.';
  return json(result);
}

async function recentSecurity(request: Request, env: Env, context: SessionContext) {
  const requestedCompanyId = new URL(request.url).searchParams.get('companyId');
  const allowedCompanyIds = permittedCompanyIds(context, 'security.access');
  if (!allowedCompanyIds.length) return json({ error: 'Security Center access is not assigned.' }, 403);
  if (requestedCompanyId && !allowedCompanyIds.includes(requestedCompanyId)) {
    return json({ error: 'Security Center access is not assigned for this business.' }, 403);
  }
  const companyIds = requestedCompanyId ? [requestedCompanyId] : allowedCompanyIds;
  const result = await env.DB.prepare(`
    SELECT sl.id, sl.occurred_at AS occurredAt, sl.event_type AS eventType, sl.severity,
           sl.result, sl.ip_address AS ipAddress, sl.location_label AS locationLabel,
           sl.risk_score AS riskScore, sl.details_json AS detailsJson,
           e.display_name AS employeeName, c.name AS companyName
    FROM security_logs sl
    LEFT JOIN employees e ON e.id = sl.employee_id
    LEFT JOIN companies c ON c.id = sl.company_id
    WHERE sl.company_id IN (${sqlList(companyIds)})
    ORDER BY sl.occurred_at DESC LIMIT 100
  `).bind(...companyIds).all<Record<string, unknown>>();
  return json({ events: result.results || [] });
}

async function rolesForCompany(request: Request, env: Env, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get('companyId');
  const allowedCompanyIds = context.companies
    .filter((company) => hasPermission(context, 'users.access', 'view', company.id) || hasPermission(context, 'roles.access', 'view', company.id))
    .map((company) => company.id);
  if (!allowedCompanyIds.length) return json({ error: 'User or Role administration permission is required.' }, 403);
  if (companyId && !allowedCompanyIds.includes(companyId)) return json({ error: 'Role administration is not assigned for this business.' }, 403);
  const companyIds = companyId ? [companyId] : allowedCompanyIds;
  const result = await env.DB.prepare(`SELECT id, code, name, company_id AS companyId FROM roles WHERE active = 1 AND (company_id IN (${sqlList(companyIds)}) OR company_id IS NULL) ORDER BY is_system DESC, name`).bind(...companyIds).all<Record<string, unknown>>();
  return json({ roles: result.results || [] });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        app: env.APP_NAME || 'Daenem Workforce Hub',
        stage: env.APP_STAGE || 'bootstrap',
        timezone: env.TIMEZONE || 'Africa/Lagos',
        version: '7.0.0-alpha.8',
      });
    }

    if (url.pathname === '/api/bootstrap') {
      return json({
        app: 'Daenem Workforce Hub',
        companies: ['printing', 'bakery', 'autos', 'logistics', 'properties'],
        permissionLevels: ['none', 'view', 'create', 'edit', 'approve', 'manage'],
        attendanceRule: 'A completed work day requires the policy-required clock-in and clock-out events.',
        auth: {
          selfSignup: true,
          oneTimeCode: true,
          loginLocationPolicy: true,
          productionCodeDeliveryConfigured: Boolean(env.AUTH_DELIVERY_URL),
        },
        features: {
          securityCenter: true, auditLogs: true, payroll: true, geofencing: true,
          backgroundTrackingPolicy: true, forms: true, broadcasts: true, aiGuide: true,
          facilities: true, offlineFirst: true,
        },
      });
    }

    if (url.pathname === '/api/context/signin/weather' && request.method === 'GET') return securityHeaders(await signInWeather(env, url.searchParams.get('city')));
    if (url.pathname === '/api/context/signin' && request.method === 'GET') return securityHeaders(await publicSignInContext(env));

    const authResponse = await routeAuth(request, env);
    if (authResponse) return securityHeaders(authResponse);

    if (url.pathname.startsWith('/api/')) {
      const context = await getSessionContext(request, env);
      if (!context) return securityHeaders(json({ error: 'Authentication required.' }, 401));
      if (url.pathname === '/api/context/postlogin' && request.method === 'GET') return securityHeaders(await postLoginContext(env));
      if (url.pathname === '/api/context/weather' && request.method === 'GET') return securityHeaders(await weather(request, env));
      if (url.pathname === '/api/ai/help' && request.method === 'POST') return securityHeaders(await aiHelp(request, env, context));
      if (url.pathname === '/api/ai/guide/catalog' && request.method === 'GET') return securityHeaders(await aiGuideCatalog(context));
      if (url.pathname === '/api/dashboard/summary' && request.method === 'GET') return securityHeaders(await dashboardSummary(request, env, context));
      if (url.pathname === '/api/security/recent' && request.method === 'GET') return securityHeaders(await recentSecurity(request, env, context));
      const incidentResponse = await routeIncidentResponse(request, env, context, _ctx);
      if (incidentResponse) return securityHeaders(incidentResponse);
      if (url.pathname === '/api/admin/roles' && request.method === 'GET') return securityHeaders(await rolesForCompany(request, env, context));
      return securityHeaders(json({ error: 'API route not found.' }, 404));
    }

    const workspaceResponse = await routeWorkspaceShell(request, env);
    if (workspaceResponse) return securityHeaders(workspaceResponse);

    const response = await env.ASSETS.fetch(request);
    return securityHeaders(response);
  },
} satisfies ExportedHandler<Env>;
