"""Single authorized frontend successor on the existing StaffPortal Worker.

Reuses the reviewed upload transport. No migration, credential change, new
Worker, automatic retry or business API call. Every failed read is terminal.
"""
import base64,copy,datetime as dt,hashlib,importlib.util,json,os,re,subprocess,sys,urllib.error,urllib.request
from pathlib import Path

REPO='adedapo2005/daenem-staffportal'
BRANCH='ops/staffportal-upload-preflight-read-20261105'
MARKER='STAFFPORTAL CORRECTED FRONTEND 20261106 ONCE; OWNER APPROVED'
ACCOUNT='f322585f9882be1f55d8cf6dc7e77ee1'
WORKER='daenem-staffportal-api-staging'
PRIOR='47927e3c-827a-4b7a-842c-8bdd6e88883e'
PRESERVED='8e7ead65-59c2-4856-ac1c-3ba63eb8f77e'
DEPLOYMENT='b2009248-b0b6-4019-9ae6-812569fde8fb'
ROOT='/workers/workers/'+WORKER
SCRIPT='/workers/scripts/'+WORKER
API='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT
WORKER_SHA='d63750041287fa412066ec4509b08bfa21dc7632dc61ae1458201a5023ee0b41'
RUNTIME_SHA='03d278600727236fd0ccb78a65df7e8e83c703d4b869a9c25e812fcca13ad7a1'
INTENT_NAME='staffportal-corrected-frontend-20261106-intent'
OUT=Path('staffportal-successor-evidence')
MAX=16*1024*1024
class Held(Exception):pass
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def now():return dt.datetime.now(dt.timezone.utc)
def require(ok,code):
    if not ok:raise Held(code)
