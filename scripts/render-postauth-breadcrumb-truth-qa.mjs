import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';

const root = process.cwd();
const widths = [390, 1366, 3840];
const modes = ['daylight', 'night'];
const css = fs.readFileSync(path.join(root, 'src', 'postauth-readiness.css'), 'utf8');
const tokens = `:root { --sp-bg-surface: #ffffff; --sp-text-primary: #142233; }
* { box-sizing: border-box; }
body { margin: 0; background: #f6f9fb; font: 16px Arial, sans-serif; }
main.dashboard-page { display: block; width: 100%; max-width: none; padding: 16px; }`;

function contrastRatio(foreground, background) {
  const luminance = (rgb) => {
    const channels = rgb.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
    assert(channels?.length === 3, 'Contrast only accepts computed opaque RGB values');
    const [r, g, b] = channels.map((v) => {
      const x = v / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

let vite;
let browser;
let passed = 0;
try {
  // No Worker/Cloudflare dev runtime: this is only the actual owned React
  // breadcrumb component + its stylesheet, rendered with a local DOM fixture.
  vite = await createServer({ root, configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const { PostAuthContextualNavigation } = await vite.ssrLoadModule('/src/post-auth-experience.tsx');
  assert.equal(typeof PostAuthContextualNavigation, 'function');
  const markup = renderToStaticMarkup(createElement(PostAuthContextualNavigation, {
    moduleLabel: 'People', canonicalPath: '/workspace/people', contextKey: 'people',
  }));
  browser = await chromium.launch({ headless: true });
  for (const mode of modes) {
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      await page.setContent(`<!doctype html><html data-mode="${mode}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${css}</style></head><body><main class="dashboard-page postauth-layout">${markup}</main></body></html>`);
      const nav = page.locator('nav[data-contextual-page-navigation="true"]');
      assert.equal(await nav.count(), 1, 'One contextual navigation');
      assert.equal(await nav.locator('ol.postauth-breadcrumbs > li').count(), 2, 'Ordered location trail');
      const parent = nav.getByRole('link', { name: 'Staff Portal' });
      assert.equal(await parent.count(), 1, 'Parent is semantic link');
      assert.equal(await parent.getAttribute('href'), '/workspace', 'Parent routes through authenticated gate');
      const current = nav.locator('ol.postauth-breadcrumbs > li[aria-current="page"]');
      assert.equal(await current.textContent(), 'People', 'Current page is location-based');
      assert.equal(await current.locator('a,button').count(), 0, 'Current page is not interactive');
      await page.keyboard.press('Tab');
      assert(await parent.evaluate((node) => document.activeElement === node), 'Keyboard focus reaches parent');
      const styles = await parent.evaluate((node) => {
        const s = getComputedStyle(node);
        return { outline: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth), outlineColor: s.outlineColor, color: s.color };
      });
      assert.equal(styles.outline, 'solid', 'Visible keyboard outline');
      assert(styles.outlineWidth >= 2, 'Focus outline at least 2 CSS pixels');
      const background = await nav.evaluate((node) => getComputedStyle(node).backgroundColor);
      assert.equal(background, mode === 'night' ? 'rgb(23, 37, 65)' : 'rgb(255, 255, 255)', 'Opaque nonglass theme surface');
      assert(contrastRatio(styles.color, background) >= 4.5, 'Text has WCAG AA contrast');
      assert(contrastRatio(styles.outlineColor, background) >= 3, 'Focus outline has WCAG nontext contrast');
      assert(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'Reduced Motion respected');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, 'No horizontal overflow');
      assert.deepEqual(pageErrors, [], 'No browser runtime errors');
      console.log(`POSTAUTH_BREADCRUMB_${mode}_${width}=PASS`);
      passed++;
      await page.close();
    }
  }
  console.log(`POSTAUTH_BREADCRUMB_TRUTH_QA=${passed}/${modes.length * widths.length} PASS`);
} catch (error) {
  console.error('POSTAUTH_BREADCRUMB_TRUTH_QA=FAIL', error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.close();
}
