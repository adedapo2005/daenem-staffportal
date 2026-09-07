import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function must(condition, message) { if (!condition) throw new Error(message); }

const dashboard = read('src/canonical-postauth-v1/CanonicalDashboard.tsx');
const css = read('src/canonical-postauth-v1/canonical-dashboard.css');
const types = read('src/canonical-postauth-v1/canonical-types.ts');
const index = read('src/canonical-postauth-v1/index.ts');
const fonts = read('src/canonical-postauth-v1/canonical-fonts.ts');
const standards = read('src/canonical-postauth-v1/display-standards.ts');
const pkg = JSON.parse(read('package.json'));

must(standards.includes('formatPersonName') && standards.includes('formatUiLabel') && standards.includes('initialsFromPersonName'), 'display standards incomplete');
must(dashboard.includes("from './display-standards'"), 'CanonicalDashboard display standards import missing');
must(dashboard.includes('formatPersonName(fixture.viewer.displayName)'), 'person-name normalization missing');
must(dashboard.includes('formatUiLabel(item.label)'), 'authored navigation label normalization missing');
must(dashboard.includes('className="csp-profile"'), 'profile name/role presentation missing');
must(dashboard.includes('className="csp-release"'), 'release badge missing');
must(types.includes('onSearch?: (query?: string) => void;'), 'search interaction contract missing');
must(index.includes("import './canonical-fonts';"), 'canonical font import missing');
must(index.includes("export * from './display-standards';"), 'display standards export missing');
must(fonts.includes('@fontsource-variable/inter/wght.css') && fonts.includes('@fontsource-variable/manrope/wght.css'), 'font CSS imports missing');
must(pkg.dependencies?.['@fontsource-variable/inter'] === '5.3.0', 'Inter must be exact 5.3.0');
must(pkg.dependencies?.['@fontsource-variable/manrope'] === '5.3.0', 'Manrope must be exact 5.3.0');
must(css.includes('"Inter Variable"') && css.includes('"Manrope Variable"'), 'variable font stacks missing');
must(!/font-size\s*:\s*8px\b/.test(css), 'authored 8px UI remains');
must(css.includes(':focus-visible') && css.includes('outline:3px solid rgba(47,91,231,.34)'), 'focus-visible contract missing');
must(css.includes('overflow-wrap:anywhere'), 'overflow protection missing');
must(css.includes('.csp-root input,.csp-root textarea,.csp-root select{font-size:16px}'), 'mobile 16px interactive text protection missing');

console.log('CANONICAL_V2_DISPLAY=PASS');
console.log('CANONICAL_V2_TYPOGRAPHY=PASS');
console.log('CANONICAL_V2_FONTS=PASS');
console.log('CANONICAL_V2_INTERACTIONS=PASS');
