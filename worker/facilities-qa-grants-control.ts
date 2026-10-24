/**
 * Isolated, Owner-only Pre-Production QA grant repair console.
 *
 * Not part of the StaffPortal product UI or locked Sign-In. This HTML is only
 * returned from authenticated, staging-bound Facilities routes.
 * All state is read from canonical D1 APIs; there are no embedded secrets.
 */
const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Facilities QA · Pre-Production Repair</title>
  <link rel="stylesheet" href="/api/facilities/qa-grants/control.css">
  <script defer src="/api/facilities/qa-grants/control.js"></script>
</head>
<body>
<main class="shell">
  <header class="masthead">
    <div class="brand">DAENEM <span>STAFFPORTAL</span></div>
    <div class="environment">PRE-PRODUCTION ONLY</div>
  </header>
  <section aria-labelledby="page-title">
    <p class="eyebrow">OWNER OPERATIONS / ISOLATED FACILITIES QA</p>
    <h1 id="page-title">Repair Synthetic QA Permissions</h1>
    <p class="intro">Review the guarded D1 snapshot before reconciling the three test-role permissions.
      No real-company permissions, credentials, business data or Sign-In settings are affected.</p>
    <div class="notice" role="note">
      Only predefined <strong>qa-staging-v1</strong> identities qualify.
      The operation is explicit, audited and restricted to the staging database.
    </div>
    <section class="panel" aria-labelledby="readiness-title">
      <div class="panel-top">
        <h2 id="readiness-title">Live Readiness</h2>
        <button id="refresh" type="button" class="button secondary">Refresh D1 State</button>
      </div>
      <p id="status" role="status" aria-live="polite">Checking staging readiness…</p>
      <div class="metrics">
        <div><span>QA Companies</span><strong id="companies">—</strong></div>
        <div><span>QA Employees</span><strong id="employees">—</strong></div>
        <div><span>Facilities Grants</span><strong id="grants">—</strong></div>
        <div><span>Facilities Evidence</span><strong id="evidence">—</strong></div>
      </div>
      <p class="detail" id="details">Awaiting an authenticated response from the staging Worker.</p>
    </section>
    <section class="panel" aria-labelledby="action-title">
      <h2 id="action-title">Controlled Reconciliation</h2>
      <p>Only when the live snapshot matches all expected synthetic identity counts, has zero Facilities
        grants and has no Facilities transaction evidence will this action become available.</p>
      <label class="confirm">
        <input type="checkbox" id="ack" disabled>
        <span>I confirm this action is limited to three synthetic QA Facilities permissions on Pre-Production.</span>
      </label>
      <button id="repair" class="button primary" type="button" disabled>
        Reconcile Three QA Grants
      </button>
      <p id="result" role="status" aria-live="polite" class="detail"></p>
    </section>
    <section class="panel" aria-labelledby="persona-title">
      <h2 id="persona-title">Verify Live QA Role Access</h2>
      <p>After the three QA grants are ready, verify the existing synthetic Manager and Employee
        sign-in credentials and company-specific permissions using the real staging Worker.
        This operation creates and revokes temporary synthetic sessions; it does not create
        Facilities or financial records, change passwords, or expose credentials.</p>
      <p id="persona-status" class="detail" role="status" aria-live="polite">Checking QA identity readiness…</p>
      <label class="confirm">
        <input type="checkbox" id="persona-ack" disabled>
        <span>I confirm this verification is restricted to the existing synthetic QA identities.</span>
      </label>
      <button type="button" id="persona-verify" class="button primary" disabled>
        Verify QA Manager and Employee Access
      </button>
      <p id="persona-result" role="status" aria-live="polite" class="detail"></p>
    </section>
    <section class="panel" aria-labelledby="tx-title">
      <h2 id="tx-title">Live Facilities Transaction Acceptance</h2>
      <p>This is a <strong>one-time</strong> Pre-Production test using the synthetic QA Manager and company A.
        It exercises real Facilities, equipment, meter readings, audit events, read-back and an intentionally
        failed atomic batch. The successful synthetic records and append-only audit evidence remain in D1
        and cannot be reset automatically.</p>
      <p id="tx-status" role="status" aria-live="polite" class="detail">Checking transaction evidence…</p>
      <label class="confirm">
        <input type="checkbox" id="tx-ack" disabled>
        <span>I confirm this creates permanent synthetic QA Facilities evidence, never real DAENEM business records.</span>
      </label>
      <button type="button" id="tx-run" class="button primary" disabled>
        Run One-Time Facilities D1 Acceptance
      </button>
      <p id="tx-result" role="status" aria-live="polite" class="detail"></p>
    </section>
    <p class="footnote">Any mismatch stops the operation. Reconciliation cannot run on Production.
      Do not use this page to create operational or financial records.</p>
  </section>
