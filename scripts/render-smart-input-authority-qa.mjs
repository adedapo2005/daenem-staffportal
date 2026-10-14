import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    if (process.env.QA_WIDTH && Number(process.env.QA_WIDTH) !== width) continue;
    const context = await browser.newContext({
      viewport: { width, height: width === 3840 ? 2160 : width < 768 ? 844 : 1080 },
      reducedMotion: 'reduce', serviceWorkers: 'block'
    });
    const page = await context.newPage();
    const errors = [], forbiddenRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
      forbiddenRequests.push(url.origin + url.pathname);
      return route.abort();
    });
    await page.route(origin + '/__qa_smart_input_authority', route => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="qa-root"></div></body></html>'
    }));
    try {
      await page.goto(origin + '/__qa_smart_input_authority', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        // The fixture is standalone HTML; install Vite's React preamble before importing TSX.
        window.__vite_plugin_react_preamble_installed__ = true;
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => type => type;
        const source = await (await fetch('/src/smart-input.tsx')).text();
        const reactUrl = source.match(/from\s+["'](\/node_modules\/\.vite\/deps\/react\.js\?v=[^"']+)["']/)?.[1]
          || '/node_modules/.vite/deps/react.js';
        const React = await import(reactUrl);
        const createElement = React.createElement || React.default?.createElement;
        if (typeof createElement !== 'function') throw new Error('React module missing createElement: ' + reactUrl);
        const reactDomUrl = reactUrl.replace('/react.js', '/react-dom_client.js');
        const ReactDOM = await import(reactDomUrl);
        const createRoot = ReactDOM.createRoot || ReactDOM.default?.createRoot;
        if (typeof createRoot !== 'function') throw new Error('ReactDOM client module missing createRoot: ' + reactDomUrl + ' exports=' + Object.keys(ReactDOM));
        const { SmartInput } = await import('/src/smart-input.tsx');
        const state = { label: 'QA Role Description', value: 'responsible', authorized: true,
          sensitivity: 'nonsensitive', scopeKey: 'private-company-A', optOut: false, disabled: false };
        const root = createRoot(document.getElementById('qa-root'));
        const render = (patch = {}) => {
          Object.assign(state, patch);
          root.render(createElement(SmartInput, { ...state,
            onChange: next => render({ value: next }) }));
        };
        window.__qaSmartAuthority = { render };
        render();
      });
      const field = page.getByRole('textbox', { name: 'QA Role Description' });
      await page.locator('.smart-input-ghost').waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Accept local suggestion' }).click();
      assert.equal(await field.inputValue(), 'responsible for assigned daily tasks');
      assert.equal(await page.getByRole('button', { name: 'Undo accepted suggestion' }).count(), 1);
      await page.evaluate(() => window.__qaSmartAuthority.render({ authorized: false }));
      await page.locator('.smart-input-actions').waitFor({ state: 'hidden' });
      const revokedField = page.locator('input[aria-label="QA Role Description"]');
      assert.equal(await revokedField.inputValue(), '', 'revocation must clear exposed DOM input value');
      assert.equal(await revokedField.isDisabled(), true, 'revoked field must not accept edits');
      await page.evaluate(() => window.__qaSmartAuthority.render({ authorized: true }));
      await page.locator('.smart-input-root').waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('button', { name: 'Undo accepted suggestion' }).count(), 0,
        'old undo cannot return after revocation and regrant');
      await page.evaluate(() => window.__qaSmartAuthority.render({ sensitivity: 'secret' }));
      await page.locator('.smart-input-actions').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('input[aria-label="QA Role Description"]').getAttribute('type'),
        'password', 'secret-classified fields must mask displayed characters');
      await page.evaluate(() => window.__qaSmartAuthority.render({ sensitivity: 'nonsensitive' }));
      await page.locator('.smart-input-root').waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('button', { name: 'Undo accepted suggestion' }).count(), 0,
        'old undo cannot return after secret-field transition');
      await page.evaluate(() => window.__qaSmartAuthority.render({ scopeKey: 'private-company-B', value: 'coordinates' }));
      await page.locator('.smart-input-ghost').waitFor({ state: 'visible' });
      assert.equal(await page.getByRole('button', { name: 'Undo accepted suggestion' }).count(), 0);
      assert.equal(await page.locator('[data-smart-input-scope]').count(), 0, 'no authority identifier in DOM attribute');
      await page.evaluate(() => window.__qaSmartAuthority.render({ optOut: true }));
      await page.locator('.smart-input-actions').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.__qaSmartAuthority.render({ optOut: false, disabled: true }));
      assert.equal(await field.isDisabled(), true);
      assert.equal(await page.locator('.smart-input-actions').count(), 0);
      assert.equal(forbiddenRequests.length, 0, 'no API or provider calls');
      assert.deepEqual(errors, [], 'no browser runtime errors');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
        'no horizontal overflow');
      results.push({ width, pass: true });
      console.log('SMART_INPUT_AUTHORITY_WIDTH=' + width + ' PASS');
    } catch (error) {
      results.push({ width, pass: false, error: String(error), errors, forbiddenRequests });
      console.error('SMART_INPUT_AUTHORITY_WIDTH=' + width + ' FAIL ' + String(error));
    } finally {
      await context.close();
    }
  }
} finally { await browser.close(); }
const failures = results.filter(result => !result.pass);
console.log('SMART_INPUT_AUTHORITY_QA=' + (results.length - failures.length) + '/' + results.length +
  (failures.length ? ' FAIL' : ' PASS'));
if (failures.length || results.length === 0) process.exitCode = 1;
