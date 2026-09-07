import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = process.cwd();
const qaDir = path.join(root, 'qa-artifacts', 'canonical-postauth-v1');
fs.mkdirSync(qaDir, { recursive: true });

const layouts = [
  'executive-command',
  'workspace-canvas',
  'operational-cockpit',
  'insight-magazine',
  'master-detail-workspace',
  'horizon-wide',
  'adaptive-bento',
  'focus-flow',
  'enterprise-studio',
  'board-pulse',
];

const layoutSpecSource = fs.readFileSync(path.join(root, 'src', 'canonical-postauth-v1', 'layout-specs.ts'), 'utf8');
const layoutSpecStart = layoutSpecSource.indexOf(' = ') + 3;
const layoutSpecEnd = layoutSpecSource.indexOf(';\n\nexport const CANONICAL_LAYOUT_IDS');
if (layoutSpecStart < 3 || layoutSpecEnd < 0) throw new Error('CANONICAL_LAYOUT_SPEC_PARSE_FAILED');
const parsedLayoutSpecs = JSON.parse(layoutSpecSource.slice(layoutSpecStart, layoutSpecEnd));
const layoutZones = Object.fromEntries(layouts.map((layout) => [layout, parsedLayoutSpecs[layout].zones]));

const coreViewports = [
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
  [768, 1024],
  [1024, 1366],
  [1366, 1024],
  [360, 800],
  [390, 844],
  [412, 915],
  [430, 932],
];
const executiveViewports = [];

const allCompanies = [
  { id: 'company-printing', code: 'PRINT', name: 'Printing & Technology', primary: true },
  { id: 'company-bakery', code: 'BAKERY', name: 'Bakery', primary: false },
  { id: 'company-autos', code: 'AUTOS', name: 'Daenem Autos', primary: false },
  { id: 'company-logistics', code: 'LOGISTICS', name: 'Logistics', primary: false },
  { id: 'company-properties', code: 'PROPERTIES', name: 'Homes & Properties', primary: false },
];

const ownerPermissions = {
  'dashboard.access': 'manage', 'users.access': 'manage', 'attendance.access': 'manage',
  'payroll.access': 'manage', 'payslips.access': 'manage', 'forms.access': 'manage',
  'facilities.access': 'manage', 'broadcasts.access': 'manage', 'security.access': 'manage',
  'ai_guide.access': 'manage', 'settings.access': 'manage', 'navigation.studio': 'manage',
  'audit.explorer': 'manage', 'diagnostics.access': 'manage', 'integrations.access': 'manage',
  'owner.intelligence': 'manage',
};

const fixtureContext = {
  sessionId: 'canonical-qa-session',
  employee: {
    id: 'canonical-qa-owner', employeeNo: 'QA-OWNER', displayName: 'Amina Daenem',
    email: 'owner.qa@example.invalid', jobTitle: 'Group Owner', department: 'Executive Office',
    status: 'active', preferredTheme: 'unified-daylight', team: 'Leadership',
    lastLoginAt: '2026-08-21T08:00:00.000Z',
  },
  companies: allCompanies,
  roles: [{ id: 'canonical-qa-owner-role', code: 'owner', name: 'Owner', companyId: 'company-printing' }],
  permissions: ownerPermissions,
  companyPermissions: Object.fromEntries(allCompanies.map((company) => [company.id, ownerPermissions])),
};

const summary = {
  workDate: '2026-08-21', refreshedAt: '2026-08-21T10:30:00.000Z', employees: 128, present: 116,
  incompleteAttendance: 4, pendingApprovals: 7, securityAlerts: 2, overdueRequirements: 5,
  maintenanceAlerts: 3, attendanceRule: 'Clock-in closes at 09:00 WAT',
};

function layoutPayload(layoutId) {
  const storedLayoutId = layoutId === 'master-detail-workspace' ? 'master-detail' : layoutId;
  return {
    preference: { layoutId: storedLayoutId, density: 'standard', motion: 'balanced' },
    canManage: true, canChoose: true, canAccess: true,
    ability: { canPreview: true, canChoose: true },
    policy: {
      organizationDefault: 'executive-command', forcedLayout: null, allowPersonalPreference: true,
      roleDefaults: { owner: 'executive-command', employee: 'focus-flow', manager: 'operational-cockpit' },
      erpDefaults: { staff: 'executive-command', printing: 'operational-cockpit', finance: 'horizon-wide', controls: 'enterprise-studio' },
    },
    history: [],
  };
}

