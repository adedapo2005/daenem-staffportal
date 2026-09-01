import { hasPermission, type AccessLevel, type SessionContext } from './auth';
import type { SocialOAuthEnv } from './social-oauth';

interface Env extends SocialOAuthEnv {
  EMAIL?: unknown;
}

type Body = Record<string, unknown>;
type Company = SessionContext['companies'][number];

const json = (body: unknown, status = 200, headers?: HeadersInit) => {
  const result = new Headers(headers);
  result.set('content-type', 'application/json; charset=utf-8');
  if (!result.has('cache-control')) result.set('cache-control', 'no-store');
  result.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(body), { status, headers: result });
};
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const text = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const protectedDomains = ['staffportal.daenem.com', 'portal.farms.daenem.com', 'farms.daenem.com'];
const categories = new Set(['website', 'email', 'messaging', 'payment', 'weather', 'ai', 'storage', 'social', 'other']);
const environments = new Set(['development', 'staging', 'production']);
const authTypes = new Set(['none', 'worker_secret', 'oauth', 'service_binding', 'webhook_signature']);
const secretBindingPattern = /^[A-Z][A-Z0-9_]{2,80}$/;
const inquiryStatuses = new Set(['new', 'qualified', 'in_progress', 'converted', 'closed', 'spam']);
const applicationStatuses = new Set(['new', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn']);
const catalogueEntityCompanies: Record<string, string> = {
  printing_service: 'company-printing',
  bakery_product: 'company-bakery',
  vehicle: 'company-autos',
  property: 'company-properties',
  logistics_service: 'company-logistics',
};
const catalogueSourcesSql = `
  SELECT 'printing_service' AS entityType,id AS entityId,company_id AS companyId,code,name,category,description,
    pricing_unit AS pricingUnit,base_price_kobo AS basePriceKobo,metadata_json AS metadataJson,
    CASE WHEN active=1 THEN 'active' ELSE 'inactive' END AS operationalStatus,active AS operationalActive
  FROM printing_services
  UNION ALL
  SELECT 'bakery_product',id,company_id,code,name,category,description,sales_unit,selling_price_kobo,
    json_object('salesUnit',sales_unit,'wholesalePriceKobo',wholesale_price_kobo,'shelfLifeHours',shelf_life_hours),
    CASE WHEN active=1 THEN 'active' ELSE 'inactive' END,active
  FROM bakery_products
  UNION ALL
  SELECT 'vehicle',id,company_id,stock_no,
    trim(COALESCE(CAST(year AS TEXT)||' ','')||make||' '||model||COALESCE(' '||trim,'')),
    COALESCE(body_type,'vehicle'),
    trim(COALESCE(exterior_color||' ','')||COALESCE(transmission||' ','')||COALESCE(fuel_type||' ','')||COALESCE(CAST(mileage_km AS INTEGER)||' km','')),
    'vehicle',asking_price_kobo,
    json_object('year',year,'make',make,'model',model,'trim',trim,'bodyType',body_type,'fuelType',fuel_type,'transmission',transmission,'mileageKm',mileage_km,'exteriorColor',exterior_color),
    status,CASE WHEN status IN ('ready','reserved','hold') THEN 1 ELSE 0 END
  FROM auto_vehicles
  UNION ALL
  SELECT 'property',l.id,l.company_id,l.listing_no,l.headline,l.listing_type,l.public_description,'listing',l.asking_price_kobo,
    json_object('propertyCode',p.property_code,'propertyName',p.name,'propertyType',p.property_type,'address',p.address,'city',p.city,'state',p.state,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'listingType',l.listing_type,'availableFrom',l.available_from),
    l.status,CASE WHEN l.status IN ('published','under_offer') AND p.status IN ('available','reserved','under_offer') THEN 1 ELSE 0 END
  FROM property_listings l JOIN properties p ON p.id=l.property_id
  UNION ALL
  SELECT 'logistics_service',id,company_id,code,name,category,description,pricing_unit,base_price_kobo,metadata_json,
    CASE WHEN active=1 THEN 'active' ELSE 'inactive' END,active
  FROM logistics_services`;

async function body(request: Request): Promise<Body | null> {
  try { return await request.json<Body>(); } catch { return null; }
}

function companyFor(context: SessionContext, companyId: string) {
  return context.companies.find((company) => company.id === companyId);
}

function permitted(context: SessionContext, companyId: string, permission: string, minimum: AccessLevel = 'view') {
  return Boolean(companyFor(context, companyId)) && hasPermission(context, permission, minimum, companyId);
}

function requireCompany(context: SessionContext, companyId: string, permission: string, minimum: AccessLevel = 'view') {
  if (!companyFor(context, companyId)) return json({ error: 'This business is not assigned to your account.' }, 403);
  if (!hasPermission(context, permission, minimum, companyId)) return json({ error: `${permission} ${minimum} access is required for this business.` }, 403);
  return null;
}

async function settingNumber(env: Env, key: string, fallback: number) {
  const row = await env.DB.prepare('SELECT setting_value AS value FROM app_settings WHERE setting_key=?').bind(key).first<{ value: string }>();
  const value = Number(row?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function httpsUrl(value: unknown, optional = true) {
  const raw = text(value, 1000);
  if (!raw && optional) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch { return undefined; }
}

function normalizedDomain(value: unknown) {
  const raw = text(value, 253).toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!raw) return null;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(raw)) return undefined;
  if (protectedDomains.some((domain) => raw === domain || raw.endsWith(`.${domain}`))) return undefined;
  return raw;
}

function slug(value: unknown) {
  const result = text(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return result || 'home';
}

function plain(value: unknown, max = 1000) {
  const result = text(value, max);
  return /<\/?[a-z][^>]*>/i.test(result) ? undefined : result;
}

function number(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'asset';
}

async function audit(env: Env, context: SessionContext, companyId: string, action: string, entityType: string, entityId: string, details: unknown) {
  await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id)
    VALUES(?,?,?,'platform_center',?,?,?,?, 'web',?)`)
    .bind(uid('audit'), context.employee.id, companyId, action, entityType, entityId, JSON.stringify(details || {}), crypto.randomUUID()).run();
}

async function integrationLog(env: Env, companyId: string, connectionId: string | null, operation: string, outcome: 'success' | 'failed' | 'blocked', statusCode: number) {
  await env.DB.prepare(`INSERT INTO integration_request_logs(id,company_id,connection_id,direction,operation,method,status_code,outcome,request_id)
    VALUES(?,?,?,'internal',?,'POST',?,?,?)`)
    .bind(uid('integration-log'), companyId, connectionId, operation, statusCode, outcome, crypto.randomUUID()).run();
}

function catalogueRows(value: unknown) {
  const rows = value && typeof value === 'object' && 'results' in value ? (value as { results?: Record<string, unknown>[] }).results || [] : [];
  return rows.map((row) => {
    let metadata: unknown = {};
    try { metadata = JSON.parse(String(row.metadataJson || '{}')); } catch {}
    const { metadataJson: _removed, ...safe } = row;
    return { ...safe, metadata };
  });
}

async function catalogueSource(env: Env, companyId: string, entityType: string, entityId: string) {
  return env.DB.prepare(`WITH sources AS (${catalogueSourcesSql})
    SELECT * FROM sources WHERE companyId=? AND entityType=? AND entityId=? LIMIT 1`)
    .bind(companyId, entityType, entityId).first<Record<string, unknown>>();
}

function catalogueSourceName(companyId: string) {
  return ({
    'company-printing': 'Printing services',
    'company-bakery': 'Bakery products',
    'company-autos': 'Vehicle inventory',
    'company-properties': 'Property listings',
    'company-logistics': 'Logistics services',
  } as Record<string, string>)[companyId] || 'Business ERP catalogue';
}

function bindingHealth(env: Env) {
  return [
    { key: 'DB', name: 'Cloudflare D1', purpose: 'Stores business configuration, revisions, permissions and audit history.', configured: Boolean(env.DB), status: env.DB ? 'available' : 'not_configured' },
    { key: 'FILES', name: 'Cloudflare R2', purpose: 'Stores approved business website images and other portal files.', configured: Boolean(env.FILES), status: env.FILES ? 'available' : 'not_configured' },
    { key: 'SOCIAL_CACHE', name: 'Cloudflare KV', purpose: 'Provides lightweight social and public-service caching.', configured: Boolean(env.SOCIAL_CACHE), status: env.SOCIAL_CACHE ? 'available' : 'not_configured' },
    { key: 'SOCIAL_QUEUE', name: 'Cloudflare Queue', purpose: 'Processes background social publishing and synchronization jobs.', configured: Boolean(env.SOCIAL_QUEUE), status: env.SOCIAL_QUEUE ? 'available' : 'not_configured' },
    { key: 'AI', name: 'Workers AI', purpose: 'Powers permission-aware assistance and reviewed content suggestions.', configured: Boolean(env.AI), status: env.AI ? 'available' : 'not_configured' },
    { key: 'EMAIL', name: 'Cloudflare Email', purpose: 'Delivers approved Staff Portal messages from configured senders.', configured: Boolean(env.EMAIL), status: env.EMAIL ? 'available' : 'not_configured' },
  ];
}

const apiCatalogue = [
  { name: 'Platform overview', method: 'GET', path: '/api/platform/overview', purpose: 'Returns the selected business integration health, safe connection metadata and website status.', permission: 'integrations.access', audience: 'Staff Portal', approval: 'View access required.' },
  { name: 'Save connection metadata', method: 'POST', path: '/api/platform/connections/save', purpose: 'Registers an integration without storing or returning the secret value.', permission: 'integrations.manage', audience: 'Staff Portal', approval: 'Manage access required.' },
  { name: 'Website site setup', method: 'POST', path: '/api/platform/websites/site', purpose: 'Configures the public business domain and managed-feed status.', permission: 'website.access', audience: 'Staff Portal', approval: 'Manage access required.' },
  { name: 'Website content revision', method: 'POST', path: '/api/platform/websites/content', purpose: 'Creates an immutable structured-content revision; raw HTML is not accepted.', permission: 'website.content', audience: 'Staff Portal', approval: 'Edit access required.' },
  { name: 'Website publication review', method: 'POST', path: '/api/platform/websites/review', purpose: 'Approves or rejects a submitted revision with an audited review note.', permission: 'website.publish', audience: 'Staff Portal', approval: 'Approve access required.' },
  { name: 'Publish approved revision', method: 'POST', path: '/api/platform/websites/publish', purpose: 'Publishes only an approved revision to an enabled managed feed.', permission: 'website.publish', audience: 'Staff Portal', approval: 'Manage access required.' },
  { name: 'Business website feed', method: 'GET', path: '/api/public/websites/{siteCode}/content', purpose: 'Returns published pages only for an enabled business website.', audience: 'Public business website', approval: 'No login; exact configured site controls CORS.' },
  { name: 'Business website media', method: 'GET', path: '/api/public/websites/{siteCode}/media/{assetId}', purpose: 'Streams an active published-site image directly from R2.', audience: 'Public business website', approval: 'No login; public caching enabled.' },
  { name: 'Website catalogue', method: 'GET', path: '/api/public/websites/{siteCode}/catalogue', purpose: 'Returns approved public catalogue entries linked to the same operational ERP services used for jobs and costing.', audience: 'Public business website', approval: 'No login; exact configured site controls CORS.' },
  { name: 'Connect operational catalogue item', method: 'POST', path: '/api/platform/websites/catalogue/connect', purpose: 'Links one eligible product, vehicle, property listing or service from the selected business ERP to its website without copying the operational record.', permission: 'website.catalog', audience: 'Staff Portal', approval: 'Edit access required.' },
  { name: 'Maintain Logistics service', method: 'POST', path: '/api/platform/websites/catalogue/logistics-service', purpose: 'Creates or updates a real Logistics service source that can later be linked to the Logistics website.', permission: 'logistics.services', audience: 'Staff Portal', approval: 'Edit access required.' },
  { name: 'Submit website inquiry', method: 'POST', path: '/api/public/websites/{siteCode}/inquiries', purpose: 'Receives a bounded, rate-limited public contact or quote request for staff review.', audience: 'Public business website', approval: 'No login; input validation and rate limit required.' },
  { name: 'Convert Printing inquiry', method: 'POST', path: '/api/platform/websites/inquiries/convert-printing', purpose: 'Converts one qualified Printing website inquiry into the existing customer and print-job workflow exactly once.', permission: 'website.inquiries', audience: 'Staff Portal', approval: 'Website inquiry Edit and Printing Create access required.' },
  { name: 'Public vacancies', method: 'GET', path: '/api/public/websites/{siteCode}/vacancies', purpose: 'Returns active vacancies maintained for the selected business website.', audience: 'Public business website', approval: 'No login; published site only.' },
  { name: 'Submit job application', method: 'POST', path: '/api/public/websites/{siteCode}/applications', purpose: 'Receives a bounded, rate-limited application for an active vacancy.', audience: 'Public business website', approval: 'No login; input validation and rate limit required.' },
  { name: 'Published website theme', method: 'GET', path: '/api/public/websites/{siteCode}/theme', purpose: 'Returns only the approved published theme version, including the approved logo and structured palette.', audience: 'Public business website', approval: 'No login; published site only.' },
  { name: 'Daenem Smart Help', method: 'POST', path: '/api/ai/guide/help', purpose: 'Answers only from the employee’s authorized function catalogue.', permission: 'ai_guide.access', audience: 'Staff Portal', approval: 'View access required.' },
  { name: 'Session context', method: 'GET', path: '/api/auth/me', purpose: 'Returns the signed-in employee’s assigned businesses, roles and effective permissions.', audience: 'Staff Portal', approval: 'Authenticated session required.' },
];

function visibleCatalogue(context: SessionContext, companyId: string) {
  return apiCatalogue.filter((entry) => !entry.permission || hasPermission(context, entry.permission, 'view', companyId));
}

async function overview(request: Request, env: Env, context: SessionContext) {
  const url = new URL(request.url);
  const companyId = text(url.searchParams.get('companyId'), 100);
  const company = companyFor(context, companyId);
  if (!company) return json({ error: 'This business is not assigned to your account.' }, 403);
  const canIntegrations = hasPermission(context, 'integrations.access', 'view', companyId);
  const canWebsite = hasPermission(context, 'website.access', 'view', companyId);
  const canCatalogue = canWebsite && hasPermission(context, 'website.catalog', 'view', companyId);
  const canInquiries = canWebsite && hasPermission(context, 'website.inquiries', 'view', companyId);
  const canCareers = canWebsite && hasPermission(context, 'website.careers', 'view', companyId);
  const canThemes = canWebsite && hasPermission(context, 'website.theme', 'view', companyId);
  const canAssignWebsiteWork = hasPermission(context, 'website.inquiries', 'edit', companyId) || hasPermission(context, 'website.careers', 'edit', companyId);
  if (!canIntegrations && !canWebsite) return json({ error: 'API & Integrations or Website Administration access is required.' }, 403);
  const [logLimit, catalogueLimit] = await Promise.all([
    settingNumber(env, 'integrations.request_log_limit', 100).then((value) => Math.min(200, value)),
    settingNumber(env, 'website.catalogue_source_limit', 250).then((value) => Math.min(500, value)),
  ]);
  const queries: Promise<unknown>[] = [
    canIntegrations ? env.DB.prepare(`SELECT id,connection_key AS connectionKey,name,category,provider,purpose,environment,auth_type AS authType,
      secret_binding_name AS secretBindingName,endpoint_base_url AS endpointBaseUrl,documentation_url AS documentationUrl,
      key_expires_at AS keyExpiresAt,status,webhook_status AS webhookStatus,last_success_at AS lastSuccessAt,
      last_failure_at AS lastFailureAt,last_failure_summary AS lastFailureSummary,average_response_ms AS averageResponseMs,
      active,updated_at AS updatedAt FROM integration_connections WHERE company_id=? ORDER BY active DESC,name LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canIntegrations ? env.DB.prepare(`SELECT pc.id,pc.platform,pc.display_name AS displayName,pc.handle,pc.status,pc.token_expires_at AS keyExpiresAt,
      pc.last_sync_at AS lastSuccessAt,pc.last_error AS lastFailureSummary,pc.updated_at AS updatedAt
      FROM social_platform_connections pc JOIN social_brands b ON b.id=pc.brand_id WHERE b.company_id=? ORDER BY pc.platform LIMIT 50`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canIntegrations ? env.DB.prepare(`SELECT id,name,event_type AS eventType,callback_path AS callbackPath,signing_secret_binding_name AS signingSecretBindingName,
      status,last_delivery_at AS lastDeliveryAt,last_status_code AS lastStatusCode,last_error_summary AS lastErrorSummary,updated_at AS updatedAt
      FROM integration_webhooks WHERE company_id=? ORDER BY updated_at DESC LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canWebsite ? env.DB.prepare(`SELECT id,company_id AS companyId,site_code AS siteCode,name,domain,preview_base_url AS previewBaseUrl,status,publishing_mode AS publishingMode,
      public_feed_enabled AS publicFeedEnabled,theme_key AS themeKey,last_published_at AS lastPublishedAt,updated_at AS updatedAt
      FROM website_sites WHERE company_id=?`).bind(companyId).first() : Promise.resolve(null),
    canWebsite ? env.DB.prepare(`SELECT p.id,p.site_id AS siteId,p.slug,p.title,p.menu_label AS menuLabel,p.summary,p.seo_title AS seoTitle,p.seo_description AS seoDescription,
      p.status,p.draft_content_json AS draftContentJson,p.published_content_json AS publishedContentJson,p.current_version_no AS currentVersionNo,
      p.published_version_no AS publishedVersionNo,p.updated_at AS updatedAt FROM website_pages p JOIN website_sites s ON s.id=p.site_id
      WHERE s.company_id=? ORDER BY p.updated_at DESC LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canWebsite ? env.DB.prepare(`SELECT r.id,r.page_id AS pageId,r.version_no AS versionNo,r.change_summary AS changeSummary,r.created_at AS createdAt,
      e.display_name AS createdByName FROM website_page_revisions r JOIN website_pages p ON p.id=r.page_id JOIN website_sites s ON s.id=p.site_id
      LEFT JOIN employees e ON e.id=r.created_by WHERE s.company_id=? ORDER BY r.created_at DESC LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canWebsite ? env.DB.prepare(`SELECT q.id,q.page_id AS pageId,q.revision_id AS revisionId,q.change_summary AS changeSummary,q.status,q.requested_at AS requestedAt,
      q.reviewed_at AS reviewedAt,q.review_note AS reviewNote,q.published_at AS publishedAt,requester.display_name AS requestedByName,
      reviewer.display_name AS reviewedByName FROM website_publish_requests q LEFT JOIN employees requester ON requester.id=q.requested_by
      LEFT JOIN employees reviewer ON reviewer.id=q.reviewed_by WHERE q.company_id=? ORDER BY q.requested_at DESC LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canWebsite ? env.DB.prepare(`SELECT m.id,m.filename,m.mime_type AS mimeType,m.size_bytes AS sizeBytes,m.alt_text AS altText,m.active,m.created_at AS createdAt
      FROM website_media_assets m JOIN website_sites s ON s.id=m.site_id WHERE s.company_id=? AND m.active=1 ORDER BY m.created_at DESC LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canCatalogue ? env.DB.prepare(`WITH sources AS (${catalogueSourcesSql})
      SELECT l.id,l.entity_type AS entityType,l.entity_id AS entityId,l.public_slug AS publicSlug,l.image_path AS imagePath,
      l.featured,l.active,l.sort_order AS sortOrder,l.updated_at AS updatedAt,src.code,src.name,src.category,src.description,
      src.pricingUnit,src.basePriceKobo,src.metadataJson,src.operationalStatus,src.operationalActive
      FROM website_catalog_links l JOIN website_sites s ON s.id=l.site_id
      LEFT JOIN sources src ON src.entityType=l.entity_type AND src.entityId=l.entity_id
      WHERE s.company_id=? ORDER BY l.featured DESC,l.sort_order,l.public_slug LIMIT ?`).bind(companyId, catalogueLimit).all() : Promise.resolve({ results: [] }),
    canCatalogue ? env.DB.prepare(`WITH sources AS (${catalogueSourcesSql})
      SELECT src.* FROM sources src WHERE src.companyId=? AND src.operationalActive=1
      AND NOT EXISTS(SELECT 1 FROM website_catalog_links l JOIN website_sites s ON s.id=l.site_id
        WHERE s.company_id=? AND l.entity_type=src.entityType AND l.entity_id=src.entityId)
      ORDER BY src.category,src.name LIMIT ?`).bind(companyId, companyId, catalogueLimit).all() : Promise.resolve({ results: [] }),
    canInquiries ? env.DB.prepare(`WITH sources AS (${catalogueSourcesSql})
      SELECT i.id,i.reference,i.inquiry_type AS inquiryType,i.service_entity_id AS serviceEntityId,i.name,
      i.company_name AS companyName,i.email,i.phone,i.whatsapp,i.quantity,i.specifications,i.message,i.source_path AS sourcePath,
      i.status,i.assigned_employee_id AS assignedEmployeeId,i.converted_customer_id AS convertedCustomerId,
      i.converted_print_job_id AS convertedPrintJobId,i.converted_at AS convertedAt,i.created_at AS createdAt,
      src.name AS serviceName,e.display_name AS assignedEmployeeName
      FROM website_inquiries i JOIN website_sites s ON s.id=i.site_id
      LEFT JOIN website_catalog_links l ON l.site_id=i.site_id AND l.entity_id=i.service_entity_id
      LEFT JOIN sources src ON src.entityType=l.entity_type AND src.entityId=l.entity_id
      LEFT JOIN employees e ON e.id=i.assigned_employee_id
      WHERE s.company_id=? ORDER BY CASE i.status WHEN 'new' THEN 0 WHEN 'qualified' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 200`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canCareers ? env.DB.prepare(`SELECT v.id,v.slug,v.title,v.employment_type AS employmentType,v.location,v.summary,v.requirements,
      v.active,v.sort_order AS sortOrder,v.closes_at AS closesAt,v.updated_at AS updatedAt
      FROM website_vacancies v JOIN website_sites s ON s.id=v.site_id WHERE s.company_id=? ORDER BY v.active DESC,v.sort_order,v.title LIMIT 100`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canCareers ? env.DB.prepare(`SELECT a.id,a.reference,a.vacancy_id AS vacancyId,a.name,a.email,a.phone,a.location,a.experience,
      a.portfolio_url AS portfolioUrl,a.status,a.assigned_employee_id AS assignedEmployeeId,a.notes,a.created_at AS createdAt,
      v.title AS vacancyTitle,e.display_name AS assignedEmployeeName
      FROM website_applications a JOIN website_sites s ON s.id=a.site_id JOIN website_vacancies v ON v.id=a.vacancy_id
      LEFT JOIN employees e ON e.id=a.assigned_employee_id WHERE s.company_id=? ORDER BY a.created_at DESC LIMIT 200`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canThemes ? env.DB.prepare(`SELECT t.id,t.version_no AS versionNo,t.theme_key AS themeKey,t.display_name AS displayName,t.logo_path AS logoPath,
      t.config_json AS configJson,t.change_summary AS changeSummary,t.status,t.created_at AS createdAt,e.display_name AS createdByName
      FROM website_theme_revisions t JOIN website_sites s ON s.id=t.site_id LEFT JOIN employees e ON e.id=t.created_by
      WHERE s.company_id=? ORDER BY t.version_no DESC LIMIT 50`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canThemes ? env.DB.prepare(`SELECT q.id,q.revision_id AS revisionId,q.status,q.requested_at AS requestedAt,q.reviewed_at AS reviewedAt,
      q.review_note AS reviewNote,q.published_at AS publishedAt,requester.display_name AS requestedByName,reviewer.display_name AS reviewedByName
      FROM website_theme_publish_requests q LEFT JOIN employees requester ON requester.id=q.requested_by
      LEFT JOIN employees reviewer ON reviewer.id=q.reviewed_by WHERE q.company_id=? ORDER BY q.requested_at DESC LIMIT 50`).bind(companyId).all() : Promise.resolve({ results: [] }),
    canAssignWebsiteWork ? env.DB.prepare(`SELECT DISTINCT e.id,e.display_name AS displayName,e.email FROM employees e JOIN employee_roles er ON er.employee_id=e.id
      WHERE er.company_id=? AND e.employment_status='active' ORDER BY e.display_name LIMIT 200`).bind(companyId).all() : Promise.resolve({ results: [] }),
  ];
  if (hasPermission(context, 'integrations.logs', 'view', companyId)) queries.push(env.DB.prepare(`SELECT id,connection_id AS connectionId,direction,operation,method,status_code AS statusCode,outcome,duration_ms AS durationMs,
    request_id AS requestId,error_summary AS errorSummary,occurred_at AS occurredAt FROM integration_request_logs WHERE company_id=? ORDER BY occurred_at DESC LIMIT ?`).bind(companyId, logLimit).all());
  const [connections, socialConnections, webhooks, site, pages, revisions, publishRequests, media, catalogue, availableCatalogue, inquiries, vacancies, applications, themes, themeRequests, websiteStaff, logs] = await Promise.all(queries) as Array<{ results?: unknown[] } | Record<string, unknown> | null>;
  const resultRows = (value: unknown) => (value && typeof value === 'object' && 'results' in value ? (value as { results?: unknown[] }).results || [] : []);
  return json({
    company,
    companies: context.companies.filter((item) => hasPermission(context, 'integrations.access', 'view', item.id) || hasPermission(context, 'website.access', 'view', item.id)),
    capabilities: {
      integrationsView: canIntegrations,
      integrationsManage: permitted(context, companyId, 'integrations.manage', 'manage'),
      integrationLogs: permitted(context, companyId, 'integrations.logs', 'view'),
      websiteView: canWebsite,
      websiteManage: permitted(context, companyId, 'website.access', 'manage'),
      websiteContent: permitted(context, companyId, 'website.content', 'edit'),
      websiteApprove: permitted(context, companyId, 'website.publish', 'approve'),
      websitePublish: permitted(context, companyId, 'website.publish', 'manage'),
      websiteCatalogView: permitted(context, companyId, 'website.catalog', 'view'),
      websiteCatalogEdit: permitted(context, companyId, 'website.catalog', 'edit'),
      websiteInquiriesView: permitted(context, companyId, 'website.inquiries', 'view'),
      websiteInquiriesEdit: permitted(context, companyId, 'website.inquiries', 'edit'),
      websiteCareersView: permitted(context, companyId, 'website.careers', 'view'),
      websiteCareersEdit: permitted(context, companyId, 'website.careers', 'edit'),
      websiteThemeView: permitted(context, companyId, 'website.theme', 'view'),
      websiteThemeEdit: permitted(context, companyId, 'website.theme', 'edit'),
      websiteThemeApprove: permitted(context, companyId, 'website.theme', 'approve'),
      websiteThemePublish: permitted(context, companyId, 'website.theme', 'manage'),
      printingCreate: permitted(context, companyId, 'printing.access', 'create'),
      logisticsServicesEdit: permitted(context, companyId, 'logistics.services', 'edit'),
    },
    bindings: canIntegrations ? bindingHealth(env) : [],
    apiCatalogue: canIntegrations ? visibleCatalogue(context, companyId) : [],
    connections: canIntegrations ? resultRows(connections) : [],
    socialConnections: canIntegrations ? resultRows(socialConnections).map((row) => ({ ...(row as object), source: 'Daenem Social Engine', authType: 'oauth', secretValuesExposed: false })) : [],
    webhooks: canIntegrations ? resultRows(webhooks) : [],
    logs: canIntegrations ? resultRows(logs) : [],
    website: canWebsite ? {
      site, pages: resultRows(pages), revisions: resultRows(revisions), publishRequests: resultRows(publishRequests), media: resultRows(media),
      catalogue: permitted(context, companyId, 'website.catalog', 'view') ? catalogueRows(catalogue) : [],
      availableCatalogue: permitted(context, companyId, 'website.catalog', 'view') ? catalogueRows(availableCatalogue) : [],
      inquiries: permitted(context, companyId, 'website.inquiries', 'view') ? resultRows(inquiries) : [],
      vacancies: permitted(context, companyId, 'website.careers', 'view') ? resultRows(vacancies) : [],
      applications: permitted(context, companyId, 'website.careers', 'view') ? resultRows(applications) : [],
      themes: permitted(context, companyId, 'website.theme', 'view') ? resultRows(themes).map((row) => { const item = row as Record<string, unknown>; let config: unknown = {}; try { config = JSON.parse(String(item.configJson || '{}')); } catch {} const { configJson: _removed, ...safe } = item; return { ...safe, config }; }) : [],
      themeRequests: permitted(context, companyId, 'website.theme', 'view') ? resultRows(themeRequests) : [],
      staff: permitted(context, companyId, 'website.inquiries', 'edit') || permitted(context, companyId, 'website.careers', 'edit') ? resultRows(websiteStaff) : [],
      consolidation: { legacyPrintingAdminReintroduced: false, catalogueSource: catalogueSourceName(companyId), inquiryConversionTarget: companyId === 'company-printing' ? 'Customers + Printing jobs' : 'Business-scoped inquiry inbox', socialSource: 'Daenem Social Engine', auditSource: 'Group Audit Logs' },
    } : null,
    security: { secretValuesStored: false, secretValuesReturned: false, note: 'Credentials stay in Cloudflare Worker secrets. Only safe binding names and status metadata are shown.' },
  });
}

async function saveConnection(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid connection request.' }, 400);
  const companyId = text(value.companyId, 100);
  const denied = requireCompany(context, companyId, 'integrations.manage', 'manage');
  if (denied) return denied;
  const name = text(value.name, 120), purpose = text(value.purpose, 1000), connectionKey = slug(value.connectionKey || name);
  const category = text(value.category, 30), environment = text(value.environment || 'production', 30), authType = text(value.authType || 'worker_secret', 30);
  const endpointBaseUrl = httpsUrl(value.endpointBaseUrl), documentationUrl = httpsUrl(value.documentationUrl);
  const secretBindingName = text(value.secretBindingName, 81) || null;
  if (name.length < 2 || purpose.length < 5) return json({ error: 'Connection name and a clear purpose are required.' }, 400);
  if (!categories.has(category) || !environments.has(environment) || !authTypes.has(authType)) return json({ error: 'Choose a supported category, environment and authorization type.' }, 400);
  if (endpointBaseUrl === undefined || documentationUrl === undefined) return json({ error: 'Connection and documentation links must be valid HTTPS URLs.' }, 400);
  if (secretBindingName && !secretBindingPattern.test(secretBindingName)) return json({ error: 'Secret binding names must use uppercase letters, numbers and underscores, for example PAYMENT_API_KEY.' }, 400);
  if (authType === 'worker_secret' && !secretBindingName) return json({ error: 'Enter the Cloudflare Worker secret binding name. Do not enter the secret value.' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM integration_connections WHERE company_id=? AND connection_key=?').bind(companyId, connectionKey).first<{ id: string }>();
  const id = existing?.id || uid('integration');
  await env.DB.prepare(`INSERT INTO integration_connections(id,company_id,connection_key,name,category,provider,purpose,environment,auth_type,secret_binding_name,
    endpoint_base_url,documentation_url,status,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'configured',1,?,?)
    ON CONFLICT(company_id,connection_key) DO UPDATE SET name=excluded.name,category=excluded.category,provider=excluded.provider,purpose=excluded.purpose,
    environment=excluded.environment,auth_type=excluded.auth_type,secret_binding_name=excluded.secret_binding_name,endpoint_base_url=excluded.endpoint_base_url,
    documentation_url=excluded.documentation_url,status=CASE WHEN integration_connections.status='disabled' THEN 'disabled' ELSE 'configured' END,
    active=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, companyId, connectionKey, name, category, text(value.provider, 120) || null, purpose, environment, authType, secretBindingName,
      endpointBaseUrl, documentationUrl, context.employee.id, context.employee.id).run();
  await Promise.all([audit(env, context, companyId, existing ? 'update_connection' : 'create_connection', 'integration_connection', id, { connectionKey, name, category, environment, authType, secretBindingName, secretValueStored: false }), integrationLog(env, companyId, id, 'save_connection_metadata', 'success', existing ? 200 : 201)]);
  return json({ ok: true, id, status: 'configured', secretValueStored: false }, existing ? 200 : 201);
}

async function toggleConnection(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid connection status request.' }, 400);
  const companyId = text(value.companyId, 100), id = text(value.id, 120), enabled = Boolean(value.enabled);
  const denied = requireCompany(context, companyId, 'integrations.manage', 'manage');
  if (denied) return denied;
  const found = await env.DB.prepare('SELECT id FROM integration_connections WHERE id=? AND company_id=?').bind(id, companyId).first();
  if (!found) return json({ error: 'Connection not found in this business.' }, 404);
  await env.DB.prepare(`UPDATE integration_connections SET status=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`)
    .bind(enabled ? 'configured' : 'disabled', enabled ? 1 : 0, context.employee.id, id, companyId).run();
  await Promise.all([audit(env, context, companyId, enabled ? 'enable_connection' : 'disable_connection', 'integration_connection', id, { enabled }), integrationLog(env, companyId, id, 'toggle_connection', 'success', 200)]);
  return json({ ok: true, status: enabled ? 'configured' : 'disabled' });
}

async function saveSite(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website setup request.' }, 400);
  const companyId = text(value.companyId, 100), denied = requireCompany(context, companyId, 'website.access', 'manage');
  if (denied) return denied;
  const site = await env.DB.prepare('SELECT id FROM website_sites WHERE company_id=?').bind(companyId).first<{ id: string }>();
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const domain = normalizedDomain(value.domain), previewBaseUrl = httpsUrl(value.previewBaseUrl), enabled = Boolean(value.publicFeedEnabled);
  if (domain === undefined) return json({ error: 'Enter a valid business website domain. Staff Portal and Farms domains cannot be assigned.' }, 400);
  if (previewBaseUrl === undefined) return json({ error: 'Preview link must be a valid HTTPS URL.' }, 400);
  if (enabled && !domain) return json({ error: 'Configure the business website domain before enabling the public content feed.' }, 409);
  const name = text(value.name, 140);
  if (name.length < 3) return json({ error: 'Website name is required.' }, 400);
  await env.DB.prepare(`UPDATE website_sites SET name=?,domain=?,preview_base_url=?,public_feed_enabled=?,publishing_mode='managed_feed',
    status=CASE WHEN ?=1 THEN CASE WHEN status='active' THEN 'active' ELSE 'draft' END ELSE 'setup_required' END,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(name, domain, previewBaseUrl, enabled ? 1 : 0, enabled ? 1 : 0, site.id).run();
  await audit(env, context, companyId, 'update_website_setup', 'website_site', site.id, { name, domain, previewBaseUrl, publicFeedEnabled: enabled, protectedPortalsUntouched: true });
  return json({ ok: true, id: site.id, publicFeedEnabled: enabled });
}

async function savePage(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website page request.' }, 400);
  const companyId = text(value.companyId, 100), denied = requireCompany(context, companyId, 'website.content', value.id ? 'edit' : 'create');
  if (denied) return denied;
  const site = await env.DB.prepare('SELECT id FROM website_sites WHERE company_id=?').bind(companyId).first<{ id: string }>();
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const pageSlug = slug(value.slug), title = text(value.title, 160);
  if (title.length < 2) return json({ error: 'Page title is required.' }, 400);
  const requestedId = text(value.id, 120);
  const existing = requestedId ? await env.DB.prepare('SELECT id FROM website_pages WHERE id=? AND site_id=?').bind(requestedId, site.id).first<{ id: string }>() : null;
  if (requestedId && !existing) return json({ error: 'Website page not found in this business.' }, 404);
  const id = existing?.id || uid('website-page');
  try {
    if (existing) await env.DB.prepare(`UPDATE website_pages SET slug=?,title=?,menu_label=?,summary=?,seo_title=?,seo_description=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND site_id=?`)
      .bind(pageSlug, title, text(value.menuLabel, 100) || null, text(value.summary, 500) || null, text(value.seoTitle, 160) || null, text(value.seoDescription, 320) || null, context.employee.id, id, site.id).run();
    else await env.DB.prepare(`INSERT INTO website_pages(id,site_id,slug,title,menu_label,summary,seo_title,seo_description,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, site.id, pageSlug, title, text(value.menuLabel, 100) || null, text(value.summary, 500) || null, text(value.seoTitle, 160) || null, text(value.seoDescription, 320) || null, context.employee.id, context.employee.id).run();
  } catch { return json({ error: 'This website already has a page with that address.' }, 409); }
  await audit(env, context, companyId, existing ? 'update_page' : 'create_page', 'website_page', id, { slug: pageSlug, title });
  return json({ ok: true, id, slug: pageSlug }, existing ? 200 : 201);
}

function contentPayload(value: Body) {
  const primaryActionUrl = httpsUrl(value.primaryActionUrl);
  if (primaryActionUrl === undefined) return { error: 'Primary action link must be a valid HTTPS URL.' };
  const payload = {
    heroTitle: text(value.heroTitle, 180),
    heroText: text(value.heroText, 1200),
    primaryActionLabel: text(value.primaryActionLabel, 80),
    primaryActionUrl,
    body: text(value.body, 20000),
    heroImageAssetId: text(value.heroImageAssetId, 120) || null,
  };
  if (!payload.heroTitle && !payload.body) return { error: 'Add a hero title or page body before saving a revision.' };
  if ([payload.heroTitle, payload.heroText, payload.primaryActionLabel, payload.body].some((field) => /<\/?[a-z][^>]*>/i.test(field))) return { error: 'Raw HTML is not accepted. Enter clear plain text; the business website controls presentation.' };
  return { payload };
}

async function saveContent(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website content request.' }, 400);
  const companyId = text(value.companyId, 100), pageId = text(value.pageId, 120), denied = requireCompany(context, companyId, 'website.content', 'edit');
  if (denied) return denied;
  const page = await env.DB.prepare(`SELECT p.id,p.site_id AS siteId,p.current_version_no AS currentVersionNo FROM website_pages p JOIN website_sites s ON s.id=p.site_id WHERE p.id=? AND s.company_id=?`)
    .bind(pageId, companyId).first<{ id: string; siteId: string; currentVersionNo: number }>();
  if (!page) return json({ error: 'Website page not found in this business.' }, 404);
  const parsed = contentPayload(value);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  if (parsed.payload.heroImageAssetId) {
    const asset = await env.DB.prepare('SELECT id FROM website_media_assets WHERE id=? AND site_id=? AND active=1').bind(parsed.payload.heroImageAssetId, page.siteId).first();
    if (!asset) return json({ error: 'The selected image is not available in this business website.' }, 400);
  }
  const changeSummary = text(value.changeSummary, 500);
  if (changeSummary.length < 3) return json({ error: 'Describe what changed in this revision.' }, 400);
  const versionNo = Number(page.currentVersionNo || 0) + 1, revisionId = uid('website-revision'), contentJson = JSON.stringify(parsed.payload);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO website_page_revisions(id,page_id,version_no,content_json,change_summary,created_by) VALUES(?,?,?,?,?,?)`).bind(revisionId, page.id, versionNo, contentJson, changeSummary, context.employee.id),
    env.DB.prepare(`UPDATE website_pages SET draft_content_json=?,current_version_no=?,status='draft',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(contentJson, versionNo, context.employee.id, page.id),
  ]);
  await audit(env, context, companyId, 'create_content_revision', 'website_page_revision', revisionId, { pageId, versionNo, changeSummary, structuredContentOnly: true });
  return json({ ok: true, revisionId, versionNo }, 201);
}

async function submitReview(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid publication request.' }, 400);
  const companyId = text(value.companyId, 100), pageId = text(value.pageId, 120), denied = requireCompany(context, companyId, 'website.content', 'edit');
  if (denied) return denied;
  const page = await env.DB.prepare(`SELECT p.id,p.site_id AS siteId,r.id AS revisionId,r.change_summary AS changeSummary FROM website_pages p JOIN website_sites s ON s.id=p.site_id
    LEFT JOIN website_page_revisions r ON r.page_id=p.id AND r.version_no=p.current_version_no WHERE p.id=? AND s.company_id=?`).bind(pageId, companyId).first<{ id: string; siteId: string; revisionId?: string; changeSummary?: string }>();
  if (!page?.revisionId) return json({ error: 'Save a content revision before submitting this page.' }, 409);
  const pending = await env.DB.prepare(`SELECT id FROM website_publish_requests WHERE page_id=? AND status IN ('pending','approved')`).bind(pageId).first();
  if (pending) return json({ error: 'This page already has a publication request waiting for review or publishing.' }, 409);
  const id = uid('website-publish');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO website_publish_requests(id,company_id,site_id,page_id,revision_id,change_summary,requested_by) VALUES(?,?,?,?,?,?,?)`).bind(id, companyId, page.siteId, page.id, page.revisionId, text(value.changeSummary, 500) || page.changeSummary || 'Website content update', context.employee.id),
    env.DB.prepare(`UPDATE website_pages SET status='in_review',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, page.id),
  ]);
  await audit(env, context, companyId, 'submit_for_website_review', 'website_publish_request', id, { pageId, revisionId: page.revisionId });
  return json({ ok: true, id, status: 'pending' }, 201);
}

