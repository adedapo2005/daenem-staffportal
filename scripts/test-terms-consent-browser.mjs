import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const evidence = resolve('../staffportal-legal-consent-evidence-20261029');
mkdirSync(evidence, { recursive: true });
const vite = await createServer({
  configFile: 'vite.signin-browser-qa.config.ts',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  logLevel: 'error',
});
await vite.listen();
const origin = 'http://127.0.0.1:' + vite.httpServer.address().port;
const viewports = [
  { name: '4K-3840', width: 3840, height: 2160 },
  { name: 'Desktop-1920', width: 1920, height: 1080 },
  { name: 'Desktop-1366', width: 1366, height: 768 },
  { name: 'Short-1025', width: 1025, height: 600 },
  { name: 'Mobile-390', width: 390, height: 844 },
].filter(item => !process.argv[2] || process.argv[2].split(',').includes(item.name));
const results = [];
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    let loginAttempts = 0, oauthAttempts = 0;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (pathname === '/api/auth/login' && method === 'POST') loginAttempts++;
      if (pathname.startsWith('/api/auth/oauth/') && pathname.endsWith('/start')) oauthAttempts++;
      let status = 200;
      let body = {};
      if (pathname === '/api/auth/me') body = { authenticated: false };
      else if (pathname === '/api/auth/password-policy')
        body = { minimumLength: 8, maximumLength: 128, requiresUppercase: true,
          requiresLowercase: true, requiresNumber: true, requiresSymbol: true };
      else if (pathname === '/api/auth/login') {
        status = 401; body = { error: 'Incorrect credentials' };
      } else if (pathname.startsWith('/api/auth/oauth/')) {
        status = 400; body = { error: 'Synthetic provider unavailable' };
      }
      await route.fulfill({ status, contentType: 'application/json',
        body: JSON.stringify(body), headers: { 'cache-control': 'no-store' } });
    });

    try {
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      const checkbox = page.locator('#staffportal-auth-mount #sp-terms-accept');
      await checkbox.waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await checkbox.isChecked(), false, 'Default must be unchecked');
      assert.equal(await page.locator('#staffportal-auth-mount .sp-install-card-v101').isVisible(), false,
        'Only bottom install button should be replaced');
      const links = await page.locator('#staffportal-auth-mount .sp-terms-consent a')
        .evaluateAll(elements => elements.filter(a => a.getBoundingClientRect().width > 0).map(a => ({
          text: a.textContent?.trim(), href: a.getAttribute('href'), target: a.target,
          rel: a.rel,
        })));
      assert.deepEqual(links.map(link => link.href),
        ['/terms-and-conditions.html', '/privacy-policy.html']);
      assert.ok(links.every(link => link.target === '_blank' &&
        link.rel.includes('noopener')));
      if (viewport.name === 'Desktop-1366') {
        for (const [href,heading] of [
          ['/terms-and-conditions.html','Terms & Conditions'],
          ['/privacy-policy.html','Privacy Policy'],
        ]) {
          const popupPromise = context.waitForEvent('page', { timeout: 12000 });
          await page.locator('.sp-terms-consent a[href="'+href+'"]:visible').click();
          const policyTab = await popupPromise;
          await policyTab.waitForLoadState('domcontentloaded');
          assert.equal(new URL(policyTab.url()).pathname, href,
            'Legal link must open the correct document');
          assert.equal(await policyTab.getByRole('heading',{name:heading}).count(), 1);
          assert.equal(await checkbox.isChecked(), false,
            'Opening the legal text must not silently imply acceptance');
          await policyTab.close();
        }
      }

      await page.locator('.sp-auth-form input[type="text"]').fill('staff@example.test');
      await page.locator('.sp-auth-form input[type="password"]').fill('SomePassword123!');
      await page.locator('.sp-auth-form button[type="submit"]').click();
      assert.equal(loginAttempts, 0, 'Unchecked Terms must block password authentication');
      assert.ok((await page.locator('.sp-terms-consent-error').innerText()).includes('Accept'));

      await page.locator('.sp-social-button').filter({ hasText: 'Google' }).click();
      await page.locator('.sp-social-button').filter({ hasText: 'Microsoft' }).click();
      await page.locator('.sp-social-button').filter({ hasText: 'WhatsApp' }).click();
      assert.equal(oauthAttempts, 0, 'Unchecked Terms must block Google and Microsoft OAuth');
      assert.equal(loginAttempts, 0, 'Unchecked Terms must block WhatsApp login requests');
      assert.equal(new URL(page.url()).pathname, '/');

      const signinGeometry = await page.evaluate(() => {
        const panel = document.querySelector('#staffportal-auth-mount');
        const chip = panel.querySelector('.sp-secure-chip')?.getBoundingClientRect();
        const heading = panel.querySelector('.sp-auth-copy h2')?.getBoundingClientRect();
        const eyebrow = panel.querySelector('.sp-auth-copy .sp-eyebrow')?.getBoundingClientRect();
        const legal = panel.querySelector('.sp-terms-consent')?.getBoundingClientRect();
        const card = document.querySelector('.sp-auth-card.sp-auth-gateway')?.getBoundingClientRect() ||
          panel.getBoundingClientRect();
        const withinCard = legal && card ? (
          legal.top >= card.top - 1 && legal.bottom <= card.bottom + 1
        ) : false;
        const intersects = (a, b) => a && b && a.left < b.right && a.right > b.left &&
          a.top < b.bottom && a.bottom > b.top;
        return {
          chipHeadingOverlap: Boolean(intersects(chip, heading)),
          chipEyebrowOverlap: Boolean(intersects(chip, eyebrow)),
          legalWithinCard: withinCard,
          cardHeight: card?.height, legalHeight: legal?.height,
          legalBottom: legal?.bottom, cardBottom: card?.bottom,
          horizontalOverflow: document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 2,
        };
      });
      console.log('LAYOUT '+viewport.name+' '+JSON.stringify(signinGeometry));
      await page.screenshot({ path: resolve(evidence, viewport.name + '-sign-in.png'),
        fullPage: viewport.width <= 1025 });
      assert.equal(signinGeometry.chipHeadingOverlap, false,
        'Marked Private Staff Access label may not overlap Welcome Back');
      assert.equal(signinGeometry.chipEyebrowOverlap, false,
        'Marked Private Staff Access label may not overlap DAENEM STAFF PORTAL');
      if (viewport.width >= 1366)
        assert.equal(signinGeometry.legalWithinCard, true,
          'Required legal agreement must fit inside the desktop card');
      assert.equal(signinGeometry.horizontalOverflow, false);

      await page.screenshot({ path: resolve(evidence, viewport.name + '-sign-in.png'),
        fullPage: viewport.width <= 1025 });
      await checkbox.check();
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await page.locator('.sp-terms-consent-error').count(), 0);
      await page.locator('.sp-auth-form button[type="submit"]').click();
      assert.equal(loginAttempts, 1,
        'Accepting should permit password sign-in submission');

      const signup = await context.newPage();
      await signup.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const data = pathname === '/api/auth/me' ? { authenticated:false } : {};
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
      });
      await signup.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await signup.locator('.sp-auth-tabs button').filter({hasText:'Create Account'}).click();
      const signupCheckbox = signup.locator('#staffportal-auth-mount #sp-terms-accept');
      await signupCheckbox.waitFor({ state: 'visible', timeout: 10000 });
      await signup.locator('.usp-auth-form input').nth(0).fill('Ada');
      await signup.locator('.usp-auth-form input').nth(1).fill('Okon');
      await signup.locator('.usp-auth-form button[type="submit"]').click();
      assert.ok((await signup.locator('.sp-signup-progress').innerText()).includes('Step 1 of 5'),
        'Unchecked Terms must block Create Account Continue');
      assert.ok((await signup.locator('.sp-terms-consent-error').innerText()).includes('Accept'));
      await signupCheckbox.check();
      await signup.locator('.usp-auth-form button[type="submit"]').click();
      await signup.getByText('Step 2 of 5').waitFor({timeout:10000});
      await signup.screenshot({path:resolve(evidence,viewport.name+'-create-account.png'),
        fullPage:viewport.width<=1025});
      assert.equal(errors.length,0,'No JS errors: '+errors.join('; '));
      results.push({viewport:viewport.name,signinGeometry,links:links.map(x=>x.href),
        signinBlockedWithoutConsent:true,signupBlockedWithoutConsent:true,
        signinAllowedAfterConsent:true,signupAllowedAfterConsent:true});
      console.log('PASS '+viewport.name+' | Mandatory Sign-In + Registration Terms | No Top Overlap | No Horizontal Overflow');
      await signup.close();
    } finally {
      await context.close();
    }
  }
  writeFileSync(resolve(evidence, 'results.json'), JSON.stringify({results,ok:true},null,2));
  console.log(JSON.stringify({ok:true,viewports:results.length,tests:results.length*10}));
} finally {
  await browser?.close();
  await vite.close();
}