</main>
</body>
</html>`;

const styles = String.raw`:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7f6;color:#102d29}
*{box-sizing:border-box}body{margin:0}.shell{max-width:900px;margin:0 auto;padding:28px 30px 60px}
.masthead{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dbe6e0;padding-bottom:23px;margin-bottom:44px;gap:20px}
.brand{font-size:14px;font-weight:800;letter-spacing:.09em}.brand span{color:#78948b;font-size:11px;margin-left:8px;letter-spacing:.17em}
.environment{color:#805914;border:1px solid #e7d2a2;background:#fff9e9;padding:8px 12px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:.08em}
.eyebrow{letter-spacing:.13em;font-size:11px;font-weight:800;color:#387567}
h1{font-size:clamp(27px,4vw,40px);line-height:1.12;letter-spacing:-.035em;margin:13px 0 18px}
h2{font-size:19px;letter-spacing:-.025em;margin:0}
p{line-height:1.6}.intro{font-size:16px;color:#47615a;max-width:700px}
.notice{background:#e7f3ed;border-left:4px solid #187a60;padding:16px 20px;margin:26px 0 32px;border-radius:0 8px 8px 0;line-height:1.6}
.panel{background:white;border:1px solid #d9e7e0;border-radius:13px;padding:24px 26px;margin:18px 0;box-shadow:0 7px 27px rgba(14,52,37,.035)}
.panel-top{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:23px 0 17px}
.metrics>div{background:#f4f8f6;border:1px solid #e4ece8;border-radius:8px;padding:18px 12px}
.metrics span{font-size:12px;color:#56726a;display:block;min-height:32px}
.metrics strong{font-size:28px;font-weight:750;display:block;margin-top:7px;font-variant-numeric:tabular-nums}
.detail{color:#61766f;font-size:13px}
.confirm{display:flex;align-items:flex-start;gap:11px;line-height:1.55;font-size:14px;margin:19px 0}
.confirm input{margin-top:3px;width:18px;height:18px;accent-color:#087254;flex-shrink:0}
.button{font:inherit;font-size:14px;font-weight:750;border-radius:7px;padding:12px 17px;cursor:pointer;min-height:42px}
.button:focus-visible,input:focus-visible{outline:3px solid #e7b34d;outline-offset:3px}
.secondary{background:white;border:1px solid #9cbdb2;color:#145b4a}
.primary{background:#08684f;color:white;border:1px solid #08684f}
.button:disabled{opacity:.48;cursor:not-allowed}
.footnote{font-size:12px;color:#687c75;margin-top:24px}
@media(max-width:620px){.shell{padding:18px 16px 35px}.masthead{margin-bottom:28px;flex-wrap:wrap}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.panel{padding:20px 17px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}`;

const script = String.raw`(()=>{
'use strict';
const base='/api/facilities/';
const el=(id)=>document.getElementById(id);
const state={eligible:false,pending:false,personaEligible:false,personaPending:false,txEligible:false,txPending:false};
const fields=['facilities','equipment','readings','workOrders','schedules','inspections','auditEvents'];
const expected={syntheticCompanies:2,syntheticSites:2,syntheticEmployees:3,activeMemberships:4,credentials:3,facilitiesGrants:0};
const safe=(data)=>{
  if(!data||data.scope!=='qa-staging-v1'||data.state!=='incomplete'||data.safeToReset!==true)return false;
  if(Object.keys(expected).some(key=>data[key]!==expected[key]))return false;
  return !!data.evidence&&fields.every(key=>data.evidence[key]===0);
};
const personaReady=data=>!!data&&data.scope==='qa-staging-v1'&&
  data.state==='ready'&&data.facilitiesGrants===3&&data.safeToReset===true&&
  data.syntheticCompanies===2&&data.syntheticSites===2&&
  data.syntheticEmployees===3&&data.activeMemberships===4&&data.credentials===3&&
  !!data.evidence&&fields.every(key=>data.evidence[key]===0);
const txReady=data=>personaReady(data);
function updateButtons(){
  el('ack').disabled=!state.eligible||state.pending;
  el('repair').disabled=!state.eligible||!el('ack').checked||state.pending;
  el('refresh').disabled=state.pending||state.personaPending||state.txPending;
  el('tx-ack').disabled=!state.txEligible||state.txPending;
  el('tx-run').disabled=!state.txEligible||!el('tx-ack').checked||state.txPending;
  el('persona-ack').disabled=!state.personaEligible||state.personaPending;
  el('persona-verify').disabled=!state.personaEligible||!el('persona-ack').checked||state.personaPending;
}
async function load(){
  state.eligible=false;
  state.personaEligible=false;
  state.txEligible=false;
  el('tx-ack').checked=false;
  el('ack').checked=false;
  el('persona-ack').checked=false;
  updateButtons();
  el('status').textContent='Checking authenticated Pre-Production D1 state…';
  try{
    const res=await fetch(base+'qa-readiness',{credentials:'same-origin',cache:'no-store'});
    if(!res.ok)throw new Error('Readiness was refused (HTTP '+res.status+').');
    const data=await res.json();
    el('companies').textContent=String(data.syntheticCompanies);
    el('employees').textContent=String(data.syntheticEmployees);
    el('grants').textContent=String(data.facilitiesGrants);
    const evidence=fields.reduce((n,k)=>n+Number(data.evidence?.[k]||0),0);
    el('evidence').textContent=String(evidence);
    state.eligible=safe(data);
    state.personaEligible=personaReady(data);
    const evidenceResponse=await fetch(base+'qa-transaction/evidence',
      {credentials:'same-origin',cache:'no-store'});
    if(!evidenceResponse.ok)throw new Error('QA transaction evidence unavailable.');
    const transactionEvidence=await evidenceResponse.json();
    state.txEligible=txReady(data)&&transactionEvidence.state==='not_started'&&
      transactionEvidence.reserved===false&&transactionEvidence.rollbackProbeAbsent===true&&
      transactionEvidence.companyBIsolated===true;
    el('tx-status').textContent=transactionEvidence.state==='verified'?
      'Verified — synthetic facility, equipment, meter and audit evidence persisted.':
      state.txEligible?'Eligible — no synthetic Facilities evidence or reservation exists.':
      'Unavailable — prerequisites failed or transaction has already been attempted.';
    el('persona-status').textContent=state.personaEligible?
      'Ready to verify isolated Manager and Employee access.':
      'Persona verification requires three grants and zero Facilities transaction evidence.';
    el('status').textContent=state.eligible?'Eligible — isolated QA grants are missing.':
      data.state==='ready'&&data.facilitiesGrants===3?'Already reconciled — no action needed.':
      'Not eligible — no database change permitted.';
    el('details').textContent='Fixture state: '+String(data.state)+'; locations: '+
      String(data.syntheticSites)+'; memberships: '+String(data.activeMemberships)+
      '; credentials: '+String(data.credentials)+'.';
  }catch(err){
    el('status').textContent='Readiness unavailable; repair is blocked.';
    el('persona-status').textContent='QA identity readiness unavailable; verification blocked.';
    el('tx-status').textContent='Live QA transaction readiness unavailable; no write permitted.';
    el('details').textContent=err instanceof Error?err.message:'Unable to verify the QA namespace.';
  }
  updateButtons();
}
el('refresh').addEventListener('click',()=>{el('result').textContent='';void load();});
el('ack').addEventListener('change',updateButtons);
el('persona-ack').addEventListener('change',updateButtons);
el('tx-ack').addEventListener('change',updateButtons);
el('tx-run').addEventListener('click',async()=>{
  if(!state.txEligible||!el('tx-ack').checked||state.txPending)return;
  state.txPending=true;
  updateButtons();
  el('tx-result').textContent='Checking isolated QA D1 prerequisites before a single transaction run…';
  try{
    const before=await fetch(base+'qa-readiness',{credentials:'same-origin',cache:'no-store'});
    if(!before.ok||!txReady(await before.json()))
      throw new Error('D1 prerequisites changed; no transaction requested.');
    const prior=await fetch(base+'qa-transaction/evidence',{credentials:'same-origin',cache:'no-store'});
    if(!prior.ok)throw new Error('Transaction reservation check unavailable.');
    const priorData=await prior.json();
    if(priorData.state!=='not_started'||priorData.reserved!==false||
       priorData.rollbackProbeAbsent!==true||priorData.companyBIsolated!==true)
      throw new Error('Transaction was already attempted; duplicate write blocked.');
    // Two explicit, bounded D1 invocations avoid Cloudflare's per-request
    // query cap while retaining a single Owner confirmation. The first
    // irreversibly reserves the QA acceptance slot and proves rollback.
    const runPhase=async phase=>{
      const response=await fetch(base+'qa-transaction/run?phase='+phase,{
        method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',
        headers:{'Accept':'application/json','X-DAENEM-QA-TRANSACTION':'qa-staging-v1'},
        cache:'no-store'
      });
      const result=await response.json();
      if(response.status!==200||result.ok!==true||
         result.scope!=='qa-staging-v1'||result.state!==(phase==='prepare'?'prepared':'written')||
         result.rollbackVerified!==true||result.companyIsolationVerified!==true||
         result.realCompanyMutated!==false||result.syntheticSessionRevoked!==true){
        const code=typeof result.code==='string'&&/^QA_TRANSACTION_[A-Z_]+$/.test(result.code)?
          ' ['+result.code+']':'';
        throw new Error('Facilities '+phase+' phase refused (HTTP '+response.status+')'+code+'.');
      }
      return result;
    };
    await runPhase('prepare');
    el('tx-result').textContent='Rollback verified and one-time reservation saved. Creating synthetic Facilities records…';
    await runPhase('write');
    // Independently re-read the actual persisted D1 result, not just POST success.
    const evidenceResponse=await fetch(base+'qa-transaction/evidence',{
      credentials:'same-origin',cache:'no-store'
    });
    if(!evidenceResponse.ok)throw new Error('Persisted evidence read-back unavailable.');
    const finalEvidence=await evidenceResponse.json();
    if(finalEvidence.state!=='verified'||finalEvidence.facilityPersisted!==true||
       finalEvidence.equipmentPersisted!==true||finalEvidence.readingPersisted!==true||
       finalEvidence.runningHoursUpdated!==true||finalEvidence.auditCorrelated!==true||
       finalEvidence.rollbackProbeAbsent!==true||finalEvidence.companyBIsolated!==true||
       finalEvidence.safeToReset!==false||finalEvidence.evidence?.facilities!==1||
       finalEvidence.evidence?.equipment!==1||finalEvidence.evidence?.readings!==1||
       finalEvidence.evidence?.auditEvents!==3)
      throw new Error('The stored D1 evidence does not match acceptance requirements.');
    el('tx-result').textContent='Verified: 1 facility, 1 equipment item, 1 running-hours reading, 3 correlated audits, batch rollback and company B isolation. Evidence retained.';
  }catch(err){
    el('tx-result').textContent=err instanceof Error?err.message:'Canonical D1 acceptance unavailable.';
  }finally{
    state.txPending=false;
    await load();
  }
});
el('persona-verify').addEventListener('click',async()=>{
  if(!state.personaEligible||!el('persona-ack').checked||state.personaPending)return;
  state.personaPending=true;
  updateButtons();
  el('persona-result').textContent='Verifying current D1 readiness…';
  try{
    const before=await fetch(base+'qa-readiness',{credentials:'same-origin',cache:'no-store'});
    if(!before.ok||!personaReady(await before.json()))
      throw new Error('QA identity prerequisites changed; verification not attempted.');
    const response=await fetch(base+'qa-persona/verify',{
      method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',
      headers:{'Accept':'application/json','X-DAENEM-QA-PERSONA':'qa-staging-v1'},
      cache:'no-store'
    });
    const result=await response.json();
    if(response.status!==200||result.ok!==true||result.scope!=='qa-staging-v1'||
       result.companyIsolation!==true||result.managerCompanyA!==true||
       result.managerDeniedCompanyB!==true||result.employeeCompanyB!==true||
       result.employeeDeniedCompanyA!==true||result.employeeWriteDenied!==true||
       result.credentialsUnchanged!==true||result.facilitiesEvidence!==0||
       result.temporarySessionsRevoked!==true){
      const code=typeof result.code==='string'&&/^QA_PERSONA_[A-Z_]+$/.test(result.code)?
        ' ['+result.code+']':'';
      throw new Error('QA persona acceptance failed (HTTP '+response.status+')'+code+'.');
    }
    el('persona-result').textContent='Verified: real QA Manager and Employee sign-in, company isolation, denied writes, credentials unchanged and test sessions revoked.';
  }catch(err){
    el('persona-result').textContent=err instanceof Error?err.message:'QA verification unavailable.';
  }finally{
    state.personaPending=false;
    await load();
  }
});
el('repair').addEventListener('click',async()=>{
  if(!state.eligible||!el('ack').checked||state.pending)return;
  state.pending=true;updateButtons();
  el('result').textContent='Rechecking D1 before the single authorized request…';
  try{
    // Readiness must match immediately before the only mutating request.
    const before=await fetch(base+'qa-readiness',{credentials:'same-origin',cache:'no-store'});
    if(!before.ok||!safe(await before.json()))throw new Error('Preconditions changed; no write attempted.');
    const response=await fetch(base+'qa-grants/reconcile',{
      method:'POST',credentials:'same-origin',mode:'same-origin',redirect:'error',
      headers:{'Accept':'application/json','X-DAENEM-QA-REPAIR':'qa-staging-v1'},cache:'no-store'
    });
    const result=await response.json();
    if(response.status!==200||result.ok!==true||
      result.scope!=='qa-staging-v1'||result.facilitiesGrants!==3){
      const safeCode=typeof result.code==='string'&&
        /^QA_REPAIR_(ORIGIN_MISMATCH|FETCH_SITE|SAME_ORIGIN_REQUIRED|PAYLOAD)$/.test(result.code)
        ?' ['+result.code+']':'';
      throw new Error('Reconciliation refused by the Worker (HTTP '+response.status+')'+safeCode+'.');
    }
    el('result').textContent='Reconciliation accepted. Confirming the persisted grant counts…';
  }catch(err){
    el('result').textContent=err instanceof Error?err.message:'Repair unavailable.';
  }finally{
    state.pending=false;
    await load();
    if(el('status').textContent.startsWith('Already reconciled')){
      el('result').textContent='Verified: exactly three synthetic Facilities grants now exist.';
    }
  }
});
void load();
})();`;

export function facilitiesQaControlResponse(kind:'page'|'style'|'script'):Response{
  const type=kind==='page'?'text/html; charset=utf-8':
    kind==='style'?'text/css; charset=utf-8':'application/javascript; charset=utf-8';
  const headers=new Headers({
    'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
  });
  return new Response(kind==='page'?page:kind==='style'?styles:script,{status:200,headers});
}