async function reviewPublication(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid review request.' }, 400);
  const companyId = text(value.companyId, 100), requestId = text(value.requestId, 120), decision = text(value.decision, 20), denied = requireCompany(context, companyId, 'website.publish', 'approve');
  if (denied) return denied;
  if (!['approved', 'rejected'].includes(decision)) return json({ error: 'Choose Approve or Reject.' }, 400);
  const found = await env.DB.prepare(`SELECT id,page_id AS pageId,requested_by AS requestedBy FROM website_publish_requests WHERE id=? AND company_id=? AND status='pending'`).bind(requestId, companyId).first<{ id: string; pageId: string; requestedBy: string }>();
  if (!found) return json({ error: 'Pending publication request not found.' }, 404);
  if (decision === 'approved' && found.requestedBy === context.employee.id) return json({ error: 'The employee who submitted this revision cannot approve it. Assign an independent authorized reviewer.' }, 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE website_publish_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=? AND status='pending'`).bind(decision, context.employee.id, text(value.note, 1000) || null, found.id),
    env.DB.prepare(`UPDATE website_pages SET status=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(decision === 'approved' ? 'approved' : 'draft', context.employee.id, found.pageId),
  ]);
  await audit(env, context, companyId, `website_${decision}`, 'website_publish_request', found.id, { note: text(value.note, 1000) || null });
  return json({ ok: true, status: decision });
}

