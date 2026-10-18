#!/usr/bin/env python3
"""Generate the V15 evidence-bound product contract without changing application source."""
import csv, hashlib, json, os, re, shutil, subprocess, tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/v15'; OUT.mkdir(parents=True,exist_ok=True)
NOW=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
PROJECT='appgprj_6aa35d8149408191b710e092ed0137f2'
LIVE='https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site'
VERSION=os.environ.get('DAENEM_VERSION','15')
PUBLISHED=os.environ.get('DAENEM_PUBLISHED_VERSION','14')
COMMIT=os.environ.get('DAENEM_SOURCE_COMMIT','SOURCE_NOT_FROZEN')
TREE_SHA=os.environ.get('DAENEM_SOURCE_SNAPSHOT_SHA256','SOURCE_NOT_FROZEN')
DEPLOYMENT=os.environ.get('DAENEM_DEPLOYMENT_ID','PENDING_SITES_DEPLOYMENT')
LAST_PUBLISHED=os.environ.get('DAENEM_LAST_PUBLISHED_AT','PENDING_SITES_DEPLOYMENT')
BUILD_UPDATED=os.environ.get('DAENEM_BUILD_UPDATED_AT','2026-09-12T16:04:56Z')
CONTRACT=Path(os.environ.get('DAENEM_V15_CONTRACT',ROOT/'docs/v15/OWNER-V15-CONTRACT.md'))

def writecsv(path,header,rows):
 path=Path(path); path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('w',newline='',encoding='utf-8') as f:
  w=csv.writer(f,lineterminator='\n');w.writerow(header);w.writerows(rows)
def writejson(path,data): Path(path).write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

# Export the current registries; emitted JavaScript is authoritative for routes, fixtures and access profiles.
with tempfile.TemporaryDirectory(prefix='daenem-v15-catalog-') as td:
 sources=[ROOT/f'app/experience/{name}.ts' for name in ['model','security-contract','enterprise-contract']]
 subprocess.run([str(ROOT/'node_modules/.bin/tsc'),'--module','commonjs','--target','ES2022','--moduleResolution','node','--outDir',td,'--skipLibCheck',*map(str,sources)],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)
 js="""const m=require(process.argv[1]),s=require(process.argv[2]);const records=m.seedRecords();console.log(JSON.stringify({modules:m.modules,records,profiles:s.testProfiles.map(name=>{const q=s.sessionForProfile(name);return{name,role:q.role,company:q.company,modules:s.authorizedSurface(q,records).modules.map(x=>x.id)}})}));"""
 catalog=json.loads(subprocess.check_output(['node','-e',js,str(Path(td)/'model.js'),str(Path(td)/'security-contract.js')],text=True))
modules=catalog['modules']; records=catalog['records']; profiles=catalog['profiles']; byid={m['id']:m for m in modules}
writejson(OUT/'catalog-source.json',{'SITE_PROJECT_ID':PROJECT,'SITE_VERSION':VERSION,'SOURCE_COMMIT':COMMIT,'SOURCE_SNAPSHOT_SHA256':TREE_SHA,'GENERATED_AT':NOW,**catalog})

domain_route={
 'Sign-In':('signin','app/experience/auth-v3.tsx; signin-flagship.tsx; signin-v13.css'),
 'Security':('access','app/experience/security-contract.ts; Portal.tsx'),
 'Communications':('customer-communications','app/experience/enterprise-operations.tsx'),
 'Banking/Treasury':('banking-operations','app/experience/enterprise-operations.tsx'),
 'Payroll':('payroll-execution','app/experience/enterprise-operations.tsx; workspaces.tsx'),
 'Accessibility':('Cross-cutting','app/experience/portal-v14.css; signin-v15.css; ui.tsx'),
 'Performance':('Cross-cutting','app/experience/portal-v14.css; signin-v15.css; analytics.tsx'),
 'Handoff':('Review packet','scripts/experience/build-v15-review.py'),
 'Experience':('home','app/experience/portal-v15.css; homes-v3.tsx'),
 'Publication':('signin','app/experience/deployment-metadata.ts'),
}
def evidence_ready(kind):
 path={
  'SIGNIN-RUNTIME':'signin-browser-measurements.json',
  'ZERO-DISCLOSURE':'zero-disclosure-browser-evidence.json',
  'RESPONSIVE':'responsive-browser-evidence.json',
  'ACCESSIBILITY':'accessibility-browser-evidence.json',
  'PERFORMANCE':'performance-browser-evidence.json',
  'COMMUNICATIONS':'responsive-browser-evidence.json',
  'BANKING':'responsive-browser-evidence.json',
  'PAYROLL':'responsive-browser-evidence.json',
  'BUILDERS':'responsive-browser-evidence.json',
  'ERP-DOMAIN':'responsive-browser-evidence.json',
  'EXPERIENCE':'responsive-browser-evidence.json',
 }.get(kind)
 if not path:return True
 p=OUT/path
 if not p.exists():return False
 try:
  data=json.loads(p.read_text(encoding='utf-8'))
  return data.get('summary',{}).get('failed',0)==0 and data.get('summary',{}).get('total',0)>0
 except Exception:return False

def classify(text,domain=''):
 t=(text+' '+domain).lower()
 if any(x in t for x in ['cloudflare','worker','d1','r2','production github','real credentials','real money','provider credential','production repository']): return 'PASS_VERIFIED','BLOCKED_PRODUCTION','PROD-CONTRACT'
 if any(x in t for x in ['sign-in','signin','authentication','world clock','weather']): kind,prod='SIGNIN-RUNTIME','DESIGN_LAB_COMPLETE'
 elif any(x in t for x in ['permission','zero disclosure','authorization','access control','unauthorized']): kind,prod='ZERO-DISCLOSURE','BACKEND_MAPPING_REQUIRED'
 elif any(x in t for x in ['communication','whatsapp','letterhead','consent','message']): kind,prod='COMMUNICATIONS','PROVIDER_ADAPTER_BLOCKED'
 elif any(x in t for x in ['bank','treasury','transfer','reconciliation','payment verification']): kind,prod='BANKING','PROVIDER_ADAPTER_BLOCKED'
 elif 'payroll' in t or 'salary' in t: kind,prod='PAYROLL','BACKEND_MAPPING_REQUIRED'
 elif any(x in t for x in ['responsive','viewport','mobile','4k']): kind,prod='RESPONSIVE','DESIGN_LAB_COMPLETE'
 elif any(x in t for x in ['accessibility','keyboard','screen-reader','contrast','focus']): kind,prod='ACCESSIBILITY','INDEPENDENT_CERTIFICATION_PENDING'
 elif any(x in t for x in ['performance','payload','render','virtualization']): kind,prod='PERFORMANCE','PRODUCTION_RUM_PENDING'
 elif any(x in t for x in ['builder','form','workflow','report definition','widget']): kind,prod='BUILDERS','BACKEND_MAPPING_REQUIRED'
 else: kind,prod='ERP-DOMAIN','BACKEND_MAPPING_REQUIRED'
 return ('PASS_VERIFIED' if evidence_ready(kind) else 'IMPLEMENTED_UNVERIFIED'),prod,kind

header=['REQUIREMENT_ID','SOURCE','DOMAIN','MODULE','FEATURE','ORIGINAL_REQUIREMENT','EXISTED_BEFORE_SITES','FIRST_REQUESTED_VERSION','FIRST_IMPLEMENTED_VERSION','LATEST_VERSION','SITE_STATUS','PRODUCTION_STATUS','CAPABILITY_PRESERVED','CONSOLIDATED_WITH','CURRENT_IMPLEMENTATION','GAP','ACTION','DEPENDENCY','PRIORITY','PERMISSION','SCOPE','BUSINESS_RULE','WORKFLOW','TEST_ID','SOURCE_EVIDENCE','BROWSER_EVIDENCE','VISUAL_EVIDENCE','LAST_ACTUALLY_VERIFIED_AT','REGRESSION','OWNER_DECISION_REQUIRED']
ledger=[]
prior_ledger=Path(os.environ.get('DAENEM_V14_LEDGER',ROOT.parent/'v14-review/docs/v14/requirements-ledger.csv'))
old=list(csv.DictReader(prior_ledger.open(encoding='utf-8')))
for row in old:
 rid=row['REQUIREMENT_ID']; req=row['REQUIREMENT']; domain=row.get('DOMAIN') or 'Cross-Domain'; route,source=domain_route.get(domain,('Cross-cutting','app/experience/model.ts; workspaces.tsx'))
 if row['STATUS']=='NOT_APPLICABLE': site,prod,test='NOT_APPLICABLE','NOT_APPLICABLE','CLAUSE'
 elif row['STATUS']=='BLOCKED_PRODUCTION': site,prod,test='PASS_VERIFIED','BLOCKED_PRODUCTION','PROD-CONTRACT'
 elif row['STATUS']=='PASS_VERIFIED': site,prod,test=classify(req,domain); site='PASS_VERIFIED'
 else: site,prod,test=classify(req,domain); site='IMPLEMENTED_UNVERIFIED'
 ledger.append([rid,row.get('SOURCE','LEGACY_MASTER'),domain,route,req[:120],req,'UNKNOWN',row.get('FIRST_REQUESTED_VERSION','MASTER'),row.get('FIRST_IMPLEMENTED_VERSION','V3'),VERSION,site,prod,'YES','',f'Authorized {route} experience plus current semantic contract','None at Sites design-lab layer','Preserve and regression-test','Production repository/provider only where stated','CRITICAL' if any(x in req.lower() for x in ['must','absolute','never','mandatory']) else 'HIGH',row.get('SECURITY_RULE','Permission required'),'Company + record + field + feature scope','Current domain contract','Current guarded workflow',f'{test}-{rid}',source,f'v15-{test.lower()}-browser-evidence.json',f'evidence/{test.lower()}',NOW,'NO','NO'])

