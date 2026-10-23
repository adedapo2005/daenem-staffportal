import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

// This contract protects the intentional, nonglass 32-inch/4K large-text
// reflow without changing the V115 master or layouts below 3200px.
const css=postcss.parse(readFileSync(new URL('../src/stage1-large-text-reflow.css',import.meta.url),'utf8'));
const media=css.nodes.filter(node=>node.type==='atrule'&&node.name==='media'&&node.params.trim()==='(min-width: 3200px)');
assert.equal(media.length,1,'Expect exactly one Stage One >=3200px reflow');
const scope=media[0];
const selector=(suffix)=>{
  const matches=scope.nodes.filter(node=>node.type==='rule'&&node.selector.trim().endsWith(suffix));
  assert.equal(matches.length,1,'Expect one '+suffix+' selector');
  assert.match(matches[0].selector,/data-staffportal-postlogin="true"/);
  assert.match(matches[0].selector,/data-large-text="true"/);
  return matches[0];
};
const value=(suffix,prop)=>{
  const hits=selector(suffix).nodes.filter(node=>node.type==='decl'&&node.prop===prop);
  assert.equal(hits.length,1,suffix+' '+prop+' must be defined once');
  return hits[0].value;
};
assert.equal(value('.p-app > .p-sidebar','width'),'clamp(416px, 12vw, 472px)');
assert.equal(value('.p-app > .p-main','margin-left'),'clamp(416px, 12vw, 472px)');
assert.equal(value('.p-topbar','grid-template-rows'),'auto');
assert.ok(value('.p-topbar','grid-template-columns').includes('minmax(650px, 1fr)'));
assert.equal(value('.p-topbar-leading','grid-column'),'1');
assert.equal(value('.p-topbar-leading','grid-row'),'1');
assert.equal(value('.p-topbar-command-zone','grid-column'),'2');
assert.equal(value('.p-topbar-command-zone','grid-row'),'1');
assert.equal(value('.p-topbar-utilities','grid-column'),'3');
assert.equal(value('.p-topbar-utilities','grid-row'),'1');
assert.equal(value('.p-topbar-utilities','flex-wrap'),'nowrap');
assert.equal(value('.p-topbar-command-zone .p-command-button','width'),'min(100%, 1460px)');
assert.equal(scope.toString().includes('backdrop-filter'),false,'No glass or backdrop blur');
console.log('STAGE1_4K_SHELL_CONTRACT=PASS');