async function publish(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid publish request.' }, 400);
  const companyId = text(value.companyId, 100), requestId = text(value.requestId, 120), denied = requireCompany(context, companyId, 'website.publish', 'manage');
  if (denied) return denied;
  const found = await env.DB.prepare(`SELECT q.id,q.page_id AS pageId,q.revision_id AS revisionId,r.version_no AS versionNo,r.content_json AS contentJson,
    s.id AS siteId,s.domain,s.public_feed_enabled AS publicFeedEnabled FROM website_publish_requests q JOIN website_page_revisions r ON r.id=q.revision_id
    JOIN website_sites s ON s.id=q.site_id WHERE q.id=? AND q.company_id=? AND q.status='approved'`).bind(requestId, companyId).first<{ id: string; pageId: string; revisionId: string; versionNo: number; contentJson: string; siteId: string; domain?: string; publicFeedEnabled: number }>();
  if (!found) return json({ error: 'An approved publication request is required.' }, 409);
  const domain = normalizedDomain(found.domain);
  if (!found.publicFeedEnabled || !domain) return json({ error: 'Configure the business domain and enable the public content feed before publishing.' }, 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE website_pages SET published_content_json=?,published_version_no=?,status='published',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found.contentJson, found.versionNo, context.employee.id, found.pageId),
    env.DB.prepare(`UPDATE website_publish_requests SET status='published',published_by=?,published_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'`).bind(context.employee.id, found.id),
    env.DB.prepare(`UPDATE website_sites SET status='active',last_published_at=CURRENT_TIMESTAMP,last_published_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, found.siteId),
  ]);
  await audit(env, context, companyId, 'publish_website_revision', 'website_publish_request', found.id, { pageId: found.pageId, revisionId: found.revisionId, versionNo: found.versionNo, domain });
  return json({ ok: true, status: 'published', versionNo: found.versionNo });
}

async function uploadMedia(request: Request, env: Env, context: SessionContext) {
  const configuredMax = Math.min(5 * 1024 * 1024, await settingNumber(env, 'website.media_max_bytes', 5 * 1024 * 1024));
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > configuredMax + 256 * 1024) return json({ error: 'Upload is larger than the 5 MB website media limit.' }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: 'Invalid website media upload.' }, 400); }
  const companyId = text(form.get('companyId'), 100), denied = requireCompany(context, companyId, 'website.content', 'create');
  if (denied) return denied;
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 1) return json({ error: 'Choose a non-empty image file.' }, 400);
  if (file.size > configuredMax) return json({ error: 'Upload is larger than the 5 MB website media limit.' }, 413);
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
  if (!allowed.has(file.type)) return json({ error: 'Website media accepts JPEG, PNG, WebP or GIF images.' }, 415);
  const altText = text(form.get('altText'), 500);
  if (altText.length < 3) return json({ error: 'Add clear alternative text describing this image.' }, 400);
  const site = await env.DB.prepare('SELECT id,site_code AS siteCode FROM website_sites WHERE company_id=?').bind(companyId).first<{ id: string; siteCode: string }>();
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const id = uid('website-media'), filename = safeFileName(file.name), key = `websites/${site.siteCode}/${new Date().toISOString().slice(0, 10)}/${id}-${filename}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { siteId: site.id, uploadedBy: context.employee.id, altText } });
  try {
    await env.DB.prepare(`INSERT INTO website_media_assets(id,site_id,r2_key,filename,mime_type,size_bytes,alt_text,created_by) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(id, site.id, key, filename, file.type, file.size, altText, context.employee.id).run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  await audit(env, context, companyId, 'upload_website_media', 'website_media_asset', id, { filename, mimeType: file.type, sizeBytes: file.size, altText });
  return json({ ok: true, media: { id, filename, mimeType: file.type, sizeBytes: file.size, altText } }, 201);
}

async function siteForCompany(env: Env, companyId: string) {
  return env.DB.prepare(`SELECT id,site_code AS siteCode,company_id AS companyId FROM website_sites WHERE company_id=?`)
    .bind(companyId).first<{ id: string; siteCode: string; companyId: string }>();
}

async function saveCatalogueLink(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website catalogue request.' }, 400);
  const companyId = text(value.companyId, 100), id = text(value.id, 120);
  const denied = requireCompany(context, companyId, 'website.catalog', 'edit');
  if (denied) return denied;
  const found = await env.DB.prepare(`SELECT l.id,l.entity_id AS entityId,l.entity_type AS entityType FROM website_catalog_links l
    JOIN website_sites s ON s.id=l.site_id WHERE l.id=? AND s.company_id=?`).bind(id, companyId).first<{ id: string; entityId: string; entityType: string }>();
  if (!found) return json({ error: 'Catalogue entry not found in this business website.' }, 404);
  const source = await catalogueSource(env, companyId, found.entityType, found.entityId);
  if (!source) return json({ error: 'The linked operational record is no longer available in this business.' }, 409);
  if (value.active && Number(source.operationalActive) !== 1) return json({ error: 'This operational record is not currently eligible for public display. Update its ERP status first.' }, 409);
  const publicSlug = slug(value.publicSlug), imagePath = plain(value.imagePath, 500);
  if (imagePath === undefined || (imagePath && !imagePath.startsWith('/assets/'))) return json({ error: 'Catalogue image path must be a safe /assets/ path.' }, 400);
  const sortOrder = Math.max(0, Math.min(100000, Math.round(number(value.sortOrder))));
  try {
    await env.DB.prepare(`UPDATE website_catalog_links SET public_slug=?,image_path=?,featured=?,active=?,sort_order=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(publicSlug, imagePath || null, value.featured ? 1 : 0, value.active ? 1 : 0, sortOrder, context.employee.id, found.id).run();
  } catch { return json({ error: 'This public catalogue address is already in use.' }, 409); }
  await audit(env, context, companyId, 'update_website_catalogue', 'website_catalog_link', found.id, { entityType: found.entityType, entityId: found.entityId, publicSlug, featured: Boolean(value.featured), active: Boolean(value.active), sortOrder });
  return json({ ok: true, id: found.id });
}