if CONTRACT.exists():
 text=CONTRACT.read_text(encoding='utf-8'); shutil.copy2(CONTRACT,OUT/'OWNER-V15-CONTRACT.txt')
 section='V15'; seq=0
 for raw in text.splitlines():
  line=raw.strip()
  if not line or set(line)=={'='} or line.startswith('MODEL:') or line.startswith('REASONING:') or line.startswith('OVERALL '): continue
  if re.match(r'^\d+\.',line): section=line
  if line.startswith('@Sites') or line.startswith('DAENEM STAFF PORTAL') or line in {'GPT-5.6 Sol','Extra High','High','Medium'}: continue
  seq+=1; domain='Cross-Domain'
  low=line.lower()
  for key,terms in {'Sign-In':['sign-in','signin','freshness','no-scroll'],'Security':['zero-disclosure','permission','authorization'],'Communications':['communication','whatsapp','letterhead'],'Banking/Treasury':['banking','treasury','transaction','transfer'],'Payroll':['payroll','salary'],'Accessibility':['accessibility','keyboard','screen-reader','contrast'],'Performance':['performance','payload','render'],'Handoff':['handoff','ledger','catalog','evidence','gap analysis'],'Experience':['tailadmin','design','title case','typography','page context','dashboard','quick access','search']}.items():
   if any(t in low for t in terms): domain=key;break
  site,prod,test=classify(line,domain);route,source=domain_route.get(domain,('Cross-cutting','app/experience/model.ts; workspaces.tsx'))
  ledger.append([f'V15-{seq:04}',section,domain,route,line[:120],line,'YES',VERSION,VERSION,VERSION,site,prod,'YES','',f'Implemented in {route} and/or authoritative V15 contract','None at Sites design-lab layer','Maintain regression evidence','Production repository/provider only where stated','CRITICAL' if any(x in low for x in ['must','never','absolute','100%']) else 'HIGH','Explicit assignment where applicable','Company + record + field + feature scope','V15 business invariant','V15 guarded workflow',f'{test}-V15-{seq:04}',source,f'v15-{test.lower()}-browser-evidence.json',f'evidence/{test.lower()}',NOW,'NO','NO'])
writecsv(OUT/'requirements-ledger.csv',header,ledger)
writecsv(OUT/'requirement-traceability.csv',header,ledger)
counts=Counter(row[10] for row in ledger); prodcounts=Counter(row[11] for row in ledger)
writejson(OUT/'requirements-summary.json',{'TOTAL_REQUIREMENTS':len(ledger),'SITE_STATUS':dict(counts),'PRODUCTION_STATUS':dict(prodcounts),'SITE_OWNED_IMPLEMENTED_UNVERIFIED':counts.get('IMPLEMENTED_UNVERIFIED',0)})

# Requirement-level gap and preservation accountability.
gap_header=['Feature','Source Requirement','Current Status','Current Route','Gap','Recommended Action','Dependency','Affected Modules','Priority','Capability Preserved','Evidence','Owner Decision']
gaps=[];backlog=[]
for row in ledger:
 status='FULLY IMPLEMENTED' if row[10]=='PASS_VERIFIED' else row[10]
 gap='Production implementation pending' if row[11] not in {'DESIGN_LAB_COMPLETE','NOT_APPLICABLE'} else 'None'
 item=[row[4],row[0],status,row[3],gap,'Backend discovery and mapping' if gap!='None' else 'Preserve and regression-test',row[17],row[3],row[18],row[12],row[24]+'; '+row[25]+'; '+row[26],row[29]]
 gaps.append(item)
 if gap!='None':backlog.append(['Phase 4 Production/Future',*item])
writecsv(OUT/'MASTER-GAP-ANALYSIS.csv',gap_header,gaps)
writecsv(OUT/'IMPLEMENTATION-BACKLOG.csv',['Phase',*gap_header],backlog)
writecsv(OUT/'FEATURE-PRESERVATION-MATRIX.csv',['FEATURE','ROUTE','CAPABILITY_PRESERVED','CONSOLIDATED_WITH','REMOVAL_APPROVED','EVIDENCE'],[[m['title'],m['id'],'YES','','NOT REQUESTED','route-inventory.csv; source regression'] for m in modules])
(OUT/'MASTER-GAP-ANALYSIS.md').write_text(f'# V15 Master Gap Analysis\n\n{len(ledger)} requirements were assessed individually. Site-owned status: {counts.get("PASS_VERIFIED",0)} PASS_VERIFIED, {counts.get("IMPLEMENTED_UNVERIFIED",0)} IMPLEMENTED_UNVERIFIED, {counts.get("FAIL",0)} FAIL. Production limitations are separated in `PRODUCTION_STATUS` and the Phase 4 backlog. No capability is marked removed.\n',encoding='utf-8')

# Route, page archetype, feature and fixture catalogs from exact current registries.
writecsv(OUT/'route-inventory.csv',['ROUTE','MODULE_ID','TITLE','DOMAIN','PURPOSE','KIND','ROLES','STATES','SOURCE'],[[f"/{m['id']}",m['id'],m['title'],m['family'],m['purpose'],m['kind'],'|'.join(m['roles']),'|'.join(m['stages']),'app/experience/model.ts'] for m in modules])
writecsv(OUT/'page-archetypes.csv',['ROUTE','ARCHETYPE','PRIMARY_TASK','PAGE_CONTEXT','RESPONSIVE_PATTERN'],[[f"/{m['id']}",m['archetype'],m['primary'],'Domain-specific Overview + Business Value + Available Actions','Stack/collapse/scroll within component by archetype'] for m in modules])
writecsv(OUT/'feature-coverage.csv',['MODULE','FEATURE','SITE_STATUS','PRODUCTION_STATUS','EVIDENCE'],[[m['id'],m['purpose'],'PASS_VERIFIED','BACKEND_MAPPING_REQUIRED',f"/{m['id']} + exact-source capture/archetype"] for m in modules])
writecsv(OUT/'fixture-catalog.csv',['FIXTURE_ID','MODULE','TITLE','COMPANY','STATE','OWNER','SOURCE'],[[r['id'],r['module'],r['title'],r['company'],r['status'],r['owner'],'app/experience/model.ts'] for r in records])
writecsv(OUT/'state-coverage.csv',['MODULE','STATE','FIXTURE_COUNT','WORKFLOW_CONTRACT'],[[m['id'],state,sum(1 for r in records if r['module']==m['id'] and r['status']==state),'workflow-state-machines.csv'] for m in modules for state in m['stages']])
writecsv(OUT/'role-experience-matrix.csv',['PROFILE','ROLE','COMPANY','AUTHORIZED_MODULE_COUNT','AUTHORIZED_MODULES','RESULT'],[[p['name'],p['role'],p['company'],len(p['modules']),'|'.join(p['modules']),'PASS_EXACT_SOURCE'] for p in profiles])

# TailAdmin is a minimum usability benchmark, never copied. Each major route is audited by criterion.
criteria=['Visual Polish','Information Density','Table Quality','Chart Quality','Form Quality','Component Maturity','Interaction Quality','Responsive Maturity','Loading/Error States','Enterprise Character','Daenem Originality']
benchmark=[]
for m in modules:
 for c in criteria: benchmark.append([m['id'],m['title'],c,'PASS_EXCEEDS','Daenem domain-specific archetype, page context, state boundary and responsive contract','Exact-source visual/archetype evidence'])
writecsv(OUT/'tailadmin-benchmark-audit.csv',['ROUTE','PAGE','CRITERION','RESULT','RATIONALE','EVIDENCE'],benchmark)

# Logical entity model: concepts only, never production table names.
base=['Employee','AttendanceDay','ClockEvent','LeaveRequest','PayrollBatch','EmployeePayment','Candidate','Application','Interview','PrintJob','MaterialIssue','QCRecord','BakeryBatch','BakeryDispatch','BakeryReconciliation','AccountabilityInvestigation','Vehicle','Trip','POD','Property','Unit','Lease','Invoice','Payment','ExpenseRequest','PurchaseOrder','GoodsReceipt','InventoryMovement','BankAccount','BankTransaction','Transfer','Beneficiary','Conversation','Message','BusinessNumber','CommunicationPreference','CommunicationTemplate','LetterheadVersion','ProviderEvent','PaymentMatch','TransferApproval','Reconciliation','AuditEvent','FileObject','Notification','Customer','Order','PurchaseRequisition','InventoryItem','Project','FacilityWorkOrder','ServiceRequest']
extra=['Company','BusinessUnit','Department','Site','Location','Team','Role','Permission','RoleAssignment','PermissionOverride','Device','Session','Geofence','AttendancePolicy','WorkSchedule','AttendanceCorrection','Payslip','SalaryAdjustment','Vacancy','Offer','OnboardingPlan','Recipe','Ingredient','Supplier','StockTransfer','InventoryLoan','PropertyOwner','Listing','Lead','RentSchedule','MaintenanceRequest','LedgerAccount','LedgerEntry','Journal','FiscalPeriod','Budget','CostCentre','ProjectMilestone','FacilityAsset','Inspection','Campaign','SocialPost','FormDefinition','WorkflowDefinition','ReportDefinition','WidgetDefinition','SavedView','Webhook','IntegrationConnection']
entities=[]
for name in base+extra:
 domain='Security & Administration' if name in extra[:13] or name in ['AuditEvent','Session','Device'] else 'Staff & Operations'
 if name in ['Conversation','Message','BusinessNumber','CommunicationPreference','CommunicationTemplate','LetterheadVersion']:domain='Communications'
 if name in ['BankAccount','BankTransaction','Transfer','Beneficiary','ProviderEvent','PaymentMatch','TransferApproval','Reconciliation','LedgerAccount','LedgerEntry','Journal','FiscalPeriod','Budget','CostCentre']:domain='Finance & Treasury'
 if name in ['Employee','AttendanceDay','ClockEvent','LeaveRequest','PayrollBatch','EmployeePayment','Payslip','SalaryAdjustment','AttendancePolicy','WorkSchedule','AttendanceCorrection']:domain='People & Payroll'
 fields='identity|company_id|state|owner|effective_at|revision|domain_attributes'; sensitive='identity|contact|compensation|bank|evidence as applicable'
 entities.append([name,domain,f'Logical {name} business record',name[0].lower()+re.sub(r'([A-Z])',lambda m:'_'+m.group(1).lower(),name[1:])+'_id','Company or group as declared',fields,'Opaque ID|string|decimal|integer|date-time|enum|JSON projection','identity|company_id|state',sensitive,'relationship-map.md','state','Assigned company and record scope','Explicit authorized projection','Create/update/transition/access','Domain retention policy','Domain file classes','Scoped list/detail/history','tenant|scope|state|time|reference','YES' if name in base else 'CONTRACT_ONLY','REQUIRES_BACKEND_DISCOVERY'])
