import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Safety regression against existing React source, NOT a v180 visual-parity acceptance.
const origin = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const widths = [390, 430, 768, 1024, 1366, 1672, 1920, 2560, 3840];
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width === 3840 ? 2160 : width < 768 ? 900 : 1080 },
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    const errors = [], calls = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.route(origin + '/__qa_signin_context_failclosed', (route) => route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<!doctype html><html><body><div id="qa-root"></div></body></html>',
    }));
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      calls.push(path + ':' + route.request().method());
      if (path === '/api/context/signin') return route.fulfill({
        status: 200, contentType: 'text/html', body: '<!doctype html><title>Fallback SPA</title>',
      });
      return route.fulfill({
        status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}',
      });
    });
    try {
      await page.goto(origin + '/__qa_signin_context_failclosed', { waitUntil: 'domcontentloaded' });
      await page.evaluate(async () => {
        window.__vite_plugin_react_preamble_installed__ = true;
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        const React = await import('/node_modules/.vite/deps/react.js');
        const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js');
        const { SignInExperience } = await import('/src/signin-experience.tsx');
        const { readThemeId } = await import('/src/theme-system.ts');
        const createRoot = ReactDOM.createRoot || ReactDOM.default?.createRoot;
        const createElement = React.createElement || React.default?.createElement;
        createRoot(document.getElementById('qa-root')).render(createElement(SignInExperience, {
          authPanel: createElement('button', { type: 'button' }, 'QA Sign-In Panel'),
          themeId: readThemeId(), onInstall: () => {},
        }));
      });
      await page.getByRole('button', { name: 'QA Sign-In Panel' }).waitFor({ timeout: 18000 });
      await page.waitForTimeout(1200);
      assert.ok(calls.some((call) => call === '/api/context/signin:GET'), 'public API must have been requested');
      assert.deepEqual(errors, [], 'malformed successful HTML cannot crash Sign-In');
      results.push({ width, pass: true });
    } catch (error) {
      results.push({ width, pass: false, error: String(error), errors, calls });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({
  test: 'SIGNIN_MALFORMED_SUCCESS_FAILCLOSED',
  passed: results.filter((result) => result.pass).length,
  total: results.length, results,
}));
if (results.some((result) => !result.pass) || results.length !== widths.length) process.exitCode = 1;