function summaryForRole() {
  return { ...summary, scope: 'aggregate', companyId: null };
}

async function installApiRoutes(page, { authenticated, getLayoutId }) {
  // The source repository keeps its exact fallback font stack for offline and
  // weak-network use. Make the local baseline deterministic without relying
  // on the external font CDN.
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, contentType: 'font/woff2', body: '' }));
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(value),
    });
    if (url.pathname === '/api/auth/me') return json(authenticated ? { authenticated: true, context: fixtureContext } : { authenticated: false });
    if (url.pathname === '/api/auth/logout') return json({ ok: true });
    if (url.pathname === '/api/auth/password-policy') return json({ minimumLength: 10, maximumLength: 128, requiresUppercase: true, requiresLowercase: true, requiresNumber: true, requiresSymbol: true });
    if (url.pathname === '/api/context/signin') return json({ config: {}, inspiration: 'Waiting For Live Guidance.', motivation: 'Waiting For Live Guidance.', news: [], generatedAt: '2026-08-21T10:30:00.000Z', source: 'fallback' });
    const layoutId = getLayoutId();
    if (url.pathname === '/api/experience/layout' && request.method() === 'GET') return json(layoutPayload(layoutId));
    if (url.pathname === '/api/experience/layout/preference' && request.method() === 'POST') return json({ ok: true, preference: layoutPayload(layoutId).preference });
    if (url.pathname.startsWith('/api/experience/layout/')) return json({ ok: true });
    if (url.pathname === '/api/dashboard/summary') return json(summaryForRole());
    if (url.pathname === '/api/context/weather') return json({ location: 'Lagos', temperature: 29, description: 'Clear' });
    if (url.pathname === '/api/support/mine') return json({ commands: [], assistanceRequests: [] });
    if (request.method() === 'POST') return json({ ok: true });
    return json({});
  });
}

function startVite(port, { fixtureMode, baselineMode }) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const optionalWranglerShim = '/tmp/wrangler-os-network-shim.cjs';
  const nodeOptions = [process.env.NODE_OPTIONS, fs.existsSync(optionalWranglerShim) ? `--require=${optionalWranglerShim}` : null].filter(Boolean).join(' ');
  const child = spawn(command, ['run', 'dev', '--', '--config', 'vite.canonical-qa.config.ts', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      VITE_CANONICAL_QA_FIXTURE: fixtureMode ? 'true' : 'false',
      VITE_CANONICAL_BASELINE: baselineMode ? 'true' : 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += String(chunk); });
  child.stderr.on('data', (chunk) => { logs += String(chunk); });
  return { child, getLogs: () => logs };
}

async function waitForServer(port, server) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`Vite exited before becoming ready on ${port}.\n${server.getLogs()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling while Vite starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready on ${port}.\n${server.getLogs()}`);
}

function stopVite(server) {
  if (server?.child && server.child.exitCode === null) server.child.kill('SIGTERM');
}