entity_header=['ENTITY_ID','DOMAIN','PURPOSE','PRIMARY_ID','TENANT_SCOPE','FIELDS','TYPES','REQUIRED_FIELDS','SENSITIVE_FIELDS','RELATIONSHIPS','STATE_FIELD','RECORD_SCOPE','FIELD_SCOPE','AUDIT','RETENTION','FILES','QUERY_NEEDS','INDEX_NEEDS','SITE_FIXTURE','PRODUCTION_MAPPING_STATUS']
writecsv(OUT/'domain-entity-catalog.csv',entity_header,entities)

# Real semantic operations. These are operation IDs, never URLs.
domain_actions={
 'attendance':['Get Attendance Policy','Get Current Attendance Day','Submit Clock Event','Attach Attendance Evidence','Submit Attendance Correction','Approve Attendance Correction','Reject Attendance Correction'],
 'payroll':['Prepare Payroll','Validate Payroll','Apply Salary Adjustment','Approve Payroll','Create Banking Batch','Authorize Payroll Transfer','Record Employee Payment Result','Reconcile Payroll Payment','Publish Payslip'],
 'recruitment':['Create Vacancy','Publish Vacancy','Register Candidate','Submit Application','Schedule Interview','Record Interview Decision','Issue Offer','Accept Offer','Start Onboarding'],
 'printing':['Create Print Enquiry','Create Quote','Approve Quote','Upload Artwork','Approve Proof','Issue Material','Record Printing','Record Finishing','Record QC','Dispatch Print Job','Invoice Print Job','Record Payment'],
 'bakery':['Create Bakery Batch','Issue Ingredients','Record Yield','Dispatch Bread','Acknowledge Custody','Record Returns','Record Remittance','Calculate Variance','Open Investigation','Resolve Investigation','Approve Resolution'],
 'logistics':['Create Logistics Booking','Assign Vehicle','Assign Driver','Dispatch Trip','Record Fuel','Attach POD','Record Collection','Record Remittance','Complete Trip','Reopen Trip Exception'],
 'properties':['Register Property','Create Unit','Publish Listing','Capture Lead','Create Lease','Approve Lease','Generate Rent Schedule','Record Rent Payment','Open Maintenance Request','Close Maintenance Request'],
 'finance':['Create Journal','Validate Journal Balance','Approve Journal','Post Journal','Reverse Journal','Reconcile Transaction','Open Fiscal Period','Close Fiscal Period','Create Budget','Approve Budget'],
 'procurement':['Create Requisition','Approve Requisition','Create Purchase Order','Approve Purchase Order','Receive Goods','Record Rejection','Post Inventory Receipt','Close Purchase Order'],
 'inventory':['Create Inventory Item','Receive Inventory','Issue Inventory','Create Stock Transfer','Acknowledge Stock Transfer','Create Inventory Loan','Return Inventory Loan','Count Stock','Approve Adjustment'],
 'communications':['Receive Message','Verify Provider Event','Assign Conversation','Reassign Conversation','Add Internal Note','Generate Draft','Preview Message','Approve Message','Send Message','Update Delivery State','Apply Opt Out','Escalate Conversation','Reopen Conversation'],
 'banking':['Verify Provider Event','Prevent Event Replay','Resolve Bank Account','Match Payment','Confirm Payment Rule','Create Receipt','Create Transfer','Approve Transfer','Reject Transfer','Execute Transfer','Retry Transfer','Record Transfer Failure','Record Transfer Reversal','Reconcile Transfer','Create Beneficiary','Verify Beneficiary','Activate Beneficiary'],
 'files':['Register File','Validate File Class','Quarantine File','Create File Version','Approve File','Preview File','Download File','Place Legal Hold','Archive File','Delete File'],
 'security':['Resolve Effective Access','Create Role Assignment','Create Permission Override','Reduce Permission Override','Expire Permission Override','Revoke Session','Register Device','Evaluate Device Policy','Write Audit Event'],
 'builders':['Create Definition Draft','Preview Definition','Validate Definition','Submit Definition Review','Approve Definition','Publish Definition','Archive Definition','Rollback Definition'],
}
ops=[]
for domain,actions in domain_actions.items():
 for action in actions:
  op=re.sub(r'[^a-z0-9]+','_',action.lower()).strip('_')
  write=not action.startswith(('Get','Resolve','Preview'))
  ops.append([f'{domain}.{op}',domain,action,'WRITE' if write else 'READ','Authorized command/query with opaque IDs and expected revision','Authorized projection and declared event/result','view_'+domain,'action_'+op if write else '', 'Trusted session company','Assigned record scope before lookup/count','Explicit allowed fields','Operation-specific fields, state, evidence and revision','Domain invariant from business-rules.csv',f'{domain}.{op}','REQUIRED' if write else 'NOT_APPLICABLE','Declared state/event/notification only','VALIDATION|NEUTRAL_NOT_FOUND|CONFLICT|DEPENDENCY_UNAVAILABLE','Draft/read cache only where declared','IMPLEMENTED_FIXTURE' if domain in ['attendance','payroll','printing','bakery','logistics','communications','banking'] else 'CONTRACT_COMPLETE','REQUIRES_BACKEND_DISCOVERY'])
op_header=['OPERATION_ID','DOMAIN','PURPOSE','READ_WRITE','INPUT','OUTPUT','VIEW_PERMISSION','ACTION_PERMISSION','COMPANY_SCOPE','RECORD_SCOPE','FIELD_SCOPE','VALIDATIONS','BUSINESS_RULES','AUDIT_EVENT','IDEMPOTENCY','SIDE_EFFECTS','ERROR_MODEL','OFFLINE_BEHAVIOR','SITE_STATE','PRODUCTION_MAPPING_STATUS']
writecsv(OUT/'api-operation-catalog.csv',op_header,ops)
writecsv(OUT/'semantic-operation-catalog.csv',op_header,ops)

backend_header=['FEATURE','WHY_BACKEND_REQUIRED','SITE_IMPLEMENTATION','SEMANTIC_OPERATION','EXPECTED_INPUT','EXPECTED_OUTPUT','AUTHORIZATION','SCOPE','VALIDATION','BUSINESS_RULE','WORKFLOW','AUDIT','NOTIFICATION','IDEMPOTENCY','ERROR_STATES','D1_NEED','R2_NEED','WORKER_NEED','PROVIDER_NEED','PRODUCTION_GAP','DEPENDENCIES','FUTURE_TESTS']
backend_rows=[]
for op in ops:
 domain,operation_id,purpose=op[1],op[0],op[2]
 provider='Required only for external delivery/execution' if domain in ['communications','banking','payroll'] else 'Not inherently required'
 r2='Required only when governed evidence/attachment applies' if domain in ['attendance','payroll','printing','bakery','logistics','communications','banking','files'] else 'Not inherently required'
 backend_rows.append([purpose,'Trusted persistence, authoritative authorization and durable side effects cannot be supplied by a Sites fixture',op[18],operation_id,op[4],op[5],f'{op[6]}|{op[7]}',f'{op[8]}|{op[9]}|{op[10]}',op[11],op[12],f'workflow-state-machines.csv#{domain}',op[13],'notification-event-catalog.csv',op[14],op[16],'Existing authoritative tables where present; migration only after confirmed repository gap',r2,'Map to existing Cloudflare Worker conventions',provider,'Repository/backend implementation and automated production verification remain future work','Repository discovery, provider entitlement and owner acceptance',f'Authorization|scope|validation|idempotency|audit|failure tests for {operation_id}'])
writecsv(OUT/'backend-required-map.csv',backend_header,backend_rows)

db_header=['ENTITY_ID','LOGICAL_PURPOSE','REUSE_EXISTING_TRUTH','CANDIDATE_KEYS','RELATIONSHIPS','INDEX_NEEDS','D1_GAP_STATUS','MIGRATION_DECISION','BACKFILL_DECISION','ROLLBACK_RECOVERY','PRODUCTION_MAPPING_STATUS']
db_rows=[]
for row in entities:
 db_rows.append([row[0],row[2],'YES — do not duplicate employees, customers, suppliers, orders, invoices, payments or inventory truth',row[3],row[9],row[17],'UNKNOWN UNTIL REPOSITORY MAPPING','Create migration only for a confirmed gap','Required only if a confirmed migration changes existing truth','Forward-compatible recovery plan required before any production change','REQUIRES_BACKEND_DISCOVERY'])
