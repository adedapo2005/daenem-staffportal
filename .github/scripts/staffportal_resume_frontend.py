"""Remaining frontend upload/activation after read-verified settings correction.

The consumed run is never replayed. PATCH is forbidden in this entry point.
"""
import datetime as dt,importlib.util,io,json,os,re,subprocess,sys,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('successor',Path(__file__).with_name('staffportal_frontend_successor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
MARKER='STAFFPORTAL RESUME FRONTEND AFTER VERIFIED SETTINGS 42149412898; OWNER APPROVED'
INTENT_NAME='staffportal-corrected-frontend-20261106-resume-intent'
ORIGINAL={'id':13471416380,'runId':42148842172,'head':'94e4a84bcb6a95f09a61f7f082e0a2a660a84454','sha':'bd45da694633485115a0d0e9b9d62e8495e1d2ee2d88046ee3531691e763d701','name':'staffportal-corrected-frontend-result-42148842172','size':1490}
READ={'id':13472450112,'runId':42149412898,'head':'f4069c461cb0234b6b52c7baf59770b99066a7d7','sha':'73225ae7d50ca2e07faf596042c889ce8f687796b2e197491a7f0024e94b4be8','name':'staffportal-corrected-settings-read-42149412898','size':720}
OUT=Path('staffportal-successor-resume-evidence');m.OUT=OUT
_request=m.request
def request_without_settings_write(path,token,method='GET',body=None):
    m.require(method=='GET' or method=='POST' and path==m.SCRIPT+'/deployments','RESUME_SETTINGS_WRITE_FORBIDDEN')
    return _request(path,token,method,body)
m.request=request_without_settings_write
def artifact(pin):
    meta=m.github('/actions/artifacts/'+str(pin['id']))
    m.require(meta.get('name')==pin['name'] and meta.get('digest')=='sha256:'+pin['sha'] and meta.get('size_in_bytes')==pin['size'] and meta.get('expired') is False and meta.get('workflow_run',{}).get('id')==pin['runId'] and meta.get('workflow_run',{}).get('head_sha')==pin['head'],'RECOVERY_ARTIFACT_METADATA_HELD')
    path=Path('recovery-input-'+str(pin['id'])+'.zip')
    if not path.exists():
        with path.open('xb') as f:r=subprocess.run(['gh','api','repos/'+m.REPO+'/actions/artifacts/'+str(pin['id'])+'/zip'],stdout=f,stderr=subprocess.DEVNULL)
        m.require(r.returncode==0,'RECOVERY_ARTIFACT_DOWNLOAD_HELD')
    raw=path.read_bytes();m.require(m.sha(raw)==pin['sha'],'RECOVERY_ARTIFACT_BYTES_HELD')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        names=z.namelist();m.require(len(names)==len(set(names)) and len(names)<8,'RECOVERY_ARCHIVE_HELD')
        return {n:json.loads(z.read(n)) for n in names}
def validate_receipts(original,read,pins):
    m.require(set(original)=={'held.json','intent.json','preflight.json','settings-post-intent.json'},'ORIGINAL_ATTEMPT_BOUNDARY_HELD')
    m.require(original['held.json'].get('reasonCode')=='ISSUES_SHAPE_HELD' and original['intent.json'].get('context',{}).get('runId')==ORIGINAL['runId'] and original['intent.json'].get('archiveSha256')==pins['archive'],'ORIGINAL_ATTEMPT_IDENTITY_HELD')
    m.require(set(read)=={'staffportal-corrected-settings-read.json'},'READ_ARCHIVE_HELD')
    report=read['staffportal-corrected-settings-read.json']
    paths=[m.ROOT,m.SCRIPT+'/script-settings',m.SCRIPT+'/deployments']
    m.require(report.get('state')=='THREE_FIXED_GETS_COMPLETED' and report.get('writesPermitted') is False and report.get('requests')==[{'method':'GET','path':p,'status':200} for p in paths],'READ_RECEIPT_HELD')
    m.require(report.get('latestDeployment')=={'id':m.DEPLOYMENT,'versions':[{'version_id':m.PRIOR,'percentage':100}]},'READ_ALLOCATION_HELD')
    shared=report.get('shared');m.require(isinstance(shared,dict) and set(shared)=={'worker','script'},'READ_SHARED_HELD')
    desired=original['preflight.json']['desiredSettings']
    expected_worker=json.loads(json.dumps(desired['worker']));expected_worker.pop('issues')
    # Cloudflare documents [] as the destination default. Its Worker GET
    # materializes that default after PATCH; nonempty destinations still fail.
    for child in ('logs','traces'):expected_worker[child].setdefault('destinations',[])
    # The independent GET returned the already-approved effective-off shapes:
    # Worker logs/traces explicitly false, Issues omitted; script observability
    # null. Preserve those exact representations rather than resend the PATCH.
    m.require(shared['worker']=={'observability':expected_worker,'logpush':False,'tail_consumers':[]} and shared['script']=={'observability':None,'logpush':False,'tail_consumers':None},'EXACT_CORRECTED_SHARED_STATE_HELD')
    body=original['settings-post-intent.json'].get('body')
    m.require(body=={'observability':desired['script']} and body['observability']['issues']=={'enabled':False},'ORIGINAL_SETTINGS_INTENT_HELD')
    return {'worker':shared['worker']['observability'],'script':shared['script']['observability']}
def reconciled(pins):return validate_receipts(artifact(ORIGINAL),artifact(READ),pins)
def plan_for(token,plan_type,pins,created,shared):
    window,_=m.prior_candidate(token,plan_type,pins,created)
    return window,m.make_plan(plan_type,window,pins,shared)
def main():
    m.require(len(sys.argv)==2 and sys.argv[1] in ('prepare','execute'),'RESUME_COMMAND_HELD')
    ctx,token=m.context(MARKER);plan_type,adapter_type,loader,publisher_type,journal_type=m.load_runtime()
    pins=json.loads(Path(__file__).with_name('staffportal_frontend_successor_pins.json').read_text())
    m.no_other_writers(ctx);shared=reconciled(pins)
    if sys.argv[1]=='prepare':
        previous=m.github('/actions/artifacts?name='+INTENT_NAME+'&per_page=100')
        m.require(previous.get('total_count')==0 and previous.get('artifacts')==[],'PRIOR_RESUME_INTENT_HELD')
        path=m.download(pins);loader(path,pins)
        created=m.now();window,plan=plan_for(token,plan_type,pins,created,shared)
        preflight=m.inspect(token,plan);m.save('preflight.json',preflight)
        m.save('reconciled-prior-attempt.json',{'originalArtifactId':ORIGINAL['id'],'originalSha256':ORIGINAL['sha'],'readArtifactId':READ['id'],'readSha256':READ['sha'],'settingsWriteWillBeRepeated':False,'originalUploaderWasNotEntered':True})
        m.save('intent.json',{'context':ctx,'createdUtc':created.isoformat(),'archiveSha256':pins['archive'],'preflightFingerprint':preflight['fingerprint'],'scope':'One Remaining Frontend Upload And Activation Only; No Settings Write; Original Run Preserved'},True)
        print('RESUME_PREFLIGHT_AND_RECONCILIATION_PASSED');return
    intent=json.loads((OUT/'intent.json').read_text())
    m.require(intent.get('context')==ctx and intent.get('archiveSha256')==pins['archive'],'RESUME_INTENT_BINDING_HELD')
    created=dt.datetime.fromisoformat(intent['createdUtc']);m.require(0<=(m.now()-created).total_seconds()<1200,'RESUME_INTENT_AGE_HELD')
    aid=os.environ.get('SP_INTENT_ARTIFACT_ID','');digest=os.environ.get('SP_INTENT_ARTIFACT_DIGEST','')
    m.require(aid.isdigit() and re.fullmatch('[a-f0-9]{64}',digest),'RESUME_DURABLE_INTENT_HELD')
    meta=m.github('/actions/artifacts/'+aid)
    m.require(meta.get('name')==INTENT_NAME and meta.get('digest')=='sha256:'+digest and meta.get('expired') is False and meta.get('workflow_run',{}).get('id')==ctx['runId'],'RESUME_DURABLE_INTENT_READ_HELD')
    pkg=loader('staffportal-successor-application.zip',pins)
    window,plan=plan_for(token,plan_type,pins,created,shared)
    fresh=m.inspect(token,plan)
    m.require(fresh==json.loads((OUT/'preflight.json').read_text()),'RESUME_FRESH_PREFLIGHT_DRIFT_HELD')
    class Adapter(adapter_type):
        def _observe(self):return m.observe_frontend(self)
        def verify_upload(self,version,pkg):
            proof=m.verify_candidate(token,self.plan,version);m.inspect(token,self.plan);self._verified_version=version;return proof
    adapter=Adapter(token,window,plan=plan)
    result=publisher_type(adapter,journal_type(OUT/'upload-journal.json'),plan.publisher_expectations()).upload_only(pkg)
    m.save('upload-result.json',result)
    receipt=m.activate(token,plan,result['versionId']);m.save('hosted-allocation-receipt.json',receipt)
    m.save('result.json',{'state':receipt['state'],'context':ctx,'archiveSha256':pins['archive'],'activation':receipt,'workerUnchanged':True,'credentialsUnchanged':True,'databaseOperation':False,'settingsWriteRepeated':False})
    print(json.dumps(receipt))
if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,m.Held) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)) else 'RESUME_HELD_RECONCILE_BEFORE_ANY_RETRY'
        m.save('held.json',{'state':'HELD','reasonCode':code,'automaticRetry':False});print(code);raise SystemExit(2) from None
