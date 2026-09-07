import fs from 'node:fs';

const files = {
  dashboard: 'src/canonical-postauth-v1/CanonicalDashboard.tsx',
  css: 'src/canonical-postauth-v1/canonical-dashboard.css',
  types: 'src/canonical-postauth-v1/canonical-types.ts',
  index: 'src/canonical-postauth-v1/index.ts',
  qa: 'scripts/render-canonical-postauth-qa.mjs',
};

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value); }
function must(condition, message) { if (!condition) throw new Error(message); }

let dashboard = read(files.dashboard);
let css = read(files.css);
let types = read(files.types);
let index = read(files.index);
let qa = read(files.qa);

if (!dashboard.includes("from './display-standards'")) {
  const anchor = "import { CANONICAL_LAYOUT_IDS, CANONICAL_LAYOUT_SPECS } from './layout-specs';";
  must(dashboard.includes(anchor), 'CanonicalDashboard layout-spec import anchor missing');
  dashboard = dashboard.replace(anchor, `${anchor}\nimport { formatPersonName, formatUiLabel, initialsFromPersonName } from './display-standards';`);
}

const topBarV2 = `function TopBar({ fixture, layoutId, onLayoutChange, onAskAi, onQuickCreate, onNotifications, onWorkspace, onSearch, onProfile }: { fixture: CanonicalFixture; layoutId: StaffPortalLayoutId; onLayoutChange: (id: StaffPortalLayoutId) => void; onAskAi?: () => void; onQuickCreate?: () => void; onNotifications?: () => void; onWorkspace?: () => void; onSearch?: (query?: string) => void; onProfile?: () => void }) {
  const [query, setQuery] = useState('');
  const weatherValue = fixture.weather.tempC === null ? 'Not Available' : \`\${fixture.weather.tempC}°C\`;
  return <header className="csp-topbar" data-canonical-topbar>
    <div className="csp-brand"><span className="csp-brand-mark">D</span><span><b>STAFFPORTAL.DAENEM.COM</b><small>People · Systems · A Stronger Tomorrow</small></span></div>
    <button type="button" className="csp-workspace" onClick={onWorkspace}><BriefcaseBusiness size={16}/><span><b>{fixture.workspace.name}</b><small>{fixture.workspace.subtitle}</small></span></button>
    <form className="csp-search" role="search" onSubmit={(event)=>{event.preventDefault();onSearch?.(query)}}><Search size={17}/><input aria-label="Search Staff Portal" placeholder="Search People, Documents, Projects, Anything..." value={query} onChange={(event)=>setQuery(event.target.value)}/><kbd>⌘ K</kbd></form>
    <div className="csp-top-actions">
      <button type="button" className="csp-ai" onClick={onAskAi}><Sparkles size={16}/> Ask Daenem AI</button>
      <button type="button" className="csp-create" onClick={onQuickCreate}><Plus size={16}/> Quick Create</button>
      <button type="button" className="csp-icon" aria-label="Notifications" onClick={onNotifications}><Bell size={17}/><i>3</i></button>
      <span className="csp-weather-chip"><CloudSun size={18}/><span><b>{weatherValue}</b><small>{fixture.weather.city}</small></span></span>
      <span className="csp-sync"><i/><span><b>{fixture.sync.label}</b><small>{fixture.sync.detail}</small></span></span>
      <span className="csp-release"><b>{fixture.release.version}</b><small>{fixture.release.label}</small></span>
      <label className="csp-layout-select"><Grid3X3 size={16}/><select aria-label="Dashboard Layout" value={layoutId} onChange={(e)=>onLayoutChange(e.target.value as StaffPortalLayoutId)}>{CANONICAL_LAYOUT_IDS.map((id)=><option key={id} value={id}>{CANONICAL_LAYOUT_SPECS[id].name}</option>)}</select></label>
      <button type="button" className="csp-profile" onClick={onProfile} aria-label={\`Open Profile For \${formatPersonName(fixture.viewer.displayName)}\`}><span className="csp-avatar">{initialsFromPersonName(fixture.viewer.displayName)}</span><span className="csp-profile-copy"><b>{formatPersonName(fixture.viewer.displayName)}</b><small>{formatUiLabel(fixture.viewer.role)}</small></span></button>
    </div>
  </header>;
}`;

if (!dashboard.includes('className="csp-profile"')) {
  const match = dashboard.match(/function TopBar\([\s\S]*?\n}\n\nfunction SideNav/);
  must(match, 'CanonicalDashboard TopBar block not found');
  dashboard = dashboard.replace(match[0], `${topBarV2}\n\nfunction SideNav`);
}

dashboard = dashboard.replaceAll('>{item.label}</span>', '>{formatUiLabel(item.label)}</span>');
dashboard = dashboard.replaceAll('${fixture.viewer.displayName}', '${formatPersonName(fixture.viewer.displayName)}');

if (types.includes('onSearch?: () => void;')) {
  types = types.replace('onSearch?: () => void;', 'onSearch?: (query?: string) => void;');
}

if (!index.includes("import './canonical-fonts';")) index = `import './canonical-fonts';\n\n${index}`;
if (!index.includes("export * from './display-standards';")) index = `${index.trimEnd()}\nexport * from './display-standards';\n`;