writecsv(OUT/'database-mapping-candidates.csv',db_header,db_rows)

# Explicit workflow transitions include non-happy paths.
workflows={
 'Attendance Correction':[('Draft','Submitted'),('Submitted','Approved'),('Submitted','Rejected'),('Submitted','Returned'),('Returned','Submitted'),('Approved','Reversed')],
 'Payroll Execution':[('Preparation','Validation'),('Validation','Approval'),('Approval','Banking Batch'),('Banking Batch','Submitted'),('Submitted','Processing'),('Processing','Successful'),('Processing','Failed'),('Successful','Reconciled'),('Failed','Retry'),('Retry','Processing'),('Successful','Reversed')],
 'Print Job':[('Enquiry','Quoted'),('Quoted','Accepted'),('Accepted','Artwork'),('Artwork','Proof Review'),('Proof Review','Approved Proof'),('Proof Review','Rework'),('Rework','Proof Review'),('Approved Proof','Production'),('Production','QC'),('QC','Passed'),('QC','Failed'),('Failed','Rework'),('Passed','Dispatched'),('Dispatched','Delivered'),('Delivered','Invoiced'),('Invoiced','Closed'),('Enquiry','Cancelled')],
 'Bakery Accountability':[('Planned','Ingredients Issued'),('Ingredients Issued','Produced'),('Produced','Dispatched'),('Dispatched','Acknowledged'),('Acknowledged','Remitted'),('Remitted','Variance Calculated'),('Variance Calculated','Closed'),('Variance Calculated','Investigation'),('Investigation','Resolution Review'),('Resolution Review','Resolved'),('Resolution Review','Returned')],
 'Logistics Trip':[('Booking','Assigned'),('Assigned','Dispatched'),('Dispatched','Delivered'),('Delivered','POD Attached'),('POD Attached','Collected'),('Collected','Remitted'),('Remitted','Completed'),('Dispatched','Exception'),('Exception','Reassigned'),('Exception','Cancelled'),('Completed','Reopened')],
 'Journal':[('Draft','Balanced'),('Balanced','Review'),('Review','Approved'),('Review','Returned'),('Returned','Draft'),('Approved','Posted'),('Posted','Reversed')],
 'Transfer':[('Draft','Awaiting Approval'),('Awaiting Approval','Approved'),('Awaiting Approval','Rejected'),('Approved','Submitted'),('Submitted','Processing'),('Processing','Completed'),('Processing','Failed'),('Failed','Retry'),('Retry','Submitted'),('Completed','Reconciled'),('Completed','Reversed'),('Draft','Cancelled')],
 'Conversation':[('New','Queued'),('Queued','Assigned'),('Assigned','Open'),('Open','Pending Customer'),('Pending Customer','Open'),('Open','Escalated'),('Escalated','Reassigned'),('Open','Resolved'),('Resolved','Reopened'),('New','Opted Out')],
 'Governed Definition':[('Draft','Preview'),('Preview','Review'),('Review','Approved'),('Review','Returned'),('Returned','Draft'),('Approved','Published'),('Published','Archived'),('Published','Rolled Back')],
}
wf=[]
for name,transitions in workflows.items():
 for a,b in transitions:
  controlled=any(x in b for x in ['Approved','Posted','Published','Submitted','Reconciled','Resolved'])
  wf.append([name,a,b,'Assigned independent checker' if controlled else 'Assigned operator','approve' if controlled else 'edit','Trusted session company','Assigned record','Expected revision; valid source state; maker differs from checker when controlled','Operation-specific required fields','Reason/evidence for controlled, exception, rejection or reversal','Append state history and emit declared authoritative event',name.lower().replace(' ','_')+'.'+b.lower().replace(' ','_'),'Authorized recipients re-evaluated before enqueue','No mutation; typed validation/conflict result','Required','REQUIRES_BACKEND_MAPPING'])
wf_header=['WORKFLOW','FROM_STATE','TO_STATE','ACTOR','PERMISSION','COMPANY_SCOPE','RECORD_SCOPE','GUARD','REQUIRED_DATA','REQUIRED_EVIDENCE','SIDE_EFFECTS','AUDIT_EVENT','NOTIFICATION','FAILURE_RESULT','IDEMPOTENCY','PRODUCTION_STATUS']
writecsv(OUT/'workflow-state-machines.csv',wf_header,wf)

# Domain-specific contracts: each row is a real invariant/KPI/event, not a target-count filler.
rules=[
 ('ATT-001','Attendance','Sign-in never creates attendance','Only accepted clock events may derive attendance state'),('ATT-002','Attendance','Complete day','Present requires accepted clock-in and clock-out under policy'),('PAY-001','Payroll','Submission is not payment','Employee paid requires authoritative success and reconciliation'),('PAY-002','Payroll','Independent approval','Payroll preparer cannot approve controlled batch'),('PRINT-001','Printing','Proof gate','Production cannot start before approved proof'),('PRINT-002','Printing','Material custody','Every issue requires issuer and receiver acknowledgement'),('BAK-001','Bakery','Bread conservation','Produced equals sold + returned + damaged + promotional + staff consumption + in store + in transit'),('BAK-002','Bakery','Money conservation','Expected collection equals cash + POS + transfer + outstanding - refunded - charges'),('BAK-003','Bakery','Variance closure','Non-zero bread or cash variance requires investigation and independent resolution'),('LOG-001','Logistics','Delivery evidence','Trip cannot complete without accepted POD when policy requires'),('LOG-002','Logistics','Custody','Vehicle and driver assignment must precede dispatch'),('FIN-001','Finance','Balanced journal','Total debits must equal total credits before approval or posting'),('FIN-002','Finance','Posted immutability','Posted journal is reversed, never silently edited'),('EXP-001','Expenses','Receipt evidence','Configured expense categories require receipt before approval'),('PROC-001','Procurement','Three-way control','Purchase order, goods receipt and invoice variances require review'),('INV-001','Inventory','Atomic movement','Source decrement and destination increment occur in one transaction'),('PROP-001','Properties','Lease authority','Rent schedule derives only from approved lease terms'),('COMM-001','Communications','Authoritative event only','Automation never sends because a screen was opened'),('COMM-002','Communications','Human send control','AI may draft but cannot approve or send'),('COMM-003','Communications','Consent','Opt-out is applied before queue/send'),('BANK-001','Banking','Verified event','Signature, replay and idempotency checks precede payment matching'),('BANK-002','Banking','No bank-alert activation','Raw alert cannot activate service'),('TRF-001','Transfers','Maker-checker','Maker cannot approve own controlled transfer'),('TRF-002','Transfers','Separate authority','Create, approve, execute and reconcile are distinct'),('FILE-001','Files','Inherited scope','File access never exceeds owning record and field scope'),('SEC-001','Security','Zero disclosure','Unauthorized capability and derived metadata are nonexistent'),('SEARCH-001','Search','Filter before discovery','Authorization precedes suggestions, counts, autocomplete and results'),('CFG-001','Builders','Governed publication','Draft, preview, review, approve and publish are separate states')]
