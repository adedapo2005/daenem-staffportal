import { chromium } from 'playwright';
import fs from 'node:fs';

const sizes=[[390,844],[430,932],[768,1024],[1024,1366],[1366,1024],[1672,941],[1920,1080],[2560,1440],[3840,2160]];
const browser=await chromium.launch({headless:true});
const results=[];

for(const [width,height] of sizes){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',colorScheme:'light'});
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text())});

  await page.goto('http://127.0.0.1:4180/__canonical_baseline?layout=master-detail-workspace',{waitUntil:'domcontentloaded'});
  await page.locator('[data-canonical-staffportal-dashboard]').waitFor({state:'visible',timeout:20000});
  const rows=page.locator('.csp-record-list-scroll>button');
  if(await rows.count()>1) await rows.nth(1).click();
  const selectedTitle=(await page.locator('.csp-record-identity h2').textContent())?.trim()||'';

  await page.getByRole('button',{name:/Open Full Record/i}).click();
  await page.locator('[data-record-dedicated-page]').waitFor({state:'visible',timeout:10000});
  const deepLink=page.url();
  const breadcrumbs=await page.getByRole('navigation',{name:'Record Breadcrumbs'}).getByRole('button').allTextContents();
  const dedicatedTitle=(await page.locator('[data-record-dedicated-page] .csp-record-identity h2').textContent())?.trim()||'';
  const dedicatedMetrics=await page.evaluate(()=>({
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
    under9:[...document.querySelectorAll('[data-record-dedicated-page] *')].filter(element=>element.getClientRects().length&&parseFloat(getComputedStyle(element).fontSize)<9).length
  }));
  await page.screenshot({path:`qa-artifacts/canonical-postauth-v1/record-route-${width}x${height}.png`,fullPage:false});

  await page.goBack({waitUntil:'domcontentloaded'});
  await page.locator('[data-record-dedicated-page]').waitFor({state:'detached',timeout:10000});
  const backRestoredList=await page.locator('.csp-record-list').isVisible();

  await page.goForward({waitUntil:'domcontentloaded'});
  await page.locator('[data-record-dedicated-page]').waitFor({state:'visible',timeout:10000});
  const forwardRestoredRecord=((await page.locator('[data-record-dedicated-page] .csp-record-identity h2').textContent())?.trim()||'')===selectedTitle;

  const direct=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',colorScheme:'light'});
  await direct.goto(deepLink,{waitUntil:'domcontentloaded'});
  await direct.locator('[data-record-dedicated-page]').waitFor({state:'visible',timeout:10000});
  const directLinkedRecord=((await direct.locator('[data-record-dedicated-page] .csp-record-identity h2').textContent())?.trim()||'')===selectedTitle;
  await direct.close();

  results.push({
    viewport:`${width}x${height}`,
    selectedTitle,
    dedicatedTitle,
    urlHasRecord:new URL(deepLink).searchParams.has('record'),
    breadcrumbs,
    backRestoredList,
    forwardRestoredRecord,
    directLinkedRecord,
    ...dedicatedMetrics,
    errors
  });
  await page.close();
}

await browser.close();
fs.writeFileSync('qa-artifacts/canonical-postauth-v1/record-route-targeted-qa.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

const failed=results.some(result=>!result.urlHasRecord||result.breadcrumbs.length<2||!result.backRestoredList||!result.forwardRestoredRecord||!result.directLinkedRecord||result.horizontalOverflow||result.under9>0||result.errors.length);
if(failed) process.exit(1);
