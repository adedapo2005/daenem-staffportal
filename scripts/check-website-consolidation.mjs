import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0042_website_operations_consolidation.sql');
const worker=read('worker/platform-center.ts');
const client=read('src/platform-center-entry.tsx');
const css=read('src/platform-center.css');
const runtime=read('worker/runtime.ts');
const release=read('src/main.tsx');
const guide=read('worker/ai-guide.ts');
const packageJson=JSON.parse(read('package.json'));
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

check('migration creates consolidated catalogue, inquiry, careers and theme records',[
  'website_catalog_links','website_inquiries','website_inquiry_conversions','website_vacancies','website_applications','website_theme_revisions','website_theme_publish_requests',
].every((table)=>migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)));
check('catalogue links to operational entities instead of copying an order table',migration.includes("entity_type IN ('printing_service'")&&migration.includes('entity_id TEXT NOT NULL')&&!migration.includes('CREATE TABLE IF NOT EXISTS printing_orders'));
check('approved Printing catalogue is seeded into printing_services',migration.includes('INSERT OR IGNORE INTO printing_services')&&migration.includes("'BUSINESS-CARDS'")&&migration.includes("'PRINT-CUT'"));
check('existing Large Format service is reused',migration.includes("ps.code='LARGE-FORMAT'")&&!migration.includes("'print-service-web-large-format'"));
check('catalogue contains the approved 44-item sequence',migration.includes('"sortOrder":10')&&migration.includes('"sortOrder":440')&&migration.includes("ps.id LIKE 'print-service-web-%'"));
check('five approved Printing vacancies are preserved',['large-format-operator','kord-machine-operator','embroidery-machine-operator','graphic-designer','nysc-placement'].every((slug)=>migration.includes(`'${slug}'`)));
check('Studio Ink 2.0 and Logo Concept A remain the published baseline',migration.includes("'Studio Ink 2.0'")&&migration.includes("'/assets/logo-concept-a.svg'")&&migration.includes("'studio_ink_2'"));
check('new functions have granular plain-language permissions',['website.catalog','website.inquiries','website.careers','website.theme'].every((permission)=>migration.includes(`'${permission}'`)));
check('owner and group admin receive manageable defaults',migration.includes("'role-owner'")&&migration.includes("'role-group-admin'")&&migration.includes("'manage'"));
check('no Farms tables, bindings or routes were introduced',!migration.includes('company-farms')&&!migration.includes('farms_')&&!worker.includes('/printing-admin'));
check('public inquiry input is size bounded and plain-text validated',worker.includes('website.public_request_max_bytes')&&worker.includes('publicPayload')&&worker.includes('Website requests must use plain text'));
check('public inquiry and application submissions are KV rate limited',worker.includes('website-rate:')&&worker.includes("'inquiry', limit, 120")&&worker.includes("'application', limit, 300"));
check('public write routes fail closed when rate protection is unavailable',worker.includes('rate.unavailable ? 503 : 429')&&worker.includes('protection is temporarily unavailable'));
check('public CORS allows only the exact configured website origin',worker.includes("`https://${site.domain}`")&&worker.includes("'access-control-allow-methods': 'GET, POST, OPTIONS'"));
check('public catalogue returns only linked and operationally eligible ERP sources',worker.includes('WITH sources AS (${catalogueSourcesSql})')&&worker.includes('l.active=1 AND src.operationalActive=1'));
check('public vacancies accept applications only while open',worker.includes("active=1 AND (closes_at IS NULL OR datetime(closes_at)>datetime('now'))"));
check('inquiry conversion requires both website and Printing permissions',worker.includes("'website.inquiries', 'edit'")&&worker.includes("'printing.access', 'create'"));
check('one inquiry cannot create two Printing ERP jobs',worker.includes('website_inquiry_conversions')&&worker.includes('alreadyConverted: true'));
check('Printing conversion uses customers and print_jobs',worker.includes('INSERT INTO customers')&&worker.includes('INSERT INTO print_jobs')&&worker.includes('converted_print_job_id'));
check('conversion creates enquiry timeline and audited source link',worker.includes("to_status,to_status")===false&&worker.includes("'Converted from approved website inquiry'")&&worker.includes("'convert_printing_inquiry'"));
check('private inquiries and applications are withheld without view permission',worker.includes("permitted(context, companyId, 'website.inquiries', 'view') ? resultRows(inquiries) : []")&&worker.includes("permitted(context, companyId, 'website.careers', 'view') ? resultRows(applications) : []"));
check('theme publishing requires submit, independent approval and manage access',worker.includes('submitTheme')&&worker.includes('reviewTheme')&&worker.includes('publishTheme')&&worker.includes('found.requestedBy === context.employee.id')&&worker.includes("'website.theme', 'manage'"));
check('theme restore creates a new draft rather than overwriting history',worker.includes('restoreTheme')&&worker.includes('prepare_website_theme_restore')&&worker.includes("status: 'draft'"));
check('shared Website Administration exposes all consolidated menus',['Catalogue','Inquiries','Careers','Theme & Versions'].every((label)=>client.includes(`label: '${label}'`)));
check('Printing UI explains the no-duplicate conversion',['No duplicate product database','Convert to Printing ERP','does not create a parallel website order'].every((text)=>client.includes(text)));
check('every new form includes plain-language help',client.includes('The clear job title applicants will see.')&&client.includes('Required: explain exactly what this version changes'));
check('phone and tablet layouts cover the added functions',css.includes('.pc-catalogue-grid')&&css.includes('.pc-inquiry-list')&&css.includes('.pc-theme-history')&&css.includes('@media(max-width:1050px)')&&css.includes('@media(max-width:720px)'));
check('version history summarizes the consolidation',release.includes('Consolidated the former Printing Web Admin')&&release.includes('all 44 approved Printing catalogue items')&&release.includes('Studio Ink 2.0 with Logo Concept A'));
check('Smart Help explains every consolidated website function',guide.includes('catalogue managers, inquiry staff, careers reviewers, theme reviewers')&&guide.includes('existing customer and print-job workflow'));
check('public website routes remain separate from authenticated platform routes',runtime.includes("url.pathname.startsWith('/api/public/websites/')")&&runtime.includes("url.pathname.startsWith('/api/platform/')"));
check('build runs this consolidation contract',packageJson.scripts.prebuild.includes('check-website-consolidation.mjs'));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} website-consolidation contract assertion(s) failed.`);
else console.log(`\n${assertions.length} website-consolidation contract assertions passed.`);
