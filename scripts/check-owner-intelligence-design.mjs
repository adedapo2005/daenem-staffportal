import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, entryCss, ui, entry, widgets, stage1Palette, chartWidgets] = await Promise.all([
  readFile(new URL('../src/owner-intelligence.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence-entry.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence-entry.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/analytics-command-widgets.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/staffportal-stage1-palette.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/analytics-command-widgets.css', import.meta.url), 'utf8'),
]);
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log('PASS ' + name); }
function rgb(hex) { const h=hex.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255); }
function linear(c) { return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; }
function luminance(hex) { const [r,g,b]=rgb(hex).map(linear); return .2126*r+.7152*g+.0722*b; }
function contrast(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

check('Owner Intelligence uses the approved StaffPortal Ocean Sapphire / Azure Prestige foundation', () => {
  assert.match(stage1Palette, /--stage1-anchor: #173a63;/);
  assert.match(stage1Palette, /--stage1-primary: #2563eb;/);
  assert.match(stage1Palette, /--stage1-accent: #06b6d4;/);
  assert.match(css, /--owner-anchor: #173a63;/);
  assert.match(css, /--owner-primary: #2563eb;/);
  assert.match(css, /--owner-accent: #06b6d4;/);
  assert.match(css, /--owner-canvas: #f1f5f9;/);
  assert.doesNotMatch(css+entryCss, /#087f5b|#25b783|#eaf6ef|#f3f8f5/i);
});
check('Supporting violet, cyan, coral and gold accents enrich analytics without replacing the brand', () => {
  assert.match(stage1Palette, /--stage1-support-violet:/);
  assert.match(stage1Palette, /--stage1-support-coral:/);
  assert.match(stage1Palette, /--stage1-support-gold:/);
  assert.match(stage1Palette, /--stage1-gradient-spectrum:/);
  assert.match(css, /--owner-brand-gradient:[^;]*var\(--owner-violet\)/);
  assert.match(css, /company-intel-bakery \{ --company-accent: var\(--owner-gold\); \}/);
  assert.match(css, /company-intel-autos \{ --company-accent: var\(--owner-violet\); \}/);
  assert.match(css, /company-intel-properties \{ --company-accent: var\(--owner-coral\); \}/);
  assert.match(css, /\.ai-panel \.owner-panel-head > svg \{ color: var\(--owner-violet\); \}/);
});
check('Primary, secondary and action colours meet WCAG AA text contrast on their surfaces', () => {
  assert.ok(contrast('#1f2b3c','#ffffff') >= 7);
  assert.ok(contrast('#526578','#ffffff') >= 4.5);
  assert.ok(contrast('#2563eb','#ffffff') >= 4.5);
  assert.ok(contrast('#80510f','#fff8e9') >= 4.5);
  assert.ok(contrast('#b83b4b','#fffafa') >= 4.5);
  assert.ok(contrast('#126b4d','#ffffff') >= 4.5);
});
check('No glassmorphism, blur overlays or hidden-content clipping are used', () => {
  assert.doesNotMatch(css, /backdrop-filter\s*:/i);
  assert.doesNotMatch(css, /overflow\s*:\s*hidden/i);
  assert.doesNotMatch(entryCss, /backdrop-filter\s*:/i);
  assert.doesNotMatch(entryCss, /overflow\s*:\s*hidden/i);
  assert.doesNotMatch(chartWidgets, /overflow\s*:\s*hidden/i);
});
check('Owner Intelligence uses readable minimum 13px text, including compact layouts', () => {
  assert.match(css, /font-size:\s*13px/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[0-2])px/);
  assert.doesNotMatch(entryCss, /font-size:\s*(?:[0-9]|1[0-2])px/);
});
check('Group revenue has a bespoke executive hero above the company mix', () => {
  assert.match(ui, /className="owner-hero-metric"/);
  assert.match(ui, /<small>Group Revenue<\/small>/);
  assert.match(css, /\.revenue-panel\s*\{/);
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
});
check('Executive revenue and action summary precede supporting indicators', () => {
  assert.match(css, /\.owner-grid\.top\s*\{\s*order:\s*-1/);
  assert.match(css, /\.owner-content\s*\{[\s\S]*display:\s*flex/);
});
check('4K receives a dedicated wide-layout and type scale', () => {
  assert.match(css, /@media\s*\(min-width:\s*3000px\)/);
  assert.match(css, /width:\s*min\(3000px/);
  assert.match(css, /font-size:\s*30px/);
});
check('Tablet and mobile breakpoints reflow cards without horizontal overflow rules', () => {
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*620px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
});
check('Modal semantics, focus management, Escape close and focus restoration are present', () => {
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /aria-labelledby=/);
  assert.match(ui, /aria-describedby=/);
  assert.match(ui, /event\.key==='Escape'/);
  assert.match(ui, /previous\?\.focus\(\)/);
  assert.match(ui, /aria-live="polite"/);
});
check('Owner launcher has an accessible dialog action and keyboard focus treatment', () => {
  assert.match(entry, /aria-haspopup="dialog"/);
  assert.match(entry, /aria-label="Open Owner Intelligence"/);
  assert.match(entryCss, /:focus-visible/);
});
check('Shared analytics labels use readable Title Case', () => {
  assert.match(widgets, /Live Operating Signals/);
  assert.match(widgets, /Performance Movement/);
  assert.doesNotMatch(widgets, /LIVE OPERATING SIGNALS|PERFORMANCE MOVEMENT/);
});
check('Company cards use restrained business-specific complementary accents', () => {
  assert.match(ui, /company-intel-card company-intel-/);
  assert.match(css, /company-intel-printing \{ --company-accent: var\(--owner-primary\); \}/);
  assert.match(css, /company-intel-bakery \{ --company-accent: var\(--owner-gold\); \}/);
  assert.match(css, /company-intel-autos \{ --company-accent: var\(--owner-violet\); \}/);
  assert.match(css, /company-intel-logistics \{ --company-accent: var\(--owner-accent\); \}/);
  assert.match(css, /company-intel-properties \{ --company-accent: var\(--owner-coral\); \}/);
  assert.match(css, /owner-kpis article:nth-child\(5\) \{ --kpi-accent: var\(--owner-coral\); \}/);
  assert.match(css, /\.owner-kpis \.owner-kpi-icon \{ color: var\(--kpi-accent, var\(--owner-primary\)\); \}/);
});
check('Analytics charts use the StaffPortal blue/cyan spectrum and semantic status colours', () => {
  assert.match(widgets, /fill="#94a3b8"/);
  assert.match(widgets, /fill="#2563eb"/);
  assert.match(widgets, /tick=\{\{fontSize:13\}\}/);
  assert.match(chartWidgets, /\.acw-panel-head span\{font-size:13px/);
  assert.match(chartWidgets, /\.acw-panel-head p\{font-size:13px/);
  assert.match(chartWidgets, /\.acw-change span\{font-size:13px/);
  assert.match(chartWidgets, /\.acw-signal span\{font-size:13px/);
  assert.doesNotMatch(chartWidgets, /font-size:(?:[0-9]|1[0-2])px/);
  assert.match(chartWidgets, /state-attention:before\{background:#f59e0b\}/);
  assert.match(chartWidgets, /state-critical:before\{background:#b83b4b\}/);
  assert.match(chartWidgets, /state-healthy:before\{background:#126b4d\}/);
});
check('Company cards and revenue bars fail closed outside the response company scope', () => {
  assert.ok(ui.includes('function scopedCompany(data:Intelligence|undefined,key:CompanyKey)'));
  assert.ok(ui.includes('data?.scope?.companyIds?.includes(`company-${key}`)'));
  assert.ok(ui.includes('scopedCompany(data,key)!==undefined'));
  assert.ok(ui.includes('const c=scopedCompany(data,key)'));
});
check('Permission-safe missing-data behaviour remains explicit', () => {
  assert.match(ui, /Not Authorised/);
  assert.match(ui, /is-unavailable/);
  assert.match(css, /\.owner-hero-metric strong\.is-unavailable/);
  assert.match(ui, /Alerts Incomplete For Your Access/);
  assert.match(ui, /No Company Revenue Data Is Available For This View/);
  assert.match(ui, /No Company Intelligence Is Available For This View/);
  assert.match(ui, /data\.companies\[key\]/);
});
console.log('Owner Intelligence design checks passed: ' + passed + '/16');