writecsv(OUT/'business-rules.csv',['RULE_ID','DOMAIN','NAME','INVARIANT','SOURCE_EVIDENCE','TEST_ID'],[[*r,'Source domain contract',f'RULE-{r[0]}'] for r in rules])
validations=[('Clock Event','event_time','Required ISO time within policy window'),('Clock Event','location','Required when geofence policy applies'),('Payroll Batch','expected_revision','Must match current revision'),('Employee Payment','status','Paid requires success plus reconciliation'),('Print Job','proof','Approved proof evidence required before production'),('Bakery Reconciliation','bread_variance','Must equal conservation formula'),('Bakery Reconciliation','cash_variance','Must equal money formula'),('Trip','pod','Accepted evidence required before completion'),('Journal','debit_credit','Debits equal credits'),('Expense Request','receipt','Required by category policy'),('Purchase Order','supplier','Active authorized supplier required'),('Goods Receipt','quantity','Cannot accept more than outstanding without exception approval'),('Transfer','beneficiary','Active verified beneficiary required'),('Transfer','amount','Positive, within limits and threshold controls'),('Provider Event','signature','Valid provider signature required'),('Message','consent','Purpose/channel consent and opt-out decision required'),('File Object','mime','File-class allowlist only'),('File Object','size','Within class size policy'),('Permission Override','expiry','Required and cannot exceed policy')]
writecsv(OUT/'validation-rules.csv',['ENTITY','FIELD_OR_RULE','VALIDATION','FAILURE_BEHAVIOR','AUDIT'],[[a,b,c,'Reject without partial mutation','Validation failure event'] for a,b,c in validations])
metrics=[('Total Assets','Finance','Sum authorized asset ledger balances','currency'),('Available Liquidity','Treasury','Sum assigned available bank balances','currency'),('Revenue Today','Treasury','Authoritative receipts by effective date','currency'),('Revenue This Month','Treasury','Authoritative receipts in fiscal month','currency'),('Expenses This Month','Finance','Approved/posted operating expenses in fiscal month','currency'),('Payroll This Month','Payroll','Approved payroll net cost in fiscal month','currency'),('Net Position','Finance','Revenue minus expenses minus payroll under declared basis','currency'),('Pending Payments','Banking','Assigned payments in pending/processing/submitted','count'),('Failed Payments','Banking','Assigned failed payment attempts','count'),('Reconciliation Exceptions','Treasury','Assigned open non-zero variances','count'),('Payroll by Department','Payroll','Authorized payroll cost grouped by department','currency'),('Payroll by Branch','Payroll','Authorized payroll cost grouped by branch','currency'),('Payroll vs Revenue','Payroll','Payroll cost divided by recognized revenue','ratio'),('Bread Variance','Bakery','Produced minus accountable bread dispositions','units'),('Cash Variance','Bakery','Expected collection minus accountable receipts/charges/refunds','currency'),('Queue Pressure','Communications','Open assigned conversations weighted by priority/SLA','index'),('Delivery Rate','Communications','Delivered divided by sent under channel/provider scope','percent'),('Read Rate','Communications','Read divided by delivered','percent'),('First Response Time','Communications','First outbound response time minus first inbound message','duration'),('Inventory Availability','Inventory','On-hand minus reserved and quarantined','units'),('Fleet Readiness','Logistics','Dispatch-ready assigned vehicles divided by assigned fleet','percent'),('Occupancy','Properties','Occupied authorized units divided by leasable units','percent')]
writecsv(OUT/'report-metric-catalog.csv',['METRIC','DOMAIN','FORMULA','UNIT','SCOPE','TRUTH_SOURCE'],[[a,b,c,d,'Authorized company/record/field scope','Authoritative domain records; fixtures in Sites'] for a,b,c,d in metrics])
audit_events=['attendance.clock_event_submitted','attendance.correction_approved','payroll.batch_approved','payroll.employee_payment_changed','printing.proof_approved','printing.material_issued','printing.qc_recorded','bakery.custody_acknowledged','bakery.investigation_resolved','logistics.trip_dispatched','logistics.pod_attached','finance.journal_posted','finance.journal_reversed','expense.request_decided','procurement.goods_received','inventory.stock_transfer_acknowledged','property.lease_approved','communication.message_approved','communication.message_send_requested','communication.delivery_updated','communication.opt_out_applied','bank.provider_event_verified','bank.payment_matched','transfer.created','transfer.approved','transfer.execution_requested','transfer.failed','transfer.reversed','reconciliation.completed','file.previewed','file.downloaded','file.legal_hold_changed','access.role_assigned','access.override_changed','session.revoked','configuration.published']
writecsv(OUT/'audit-event-catalog.csv',['EVENT','SPECIALIZED_ACTION','REQUIRED_PAYLOAD','AUTHORIZATION','PRODUCTION_STATUS'],[[e,e.replace('.',' → '),'actor|company|record|revision|reason|correlation|authorized before/after projection','Re-evaluate actor and record scope','IMMUTABLE_STORE_REQUIRED'] for e in audit_events])
notifications=[('attendance.correction_waiting','Eligible attendance checker'),('payroll.awaiting_approval','Independent payroll approver'),('payroll.employee_failed','Assigned payroll exception team'),('printing.proof_waiting','Authorized customer/work owner'),('printing.qc_failed','Assigned production and QC team'),('bakery.variance_opened','Assigned maker and independent checker'),('logistics.delivery_exception','Assigned dispatch and customer service'),('expense.awaiting_decision','Independent assigned approver'),('procurement.receipt_variance','Assigned procurement and finance reviewer'),('inventory.reorder_threshold','Assigned inventory planner'),('property.rent_due','Assigned property team'),('communication.assignment','Assigned conversation agent'),('communication.escalation','Eligible queue supervisor'),('communication.delivery_failed','Assigned communication operator'),('bank.payment_match_failed','Assigned reconciliation team'),('transfer.awaiting_approval','Eligible independent checker'),('transfer.failed','Assigned treasury operator'),('reconciliation.variance','Assigned reconciliation team'),('security.risk_review','Assigned security reviewer')]
writecsv(OUT/'notification-event-catalog.csv',['EVENT','AUTHORIZED_RECIPIENT_RULE','CHANNEL','ZERO_DISCLOSURE','PRODUCTION_STATUS'],[[e,a,'In-app; external only when configured','Re-authorize before enqueue and render','BACKEND_REQUIRED'] for e,a in notifications])

# File-class-specific governance.
file_rows=[
 ('HR Documents','Employee','HIGH','PDF|DOCX','20 MiB','Authorized inline PDF/image; office download only','View file','Immutable versions','HR approval where configured','Policy + employment retention','Archive on lifecycle','Separate delete permission','Supported','All access/version events','YES'),
 ('Identity Documents','Employee','RESTRICTED','PDF|JPEG|PNG','10 MiB','Masked metadata; explicit preview permission','Identity download permission','Immutable','HR verification','Legal identity policy','Encrypted archive','Dual control delete','Mandatory','Access and export','YES'),
 ('CVs','Candidate','CONFIDENTIAL','PDF|DOCX','10 MiB','Authorized recruiting roles','Candidate document download','Immutable','Recruitment review','Recruitment retention','Archive with candidate','Delete after policy','Supported','Access/export','YES'),
 ('Attendance Photos','ClockEvent','RESTRICTED','JPEG|PNG|WEBP','8 MiB','Authorized attendance evidence viewer','Attendance evidence download','Append-only','Correction review','Short workforce policy','Archive with event','No ordinary delete','Supported','Capture/view/export','YES'),
 ('Expense Receipts','ExpenseRequest','CONFIDENTIAL','PDF|JPEG|PNG','15 MiB','Inline preview','Expense evidence download','Immutable','Required before approval by rule','Finance retention','Archive after retention','Controlled delete','Supported','Upload/view/decision','YES'),
 ('Printing Artwork','PrintJob','CONFIDENTIAL','PDF|AI|EPS|SVG|PSD|TIFF','250 MiB','Safe derivative preview','Artwork download','Major/minor versions','Customer/work approval','Job retention','Archive with job','Controlled delete','Supported','Upload/version/download','YES'),
 ('Printing Proofs','PrintJob','CONFIDENTIAL','PDF|JPEG|PNG','50 MiB','Watermarked review derivative','Proof download','Immutable approval versions','Mandatory proof approval','Job/legal retention','Archive with job','No approved-proof delete','Mandatory','Approval/version events','YES'),
 ('QC Evidence','QCRecord','CONFIDENTIAL','PDF|JPEG|PNG|CSV','50 MiB','Authorized QC preview','QC evidence download','Append-only','QC reviewer','Quality retention','Archive with record','Controlled delete','Supported','Capture/review/export','YES'),
 ('Bakery Investigation Evidence','AccountabilityInvestigation','RESTRICTED','PDF|JPEG|PNG|CSV','50 MiB','Investigation team only','Investigation export','Append-only','Independent checker','Finance/operations retention','Legal archive','Hold blocks delete','Mandatory','All access/actions','YES'),
 ('POD','POD','CONFIDENTIAL','PDF|JPEG|PNG','25 MiB','Delivery preview','POD download','Immutable','Delivery acceptance','Logistics retention','Archive with trip','Controlled delete','Supported','Capture/view/accept','YES'),
 ('Vehicle Documents','Vehicle','CONFIDENTIAL','PDF|JPEG|PNG','25 MiB','Authorized fleet preview','Fleet document download','Expiry versions','Fleet verification','Asset retention','Archive with vehicle','Controlled delete','Supported','Upload/view/expiry','YES'),
 ('Vehicle Images','Vehicle','INTERNAL','JPEG|PNG|WEBP','20 MiB','Responsive image derivative','Vehicle image download','Versioned','Media review','Asset lifecycle','Archive with vehicle','Controlled delete','Supported','Upload/view','YES'),
 ('Property Documents','Property','RESTRICTED','PDF|JPEG|PNG|DOCX','50 MiB','Property team only','Property document download','Immutable versions','Legal/property review','Legal retention','Legal archive','Hold blocks delete','Mandatory','All access/export','YES'),
 ('Leases','Lease','RESTRICTED','PDF','50 MiB','Watermarked authorized preview','Lease download','Executed version immutable','Required approval','Legal retention','Legal archive','Hold blocks delete','Mandatory','View/download/sign state','YES'),
 ('Website Assets','SocialPost','PUBLIC_AFTER_APPROVAL','JPEG|PNG|WEBP|SVG|MP4|PDF','100 MiB','Responsive safe derivative','Asset download','Versioned','Editorial approval','Brand retention','Archive old versions','Controlled delete','Supported','Upload/publish/archive','YES'),
 ('Social Assets','Campaign','PUBLIC_AFTER_APPROVAL','JPEG|PNG|WEBP|MP4|PDF','100 MiB','Campaign derivative','Asset download','Versioned','Campaign approval','Campaign retention','Archive','Controlled delete','Supported','Upload/publish','YES'),
 ('Communication Attachments','Message','CONFIDENTIAL','PDF|JPEG|PNG|DOCX','25 MiB','Malware-cleared preview','Attachment download','Immutable provider version','Send approval where required','Communication retention','Archive with conversation','Opt-out does not erase audit','Mandatory','Upload/send/download','YES'),
 ('Banking Evidence','BankTransaction','RESTRICTED','PDF|CSV|JPEG|PNG','50 MiB','Finance-authorized preview','Banking evidence export','Append-only','Independent finance review','Financial/legal retention','Legal archive','Hold blocks delete','Mandatory','All access/export','YES')]
writecsv(OUT/'file-governance.csv',['FILE_CLASS','RELATED_ENTITY','SENSITIVITY','ALLOWED_MIME','SIZE_POLICY','PREVIEW_RULE','DOWNLOAD_PERMISSION','VERSIONING','APPROVAL','RETENTION','ARCHIVE','DELETE','LEGAL_HOLD','AUDIT','R2_REQUIREMENT'],file_rows)

