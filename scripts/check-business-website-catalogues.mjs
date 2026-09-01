import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0043_business_website_catalogue_connectors.sql');
const worker=read('worker/platform-center.ts');
const client=read('src/platform-center-entry.tsx');
const css=read('src/platform-center.css');
const guide=read('worker/ai-guide.ts');
const release=read('src/main.tsx');
const packageJson=JSON.parse(read('package.json'));
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

check('Logistics gains one operational service source table',migration.includes('CREATE TABLE IF NOT EXISTS logistics_services')&&migration.includes('UNIQUE(company_id,code)'));
check('Logistics service records have bounded categories and pricing units',migration.includes("category IN ('delivery','haulage','moving','distribution','courier','specialized','other')")&&migration.includes("pricing_unit IN ('job','trip','kilometre','kilogram','tonne','hour','day','vehicle')"));
check('Logistics service management has a plain-language granular permission',migration.includes("'logistics.services'")&&migration.includes('Create and maintain the real Daenem Logistics service catalogue'));
check('owner, group admin and Logistics operational defaults are explicit',['role-owner','role-group-admin','role-logistics-fleet','role-logistics-dispatcher'].every((role)=>migration.includes(`'${role}'`)));
check('database triggers reject cross-business polymorphic links',migration.includes('website_catalog_link_source_guard_insert')&&migration.includes('website_catalog_link_source_guard_update')&&migration.includes("RAISE(ABORT,'invalid website catalogue source')"));
check('all five operational source types are guarded',['printing_service','bakery_product','vehicle','property','logistics_service'].every((type)=>migration.includes(`NEW.entity_type='${type}'`)));
check('worker resolves all five operational source tables',['printing_services','bakery_products','auto_vehicles','property_listings','logistics_services'].every((table)=>worker.includes(`FROM ${table}`)));
check('source-to-company mapping prevents cross-business connections',['company-printing','company-bakery','company-autos','company-properties','company-logistics'].every((id)=>worker.includes(`'${id}'`))&&worker.includes('catalogueEntityCompanies[entityType] !== companyId'));
check('connect endpoint requires Website Catalogue Edit access',worker.includes('connectCatalogueSource')&&worker.includes("requireCompany(context, companyId, 'website.catalog', 'edit')"));
check('connect endpoint stores only the link and records no copied operational record',worker.includes('INSERT INTO website_catalog_links')&&worker.includes('operationalRecordCopied: false'));
check('inactive operational records cannot be connected or re-enabled',worker.includes('operational record is not currently eligible for public display')&&worker.includes('Number(source.operationalActive) !== 1'));
check('public feed automatically withholds sold, closed or inactive sources',worker.includes('src.operationalActive=1')&&worker.includes("status IN ('ready','reserved','hold')")&&worker.includes("l.status IN ('published','under_offer')"));
check('public Autos output excludes purchase and landed cost fields',worker.includes('asking_price_kobo')&&!worker.slice(worker.indexOf("SELECT 'vehicle'"),worker.indexOf("SELECT 'property'")).includes('purchase_cost_kobo'));
check('public Property output uses the existing public listing description',worker.includes("SELECT 'property'")&&worker.includes('l.public_description'));
check('inquiry service names resolve through the selected business catalogue',worker.includes('LEFT JOIN website_catalog_links l ON l.site_id=i.site_id')&&worker.includes('src.name AS serviceName'));
check('overview skips source queries without Website Catalogue View permission',worker.includes('canCatalogue ? env.DB.prepare')&&worker.includes("permitted(context, companyId, 'website.catalog', 'view') ? catalogueRows"));
check('source queries and client results are bounded',migration.includes('website.catalogue_source_limit')&&worker.includes('Math.min(500, value)')&&worker.includes('LIMIT ?'));
check('Logistics source creation requires both website and Logistics permissions',worker.includes('websiteDenied')&&worker.includes('logisticsDenied')&&worker.includes("'logistics.services', 'edit'"));
check('Logistics source fields reject HTML and invalid values',worker.includes('Logistics service fields must use plain text')&&worker.includes('categories.has(category)')&&worker.includes('pricingUnits.has(pricingUnit)'));
check('API collection clearly describes source connection and Logistics maintenance',worker.includes('Connect operational catalogue item')&&worker.includes('Maintain Logistics service'));
check('client exposes the authorized ERP source library',client.includes('ERP SOURCE LIBRARY')&&client.includes('Connect an operational item')&&client.includes('Connect to website'));
check('client explains that connections do not copy ERP records',client.includes('it does not create a second product, vehicle, property or service'));
check('client creates Logistics sources only with assigned permission',client.includes("data.company.code === 'LOGISTICS'")&&client.includes('data.capabilities.logisticsServicesEdit'));
check('every Logistics service field includes clear help text',['Service name','Service code','Category','Pricing unit','Starting price in naira','Service description'].every((label)=>client.includes(`label=\"${label}\"`)));
check('desktop, tablet, phone and night layouts cover source records',css.includes('.pc-source-list')&&css.includes('@media(max-width:1050px)')&&css.includes('@media(max-width:720px)')&&css.includes("html[data-mode='night'] .pc-source-list"));
check('Smart Help explains the five real ERP sources',guide.includes('Printing services, Bakery products, Autos vehicles, Property listings and Logistics services'));
check('release history records future business connectors and automatic withholding',release.includes('Provisioned future catalogue connectors')&&release.includes('only the completed Printing website is treated as built')&&release.includes('automatic public-feed withholding'));
check('unbuilt business websites are clearly kept in setup-required state',client.includes('Website not built yet')&&client.includes('public feed remain private and off')&&guide.includes('Only Printing is currently built'));
check('only Printing is marked built while every public feed stays approval controlled',migration.includes("WHERE company_id='company-printing' AND domain='printing.daenem.com'")&&migration.includes("SET status='active'")&&!migration.includes("SET public_feed_enabled=1"));
check('portal release advances on the protected build branch',/^7\.0\.0-alpha\.\d+$/.test(packageJson.version)&&release.includes(`version: '${packageJson.version}'`));
check('build runs the all-business catalogue contract',packageJson.scripts.prebuild.includes('check-business-website-catalogues.mjs'));
check('Farms operations and the protected sign-in are not introduced in this phase',!migration.includes('company-farms')&&!worker.includes('/api/farms/')&&!client.includes('dangerouslySetInnerHTML'));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} business-website-catalogue contract assertion(s) failed.`);
else console.log(`\n${assertions.length} business-website-catalogue contract assertions passed.`);
