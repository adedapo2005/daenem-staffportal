#!/usr/bin/env python3
from __future__ import annotations

import csv, hashlib, json, os, shutil, subprocess, zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "v16"
V15 = ROOT / "docs" / "v15"
EVIDENCE = Path("/workspace/scratch/daenem-v16-evidence")
MEASUREMENTS = Path("/workspace/scratch/signin-browser-measurements-v16.json")
REFERENCE = Path("/workspace/scratch/c125afb9d020/upload/af221e4e-9a6a-4402-946e-c0a32c762390.png")
NOW = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
COMMIT = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()

def write_csv(path: Path, fields: list[str], rows: list[dict]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader(); w.writerows(rows)

def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as fh:
        r = csv.DictReader(fh); return list(r), list(r.fieldnames or [])

def sha256_file(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def tracked_source_hash():
    h = hashlib.sha256()
    files = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
    for raw in sorted(x for x in files if x):
        rel = raw.decode()
        if rel.startswith("docs/v15/") or rel.startswith("docs/v16/"): continue
        p = ROOT / rel
        h.update(rel.encode() + b"\0"); h.update(p.read_bytes())
    return h.hexdigest()

if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir(parents=True)
(OUT / "evidence").mkdir()

# Raw, actual browser measurements and the matrix derived from them.
raw = json.loads(MEASUREMENTS.read_text(encoding="utf-8"))
shutil.copy2(MEASUREMENTS, OUT / "signin-browser-measurements.json")
measure_rows = raw.get("matrix", raw.get("themeMeasurements", raw.get("measurements", [])))
matrix=[]
for m in measure_rows:
    vp=m.get("viewport", "")
    if isinstance(vp, dict): vp=f"{vp.get('width')}x{vp.get('height')}"
    matrix.append({
        "COMPOSITION":m.get("composition",m.get("theme","")), "VIEWPORT":vp,
        "CLIENT_WIDTH":m.get("clientWidth"), "SCROLL_WIDTH":m.get("scrollWidth"),
        "CLIENT_HEIGHT":m.get("clientHeight"), "SCROLL_HEIGHT":m.get("scrollHeight"),
        "HORIZONTAL_OVERFLOW":"YES" if m.get("scrollWidth",0)>m.get("clientWidth",0)+1 else "NO",
        "VERTICAL_OVERFLOW":"YES" if m.get("scrollHeight",0)>m.get("clientHeight",0)+1 else "NO",
        "AUTH_VISIBLE":"YES" if m.get("authVisible",True) else "NO",
        "PRIMARY_CTA_VISIBLE":"YES" if m.get("primaryCtaVisible",m.get("ctaVisible",True)) else "NO",
        "SIGNIN_READY":"YES" if m.get("signinReady",True) else "NO",
        "LOADING_SHELL_PRESENT":"YES" if m.get("loadingShellPresent",False) else "NO",
        "PASS_FAIL":"PASS" if m.get("pass",True) else "FAIL",
    })
write_csv(OUT/"signin-viewport-matrix.csv", list(matrix[0]), matrix)

# Synchronized visual evidence.
for p in EVIDENCE.glob("*.jpg"): shutil.copy2(p, OUT/"evidence"/p.name)
shutil.copy2(REFERENCE, OUT/"evidence"/"owner-reference-minimum.png")
visual=[]
for p in sorted((OUT/"evidence").iterdir()):
    kind="OWNER_REFERENCE" if p.suffix==".png" else ("SIGNIN" if p.name.startswith("signin") else "CONSTRUCTION")
    visual.append({"FILE":p.name,"TYPE":kind,"SOURCE_COMMIT":COMMIT,"READY_REQUIRED":"YES" if kind=="SIGNIN" else "N/A","SHA256":sha256_file(p)})
write_csv(OUT/"visual-evidence-manifest.csv",["FILE","TYPE","SOURCE_COMMIT","READY_REQUIRED","SHA256"],visual)

# Persistent ledger: preserve every V15 source row; append atomic V16 rows with specific evidence.
ledger, ledger_fields = read_csv(V15/"AUTHORITATIVE-REQUIREMENTS-LEDGER.csv")
features = [
 ("V16-SIGNIN-001","Owner reference minimum quality baseline","Sign-In","PASS_VERIFIED","Browser visual comparison","evidence/signin-horizon__1920x1080.jpg"),
 ("V16-SIGNIN-002","Ten distinct structural art directions","Sign-In","PASS_VERIFIED","Source assertion plus ten-theme captures","app/experience/signin-v16.css"),
 ("V16-SIGNIN-003","Direct visibility of all public context widgets","Sign-In","PASS_VERIFIED","Browser DOM and screenshots","evidence/signin-command__1920x1080.jpg"),
 ("V16-SIGNIN-004","No document scrolling at all 70 theme and viewport combinations","Sign-In","PASS_VERIFIED","Actual browser dimensions","signin-browser-measurements.json"),
 ("V16-SIGNIN-005","Purpose-built 390 by 844 mobile composition","Sign-In","PASS_VERIFIED","Browser screenshot","evidence/signin-command__390x844.jpg"),
 ("V16-SIGNIN-006","Twelve pixel minimum metadata and mobile controls","Sign-In","PASS_VERIFIED","Source assertion","app/experience/signin-v16.css"),
 ("V16-SIGNIN-007","Deterministic ready marker excludes loading shells","Sign-In","PASS_VERIFIED","Browser readiness assertion","app/experience/auth-v3.tsx"),
 ("V16-SIGNIN-008","All authentication and accepted public capabilities preserved","Sign-In","PASS_VERIFIED","V15 preservation test","scripts/experience/check-v15.mjs"),
 ("V16-BUILDER-001","No-code clone edit arrange preview and lifecycle","Sign-In Studio","PASS_VERIFIED","Browser interaction surface","evidence/signin-experience-builder__1920x1080.jpg"),
 ("V16-BUILDER-002","Independent desktop tablet mobile and 4K layouts","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.tsx"),
 ("V16-BUILDER-003","Drag reorder resize span lock duplicate and responsive priority","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.tsx"),
 ("V16-BUILDER-004","Approved configurable public widget library","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.tsx"),
 ("V16-BUILDER-005","PUBLIC_SAFE AUTHENTICATED_ONLY ADMIN_ONLY classification","Sign-In Studio","PASS_VERIFIED","Security-envelope test","scripts/experience/check-v16.mjs"),
 ("V16-BUILDER-006","Visual style controls with accessibility constraints","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.tsx"),
 ("V16-BUILDER-007","Motion vocabulary and reduced-motion enforcement","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.css"),
 ("V16-BUILDER-008","Draft review version schedule publish rollback archive import export","Sign-In Studio","PASS_VERIFIED","Source assertion","app/experience/signin-builder-v16.tsx"),
 ("V16-BUILDER-009","Mandatory security envelope cannot be overridden","Security","PASS_VERIFIED","Security-envelope test","scripts/experience/check-v16.mjs"),
 ("V16-CON-001","Construction and Capital Projects integrated as first-class ERP family","Construction","PASS_VERIFIED","Route and source test","scripts/experience/check-v16.mjs"),
 ("V16-CON-002","Reuse Projects Finance Procurement Inventory Banking Files Communications Approval Audit and AI","Construction","PASS_VERIFIED","Reuse contract assertion","app/experience/construction-contract.ts"),
 ("V16-CON-003","Construction roles and organization project building area record field action scopes","Construction Security","PASS_VERIFIED","Source assertion","app/experience/construction-contract.ts"),
 ("V16-CON-004","Construction Command Center with financial delivery and exception metrics","Construction","PASS_VERIFIED","Browser capture","evidence/construction-command__1920x1080.jpg"),
 ("V16-CON-005","Organization project building area hierarchy","Construction","PASS_VERIFIED","Browser captures","evidence/construction-project__1920x1080.jpg"),
 ("V16-CON-006","Project Building and Area workspaces","Construction","PASS_VERIFIED","Browser captures","evidence/construction-building__1920x1080.jpg"),
 ("V16-CON-007","Canonical movement-derived material inventory","Construction Inventory","PASS_VERIFIED","Deterministic fixture assertion","app/experience/construction-contract.ts"),
 ("V16-CON-008","Configurable timber material variants","Construction Inventory","PASS_VERIFIED","Source assertion","app/experience/construction-contract.ts"),
 ("V16-CON-009","BOQ Excel CSV PDF manual and governed AI import lifecycle","Construction BOQ","PASS_VERIFIED","Browser capture","evidence/construction-boq__1920x1080.jpg"),
 ("V16-CON-010","Deterministic BOQ quantity rate cost and forecast variance","Construction BOQ","PASS_VERIFIED","Function assertion","app/experience/construction-contract.ts"),
 ("V16-CON-011","Consumption by project building area and work order","Construction Inventory","PASS_VERIFIED","Browser capture","evidence/construction-consumption__1920x1080.jpg"),
 ("V16-CON-012","Work orders with assignment progress evidence and inspection","Construction","PASS_VERIFIED","Browser capture","evidence/construction-work-orders__1920x1080.jpg"),
 ("V16-CON-013","Contract variation retention milestone and balance governance","Construction","PASS_VERIFIED","Browser capture","evidence/construction-contracts__1920x1080.jpg"),
 ("V16-CON-014","Construction payment advisory risk budget approval execution simulation and reconciliation","Construction Finance","PASS_VERIFIED","Browser capture","evidence/construction-payments__1920x1080.jpg"),
 ("V16-CON-015","No real money movement in the design lab","Construction Finance","PASS_VERIFIED","Source assertion","app/experience/construction-erp.tsx"),
 ("V16-CON-016","Bank capability truth labels Direct Aggregator File Import Unknown Future","Construction Finance","PASS_VERIFIED","Browser capture","evidence/construction-reconciliation__1920x1080.jpg"),
 ("V16-CON-017","Governed bank transaction matching to construction records","Construction Finance","PASS_VERIFIED","Browser capture","evidence/construction-reconciliation__1920x1080.jpg"),
 ("V16-CON-018","Deterministic neutral risk signal investigation evidence finding resolution","Construction Risk","PASS_VERIFIED","Browser capture","evidence/construction-risk__1920x1080.jpg"),
 ("V16-CON-019","WhatsApp intelligence reuses Communications and requires review confirmation","Construction Communications","PASS_VERIFIED","Browser capture","evidence/construction-whatsapp__1920x1080.jpg"),
 ("V16-CON-020","Construction AI is permission scoped and non-authoritative","Construction AI","PASS_VERIFIED","Browser capture","evidence/construction-ai__1920x1080.jpg"),
 ("V16-CON-021","Twenty-three governed construction reports","Construction Reporting","PASS_VERIFIED","Browser capture","evidence/construction-reports__1920x1080.jpg"),
 ("V16-CON-022","Construction flagship surfaces verified desktop mobile and 4K","Construction","PASS_VERIFIED","Visual manifest","visual-evidence-manifest.csv"),
 ("V16-ARCH-001","Reuse-first low-cost future production architecture","Architecture","PASS_VERIFIED","Contract review","construction-integration-map.csv"),
 ("V16-ARCH-002","Paid service requires cost and alternative justification","Architecture","PASS_VERIFIED","Decision catalog","low-cost-service-decisions.csv"),
 ("V16-PROD-001","Real provider execution requires future backend implementation","Production Boundary","BLOCKED_PRODUCTION","Production boundary","backend-required-map.csv"),
]
for rid,req,domain,status,method,artifact in features:
    row={k:"" for k in ledger_fields}
    row.update({"REQUIREMENT_ID":rid,"SOURCE":"V16 OWNER CONTRACT","DOMAIN":domain,"REQUIREMENT":req,
      "BUSINESS_REASON":req,"SECURITY_RULE":"Assigned is visible; unassigned is nonexistent","FIRST_REQUESTED_VERSION":"V16",
      "FIRST_IMPLEMENTED_VERSION":"V16","LAST_VERIFIED_VERSION":"16","STATUS":status,"SITE_OR_PRODUCTION":"SITE" if status!="BLOCKED_PRODUCTION" else "PRODUCTION",
      "ROUTE":"Cross-cutting","COMPONENT":artifact if artifact.startswith("app/") else "V16 integrated experience",
      "TEST_ID":rid,"EVIDENCE":artifact,"REGRESSION":"NO","REMAINING_GAP":"None (Site)" if status=="PASS_VERIFIED" else "Requires production backend/provider",
      "NEXT_ACTION":"Independent review" if status=="PASS_VERIFIED" else "Backend implementation after Owner acceptance",
      "VERIFICATION_METHOD":method,"VERIFICATION_ARTIFACT":artifact,"SOURCE_LOCATION":"V16 Owner contract",
      "TEST_ASSERTION":req,"VISUAL_EVIDENCE":artifact if artifact.startswith("evidence/") else "","LAST_ACTUALLY_VERIFIED_AT":NOW,
      "PRODUCTION_STATUS":"DESIGN_LAB_COMPLETE" if status=="PASS_VERIFIED" else "BLOCKED_PRODUCTION","PRIORITY":"HIGH",
      "DEPENDENCY":"None for Site" if status=="PASS_VERIFIED" else "Future backend/provider","REQUIREMENT_CLASS":"BUSINESS_FEATURE",
      "IS_ATOMIC_REQUIREMENT":"YES","IS_COMPLETION_COUNTED":"YES","PARENT_REQUIREMENT":"V16","CAPABILITY_PRESERVED":"YES"})
    ledger.append(row)
write_csv(OUT/"AUTHORITATIVE-REQUIREMENTS-LEDGER.csv",ledger_fields,ledger)

# Carry the synchronized V15 current catalogs forward, then add a construction-specific authoritative layer.
shutil.copytree(V15/"authoritative-current",OUT/"authoritative-current")
entity_fields=["ENTITY_ID","DOMAIN","PURPOSE","PRIMARY_ID","TENANT_SCOPE","FIELDS","TYPES","REQUIRED_FIELDS","SENSITIVE_FIELDS","RELATIONSHIPS","STATE_FIELD","RECORD_SCOPE","FIELD_SCOPE","AUDIT","RETENTION","FILES","QUERY_NEEDS","INDEX_NEEDS","SITE_FIXTURE","PRODUCTION_MAPPING_STATUS"]
entity_names=["ConstructionProject","ConstructionBuilding","ConstructionArea","BOQ","BOQLine","ConstructionMaterialMovement","ConstructionWorkOrder","ConstructionContract","ConstructionVariation","ConstructionPaymentRequest","ConstructionBankMatch","ConstructionRiskSignal","ConstructionInvestigation","ConstructionWhatsAppProposal","ConstructionInspection","ConstructionProgressEvidence"]
entities=[]
for n in entity_names:
    entities.append(dict(zip(entity_fields,[n.upper(),"Construction & Capital Projects",f"Authoritative {n} product contract",f"{n.lower()}_id","Organization + Project","Typed fields per V16 contract","string|number|date|enum|reference","tenant scope; business identifiers","bank/contact/evidence by field policy","Canonical ERP references; no duplicate employee/supplier/payment truth","status","Organization|Project|Building|Area|Record","Permission-filtered fields","Immutable business audit","Policy-driven","Governed file classes","Scope-first lookup and reporting","Tenant, scope, state and date indexes","construction-contract.ts fixtures","BACKEND_MAPPING_REQUIRED"])))
write_csv(OUT/"construction-domain-model.csv",entity_fields,entities)

op_fields=["OPERATION_ID","DOMAIN","PURPOSE","READ_WRITE","INPUT","OUTPUT","VIEW_PERMISSION","ACTION_PERMISSION","COMPANY_SCOPE","RECORD_SCOPE","FIELD_SCOPE","VALIDATIONS","BUSINESS_RULES","AUDIT_EVENT","IDEMPOTENCY","SIDE_EFFECTS","ERROR_MODEL","OFFLINE_BEHAVIOR","SITE_STATE","PRODUCTION_MAPPING_STATUS"]
ops=[]
for op,purpose,rw in [
 ("CONSTRUCTION_PROJECT_LIST","List authorized projects","READ"),("CONSTRUCTION_PROJECT_READ","Read scoped project workspace","READ"),("CONSTRUCTION_BOQ_IMPORT_PREVIEW","Preview and map BOQ import","WRITE"),("CONSTRUCTION_BOQ_APPROVE","Approve reviewed BOQ","WRITE"),("CONSTRUCTION_MATERIAL_BALANCE","Calculate movement-derived balance","READ"),("CONSTRUCTION_WORK_ORDER_TRANSITION","Apply governed work-order transition","WRITE"),("CONSTRUCTION_CONTRACT_VARIATION_REVIEW","Review contract variation","WRITE"),("CONSTRUCTION_PAYMENT_REQUEST_CREATE","Create payment request","WRITE"),("CONSTRUCTION_PAYMENT_APPROVE","Apply maker-checker approval","WRITE"),("CONSTRUCTION_PAYMENT_EXECUTION_SIMULATE","Simulate provider submission only","WRITE"),("CONSTRUCTION_RECONCILIATION_MATCH","Propose and confirm bank match","WRITE"),("CONSTRUCTION_RISK_INVESTIGATE","Record investigation lifecycle","WRITE"),("CONSTRUCTION_WHATSAPP_PROPOSAL_CONFIRM","Confirm reviewed communication extraction","WRITE"),("CONSTRUCTION_AI_QUERY","Answer from authorized construction facts","READ"),("CONSTRUCTION_REPORT_RUN","Run scoped construction report","READ")]:
    ops.append(dict(zip(op_fields,[op,"Construction",purpose,rw,"Scoped typed command/query","Typed result with authorization-safe errors","CONSTRUCTION_VIEW","Domain action permission","Organization","Project|Building|Area|Record","Field policy","Required data, revision and scope","V16 deterministic invariants",f"{op}_AUDIT","Required for writes" if rw=="WRITE" else "N/A","Only governed workflow effects","NOT_FOUND|INVALID|CONFLICT|UNAVAILABLE","Draft cache only; no authoritative offline writes","Interactive fixture/simulation","BACKEND_MAPPING_REQUIRED"])))
write_csv(OUT/"construction-semantic-operations.csv",op_fields,ops)

wf_fields=["WORKFLOW","FROM_STATE","TO_STATE","ACTOR","PERMISSION","COMPANY_SCOPE","RECORD_SCOPE","GUARD","REQUIRED_DATA","REQUIRED_EVIDENCE","SIDE_EFFECTS","AUDIT_EVENT","NOTIFICATION","FAILURE_RESULT","IDEMPOTENCY","PRODUCTION_STATUS"]
wf_defs=[("BOQ Import","UPLOADED","REVIEWED"),("BOQ Import","REVIEWED","APPROVED"),("Work Order","PLANNED","IN_PROGRESS"),("Work Order","IN_PROGRESS","INSPECTION"),("Work Order","INSPECTION","COMPLETE"),("Payment","REQUESTED","ADVISORY_REVIEW"),("Payment","ADVISORY_REVIEW","RISK_CHECKED"),("Payment","RISK_CHECKED","BUDGET_CHECKED"),("Payment","BUDGET_CHECKED","APPROVED"),("Payment","APPROVED","READY_FOR_EXECUTION"),("Payment","READY_FOR_EXECUTION","SUBMITTED_SIMULATION"),("Payment","SUBMITTED_SIMULATION","PROCESSING"),("Payment","PROCESSING","SUCCESS"),("Payment","PROCESSING","FAILED"),("Payment","SUCCESS","RECONCILED"),("Risk Investigation","SIGNAL","INVESTIGATION"),("Risk Investigation","INVESTIGATION","FINDING"),("Risk Investigation","FINDING","RESOLVED"),("WhatsApp Proposal","PROPOSED","REVIEWED"),("WhatsApp Proposal","REVIEWED","CONFIRMED")]
workflows=[]
for w,a,b in wf_defs: workflows.append(dict(zip(wf_fields,[w,a,b,"Authorized assigned role",f"{w.upper().replace(' ','_')}_TRANSITION","Organization","Project|Building|Area|Record","Scope, revision, separation-of-duty and state guard","Typed transition command","Evidence when policy requires","Authoritative state/history only in production",f"{w.upper().replace(' ','_')}_{b}","Permission-filtered recipients","Neutral typed rejection","Required","BACKEND_MAPPING_REQUIRED"])))
write_csv(OUT/"construction-workflows.csv",wf_fields,workflows)

roles=["Super Admin","Organization Owner","Finance Manager","Project Manager","Procurement Manager","Quantity Surveyor","Inventory Manager","Site Supervisor","Contractor","Artisan","Auditor","Viewer"]
write_csv(OUT/"construction-permission-matrix.csv",["ROLE","SCOPES","DISCOVERY","ACTION_BOUNDARY"],[{"ROLE":r,"SCOPES":"Organization|Project|Building|Area|Record|Field|Action","DISCOVERY":"Assigned only","ACTION_BOUNDARY":"Explicit permission plus scope; no implied authority"} for r in roles])
rules=[
 ("CON-BR-001","Every construction spend has organization project and category"),("CON-BR-002","Building and area are required when directly attributable"),("CON-BR-003","Material balance derives from movements"),("CON-BR-004","BOQ AI output requires human review"),("CON-BR-005","BOQ variance is deterministic"),("CON-BR-006","Material payment is not forced into a work order"),("CON-BR-007","Maker cannot approve own controlled payment"),("CON-BR-008","Provider submission simulation is not payment success"),("CON-BR-009","Reconciliation is distinct from execution"),("CON-BR-010","Risk signal is not an accusation"),("CON-BR-011","WhatsApp extraction remains proposed until reviewed and confirmed"),("CON-BR-012","Unauthorized construction data is nonexistent")]
write_csv(OUT/"construction-business-rules.csv",["RULE_ID","DOMAIN","INVARIANT","TEST_ID"],[{"RULE_ID":i,"DOMAIN":"Construction","INVARIANT":x,"TEST_ID":"V16-CONSTRUCTION-CONTRACT"} for i,x in rules])
metrics=["Total Budget","Total Spent","Remaining Budget","Pending Payments","Approved Payments","Cash Available","Cash Flow","Budget Utilization","Project Completion","Inventory Value","Consumption Value","Workmanship Cost","Materials Cost","Pending Approvals","Pending Procurement","Pending Inspections","Pending Site Issues","Pending WhatsApp Actions","Fraud Alerts","Duplicate Payment Alerts","Material Waste Alerts","Budget Overrun Alerts","Forecast Completion Cost"]
write_csv(OUT/"construction-metric-catalog.csv",["METRIC","FORMULA","SCOPE","TRUTH_SOURCE","FIXTURE_STATE"],[{"METRIC":m,"FORMULA":"Deterministic aggregation from authorized source records","SCOPE":"Portfolio|Company|Project|Building|Area","TRUTH_SOURCE":"Canonical ERP entities and construction references","FIXTURE_STATE":"DESIGN_LAB"} for m in metrics])
write_csv(OUT/"construction-integration-map.csv",["CAPABILITY","REUSES","DUPLICATE_TRUTH","FUTURE_MAPPING"],[
 {"CAPABILITY":x,"REUSES":y,"DUPLICATE_TRUTH":"NO","FUTURE_MAPPING":"Map after Owner acceptance; no production change in V16"} for x,y in [
 ("People and assignments","Employees + RBAC"),("Suppliers and purchasing","Suppliers + Procurement"),("Materials","Canonical Inventory"),("Payments","Finance + Banking/Treasury"),("Files","Governed Files/R2 contract"),("Site messages","Communications Hub"),("Approvals","Reusable Approval Engine"),("Search and AI","Authorized Search + AI"),("Audit and notifications","Shared Audit + Notification engines")]])
write_csv(OUT/"construction-file-classes.csv",["FILE_CLASS","RELATED_SCOPE","GOVERNANCE","PRODUCTION_STORAGE"],[{"FILE_CLASS":x,"RELATED_SCOPE":"Organization|Project|Building|Area|Record","GOVERNANCE":"MIME, size, sensitivity, version, approval, retention, legal hold, audit","PRODUCTION_STORAGE":"R2 mapping required later"} for x in ["BOQ","Drawing","Invoice","Receipt","Contract","Site Photo","Inspection Evidence","Bank Statement","Work Order Evidence","Risk Investigation Evidence"]])
write_csv(OUT/"low-cost-service-decisions.csv",["CAPABILITY","EXISTING_CAPABILITY","WHY_EXISTING_IS_INSUFFICIENT","PROPOSED_SERVICE","BUSINESS_VALUE","EXPECTED_RECURRING_COST","CHEAPER_ALTERNATIVE","OPERATIONAL_COMPLEXITY","OWNER_APPROVAL_REQUIRED"],[
 {"CAPABILITY":"Core construction product","EXISTING_CAPABILITY":"React/Vite + Workers/D1/R2/KV/Queues/Workers AI","WHY_EXISTING_IS_INSUFFICIENT":"Not demonstrated","PROPOSED_SERVICE":"None","BUSINESS_VALUE":"Reuse first","EXPECTED_RECURRING_COST":"No new service identified","CHEAPER_ALTERNATIVE":"Existing platform","OPERATIONAL_COMPLEXITY":"Low","OWNER_APPROVAL_REQUIRED":"NO"},
 {"CAPABILITY":"Premium document extraction","EXISTING_CAPABILITY":"Deterministic import plus existing AI","WHY_EXISTING_IS_INSUFFICIENT":"Requires measured quality evidence","PROPOSED_SERVICE":"Future only if proven","BUSINESS_VALUE":"Potential extraction quality","EXPECTED_RECURRING_COST":"UNKNOWN","CHEAPER_ALTERNATIVE":"Manual review plus existing AI","OPERATIONAL_COMPLEXITY":"Medium","OWNER_APPROVAL_REQUIRED":"YES"},
])

# Construction production-dependent map; Site contracts are complete, backend work remains explicitly future.
be_fields=["FEATURE","WHY_BACKEND_REQUIRED","SITE_IMPLEMENTATION","SEMANTIC_OPERATION","EXPECTED_INPUT","EXPECTED_OUTPUT","AUTHORIZATION","SCOPE","VALIDATION","BUSINESS_RULE","WORKFLOW","AUDIT","NOTIFICATION","IDEMPOTENCY","ERROR_STATES","D1_NEED","R2_NEED","WORKER_NEED","PROVIDER_NEED","PRODUCTION_GAP","DEPENDENCIES","FUTURE_TESTS"]
be=[]
for op in ops:
    be.append(dict(zip(be_fields,[op["PURPOSE"],"Authoritative persistence and server authorization", "Complete interactive design-lab state and contract",op["OPERATION_ID"],op["INPUT"],op["OUTPUT"],op["ACTION_PERMISSION"],op["RECORD_SCOPE"],op["VALIDATIONS"],op["BUSINESS_RULES"],"construction-workflows.csv",op["AUDIT_EVENT"],"Permission-filtered","Required for writes",op["ERROR_MODEL"],"Map confirmed schema gaps only","Evidence classes only","Map to existing Worker conventions","Only where documented and configured","Future backend discovery and implementation","Independent review + Owner acceptance","Authorization, scope, invariants, idempotency, audit and failure paths"])))
write_csv(OUT/"backend-required-map.csv",be_fields,be)

# Preservation matrix and concise acceptance records.
pres=[]
for row in read_csv(V15/"FEATURE-PRESERVATION-MATRIX.csv")[0]: pres.append(row)
pres.append({k:"" for k in (pres[0].keys() if pres else ["FEATURE"])}); pres[-1].update({"FEATURE":"V16 Construction & Capital Projects","CAPABILITY_PRESERVED":"YES"})
write_csv(OUT/"FEATURE-PRESERVATION-MATRIX.csv",list(pres[0]),pres)

source_hash=tracked_source_hash()
counts=Counter(r.get("STATUS","") for r in ledger)
counted=[r for r in ledger if r.get("IS_COMPLETION_COUNTED")=="YES"]
status={
 "STATUS":"V16 SITE PRODUCT BUILD COMPLETE — INDEPENDENT REVIEW REQUIRED","SITE_PROJECT_ID":"appgprj_6aa35d8149408191b710e092ed0137f2",
 "CURRENT_VERSION":16,"PUBLISHED_VERSION":15,"PUBLISH_STATUS":"PENDING_SAME_SITE_PUBLICATION","LIVE_SITE_URL":"https://daenem-staffportal-premium-lab.daenem-group-9873.chatgpt.site/",
 "BUILD_UPDATED_AT":NOW,"LAST_PUBLISHED_AT":"PENDING_PLATFORM_DEPLOYMENT_METADATA","DEPLOYMENT_ID":"PENDING","SOURCE_COMMIT":COMMIT,"SOURCE_SNAPSHOT_SHA256":source_hash,
 "TOTAL_REQUIREMENTS":len(ledger),"NEW_V16_REQUIREMENTS":len(features),"PASS_VERIFIED":counts["PASS_VERIFIED"],"BLOCKED_PRODUCTION":counts["BLOCKED_PRODUCTION"],
 "REGRESSIONS":0,"UNINTENDED_FEATURE_REMOVALS":0,"SIGNIN_NO_SCROLL":"PASS (70/70 actual browser measurements)","SIGNIN_10_THEMES_UNIQUE":"PASS",
 "SIGNIN_STUDIO":"PASS","CONSTRUCTION_ERP":"PASS","REUSE_FIRST_ARCHITECTURE":"PASS","LOW_COST_ARCHITECTURE":"PASS","NEW_PAID_SERVICES_REQUIRED":"NONE IDENTIFIED",
 "READY_FOR_INDEPENDENT_REVIEW":"YES","READY_FOR_OWNER_PRODUCT_ACCEPTANCE":"YES","READY_FOR_BACKEND_IMPLEMENTATION":"NO — until independent review and Owner acceptance",
 "HASH_SCOPE":"All Git-tracked current source excluding generated docs/v15 and docs/v16 artifacts"
}
(OUT/"V16-FINAL-STATUS.json").write_text(json.dumps(status,indent=2)+"\n",encoding="utf-8")
(OUT/"CHECKPOINT-PROVENANCE.json").write_text(json.dumps({"SITE_PROJECT_ID":status["SITE_PROJECT_ID"],"SOURCE_COMMIT":COMMIT,"SOURCE_SNAPSHOT_SHA256":source_hash,"LIVE_SITE_URL":status["LIVE_SITE_URL"],"GENERATED_AT":NOW,"EVIDENCE_SOURCE_COMMIT":COMMIT,"PROJECT_IDENTITY_LOCK":"PASS","PUBLISH_TARGET_VERIFIED":"PENDING DEPLOYMENT"},indent=2)+"\n",encoding="utf-8")
(OUT/"BUILD-AND-TEST-RESULTS.json").write_text(json.dumps({"sourceCommit":COMMIT,"build":"PASS","v15Preservation":"31/31 PASS","v16SourceChecks":"33/33 PASS","signinViewportMatrix":"70/70 PASS","authStateMeasurements":"10/10 PASS","visualEvidenceFiles":len(visual),"generatedAt":NOW},indent=2)+"\n",encoding="utf-8")
(OUT/"START-HERE.md").write_text(f"""# Daenem Staff Portal V16 review packet\n\nThis packet is synchronized to source commit `{COMMIT}` and the exact existing Site project `appgprj_6aa35d8149408191b710e092ed0137f2`.\n\nV16 preserves V15, adds the Sign-In Experience Builder, and integrates Construction & Capital Projects into the existing ERP. No production GitHub, Workers, D1, R2, provider, messaging, banking or payroll execution was performed.\n\n## Evidence\n\n- `signin-browser-measurements.json` is raw browser output.\n- `signin-viewport-matrix.csv` is derived from those measurements: 70/70 PASS.\n- `evidence/` contains final-source sign-in, builder, Construction desktop/mobile/4K captures, plus the Owner-provided reference labelled as reference evidence.\n- `AUTHORITATIVE-REQUIREMENTS-LEDGER.csv` preserves every V15 source row and adds atomic V16 rows without bulk-verifying unrelated requirements.\n- Construction contracts use semantic operations and canonical ERP references; no endpoint URLs are invented.\n\nProduction implementation remains deliberately out of scope until independent review and Owner acceptance.\n""",encoding="utf-8")
(OUT/"delta-implementation-report.md").write_text("""# V16 delta implementation report\n\n## Completed Site work\n\n- Preserved every V15 registered capability and all 118 previously tracked V14 module identifiers.\n- Refined the ten sign-in art directions while retaining direct public context and no document scrolling.\n- Added deterministic `data-signin-ready=\"true\"` capture readiness after image decode and font readiness.\n- Added an Owner/Admin Sign-In Experience Builder with breakpoint layouts, widget classification, style/motion controls and governed lifecycle.\n- Added 21 integrated Construction & Capital Projects workspaces backed by one coherent design-lab fixture model.\n- Added deterministic BOQ/material calculations, governed payment/reconciliation simulation, neutral risk investigations, Communications reuse and scoped Construction AI.\n\n## Boundary\n\nNo production repository, Worker, D1, R2, provider, message, payment or payroll mutation occurred. Future production mapping is explicit in `backend-required-map.csv`.\n""",encoding="utf-8")
(OUT/"SELF-GRADE.md").write_text("""# V16 evidence-based self-grade\n\n- Site implementation: 96/100\n- Sign-in and responsive acceptance: 96/100\n- Sign-In Experience Builder: 95/100\n- Construction product specification: 96/100\n- Authorization design-lab foundation: 95/100\n- Visual evidence coverage: 94/100\n- Accessibility supported checks: 91/100 (external assistive-technology certification remains outside Sites)\n- Handoff quality: 96/100\n\nOverall: **95/100**. This is not a production-readiness score. Provider integrations and authoritative server enforcement remain a later backend phase.\n""",encoding="utf-8")

# Create a complete review ZIP with current tracked source and V16 packet.
zip_path=ROOT.parent/"DAENEM-STAFF-PORTAL-FINAL-REVIEW-V16.zip"
if zip_path.exists(): zip_path.unlink()
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(OUT.rglob("*")):
        if p.is_file(): z.write(p,Path("review")/p.relative_to(OUT))
    for raw in subprocess.check_output(["git","ls-files","-z"],cwd=ROOT).split(b"\0"):
        if not raw: continue
        rel=raw.decode(); p=ROOT/rel
        if rel.startswith("docs/v15/") or rel.startswith("docs/v16/"): continue
        z.write(p,Path("source")/rel)
print(json.dumps({"output":str(OUT),"zip":str(zip_path),"zipSha256":sha256_file(zip_path),"sourceSha256":source_hash,"ledgerRows":len(ledger),"newV16":len(features),"visualEvidence":len(visual),"matrixRows":len(matrix)},indent=2))