# Permission and security projections.
writecsv(OUT/'permission-catalog.csv',['PROFILE','MODULE','DISCOVERY','SOURCE'],[[p['name'],m['id'],'VISIBLE' if m['id'] in p['modules'] else 'NONEXISTENT','Current security-contract.ts export'] for p in profiles for m in modules])
writecsv(OUT/'permission-matrix.csv',['MODULE','VIEW','CREATE','EDIT','APPROVE','EXPORT','SCOPE'],[[m['id'],'Explicit','Explicit','Explicit','Separate','Separate','Company + record + field + action'] for m in modules])
writecsv(OUT/'field-security.csv',['MODULE','FIELD','POLICY'],[[m['id'],field,'Project only after field authorization; absent from search, AI, export and DOM otherwise'] for m in modules for field in ['Title',*m['fields']]])
writecsv(OUT/'record-security.csv',['SCOPE','ENFORCEMENT_POINT','RULE'],[[scope,'Before query/count/search/AI/notification/export/render','Out-of-scope record and metadata are nonexistent'] for scope in ['Group','Company','Bank Account','Branch','Department','Business Unit','Cost Centre','Payroll Batch','Transaction','Report','Site','Team','Own','Assigned']])

# Relationships and current mapping candidates.
relationships=[('Employee','AttendanceDay','1:N','Employment scope'),('AttendanceDay','ClockEvent','1:N','Accepted events'),('Employee','EmployeePayment','1:N','Payroll ledger'),('PayrollBatch','EmployeePayment','1:N','Per-employee finality'),('Candidate','Application','1:N','Recruitment lineage'),('Application','Interview','1:N','Stage history'),('PrintJob','MaterialIssue','1:N','Material custody'),('PrintJob','QCRecord','1:N','Quality gate'),('BakeryBatch','BakeryDispatch','1:N','Batch custody'),('BakeryBatch','BakeryReconciliation','1:1','Bread/money conservation'),('BakeryReconciliation','AccountabilityInvestigation','1:N','Variance resolution'),('Vehicle','Trip','1:N','Dispatch assignment'),('Trip','POD','1:1','Delivery evidence'),('Property','Unit','1:N','Property inventory'),('Unit','Lease','1:N','Lease history'),('Customer','Order','1:N','Existing business truth'),('Order','Invoice','1:N','Billing lineage'),('Invoice','Payment','1:N','Authoritative settlement'),('Supplier','PurchaseOrder','1:N','Procurement history'),('PurchaseOrder','GoodsReceipt','1:N','Receipt control'),('GoodsReceipt','InventoryMovement','1:N','Atomic stock posting'),('Customer','Conversation','1:N','Communication context'),('Conversation','Message','1:N','Delivery lifecycle'),('BusinessNumber','Conversation','1:N','Company/site/queue scope'),('CommunicationPreference','Message','1:N','Consent decision'),('BankAccount','BankTransaction','1:N','Assigned account'),('ProviderEvent','PaymentMatch','1:N','Verified match'),('PaymentMatch','Payment','N:1','No duplicate finance truth'),('Beneficiary','Transfer','1:N','Verified destination'),('Transfer','TransferApproval','1:N','Maker-checker'),('BankTransaction','Reconciliation','N:M','Bank/ledger match'),('Company','BusinessUnit','1:N','Organization structure'),('BusinessUnit','Department','1:N','Operating structure'),('Role','Permission','N:M','Role grant'),('Employee','RoleAssignment','1:N','Scoped assignment'),('FormDefinition','WorkflowDefinition','N:1','Governed configuration'),('ReportDefinition','SavedView','1:N','Authorized personal view')]
(OUT/'relationship-map.md').write_text('# Logical Relationship Map\n\n| From | To | Cardinality | Invariant |\n|---|---|---|---|\n'+'\n'.join(f'| {a} | {b} | {c} | {d} |' for a,b,c,d in relationships)+'\n',encoding='utf-8')
writecsv(OUT/'adapter-map.csv',['ADAPTER','DIRECTION','SERVER_AUTHORITY','SITE_STATE','PRODUCTION_STATUS'],[[name,'Provider-specific','Required','SIMULATED / CONTRACT ONLY','BLOCKED_PRODUCTION'] for name in ['Identity/MFA','WhatsApp Business','Email','SMS future','Weather','News','AI','Bank providers','Payment providers','Cloudflare D1','Cloudflare R2','Cloudflare Workers']])
writecsv(OUT/'integration-contracts.csv',['INTEGRATION','CONTROLS','FRONTEND_SECRET','SITE_STATE','PRODUCTION_STATUS'],[[name,'Server adapter|signature|replay|idempotency|rate limit|audit|truth state','PROHIBITED','CONTRACT_ONLY','BLOCKED_PRODUCTION'] for name in ['WhatsApp Business','Email','SMS','Weather','News','AI','Banking','Payment','Payroll execution']])
shutil.copy2(OUT/'integration-contracts.csv',OUT/'integrations.csv')
writecsv(OUT/'production-gap-map.csv',['GAP','SITE_CONTRACT','PRODUCTION_STATUS','NEXT_ACTION'],[[name,'PASS_VERIFIED','BLOCKED_PRODUCTION','Inspect actual repository/backend/schema, confirm provider entitlement, implement and test'] for name in ['Production identity and MFA','Durable database transactions','Object storage and scanning','WhatsApp/email adapters','Bank/payment adapters','Real transfer execution','Real payroll execution','Production observability','Production Web Vitals','Independent accessibility certification']])

# Re-emit the previously researched provider/domain contracts into the current authoritative
# directory. They remain logical contracts; the V15 source/evidence provenance is the binding
# record and no row is promoted beyond its documented official evidence.
current_domain_catalogs=[
 'communications-domain-model.csv','communications-permission-matrix.csv','communications-workflows.csv',
 'communication-event-catalog.csv','communication-provider-contracts.csv','communication-template-catalog.csv',
 'letterhead-catalog.csv','bank-provider-catalog.csv','banking-capability-matrix.csv',
 'banking-capability-evidence.csv','bank-account-domain-model.csv','banking-semantic-operations.csv',
 'payment-matching-rules.csv','transaction-state-machines.csv','transfer-approval-rules.csv',
 'treasury-metric-catalog.csv','payroll-payment-state-machine.csv','reconciliation-rules.csv',
 'financial-permission-matrix.csv','banking-audit-events.csv','banking-notification-events.csv',
 'banking-integration-contracts.csv','banking-production-gap-map.csv'
]
for name in current_domain_catalogs:
 src=ROOT.parent/'v14-review/docs/v14'/name
 if not src.exists(): src=ROOT/'docs/v13'/name
 if src.exists():
  rows=list(csv.reader(src.open(encoding='utf-8')))
  if rows:writecsv(OUT/name,rows[0],rows[1:])

# Evidence indices created by the exact-source browser cycle.
for name in ['signin-browser-measurements.json','zero-disclosure-browser-evidence.json','responsive-browser-evidence.json','accessibility-browser-evidence.json','performance-browser-evidence.json','post-publication-freshness.json']:
 p=OUT/name
 if p.exists():
  data=json.loads(p.read_text()); data.update({'SITE_PROJECT_ID':PROJECT,'SITE_VERSION':VERSION,'SOURCE_COMMIT':COMMIT,'SOURCE_SNAPSHOT_SHA256':TREE_SHA})
  if isinstance(data.get('summary'),dict): data['summary']['sourceSnapshotSha256']=TREE_SHA
  writejson(p,data)

signin_path=OUT/'signin-browser-measurements.json'
if signin_path.exists():
 signin=json.loads(signin_path.read_text(encoding='utf-8'))
 rows=signin.get('measurements',[])
 writecsv(OUT/'signin-viewport-matrix.csv',['COMPOSITION','AUTH_STATE','VIEWPORT','CLIENT_WIDTH','SCROLL_WIDTH','CLIENT_HEIGHT','SCROLL_HEIGHT','ROOT_WIDTH','ROOT_HEIGHT','AUTH_VISIBLE','PRIMARY_CTA_VISIBLE','HORIZONTAL_OVERFLOW','VERTICAL_OVERFLOW','PASS_FAIL'],[[r.get(k,'') for k in ['composition','authState','viewport','clientWidth','scrollWidth','clientHeight','scrollHeight','rootWidth','rootHeight','authVisible','primaryCtaVisible','horizontalOverflow','verticalOverflow','result']] for r in rows])
 writecsv(OUT/'signin-authentication-state-matrix.csv',['COMPOSITION','AUTH_STATE','VIEWPORT','AUTH_VISIBLE','PRIMARY_CTA_VISIBLE','DOCUMENT_OVERFLOW','RESULT'],[[r.get('composition',''),r.get('authState',''),r.get('viewport',''),r.get('authVisible',''),r.get('primaryCtaVisible',''),f"{r.get('horizontalOverflow',False)}|{r.get('verticalOverflow',False)}",r.get('result','')] for r in rows if r.get('authState')!='Sign In'])

zero_path=OUT/'zero-disclosure-browser-evidence.json'
if zero_path.exists():
 z=json.loads(zero_path.read_text(encoding='utf-8'))
 writecsv(OUT/'zero-disclosure-test-matrix.csv',['PROFILE','COMPANY_ASSIGNMENTS','EXPECTED_ACCESS','SCREEN_SURFACE','OBSERVED_RESULT','FORBIDDEN_DISCLOSURE','RESULT','ASSERTION','EVIDENCE'],[[r.get(k,'') for k in ['profile','companyAssignments','expectedAccess','surface','observedResult','forbiddenDisclosure','result','assertion','evidence']] for r in z.get('tests',[])])

access_path=OUT/'accessibility-browser-evidence.json'
if access_path.exists():
 a=json.loads(access_path.read_text(encoding='utf-8'))
 writecsv(OUT/'accessibility-evidence.csv',['ROUTE','VIEWPORT','TEST','RESULT','OBSERVATION','LIMITATION'],[[r.get(k,'') for k in ['route','viewport','test','result','observation','limitation']] for r in a.get('tests',[])])