css = css.replace('--csp-font:"Inter","Segoe UI",Arial,sans-serif;', '--csp-font:"Inter Variable","Inter","Segoe UI",Arial,sans-serif;');
css = css.replace('--csp-heading:"Manrope","Segoe UI",Arial,sans-serif;', '--csp-heading:"Manrope Variable","Manrope","Segoe UI",Arial,sans-serif;');
css = css.replaceAll('font-size:8px', 'font-size:9px');
css = css.replace('font-size:11px;font-weight:700;gap:6px', 'font-size:12px;font-weight:700;gap:6px');
css = css.replace('font-size:11px;font-weight:650;text-align:left', 'font-size:12px;font-weight:650;text-align:left');
css = css.replace('font:800 12px var(--csp-heading)', 'font:800 14px/1.2 var(--csp-heading)');

const v2Block = `
/* V2 deterministic typography, fit, focus and copy-readability contract. */
.csp-root,.csp-root *{min-width:0}
.csp-root{font-synthesis:none;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
.csp-root button,.csp-root select,.csp-root input{letter-spacing:normal}
.csp-root button:focus-visible,.csp-root select:focus-visible,.csp-root input:focus-visible{outline:3px solid rgba(47,91,231,.34);outline-offset:2px}
.csp-root h1,.csp-root h2,.csp-root h3,.csp-root b,.csp-root strong{overflow-wrap:anywhere}
.csp-root small,.csp-root span,.csp-root p,.csp-root em{overflow-wrap:anywhere}
.csp-root button{min-height:36px}
@media (max-width:767px){.csp-root input,.csp-root textarea,.csp-root select{font-size:16px}.csp-layout-select select{font-size:11px}}
.csp-profile{height:42px!important;border:0!important;background:transparent!important;padding:0 2px!important;display:flex;align-items:center;gap:7px;color:var(--csp-ink);text-align:left}
.csp-profile-copy{display:grid;gap:1px;max-width:116px}
.csp-profile-copy b{font:800 10px/1.05 var(--csp-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.csp-profile-copy small{font:9px/1.1 var(--csp-font);color:var(--csp-muted)}
.csp-ai-footer{width:100%;min-height:38px;border:0;border-radius:11px;background:linear-gradient(135deg,rgba(90,82,216,.09),rgba(17,169,199,.08));color:var(--csp-indigo);display:flex;align-items:center;justify-content:space-between;padding:0 10px;font-size:10px;font-weight:800}
@media (max-width:1199px){.csp-profile-copy{display:none}.csp-profile{width:38px!important;padding:0!important;justify-content:center}}
@media (max-width:767px){.csp-profile{width:34px!important;height:34px!important}.csp-profile-copy{display:none}}
.csp-release{height:36px;min-width:48px;border:1px solid var(--csp-line);border-radius:10px;background:#f8fbff;display:grid;place-items:center;padding:4px 7px;line-height:1}
.csp-release b{font-size:10px;color:var(--csp-cobalt)}
.csp-release small{font-size:9px;color:var(--csp-muted)}
@media (max-width:1199px){.csp-release{display:none}}
`;
if (!css.includes('V2 deterministic typography, fit, focus and copy-readability contract.')) css = `${css.trimEnd()}\n${v2Block}`;

// The canonical Staff Portal QA harness must use Playwright's own installed Chromium.
// Never depend on a browser binary path from another Daenem application or a previous runtime.
qa = qa.replace(
  "  const browser = await chromium.launch({\n    executablePath: process.env.PLAYWRIGHT_CHROMIUM || '/tmp/daenem-webadmin-chromium-v2/chromium',\n    headless: true,",
  "  const browser = await chromium.launch({\n    headless: true,",
);
qa = qa.replace(
  "  const nodeOptions = [process.env.NODE_OPTIONS, '--require=/tmp/wrangler-os-network-shim.cjs'].filter(Boolean).join(' ');",
  "  const optionalWranglerShim = '/tmp/wrangler-os-network-shim.cjs';\n  const nodeOptions = [process.env.NODE_OPTIONS, fs.existsSync(optionalWranglerShim) ? `--require=${optionalWranglerShim}` : null].filter(Boolean).join(' ');",
);

must(dashboard.includes('formatPersonName(fixture.viewer.displayName)'), 'person-name display normalization not applied');
must(dashboard.includes('formatUiLabel(item.label)'), 'navigation label normalization not applied');
must(dashboard.includes('className="csp-profile"'), 'V2 profile presentation not applied');
must(!/font-size\s*:\s*8px\b/.test(css), '8px authored UI remains after V2 reconciliation');
must(css.includes('"Inter Variable"') && css.includes('"Manrope Variable"'), 'variable font tokens missing after reconciliation');
must(!qa.includes('daenem-webadmin'), 'foreign WebAdmin browser path remains in Staff Portal canonical QA');
must(!qa.includes("process.env.PLAYWRIGHT_CHROMIUM || '/tmp/"), 'canonical QA still has a hard-coded browser fallback');

write(files.dashboard, dashboard);
write(files.css, css);
write(files.types, types);
write(files.index, index);
write(files.qa, qa);

console.log('CANONICAL_V2_RECONCILE=PASS');
console.log('CANONICAL_STAFFPORTAL_QA_BROWSER=PASS');
