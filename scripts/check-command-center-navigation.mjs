import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the actual TS module registry and React markup, without a Worker,
// authentication bypass, browser session, network listener, or synthetic route.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ configFile: false, root, logLevel: 'error', optimizeDeps: { noDiscovery: true, entries: [] }, server: { middlewareMode: true }, appType: 'custom' });
const source = '/source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/';
let passed = 0;
const check = (name, run) => { run(); passed += 1; console.log(`PASS ${name}`); };

try {
  const canonical = await server.ssrLoadModule(`${source}model.ts`);
  const adapter = await server.ssrLoadModule(`${source}navigation-adapter.ts`);
  const fixtures = await server.ssrLoadModule(`${source}security-contract.ts`);
  const nav = await server.ssrLoadModule('/src/enterprise-command-center-model.ts');
  const { EnterpriseCommandCenterNavigation } = await server.ssrLoadModule('/src/enterprise-command-center-navigation.tsx');
  const optionsFor = (session) => ({
    session,
    canView: canonical.canView,
    contextVisible: (entry) => entry.id === 'experience'
      ? adapter.canViewStudioNavigationItem('Home', session)
      : entry.id === 'cloud-storage'
        ? canonical.canAct(canonical.byId('admin'), session, 'manage')
        : canonical.canView(canonical.byId(entry.permissionModuleId), session),
  });

  for (const profile of fixtures.testProfiles) {
    check(`canonical reachability and access boundaries: ${profile}`, () => {
      const options = optionsFor(fixtures.sessionForProfile(profile));
      const pages = nav.flattenCommandNavigation(nav.buildEnterpriseCommandNavigation(options));
      assert.equal(new Set(pages.map((page) => page.id)).size, pages.length, 'duplicate page identity');
      for (const definition of canonical.modules) {
        const expected = canonical.canView(definition, options.session)
          && (definition.id !== 'signin-design' || adapter.canViewStudioNavigationItem('Home', options.session));
        const reachable = pages.filter((page) => page.moduleId === definition.id && page.route === definition.canonicalPath);
        assert.equal(reachable.length, expected ? 1 : 0, `${profile}: ${definition.id} canonical route`);
      }
      for (const page of pages) {
        assert.ok(page.route.startsWith('/') && !page.route.includes('#'), 'canonical local route required');
        assert.ok(page.context ? options.contextVisible(page.context) : canonical.canView(canonical.byId(page.permissionModuleId), options.session), `unauthorized page: ${page.id}`);
      }
      for (const area of adapter.GLOBAL_NAVIGATION) for (const entry of area.context) {
        if (options.contextVisible(entry)) assert.ok(pages.some((page) => page.context?.id === entry.id && page.globalId === area.id && page.route === entry.route), `lost original context: ${entry.id}`);
      }
    });
  }

  const owner = fixtures.sessionForProfile('Owner');
  const ownerOptions = optionsFor(owner);
  const areas = nav.buildEnterpriseCommandNavigation(ownerOptions);
  const pages = nav.flattenCommandNavigation(areas);

  check('Construction keeps its five approved sections and every existing route', () => {
    const construction = areas.find((area) => area.globalId === 'businesses').children.find((group) => group.id === 'area:businesses/construction');
    assert.deepEqual(construction.children.map((group) => group.label), ['Dashboard', 'Projects', 'Costs & Payments', 'People & Suppliers', 'Reconciliation & Alerts']);
    const expected = canonical.modules.filter((module) => module.family === 'Construction & Capital Projects').map((module) => module.id).sort();
    assert.deepEqual(nav.flattenCommandNavigation(construction.children).map((page) => page.moduleId).sort(), expected);
    assert.equal(nav.resolveGlobalNavigationOwner('construction-contracts').id, 'businesses');
    assert.deepEqual(nav.commandAncestorIds(areas, (page) => page.moduleId === 'construction-contracts'), ['area:businesses', 'area:businesses/construction', 'area:businesses/construction/costs-payments']);
    assert.equal(nav.resolveGlobalNavigationOwner('not-a-registered-module'), undefined);
  });

  check('a deep-only grant has a reachable destination without exposing its denied parent', () => {
    const options = { session: owner, canView: (module) => module?.id === 'construction-contracts', contextVisible: () => false };
    const projected = nav.buildEnterpriseCommandNavigation(options);
    assert.equal(projected.length, 1);
    assert.equal(projected[0].globalId, 'businesses');
    assert.deepEqual(nav.flattenCommandNavigation(projected).map((page) => page.moduleId), ['construction-contracts']);
    const destination = nav.commandAreaDestination(projected[0], () => ({ route: '/bakery' }));
    assert.equal(destination.route, canonical.byId('construction-contracts').canonicalPath);
    assert.equal(destination.capabilityModuleId, 'construction-contracts');
  });

  check('revoked modules disappear from hierarchy and search', () => {
    const revoked = { ...owner, overrides: { ...owner.overrides, 'construction-contracts': 'No Access' } };
    const projected = nav.flattenCommandNavigation(nav.buildEnterpriseCommandNavigation(optionsFor(revoked)));
    assert.ok(!projected.some((page) => page.moduleId === 'construction-contracts'));
    assert.ok(!nav.searchCommandNavigation(projected, 'construction contracts').some((page) => page.moduleId === 'construction-contracts'));
  });

  check('route changes close the previous workspace while preserving nested disclosure memory', () => {
    const remembered = {
      'area:businesses': true,
      'area:businesses/construction': true,
      'area:businesses/construction/costs-payments': false,
      'area:people': true,
      favorites: false,
    };
    const next = nav.reconcileCommandExpansion(
      remembered,
      ['area:businesses', 'area:people', 'area:finance'],
      ['area:finance', 'area:finance/accounting'],
      true,
    );
    assert.equal(next['area:businesses'], false);
    assert.equal(next['area:people'], false);
    assert.equal(next['area:finance'], true);
    assert.equal(next['area:finance/accounting'], true);
    assert.equal(next['area:businesses/construction'], true, 'nested state is restored when the user returns');
    assert.equal(next['area:businesses/construction/costs-payments'], false, 'explicit nested collapse is retained');
    assert.equal(next.favorites, false, 'shortcut disclosure state is not treated as a workspace');

    const sameRoute = nav.reconcileCommandExpansion(
      { 'area:businesses': true, 'area:finance': false },
      ['area:businesses', 'area:finance'],
      ['area:finance'],
      false,
    );
    assert.equal(sameRoute['area:businesses'], true, 'manual sibling state is not collapsed without navigation');
    assert.equal(sameRoute['area:finance'], true, 'active ancestor is always available after navigation reconciliation');
  });

  check('search matches module names and full business context', () => {
    assert.ok(nav.searchCommandNavigation(pages, 'CONSTRUCTION contracts').some((page) => page.moduleId === 'construction-contracts'));
    assert.deepEqual(nav.searchCommandNavigation(pages, 'no-such-module-z938'), []);
    assert.deepEqual(nav.searchCommandNavigation(pages, '   '), []);
    const scalePages = Array.from({ length: 2000 }, (_, index) => ({ ...pages[0], id: `scale-${index}`, moduleId: `module-${index}`, label: `Module ${index}`, breadcrumb: [`Workspace ${index % 100}`], description: '' }));
    const start = performance.now();
    const found = nav.searchCommandNavigation(scalePages, 'workspace 42 module 742');
    assert.ok(found.some((page) => page.id === 'scale-742'));
    console.log(`INFO 2,000-page search completed in ${(performance.now() - start).toFixed(1)} ms; this is an algorithm check, not a device performance claim.`);
  });

  check('desktop and Sheet instances produce unique, connected disclosure IDs and retain slots', () => {
    const props = { ...ownerOptions, sessionScopeKey: 'navigation-qa-owner', moduleId: 'construction-contracts', activeGlobalId: 'businesses', activeContext: (entry) => entry.moduleId === 'construction-contracts', destinationForGlobalItem: (item) => ({ route: item.route }), goRoute: () => {}, collapsed: false, onExpand: () => {}, contextualTools: React.createElement('button', { 'data-preserved-tool': 'true' }, 'Existing tool'), contextualRecents: React.createElement('button', { 'data-preserved-record': 'true' }, 'Existing record') };
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(EnterpriseCommandCenterNavigation, props), React.createElement(EnterpriseCommandCenterNavigation, props)));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'duplicate IDs between mounted nav instances');
    for (const match of html.matchAll(/aria-controls="([^"]+)"/g)) assert.ok(ids.includes(match[1]), `missing disclosure target: ${match[1]}`);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 2, 'one current destination per instance');
    assert.equal((html.match(/aria-label="Enterprise command center"/g) || []).length, 2);
    assert.ok(html.includes('data-preserved-tool="true"') && html.includes('data-preserved-record="true"'));
    assert.ok(!html.includes('role="tree"') && !html.includes('role="menu"'));
  });

  console.log(`Enterprise Command Center checks passed: ${passed} cases; ${canonical.modules.length} canonical modules; ${fixtures.testProfiles.length} existing access profiles. Render checks are structural; live keyboard, touch, and responsive acceptance remain separate.`);
} finally {
  await server.close();
}