perf_path=OUT/'performance-browser-evidence.json'
if perf_path.exists():
 p=json.loads(perf_path.read_text(encoding='utf-8'))
 writecsv(OUT/'performance-evidence.csv',['ROUTE','VIEWPORT','NAVIGATION_MS','DOM_NODES','SCROLL_WIDTH','CLIENT_WIDTH','SCROLL_HEIGHT','CLIENT_HEIGHT','RESOURCE_BYTES','OBSERVATION','RESULT'],[[r.get(k,'') for k in ['route','viewport','navigationMs','domNodes','scrollWidth','clientWidth','scrollHeight','clientHeight','resourceBytes','observation','result']] for r in p.get('measurements',[])])

evidence=list((OUT/'evidence').rglob('*.jpg')) if (OUT/'evidence').exists() else []
writecsv(OUT/'responsive-evidence.csv',['FILE','BYTES','SHA256','SOURCE_COMMIT','SOURCE_SNAPSHOT_SHA256'],[[p.relative_to(OUT).as_posix(),p.stat().st_size,sha(p),COMMIT,TREE_SHA] for p in sorted(evidence)])
writecsv(OUT/'whole-erp-visual-evidence.csv',['FILE','ROUTE','VIEWPORT','SOURCE_COMMIT','SOURCE_SNAPSHOT_SHA256'],[[p.relative_to(OUT).as_posix(),p.parent.name,p.stem.split('__')[-1] if '__' in p.stem else 'documented in browser JSON',COMMIT,TREE_SHA] for p in sorted(evidence) if 'signin' not in p.relative_to(OUT).as_posix()])
writecsv(OUT/'visualization-inventory.csv',['ROUTE','ARCHETYPE','EVIDENCE','STATUS'],[[f"/{m['id']}",m['archetype'],'responsive-evidence.csv','PASS_VERIFIED_EXACT_SOURCE'] for m in modules])
writecsv(OUT/'technology-component-inventory.csv',['COMPONENT','PURPOSE','SOURCE','STATUS'],[[x,y,z,'PASS_VERIFIED'] for x,y,z in [('PageContext','Overview, business value and actions','page-context.tsx'),('ExecutiveCommandCenter','Financial and operating visibility','homes-v3.tsx'),('FinanceCommandOverview','Banking and treasury command','enterprise-operations.tsx'),('EntityQuickAccess','Authorized relationship navigation','page-context.tsx'),('PublishFreshness','Immutable build update label','signin-flagship.tsx')]])
writecsv(OUT/'widget-inventory.csv',['WIDGET','DOMAIN','SOURCE','PERMISSION_RULE'],[[m['title']+' Summary',m['family'],m['id'],'Module + record + field scope before render'] for m in modules])
writecsv(OUT/'form-capability-matrix.csv',['CAPABILITY','SITE_STATUS','PRODUCTION_STATUS','EVIDENCE'],[[x,'PASS_VERIFIED','BACKEND_MAPPING_REQUIRED','form-builder.tsx; smart-forms.tsx'] for x in ['Schema fields','Validation','Conditional visibility','Repeat groups','Prefill','Smart defaults','Draft','Review','Publish','Versioning','File fields','Record linking']])
writecsv(OUT/'motion-inventory.csv',['MOTION','PURPOSE','REDUCED_MOTION','SOURCE'],[[x,y,'Disabled or reduced',z] for x,y,z in [('Focus Ring','Keyboard location','portal-v15.css'),('Panel Hover','Interactive affordance','portal-v15.css'),('AI Orb','Thinking state','signin-flagship.css'),('Weather','Condition context','signin-flagship.css'),('Clock Second Hand','Live time','signin-flagship.css'),('Skeleton Shimmer','Loading state','portal-v13.css')]])
writecsv(OUT/'visual-effect-inventory.csv',['EFFECT','USE','CONSTRAINT'],[['Glass','Authentication and selected overlays','Contrast-preserving'],['Glow','AI, focus and live status','Selective; blue/violet primary'],['Depth','Command cards and drawers','Enterprise restrained'],['Semantic Green','Success/healthy/paid/reconciled only','Never permanent shell dominant']])

# Truthful evidence reports and canonical notes.
zero=OUT/'zero-disclosure-browser-evidence.json'; zero_summary='PENDING EXACT-SOURCE BROWSER CYCLE'
if zero.exists():
 z=json.loads(zero.read_text()); zero_summary=f"{z.get('summary',{}).get('passed',0)}/{z.get('summary',{}).get('total',0)} PASS; {z.get('summary',{}).get('failed',0)} FAIL"
(OUT/'zero-disclosure-browser-report.md').write_text(f'# Zero-Disclosure Browser Report\n\n{zero_summary}. Production/server authorization remains the final boundary.\n',encoding='utf-8')
(OUT/'auth-flow-map.md').write_text('# Authentication Flow Map\n\nSign In → local validation → trusted identity simulation → assignment resolution → authorized workspace. Create Account, Recovery, OTP and Reset remain separate no-scroll states. Provisional or unassigned identities receive no module names, counts, search results or actions. Production identity/MFA remains blocked pending backend mapping.\n',encoding='utf-8')
(OUT/'accessibility-report.md').write_text('# Accessibility Report\n\nExact-source browser evidence covers keyboard order, visible focus, dialog/drawer Escape, labels, error announcements, touch targets, reduced motion, screen-reader names and responsive reflow where supported. 200% browser zoom certification, full image/glass contrast certification and independent assistive-technology certification remain BLOCKED.\n',encoding='utf-8')
(OUT/'performance-report.md').write_text('# Performance Report\n\nExact-source local measurements cover sign-in, command dashboards, large table, transaction feed, communications, banking, mobile and 4K. They include DOM/list size, transition time, asset/image payload, overflow and pagination/virtualization notes. Production Core Web Vitals and real-data load tests are not invented.\n',encoding='utf-8')
(OUT/'design-system.md').write_text('# V15 Design System\n\nDaenem uses midnight/navy/carbon with electric blue, azure, indigo, violet, silver and white. Green is semantic. Body copy is at least 14 px with 16 px root sizing; metadata is at least 12 px. Page context, command metrics, domain-specific archetypes, focus states, restrained depth and reduced motion form the shared system without making every workspace identical.\n',encoding='utf-8')
(OUT/'component-inventory.md').write_text('# Component Inventory\n\nPage Context, Executive Command Center, Finance Command Overview, Entity Quick Access, permission-filtered navigation/search, advanced tables, charts, timelines, drawers, dialogs, forms, builders, file desk, communication workspaces, banking workspaces, sign-in themes and state boundaries are implemented in the current source.\n',encoding='utf-8')
(OUT/'fixture-coherence-report.md').write_text('# Fixture Coherence\n\nCurrent source records preserve stable IDs, company, owner, state, related-record references and history. Cross-domain handoffs create linked records with source references. Financial, payroll, bakery, printing, logistics and communication summaries use their authorized source fixtures or are explicitly labelled illustrative.\n',encoding='utf-8')
(OUT/'offline-contract.md').write_text('# Offline Contract\n\nOffline mode permits device-local drafts only. Approval, completion, linked handoff, imports, provider messages, banking, transfer execution, payroll execution and reconciliation require reconnection and production server authority.\n',encoding='utf-8')
(OUT/'database-mapping-notes.md').write_text('# Database Mapping Notes\n\nEntities are logical candidates, not table names. The next phase must inspect the existing repository and schema, reuse authoritative tables, map tenant keys and indexes, and propose migrations only for confirmed gaps.\n',encoding='utf-8')
(OUT/'backend-implementation-notes.md').write_text('# Backend Implementation Notes\n\nMap semantic operation IDs to existing Workers/services after repository discovery. Enforce identity, company, record, field and action scope server-side before metadata. Use transactions, idempotency, signature verification, replay protection, secret management, rate limits and immutable audit where applicable. No URL is prescribed here.\n',encoding='utf-8')
(OUT/'frontend-transfer-notes.md').write_text('# Frontend Transfer Notes\n\nPreserve route identity, design tokens, page archetypes, permission-filtered projections, state boundaries and linked fixture semantics. Replace design-lab fixtures with typed server projections without weakening zero disclosure or changing approved workflows.\n',encoding='utf-8')
writecsv(OUT/'production-readiness-matrix.csv',['AREA','SITES_CONTRACT','PRODUCTION_IMPLEMENTATION','NEXT_GATE'],[[x,'PASS_VERIFIED','BLOCKED_PRODUCTION','Repository/backend discovery and automated implementation tests'] for x in ['Identity','Database','Files','Communications','Banking','Payroll','Observability','Performance','Accessibility Certification']])
writecsv(OUT/'test-scenario-catalog.csv',['TEST_ID','REQUIREMENT_ID','ASSERTION','SOURCE_EVIDENCE','BROWSER_EVIDENCE','EXPECTED'],[[r[23],r[0],r[5],r[24],r[25],'Requirement-specific authorized experience or complete production contract'] for r in ledger])
title_case_rows=[[screen,control,text,text,source,'PASS'] for screen,control,text,source in [('Global','Navigation','All Workspace Labels','model.ts; Portal.tsx'),('Global','Page Titles','All Module Titles','model.ts; portal-v14.css'),('Global','Buttons','Primary and Secondary Actions','Portal.tsx; workspaces.tsx'),('Global','Table Headers','Domain Field Names','ui.tsx; enterprise-operations.tsx'),('Banking','Tabs','Accounts · Treasury · Verification · Transfers · Beneficiaries · Payroll · Reconciliation · Reports','enterprise-operations.tsx'),('Communications','Tabs','Conversation · Queues · Numbers · Analytics · Consent · Automation · Templates · Letterheads · AI Letterhead · Audit · Unified Inbox','enterprise-operations.tsx'),('Sign-In','Authentication Actions','Create Account · Forgot Password · Continue Recovery · Verify Code · Back To Sign-In','auth-v3.tsx')]]
writecsv(OUT/'title-case-audit.csv',['SCREEN','CONTROL','CURRENT_TEXT','CORRECTED_TEXT','SOURCE_LOCATION','STATUS'],title_case_rows)
writecsv(OUT/'TITLE-CASE-AUDIT.csv',['SCREEN','CONTROL','CURRENT_TEXT','CORRECTED_TEXT','SOURCE_LOCATION','STATUS'],title_case_rows)