async function connectCatalogueSource(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid operational catalogue connection request.' }, 400);
  const companyId = text(value.companyId, 100), entityType = text(value.entityType, 40), entityId = text(value.entityId, 120);
  const denied = requireCompany(context, companyId, 'website.catalog', 'edit');
  if (denied) return denied;
  if (catalogueEntityCompanies[entityType] !== companyId) return json({ error: 'This operational source type does not belong to the selected business.' }, 400);
  const site = await siteForCompany(env, companyId);
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const source = await catalogueSource(env, companyId, entityType, entityId);
  if (!source) return json({ error: 'Operational catalogue record not found in the selected business.' }, 404);
  if (Number(source.operationalActive) !== 1) return json({ error: 'This operational record is not currently eligible for public display.' }, 409);
  const publicSlug = slug(value.publicSlug || source.code || source.name), id = uid('website-catalogue');
  const imagePath = plain(value.imagePath, 500);
  if (imagePath === undefined || (imagePath && !imagePath.startsWith('/assets/'))) return json({ error: 'Catalogue image path must be a safe /assets/ path.' }, 400);
  const sortOrder = Math.max(0, Math.min(100000, Math.round(number(value.sortOrder, 100))));
  try {
    await env.DB.prepare(`INSERT INTO website_catalog_links(id,site_id,entity_type,entity_id,public_slug,image_path,featured,active,sort_order,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, site.id, entityType, entityId, publicSlug, imagePath || null, value.featured ? 1 : 0, 1, sortOrder, context.employee.id, context.employee.id).run();
  } catch { return json({ error: 'This operational record is already linked or the public address is already in use.' }, 409); }
  await audit(env, context, companyId, 'connect_website_catalogue_source', 'website_catalog_link', id, { entityType, entityId, publicSlug, operationalRecordCopied: false });
  return json({ ok: true, id, publicSlug }, 201);
}

async function saveLogisticsService(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid Logistics service request.' }, 400);
  const companyId = text(value.companyId, 100);
  const websiteDenied = requireCompany(context, companyId, 'website.catalog', 'edit');
  if (websiteDenied) return websiteDenied;
  const logisticsDenied = requireCompany(context, companyId, 'logistics.services', 'edit');
  if (logisticsDenied) return logisticsDenied;
  if (companyId !== 'company-logistics') return json({ error: 'Logistics services can be maintained only in the Daenem Logistics workspace.' }, 409);
  const name = plain(value.name, 180), description = plain(value.description, 2000), code = text(value.code || name, 60).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const category = text(value.category || 'delivery', 30), pricingUnit = text(value.pricingUnit || 'job', 30);
  const categories = new Set(['delivery', 'haulage', 'moving', 'distribution', 'courier', 'specialized', 'other']);
  const pricingUnits = new Set(['job', 'trip', 'kilometre', 'kilogram', 'tonne', 'hour', 'day', 'vehicle']);
  if (name === undefined || description === undefined) return json({ error: 'Logistics service fields must use plain text.' }, 400);
  if (!name || !description || !code) return json({ error: 'Service name, code and clear description are required.' }, 400);
  if (!categories.has(category) || !pricingUnits.has(pricingUnit)) return json({ error: 'Choose a supported Logistics category and pricing unit.' }, 400);
  const requestedId = text(value.id, 120);
  const found = requestedId ? await env.DB.prepare(`SELECT id FROM logistics_services WHERE id=? AND company_id=?`).bind(requestedId, companyId).first<{ id: string }>() : null;
  if (requestedId && !found) return json({ error: 'Logistics service not found.' }, 404);
  const id = found?.id || uid('logistics-service'), priceKobo = Math.max(0, Math.round(number(value.basePriceNaira) * 100)), active = value.active === false ? 0 : 1;
  try {
    if (found) await env.DB.prepare(`UPDATE logistics_services SET code=?,name=?,category=?,description=?,pricing_unit=?,base_price_kobo=?,active=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(code, name, category, description, pricingUnit, priceKobo, active, context.employee.id, id).run();
    else await env.DB.prepare(`INSERT INTO logistics_services(id,company_id,code,name,category,description,pricing_unit,base_price_kobo,active,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id, companyId, code, name, category, description, pricingUnit, priceKobo, active, context.employee.id, context.employee.id).run();
  } catch { return json({ error: 'A Logistics service already uses this code.' }, 409); }
  await audit(env, context, companyId, found ? 'update_logistics_service' : 'create_logistics_service', 'logistics_service', id, { code, name, category, pricingUnit, basePriceKobo: priceKobo, active: Boolean(active), websiteRecordCopied: false });
  return json({ ok: true, id }, found ? 200 : 201);
}

async function updateInquiry(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website inquiry update.' }, 400);
  const companyId = text(value.companyId, 100), id = text(value.id, 120), status = text(value.status, 30);
  const denied = requireCompany(context, companyId, 'website.inquiries', 'edit');
  if (denied) return denied;
  if (!inquiryStatuses.has(status) || status === 'converted') return json({ error: 'Choose New, Qualified, In progress, Closed or Spam. Converted is set only by ERP conversion.' }, 400);
  const found = await env.DB.prepare(`SELECT i.id,i.status FROM website_inquiries i JOIN website_sites s ON s.id=i.site_id WHERE i.id=? AND s.company_id=?`)
    .bind(id, companyId).first<{ id: string; status: string }>();
  if (!found) return json({ error: 'Website inquiry not found in this business.' }, 404);
  if (found.status === 'converted' && status !== 'converted') return json({ error: 'A converted inquiry remains linked to its ERP job and cannot be moved back.' }, 409);
  const assignedEmployeeId = text(value.assignedEmployeeId, 120) || null;
  if (assignedEmployeeId) {
    const assigned = await env.DB.prepare(`SELECT 1 ok FROM employee_roles WHERE employee_id=? AND company_id=? LIMIT 1`).bind(assignedEmployeeId, companyId).first();
    if (!assigned) return json({ error: 'Assigned employee does not work in this business.' }, 400);
  }
  await env.DB.prepare(`UPDATE website_inquiries SET status=?,assigned_employee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(status, assignedEmployeeId, found.id).run();
  await audit(env, context, companyId, 'update_website_inquiry', 'website_inquiry', found.id, { beforeStatus: found.status, status, assignedEmployeeId });
  return json({ ok: true, id: found.id, status });
}

async function convertPrintingInquiry(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid Printing inquiry conversion request.' }, 400);
  const companyId = text(value.companyId, 100), inquiryId = text(value.id, 120);
  const inquiryDenied = requireCompany(context, companyId, 'website.inquiries', 'edit');
  if (inquiryDenied) return inquiryDenied;
  const printDenied = requireCompany(context, companyId, 'printing.access', 'create');
  if (printDenied) return printDenied;
  if (companyId !== 'company-printing') return json({ error: 'This conversion is available only for the Daenem Printing website.' }, 409);
  const existing = await env.DB.prepare(`SELECT customer_id AS customerId,print_job_id AS printJobId FROM website_inquiry_conversions WHERE inquiry_id=?`)
    .bind(inquiryId).first<{ customerId: string; printJobId: string }>();
  if (existing) return json({ ok: true, alreadyConverted: true, ...existing });
  const inquiry = await env.DB.prepare(`SELECT i.id,i.reference,i.inquiry_type AS inquiryType,i.service_entity_id AS serviceId,i.name,i.company_name AS companyName,
    i.email,i.phone,i.whatsapp,i.quantity,i.specifications,i.message,i.status FROM website_inquiries i JOIN website_sites s ON s.id=i.site_id
    WHERE i.id=? AND s.company_id=?`).bind(inquiryId, companyId).first<Record<string, unknown>>();
  if (!inquiry) return json({ error: 'Website inquiry not found in Daenem Printing.' }, 404);
  if (['closed', 'spam'].includes(String(inquiry.status))) return json({ error: 'Reopen or qualify this inquiry before converting it to the Printing ERP.' }, 409);
  const serviceId = text(inquiry.serviceId, 120) || null;
  const service = serviceId ? await env.DB.prepare(`SELECT id,name,pricing_unit AS pricingUnit FROM printing_services WHERE id=? AND company_id=? AND active=1`)
    .bind(serviceId, companyId).first<{ id: string; name: string; pricingUnit: string }>() : null;
  if (serviceId && !service) return json({ error: 'The requested Printing service is no longer active.' }, 409);
  let customer = await env.DB.prepare(`SELECT id,customer_no AS customerNo FROM customers WHERE company_id=? AND active=1
    AND ((?!='' AND lower(email)=lower(?)) OR (?!='' AND (phone=? OR whatsapp=?))) ORDER BY created_at LIMIT 1`)
    .bind(companyId, text(inquiry.email, 320), text(inquiry.email, 320), text(inquiry.phone, 80), text(inquiry.phone, 80), text(inquiry.phone, 80)).first<{ id: string; customerNo?: string }>();
  const customerId = customer?.id || uid('customer');
  const compactReference = text(inquiry.reference, 80).replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  const customerNo = customer?.customerNo || `WEB-CUST-${compactReference}`.slice(0, 80);
  const printJobId = uid('print-job'), jobNo = `DP-${compactReference}`.slice(0, 80);
  const title = `${service?.name || 'Website request'} — ${text(inquiry.name, 160)}`.slice(0, 240);
  const description = [`Website inquiry ${inquiry.reference}`, text(inquiry.specifications, 5000), text(inquiry.message, 5000)].filter(Boolean).join('\n\n').slice(0, 10000);
  const statements = [
    env.DB.prepare(`INSERT INTO website_inquiry_conversions(inquiry_id,converted_by) VALUES(?,?)`).bind(inquiryId, context.employee.id),
  ];
  if (!customer) statements.push(env.DB.prepare(`INSERT INTO customers(id,company_id,customer_no,name,business_name,phone,whatsapp,email,customer_type,notes,created_by)
    VALUES(?,?,?,?,?,?,?,?, 'retail',?,?)`).bind(customerId, companyId, customerNo, text(inquiry.name, 160), text(inquiry.companyName, 200) || null,
      text(inquiry.phone, 80) || null, text(inquiry.whatsapp, 80) || null, text(inquiry.email, 320) || null, `Created from website inquiry ${inquiry.reference}.`, context.employee.id));
  statements.push(
    env.DB.prepare(`INSERT INTO print_jobs(id,company_id,location_id,customer_id,service_id,job_no,title,description,quantity,unit,production_status,internal_note,created_by)
      VALUES(?,?,'location-printing-hq',?,?,?,?,?,?,?,'enquiry',?,?)`).bind(printJobId, companyId, customerId, service?.id || null, jobNo, title, description || null,
        Math.max(1, number(inquiry.quantity, 1)), service?.pricingUnit || 'job', `Source: website inquiry ${inquiry.reference}. Conversion preserves one public request to one Printing ERP job.`, context.employee.id),
    env.DB.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by,note) VALUES(?,?,NULL,'enquiry',?,'Converted from approved website inquiry')`).bind(uid('print-event'), printJobId, context.employee.id),
    env.DB.prepare(`UPDATE website_inquiries SET status='converted',converted_customer_id=?,converted_print_job_id=?,converted_by=?,converted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(customerId, printJobId, context.employee.id, inquiryId),
    env.DB.prepare(`UPDATE website_inquiry_conversions SET customer_id=?,print_job_id=? WHERE inquiry_id=?`).bind(customerId, printJobId, inquiryId),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id)
      VALUES(?,?,?,'platform_center','convert_printing_inquiry','website_inquiry',?,?,'web',?)`).bind(uid('audit'), context.employee.id, companyId, inquiryId, JSON.stringify({ reference: inquiry.reference, customerId, printJobId, jobNo, serviceId: service?.id || null, duplicateOperationalOrderCreated: false }), crypto.randomUUID()),
  );
  try { await env.DB.batch(statements); } catch (error) {
    const raced = await env.DB.prepare(`SELECT customer_id AS customerId,print_job_id AS printJobId FROM website_inquiry_conversions WHERE inquiry_id=?`).bind(inquiryId).first();
    if (raced) return json({ ok: true, alreadyConverted: true, ...raced });
    throw error;
  }
  return json({ ok: true, customerId, printJobId, jobNo }, 201);
}

async function saveVacancy(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid vacancy request.' }, 400);
  const companyId = text(value.companyId, 100), denied = requireCompany(context, companyId, 'website.careers', 'edit');
  if (denied) return denied;
  const site = await siteForCompany(env, companyId);
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const title = plain(value.title, 180), summary = plain(value.summary, 2000), employmentType = plain(value.employmentType, 80), location = plain(value.location, 180);
  const requirements = plain(value.requirements, 5000), closesAt = text(value.closesAt, 40) || null;
  if (title === undefined || summary === undefined || employmentType === undefined || location === undefined || requirements === undefined) return json({ error: 'Vacancy fields must use plain text.' }, 400);
  if (!title || !summary || !employmentType || !location) return json({ error: 'Title, employment type, location and clear summary are required.' }, 400);
  const requestedId = text(value.id, 120), found = requestedId ? await env.DB.prepare(`SELECT id FROM website_vacancies WHERE id=? AND site_id=?`).bind(requestedId, site.id).first<{ id: string }>() : null;
  if (requestedId && !found) return json({ error: 'Vacancy not found in this business website.' }, 404);
  const id = found?.id || uid('website-vacancy'), vacancySlug = slug(value.slug || title), active = value.active === false ? 0 : 1;
  try {
    if (found) await env.DB.prepare(`UPDATE website_vacancies SET slug=?,title=?,employment_type=?,location=?,summary=?,requirements=?,active=?,sort_order=?,closes_at=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(vacancySlug, title, employmentType, location, summary, requirements || null, active, Math.max(0, Math.round(number(value.sortOrder))), closesAt, context.employee.id, id).run();
    else await env.DB.prepare(`INSERT INTO website_vacancies(id,site_id,slug,title,employment_type,location,summary,requirements,active,sort_order,closes_at,created_by,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, site.id, vacancySlug, title, employmentType, location, summary, requirements || null, active, Math.max(0, Math.round(number(value.sortOrder))), closesAt, context.employee.id, context.employee.id).run();
  } catch { return json({ error: 'This website already has a vacancy with that address.' }, 409); }
  await audit(env, context, companyId, found ? 'update_website_vacancy' : 'create_website_vacancy', 'website_vacancy', id, { title, vacancySlug, active: Boolean(active) });
  return json({ ok: true, id }, found ? 200 : 201);
}

async function updateApplication(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website application update.' }, 400);
  const companyId = text(value.companyId, 100), id = text(value.id, 120), status = text(value.status, 30);
  const denied = requireCompany(context, companyId, 'website.careers', 'edit');
  if (denied) return denied;
  if (!applicationStatuses.has(status)) return json({ error: 'Choose a supported application status.' }, 400);
  const found = await env.DB.prepare(`SELECT a.id,a.status FROM website_applications a JOIN website_sites s ON s.id=a.site_id WHERE a.id=? AND s.company_id=?`)
    .bind(id, companyId).first<{ id: string; status: string }>();
  if (!found) return json({ error: 'Application not found in this business website.' }, 404);
  const notes = plain(value.notes, 3000);
  if (notes === undefined) return json({ error: 'Application notes must use plain text.' }, 400);
  await env.DB.prepare(`UPDATE website_applications SET status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, notes || null, id).run();
  await audit(env, context, companyId, 'update_website_application', 'website_application', id, { beforeStatus: found.status, status });
  return json({ ok: true, id, status });
}

function themeConfig(value: Body) {
  const color = (candidate: unknown, fallback: string) => /^#[0-9a-fA-F]{6}$/.test(text(candidate, 7)) ? text(candidate, 7).toLowerCase() : fallback;
  return {
    palette: { ink: color(value.inkColor, '#07111f'), paper: color(value.paperColor, '#f8fafc'), accent: color(value.accentColor, '#0f766e') },
    motion: ['none', 'subtle', 'expressive'].includes(text(value.motion, 20)) ? text(value.motion, 20) : 'subtle',
    approvedLogo: plain(value.approvedLogo, 120) || null,
  };
}

async function saveTheme(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid website theme request.' }, 400);
  const companyId = text(value.companyId, 100), denied = requireCompany(context, companyId, 'website.theme', 'edit');
  if (denied) return denied;
  const site = await siteForCompany(env, companyId);
  if (!site) return json({ error: 'Website workspace is not provisioned for this business.' }, 404);
  const displayName = plain(value.displayName, 160), logoPath = plain(value.logoPath, 500), changeSummary = plain(value.changeSummary, 500);
  if (displayName === undefined || logoPath === undefined || changeSummary === undefined) return json({ error: 'Theme fields must use plain text.' }, 400);
  if (!displayName || !changeSummary) return json({ error: 'Theme name and change summary are required.' }, 400);
  if (logoPath && !logoPath.startsWith('/assets/')) return json({ error: 'Theme logo must use a safe /assets/ path.' }, 400);
  const latest = await env.DB.prepare(`SELECT COALESCE(MAX(version_no),0) AS versionNo FROM website_theme_revisions WHERE site_id=?`).bind(site.id).first<{ versionNo: number }>();
  const versionNo = Number(latest?.versionNo || 0) + 1, id = uid('website-theme'), themeKey = slug(value.themeKey || displayName).replaceAll('-', '_');
  await env.DB.prepare(`INSERT INTO website_theme_revisions(id,site_id,version_no,theme_key,display_name,logo_path,config_json,change_summary,status,created_by)
    VALUES(?,?,?,?,?,?,?,?,'draft',?)`).bind(id, site.id, versionNo, themeKey, displayName, logoPath || null, JSON.stringify(themeConfig(value)), changeSummary, context.employee.id).run();
  await audit(env, context, companyId, 'create_website_theme_revision', 'website_theme_revision', id, { versionNo, themeKey, displayName, logoPath, changeSummary });
  return json({ ok: true, id, versionNo, status: 'draft' }, 201);
}

async function submitTheme(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid theme review request.' }, 400);
  const companyId = text(value.companyId, 100), revisionId = text(value.revisionId, 120), denied = requireCompany(context, companyId, 'website.theme', 'edit');
  if (denied) return denied;
  const revision = await env.DB.prepare(`SELECT t.id,t.site_id AS siteId,t.status FROM website_theme_revisions t JOIN website_sites s ON s.id=t.site_id WHERE t.id=? AND s.company_id=?`)
    .bind(revisionId, companyId).first<{ id: string; siteId: string; status: string }>();
  if (!revision || !['draft', 'rejected'].includes(revision.status)) return json({ error: 'A draft or rejected theme revision is required.' }, 409);
  const id = uid('website-theme-request');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO website_theme_publish_requests(id,company_id,site_id,revision_id,requested_by) VALUES(?,?,?,?,?)`).bind(id, companyId, revision.siteId, revision.id, context.employee.id),
    env.DB.prepare(`UPDATE website_theme_revisions SET status='in_review' WHERE id=?`).bind(revision.id),
  ]);
  await audit(env, context, companyId, 'submit_website_theme_review', 'website_theme_publish_request', id, { revisionId });
  return json({ ok: true, id, status: 'pending' }, 201);
}

async function reviewTheme(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid theme review decision.' }, 400);
  const companyId = text(value.companyId, 100), requestId = text(value.requestId, 120), decision = text(value.decision, 20);
  const denied = requireCompany(context, companyId, 'website.theme', 'approve');
  if (denied) return denied;
  if (!['approved', 'rejected'].includes(decision)) return json({ error: 'Choose Approve or Reject.' }, 400);
  const found = await env.DB.prepare(`SELECT id,revision_id AS revisionId,requested_by AS requestedBy FROM website_theme_publish_requests WHERE id=? AND company_id=? AND status='pending'`)
    .bind(requestId, companyId).first<{ id: string; revisionId: string; requestedBy: string }>();
  if (!found) return json({ error: 'Pending theme review request not found.' }, 404);
  if (decision === 'approved' && found.requestedBy === context.employee.id) return json({ error: 'The employee who submitted this theme cannot approve it. Assign an independent authorized reviewer.' }, 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE website_theme_publish_requests SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,review_note=? WHERE id=?`).bind(decision, context.employee.id, plain(value.note, 1000) || null, found.id),
    env.DB.prepare(`UPDATE website_theme_revisions SET status=? WHERE id=?`).bind(decision, found.revisionId),
  ]);
  await audit(env, context, companyId, `website_theme_${decision}`, 'website_theme_publish_request', found.id, { revisionId: found.revisionId });
  return json({ ok: true, status: decision });
}

