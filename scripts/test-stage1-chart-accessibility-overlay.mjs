import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stage1ChartAccessibilityOverlay } from './lib/stage1-chart-accessibility-overlay.mjs';

const analyticsPath = fileURLToPath(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/analytics.tsx', import.meta.url));
const source = readFileSync(analyticsPath, 'utf8');
const overlay = stage1ChartAccessibilityOverlay();

assert.equal(source.includes('rootTabIndex={-1}'), false, 'protected V115 export must remain byte-pinned');
const transformed = overlay.transform(source, analyticsPath);
assert.equal(typeof transformed, 'string');
assert.equal((transformed.match(/rootTabIndex=\{-1\}/g) || []).length, 1);
assert.match(transformed, /<PieChart accessibilityLayer=\{false\}>[\s\S]*?<Pie[\s\S]*?data=\{visible\}[\s\S]*?rootTabIndex=\{-1\}[\s\S]*?dataKey="value"/);
assert.equal(overlay.transform(source, analyticsPath + '.other'), null);
assert.throws(
  () => overlay.transform(source.replace('                dataKey="value"', '                dataKey="amount"'), analyticsPath),
  /expected one protected Pie data anchor/,
);

console.log('STAGE1_CHART_ACCESSIBILITY_OVERLAY_PASS');