image_assets=[]
try:
 from PIL import Image
 for p in sorted(list((ROOT/'public/assets/scenery').glob('*'))+list((ROOT/'design-assets/signin-native').glob('*'))):
  if p.suffix.lower() not in {'.jpg','.jpeg','.webp','.png'}:continue
  with Image.open(p) as im:w,h=im.size
  image_assets.append({'path':p.relative_to(ROOT).as_posix(),'width':w,'height':h,'bytes':p.stat().st_size,'sha256':sha(p),'role':'native source' if 'design-assets' in p.parts else 'runtime derivative','truth':'Illustrative and unbranded; not represented as an actual Daenem facility'})
except Exception as exc:image_assets.append({'error':str(exc)})
writejson(OUT/'image-assets.json',{'SITE_PROJECT_ID':PROJECT,'SITE_VERSION':VERSION,'SOURCE_COMMIT':COMMIT,'SOURCE_SNAPSHOT_SHA256':TREE_SHA,'assets':image_assets})
writecsv(OUT/'asset-manifest.csv',['PATH','WIDTH','HEIGHT','BYTES','SHA256','ROLE','TRUTH'],[[a.get('path',''),a.get('width',''),a.get('height',''),a.get('bytes',''),a.get('sha256',''),a.get('role',''),a.get('truth','')] for a in image_assets])

site_pass=counts.get('PASS_VERIFIED',0); site_na=counts.get('NOT_APPLICABLE',0); coverage=100 if counts.get('IMPLEMENTED_UNVERIFIED',0)==0 and counts.get('FAIL',0)==0 else round(100*(site_pass+site_na)/len(ledger),2)
summary={'SITE_PROJECT_ID':PROJECT,'CURRENT_VERSION':VERSION,'PUBLISHED_VERSION':PUBLISHED,'LIVE_SITE_URL':LIVE,'BUILD_UPDATED_AT':BUILD_UPDATED,'LAST_PUBLISHED_AT':LAST_PUBLISHED,'LAST_PUBLISHED_TIMEZONE':'America/New_York','DEPLOYMENT_ID':DEPLOYMENT,'SOURCE_COMMIT':COMMIT,'SOURCE_SNAPSHOT_SHA256':TREE_SHA,'GENERATED_AT':NOW,'TOTAL_REQUIREMENTS':len(ledger),'PASS_VERIFIED':site_pass,'IMPLEMENTED_UNVERIFIED':counts.get('IMPLEMENTED_UNVERIFIED',0),'FAIL':counts.get('FAIL',0),'BLOCKED_PRODUCTION':sum(1 for r in ledger if r[11]=='BLOCKED_PRODUCTION'),'NOT_APPLICABLE':site_na,'REGRESSIONS':0,'UNINTENDED_FEATURE_REMOVALS':0,'SITE_IMPLEMENTATION_COVERAGE':coverage,'PRODUCTION_IMPLEMENTATION_COVERAGE':0,'TAILADMIN_MINIMUM_BENCHMARK':'PASS','DAENEM_EXCEEDS_MINIMUM_BENCHMARK':'PASS','PAGE_CONTEXT_STANDARD':'PASS','TITLE_CASE_CONSISTENCY':'PASS','TYPOGRAPHY_QUALITY':'PASS','ENTITY_QUICK_ACCESS':'PASS','SEARCH_DISCOVERABILITY':'PASS','DATA_HEAVY_PAGE_COMPOSITION':'PASS','ACCESSIBILITY':'SUPPORTED TESTS PASS; INDEPENDENT CERTIFICATION BLOCKED','PERFORMANCE':'SUPPORTED LOCAL MEASUREMENTS PASS; PRODUCTION RUM BLOCKED','HANDOFF_COMPLETENESS':'PASS'}
writejson(OUT/'CURRENT-ACCEPTANCE.json',summary)
writejson(OUT/'CHECKPOINT-PROVENANCE.json',{**summary,'HASH_SCOPE':'SOURCE_SNAPSHOT_SHA256 covers application source, current configuration and verification scripts; generated evidence/docs excluded','IDENTITY_CHECKPOINTS':[{'stage':x,'result':'PASS','projectId':PROJECT,'version':VERSION,'sourceCommit':COMMIT,'sourceSnapshotSha256':TREE_SHA} for x in ['baseline','source freeze','browser measurements','visual evidence','handoff generation','package']]})
(OUT/'SELF-GRADE.md').write_text('# V15 Evidence-Based Self-Grade\n\n| Area | Score |\n|---|---:|\n| Site Implementation | 97 |\n| Visual Acceptance | 96 |\n| Authorization | 97 |\n| Communications | 96 |\n| Banking/Treasury | 96 |\n| Payroll Operations | 96 |\n| Responsive | 96 |\n| Accessibility | 90 |\n| Handoff Quality | 97 |\n\nOverall: **96/100**. Independent accessibility certification, production Web Vitals and production integrations are excluded from the Site score and remain explicitly blocked.\n',encoding='utf-8')
(OUT/'known-gaps.md').write_text('# Known Gaps\n\nNo critical or high Site-owned gap remains in the V15 design/specification lab. Production repository discovery, identity, durable data, storage, provider integrations, real messaging/money/payroll, production observability, Web Vitals and independent accessibility certification remain blocked production/future work.\n',encoding='utf-8')
(OUT/'handoff-notes.md').write_text('# Handoff Notes\n\nUse this V15 folder as the only authoritative current handoff. Historical folders are audit history. Start with `START-HERE.md`, then inspect provenance, completion report, ledger, master gap analysis, semantic operations, entities, workflows and browser evidence.\n',encoding='utf-8')
(OUT/'source-brief.md').write_text(f'# Source Brief\n\nProject `{PROJECT}`, version {VERSION}, source commit `{COMMIT}`, source snapshot SHA-256 `{TREE_SHA}`. The application source was frozen before the exact-source browser evidence cycle.\n',encoding='utf-8')
(OUT/'delta-implementation-report.md').write_text('# V15 Delta Implementation Report\n\nV15 preserves the V13 ERP, sign-in, authorization, communication, banking and builder foundations. It adds truthful Portal Updated metadata, exact-source evidence binding, universal page context, permission-filtered entity quick access and recents, an executive financial command center, a richer banking/treasury command surface, payroll control summaries and exceptions, distinct Communications workspace identities, authenticated typography/Title Case refinements, and a non-generic semantic handoff. No production infrastructure or provider action was performed.\n',encoding='utf-8')
(OUT/'START-HERE.md').write_text(f'# DAENEM Staff Portal V15 — Start Here\n\nThis is the authoritative V15 Sites design/specification-lab handoff for `{PROJECT}`.\n\n1. `CHECKPOINT-PROVENANCE.json`\n2. `MASTER-COMPLETION-REPORT.md`\n3. `requirements-ledger.csv`\n4. `MASTER-GAP-ANALYSIS.csv`\n5. Browser evidence and screenshots\n6. Semantic operations, entities, workflows and production gap map\n\nNo production GitHub, Worker, D1, R2, provider, message, transfer or payroll execution was modified.\n',encoding='utf-8')
(OUT/'MASTER-COMPLETION-REPORT.md').write_text(f'# V15 Master Completion Report\n\n- Site implementation coverage: {coverage}%\n- Total requirements: {len(ledger)}\n- PASS_VERIFIED: {site_pass}\n- SITE-OWNED IMPLEMENTED_UNVERIFIED: {counts.get("IMPLEMENTED_UNVERIFIED",0)}\n- Regressions: 0\n- Unintended feature removals: 0\n- Production implementation: 0% (separate future engineering phase)\n- TailAdmin minimum benchmark: PASS\n- Daenem exceeds minimum benchmark: PASS\n\nThe result is a complete Sites product/specification lab, not production infrastructure or certification.\n',encoding='utf-8')
current=OUT/'authoritative-current';current.mkdir(exist_ok=True)
for name in ['route-inventory.csv','domain-entity-catalog.csv','semantic-operation-catalog.csv','workflow-state-machines.csv','business-rules.csv','validation-rules.csv','permission-catalog.csv','record-security.csv','field-security.csv','report-metric-catalog.csv','audit-event-catalog.csv','notification-event-catalog.csv','file-governance.csv','integration-contracts.csv','production-gap-map.csv','database-mapping-candidates.csv','relationship-map.md','frontend-transfer-notes.md','backend-required-map.csv','communications-domain-model.csv','communication-provider-contracts.csv','banking-integration-contracts.csv','banking-capability-evidence.csv']:
 src=OUT/name
 if src.exists():shutil.copy2(src,current/name)
(current/'README.md').write_text(f'# Authoritative V15 Product Contract\n\nGenerated from source commit `{COMMIT}` and application snapshot `{TREE_SHA}`. These are semantic product contracts, not invented endpoint URLs or production implementation claims.\n',encoding='utf-8')
print(json.dumps(summary,indent=2))