async function freezeVisuals(page) {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addStyleTag({ content: '* { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
}

async function capturePage(page, url, screenshotPath, requestedLayout, kind, viewport) {
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const onPageError = (error) => pageErrors.push(String(error));
  const onConsole = (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const onRequestFailed = (request) => failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`);
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  await page.setViewportSize({ width: viewport[0], height: viewport[1] });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-canonical-staffportal-dashboard]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForFunction((expected) => document.querySelector('[data-canonical-staffportal-dashboard]')?.getAttribute('data-layout-id') === expected, requestedLayout, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  // SupportInbox polls once when the authenticated shell mounts. Wait for
  // that bounded API request to settle before tearing down the capture
  // listeners or navigating to the next viewport; otherwise Playwright can
  // report the intentional navigation cancellation as a runtime error.
  await page.waitForLoadState('networkidle');
  await freezeVisuals(page);
  await page.waitForTimeout(120);
  const metrics = await page.evaluate(({ requestedLayout: expectedLayout, kind: renderKind, viewport: [width, height], zones }) => {
    const root = document.querySelector('[data-canonical-staffportal-dashboard]');
    const rect = root?.getBoundingClientRect();
    const allZones = Array.from(document.querySelectorAll('[data-zone]')).map((node) => node.getAttribute('data-zone')).filter(Boolean);
    const missingZones = zones.filter((zone) => !allZones.includes(zone));
    const body = document.body;
    const documentElement = document.documentElement;
    const text = document.body.innerText || '';
    const select = document.querySelector('.csp-layout-select select');
    return {
      kind: renderKind,
      requestedLayout: expectedLayout,
      renderedLayout: root?.getAttribute('data-layout-id') || null,
      viewport: { width, height },
      rootWidth: rect ? Math.round(rect.width) : 0,
      rootHeight: rect ? Math.round(rect.height) : 0,
      scrollWidth: Math.max(body?.scrollWidth || 0, documentElement?.scrollWidth || 0),
      horizontalOverflow: Math.max(body?.scrollWidth || 0, documentElement?.scrollWidth || 0) > width + 1,
      missingZones,
      zoneCount: allZones.length,
      layoutOptionCount: select ? select.querySelectorAll('option').length : 0,
      fixtureSampleLeak: /S\$ 682,430|Singapore HQ|Q2 Town Hall Will Be Held/.test(text),
      visibleTopbar: Boolean(document.querySelector('[data-canonical-topbar]')),
      visibleSideNav: Boolean(document.querySelector('[data-canonical-sidebar]')),
      canonicalRoot: Boolean(root),
    };
  }, { requestedLayout, kind, viewport, zones: layoutZones[requestedLayout] });
  const v3Measurements = await page.evaluate(async ({ expectedLayout, expectedZones }) => {
  const root = document.querySelector('[data-canonical-staffportal-dashboard]');
  if (!root) throw new Error('CANONICAL_ROOT_MISSING');
  await document.fonts.load('500 13px "Inter Variable"');
  await document.fonts.load('800 18px "Manrope Variable"');
  await document.fonts.ready;
  const families = ['Inter Variable', 'Manrope Variable'];
  const faceList = [...document.fonts].map(f => ({family: f.family.replace(/["']/g, ''), status: f.status, weight: f.weight}));
  const fonts = Object.fromEntries(families.map(f => [f, {
    loadedFace: faceList.some(x => x.family === f && x.status === 'loaded'),
    check: document.fonts.check(`${f === 'Inter Variable' ? 500 : 800} 18px "${f}"`),
  }]));
  const round = n => Math.round(n * 100) / 100;
  const rect = e => {const b=e.getBoundingClientRect();return {x:round(b.x),y:round(b.y),width:round(b.width),height:round(b.height)};};
  const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
  const grid=root.querySelector('.csp-grid'), gridStyle=getComputedStyle(grid);
  const failures=[],metrics=[],smallText=[],touchTargets=[];
  if(root.getAttribute('data-layout-id') !== expectedLayout)failures.push('WRONG_LAYOUT');
  if(innerWidth >= 768 && gridStyle.gridTemplateAreas === 'none')failures.push('INVALID_NAMED_GRID');
  if(document.documentElement.scrollWidth > innerWidth+1)failures.push('PAGE_HORIZONTAL_OVERFLOW');
  for(const [family,state] of Object.entries(fonts))if(!state.loadedFace || !state.check)failures.push('FONT_NOT_PROVEN:'+family);
  const zones=expectedZones.map(zone=>{
    const nodes=[...root.querySelectorAll('[data-zone]')].filter(e=>e.getAttribute('data-zone') === zone && visible(e));
    if(nodes.length!==1)failures.push('ZONE_VISIBILITY:'+zone+':'+nodes.length);
    return {zone,count:nodes.length,box:nodes[0]?rect(nodes[0]):null};
  });
  for(const n of root.querySelectorAll('[data-canonical-metric],.csp-analytics-metric>strong')){
    if(!visible(n))continue;
    const text=(n.textContent||'').trim(),numeric=/\d/.test(text);
    const style=getComputedStyle(n),range=document.createRange();range.selectNodeContents(n);
    const textRect=range.getBoundingClientRect(),card=n.closest('article')||n.parentElement,cardRect=card.getBoundingClientRect();
    const rows=[...new Set([...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>Math.round(r.top)))];
    const clipped=textRect.left<cardRect.left-1||textRect.right>cardRect.right+1;
    if(numeric&&(rows.length>1||clipped))failures.push('METRIC_WRAP_OR_CLIP:'+text);
    metrics.push({text,numeric,rows:rows.length,clipped,fontSize:style.fontSize,fontFamily:style.fontFamily,box:rect(n)});
  }
  for(const e of root.querySelectorAll('b,strong,small,em,button,label,input,select,p')){
    if(!visible(e))continue;const style=getComputedStyle(e);
    if(parseFloat(style.fontSize)<9)smallText.push({text:(e.textContent||'').trim().slice(0,100),fontSize:style.fontSize});
  }
  if(smallText.length)failures.push('SUB_9PX_TEXT');
  for(const e of root.querySelectorAll('button,input:not([type=checkbox]),select')){
    if(!visible(e))continue;const b=rect(e);touchTargets.push({label:e.getAttribute('aria-label')||(e.textContent||'').trim().slice(0,50),...b});
  }
  const thin=touchTargets.filter(x=>x.width<24||x.height<24);
  // A target-size sample is evidence only; this is not a complete WCAG audit.
  const h1=root.querySelector('h1');
  return {layout:expectedLayout,failures,viewport:[innerWidth,innerHeight],fonts,faceList,grid:{display:gridStyle.display,areas:gridStyle.gridTemplateAreas,columns:gridStyle.gridTemplateColumns,rows:gridStyle.gridTemplateRows,gap:gridStyle.gap,box:rect(grid)},zones,metrics,smallText,touchTargets,sub24Targets:thin,heading:h1?{fontFamily:getComputedStyle(h1).fontFamily,fontSize:getComputedStyle(h1).fontSize,weight:getComputedStyle(h1).fontWeight,box:rect(h1)}:null,referenceRuntime:globalThis.__CSP_REFERENCE_RUNTIME__||null};
}, { expectedLayout: requestedLayout, expectedZones: layoutZones[requestedLayout] });
  metrics.v3Measurements = v3Measurements;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  page.off('pageerror', onPageError);
  page.off('console', onConsole);
  page.off('requestfailed', onRequestFailed);
  return { metrics, pageErrors, consoleErrors, failedRequests };
}

function aeMetric(first, second, extraArgs = []) {
  const result = spawnSync('compare', ['-metric', 'AE', ...extraArgs, first, second, 'null:'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const match = output.match(/(\d+)\s*(?:\n|$)/);
  return { exitCode: result.status, raw: output, pixels: match ? Number(match[1]) : null };
}

function compareImages(first, second) {
  const exact = aeMetric(first, second);
  const material = aeMetric(first, second, ['-fuzz', '0.5%']);
  return {
    exitCode: material.exitCode,
    raw: material.raw,
    differingPixels: material.pixels,
    exactDifferingPixels: exact.pixels,
    rasterTolerance: '0.5% (<=1 RGB step; geometry/color drift still fails)',
  };
}

function buildStructuralComparison() {
  const inputs = layouts.map((layout) => path.join(qaDir, `canonical-${layout}-1920x1080.png`));
  const output = path.join(qaDir, 'canonical-ten-layout-structural-comparison-1920x1080.png');
  execFileSync('montage', [...inputs, '-thumbnail', '520x300', '-tile', '2x5', '-geometry', '520x300+16+16', '-background', '#eef2f9', '-label', '%f', '-depth', '8', output], { stdio: 'ignore' });
  return output;
}

async function captureSignIn(baseUrl, browser, evidence) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await installApiRoutes(page, { authenticated: false, getLayoutId: () => 'executive-command' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="unified-signin-page"]').waitFor({ state: 'visible', timeout: 20_000 });
    await freezeVisuals(page);
    await page.waitForTimeout(120);
    const filename = `signin-regression-${width}x${height}.png`;
    await page.screenshot({ path: path.join(qaDir, filename), fullPage: false });
    evidence.push({ filename, viewport: `${width}x${height}` });
  }
  await context.close();
  return errors;
}

async function main() {
  const evidence = {
    generatedAt: new Date().toISOString(),
    canonical: [],
    runtime: [],
    liveAdapter: [],
    comparisons: [],
    signIn: [],
    errors: [],
  };
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote'],
  });
  const fixtureServer = startVite(4174, { fixtureMode: true, baselineMode: true });
  const liveServer = startVite(4175, { fixtureMode: false, baselineMode: false });
  try {
    await Promise.all([waitForServer(4174, fixtureServer), waitForServer(4175, liveServer)]);
    const fixtureContext = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
    const fixturePage = await fixtureContext.newPage();
    const sourcePage = await fixtureContext.newPage();
    let layoutState = 'executive-command';
    await installApiRoutes(fixturePage, { authenticated: true, getLayoutId: () => layoutState });
    await installApiRoutes(sourcePage, { authenticated: false, getLayoutId: () => 'executive-command' });

    for (const layout of layouts) {
      for (const [width, height] of coreViewports) {
        layoutState = layout;
        console.log(`QA ${layout} ${width}x${height}`);
        const sourcePath = path.join(qaDir, `canonical-${layout}-${width}x${height}.png`);
        const runtimePath = path.join(qaDir, `runtime-${layout}-${width}x${height}.png`);
        const sourceResult = await capturePage(sourcePage, `http://127.0.0.1:4174/__canonical_baseline?layout=${encodeURIComponent(layout)}`, sourcePath, layout, 'canonical-source', [width, height]);
        const runtimeResult = await capturePage(fixturePage, `http://127.0.0.1:4174/?canonicalLayout=${encodeURIComponent(layout)}`, runtimePath, layout, 'runtime-fixture', [width, height]);
        evidence.canonical.push({ filename: path.basename(sourcePath), ...sourceResult.metrics });
        evidence.runtime.push({ filename: path.basename(runtimePath), ...runtimeResult.metrics });
        evidence.errors.push(...sourceResult.pageErrors, ...sourceResult.consoleErrors, ...sourceResult.failedRequests, ...runtimeResult.pageErrors, ...runtimeResult.consoleErrors, ...runtimeResult.failedRequests);
        const comparison = compareImages(sourcePath, runtimePath);
        evidence.comparisons.push({ layout, viewport: `${width}x${height}`, source: path.basename(sourcePath), runtime: path.basename(runtimePath), ...comparison });
      }
      if (layout === 'executive-command') for (const [width, height] of executiveViewports) {
        layoutState = layout;
        console.log(`QA ${layout} ${width}x${height}`);
        const sourcePath = path.join(qaDir, `canonical-${layout}-${width}x${height}.png`);
        const runtimePath = path.join(qaDir, `runtime-${layout}-${width}x${height}.png`);
        const sourceResult = await capturePage(sourcePage, `http://127.0.0.1:4174/__canonical_baseline?layout=${encodeURIComponent(layout)}`, sourcePath, layout, 'canonical-source', [width, height]);
        const runtimeResult = await capturePage(fixturePage, `http://127.0.0.1:4174/?canonicalLayout=${encodeURIComponent(layout)}`, runtimePath, layout, 'runtime-fixture', [width, height]);
        evidence.canonical.push({ filename: path.basename(sourcePath), ...sourceResult.metrics });
        evidence.runtime.push({ filename: path.basename(runtimePath), ...runtimeResult.metrics });
        evidence.errors.push(...sourceResult.pageErrors, ...sourceResult.consoleErrors, ...sourceResult.failedRequests, ...runtimeResult.pageErrors, ...runtimeResult.consoleErrors, ...runtimeResult.failedRequests);
        const comparison = compareImages(sourcePath, runtimePath);
        evidence.comparisons.push({ layout, viewport: `${width}x${height}`, source: path.basename(sourcePath), runtime: path.basename(runtimePath), ...comparison });
      }
    }
    await fixtureContext.close();

    const liveContext = await browser.newContext({ deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
    const livePage = await liveContext.newPage();
    let liveLayoutState = 'executive-command';
    await installApiRoutes(livePage, { authenticated: true, getLayoutId: () => liveLayoutState });
    for (const layout of layouts) {
      for (const [width, height] of coreViewports) {
        liveLayoutState = layout;
        console.log(`LIVE ${layout} ${width}x${height}`);
        const filename = `live-${layout}-${width}x${height}.png`;
        const result = await capturePage(livePage, `http://127.0.0.1:4175/?canonicalLayout=${encodeURIComponent(layout)}`, path.join(qaDir, filename), layout, 'live-adapter', [width, height]);
        evidence.liveAdapter.push({ filename, ...result.metrics });
        evidence.errors.push(...result.pageErrors, ...result.consoleErrors, ...result.failedRequests);
      }
    }
    evidence.errors.push(...await captureSignIn('http://127.0.0.1:4175', browser, evidence.signIn));
    await liveContext.close();

    evidence.structuralComparison = path.basename(buildStructuralComparison());
    evidence.summary = {
      canonicalScreenshotCount: evidence.canonical.length,
      runtimeScreenshotCount: evidence.runtime.length,
      liveAdapterScreenshotCount: evidence.liveAdapter.length,
      comparisonCount: evidence.comparisons.length,
      materialPixelMismatchCount: evidence.comparisons.filter((item) => item.differingPixels !== 0).length,
      exactRasterDifferenceCount: evidence.comparisons.filter((item) => item.exactDifferingPixels !== 0).length,
      exactRasterDifferingPixels: evidence.comparisons.reduce((sum, item) => sum + (item.exactDifferingPixels || 0), 0),
      overflowCount: [...evidence.canonical, ...evidence.runtime, ...evidence.liveAdapter].filter((item) => item.horizontalOverflow).length,
      missingZoneCount: [...evidence.canonical, ...evidence.runtime, ...evidence.liveAdapter].filter((item) => item.missingZones.length > 0).length,
      liveFixtureSampleLeakCount: evidence.liveAdapter.filter((item) => item.fixtureSampleLeak).length,
      runtimeErrorCount: evidence.errors.length,
      v3MeasurementFailureCount: [...evidence.canonical, ...evidence.runtime, ...evidence.liveAdapter].reduce((sum, item) => sum + (item.v3Measurements?.failures?.length || 0), 0),
      v3MeasurementFailures: [...evidence.canonical, ...evidence.runtime, ...evidence.liveAdapter].flatMap((item) => (item.v3Measurements?.failures || []).map((failure) => ({ kind: item.kind, layout: item.requestedLayout, viewport: item.viewport, failure }))),
    };
    fs.writeFileSync(path.join(qaDir, 'comparison.json'), JSON.stringify(evidence, null, 2) + '\n');
    fs.writeFileSync(path.join(qaDir, 'validation-summary.txt'), [
      'CANONICAL_POSTAUTH_QA=PASS',
      `CANONICAL_SCREENSHOTS=${evidence.summary.canonicalScreenshotCount}`,
      `RUNTIME_SCREENSHOTS=${evidence.summary.runtimeScreenshotCount}`,
      `LIVE_ADAPTER_SCREENSHOTS=${evidence.summary.liveAdapterScreenshotCount}`,
      `SOURCE_RUNTIME_COMPARISONS=${evidence.summary.comparisonCount}`,
      `MATERIAL_PIXEL_MISMATCH_COMPARISONS=${evidence.summary.materialPixelMismatchCount}`,
      `EXACT_RASTER_DIFFERENCE_COMPARISONS=${evidence.summary.exactRasterDifferenceCount}`,
      `EXACT_RASTER_DIFFERING_PIXELS=${evidence.summary.exactRasterDifferingPixels}`,
      `HORIZONTAL_OVERFLOW_COUNT=${evidence.summary.overflowCount}`,
      `MISSING_ZONE_COUNT=${evidence.summary.missingZoneCount}`,
      `LIVE_FIXTURE_SAMPLE_LEAK_COUNT=${evidence.summary.liveFixtureSampleLeakCount}`,
      `RUNTIME_ERROR_COUNT=${evidence.summary.runtimeErrorCount}`,
      `V3_MEASUREMENT_FAILURE_COUNT=${evidence.summary.v3MeasurementFailureCount}`,
      ...evidence.summary.v3MeasurementFailures.map((item) => `V3_FAILURE ${item.kind} ${item.layout} ${item.viewport.width}x${item.viewport.height} ${item.failure}`),
      `STRUCTURAL_COMPARISON=${evidence.structuralComparison}`,
      ...evidence.comparisons.map((item) => `DIFF ${item.layout} ${item.viewport} material=${item.differingPixels} exact=${item.exactDifferingPixels} pixels`),
    ].join('\n') + '\n');
    if (evidence.summary.materialPixelMismatchCount || evidence.summary.overflowCount || evidence.summary.missingZoneCount || evidence.summary.liveFixtureSampleLeakCount || evidence.summary.runtimeErrorCount || evidence.summary.v3MeasurementFailureCount) {
      throw new Error(`Canonical QA failed. See ${path.join(qaDir, 'comparison.json')}`);
    }
    console.log(fs.readFileSync(path.join(qaDir, 'validation-summary.txt'), 'utf8'));
  } finally {
    stopVite(fixtureServer);
    stopVite(liveServer);
    await Promise.race([
      browser.close().catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    setTimeout(() => process.exit(process.exitCode || 0), 2_500);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
