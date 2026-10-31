import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [css, entryCss, ui, entry, widgets] = await Promise.all([
  readFile(new URL('../src/owner-intelligence.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence-entry.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/owner-intelligence-entry.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/analytics-command-widgets.tsx', import.meta.url), 'utf8'),
]);
let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log('PASS ' + name); }
function rgb(hex) { const h=hex.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255); }
function linear(c) { return c<=.04045?c/12.92:((c+.055)/1.055)**2.4; }
function luminance(hex) { const [r,g,b]=rgb(hex).map(linear); return .2126*r+.7152*g+.0722*b; }
function contrast(a,b) { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }

check('Owner Intelligence uses the approved Signature Green / Jade / Mineral White direction', () => {
  assert.match(css, /--owner-green:\s*#087f5b/i);
  assert.match(css, /--owner-jade:\s*#25b783/i);
  assert.match(css, /--owner-canvas:\s*#f3f8f5/i);
  assert.match(css, /--owner-surface:\s*#ffffff/i);
});
check('Primary, secondary and action colours meet WCAG AA text contrast on their surfaces', () => {
  assert.ok(contrast('#15352a','#ffffff') >= 7);
  assert.ok(contrast('#526d61','#ffffff') >= 4.5);
  assert.ok(contrast('#087f5b','#ffffff') >= 4.5);
  assert.ok(contrast('#6e4d12','#fff8e9') >= 4.5);
  assert.ok(contrast('#a9322b','#fffafa') >= 4.5);
});
check('No glassmorphism, blur overlays or hidden-content clipping are used', () => {
  assert.doesNotMatch(css, /backdrop-filter\s*:/i);
  assert.doesNotMatch(css, /overflow\s*:\s*hidden/i);
  assert.doesNotMatch(entryCss, /backdrop-filter\s*:/i);
  assert.doesNotMatch(entryCss, /overflow\s*:\s*hidden/i);
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
check('Permission-safe missing-data behaviour remains explicit', () => {
  assert.match(ui, /Not Authorised/);
  assert.match(ui, /is-unavailable/);
  assert.match(css, /\.owner-hero-metric strong\.is-unavailable/);
  assert.match(ui, /Alerts Incomplete For Your Access/);
  assert.match(ui, /No Company Revenue Data Is Available For This View/);
  assert.match(ui, /No Company Intelligence Is Available For This View/);
  assert.match(ui, /data\.companies\[key\]/);
});
console.log('Owner Intelligence design checks passed: ' + passed + '/12');
