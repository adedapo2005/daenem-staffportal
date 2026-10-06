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

  await page.goto('http://127.0.0.1:4182/__canonical_baseline?layout=master-detail-workspace',{waitUntil:'domcontentloaded'});
  await page.locator('[data-canonical-staffportal-dashboard]').waitFor({state:'visible',timeout:20000});
  await page.addStyleTag({content:'.csp-record-list-scroll{max-height:96px!important;overflow:auto!important}'});

  const search=page.getByRole('textbox',{name:'Search Records'});
  await search.fill('e');
  await page.getByRole('button',{name:'Priority',exact:true}).click();
  const sort=page.getByRole('button',{name:/Sort Records/i});
  await sort.click();
  await sort.click();

  const list=page.locator('.csp-record-list-scroll');
  await list.evaluate(element=>{element.scrollTop=48;element.dispatchEvent(new Event('scroll',{bubbles:true}))});
  await page.waitForTimeout(50);
  const beforeScroll=await list.evaluate(element=>element.scrollTop);
  const beforeQuery=await search.inputValue();
  const beforePriority=await page.getByRole('button',{name:'Priority',exact:true}).getAttribute('aria-pressed');
  const beforeSort=(await sort.textContent())?.trim()||'';

  const rows=list.locator('button[role="option"]');
  const rowCount=await rows.count();
  if(rowCount<1) throw new Error(`No filtered records at ${width}x${height}`);
  await rows.last().click();
  const navigationScroll=await list.evaluate(element=>element.scrollTop);
  const expectedScroll=navigationScroll>0?navigationScroll:beforeScroll;
  const selectedTitle=(await page.locator('.csp-record-identity h2').textContent())?.trim()||'';

  const quickClose=page.getByRole('button',{name:'Close Quick Inspection'});
  await quickClose.click();
  const quickToggle=page.getByRole('button',{name:/Open Quick Inspection/i});
  await quickToggle.waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(30);
  const closeFocusReturned=await quickToggle.evaluate(element=>document.activeElement===element);
  await quickToggle.click();
  await quickClose.waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(30);
  const openFocusEntered=await quickClose.evaluate(element=>document.activeElement===element);
  await quickClose.press('Escape');
  await quickToggle.waitFor({state:'visible',timeout:5000});
  await page.waitForTimeout(30);
  const escapeClosed=await quickToggle.evaluate(element=>document.activeElement===element);
  await quickToggle.click();
  await quickClose.waitFor({state:'visible',timeout:5000});

  await page.getByRole('button',{name:/Open Full Record/i}).click();
  await page.locator('[data-record-dedicated-page]').waitFor({state:'visible',timeout:10000});
  await page.goBack({waitUntil:'domcontentloaded'});
  await page.locator('[data-record-dedicated-page]').waitFor({state:'detached',timeout:10000});

  const restoredSearch=page.getByRole('textbox',{name:'Search Records'});
  const restoredSort=page.getByRole('button',{name:/Sort Records/i});
  const afterQuery=await restoredSearch.inputValue();
  const afterPriority=await page.getByRole('button',{name:'Priority',exact:true}).getAttribute('aria-pressed');
  const afterSort=(await restoredSort.textContent())?.trim()||'';
  const afterScroll=await page.locator('.csp-record-list-scroll').evaluate(element=>element.scrollTop);
  const restoredSelected=(await page.locator('.csp-record-identity h2').textContent())?.trim()||'';
  const metrics=await page.evaluate(()=>({
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,
    under9:[...document.querySelectorAll('body *')].filter(element=>element.getClientRects().length&&parseFloat(getComputedStyle(element).fontSize)<9).length
  }));
  await page.screenshot({path:`qa-artifacts/canonical-postauth-v1/record-return-state-${width}x${height}.png`,fullPage:false});

  results.push({
    viewport:`${width}x${height}`,
    selectedTitle,
    beforeQuery,afterQuery,
    beforePriority,afterPriority,
    beforeSort,afterSort,
    beforeScroll,navigationScroll,expectedScroll,afterScroll,
    restoredSelected,
    quickInspectionCloseFocusReturned:closeFocusReturned,
    quickInspectionOpenFocusEntered:openFocusEntered,
    quickInspectionEscapeFocusReturned:escapeClosed,
    queryPreserved:beforeQuery===afterQuery,
    filterPreserved:beforePriority==='true'&&afterPriority==='true',
    sortPreserved:beforeSort===afterSort&&/Title A-Z/.test(afterSort),
    scrollPreserved:expectedScroll>0&&Math.abs(expectedScroll-afterScroll)<=2,
    selectionPreserved:selectedTitle===restoredSelected,
    ...metrics,
    errors
  });
  await page.close();
}

await browser.close();
fs.writeFileSync('qa-artifacts/canonical-postauth-v1/record-return-state-targeted-qa.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
const failed=results.some(result=>!result.quickInspectionCloseFocusReturned||!result.quickInspectionOpenFocusEntered||!result.quickInspectionEscapeFocusReturned||!result.queryPreserved||!result.filterPreserved||!result.sortPreserved||!result.scrollPreserved||!result.selectionPreserved||result.horizontalOverflow||result.under9>0||result.errors.length);
if(failed) process.exit(1);
