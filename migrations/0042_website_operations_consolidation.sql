PRAGMA foreign_keys = ON;

-- Public catalogue entries link to the real operational entity. Product/service
-- names and descriptions stay in their ERP source table, preventing a second
-- website-only product database from drifting out of date.
CREATE TABLE IF NOT EXISTS website_catalog_links (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('printing_service','bakery_product','vehicle','property','logistics_service')),
  entity_id TEXT NOT NULL,
  public_slug TEXT NOT NULL,
  image_path TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id,entity_type,entity_id),
  UNIQUE(site_id,public_slug)
);
CREATE INDEX IF NOT EXISTS idx_website_catalog_site
  ON website_catalog_links(site_id,active,featured,sort_order);

CREATE TABLE IF NOT EXISTS website_inquiries (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  inquiry_type TEXT NOT NULL DEFAULT 'general' CHECK (inquiry_type IN ('general','quote','order')),
  service_entity_id TEXT,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  quantity REAL,
  specifications TEXT,
  message TEXT,
  source_path TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','in_progress','converted','closed','spam')),
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  converted_customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  converted_print_job_id TEXT REFERENCES print_jobs(id) ON DELETE SET NULL,
  converted_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  converted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_website_inquiries_site
  ON website_inquiries(site_id,status,created_at DESC);

-- A primary-keyed conversion record makes website-to-ERP conversion idempotent.
-- Concurrent attempts cannot create two operational jobs for one inquiry.
CREATE TABLE IF NOT EXISTS website_inquiry_conversions (
  inquiry_id TEXT PRIMARY KEY REFERENCES website_inquiries(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE RESTRICT,
  print_job_id TEXT UNIQUE REFERENCES print_jobs(id) ON DELETE RESTRICT,
  converted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  converted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS website_vacancies (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  employment_type TEXT NOT NULL,
  location TEXT NOT NULL,
  summary TEXT NOT NULL,
  requirements TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  closes_at TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id,slug)
);
CREATE INDEX IF NOT EXISTS idx_website_vacancies_site
  ON website_vacancies(site_id,active,sort_order);

CREATE TABLE IF NOT EXISTS website_applications (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  vacancy_id TEXT NOT NULL REFERENCES website_vacancies(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT,
  experience TEXT NOT NULL,
  portfolio_url TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','shortlisted','interview','offered','hired','rejected','withdrawn')),
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_website_applications_site
  ON website_applications(site_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS website_theme_revisions (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  theme_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  logo_path TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  change_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','published','rejected','superseded')),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id,version_no)
);
CREATE INDEX IF NOT EXISTS idx_website_theme_revisions_site
  ON website_theme_revisions(site_id,status,version_no DESC);

CREATE TABLE IF NOT EXISTS website_theme_publish_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES website_theme_revisions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','published','cancelled')),
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT,
  published_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_website_theme_requests_company
  ON website_theme_publish_requests(company_id,status,requested_at DESC);

-- The 44 items approved for the Printing website become operational Printing
-- services. LARGE-FORMAT reuses the existing service instead of being duplicated.
INSERT OR IGNORE INTO printing_services
  (id,company_id,code,name,category,description,pricing_unit,requires_artwork,requires_proof,metadata_json)
VALUES
 ('print-service-web-business-cards','company-printing','BUSINESS-CARDS','Business Cards','Marketing & Office','Standard, premium, mini and custom-finish cards.','job',1,1,'{"subcategory":"Cards","options":["Single or double sided","Matte or gloss lamination","Rounded corners","Spot UV or foil finishing"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":10}'),
 ('print-service-web-transparent-cards','company-printing','TRANSPARENT-CARDS','Transparent PVC Cards','Marketing & Office','Durable transparent cards with crisp colour printing.','job',1,1,'{"subcategory":"Cards","options":["Clear or frosted PVC","Single or double sided","Custom shapes"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":20}'),
 ('print-service-web-flyers','company-printing','FLYERS','Flyers & Handbills','Marketing & Office','A6, A5, A4 and custom campaign flyers.','job',1,1,'{"subcategory":"Flyers","options":["Single or double sided","Multiple paper weights","Gloss or matte finish"],"imagePath":"/assets/products/invitation.jpg","sortOrder":30}'),
 ('print-service-web-posters','company-printing','POSTERS','Posters','Marketing & Office','Promotional, event and information posters.','job',1,1,'{"subcategory":"Posters","options":["A3 to large format","Indoor or outdoor media","Framing available"],"imagePath":"/assets/products/rollup.jpg","sortOrder":40}'),
 ('print-service-web-letterheads','company-printing','LETTERHEADS','Letterheads','Marketing & Office','Professional branded correspondence paper.','job',1,1,'{"subcategory":"Stationery","options":["A4 standard","Full colour","Premium bond paper"],"imagePath":"/assets/logo-concept-a.svg","sortOrder":50}'),
 ('print-service-web-envelopes','company-printing','ENVELOPES','Branded Envelopes','Marketing & Office','Corporate, invitation and document envelopes.','job',1,1,'{"subcategory":"Stationery","options":["DL, C5, C4 and custom","Window or plain","Full colour"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":60}'),
 ('print-service-web-notepads','company-printing','NOTEPADS','Notepads & Jotters','Marketing & Office','Spiral, hard-cover, PVC and writing pads.','job',1,1,'{"subcategory":"Stationery","options":["A6, A5, A4","Hard or soft cover","Custom inner pages"],"imagePath":"/assets/products/binding-machine.jpg","sortOrder":70}'),
 ('print-service-web-invoice','company-printing','INVOICE','Invoices & NCR Books','Marketing & Office','Duplicate and triplicate numbered business forms.','job',1,1,'{"subcategory":"Business Forms","options":["2–5 parts","Sequential numbering","Perforation and binding"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":80}'),
 ('print-service-web-booklets','company-printing','BOOKLETS','Booklets & Programmes','Publishing & Books','Event programmes, manuals and multi-page booklets.','job',1,1,'{"subcategory":"Publishing","options":["Saddle stitch","Perfect binding","Custom paper combinations"],"imagePath":"/assets/products/binding-machine.jpg","sortOrder":90}'),
 ('print-service-web-books','company-printing','BOOKS','Books & Publishing','Publishing & Books','Textbooks, exercise books, magazines and publications.','job',1,1,'{"subcategory":"Publishing","options":["Cover design","ISBN-ready production","Short and long runs"],"imagePath":"/assets/products/offset-machine.jpg","sortOrder":100}'),
 ('print-service-web-calendars','company-printing','CALENDARS','Wall & Table Calendars','Publishing & Books','Branded wall, desk and flip calendars.','job',1,1,'{"subcategory":"Calendars","options":["Wall or table format","Wire-O binding","Custom monthly artwork"],"imagePath":"/assets/products/binding-machine.jpg","sortOrder":110}'),
 ('print-service-web-brochures','company-printing','BROCHURES','Brochures','Marketing & Office','Bi-fold, tri-fold and custom folded brochures.','job',1,1,'{"subcategory":"Brochures","options":["Bi-fold or tri-fold","A4/A5 finished size","Premium lamination"],"imagePath":"/assets/products/invitation.jpg","sortOrder":120}'),
 ('print-service-web-flex-banner','company-printing','FLEX-BANNER','Flex Banners','Large Format','Event, campaign, church and business banners.','square_meter',1,1,'{"subcategory":"Banners","options":["Indoor or outdoor flex","Eyelets and rope","Custom finishing"],"imagePath":"/assets/products/rollup.jpg","sortOrder":140}'),
 ('print-service-web-sav','company-printing','SAV','SAV Stickers','Large Format','Self-adhesive vinyl for windows, walls and boards.','square_meter',1,1,'{"subcategory":"Adhesive Graphics","options":["Gloss, matte, clear","Contour cutting","Installation available"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":150}'),
 ('print-service-web-reflective','company-printing','REFLECTIVE','Reflective Graphics','Large Format','High-visibility reflective stickers and signage.','square_meter',1,1,'{"subcategory":"Adhesive Graphics","options":["Vehicle grade options","Contour cutting","Laminated finish"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":160}'),
 ('print-service-web-rollup','company-printing','ROLLUP','Roll-up Stands','Large Format','Portable exhibition and event display systems.','job',1,1,'{"subcategory":"Display Systems","options":["Standard or premium stand","Carry bag","Artwork support"],"imagePath":"/assets/products/rollup.jpg","sortOrder":170}'),
 ('print-service-web-teardrop','company-printing','TEARDROP','Teardrop Flags','Large Format','Outdoor promotional flags with stable bases.','job',1,1,'{"subcategory":"Display Systems","options":["Multiple heights","Single or double sided","Indoor/outdoor bases"],"imagePath":"/assets/products/rollup.jpg","sortOrder":180}'),
 ('print-service-web-window','company-printing','WINDOW','Window Graphics','Large Format','One-way vision, frosted and promotional window films.','square_meter',1,1,'{"subcategory":"Environmental Branding","options":["One-way vision","Frosted film","Installation available"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":190}'),
 ('print-service-web-wallpaper','company-printing','WALLPAPER','Wallpaper & Wall Graphics','Large Format','Custom wall murals and branded interior graphics.','square_meter',1,1,'{"subcategory":"Environmental Branding","options":["Custom dimensions","Washable media","Site measurement"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":200}'),
 ('print-service-web-vehicle','company-printing','VEHICLE','Vehicle Branding','Large Format','Partial and full vehicle graphics for mobile visibility.','job',1,1,'{"subcategory":"Environmental Branding","options":["Car, van, bus","Reflective accents","Professional installation"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":210}'),
 ('print-service-web-tshirt','company-printing','TSHIRT','T-shirt Printing','Apparel & Embroidery','Screen print, heat transfer, DTF and sublimation apparel.','job',1,1,'{"subcategory":"Apparel","options":["Cotton or polyester","Front/back/sleeve","Individual names"],"imagePath":"/assets/products/tshirt.jpg","sortOrder":220}'),
 ('print-service-web-caps','company-printing','CAPS','Branded Caps','Apparel & Embroidery','Printed or embroidered caps for teams and campaigns.','job',1,1,'{"subcategory":"Apparel","options":["Print or embroidery","Multiple cap styles","Individual packaging"],"imagePath":"/assets/products/tshirt.jpg","sortOrder":230}'),
 ('print-service-web-embroidery','company-printing','EMBROIDERY','Machine Embroidery','Apparel & Embroidery','Multi-head embroidery for uniforms, caps and textiles.','job',1,1,'{"subcategory":"Embroidery","options":["Logo digitisation","Running and satin stitch","Bulk uniform production"],"imagePath":"/assets/products/embroidery-machine.jpg","sortOrder":240}'),
 ('print-service-web-woven-labels','company-printing','WOVEN-LABELS','Woven Labels & Badges','Apparel & Embroidery','Woven clothing labels, patches and fabric badges.','job',1,1,'{"subcategory":"Labels & Patches","options":["Iron-on or sew-on","Custom shapes","Merrowed edges"],"imagePath":"/assets/products/embroidery-machine.jpg","sortOrder":250}'),
 ('print-service-web-mugs','company-printing','MUGS','Custom Mugs','Gifts & Personalisation','Photo, logo, message and magic mug personalisation.','job',1,1,'{"subcategory":"Drinkware","options":["White, colour or magic mug","Individual boxes","Photo retouching"],"imagePath":"/assets/products/mug.jpg","sortOrder":260}'),
 ('print-service-web-keyholders','company-printing','KEYHOLDERS','Custom Keyholders','Gifts & Personalisation','Photo, logo and message keyholders for gifts and brands.','job',1,1,'{"subcategory":"Accessories","options":["Metal, acrylic or leather","Single or double sided","Gift packaging"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":270}'),
 ('print-service-web-phone-cases','company-printing','PHONE-CASES','Custom Phone Cases','Gifts & Personalisation','Personalised phone cases with photo or original artwork.','job',1,1,'{"subcategory":"Accessories","options":["Model-specific cases","Full-colour print","Design support"],"imagePath":"/assets/products/phone-case.jpg","sortOrder":280}'),
 ('print-service-web-usb','company-printing','USB','Branded Flash Drives','Gifts & Personalisation','Custom-logo USB drives for corporate presentation.','job',1,1,'{"subcategory":"Corporate Gifts","options":["Multiple capacities","Print or engraving","Gift boxes"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":290}'),
 ('print-service-web-wristbands','company-printing','WRISTBANDS','Wristbands','Gifts & Personalisation','Branded silicone, fabric and event-access wristbands.','job',1,1,'{"subcategory":"Event Products","options":["Silicone or fabric","Printed or embossed","Numbering available"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":300}'),
 ('print-service-web-labels','company-printing','LABELS','Product Labels','Labels & Packaging','Adhesive labels for food, cosmetics, retail and logistics.','job',1,1,'{"subcategory":"Labels","options":["Paper, vinyl or clear","Die cut shapes","Roll or sheet supply"],"imagePath":"/assets/logo-concept-a.svg","sortOrder":310}'),
 ('print-service-web-stickers','company-printing','STICKERS','Stickers','Labels & Packaging','Round, square, contour-cut and waterproof stickers.','job',1,1,'{"subcategory":"Stickers","options":["Gloss, matte or clear","Kiss cut or die cut","Indoor/outdoor grades"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":320}'),
 ('print-service-web-paper-bags','company-printing','PAPER-BAGS','Paper Bags','Labels & Packaging','Custom retail, event and corporate paper bags.','job',1,1,'{"subcategory":"Packaging","options":["Kraft or coated paper","Rope or paper handles","Matte or gloss lamination"],"imagePath":"/assets/logo-concept-a.svg","sortOrder":330}'),
 ('print-service-web-boxes','company-printing','BOXES','Custom Boxes','Labels & Packaging','Branded product, gift, food and presentation boxes.','job',1,1,'{"subcategory":"Packaging","options":["Folding carton","Rigid presentation box","Food-safe options"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":340}'),
 ('print-service-web-id-cards','company-printing','ID-CARDS','ID Cards','Cards & Identification','Staff, student, visitor and membership identification.','job',1,1,'{"subcategory":"Identification","options":["PVC or laminated","Single/double sided","Lanyards and holders"],"imagePath":"/assets/logo-concept-a.svg","sortOrder":350}'),
 ('print-service-web-membership','company-printing','MEMBERSHIP','Membership & Loyalty Cards','Cards & Identification','Durable cards for clubs, retail and customer programmes.','job',1,1,'{"subcategory":"Cards","options":["PVC, transparent or paper","Variable data","Barcode/QR options"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":360}'),
 ('print-service-web-invitation','company-printing','INVITATION','Invitation Cards','Events & Celebrations','Wedding, birthday, burial and corporate invitation suites.','job',1,1,'{"subcategory":"Invitations","options":["Flat, folded or pocket","Laser-cut options","Envelope and accessory sets"],"imagePath":"/assets/products/invitation.jpg","sortOrder":370}'),
 ('print-service-web-greeting','company-printing','GREETING','Greeting Cards','Events & Celebrations','Seasonal, appreciation and personalised greeting cards.','job',1,1,'{"subcategory":"Cards","options":["Flat or folded","Custom envelopes","Foil and lamination"],"imagePath":"/assets/products/invitation.jpg","sortOrder":380}'),
 ('print-service-web-souvenir','company-printing','SOUVENIR','Event Souvenirs','Events & Celebrations','Coordinated branded gifts for weddings, birthdays and events.','job',1,1,'{"subcategory":"Souvenirs","options":["Mugs, bags, tees, jotters","Guest names","Presentation packaging"],"imagePath":"/assets/products/mug.jpg","sortOrder":390}'),
 ('print-service-web-graphic-design','company-printing','GRAPHIC-DESIGN','Creative Graphic Design','Design Services','Original visual communication for print and digital use.','job',1,1,'{"subcategory":"Creative","options":["Logo and identity","Campaign artwork","Social and print adaptation"],"imagePath":"/assets/logo-concept-c.svg","sortOrder":400}'),
 ('print-service-web-artwork-check','company-printing','ARTWORK-CHECK','Artwork & Prepress Check','Design Services','Technical checks and corrections before production.','job',1,1,'{"subcategory":"Prepress","options":["Bleed and trim check","Colour and resolution review","Press-ready PDF output"],"imagePath":"/assets/logo-concept-b.svg","sortOrder":410}'),
 ('print-service-web-lamination','company-printing','LAMINATION','Lamination','Finishing Services','Protective gloss, matte and encapsulation finishing.','job',0,0,'{"subcategory":"Finishing","options":["Gloss or matte","Hot or cold","Document encapsulation"],"imagePath":"/assets/products/binding-machine.jpg","sortOrder":420}'),
 ('print-service-web-binding','company-printing','BINDING','Binding','Finishing Services','Wire-O, spiral, perfect, saddle and hard-cover binding.','job',0,0,'{"subcategory":"Finishing","options":["Wire or spiral","Perfect binding","Hard-cover case binding"],"imagePath":"/assets/products/binding-machine.jpg","sortOrder":430}'),
 ('print-service-web-print-cut','company-printing','PRINT-CUT','Print & Cut','Finishing Services','Precision contour cutting for stickers and graphics.','job',1,1,'{"subcategory":"Cutting","options":["Contour cut","Kiss cut","Custom shapes"],"imagePath":"/assets/products/large-format-machine.jpg","sortOrder":440}');

-- Attach website presentation controls to those operational services. The
-- existing LARGE-FORMAT service is included using its original entity ID.
INSERT OR IGNORE INTO website_catalog_links
  (id,site_id,entity_type,entity_id,public_slug,image_path,featured,active,sort_order)
SELECT
  'website-catalog-print-' || lower(ps.code),
  ws.id,
  'printing_service',
  ps.id,
  lower(ps.code),
  json_extract(ps.metadata_json,'$.imagePath'),
  CASE WHEN ps.code IN ('BUSINESS-CARDS','LARGE-FORMAT','TSHIRT','BOXES') THEN 1 ELSE 0 END,
  1,
  COALESCE(CAST(json_extract(ps.metadata_json,'$.sortOrder') AS INTEGER),130)
FROM printing_services ps
JOIN website_sites ws ON ws.company_id=ps.company_id
WHERE ps.company_id='company-printing'
  AND (ps.code='LARGE-FORMAT' OR ps.id LIKE 'print-service-web-%');

INSERT OR IGNORE INTO website_vacancies
  (id,site_id,slug,title,employment_type,location,summary,active,sort_order)
SELECT 'website-vacancy-print-large-format',id,'large-format-operator','Large Format Machine Operator','Full time','Ibadan, Oyo State','Operate, maintain and quality-check large-format print and finishing equipment.',1,10
FROM website_sites WHERE company_id='company-printing';
INSERT OR IGNORE INTO website_vacancies
  (id,site_id,slug,title,employment_type,location,summary,active,sort_order)
SELECT 'website-vacancy-print-kord',id,'kord-machine-operator','Kord Machine Operator','Full time','Ibadan, Oyo State','Run Kord offset production safely, accurately and efficiently.',1,20
FROM website_sites WHERE company_id='company-printing';
INSERT OR IGNORE INTO website_vacancies
  (id,site_id,slug,title,employment_type,location,summary,active,sort_order)
SELECT 'website-vacancy-print-embroidery',id,'embroidery-machine-operator','Embroidery Machine Operator','Full time','Ibadan, Oyo State','Set up and operate multi-head embroidery jobs with consistent finishing.',1,30
FROM website_sites WHERE company_id='company-printing';
INSERT OR IGNORE INTO website_vacancies
  (id,site_id,slug,title,employment_type,location,summary,active,sort_order)
SELECT 'website-vacancy-print-designer',id,'graphic-designer','Graphic Designer','Full time','Ibadan, Oyo State','Create print-ready artwork, brand layouts and production files.',1,40
FROM website_sites WHERE company_id='company-printing';
INSERT OR IGNORE INTO website_vacancies
  (id,site_id,slug,title,employment_type,location,summary,active,sort_order)
SELECT 'website-vacancy-print-nysc',id,'nysc-placement','NYSC / Youth Corps Placement','Service year','Ibadan, Oyo State','Structured service-year placement across design, production, operations and customer experience.',1,50
FROM website_sites WHERE company_id='company-printing';

INSERT OR IGNORE INTO website_theme_revisions
  (id,site_id,version_no,theme_key,display_name,logo_path,config_json,change_summary,status)
SELECT
  'website-theme-' || site_code || '-v1',id,1,
  CASE WHEN company_id='company-printing' THEN 'studio_ink_2' ELSE 'brand_default' END,
  CASE WHEN company_id='company-printing' THEN 'Studio Ink 2.0' ELSE 'Daenem Brand Default' END,
  CASE WHEN company_id='company-printing' THEN '/assets/logo-concept-a.svg' ELSE NULL END,
  CASE WHEN company_id='company-printing'
    THEN '{"palette":{"ink":"#07111f","paper":"#f7f3ea","accent":"#e85d2a"},"motion":"subtle","approvedLogo":"Concept A"}'
    ELSE '{"palette":{"ink":"#07111f","paper":"#f8fafc","accent":"#0f766e"},"motion":"subtle"}' END,
  CASE WHEN company_id='company-printing' THEN 'Approved Studio Ink 2.0 direction with Logo Concept A.' ELSE 'Initial business website theme.' END,
  'published'
FROM website_sites;

UPDATE website_sites SET theme_key='studio_ink_2'
WHERE company_id='company-printing';

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-website-catalog','website.catalog','website','edit','Manage which real ERP products, services, vehicles or properties appear on the selected business website without creating duplicate operational records',0),
 ('perm-website-inquiries','website.inquiries','website','edit','View, assign, qualify and convert public website inquiries into authorized operational records for the selected business',1),
 ('perm-website-careers','website.careers','website','edit','Create public vacancies and review applications received by the selected business website',1),
 ('perm-website-theme','website.theme','website','approve','Create, review, approve, publish and restore presentation theme revisions for the selected business website',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-website-ops-' || p.id,'role-owner',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-website-catalog','perm-website-inquiries','perm-website-careers','perm-website-theme')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-website-ops-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-website-catalog','perm-website-inquiries','perm-website-careers','perm-website-theme')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('website.public_inquiry_limit_per_2_minutes','10','number'),
 ('website.public_application_limit_per_5_minutes','5','number'),
 ('website.public_request_max_bytes','32768','number'),
 ('website.theme_publish_requires_approval','true','boolean');