async function publishTheme(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid theme publish request.' }, 400);
  const companyId = text(value.companyId, 100), requestId = text(value.requestId, 120), denied = requireCompany(context, companyId, 'website.theme', 'manage');
  if (denied) return denied;
  const found = await env.DB.prepare(`SELECT q.id,q.site_id AS siteId,q.revision_id AS revisionId,t.theme_key AS themeKey,t.version_no AS versionNo
    FROM website_theme_publish_requests q JOIN website_theme_revisions t ON t.id=q.revision_id
    WHERE q.id=? AND q.company_id=? AND q.status='approved' AND t.status='approved'`).bind(requestId, companyId).first<{ id: string; siteId: string; revisionId: string; themeKey: string; versionNo: number }>();
  if (!found) return json({ error: 'An approved theme request is required.' }, 409);
  await env.DB.batch([
    env.DB.prepare(`UPDATE website_theme_revisions SET status='superseded' WHERE site_id=? AND status='published' AND id!=?`).bind(found.siteId, found.revisionId),
    env.DB.prepare(`UPDATE website_theme_revisions SET status='published' WHERE id=?`).bind(found.revisionId),
    env.DB.prepare(`UPDATE website_theme_publish_requests SET status='published',published_by=?,published_at=CURRENT_TIMESTAMP WHERE id=?`).bind(context.employee.id, found.id),
    env.DB.prepare(`UPDATE website_sites SET theme_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(found.themeKey, found.siteId),
  ]);
  await audit(env, context, companyId, 'publish_website_theme', 'website_theme_revision', found.revisionId, { versionNo: found.versionNo, themeKey: found.themeKey });
  return json({ ok: true, status: 'published', versionNo: found.versionNo });
}

async function restoreTheme(request: Request, env: Env, context: SessionContext) {
  const value = await body(request);
  if (!value) return json({ error: 'Invalid theme restore request.' }, 400);
  const companyId = text(value.companyId, 100), revisionId = text(value.revisionId, 120), denied = requireCompany(context, companyId, 'website.theme', 'manage');
  if (denied) return denied;
  const found = await env.DB.prepare(`SELECT t.site_id AS siteId,t.version_no AS versionNo,t.theme_key AS themeKey,t.display_name AS displayName,t.logo_path AS logoPath,t.config_json AS configJson
    FROM website_theme_revisions t JOIN website_sites s ON s.id=t.site_id WHERE t.id=? AND s.company_id=?`).bind(revisionId, companyId).first<Record<string, unknown>>();
  if (!found) return json({ error: 'Theme version not found in this business website.' }, 404);
  const latest = await env.DB.prepare(`SELECT COALESCE(MAX(version_no),0) AS versionNo FROM website_theme_revisions WHERE site_id=?`).bind(found.siteId).first<{ versionNo: number }>();
  const versionNo = Number(latest?.versionNo || 0) + 1, id = uid('website-theme');
  await env.DB.prepare(`INSERT INTO website_theme_revisions(id,site_id,version_no,theme_key,display_name,logo_path,config_json,change_summary,status,created_by)
    VALUES(?,?,?,?,?,?,?,?,'draft',?)`).bind(id, found.siteId, versionNo, found.themeKey, found.displayName, found.logoPath || null, found.configJson,
      `Restore version ${found.versionNo}; independent approval is still required.`, context.employee.id).run();
  await audit(env, context, companyId, 'prepare_website_theme_restore', 'website_theme_revision', id, { restoredFromRevisionId: revisionId, restoredFromVersionNo: found.versionNo, versionNo });
  return json({ ok: true, id, versionNo, status: 'draft' }, 201);
}

export async function routePlatformCenter(request: Request, env: Env, context: SessionContext): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === '/api/platform/overview' && request.method === 'GET') return overview(request, env, context);
  if (path === '/api/platform/connections/save' && request.method === 'POST') return saveConnection(request, env, context);
  if (path === '/api/platform/connections/toggle' && request.method === 'POST') return toggleConnection(request, env, context);
  if (path === '/api/platform/websites/site' && request.method === 'POST') return saveSite(request, env, context);
  if (path === '/api/platform/websites/page' && request.method === 'POST') return savePage(request, env, context);
  if (path === '/api/platform/websites/content' && request.method === 'POST') return saveContent(request, env, context);
  if (path === '/api/platform/websites/submit' && request.method === 'POST') return submitReview(request, env, context);
  if (path === '/api/platform/websites/review' && request.method === 'POST') return reviewPublication(request, env, context);
  if (path === '/api/platform/websites/publish' && request.method === 'POST') return publish(request, env, context);
  if (path === '/api/platform/websites/media' && request.method === 'POST') return uploadMedia(request, env, context);
  if (path === '/api/platform/websites/catalogue' && request.method === 'POST') return saveCatalogueLink(request, env, context);
  if (path === '/api/platform/websites/catalogue/connect' && request.method === 'POST') return connectCatalogueSource(request, env, context);
  if (path === '/api/platform/websites/catalogue/logistics-service' && request.method === 'POST') return saveLogisticsService(request, env, context);
  if (path === '/api/platform/websites/inquiries/update' && request.method === 'POST') return updateInquiry(request, env, context);
  if (path === '/api/platform/websites/inquiries/convert-printing' && request.method === 'POST') return convertPrintingInquiry(request, env, context);
  if (path === '/api/platform/websites/vacancies' && request.method === 'POST') return saveVacancy(request, env, context);
  if (path === '/api/platform/websites/applications/update' && request.method === 'POST') return updateApplication(request, env, context);
  if (path === '/api/platform/websites/themes' && request.method === 'POST') return saveTheme(request, env, context);
  if (path === '/api/platform/websites/themes/submit' && request.method === 'POST') return submitTheme(request, env, context);
  if (path === '/api/platform/websites/themes/review' && request.method === 'POST') return reviewTheme(request, env, context);
  if (path === '/api/platform/websites/themes/publish' && request.method === 'POST') return publishTheme(request, env, context);
  if (path === '/api/platform/websites/themes/restore' && request.method === 'POST') return restoreTheme(request, env, context);
  return null;
}

async function publicSite(env: Env, siteCode: string) {
  return env.DB.prepare(`SELECT id,site_code AS siteCode,name,domain,public_feed_enabled AS publicFeedEnabled,last_published_at AS lastPublishedAt
    FROM website_sites WHERE site_code=? AND status='active' AND public_feed_enabled=1`).bind(siteCode).first<{ id: string; siteCode: string; name: string; domain: string; publicFeedEnabled: number; lastPublishedAt?: string }>();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `\"${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}\"`;
}

function cors(headers: Headers, site: { domain: string }) {
  headers.set('access-control-allow-origin', `https://${site.domain}`);
  headers.set('vary', 'Origin');
  headers.set('x-content-type-options', 'nosniff');
}

function siteJson(site: { domain: string }, value: unknown, status = 200) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  cors(headers, site);
  return new Response(JSON.stringify(value), { status, headers });
}

async function publicPayload(request: Request, env: Env) {
  const maxBytes = Math.min(32768, await settingNumber(env, 'website.public_request_max_bytes', 32768));
  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > maxBytes) return { error: 'Request is larger than the allowed public website limit.', status: 413 } as const;
  let value: Body;
  try { value = await request.json<Body>(); } catch { return { error: 'Enter a valid website request.', status: 400 } as const; }
  if (JSON.stringify(value).length > maxBytes) return { error: 'Request is larger than the allowed public website limit.', status: 413 } as const;
  return { value } as const;
}

async function publicRateLimit(request: Request, env: Env, siteCode: string, action: string, limit: number, seconds: number) {
  if (!env.SOCIAL_CACHE) return { allowed: false, unavailable: true };
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const fingerprint = (await sha256(`${siteCode}:${action}:${ip}`)).replaceAll('"', '');
  const key = `website-rate:${action}:${fingerprint}`;
  const count = Number(await env.SOCIAL_CACHE.get(key) || 0);
  if (count >= limit) return { allowed: false, retryAfter: seconds };
  await env.SOCIAL_CACHE.put(key, String(count + 1), { expirationTtl: seconds });
  return { allowed: true };
}

async function publicInquiry(request: Request, env: Env, site: { id: string; siteCode: string; domain: string }) {
  const parsed = await publicPayload(request, env);
  if ('error' in parsed) return siteJson(site, { error: parsed.error }, parsed.status);
  const value = parsed.value;
  if (text(value.website, 100)) return siteJson(site, { ok: true, received: true }, 202);
  const limit = Math.min(30, await settingNumber(env, 'website.public_inquiry_limit_per_2_minutes', 10));
  const rate = await publicRateLimit(request, env, site.siteCode, 'inquiry', limit, 120);
  if (!rate.allowed) return siteJson(site, { error: rate.unavailable ? 'Website request protection is temporarily unavailable. Please try again later.' : 'Too many requests. Please wait two minutes and try again.' }, rate.unavailable ? 503 : 429);
  const inquiryType = text(value.inquiryType, 20) || 'general';
  const name = plain(value.name, 160), companyName = plain(value.companyName, 200), email = text(value.email, 320).toLowerCase();
  const phone = plain(value.phone, 80), whatsapp = plain(value.whatsapp, 80), specifications = plain(value.specifications, 5000), message = plain(value.message, 5000);
  if (!['general', 'quote', 'order'].includes(inquiryType)) return siteJson(site, { error: 'Choose a general, quote or order request.' }, 400);
  if ([name, companyName, phone, whatsapp, specifications, message].some((item) => item === undefined)) return siteJson(site, { error: 'Website requests must use plain text.' }, 400);
  if (!name || (!email && !phone && !whatsapp)) return siteJson(site, { error: 'Name and at least one contact method are required.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return siteJson(site, { error: 'Enter a valid email address.' }, 400);
  const serviceId = text(value.serviceId, 120) || null;
  if (serviceId) {
    const service = await env.DB.prepare(`SELECT id FROM website_catalog_links WHERE site_id=? AND entity_id=? AND active=1`).bind(site.id, serviceId).first();
    if (!service) return siteJson(site, { error: 'The selected website service is not available.' }, 400);
  }
  const sourcePath = plain(value.sourcePath, 500);
  if (sourcePath === undefined) return siteJson(site, { error: 'Website source must use plain text.' }, 400);
  const reference = `WEB-${site.siteCode.toUpperCase()}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const id = uid('website-inquiry');
  await env.DB.prepare(`INSERT INTO website_inquiries(id,site_id,reference,inquiry_type,service_entity_id,name,company_name,email,phone,whatsapp,quantity,specifications,message,source_path)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, site.id, reference, inquiryType, serviceId, name, companyName || null, email || null, phone || null, whatsapp || null,
      value.quantity == null ? null : Math.max(1, number(value.quantity, 1)), specifications || null, message || null, sourcePath || null).run();
  return siteJson(site, { ok: true, reference, message: 'Your request was received. An authorized team member will review it.' }, 201);
}

async function publicApplication(request: Request, env: Env, site: { id: string; siteCode: string; domain: string }) {
  const parsed = await publicPayload(request, env);
  if ('error' in parsed) return siteJson(site, { error: parsed.error }, parsed.status);
  const value = parsed.value;
  if (text(value.website, 100)) return siteJson(site, { ok: true, received: true }, 202);
  const limit = Math.min(20, await settingNumber(env, 'website.public_application_limit_per_5_minutes', 5));
  const rate = await publicRateLimit(request, env, site.siteCode, 'application', limit, 300);
  if (!rate.allowed) return siteJson(site, { error: rate.unavailable ? 'Application protection is temporarily unavailable. Please try again later.' : 'Too many applications were submitted. Please wait five minutes and try again.' }, rate.unavailable ? 503 : 429);
  const vacancyId = text(value.vacancyId, 120), name = plain(value.name, 160), email = text(value.email, 320).toLowerCase();
  const phone = plain(value.phone, 80), location = plain(value.location, 180), experience = plain(value.experience, 8000);
  if ([name, phone, location, experience].some((item) => item === undefined)) return siteJson(site, { error: 'Application fields must use plain text.' }, 400);
  if (!vacancyId || !name || !email || !phone || !experience) return siteJson(site, { error: 'Vacancy, name, email, phone and experience are required.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return siteJson(site, { error: 'Enter a valid email address.' }, 400);
  const vacancy = await env.DB.prepare(`SELECT id FROM website_vacancies WHERE id=? AND site_id=? AND active=1 AND (closes_at IS NULL OR datetime(closes_at)>datetime('now'))`).bind(vacancyId, site.id).first();
  if (!vacancy) return siteJson(site, { error: 'This vacancy is no longer accepting applications.' }, 409);
  const portfolio = httpsUrl(value.portfolioUrl);
  if (portfolio === undefined) return siteJson(site, { error: 'Portfolio link must be a valid HTTPS URL.' }, 400);
  const reference = `APP-${site.siteCode.toUpperCase()}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const id = uid('website-application');
  await env.DB.prepare(`INSERT INTO website_applications(id,site_id,vacancy_id,reference,name,email,phone,location,experience,portfolio_url)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id, site.id, vacancyId, reference, name, email, phone, location || null, experience, portfolio).run();
  return siteJson(site, { ok: true, reference, message: 'Your application was received for review.' }, 201);
}

export async function routePublicWebsite(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url), prefix = '/api/public/websites/';
  if (!url.pathname.startsWith(prefix)) return null;
  const parts = url.pathname.slice(prefix.length).split('/').filter(Boolean);
  const siteCode = slug(parts[0]);
  const site = await publicSite(env, siteCode);
  if (!site || !normalizedDomain(site.domain)) return json({ error: 'Published business website not found.' }, 404);
  if (request.method === 'OPTIONS') {
    const headers = new Headers({ 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, If-None-Match', 'access-control-max-age': '86400' });
    cors(headers, site);
    return new Response(null, { status: 204, headers });
  }
  if (parts[1] === 'inquiries' && parts.length === 2 && request.method === 'POST') return publicInquiry(request, env, site);
  if (parts[1] === 'applications' && parts.length === 2 && request.method === 'POST') return publicApplication(request, env, site);
  if (request.method !== 'GET') return siteJson(site, { error: 'Method not allowed.' }, 405);
  if (parts[1] === 'content' && parts.length === 2) {
    const rows = await env.DB.prepare(`SELECT slug,title,menu_label AS menuLabel,summary,seo_title AS seoTitle,seo_description AS seoDescription,
      published_content_json AS contentJson,published_version_no AS versionNo,updated_at AS updatedAt FROM website_pages
      WHERE site_id=? AND status='published' AND published_content_json IS NOT NULL ORDER BY CASE WHEN slug='home' THEN 0 ELSE 1 END,menu_label,title LIMIT 100`).bind(site.id).all<Record<string, unknown>>();
    const pages = (rows.results || []).map((row) => { let content: unknown = {}; try { content = JSON.parse(String(row.contentJson || '{}')); } catch {} const { contentJson: _removed, ...safe } = row; return { ...safe, content }; });
    const payload = JSON.stringify({ site: { code: site.siteCode, name: site.name, domain: site.domain, lastPublishedAt: site.lastPublishedAt }, pages });
    const etag = await sha256(payload);
    const cacheSeconds = Math.min(3600, await settingNumber(env, 'website.public_feed_cache_seconds', 300));
    const cacheControl = `public, max-age=${cacheSeconds}, stale-while-revalidate=60`;
    if (request.headers.get('if-none-match') === etag) { const headers = new Headers({ etag, 'cache-control': cacheControl }); cors(headers, site); return new Response(null, { status: 304, headers }); }
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': cacheControl });
    cors(headers, site);
    return new Response(payload, { headers });
  }
  if (parts[1] === 'catalogue' && parts.length === 2) {
    const rows = await env.DB.prepare(`WITH sources AS (${catalogueSourcesSql})
      SELECT l.entity_type AS entityType,l.entity_id AS id,l.public_slug AS slug,l.image_path AS imagePath,l.featured,l.sort_order AS sortOrder,
      src.code,src.name,src.category,src.description,src.pricingUnit,src.basePriceKobo,src.metadataJson,src.operationalStatus
      FROM website_catalog_links l JOIN sources src ON src.entityType=l.entity_type AND src.entityId=l.entity_id
      WHERE l.site_id=? AND l.active=1 AND src.operationalActive=1 ORDER BY l.featured DESC,l.sort_order,src.name LIMIT 250`).bind(site.id).all<Record<string, unknown>>();
    const catalogue = catalogueRows(rows);
    const payload = JSON.stringify({ site: { code: site.siteCode, name: site.name }, catalogue });
    const etag = await sha256(payload), headers = new Headers({ 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'public, max-age=300, stale-while-revalidate=60' });
    cors(headers, site);
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(payload, { headers });
  }
  if (parts[1] === 'vacancies' && parts.length === 2) {
    const rows = await env.DB.prepare(`SELECT id,slug,title,employment_type AS employmentType,location,summary,requirements,closes_at AS closesAt
      FROM website_vacancies WHERE site_id=? AND active=1 AND (closes_at IS NULL OR datetime(closes_at)>datetime('now')) ORDER BY sort_order,title LIMIT 100`).bind(site.id).all();
    const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300, stale-while-revalidate=60' }); cors(headers, site);
    return new Response(JSON.stringify({ site: { code: site.siteCode, name: site.name }, vacancies: rows.results || [] }), { headers });
  }
  if (parts[1] === 'theme' && parts.length === 2) {
    const theme = await env.DB.prepare(`SELECT version_no AS versionNo,theme_key AS themeKey,display_name AS displayName,logo_path AS logoPath,config_json AS configJson
      FROM website_theme_revisions WHERE site_id=? AND status='published' ORDER BY version_no DESC LIMIT 1`).bind(site.id).first<Record<string, unknown>>();
    if (!theme) return siteJson(site, { error: 'Published website theme not found.' }, 404);
    let config: unknown = {}; try { config = JSON.parse(String(theme.configJson || '{}')); } catch {}
    const { configJson: _removed, ...safe } = theme, payload = JSON.stringify({ theme: { ...safe, config } });
    const etag = await sha256(payload), headers = new Headers({ 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'public, max-age=300, stale-while-revalidate=60' }); cors(headers, site);
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
    return new Response(payload, { headers });
  }
  if (parts[1] === 'media' && parts[2] && parts.length === 3) {
    const asset = await env.DB.prepare(`SELECT r2_key AS r2Key,mime_type AS mimeType FROM website_media_assets WHERE id=? AND site_id=? AND active=1`).bind(parts[2], site.id).first<{ r2Key: string; mimeType: string }>();
    if (!asset) return json({ error: 'Website image not found.' }, 404);
    const object = await env.FILES.get(asset.r2Key);
    if (!object) return json({ error: 'Website image not found.' }, 404);
    if (request.headers.get('if-none-match') === object.httpEtag) { const headers = new Headers({ etag: object.httpEtag, 'cache-control': 'public, max-age=31536000, immutable' }); cors(headers, site); return new Response(null, { status: 304, headers }); }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', asset.mimeType || headers.get('content-type') || 'application/octet-stream');
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('etag', object.httpEtag);
    cors(headers, site);
    return new Response(object.body, { headers });
  }
  return siteJson(site, { error: 'Public website route not found.' }, 404);
}
