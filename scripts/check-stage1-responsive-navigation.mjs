import fs from 'node:fs';
import assert from 'node:assert/strict';

const portal=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../src/enterprise-command-center-navigation.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/enterprise-command-center-navigation.css',import.meta.url),'utf8');
const stage1Css=fs.readFileSync(new URL('../src/stage1-responsive-navigation.css',import.meta.url),'utf8');

const checks=[
 ['mobile bottom nav retains explicit primary landmark',portal.includes('aria-label="Mobile primary navigation"')],
 ['mobile More control owns responsive navigation sheet',portal.includes('aria-controls="responsive-navigation-sheet"')&&portal.includes('aria-expanded={mobile}')],
 ['navigation sheet restores focus on close',portal.includes('onCloseAutoFocus')&&portal.includes('restoreMobileNavigationFocus()')],
 ['desktop disclosure controls expose expanded state and controls relation',nav.includes('aria-expanded={expanded}')&&nav.includes('aria-controls={panelId}')],
 ['route change reconciles top-level expansion intelligently',nav.includes('reconcileCommandExpansion')&&nav.includes('routeChanged')],
 ['collapsed desktop rail is recoverable by activation',nav.includes('activateRail')&&nav.includes('onExpand()')],
 ['tablet switches ECC to productivity rail',css.includes('@media (min-width: 768px) and (max-width: 1024px)')&&css.includes('.ecc-rail { display: block; }')],
 ['mobile sheet restores full navigation and hides rail',css.includes('@media (max-width: 767px)')&&css.includes('.ecc-full { display: flex; }')&&css.includes('.ecc-rail { display: none; }')],
 ['touch targets are enlarged for coarse pointers',css.includes('(pointer: coarse)')&&css.includes('min-height: 3rem')],
 ['Stage 1 runtime imports responsive navigation acceptance layer',runtime.includes("import './stage1-responsive-navigation.css';")],
 ['tablet navigation trigger is at least 44 CSS pixels',stage1Css.includes('width: 2.75rem')&&stage1Css.includes('min-height: 2.75rem')],
 ['mobile primary labels stay single-line and touch targets remain at least 48px high',stage1Css.includes('.p-mobile-bottom-nav > button')&&stage1Css.includes('min-height: 3rem')&&stage1Css.includes('white-space: nowrap')],
 ['keyboard focus remains visible',css.includes(':focus-visible')&&css.includes('outline: 2px solid var(--ecc-teal-soft)')],
 ['reduced motion and forced colours remain supported',css.includes('@media (prefers-reduced-motion: reduce)')&&css.includes('@media (forced-colors: active)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 responsive navigation checks passed: '+checks.length+'/'+checks.length+'.');