def save(name,value,exclusive=False):
    OUT.mkdir(exist_ok=True)
    with (OUT/name).open('x' if exclusive else 'w',encoding='utf8') as f:
        json.dump(value,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def request(path,token,method='GET',body=None):
    require(path.startswith('/workers/'),'REQUEST_SCOPE_HELD')
    require(method in ('GET','POST','PATCH'),'METHOD_HELD')
    if method=='PATCH':require(path==SCRIPT+'/script-settings','PATCH_SCOPE_HELD')
    req=urllib.request.Request(API+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json','User-Agent':'StaffPortal-authorized-frontend-successor'})
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect)
    try:r=opener.open(req,timeout=40)
    except urllib.error.HTTPError as error:r=error
    with r:status,raw=r.status,r.read(MAX+1)
    require(status==200 and len(raw)<=MAX,'PROVIDER_RESPONSE_HELD')
    data=json.loads(raw)
    require(isinstance(data,dict) and data.get('success') is True and data.get('errors') in (None,[]) and isinstance(data.get('result'),dict),'PROVIDER_ENVELOPE_HELD')
    return data['result']
def github(path):
    p=subprocess.run(['gh','api','repos/'+REPO+path],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=False)
    require(p.returncode==0 and len(p.stdout)<MAX,'GITHUB_READ_HELD')
    return json.loads(p.stdout)
def context():
    wanted={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':REPO,'GITHUB_ACTOR':'adedapo2005','GITHUB_EVENT_NAME':'pull_request_review','GITHUB_RUN_ATTEMPT':'1'}
    require(all(os.environ.get(k)==v for k,v in wanted.items()),'CONTEXT_HELD')
    event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    head=event.get('pull_request',{}).get('head',{})
    require(head.get('ref')==BRANCH and event.get('review',{}).get('body')==MARKER,'EXACT_EVENT_HELD')
    checkout=subprocess.run(['git','rev-parse','HEAD'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
    require(checkout.returncode==0 and checkout.stdout.decode().strip()==head.get('sha'),'EXACT_CHECKOUT_HELD')
    require(''.join(os.environ.get('CLOUDFLARE_ACCOUNT_ID','').split())==ACCOUNT,'ACCOUNT_HELD')
    token=os.environ.get('CLOUDFLARE_API_TOKEN','')
    require(bool(token) and not any(c in token for c in '\r\n'),'TOKEN_FORMAT_HELD')
    return {'runId':int(os.environ['GITHUB_RUN_ID']),'headSha':head['sha'],'reviewId':event['review']['id']},token
def no_other_writers(ctx):
    for state in ('queued','in_progress','waiting','pending','requested'):
        result=github('/actions/runs?status='+state+'&per_page=100')
        rows=result.get('workflow_runs')
        require(isinstance(rows,list) and result.get('total_count',101)<=100,'WRITER_INVENTORY_HELD')
        for row in rows:
            if row.get('id')==ctx['runId']:continue
            require(row.get('path') not in ('.github/workflows/deploy-staffportal-staging.yml','.github/workflows/staffportal-approved-artifact-upload.yml','.github/workflows/staffportal-release-controller-ci.yml'),'COMPETING_WRITER_HELD')
def load_runtime():
    root=Path(__file__).resolve().parents[2]/'ops/staffportal-release-executor'
    raw=(root/'RUNTIME-PINS.json').read_bytes()
    require(sha(raw)==RUNTIME_SHA,'RUNTIME_MANIFEST_HELD')
    for name,pin in json.loads(raw)['files'].items():
        require(Path(name).name==name and sha((root/'runtime'/name).read_bytes())==pin,'RUNTIME_BYTES_HELD')
    sys.dont_write_bytecode=True;sys.path.insert(0,str(root/'runtime'))
    from workers_api_plan import WorkersAPIPlan
    from workers_api_adapter import WorkersAPIAdapter
    from publisher import load_package,Publisher,Journal
    return WorkersAPIPlan,WorkersAPIAdapter,load_package,Publisher,Journal
def routing_ok(actual,want):
    defaults={'html_handling':'auto-trailing-slash','base_path':'/'}
    return isinstance(actual,dict) and all(type(actual.get(k)) is type(v) and actual[k]==v for k,v in want.items()) and set(actual)-set(want)<=set(defaults) and all(actual[k]==defaults[k] for k in set(actual)-set(want))
def modules_ok(obj):
    rows=obj.get('modules')
    if not isinstance(rows,list) or len(rows)!=1:return False
    m=rows[0]
    try:return m.get('name')=='worker.mjs' and m.get('content_type')=='application/javascript+module' and sha(base64.b64decode(m['content_base64'],validate=True))==WORKER_SHA
    except (KeyError,ValueError,TypeError):return False
def desired_settings(worker,script):
    # Only Issues may differ from the approved effective-off state. Preserve all
    # other observed fields exactly in the PATCH and subsequent comparisons.
    originals={}
    for label,obj in [('worker',worker),('script',script)]:
        obs=obj.get('observability')
        require(isinstance(obs,dict) and obs.get('enabled') is False and obj.get('logpush') is False,'SHARED_BASELINE_HELD')
        for key in ('logs','traces'):
            require(isinstance(obs.get(key),dict) and obs[key].get('enabled') is False,'SHARED_SUBSYSTEM_HELD')
        require(isinstance(obs.get('issues'),dict) and type(obs['issues'].get('enabled')) is bool,'ISSUES_SHAPE_HELD')
        require(obj.get('tail_consumers') in (None,[]),'TAIL_CONSUMER_HELD')
        target=copy.deepcopy(obs);target['issues']['enabled']=False;originals[label]=target
    require(originals['worker']==originals['script'],'SHARED_REPRESENTATION_HELD')
    obs=originals['script']
    require(set(obs)<={'enabled','head_sampling_rate','issues','logs','traces','redact_query_string'},'OBSERVABILITY_FIELDS_HELD')
    require(set(obs['issues'])=={'enabled'},'ISSUES_FIELDS_HELD')
    return originals,{'observability':obs}
class PreservedValues:
    def __init__(self,target,pins,created):
        rows=target.get('bindings',[]);self._values={}
        for name in ('SP_EFFECT_OPERATOR_SHA256','SP_EFFECT_OPERATOR_EXPIRES_AT'):
            found=[b for b in rows if b.get('name')==name]
            require(len(found)==1 and set(found[0])=={'name','type','text'} and found[0]['type']=='plain_text' and isinstance(found[0]['text'],str),'PRESERVED_VALUE_HELD')
            self._values[name]=found[0]['text']
        self.created=created;self.record_sha256=sha(canonical({'preservedVersion':PRESERVED,'valuePins':self.value_pins()}));self.config_sha256=pins['config']
    def values(self):return dict(self._values)
    def value_pins(self):return {k:sha(v.encode()) for k,v in self._values.items()}
    def check(self,clock=now):require(0<=(clock()-self.created).total_seconds()<1200,'FRONTEND_EXECUTION_AGE_HELD')
def make_plan(plan_type,window,pins,settings=None):
    class FrontendPlan(plan_type):
        def expected_current(self):return {'deployment':DEPLOYMENT,'target':WORKER,'versions':[{'version_id':PRIOR,'percentage':100}]}
        def validate_package(self,pkg):
            require(pkg.get('archive')==pins['archive'] and pkg.get('config_sha256')==pins['config'] and sha(pkg['worker'])==WORKER_SHA and len(pkg.get('files',{}))==pins['count'] and pkg.get('asset_manifest_sha256')==pins['assets'],'SUCCESSOR_PACKAGE_HELD')
        def shared_settings(self,worker,script):
            value=super().shared_settings(worker,script)
            if settings is not None:
                require(worker.get('observability')==settings['worker'] and script.get('observability')==settings['script'],'SHARED_EXACT_READBACK_HELD')
            return value
    return FrontendPlan(window)
def inspect(token,plan,allow_issue=False):
    worker=request(ROOT,token)
    require(worker.get('name')==WORKER and worker.get('subdomain')==plan.projection()['access'],'WORKER_IDENTITY_HELD')
    source=request(ROOT+'/versions/'+PRIOR,token)
    require(source.get('id')==PRIOR,'SOURCE_IDENTITY_HELD')
    source_bindings=plan.binding_projection(source.get('bindings'));plan.version_settings(source,version_read=True)
    settings=request(SCRIPT+'/settings',token)
    require(plan.binding_projection(settings.get('bindings'))==source_bindings,'CURRENT_BINDINGS_HELD');plan.version_settings(settings)
    require(settings.get('placement')=={},'PLACEMENT_HELD')
    script=request(SCRIPT+'/script-settings',token)
    desired,body=desired_settings(worker,script)
    if not allow_issue:plan.shared_settings(worker,script)
    deployment=request(SCRIPT+'/deployments',token).get('deployments')
    require(isinstance(deployment,list) and bool(deployment) and deployment[0].get('id')==DEPLOYMENT and deployment[0].get('versions')==[{'version_id':PRIOR,'percentage':100}],'SERVING_BASELINE_HELD')
    proof={'workerId':worker['id'],'servingDeploymentId':DEPLOYMENT,'servingVersionId':PRIOR,'sourceBindings':source_bindings,'runtime':plan.version_settings(source,version_read=True),'observability':{'worker':worker['observability'],'script':script['observability']},'logpush':False,'tails':{'worker':worker.get('tail_consumers'),'script':script.get('tail_consumers')}}
    return {'fingerprint':sha(canonical(proof)),'observabilityPins':{k:sha(canonical(v)) for k,v in proof['observability'].items()},'desiredSettings':desired,'patchBody':body,'patchNeeded':proof['observability']!=desired,'workerId':worker['id']}
def download(pins):
    asset=github('/releases/assets/'+str(pins['assetId']))
    require(asset.get('name')==pins['assetName'] and asset.get('size')==pins['archiveBytes'] and asset.get('state')=='uploaded','RELEASE_ASSET_HELD')
    path=Path('staffportal-successor-application.zip')
    with path.open('xb') as f:
        result=subprocess.run(['gh','api','repos/'+REPO+'/releases/assets/'+str(pins['assetId']),'-H','Accept: application/octet-stream'],stdout=f,stderr=subprocess.DEVNULL)
    require(result.returncode==0 and sha(path.read_bytes())==pins['archive'],'INPUT_DOWNLOAD_HELD')
    return path
def prior_candidate(token,plan_type,pins,created):
    target=request(ROOT+'/versions/'+PRESERVED+'?include=modules',token)
    require(target.get('id')==PRESERVED and modules_ok(target),'PRESERVED_CANDIDATE_CODE_HELD')
    window=PreservedValues(target,pins,created);plan=make_plan(plan_type,window,pins)
    plan.binding_projection(target.get('bindings'),target=True);plan.version_settings(target,version_read=True)
    require(routing_ok(target.get('assets',{}).get('config'),plan.projection()['assetConfig']),'PRESERVED_CANDIDATE_ROUTING_HELD')
    return window,plan
def verify_candidate(token,plan,version):
    obj=request(ROOT+'/versions/'+version+'?include=modules',token)
    require(obj.get('id')==version and modules_ok(obj),'SUCCESSOR_CODE_HELD')
    plan.binding_projection(obj.get('bindings'),target=True);plan.version_settings(obj,version_read=True)
    require(routing_ok(obj.get('assets',{}).get('config'),plan.projection()['assetConfig']),'SUCCESSOR_ROUTING_HELD')
    return {'versionId':version,'workerSha256':WORKER_SHA,'bindingAndRuntimeReadVerified':True,'assetRoutingReadVerified':True}
def activate(token,plan,version):
    inspect(token,plan)
    verify_candidate(token,plan,version)
    body={'strategy':'percentage','versions':[{'version_id':version,'percentage':100}]}
    save('activation-post-intent.json',{'versionId':version,'bodySha256':sha(canonical(body)),'automaticRetry':False},True)
    receipt={'state':'ACTIVATION_OUTCOME_UNKNOWN','versionId':version,'automaticRetry':False}
    try:
        obj=request(SCRIPT+'/deployments',token,'POST',canonical(body));identifier=obj.get('id')
        require(isinstance(identifier,str) and re.fullmatch('[0-9a-f-]{36}',identifier),'DEPLOYMENT_ID_HELD')
        receipt['deploymentId']=identifier;save('activation-receipt.json',receipt)
        rows=request(SCRIPT+'/deployments',token).get('deployments')
        require(isinstance(rows,list) and bool(rows) and rows[0].get('id')==identifier and rows[0].get('versions')==body['versions'],'ACTIVATION_ALLOCATION_READ_HELD')
        receipt.update(state='ACTIVATED_ALLOCATION_READ_VERIFIED',percentage=100);save('activation-receipt.json',receipt);return receipt
    except Exception:
        save('activation-receipt.json',receipt);raise Held('ACTIVATION_REQUIRES_READ_RECONCILIATION') from None
def main():
    require(len(sys.argv)==2 and sys.argv[1] in ('prepare','execute'),'COMMAND_HELD')
    ctx,token=context();plan_type,adapter_type,loader,publisher_type,journal_type=load_runtime()
    pins=json.loads(Path(__file__).with_name('staffportal_frontend_successor_pins.json').read_text())
    no_other_writers(ctx)
    if sys.argv[1]=='prepare':
        old=github('/actions/artifacts?name='+INTENT_NAME+'&per_page=100')
        require(old.get('total_count')==0 and old.get('artifacts')==[],'PRIOR_SUCCESSOR_INTENT_HELD')
        path=download(pins);pkg=loader(path,pins)
        created=now();window,plan=prior_candidate(token,plan_type,pins,created)
        preflight=inspect(token,plan,allow_issue=True);save('preflight.json',preflight)
        save('intent.json',{'context':ctx,'createdUtc':created.isoformat(),'archiveSha256':pins['archive'],'preflightFingerprint':preflight['fingerprint'],'scope':'one Issues-off correction if needed; corrected static assets and unchanged Worker; one activation; no DB/credential/business operation'},True)
        print('SUCCESSOR_INPUTS_AND_PREFLIGHT_VERIFIED');return
    intent=json.loads((OUT/'intent.json').read_text());preflight=json.loads((OUT/'preflight.json').read_text())
    require(intent.get('context')==ctx and intent.get('archiveSha256')==pins['archive'],'INTENT_BINDING_HELD')
    created=dt.datetime.fromisoformat(intent['createdUtc']);require(0<=(now()-created).total_seconds()<1200,'INTENT_AGE_HELD')
    artifact_id=os.environ.get('SP_INTENT_ARTIFACT_ID','');digest=os.environ.get('SP_INTENT_ARTIFACT_DIGEST','')
    require(artifact_id.isdigit() and re.fullmatch('[a-f0-9]{64}',digest),'DURABLE_INTENT_HELD')
    artifact=github('/actions/artifacts/'+artifact_id)
    require(artifact.get('name')==INTENT_NAME and artifact.get('expired') is False and artifact.get('digest')=='sha256:'+digest and artifact.get('workflow_run',{}).get('id')==ctx['runId'],'DURABLE_INTENT_READ_HELD')
    pkg=loader('staffportal-successor-application.zip',pins)
    window,plan=prior_candidate(token,plan_type,pins,created)
    fresh=inspect(token,plan,allow_issue=True)
    require(fresh==preflight,'IMMEDIATE_PREFLIGHT_DRIFT_HELD')
    if preflight['patchNeeded']:
        save('settings-post-intent.json',{'body':preflight['patchBody'],'automaticRetry':False},True)
        request(SCRIPT+'/script-settings',token,'PATCH',canonical(preflight['patchBody']))
    plan=make_plan(plan_type,window,pins,preflight['desiredSettings'])
    verified=inspect(token,plan);save('settings-readback.json',verified)
    class FrontendAdapter(adapter_type):
        def verify_upload(self,version,pkg):
            proof=verify_candidate(token,self.plan,version)
            inspect(token,self.plan)
            self._verified_version=version
            return proof
    adapter=FrontendAdapter(token,window,plan=plan)
    journal=journal_type(OUT/'upload-journal.json')
    publisher=publisher_type(adapter,journal,plan.publisher_expectations())
    result=publisher.upload_only(pkg);save('upload-result.json',result)
    receipt=activate(token,plan,result['versionId'] if 'versionId' in result else result['version_id'])
    save('result.json',{'state':receipt['state'],'context':ctx,'archiveSha256':pins['archive'],'activation':receipt,'workerUnchanged':True,'credentialsUnchanged':True,'databaseOperation':False})
    print(json.dumps(receipt))
if __name__=='__main__':
    try:main()
    except Exception as error:
        code=str(error) if isinstance(error,Held) and re.fullmatch('[A-Z0-9_]{1,100}',str(error)) else 'SUCCESSOR_HELD_RECONCILE_BEFORE_ANY_RETRY'
        save('held.json',{'state':'HELD','reasonCode':code,'automaticRetry':False});print(code);raise SystemExit(2) from None
